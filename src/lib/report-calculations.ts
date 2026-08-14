/*
 * REPORT CALCULATIONS MODULE
 * ==========================
 * 
 * Strict Base Unit Normalization Architecture
 * All inventory calculations use Primary (Base) Units as single source of truth.
 */

import {
  PurchaseInvoice,
  SalesInvoice,
  Payment,
  ExpenseEntry,
  Supplier,
  Customer,
  Item,
  PaymentAllocation,
  PurchaseReturn,
  SalesReturn
} from './types'
import { PeriodFilterState, isRecordInPeriod, isRecordBeforePeriod } from '@/components/period-date-filter'
import {
  toBaseQuantity,
  toBaseRate,
  fromBaseQuantity,
  fromBaseRate,
  getItemConversionFactor,
  normalizeLineItem,
  getInvoiceQtyForUnit as getNormalizedInvoiceQtyForUnit
} from './unit-conversion-service'
import { isBankType } from './cash-bank-types'

export interface InventoryData {
  itemId: string
  itemName: string
  category?: string
  unit: string
  alternativeUnit?: string
  conversionFactor?: number
  openingStockMT: number
  openingStockValue: number
  totalPurchaseMT: number
  totalPurchaseAmount: number
  totalSalesMT: number
  totalSalesAmount: number
  balanceMT: number
  avgPurchaseRate: number
  avgSalesRate: number
  currentStockValue: number
  secondaryUnit?: string
  secondaryOpeningStock?: number
  secondaryTotalPurchase?: number
  secondaryTotalSales?: number
  secondaryBalance?: number
  primaryUnit?: string
  preferAltPurchase?: boolean
  preferAltSale?: boolean
}

export interface InvoiceCloseCDUnitBreakdown {
  unit: string
  quantity: number
  currentRate: number
  nextRate: number
  currentAmount: number
  nextAmount: number
  riskAmount: number
  nextSlabDays?: number
  nextMinDays?: number
}

export interface CDAtRisk {
  invoiceId: string
  invoiceNo: string
  invoiceDate: string
  supplierId: string
  supplierName: string
  totalQuantity: number
  invoiceAmount: number
  paidAmount: number
  pendingAmount: number
  daysSinceInvoice: number
  currentSlabPaymentCDRate: number
  currentSlabInvoiceCloseCDRate: number
  nextSlabPaymentCDRate: number
  nextSlabInvoiceCloseCDRate: number
  paymentCDRisk: number
  invoiceCloseCDRisk: number
  totalCDAtRisk: number
  nextSlabDays: number
  daysUntilNextSlab: number
  paymentCDNextSlabDays?: number
  paymentCDNextSlabMinDays?: number
  invoiceCloseCDNextSlabDays?: number
  invoiceCloseCDNextSlabMinDays?: number
  totalPaymentCDAtCurrentSlab: number
  invoiceCloseCDBreakdown?: InvoiceCloseCDUnitBreakdown[]
}

/**
 * Normalizes an invoice item into Base Quantity and Alternate Quantity.
 */
export function getItemNormalizedQty(
  invItem: { enteredQuantity?: number; enteredUnit?: string },
  item: Item,
  conversionFactor?: number
): { primaryQty: number; altQty: number; usedUnit: string } {
  const primaryUnit = item.unit || 'KG'
  const entryUnit = invItem.enteredUnit || primaryUnit
  const rawQty = invItem.enteredQuantity || 0

  const baseQty = toBaseQuantity(item, rawQty, entryUnit)
  const altUnit = item.alternativeUnit && item.alternativeUnit !== 'NONE' ? item.alternativeUnit : undefined
  const altQty = altUnit ? fromBaseQuantity(item, baseQty, altUnit) : baseQty

  return { primaryQty: baseQty, altQty, usedUnit: entryUnit }
}


