import * as XLSX from 'xlsx'
import {
  SalesInvoice,
  PurchaseInvoice,
  CustomerCreditNote,
  CustomerDebitNote,
  SupplierCreditNote,
  SupplierDebitNote,
  ExpenseEntry,
  Customer,
  Supplier,
  Payment,
  CustomerPayment,
  Item,
  ExpenseType
} from './types'
import { roundCurrency, isInterStateTransaction, getActiveCompanyStateCode, calculateInvoiceTaxBreakdown, calculateExpenseTaxBreakdown } from './calculations'
import { getStateName, getStateCode } from './constants/indian-states'
import { TALLY_COLUMN_HEADERS, TallyExportRow, normalizeTallyDate } from './tally-payment-excel'

export interface TallyLedgerMapping {
  salesLedgerName: string
  purchaseLedgerName: string
  salesReturnLedgerName: string
  purchaseReturnLedgerName: string
  outputCgstLedgerName: string
  outputSgstLedgerName: string
  outputIgstLedgerName: string
  inputCgstLedgerName: string
  inputSgstLedgerName: string
  inputIgstLedgerName: string
  rcmLiabilityCgstLedgerName: string
  rcmLiabilitySgstLedgerName: string
  rcmLiabilityIgstLedgerName: string
  rcmItcCgstLedgerName: string
  rcmItcSgstLedgerName: string
  rcmItcIgstLedgerName: string
  roundOffLedgerName: string
  defaultCashLedgerName: string
  defaultBankLedgerName: string
}

export const DEFAULT_TALLY_LEDGER_MAPPING: TallyLedgerMapping = {
  salesLedgerName: 'Sales Account',
  purchaseLedgerName: 'Purchase Account',
  salesReturnLedgerName: 'Sales Return',
  purchaseReturnLedgerName: 'Purchase Return',
  outputCgstLedgerName: 'Output CGST',
  outputSgstLedgerName: 'Output SGST',
  outputIgstLedgerName: 'Output IGST',
  inputCgstLedgerName: 'Input CGST',
  inputSgstLedgerName: 'Input SGST',
  inputIgstLedgerName: 'Input IGST',
  rcmLiabilityCgstLedgerName: 'RCM Output CGST',
  rcmLiabilitySgstLedgerName: 'RCM Output SGST',
  rcmLiabilityIgstLedgerName: 'RCM Output IGST',
  rcmItcCgstLedgerName: 'RCM Input CGST',
  rcmItcSgstLedgerName: 'RCM Input SGST',
  rcmItcIgstLedgerName: 'RCM Input IGST',
  roundOffLedgerName: 'Round Off',
  defaultCashLedgerName: 'Cash',
  defaultBankLedgerName: 'Bank Account'
}

export interface TallyCompoundLeg {
  ledgerName: string
  amount: number
  drCr: 'Dr' | 'Cr'
  itemName?: string
  billedQty?: string
  itemRate?: number
  itemRatePer?: string
  itemAmount?: number
}

export interface TallyCompoundVoucher {
  id: string
  voucherNumber: string
  voucherDate: string // YYYY-MM-DD
  displayDate: string // DD-MM-YYYY
  voucherType: 'Sales' | 'Purchase' | 'Credit Note' | 'Debit Note' | 'Payment' | 'Receipt' | 'Journal' | 'Contra'
  changeMode?: 'Item Invoice' | 'Accounting Invoice'
  partyName: string
  partyAddress?: string
  partyPincode?: string
  partyGstin?: string
  narration?: string
  legs: TallyCompoundLeg[]
  totalAmount: number
  isBalanced: boolean
  imbalanceDifference?: number
}

function formatDateForTally(dateStr?: string): { iso: string; dmy: string; yyyymmdd: string } {
  if (!dateStr) {
    const today = new Date().toISOString().slice(0, 10)
    const parts = today.split('-')
    return {
      iso: today,
      dmy: `${parts[2]}-${parts[1]}-${parts[0]}`,
      yyyymmdd: `${parts[0]}${parts[1]}${parts[2]}`
    }
  }
  const norm = normalizeTallyDate(dateStr)
  if (norm) {
    const parts = norm.isoDate.split('-')
    return {
      iso: norm.isoDate,
      dmy: norm.displayDate,
      yyyymmdd: `${parts[0]}${parts[1]}${parts[2]}`
    }
  }
  const iso = dateStr.slice(0, 10)
  return { iso, dmy: iso, yyyymmdd: iso.replace(/-/g, '') }
}

function validateAndBalanceLegs(legs: TallyCompoundLeg[]): { isBalanced: boolean; diff: number } {
  const drTotal = roundCurrency(legs.filter(l => l.drCr === 'Dr').reduce((s, l) => s + l.amount, 0))
  const crTotal = roundCurrency(legs.filter(l => l.drCr === 'Cr').reduce((s, l) => s + l.amount, 0))
  const diff = roundCurrency(Math.abs(drTotal - crTotal))
  return { isBalanced: diff === 0, diff }
}

