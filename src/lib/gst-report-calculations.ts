import {
  SalesInvoice,
  SalesReturn,
  CustomerCreditNote,
  CustomerDebitNote,
  PurchaseInvoice,
  PurchaseReturn,
  SupplierDebitNote,
  SupplierCreditNote,
  ExpenseEntry,
  Customer,
  Supplier,
  Item
} from './types'
import { roundCurrency, getActiveCompanyStateCode, isInterStateTransaction } from './calculations'
import { getStateCode, getStateName } from './constants/indian-states'

export interface GstDateFilter {
  startDate?: string // YYYY-MM-DD
  endDate?: string // YYYY-MM-DD
  month?: number // 1 - 12
  year?: number
  fy?: string
}

export interface Gstr3bTaxRow {
  taxableAmount: number
  igst: number
  cgst: number
  sgst: number
  totalTax: number
}

export interface Gstr3bTable31 {
  outwardTaxable: Gstr3bTaxRow // 3.1(a)
  outwardZeroRated: Gstr3bTaxRow // 3.1(b)
  otherOutwardNilExempt: Gstr3bTaxRow // 3.1(c)
  inwardRcm: Gstr3bTaxRow // 3.1(d)
  nonGstOutward: Gstr3bTaxRow // 3.1(e)
  totalLiability: Gstr3bTaxRow
}

export interface Gstr3bItcRow {
  igst: number
  cgst: number
  sgst: number
  totalTax: number
}

export interface Gstr3bTable4 {
  itcRcmInward: Gstr3bItcRow // 4(A)(3)
  itcAllOther: Gstr3bItcRow // 4(A)(5)
  itcReversals: Gstr3bItcRow // 4(B)(2)
  netItcAvailable: Gstr3bItcRow // 4(C) = 4A - 4B
  ineligibleItc: Gstr3bItcRow // 4(D)
}

export interface Gstr3bTable51 {
  taxPayable: Gstr3bItcRow
  itcPaid: Gstr3bItcRow
  cashPayable: Gstr3bItcRow
}

export interface Gstr1B2BInvoice {
  id: string
  customerId: string
  gstin: string
  partyName: string
  invoiceNo: string
  invoiceDate: string
  invoiceValue: number
  pos: string
  posName: string
  reverseCharge: 'Y' | 'N'
  taxableValue: number
  gstRate: number
  igst: number
  cgst: number
  sgst: number
}

export interface Gstr1B2CSummary {
  pos: string
  posName: string
  gstRate: number
  taxableValue: number
  igst: number
  cgst: number
  sgst: number
  totalInvoiceValue: number
  count: number
}

export interface Gstr1NoteItem {
  id: string
  partyId: string
  gstin: string
  partyName: string
  noteType: 'C' | 'D'
  noteTypeName: string
  noteNo: string
  noteDate: string
  originalInvoiceNo: string
  originalInvoiceDate: string
  reason: string
  pos: string
  posName: string
  taxableValue: number
  gstRate: number
  igst: number
  cgst: number
  sgst: number
  totalAmount: number
}

export interface Gstr1HsnItem {
  hsn: string
  description: string
  uqc: string
  totalQty: number
  totalValue: number
  taxableValue: number
  igst: number
  cgst: number
  sgst: number
}

export interface Gstr2bItem {
  id: string
  source: 'purchase_invoice' | 'expense_entry' | 'supplier_debit_note' | 'supplier_credit_note'
  sourceLabel: string
  voucherNo: string
  voucherDate: string
  gstin: string
  partyName: string
  pos: string
  posName: string
  hsnSac: string
  itcClassification: 'Input Services' | 'Inputs / Consumables' | 'Capital Goods' | 'Ineligible'
  isRcm: boolean
  taxableAmount: number
  gstRate: number
  igst: number
  cgst: number
  sgst: number
  totalAmount: number
  itcEligible: boolean
}

export interface MonthlyGstReport {
  periodLabel: string
  kpis: {
    totalOutputTax: number
    totalEligibleItc: number
    netCashPayable: number
    totalTaxableSales: number
    totalTaxablePurchases: number
    totalRcmLiability: number
  }
  gstr3b: {
    table31: Gstr3bTable31
    table4: Gstr3bTable4
    table51: Gstr3bTable51
  }
  gstr1: {
    b2b: Gstr1B2BInvoice[]
    b2c: Gstr1B2CSummary[]
    notes: Gstr1NoteItem[]
    hsn: Gstr1HsnItem[]
    totals: {
      b2bTaxable: number
      b2bTax: number
      b2cTaxable: number
      b2cTax: number
      notesTaxable: number
      notesTax: number
      totalTaxable: number
      totalTax: number
    }
  }
  gstr2b: {
    items: Gstr2bItem[]
    totals: {
      purchaseTaxable: number
      purchaseItc: number
      expenseTaxable: number
      expenseItc: number
      rcmTaxable: number
      rcmItc: number
      ineligibleTaxable: number
      ineligibleItc: number
      totalItc: number
    }
  }
}

