import { useState, useMemo } from 'react'
import { Customer, SalesInvoice, CustomerPayment, LedgerEntry, CustomerCreditNote, CustomerDebitNote, SalesReturn, Item } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BookOpen, TrendUp, TrendDown, FilePdf } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { exportCustomerLedgerPDF, CustomerLedgerEntry } from '@/lib/pdf-export'
import { toast } from 'sonner'
import { formatCurrency, getFYFromDate, calculateLedger, RawLedgerTransaction, calculateInvoiceTotals } from '@/lib/calculations'
import { PeriodDateFilter, PeriodFilterState, defaultPeriodFilterState, isRecordInPeriod, getPreviousFY, getPeriodDateBounds, isRecordBeforePeriod } from '@/components/period-date-filter'

interface CustomerLedgerPageProps {
  customers: Customer[]
  salesInvoices: SalesInvoice[]
  customerPayments: CustomerPayment[]
  creditNotes: CustomerCreditNote[]
  customerDebitNotes?: CustomerDebitNote[]
  salesReturns: SalesReturn[]
  items?: Item[]
  currentFY: string
  businessName?: string
}

export default function CustomerLedgerPage({
  customers,
  salesInvoices,
  customerPayments,
  creditNotes,
  customerDebitNotes = [],
  salesReturns,
  items = [],
  currentFY,
  businessName = 'SK TRADERS'
}: CustomerLedgerPageProps) {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('')
  const [periodFilter, setPeriodFilter] = useState<PeriodFilterState>(defaultPeriodFilterState)

  const { openingBalanceOnFromDate, ledgerEntries, summary } = useMemo(() => {
    if (!selectedCustomerId) {
      return {
        openingBalanceOnFromDate: 0,
        ledgerEntries: [],
        summary: { openingBalance: 0, totalDebit: 0, totalCredit: 0, closingBalance: 0 }
      }
    }

    const selectedCustomer = customers.find(c => c.id === selectedCustomerId)
    const { startISO } = getPeriodDateBounds(periodFilter, currentFY)
    const openingBalDate = selectedCustomer?.openingBalanceDate
    const shouldIncludeOpening = !openingBalDate || !startISO || openingBalDate <= startISO
    const rawOpening = selectedCustomer?.openingBalance || 0
    const isCredit = selectedCustomer?.balanceType === 'Credit'
    const signedOpening = isCredit ? -rawOpening : rawOpening
    const initialMasterOpening = shouldIncludeOpening ? signedOpening : 0

    const rawTransactions: RawLedgerTransaction[] = []

    salesInvoices.forEach(invoice => {
      if (invoice.customerId !== selectedCustomerId) return
      const totals = calculateInvoiceTotals(invoice, items)
      rawTransactions.push({
        date: invoice.invoiceDate,
        description: 'Sales Invoice',
        invoiceNo: invoice.invoiceNo,
        debit: totals.totalAmount,
        credit: 0,
        type: 'invoice',
        refId: invoice.id,
        timestamp: (invoice as any).createdAt || new Date(invoice.invoiceDate).getTime(),
        isBeforePeriod: isRecordBeforePeriod(invoice.invoiceDate, periodFilter, currentFY)
      })
    })

    customerPayments.forEach(payment => {
      if (payment.customerId !== selectedCustomerId) return
      rawTransactions.push({
        date: payment.paymentDate,
        description: 'Payment Received',
        debit: 0,
        credit: payment.amount,
        type: 'payment',
        refId: payment.id,
        timestamp: (payment as any).createdAt || new Date(payment.paymentDate).getTime(),
        isBeforePeriod: isRecordBeforePeriod(payment.paymentDate, periodFilter, currentFY)
      })
    })

    creditNotes.forEach(cn => {
      if (cn.customerId !== selectedCustomerId) return
      rawTransactions.push({
        date: cn.date,
        description: 'Credit Note',
        debit: 0,
        credit: cn.totalAmount ?? cn.amount ?? 0,
        type: 'payment',
        refId: cn.id,
        timestamp: cn.createdAt || new Date(cn.date).getTime(),
        isBeforePeriod: isRecordBeforePeriod(cn.date, periodFilter, currentFY)
      })
    })

    customerDebitNotes.forEach(dn => {
      if (dn.customerId !== selectedCustomerId) return
      rawTransactions.push({
        date: dn.date,
        description: 'Debit Note',
        debit: dn.totalAmount ?? dn.amount ?? 0,
        credit: 0,
        type: 'invoice',
        refId: dn.id,
        timestamp: dn.createdAt || new Date(dn.date).getTime(),
        isBeforePeriod: isRecordBeforePeriod(dn.date, periodFilter, currentFY)
      })
    })

    salesReturns.forEach(sr => {
      if (sr.customerId !== selectedCustomerId) return
      rawTransactions.push({
        date: sr.returnDate,
        description: 'Sales Return',
        debit: 0,
        credit: sr.amount,
        type: 'payment',
        refId: sr.id,
        timestamp: sr.createdAt || new Date(sr.returnDate).getTime(),
        isBeforePeriod: isRecordBeforePeriod(sr.returnDate, periodFilter, currentFY)
      })
    })

    const filteredTx = rawTransactions.filter(t => t.isBeforePeriod || isRecordInPeriod(t.date, undefined, periodFilter, currentFY))

    return calculateLedger({
      initialMasterOpening,
      partyType: 'customer',
      startISO: startISO || undefined,
      transactions: filteredTx
    })
  }, [selectedCustomerId, salesInvoices, customerPayments, creditNotes, customerDebitNotes, salesReturns, currentFY, customers, periodFilter])

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId)

  const handleExportPDF = () => {
    if (!selectedCustomer) {
      toast.error('Please select a customer first')
      return
    }

    if (ledgerEntries.length === 0) {
      toast.error('No transactions to export')
      return
    }

    const exportEntries: CustomerLedgerEntry[] = ledgerEntries.map(entry => ({
      date: entry.date,
      description: entry.description,
      invoiceNo: entry.invoiceNo,
      debit: entry.debit,
      credit: entry.credit,
      balance: entry.balance,
      type: entry.type,
      refId: entry.refId
    }))

    exportCustomerLedgerPDF(exportEntries, {
      customerName: selectedCustomer.name,
      fy: currentFY,
      businessName,
      totalDebit: summary.totalDebit,
      totalCredit: summary.totalCredit,
      closingBalance: summary.closingBalance,
      openingBalance: openingBalanceOnFromDate
    })

    toast.success('Customer Ledger exported as PDF')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <BookOpen size={28} className="text-primary" />
            Customer Ledger
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Complete account statement showing invoices, payments, credit notes and running balance
          </p>
        </div>
        {selectedCustomerId && ledgerEntries.length > 0 && (
          <Button
            onClick={handleExportPDF}
            variant="outline"
            className="flex items-center gap-2"
          >
            <FilePdf size={18} />
            Export PDF
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Select Customer & Period</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Customer Account
              </label>
              <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a customer to view ledger..." />
                </SelectTrigger>
                <SelectContent>
                  {customers.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} {c.city ? `(${c.city})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Filter by Period
              </label>
              <PeriodDateFilter
                value={periodFilter}
                onChange={setPeriodFilter}
                currentFY={currentFY}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedCustomerId && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-slate-50 border-slate-200">
              <CardContent className="pt-5 pb-4">
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Opening Balance</p>
                  <p className="text-xl font-bold text-slate-900">{formatCurrency(Math.abs(openingBalanceOnFromDate))}</p>
                  <p className="text-[11px] font-medium text-slate-600 mt-0.5">
                    {openingBalanceOnFromDate > 0 ? 'Dr (Receivable)' : openingBalanceOnFromDate < 0 ? 'Cr (Advance)' : 'Nil'}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-blue-50/70 border-blue-200">
              <CardContent className="pt-5 pb-4">
                <div>
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Total Debited</p>
                  <p className="text-xl font-bold text-blue-900">{formatCurrency(summary.totalDebit)}</p>
                  <p className="text-[11px] font-medium text-blue-600 mt-0.5">Invoices & Debit Notes</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-emerald-50/70 border-emerald-200">
              <CardContent className="pt-5 pb-4">
                <div>
                  <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-1">Total Credited</p>
                  <p className="text-xl font-bold text-emerald-900">{formatCurrency(summary.totalCredit)}</p>
                  <p className="text-[11px] font-medium text-emerald-600 mt-0.5">Payments & Credit Notes</p>
                </div>
              </CardContent>
            </Card>

            <Card className={`${
              summary.closingBalance > 0 
                ? 'bg-amber-50/70 border-amber-200' 
                : summary.closingBalance < 0
                ? 'bg-emerald-50/70 border-emerald-200'
                : 'bg-slate-50 border-slate-200'
            }`}>
              <CardContent className="pt-5 pb-4">
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Closing Balance</p>
                  <p className="text-xl font-bold text-slate-900">{formatCurrency(Math.abs(summary.closingBalance))}</p>
                  <p className="text-[11px] font-medium text-slate-600 mt-0.5">
                    {summary.closingBalance > 0 ? 'Dr (To Receive)' : summary.closingBalance < 0 ? 'Cr (Advance Received)' : 'Cleared'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mt-6">
            <h4 className="text-sm font-semibold mb-3 text-foreground">
              Ledger Entries for {selectedCustomer?.name} {periodFilter.periodType === 'current_month' ? '(Current Month)' : periodFilter.periodType === 'previous_month' ? '(Previous Month)' : periodFilter.periodType === 'previous_fy' ? `(${getPreviousFY(currentFY)})` : periodFilter.periodType === 'custom' ? `(${periodFilter.fromDate || '...'} to ${periodFilter.toDate || '...'})` : `- ${currentFY}`}
            </h4>
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader className="sticky top-0 z-20 bg-white/95 backdrop-blur shadow-xs">
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Date</TableHead>
                    <TableHead className="font-semibold">Description</TableHead>
                    <TableHead className="font-semibold">Invoice No</TableHead>
                    <TableHead className="font-semibold text-right">Debit (₹)</TableHead>
                    <TableHead className="font-semibold text-right">Credit (₹)</TableHead>
                    <TableHead className="font-semibold text-right">Balance (₹)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledgerEntries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No transactions found for this customer in FY {currentFY}.
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {ledgerEntries.map((entry, index) => (
                        <TableRow key={`${entry.refId}-${index}`}>
                          <TableCell>
                            {entry.date && !isNaN(new Date(entry.date).getTime())
                              ? new Date(entry.date.includes('T') ? entry.date : entry.date + 'T00:00:00').toLocaleDateString('en-IN')
                              : (selectedCustomer?.openingBalanceDate
                                  ? new Date(selectedCustomer.openingBalanceDate + 'T00:00:00').toLocaleDateString('en-IN')
                                  : 'Opening')}
                          </TableCell>
                          <TableCell className="font-medium">{entry.description}</TableCell>
                          <TableCell className="font-mono text-sm">{entry.invoiceNo || '-'}</TableCell>
                          <TableCell className="text-right font-mono text-emerald-600 font-semibold">
                            {entry.debit > 0 ? formatCurrency(entry.debit) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-blue-600 font-semibold">
                            {entry.credit > 0 ? formatCurrency(entry.credit) : '-'}
                          </TableCell>
                          <TableCell className={`text-right font-mono font-bold ${
                            entry.balance > 0 ? 'text-amber-600' : entry.balance < 0 ? 'text-emerald-600' : 'text-slate-400'
                          }`}>
                            {formatCurrency(Math.abs(entry.balance))}
                            {entry.balance > 0 && ' Dr'}
                            {entry.balance < 0 && ' Cr'}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/50 font-semibold">
                        <TableCell colSpan={3} className="text-right">Total</TableCell>
                        <TableCell className="text-right font-mono text-emerald-600 font-bold">
                          {formatCurrency(summary.totalDebit)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-blue-600 font-bold">
                          {formatCurrency(summary.totalCredit)}
                        </TableCell>
                        <TableCell className={`text-right font-mono font-extrabold ${
                          summary.closingBalance > 0 ? 'text-amber-600' : summary.closingBalance < 0 ? 'text-emerald-600' : 'text-slate-400'
                        }`}>
                          {formatCurrency(Math.abs(summary.closingBalance))}
                          {summary.closingBalance > 0 && ' Dr'}
                          {summary.closingBalance < 0 && ' Cr'}
                        </TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}

      {!selectedCustomerId && (
        <div className="border border-dashed border-border rounded-lg p-12 text-center text-muted-foreground">
          <BookOpen size={48} weight="duotone" className="mx-auto mb-3 opacity-30" />
          <p>Select a customer to view their ledger</p>
        </div>
      )}
    </div>
  )
}
