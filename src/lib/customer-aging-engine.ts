import { Customer, SalesInvoice, CustomerPayment, CustomerCreditNote, CustomerDebitNote, SalesReturn } from './types'
import { calculateInvoiceTotals } from './calculations'

export type AgingBracketKey = '0_30' | '31_60' | '61_90' | '90_plus'

export interface CustomerBillAging {
  invoiceId: string
  invoiceNo: string
  invoiceDate: string
  originalAmount: number
  paidAmount: number
  pendingAmount: number
  ageDays: number
  bracket: AgingBracketKey
}

export type CustomerPerformanceBadge = 'Best Payer' | 'Capital Blocker' | 'Heavy Lifter' | 'Standard'

export interface CustomerAgingSummary {
  customerId: string
  customerName: string
  gstin?: string
  phone?: string
  city?: string
  totalSales: number
  totalPayments: number
  totalCreditNotes: number
  totalDebitNotes?: number
  totalOutstanding: number
  bracket0to30: number
  bracket31to60: number
  bracket61to90: number
  bracket90plus: number
  totalOverdue: number
  maxDaysOverdue: number
  performanceBadge: CustomerPerformanceBadge
  billAging: CustomerBillAging[]
  unpaidBillCount: number
}

export interface CustomerAgingAggregate {
  customers: CustomerAgingSummary[]
  totalOutstanding: number
  totalOverdue: number
  totalCritical90Plus: number
  bestPayerCount: number
  capitalBlockerCount: number
  heavyLifterCount: number
  averageCollectionDays: number
  totalCustomersWithBalance: number
}

/**
 * Calculates the difference in days between a date string and reference date.
 */
export function getDaysDifference(fromDateStr: string, toDate: Date = new Date()): number {
  if (!fromDateStr) return 0
  const fromDate = new Date(fromDateStr)
  if (isNaN(fromDate.getTime())) return 0
  
  const start = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate()).getTime()
  const end = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate()).getTime()
  const diffTime = end - start
  return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)))
}

/**
 * Maps age in days to standard 30-day aging brackets.
 */
export function getAgingBracket(ageDays: number): AgingBracketKey {
  if (ageDays <= 30) return '0_30'
  if (ageDays <= 60) return '31_60'
  if (ageDays <= 90) return '61_90'
  return '90_plus'
}

/**
 * Core Customer Aging & Receivables Calculation Engine
 */