/**
 * 1. SALES INVOICES GENERATOR
 * Dr Customer (Gross)
 * Cr Sales Account (Taxable)
 * Cr Output CGST / SGST / IGST
 * Cr/Dr Round Off
 */
export function generateTallySalesVouchers(
  salesInvoices: SalesInvoice[] = [],
  customers: Customer[] = [],
  items: Item[] = [],
  mapping: TallyLedgerMapping = DEFAULT_TALLY_LEDGER_MAPPING,
  companyState: string = '19'
): TallyCompoundVoucher[] {
  const custMap = new Map(customers.map(c => [c.id, c]))

  return salesInvoices.map((inv, idx) => {
    const cust = custMap.get(inv.customerId)
    const partyName = cust?.name || 'Cash Customer'
    const partyState = cust?.stateCode || (cust?.gstin ? cust.gstin.slice(0, 2) : companyState)
    const isInterState = isInterStateTransaction(partyState, companyState)
    const { iso, dmy } = formatDateForTally(inv.invoiceDate)

    const grossAmount = roundCurrency(inv.totalAmount ?? inv.invoiceAmount)
    
    let taxableAmount = inv.taxableAmount !== undefined ? roundCurrency(inv.taxableAmount) : 0
    let igst = roundCurrency(inv.igstAmount ?? 0)
    let cgst = roundCurrency(inv.cgstAmount ?? 0)
    let sgst = roundCurrency(inv.sgstAmount ?? 0)
    let roundOff = roundCurrency(grossAmount - (taxableAmount + igst + cgst + sgst))

    let computedBreakdowns: any[] | undefined

    // If missing taxableAmount or has false round-off >= ₹1.00, recompute dynamically using items master
    if (taxableAmount <= 0 || Math.abs(roundOff) >= 1.00) {
      if (inv.items && inv.items.length > 0) {
        const taxSummary = calculateInvoiceTaxBreakdown({
          items: inv.items,
          itemsMaster: items,
          additionalCostBasicRate: inv.additionalCostBasicRate,
          additionalCostFinal: inv.additionalCost,
          partyState,
          companyState,
          customRoundOff: inv.roundOffAdjustment
        })
        taxableAmount = taxSummary.taxableAmount
        igst = taxSummary.igstAmount
        cgst = taxSummary.cgstAmount
        sgst = taxSummary.sgstAmount
        roundOff = taxSummary.roundOff
        computedBreakdowns = taxSummary.lineBreakdowns
      } else {
        taxableAmount = grossAmount
        igst = 0
        cgst = 0
        sgst = 0
        roundOff = 0
      }
    }

    const legs: TallyCompoundLeg[] = [
      // 1. Dr Customer Ledger (Gross Invoice Value)
      { ledgerName: partyName, amount: grossAmount, drCr: 'Dr' }
    ]

    const itemMap = new Map(items.map(it => [it.id, it]))
    const isItemInvoice = Boolean(inv.items && inv.items.length > 0)

    if (isItemInvoice && inv.items) {
      // Breakdown item lines
      inv.items.forEach((line, lineIdx) => {
        const itemDef = itemMap.get(line.itemId || '')
        const itemName = itemDef?.name || line.itemNameSnapshot || 'Stock Item'
        const unit = itemDef?.unit || line.enteredUnit || line.itemUnitSnapshot || 'PCS'
        const qty = line.baseQuantity ?? line.enteredQuantity ?? 1
        const rate = line.rate ?? (qty > 0 ? (line.taxableAmount ?? line.amount ?? 0) / qty : 0)
        
        let lineTaxable = line.taxableAmount !== undefined ? roundCurrency(line.taxableAmount) : 0
        if (lineTaxable <= 0 && computedBreakdowns && computedBreakdowns[lineIdx]) {
          lineTaxable = computedBreakdowns[lineIdx].taxableAmount
        }
        if (lineTaxable <= 0) {
          if (inv.items && inv.items.length === 1 && taxableAmount > 0) {
            lineTaxable = taxableAmount
          } else {
            lineTaxable = roundCurrency(line.amount ?? (qty * rate))
          }
        }

        legs.push({
          ledgerName: mapping.salesLedgerName,
          amount: lineTaxable,
          drCr: 'Cr',
          itemName,
          billedQty: `${qty.toFixed(3)} ${unit}`,
          itemRate: rate,
          itemRatePer: unit,
          itemAmount: lineTaxable
        })
      })
    } else {
      // 2. Cr Sales Account (Base Taxable)
      legs.push({
        ledgerName: mapping.salesLedgerName,
        amount: taxableAmount,
        drCr: 'Cr'
      })
    }

    // 3. Tax Ledgers
    if (isInterState || igst > 0) {
      if (igst > 0) legs.push({ ledgerName: mapping.outputIgstLedgerName, amount: igst, drCr: 'Cr' })
    } else {
      if (cgst > 0) legs.push({ ledgerName: mapping.outputCgstLedgerName, amount: cgst, drCr: 'Cr' })
      if (sgst > 0) legs.push({ ledgerName: mapping.outputSgstLedgerName, amount: sgst, drCr: 'Cr' })
    }

    // 4. Genuine Round Off (< ₹1.00)
    if (roundOff > 0) {
      legs.push({ ledgerName: mapping.roundOffLedgerName, amount: roundOff, drCr: 'Cr' })
    } else if (roundOff < 0) {
      legs.push({ ledgerName: mapping.roundOffLedgerName, amount: Math.abs(roundOff), drCr: 'Dr' })
    }

    const { isBalanced, diff } = validateAndBalanceLegs(legs)

    return {
      id: inv.id || `sales-${idx}`,
      voucherNumber: inv.invoiceNo,
      voucherDate: iso,
      displayDate: dmy,
      voucherType: 'Sales',
      changeMode: isItemInvoice ? 'Item Invoice' : 'Accounting Invoice',
      partyName,
      partyAddress: [cust?.address, cust?.city, cust?.stateName || getStateName(partyState)].filter(Boolean).join(', '),
      partyPincode: cust?.pincode,
      partyGstin: cust?.gstin,
      narration: `Being Sales Invoice #${inv.invoiceNo} issued to ${partyName}`,
      legs,
      totalAmount: grossAmount,
      isBalanced,
      imbalanceDifference: diff
    }
  })
}