export function calculateInventoryReport(
  items: Item[],
  purchaseInvoices: PurchaseInvoice[],
  salesInvoices: SalesInvoice[],
  purchaseReturns: PurchaseReturn[] = [],
  salesReturns: SalesReturn[] = [],
  periodFilter?: PeriodFilterState,
  currentFY?: string
): InventoryData[] {
  const inventory: InventoryData[] = []

  items.forEach(item => {
    const primaryUnit = item.unit || 'KG'
    const altUnit = item.alternativeUnit && item.alternativeUnit !== 'NONE' ? item.alternativeUnit : undefined
    const factor = getItemConversionFactor(item, altUnit)

    const masterOpeningBase = toBaseQuantity(item, item.openingStock || 0, primaryUnit)
    const masterOpeningValue = (item.openingValue !== undefined && item.openingValue !== null && item.openingValue > 0)
      ? item.openingValue
      : (masterOpeningBase * toBaseRate(item, item.purchasePrice || 0, primaryUnit))
    const masterOpeningAlt = altUnit ? fromBaseQuantity(item, masterOpeningBase, altUnit) : masterOpeningBase

    let priorPurchaseBase = 0
    let priorPurchaseAlt = 0
    let priorPurchaseAmount = 0

    let priorSalesBase = 0
    let priorSalesAlt = 0
    let priorSalesAmount = 0

    let totalPurchaseBase = 0
    let totalPurchaseAlt = 0
    let totalPurchaseAmount = 0

    let totalSalesBase = 0
    let totalSalesAlt = 0
    let totalSalesAmount = 0

    let purchaseAltUnitCount = 0
    let purchasePrimaryUnitCount = 0

    let saleAltUnitCount = 0
    let salePrimaryUnitCount = 0

    purchaseInvoices.forEach(invoice => {
      if (invoice.items && Array.isArray(invoice.items)) {
        invoice.items.forEach(invItem => {
          if (invItem.itemId === item.id) {
            const { primaryQty, altQty, usedUnit } = getItemNormalizedQty(invItem, item, factor)
            
            if (isRecordBeforePeriod(invoice.invoiceDate, periodFilter, currentFY)) {
              priorPurchaseBase += primaryQty
              priorPurchaseAlt += altQty
              priorPurchaseAmount += invItem.amount || 0
            } else if (isRecordInPeriod(invoice.invoiceDate, invoice.fy, periodFilter, currentFY)) {
              totalPurchaseBase += primaryQty
              totalPurchaseAlt += altQty
              totalPurchaseAmount += invItem.amount || 0

              if (altUnit && usedUnit.toUpperCase() === altUnit.toUpperCase()) purchaseAltUnitCount++
              else purchasePrimaryUnitCount++
            }
          }
        })
      }
    })

    purchaseReturns.forEach(ret => {
      if (ret.items && Array.isArray(ret.items)) {
        ret.items.forEach(invItem => {
          if (invItem.itemId === item.id) {
            const { primaryQty, altQty } = getItemNormalizedQty(invItem, item, factor)
            if (isRecordBeforePeriod(ret.returnDate, periodFilter, currentFY)) {
              priorPurchaseBase -= primaryQty
              priorPurchaseAlt -= altQty
              priorPurchaseAmount -= invItem.amount || 0
            } else if (isRecordInPeriod(ret.returnDate, ret.fy, periodFilter, currentFY)) {
              totalPurchaseBase -= primaryQty
              totalPurchaseAlt -= altQty
              totalPurchaseAmount -= invItem.amount || 0
            }
          }
        })
      }
    })

    salesInvoices.forEach(invoice => {
      if (invoice.items && Array.isArray(invoice.items)) {
        invoice.items.forEach(invItem => {
          if (invItem.itemId === item.id) {
            const { primaryQty, altQty, usedUnit } = getItemNormalizedQty(invItem, item, factor)
            if (isRecordBeforePeriod(invoice.invoiceDate, periodFilter, currentFY)) {
              priorSalesBase += primaryQty
              priorSalesAlt += altQty
              priorSalesAmount += invItem.amount || 0
            } else if (isRecordInPeriod(invoice.invoiceDate, invoice.fy, periodFilter, currentFY)) {
              totalSalesBase += primaryQty
              totalSalesAlt += altQty
              totalSalesAmount += invItem.amount || 0

              if (altUnit && usedUnit.toUpperCase() === altUnit.toUpperCase()) saleAltUnitCount++
              else salePrimaryUnitCount++
            }
          }
        })
      }
    })

    salesReturns.forEach(ret => {
      if (ret.items && Array.isArray(ret.items)) {
        ret.items.forEach(invItem => {
          if (invItem.itemId === item.id) {
            const { primaryQty, altQty } = getItemNormalizedQty(invItem, item, factor)
            if (isRecordBeforePeriod(ret.returnDate, periodFilter, currentFY)) {
              priorSalesBase -= primaryQty
              priorSalesAlt -= altQty
              priorSalesAmount -= invItem.amount || 0
            } else if (isRecordInPeriod(ret.returnDate, ret.fy, periodFilter, currentFY)) {
              totalSalesBase -= primaryQty
              totalSalesAlt -= altQty
              totalSalesAmount -= invItem.amount || 0
            }
          }
        })
      }
    })

    // ─────────────────────────────────────────────────────────────────────────
    // OPENING STOCK VALUATION (as of period start date)
    // ─────────────────────────────────────────────────────────────────────────
    // openingBase = master opening + all prior purchases - all prior sales
    const openingBase = masterOpeningBase + priorPurchaseBase - priorSalesBase
    const openingAlt  = masterOpeningAlt  + priorPurchaseAlt  - priorSalesAlt

    // Compute the weighted-average cost rate accumulated up to the period start.
    // This ensures the opening stock is always valued at the true historical WACM
    // rate rather than a flat purchase-price estimate.
    const priorTotalBase   = masterOpeningBase + priorPurchaseBase          // total qty acquired before period
    const priorTotalAmount = masterOpeningValue + priorPurchaseAmount        // total cost before period
    const openingWACRate   = priorTotalBase > 0 ? priorTotalAmount / priorTotalBase : 0

    // Opening stock value = physical opening qty × historical WACM rate.
    // We clamp to 0 so we never show a negative opening value.
    const openingStockVal = Math.max(0, openingBase * openingWACRate)

    // ─────────────────────────────────────────────────────────────────────────
    // PERIOD-LEVEL QUANTITIES
    // ─────────────────────────────────────────────────────────────────────────
    const balanceBase = (openingBase + totalPurchaseBase) - totalSalesBase
    const balanceAlt  = (openingAlt  + totalPurchaseAlt)  - totalSalesAlt

    const preferAltPurchase = Boolean(altUnit && purchaseAltUnitCount > 0 && purchaseAltUnitCount >= purchasePrimaryUnitCount)
    const preferAltSale     = Boolean(altUnit && saleAltUnitCount     > 0 && saleAltUnitCount     >= salePrimaryUnitCount)

    const mainUnit = primaryUnit
    const secUnit  = altUnit

    const openingStockMT   = openingBase
    const totalPurchaseMT  = totalPurchaseBase
    const totalSalesMT     = totalSalesBase
    const balanceMT        = balanceBase

    const secOpeningStock  = openingAlt
    const secTotalPurchase = totalPurchaseAlt
    const secTotalSales    = totalSalesAlt
    const secBalance       = balanceAlt

    // ─────────────────────────────────────────────────────────────────────────
    // WEIGHTED AVERAGE COST METHOD (WACM)
    // ─────────────────────────────────────────────────────────────────────────
    // Total stock available during the period = opening + period purchases.
    // Total cost of that stock = opening stock value (at WACM) + period purchase cost.
    //
    // CRITICAL: We use openingStockVal (period-adjusted, WACM-valued) — NOT
    // masterOpeningValue — so that the rate is always correct regardless of which
    // date range is selected (including periods with zero purchases).
    const totalAvailableBase   = openingBase + totalPurchaseBase
    const totalAvailableAmount = openingStockVal + totalPurchaseAmount

    // avgPurchaseRate = total available cost / total available qty.
    // When purchases for the period = 0, this naturally carries forward the
    // historical WACM rate via the opening stock value, preventing rate collapse.
    const avgPurchaseRateBase = totalAvailableBase > 0 ? totalAvailableAmount / totalAvailableBase : openingWACRate

    const avgSalesRateBase = totalSalesBase > 0 ? totalSalesAmount / totalSalesBase : 0

    // ─────────────────────────────────────────────────────────────────────────
    // CLOSING STOCK VALUATION (Weighted Average Cost Method — standardised)
    // ─────────────────────────────────────────────────────────────────────────
    // Using WACM for closing stock ensures consistency:
    //   closing stock value = balance qty × period WACM rate
    //
    // We deliberately avoid the FIFO batch approach that was previously used,
    // because that approach omitted prior-period purchase batches (it only held
    // master opening + current-period batches), leading to incorrect FIFO
    // results and causing the avgPurchaseRate and currentStockValue to diverge.
    let currentStockValue = 0
    if (balanceBase > 0) {
      currentStockValue = balanceBase * avgPurchaseRateBase
    }

    inventory.push({
      itemId: item.id,
      itemName: item.name,
      category: item.category || 'Uncategorized',
      unit: mainUnit,
      alternativeUnit: secUnit,
      conversionFactor: factor,
      openingStockMT,
      openingStockValue: Math.max(0, openingStockVal),
      totalPurchaseMT,
      totalPurchaseAmount,
      totalSalesMT,
      totalSalesAmount,
      balanceMT,
      avgPurchaseRate: isNaN(avgPurchaseRateBase) || !isFinite(avgPurchaseRateBase) ? 0 : avgPurchaseRateBase,
      avgSalesRate: avgSalesRateBase,
      currentStockValue: isNaN(currentStockValue) || !isFinite(currentStockValue) ? 0 : Math.max(0, currentStockValue),
      secondaryUnit: secUnit,
      secondaryOpeningStock: secOpeningStock,
      secondaryTotalPurchase: secTotalPurchase,
      secondaryTotalSales: secTotalSales,
      secondaryBalance: secBalance,
      primaryUnit,
      preferAltPurchase,
      preferAltSale
    })
  })

  return inventory
}

