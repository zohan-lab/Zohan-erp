import {
  PurchaseInvoice,
  SalesInvoice,
  Supplier,
  Customer,
  Item,
  ExpectedDiscount,
  ExpenseEntry,
  PurchaseLayer,
  SaleAllocation,
  PaymentCDReportRow,
  PaymentCDSummaryStats,
  ItemProfitAnalysisRow
} from './types'
import {
  toBaseQuantity,
  toBaseRate,
  toBaseAmount,
  getItemConversionFactor,
  normalizeLineItem
} from './unit-conversion-service'

export type PeriodFilter = 'daily' | 'weekly' | 'monthly' | 'custom'

export interface DateFilterRange {
  startDate?: string
  endDate?: string
}

export interface ReportFilterOptions {
  supplierId?: string
  itemId?: string
  category?: string
  godown?: string
}

export interface ActiveUnitQtyResult {
  unit: string
  qty: number
  isAlt: boolean
  displayQtyUnit: string
  baseQty: number
}

/**
 * Normalizes an item line into Primary (Base) Unit Quantity and returns active display details.
 * Primary (Base) Unit is the single source of truth.
 */
export function getItemActiveUnitAndQty(
  itemDef?: Item | null,
  entryUnit?: string,
  entryQty?: number,
  quantityMT?: number,
  weightKG?: number,
  baseQuantity?: number
): ActiveUnitQtyResult {
  const primaryUnit = itemDef?.unit || 'KG'
  const unit = entryUnit || primaryUnit
  const qtyInput = (entryQty && entryQty > 0)
    ? entryQty
    : (quantityMT !== undefined && quantityMT > 0 ? quantityMT : 0)

  const baseQty = (baseQuantity && baseQuantity > 0)
    ? baseQuantity
    : toBaseQuantity(itemDef, qtyInput, unit)
  const isAlt = unit.toUpperCase() !== primaryUnit.toUpperCase()

  return {
    unit: primaryUnit,
    qty: baseQty,
    isAlt,
    displayQtyUnit: isAlt
      ? `${baseQty.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${primaryUnit} (${qtyInput.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${unit})`
      : `${baseQty.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${primaryUnit}`,
    baseQty
  }
}

/**
 * Returns weight in KG per 1 unit of targetUnit.
 */
export function getUnitWeightKG(itemDef?: Item | null, targetUnit?: string, rowWeightKG?: number, rowQty?: number): number {
  if (rowWeightKG && rowQty && rowQty > 0) {
    return rowWeightKG / rowQty
  }
  const unit = targetUnit || itemDef?.unit || 'KG'
  if (unit === 'KG') return 1
  if (unit === 'MT') return 1000

  if (itemDef?.conversionFactor && itemDef.conversionFactor > 0) {
    return itemDef.conversionFactor
  }
  return 1
}

/**
 * Builds chronological Purchase Layers from Purchase Invoices.
 * STRICT BASE UNIT ARCHITECTURE: Each purchase layer is calculated strictly in the Primary (Base) Unit.
 */