/**
 * 2. PURCHASE INVOICES GENERATOR
 * Cr Supplier (Gross)
 * Dr Purchase Account (Taxable)
 * Dr Input CGST / SGST / IGST
 * Dr/Cr Round Off
 */
export function generateTallyPurchaseVouchers(
  purchaseInvoices: PurchaseInvoice[] = [],
  suppliers: Supplier[] = [],
  items: Item[] = [],
  mapping: TallyLedgerMapping = DEFAULT_TALLY_LEDGER_MAPPING,
  companyState: string = '19'
): TallyCompoundVoucher[] {
  const supMap = new Map(suppliers.map(s => [s.id, s]))

  return purchaseInvoices.map((inv, idx) => {
    const sup = supMap.get(inv.supplierId)
    const partyName = sup?.name || 'Sundry Supplier'
    const partyState = sup?.stateCode || (sup?.gstin ? sup.gstin.slice(0, 2) : companyState)
    const isInterState = isInterStateTransaction(partyState, companyState)
    const { iso, dmy } = formatDateForTally(inv.invoiceDate)

    const grossAmount = roundCurrency(inv.totalAmount ?? inv.invoiceAmount)
    
    let taxableAmount = inv.taxableAmount !== undefined ? roundCurrency(inv.taxableAmount) : 0
    let igst = roundCurrency(inv.igstAmount ?? 0)
    let cgst = roundCurrency(inv.cgstAmount ?? 0)
    let sgst = roundCurrency(inv.sgstAmount ?? 0)
    let roundOff = roundCurrency(grossAmount - (taxableAmount + igst + cgst + sgst))

    let computedBreakdowns: any[] | undefined

    // If missing taxableAmount or has false round-off >= ₹1.00, recompute dynamically using items master
    if (taxableAmount <= 0 || Math.abs(roundOff) >= 1.00) {
      if (inv.items && inv.items.length > 0) {
        const taxSummary = calculateInvoiceTaxBreakdown({
          items: inv.items,
          itemsMaster: items,
          additionalCostBasicRate: inv.additionalCostBasicRate,
          additionalCostFinal: inv.additionalCost,
          partyState,
          companyState,
          customRoundOff: inv.roundOffAdjustment
        })
        taxableAmount = taxSummary.taxableAmount
        igst = taxSummary.igstAmount
        cgst = taxSummary.cgstAmount
        sgst = taxSummary.sgstAmount
        roundOff = taxSummary.roundOff
        computedBreakdowns = taxSummary.lineBreakdowns
      } else {
        taxableAmount = grossAmount
        igst = 0
        cgst = 0
        sgst = 0
        roundOff = 0
      }
    }

    const legs: TallyCompoundLeg[] = [
      // 1. Cr Supplier Ledger (Gross Payable)
      { ledgerName: partyName, amount: grossAmount, drCr: 'Cr' }
    ]

    const itemMap = new Map(items.map(it => [it.id, it]))
    const isItemInvoice = Boolean(inv.items && inv.items.length > 0)

    if (isItemInvoice && inv.items) {
      // Breakdown item lines
      inv.items.forEach((line, lineIdx) => {
        const itemDef = itemMap.get(line.itemId || '')
        const itemName = itemDef?.name || line.itemNameSnapshot || 'Raw Material'
        const unit = itemDef?.unit || line.enteredUnit || line.itemUnitSnapshot || 'TON'
        const qty = line.baseQuantity ?? line.enteredQuantity ?? 1
        const rate = line.rate ?? (qty > 0 ? (line.taxableAmount ?? line.amount ?? 0) / qty : 0)
        
        let lineTaxable = line.taxableAmount !== undefined ? roundCurrency(line.taxableAmount) : 0
        if (lineTaxable <= 0 && computedBreakdowns && computedBreakdowns[lineIdx]) {
          lineTaxable = computedBreakdowns[lineIdx].taxableAmount
        }
        if (lineTaxable <= 0) {
          if (inv.items && inv.items.length === 1 && taxableAmount > 0) {
            lineTaxable = taxableAmount
          } else {
            lineTaxable = roundCurrency(line.amount ?? (qty * rate))
          }
        }

        legs.push({
          ledgerName: mapping.purchaseLedgerName,
          amount: lineTaxable,
          drCr: 'Dr',
          itemName,
          billedQty: `${qty.toFixed(3)} ${unit}`,
          itemRate: rate,
          itemRatePer: unit,
          itemAmount: lineTaxable
        })
      })
    } else {
      // 2. Dr Purchase Account (Base Taxable)
      legs.push({
        ledgerName: mapping.purchaseLedgerName,
        amount: taxableAmount,
        drCr: 'Dr'
      })
    }

    // 3. Tax Ledgers
    if (isInterState || igst > 0) {
      if (igst > 0) legs.push({ ledgerName: mapping.inputIgstLedgerName, amount: igst, drCr: 'Dr' })
    } else {
      if (cgst > 0) legs.push({ ledgerName: mapping.inputCgstLedgerName, amount: cgst, drCr: 'Dr' })
      if (sgst > 0) legs.push({ ledgerName: mapping.inputSgstLedgerName, amount: sgst, drCr: 'Dr' })
    }

    // 4. Genuine Round Off (< ₹1.00)
    if (roundOff > 0) {
      legs.push({ ledgerName: mapping.roundOffLedgerName, amount: roundOff, drCr: 'Dr' })
    } else if (roundOff < 0) {
      legs.push({ ledgerName: mapping.roundOffLedgerName, amount: Math.abs(roundOff), drCr: 'Cr' })
    }

    const { isBalanced, diff } = validateAndBalanceLegs(legs)

    return {
      id: inv.id || `pur-${idx}`,
      voucherNumber: inv.invoiceNo,
      voucherDate: iso,
      displayDate: dmy,
      voucherType: 'Purchase',
      changeMode: isItemInvoice ? 'Item Invoice' : 'Accounting Invoice',
      partyName,
      partyAddress: [sup?.address, sup?.city, sup?.stateName || getStateName(partyState)].filter(Boolean).join(', '),
      partyPincode: sup?.pincode,
      partyGstin: sup?.gstin,
      narration: `Being Purchase Invoice #${inv.invoiceNo} from ${partyName}`,
      legs,
      totalAmount: grossAmount,
      isBalanced,
      imbalanceDifference: diff
    }
  })
}