export function calculateItemStockMap(
  items: Item[],
  purchaseInvoices: PurchaseInvoice[],
  salesInvoices: SalesInvoice[],
  purchaseReturns: PurchaseReturn[] = [],
  salesReturns: SalesReturn[] = []
): Map<string, { currentStock: number; unit: string }> {
  const stockMap = new Map<string, { currentStock: number; unit: string }>()
  const inventory = calculateInventoryReport(items, purchaseInvoices, salesInvoices, purchaseReturns, salesReturns)

  inventory.forEach(inv => {
    stockMap.set(inv.itemId, {
      currentStock: inv.balanceMT,
      unit: inv.unit
    })
  })

  return stockMap
}

export function calculateCDAtRisk(
  purchaseInvoices: PurchaseInvoice[],
  payments: Payment[],
  paymentAllocations: PaymentAllocation[],
  suppliers: Supplier[],
  items: Item[] = []
): CDAtRisk[] {
  const cdAtRisk: CDAtRisk[] = []
  const supplierMap = new Map(suppliers.map(s => [s.id, s]))
  const itemMap = new Map(items.map(i => [i.id, i]))
  const today = new Date()

  purchaseInvoices.forEach(invoice => {
    const supplier = supplierMap.get(invoice.supplierId)
    if (!supplier) return

    const allocatedAmount = paymentAllocations
      .filter(a => a.invoiceId === invoice.id)
      .reduce((sum, a) => sum + a.allocatedAmount, 0)

    const pendingAmount = invoice.invoiceAmount - allocatedAmount

    const getInvoiceQtyForUnit = (inv: PurchaseInvoice, targetUnit: string): number => {
      return getNormalizedInvoiceQtyForUnit(inv, targetUnit, itemMap)
    }

    if (pendingAmount > 0) {
      const invoiceDate = new Date(invoice.invoiceDate)
      const daysSinceInvoice = Math.floor(
        (today.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24)
      )

      const currentPaymentCDRule = supplier.paymentCDRules?.find(
        rule => daysSinceInvoice >= rule.minDays && daysSinceInvoice <= rule.maxDays
      )
      const currentInvoiceCloseCDRules = supplier.invoiceCloseCDRules?.filter(
        rule => daysSinceInvoice >= rule.minDays && daysSinceInvoice <= rule.maxDays
      ) || []

      const currentSlabPaymentCDRate = currentPaymentCDRule?.percentageRate || 0
      const currentSlabInvoiceCloseCDRate = currentInvoiceCloseCDRules.length > 0 ? currentInvoiceCloseCDRules[0].ratePerMT : 0

      const nextPaymentCDSlab = supplier.paymentCDRules
        ?.filter(rule => rule.minDays > daysSinceInvoice)
        .sort((a, b) => a.minDays - b.minDays)[0]

      const nextInvoiceCloseCDRules = supplier.invoiceCloseCDRules
        ?.filter(rule => rule.minDays > daysSinceInvoice)
      const minNextDays = nextInvoiceCloseCDRules && nextInvoiceCloseCDRules.length > 0 
        ? Math.min(...nextInvoiceCloseCDRules.map(r => r.minDays))
        : 0
      const nextInvoiceCloseCDSlabRules = nextInvoiceCloseCDRules?.filter(r => r.minDays === minNextDays) || []
      const nextInvoiceCloseCDSlab = nextInvoiceCloseCDSlabRules[0]

      const paymentCDNextSlabDays = nextPaymentCDSlab ? nextPaymentCDSlab.minDays - daysSinceInvoice : 0
      const paymentCDNextSlabMinDays = nextPaymentCDSlab ? nextPaymentCDSlab.minDays : 0

      const invoiceCloseCDNextSlabDays = nextInvoiceCloseCDSlab ? nextInvoiceCloseCDSlab.minDays - daysSinceInvoice : 0
      const invoiceCloseCDNextSlabMinDays = nextInvoiceCloseCDSlab ? nextInvoiceCloseCDSlab.minDays : 0

      const nextSlabPaymentCDRate = nextPaymentCDSlab?.percentageRate || 0
      const nextSlabInvoiceCloseCDRate = nextInvoiceCloseCDSlab?.ratePerMT || 0

      const nextSlabDays = nextPaymentCDSlab?.minDays || nextInvoiceCloseCDSlab?.minDays || 0
      const daysUntilNextSlab = nextSlabDays > 0 ? nextSlabDays - daysSinceInvoice : 0

      const totalPaymentCDAtCurrentSlab = (pendingAmount * currentSlabPaymentCDRate) / 100
      
      const currentPaymentCD = (pendingAmount * currentSlabPaymentCDRate) / 100
      const nextPaymentCD = (pendingAmount * nextSlabPaymentCDRate) / 100
      const paymentCDRisk = currentPaymentCD - nextPaymentCD

      let currentInvoiceCloseCD = 0
      let nextInvoiceCloseCD = 0
      const invoiceCloseCDBreakdown: InvoiceCloseCDUnitBreakdown[] = []

      const allTargetUnits = (invoice.items && Array.isArray(invoice.items) && invoice.items.length > 0)
        ? Array.from(new Set(invoice.items.map(i => i.enteredUnit || (i as any).entryUnit || 'KG')))
        : ['KG']

      allTargetUnits.forEach(targetUnit => {
        const qty = getInvoiceQtyForUnit(invoice, targetUnit)
        if (qty > 0) {
          const matchingCurrentRule = currentInvoiceCloseCDRules.find(r => !r.unit || r.unit === 'ALL' || r.unit === '' || r.unit === targetUnit)
          const currentRate = matchingCurrentRule ? matchingCurrentRule.ratePerMT : 0

          const matchingNextRule = nextInvoiceCloseCDSlabRules.find(r => !r.unit || r.unit === 'ALL' || r.unit === '' || r.unit === targetUnit)
          const nextRate = matchingNextRule ? matchingNextRule.ratePerMT : 0

          const unitNextSlabDays = matchingNextRule ? matchingNextRule.minDays - daysSinceInvoice : 0
          const unitNextMinDays = matchingNextRule ? matchingNextRule.minDays : 0

          const currentAmt = qty * currentRate
          const nextAmt = qty * nextRate
          const riskAmt = currentAmt - nextAmt

          currentInvoiceCloseCD += currentAmt
          nextInvoiceCloseCD += nextAmt

          invoiceCloseCDBreakdown.push({
            unit: targetUnit,
            quantity: qty,
            currentRate,
            nextRate,
            currentAmount: currentAmt,
            nextAmount: nextAmt,
            riskAmount: riskAmt,
            nextSlabDays: unitNextSlabDays,
            nextMinDays: unitNextMinDays
          })
        }
      })

      const invoiceCloseCDRisk = currentInvoiceCloseCD - nextInvoiceCloseCD
      const totalCDAtRisk = paymentCDRisk + invoiceCloseCDRisk

      cdAtRisk.push({
        invoiceId: invoice.id,
        invoiceNo: invoice.invoiceNo,
        invoiceDate: invoice.invoiceDate,
        supplierId: supplier.id,
        supplierName: supplier.name,
        totalQuantity: getInvoiceQtyForUnit(invoice, 'MT'),
        invoiceAmount: invoice.invoiceAmount,
        paidAmount: allocatedAmount,
        pendingAmount,
        daysSinceInvoice,
        currentSlabPaymentCDRate,
        currentSlabInvoiceCloseCDRate,
        nextSlabPaymentCDRate,
        nextSlabInvoiceCloseCDRate,
        paymentCDRisk,
        invoiceCloseCDRisk,
        totalCDAtRisk,
        nextSlabDays,
        daysUntilNextSlab,
        paymentCDNextSlabDays,
        paymentCDNextSlabMinDays,
        invoiceCloseCDNextSlabDays,
        invoiceCloseCDNextSlabMinDays,
        totalPaymentCDAtCurrentSlab,
        invoiceCloseCDBreakdown
      })
    }
  })

  return cdAtRisk.sort((a, b) => {
    const dateA = new Date(a.invoiceDate)
    const dateB = new Date(b.invoiceDate)
    return dateA.getTime() - dateB.getTime()
  })
}

