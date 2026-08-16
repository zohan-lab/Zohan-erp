import { describe, it, expect } from 'vitest'
import {
  computeCustomerAging,
  getDaysDifference,
  getAgingBracket
} from './customer-aging-engine'
import { Customer, SalesInvoice, CustomerPayment, CustomerCreditNote } from './types'

describe('customer-aging-engine', () => {
  it('correctly calculates age days and bracket mapping', () => {
    const today = new Date('2026-08-15')
    expect(getDaysDifference('2026-08-10', today)).toBe(5)
    expect(getDaysDifference('2026-07-15', today)).toBe(31)
    expect(getDaysDifference('2026-06-15', today)).toBe(61)
    expect(getDaysDifference('2026-04-15', today)).toBe(122)

    expect(getAgingBracket(10)).toBe('0_30')
    expect(getAgingBracket(30)).toBe('0_30')
    expect(getAgingBracket(45)).toBe('31_60')
    expect(getAgingBracket(75)).toBe('61_90')
    expect(getAgingBracket(91)).toBe('90_plus')
  })

  it('performs FIFO credit allocation across sales invoices and grades customers', () => {
    const customers: Customer[] = [
      { id: 'c1', name: 'Alpha Traders', city: 'Mumbai' },
      { id: 'c2', name: 'Beta Steel', city: 'Delhi' }
    ]

    const asOfDate = new Date('2026-08-15')

    const salesInvoices: SalesInvoice[] = [
      {
        id: 'inv-1',
        customerId: 'c1',
        invoiceNo: 'SI-001',
        invoiceDate: '2026-07-20', // 26 days old (0_30)
        invoiceAmount: 100000,
        fy: 'FY2026-27'
      },
      {
        id: 'inv-2',
        customerId: 'c1',
        invoiceNo: 'SI-002',
        invoiceDate: '2026-06-10', // 66 days old (61_90)
        invoiceAmount: 200000,
        fy: 'FY2026-27'
      },
      {
        id: 'inv-3',
        customerId: 'c2',
        invoiceNo: 'SI-003',
        invoiceDate: '2026-03-01', // 167 days old (90_plus)
        invoiceAmount: 300000,
        fy: 'FY2025-26'
      }
    ]

    // Customer 1 pays 150,000. FIFO allocation settles 150k against oldest inv-2 first!
    // inv-2 (200k) has 50k pending (61_90).
    // inv-1 (100k) is untouched, 100k pending (0_30).
    const customerPayments: CustomerPayment[] = [
      {
        id: 'pay-1',
        customerId: 'c1',
        paymentDate: '2026-07-25',
        amount: 150000,
        counterId: 'main-cash',
        counterName: 'Main Cash',
        fy: 'FY2026-27'
      }
    ]

    const creditNotes: CustomerCreditNote[] = []

    const result = computeCustomerAging(
      customers,
      salesInvoices,
      customerPayments,
      creditNotes,
      [],
      asOfDate
    )

    expect(result.totalOutstanding).toBe(450000) // 150k c1 + 300k c2
    expect(result.customers).toHaveLength(2)

    const c1Summary = result.customers.find((c) => c.customerId === 'c1')!
    expect(c1Summary.totalSales).toBe(300000)
    expect(c1Summary.totalPayments).toBe(150000)
    expect(c1Summary.totalOutstanding).toBe(150000)
    expect(c1Summary.bracket0to30).toBe(100000)
    expect(c1Summary.bracket61to90).toBe(50000)
    expect(c1Summary.unpaidBillCount).toBe(2)

    const c2Summary = result.customers.find((c) => c.customerId === 'c2')!
    expect(c2Summary.totalOutstanding).toBe(300000)
    expect(c2Summary.bracket90plus).toBe(300000)
    expect(c2Summary.performanceBadge).toBe('Capital Blocker')
  })

  it('correctly includes opening balance and debit notes in aging calculations', () => {
    const customers: Customer[] = [
      {
        id: 'c3',
        name: 'Gamma Metals',
        openingBalance: 50000,
        balanceType: 'Debit',
        openingBalanceDate: '2026-04-01'
      }
    ]

    const asOfDate = new Date('2026-08-15') // ~136 days from 2026-04-01

    const result = computeCustomerAging(
      customers,
      [],
      [],
      [],
      [],
      asOfDate,
      [
        {
          id: 'cdn-1',
          noteNo: 'DN-99',
          customerId: 'c3',
          date: '2026-08-01', // 14 days old (0_30)
          amount: 25000,
          fy: '2026-2027'
        }
      ]
    )

    expect(result.totalOutstanding).toBe(75000)
    const c3Summary = result.customers[0]
    expect(c3Summary.totalOutstanding).toBe(75000)
    expect(c3Summary.bracket90plus).toBe(50000) // Opening balance aged from April
    expect(c3Summary.bracket0to30).toBe(25000)  // Debit note aged from Aug 1
  })
})
