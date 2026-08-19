import { getChangedByLabel, getChangedByRole } from '@/lib/security-utils'
import { useState, useMemo } from 'react'
import { DebitNote, Party, PurchaseInvoice, SalesInvoice } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Badge } from '@/components/ui/badge'
import { Plus, CaretUpDown, Check, FileText, MagnifyingGlass } from '@phosphor-icons/react'
import { formatCurrency, getFYFromDate, calculateNoteTaxBreakdown } from '@/lib/calculations'
import { getStateName } from '@/lib/constants/indian-states'
import { parseISO, format } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

import { PeriodDateFilter, PeriodFilterState, defaultPeriodFilterState, isRecordInPeriod } from '@/components/period-date-filter'
import { saveEntityRemote, deleteEntityRemote } from '@/lib/firebase-storage'
import { ThreeDotDropdown } from '@/components/ui/three-dot-dropdown'

export const STATUTORY_DEBIT_NOTE_REASONS = [
  { code: '01', label: '01 - Purchase Return / Goods Rejected' },
  { code: '02', label: '02 - Rate Difference / Weight Shortage' },
  { code: '03', label: '03 - Quality Penalty / Rebate' },
  { code: '04', label: '04 - Correction in Invoice' },
  { code: '05', label: '05 - Financial Adjustment' },
  { code: '06', label: '06 - Other Charges' },
]

interface DebitNotesPageProps {
  debitNotes: any[]
  setDebitNotes: (updater: (prev: any[]) => any[]) => void
  parties: Party[]
  invoices?: PurchaseInvoice[]
  salesInvoices?: SalesInvoice[]
  currentFY: string
  isLocked?: boolean
  activeCompanyId?: string
  onNavigateToParty?: (partyId: string) => void
}