export interface CustomerBalanceDetails {
  totalInvoiced: number
  totalPaid: number
  netBalance: number
  receivableBalance: number
}

export interface SupplierBalanceDetails {
  totalInvoiced: number
  totalPaid: number
  netBalance: number // positive = Payable (Credit), negative = Advance (Debit)
  payableBalance: number // Math.max(0, netBalance)
}

export function getSupplierBalanceDetails(
  supplier: Supplier,
  purchaseInvoices: PurchaseInvoice[] = [],
  payments: Payment[] = [],
  debitNotes: any[] = [],
  supplierCreditNotes: any[] = [],
  purchaseReturns: any[] = []
): SupplierBalanceDetails {
  const supInvoices = (purchaseInvoices || []).filter(inv => inv.supplierId === supplier.id)
  const supPayments = (payments || []).filter(p => p.supplierId === supplier.id)
  const supDebitNotes = (debitNotes || []).filter(dn => dn.supplierId === supplier.id)
  const supCreditNotes = (supplierCreditNotes || []).filter(cn => cn.supplierId === supplier.id)
  const supReturns = (purchaseReturns || []).filter(pr => pr.supplierId === supplier.id)

  const totalInvoiced = supInvoices.reduce((s, inv) => s + (inv.invoiceAmount || 0), 0)
  const totalPaid = supPayments.reduce((s, p) => s + (p.amount || 0), 0)
  const totalDebitNotes = supDebitNotes.reduce((s, dn) => s + (dn.amount || 0), 0)
  const totalCreditNotes = supCreditNotes.reduce((s, cn) => s + (cn.amount || 0), 0)
  const totalReturns = supReturns.reduce((s, pr) => s + (pr.amount || 0), 0)

  const rawBal = supplier.openingBalance || 0
  const signedOpening = supplier.balanceType === 'Debit' ? -rawBal : rawBal

  // Net balance = Opening (Cr +, Dr -) + Purchases (Cr +) - Payments (Dr -) - DebitNotes (Dr -) + CreditNotes (Cr +) - Returns (Dr -)
  const netBalance = signedOpening + totalInvoiced - totalPaid - totalDebitNotes + totalCreditNotes - totalReturns
  const payableBalance = netBalance > 0 ? netBalance : 0

  return { totalInvoiced, totalPaid, netBalance, payableBalance }
}