/**
 * 3. CUSTOMER CREDIT NOTES GENERATOR
 * Cr Customer (Gross)
 * Dr Sales Return / Rate Difference (Taxable)
 * Dr Output CGST / SGST / IGST (Tax Reversal)
 */
export function generateTallyCreditNoteVouchers(
  creditNotes: CustomerCreditNote[] = [],
  customers: Customer[] = [],
  mapping: TallyLedgerMapping = DEFAULT_TALLY_LEDGER_MAPPING,
  companyState: string = '19'
): TallyCompoundVoucher[] {
  const custMap = new Map(customers.map(c => [c.id, c]))

  return creditNotes.map((cn, idx) => {
    const cust = custMap.get(cn.partyId || cn.customerId || '')
    const partyName = cust?.name || 'Customer'
    const partyState = cust?.stateCode || (cust?.gstin ? cust.gstin.slice(0, 2) : companyState)
    const isInterState = isInterStateTransaction(partyState, companyState)
    const { iso, dmy } = formatDateForTally(cn.date)

    const grossAmount = roundCurrency(cn.totalAmount ?? cn.amount)
    const taxableAmount = roundCurrency(cn.taxableAmount ?? grossAmount)
    const igst = roundCurrency(cn.igstAmount ?? 0)
    const cgst = roundCurrency(cn.cgstAmount ?? 0)
    const sgst = roundCurrency(cn.sgstAmount ?? 0)

    const legs: TallyCompoundLeg[] = [
      // 1. Cr Customer (Party Credit)
      { ledgerName: partyName, amount: grossAmount, drCr: 'Cr' },
      // 2. Dr Sales Return (Taxable Reversal)
      { ledgerName: mapping.salesReturnLedgerName, amount: taxableAmount, drCr: 'Dr' }
    ]

    if (isInterState || igst > 0) {
      if (igst > 0) legs.push({ ledgerName: mapping.outputIgstLedgerName, amount: igst, drCr: 'Dr' })
    } else {
      if (cgst > 0) legs.push({ ledgerName: mapping.outputCgstLedgerName, amount: cgst, drCr: 'Dr' })
      if (sgst > 0) legs.push({ ledgerName: mapping.outputSgstLedgerName, amount: sgst, drCr: 'Dr' })
    }

    const { isBalanced, diff } = validateAndBalanceLegs(legs)

    return {
      id: cn.id || `cn-${idx}`,
      voucherNumber: cn.noteNo || cn.invoiceRef || `CN-${idx + 1}`,
      voucherDate: iso,
      displayDate: dmy,
      voucherType: 'Credit Note',
      partyName,
      partyAddress: [cust?.address, cust?.city].filter(Boolean).join(', '),
      partyPincode: cust?.pincode,
      partyGstin: cust?.gstin,
      narration: `Being Credit Note #${cn.noteNo || cn.invoiceRef} issued against Invoice #${cn.originalInvoiceNo || '-'} dt ${cn.originalInvoiceDate || '-'} for reason: ${cn.reason || 'Sales Return'}`,
      legs,
      totalAmount: grossAmount,
      isBalanced,
      imbalanceDifference: diff
    }
  })
}

