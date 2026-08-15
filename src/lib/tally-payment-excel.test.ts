import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  parseTallyPayments,
  exportPaymentsToTallyExcel,
  normalizeTallyDate,
  parseTallyAmount,
  normalizeDrCr,
  normalizeVoucherType,
  PaymentVoucher
} from './tally-payment-excel'

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