export default function DebitNotesPage({
  debitNotes = [],
  setDebitNotes,
  parties = [],
  invoices = [],
  salesInvoices = [],
  currentFY,
  isLocked = false,
  activeCompanyId,
  onNavigateToParty
}: DebitNotesPageProps) {
  const [open, setOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<any | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<any | null>(null)
  const [periodFilter, setPeriodFilter] = useState<PeriodFilterState>(defaultPeriodFilterState)
  const [selectedEntity, setSelectedEntity] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Form State
  const [noteNo, setNoteNo] = useState('')
  const [selectedPartyId, setSelectedPartyId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('01 - Purchase Return / Goods Rejected')
  const [originalInvoiceNo, setOriginalInvoiceNo] = useState('')
  const [originalInvoiceDate, setOriginalInvoiceDate] = useState('')
  const [isTaxInclusive, setIsTaxInclusive] = useState(true)
  const [gstRate, setGstRate] = useState<number>(18)
  const [remarks, setRemarks] = useState('')

  // Search & Combobox Popovers
  const [partyComboboxOpen, setPartyComboboxOpen] = useState(false)
  const [invoiceComboboxOpen, setInvoiceComboboxOpen] = useState(false)

  // Selected Party details
  const selectedParty = useMemo(() => {
    return parties.find(p => p.id === selectedPartyId)
  }, [parties, selectedPartyId])

  const partyStateCode = selectedParty?.stateCode || (selectedParty?.gstin ? selectedParty.gstin.slice(0, 2) : '19')

  // Available past invoices for this party
  const availableInvoices = useMemo(() => {
    if (!selectedPartyId) return []
    const purchases = (invoices || []).filter(inv => (inv.partyId || inv.supplierId) === selectedPartyId)
    const sales = (salesInvoices || []).filter(inv => (inv.partyId || inv.customerId) === selectedPartyId)
    return [...purchases, ...sales]
  }, [selectedPartyId, invoices, salesInvoices])

  // Calculated Tax Breakdown
  const taxBreakdown = useMemo(() => {
    const rawAmount = parseFloat(amount) || 0
    return calculateNoteTaxBreakdown({
      amount: rawAmount,
      isTaxInclusive,
      gstRate,
      partyStateCode
    })
  }, [amount, isTaxInclusive, gstRate, partyStateCode])

  const handleOpenDialog = (item?: any) => {
    if (item) {
      setEditingItem(item)
      setNoteNo(item.noteNo || '')
      setSelectedPartyId(item.partyId || item.supplierId || item.customerId || '')
      setDate(item.date || new Date().toISOString().split('T')[0])
      setAmount((item.totalAmount ?? item.amount ?? 0).toString())
      setReason(item.reason || '01 - Purchase Return / Goods Rejected')
      setOriginalInvoiceNo(item.originalInvoiceNo || '')
      setOriginalInvoiceDate(item.originalInvoiceDate || '')
      setIsTaxInclusive(item.isTaxInclusive ?? true)
      setGstRate(item.gstRate ?? 18)
      setRemarks(item.remarks || '')
    } else {
      setEditingItem(null)
      const nextNum = debitNotes.length + 1
      setNoteNo(`DN-${format(new Date(), 'yyyyMMdd')}-${String(nextNum).padStart(3, '0')}`)
      setSelectedPartyId('')
      setDate(new Date().toISOString().split('T')[0])
      setAmount('')
      setReason('01 - Purchase Return / Goods Rejected')
      setOriginalInvoiceNo('')
      setOriginalInvoiceDate('')
      setIsTaxInclusive(true)
      setGstRate(18)
      setRemarks('')
    }
    setOpen(true)
  }

  const handleSelectInvoice = (inv: any) => {
    setOriginalInvoiceNo(inv.invoiceNo)
    setOriginalInvoiceDate(inv.invoiceDate)
    if (inv.gstPercentage) setGstRate(inv.gstPercentage)
    setInvoiceComboboxOpen(false)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isLocked) {
      toast.error('System is locked')
      return
    }

    if (!noteNo.trim()) {
      toast.error('Please enter a Debit Note number')
      return
    }

    if (!selectedPartyId) {
      toast.error('Please select a Party')
      return
    }

    const rawAmount = parseFloat(amount)
    if (isNaN(rawAmount) || rawAmount <= 0) {
      toast.error('Please enter a valid positive amount')
      return
    }

    const targetParty = parties.find(p => p.id === selectedPartyId)
    const partyName = targetParty?.name || 'Party Account'
    const partyGstin = targetParty?.gstin || ''

    const calculatedFY = getFYFromDate(date) || currentFY

    const notePayload: DebitNote = {
      id: editingItem ? editingItem.id : `dn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      noteNo: noteNo.trim(),
      partyId: selectedPartyId,
      supplierId: selectedPartyId,
      customerId: selectedPartyId,
      partyNameSnapshot: partyName,
      partyGstinSnapshot: partyGstin,
      date,
      taxableAmount: taxBreakdown.taxableAmount,
      isTaxInclusive,
      gstRate,
      cgstAmount: taxBreakdown.cgstAmount,
      cgst: taxBreakdown.cgstAmount,
      sgstAmount: taxBreakdown.sgstAmount,
      sgst: taxBreakdown.sgstAmount,
      igstAmount: taxBreakdown.igstAmount,
      igst: taxBreakdown.igstAmount,
      totalAmount: taxBreakdown.totalAmount,
      amount: taxBreakdown.totalAmount,
      reason,
      originalInvoiceNo: originalInvoiceNo.trim() || undefined,
      originalInvoiceDate: originalInvoiceDate || undefined,
      remarks: remarks.trim() || undefined,
      fy: calculatedFY,
      sourceType: editingItem?.sourceType || 'manual',
      isAutoGenerated: editingItem?.isAutoGenerated || false,
      lastModifiedBy: getChangedByLabel(),
      lastModifiedRole: getChangedByRole()
    }

    if (editingItem) {
      setDebitNotes(prev => prev.map(dn => dn.id === editingItem.id ? notePayload : dn))
      toast.success(`Debit Note "${notePayload.noteNo}" updated successfully`)
    } else {
      setDebitNotes(prev => [notePayload, ...prev])
      toast.success(`Debit Note "${notePayload.noteNo}" created successfully`)
    }

    if (activeCompanyId) {
      saveEntityRemote(activeCompanyId, 'debitNotes', notePayload).catch(err => {
        console.warn('Firebase dual-sync for Debit Note warning:', err)
      })
    }

    setOpen(false)
  }

  const handleDelete = async () => {
    if (!itemToDelete) return
    if (isLocked) {
      toast.error('System is locked')
      return
    }

    const id = itemToDelete.id
    const noteNum = itemToDelete.noteNo

    setDebitNotes(prev => prev.filter(dn => dn.id !== id))
    toast.success(`Debit Note "${noteNum}" deleted`)

    if (activeCompanyId) {
      deleteEntityRemote(activeCompanyId, 'debitNotes', id).catch(err => {
        console.warn('Firebase delete Debit Note warning:', err)
      })
    }

    setDeleteDialogOpen(false)
    setItemToDelete(null)
  }

  // Filtered list
  const filteredList = useMemo(() => {
    return debitNotes.filter(item => {
      if (!isRecordInPeriod(item.date, item.fy, periodFilter, currentFY)) return false
      const pid = item.partyId || item.supplierId || item.customerId
      if (selectedEntity !== 'all' && pid !== selectedEntity) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const party = parties.find(p => p.id === pid)
        const pName = party?.name?.toLowerCase() || item.partyNameSnapshot?.toLowerCase() || ''
        const nNo = item.noteNo?.toLowerCase() || ''
        const invNo = item.originalInvoiceNo?.toLowerCase() || ''
        if (!pName.includes(q) && !nNo.includes(q) && !invNo.includes(q)) return false
      }
      return true
    })
  }, [debitNotes, periodFilter, currentFY, selectedEntity, searchQuery, parties])

  const totals = useMemo(() => {
    return filteredList.reduce((acc, curr) => {
      const tot = curr.totalAmount ?? curr.amount ?? 0
      const tax = curr.taxableAmount ?? tot
      const gst = (curr.igstAmount || curr.igst || 0) + (curr.cgstAmount || curr.cgst || 0) + (curr.sgstAmount || curr.sgst || 0)
      return {
        totalAmount: acc.totalAmount + tot,
        taxableAmount: acc.taxableAmount + tax,
        gstAmount: acc.gstAmount + gst,
        count: acc.count + 1
      }
    }, { totalAmount: 0, taxableAmount: 0, gstAmount: 0, count: 0 })
  }, [filteredList])

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <FileText className="h-7 w-7 text-indigo-600" weight="duotone" />
            Debit Notes
          </h1>
          <p className="text-sm text-slate-500">
            Create and track Debit Notes issued to or received from all counterparties.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => handleOpenDialog()}
            disabled={isLocked}
            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm flex items-center gap-2"
          >
            <Plus className="h-4 w-4" weight="bold" />
            <span>+ Debit Note</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border border-slate-200 bg-white shadow-xs">
          <CardContent className="p-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Debit Notes</div>
            <div className="text-2xl font-black text-slate-900 mt-1">{totals.count}</div>
            <div className="text-[11px] text-slate-400 mt-1">In selected period</div>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white shadow-xs">
          <CardContent className="p-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Taxable Value</div>
            <div className="text-2xl font-black text-indigo-600 mt-1">{formatCurrency(totals.taxableAmount)}</div>
            <div className="text-[11px] text-slate-400 mt-1">Base amount before GST</div>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white shadow-xs">
          <CardContent className="p-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">GST Adjusted</div>
            <div className="text-2xl font-black text-amber-600 mt-1">{formatCurrency(totals.gstAmount)}</div>
            <div className="text-[11px] text-slate-400 mt-1">IGST / CGST / SGST</div>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 bg-white shadow-xs">
          <CardContent className="p-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Net Adjusted</div>
            <div className="text-2xl font-black text-emerald-600 mt-1">{formatCurrency(totals.totalAmount)}</div>
            <div className="text-[11px] text-slate-400 mt-1">Total Debit Value</div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative min-w-[200px] flex-1 max-w-xs">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search party, note #, invoice #..."
              className="pl-9 h-9 text-xs"
            />
          </div>

          <Select value={selectedEntity} onValueChange={setSelectedEntity}>
            <SelectTrigger className="h-9 w-[190px] text-xs">
              <SelectValue placeholder="Party: All Parties" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Parties ({parties.length})</SelectItem>
              {parties.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <PeriodDateFilter
          value={periodFilter}
          onChange={setPeriodFilter}
          currentFY={currentFY}
        />
      </div>

      {/* Table */}
      <Card className="border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50 border-b border-slate-200">
              <TableRow>
                <TableHead className="font-bold text-slate-700 text-xs w-[120px]">NOTE NO</TableHead>
                <TableHead className="font-bold text-slate-700 text-xs w-[100px]">DATE</TableHead>
                <TableHead className="font-bold text-slate-700 text-xs">PARTY</TableHead>
                <TableHead className="font-bold text-slate-700 text-xs">REASON</TableHead>
                <TableHead className="font-bold text-slate-700 text-xs">ORIGINAL INV</TableHead>
                <TableHead className="font-bold text-slate-700 text-xs text-right">TAXABLE (₹)</TableHead>
                <TableHead className="font-bold text-slate-700 text-xs text-right">GST (₹)</TableHead>
                <TableHead className="font-bold text-slate-700 text-xs text-right">TOTAL AMOUNT (₹)</TableHead>
                <TableHead className="font-bold text-slate-700 text-xs w-[60px] text-center">ACTION</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredList.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-slate-400 text-sm">
                    No Debit Notes found matching the selected filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredList.map(item => {
                  const pid = item.partyId || item.supplierId || item.customerId
                  const party = parties.find(p => p.id === pid)
                  const pName = party?.name || item.partyNameSnapshot || 'Unknown Party'
                  const isAuto = Boolean(item.isAutoGenerated || item.id.startsWith('debit-note-pr-') || item.sourceType === 'purchase_return')

                  return (
                    <TableRow key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <TableCell className="font-mono text-xs font-semibold text-indigo-700">
                        {item.noteNo}
                        {isAuto && (
                          <Badge variant="outline" className="ml-1.5 text-[9px] px-1 py-0 border-amber-300 bg-amber-50 text-amber-700">
                            Auto
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 whitespace-nowrap">
                        {item.date ? format(parseISO(item.date), 'dd MMM yyyy') : '-'}
                      </TableCell>
                      <TableCell className="text-xs font-medium text-slate-900">
                        <button
                          type="button"
                          onClick={() => onNavigateToParty?.(pid)}
                          className="hover:text-indigo-600 hover:underline text-left"
                        >
                          {pName}
                        </button>
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 max-w-[180px] truncate" title={item.reason}>
                        {item.reason || '-'}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500 font-mono">
                        {item.originalInvoiceNo || '-'}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-right text-slate-700">
                        {formatCurrency(item.taxableAmount ?? item.totalAmount ?? item.amount ?? 0)}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-right text-amber-600">
                        {formatCurrency((item.igstAmount || item.igst || 0) + (item.cgstAmount || item.cgst || 0) + (item.sgstAmount || item.sgst || 0))}
                      </TableCell>
                      <TableCell className="text-xs font-mono font-bold text-right text-emerald-700">
                        {formatCurrency(item.totalAmount ?? item.amount ?? 0)}
                      </TableCell>
                      <TableCell className="text-center">
                        <ThreeDotDropdown
                          isLocked={isLocked}
                          onEdit={() => handleOpenDialog(item)}
                          onDelete={() => {
                            setItemToDelete(item)
                            setDeleteDialogOpen(true)
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <FileText className="h-5 w-5 text-indigo-600" />
              {editingItem ? 'Edit Debit Note' : 'New Debit Note'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Debit Note No *</Label>
                <Input
                  value={noteNo}
                  onChange={(e) => setNoteNo(e.target.value)}
                  placeholder="e.g. DN-20260401-001"
                  required
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Date *</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="text-xs"
                />
              </div>
            </div>

            {/* Party Selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Party *</Label>
              <Popover open={partyComboboxOpen} onOpenChange={setPartyComboboxOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={partyComboboxOpen}
                    className="w-full justify-between text-xs h-9 font-normal"
                  >
                    {selectedParty ? selectedParty.name : "Select Party..."}
                    <CaretUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[450px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search party name or GSTIN..." className="h-9 text-xs" />
                    <CommandList>
                      <CommandEmpty>No party found.</CommandEmpty>
                      <CommandGroup className="max-h-60 overflow-y-auto">
                        {parties.map(p => (
                          <CommandItem
                            key={p.id}
                            value={`${p.name} ${p.gstin || ''}`}
                            onSelect={() => {
                              setSelectedPartyId(p.id)
                              setPartyComboboxOpen(false)
                            }}
                            className="text-xs flex items-center justify-between py-2"
                          >
                            <div className="flex flex-col">
                              <span className="font-semibold text-slate-900">{p.name}</span>
                              <span className="text-[10px] text-slate-500 font-mono">{p.gstin || 'Unregistered'} • {getStateName(p.stateCode || (p.gstin ? p.gstin.slice(0, 2) : '19'))}</span>
                            </div>
                            <Check className={cn("h-4 w-4 text-indigo-600", selectedPartyId === p.id ? "opacity-100" : "opacity-0")} />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Reason & Original Invoice */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Statutory Reason *</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger className="text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUTORY_DEBIT_NOTE_REASONS.map(r => (
                      <SelectItem key={r.code} value={r.label} className="text-xs">
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Link Original Invoice (Optional)</Label>
                <Popover open={invoiceComboboxOpen} onOpenChange={setInvoiceComboboxOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={invoiceComboboxOpen}
                      disabled={!selectedPartyId || availableInvoices.length === 0}
                      className="w-full justify-between text-xs h-9 font-normal font-mono"
                    >
                      {originalInvoiceNo ? `${originalInvoiceNo} (${originalInvoiceDate})` : "Select past invoice..."}
                      <CaretUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[350px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search past invoice #..." className="h-9 text-xs" />
                      <CommandList>
                        <CommandEmpty>No past invoices found for this party.</CommandEmpty>
                        <CommandGroup className="max-h-48 overflow-y-auto">
                          {availableInvoices.map(inv => (
                            <CommandItem
                              key={inv.id}
                              value={inv.invoiceNo}
                              onSelect={() => handleSelectInvoice(inv)}
                              className="text-xs flex items-center justify-between py-2 font-mono"
                            >
                              <div>
                                <span className="font-bold">{inv.invoiceNo}</span>
                                <span className="text-[10px] text-slate-500 ml-2">({inv.invoiceDate})</span>
                                <div className="text-[11px] text-emerald-600 font-sans font-semibold">
                                  {formatCurrency(inv.invoiceAmount || inv.totalAmount || 0)}
                                </div>
                              </div>
                              <Check className={cn("h-4 w-4 text-indigo-600", originalInvoiceNo === inv.invoiceNo ? "opacity-100" : "opacity-0")} />
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Amount & Tax Options */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Amount (₹) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    required
                    className="font-mono text-xs font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Tax Calculation</Label>
                  <Select value={isTaxInclusive ? 'inclusive' : 'exclusive'} onValueChange={(v) => setIsTaxInclusive(v === 'inclusive')}>
                    <SelectTrigger className="text-xs h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inclusive">GST Inclusive (Total Amount)</SelectItem>
                      <SelectItem value="exclusive">GST Exclusive (Base Taxable)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">GST Rate (%)</Label>
                  <Select value={gstRate.toString()} onValueChange={(v) => setGstRate(parseFloat(v))}>
                    <SelectTrigger className="text-xs h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0% (Exempt)</SelectItem>
                      <SelectItem value="5">5%</SelectItem>
                      <SelectItem value="12">12%</SelectItem>
                      <SelectItem value="18">18% (Standard)</SelectItem>
                      <SelectItem value="28">28%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Tax Breakdown Preview */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 text-xs font-mono">
                <div>
                  <span className="text-slate-400 block text-[10px]">TAXABLE</span>
                  <span className="font-semibold text-slate-800">{formatCurrency(taxBreakdown.taxableAmount)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">
                    {partyStateCode === '19' ? 'CGST + SGST' : 'IGST'}
                  </span>
                  <span className="font-semibold text-amber-600">
                    {formatCurrency(taxBreakdown.igstAmount || (taxBreakdown.cgstAmount + taxBreakdown.sgstAmount))}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">TOTAL VALUE</span>
                  <span className="font-black text-emerald-700">{formatCurrency(taxBreakdown.totalAmount)}</span>
                </div>
              </div>
            </div>

            {/* Remarks */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Remarks (Optional)</Label>
              <Textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Add any internal note, ledger reference, or context..."
                className="text-xs resize-none h-16"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} className="text-xs">
                Cancel
              </Button>
              <Button type="submit" disabled={isLocked} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs">
                {editingItem ? 'Update Debit Note' : 'Create Debit Note'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Debit Note</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete Debit Note <strong>{itemToDelete?.noteNo}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