export function buildPurchaseLayers(
  invoices: PurchaseInvoice[],
  suppliers: Supplier[],
  items: Item[],
  expectedDiscounts: ExpectedDiscount[] = [],
  expenseEntries: ExpenseEntry[] = []
): PurchaseLayer[] {
  const supplierMap = new Map(suppliers.map(s => [s.id, s]))
  const itemMap = new Map(items.map(i => [i.id, i]))

  const sortedInvoices = [...invoices].sort((a, b) => {
    const dateDiff = new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime()
    if (dateDiff !== 0) return dateDiff
    return (a.invoiceNo || '').localeCompare(b.invoiceNo || '')
  })

  const layers: PurchaseLayer[] = []

  sortedInvoices.forEach(inv => {
    const supplier = supplierMap.get(inv.supplierId)
    const supplierName = supplier?.name || 'Unknown Supplier'

    const invoiceDiscounts = expectedDiscounts.filter(ed => ed.invoiceId === inv.id)
    const paymentCDTotal = invoiceDiscounts
      .filter(ed => ed.type === 'paymentCD' || ed.type === 'advanceCD')
      .reduce((sum, ed) => sum + ed.expectedAmount, 0)
    const closeCDTotal = invoiceDiscounts
      .filter(ed => ed.type === 'invoiceCloseCD')
      .reduce((sum, ed) => sum + ed.expectedAmount, 0)
    const fixedSchemeTotal = invoiceDiscounts
      .filter(ed => ed.type === 'fixedScheme')
      .reduce((sum, ed) => sum + ed.expectedAmount, 0)

    const linkedExpenses = expenseEntries
      .filter(exp => exp.linkedInvoiceId === inv.id)
      .reduce((sum, exp) => sum + exp.amount, 0)

    const additionalCost = inv.additionalCost || 0
    const totalExpenses = linkedExpenses + additionalCost

    // Calculate total base quantity across invoice items
    const totalInvoiceBaseQty = (inv.items || []).reduce((sum, itemRow) => {
      const itemDef = itemMap.get(itemRow.itemId)
      const enteredQty = itemRow.enteredQuantity || (itemRow as any).entryQuantity || (itemRow as any).quantityMT || 0
      const enteredUnit = itemRow.enteredUnit || (itemRow as any).entryUnit || itemDef?.unit || 'KG'
      return sum + toBaseQuantity(itemDef, enteredQty, enteredUnit)
    }, 0);

    (inv.items || []).forEach((itemRow, idx) => {
      if (!itemRow.itemId) return
      const itemDef = itemMap.get(itemRow.itemId)
      const primaryUnit = itemDef?.unit || 'KG'

      const enteredQty = itemRow.enteredQuantity || (itemRow as any).entryQuantity || (itemRow as any).quantityMT || 0
      const enteredUnit = itemRow.enteredUnit || (itemRow as any).entryUnit || primaryUnit
      const enteredRate = itemRow.enteredRate || itemRow.rate || 0

      const norm = normalizeLineItem(itemDef, enteredQty, enteredUnit, enteredRate)
      const baseQty = norm.baseQuantity

      if (baseQty <= 0) return

      const baseRate = norm.baseRate
      const qtyShare = totalInvoiceBaseQty > 0 ? baseQty / totalInvoiceBaseQty : 0

      const itemPaymentCDTotal = paymentCDTotal * qtyShare
      const itemCloseCDTotal = closeCDTotal * qtyShare
      const itemSchemeCDTotal = fixedSchemeTotal * qtyShare
      const itemExpenseTotal = totalExpenses * qtyShare

      const itemPaymentCDBase = itemPaymentCDTotal / baseQty
      const itemInvoiceCloseCDBase = itemCloseCDTotal / baseQty
      const itemSchemeCDBase = itemSchemeCDTotal / baseQty
      const itemExpenseBase = itemExpenseTotal / baseQty

      const totalCDBase = itemPaymentCDBase + itemInvoiceCloseCDBase + itemSchemeCDBase
      const landingCostBase = baseRate - totalCDBase + itemExpenseBase

      const unitWeightKG = getUnitWeightKG(itemDef, primaryUnit)

      layers.push({
        id: `layer-${inv.id}-${idx}`,
        purchaseInvoiceId: inv.id,
        invoiceNo: inv.invoiceNo,
        supplierId: inv.supplierId,
        supplierName,
        itemId: itemRow.itemId,
        itemName: itemDef?.name || 'Unknown Item',
        category: itemDef?.category || 'General',
        activeUnit: primaryUnit,
        baseUnit: primaryUnit,
        baseQty,
        baseLandingCost: landingCostBase,
        unitWeightKG,
        purchaseDate: inv.invoiceDate,
        qty: baseQty,
        remainingQty: baseQty,
        purchaseRate: baseRate,
        landingCost: landingCostBase,
        paymentCD: itemPaymentCDTotal,
        invoiceCloseCD: itemCloseCDTotal,
        schemeCD: itemSchemeCDTotal,
        expense: itemExpenseTotal,
        batchNo: `LOT-${inv.invoiceNo}-${idx + 1}`
      })
    })
  })

  return layers
}

