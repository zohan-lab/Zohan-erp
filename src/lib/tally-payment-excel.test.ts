import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  parseTallyPayments,
  parseTallyAccountingVouchersExcel,
  exportPaymentsToTallyExcel,
  generateSampleTallyExcel,
  normalizeTallyDate,
  parseTallyAmount,
  normalizeDrCr,
  normalizeVoucherType,
  TALLY_COLUMN_HEADERS,
  PaymentVoucher
} from './tally-payment-excel'
import { Customer, Supplier, Item } from './types'

describe('normalizeTallyDate', () => {
  it('converts standard ISO date strings', () => {
    const res = normalizeTallyDate('2026-04-15')
    expect(res).toEqual({
      isoDate: '2026-04-15',
      displayDate: '15-04-2026'
    })
  })

  it('converts Indian/UK DD-MM-YYYY and DD/MM/YYYY date strings', () => {
    const res1 = normalizeTallyDate('15-04-2026')
    expect(res1?.isoDate).toBe('2026-04-15')

    const res2 = normalizeTallyDate('05/11/2025')
    expect(res2?.isoDate).toBe('2025-11-05')
  })

  it('converts text month strings like 01-Apr-2026', () => {
    const res = normalizeTallyDate('01-Apr-2026')
    expect(res?.isoDate).toBe('2026-04-01')
    expect(res?.displayDate).toBe('01-04-2026')
  })

  it('converts JavaScript Date objects', () => {
    const d = new Date(2026, 3, 25) // 25 Apr 2026
    const res = normalizeTallyDate(d)
    expect(res?.isoDate).toBe('2026-04-25')
  })

  it('converts Excel serial date numbers', () => {
    // 45321 in Excel is 2024-01-30 or similar valid date
    const res = normalizeTallyDate(45321)
    expect(res).not.toBeNull()
    expect(res?.isoDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns null for null, empty or invalid values', () => {
    expect(normalizeTallyDate(null)).toBeNull()
    expect(normalizeTallyDate('')).toBeNull()
    expect(normalizeTallyDate('invalid-date-string')).toBeNull()
  })
})

describe('parseTallyAmount & normalize helpers', () => {
  it('parses numeric amounts and strips currency symbols and commas', () => {
    expect(parseTallyAmount(50000)).toBe(50000)
    expect(parseTallyAmount('50,000.50')).toBe(50000.5)
    expect(parseTallyAmount('₹ 1,25,000.00')).toBe(125000)
    expect(parseTallyAmount('-7500')).toBe(7500)
  })

  it('normalizes Dr/Cr values', () => {
    expect(normalizeDrCr('Dr')).toBe('Dr')
    expect(normalizeDrCr('DR')).toBe('Dr')
    expect(normalizeDrCr('Cr')).toBe('Cr')
    expect(normalizeDrCr('CR')).toBe('Cr')
    expect(normalizeDrCr('c')).toBe('Cr')
  })

  it('normalizes voucher types', () => {
    expect(normalizeVoucherType('Payment')).toBe('PAYMENT')
    expect(normalizeVoucherType('payment')).toBe('PAYMENT')
    expect(normalizeVoucherType('Receipt')).toBe('RECEIPT')
    expect(normalizeVoucherType('Contra')).toBe('CONTRA')
    expect(normalizeVoucherType('Sales')).toBeNull()
    expect(normalizeVoucherType('Purchase')).toBeNull()
  })
})

describe('parseTallyPayments', () => {
  function createWorkbookBuffer(rows: any[]): Uint8Array {
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Vouchers')
    const rawBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    return new Uint8Array(rawBuffer)
  }

  it('successfully parses valid 2-row Payment vouchers', () => {
    const rows = [
      {
        'Voucher Date': '01-04-2026',
        'Voucher Type Name': 'Payment',
        'Voucher Number': 'PV-101',
        'Buyer/Supplier - Address': 'Jamshedpur',
        'Buyer/Supplier - Pincode': '831001',
        'Ledger Name': 'Tata Steel Ltd',
        'Ledger Amount': 500000,
        'Ledger Amount Dr/Cr': 'Dr'
      },
      {
        'Voucher Date': '01-04-2026',
        'Voucher Type Name': 'Payment',
        'Voucher Number': 'PV-101',
        'Buyer/Supplier - Address': 'Jamshedpur',
        'Buyer/Supplier - Pincode': '831001',
        'Ledger Name': 'HDFC Bank Ltd',
        'Ledger Amount': 500000,
        'Ledger Amount Dr/Cr': 'Cr'
      }
    ]

    const buffer = createWorkbookBuffer(rows)
    const result = parseTallyPayments(buffer)

    expect(result.success).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.data).toHaveLength(1)

    const v = result.data[0]
    expect(v.voucherNumber).toBe('PV-101')
    expect(v.type).toBe('PAYMENT')
    expect(v.amount).toBe(500000)
    expect(v.partyLedger).toBe('Tata Steel Ltd')
    expect(v.bankCashLedger).toBe('HDFC Bank Ltd')
    expect(v.voucherDate).toBe('2026-04-01')
    expect(v.address).toBe('Jamshedpur')
    expect(v.pincode).toBe('831001')
    expect(v.status).toBe('valid')
  })

  it('successfully parses valid 2-row Receipt vouchers with Bank as Dr and Party as Cr', () => {
    const rows = [
      {
        'Voucher Date': '02-04-2026',
        'Voucher Type Name': 'Receipt',
        'Voucher Number': 'RC-201',
        'Buyer/Supplier - Address': 'Kolkata',
        'Buyer/Supplier - Pincode': '700001',
        'Ledger Name': 'SBI Current A/c',
        'Ledger Amount': 350000,
        'Ledger Amount Dr/Cr': 'Dr'
      },
      {
        'Voucher Date': '02-04-2026',
        'Voucher Type Name': 'Receipt',
        'Voucher Number': 'RC-201',
        'Buyer/Supplier - Address': 'Kolkata',
        'Buyer/Supplier - Pincode': '700001',
        'Ledger Name': 'Apex Infrastructure',
        'Ledger Amount': 350000,
        'Ledger Amount Dr/Cr': 'Cr'
      }
    ]

    const buffer = createWorkbookBuffer(rows)
    const result = parseTallyPayments(buffer)

    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)

    const v = result.data[0]
    expect(v.voucherNumber).toBe('RC-201')
    expect(v.type).toBe('RECEIPT')
    expect(v.amount).toBe(350000)
    expect(v.bankCashLedger).toBe('SBI Current A/c')
    expect(v.partyLedger).toBe('Apex Infrastructure')
    expect(v.status).toBe('valid')
  })

  it('groups multiple vouchers correctly using composite key', () => {
    const rows = [
      // Voucher 1: Payment
      {
        'Voucher Date': '01-04-2026',
        'Voucher Type Name': 'Payment',
        'Voucher Number': 'VCH-01',
        'Ledger Name': 'Supplier A',
        'Ledger Amount': 10000,
        'Ledger Amount Dr/Cr': 'Dr'
      },
      {
        'Voucher Date': '01-04-2026',
        'Voucher Type Name': 'Payment',
        'Voucher Number': 'VCH-01',
        'Ledger Name': 'Bank A',
        'Ledger Amount': 10000,
        'Ledger Amount Dr/Cr': 'Cr'
      },
      // Voucher 2: Receipt
      {
        'Voucher Date': '02-04-2026',
        'Voucher Type Name': 'Receipt',
        'Voucher Number': 'VCH-02',
        'Ledger Name': 'Bank B',
        'Ledger Amount': 20000,
        'Ledger Amount Dr/Cr': 'Dr'
      },
      {
        'Voucher Date': '02-04-2026',
        'Voucher Type Name': 'Receipt',
        'Voucher Number': 'VCH-02',
        'Ledger Name': 'Customer B',
        'Ledger Amount': 20000,
        'Ledger Amount Dr/Cr': 'Cr'
      },
      // Non-payment row (Sales) should be filtered out
      {
        'Voucher Date': '03-04-2026',
        'Voucher Type Name': 'Sales',
        'Voucher Number': 'INV-01',
        'Ledger Name': 'Customer C',
        'Ledger Amount': 50000,
        'Ledger Amount Dr/Cr': 'Dr'
      }
    ]

    const buffer = createWorkbookBuffer(rows)
    const result = parseTallyPayments(buffer)

    expect(result.data).toHaveLength(2)
    expect(result.summary.paymentCount).toBe(1)
    expect(result.summary.receiptCount).toBe(1)
    expect(result.summary.totalPaymentAmount).toBe(10000)
    expect(result.summary.totalReceiptAmount).toBe(20000)
  })

  it('detects and flags mismatched Dr/Cr balances', () => {
    const rows = [
      {
        'Voucher Date': '01-04-2026',
        'Voucher Type Name': 'Payment',
        'Voucher Number': 'BAD-01',
        'Ledger Name': 'Supplier A',
        'Ledger Amount': 50000,
        'Ledger Amount Dr/Cr': 'Dr'
      },
      {
        'Voucher Date': '01-04-2026',
        'Voucher Type Name': 'Payment',
        'Voucher Number': 'BAD-01',
        'Ledger Name': 'Bank A',
        'Ledger Amount': 45000, // Mismatch!
        'Ledger Amount Dr/Cr': 'Cr'
      }
    ]

    const buffer = createWorkbookBuffer(rows)
    const result = parseTallyPayments(buffer)

    expect(result.success).toBe(false)
    expect(result.data[0].status).toBe('error')
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toContain('Mismatched Dr/Cr balance')
  })

  it('detects missing Dr or Cr entries (incomplete double entry)', () => {
    const rows = [
      {
        'Voucher Date': '01-04-2026',
        'Voucher Type Name': 'Payment',
        'Voucher Number': 'SINGLE-01',
        'Ledger Name': 'Supplier A',
        'Ledger Amount': 50000,
        'Ledger Amount Dr/Cr': 'Dr'
      }
    ]

    const buffer = createWorkbookBuffer(rows)
    const result = parseTallyPayments(buffer)

    expect(result.success).toBe(false)
    expect(result.data[0].status).toBe('error')
    expect(result.errors[0]).toContain('Missing Credit (Cr) row')
  })
})

