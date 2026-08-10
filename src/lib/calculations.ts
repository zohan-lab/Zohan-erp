/*
 * CALCULATION ENGINE
 * ==================
 * 
 * SOURCE-DRIVEN CALCULATION PRINCIPLE
 * 
 * All functions in this file calculate from source data in real-time.
 * These calculations NEVER modify source data - they only read and compute.
 * 
 * Source Data (Read-Only):
 *   - Invoices (invoiceDate, items, amounts, createdAt timestamp)
 *   - Payments (paymentDate, amounts, doNotApplyCD flag, createdAt timestamp)
 *   - Received Discounts (amount, date - IMMUTABLE once recorded)
 *   - Suppliers (CD rules, annual targets, advance CD percentage)
 *   - Fixed Schemes (discount rules - apply based on Invoice Date only)
 *   - MT Booking Master (with Order Date for scheme locking)
 * 
 * Computed Data (Live Calculation):
 *   - Payment allocations (FIFO, timestamp-aware)
 *   - Expected discounts (by type)
 *   - Pending discounts
 *   - Month-wise aggregations
 * 
 * RECEIVED DISCOUNT IMMUTABILITY (CRITICAL):
 *   - Received Discounts are treated as LOCKED, REALIZED events
 *   - Once recorded, received discount amounts NEVER change automatically
 *   - If expected discount changes (e.g., invoice date edit), the variance
 *     appears as Over-Received or Under-Received, NOT by modifying received amount
 *   - Allocation logic maps received to expected but preserves received amounts
 *   - Only user can manually edit/delete a received discount entry
 * 
 * TIMESTAMP-AWARE LOGIC:
 *   - Every Invoice and Payment has a createdAt timestamp (milliseconds)
 *   - FIFO sorting uses (date + timestamp), not date only
 *   - For same-day transactions, createdAt determines chronological order
 *   - Advance CD eligibility is determined at payment time using timestamp comparison
 *   - Once marked as Advance CD, never downgrades to regular CD
 * 
 * Date Usage Rules:
 *   - Fixed Scheme CD: Uses invoiceDate for eligibility (NOT order date)
 *   - MT Booking: Uses orderDate ONLY for locking schemes at booking time
 *   - Payment CD: Uses paymentDate (day-based, invoice must exist before payment)
 *   - Advance CD: Uses paymentDate (applies to advance portion only, not day-based)
 *   - Invoice Close CD: Uses date when invoice is fully paid (FIFO)
 *   - Annual Discount: Calculated on total MT (no date-based eligibility)
 * 
 * Advance Payment CD Rules (CRITICAL):
 *   - Advance is any payment amount not mapped to an invoice at payment time
 *   - Advance CD (3%) applies ONLY to the unallocated payment amount
 *   - When advance payment later gets allocated to invoice, it uses REGULAR CD slabs (not advance)
 *   - Advance CD is NOT day-based; Regular CD is day-based
 *   - Example: ₹10L payment with ₹3L outstanding:
 *     * ₹3L allocation → Regular CD based on days (e.g., 2.75%)
 *     * ₹7L unallocated → Advance CD (3%)
 *   - System respects transaction timestamps for FIFO allocation order
 *   - Outstanding balance is calculated from only earlier timestamps
 *   - Once allocated, ALL amounts use regular CD calculation
 * 
 * All calculations respect month filters by filtering source data first,
 * then calculating. No pre-computed values are stored.
 */

import {
  PurchaseInvoice,
  Payment,
  PaymentAllocation,
  PaymentAdvanceInfo,
  ReceivedDiscount,
  ExpectedDiscount,
  PendingDiscount,
  Supplier,
  ExpectedAnnualDiscount,
  PendingAnnualDiscount,
  DiscountAllocation,
  FixedScheme,
  MTBooking,
  SupplierCDRuleVersion,
  Item,
  ExpenseEntry,
  ExpenseType,
  LedgerEntry
} from './types'
import { getItemActiveUnitAndQty } from './fifo-engine'

function toDateKey(date: string): string {
  return new Date(date).toISOString().split('T')[0]
}

function getSupplierCDRuleVersion(supplier: Supplier, date: string): SupplierCDRuleVersion | null {
  const dateKey = toDateKey(date)
  const versions = [...(supplier.cdRuleVersions || [])]
    .filter((version) => version.approvalStatus === 'Approved')
    .sort((a, b) => b.version - a.version)

  return versions.find((version) => {
    const from = toDateKey(version.effectiveFrom)
    const to = version.effectiveTo ? toDateKey(version.effectiveTo) : '9999-12-31'
    return dateKey >= from && dateKey <= to
  }) || null
}

function getEffectiveSupplierCDRules(supplier: Supplier, date: string) {
  const version = getSupplierCDRuleVersion(supplier, date)
  return {
    version,
    paymentCDRules: version?.paymentCDRules || supplier.paymentCDRules || [],
    invoiceCloseCDRules: version?.invoiceCloseCDRules || supplier.invoiceCloseCDRules || [],
    advanceCDPercentage: version?.advanceCDPercentage ?? supplier.advanceCDPercentage
  }
}

export function getInvoiceMarketRate(invoice: PurchaseInvoice): number {
  const itemRows = invoice.items || []
  const itemQuantity = itemRows.reduce((sum, item) => sum + (Number(item.enteredQuantity) || 0), 0)

  if (itemRows.length > 0 && itemQuantity > 0) {
    const weightedRateTotal = itemRows.reduce((sum, item) => {
      const quantity = Number(item.enteredQuantity) || 0
      const rate = Number(item.basicRate) > 0 ? Number(item.basicRate) : (Number(item.rate) || 0)
      return sum + (quantity * rate)
    }, 0)

    return weightedRateTotal / itemQuantity
  }

  if (invoice.quantityMT > 0 && invoice.invoiceAmount > 0) {
    return invoice.invoiceAmount / invoice.quantityMT
  }

  return 0
}

function getApplicableFixedSchemes(
  fixedSchemes: FixedScheme[],
  supplierId: string,
  invoiceDate: string,
  includeMTBookingSchemes = true
): FixedScheme[] {
  const checkDate = new Date(invoiceDate)

  return fixedSchemes.filter(scheme => {
    if (scheme.supplierId !== supplierId) return false
    if (includeMTBookingSchemes && scheme.applyInMTBooking === false) return false
    if (!includeMTBookingSchemes && scheme.applyInMTBooking !== false) return false

    const fromDate = new Date(scheme.fromDate)
    const toDate = new Date(scheme.toDate)

    return checkDate >= fromDate && checkDate <= toDate
  })
}

function getMTBookingRateComparison(
  bookedMarketRate: number | undefined,
  currentMarketRate: number
): 'currentLower' | 'currentHigher' | 'equal' | 'legacy' {
  if (!bookedMarketRate || bookedMarketRate <= 0 || currentMarketRate <= 0) return 'legacy'

  const roundedBookedRate = Math.round(bookedMarketRate * 100) / 100
  const roundedCurrentRate = Math.round(currentMarketRate * 100) / 100

  if (roundedCurrentRate < roundedBookedRate) return 'currentLower'
  if (roundedCurrentRate > roundedBookedRate) return 'currentHigher'
  return 'equal'
}

function getMTBookingRuleSource(
  booking: MTBooking,
  currentSchemes: FixedScheme[],
  currentMarketRate: number
): 'current' | 'previous' {
  const comparison = getMTBookingRateComparison(booking.bookedMarketRate, currentMarketRate)

  if (comparison === 'currentLower') return 'current'
  if (comparison === 'currentHigher') return 'previous'
  if (comparison === 'legacy') return 'previous'

  const preference = booking.tieBreakPreference || 'current'

  if (preference === 'previous') return 'previous'
  if (preference === 'manual') return booking.manualSelection || 'current'
  if (preference === 'highestBenefit') {
    const previousBenefit = booking.rateMode === 'manual'
      ? (booking.manualRate || 0)
      : (booking.lockedSchemes || []).reduce((sum, scheme) => sum + (Number(scheme.ratePerMT) || 0), 0)
    const currentBenefit = currentSchemes.reduce((sum, scheme) => sum + (Number(scheme.ratePerMT) || 0), 0)

    return previousBenefit > currentBenefit ? 'previous' : 'current'
  }

  return 'current'
}