export function getCustomerBalanceDetails(
  customer: Customer,
  salesInvoices: SalesInvoice[] = [],
  customerPayments: any[] = [],
  customerDebitNotes: any[] = [],
  creditNotes: any[] = [],
  salesReturns: any[] = []
): CustomerBalanceDetails {
  const custInvoices = (salesInvoices || []).filter(inv => inv.customerId === customer.id)
  const custPayments = (customerPayments || []).filter(p => p.customerId === customer.id)
  const custDebitNotes = (customerDebitNotes || []).filter(dn => dn.customerId === customer.id)
  const custCreditNotes = (creditNotes || []).filter(cn => cn.customerId === customer.id)
  const custReturns = (salesReturns || []).filter(sr => sr.customerId === customer.id)

  const totalInvoiced = custInvoices.reduce((s, inv) => s + (inv.invoiceAmount || 0), 0)
  const totalPaid = custPayments.reduce((s, p) => s + (p.amount || 0), 0)
  const totalDebitNotes = custDebitNotes.reduce((s, dn) => s + (dn.amount || 0), 0)
  const totalCreditNotes = custCreditNotes.reduce((s, cn) => s + (cn.amount || 0), 0)
  const totalReturns = custReturns.reduce((s, sr) => s + (sr.amount || 0), 0)

  const opBal = customer.openingBalance || 0
  const signedOpening = customer.balanceType === 'Credit' ? -opBal : opBal

  // Net balance = Opening (Dr +, Cr -) + Sales (Dr +) - Payments (Cr -) + DebitNotes (Dr +) - CreditNotes (Cr -) - Returns (Cr -)
  const netBalance = signedOpening + totalInvoiced - totalPaid + totalDebitNotes - totalCreditNotes - totalReturns
  const receivableBalance = netBalance > 0 ? netBalance : 0

  return { totalInvoiced, totalPaid, netBalance, receivableBalance }
}