describe('exportPaymentsToTallyExcel & Round-Trip', () => {
  it('converts payment vouchers to 2 balanced rows per voucher and supports round-trip parsing', () => {
    const vouchers: PaymentVoucher[] = [
      {
        id: 'test-1',
        voucherNumber: 'PAY-TEST-001',
        voucherDate: '2026-04-01',
        displayDate: '01-04-2026',
        type: 'PAYMENT',
        partyLedger: 'Bhushan Steel Corp',
        bankCashLedger: 'ICICI Bank Current',
        amount: 750000,
        address: 'Angul, Odisha',
        pincode: '759145',
        status: 'valid'
      },
      {
        id: 'test-2',
        voucherNumber: 'REC-TEST-002',
        voucherDate: '2026-04-03',
        displayDate: '03-04-2026',
        type: 'RECEIPT',
        partyLedger: 'Modern Constructions',
        bankCashLedger: 'Main Cash Box',
        amount: 85000,
        address: 'Bhubaneswar',
        pincode: '751024',
        status: 'valid'
      }
    ]

    const exportResult = exportPaymentsToTallyExcel(vouchers, {
      filename: 'test-export.xlsx',
      dateFormat: 'DD-MM-YYYY'
    })

    expect(exportResult.rowCount).toBe(4) // 2 vouchers * 2 rows = 4 rows
    expect(exportResult.buffer).toBeInstanceOf(Uint8Array)

    // Verify round-trip parsing of the exported buffer
    const parseResult = parseTallyPayments(exportResult.buffer)
    expect(parseResult.success).toBe(true)
    expect(parseResult.data).toHaveLength(2)

    const payVoucher = parseResult.data.find(v => v.voucherNumber === 'PAY-TEST-001')
    expect(payVoucher).toBeDefined()
    expect(payVoucher?.type).toBe('PAYMENT')
    expect(payVoucher?.partyLedger).toBe('Bhushan Steel Corp')
    expect(payVoucher?.bankCashLedger).toBe('ICICI Bank Current')
    expect(payVoucher?.amount).toBe(750000)
    expect(payVoucher?.address).toBe('Angul, Odisha')
    expect(payVoucher?.pincode).toBe('759145')

    const recVoucher = parseResult.data.find(v => v.voucherNumber === 'REC-TEST-002')
    expect(recVoucher).toBeDefined()
    expect(recVoucher?.type).toBe('RECEIPT')
    expect(recVoucher?.partyLedger).toBe('Modern Constructions')
    expect(recVoucher?.bankCashLedger).toBe('Main Cash Box')
    expect(recVoucher?.amount).toBe(85000)
  })
})