export function calculatePaymentAllocations(
  payments: Payment[],
  invoices: PurchaseInvoice[]
): { allocations: PaymentAllocation[]; paymentAdvanceInfo: Map<string, PaymentAdvanceInfo> } {
  const allocations: PaymentAllocation[] = []
  const paymentAdvanceInfo = new Map<string, PaymentAdvanceInfo>()
  const allocationIsAdvanceGlobal = new Map<string, boolean>()

  type Entry =
    | { type: 'invoice'; date: Date; timestamp: number; data: PurchaseInvoice }
    | { type: 'payment'; date: Date; timestamp: number; data: Payment }

  const entries: Entry[] = [
    ...invoices.map(inv => {
      const dateTimestamp = new Date(inv.invoiceDate).getTime()
      const timestamp = inv.createdAt || dateTimestamp
      return {
        type: 'invoice' as const,
        date: new Date(inv.invoiceDate),
        timestamp,
        data: inv
      }
    }),
    ...payments.map(pay => {
      const dateTimestamp = new Date(pay.paymentDate).getTime()
      const timestamp = pay.createdAt || dateTimestamp
      return {
        type: 'payment' as const,
        date: new Date(pay.paymentDate),
        timestamp,
        data: pay
      }
    })
  ]

  entries.sort((a, b) => {
    const dateA = a.date.toISOString().split('T')[0]
    const dateB = b.date.toISOString().split('T')[0]

    if (dateA !== dateB) {
      return a.date.getTime() - b.date.getTime()
    }

    const timeDiff = a.timestamp - b.timestamp
    if (timeDiff !== 0) return timeDiff

    if (a.type === 'invoice' && b.type === 'payment') return -1
    if (a.type === 'payment' && b.type === 'invoice') return 1
    return 0
  })

  const supplierState = new Map<string, {
    pendingInvoices: { invoice: PurchaseInvoice; balance: number }[]
    advancePayments: { payment: Payment; balance: number; wasAdvanceAtPaymentTime: boolean }[]
    totalOutstanding: number
  }>()

  for (const entry of entries) {
    if (entry.type === 'invoice') {
      const invoice = entry.data
      const supplierId = invoice.supplierId

      if (!supplierState.has(supplierId)) {
        supplierState.set(supplierId, { pendingInvoices: [], advancePayments: [], totalOutstanding: 0 })
      }

      const state = supplierState.get(supplierId)!
      let remainingInvoice = invoice.invoiceAmount
      let loopCounter = 0
      const maxLoops = 10000

      while (state.advancePayments.length > 0 && remainingInvoice > 0 && loopCounter < maxLoops) {
        loopCounter++
        const advancePayment = state.advancePayments[0]
        if (!advancePayment || advancePayment.balance <= 0) {
          state.advancePayments.shift()
          continue
        }
        const allocationAmount = Math.min(remainingInvoice, advancePayment.balance)

        if (allocationAmount <= 0) break

        const allocationId = `${advancePayment.payment.id}-${invoice.id}-${allocations.length}`

        allocations.push({
          id: allocationId,
          paymentId: advancePayment.payment.id,
          invoiceId: invoice.id,
          allocatedAmount: allocationAmount,
          fy: invoice.fy
        })

        allocationIsAdvanceGlobal.set(allocationId, advancePayment.wasAdvanceAtPaymentTime)

        remainingInvoice -= allocationAmount
        advancePayment.balance -= allocationAmount

        if (advancePayment.balance <= 0) {
          state.advancePayments.shift()
        }
      }

      if (remainingInvoice > 0) {
        state.pendingInvoices.push({
          invoice,
          balance: remainingInvoice
        })
        state.totalOutstanding += remainingInvoice
      }

    } else {
      const payment = entry.data
      const supplierId = payment.supplierId

      if (!supplierState.has(supplierId)) {
        supplierState.set(supplierId, { pendingInvoices: [], advancePayments: [], totalOutstanding: 0 })
      }

      const state = supplierState.get(supplierId)!
      const outstandingAtPaymentTime = state.totalOutstanding
      let remainingPayment = payment.amount
      let allocatedToExistingInvoices = 0
      let loopCounter = 0
      const maxLoops = 10000

      while (state.pendingInvoices.length > 0 && remainingPayment > 0 && loopCounter < maxLoops) {
        loopCounter++
        const pendingInvoice = state.pendingInvoices[0]
        if (!pendingInvoice || pendingInvoice.balance <= 0) {
          state.pendingInvoices.shift()
          continue
        }
        const allocationAmount = Math.min(remainingPayment, pendingInvoice.balance)

        if (allocationAmount <= 0) break

        const allocationId = `${payment.id}-${pendingInvoice.invoice.id}-${allocations.length}`

        allocations.push({
          id: allocationId,
          paymentId: payment.id,
          invoiceId: pendingInvoice.invoice.id,
          allocatedAmount: allocationAmount,
          fy: payment.fy
        })

        allocationIsAdvanceGlobal.set(allocationId, false)

        remainingPayment -= allocationAmount
        pendingInvoice.balance -= allocationAmount
        state.totalOutstanding -= allocationAmount
        allocatedToExistingInvoices += allocationAmount

        if (pendingInvoice.balance <= 0) {
          state.pendingInvoices.shift()
        }
      }

      const advanceAmount = remainingPayment
      const wasAdvance = advanceAmount > 0

      console.log(`Payment ${payment.id} (${payment.paymentDate}):`, {
        paymentAmount: payment.amount,
        outstandingAtPaymentTime,
        allocatedToExistingInvoices,
        advanceAmount,
        advancePercentage: (advanceAmount / payment.amount) * 100
      })

      paymentAdvanceInfo.set(payment.id, {
        paymentId: payment.id,
        advanceAmount: advanceAmount,
        allocatedAmount: allocatedToExistingInvoices,
        outstandingAtPaymentTime: outstandingAtPaymentTime,
        allocationIsAdvanceMap: allocationIsAdvanceGlobal
      })

      if (remainingPayment > 0) {
        state.advancePayments.push({
          payment,
          balance: remainingPayment,
          wasAdvanceAtPaymentTime: true
        })
      }
    }
  }

  return { allocations, paymentAdvanceInfo }
}

export function isPaymentAdvance(
  payment: Payment,
  paymentAllocations: PaymentAllocation[]
): boolean {
  if (payment.isAdvance) return true

  const allocatedAmount = paymentAllocations
    .filter(a => a.paymentId === payment.id)
    .reduce((sum, a) => sum + a.allocatedAmount, 0)

  return allocatedAmount < payment.amount
}

import { getInvoiceQtyForUnit as getNormalizedInvoiceQtyForUnit, toBaseQuantity, fromBaseQuantity } from './unit-conversion-service'

export const getInvoiceQtyForUnit = (inv: PurchaseInvoice, targetUnit: string, itemsMap?: Map<string, Item> | Item[]): number => {
  return getNormalizedInvoiceQtyForUnit(inv, targetUnit, itemsMap)
}