/**
 * 4. SUPPLIER DEBIT NOTES GENERATOR
 * Dr Supplier (Gross)
 * Cr Purchase Return (Taxable)
 * Cr Input CGST / SGST / IGST (ITC Reversal)
 */
export function generateTallyDebitNoteVouchers(
  debitNotes: SupplierDebitNote[] = [],
  suppliers: Supplier[] = [],
  mapping: TallyLedgerMapping = DEFAULT_TALLY_LEDGER_MAPPING,
  companyState: string = '19'
): TallyCompoundVoucher[] {
  const supMap = new Map(suppliers.map(s => [s.id, s]))

  return debitNotes.map((dn, idx) => {
    const sup = supMap.get(dn.partyId || dn.supplierId || '')
    const partyName = sup?.name || 'Supplier'
    const partyState = sup?.stateCode || (sup?.gstin ? sup.gstin.slice(0, 2) : companyState)
    const isInterState = isInterStateTransaction(partyState, companyState)
    const { iso, dmy } = formatDateForTally(dn.date)

    const grossAmount = roundCurrency(dn.totalAmount ?? dn.amount)
    const taxableAmount = roundCurrency(dn.taxableAmount ?? grossAmount)
    const igst = roundCurrency(dn.igstAmount ?? 0)
    const cgst = roundCurrency(dn.cgstAmount ?? 0)
    const sgst = roundCurrency(dn.sgstAmount ?? 0)

    const legs: TallyCompoundLeg[] = [
      // 1. Dr Supplier (Party Debit)
      { ledgerName: partyName, amount: grossAmount, drCr: 'Dr' },
      // 2. Cr Purchase Return (Taxable Reduction)
      { ledgerName: mapping.purchaseReturnLedgerName, amount: taxableAmount, drCr: 'Cr' }
    ]

    if (isInterState || igst > 0) {
      if (igst > 0) legs.push({ ledgerName: mapping.inputIgstLedgerName, amount: igst, drCr: 'Cr' })
    } else {
      if (cgst > 0) legs.push({ ledgerName: mapping.inputCgstLedgerName, amount: cgst, drCr: 'Cr' })
      if (sgst > 0) legs.push({ ledgerName: mapping.inputSgstLedgerName, amount: sgst, drCr: 'Cr' })
    }

    const { isBalanced, diff } = validateAndBalanceLegs(legs)

    return {
      id: dn.id || `dn-${idx}`,
      voucherNumber: dn.noteNo || dn.invoiceRef || `DN-${idx + 1}`,
      voucherDate: iso,
      displayDate: dmy,
      voucherType: 'Debit Note',
      partyName,
      partyAddress: [sup?.address, sup?.city].filter(Boolean).join(', '),
      partyPincode: sup?.pincode,
      partyGstin: sup?.gstin,
      narration: `Being Debit Note #${dn.noteNo || dn.invoiceRef} issued against Purchase Invoice #${dn.originalInvoiceNo || '-'} dt ${dn.originalInvoiceDate || '-'} for reason: ${dn.reason || 'Purchase Return'}`,
      legs,
      totalAmount: grossAmount,
      isBalanced,
      imbalanceDifference: diff
    }
  })
}

