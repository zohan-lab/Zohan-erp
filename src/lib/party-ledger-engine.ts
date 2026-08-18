import {
  Party,
  SalesInvoice,
  PurchaseInvoice,
  Payment,
  CustomerPayment,
  CreditNote,
  DebitNote,
  SalesReturn,
  PurchaseReturn
} from './types'

export type UnifiedVoucherType =
  | 'Opening Balance'
  | 'Sale'
  | 'Purchase'
  | 'Payment In'
  | 'Payment Out'
  | 'Credit Note'
  | 'Debit Note'
  | 'Sales Return'
  | 'Purchase Return'

export interface UnifiedLedgerRow {
  id: string
  date: string
  voucherType: UnifiedVoucherType
  voucherNo: string
  reference?: string
  debit: number
  credit: number
  runningBalance: number
  balanceType: 'Dr' | 'Cr'
  narration?: string
  sourceId: string
  rawItem?: any
}

export interface PartyLedgerSummary {
  party: Party
  openingBalance: number
  openingBalanceType: 'Dr' | 'Cr'
  totalSales: number
  totalPurchases: number
  totalPaymentsIn: number
  totalPaymentsOut: number
  totalCreditNotes: number
  totalDebitNotes: number
  totalSalesReturns: number
  totalPurchaseReturns: number
  totalDebit: number
  totalCredit: number
  closingBalance: number
  closingBalanceType: 'Dr' | 'Cr'
  receivableAmount: number // Dr balance
  payableAmount: number // Cr balance
  rows: UnifiedLedgerRow[]
}

export interface PartyLedgerInput {
  party: Party
  salesInvoices?: SalesInvoice[]
  invoices?: PurchaseInvoice[] // Purchase invoices
  customerPayments?: CustomerPayment[] // Payment In
  payments?: Payment[] // Payment Out
  creditNotes?: CreditNote[] // Sales or unified credit notes
  supplierCreditNotes?: CreditNote[]
  debitNotes?: DebitNote[] // Purchase or unified debit notes
  customerDebitNotes?: DebitNote[]
  salesReturns?: SalesReturn[]
  purchaseReturns?: PurchaseReturn[]
  startDate?: string
  endDate?: string
}

/**
 * Calculates the comprehensive 360° ledger for a given Party across all 8 transaction types.
 */