export function calculateExpectedDiscounts(
  invoices: PurchaseInvoice[],
  payments: Payment[],
  paymentAllocations: PaymentAllocation[],
  paymentAdvanceInfo: Map<string, PaymentAdvanceInfo>,
  suppliers: Supplier[],
  fixedSchemes: FixedScheme[] = [],
  mtBookings: MTBooking[] = [],
  items: Item[] | Map<string, Item> = []
): ExpectedDiscount[] {
  const expectedDiscounts: ExpectedDiscount[] = []
  const supplierMap = new Map(suppliers.map(s => [s.id, s]))
  const invoiceMap = new Map(invoices.map(inv => [inv.id, inv]))
  const paymentMap = new Map(payments.map(pay => [pay.id, pay]))
  const itemMap = items instanceof Map
    ? items
    : new Map((Array.isArray(items) ? items : []).map(i => [i.id, i]))

  type PaymentAllocationWithTracking = {
    allocation: PaymentAllocation
    advanceRemaining: number
    regularRemaining: number
  }

  const paymentAllocationTracking = new Map<string, PaymentAllocationWithTracking[]>()

  for (const payment of payments) {
    const supplier = supplierMap.get(payment.supplierId)
    if (!supplier || payment.doNotApplyCD) continue

    const advanceInfo = paymentAdvanceInfo.get(payment.id)
    if (!advanceInfo) continue

    const paymentAllocsForThisPayment = paymentAllocations.filter(a => a.paymentId === payment.id)

    const trackingList: PaymentAllocationWithTracking[] = []

    for (const allocation of paymentAllocsForThisPayment) {
      const invoice = invoiceMap.get(allocation.invoiceId)
      if (!invoice) continue

      const isAdvanceAllocation = advanceInfo.allocationIsAdvanceMap.get(allocation.id) === true

      trackingList.push({
        allocation,
        advanceRemaining: isAdvanceAllocation ? allocation.allocatedAmount : 0,
        regularRemaining: isAdvanceAllocation ? 0 : allocation.allocatedAmount
      })
    }

    paymentAllocationTracking.set(payment.id, trackingList)
  }

  for (const payment of payments) {
    const supplier = supplierMap.get(payment.supplierId)
    if (!supplier || payment.doNotApplyCD) continue
    const effectiveRules = getEffectiveSupplierCDRules(supplier, payment.paymentDate)

    const trackingList = paymentAllocationTracking.get(payment.id)
    if (!trackingList) continue

    for (const tracking of trackingList) {
      const allocation = tracking.allocation
      const invoice = invoiceMap.get(allocation.invoiceId)
      if (!invoice) continue

      const regularAmount = tracking.regularRemaining

      if (regularAmount > 0) {
        const invoiceDate = new Date(invoice.invoiceDate)
        const paymentDate = new Date(payment.paymentDate)
        invoiceDate.setHours(0, 0, 0, 0)
        paymentDate.setHours(0, 0, 0, 0)

        const calculatedDays = Math.floor(
          (paymentDate.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24)
        )

        const paymentDays = Math.max(0, calculatedDays)

        const paymentCDRule = effectiveRules.paymentCDRules?.find(
          rule => paymentDays >= rule.minDays && paymentDays <= rule.maxDays
        )

        if (paymentCDRule) {
          const discountAmount = (regularAmount * paymentCDRule.percentageRate) / 100

          expectedDiscounts.push({
            id: `paymentCD-${allocation.id}`,
            supplierId: supplier.id,
            invoiceId: invoice.id,
            paymentId: payment.id,
            type: 'paymentCD',
            ruleVersionId: effectiveRules.version?.id,
            ruleVersion: effectiveRules.version?.version,
            ruleName: effectiveRules.version?.ruleName || 'Payment CD',
            earnedDate: payment.paymentDate,
            invoiceDate: invoice.invoiceDate,
            eligibleQuantityMT: 0,
            ratePerMT: 0,
            expectedAmount: discountAmount,
            invoiceNo: invoice.invoiceNo
          })
        }
      }
    }
  }

  for (const payment of payments) {
    const supplier = supplierMap.get(payment.supplierId)
    if (!supplier || payment.doNotApplyCD) continue
    const effectiveRules = getEffectiveSupplierCDRules(supplier, payment.paymentDate)

    const advanceInfo = paymentAdvanceInfo.get(payment.id)
    if (!advanceInfo || advanceInfo.advanceAmount <= 0) continue

    if (effectiveRules.advanceCDPercentage && effectiveRules.advanceCDPercentage > 0) {
      const advanceAmount = advanceInfo.advanceAmount
      const discountAmount = (advanceAmount * effectiveRules.advanceCDPercentage) / 100

      expectedDiscounts.push({
        id: `advanceCD-unallocated-${payment.id}`,
        supplierId: supplier.id,
        paymentId: payment.id,
        type: 'advanceCD',
        ruleVersionId: effectiveRules.version?.id,
        ruleVersion: effectiveRules.version?.version,
        ruleName: effectiveRules.version?.ruleName || 'Advance Payment CD',
        earnedDate: payment.paymentDate,
        eligibleQuantityMT: 0,
        ratePerMT: 0,
        expectedAmount: discountAmount,
        schemeName: `Advance Payment (${effectiveRules.advanceCDPercentage}%)`
      })
    }
  }

  const supplierInvoicesByDate = new Map<string, PurchaseInvoice[]>()
  for (const invoice of invoices) {
    const key = invoice.supplierId
    if (!supplierInvoicesByDate.has(key)) {
      supplierInvoicesByDate.set(key, [])
    }
    supplierInvoicesByDate.get(key)!.push(invoice)
  }

  for (const [supplierId, supplierInvoices] of supplierInvoicesByDate.entries()) {
    supplierInvoices.sort((a, b) => new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime())
  }

  const bookingTotalConsumed = new Map<string, number>()

  for (const invoice of invoices) {
    const supplier = supplierMap.get(invoice.supplierId)
    if (!supplier) continue
    const effectiveInvoiceRules = getEffectiveSupplierCDRules(supplier, invoice.invoiceDate)
    const currentMarketRate = getInvoiceMarketRate(invoice)
    const currentMTBookingSchemes = getApplicableFixedSchemes(fixedSchemes, supplier.id, invoice.invoiceDate, true)

    const invoiceAllocations = paymentAllocations.filter(
      a => a.invoiceId === invoice.id
    )

    const totalAllocated = invoiceAllocations.reduce((sum, a) => sum + a.allocatedAmount, 0)
    const isFullyPaid = totalAllocated >= invoice.invoiceAmount

    if (isFullyPaid && effectiveInvoiceRules.invoiceCloseCDRules && effectiveInvoiceRules.invoiceCloseCDRules.length > 0) {
      const lastPayment = payments
        .filter(p => invoiceAllocations.some(a => a.paymentId === p.id))
        .sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime())[0]

      if (lastPayment && !lastPayment.doNotApplyCD) {
        const calculatedDaysSinceInvoice = Math.floor(
          (new Date(lastPayment.paymentDate).getTime() -
            new Date(invoice.invoiceDate).getTime()) /
          (1000 * 60 * 60 * 24)
        )

        const daysSinceInvoice = Math.max(0, calculatedDaysSinceInvoice)

        const maxSlabDays = Math.max(...effectiveInvoiceRules.invoiceCloseCDRules.map(rule => rule.maxDays))

        if (daysSinceInvoice <= maxSlabDays) {
          const applicableRules = effectiveInvoiceRules.invoiceCloseCDRules.filter(
            rule => daysSinceInvoice >= rule.minDays && daysSinceInvoice <= rule.maxDays
          )

          applicableRules.forEach(invoiceCloseCDRule => {
            const targetUnits = (invoiceCloseCDRule.unit && invoiceCloseCDRule.unit !== 'ALL' && invoiceCloseCDRule.unit !== '')
              ? [invoiceCloseCDRule.unit]
              : (invoice.items && Array.isArray(invoice.items) && invoice.items.length > 0
                ? Array.from(new Set(invoice.items.map(item => item.enteredUnit || (item as any).entryUnit || 'KG')))
                : ['MT'])

            targetUnits.forEach(targetUnit => {
              const eligibleQuantity = roundQuantity(getInvoiceQtyForUnit(invoice, targetUnit, itemMap), 4)

              if (eligibleQuantity > 0) {
                expectedDiscounts.push({
                  id: `invoiceCloseCD-${invoice.id}-${targetUnit}-${invoiceCloseCDRule.ratePerMT}`,
                  supplierId: supplier.id,
                  invoiceId: invoice.id,
                  schemeId: `invoiceCloseCD-${invoiceCloseCDRule.ratePerMT}-${targetUnit}`,
                  ruleVersionId: `invoiceCloseCD-${invoiceCloseCDRule.ratePerMT}-${targetUnit}`,
                  ruleVersion: 1,
                  ruleName: `Closing CD (${invoiceCloseCDRule.ratePerMT}/${targetUnit})`,
                  type: 'invoiceCloseCD',
                  earnedDate: lastPayment.paymentDate,
                  invoiceDate: invoice.invoiceDate,
                  eligibleQuantityMT: eligibleQuantity,
                  ratePerMT: invoiceCloseCDRule.ratePerMT,
                  expectedAmount: roundCurrency(eligibleQuantity * invoiceCloseCDRule.ratePerMT),
                  unit: targetUnit,
                  invoiceNo: invoice.invoiceNo
                })
              }
            })
          })
        }
      }
    }

    const sortedBookingsForSupplier = mtBookings
      .filter(b => b.supplierId === supplier.id)
      .sort((a, b) => {
        const dateA = new Date(a.consumeStartDate).getTime()
        const dateB = new Date(b.consumeStartDate).getTime()
        if (dateA !== dateB) return dateA - dateB
        return new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime()
      })

    const invoiceDate = new Date(invoice.invoiceDate)
    const totalInvoiceMT = roundQuantity(getInvoiceQtyForUnit(invoice, 'MT', itemMap) || invoice.quantityMT || 0, 4)
    let remainingInvoiceMT = totalInvoiceMT

    for (const booking of sortedBookingsForSupplier) {
      if (remainingInvoiceMT <= 0) break

      const consumeStartDate = new Date(booking.consumeStartDate)
      if (invoiceDate < consumeStartDate) continue

      const bookingUnit = booking.unit || 'MT'
      const consumedByThisBooking = roundQuantity(bookingTotalConsumed.get(booking.id) || 0, 4)
      const bookingNormalizedMT = getBookingNormalizedMT(booking)
      const bookingRemaining = roundQuantity(Math.max(0, bookingNormalizedMT - consumedByThisBooking), 4)

      if (bookingRemaining > 0) {
        // Strict unit-specific isolation: Check if invoice has line items compatible with booking unit
        const eligibleInvoiceQtyInBookingUnit = getInvoiceQtyForUnit(invoice, bookingUnit, itemMap)
        if (eligibleInvoiceQtyInBookingUnit <= 0) continue

        const eligibleInvoiceMT = getBookingNormalizedMT({ bookedMT: eligibleInvoiceQtyInBookingUnit, unit: bookingUnit })
        const mtToConsumeFromBooking = roundQuantity(Math.min(remainingInvoiceMT, eligibleInvoiceMT, bookingRemaining), 4)
        if (mtToConsumeFromBooking <= 0) continue
        const marketRateComparison = getMTBookingRateComparison(booking.bookedMarketRate, currentMarketRate)

        if (booking.lockedSchemes && booking.lockedSchemes.length > 0) {
          for (const lockedScheme of booking.lockedSchemes) {
            expectedDiscounts.push({
              id: `fixedScheme-booking-${invoice.id}-${booking.id}-${lockedScheme.schemeId}`,
              supplierId: supplier.id,
              invoiceId: invoice.id,
              schemeId: lockedScheme.schemeId,
              ruleVersionId: lockedScheme.ruleVersionId || lockedScheme.schemeId,
              ruleVersion: lockedScheme.ruleVersion || 1,
              ruleName: lockedScheme.schemeName,
              type: 'fixedScheme',
              earnedDate: invoice.invoiceDate,
              invoiceDate: invoice.invoiceDate,
              eligibleQuantityMT: mtToConsumeFromBooking,
              ratePerMT: lockedScheme.ratePerMT,
              expectedAmount: roundCurrency(mtToConsumeFromBooking * lockedScheme.ratePerMT),
              invoiceNo: invoice.invoiceNo,
              schemeName: `${lockedScheme.schemeName} (MT Booking Locked)`,
              mtBookingId: booking.id,
              mtBookingRuleSource: 'previous',
              marketRateComparison,
              bookedMarketRate: booking.bookedMarketRate,
              currentMarketRate
            })
          }
        } else if (booking.rateMode === 'manual' && booking.manualRate !== undefined) {
          expectedDiscounts.push({
            id: `fixedScheme-booking-manual-${invoice.id}-${booking.id}`,
            supplierId: supplier.id,
            invoiceId: invoice.id,
            schemeId: 'manual-mt-booking',
            type: 'fixedScheme',
            earnedDate: invoice.invoiceDate,
            invoiceDate: invoice.invoiceDate,
            eligibleQuantityMT: mtToConsumeFromBooking,
            ratePerMT: booking.manualRate,
            expectedAmount: roundCurrency(mtToConsumeFromBooking * booking.manualRate),
            invoiceNo: invoice.invoiceNo,
            schemeName: 'Manual MT Booking Rate',
            mtBookingId: booking.id,
            mtBookingRuleSource: 'previous',
            marketRateComparison,
            bookedMarketRate: booking.bookedMarketRate,
            currentMarketRate
          })
        } else {
          // Fallback to active schemes at booking's orderDate
          const bookingOrderSchemes = getApplicableFixedSchemes(fixedSchemes, supplier.id, booking.orderDate, true)
          for (const scheme of bookingOrderSchemes) {
            expectedDiscounts.push({
              id: `fixedScheme-booking-order-${invoice.id}-${booking.id}-${scheme.id}`,
              supplierId: supplier.id,
              invoiceId: invoice.id,
              schemeId: scheme.id,
              ruleVersionId: scheme.id,
              ruleVersion: scheme.version || 1,
              ruleName: scheme.schemeName,
              type: 'fixedScheme',
              earnedDate: invoice.invoiceDate,
              invoiceDate: invoice.invoiceDate,
              eligibleQuantityMT: mtToConsumeFromBooking,
              ratePerMT: scheme.ratePerMT,
              expectedAmount: roundCurrency(mtToConsumeFromBooking * scheme.ratePerMT),
              invoiceNo: invoice.invoiceNo,
              schemeName: `${scheme.schemeName} (Booking Order Date)`,
              mtBookingId: booking.id,
              mtBookingRuleSource: 'previous',
              marketRateComparison,
              bookedMarketRate: booking.bookedMarketRate,
              currentMarketRate
            })
          }
        }

        remainingInvoiceMT = roundQuantity(Math.max(0, remainingInvoiceMT - mtToConsumeFromBooking), 4)
        bookingTotalConsumed.set(booking.id, roundQuantity(consumedByThisBooking + mtToConsumeFromBooking, 4))
      }
    }

    const excludedFromBookingSchemes = getApplicableFixedSchemes(fixedSchemes, supplier.id, invoice.invoiceDate, false)

    for (const scheme of excludedFromBookingSchemes) {
      const schemeUnit = scheme.unit || 'MT'
      const eligibleQty = roundQuantity(getInvoiceQtyForUnit(invoice, schemeUnit, itemMap), 4)

      if (eligibleQty > 0) {
        expectedDiscounts.push({
          id: `fixedScheme-${invoice.id}-${scheme.id}-booking-excluded`,
          supplierId: supplier.id,
          invoiceId: invoice.id,
          schemeId: scheme.id,
          ruleVersionId: scheme.id,
          ruleVersion: scheme.version || 1,
          ruleName: scheme.schemeName,
          type: 'fixedScheme',
          earnedDate: invoice.invoiceDate,
          invoiceDate: invoice.invoiceDate,
          eligibleQuantityMT: eligibleQty,
          ratePerMT: scheme.ratePerMT,
          expectedAmount: roundCurrency(eligibleQty * scheme.ratePerMT),
          unit: schemeUnit,
          invoiceNo: invoice.invoiceNo,
          schemeName: scheme.schemeName
        })
      }
    }

    remainingInvoiceMT = roundQuantity(remainingInvoiceMT, 4)
    if (remainingInvoiceMT > 0) {
      const applicableSchemes = currentMTBookingSchemes

      for (const scheme of applicableSchemes) {
        const schemeUnit = scheme.unit || 'MT'
        const fullQty = roundQuantity(getInvoiceQtyForUnit(invoice, schemeUnit, itemMap), 4)
        const ratio = totalInvoiceMT > 0 ? remainingInvoiceMT / totalInvoiceMT : 1
        const eligibleQty = roundQuantity(fullQty * ratio, 4)

        if (eligibleQty > 0) {
          expectedDiscounts.push({
            id: `fixedScheme-${invoice.id}-${scheme.id}`,
            supplierId: supplier.id,
            invoiceId: invoice.id,
            schemeId: scheme.id,
            ruleVersionId: scheme.id,
            ruleVersion: scheme.version || 1,
            ruleName: scheme.schemeName,
            type: 'fixedScheme',
            earnedDate: invoice.invoiceDate,
            invoiceDate: invoice.invoiceDate,
            eligibleQuantityMT: eligibleQty,
            ratePerMT: scheme.ratePerMT,
            expectedAmount: roundCurrency(eligibleQty * scheme.ratePerMT),
            unit: schemeUnit,
            invoiceNo: invoice.invoiceNo,
            schemeName: scheme.schemeName
          })
        }
      }
    }
  }

  return expectedDiscounts
}

