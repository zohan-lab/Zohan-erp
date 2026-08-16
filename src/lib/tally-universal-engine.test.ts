import { describe, it, expect } from 'vitest'
import {
  generateTallySalesVouchers,
  generateTallyPurchaseVouchers,
  generateTallyCreditNoteVouchers,
  generateTallyDebitNoteVouchers,
  generateTallyExpenseVouchers,
  generateTallyXML,
  DEFAULT_TALLY_LEDGER_MAPPING
} from './tally-universal-engine'
import { SalesInvoice, PurchaseInvoice, CustomerCreditNote, SupplierDebitNote, ExpenseEntry, Customer, Supplier } from './types'

describe('Universal Tally Compound Double-Entry Engine', () => {
  const mockCustomers: Customer[] = [
    { id: 'c1', name: 'Alpha Traders Ltd', gstin: '19AAACA1234F1Z1', stateCode: '19' },
    { id: 'c2', name: 'Interstate Buyer Co', gstin: '10BBBCB5678F1Z2', stateCode: '10' }
  ]

  const mockSuppliers: Supplier[] = [
    { id: 's1', name: 'Apex Steel Industries', gstin: '19AAACS9999F1Z3', stateCode: '19', paymentCDRules: [], invoiceCloseCDRules: [] },
    { id: 's2', name: 'National Cement Corp', gstin: '20CCCCS1111F1Z4', stateCode: '20', paymentCDRules: [], invoiceCloseCDRules: [] }
  ]

  it('generates perfectly balanced intra-state Sales vouchers with CGST & SGST', () => {
    const salesInvoices: SalesInvoice[] = [
      {
        id: 'si-1',
        customerId: 'c1',
        invoiceNo: 'INV-101',
        invoiceDate: '2026-04-10',
        invoiceAmount: 11800,
        taxableAmount: 10000,
        cgstAmount: 900,
        sgstAmount: 900,
        igstAmount: 0,
        fy: '2026-2027'
      }
    ]

    const vouchers = generateTallySalesVouchers(salesInvoices, mockCustomers, DEFAULT_TALLY_LEDGER_MAPPING, '19')
    expect(vouchers).toHaveLength(1)
    const v = vouchers[0]
    expect(v.voucherType).toBe('Sales')
    expect(v.isBalanced).toBe(true)
    expect(v.imbalanceDifference).toBe(0)
    expect(v.legs).toHaveLength(4)

    // Leg 1: Dr Alpha Traders Ltd ₹11,800
    expect(v.legs[0]).toEqual({ ledgerName: 'Alpha Traders Ltd', amount: 11800, drCr: 'Dr' })
    // Leg 2: Cr Sales Account ₹10,000
    expect(v.legs[1]).toEqual({ ledgerName: 'Sales Account', amount: 10000, drCr: 'Cr' })
    // Leg 3: Cr Output CGST ₹900
    expect(v.legs[2]).toEqual({ ledgerName: 'Output CGST', amount: 900, drCr: 'Cr' })
    // Leg 4: Cr Output SGST ₹900
    expect(v.legs[3]).toEqual({ ledgerName: 'Output SGST', amount: 900, drCr: 'Cr' })
  })

  it('generates balanced inter-state Purchase vouchers with IGST', () => {
    const purchaseInvoices: PurchaseInvoice[] = [
      {
        id: 'pi-1',
        supplierId: 's2',
        invoiceNo: 'PUR-201',
        invoiceDate: '2026-04-12',
        invoiceAmount: 59000,
        taxableAmount: 50000,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 9000,
        fy: '2026-2027'
      }
    ]

    const vouchers = generateTallyPurchaseVouchers(purchaseInvoices, mockSuppliers, DEFAULT_TALLY_LEDGER_MAPPING, '19')
    expect(vouchers).toHaveLength(1)
    const v = vouchers[0]
    expect(v.voucherType).toBe('Purchase')
    expect(v.isBalanced).toBe(true)
    expect(v.legs).toHaveLength(3)

    // Leg 1: Cr National Cement Corp ₹59,000
    expect(v.legs[0]).toEqual({ ledgerName: 'National Cement Corp', amount: 59000, drCr: 'Cr' })
    // Leg 2: Dr Purchase Account ₹50,000
    expect(v.legs[1]).toEqual({ ledgerName: 'Purchase Account', amount: 50000, drCr: 'Dr' })
    // Leg 3: Dr Input IGST ₹9,000
    expect(v.legs[2]).toEqual({ ledgerName: 'Input IGST', amount: 9000, drCr: 'Dr' })
  })

  it('generates Customer Credit Note with statutory tax reversal legs', () => {
    const creditNotes: CustomerCreditNote[] = [
      {
        id: 'cn-1',
        customerId: 'c1',
        noteNo: 'CN-501',
        date: '2026-04-15',
        amount: 1180,
        taxableAmount: 1000,
        cgstAmount: 90,
        sgstAmount: 90,
        igstAmount: 0,
        totalAmount: 1180,
        originalInvoiceNo: 'INV-101',
        originalInvoiceDate: '2026-04-10',
        reason: 'Goods Returned',
        fy: '2026-2027'
      }
    ]

    const vouchers = generateTallyCreditNoteVouchers(creditNotes, mockCustomers, DEFAULT_TALLY_LEDGER_MAPPING, '19')
    expect(vouchers).toHaveLength(1)
    const v = vouchers[0]
    expect(v.voucherType).toBe('Credit Note')
    expect(v.isBalanced).toBe(true)

    // Cr Customer ₹1,180
    expect(v.legs[0]).toEqual({ ledgerName: 'Alpha Traders Ltd', amount: 1180, drCr: 'Cr' })
    // Dr Sales Return ₹1,000
    expect(v.legs[1]).toEqual({ ledgerName: 'Sales Return', amount: 1000, drCr: 'Dr' })
    // Dr Output CGST ₹90
    expect(v.legs[2]).toEqual({ ledgerName: 'Output CGST', amount: 90, drCr: 'Dr' })
    // Dr Output SGST ₹90
    expect(v.legs[3]).toEqual({ ledgerName: 'Output SGST', amount: 90, drCr: 'Dr' })
  })

  it('generates GTA 5% RCM dual vouchers (Payment + Journal)', () => {
    const expenses: ExpenseEntry[] = [
      {
        id: 'exp-1',
        expenseTypeId: 'et-1',
        invoiceRefNo: 'VCH-GTA-01',
        expenseDate: '2026-04-18',
        categoryId: 'Transportation',
        supplierName: 'Maa Tara Transport',
        amount: 20000,
        taxableAmount: 20000,
        hasGst: true,
        gstRate: 5,
        isRcm: true,
        cgstAmount: 500,
        sgstAmount: 500,
        igstAmount: 0,
        totalExpenseAmount: 20000,
        itcType: 'Input Services',
        fy: '2026-2027'
      }
    ]

    const vouchers = generateTallyExpenseVouchers(expenses, DEFAULT_TALLY_LEDGER_MAPPING, '19')
    expect(vouchers).toHaveLength(2)

    // Voucher 1: Payment to Transporter
    expect(vouchers[0].voucherType).toBe('Payment')
    expect(vouchers[0].totalAmount).toBe(20000)
    expect(vouchers[0].isBalanced).toBe(true)

    // Voucher 2: Journal Voucher for RCM Liability and ITC
    expect(vouchers[1].voucherType).toBe('Journal')
    expect(vouchers[1].totalAmount).toBe(1000)
    expect(vouchers[1].isBalanced).toBe(true)
    expect(vouchers[1].legs).toHaveLength(4)
  })

  it('exports valid Tally XML string containing TALLYMESSAGE and ENVELOPE', () => {
    const salesInvoices: SalesInvoice[] = [
      {
        id: 'si-1',
        customerId: 'c1',
        invoiceNo: 'INV-101',
        invoiceDate: '2026-04-10',
        invoiceAmount: 11800,
        taxableAmount: 10000,
        cgstAmount: 900,
        sgstAmount: 900,
        igstAmount: 0,
        fy: '2026-2027'
      }
    ]

    const vouchers = generateTallySalesVouchers(salesInvoices, mockCustomers, DEFAULT_TALLY_LEDGER_MAPPING, '19')
    const xml = generateTallyXML(vouchers, 'SK TRADERS')

    expect(xml).toContain('<ENVELOPE>')
    expect(xml).toContain('<SVCURRENTCOMPANY>SK TRADERS</SVCURRENTCOMPANY>')
    expect(xml).toContain('<VOUCHER VCHTYPE="Sales"')
    expect(xml).toContain('<LEDGERNAME>Alpha Traders Ltd</LEDGERNAME>')
    expect(xml).toContain('<AMOUNT>-11800.00</AMOUNT>') // Debit is negative in Tally XML
    expect(xml).toContain('<LEDGERNAME>Sales Account</LEDGERNAME>')
    expect(xml).toContain('<AMOUNT>10000.00</AMOUNT>') // Credit is positive in Tally XML
  })
})
