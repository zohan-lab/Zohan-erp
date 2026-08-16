import * as XLSX from 'xlsx'
import {
  TallyRawExcelRow,
  PaymentVoucher,
  TallyExportRow,
  TallyImportResult,
  TallyVoucherType,
  ImportSummary,
  ExportOptions
} from './tally-payment-types'
import { Customer, Supplier, Item, ExpenseType } from './types'
import { TallyParsedXmlVoucher, TallyXmlImportResult, normalizeTallyVoucherType } from './tally-xml-parser'

// Re-export all types so callers can import everything from this single module
export * from './tally-payment-types'

/**
 * Official 14-Column Tally Prime Column Header Keys (canonical order A-N)
 */
export const TALLY_COLUMN_HEADERS = [
  'Voucher Date',
  'Voucher Type Name',
  'Voucher Number',
  'Buyer/Supplier - Address',
  'Buyer/Supplier - Pincode',
  'Ledger Name',
  'Ledger Amount',
  'Ledger Amount Dr/Cr',
  'Item Name',
  'Billed Quantity',
  'Item Rate',
  'Item Rate per',
  'Item Amount',
  'Change Mode'
] as const

/**
 * Helper to normalize key names for forgiving lookup
 */
function normalizeKey(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Find value in row by fuzzy match against canonical header names
 */
function getRowField(row: TallyRawExcelRow, ...aliases: string[]): any {
  const rowKeys = Object.keys(row)
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== null && row[alias] !== '') {
      return row[alias]
    }
    const normAlias = normalizeKey(alias)
    const matchKey = rowKeys.find(k => normalizeKey(k) === normAlias)
    if (matchKey && row[matchKey] !== undefined && row[matchKey] !== null && row[matchKey] !== '') {
      return row[matchKey]
    }
  }
  return undefined
}

/**
 * Robust date parser supporting Excel serial numbers, Date objects,
 * and string formats like DD-MM-YYYY, YYYY-MM-DD, DD/MM/YYYY, DD-MMM-YYYY.
 */
export function normalizeTallyDate(value: any): { isoDate: string; displayDate: string } | null {
  if (value === null || value === undefined || value === '') return null

  // 1. Excel serial number (e.g., 45321)
  if (typeof value === 'number' && !isNaN(value) && value > 0) {
    try {
      const dateObj = XLSX.SSF.parse_date_code(value)
      if (dateObj && dateObj.y && dateObj.m && dateObj.d) {
        const y = String(dateObj.y).padStart(4, '0')
        const m = String(dateObj.m).padStart(2, '0')
        const d = String(dateObj.d).padStart(2, '0')
        return {
          isoDate: `${y}-${m}-${d}`,
          displayDate: `${d}-${m}-${y}`
        }
      }
    } catch {
      // fallback
    }
  }

  // 2. JavaScript Date Object
  if (value instanceof Date && !isNaN(value.getTime())) {
    const y = String(value.getFullYear()).padStart(4, '0')
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return {
      isoDate: `${y}-${m}-${d}`,
      displayDate: `${d}-${m}-${y}`
    }
  }

  // 3. String representation
  const str = String(value).trim()
  if (!str) return null

  // If string is numeric serial number (e.g. "45321")
  if (/^\d{5}$/.test(str)) {
    const num = Number(str)
    return normalizeTallyDate(num)
  }

  // ISO format: YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (isoMatch) {
    const y = isoMatch[1]
    const m = isoMatch[2].padStart(2, '0')
    const d = isoMatch[3].padStart(2, '0')
    return {
      isoDate: `${y}-${m}-${d}`,
      displayDate: `${d}-${m}-${y}`
    }
  }

  // Indian/UK format: DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/)
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0')
    const m = dmyMatch[2].padStart(2, '0')
    let y = dmyMatch[3]
    if (y.length === 2) {
      y = Number(y) > 50 ? `19${y}` : `20${y}`
    }
    return {
      isoDate: `${y}-${m}-${d}`,
      displayDate: `${d}-${m}-${y}`
    }
  }

  // Text month format: 01-Apr-2024 or 1-Apr-24 or 01 Apr 2024
  const monthMap: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  }
  const textMonthMatch = str.match(/^(\d{1,2})[-/\s]([a-zA-Z]{3,9})[-/\s](\d{2,4})/)
  if (textMonthMatch) {
    const d = textMonthMatch[1].padStart(2, '0')
    const monthKey = textMonthMatch[2].substring(0, 3).toLowerCase()
    const m = monthMap[monthKey] || '01'
    let y = textMonthMatch[3]
    if (y.length === 2) {
      y = Number(y) > 50 ? `19${y}` : `20${y}`
    }
    return {
      isoDate: `${y}-${m}-${d}`,
      displayDate: `${d}-${m}-${y}`
    }
  }

  // Fallback to JS Date parse
  const parsed = new Date(str)
  if (!isNaN(parsed.getTime())) {
    const y = String(parsed.getFullYear()).padStart(4, '0')
    const m = String(parsed.getMonth() + 1).padStart(2, '0')
    const d = String(parsed.getDate()).padStart(2, '0')
    return {
      isoDate: `${y}-${m}-${d}`,
      displayDate: `${d}-${m}-${y}`
    }
  }

  return null
}

/**
 * Clean & parse numeric amounts from string/number
 */
export function parseTallyAmount(value: any): number {
  if (typeof value === 'number') {
    return Math.abs(value)
  }
  if (!value) return 0
  const cleanStr = String(value).replace(/[^0-9.-]/g, '').trim()
  const num = parseFloat(cleanStr)
  return isNaN(num) ? 0 : Math.abs(num)
}

/**
 * Normalize Dr/Cr indicator to canonical 'Dr' or 'Cr'
 */
export function normalizeDrCr(value: any): 'Dr' | 'Cr' {
  if (!value) return 'Dr'
  const str = String(value).trim().toUpperCase()
  if (str.includes('CR') || str === 'C') return 'Cr'
  return 'Dr'
}

/**
 * Normalize Voucher Type Name to 'PAYMENT' | 'RECEIPT' | 'CONTRA'
 */
export function normalizeVoucherType(value: any): TallyVoucherType | null {
  if (!value) return null
  const str = String(value).trim().toUpperCase()
  if (str.includes('PAYMENT') || str === 'PAY') return 'PAYMENT'
  if (str.includes('RECEIPT') || str === 'REC') return 'RECEIPT'
  if (str.includes('CONTRA')) return 'CONTRA'
  return null
}

