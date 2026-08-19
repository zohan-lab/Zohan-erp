import { describe, it, expect } from 'vitest'
import { computeMonthlyGstReport, GstReportSourceData, GstDateFilter } from './gst-report-calculations'
import { SalesInvoice, PurchaseInvoice, ExpenseEntry, CustomerCreditNote, Customer, Supplier } from './types'

describe('GST Report Calculations Engine', () => {
  const mockCustomers: Customer[] = [
    { id: 'c1', name: 'B2B Customer Ltd', gstin: '19AAACB1234F1Z1', stateCode: '19' },
    { id: 'c2', name: 'Retail Cash Buyer', stateCode: '19' } // Unregistered B2C
  ]

  const mockSuppliers: Supplier[] = [
    { id: 's1', name: 'National Steel Corp', gstin: '19AAACS5678F1Z2', stateCode: '19', paymentCDRules: [], invoiceCloseCDRules: [] },
    { id: 's2', name: 'Interstate Cement Ltd', gstin: '10BBBCS9999F1Z3', stateCode: '10', paymentCDRules: [], invoiceCloseCDRules: [] }
  ]

  const mockSalesInvoices: SalesInvoice[] = [
    {
      id: 'si-1',
      customerId: 'c1',
      invoiceNo: 'INV-001',
      invoiceDate: '2026-04-10',
      invoiceAmount: 118000,
      taxableAmount: 100000,
      cgstAmount: 9000,
      sgstAmount: 9000,
      igstAmount: 0,
      cgstRate: 9,
      sgstRate: 9,
      fy: '2026-2027'
    },
    {
      id: 'si-2',
      customerId: 'c2',
      invoiceNo: 'INV-002',
      invoiceDate: '2026-04-15',
      invoiceAmount: 59000,
      taxableAmount: 50000,
      cgstAmount: 4500,
      sgstAmount: 4500,
      igstAmount: 0,
      cgstRate: 9,
      sgstRate: 9,
      fy: '2026-2027'
    }
  ]

  const mockPurchaseInvoices: PurchaseInvoice[] = [
    {
      id: 'pi-1',
      supplierId: 's1',
      invoiceNo: 'PUR-001',
      invoiceDate: '2026-04-05',
      invoiceAmount: 94400,
      taxableAmount: 80000,
      cgstAmount: 7200,
      sgstAmount: 7200,
      igstAmount: 0,
      cgstRate: 9,
      sgstRate: 9,
      fy: '2026-2027'
    }
  ]

  const mockExpenses: ExpenseEntry[] = [
    // GTA Transport with RCM
    {
      id: 'exp-1',
      expenseTypeId: 'et-1',
      invoiceRefNo: 'VCH-01',
      expenseDate: '2026-04-12',
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
    },
    // Office Rent (Regular GST)
    {
      id: 'exp-2',
      expenseTypeId: 'et-2',
      invoiceRefNo: 'VCH-02',
      expenseDate: '2026-04-20',
      categoryId: 'Office Rent',
      supplierName: 'Real Estate Co',
      supplierGstin: '19XYZAB1234A1Z5',
      amount: 11800,
      taxableAmount: 10000,
      hasGst: true,
      gstRate: 18,
      isRcm: false,
      cgstAmount: 900,
      sgstAmount: 900,
      igstAmount: 0,
      totalExpenseAmount: 11800,
      itcType: 'Input Services',
      fy: '2026-2027'
    }
  ]

  const mockCreditNotes: CustomerCreditNote[] = [
    {
      id: 'cn-1',
      customerId: 'c1',
      noteNo: 'CN-001',
      date: '2026-04-25',
      amount: 11800,
      taxableAmount: 10000,
      cgstAmount: 900,
      sgstAmount: 900,
      igstAmount: 0,
      totalAmount: 11800,
      fy: '2026-2027'
    }
  ]

  const sourceData: GstReportSourceData = {
    salesInvoices: mockSalesInvoices,
    salesReturns: [],
    customerCreditNotes: mockCreditNotes,
    customerDebitNotes: [],
    purchaseInvoices: mockPurchaseInvoices,
    purchaseReturns: [],
    supplierDebitNotes: [],
    supplierCreditNotes: [],
    expenseEntries: mockExpenses,
    customers: mockCustomers,
    suppliers: mockSuppliers,
    companyStateCode: '19'
  }

  const filter: GstDateFilter = {
    month: 4,
    year: 2026
  }

  it('correctly aggregates GSTR-3B Table 3.1 Outward and RCM liability', () => {
    const report = computeMonthlyGstReport(sourceData, filter)

    // Gross Sales (150,000) - Credit Note (10,000) = Net Taxable 140,000
    expect(report.gstr3b.table31.outwardTaxable.taxableAmount).toBe(140000)
    // CGST: 9000 + 4500 - 900 = 12600
    expect(report.gstr3b.table31.outwardTaxable.cgst).toBe(12600)
    expect(report.gstr3b.table31.outwardTaxable.sgst).toBe(12600)
    expect(report.gstr3b.table31.outwardTaxable.totalTax).toBe(25200)

    // Inward RCM liability: 20,000 @ 5% = 1,000 (500 CGST + 500 SGST)
    expect(report.gstr3b.table31.inwardRcm.taxableAmount).toBe(20000)
    expect(report.gstr3b.table31.inwardRcm.cgst).toBe(500)
    expect(report.gstr3b.table31.inwardRcm.sgst).toBe(500)
    expect(report.gstr3b.table31.inwardRcm.totalTax).toBe(1000)

    // Total Liability: 25,200 + 1,000 = 26,200
    expect(report.gstr3b.table31.totalLiability.totalTax).toBe(26200)
  })

  it('correctly aggregates GSTR-3B Table 4 Eligible ITC', () => {
    const report = computeMonthlyGstReport(sourceData, filter)

    // 4(A)(3) RCM ITC = 1,000
    expect(report.gstr3b.table4.itcRcmInward.totalTax).toBe(1000)

    // 4(A)(5) Purchases (7200 + 7200) + Office Rent (900 + 900) = 14400 + 1800 = 16200
    expect(report.gstr3b.table4.itcAllOther.cgst).toBe(8100)
    expect(report.gstr3b.table4.itcAllOther.sgst).toBe(8100)
    expect(report.gstr3b.table4.itcAllOther.totalTax).toBe(16200)

    // 4(C) Net ITC = 1,000 + 16,200 = 17,200
    expect(report.gstr3b.table4.netItcAvailable.totalTax).toBe(17200)
  })

  it('correctly computes GSTR-3B Table 5.1 Cash Tax Discharge required', () => {
    const report = computeMonthlyGstReport(sourceData, filter)

    // Outward Liability = 12600 CGST + 12600 SGST
    // ITC Utilized = 8600 CGST + 8600 SGST (from 17200 total ITC)
    // Outward Cash = 12600 - 8600 = 4000 CGST + 4000 SGST
    // Plus RCM Cash (must be paid in cash) = 500 CGST + 500 SGST
    // Total Cash Payable = 4500 CGST + 4500 SGST = 9000
    expect(report.gstr3b.table51.cashPayable.cgst).toBe(4500)
    expect(report.gstr3b.table51.cashPayable.sgst).toBe(4500)
    expect(report.gstr3b.table51.cashPayable.totalTax).toBe(9000)
  })

  it('segregates GSTR-1 into B2B and B2C tables', () => {
    const report = computeMonthlyGstReport(sourceData, filter)

    expect(report.gstr1.b2b).toHaveLength(1)
    expect(report.gstr1.b2b[0].invoiceNo).toBe('INV-001')
    expect(report.gstr1.b2b[0].gstin).toBe('19AAACB1234F1Z1')

    expect(report.gstr1.b2c).toHaveLength(1)
    expect(report.gstr1.b2c[0].taxableValue).toBe(50000)

    expect(report.gstr1.notes).toHaveLength(1)
    expect(report.gstr1.notes[0].noteNo).toBe('CN-001')
  })

  it('correctly bifurcates B2C Large (> ₹1 Lakh Interstate) vs B2C Small (Table 7) and respects gstRegistrationType', () => {
    const mixedCustomers: Customer[] = [
      { id: 'c-b2b', name: 'Explicit B2B', gstRegistrationType: 'Registered', gstin: '19AAACB9999F1Z1', stateCode: '19' },
      { id: 'c-inter-large', name: 'Bihar Retail High Value', gstRegistrationType: 'Unregistered', stateCode: '10' },
      { id: 'c-intra-small', name: 'Local Retail Small', gstRegistrationType: 'Unregistered', stateCode: '19' },
      { id: 'c-inter-small', name: 'Jharkhand Retail Low Value', gstRegistrationType: 'Unregistered', stateCode: '20' }
    ]

    const testInvoices: SalesInvoice[] = [
      {
        id: 'si-b2b',
        customerId: 'c-b2b',
        invoiceNo: 'INV-B2B',
        invoiceDate: '2026-04-02',
        invoiceAmount: 50000,
        taxableAmount: 42372.88,
        cgstAmount: 3813.56,
        sgstAmount: 3813.56,
        fy: '2026-2027'
      },
      {
        id: 'si-large',
        customerId: 'c-inter-large',
        invoiceNo: 'INV-LARGE',
        invoiceDate: '2026-04-03',
        invoiceAmount: 150000, // > 1,00,000 Interstate
        taxableAmount: 127118.64,
        igstAmount: 22881.36,
        igstRate: 18,
        fy: '2026-2027'
      },
      {
        id: 'si-small-local',
        customerId: 'c-intra-small',
        invoiceNo: 'INV-SMALL-1',
        invoiceDate: '2026-04-04',
        invoiceAmount: 250000, // Intra-state (even if > 1L, stays in Table 7 B2C Small)
        taxableAmount: 211864.41,
        cgstAmount: 19067.8,
        sgstAmount: 19067.8,
        fy: '2026-2027'
      },
      {
        id: 'si-small-inter',
        customerId: 'c-inter-small',
        invoiceNo: 'INV-SMALL-2',
        invoiceDate: '2026-04-05',
        invoiceAmount: 45000, // <= 1,00,000 Interstate -> Table 7
        taxableAmount: 38135.59,
        igstAmount: 6864.41,
        igstRate: 18,
        fy: '2026-2027'
      }
    ]

    const report = computeMonthlyGstReport({
      ...sourceData,
      salesInvoices: testInvoices,
      customers: mixedCustomers,
      customerCreditNotes: [],
      expenseEntries: []
    }, filter)

    // 1 B2B invoice
    expect(report.gstr1.b2b).toHaveLength(1)
    expect(report.gstr1.b2b[0].invoiceNo).toBe('INV-B2B')

    // 1 B2C Large (Table 5) invoice
    expect(report.gstr1.b2cLarge).toHaveLength(1)
    expect(report.gstr1.b2cLarge[0].invoiceNo).toBe('INV-LARGE')
    expect(report.gstr1.b2cLarge[0].pos).toBe('10')
    expect(report.gstr1.b2cLarge[0].totalInvoiceValue).toBe(150000)

    // 2 B2C Small groups (Table 7)
    expect(report.gstr1.b2cSmall.length).toBeGreaterThanOrEqual(2)
  })
})