/**
 * Runs FIFO consumption logic on Sales Invoices against Purchase Layers.
 * STRICT BASE UNIT ARCHITECTURE: Consumes inventory strictly in the Primary (Base) Unit.
 */
export function allocateSalesFIFO(
  salesInvoices: SalesInvoice[],
  purchaseLayers: PurchaseLayer[],
  items: Item[],
  customers: Customer[] = []
): { allocations: SaleAllocation[]; updatedLayers: PurchaseLayer[] } {
  const customerMap = new Map(customers.map(c => [c.id, c]))
  const itemMap = new Map(items.map(i => [i.id, i]))

  const layers = purchaseLayers.map(l => ({ ...l }))

  const sortedSales = [...salesInvoices].sort((a, b) => {
    const dateDiff = new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime()
    if (dateDiff !== 0) return dateDiff
    return (a.invoiceNo || '').localeCompare(b.invoiceNo || '')
  })

  const allocations: SaleAllocation[] = []

  sortedSales.forEach(saleInv => {
    const customer = customerMap.get(saleInv.customerId)
    const customerName = customer?.name || 'Walk-in Customer';

    (saleInv.items || []).forEach((saleRow, idx) => {
      if (!saleRow.itemId) return
      const itemDef = itemMap.get(saleRow.itemId)
      const primaryUnit = itemDef?.unit || 'KG'

      const enteredQty = saleRow.enteredQuantity || (saleRow as any).entryQuantity || (saleRow as any).quantityMT || 0
      const enteredUnit = saleRow.enteredUnit || (saleRow as any).entryUnit || primaryUnit
      const enteredRate = saleRow.enteredRate || saleRow.rate || 0

      const norm = normalizeLineItem(itemDef, enteredQty, enteredUnit, enteredRate)
      let neededBaseQty = norm.baseQuantity

      if (neededBaseQty <= 0) return

      const sellingPriceBase = norm.baseRate
      const itemLayers = layers.filter(l => l.itemId === saleRow.itemId && l.remainingQty > 0)

      if (itemLayers.length === 0) {
        const defaultLandingCost = toBaseRate(itemDef, itemDef?.purchasePrice || 0, itemDef?.unit) || sellingPriceBase
        allocations.push({
          id: `alloc-${saleInv.id}-${idx}-unallocated`,
          salesInvoiceId: saleInv.id,
          salesInvoiceNo: saleInv.invoiceNo,
          customerId: saleInv.customerId,
          customerName,
          purchaseLayerId: 'opening-stock',
          purchaseInvoiceId: 'N/A',
          purchaseInvoiceNo: 'Opening Stock',
          supplierName: 'Opening Stock',
          itemId: saleRow.itemId,
          itemName: itemDef?.name || 'Unknown Item',
          activeUnit: primaryUnit,
          baseUnit: primaryUnit,
          baseAllocatedQty: neededBaseQty,
          allocatedQty: neededBaseQty,
          fifoCostPerUnit: defaultLandingCost,
          sellingPricePerUnit: sellingPriceBase,
          profitPerUnit: sellingPriceBase - defaultLandingCost,
          totalProfit: (sellingPriceBase - defaultLandingCost) * neededBaseQty,
          saleDate: saleInv.invoiceDate
        })
        return
      }

      for (const layer of itemLayers) {
        if (neededBaseQty <= 0) break

        const takeBaseQty = Math.min(neededBaseQty, layer.remainingQty)
        layer.remainingQty -= takeBaseQty
        neededBaseQty -= takeBaseQty

        const fifoCostBase = layer.landingCost
        const profitPerBaseUnit = sellingPriceBase - fifoCostBase
        const totalProfit = profitPerBaseUnit * takeBaseQty

        allocations.push({
          id: `alloc-${saleInv.id}-${idx}-${layer.id}`,
          salesInvoiceId: saleInv.id,
          salesInvoiceNo: saleInv.invoiceNo,
          customerId: saleInv.customerId,
          customerName,
          purchaseLayerId: layer.id,
          purchaseInvoiceId: layer.purchaseInvoiceId,
          purchaseInvoiceNo: layer.invoiceNo,
          supplierName: layer.supplierName,
          itemId: saleRow.itemId,
          itemName: itemDef?.name || 'Unknown Item',
          activeUnit: primaryUnit,
          baseUnit: primaryUnit,
          baseAllocatedQty: takeBaseQty,
          allocatedQty: takeBaseQty,
          fifoCostPerUnit: fifoCostBase,
          sellingPricePerUnit: sellingPriceBase,
          profitPerUnit: profitPerBaseUnit,
          totalProfit,
          saleDate: saleInv.invoiceDate
        })
      }

      if (neededBaseQty > 0) {
        const lastLayer = itemLayers[itemLayers.length - 1]
        const lastLayerCost = lastLayer ? lastLayer.landingCost : (toBaseRate(itemDef, itemDef?.purchasePrice || 0, itemDef?.unit) || sellingPriceBase)

        allocations.push({
          id: `alloc-${saleInv.id}-${idx}-overdraw`,
          salesInvoiceId: saleInv.id,
          salesInvoiceNo: saleInv.invoiceNo,
          customerId: saleInv.customerId,
          customerName,
          purchaseLayerId: 'unallocated',
          purchaseInvoiceId: 'N/A',
          purchaseInvoiceNo: 'Unallocated Lot',
          supplierName: 'Unallocated Lot',
          itemId: saleRow.itemId,
          itemName: itemDef?.name || 'Unknown Item',
          activeUnit: primaryUnit,
          baseUnit: primaryUnit,
          baseAllocatedQty: neededBaseQty,
          allocatedQty: neededBaseQty,
          fifoCostPerUnit: lastLayerCost,
          sellingPricePerUnit: sellingPriceBase,
          profitPerUnit: sellingPriceBase - lastLayerCost,
          totalProfit: (sellingPriceBase - lastLayerCost) * neededBaseQty,
          saleDate: saleInv.invoiceDate
        })
      }
    })
  })

  return { allocations, updatedLayers: layers }
}