export function calculateDiscountAllocations(
  receivedDiscounts: ReceivedDiscount[],
  expectedDiscounts: ExpectedDiscount[]
): { allocations: DiscountAllocation[]; receivedStatus: Map<string, { allocated: number; advance: number }> } {
  const allocations: DiscountAllocation[] = []
  const receivedStatus = new Map<string, { allocated: number; advance: number }>()

  const sortedReceived = [...receivedDiscounts]
    .filter(rd => rd.type === 'wallet')
    .sort((a, b) =>
      new Date(a.discountReceivedDate).getTime() - new Date(b.discountReceivedDate).getTime()
    )

  type SchemeWallet = {
    supplierId: string
    schemeKey: string
    expectedEntries: Array<{
      expected: ExpectedDiscount
      remainingBalance: number
    }>
    totalExpected: number
  }

  const schemeWallets = new Map<string, SchemeWallet>()

  for (const expected of expectedDiscounts) {
    let schemeKey: string

    if (expected.type === 'paymentCD' || expected.type === 'advanceCD') {
      schemeKey = 'paymentCD'
    } else if (expected.type === 'fixedScheme') {
      schemeKey = `fixedScheme:${expected.schemeName || 'unknown'}`
    } else if (expected.type === 'invoiceCloseCD') {
      schemeKey = 'invoiceCloseCD'
    } else {
      continue
    }

    const walletKey = `${expected.supplierId}|${schemeKey}`

    if (!schemeWallets.has(walletKey)) {
      schemeWallets.set(walletKey, {
        supplierId: expected.supplierId,
        schemeKey,
        expectedEntries: [],
        totalExpected: 0
      })
    }

    const wallet = schemeWallets.get(walletKey)!
    wallet.expectedEntries.push({
      expected,
      remainingBalance: expected.expectedAmount
    })
    wallet.totalExpected += expected.expectedAmount
  }

  for (const wallet of schemeWallets.values()) {
    wallet.expectedEntries.sort((a, b) =>
      new Date(a.expected.earnedDate).getTime() - new Date(b.expected.earnedDate).getTime()
    )
  }

  const expectedAllocatedTracker = new Map<string, number>()

  for (const received of sortedReceived) {
    const receivedAmount = received.amount
    let allocatedAmount = 0

    let targetSchemeKey: string | null = null
    if (received.allocateToDiscountType) {
      const allocateType = received.allocateToDiscountType

      if (allocateType === 'paymentCD' || allocateType === 'advanceCD') {
        targetSchemeKey = 'paymentCD'
      } else if (allocateType === 'fixedScheme') {
        if (received.allocateToSchemeName) {
          targetSchemeKey = `fixedScheme:${received.allocateToSchemeName}`
        } else {
          targetSchemeKey = 'fixedScheme:'
        }
      } else if (allocateType === 'invoiceCloseCD') {
        targetSchemeKey = 'invoiceCloseCD'
      }
    }

    const eligibleWallets: SchemeWallet[] = []
    for (const wallet of schemeWallets.values()) {
      if (wallet.supplierId !== received.supplierId) continue

      if (targetSchemeKey !== null) {
        if (targetSchemeKey.startsWith('fixedScheme:') && wallet.schemeKey.startsWith('fixedScheme:')) {
          if (received.allocateToSchemeName) {
            if (wallet.schemeKey !== targetSchemeKey) continue
          }
        } else if (wallet.schemeKey !== targetSchemeKey) {
          continue
        }
      }

      eligibleWallets.push(wallet)
    }

    eligibleWallets.sort((a, b) => {
      const aFirstDate = a.expectedEntries[0]?.expected.earnedDate || ''
      const bFirstDate = b.expectedEntries[0]?.expected.earnedDate || ''
      return new Date(aFirstDate).getTime() - new Date(bFirstDate).getTime()
    })

    for (const wallet of eligibleWallets) {
      if (allocatedAmount >= receivedAmount) break

      for (const entry of wallet.expectedEntries) {
        if (allocatedAmount >= receivedAmount) break

        const alreadyAllocatedToExpected = expectedAllocatedTracker.get(entry.expected.id) || 0
        const availableBalance = entry.expected.expectedAmount - alreadyAllocatedToExpected

        if (availableBalance <= 0) continue

        const remainingToAllocate = receivedAmount - allocatedAmount
        const allocationAmount = Math.min(remainingToAllocate, availableBalance)

        if (allocationAmount > 0) {
          allocations.push({
            id: `${received.id}-${entry.expected.id}-${allocations.length}`,
            receivedDiscountId: received.id,
            expectedDiscountId: entry.expected.id,
            allocatedAmount: allocationAmount
          })

          expectedAllocatedTracker.set(
            entry.expected.id,
            alreadyAllocatedToExpected + allocationAmount
          )
          allocatedAmount += allocationAmount
        }
      }
    }

    const advance = receivedAmount - allocatedAmount

    receivedStatus.set(received.id, {
      allocated: allocatedAmount,
      advance: advance
    })
  }

  return { allocations, receivedStatus }
}