export function calculatePartyLedger(input: PartyLedgerInput): PartyLedgerSummary {
  const { party, startDate, endDate } = input
  const partyId = party.id

  const rawRows: Array<{
    id: string
    date: string
    voucherType: UnifiedVoucherType
    voucherNo: string
    reference?: string
    debit: number
    credit: number
    narration?: string
    sourceId: string
    rawItem?: any
  }> = []

  // 1. Opening Balance
  let opBal = party.openingBalance || 0
  let opBalType: 'Dr' | 'Cr' = (party.balanceType === 'Credit' || opBal < 0) ? 'Cr' : 'Dr'
  let normalizedOpBal = Math.abs(opBal)

  // 2. Sales Invoices -> Debit (Increases Party Receivable)
  const sales = (input.salesInvoices || []).filter(
    inv => inv.partyId === partyId || inv.customerId === partyId
  )
  for (const inv of sales) {
    const amount = Number(inv.totalAmount || inv.invoiceAmount || 0)
    rawRows.push({
      id: `sale-${inv.id}`,
      date: inv.invoiceDate || '',
      voucherType: 'Sale',
      voucherNo: inv.invoiceNo || 'INV',
      reference: inv.orderDate,
      debit: amount,
      credit: 0,
      narration: inv.additionalCostRemarks || 'Sales Invoice',
      sourceId: inv.id,
      rawItem: inv
    })
  }

  // 3. Purchase Invoices -> Credit (Increases Company Payable to Party)
  const purchases = (input.invoices || []).filter(
    inv => inv.partyId === partyId || inv.supplierId === partyId
  )
  for (const inv of purchases) {
    const amount = Number(inv.totalAmount || inv.invoiceAmount || 0)
    rawRows.push({
      id: `pur-${inv.id}`,
      date: inv.invoiceDate || '',
      voucherType: 'Purchase',
      voucherNo: inv.invoiceNo || 'PINV',
      reference: inv.orderDate,
      debit: 0,
      credit: amount,
      narration: inv.additionalCostRemarks || 'Purchase Invoice',
      sourceId: inv.id,
      rawItem: inv
    })
  }

  // 4. Payment In (Customer Payments) -> Credit (Reduces Party Receivable / Advance Received)
  const paymentsIn = (input.customerPayments || []).filter(
    p => p.partyId === partyId || p.customerId === partyId
  )
  for (const p of paymentsIn) {
    const amount = Number(p.amount || 0)
    rawRows.push({
      id: `payin-${p.id}`,
      date: p.paymentDate || '',
      voucherType: 'Payment In',
      voucherNo: p.id || 'RCT',
      reference: p.paymentMode,
      debit: 0,
      credit: amount,
      narration: p.notes || `Received via ${p.paymentMode || 'Bank/Cash'}`,
      sourceId: p.id,
      rawItem: p
    })
  }

  // 5. Payment Out (Supplier Payments) -> Debit (Reduces Company Payable / Advance Paid)
  const paymentsOut = (input.payments || []).filter(
    p => p.partyId === partyId || p.supplierId === partyId
  )
  for (const p of paymentsOut) {
    const amount = Number(p.amount || 0)
    rawRows.push({
      id: `payout-${p.id}`,
      date: p.paymentDate || '',
      voucherType: 'Payment Out',
      voucherNo: p.id || 'PMT',
      reference: p.paymentMode,
      debit: amount,
      credit: 0,
      narration: `Paid via ${p.paymentMode || 'Bank/Cash'}`,
      sourceId: p.id,
      rawItem: p
    })
  }

  // 6. Credit Notes -> Credit (Reduces Receivable if customer, or reduces Payable if supplier rebate)
  const allCreditNotes = [
    ...(input.creditNotes || []),
    ...(input.supplierCreditNotes || [])
  ].filter(
    (cn, idx, arr) =>
      (cn.partyId === partyId || cn.customerId === partyId || cn.supplierId === partyId) &&
      arr.findIndex(x => x.id === cn.id) === idx
  )
  for (const cn of allCreditNotes) {
    const amount = Number(cn.totalAmount || cn.amount || 0)
    rawRows.push({
      id: `cn-${cn.id}`,
      date: cn.date || '',
      voucherType: 'Credit Note',
      voucherNo: cn.noteNo || cn.id || 'CN',
      reference: cn.originalInvoiceNo || cn.invoiceRef,
      debit: 0,
      credit: amount,
      narration: cn.reason || cn.remarks || 'Credit Note',
      sourceId: cn.id,
      rawItem: cn
    })
  }

  // 7. Debit Notes -> Debit (Increases Receivable or reduces Payable)
  const allDebitNotes = [
    ...(input.debitNotes || []),
    ...(input.customerDebitNotes || [])
  ].filter(
    (dn, idx, arr) =>
      (dn.partyId === partyId || dn.customerId === partyId || dn.supplierId === partyId) &&
      arr.findIndex(x => x.id === dn.id) === idx
  )
  for (const dn of allDebitNotes) {
    const amount = Number(dn.totalAmount || dn.amount || 0)
    rawRows.push({
      id: `dn-${dn.id}`,
      date: dn.date || '',
      voucherType: 'Debit Note',
      voucherNo: dn.noteNo || dn.id || 'DN',
      reference: dn.originalInvoiceNo || dn.invoiceRef,
      debit: amount,
      credit: 0,
      narration: dn.reason || dn.remarks || 'Debit Note',
      sourceId: dn.id,
      rawItem: dn
    })
  }

  // 8. Sales Returns -> Credit (Reduces Sales Receivable)
  const salesReturns = (input.salesReturns || []).filter(
    sr => sr.partyId === partyId || sr.customerId === partyId
  )
  for (const sr of salesReturns) {
    const amount = Number(sr.totalAmount || sr.amount || 0)
    rawRows.push({
      id: `sr-${sr.id}`,
      date: sr.returnDate || '',
      voucherType: 'Sales Return',
      voucherNo: sr.returnNo || sr.id || 'SR',
      reference: sr.invoiceRef,
      debit: 0,
      credit: amount,
      narration: sr.remarks || 'Sales Return',
      sourceId: sr.id,
      rawItem: sr
    })
  }

  // 9. Purchase Returns -> Debit (Reduces Purchase Payable)
  const purchaseReturns = (input.purchaseReturns || []).filter(
    pr => pr.partyId === partyId || pr.supplierId === partyId
  )
  for (const pr of purchaseReturns) {
    const amount = Number(pr.totalAmount || pr.amount || 0)
    rawRows.push({
      id: `pr-${pr.id}`,
      date: pr.returnDate || '',
      voucherType: 'Purchase Return',
      voucherNo: pr.returnNo || pr.id || 'PR',
      reference: pr.invoiceRef,
      debit: amount,
      credit: 0,
      narration: pr.remarks || 'Purchase Return',
      sourceId: pr.id,
      rawItem: pr
    })
  }

  // Sort rows chronologically by date
  rawRows.sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0
    const db = b.date ? new Date(b.date).getTime() : 0
    return da - db
  })

  // Date Filter & Prior Period Balance
  let effectiveOpDr = opBalType === 'Dr' ? normalizedOpBal : 0
  let effectiveOpCr = opBalType === 'Cr' ? normalizedOpBal : 0

  const filteredRows: typeof rawRows = []
  for (const row of rawRows) {
    if (startDate && row.date && row.date < startDate) {
      // Accumulate into prior period opening balance
      effectiveOpDr += row.debit
      effectiveOpCr += row.credit
      continue
    }
    if (endDate && row.date && row.date > endDate) {
      continue
    }
    filteredRows.push(row)
  }

  // Compute final Opening Row
  const priorNet = effectiveOpDr - effectiveOpCr
  const computedOpBalance = Math.abs(priorNet)
  const computedOpType: 'Dr' | 'Cr' = priorNet >= 0 ? 'Dr' : 'Cr'

  // Running Ledger Calculation
  let currentBalance = priorNet
  const finalRows: UnifiedLedgerRow[] = []

  // Add initial opening row if non-zero or explicitly specified
  if (computedOpBalance > 0 || party.openingBalanceDate) {
    finalRows.push({
      id: `op-${partyId}`,
      date: party.openingBalanceDate || startDate || '2020-01-01',
      voucherType: 'Opening Balance',
      voucherNo: 'OP-BAL',
      debit: computedOpType === 'Dr' ? computedOpBalance : 0,
      credit: computedOpType === 'Cr' ? computedOpBalance : 0,
      runningBalance: computedOpBalance,
      balanceType: computedOpType,
      narration: 'Opening Balance Recorded',
      sourceId: partyId
    })
  }

  let totalDebit = computedOpType === 'Dr' ? computedOpBalance : 0
  let totalCredit = computedOpType === 'Cr' ? computedOpBalance : 0

  for (const row of filteredRows) {
    currentBalance += (row.debit - row.credit)
    totalDebit += row.debit
    totalCredit += row.credit

    const rowBalType: 'Dr' | 'Cr' = currentBalance >= 0 ? 'Dr' : 'Cr'
    finalRows.push({
      ...row,
      runningBalance: Math.abs(currentBalance),
      balanceType: rowBalType
    })
  }

  const closingBalance = Math.abs(currentBalance)
  const closingBalanceType: 'Dr' | 'Cr' = currentBalance >= 0 ? 'Dr' : 'Cr'

  // KPI Totals
  let totalSales = 0
  let totalPurchases = 0
  let totalPaymentsIn = 0
  let totalPaymentsOut = 0
  let totalCreditNotes = 0
  let totalDebitNotes = 0
  let totalSalesReturns = 0
  let totalPurchaseReturns = 0

  for (const r of filteredRows) {
    if (r.voucherType === 'Sale') totalSales += r.debit
    else if (r.voucherType === 'Purchase') totalPurchases += r.credit
    else if (r.voucherType === 'Payment In') totalPaymentsIn += r.credit
    else if (r.voucherType === 'Payment Out') totalPaymentsOut += r.debit
    else if (r.voucherType === 'Credit Note') totalCreditNotes += r.credit
    else if (r.voucherType === 'Debit Note') totalDebitNotes += r.debit
    else if (r.voucherType === 'Sales Return') totalSalesReturns += r.credit
    else if (r.voucherType === 'Purchase Return') totalPurchaseReturns += r.debit
  }

  return {
    party,
    openingBalance: computedOpBalance,
    openingBalanceType: computedOpType,
    totalSales,
    totalPurchases,
    totalPaymentsIn,
    totalPaymentsOut,
    totalCreditNotes,
    totalDebitNotes,
    totalSalesReturns,
    totalPurchaseReturns,
    totalDebit,
    totalCredit,
    closingBalance,
    closingBalanceType,
    receivableAmount: closingBalanceType === 'Dr' ? closingBalance : 0,
    payableAmount: closingBalanceType === 'Cr' ? closingBalance : 0,
    rows: finalRows
  }
}