/**
 * Filter items by date range
 */
export function isDateInPeriod(
  dateStr: string,
  period: PeriodFilter,
  customRange?: DateFilterRange,
  referenceDate: Date = new Date()
): boolean {
  if (!dateStr) return false
  const targetDate = new Date(dateStr)
  if (isNaN(targetDate.getTime())) return false

  const today = new Date(referenceDate)
  today.setHours(0, 0, 0, 0)

  if (period === 'daily') {
    const target = new Date(targetDate)
    target.setHours(0, 0, 0, 0)
    return target.getTime() === today.getTime()
  }

  if (period === 'weekly') {
    const startOfWeek = new Date(today)
    const day = today.getDay()
    const diff = today.getDate() - day + (day === 0 ? -6 : 1)
    startOfWeek.setDate(diff)
    startOfWeek.setHours(0, 0, 0, 0)

    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setDate(startOfWeek.getDate() + 6)
    endOfWeek.setHours(23, 59, 59, 999)

    return targetDate >= startOfWeek && targetDate <= endOfWeek
  }

  if (period === 'monthly') {
    return (
      targetDate.getMonth() === today.getMonth() &&
      targetDate.getFullYear() === today.getFullYear()
    )
  }

  if (period === 'custom') {
    if (customRange?.startDate) {
      const start = new Date(customRange.startDate)
      start.setHours(0, 0, 0, 0)
      if (targetDate < start) return false
    }
    if (customRange?.endDate) {
      const end = new Date(customRange.endDate)
      end.setHours(23, 59, 59, 999)
      if (targetDate > end) return false
    }
    return true
  }

  return true
}

/**
 * Computes Payment CD Report Rows & Summary Statistics
 * STRICT BASE UNIT ARCHITECTURE: Aggregates strictly in Base Quantities and Rates.
 */
