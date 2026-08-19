import React, { useState, useMemo } from 'react'
import {
  Party,
  SalesInvoice,
  PurchaseInvoice,
  Payment,
  CustomerPayment,
  CreditNote,
  DebitNote,
  SalesReturn,
  PurchaseReturn
} from '@/lib/types'
import { calculatePartyLedger, UnifiedLedgerRow } from '@/lib/party-ledger-engine'
import { formatCurrency } from '@/lib/calculations'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Users,
  MagnifyingGlass,
  Plus,
  PencilSimple,
  Trash,
  FileArrowDown,
  ArrowUpRight,
  ArrowDownLeft,
  Receipt,
  ShoppingCart,
  CreditCard,
  FileText,
  Phone,
  EnvelopeSimple,
  MapPin,
  Buildings,
  CheckCircle,
  WarningCircle,
  Funnel,
  CalendarBlank,
  ArrowsClockwise
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'

interface PartiesPageProps {
  parties: Party[]
  salesInvoices: SalesInvoice[]
  invoices: PurchaseInvoice[]
  customerPayments: CustomerPayment[]
  payments: Payment[]
  creditNotes: CreditNote[]
  supplierCreditNotes?: CreditNote[]
  debitNotes: DebitNote[]
  customerDebitNotes?: DebitNote[]
  salesReturns: SalesReturn[]
  purchaseReturns: PurchaseReturn[]
  onAddParty: () => void
  onEditParty: (party: Party) => void
  onDeleteParty: (partyId: string) => void
  onNewSalesInvoice?: (partyId: string) => void
  onNewPurchaseInvoice?: (partyId: string) => void
  onNewPaymentIn?: (partyId: string) => void
  onNewPaymentOut?: (partyId: string) => void
  onNewCreditNote?: (partyId: string) => void
  onNewDebitNote?: (partyId: string) => void
  isLocked?: boolean
}