describe('Official 14-Column Tally Prime AccountingVouchers.xlsx Schema & Strict Ingestion', () => {
  const mockCustomers: Customer[] = [
    { id: 'c-alpha', name: 'Alpha Traders Ltd', gstin: '19AAACA1234F1Z1', stateCode: '19' }
  ]

  const mockSuppliers: Supplier[] = [
    { id: 's-apex', name: 'Apex Steel Corp', gstin: '19AAACS9999F1Z3', stateCode: '19', paymentCDRules: [], invoiceCloseCDRules: [] }
  ]

  const mockItems: Item[] = [
    { id: 'item-ferroseal', name: 'FERROSEAL 3.15X450 (6X90 Pc)', unit: 'PCS', gstRate: 18 }
  ]

  it('defines the official 14-column canonical headers in exact order', () => {
    expect(TALLY_COLUMN_HEADERS).toEqual([
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
    ])
  })

  it('generates a 14-column sample workbook with "Accounting Voucher" sheet name', () => {
    const res = generateSampleTallyExcel('test-sample.xlsx')
    expect(res.buffer).toBeInstanceOf(Uint8Array)
    expect(res.workbook.SheetNames).toContain('Accounting Voucher')

    const sheet = res.workbook.Sheets['Accounting Voucher']
    const rows = XLSX.utils.sheet_to_json<any>(sheet)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0]['Change Mode']).toBeDefined()
  })

  it('parses 14-column multi-module Excel vouchers with strict master entity matching', () => {
    const rawRows = [
      // Sales Invoice with Item
      {
        'Voucher Date': '01-12-2025',
        'Voucher Type Name': 'Sales',
        'Voucher Number': 'SKT/25-26/816',
        'Buyer/Supplier - Address': 'Kolkata, WB',
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
        'Buyer/Supplier - Address': 'Kolkata, WB',
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
        'Buyer/Supplier - Address': 'Kolkata, WB',
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
        'Buyer/Supplier - Address': 'Kolkata, WB',
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
        'Buyer/Supplier - Address': 'Kolkata, WB',
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

      // Unknown Customer Voucher (Should be marked Unmapped Master, NOT auto-created)
      {
        'Voucher Date': '02-12-2025',
        'Voucher Type Name': 'Receipt',
        'Voucher Number': 'REC-999',
        'Buyer/Supplier - Address': 'Delhi',
        'Buyer/Supplier - Pincode': '110001',
        'Ledger Name': 'HDFC Bank Ltd',
        'Ledger Amount': 50000.00,
        'Ledger Amount Dr/Cr': 'Dr',
        'Item Name': '',
        'Change Mode': 'Accounting Invoice'
      },
      {
        'Voucher Date': '02-12-2025',
        'Voucher Type Name': 'Receipt',
        'Voucher Number': 'REC-999',
        'Buyer/Supplier - Address': 'Delhi',
        'Buyer/Supplier - Pincode': '110001',
        'Ledger Name': 'Unknown Foreign Buyer Inc',
        'Ledger Amount': 50000.00,
        'Ledger Amount Dr/Cr': 'Cr',
        'Item Name': '',
        'Change Mode': 'Accounting Invoice'
      }
    ]

    const ws = XLSX.utils.json_to_sheet(rawRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Accounting Voucher')
    const buffer = new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }))

    const result = parseTallyAccountingVouchersExcel(buffer, {
      customers: mockCustomers,
      suppliers: mockSuppliers,
      items: mockItems
    })

    expect(result.success).toBe(true)
    expect(result.vouchers).toHaveLength(2)

    // Voucher 1: Sales invoice with item
    const salesVch = result.vouchers.find(v => v.normalizedType === 'sales')
    expect(salesVch).toBeDefined()
    expect(salesVch?.voucherNumber).toBe('SKT/25-26/816')
    expect(salesVch?.partyName).toBe('Alpha Traders Ltd')
    expect(salesVch?.matchedEntityType).toBe('customer')
    expect(salesVch?.matchedEntityId).toBe('c-alpha')
    expect(salesVch?.isBalanced).toBe(true)
    expect(salesVch?.inventory).toHaveLength(1)
    expect(salesVch?.inventory[0].itemName).toBe('FERROSEAL 3.15X450 (6X90 Pc)')
    expect(salesVch?.inventory[0].quantity).toBe(1080)

    // Voucher 2: Unmapped party
    const unmappedVch = result.vouchers.find(v => v.voucherNumber === 'REC-999')
    expect(unmappedVch).toBeDefined()
    expect(unmappedVch?.partyName).toBe('Unknown Foreign Buyer Inc')
    expect(unmappedVch?.matchedEntityType).toBe('unmapped')
    expect(unmappedVch?.skipReason).toContain('Unmapped Master: Unknown Foreign Buyer Inc')
  })

  it('parses Contra and Expense vouchers from 14-column Excel correctly', () => {
    const rawRows = [
      // 1. Contra Voucher
      {
        'Voucher Date': '05-12-2025',
        'Voucher Type Name': 'Contra',
        'Voucher Number': '53',
        'Ledger Name': 'CANARA BANK OD A/C - 125001590160',
        'Ledger Amount': 50000.00,
        'Ledger Amount Dr/Cr': 'Cr',
        'Item Name': '',
        'Change Mode': 'Accounting Invoice'
      },
      {
        'Voucher Date': '05-12-2025',
        'Voucher Type Name': 'Contra',
        'Voucher Number': '53',
        'Ledger Name': 'Indusind Bank (SB)-159635070410',
        'Ledger Amount': 50000.00,
        'Ledger Amount Dr/Cr': 'Dr',
        'Item Name': '',
        'Change Mode': 'Accounting Invoice'
      },
      // 2. Expense Voucher (Bank Charges)
      {
        'Voucher Date': '01-12-2025',
        'Voucher Type Name': 'Payment',
        'Voucher Number': '171',
        'Ledger Name': 'Bank Charges',
        'Ledger Amount': 2469.00,
        'Ledger Amount Dr/Cr': 'Dr',
        'Item Name': '',
        'Change Mode': 'Accounting Invoice'
      },
      {
        'Voucher Date': '01-12-2025',
        'Voucher Type Name': 'Payment',
        'Voucher Number': '171',
        'Ledger Name': 'CANARA BANK OD A/C - 125001590160',
        'Ledger Amount': 2469.00,
        'Ledger Amount Dr/Cr': 'Cr',
        'Item Name': '',
        'Change Mode': 'Accounting Invoice'
      }
    ]

    const ws = XLSX.utils.json_to_sheet(rawRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Accounting Voucher')
    const buffer = new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }))

    const result = parseTallyAccountingVouchersExcel(buffer, {
      expenseTypes: [
        { id: 'exp-bank-charges', name: 'Bank Charges' }
      ]
    })

    expect(result.success).toBe(true)
    expect(result.summary.contraCount).toBe(1)
    expect(result.summary.expenseCount).toBe(1)

    const contraVch = result.vouchers.find(v => v.voucherNumber === '53')
    expect(contraVch).toBeDefined()
    expect(contraVch?.normalizedType).toBe('contra')
    expect(contraVch?.contraDetails?.fromCounterName).toBe('CANARA BANK OD A/C - 125001590160')
    expect(contraVch?.contraDetails?.toCounterName).toBe('Indusind Bank (SB)-159635070410')
    expect(contraVch?.totalAmount).toBe(50000)

    const expVch = result.vouchers.find(v => v.voucherNumber === '171')
    expect(expVch).toBeDefined()
    expect(expVch?.normalizedType).toBe('expense')
    expect(expVch?.matchedEntityId).toBe('exp-bank-charges')
    expect(expVch?.totalAmount).toBe(2469)

    expect(result.newMasterCandidates).toBeDefined()
    expect(result.newMasterCandidates.counters.length).toBeGreaterThanOrEqual(2)
  })
})