export function calculatePaymentCDReport(
  invoices: PurchaseInvoice[],
  suppliers: Supplier[],
  items: Item[],
  expectedDiscounts: ExpectedDiscount[] = [],
  expenseEntries: ExpenseEntry[] = [],
  period: PeriodFilter = 'monthly',
  customRange?: DateFilterRange,
  filters?: ReportFilterOptions
): { rows: PaymentCDReportRow[]; summary: PaymentCDSummaryStats } {
  const supplierMap = new Map(suppliers.map(s => [s.id, s]))
  const itemMap = new Map(items.map(i => [i.id, i]))

  const rows: PaymentCDReportRow[] = []

  invoices.forEach(inv => {
    if (!isDateInPeriod(inv.invoiceDate, period, customRange)) return
    if (filters?.supplierId && filters.supplierId !== 'all' && inv.supplierId !== filters.supplierId) return

    const supplier = supplierMap.get(inv.supplierId)
    const supplierName = supplier?.name || 'Unknown Supplier'

    const invoiceDiscounts = expectedDiscounts.filter(ed => ed.invoiceId === inv.id)
    const paymentCDTotal = invoiceDiscounts
      .filter(ed => ed.type === 'paymentCD' || ed.type === 'advanceCD')
      .reduce((sum, ed) => sum + ed.expectedAmount, 0)
    const closeCDTotal = invoiceDiscounts
      .filter(ed => ed.type === 'invoiceCloseCD')
      .reduce((sum, ed) => sum + ed.expectedAmount, 0)
    const fixedSchemeTotal = invoiceDiscounts
      .filter(ed => ed.type === 'fixedScheme')
      .reduce((sum, ed) => sum + ed.expectedAmount, 0)

    const totalInvoiceBaseQty = (inv.items || []).reduce((sum, itemRow) => {
      const itemDef = itemMap.get(itemRow.itemId)
      const enteredQty = itemRow.enteredQuantity || (itemRow as any).entryQuantity || (itemRow as any).quantityMT || 0
      const enteredUnit = itemRow.enteredUnit || (itemRow as any).entryUnit || itemDef?.unit || 'KG'
      return sum + toBaseQuantity(itemDef, enteredQty, enteredUnit)
    }, 0);

    (inv.items || []).forEach((itemRow, idx) => {
      if (!itemRow.itemId) return
      if (filters?.itemId && filters.itemId !== 'all' && itemRow.itemId !== filters.itemId) return

      const itemDef = itemMap.get(itemRow.itemId)
      if (filters?.category && filters.category !== 'all' && itemDef?.category !== filters.category) return

      const primaryUnit = itemDef?.unit || 'KG'
      const enteredQty = itemRow.enteredQuantity || (itemRow as any).entryQuantity || (itemRow as any).quantityMT || 0
      const enteredUnit = itemRow.enteredUnit || (itemRow as any).entryUnit || primaryUnit
      const enteredRate = itemRow.enteredRate || itemRow.rate || 0

      const norm = normalizeLineItem(itemDef, enteredQty, enteredUnit, enteredRate)
      const baseQty = norm.baseQuantity

      if (baseQty <= 0) return

      const qtyShare = totalInvoiceBaseQty > 0 ? baseQty / totalInvoiceBaseQty : 0

      const itemPaymentCD = paymentCDTotal * qtyShare
      const itemCloseCD = closeCDTotal * qtyShare
      const itemSchemeCD = fixedSchemeTotal * qtyShare
      const itemTotalCD = itemPaymentCD + itemCloseCD + itemSchemeCD

      const purchaseAmount = norm.baseAmount
      const avgCDPerUnit = baseQty > 0 ? itemTotalCD / baseQty : 0

      rows.push({
        id: `cd-row-${inv.id}-${idx}`,
        date: inv.invoiceDate,
        supplierId: inv.supplierId,
        supplierName,
        invoiceId: inv.id,
        invoiceNo: inv.invoiceNo,
        itemId: itemRow.itemId,
        itemName: itemDef?.name || 'Unknown Item',
        category: itemDef?.category,
        qty: baseQty,
        activeUnit: primaryUnit,
        purchaseAmount,
        paymentCD: itemPaymentCD,
        closeCD: itemCloseCD,
        schemeCD: itemSchemeCD,
        totalCD: itemTotalCD,
        netLandingCostSaved: itemTotalCD,
        avgCDPerUnit
      })
    })
  })

  const summary: PaymentCDSummaryStats = rows.reduce(
    (acc, row) => {
      acc.purchaseAmount += row.purchaseAmount
      acc.paymentCDEarned += row.paymentCD
      acc.invoiceCloseCD += row.closeCD
      acc.schemeCD += row.schemeCD
      acc.totalCDEarned += row.totalCD
      acc.netLandingCostSaved += row.netLandingCostSaved
      acc.totalQty += row.qty
      return acc
    },
    {
      purchaseAmount: 0,
      paymentCDEarned: 0,
      invoiceCloseCD: 0,
      schemeCD: 0,
      totalCDEarned: 0,
      avgCDPerUnit: 0,
      netLandingCostSaved: 0,
      totalQty: 0
    }
  )

  summary.avgCDPerUnit = summary.totalQty > 0 ? summary.totalCDEarned / summary.totalQty : 0

  return { rows, summary }
}

