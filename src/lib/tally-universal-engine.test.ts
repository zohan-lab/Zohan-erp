import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import {
  generateTallySalesVouchers,
  generateTallyPurchaseVouchers,
  generateTallyCreditNoteVouchers,
  generateTallyDebitNoteVouchers,
  generateTallyExpenseVouchers,
  exportCompoundVouchersToTallyExcel,
  generateTallyXML,
  generateTallyLedgersXML,
  DEFAULT_TALLY_LEDGER_MAPPING
} from './tally-universal-engine'
import { SalesInvoice, PurchaseInvoice, CustomerCreditNote, SupplierDebitNote, ExpenseEntry, Customer, Supplier, Party, Item, ExpenseType } from './types'

describe('Universal Tally Compound Double-Entry Engine', () => {
  const mockCustomers: Customer[] = [
    { id: 'c1', name: 'Alpha Traders Ltd', gstin: '19AAACA1234F1Z1', stateCode: '19' },
    { id: 'c2', name: 'Interstate Buyer Co', gstin: '10BBBCB5678F1Z2', stateCode: '10' }
  ]

  const mockSuppliers: Supplier[] = [
    { id: 's1', name: 'Apex Steel Industries', gstin: '19AAACS9999F1Z3', stateCode: '19', paymentCDRules: [], invoiceCloseCDRules: [] },
    { id: 's2', name: 'National Cement Corp', gstin: '20CCCCS1111F1Z4', stateCode: '20', paymentCDRules: [], invoiceCloseCDRules: [] }
  ]

  const mockItems: Item[] = [
    { id: 'item-3pct', name: 'Gold Dust (3% Tax Slab)', gstRate: 3, unit: 'GM', purchasePrice: 485.44, salesPrice: 485.44, openingStock: 10 }
  ]

  const mockExpenseTypes: ExpenseType[] = [
    { id: 'exp-cat-1786873355957', name: 'Office Maintenance', isGstApplicable: true, defaultGstRate: 18 }
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

    const vouchers = generateTallySalesVouchers(salesInvoices, mockCustomers, mockItems, DEFAULT_TALLY_LEDGER_MAPPING, '19')
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

  it('accurately computes 3% GST rate with zero false round-off for Invoice #JHHGV', () => {
    const salesInvoices: SalesInvoice[] = [
      {
        id: 'si-jhhgv',
        customerId: 'c1',
        invoiceNo: 'JHHGV',
        invoiceDate: '2026-08-16',
        invoiceAmount: 500,
        totalAmount: 500,
        items: [
          {
            itemId: 'item-3pct',
            enteredQuantity: 1,
            enteredUnit: 'GM',
            baseQuantity: 1,
            rate: 500,
            amount: 500,
            gstRate: 3
          }
        ],
        fy: '2026-2027'
      }
    ]

    const vouchers = generateTallySalesVouchers(salesInvoices, mockCustomers, mockItems, DEFAULT_TALLY_LEDGER_MAPPING, '19')
    expect(vouchers).toHaveLength(1)
    const v = vouchers[0]
    expect(v.isBalanced).toBe(true)
    expect(v.imbalanceDifference).toBe(0)

    // Base Taxable: ₹485.44
    const salesLeg = v.legs.find(l => l.ledgerName === 'Sales Account')
    expect(salesLeg?.amount).toBe(485.44)

    // CGST 1.5%: ₹7.28
    const cgstLeg = v.legs.find(l => l.ledgerName === 'Output CGST')
    expect(cgstLeg?.amount).toBe(7.28)

    // SGST 1.5%: ₹7.28
    const sgstLeg = v.legs.find(l => l.ledgerName === 'Output SGST')
    expect(sgstLeg?.amount).toBe(7.28)

    // Round Off: ₹0.00
    const roundOffLeg = v.legs.find(l => l.ledgerName === 'Round Off')
    expect(roundOffLeg).toBeUndefined()
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

    const vouchers = generateTallyPurchaseVouchers(purchaseInvoices, mockSuppliers, mockItems, DEFAULT_TALLY_LEDGER_MAPPING, '19')
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

  it('resolves clean expense category display name instead of leaking raw UUIDs', () => {
    const expenses: ExpenseEntry[] = [
      {
        id: 'exp-clean-1',
        expenseTypeId: 'exp-cat-1786873355957',
        categoryId: 'exp-cat-1786873355957',
        supplierName: 'RESHOB',
        amount: 1000,
        taxableAmount: 847.46,
        hasGst: true,
        gstRate: 18,
        cgstAmount: 76.27,
        sgstAmount: 76.27,
        igstAmount: 0,
        totalExpenseAmount: 1000,
        expenseDate: '2026-08-16',
        fy: '2026-2027'
      }
    ]

    const vouchers = generateTallyExpenseVouchers(expenses, mockExpenseTypes, DEFAULT_TALLY_LEDGER_MAPPING, '19')
    expect(vouchers).toHaveLength(1)
    const v = vouchers[0]
    expect(v.isBalanced).toBe(true)

    // Should resolve to 'Office Maintenance - RESHOB' rather than 'exp-cat-1786873355957 - RESHOB'
    expect(v.legs[0].ledgerName).toBe('Office Maintenance - RESHOB')
    expect(v.legs[0].amount).toBe(847.46)
    expect(v.legs[0].drCr).toBe('Dr')

    // Input CGST leg
    expect(v.legs[1].ledgerName).toBe('Input CGST')
    expect(v.legs[1].amount).toBe(76.27)

    // Input SGST leg
    expect(v.legs[2].ledgerName).toBe('Input SGST')
    expect(v.legs[2].amount).toBe(76.27)

    // Bank Account leg
    expect(v.legs[3].ledgerName).toBe('Bank Account')
    expect(v.legs[3].amount).toBe(1000)
    expect(v.legs[3].drCr).toBe('Cr')
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

    const vouchers = generateTallyExpenseVouchers(expenses, mockExpenseTypes, DEFAULT_TALLY_LEDGER_MAPPING, '19')
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

    const vouchers = generateTallySalesVouchers(salesInvoices, mockCustomers, mockItems, DEFAULT_TALLY_LEDGER_MAPPING, '19')
    const xml = generateTallyXML(vouchers, 'SK TRADERS')

    expect(xml).toContain('<ENVELOPE>')
    expect(xml).toContain('<SVCURRENTCOMPANY>SK TRADERS</SVCURRENTCOMPANY>')
    expect(xml).toContain('<VOUCHER VCHTYPE="Sales"')
    expect(xml).toContain('<LEDGERNAME>Alpha Traders Ltd</LEDGERNAME>')
    expect(xml).toContain('<AMOUNT>-11800.00</AMOUNT>') // Debit is negative in Tally XML
    expect(xml).toContain('<LEDGERNAME>Sales Account</LEDGERNAME>')
    expect(xml).toContain('<AMOUNT>10000.00</AMOUNT>') // Credit is positive in Tally XML
    expect(xml).toContain('<GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>')
  })

  it('generates Tally Master XML with mapped GSTREGISTRATIONTYPE for Regular, Unregistered, and Composition', () => {
    const parties: Party[] = [
      { id: 'p1', name: 'Tata Steel Ltd', gstin: '19AAACT1234F1Z1', gstRegistrationType: 'Regular', partyType: 'SUPPLIER' },
      { id: 'p2', name: 'Local Retail Buyer', gstRegistrationType: 'Unregistered/Consumer', partyType: 'CUSTOMER' },
      { id: 'p3', name: 'Sharma Composite Works', gstin: '19AAACS5678F1Z2', gstRegistrationType: 'Composition', partyType: 'CUSTOMER' }
    ]

    const xml = generateTallyLedgersXML(parties, 'SK TRADERS')
    expect(xml).toContain('<LEDGER NAME="Tata Steel Ltd"')
    expect(xml).toContain('<PARENT>Sundry Creditors</PARENT>')
    expect(xml).toContain('<GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>')

    expect(xml).toContain('<LEDGER NAME="Local Retail Buyer"')
    expect(xml).toContain('<PARENT>Sundry Debtors</PARENT>')
    expect(xml).toContain('<GSTREGISTRATIONTYPE>Unregistered</GSTREGISTRATIONTYPE>')

    expect(xml).toContain('<LEDGER NAME="Sharma Composite Works"')
    expect(xml).toContain('<GSTREGISTRATIONTYPE>Composition</GSTREGISTRATIONTYPE>')
  })

  it('exports compound vouchers to official 14-column Accounting Voucher Excel workbook', () => {
    const salesInvoices: SalesInvoice[] = [
      {
        id: 'si-item',
        customerId: 'c1',
        invoiceNo: 'INV-102',
        invoiceDate: '2026-04-10',
        invoiceAmount: 500,
        totalAmount: 500,
        items: [
          {
            itemId: 'item-3pct',
            enteredQuantity: 1,
            enteredUnit: 'GM',
            baseQuantity: 1,
            rate: 500,
            amount: 500,
            gstRate: 3
          }
        ],
        fy: '2026-2027'
      }
    ]

    const vouchers = generateTallySalesVouchers(salesInvoices, mockCustomers, mockItems, DEFAULT_TALLY_LEDGER_MAPPING, '19')
    expect(vouchers[0].changeMode).toBe('Item Invoice')
    expect(vouchers[0].legs.some(l => l.itemName === 'Gold Dust (3% Tax Slab)')).toBe(true)

    const exportResult = exportCompoundVouchersToTallyExcel(vouchers, { filename: 'test-14col.xlsx' })
    expect(exportResult.buffer).toBeInstanceOf(Uint8Array)
    expect(exportResult.workbook.SheetNames).toContain('Accounting Voucher')

    const sheet = exportResult.workbook.Sheets['Accounting Voucher']
    const rows = XLSX.utils.sheet_to_json<any>(sheet)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0]).toHaveProperty('Voucher Date')
    expect(rows[0]).toHaveProperty('Voucher Type Name')
    expect(rows[0]).toHaveProperty('Voucher Number')
    expect(rows[0]).toHaveProperty('Buyer/Supplier - Address')
    expect(rows[0]).toHaveProperty('Buyer/Supplier - Pincode')
    expect(rows[0]).toHaveProperty('Ledger Name')
    expect(rows[0]).toHaveProperty('Ledger Amount')
    expect(rows[0]).toHaveProperty('Ledger Amount Dr/Cr')
    expect(rows[0]).toHaveProperty('Item Name')
    expect(rows[0]).toHaveProperty('Billed Quantity')
    expect(rows[0]).toHaveProperty('Item Rate')
    expect(rows[0]).toHaveProperty('Item Rate per')
    expect(rows[0]).toHaveProperty('Item Amount')
    expect(rows[0]).toHaveProperty('Change Mode')
  })
})
