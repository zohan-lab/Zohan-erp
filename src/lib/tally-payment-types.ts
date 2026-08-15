/**
 * Tally Payment & Receipt Excel Import/Export Type Definitions
 */

export type TallyVoucherType = 'PAYMENT' | 'RECEIPT' | 'CONTRA'

export type TallyDrCr = 'Dr' | 'Cr' | 'DR' | 'CR'

/**
 * Raw row shape as parsed directly from Tally's Excel format
 */
export interface TallyRawExcelRow {
  'Voucher Date'?: string | number | Date
  'Voucher Type Name'?: string
  'Voucher Number'?: string | number
  'Buyer/Supplier - Address'?: string
  'Buyer/Supplier - Pincode'?: string | number
  'Ledger Name'?: string
  'Ledger Amount'?: string | number
  'Ledger Amount Dr/Cr'?: string
  // Support flexible key names and extra columns
  [key: string]: any
}

/**
 * Clean, structured Payment/Receipt/Contra voucher object
 */
export interface PaymentVoucher {
  id: string
  voucherNumber: string
  voucherDate: string // Formatted ISO date (YYYY-MM-DD)
  displayDate?: string // Formatted display date (DD-MM-YYYY)
  type: TallyVoucherType
  partyLedger: string
  bankCashLedger: string
  amount: number
  address?: string
  pincode?: string
  narration?: string
  drLedger?: string
  crLedger?: string
  status: 'valid' | 'warning' | 'error'
  isValid?: boolean
  warnings?: string[]
  errors?: string[]
  rawRows?: TallyRawExcelRow[]
}

/**
 * Exact 8-column header structure expected by Tally for export
 */
export interface TallyExportRow {
  'Voucher Date': string
  'Voucher Type Name': string
  'Voucher Number': string
  'Buyer/Supplier - Address': string
  'Buyer/Supplier - Pincode': string
  'Ledger Name': string
  'Ledger Amount': number
  'Ledger Amount Dr/Cr': 'Dr' | 'Cr'
}

export interface ImportSummary {
  totalRows: number
  totalVouchers: number
  paymentCount: number
  receiptCount: number
  contraCount: number
  totalPaymentAmount: number
  totalReceiptAmount: number
  validCount: number
  errorCount: number
  warningCount: number
}

/**
 * Result returned by the import parser
 */
export interface TallyImportResult {
  success: boolean
  data: PaymentVoucher[]
  errors: string[]
  warnings: string[]
  summary: ImportSummary
}

export interface ExportOptions {
  filename?: string
  sheetName?: string
  dateFormat?: 'YYYY-MM-DD' | 'DD-MM-YYYY' | 'DD-MMM-YYYY'
}