/**
 * Calculates Item Sales Profit Analysis (FIFO Margins)
 * STRICT BASE UNIT ARCHITECTURE: Calculates margins strictly in Primary (Base) Units.
 */
export function calculateItemProfitAnalysis(
  salesInvoices: SalesInvoice[],
  allocations: SaleAllocation[],
  items: Item[],
  customers: Customer[],
  period: PeriodFilter = 'monthly',
  customRange?: DateFilterRange,
  filters?: ReportFilterOptions
): ItemProfitAnalysisRow[] {
  const itemMap = new Map(items.map(i => [i.id, i]))

  const groupedMap = new Map<string, SaleAllocation[]>()
  allocations.forEach(alloc => {
    if (!isDateInPeriod(alloc.saleDate, period, customRange)) return
    if (filters?.itemId && filters.itemId !== 'all' && alloc.itemId !== filters.itemId) return
    if (filters?.supplierId && filters.supplierId !== 'all' && alloc.purchaseLayerId !== 'opening-stock' && alloc.purchaseLayerId !== 'unallocated') {
      if (!alloc.supplierName.toLowerCase().includes(filters.supplierId.toLowerCase())) return
    }

    const itemDef = itemMap.get(alloc.itemId)
    if (filters?.category && filters.category !== 'all' && itemDef?.category !== filters.category) return

    const groupKey = `${alloc.salesInvoiceId}-${alloc.itemId}`
    if (!groupedMap.has(groupKey)) {
      groupedMap.set(groupKey, [])
    }
    groupedMap.get(groupKey)!.push(alloc)
  })

  const rows: ItemProfitAnalysisRow[] = []

  groupedMap.forEach((allocs, groupKey) => {
    if (allocs.length === 0) return
    const first = allocs[0]
    const itemDef = itemMap.get(first.itemId)
    const primaryUnit = itemDef?.unit || 'KG'

    const totalSoldQty = allocs.reduce((sum, a) => sum + a.allocatedQty, 0)
    const totalProfit = allocs.reduce((sum, a) => sum + a.totalProfit, 0)

    const totalFifoCostSum = allocs.reduce((sum, a) => sum + a.fifoCostPerUnit * a.allocatedQty, 0)
    const weightedFifoCost = totalSoldQty > 0 ? totalFifoCostSum / totalSoldQty : first.fifoCostPerUnit

    const sellingRate = first.sellingPricePerUnit
    const profitPerUnit = totalSoldQty > 0 ? totalProfit / totalSoldQty : sellingRate - weightedFifoCost

    rows.push({
      id: `profit-row-${groupKey}`,
      saleDate: first.saleDate,
      salesInvoiceId: first.salesInvoiceId,
      salesInvoiceNo: first.salesInvoiceNo,
      customerId: first.customerId,
      customerName: first.customerName,
      itemId: first.itemId,
      itemName: first.itemName,
      category: itemDef?.category,
      soldQty: totalSoldQty,
      activeUnit: primaryUnit,
      sellingRate,
      fifoCost: weightedFifoCost,
      profitPerUnit,
      totalProfit,
      allocations: allocs
    })
  })

  return rows.sort((a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime())
}