export function calculateTotalCustomerReceivables(
  customers: Customer[],
  salesInvoices: SalesInvoice[] = [],
  customerPayments: any[] = [],
  customerDebitNotes: any[] = [],
  creditNotes: any[] = [],
  salesReturns: any[] = []
): number {
  return customers.reduce((sum, customer) => {
    const { receivableBalance } = getCustomerBalanceDetails(customer, salesInvoices, customerPayments, customerDebitNotes, creditNotes, salesReturns)
    return sum + receivableBalance
  }, 0)
}

export function getSupplierPayableBalance(
  supplier: Supplier,
  purchaseInvoices: PurchaseInvoice[] = [],
  payments: Payment[] = [],
  debitNotes: any[] = [],
  supplierCreditNotes: any[] = [],
  purchaseReturns: any[] = []
): number {
  return getSupplierBalanceDetails(supplier, purchaseInvoices, payments, debitNotes, supplierCreditNotes, purchaseReturns).payableBalance
}

export function calculateTotalSupplierPayables(
  suppliers: Supplier[],
  purchaseInvoices: PurchaseInvoice[] = [],
  payments: Payment[] = [],
  debitNotes: any[] = [],
  supplierCreditNotes: any[] = [],
  purchaseReturns: any[] = []
): number {
  return suppliers.reduce((sum, s) => sum + getSupplierPayableBalance(s, purchaseInvoices, payments, debitNotes, supplierCreditNotes, purchaseReturns), 0)
}