/**
 * 5. EXPENSE & GTA RCM VOUCHERS GENERATOR
 * - Standard GST Expense: Dr Expense Ledger, Dr Input Tax, Cr Cash/Bank
 * - GTA 5% RCM: Dual entries (Dr Expense / Cr Cash + Dr RCM ITC / Cr RCM Liability)
 */
export function generateTallyExpenseVouchers(
  expenseEntries: ExpenseEntry[] = [],
  expenseTypes: ExpenseType[] = [],
  mapping: TallyLedgerMapping = DEFAULT_TALLY_LEDGER_MAPPING,
  companyState: string = '19'
): TallyCompoundVoucher[] {
  const vouchers: TallyCompoundVoucher[] = []
  const catMap = new Map(expenseTypes.map(t => [t.id, t]))

  expenseEntries.forEach((exp, idx) => {
    const rawGstin = (exp.supplierGstin || (exp as any).vendorGstin || '').trim().toUpperCase()
    const partyState = exp.supplierStateCode || (rawGstin ? rawGstin.slice(0, 2) : companyState)
    const isInterState = isInterStateTransaction(partyState, companyState)
    const { iso, dmy } = formatDateForTally(exp.expenseDate)

    const cat = catMap.get(exp.expenseTypeId || exp.categoryId || '')
    const categoryName = cat?.name || exp.categoryName || 'General Expense'
    const expenseLedger = exp.supplierName ? `${categoryName} - ${exp.supplierName}` : categoryName
    const paymentAccount = mapping.defaultBankLedgerName

    const grossAmount = roundCurrency(exp.totalExpenseAmount ?? exp.amount)
    let taxableAmount = exp.taxableAmount !== undefined ? roundCurrency(exp.taxableAmount) : grossAmount
    let igst = roundCurrency(exp.igstAmount ?? 0)
    let cgst = roundCurrency(exp.cgstAmount ?? 0)
    let sgst = roundCurrency(exp.sgstAmount ?? 0)

    if (exp.hasGst) {
      if (cgst === 0 && sgst === 0 && igst === 0) {
        const tax = calculateExpenseTaxBreakdown({
          amount: grossAmount,
          hasGst: true,
          isTaxInclusive: exp.isTaxInclusive ?? true,
          gstRate: exp.gstRate ?? 18,
          supplierStateCode: partyState,
          companyStateCode: companyState
        })
        taxableAmount = tax.taxableAmount
        igst = tax.igstAmount
        cgst = tax.cgstAmount
        sgst = tax.sgstAmount
      }
    }

    if (exp.isRcm) {
      // GTA RCM Entry:
      // Voucher 1: Payment to Transporter (Tax-exclusive amount)
      const payLegs: TallyCompoundLeg[] = [
        { ledgerName: expenseLedger, amount: grossAmount, drCr: 'Dr' },
        { ledgerName: paymentAccount, amount: grossAmount, drCr: 'Cr' }
      ]
      vouchers.push({
        id: `exp-rcm-pay-${idx}`,
        voucherNumber: exp.invoiceRefNo || (exp as any).voucherNo || `EXP-${idx + 1}`,
        voucherDate: iso,
        displayDate: dmy,
        voucherType: 'Payment',
        partyName: exp.supplierName || 'Transporter',
        partyGstin: rawGstin,
        narration: `Being freight paid to ${exp.supplierName || 'Transporter'} under Reverse Charge (GTA RCM 5%)`,
        legs: payLegs,
        totalAmount: grossAmount,
        isBalanced: true,
        imbalanceDifference: 0
      })

      // Voucher 2: Journal Voucher for RCM Tax Liability & Input Credit
      if (igst > 0 || (cgst + sgst) > 0) {
        const jrnLegs: TallyCompoundLeg[] = []
        if (isInterState || igst > 0) {
          jrnLegs.push({ ledgerName: mapping.rcmItcIgstLedgerName, amount: igst, drCr: 'Dr' })
          jrnLegs.push({ ledgerName: mapping.rcmLiabilityIgstLedgerName, amount: igst, drCr: 'Cr' })
        } else {
          jrnLegs.push({ ledgerName: mapping.rcmItcCgstLedgerName, amount: cgst, drCr: 'Dr' })
          jrnLegs.push({ ledgerName: mapping.rcmItcSgstLedgerName, amount: sgst, drCr: 'Dr' })
          jrnLegs.push({ ledgerName: mapping.rcmLiabilityCgstLedgerName, amount: cgst, drCr: 'Cr' })
          jrnLegs.push({ ledgerName: mapping.rcmLiabilitySgstLedgerName, amount: sgst, drCr: 'Cr' })
        }
        vouchers.push({
          id: `exp-rcm-jrn-${idx}`,
          voucherNumber: `RCM-${exp.invoiceRefNo || (exp as any).voucherNo || (idx + 1)}`,
          voucherDate: iso,
          displayDate: dmy,
          voucherType: 'Journal',
          partyName: 'RCM Tax Liability Adjustment',
          narration: `Being RCM tax liability booked and ITC claimed under Section 9(3) on freight voucher #${exp.invoiceRefNo || (exp as any).voucherNo || '-'}`,
          legs: jrnLegs,
          totalAmount: roundCurrency(igst + cgst + sgst),
          isBalanced: true,
          imbalanceDifference: 0
        })
      }
    } else {
      // Standard GST Expense
      const legs: TallyCompoundLeg[] = [
        { ledgerName: expenseLedger, amount: taxableAmount, drCr: 'Dr' }
      ]

      if (isInterState || igst > 0) {
        if (igst > 0) legs.push({ ledgerName: mapping.inputIgstLedgerName, amount: igst, drCr: 'Dr' })
      } else {
        if (cgst > 0) legs.push({ ledgerName: mapping.inputCgstLedgerName, amount: cgst, drCr: 'Dr' })
        if (sgst > 0) legs.push({ ledgerName: mapping.inputSgstLedgerName, amount: sgst, drCr: 'Dr' })
      }

      legs.push({ ledgerName: paymentAccount, amount: grossAmount, drCr: 'Cr' })

      const { isBalanced, diff } = validateAndBalanceLegs(legs)

      vouchers.push({
        id: `exp-${idx}`,
        voucherNumber: exp.invoiceRefNo || (exp as any).voucherNo || `EXP-${idx + 1}`,
        voucherDate: iso,
        displayDate: dmy,
        voucherType: 'Payment',
        partyName: exp.supplierName || 'Expense Payee',
        partyGstin: rawGstin,
        narration: `Being expense paid for ${categoryName} to ${exp.supplierName || 'Payee'}`,
        legs,
        totalAmount: grossAmount,
        isBalanced,
        imbalanceDifference: diff
      })
    }
  })

  return vouchers
}

