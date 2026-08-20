import { Party, Customer, SalesInvoice, CustomerPayment, CustomerCreditNote, CustomerDebitNote, SalesReturn } from './types'
import { calculateInvoiceTotals } from './calculations'

export type AgingBracketKey = '0_30' | '31_60' | '61_90' | '90_plus'

export interface PartyBillAging {
  invoiceId: string
  invoiceNo: string
  invoiceDate: string
  originalAmount: number
  paidAmount: number
  pendingAmount: number
  ageDays: number
  bracket: AgingBracketKey
}
export type CustomerBillAging = PartyBillAging

export type PartyPerformanceBadge = 'Best Payer' | 'Capital Blocker' | 'Heavy Lifter' | 'Standard'
export type CustomerPerformanceBadge = PartyPerformanceBadge

export interface PartyAgingSummary {
  partyId: string
  partyName: string
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
  performanceBadge: PartyPerformanceBadge
  billAging: PartyBillAging[]
  unpaidBillCount: number
}
export type CustomerAgingSummary = PartyAgingSummary

export interface PartyAgingAggregate {
  parties: PartyAgingSummary[]
  customers: PartyAgingSummary[]
  totalOutstanding: number
  totalOverdue: number
  totalCritical90Plus: number
  bestPayerCount: number
  capitalBlockerCount: number
  heavyLifterCount: number
  averageCollectionDays: number
  totalPartiesWithBalance: number
  totalCustomersWithBalance: number
}
export type CustomerAgingAggregate = PartyAgingAggregate

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
 * Core Party Aging & Receivables Calculation Engine
 */
export function computePartyAging(
  parties: Party[] = [],
  salesInvoices: SalesInvoice[] = [],
  customerPayments: CustomerPayment[] = [],
  creditNotes: CustomerCreditNote[] = [],
  salesReturns: SalesReturn[] = [],
  asOfDate: Date = new Date(),
  customerDebitNotes: CustomerDebitNote[] = []
): PartyAgingAggregate {
  const summaries: PartyAgingSummary[] = []

  let aggTotalOutstanding = 0
  let aggTotalOverdue = 0
  let aggTotalCritical90Plus = 0
  let aggBestPayerCount = 0
  let aggCapitalBlockerCount = 0
  let aggHeavyLifterCount = 0
  let totalAgeDaysSum = 0
  let totalUnpaidBillCount = 0

  parties.forEach((party) => {
    // 1. Filter party invoices, payments, credit notes, sales returns, debit notes
    const partyInvoices = salesInvoices.filter((inv) => inv.partyId === party.id || inv.customerId === party.id)
    const partyPayments = customerPayments.filter((p) => p.partyId === party.id || p.customerId === party.id)
    const partyCreditNotes = creditNotes.filter((cn) => cn.partyId === party.id || cn.customerId === party.id)
    const partySalesReturns = salesReturns.filter((sr) => sr.partyId === party.id || sr.customerId === party.id)
    const partyDebitNotes = customerDebitNotes.filter((dn) => dn.partyId === party.id || dn.customerId === party.id)

    // 2. Build combined chronological debits queue (Opening Balance, Invoices, Debit Notes)
    type DebitItem = {
      id: string
      no: string
      date: string
      amount: number
      isOpening?: boolean
    }

    const debitsQueue: DebitItem[] = []

    const openingBal = Number(party.openingBalance) || 0
    const isOpeningDebit = party.balanceType !== 'Credit' && openingBal > 0
    const isOpeningCredit = party.balanceType === 'Credit' && openingBal > 0

    if (isOpeningDebit) {
      debitsQueue.push({
        id: `opening-bal-${party.id}`,
        no: 'Opening Balance',
        date: party.openingBalanceDate || '2025-04-01',
        amount: openingBal,
        isOpening: true
      })
    }

    partyInvoices.forEach(inv => {
      debitsQueue.push({
        id: inv.id,
        no: inv.invoiceNo,
        date: inv.invoiceDate,
        amount: calculateInvoiceTotals(inv).totalAmount
      })
    })

    partyDebitNotes.forEach(dn => {
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

    const totalSales = partyInvoices.reduce((sum, inv) => sum + calculateInvoiceTotals(inv).totalAmount, 0)
    const totalPayments = partyPayments.reduce((sum, p) => sum + (p.amount || 0), 0)
    const totalCreditNotes = partyCreditNotes.reduce((sum, cn) => sum + (cn.totalAmount || cn.amount || 0), 0)
    const totalSalesReturns = partySalesReturns.reduce((sum, sr) => sum + (sr.amount || 0), 0)
    const totalDebitNotes = partyDebitNotes.reduce((sum, dn) => sum + (dn.totalAmount || dn.amount || 0), 0)

    const totalCredits = totalPayments + totalCreditNotes + totalSalesReturns + (isOpeningCredit ? openingBal : 0)
    let remainingCredit = totalCredits

    const billAging: PartyBillAging[] = []
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
    let performanceBadge: PartyPerformanceBadge = 'Standard'
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
      partyId: party.id,
      partyName: party.name,
      customerId: party.id,
      customerName: party.name,
      gstin: party.gstin,
      phone: party.phone,
      city: party.city,
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

  const partiesWithBalance = summaries.filter((c) => c.totalOutstanding > 0.01)

  return {
    parties: summaries,
    customers: summaries,
    totalOutstanding: aggTotalOutstanding,
    totalOverdue: aggTotalOverdue,
    totalCritical90Plus: aggTotalCritical90Plus,
    bestPayerCount: aggBestPayerCount,
    capitalBlockerCount: aggCapitalBlockerCount,
    heavyLifterCount: aggHeavyLifterCount,
    averageCollectionDays: totalUnpaidBillCount > 0 ? Math.round(totalAgeDaysSum / totalUnpaidBillCount) : 0,
    totalPartiesWithBalance: partiesWithBalance.length,
    totalCustomersWithBalance: partiesWithBalance.length
  }
}

export const computeCustomerAging = computePartyAging