export interface GstReportSourceData {
  salesInvoices: SalesInvoice[]
  salesReturns: SalesReturn[]
  customerCreditNotes: CustomerCreditNote[]
  customerDebitNotes: CustomerDebitNote[]
  purchaseInvoices: PurchaseInvoice[]
  purchaseReturns: PurchaseReturn[]
  supplierDebitNotes: SupplierDebitNote[]
  supplierCreditNotes: SupplierCreditNote[]
  expenseEntries: ExpenseEntry[]
  customers: Customer[]
  suppliers: Supplier[]
  items?: Item[]
  companyStateCode?: string
}

function isDateInFilter(dateStr?: string, filter?: GstDateFilter): boolean {
  if (!dateStr || !filter) return true
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return true

  if (filter.startDate && filter.endDate) {
    const start = new Date(filter.startDate)
    const end = new Date(filter.endDate)
    // inclusive of full end day
    end.setHours(23, 59, 59, 999)
    return date >= start && date <= end
  }

  if (filter.month && filter.year) {
    return date.getMonth() + 1 === filter.month && date.getFullYear() === filter.year
  }

  if (filter.year && !filter.month) {
    return date.getFullYear() === filter.year
  }

  return true
}

export function computeMonthlyGstReport(
  source: GstReportSourceData,
  filter: GstDateFilter
): MonthlyGstReport {
  const companyState = source.companyStateCode || getActiveCompanyStateCode('19')
  const custMap = new Map((source.customers || []).map(c => [c.id, c]))
  const supMap = new Map((source.suppliers || []).map(s => [s.id, s]))
  const itemMap = new Map((source.items || []).map(i => [i.id, i]))

  // 1. Filter raw transactions by selected date range
  const salesInvoices = (source.salesInvoices || []).filter(i => isDateInFilter(i.invoiceDate, filter))
  const salesReturns = (source.salesReturns || []).filter(r => isDateInFilter(r.returnDate, filter))
  const customerCreditNotes = (source.customerCreditNotes || []).filter(cn => isDateInFilter(cn.date, filter))
  const customerDebitNotes = (source.customerDebitNotes || []).filter(dn => isDateInFilter(dn.date, filter))

  const purchaseInvoices = (source.purchaseInvoices || []).filter(i => isDateInFilter(i.invoiceDate, filter))
  const purchaseReturns = (source.purchaseReturns || []).filter(r => isDateInFilter(r.returnDate, filter))
  const supplierDebitNotes = (source.supplierDebitNotes || []).filter(dn => isDateInFilter(dn.date, filter))
  const supplierCreditNotes = (source.supplierCreditNotes || []).filter(cn => isDateInFilter(cn.date, filter))

  const expenseEntries = (source.expenseEntries || []).filter(e => isDateInFilter(e.expenseDate, filter))

  // ==========================================
  // A. BUILD GSTR-1 REGISTERS
  // ==========================================
  const gstr1B2B: Gstr1B2BInvoice[] = []
  const b2cMap = new Map<string, Gstr1B2CSummary>()
  const hsnMap = new Map<string, Gstr1HsnItem>()

  salesInvoices.forEach(inv => {
    const cust = custMap.get(inv.customerId)
    const partyState = cust?.stateCode || (cust?.gstin ? cust.gstin.slice(0, 2) : (cust?.stateName ? getStateCode(cust.stateName) : companyState))
    const isInterState = isInterStateTransaction(partyState, companyState)
    const gstin = (cust?.gstin || '').trim().toUpperCase()
    const isB2B = gstin.length === 15

    const taxableAmount = inv.taxableAmount ?? (inv.items ? inv.items.reduce((s, it) => s + (it.taxableAmount || it.amount || 0), 0) : inv.invoiceAmount)
    const igst = inv.igstAmount ?? 0
    const cgst = inv.cgstAmount ?? 0
    const sgst = inv.sgstAmount ?? 0
    const effectiveRate = inv.igstRate && inv.igstRate > 0 ? inv.igstRate : ((inv.cgstRate || 0) + (inv.sgstRate || 0)) || (inv.items?.[0]?.gstRate ?? 18)

    if (isB2B) {
      gstr1B2B.push({
        id: inv.id,
        customerId: inv.customerId,
        gstin,
        partyName: cust?.name || 'Registered Customer',
        invoiceNo: inv.invoiceNo,
        invoiceDate: inv.invoiceDate,
        invoiceValue: inv.invoiceAmount,
        pos: partyState,
        posName: getStateName(partyState),
        reverseCharge: 'N',
        taxableValue: roundCurrency(taxableAmount),
        gstRate: effectiveRate,
        igst: roundCurrency(igst),
        cgst: roundCurrency(cgst),
        sgst: roundCurrency(sgst)
      })
    } else {
      // Group for B2C
      const key = `${partyState}_${effectiveRate}`
      const existing = b2cMap.get(key)
      if (existing) {
        existing.taxableValue = roundCurrency(existing.taxableValue + taxableAmount)
        existing.igst = roundCurrency(existing.igst + igst)
        existing.cgst = roundCurrency(existing.cgst + cgst)
        existing.sgst = roundCurrency(existing.sgst + sgst)
        existing.totalInvoiceValue = roundCurrency(existing.totalInvoiceValue + inv.invoiceAmount)
        existing.count += 1
      } else {
        b2cMap.set(key, {
          pos: partyState,
          posName: getStateName(partyState),
          gstRate: effectiveRate,
          taxableValue: roundCurrency(taxableAmount),
          igst: roundCurrency(igst),
          cgst: roundCurrency(cgst),
          sgst: roundCurrency(sgst),
          totalInvoiceValue: roundCurrency(inv.invoiceAmount),
          count: 1
        })
      }
    }

    // Process HSN Summary
    if (inv.items && inv.items.length > 0) {
      inv.items.forEach(line => {
        const itemDef = line.itemId ? itemMap.get(line.itemId) : undefined
        const hsn = itemDef?.itemCode || '999999'
        const desc = itemDef?.name || line.itemNameSnapshot || 'Goods'
        const uqc = itemDef?.unit || 'KGS'
        const qty = line.enteredQuantity ?? line.baseQuantity ?? 0
        const rowTaxable = line.taxableAmount ?? (line.amount ? roundCurrency(line.amount / (1 + (effectiveRate / 100))) : 0)
        const rowIgst = line.igstAmount ?? (isInterState ? roundCurrency(rowTaxable * (effectiveRate / 100)) : 0)
        const rowCgst = line.cgstAmount ?? (!isInterState ? roundCurrency(rowTaxable * (effectiveRate / 200)) : 0)
        const rowSgst = line.sgstAmount ?? (!isInterState ? roundCurrency(rowTaxable * (effectiveRate / 200)) : 0)

        const existingHsn = hsnMap.get(hsn)
        if (existingHsn) {
          existingHsn.totalQty += qty
          existingHsn.totalValue = roundCurrency(existingHsn.totalValue + (line.amount || 0))
          existingHsn.taxableValue = roundCurrency(existingHsn.taxableValue + rowTaxable)
          existingHsn.igst = roundCurrency(existingHsn.igst + rowIgst)
          existingHsn.cgst = roundCurrency(existingHsn.cgst + rowCgst)
          existingHsn.sgst = roundCurrency(existingHsn.sgst + rowSgst)
        } else {
          hsnMap.set(hsn, {
            hsn,
            description: desc,
            uqc,
            totalQty: qty,
            totalValue: roundCurrency(line.amount || 0),
            taxableValue: roundCurrency(rowTaxable),
            igst: roundCurrency(rowIgst),
            cgst: roundCurrency(rowCgst),
            sgst: roundCurrency(rowSgst)
          })
        }
      })
    }
  })

  // Table 9B Notes (Customer Credit Notes, Debit Notes)
  const gstr1Notes: Gstr1NoteItem[] = []

  customerCreditNotes.forEach(cn => {
    const partyId = cn.partyId || cn.customerId || ''
    const cust = custMap.get(partyId)
    const partyState = cust?.stateCode || (cust?.gstin ? cust.gstin.slice(0, 2) : companyState)
    const gstin = (cust?.gstin || '').trim().toUpperCase()

    gstr1Notes.push({
      id: cn.id,
      partyId: partyId,
      gstin: gstin || 'UR',
      partyName: cust?.name || 'Customer',
      noteType: 'C',
      noteTypeName: 'Credit Note',
      noteNo: cn.noteNo || cn.invoiceRef || cn.id,
      noteDate: cn.date,
      originalInvoiceNo: cn.originalInvoiceNo || cn.invoiceRef || '-',
      originalInvoiceDate: cn.originalInvoiceDate || cn.date,
      reason: cn.reason || '02 - Post Sale Discount',
      pos: partyState,
      posName: getStateName(partyState),
      taxableValue: roundCurrency(cn.taxableAmount ?? cn.amount),
      gstRate: cn.gstRate ?? 18,
      igst: roundCurrency(cn.igstAmount ?? 0),
      cgst: roundCurrency(cn.cgstAmount ?? 0),
      sgst: roundCurrency(cn.sgstAmount ?? 0),
      totalAmount: roundCurrency(cn.totalAmount ?? cn.amount)
    })
  })

  customerDebitNotes.forEach(dn => {
    const partyId = dn.partyId || dn.customerId || ''
    const cust = custMap.get(partyId)
    const partyState = cust?.stateCode || (cust?.gstin ? cust.gstin.slice(0, 2) : companyState)
    const gstin = (cust?.gstin || '').trim().toUpperCase()

    gstr1Notes.push({
      id: dn.id,
      partyId: partyId,
      gstin: gstin || 'UR',
      partyName: cust?.name || 'Customer',
      noteType: 'D',
      noteTypeName: 'Debit Note',
      noteNo: dn.noteNo || dn.invoiceRef || dn.id,
      noteDate: dn.date,
      originalInvoiceNo: dn.originalInvoiceNo || dn.invoiceRef || '-',
      originalInvoiceDate: dn.originalInvoiceDate || dn.date,
      reason: dn.reason || '04 - Correction in Invoice',
      pos: partyState,
      posName: getStateName(partyState),
      taxableValue: roundCurrency(dn.taxableAmount ?? dn.amount),
      gstRate: dn.gstRate ?? 18,
      igst: roundCurrency(dn.igstAmount ?? 0),
      cgst: roundCurrency(dn.cgstAmount ?? 0),
      sgst: roundCurrency(dn.sgstAmount ?? 0),
      totalAmount: roundCurrency(dn.totalAmount ?? dn.amount)
    })
  })

  // ==========================================
  // B. BUILD GSTR-2B INWARD & ITC ENTRIES
  // ==========================================
  const gstr2bItems: Gstr2bItem[] = []

  // 1. Purchase Invoices
  purchaseInvoices.forEach(inv => {
    const sup = supMap.get(inv.supplierId)
    const partyState = sup?.stateCode || (sup?.gstin ? sup.gstin.slice(0, 2) : companyState)
    const gstin = (sup?.gstin || '').trim().toUpperCase()
    const taxableAmount = inv.taxableAmount ?? (inv.items ? inv.items.reduce((s, it) => s + (it.taxableAmount || it.amount || 0), 0) : inv.invoiceAmount)
    const igst = inv.igstAmount ?? 0
    const cgst = inv.cgstAmount ?? 0
    const sgst = inv.sgstAmount ?? 0
    const effectiveRate = inv.igstRate && inv.igstRate > 0 ? inv.igstRate : ((inv.cgstRate || 0) + (inv.sgstRate || 0)) || (inv.items?.[0]?.gstRate ?? 18)

    gstr2bItems.push({
      id: inv.id,
      source: 'purchase_invoice',
      sourceLabel: 'Purchase Invoice',
      voucherNo: inv.invoiceNo,
      voucherDate: inv.invoiceDate,
      gstin: gstin || 'Unregistered',
      partyName: sup?.name || 'Supplier',
      pos: partyState,
      posName: getStateName(partyState),
      hsnSac: inv.items?.[0]?.itemId ? (itemMap.get(inv.items[0].itemId)?.itemCode || 'Goods') : 'Goods',
      itcClassification: 'Inputs / Consumables',
      isRcm: false,
      taxableAmount: roundCurrency(taxableAmount),
      gstRate: effectiveRate,
      igst: roundCurrency(igst),
      cgst: roundCurrency(cgst),
      sgst: roundCurrency(sgst),
      totalAmount: roundCurrency(inv.invoiceAmount),
      itcEligible: true
    })
  })

  // 2. GST Expenses (Eligible + RCM + Ineligible)
  expenseEntries.forEach(exp => {
    const rawGstin = (exp.supplierGstin || (exp as any).vendorGstin || '').trim().toUpperCase()
    const partyState = exp.supplierStateCode || (rawGstin ? rawGstin.slice(0, 2) : companyState)
    const itcCat = exp.itcType || (exp as any).itcClassification || (exp.isRcm ? 'Input Services' : 'Input Services')
    const hasGstTax = !!(exp.hasGst || exp.isRcm || (exp.igstAmount || 0) + (exp.cgstAmount || 0) + (exp.sgstAmount || 0) > 0)
    const isEligible = itcCat !== 'Ineligible' && hasGstTax

    if (hasGstTax) {
      gstr2bItems.push({
        id: exp.id,
        source: 'expense_entry',
        sourceLabel: exp.isRcm ? 'Expense (RCM)' : 'Expense Voucher',
        voucherNo: exp.invoiceRefNo || (exp as any).voucherNo || exp.id,
        voucherDate: exp.expenseDate,
        gstin: rawGstin || (exp.isRcm ? 'GTA / Unregistered' : 'Unregistered'),
        partyName: exp.supplierName || 'Expense Payee',
        pos: partyState,
        posName: getStateName(partyState),
        hsnSac: exp.hsnSacCode || '9965',
        itcClassification: itcCat as any,
        isRcm: !!exp.isRcm,
        taxableAmount: roundCurrency(exp.taxableAmount ?? exp.amount),
        gstRate: exp.gstRate ?? 18,
        igst: roundCurrency(exp.igstAmount ?? 0),
        cgst: roundCurrency(exp.cgstAmount ?? 0),
        sgst: roundCurrency(exp.sgstAmount ?? 0),
        totalAmount: roundCurrency(exp.totalExpenseAmount ?? exp.amount),
        itcEligible: isEligible
      })
    }
  })

  // 3. Supplier Credit Notes (ITC Reduction / Adjustment)
  supplierCreditNotes.forEach(cn => {
    const sup = supMap.get(cn.partyId || cn.supplierId || '')
    const partyState = sup?.stateCode || (sup?.gstin ? sup.gstin.slice(0, 2) : companyState)
    const gstin = (sup?.gstin || '').trim().toUpperCase()

    gstr2bItems.push({
      id: cn.id,
      source: 'supplier_credit_note',
      sourceLabel: 'Supplier Credit Note',
      voucherNo: cn.noteNo || cn.invoiceRef || cn.id,
      voucherDate: cn.date,
      gstin: gstin || 'Unregistered',
      partyName: sup?.name || 'Supplier',
      pos: partyState,
      posName: getStateName(partyState),
      hsnSac: 'Adjustment',
      itcClassification: 'Inputs / Consumables',
      isRcm: false,
      taxableAmount: roundCurrency(cn.taxableAmount ?? cn.amount),
      gstRate: cn.gstRate ?? 18,
      igst: roundCurrency(cn.igstAmount ?? 0),
      cgst: roundCurrency(cn.cgstAmount ?? 0),
      sgst: roundCurrency(cn.sgstAmount ?? 0),
      totalAmount: roundCurrency(cn.totalAmount ?? cn.amount),
      itcEligible: true
    })
  })

  // 4. Supplier Debit Notes (ITC Reversal)
  supplierDebitNotes.forEach(dn => {
    const sup = supMap.get(dn.partyId || dn.supplierId || '')
    const partyState = sup?.stateCode || (sup?.gstin ? sup.gstin.slice(0, 2) : companyState)
    const gstin = (sup?.gstin || '').trim().toUpperCase()

    gstr2bItems.push({
      id: dn.id,
      source: 'supplier_debit_note',
      sourceLabel: 'Supplier Debit Note',
      voucherNo: dn.noteNo || dn.invoiceRef || dn.id,
      voucherDate: dn.date,
      gstin: gstin || 'Unregistered',
      partyName: sup?.name || 'Supplier',
      pos: partyState,
      posName: getStateName(partyState),
      hsnSac: 'Reversal',
      itcClassification: 'Inputs / Consumables',
      isRcm: false,
      taxableAmount: roundCurrency(-(dn.taxableAmount ?? dn.amount)),
      gstRate: dn.gstRate ?? 18,
      igst: roundCurrency(-(dn.igstAmount ?? 0)),
      cgst: roundCurrency(-(dn.cgstAmount ?? 0)),
      sgst: roundCurrency(-(dn.sgstAmount ?? 0)),
      totalAmount: roundCurrency(-(dn.totalAmount ?? dn.amount)),
      itcEligible: false
    })
  })

  // ==========================================
  // C. COMPUTE GSTR-3B TABLES
  // ==========================================

  // Table 3.1(a): Outward Taxable Supplies (Sales - Sales Returns - Customer Credit Notes + Customer Debit Notes)
  const grossSalesTaxable = salesInvoices.reduce((s, i) => s + (i.taxableAmount ?? i.invoiceAmount), 0)
  const grossSalesIgst = salesInvoices.reduce((s, i) => s + (i.igstAmount ?? 0), 0)
  const grossSalesCgst = salesInvoices.reduce((s, i) => s + (i.cgstAmount ?? 0), 0)
  const grossSalesSgst = salesInvoices.reduce((s, i) => s + (i.sgstAmount ?? 0), 0)

  const cnTaxable = customerCreditNotes.reduce((s, c) => s + (c.taxableAmount ?? c.amount ?? 0), 0)
  const cnIgst = customerCreditNotes.reduce((s, c) => s + (c.igstAmount ?? 0), 0)
  const cnCgst = customerCreditNotes.reduce((s, c) => s + (c.cgstAmount ?? 0), 0)
  const cnSgst = customerCreditNotes.reduce((s, c) => s + (c.sgstAmount ?? 0), 0)

  const dnTaxable = customerDebitNotes.reduce((s, d) => s + (d.taxableAmount ?? d.amount ?? 0), 0)
  const dnIgst = customerDebitNotes.reduce((s, d) => s + (d.igstAmount ?? 0), 0)
  const dnCgst = customerDebitNotes.reduce((s, d) => s + (d.cgstAmount ?? 0), 0)
  const dnSgst = customerDebitNotes.reduce((s, d) => s + (d.sgstAmount ?? 0), 0)

  const netOutwardTaxable = Math.max(0, grossSalesTaxable - cnTaxable + dnTaxable)
  const netOutwardIgst = Math.max(0, grossSalesIgst - cnIgst + dnIgst)
  const netOutwardCgst = Math.max(0, grossSalesCgst - cnCgst + dnCgst)
  const netOutwardSgst = Math.max(0, grossSalesSgst - cnSgst + dnSgst)
  const netOutwardTotalTax = netOutwardIgst + netOutwardCgst + netOutwardSgst

  // Table 3.1(d): Inward Supplies liable to Reverse Charge (RCM Expenses)
  const rcmExpenses = expenseEntries.filter(e => e.isRcm)
  const rcmTaxable = rcmExpenses.reduce((s, e) => s + (e.taxableAmount ?? e.amount ?? 0), 0)
  const rcmIgst = rcmExpenses.reduce((s, e) => s + (e.igstAmount ?? 0), 0)
  const rcmCgst = rcmExpenses.reduce((s, e) => s + (e.cgstAmount ?? 0), 0)
  const rcmSgst = rcmExpenses.reduce((s, e) => s + (e.sgstAmount ?? 0), 0)
  const rcmTotalTax = rcmIgst + rcmCgst + rcmSgst

  const table31: Gstr3bTable31 = {
    outwardTaxable: {
      taxableAmount: roundCurrency(netOutwardTaxable),
      igst: roundCurrency(netOutwardIgst),
      cgst: roundCurrency(netOutwardCgst),
      sgst: roundCurrency(netOutwardSgst),
      totalTax: roundCurrency(netOutwardTotalTax)
    },
    outwardZeroRated: { taxableAmount: 0, igst: 0, cgst: 0, sgst: 0, totalTax: 0 },
    otherOutwardNilExempt: { taxableAmount: 0, igst: 0, cgst: 0, sgst: 0, totalTax: 0 },
    inwardRcm: {
      taxableAmount: roundCurrency(rcmTaxable),
      igst: roundCurrency(rcmIgst),
      cgst: roundCurrency(rcmCgst),
      sgst: roundCurrency(rcmSgst),
      totalTax: roundCurrency(rcmTotalTax)
    },
    nonGstOutward: { taxableAmount: 0, igst: 0, cgst: 0, sgst: 0, totalTax: 0 },
    totalLiability: {
      taxableAmount: roundCurrency(netOutwardTaxable + rcmTaxable),
      igst: roundCurrency(netOutwardIgst + rcmIgst),
      cgst: roundCurrency(netOutwardCgst + rcmCgst),
      sgst: roundCurrency(netOutwardSgst + rcmSgst),
      totalTax: roundCurrency(netOutwardTotalTax + rcmTotalTax)
    }
  }

  // Table 4: Eligible ITC
  // 4(A)(3): Inward Supplies liable to RCM
  const itcRcmInward: Gstr3bItcRow = {
    igst: roundCurrency(rcmIgst),
    cgst: roundCurrency(rcmCgst),
    sgst: roundCurrency(rcmSgst),
    totalTax: roundCurrency(rcmTotalTax)
  }

  // 4(A)(5): All Other ITC (Purchase Invoices + Eligible Expenses - Supplier Credit Notes)
  const purIgst = purchaseInvoices.reduce((s, p) => s + (p.igstAmount ?? 0), 0)
  const purCgst = purchaseInvoices.reduce((s, p) => s + (p.cgstAmount ?? 0), 0)
  const purSgst = purchaseInvoices.reduce((s, p) => s + (p.sgstAmount ?? 0), 0)

  const nonRcmEligibleExp = expenseEntries.filter(e => !e.isRcm && (e.itcType || (e as any).itcClassification) !== 'Ineligible' && (e.hasGst || ((e.igstAmount || 0) + (e.cgstAmount || 0) + (e.sgstAmount || 0) > 0)))
  const expIgst = nonRcmEligibleExp.reduce((s, e) => s + (e.igstAmount ?? 0), 0)
  const expCgst = nonRcmEligibleExp.reduce((s, e) => s + (e.cgstAmount ?? 0), 0)
  const expSgst = nonRcmEligibleExp.reduce((s, e) => s + (e.sgstAmount ?? 0), 0)

  const supCnIgst = supplierCreditNotes.reduce((s, c) => s + (c.igstAmount ?? 0), 0)
  const supCnCgst = supplierCreditNotes.reduce((s, c) => s + (c.cgstAmount ?? 0), 0)
  const supCnSgst = supplierCreditNotes.reduce((s, c) => s + (c.sgstAmount ?? 0), 0)

  const itcAllOther: Gstr3bItcRow = {
    igst: roundCurrency(Math.max(0, purIgst + expIgst - supCnIgst)),
    cgst: roundCurrency(Math.max(0, purCgst + expCgst - supCnCgst)),
    sgst: roundCurrency(Math.max(0, purSgst + expSgst - supCnSgst)),
    totalTax: roundCurrency(Math.max(0, (purIgst + expIgst - supCnIgst) + (purCgst + expCgst - supCnCgst) + (purSgst + expSgst - supCnSgst)))
  }

  // 4(B)(2): Reversals (Supplier Debit Notes + Purchase Returns)
  const supDnIgst = supplierDebitNotes.reduce((s, d) => s + (d.igstAmount ?? 0), 0)
  const supDnCgst = supplierDebitNotes.reduce((s, d) => s + (d.cgstAmount ?? 0), 0)
  const supDnSgst = supplierDebitNotes.reduce((s, d) => s + (d.sgstAmount ?? 0), 0)

  const itcReversals: Gstr3bItcRow = {
    igst: roundCurrency(supDnIgst),
    cgst: roundCurrency(supDnCgst),
    sgst: roundCurrency(supDnSgst),
    totalTax: roundCurrency(supDnIgst + supDnCgst + supDnSgst)
  }

  // Ineligible ITC 4(D)
  const ineligibleExp = expenseEntries.filter(e => (e.itcType || (e as any).itcClassification) === 'Ineligible' && (e.hasGst || ((e.igstAmount || 0) + (e.cgstAmount || 0) + (e.sgstAmount || 0) > 0)))
  const ineligIgst = ineligibleExp.reduce((s, e) => s + (e.igstAmount ?? 0), 0)
  const ineligCgst = ineligibleExp.reduce((s, e) => s + (e.cgstAmount ?? 0), 0)
  const ineligSgst = ineligibleExp.reduce((s, e) => s + (e.sgstAmount ?? 0), 0)

  const ineligibleItc: Gstr3bItcRow = {
    igst: roundCurrency(ineligIgst),
    cgst: roundCurrency(ineligCgst),
    sgst: roundCurrency(ineligSgst),
    totalTax: roundCurrency(ineligIgst + ineligCgst + ineligSgst)
  }

  // 4(C) Net ITC = (4A3 + 4A5) - 4B2
  const netItcIgst = Math.max(0, itcRcmInward.igst + itcAllOther.igst - itcReversals.igst)
  const netItcCgst = Math.max(0, itcRcmInward.cgst + itcAllOther.cgst - itcReversals.cgst)
  const netItcSgst = Math.max(0, itcRcmInward.sgst + itcAllOther.sgst - itcReversals.sgst)

  const table4: Gstr3bTable4 = {
    itcRcmInward,
    itcAllOther,
    itcReversals,
    netItcAvailable: {
      igst: roundCurrency(netItcIgst),
      cgst: roundCurrency(netItcCgst),
      sgst: roundCurrency(netItcSgst),
      totalTax: roundCurrency(netItcIgst + netItcCgst + netItcSgst)
    },
    ineligibleItc
  }

  // Table 5.1: Cash Discharge Required
  // Outward tax can be paid via Net ITC; RCM tax MUST be paid in Cash by law.
  const outwardIgstCash = Math.max(0, netOutwardIgst - table4.netItcAvailable.igst)
  const outwardCgstCash = Math.max(0, netOutwardCgst - table4.netItcAvailable.cgst)
  const outwardSgstCash = Math.max(0, netOutwardSgst - table4.netItcAvailable.sgst)

  const cashIgst = roundCurrency(outwardIgstCash + rcmIgst)
  const cashCgst = roundCurrency(outwardCgstCash + rcmCgst)
  const cashSgst = roundCurrency(outwardSgstCash + rcmSgst)

  const table51: Gstr3bTable51 = {
    taxPayable: table31.totalLiability,
    itcPaid: {
      igst: roundCurrency(Math.min(netOutwardIgst, table4.netItcAvailable.igst)),
      cgst: roundCurrency(Math.min(netOutwardCgst, table4.netItcAvailable.cgst)),
      sgst: roundCurrency(Math.min(netOutwardSgst, table4.netItcAvailable.sgst)),
      totalTax: roundCurrency(
        Math.min(netOutwardIgst, table4.netItcAvailable.igst) +
        Math.min(netOutwardCgst, table4.netItcAvailable.cgst) +
        Math.min(netOutwardSgst, table4.netItcAvailable.sgst)
      )
    },
    cashPayable: {
      igst: cashIgst,
      cgst: cashCgst,
      sgst: cashSgst,
      totalTax: roundCurrency(cashIgst + cashCgst + cashSgst)
    }
  }

  // ==========================================
  // D. SUMMARIES & KPI TOTALS
  // ==========================================
  const b2cList = Array.from(b2cMap.values())
  const hsnList = Array.from(hsnMap.values())

  const b2bTaxableTotal = gstr1B2B.reduce((s, b) => s + b.taxableValue, 0)
  const b2bTaxTotal = gstr1B2B.reduce((s, b) => s + b.igst + b.cgst + b.sgst, 0)
  const b2cTaxableTotal = b2cList.reduce((s, b) => s + b.taxableValue, 0)
  const b2cTaxTotal = b2cList.reduce((s, b) => s + b.igst + b.cgst + b.sgst, 0)
  const notesTaxableTotal = gstr1Notes.reduce((s, n) => s + n.taxableValue, 0)
  const notesTaxTotal = gstr1Notes.reduce((s, n) => s + n.igst + n.cgst + n.sgst, 0)

  const purTaxableTotal = purchaseInvoices.reduce((s, p) => s + (p.taxableAmount ?? p.invoiceAmount), 0)
  const expTaxableTotal = nonRcmEligibleExp.reduce((s, e) => s + (e.taxableAmount ?? e.amount), 0)
  const ineligTaxableTotal = ineligibleExp.reduce((s, e) => s + (e.taxableAmount ?? e.amount), 0)

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const periodLabel = filter.month && filter.year
    ? `${monthNames[filter.month - 1]} ${filter.year}`
    : filter.startDate && filter.endDate
    ? `${filter.startDate} to ${filter.endDate}`
    : filter.year
    ? `Year ${filter.year}`
    : 'All Time'

  return {
    periodLabel,
    kpis: {
      totalOutputTax: roundCurrency(table31.totalLiability.totalTax),
      totalEligibleItc: roundCurrency(table4.netItcAvailable.totalTax),
      netCashPayable: roundCurrency(table51.cashPayable.totalTax),
      totalTaxableSales: roundCurrency(table31.outwardTaxable.taxableAmount),
      totalTaxablePurchases: roundCurrency(purTaxableTotal),
      totalRcmLiability: roundCurrency(table31.inwardRcm.totalTax)
    },
    gstr3b: {
      table31,
      table4,
      table51
    },
    gstr1: {
      b2b: gstr1B2B,
      b2c: b2cList,
      notes: gstr1Notes,
      hsn: hsnList,
      totals: {
        b2bTaxable: roundCurrency(b2bTaxableTotal),
        b2bTax: roundCurrency(b2bTaxTotal),
        b2cTaxable: roundCurrency(b2cTaxableTotal),
        b2cTax: roundCurrency(b2cTaxTotal),
        notesTaxable: roundCurrency(notesTaxableTotal),
        notesTax: roundCurrency(notesTaxTotal),
        totalTaxable: roundCurrency(b2bTaxableTotal + b2cTaxableTotal),
        totalTax: roundCurrency(b2bTaxTotal + b2cTaxTotal)
      }
    },
    gstr2b: {
      items: gstr2bItems,
      totals: {
        purchaseTaxable: roundCurrency(purTaxableTotal),
        purchaseItc: roundCurrency(purIgst + purCgst + purSgst),
        expenseTaxable: roundCurrency(expTaxableTotal),
        expenseItc: roundCurrency(expIgst + expCgst + expSgst),
        rcmTaxable: roundCurrency(rcmTaxable),
        rcmItc: roundCurrency(rcmTotalTax),
        ineligibleTaxable: roundCurrency(ineligTaxableTotal),
        ineligibleItc: roundCurrency(ineligibleItc.totalTax),
        totalItc: roundCurrency(table4.netItcAvailable.totalTax)
      }
    }
  }
}