/**
 * 6. MULTI-SHEET TALLY PRIME EXCEL EXPORTER
 * Exports all compound vouchers into Tally's canonical 8-column layout.
 */
export function exportCompoundVouchersToTallyExcel(
  vouchers: TallyCompoundVoucher[],
  options?: { filename?: string; sheetName?: string }
): {
  workbook: XLSX.WorkBook
  buffer: Uint8Array
  filename: string
  rowCount: number
} {
  const filename = options?.filename || `Tally_Prime_Export_${Date.now()}.xlsx`
  const sheetName = options?.sheetName || 'Accounting Voucher'

  const exportRows: TallyExportRow[] = []

  vouchers.forEach(v => {
    const address = v.partyAddress || ''
    const pincode = v.partyPincode || ''
    const changeMode = v.changeMode || (v.legs.some(l => !!l.itemName) ? 'Item Invoice' : 'Accounting Invoice')

    v.legs.forEach(leg => {
      exportRows.push({
        'Voucher Date': v.displayDate || v.voucherDate,
        'Voucher Type Name': v.voucherType,
        'Voucher Number': v.voucherNumber,
        'Buyer/Supplier - Address': address,
        'Buyer/Supplier - Pincode': pincode,
        'Ledger Name': leg.ledgerName,
        'Ledger Amount': roundCurrency(leg.amount),
        'Ledger Amount Dr/Cr': leg.drCr,
        'Item Name': leg.itemName || '',
        'Billed Quantity': leg.billedQty || '',
        'Item Rate': leg.itemRate !== undefined ? leg.itemRate : '',
        'Item Rate per': leg.itemRatePer || '',
        'Item Amount': leg.itemAmount !== undefined ? roundCurrency(leg.itemAmount) : '',
        'Change Mode': changeMode
      })
    })
  })

  const worksheet = XLSX.utils.json_to_sheet(exportRows, {
    header: [...TALLY_COLUMN_HEADERS]
  })

  worksheet['!cols'] = [
    { wch: 14 }, // Voucher Date
    { wch: 20 }, // Voucher Type Name
    { wch: 18 }, // Voucher Number
    { wch: 28 }, // Buyer/Supplier - Address
    { wch: 24 }, // Buyer/Supplier - Pincode
    { wch: 32 }, // Ledger Name
    { wch: 16 }, // Ledger Amount
    { wch: 20 }, // Ledger Amount Dr/Cr
    { wch: 28 }, // Item Name
    { wch: 18 }, // Billed Quantity
    { wch: 14 }, // Item Rate
    { wch: 14 }, // Item Rate per
    { wch: 16 }, // Item Amount
    { wch: 20 }  // Change Mode
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)

  const rawBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  const buffer = new Uint8Array(rawBuffer)

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      XLSX.writeFile(workbook, filename)
    }
  }

  return {
    workbook,
    buffer,
    filename,
    rowCount: exportRows.length
  }
}

/**
 * 7. TALLY XML EXPORTER (Direct Port 9000 & XML Import Compatible)
 * Produces standard Tally XML format with <TALLYMESSAGE> envelopes.
 */
