import { Customer, SalesInvoice, CustomerPayment, CustomerCreditNote, SalesReturn } from './types'

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
  asOfDate: Date = new Date()
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
    // 1. Filter customer invoices and sort chronologically (FIFO)
    const custInvoices = salesInvoices
      .filter((inv) => inv.customerId === customer.id)
      .sort((a, b) => {
        const dateDiff = new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime()
        if (dateDiff !== 0) return dateDiff
        return (a.invoiceNo || '').localeCompare(b.invoiceNo || '')
      })

    // 2. Filter customer payments, credit notes, sales returns
    const custPayments = customerPayments.filter((p) => p.customerId === customer.id)
    const custCreditNotes = creditNotes.filter((cn) => cn.customerId === customer.id)
    const custSalesReturns = salesReturns.filter((sr) => sr.customerId === customer.id)

    const totalSales = custInvoices.reduce((sum, inv) => sum + (inv.invoiceAmount || 0), 0)
    const totalPayments = custPayments.reduce((sum, p) => sum + (p.amount || 0), 0)
    const totalCreditNotes = custCreditNotes.reduce((sum, cn) => sum + (cn.amount || 0), 0)
    const totalSalesReturns = custSalesReturns.reduce((sum, sr) => sum + (sr.amount || 0), 0)

    const totalCredits = totalPayments + totalCreditNotes + totalSalesReturns
    let remainingCredit = totalCredits

    const billAging: CustomerBillAging[] = []
    let bracket0to30 = 0
    let bracket31to60 = 0
    let bracket61to90 = 0
    let bracket90plus = 0
    let maxDaysOverdue = 0

    // 3. FIFO Allocation of Credits against Sales Invoices
    custInvoices.forEach((inv) => {
      const invTotal = inv.invoiceAmount || 0
      const paid = Math.min(invTotal, remainingCredit)
      const pending = Math.max(0, invTotal - paid)
      remainingCredit = Math.max(0, remainingCredit - invTotal)

      if (pending > 0.01) {
        const ageDays = getDaysDifference(inv.invoiceDate, asOfDate)
        const bracket = getAgingBracket(ageDays)

        billAging.push({
          invoiceId: inv.id,
          invoiceNo: inv.invoiceNo,
          invoiceDate: inv.invoiceDate,
          originalAmount: invTotal,
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