export function PartiesPage({
  parties = [],
  salesInvoices = [],
  invoices = [],
  customerPayments = [],
  payments = [],
  creditNotes = [],
  supplierCreditNotes = [],
  debitNotes = [],
  customerDebitNotes = [],
  salesReturns = [],
  purchaseReturns = [],
  onAddParty,
  onEditParty,
  onDeleteParty,
  onNewSalesInvoice,
  onNewPurchaseInvoice,
  onNewPaymentIn,
  onNewPaymentOut,
  onNewCreditNote,
  onNewDebitNote,
  isLocked = false
}: PartiesPageProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [registrationTypeFilter, setRegistrationTypeFilter] = useState<'all' | 'registered' | 'unregistered' | 'composition'>('all')
  const [selectedPartyId, setSelectedPartyId] = useState<string | null>(
    parties.length > 0 ? parties[0].id : null
  )
  const [activeTab, setActiveTab] = useState<'ledger' | 'details'>('ledger')
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<string>('all')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')

  // If selected party was deleted or not set, fallback to first party
  const selectedParty = useMemo(() => {
    if (!selectedPartyId && parties.length > 0) return parties[0]
    return parties.find(p => p.id === selectedPartyId) || parties[0] || null
  }, [parties, selectedPartyId])

  // Filtered Parties List
  const filteredParties = useMemo(() => {
    let result = parties

    if (registrationTypeFilter === 'registered') {
      result = result.filter(p => p.gstRegistrationType === 'Regular' || p.gstRegistrationType === 'Registered' || (p.gstin && p.gstin.trim().length === 15))
    } else if (registrationTypeFilter === 'unregistered') {
      result = result.filter(p => p.gstRegistrationType === 'Unregistered/Consumer' || p.gstRegistrationType === 'Unregistered' || p.gstRegistrationType === 'Consumer' || (!p.gstin && p.gstRegistrationType !== 'Composition' && p.gstRegistrationType !== 'Regular'))
    } else if (registrationTypeFilter === 'composition') {
      result = result.filter(p => p.gstRegistrationType === 'Composition')
    }

    if (!searchTerm.trim()) return result
    const term = searchTerm.toLowerCase().trim()
    return result.filter(p =>
      (p.name && p.name.toLowerCase().includes(term)) ||
      (p.phone && p.phone.toLowerCase().includes(term)) ||
      (p.gstin && p.gstin.toLowerCase().includes(term)) ||
      (p.city && p.city.toLowerCase().includes(term)) ||
      (p.state && p.state.toLowerCase().includes(term))
    )
  }, [parties, searchTerm, registrationTypeFilter])

  // Party summary stats map for fast listing badges
  const partyLedgerMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof calculatePartyLedger>>()
    for (const party of parties) {
      const summary = calculatePartyLedger({
        party,
        salesInvoices,
        invoices,
        customerPayments,
        payments,
        creditNotes,
        supplierCreditNotes,
        debitNotes,
        customerDebitNotes,
        salesReturns,
        purchaseReturns
      })
      map.set(party.id, summary)
    }
    return map
  }, [
    parties,
    salesInvoices,
    invoices,
    customerPayments,
    payments,
    creditNotes,
    supplierCreditNotes,
    debitNotes,
    customerDebitNotes,
    salesReturns,
    purchaseReturns
  ])

  // Global KPIs across all parties
  const globalKPIs = useMemo(() => {
    let totalReceivable = 0
    let totalPayable = 0
    for (const [, summary] of partyLedgerMap.entries()) {
      totalReceivable += summary.receivableAmount
      totalPayable += summary.payableAmount
    }
    return {
      totalParties: parties.length,
      totalReceivable,
      totalPayable,
      netBalance: totalReceivable - totalPayable
    }
  }, [parties.length, partyLedgerMap])

  // Selected party ledger with current date filter
  const selectedLedger = useMemo(() => {
    if (!selectedParty) return null
    return calculatePartyLedger({
      party: selectedParty,
      salesInvoices,
      invoices,
      customerPayments,
      payments,
      creditNotes,
      supplierCreditNotes,
      debitNotes,
      customerDebitNotes,
      salesReturns,
      purchaseReturns,
      startDate: startDate || undefined,
      endDate: endDate || undefined
    })
  }, [
    selectedParty,
    salesInvoices,
    invoices,
    customerPayments,
    payments,
    creditNotes,
    supplierCreditNotes,
    debitNotes,
    customerDebitNotes,
    salesReturns,
    purchaseReturns,
    startDate,
    endDate
  ])

  // Filtered ledger rows
  const filteredLedgerRows = useMemo(() => {
    if (!selectedLedger) return []
    if (ledgerTypeFilter === 'all') return selectedLedger.rows
    return selectedLedger.rows.filter(r => {
      if (ledgerTypeFilter === 'sales') return r.voucherType === 'Sale' || r.voucherType === 'Sales Return'
      if (ledgerTypeFilter === 'purchases') return r.voucherType === 'Purchase' || r.voucherType === 'Purchase Return'
      if (ledgerTypeFilter === 'payments') return r.voucherType === 'Payment In' || r.voucherType === 'Payment Out'
      if (ledgerTypeFilter === 'notes') return r.voucherType === 'Credit Note' || r.voucherType === 'Debit Note'
      return true
    })
  }, [selectedLedger, ledgerTypeFilter])

  // Export Ledger to Excel
  const handleExportLedgerExcel = () => {
    if (!selectedParty || !selectedLedger) return
    const rows = selectedLedger.rows.map(r => ({
      Date: r.date,
      'Voucher Type': r.voucherType,
      'Voucher No': r.voucherNo,
      Reference: r.reference || '',
      'Debit (Dr)': r.debit > 0 ? r.debit : '',
      'Credit (Cr)': r.credit > 0 ? r.credit : '',
      'Running Balance': r.runningBalance,
      'Balance Type': r.balanceType,
      Narration: r.narration || ''
    }))

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Party Statement')
    XLSX.writeFile(wb, `${selectedParty.name.replace(/[^a-zA-Z0-9]/g, '_')}_Ledger.xlsx`)
    toast.success('Party Statement exported to Excel')
  }

  // Export All Parties Master
  const handleExportAllParties = () => {
    if (parties.length === 0) return toast.info('No parties to export')
    const data = parties.map(p => {
      const summary = partyLedgerMap.get(p.id)
      return {
        'Party Name': p.name,
        Phone: p.phone || '',
        Email: p.email || '',
        GSTIN: p.gstin || '',
        State: p.state || '',
        City: p.city || '',
        Address: p.address || '',
        'Opening Balance': p.openingBalance || 0,
        'Balance Type': p.balanceType || 'Debit',
        'Current Balance': summary?.closingBalance || 0,
        'Current Balance Type': summary?.closingBalanceType || 'Dr',
        'Receivable (₹)': summary?.receivableAmount || 0,
        'Payable (₹)': summary?.payableAmount || 0
      }
    })

    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Parties Master')
    XLSX.writeFile(wb, `Parties_Master_${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast.success('Parties list exported to Excel')
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] p-4 sm:p-6 space-y-4 max-w-[1600px] mx-auto w-full">
      {/* Top Header & Global KPIs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-card p-4 rounded-xl border shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Parties Master & 360° Ledger</h1>
            <p className="text-xs text-muted-foreground">
              Unified Counterparty Management across Sales, Purchases, Payments & Returns
            </p>
          </div>
        </div>

        {/* Global Summary Badges */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="px-3 py-1.5 rounded-lg bg-muted/60 border text-xs flex flex-col items-center">
            <span className="text-muted-foreground">Total Parties</span>
            <span className="font-semibold">{globalKPIs.totalParties}</span>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs flex flex-col items-center text-emerald-700 dark:text-emerald-400">
            <span className="opacity-80">Total Receivable</span>
            <span className="font-bold">{formatCurrency(globalKPIs.totalReceivable)}</span>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs flex flex-col items-center text-rose-700 dark:text-rose-400">
            <span className="opacity-80">Total Payable</span>
            <span className="font-bold">{formatCurrency(globalKPIs.totalPayable)}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportAllParties}
            className="h-9 gap-1.5 text-xs"
          >
            <FileArrowDown className="w-4 h-4" />
            Export List
          </Button>
          <Button
            size="sm"
            onClick={onAddParty}
            disabled={isLocked}
            className="h-9 gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            + New Party
          </Button>
        </div>
      </div>

      {/* Main Content Area: Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">
        {/* Left Column: Search & Party List (4 cols) */}
        <div className="lg:col-span-4 flex flex-col bg-card rounded-xl border shadow-sm overflow-hidden h-full">
          <div className="p-3 border-b bg-muted/20 space-y-2">
            <div className="relative">
              <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search party by name, phone, GSTIN..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-xs bg-background"
              />
            </div>

            {/* Quick B2B vs B2C Registration Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              <button
                type="button"
                onClick={() => setRegistrationTypeFilter('all')}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors shrink-0 ${
                  registrationTypeFilter === 'all'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'bg-muted/70 text-muted-foreground hover:bg-muted'
                }`}
              >
                All ({parties.length})
              </button>
              <button
                type="button"
                onClick={() => setRegistrationTypeFilter('registered')}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors shrink-0 ${
                  registrationTypeFilter === 'registered'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20'
                }`}
              >
                Regular (B2B)
              </button>
              <button
                type="button"
                onClick={() => setRegistrationTypeFilter('unregistered')}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors shrink-0 ${
                  registrationTypeFilter === 'unregistered'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-blue-500/10 text-blue-700 dark:text-blue-400 hover:bg-blue-500/20'
                }`}
              >
                Unregistered / Consumer (B2C)
              </button>
              <button
                type="button"
                onClick={() => setRegistrationTypeFilter('composition')}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors shrink-0 ${
                  registrationTypeFilter === 'composition'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20'
                }`}
              >
                Composition
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {filteredParties.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-xs">
                No parties found matching filter.
              </div>
            ) : (
              filteredParties.map(party => {
                const summary = partyLedgerMap.get(party.id)
                const isSelected = selectedParty?.id === party.id
                const isReceivable = summary?.closingBalanceType === 'Dr' && (summary?.closingBalance || 0) > 0
                const isPayable = summary?.closingBalanceType === 'Cr' && (summary?.closingBalance || 0) > 0
                const isB2B = party.gstRegistrationType === 'Regular' || party.gstRegistrationType === 'Registered' || (party.gstin && party.gstin.trim().length === 15)

                return (
                  <div
                    key={party.id}
                    onClick={() => setSelectedPartyId(party.id)}
                    className={`p-3 cursor-pointer transition-colors text-left flex items-start justify-between gap-2 hover:bg-muted/50 ${
                      isSelected ? 'bg-primary/10 border-l-4 border-l-primary' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-xs truncate">{party.name}</span>
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                            party.gstRegistrationType === 'Composition'
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                              : isB2B
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                              : 'bg-blue-500/15 text-blue-700 dark:text-blue-400'
                          }`}
                        >
                          {party.gstRegistrationType === 'Composition' ? 'Composition' : isB2B ? 'Regular' : 'Unregistered'}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {party.phone && <span>{party.phone} • </span>}
                        {party.city || party.state || 'India'}
                        {party.gstin && <span className="ml-1 text-[10px] uppercase font-mono opacity-80">({party.gstin})</span>}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div
                        className={`text-xs font-bold ${
                          isReceivable
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : isPayable
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {formatCurrency(summary?.closingBalance || 0)}
                        <span className="text-[10px] ml-0.5 font-normal">
                          {summary?.closingBalanceType || 'Dr'}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {isReceivable ? 'Receivable' : isPayable ? 'Payable' : 'Settled'}
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Right Column: Party 360° View & Ledger (8 cols) */}
        <div className="lg:col-span-8 flex flex-col bg-card rounded-xl border shadow-sm overflow-hidden h-full">
          {selectedParty ? (
            <div className="flex flex-col h-full overflow-y-auto">
              {/* Party Profile Banner */}
              <div className="p-4 sm:p-5 border-b bg-muted/10">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Buildings className="w-7 h-7" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-bold">{selectedParty.name}</h2>
                        <Badge
                          variant="outline"
                          className={
                            selectedParty.gstRegistrationType === 'Regular' || selectedParty.gstRegistrationType === 'Registered' || (selectedParty.gstin && selectedParty.gstin.trim().length === 15)
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                              : selectedParty.gstRegistrationType === 'Composition'
                              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'
                              : 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30'
                          }
                        >
                          {selectedParty.gstRegistrationType === 'Regular' || selectedParty.gstRegistrationType === 'Registered' || (selectedParty.gstin && selectedParty.gstin.trim().length === 15)
                            ? 'Regular (B2B)'
                            : selectedParty.gstRegistrationType === 'Composition'
                            ? 'Composition (B2B)'
                            : 'Unregistered / Consumer (B2C)'}
                        </Badge>
                        {selectedParty.gstin && (
                          <Badge variant="outline" className="font-mono text-[10px] uppercase">
                            GSTIN: {selectedParty.gstin}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1">
                        {selectedParty.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5" /> {selectedParty.phone}
                          </span>
                        )}
                        {selectedParty.email && (
                          <span className="flex items-center gap-1">
                            <EnvelopeSimple className="w-3.5 h-3.5" /> {selectedParty.email}
                          </span>
                        )}
                        {(selectedParty.city || selectedParty.state) && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" /> {selectedParty.city ? `${selectedParty.city}, ` : ''}{selectedParty.state || ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions & Balance Header */}
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onEditParty(selectedParty)}
                      disabled={isLocked}
                      className="h-8 gap-1 text-xs"
                    >
                      <PencilSimple className="w-3.5 h-3.5" />
                      Edit Party
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Are you sure you want to delete "${selectedParty.name}"?`)) {
                          onDeleteParty(selectedParty.id)
                        }
                      }}
                      disabled={isLocked}
                      className="h-8 gap-1 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                    >
                      <Trash className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Universal Action Bar: Quick Transactions */}
                <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-border/60">
                  <span className="text-[11px] font-medium text-muted-foreground mr-1">Quick Actions:</span>
                  {onNewSalesInvoice && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onNewSalesInvoice(selectedParty.id)}
                      className="h-7 px-2 text-[11px] gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                    >
                      <Receipt className="w-3 h-3" /> + Sale Invoice
                    </Button>
                  )}
                  {onNewPurchaseInvoice && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onNewPurchaseInvoice(selectedParty.id)}
                      className="h-7 px-2 text-[11px] gap-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800"
                    >
                      <ShoppingCart className="w-3 h-3" /> + Purchase Invoice
                    </Button>
                  )}
                  {onNewPaymentIn && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onNewPaymentIn(selectedParty.id)}
                      className="h-7 px-2 text-[11px] gap-1 bg-teal-50 hover:bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800"
                    >
                      <ArrowDownLeft className="w-3 h-3" /> + Payment In
                    </Button>
                  )}
                  {onNewPaymentOut && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onNewPaymentOut(selectedParty.id)}
                      className="h-7 px-2 text-[11px] gap-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
                    >
                      <ArrowUpRight className="w-3 h-3" /> + Payment Out
                    </Button>
                  )}
                  {onNewCreditNote && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onNewCreditNote(selectedParty.id)}
                      className="h-7 px-2 text-[11px] gap-1"
                    >
                      <FileText className="w-3 h-3" /> + Credit Note
                    </Button>
                  )}
                  {onNewDebitNote && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onNewDebitNote(selectedParty.id)}
                      className="h-7 px-2 text-[11px] gap-1"
                    >
                      <FileText className="w-3 h-3" /> + Debit Note
                    </Button>
                  )}
                </div>

                {/* KPI Metrics Strip */}
                {selectedLedger && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                    <div className="bg-background/80 p-2.5 rounded-lg border">
                      <div className="text-[10px] text-muted-foreground">Net Closing Balance</div>
                      <div
                        className={`text-sm font-bold mt-0.5 ${
                          selectedLedger.closingBalanceType === 'Dr'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {formatCurrency(selectedLedger.closingBalance)}{' '}
                        <span className="text-[10px] font-normal">
                          ({selectedLedger.closingBalanceType === 'Dr' ? 'Receivable' : 'Payable'})
                        </span>
                      </div>
                    </div>
                    <div className="bg-background/80 p-2.5 rounded-lg border">
                      <div className="text-[10px] text-muted-foreground">Total Sales Invoiced</div>
                      <div className="text-sm font-bold mt-0.5 text-foreground">
                        {formatCurrency(selectedLedger.totalSales)}
                      </div>
                    </div>
                    <div className="bg-background/80 p-2.5 rounded-lg border">
                      <div className="text-[10px] text-muted-foreground">Total Purchases</div>
                      <div className="text-sm font-bold mt-0.5 text-foreground">
                        {formatCurrency(selectedLedger.totalPurchases)}
                      </div>
                    </div>
                    <div className="bg-background/80 p-2.5 rounded-lg border">
                      <div className="text-[10px] text-muted-foreground">Total Settled (In / Out)</div>
                      <div className="text-xs font-semibold mt-1 flex items-center justify-between">
                        <span className="text-emerald-600">+{formatCurrency(selectedLedger.totalPaymentsIn)}</span>
                        <span className="text-rose-600">-{formatCurrency(selectedLedger.totalPaymentsOut)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Tabs: 360° Ledger vs Party Profile Details */}
              <div className="p-4 flex-1 flex flex-col min-h-0">
                <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)} className="flex flex-col flex-1">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <TabsList className="h-8">
                      <TabsTrigger value="ledger" className="text-xs">360° Statement & Ledger</TabsTrigger>
                      <TabsTrigger value="details" className="text-xs">Profile & Rules</TabsTrigger>
                    </TabsList>

                    {activeTab === 'ledger' && (
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Filter by Voucher Type */}
                        <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-lg border text-xs">
                          <button
                            onClick={() => setLedgerTypeFilter('all')}
                            className={`px-2 py-0.5 rounded text-[11px] ${
                              ledgerTypeFilter === 'all' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'
                            }`}
                          >
                            All
                          </button>
                          <button
                            onClick={() => setLedgerTypeFilter('sales')}
                            className={`px-2 py-0.5 rounded text-[11px] ${
                              ledgerTypeFilter === 'sales' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'
                            }`}
                          >
                            Sales
                          </button>
                          <button
                            onClick={() => setLedgerTypeFilter('purchases')}
                            className={`px-2 py-0.5 rounded text-[11px] ${
                              ledgerTypeFilter === 'purchases' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'
                            }`}
                          >
                            Purchases
                          </button>
                          <button
                            onClick={() => setLedgerTypeFilter('payments')}
                            className={`px-2 py-0.5 rounded text-[11px] ${
                              ledgerTypeFilter === 'payments' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'
                            }`}
                          >
                            Payments
                          </button>
                          <button
                            onClick={() => setLedgerTypeFilter('notes')}
                            className={`px-2 py-0.5 rounded text-[11px] ${
                              ledgerTypeFilter === 'notes' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'
                            }`}
                          >
                            Notes
                          </button>
                        </div>

                        {/* Date Filters */}
                        <Input
                          type="date"
                          value={startDate}
                          onChange={e => setStartDate(e.target.value)}
                          className="h-7 w-28 text-[11px] px-1.5"
                          title="Start Date"
                        />
                        <Input
                          type="date"
                          value={endDate}
                          onChange={e => setEndDate(e.target.value)}
                          className="h-7 w-28 text-[11px] px-1.5"
                          title="End Date"
                        />
                        {(startDate || endDate) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setStartDate('')
                              setEndDate('')
                            }}
                            className="h-7 px-1.5 text-[11px] text-muted-foreground"
                          >
                            Reset
                          </Button>
                        )}

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleExportLedgerExcel}
                          className="h-7 gap-1 text-[11px]"
                        >
                          <FileArrowDown className="w-3.5 h-3.5" />
                          Excel
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Tab 1: Ledger Table */}
                  <TabsContent value="ledger" className="flex-1 overflow-y-auto mt-0 border rounded-lg">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead className="bg-muted/50 sticky top-0 border-b text-[11px] text-muted-foreground font-medium">
                        <tr>
                          <th className="p-2 pl-3">Date</th>
                          <th className="p-2">Type</th>
                          <th className="p-2">Voucher No</th>
                          <th className="p-2">Reference</th>
                          <th className="p-2 text-right">Debit (Dr)</th>
                          <th className="p-2 text-right">Credit (Cr)</th>
                          <th className="p-2 text-right pr-3">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filteredLedgerRows.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="p-8 text-center text-muted-foreground text-xs">
                              No transactions recorded for this period.
                            </td>
                          </tr>
                        ) : (
                          filteredLedgerRows.map(row => (
                            <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                              <td className="p-2 pl-3 whitespace-nowrap font-mono text-[11px]">
                                {row.date || '—'}
                              </td>
                              <td className="p-2 whitespace-nowrap">
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] font-normal ${
                                    row.voucherType === 'Sale'
                                      ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200'
                                      : row.voucherType === 'Purchase'
                                      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200'
                                      : row.voucherType === 'Payment In'
                                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200'
                                      : row.voucherType === 'Payment Out'
                                      ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-200'
                                      : ''
                                  }`}
                                >
                                  {row.voucherType}
                                </Badge>
                              </td>
                              <td className="p-2 font-medium font-mono text-[11px] truncate max-w-[120px]">
                                {row.voucherNo}
                              </td>
                              <td className="p-2 text-muted-foreground truncate max-w-[140px]" title={row.reference || row.narration}>
                                {row.reference || row.narration || '—'}
                              </td>
                              <td className="p-2 text-right font-mono font-medium text-emerald-600 dark:text-emerald-400">
                                {row.debit > 0 ? formatCurrency(row.debit) : '—'}
                              </td>
                              <td className="p-2 text-right font-mono font-medium text-rose-600 dark:text-rose-400">
                                {row.credit > 0 ? formatCurrency(row.credit) : '—'}
                              </td>
                              <td className="p-2 text-right pr-3 font-mono font-bold whitespace-nowrap">
                                {formatCurrency(row.runningBalance)}{' '}
                                <span className="text-[10px] font-normal text-muted-foreground">
                                  {row.balanceType}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </TabsContent>

                  {/* Tab 2: Profile & Details */}
                  <TabsContent value="details" className="flex-1 overflow-y-auto mt-0 p-4 border rounded-lg space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Billing Address */}
                      <div className="p-3 bg-muted/20 rounded-lg border space-y-1">
                        <div className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
                          <MapPin className="w-4 h-4 text-primary" /> Billing Address
                        </div>
                        <div className="text-xs text-muted-foreground pt-1">
                          {selectedParty.address || 'No billing address provided'}
                          {selectedParty.city && <div>City: {selectedParty.city}</div>}
                          {selectedParty.state && <div>State: {selectedParty.state} ({selectedParty.stateCode || '—'})</div>}
                          {selectedParty.pincode && <div>Pincode: {selectedParty.pincode}</div>}
                        </div>
                      </div>

                      {/* Shipping Address */}
                      <div className="p-3 bg-muted/20 rounded-lg border space-y-1">
                        <div className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
                          <Buildings className="w-4 h-4 text-primary" /> Shipping Address
                        </div>
                        <div className="text-xs text-muted-foreground pt-1">
                          {selectedParty.shippingSameAsBilling
                            ? 'Same as Billing Address'
                            : selectedParty.shippingAddress || 'No shipping address provided'}
                          {!selectedParty.shippingSameAsBilling && selectedParty.shippingState && (
                            <div>State: {selectedParty.shippingState}</div>
                          )}
                        </div>
                      </div>

                      {/* Opening Balance Config */}
                      <div className="p-3 bg-muted/20 rounded-lg border space-y-1">
                        <div className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
                          <Receipt className="w-4 h-4 text-primary" /> Opening Balance Details
                        </div>
                        <div className="text-xs text-muted-foreground pt-1 space-y-0.5">
                          <div>Opening Amount: <span className="font-semibold text-foreground">{formatCurrency(selectedParty.openingBalance || 0)}</span></div>
                          <div>Balance Nature: <span className="font-semibold text-foreground">{selectedParty.balanceType || 'Debit'}</span></div>
                          {selectedParty.openingBalanceDate && (
                            <div>Effective As Of: <span className="font-semibold text-foreground">{selectedParty.openingBalanceDate}</span></div>
                          )}
                        </div>
                      </div>

                      {/* CD & Incentive Rules if present */}
                      <div className="p-3 bg-muted/20 rounded-lg border space-y-1">
                        <div className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
                          <FileText className="w-4 h-4 text-primary" /> Cash Discount & Scheme Rules
                        </div>
                        <div className="text-xs text-muted-foreground pt-1 space-y-0.5">
                          {selectedParty.paymentCDRules && selectedParty.paymentCDRules.length > 0 ? (
                            <div>Payment CD Rules: <span className="font-semibold text-foreground">{selectedParty.paymentCDRules.length} slabs configured</span></div>
                          ) : (
                            <div>No custom payment CD rules configured</div>
                          )}
                          {selectedParty.advanceCDPercentage ? (
                            <div>Advance CD Rate: <span className="font-semibold text-foreground">{selectedParty.advanceCDPercentage}%</span></div>
                          ) : null}
                          {selectedParty.annualTarget ? (
                            <div>Annual Target: <span className="font-semibold text-foreground">{selectedParty.annualTarget.targetMT} MT @ ₹{selectedParty.annualTarget.ratePerMT}/MT</span></div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <Users className="w-12 h-12 stroke-[1.5] mb-2 opacity-40" />
              <div className="text-sm font-semibold">No Party Selected</div>
              <div className="text-xs mt-1">Select a party from the left sidebar to view its 360° ledger.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