/**
 * IMPORT PARSER: parseTallyPayments
 * 
 * Reads an Excel file buffer, extracts Payment/Receipt/Contra vouchers,
 * groups 2-row double entry transactions by composite key `${vType}_${vNo}_${vDate}`,
 * validates balance equality (Dr == Cr), and returns a clean, structured object.
 */
export function parseTallyPayments(fileBuffer: ArrayBuffer | Uint8Array): TallyImportResult {
  const errors: string[] = []
  const warnings: string[] = []
  const data: PaymentVoucher[] = []

  let workbook: XLSX.WorkBook
  try {
    const uint8 = fileBuffer instanceof Uint8Array ? fileBuffer : new Uint8Array(fileBuffer)
    workbook = XLSX.read(uint8, {
      type: 'array',
      cellDates: true,
      cellNF: false,
      cellText: false,
    })
  } catch (err: any) {
    return {
      success: false,
      data: [],
      errors: [`Failed to parse Excel workbook: ${err?.message || 'Invalid file format'}`],
      warnings: [],
      summary: {
        totalRows: 0,
        totalVouchers: 0,
        paymentCount: 0,
        receiptCount: 0,
        contraCount: 0,
        totalPaymentAmount: 0,
        totalReceiptAmount: 0,
        validCount: 0,
        errorCount: 1,
        warningCount: 0,
      }
    }
  }

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return {
      success: false,
      data: [],
      errors: ['The workbook does not contain any sheets.'],
      warnings: [],
      summary: {
        totalRows: 0,
        totalVouchers: 0,
        paymentCount: 0,
        receiptCount: 0,
        contraCount: 0,
        totalPaymentAmount: 0,
        totalReceiptAmount: 0,
        validCount: 0,
        errorCount: 1,
        warningCount: 0,
      }
    }
  }

  const worksheet = workbook.Sheets[sheetName]
  const rawRows: TallyRawExcelRow[] = XLSX.utils.sheet_to_json(worksheet, {
    raw: true,
    defval: '',
    blankrows: false,
  })

  if (!rawRows || rawRows.length === 0) {
    return {
      success: false,
      data: [],
      errors: ['No data rows found in the uploaded Excel worksheet.'],
      warnings: [],
      summary: {
        totalRows: 0,
        totalVouchers: 0,
        paymentCount: 0,
        receiptCount: 0,
        contraCount: 0,
        totalPaymentAmount: 0,
        totalReceiptAmount: 0,
        validCount: 0,
        errorCount: 1,
        warningCount: 0,
      }
    }
  }

  // 1. Group rows by composite key: ${vType}_${vNo}_${vDate}
  type RowGroup = {
    voucherType: TallyVoucherType
    voucherNo: string
    voucherDateIso: string
    voucherDateDisplay: string
    rows: {
      rowIdx: number
      raw: TallyRawExcelRow
      ledgerName: string
      amount: number
      drCr: 'Dr' | 'Cr'
      address?: string
      pincode?: string
    }[]
  }

  const groups = new Map<string, RowGroup>()
  let totalDataRows = 0

  rawRows.forEach((row, idx) => {
    const rowNum = idx + 2 // 1-based indexing including header

    const rawType = getRowField(row, 'Voucher Type Name', 'Voucher Type', 'Type')
    const voucherType = normalizeVoucherType(rawType)

    // Skip non-Payment / non-Receipt / non-Contra vouchers (e.g. Sales, Purchase)
    if (!voucherType) {
      return
    }

    totalDataRows++

    const rawDate = getRowField(row, 'Voucher Date', 'Date', 'VoucherDate')
    const dateObj = normalizeTallyDate(rawDate)

    const rawVoucherNo = getRowField(row, 'Voucher Number', 'Voucher No', 'Vch No', 'VoucherNo', 'Number')
    const voucherNo = rawVoucherNo !== undefined && rawVoucherNo !== null ? String(rawVoucherNo).trim() : `VCH-${idx + 1}`

    const dateKey = dateObj ? dateObj.isoDate : 'UNKNOWN_DATE'
    const compositeKey = `${voucherType}_${voucherNo}_${dateKey}`

    const rawLedgerName = getRowField(row, 'Ledger Name', 'Ledger', 'Particulars', 'Account')
    const ledgerName = rawLedgerName ? String(rawLedgerName).trim() : ''

    const rawAmount = getRowField(row, 'Ledger Amount', 'Amount', 'Debit Amount', 'Credit Amount')
    const amount = parseTallyAmount(rawAmount)

    const rawDrCr = getRowField(row, 'Ledger Amount Dr/Cr', 'Dr/Cr', 'DR/CR', 'Dr / Cr', 'DR / CR')
    const drCr = normalizeDrCr(rawDrCr)

    const address = getRowField(row, 'Buyer/Supplier - Address', 'Party Address', 'Address')
    const pincode = getRowField(row, 'Buyer/Supplier - Pincode', 'Party Pincode', 'Pincode', 'Pin Code')

    if (!groups.has(compositeKey)) {
      groups.set(compositeKey, {
        voucherType,
        voucherNo,
        voucherDateIso: dateObj ? dateObj.isoDate : '',
        voucherDateDisplay: dateObj ? dateObj.displayDate : '',
        rows: []
      })
    }

    groups.get(compositeKey)!.rows.push({
      rowIdx: rowNum,
      raw: row,
      ledgerName,
      amount,
      drCr,
      address: address ? String(address).trim() : undefined,
      pincode: pincode ? String(pincode).trim() : undefined,
    })
  })

  // 2. Process each voucher group
  groups.forEach((group, compositeKey) => {
    const { voucherType, voucherNo, voucherDateIso, voucherDateDisplay, rows } = group
    const voucherErrors: string[] = []
    const voucherWarnings: string[] = []

    if (!voucherDateIso) {
      voucherErrors.push(`Voucher #${voucherNo} (${voucherType}): Invalid or missing voucher date.`)
    }

    const drRows = rows.filter(r => r.drCr === 'Dr')
    const crRows = rows.filter(r => r.drCr === 'Cr')

    const totalDr = drRows.reduce((sum, r) => sum + r.amount, 0)
    const totalCr = crRows.reduce((sum, r) => sum + r.amount, 0)

    let partyLedger = ''
    let bankCashLedger = ''
    let address = ''
    let pincode = ''
    let amount = 0

    // Double entry validation
    if (drRows.length === 0) {
      voucherErrors.push(`Voucher #${voucherNo} (${voucherType} on ${voucherDateDisplay || voucherDateIso}): Missing Debit (Dr) row.`)
    }
    if (crRows.length === 0) {
      voucherErrors.push(`Voucher #${voucherNo} (${voucherType} on ${voucherDateDisplay || voucherDateIso}): Missing Credit (Cr) row.`)
    }

    // Check Dr == Cr balance
    if (drRows.length > 0 && crRows.length > 0) {
      if (Math.abs(totalDr - totalCr) > 0.01) {
        voucherErrors.push(
          `Voucher #${voucherNo} (${voucherType} on ${voucherDateDisplay || voucherDateIso}): Mismatched Dr/Cr balance. Debit = ₹${totalDr.toLocaleString('en-IN')}, Credit = ₹${totalCr.toLocaleString('en-IN')}.`
        )
      }
      amount = totalDr || totalCr
    } else {
      amount = totalDr || totalCr || 0
    }

    // Assign partyLedger vs bankCashLedger based on voucher type
    if (voucherType === 'PAYMENT') {
      // For PAYMENT: Party Ledger is Dr, Bank/Cash is Cr
      partyLedger = drRows.map(r => r.ledgerName).filter(Boolean).join(', ') || 'Unknown Party'
      bankCashLedger = crRows.map(r => r.ledgerName).filter(Boolean).join(', ') || 'Unknown Bank/Cash'
      address = drRows.find(r => r.address)?.address || crRows.find(r => r.address)?.address || ''
      pincode = drRows.find(r => r.pincode)?.pincode || crRows.find(r => r.pincode)?.pincode || ''
    } else if (voucherType === 'RECEIPT') {
      // For RECEIPT: Bank/Cash is Dr, Party Ledger is Cr
      bankCashLedger = drRows.map(r => r.ledgerName).filter(Boolean).join(', ') || 'Unknown Bank/Cash'
      partyLedger = crRows.map(r => r.ledgerName).filter(Boolean).join(', ') || 'Unknown Party'
      address = crRows.find(r => r.address)?.address || drRows.find(r => r.address)?.address || ''
      pincode = crRows.find(r => r.pincode)?.pincode || drRows.find(r => r.pincode)?.pincode || ''
    } else {
      // For CONTRA: Dr is receiving account, Cr is source account
      bankCashLedger = drRows.map(r => r.ledgerName).filter(Boolean).join(', ') || 'Destination Account'
      partyLedger = crRows.map(r => r.ledgerName).filter(Boolean).join(', ') || 'Source Account'
      address = drRows.find(r => r.address)?.address || crRows.find(r => r.address)?.address || ''
      pincode = drRows.find(r => r.pincode)?.pincode || crRows.find(r => r.pincode)?.pincode || ''
    }

    if (rows.length > 2) {
      voucherWarnings.push(`Voucher #${voucherNo} has ${rows.length} rows (compound voucher). Combined entries were grouped.`)
    }

    if (amount <= 0) {
      voucherErrors.push(`Voucher #${voucherNo} (${voucherType}): Voucher amount must be greater than zero.`)
    }

    const hasErrors = voucherErrors.length > 0
    const hasWarnings = voucherWarnings.length > 0

    if (hasErrors) {
      errors.push(...voucherErrors)
    }
    if (hasWarnings) {
      warnings.push(...voucherWarnings)
    }

    const voucherItem: PaymentVoucher = {
      id: `tally-${compositeKey}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      voucherNumber: voucherNo,
      voucherDate: voucherDateIso,
      displayDate: voucherDateDisplay || voucherDateIso,
      type: voucherType,
      partyLedger,
      bankCashLedger,
      amount,
      address: address || undefined,
      pincode: pincode || undefined,
      drLedger: drRows.map(r => r.ledgerName).join(', '),
      crLedger: crRows.map(r => r.ledgerName).join(', '),
      status: hasErrors ? 'error' : hasWarnings ? 'warning' : 'valid',
      isValid: !hasErrors,
      errors: voucherErrors.length > 0 ? voucherErrors : undefined,
      warnings: voucherWarnings.length > 0 ? voucherWarnings : undefined,
      rawRows: rows.map(r => r.raw),
    }

    data.push(voucherItem)
  })

  // Calculate summary metrics
  const paymentCount = data.filter(d => d.type === 'PAYMENT').length
  const receiptCount = data.filter(d => d.type === 'RECEIPT').length
  const contraCount = data.filter(d => d.type === 'CONTRA').length

  const totalPaymentAmount = data.filter(d => d.type === 'PAYMENT' && d.status !== 'error').reduce((sum, d) => sum + d.amount, 0)
  const totalReceiptAmount = data.filter(d => d.type === 'RECEIPT' && d.status !== 'error').reduce((sum, d) => sum + d.amount, 0)

  const validCount = data.filter(d => d.status === 'valid').length
  const warningCount = data.filter(d => d.status === 'warning').length
  const errorCount = data.filter(d => d.status === 'error').length

  const summary: ImportSummary = {
    totalRows: totalDataRows,
    totalVouchers: data.length,
    paymentCount,
    receiptCount,
    contraCount,
    totalPaymentAmount,
    totalReceiptAmount,
    validCount,
    warningCount,
    errorCount,
  }

  return {
    success: errorCount === 0 && data.length > 0,
    data,
    errors,
    warnings,
    summary,
  }
}

/**
 * EXPORT BUILDER: exportPaymentsToTallyExcel
 * 
 * Transforms an array of payment/receipt vouchers into Tally Prime's canonical 14-column "Accounting Voucher" format.
 * - Payment: Row 1 is Dr (Party), Row 2 is Cr (Bank/Cash)
 * - Receipt: Row 1 is Dr (Bank/Cash), Row 2 is Cr (Party)
 * - Contra:  Row 1 is Dr (Destination), Row 2 is Cr (Source)
 */
export function exportPaymentsToTallyExcel(
  vouchers: PaymentVoucher[],
  options?: ExportOptions | string
): {
  workbook: XLSX.WorkBook
  buffer: Uint8Array
  filename: string
  rowCount: number
} {
  const opts: ExportOptions = typeof options === 'string' ? { filename: options } : options || {}
  const filename = opts.filename || `Tally_Payments_Export_${Date.now()}.xlsx`
  const sheetName = opts.sheetName || 'Accounting Voucher'

  const exportRows: TallyExportRow[] = []

  vouchers.forEach(v => {
    // Format date string
    let formattedDate = v.displayDate || v.voucherDate
    if (opts.dateFormat === 'YYYY-MM-DD' && v.voucherDate) {
      formattedDate = v.voucherDate
    } else if (opts.dateFormat === 'DD-MM-YYYY' && v.voucherDate) {
      const norm = normalizeTallyDate(v.voucherDate)
      if (norm) formattedDate = norm.displayDate
    }

    const typeTitleCase = v.type === 'PAYMENT' ? 'Payment' : v.type === 'RECEIPT' ? 'Receipt' : 'Contra'
    const address = v.address || ''
    const pincode = v.pincode ? String(v.pincode) : ''

    if (v.type === 'PAYMENT') {
      // Row 1: Party (Dr)
      exportRows.push({
        'Voucher Date': formattedDate,
        'Voucher Type Name': typeTitleCase,
        'Voucher Number': v.voucherNumber,
        'Buyer/Supplier - Address': address,
        'Buyer/Supplier - Pincode': pincode,
        'Ledger Name': v.partyLedger,
        'Ledger Amount': v.amount,
        'Ledger Amount Dr/Cr': 'Dr',
        'Item Name': '',
        'Billed Quantity': '',
        'Item Rate': '',
        'Item Rate per': '',
        'Item Amount': '',
        'Change Mode': 'Accounting Invoice'
      })
      // Row 2: Bank/Cash (Cr)
      exportRows.push({
        'Voucher Date': formattedDate,
        'Voucher Type Name': typeTitleCase,
        'Voucher Number': v.voucherNumber,
        'Buyer/Supplier - Address': address,
        'Buyer/Supplier - Pincode': pincode,
        'Ledger Name': v.bankCashLedger,
        'Ledger Amount': v.amount,
        'Ledger Amount Dr/Cr': 'Cr',
        'Item Name': '',
        'Billed Quantity': '',
        'Item Rate': '',
        'Item Rate per': '',
        'Item Amount': '',
        'Change Mode': 'Accounting Invoice'
      })
    } else if (v.type === 'RECEIPT') {
      // Row 1: Bank/Cash (Dr)
      exportRows.push({
        'Voucher Date': formattedDate,
        'Voucher Type Name': typeTitleCase,
        'Voucher Number': v.voucherNumber,
        'Buyer/Supplier - Address': address,
        'Buyer/Supplier - Pincode': pincode,
        'Ledger Name': v.bankCashLedger,
        'Ledger Amount': v.amount,
        'Ledger Amount Dr/Cr': 'Dr',
        'Item Name': '',
        'Billed Quantity': '',
        'Item Rate': '',
        'Item Rate per': '',
        'Item Amount': '',
        'Change Mode': 'Accounting Invoice'
      })
      // Row 2: Party (Cr)
      exportRows.push({
        'Voucher Date': formattedDate,
        'Voucher Type Name': typeTitleCase,
        'Voucher Number': v.voucherNumber,
        'Buyer/Supplier - Address': address,
        'Buyer/Supplier - Pincode': pincode,
        'Ledger Name': v.partyLedger,
        'Ledger Amount': v.amount,
        'Ledger Amount Dr/Cr': 'Cr',
        'Item Name': '',
        'Billed Quantity': '',
        'Item Rate': '',
        'Item Rate per': '',
        'Item Amount': '',
        'Change Mode': 'Accounting Invoice'
      })
    } else {
      // Contra
      // Row 1: Destination Account (Dr)
      exportRows.push({
        'Voucher Date': formattedDate,
        'Voucher Type Name': typeTitleCase,
        'Voucher Number': v.voucherNumber,
        'Buyer/Supplier - Address': address,
        'Buyer/Supplier - Pincode': pincode,
        'Ledger Name': v.bankCashLedger,
        'Ledger Amount': v.amount,
        'Ledger Amount Dr/Cr': 'Dr',
        'Item Name': '',
        'Billed Quantity': '',
        'Item Rate': '',
        'Item Rate per': '',
        'Item Amount': '',
        'Change Mode': 'Accounting Invoice'
      })
      // Row 2: Source Account (Cr)
      exportRows.push({
        'Voucher Date': formattedDate,
        'Voucher Type Name': typeTitleCase,
        'Voucher Number': v.voucherNumber,
        'Buyer/Supplier - Address': address,
        'Buyer/Supplier - Pincode': pincode,
        'Ledger Name': v.partyLedger,
        'Ledger Amount': v.amount,
        'Ledger Amount Dr/Cr': 'Cr',
        'Item Name': '',
        'Billed Quantity': '',
        'Item Rate': '',
        'Item Rate per': '',
        'Item Amount': '',
        'Change Mode': 'Accounting Invoice'
      })
    }
  })

  // Create worksheet with canonical 14-column order
  const worksheet = XLSX.utils.json_to_sheet(exportRows, {
    header: [...TALLY_COLUMN_HEADERS],
  })

  // Set optimal 14-column widths
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

  // Trigger browser download if running in client-side browser
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
      // In case browser environment restricts blob url
      XLSX.writeFile(workbook, filename)
    }
  }

  return {
    workbook,
    buffer,
    filename,
    rowCount: exportRows.length,
  }
}

/**
 * SAMPLE TEMPLATE GENERATOR: 14-Column Tally Prime AccountingVouchers.xlsx
 * Creates and downloads a rich sample Tally Prime 14-column template ("Accounting Voucher" sheet).
 */
export function generateSampleTallyExcel(filename = 'AccountingVouchers_Sample.xlsx') {
  const sampleRows: TallyExportRow[] = [
    // 1. Sales Invoice (Item Invoice)
    {
      'Voucher Date': '01-12-2025',
      'Voucher Type Name': 'Sales',
      'Voucher Number': 'SKT/25-26/816',
      'Buyer/Supplier - Address': 'Salt Lake Sector V, Kolkata, West Bengal',
      'Buyer/Supplier - Pincode': '700091',
      'Ledger Name': 'Alpha Traders Ltd',
      'Ledger Amount': 4486.00,
      'Ledger Amount Dr/Cr': 'Dr',
      'Item Name': '',
      'Billed Quantity': '',
      'Item Rate': '',
      'Item Rate per': '',
      'Item Amount': '',
      'Change Mode': 'Item Invoice'
    },
    {
      'Voucher Date': '01-12-2025',
      'Voucher Type Name': 'Sales',
      'Voucher Number': 'SKT/25-26/816',
      'Buyer/Supplier - Address': 'Salt Lake Sector V, Kolkata, West Bengal',
      'Buyer/Supplier - Pincode': '700091',
      'Ledger Name': 'Sales Accounts',
      'Ledger Amount': 3801.60,
      'Ledger Amount Dr/Cr': 'Cr',
      'Item Name': 'FERROSEAL 3.15X450 (6X90 Pc)',
      'Billed Quantity': '1080.000 PCS',
      'Item Rate': 3.52,
      'Item Rate per': 'PCS',
      'Item Amount': 3801.60,
      'Change Mode': 'Item Invoice'
    },
    {
      'Voucher Date': '01-12-2025',
      'Voucher Type Name': 'Sales',
      'Voucher Number': 'SKT/25-26/816',
      'Buyer/Supplier - Address': 'Salt Lake Sector V, Kolkata, West Bengal',
      'Buyer/Supplier - Pincode': '700091',
      'Ledger Name': 'Output CGST',
      'Ledger Amount': 342.14,
      'Ledger Amount Dr/Cr': 'Cr',
      'Item Name': '',
      'Billed Quantity': '',
      'Item Rate': '',
      'Item Rate per': '',
      'Item Amount': '',
      'Change Mode': 'Item Invoice'
    },
    {
      'Voucher Date': '01-12-2025',
      'Voucher Type Name': 'Sales',
      'Voucher Number': 'SKT/25-26/816',
      'Buyer/Supplier - Address': 'Salt Lake Sector V, Kolkata, West Bengal',
      'Buyer/Supplier - Pincode': '700091',
      'Ledger Name': 'Output SGST',
      'Ledger Amount': 342.14,
      'Ledger Amount Dr/Cr': 'Cr',
      'Item Name': '',
      'Billed Quantity': '',
      'Item Rate': '',
      'Item Rate per': '',
      'Item Amount': '',
      'Change Mode': 'Item Invoice'
    },
    {
      'Voucher Date': '01-12-2025',
      'Voucher Type Name': 'Sales',
      'Voucher Number': 'SKT/25-26/816',
      'Buyer/Supplier - Address': 'Salt Lake Sector V, Kolkata, West Bengal',
      'Buyer/Supplier - Pincode': '700091',
      'Ledger Name': 'Round Off',
      'Ledger Amount': 0.12,
      'Ledger Amount Dr/Cr': 'Cr',
      'Item Name': '',
      'Billed Quantity': '',
      'Item Rate': '',
      'Item Rate per': '',
      'Item Amount': '',
      'Change Mode': 'Item Invoice'
    },

    // 2. Purchase Invoice (Item Invoice)
    {
      'Voucher Date': '05-12-2025',
      'Voucher Type Name': 'Purchase',
      'Voucher Number': 'PUR-2025-088',
      'Buyer/Supplier - Address': 'Bandra Kurla Complex, Mumbai, Maharashtra',
      'Buyer/Supplier - Pincode': '400051',
      'Ledger Name': 'Apex Steel Corp',
      'Ledger Amount': 59000.00,
      'Ledger Amount Dr/Cr': 'Cr',
      'Item Name': '',
      'Billed Quantity': '',
      'Item Rate': '',
      'Item Rate per': '',
      'Item Amount': '',
      'Change Mode': 'Item Invoice'
    },
    {
      'Voucher Date': '05-12-2025',
      'Voucher Type Name': 'Purchase',
      'Voucher Number': 'PUR-2025-088',
      'Buyer/Supplier - Address': 'Bandra Kurla Complex, Mumbai, Maharashtra',
      'Buyer/Supplier - Pincode': '400051',
      'Ledger Name': 'Purchase Accounts',
      'Ledger Amount': 50000.00,
      'Ledger Amount Dr/Cr': 'Dr',
      'Item Name': 'TMT Rebars 12mm Fe550D',
      'Billed Quantity': '1.000 TON',
      'Item Rate': 50000.00,
      'Item Rate per': 'TON',
      'Item Amount': 50000.00,
      'Change Mode': 'Item Invoice'
    },
    {
      'Voucher Date': '05-12-2025',
      'Voucher Type Name': 'Purchase',
      'Voucher Number': 'PUR-2025-088',
      'Buyer/Supplier - Address': 'Bandra Kurla Complex, Mumbai, Maharashtra',
      'Buyer/Supplier - Pincode': '400051',
      'Ledger Name': 'Input CGST',
      'Ledger Amount': 4500.00,
      'Ledger Amount Dr/Cr': 'Dr',
      'Item Name': '',
      'Billed Quantity': '',
      'Item Rate': '',
      'Item Rate per': '',
      'Item Amount': '',
      'Change Mode': 'Item Invoice'
    },
    {
      'Voucher Date': '05-12-2025',
      'Voucher Type Name': 'Purchase',
      'Voucher Number': 'PUR-2025-088',
      'Buyer/Supplier - Address': 'Bandra Kurla Complex, Mumbai, Maharashtra',
      'Buyer/Supplier - Pincode': '400051',
      'Ledger Name': 'Input SGST',
      'Ledger Amount': 4500.00,
      'Ledger Amount Dr/Cr': 'Dr',
      'Item Name': '',
      'Billed Quantity': '',
      'Item Rate': '',
      'Item Rate per': '',
      'Item Amount': '',
      'Change Mode': 'Item Invoice'
    },

    // 3. Payment Voucher (Accounting Invoice)
    {
      'Voucher Date': '10-12-2025',
      'Voucher Type Name': 'Payment',
      'Voucher Number': 'PAY-2025-101',
      'Buyer/Supplier - Address': 'Industrial Area, Jamshedpur',
      'Buyer/Supplier - Pincode': '831001',
      'Ledger Name': 'Apex Steel Corp',
      'Ledger Amount': 59000.00,
      'Ledger Amount Dr/Cr': 'Dr',
      'Item Name': '',
      'Billed Quantity': '',
      'Item Rate': '',
      'Item Rate per': '',
      'Item Amount': '',
      'Change Mode': 'Accounting Invoice'
    },
    {
      'Voucher Date': '10-12-2025',
      'Voucher Type Name': 'Payment',
      'Voucher Number': 'PAY-2025-101',
      'Buyer/Supplier - Address': 'Industrial Area, Jamshedpur',
      'Buyer/Supplier - Pincode': '831001',
      'Ledger Name': 'HDFC Bank Ltd (Current A/c)',
      'Ledger Amount': 59000.00,
      'Ledger Amount Dr/Cr': 'Cr',
      'Item Name': '',
      'Billed Quantity': '',
      'Item Rate': '',
      'Item Rate per': '',
      'Item Amount': '',
      'Change Mode': 'Accounting Invoice'
    },

    // 4. Receipt Voucher (Accounting Invoice)
    {
      'Voucher Date': '12-12-2025',
      'Voucher Type Name': 'Receipt',
      'Voucher Number': 'REC-2025-201',
      'Buyer/Supplier - Address': 'Salt Lake Sector V, Kolkata',
      'Buyer/Supplier - Pincode': '700091',
      'Ledger Name': 'HDFC Bank Ltd (Current A/c)',
      'Ledger Amount': 4486.00,
      'Ledger Amount Dr/Cr': 'Dr',
      'Item Name': '',
      'Billed Quantity': '',
      'Item Rate': '',
      'Item Rate per': '',
      'Item Amount': '',
      'Change Mode': 'Accounting Invoice'
    },
    {
      'Voucher Date': '12-12-2025',
      'Voucher Type Name': 'Receipt',
      'Voucher Number': 'REC-2025-201',
      'Buyer/Supplier - Address': 'Salt Lake Sector V, Kolkata',
      'Buyer/Supplier - Pincode': '700091',
      'Ledger Name': 'Alpha Traders Ltd',
      'Ledger Amount': 4486.00,
      'Ledger Amount Dr/Cr': 'Cr',
      'Item Name': '',
      'Billed Quantity': '',
      'Item Rate': '',
      'Item Rate per': '',
      'Item Amount': '',
      'Change Mode': 'Accounting Invoice'
    }
  ]

  const worksheet = XLSX.utils.json_to_sheet(sampleRows, {
    header: [...TALLY_COLUMN_HEADERS]
  })

  worksheet['!cols'] = [
    { wch: 14 }, // Voucher Date
    { wch: 20 }, // Voucher Type Name
    { wch: 18 }, // Voucher Number
    { wch: 36 }, // Buyer/Supplier - Address
    { wch: 24 }, // Buyer/Supplier - Pincode
    { wch: 32 }, // Ledger Name
    { wch: 16 }, // Ledger Amount
    { wch: 20 }, // Ledger Amount Dr/Cr
    { wch: 30 }, // Item Name
    { wch: 18 }, // Billed Quantity
    { wch: 14 }, // Item Rate
    { wch: 14 }, // Item Rate per
    { wch: 16 }, // Item Amount
    { wch: 20 }  // Change Mode
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Accounting Voucher')

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

  return { workbook, buffer, filename, rowCount: sampleRows.length }
}

/**
 * Universal 14-Column Tally Prime "AccountingVouchers.xlsx" Excel Parser.
 * Ingests Sales, Purchase, Payment, Receipt, Credit Note, Debit Note, Contra vouchers
 * with strict master entity matching (No automatic master additions).
 */
export function parseTallyAccountingVouchersExcel(
  fileBuffer: ArrayBuffer | Uint8Array,
  context?: {
    customers?: Customer[]
    suppliers?: Supplier[]
    items?: Item[]
    expenseTypes?: ExpenseType[]
    companyStateCode?: string
  }
): TallyXmlImportResult {
  const errors: string[] = []
  const warnings: string[] = []
  const vouchers: TallyParsedXmlVoucher[] = []

  const customers = context?.customers || []
  const suppliers = context?.suppliers || []
  const items = context?.items || []
  const custMap = new Map(customers.map(c => [c.name.trim().toLowerCase(), c]))
  const suppMap = new Map(suppliers.map(s => [s.name.trim().toLowerCase(), s]))
  const itemMap = new Map(items.map(it => [it.name.trim().toLowerCase(), it]))
  // also map itemCode
  items.forEach(it => {
    if (it.itemCode) itemMap.set(it.itemCode.trim().toLowerCase(), it)
  })

  let workbook: XLSX.WorkBook
  try {
    const uint8 = fileBuffer instanceof Uint8Array ? fileBuffer : new Uint8Array(fileBuffer)
    workbook = XLSX.read(uint8, {
      type: 'array',
      cellDates: true,
      cellNF: false,
      cellText: false,
    })
  } catch (err: any) {
    return {
      success: false,
      vouchers: [],
      summary: {
        totalParsed: 0,
        salesCount: 0,
        purchaseCount: 0,
        receiptCount: 0,
        paymentCount: 0,
        expenseCount: 0,
        contraCount: 0,
        creditNoteCount: 0,
        debitNoteCount: 0,
        skippedCount: 0,
        matchedCount: 0,
        unmappedCount: 0
      },
      errors: [`Failed to parse Excel workbook: ${err?.message || 'Invalid file format'}`],
      warnings: []
    }
  }

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return {
      success: false,
      vouchers: [],
      summary: {
        totalParsed: 0,
        salesCount: 0,
        purchaseCount: 0,
        receiptCount: 0,
        paymentCount: 0,
        expenseCount: 0,
        contraCount: 0,
        creditNoteCount: 0,
        debitNoteCount: 0,
        skippedCount: 0,
        matchedCount: 0,
        unmappedCount: 0
      },
      errors: ['The Excel workbook contains no sheets.'],
      warnings: []
    }
  }

  const worksheet = workbook.Sheets[sheetName]
  const rawRows: TallyRawExcelRow[] = XLSX.utils.sheet_to_json(worksheet, {
    raw: true,
    defval: '',
    blankrows: false,
  })

  if (!rawRows || rawRows.length === 0) {
    return {
      success: false,
      vouchers: [],
      summary: {
        totalParsed: 0,
        salesCount: 0,
        purchaseCount: 0,
        receiptCount: 0,
        paymentCount: 0,
        expenseCount: 0,
        contraCount: 0,
        creditNoteCount: 0,
        debitNoteCount: 0,
        skippedCount: 0,
        matchedCount: 0,
        unmappedCount: 0
      },
      errors: ['No data rows found in worksheet.'],
      warnings: []
    }
  }

  type GroupedVoucher = {
    rawVoucherType: string
    normalizedType: TallyParsedXmlVoucher['normalizedType']
    voucherNo: string
    isoDate: string
    displayDate: string
    partyAddress?: string
    partyPincode?: string
    rows: TallyRawExcelRow[]
  }

  const groups = new Map<string, GroupedVoucher>()

  rawRows.forEach((row, idx) => {
    const rawType = String(getRowField(row, 'Voucher Type Name', 'Voucher Type', 'Type') || '').trim()
    const normalizedType = normalizeTallyVoucherType(rawType)

    const rawDate = getRowField(row, 'Voucher Date', 'Date', 'VoucherDate')
    const dateObj = normalizeTallyDate(rawDate)
    const isoDate = dateObj ? dateObj.isoDate : new Date().toISOString().slice(0, 10)
    const displayDate = dateObj ? dateObj.displayDate : isoDate

    const rawVoucherNo = getRowField(row, 'Voucher Number', 'Voucher No', 'Vch No', 'VoucherNo', 'Number')
    const voucherNo = rawVoucherNo !== undefined && rawVoucherNo !== null && String(rawVoucherNo).trim() !== ''
      ? String(rawVoucherNo).trim()
      : `VCH-${idx + 1}`

    const address = getRowField(row, 'Buyer/Supplier - Address', 'Party Address', 'Address')
    const pincode = getRowField(row, 'Buyer/Supplier - Pincode', 'Party Pincode', 'Pincode')

    const groupKey = `${rawType}_${voucherNo}_${isoDate}`

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        rawVoucherType: rawType || 'Journal',
        normalizedType,
        voucherNo,
        isoDate,
        displayDate,
        partyAddress: address ? String(address).trim() : undefined,
        partyPincode: pincode ? String(pincode).trim() : undefined,
        rows: []
      })
    }

    groups.get(groupKey)!.rows.push(row)
  })

  let vchIndex = 0
  groups.forEach((group, groupKey) => {
    vchIndex++
    const { rawVoucherType, voucherNo, isoDate, displayDate, partyAddress, partyPincode, rows } = group
    let normalizedType = group.normalizedType

    const legs: { ledgerName: string; amount: number; drCr: 'Dr' | 'Cr'; isDeemedPositive: boolean }[] = []
    const inventory: { itemName: string; quantity: number; unit?: string; rate: number; amount: number }[] = []

    let partyName = ''

    rows.forEach(r => {
      const rawLedger = getRowField(r, 'Ledger Name', 'Ledger', 'Particulars', 'Account')
      const ledgerName = rawLedger ? String(rawLedger).trim() : ''
      const rawAmt = getRowField(r, 'Ledger Amount', 'Amount', 'Debit Amount', 'Credit Amount')
      const amount = parseTallyAmount(rawAmt)
      const rawDrCr = getRowField(r, 'Ledger Amount Dr/Cr', 'Dr/Cr', 'DR/CR', 'Dr / Cr', 'DR / CR')
      const drCr = normalizeDrCr(rawDrCr)

      const rawItem = getRowField(r, 'Item Name', 'Stock Item Name', 'Item', 'Item Description')
      const itemName = rawItem ? String(rawItem).trim() : ''

      if (ledgerName && amount > 0) {
        legs.push({
          ledgerName,
          amount,
          drCr,
          isDeemedPositive: drCr === 'Dr'
        })
      }

      if (itemName) {
        const rawQty = getRowField(r, 'Billed Quantity', 'Billed Qty', 'Quantity', 'Qty', 'Actual Qty')
        const rawQtyStr = rawQty !== undefined && rawQty !== null ? String(rawQty).trim() : '1'
        const qtyNum = parseFloat(rawQtyStr.replace(/[^0-9.]/g, '')) || 1
        const unit = rawQtyStr.replace(/[0-9.\s]/g, '') || String(getRowField(r, 'Item Rate per', 'Per', 'Unit') || 'PCS').trim() || 'PCS'
        
        const rawRate = getRowField(r, 'Item Rate', 'Rate')
        const rate = typeof rawRate === 'number' ? rawRate : parseFloat(String(rawRate || '0').replace(/[^0-9.]/g, '')) || 0

        const rawItemAmt = getRowField(r, 'Item Amount', 'Item Total')
        const itemAmt = rawItemAmt ? parseTallyAmount(rawItemAmt) : (rate > 0 ? qtyNum * rate : amount)

        inventory.push({
          itemName,
          quantity: qtyNum,
          unit,
          rate: rate || (qtyNum > 0 ? itemAmt / qtyNum : itemAmt),
          amount: itemAmt || amount
        })
      }
    })

    // Infer party ledger name based on voucher type
    if (normalizedType === 'sales' || normalizedType === 'credit_note') {
      const drLeg = legs.find(l => l.drCr === 'Dr' && !l.ledgerName.toLowerCase().includes('round off'))
      partyName = drLeg ? drLeg.ledgerName : (legs[0]?.ledgerName || 'Cash Customer')
    } else if (normalizedType === 'purchase' || normalizedType === 'debit_note') {
      const crLeg = legs.find(l => l.drCr === 'Cr' && !l.ledgerName.toLowerCase().includes('round off'))
      partyName = crLeg ? crLeg.ledgerName : (legs[0]?.ledgerName || 'Supplier Account')
    } else if (normalizedType === 'payment') {
      const drLeg = legs.find(l => l.drCr === 'Dr')
      partyName = drLeg ? drLeg.ledgerName : (legs[0]?.ledgerName || 'Payee')
    } else if (normalizedType === 'receipt') {
      const crLeg = legs.find(l => l.drCr === 'Cr')
      partyName = crLeg ? crLeg.ledgerName : (legs[0]?.ledgerName || 'Customer')
    } else {
      partyName = legs[0]?.ledgerName || 'General Account'
    }

    const drTotal = legs.filter(l => l.drCr === 'Dr').reduce((s, l) => s + l.amount, 0)
    const crTotal = legs.filter(l => l.drCr === 'Cr').reduce((s, l) => s + l.amount, 0)
    const diff = Math.abs(drTotal - crTotal)
    const isBalanced = diff < 0.01
    const totalAmount = drTotal || crTotal || inventory.reduce((s, it) => s + it.amount, 0)
    let matchedEntityType: TallyParsedXmlVoucher['matchedEntityType'] = 'unmapped'
    let matchedEntityId: string | undefined
    let contraDetails: TallyParsedXmlVoucher['contraDetails'] | undefined
    let expenseDetails: TallyParsedXmlVoucher['expenseDetails'] | undefined
    let skipReason: string | undefined

    if (normalizedType === 'contra') {
      const crLeg = legs.find(l => l.drCr === 'Cr') || legs[0]
      const drLeg = legs.find(l => l.drCr === 'Dr') || legs[1] || legs[0]
      const fromCounterName = crLeg ? crLeg.ledgerName : 'Source Counter'
      const toCounterName = drLeg ? drLeg.ledgerName : 'Destination Counter'
      partyName = `${fromCounterName} → ${toCounterName}`

      contraDetails = {
        fromCounterName,
        toCounterName,
        amount: totalAmount
      }
      matchedEntityType = 'counter'
    } else if (normalizedType === 'payment') {
      const drLeg = legs.find(l => l.drCr === 'Dr')
      const crLeg = legs.find(l => l.drCr === 'Cr')
      const drParty = (drLeg?.ledgerName || partyName || '').trim()
      const normDr = drParty.toLowerCase()

      if (suppMap.has(normDr)) {
        normalizedType = 'payment'
        matchedEntityType = 'supplier'
        matchedEntityId = suppMap.get(normDr)?.id
        partyName = drParty
      } else if (context?.expenseTypes && context.expenseTypes.some(e => e.name.trim().toLowerCase() === normDr)) {
        const exp = context.expenseTypes.find(e => e.name.trim().toLowerCase() === normDr)
        normalizedType = 'expense'
        matchedEntityType = 'expense'
        matchedEntityId = exp?.id
        partyName = drParty
        expenseDetails = {
          categoryId: matchedEntityId,
          categoryName: drParty,
          amount: totalAmount,
          paymentAccountId: crLeg?.ledgerName,
          paymentAccountName: crLeg?.ledgerName
        }
      } else if (custMap.has(normDr)) {
        normalizedType = 'payment'
        matchedEntityType = 'customer'
        matchedEntityId = custMap.get(normDr)?.id
        partyName = drParty
      } else {
        normalizedType = 'expense'
        partyName = drParty
        expenseDetails = {
          categoryName: drParty,
          amount: totalAmount,
          paymentAccountId: crLeg?.ledgerName,
          paymentAccountName: crLeg?.ledgerName
        }
        matchedEntityType = 'unmapped'
        skipReason = `Unmapped Master: ${drParty}`
      }
    } else if (normalizedType === 'receipt') {
      const crLeg = legs.find(l => l.drCr === 'Cr')
      const crParty = (crLeg?.ledgerName || partyName || '').trim()
      const normCr = crParty.toLowerCase()

      if (custMap.has(normCr)) {
        matchedEntityType = 'customer'
        matchedEntityId = custMap.get(normCr)?.id
        partyName = crParty
      } else if (suppMap.has(normCr)) {
        matchedEntityType = 'supplier'
        matchedEntityId = suppMap.get(normCr)?.id
        partyName = crParty
      } else {
        matchedEntityType = 'unmapped'
        partyName = crParty
        skipReason = `Unmapped Master: ${crParty}`
      }
    } else if (normalizedType === 'sales' || normalizedType === 'credit_note') {
      const drLeg = legs.find(l => l.drCr === 'Dr' && !l.ledgerName.toLowerCase().includes('round off'))
      const pName = (drLeg ? drLeg.ledgerName : (partyName || legs[0]?.ledgerName || 'General Account')).trim()
      partyName = pName
      const normParty = pName.toLowerCase()

      if (custMap.has(normParty)) {
        matchedEntityType = 'customer'
        matchedEntityId = custMap.get(normParty)?.id
      } else if (suppMap.has(normParty)) {
        matchedEntityType = 'supplier'
        matchedEntityId = suppMap.get(normParty)?.id
      } else {
        matchedEntityType = 'unmapped'
        skipReason = `Unmapped Master: ${pName}`
      }
    } else if (normalizedType === 'purchase' || normalizedType === 'debit_note') {
      const crLeg = legs.find(l => l.drCr === 'Cr' && !l.ledgerName.toLowerCase().includes('round off'))
      const pName = (crLeg ? crLeg.ledgerName : (partyName || legs[0]?.ledgerName || 'General Account')).trim()
      partyName = pName
      const normParty = pName.toLowerCase()

      if (suppMap.has(normParty)) {
        matchedEntityType = 'supplier'
        matchedEntityId = suppMap.get(normParty)?.id
      } else if (custMap.has(normParty)) {
        matchedEntityType = 'customer'
        matchedEntityId = custMap.get(normParty)?.id
      } else {
        matchedEntityType = 'unmapped'
        skipReason = `Unmapped Master: ${pName}`
      }
    } else if (normalizedType === 'skipped') {
      skipReason = `Non-billing voucher type (${rawVoucherType}) skipped per standard ERP audit policy`
    }

    // Check inventory items matching
    if (inventory.length > 0) {
      const unmappedItems = inventory.filter(inv => !itemMap.has(inv.itemName.trim().toLowerCase()))
      if (unmappedItems.length > 0 && !skipReason) {
        skipReason = `Unmapped Item: ${unmappedItems.map(i => i.itemName).join(', ')}`
      }
    }

    vouchers.push({
      id: `xlsx-vch-${vchIndex}`,
      voucherNumber: voucherNo,
      voucherDate: isoDate,
      displayDate,
      rawVoucherType,
      normalizedType,
      partyName,
      partyGstin: undefined,
      narration: `Imported from Tally Excel #${voucherNo}`,
      legs,
      inventory,
      drTotal,
      crTotal,
      totalAmount,
      isBalanced,
      imbalanceDifference: diff,
      matchedEntityId,
      matchedEntityType,
      contraDetails,
      expenseDetails,
      skipReason
    })
  })

  // Calculate summary counts
  const salesCount = vouchers.filter(v => v.normalizedType === 'sales').length
  const purchaseCount = vouchers.filter(v => v.normalizedType === 'purchase').length
  const receiptCount = vouchers.filter(v => v.normalizedType === 'receipt').length
  const paymentCount = vouchers.filter(v => v.normalizedType === 'payment').length
  const expenseCount = vouchers.filter(v => v.normalizedType === 'expense').length
  const contraCount = vouchers.filter(v => v.normalizedType === 'contra').length
  const creditNoteCount = vouchers.filter(v => v.normalizedType === 'credit_note').length
  const debitNoteCount = vouchers.filter(v => v.normalizedType === 'debit_note').length
  const skippedCount = vouchers.filter(v => v.normalizedType === 'skipped').length
  const matchedCount = vouchers.filter(v => v.matchedEntityType !== 'unmapped' && v.normalizedType !== 'skipped' && (!v.skipReason || !v.skipReason.startsWith('Unmapped Item'))).length
  const unmappedCount = vouchers.filter(v => (v.matchedEntityType === 'unmapped' || Boolean(v.skipReason && v.skipReason.startsWith('Unmapped Item'))) && v.normalizedType !== 'skipped').length

  return {
    success: vouchers.length > 0 && errors.length === 0,
    vouchers,
    summary: {
      totalParsed: vouchers.length,
      salesCount,
      purchaseCount,
      receiptCount,
      paymentCount,
      expenseCount,
      contraCount,
      creditNoteCount,
      debitNoteCount,
      skippedCount,
      matchedCount,
      unmappedCount
    },
    errors,
    warnings
  }
}