export function getSupplierYTDInvoiced(
  supplierId: string,
  purchaseInvoices: PurchaseInvoice[],
  activeFY?: string
): number {
  return purchaseInvoices
    .filter(inv => inv.supplierId === supplierId && (!activeFY || inv.fy === activeFY))
    .reduce((sum, inv) => sum + (inv.invoiceAmount || 0), 0)
}

export function getSupplierPendingPayments(
  supplier: Supplier,
  purchaseInvoices: PurchaseInvoice[],
  supplierPayments: Payment[],
  activeFY?: string
): number {
  const currentSupplierInvoices = purchaseInvoices.filter(inv => inv.supplierId === supplier.id)
  const currentSupplierPayments = supplierPayments.filter(p => p.supplierId === supplier.id)
  const totalInvoicedYTD = getSupplierYTDInvoiced(supplier.id, currentSupplierInvoices, activeFY)
  const totalPaid = currentSupplierPayments.reduce((sum, p) => sum + (p.amount || 0), 0)
  const rawBal = supplier.openingBalance || 0
  const bal = supplier.balanceType === 'Debit' ? -rawBal : rawBal

  return Math.max(0, (totalInvoicedYTD + bal) - totalPaid)
}

export function calculateTotalCash(counters: any[]): number {
  return (counters || [])
    .filter((c) => c.type === 'Cash' || !c.type)
    .reduce((sum, c) => sum + (c.currentBalance || 0), 0)
}

export function calculateTotalBank(counters: any[]): number {
  return (counters || [])
    .filter((c) => isBankType(c.type))
    .reduce((sum, c) => sum + (c.currentBalance || 0), 0)
}

export function calculateTotalLiquid(counters: any[]): number {
  return calculateTotalCash(counters) + calculateTotalBank(counters)
}