export function calculatePendingDiscounts(
  expectedDiscounts: ExpectedDiscount[],
  discountAllocations: DiscountAllocation[],
  suppliers: Supplier[]
): PendingDiscount[] {
  const supplierMap = new Map(suppliers.map(s => [s.id, s]))

  return expectedDiscounts.map(expected => {
    const allocations = discountAllocations.filter(
      a => a.expectedDiscountId === expected.id
    )

    const receivedAmount = allocations.reduce((sum, a) => sum + a.allocatedAmount, 0)
    const pendingAmount = expected.expectedAmount - receivedAmount

    let status: 'Pending' | 'Partially Received' | 'Received' = 'Pending'
    if (receivedAmount >= expected.expectedAmount) {
      status = 'Received'
    } else if (receivedAmount > 0) {
      status = 'Partially Received'
    }

    const supplier = supplierMap.get(expected.supplierId)

    return {
      ...expected,
      receivedAmount,
      pendingAmount,
      status
    }
  })
}

export function calculateExpectedAnnualDiscounts(
  invoices: PurchaseInvoice[],
  suppliers: Supplier[]
): ExpectedAnnualDiscount[] {
  const expectedAnnual: ExpectedAnnualDiscount[] = []

  const supplierAchievedMT = new Map<string, number>()

  for (const invoice of invoices) {
    const current = supplierAchievedMT.get(invoice.supplierId) || 0
    supplierAchievedMT.set(invoice.supplierId, current + invoice.quantityMT)
  }

  for (const supplier of suppliers) {
    if (!supplier.annualTarget) continue

    const achievedMT = supplierAchievedMT.get(supplier.id) || 0
    const expectedAmount = achievedMT * supplier.annualTarget.ratePerMT

    expectedAnnual.push({
      id: `annual-${supplier.id}`,
      supplierId: supplier.id,
      supplierName: supplier.name,
      targetMT: supplier.annualTarget.targetMT,
      achievedMT,
      ratePerMT: supplier.annualTarget.ratePerMT,
      expectedAmount
    })
  }

  return expectedAnnual
}

export function calculateAnnualDiscountAllocations(
  receivedDiscounts: ReceivedDiscount[],
  expectedAnnual: ExpectedAnnualDiscount[]
): { allocations: DiscountAllocation[]; receivedStatus: Map<string, { allocated: number; advance: number }> } {
  const allocations: DiscountAllocation[] = []
  const receivedStatus = new Map<string, { allocated: number; advance: number }>()

  const sortedReceived = [...receivedDiscounts]
    .filter(rd => rd.type === 'annual')
    .sort((a, b) =>
      new Date(a.discountReceivedDate).getTime() - new Date(b.discountReceivedDate).getTime()
    )

  const expectedBalances = new Map(
    expectedAnnual.map(exp => [exp.id, exp.expectedAmount])
  )

  for (const received of sortedReceived) {
    const receivedAmount = received.amount
    let allocatedAmount = 0

    for (const expected of expectedAnnual) {
      if (expected.supplierId !== received.supplierId) continue

      const expectedBalance = expectedBalances.get(expected.id) || 0
      if (expectedBalance <= 0) continue

      const remainingToAllocate = receivedAmount - allocatedAmount
      if (remainingToAllocate <= 0) break

      const allocationAmount = Math.min(remainingToAllocate, expectedBalance)

      allocations.push({
        id: `annual-${received.id}-${expected.id}-${allocations.length}`,
        receivedDiscountId: received.id,
        expectedDiscountId: expected.id,
        allocatedAmount: allocationAmount
      })

      expectedBalances.set(expected.id, expectedBalance - allocationAmount)
      allocatedAmount += allocationAmount
    }

    const advance = receivedAmount - allocatedAmount

    receivedStatus.set(received.id, {
      allocated: allocatedAmount,
      advance: advance
    })
  }

  return { allocations, receivedStatus }
}

export function calculatePendingAnnualDiscounts(
  expectedAnnual: ExpectedAnnualDiscount[],
  annualAllocations: DiscountAllocation[]
): PendingAnnualDiscount[] {
  return expectedAnnual.map(expected => {
    const allocations = annualAllocations.filter(
      a => a.expectedDiscountId === expected.id
    )

    const receivedAmount = allocations.reduce((sum, a) => sum + a.allocatedAmount, 0)
    const pendingAmount = expected.expectedAmount - receivedAmount

    let status: 'Pending' | 'Partially Received' | 'Received' = 'Pending'
    if (receivedAmount >= expected.expectedAmount) {
      status = 'Received'
    } else if (receivedAmount > 0) {
      status = 'Partially Received'
    }

    return {
      ...expected,
      receivedAmount,
      pendingAmount,
      status
    }
  })
}

export function roundQuantity(qty: number, decimals: number = 3): number {
  if (!Number.isFinite(qty)) return 0
  const factor = Math.pow(10, decimals)
  return Math.round((qty + Number.EPSILON) * factor) / factor
}

