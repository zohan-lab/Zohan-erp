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

// Re-export all types so callers can import everything from this single module
export * from './tally-payment-types'

/**
 * Standard Tally Column Header Keys (canonical order)
 */
export const TALLY_COLUMN_HEADERS = [
  'Voucher Date',
  'Voucher Type Name',
  'Voucher Number',
  'Buyer/Supplier - Address',
  'Buyer/Supplier - Pincode',
  'Ledger Name',
  'Ledger Amount',
  'Ledger Amount Dr/Cr'
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
 * Transforms an array of payment/receipt vouchers back into Tally's exact Excel 2-row format.
 * - Payment: Row 1 is Dr (Party), Row 2 is Cr (Bank/Cash)
 * - Receipt: Row 1 is Dr (Bank/Cash), Row 2 is Cr (Party)
 * - Contra:  Row 1 is Dr (Destination), Row 2 is Cr (Source)
 * 
 * Returns the workbook, buffer, filename, and triggers browser download if in browser environment.
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
  const sheetName = opts.sheetName || 'Vouchers'

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
        'Ledger Amount Dr/Cr': 'Dr'
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
        'Ledger Amount Dr/Cr': 'Cr'
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
        'Ledger Amount Dr/Cr': 'Dr'
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
        'Ledger Amount Dr/Cr': 'Cr'
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
        'Ledger Amount Dr/Cr': 'Dr'
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
        'Ledger Amount Dr/Cr': 'Cr'
      })
    }
  })

  // Create worksheet with canonical column order
  const worksheet = XLSX.utils.json_to_sheet(exportRows, {
    header: [...TALLY_COLUMN_HEADERS],
  })

  // Set optimal column widths
  worksheet['!cols'] = [
    { wch: 14 }, // Voucher Date
    { wch: 20 }, // Voucher Type Name
    { wch: 18 }, // Voucher Number
    { wch: 28 }, // Buyer/Supplier - Address
    { wch: 24 }, // Buyer/Supplier - Pincode
    { wch: 32 }, // Ledger Name
    { wch: 16 }, // Ledger Amount
    { wch: 20 }, // Ledger Amount Dr/Cr
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
 * SAMPLE TEMPLATE GENERATOR
 * Creates and downloads a clean sample Tally Payment & Receipt Excel file
 */
export function generateSampleTallyExcel(filename = 'Tally_Payment_Receipt_Sample.xlsx') {
  const sampleVouchers: PaymentVoucher[] = [
    {
      id: 'sample-1',
      voucherNumber: 'PAY-2026-001',
      voucherDate: '2026-04-02',
      displayDate: '02-04-2026',
      type: 'PAYMENT',
      partyLedger: 'Tata Steel Ltd',
      bankCashLedger: 'HDFC Bank Ltd (Current A/c)',
      amount: 450000,
      address: 'Plot 42, Industrial Area, Jamshedpur',
      pincode: '831001',
      status: 'valid'
    },
    {
      id: 'sample-2',
      voucherNumber: 'PAY-2026-002',
      voucherDate: '2026-04-05',
      displayDate: '05-04-2026',
      type: 'PAYMENT',
      partyLedger: 'JSW Steel Processing Co',
      bankCashLedger: 'State Bank of India (Cash Credit)',
      amount: 1250000,
      address: 'Bandra Kurla Complex, Mumbai',
      pincode: '400051',
      status: 'valid'
    },
    {
      id: 'sample-3',
      voucherNumber: 'REC-2026-001',
      voucherDate: '2026-04-08',
      displayDate: '08-04-2026',
      type: 'RECEIPT',
      partyLedger: 'Metro Infrastructure Infra Corp',
      bankCashLedger: 'HDFC Bank Ltd (Current A/c)',
      amount: 875000,
      address: 'Salt Lake Sector V, Kolkata',
      pincode: '700091',
      status: 'valid'
    },
    {
      id: 'sample-4',
      voucherNumber: 'REC-2026-002',
      voucherDate: '2026-04-10',
      displayDate: '10-04-2026',
      type: 'RECEIPT',
      partyLedger: 'Apex Building Solutions',
      bankCashLedger: 'Main Cash Counter',
      amount: 45000,
      address: 'GIDC Industrial Estate, Ahmedabad',
      pincode: '382445',
      status: 'valid'
    },
    {
      id: 'sample-5',
      voucherNumber: 'CNT-2026-001',
      voucherDate: '2026-04-12',
      displayDate: '12-04-2026',
      type: 'CONTRA',
      partyLedger: 'HDFC Bank Ltd (Current A/c)', // Source account (Cr)
      bankCashLedger: 'Main Cash Counter',       // Destination account (Dr)
      amount: 100000,
      address: 'Cash withdrawal for operational petty cash',
      status: 'valid'
    }
  ]

  return exportPaymentsToTallyExcel(sampleVouchers, { filename })
}
