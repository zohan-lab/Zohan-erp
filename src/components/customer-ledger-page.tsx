import { useState, useMemo } from 'react'
import { Customer, SalesInvoice, CustomerPayment, LedgerEntry, CustomerCreditNote, SalesReturn } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BookOpen, TrendUp, TrendDown, FilePdf } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { exportCustomerLedgerPDF, CustomerLedgerEntry } from '@/lib/pdf-export'
import { toast } from 'sonner'
import { formatCurrency, getFYFromDate, calculateLedger, RawLedgerTransaction } from '@/lib/calculations'
import { PeriodDateFilter, PeriodFilterState, defaultPeriodFilterState, isRecordInPeriod, getPreviousFY, getPeriodDateBounds, isRecordBeforePeriod } from '@/components/period-date-filter'

interface CustomerLedgerPageProps {
  customers: Customer[]
  salesInvoices: SalesInvoice[]
  customerPayments: CustomerPayment[]
  creditNotes: CustomerCreditNote[]
  salesReturns: SalesReturn[]
  currentFY: string
  businessName?: string
}

export default function CustomerLedgerPage({ customers, salesInvoices, customerPayments, creditNotes, salesReturns, currentFY, businessName = 'SK TRADERS' }: CustomerLedgerPageProps) {
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
    const initialMasterOpening = selectedCustomer?.openingBalance || 0
    const { startISO } = getPeriodDateBounds(periodFilter, currentFY)

    const rawTransactions: RawLedgerTransaction[] = []

    salesInvoices.forEach(invoice => {
      if (invoice.customerId !== selectedCustomerId) return
      rawTransactions.push({
        date: invoice.invoiceDate,
        description: 'Sales Invoice',
        invoiceNo: invoice.invoiceNo,
        debit: invoice.invoiceAmount,
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
        credit: cn.amount,
        type: 'payment',
        refId: cn.id,
        timestamp: cn.createdAt || new Date(cn.date).getTime(),
        isBeforePeriod: isRecordBeforePeriod(cn.date, periodFilter, currentFY)
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
  }, [selectedCustomerId, salesInvoices, customerPayments, creditNotes, salesReturns, currentFY, customers, periodFilter])

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
      openingBalance: summary.openingBalance
    })

    toast.success('PDF exported successfully')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Customer Ledger</h2>
          <p className="text-sm text-muted-foreground mt-1">
            View customer transaction history, invoices, payments and balances
          </p>
        </div>
        {selectedCustomerId && ledgerEntries.length > 0 && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleExportPDF}
          >
            <FilePdf className="mr-2" size={16} />
            Export PDF
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen size={24} weight="duotone" className="text-primary" />
            Select Party & Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-end justify-between">
              <div className="flex-1 space-y-2 w-full md:w-auto">
                <label className="text-sm font-medium">Select Customer</label>
                <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a customer to view ledger" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground hidden md:block">Filter Period</label>
                <PeriodDateFilter currentFY={currentFY} value={periodFilter} onChange={setPeriodFilter} />
              </div>
            </div>

            {selectedCustomerId && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
                  <Card className="bg-slate-50 border-slate-200">
                    <CardContent className="pt-5 pb-4">
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Opening Balance</p>
                        <p className="text-xl font-bold text-slate-900">{formatCurrency(Math.abs(summary.openingBalance))}</p>
                        <p className="text-[11px] font-medium text-slate-500 mt-0.5">
                          {summary.openingBalance > 0 ? 'Dr (To Receive)' : summary.openingBalance < 0 ? 'Cr (Advance Received)' : 'Nil'}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-emerald-50/70 border-emerald-200">
                    <CardContent className="pt-5 pb-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-1">Period Sales</p>
                          <p className="text-xl font-bold text-emerald-950">{formatCurrency(summary.totalDebit)}</p>
                        </div>
                        <TrendUp size={28} weight="duotone" className="text-emerald-600" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-blue-50/70 border-blue-200">
                    <CardContent className="pt-5 pb-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Period Received</p>
                          <p className="text-xl font-bold text-blue-950">{formatCurrency(summary.totalCredit)}</p>
                        </div>
                        <TrendDown size={28} weight="duotone" className="text-blue-600" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className={`border ${
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
                  <div className="rounded-lg border border-border">
                    <Table>
                      <TableHeader>
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
                                <TableCell>{new Date(entry.date).toLocaleDateString('en-IN')}</TableCell>
                                <TableCell className="font-medium">{entry.description}</TableCell>
                                <TableCell className="font-mono text-sm">{entry.invoiceNo || '-'}</TableCell>
                                <TableCell className="text-right font-mono text-success">
                                  {entry.debit > 0 ? formatCurrency(entry.debit) : '-'}
                                </TableCell>
                                <TableCell className="text-right font-mono text-primary">
                                  {entry.credit > 0 ? formatCurrency(entry.credit) : '-'}
                                </TableCell>
                                <TableCell className={`text-right font-mono font-semibold ${
                                  entry.balance > 0 ? 'text-warning' : entry.balance < 0 ? 'text-success' : 'text-muted-foreground'
                                }`}>
                                  {formatCurrency(Math.abs(entry.balance))}
                                  {entry.balance > 0 && ' Dr'}
                                  {entry.balance < 0 && ' Cr'}
                                </TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="bg-muted/50 font-semibold">
                              <TableCell colSpan={3} className="text-right">Total</TableCell>
                              <TableCell className="text-right font-mono text-success">
                                {formatCurrency(summary.totalDebit)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-primary">
                                {formatCurrency(summary.totalCredit)}
                              </TableCell>
                              <TableCell className={`text-right font-mono ${
                                summary.closingBalance > 0 ? 'text-warning' : summary.closingBalance < 0 ? 'text-success' : 'text-muted-foreground'
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
              </>
            )}

            {!selectedCustomerId && (
              <div className="border border-dashed border-border rounded-lg p-12 text-center text-muted-foreground">
                <BookOpen size={48} weight="duotone" className="mx-auto mb-3 opacity-30" />
                <p>Select a customer to view their ledger</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