export function roundCurrency(amount: number): number {
  if (!Number.isFinite(amount)) return 0
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

export function formatCurrency(amount: number): string {
  const val = Number.isFinite(Number(amount)) ? roundCurrency(Number(amount)) : 0
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(val)
}

export function formatMT(qty: number, unit?: string): string {
  const val = Number.isFinite(Number(qty)) ? Number(qty) : 0
  const unitSuffix = unit ? ` ${unit}` : ''
  return `${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}${unitSuffix}`
}

export function getCurrentFY(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  if (month >= 4) {
    return `FY${year}-${(year + 1).toString().slice(2)}`
  } else {
    return `FY${year - 1}-${year.toString().slice(2)}`
  }
}

export function generateFYList(startYear = 2015, endYear = 2040, currentFY?: string): string[] {
  const list: string[] = []
  for (let y = startYear; y <= endYear; y++) {
    const nextY = (y + 1).toString().slice(2)
    list.push(`FY${y}-${nextY}`)
  }
  if (currentFY && !list.includes(currentFY)) {
    list.push(currentFY)
  }
  return list
}

export function getFYMonths(fy: string): { value: string; label: string }[] {
  const yearMatch = fy.match(/FY(\d{4})-(\d{2})/)
  if (!yearMatch) return []

  const startYear = parseInt(yearMatch[1])
  const endYear = parseInt('20' + yearMatch[2])

  const months: { value: string; label: string }[] = []
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  for (let m = 3; m < 15; m++) {
    const monthIndex = m % 12
    const year = m < 12 ? startYear : endYear
    const monthValue = `${year}-${String(monthIndex + 1).padStart(2, '0')}`
    const shortYear = year.toString().slice(2)
    const monthLabel = `${monthNames[monthIndex]} ${shortYear}`
    months.push({ value: monthValue, label: monthLabel })
  }

  return months
}

export function getFYDateRange(fy: string): { startDate: Date; endDate: Date } | null {
  const yearMatch = fy.match(/FY(\d{4})-(\d{2})/)
  if (!yearMatch) return null

  const startYear = parseInt(yearMatch[1])
  const endYear = parseInt('20' + yearMatch[2])

  const startDate = new Date(startYear, 3, 1)
  const endDate = new Date(endYear, 2, 31, 23, 59, 59, 999)

  return { startDate, endDate }
}

export function isDateInFY(date: string | Date, fy: string): boolean {
  return true
}

export function getFYFromDate(date: string | Date): string {
  const d = new Date(date)
  const month = d.getMonth() // 0-indexed: 0=Jan, 3=Apr
  const year = d.getFullYear()
  // Indian FY: April (month 3) to March (month 2)
  // If month >= April (3), FY starts this year. If month < April, FY started previous year.
  const fyStartYear = month >= 3 ? year : year - 1
  const fyEndYear = fyStartYear + 1
  const shortEnd = fyEndYear.toString().slice(2)
  return `FY${fyStartYear}-${shortEnd}`
}

export function formatDateForInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function calculateRateWithGst(basicRate: number, gstPercentage: number): number {
  if (!Number.isFinite(basicRate) || basicRate <= 0) return 0
  const rate = basicRate * (1 + (gstPercentage || 0) / 100)
  return roundCurrency(rate)
}

export function calculateBasicRateFromInclusive(rateWithTax: number, gstPercentage: number): number {
  if (!Number.isFinite(rateWithTax) || rateWithTax <= 0) return 0
  const basicRate = rateWithTax / (1 + (gstPercentage || 0) / 100)
  return roundCurrency(basicRate)
}

export function calculateItemWeightKG(
  entryQty: number,
  activeUnit: string,
  itemDef?: Item,
  customWeightKG?: number
): number {
  if (customWeightKG !== undefined && customWeightKG !== null && customWeightKG > 0) {
    return customWeightKG
  }
  let kgFactor = 1000
  if (activeUnit === 'KG') {
    kgFactor = 1
  } else if (itemDef) {
    if (activeUnit === itemDef.unit) {
      kgFactor = itemDef.conversionFactor || (itemDef.unit === 'MT' ? 1000 : 1)
    } else if (activeUnit === itemDef.alternativeUnit) {
      if (itemDef.alternativeUnit === 'KG') {
        kgFactor = 1
      } else {
        kgFactor = (itemDef.conversionFactor || 1000) / (itemDef.alternativeUnitRatio || 1)
      }
    } else {
      kgFactor = itemDef.conversionFactor || (itemDef.unit === 'MT' ? 1000 : 1)
    }
  }
  return entryQty * kgFactor
}

export interface ItemCostBreakdownRow {
  itemId: string
  name: string
  entryQty: number
  activeUnit: string
  kgFactor: number
  weightKG: number
  basicPricePerUnit: number
  allocatedExpensePerUnit: number
  landedCostPerUnit: number
  totalItemLandedAmount: number
  totalAllocatedExpense: number
}

export interface CostBreakdownDetailsResult {
  rows: ItemCostBreakdownRow[]
  totalWeightKG: number
  expenseRatePerKG: number
  totalAdditionalExpenses: number
  totalLandedCost: number
}

export function calculateCostBreakdownDetails(
  invoiceItems: Array<{ itemId: string; enteredQuantity?: number; enteredUnit?: string; baseQuantity?: number; weightKG?: number; basicRate?: number }>,
  items: Item[],
  additionalCostFinal: number
): CostBreakdownDetailsResult {
  const validRows = invoiceItems.filter(r => r.itemId && ((r.enteredQuantity || 0) > 0 || (r.baseQuantity || 0) > 0))
  if (validRows.length === 0) {
    return {
      rows: [],
      totalWeightKG: 0,
      expenseRatePerKG: 0,
      totalAdditionalExpenses: additionalCostFinal,
      totalLandedCost: 0
    }
  }

  let totalWeightKG = 0
  const rowWeightsKG = validRows.map(row => {
    const itemDef = items.find(i => i.id === row.itemId)
    const entryQty = row.enteredQuantity || 0
    const activeUnit = row.enteredUnit || itemDef?.unit || 'KG'
    const weightKG = row.baseQuantity || calculateItemWeightKG(entryQty, activeUnit, itemDef, row.weightKG)
    let kgFactor = 1000
    if (activeUnit === 'KG') {
      kgFactor = 1
    } else if (itemDef) {
      if (activeUnit === itemDef.unit) {
        kgFactor = itemDef.conversionFactor || (itemDef.unit === 'MT' ? 1000 : 1)
      } else if (activeUnit === itemDef.alternativeUnit) {
        kgFactor = itemDef.alternativeUnit === 'KG' ? 1 : (itemDef.conversionFactor || 1000) / (itemDef.alternativeUnitRatio || 1)
      } else {
        kgFactor = itemDef.conversionFactor || (itemDef.unit === 'MT' ? 1000 : 1)
      }
    }
    totalWeightKG += weightKG
    return { row, itemDef, entryQty, activeUnit, kgFactor, weightKG }
  })

  const totalAdditionalExpenses = additionalCostFinal
  const expenseRatePerKG = totalWeightKG > 0 ? (totalAdditionalExpenses / totalWeightKG) : 0

  let totalLandedCost = 0
  const rows = rowWeightsKG.map(({ row, itemDef, entryQty, activeUnit, kgFactor, weightKG }) => {
    const basicPricePerUnit = row.basicRate || 0
    const allocatedExpensePerUnit = entryQty > 0 ? ((weightKG * expenseRatePerKG) / entryQty) : (expenseRatePerKG * kgFactor)
    const landedCostPerUnit = basicPricePerUnit + allocatedExpensePerUnit
    const totalItemLandedAmount = entryQty * landedCostPerUnit
    const totalAllocatedExpense = entryQty * allocatedExpensePerUnit

    totalLandedCost += totalItemLandedAmount

    return {
      itemId: row.itemId,
      name: itemDef?.name || 'Item',
      entryQty,
      activeUnit,
      kgFactor,
      weightKG,
      basicPricePerUnit: roundCurrency(basicPricePerUnit),
      allocatedExpensePerUnit: roundCurrency(allocatedExpensePerUnit),
      landedCostPerUnit: roundCurrency(landedCostPerUnit),
      totalItemLandedAmount: roundCurrency(totalItemLandedAmount),
      totalAllocatedExpense: roundCurrency(totalAllocatedExpense)
    }
  })

  return {
    rows,
    totalWeightKG,
    expenseRatePerKG: roundCurrency(expenseRatePerKG),
    totalAdditionalExpenses: roundCurrency(totalAdditionalExpenses),
    totalLandedCost: roundCurrency(totalLandedCost)
  }
}

export function calculateInvoiceItemsTotals(items: Array<{ enteredQuantity?: number; baseQuantity?: number; amount?: number }>): { totalQty: number; totalAmount: number } {
  const totalQty = items.reduce((sum, item) => sum + (item.enteredQuantity ?? item.baseQuantity ?? 0), 0)
  const totalAmount = roundCurrency(items.reduce((sum, item) => sum + (item.amount || 0), 0))
  return { totalQty, totalAmount }
}

export function calculateInvoiceListTotals(invoices: Array<{ quantityMT?: number; invoiceAmount?: number }>): { totalQtyMT: number; totalAmount: number } {
  const totalQtyMT = invoices.reduce((sum, inv) => sum + (inv.quantityMT || 0), 0)
  const totalAmount = roundCurrency(invoices.reduce((sum, inv) => sum + (inv.invoiceAmount || 0), 0))
  return { totalQtyMT, totalAmount }
}

export function calculateAdditionalChargesTotals(charges: Array<{ basicRate?: number; taxMode?: string; gstRate?: number; finalAmt?: number; remarks?: string }>): { basicRateTotal: number; finalAmtTotal: number; remarksJoined: string } {
  const basicRateTotal = roundCurrency(charges.reduce((sum, c) => sum + (c.basicRate || 0), 0))
  const finalAmtTotal = roundCurrency(charges.reduce((sum, c) => sum + (c.finalAmt || 0), 0))
  const remarksJoined = charges.map(c => c.remarks).filter(Boolean).join(', ')
  return { basicRateTotal, finalAmtTotal, remarksJoined }
}

export function calculateInvoiceFinalAmount(totalAmt: number, additionalCost: number, roundOffAdjustment: number): number {
  return roundCurrency((totalAmt || 0) + (additionalCost || 0) + (roundOffAdjustment || 0))
}

export function getInvoiceAllocatedPaidAmount(allocations: Array<{ invoiceId: string; allocatedAmount: number }>, invoiceId: string): number {
  return roundCurrency(allocations.filter(a => a.invoiceId === invoiceId).reduce((sum, a) => sum + a.allocatedAmount, 0))
}

export function calculateRoundOffAdjustment(
  itemsTotal: number,
  additionalCostFinal: number = 0
): { roundedTotal: number; adjustment: number } {
  const currentTotal = (itemsTotal || 0) + (additionalCostFinal || 0)
  const roundedTotal = Math.round(currentTotal)
  const adjustment = roundCurrency(roundedTotal - currentTotal)
  return { roundedTotal, adjustment }
}

export function getBookingNormalizedMT(
  booking: { bookedMT?: number; unit?: string } | null | undefined,
  itemDef?: Item | null
): number {
  if (!booking || !booking.bookedMT || booking.bookedMT <= 0) return 0
  const qty = booking.bookedMT
  const unit = (booking.unit || 'MT').toUpperCase()

  if (unit === 'MT') return roundQuantity(qty, 4)
  if (unit === 'KG') return roundQuantity(qty / 1000, 4)

  if (itemDef) {
    const baseQty = toBaseQuantity(itemDef, qty, unit)
    const primaryUnit = (itemDef.unit || 'KG').toUpperCase()
    if (primaryUnit === 'KG') return roundQuantity(baseQty / 1000, 4)
    if (primaryUnit === 'MT') return roundQuantity(baseQty, 4)
    return roundQuantity(fromBaseQuantity(itemDef, baseQty, 'MT'), 4)
  }

  return roundQuantity(qty, 4)
}

export interface BookingConsumptionResult {
  consumedInBookingUnit: number
  consumedMT: number
  remainingInBookingUnit: number
  remainingMT: number
  status: 'Active' | 'Consumed'
}

export function calculateBookingConsumption(
  booking: { id: string; supplierId: string; consumeStartDate: string; bookedMT: number; unit?: string },
  invoices: PurchaseInvoice[],
  itemMap?: Map<string, Item> | Item[]
): BookingConsumptionResult {
  const bookingUnit = booking.unit || 'MT'
  const rawBookedQty = booking.bookedMT || 0
  const totalBookedMT = getBookingNormalizedMT({ bookedMT: rawBookedQty, unit: bookingUnit })

  const eligibleInvoices = invoices
    .filter(inv => {
      const invDate = new Date(inv.invoiceDate)
      const consumeStart = new Date(booking.consumeStartDate)
      return inv.supplierId === booking.supplierId && invDate >= consumeStart
    })
    .sort((a, b) => {
      const dateA = new Date(a.invoiceDate).getTime()
      const dateB = new Date(b.invoiceDate).getTime()
      return dateA - dateB
    })

  let totalConsumedMT = 0
  let totalConsumedInBookingUnit = 0

  for (const inv of eligibleInvoices) {
    const remainingInBookingMT = roundQuantity(Math.max(0, totalBookedMT - totalConsumedMT), 4)
    if (remainingInBookingMT <= 0) break

    // Strictly filter invoice line items by unit compatibility to prevent phantom consumption
    const eligibleQtyInBookingUnit = getInvoiceQtyForUnit(inv, bookingUnit, itemMap)
    if (eligibleQtyInBookingUnit <= 0) continue

    const eligibleInvoiceMT = getBookingNormalizedMT({ bookedMT: eligibleQtyInBookingUnit, unit: bookingUnit })
    const mtFromThisInvoice = roundQuantity(Math.min(eligibleInvoiceMT, remainingInBookingMT), 4)
    if (mtFromThisInvoice <= 0) continue

    totalConsumedMT = roundQuantity(totalConsumedMT + mtFromThisInvoice, 4)

    const ratioConsumed = eligibleInvoiceMT > 0 ? mtFromThisInvoice / eligibleInvoiceMT : 1
    totalConsumedInBookingUnit = roundQuantity(totalConsumedInBookingUnit + (eligibleQtyInBookingUnit * ratioConsumed), 4)
  }

  const remainingMT = roundQuantity(Math.max(0, totalBookedMT - totalConsumedMT), 4)
  const remainingInBookingUnit = roundQuantity(Math.max(0, rawBookedQty - totalConsumedInBookingUnit), 4)
  const status = remainingMT > 0 ? 'Active' : 'Consumed'

  return {
    consumedInBookingUnit: totalConsumedInBookingUnit,
    consumedMT: totalConsumedMT,
    remainingInBookingUnit,
    remainingMT,
    status
  }
}

export function calculateBookingConsumedMT(
  bookingId: string,
  supplierId: string,
  consumeStartDate: string,
  bookedMT: number,
  invoices: PurchaseInvoice[],
  unit?: string,
  itemMap?: Map<string, Item> | Item[]
): number {
  const result = calculateBookingConsumption(
    { id: bookingId, supplierId, consumeStartDate, bookedMT, unit },
    invoices,
    itemMap
  )
  return result.consumedMT
}

export interface ItemCostBreakdown {
  itemId: string
  itemName: string
  activeUnit: string
  activeQuantity: number
  displayQtyUnit: string
  pricePerUnit: number
  fixedDiscPerUnit: number
  paymentCDPerUnit: number
  invoiceCloseCDPerUnit: number
  totalCDPerUnit: number
  expensePerUnit: number
  additionalCostPerUnit: number
  costPerUnit: number
}

export interface DiscountBreakdown {
  paymentCDPerMT: number
  invoiceCloseCDPerMT: number
  fixedSchemePerMT: number
  totalCDPerMT: number
}

export interface DetailedPurchaseInvoiceBreakdown {
  paidAmount: number
  pendingAmount: number
  status: 'Closed' | 'Partially Paid' | 'Open'
  paymentCDTotal: number
  closeCDTotal: number
  fixedSchemeTotal: number
  fixedSchemeDiscounts: ExpectedDiscount[]
  totalCDEarned: number
  linkedExpenses: ExpenseEntry[]
  totalLinkedExpense: number
  totalAdditionalCost: number
  totalInvoiceWeightKG: number
  itemCostBreakdowns: ItemCostBreakdown[]
  discountBreakdown: DiscountBreakdown
  netInvoiceAmount: number
}

export function calculateDetailedPurchaseInvoiceBreakdown(
  invoice: PurchaseInvoice,
  paymentAllocations: PaymentAllocation[],
  expectedDiscounts: ExpectedDiscount[],
  expenseEntries: ExpenseEntry[],
  supplier?: Supplier,
  itemMap: Map<string, Item> = new Map(),
  includeAnnualDiscount: boolean = false
): DetailedPurchaseInvoiceBreakdown {
  const invAllocations = paymentAllocations.filter(a => a.invoiceId === invoice.id)
  const paidAmount = invAllocations.reduce((sum, a) => sum + a.allocatedAmount, 0)
  const pendingAmount = Math.max(0, invoice.invoiceAmount - paidAmount)
  const status = pendingAmount === 0 ? 'Closed' : paidAmount > 0 ? 'Partially Paid' : 'Open'

  const invoiceDiscounts = expectedDiscounts.filter(ed => ed.invoiceId === invoice.id)
  const paymentCDTotal = invoiceDiscounts
    .filter(ed => ed.type === 'paymentCD' || ed.type === 'advanceCD')
    .reduce((sum, ed) => sum + ed.expectedAmount, 0)
  const closeCDTotal = invoiceDiscounts
    .filter(ed => ed.type === 'invoiceCloseCD')
    .reduce((sum, ed) => sum + ed.expectedAmount, 0)
  const fixedSchemeTotal = invoiceDiscounts
    .filter(ed => ed.type === 'fixedScheme')
    .reduce((sum, ed) => sum + ed.expectedAmount, 0)
  const fixedSchemeDiscounts = invoiceDiscounts.filter(ed => ed.type === 'fixedScheme')

  const totalCDEarned = paymentCDTotal + closeCDTotal + fixedSchemeTotal

  const linkedExpenses = expenseEntries.filter(exp => exp.linkedInvoiceId === invoice.id)
  const totalLinkedExpense = linkedExpenses.reduce((sum, exp) => sum + exp.amount, 0)
  const totalAdditionalCost = invoice.additionalCost || 0

  const totalInvoiceWeightKG = (invoice.items || []).reduce((sum, item) => {
    const itemData = itemMap.get(item.itemId)
    const baseQty = item.baseQuantity ?? toBaseQuantity(itemData, item.enteredQuantity || 0, item.enteredUnit)
    const factor = itemData?.unit === 'MT' ? 1000 : 1
    return sum + (baseQty * factor)
  }, 0)

  const cdPerMT = invoice.quantityMT > 0 ? totalCDEarned / invoice.quantityMT : 0
  const discountBreakdown: DiscountBreakdown = {
    paymentCDPerMT: invoice.quantityMT > 0 ? paymentCDTotal / invoice.quantityMT : 0,
    invoiceCloseCDPerMT: invoice.quantityMT > 0 ? closeCDTotal / invoice.quantityMT : 0,
    fixedSchemePerMT: invoice.quantityMT > 0 ? fixedSchemeTotal / invoice.quantityMT : 0,
    totalCDPerMT: cdPerMT
  }

  const annualDiscountPerMT = supplier?.annualTarget?.ratePerMT || 0

  const itemCostBreakdowns: ItemCostBreakdown[] = (invoice.items || []).map(item => {
    const itemData = itemMap.get(item.itemId)
    const enteredQty = item.enteredQuantity || 0
    const enteredUnit = item.enteredUnit || itemData?.unit || 'KG'
    const active = getItemActiveUnitAndQty(itemData, enteredUnit, enteredQty, item.weightKG, item.baseQuantity)

    const activeUnit = active.unit
    const activeQuantity = active.qty
    const displayQtyUnit = active.displayQtyUnit

    const baseQty = item.baseQuantity ?? toBaseQuantity(itemData, enteredQty, enteredUnit) ?? activeQuantity ?? 1
    const totalItemAmount = item.amount || ((item.rate || 0) * (enteredQty || 1))
    const pricePerUnit = activeQuantity > 0 ? totalItemAmount / activeQuantity : (item.rate || 0)

    const itemWeightKG = baseQty * (itemData?.unit === 'MT' ? 1000 : 1)
    const weightShare = totalInvoiceWeightKG > 0 ? itemWeightKG / totalInvoiceWeightKG : (1 / (invoice.items?.length || 1))

    const itemFixedDiscTotal = fixedSchemeTotal * weightShare
    const itemPaymentCDTotal = paymentCDTotal * weightShare
    const itemCloseCDTotal = closeCDTotal * weightShare
    const itemTotalCDTotal = totalCDEarned * weightShare

    const itemExpenseTotal = totalLinkedExpense * weightShare
    const itemAddCostTotal = totalAdditionalCost * weightShare

    const fixedDiscPerUnit = activeQuantity > 0 ? itemFixedDiscTotal / activeQuantity : 0
    const paymentCDPerUnit = activeQuantity > 0 ? itemPaymentCDTotal / activeQuantity : 0
    const invoiceCloseCDPerUnit = activeQuantity > 0 ? itemCloseCDTotal / activeQuantity : 0
    const totalCDPerUnit = activeQuantity > 0 ? itemTotalCDTotal / activeQuantity : 0

    const expensePerUnit = activeQuantity > 0 ? itemExpenseTotal / activeQuantity : 0
    const additionalCostPerUnit = activeQuantity > 0 ? itemAddCostTotal / activeQuantity : 0

    const annualDiscTerm = includeAnnualDiscount ? annualDiscountPerMT * (itemWeightKG / 1000 / (activeQuantity || 1)) : 0
    const costPerUnit = pricePerUnit - totalCDPerUnit - annualDiscTerm + expensePerUnit + additionalCostPerUnit

    return {
      itemId: item.itemId,
      itemName: itemData?.name || 'Unknown Item',
      activeUnit,
      activeQuantity,
      displayQtyUnit,
      pricePerUnit,
      fixedDiscPerUnit,
      paymentCDPerUnit,
      invoiceCloseCDPerUnit,
      totalCDPerUnit,
      expensePerUnit,
      additionalCostPerUnit,
      costPerUnit
    }
  })

  const netInvoiceAmount = invoice.invoiceAmount - totalLinkedExpense

  return {
    paidAmount,
    pendingAmount,
    status,
    paymentCDTotal,
    closeCDTotal,
    fixedSchemeTotal,
    fixedSchemeDiscounts,
    totalCDEarned,
    linkedExpenses,
    totalLinkedExpense,
    totalAdditionalCost,
    totalInvoiceWeightKG,
    itemCostBreakdowns,
    discountBreakdown,
    netInvoiceAmount
  }
}

export interface RawLedgerTransaction {
  date: string
  description: string
  invoiceNo?: string
  debit: number
  credit: number
  type: 'invoice' | 'payment'
  refId: string
  timestamp: number
  isBeforePeriod: boolean
}

export interface CalculateLedgerOptions {
  initialMasterOpening: number
  partyType: 'customer' | 'supplier'
  startISO?: string
  transactions: RawLedgerTransaction[]
}

export function calculateLedger({
  initialMasterOpening,
  partyType,
  startISO,
  transactions
}: CalculateLedgerOptions): {
  openingBalanceOnFromDate: number
  ledgerEntries: LedgerEntry[]
  summary: {
    openingBalance: number
    totalDebit: number
    totalCredit: number
    closingBalance: number
  }
} {
  let priorDebits = 0
  let priorCredits = 0
  const inPeriodEntries: Array<LedgerEntry & { timestamp: number }> = []

  transactions.forEach(tx => {
    if (tx.isBeforePeriod) {
      priorDebits += tx.debit
      priorCredits += tx.credit
    } else {
      inPeriodEntries.push({
        date: tx.date,
        description: tx.description,
        invoiceNo: tx.invoiceNo,
        debit: tx.debit,
        credit: tx.credit,
        balance: 0,
        type: tx.type,
        refId: tx.refId,
        timestamp: tx.timestamp
      })
    }
  })

  inPeriodEntries.sort((a, b) => {
    const dateA = new Date(a.date).toISOString().split('T')[0]
    const dateB = new Date(b.date).toISOString().split('T')[0]
    if (dateA !== dateB) return new Date(a.date).getTime() - new Date(b.date).getTime()
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp
    return (a.refId || '').localeCompare(b.refId || '')
  })

  const isCustomer = partyType === 'customer'
  const openingBal = isCustomer
    ? initialMasterOpening + priorDebits - priorCredits
    : initialMasterOpening + priorCredits - priorDebits

  const finalEntries: LedgerEntry[] = []

  finalEntries.push({
    date: startISO || 'Opening',
    description: `Opening Balance (as of ${startISO || 'Start'})`,
    debit: isCustomer ? (openingBal > 0 ? openingBal : 0) : (openingBal < 0 ? Math.abs(openingBal) : 0),
    credit: isCustomer ? (openingBal < 0 ? Math.abs(openingBal) : 0) : (openingBal > 0 ? openingBal : 0),
    balance: openingBal,
    type: 'invoice',
    refId: 'opening-balance'
  })

  let runningBalance = openingBal
  let periodDebitTotal = 0
  let periodCreditTotal = 0

  inPeriodEntries.forEach(entry => {
    periodDebitTotal += entry.debit
    periodCreditTotal += entry.credit
    runningBalance += isCustomer ? (entry.debit - entry.credit) : (entry.credit - entry.debit)
    entry.balance = runningBalance
    const { timestamp, ...cleanEntry } = entry
    finalEntries.push(cleanEntry)
  })

  return {
    openingBalanceOnFromDate: openingBal,
    ledgerEntries: finalEntries,
    summary: {
      openingBalance: openingBal,
      totalDebit: periodDebitTotal,
      totalCredit: periodCreditTotal,
      closingBalance: runningBalance
    }
  }
}

export interface ExpenseTotals {
  totalExpenses: number
  invoiceLinkedExpenses: number
  netProfitExpenses: number
}

export function calculateExpenseTotals(expenses: ExpenseEntry[], expenseTypes: ExpenseType[] = []): ExpenseTotals {
  let totalExpenses = 0
  let invoiceLinkedExpenses = 0
  let netProfitExpenses = 0

  const typeMap = new Map<string, ExpenseType>()
  expenseTypes.forEach(t => typeMap.set(t.id, t))

  expenses.forEach(e => {
    const amt = e.amount || 0
    totalExpenses += amt

    const type = typeMap.get(e.expenseTypeId)
    const isInvoiceLinked = type?.linkType === 'invoice' || Boolean(e.linkedInvoiceId)
    const isNetProfit = type?.linkType === 'netprofit' && !e.linkedInvoiceId

    if (isInvoiceLinked) {
      invoiceLinkedExpenses += amt
    } else if (isNetProfit) {
      netProfitExpenses += amt
    }
  })

  return { totalExpenses, invoiceLinkedExpenses, netProfitExpenses }
}

export function applyCounterBalanceDelta(
  counters: any[],
  counterId: string,
  deltaAmount: number
): any[] {
  if (!counterId || deltaAmount === 0) return counters
  return counters.map((c) =>
    c.id === counterId
      ? { ...c, currentBalance: (c.currentBalance || 0) + deltaAmount }
      : c
  )
}