export function computeCustomerAging(
  customers: Customer[] = [],
  salesInvoices: SalesInvoice[] = [],
  customerPayments: CustomerPayment[] = [],
  creditNotes: CustomerCreditNote[] = [],
  salesReturns: SalesReturn[] = [],
  asOfDate: Date = new Date(),
  customerDebitNotes: CustomerDebitNote[] = []
): CustomerAgingAggregate {
  const summaries: CustomerAgingSummary[] = []

  let aggTotalOutstanding = 0
  let aggTotalOverdue = 0
  let aggTotalCritical90Plus = 0
  let aggBestPayerCount = 0
  let aggCapitalBlockerCount = 0
  let aggHeavyLifterCount = 0
  let totalAgeDaysSum = 0
  let totalUnpaidBillCount = 0

  customers.forEach((customer) => {
    // 1. Filter customer invoices, payments, credit notes, sales returns, debit notes
    const custInvoices = salesInvoices.filter((inv) => inv.customerId === customer.id)
    const custPayments = customerPayments.filter((p) => p.customerId === customer.id)
    const custCreditNotes = creditNotes.filter((cn) => cn.customerId === customer.id)
    const custSalesReturns = salesReturns.filter((sr) => sr.customerId === customer.id)
    const custDebitNotes = customerDebitNotes.filter((dn) => dn.customerId === customer.id)

    // 2. Build combined chronological debits queue (Opening Balance, Invoices, Debit Notes)
    type DebitItem = {
      id: string
      no: string
      date: string
      amount: number
      isOpening?: boolean
    }

    const debitsQueue: DebitItem[] = []

    const openingBal = Number(customer.openingBalance) || 0
    const isOpeningDebit = customer.balanceType !== 'Credit' && openingBal > 0
    const isOpeningCredit = customer.balanceType === 'Credit' && openingBal > 0

    if (isOpeningDebit) {
      debitsQueue.push({
        id: `opening-bal-${customer.id}`,
        no: 'Opening Balance',
        date: customer.openingBalanceDate || '2025-04-01',
        amount: openingBal,
        isOpening: true
      })
    }

    custInvoices.forEach(inv => {
      debitsQueue.push({
        id: inv.id,
        no: inv.invoiceNo,
        date: inv.invoiceDate,
        amount: calculateInvoiceTotals(inv).totalAmount
      })
    })

    custDebitNotes.forEach(dn => {
      debitsQueue.push({
        id: dn.id,
        no: dn.noteNo || dn.invoiceRef || 'Debit Note',
        date: dn.date,
        amount: dn.totalAmount ?? dn.amount ?? 0
      })
    })

    debitsQueue.sort((a, b) => {
      const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime()
      if (dateDiff !== 0) return dateDiff
      return a.no.localeCompare(b.no)
    })

    const totalSales = custInvoices.reduce((sum, inv) => sum + calculateInvoiceTotals(inv).totalAmount, 0)
    const totalPayments = custPayments.reduce((sum, p) => sum + (p.amount || 0), 0)
    const totalCreditNotes = custCreditNotes.reduce((sum, cn) => sum + (cn.totalAmount || cn.amount || 0), 0)
    const totalSalesReturns = custSalesReturns.reduce((sum, sr) => sum + (sr.amount || 0), 0)
    const totalDebitNotes = custDebitNotes.reduce((sum, dn) => sum + (dn.totalAmount || dn.amount || 0), 0)

    const totalCredits = totalPayments + totalCreditNotes + totalSalesReturns + (isOpeningCredit ? openingBal : 0)
    let remainingCredit = totalCredits

    const billAging: CustomerBillAging[] = []
    let bracket0to30 = 0
    let bracket31to60 = 0
    let bracket61to90 = 0
    let bracket90plus = 0
    let maxDaysOverdue = 0

    // 3. FIFO Allocation of Credits against Debits Queue
    debitsQueue.forEach((deb) => {
      const paid = Math.min(deb.amount, remainingCredit)
      const pending = Math.max(0, deb.amount - paid)
      remainingCredit = Math.max(0, remainingCredit - deb.amount)

      if (pending > 0.01) {
        const ageDays = getDaysDifference(deb.date, asOfDate)
        const bracket = getAgingBracket(ageDays)

        billAging.push({
          invoiceId: deb.id,
          invoiceNo: deb.no,
          invoiceDate: deb.date,
          originalAmount: deb.amount,
          paidAmount: paid,
          pendingAmount: pending,
          ageDays,
          bracket
        })

        if (ageDays > maxDaysOverdue) {
          maxDaysOverdue = ageDays
        }

        totalAgeDaysSum += ageDays
        totalUnpaidBillCount++

        switch (bracket) {
          case '0_30':
            bracket0to30 += pending
            break
          case '31_60':
            bracket31to60 += pending
            break
          case '61_90':
            bracket61to90 += pending
            break
          case '90_plus':
            bracket90plus += pending
            break
        }
      }
    })

    const totalOutstanding = bracket0to30 + bracket31to60 + bracket61to90 + bracket90plus
    const totalOverdue = bracket31to60 + bracket61to90 + bracket90plus

    // 4. Performance Badge Assignment
    let performanceBadge: CustomerPerformanceBadge = 'Standard'
    if (totalOutstanding <= 0.01 || (maxDaysOverdue <= 30 && totalPayments >= totalSales * 0.7)) {
      performanceBadge = 'Best Payer'
      aggBestPayerCount++
    } else if (maxDaysOverdue > 90 || (bracket90plus > 0 && bracket90plus >= totalOutstanding * 0.4)) {
      performanceBadge = 'Capital Blocker'
      aggCapitalBlockerCount++
    } else if (totalSales >= 500000 && maxDaysOverdue <= 60) {
      performanceBadge = 'Heavy Lifter'
      aggHeavyLifterCount++
    }

    aggTotalOutstanding += totalOutstanding
    aggTotalOverdue += totalOverdue
    aggTotalCritical90Plus += bracket90plus

    summaries.push({
      customerId: customer.id,
      customerName: customer.name,
      gstin: customer.gstin,
      phone: customer.phone,
      city: customer.city,
      totalSales,
      totalPayments,
      totalCreditNotes: totalCreditNotes + totalSalesReturns,
      totalDebitNotes,
      totalOutstanding,
      bracket0to30,
      bracket31to60,
      bracket61to90,
      bracket90plus,
      totalOverdue,
      maxDaysOverdue,
      performanceBadge,
      billAging,
      unpaidBillCount: billAging.length
    })
  })

  // Sort summaries by total outstanding descending
  summaries.sort((a, b) => b.totalOutstanding - a.totalOutstanding)

  const customersWithBalance = summaries.filter((c) => c.totalOutstanding > 0.01)

  return {
    customers: summaries,
    totalOutstanding: aggTotalOutstanding,
    totalOverdue: aggTotalOverdue,
    totalCritical90Plus: aggTotalCritical90Plus,
    bestPayerCount: aggBestPayerCount,
    capitalBlockerCount: aggCapitalBlockerCount,
    heavyLifterCount: aggHeavyLifterCount,
    averageCollectionDays: totalUnpaidBillCount > 0 ? Math.round(totalAgeDaysSum / totalUnpaidBillCount) : 0,
    totalCustomersWithBalance: customersWithBalance.length
  }
}