export function generateTallyXML(
  vouchers: TallyCompoundVoucher[],
  companyName: string = 'SK TRADERS'
): string {
  let xml = '<?xml version="1.0" encoding="utf-8"?>\n'
  xml += '<ENVELOPE>\n'
  xml += '  <HEADER>\n'
  xml += '    <TALLYREQUEST>Import Data</TALLYREQUEST>\n'
  xml += '  </HEADER>\n'
  xml += '  <BODY>\n'
  xml += '    <IMPORTDATA>\n'
  xml += '      <REQUESTDESC>\n'
  xml += '        <REPORTNAME>Vouchers</REPORTNAME>\n'
  xml += '        <STATICVARIABLES>\n'
  xml += `          <SVCURRENTCOMPANY>${escapeXML(companyName)}</SVCURRENTCOMPANY>\n`
  xml += '        </STATICVARIABLES>\n'
  xml += '      </REQUESTDESC>\n'
  xml += '      <REQUESTDATA>\n'

  vouchers.forEach(v => {
    const { yyyymmdd } = formatDateForTally(v.voucherDate)

    xml += '        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n'
    xml += `          <VOUCHER VCHTYPE="${escapeXML(v.voucherType)}" ACTION="Create" OBJVIEW="Accounting Voucher View">\n`
    xml += `            <DATE>${yyyymmdd}</DATE>\n`
    xml += `            <VOUCHERTYPENAME>${escapeXML(v.voucherType)}</VOUCHERTYPENAME>\n`
    xml += `            <VOUCHERNUMBER>${escapeXML(v.voucherNumber)}</VOUCHERNUMBER>\n`
    xml += `            <PARTYLEDGERNAME>${escapeXML(v.partyName)}</PARTYLEDGERNAME>\n`
    xml += `            <NARRATION>${escapeXML(v.narration)}</NARRATION>\n`

    if (v.partyGstin) {
      xml += `            <PARTYGSTIN>${escapeXML(v.partyGstin)}</PARTYGSTIN>\n`
    }

    v.legs.forEach(leg => {
      const isDebit = leg.drCr === 'Dr'
      // Tally XML convention: Dr is negative (-amount), Cr is positive (+amount)
      const xmlAmount = isDebit ? -leg.amount : leg.amount

      if (leg.itemName) {
        const uom = leg.itemRatePer || 'PCS'
        const qtyStr = leg.billedQty || `1.000 ${uom}`
        xml += '            <ALLINVENTORYENTRIES.LIST>\n'
        xml += `              <STOCKITEMNAME>${escapeXML(leg.itemName)}</STOCKITEMNAME>\n`
        xml += `              <ISDEEMEDPOSITIVE>${isDebit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>\n`
        xml += `              <RATE>${leg.itemRate !== undefined ? Number(leg.itemRate).toFixed(2) : '0.00'}/${escapeXML(uom)}</RATE>\n`
        xml += `              <AMOUNT>${xmlAmount.toFixed(2)}</AMOUNT>\n`
        xml += `              <ACTUALQTY>${escapeXML(qtyStr)}</ACTUALQTY>\n`
        xml += `              <BILLEDQTY>${escapeXML(qtyStr)}</BILLEDQTY>\n`
        xml += '              <ACCOUNTINGALLOCATIONSLIST.LIST>\n'
        xml += `                <LEDGERNAME>${escapeXML(leg.ledgerName)}</LEDGERNAME>\n`
        xml += `                <ISDEEMEDPOSITIVE>${isDebit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>\n`
        xml += `                <AMOUNT>${xmlAmount.toFixed(2)}</AMOUNT>\n`
        xml += '              </ACCOUNTINGALLOCATIONSLIST.LIST>\n'
        xml += '            </ALLINVENTORYENTRIES.LIST>\n'
      } else {
        xml += '            <ALLLEDGERENTRIES.LIST>\n'
        xml += `              <LEDGERNAME>${escapeXML(leg.ledgerName)}</LEDGERNAME>\n`
        xml += `              <ISDEEMEDPOSITIVE>${isDebit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>\n`
        xml += `              <AMOUNT>${xmlAmount.toFixed(2)}</AMOUNT>\n`
        xml += '            </ALLLEDGERENTRIES.LIST>\n'
      }
    })

    xml += '          </VOUCHER>\n'
    xml += '        </TALLYMESSAGE>\n'
  })

  xml += '      </REQUESTDATA>\n'
  xml += '    </IMPORTDATA>\n'
  xml += '  </BODY>\n'
  xml += '</ENVELOPE>'

  return xml
}

function escapeXML(str?: string): string {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function downloadTallyXML(xmlContent: string, filename: string = 'Tally_Import_Vouchers.xml') {
  const blob = new Blob([xmlContent], { type: 'application/xml;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
