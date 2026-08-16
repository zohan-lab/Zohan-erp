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
  'Item Name'?: string
  'Billed Quantity'?: string | number
  'Item Rate'?: string | number
  'Item Rate per'?: string
  'Item Amount'?: string | number
  'Change Mode'?: string
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
 * Official 14-Column Tally Prime Export Structure ("Accounting Voucher" sheet)
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
  'Item Name'?: string
  'Billed Quantity'?: string
  'Item Rate'?: number | string
  'Item Rate per'?: string
  'Item Amount'?: number | string
  'Change Mode'?: 'Item Invoice' | 'Accounting Invoice'
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
