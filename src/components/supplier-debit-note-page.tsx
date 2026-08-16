import { getChangedByLabel, getChangedByRole } from '@/lib/security-utils'
import { useState, useMemo } from 'react'
import { SupplierDebitNote, Supplier, PurchaseInvoice } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Badge } from '@/components/ui/badge'
import { Plus, CaretUpDown, Check, Receipt, Calculator, FileText, ArrowUDownRight } from '@phosphor-icons/react'
import { formatCurrency, getFYFromDate, calculateNoteTaxBreakdown } from '@/lib/calculations'
import { getStateName } from '@/lib/constants/indian-states'
import { parseISO, format } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

import { PeriodDateFilter, PeriodFilterState, defaultPeriodFilterState, isRecordInPeriod } from '@/components/period-date-filter'
import { saveEntityRemote, deleteEntityRemote } from '@/lib/firebase-storage'
import { ThreeDotDropdown } from '@/components/ui/three-dot-dropdown'
import { STATUTORY_NOTE_REASONS } from '@/components/customer-credit-note-page'

interface SupplierDebitNotePageProps {
  debitNotes: SupplierDebitNote[]
  setDebitNotes: (updater: (prev: SupplierDebitNote[]) => SupplierDebitNote[]) => void
  suppliers: Supplier[]
  invoices?: PurchaseInvoice[]
  currentFY: string
  isLocked?: boolean
  activeCompanyId?: string
}

export default function SupplierDebitNotePage({
  debitNotes = [],
  setDebitNotes,
  suppliers = [],
  invoices = [],
  currentFY,
  isLocked = false,
  activeCompanyId
}: SupplierDebitNotePageProps) {
  const [open, setOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<SupplierDebitNote | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<SupplierDebitNote | null>(null)
  const [periodFilter, setPeriodFilter] = useState<PeriodFilterState>(defaultPeriodFilterState)
  const [selectedEntity, setSelectedEntity] = useState<string>('all')

  // Form State
  const [noteNo, setNoteNo] = useState('')
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('01 - Purchase Return')
  const [originalInvoiceNo, setOriginalInvoiceNo] = useState('')
  const [originalInvoiceDate, setOriginalInvoiceDate] = useState('')
  const [isTaxInclusive, setIsTaxInclusive] = useState(true)
  const [gstRate, setGstRate] = useState<number>(18)
  const [remarks, setRemarks] = useState('')

  // Search Popovers
  const [supplierComboboxOpen, setSupplierComboboxOpen] = useState(false)
  const [invoiceComboboxOpen, setInvoiceComboboxOpen] = useState(false)

  // Selected Supplier details
  const selectedSupplier = useMemo(() => {
    return suppliers.find(s => s.id === selectedSupplierId)
  }, [suppliers, selectedSupplierId])

  const partyStateCode = selectedSupplier?.stateCode || (selectedSupplier?.gstin ? selectedSupplier.gstin.slice(0, 2) : '19')

  // Available past invoices for this supplier
  const availableInvoices = useMemo(() => {
    if (!selectedSupplierId || !invoices) return []
    return invoices.filter(inv => inv.supplierId === selectedSupplierId)
  }, [selectedSupplierId, invoices])

  // Live Tax Calculation
  const taxBreakdown = useMemo(() => {
    return calculateNoteTaxBreakdown({
      amount: parseFloat(amount) || 0,
      isTaxInclusive,
      gstRate,
      partyStateCode,
      companyStateCode: '19'
    })
  }, [amount, isTaxInclusive, gstRate, partyStateCode])

  // Reset form
  const resetForm = () => {
    setEditingItem(null)
    setNoteNo('')
    setSelectedSupplierId('')
    setDate(new Date().toISOString().split('T')[0])
    setAmount('')
    setReason('01 - Purchase Return')
    setOriginalInvoiceNo('')
    setOriginalInvoiceDate('')
    setIsTaxInclusive(true)
    setGstRate(18)
    setRemarks('')
  }

  const handleStartEdit = (item: SupplierDebitNote) => {
    setEditingItem(item)
    setNoteNo(item.noteNo || '')
    setSelectedSupplierId(item.supplierId)
    setDate(item.date)
    setAmount(String(item.amount || ''))
    setReason(item.reason || '01 - Purchase Return')
    setOriginalInvoiceNo(item.originalInvoiceNo || item.invoiceRef || '')
    setOriginalInvoiceDate(item.originalInvoiceDate || '')
    setIsTaxInclusive(item.isTaxInclusive !== false)
    setGstRate(typeof item.gstRate === 'number' ? item.gstRate : 18)
    setRemarks(item.remarks || '')
    setOpen(true)
  }

  // Filtered Notes
  const filteredItems = useMemo(() => {
    let result = debitNotes.filter(p => isRecordInPeriod(p.date, p.fy, periodFilter, currentFY))

    if (selectedEntity !== 'all') {
      result = result.filter(p => p.supplierId === selectedEntity)
    }

    return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [debitNotes, periodFilter, currentFY, selectedEntity])

  const totalGrossAmount = filteredItems.reduce((sum, p) => sum + (p.totalAmount || p.amount || 0), 0)
  const totalTaxableAmount = filteredItems.reduce((sum, p) => sum + (p.taxableAmount || p.amount || 0), 0)
  const totalTaxAmount = filteredItems.reduce((sum, p) => sum + (p.cgstAmount || 0) + (p.sgstAmount || 0) + (p.igstAmount || 0), 0)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (isLocked) {
      toast.error('Cannot save in locked mode', { description: 'Unlock data in Settings to make changes' })
      return
    }

    if (!selectedSupplierId) {
      toast.error('Select a supplier')
      return
    }

    const rawAmt = parseFloat(amount)
    if (!Number.isFinite(rawAmt) || rawAmt <= 0) {
      toast.error('Enter a valid amount')
      return
    }

    const noteNum = noteNo.trim() || `SDBN-${Date.now().toString().slice(-6)}`

    if (editingItem) {
      const updated: SupplierDebitNote = {
        ...editingItem,
        noteNo: noteNum,
        supplierId: selectedSupplierId,
        date,
        amount: rawAmt,
        reason,
        originalInvoiceNo: originalInvoiceNo.trim() || undefined,
        originalInvoiceDate: originalInvoiceDate || undefined,
        invoiceRef: originalInvoiceNo.trim() || undefined,
        remarks: remarks.trim() || undefined,

        // Tax Breakup
        taxableAmount: taxBreakdown.taxableAmount,
        gstRate: taxBreakdown.gstRate,
        cgstRate: taxBreakdown.cgstRate,
        cgstAmount: taxBreakdown.cgstAmount,
        sgstRate: taxBreakdown.sgstRate,
        sgstAmount: taxBreakdown.sgstAmount,
        igstRate: taxBreakdown.igstRate,
        igstAmount: taxBreakdown.igstAmount,
        roundOff: taxBreakdown.roundOff,
        totalAmount: taxBreakdown.totalAmount,
        isInterState: taxBreakdown.isInterState,
        isTaxInclusive,

        history: [
          ...(editingItem.history || []),
          {
            timestamp: new Date().toISOString(),
            action: 'updated',
            changedBy: getChangedByLabel(),
            changedByRole: getChangedByRole(),
            changes: [
              ...(editingItem.amount !== rawAmt ? [{ field: 'Amount', from: String(editingItem.amount), to: String(rawAmt) }] : []),
              ...(editingItem.supplierId !== selectedSupplierId ? [{ field: 'Supplier', from: suppliers.find(s => s.id === editingItem.supplierId)?.name || '-', to: selectedSupplier?.name || '-' }] : []),
              ...(editingItem.date !== date ? [{ field: 'Date', from: editingItem.date, to: date }] : []),
              ...((editingItem.remarks || '') !== (remarks.trim() || '') ? [{ field: 'Remarks', from: editingItem.remarks || '-', to: remarks.trim() || '-' }] : [])
            ]
          }
        ]
      }
      setDebitNotes((prev) => prev.map(p => p.id === editingItem.id ? updated : p))
      if (activeCompanyId) {
        void saveEntityRemote(activeCompanyId, 'debitNotes', updated)
      }
      toast.success('Supplier Debit Note updated')
    } else {
      const newItem: SupplierDebitNote = {
        id: crypto.randomUUID(),
        noteNo: noteNum,
        supplierId: selectedSupplierId,
        date,
        amount: rawAmt,
        reason,
        originalInvoiceNo: originalInvoiceNo.trim() || undefined,
        originalInvoiceDate: originalInvoiceDate || undefined,
        invoiceRef: originalInvoiceNo.trim() || undefined,
        remarks: remarks.trim() || undefined,
        fy: getFYFromDate(date),
        createdAt: Date.now(),

        // Tax Breakup
        taxableAmount: taxBreakdown.taxableAmount,
        gstRate: taxBreakdown.gstRate,
        cgstRate: taxBreakdown.cgstRate,
        cgstAmount: taxBreakdown.cgstAmount,
        sgstRate: taxBreakdown.sgstRate,
        sgstAmount: taxBreakdown.sgstAmount,
        igstRate: taxBreakdown.igstRate,
        igstAmount: taxBreakdown.igstAmount,
        roundOff: taxBreakdown.roundOff,
        totalAmount: taxBreakdown.totalAmount,
        isInterState: taxBreakdown.isInterState,
        isTaxInclusive,

        history: [
          {
            timestamp: new Date().toISOString(),
            action: 'created',
            changedBy: getChangedByLabel(),
            changedByRole: getChangedByRole(),
            changes: [
              { field: 'Supplier', from: '', to: selectedSupplier?.name || '-' },
              { field: 'Amount', from: '', to: String(taxBreakdown.totalAmount) },
              { field: 'Date', from: '', to: date },
              ...(remarks ? [{ field: 'Remarks', from: '', to: remarks }] : [])
            ]
          }
        ]
      }
      setDebitNotes((prev) => [...prev, newItem])
      if (activeCompanyId) {
        void saveEntityRemote(activeCompanyId, 'debitNotes', newItem)
      }
      toast.success('Supplier Debit Note created')
    }

    setOpen(false)
    resetForm()
  }

  const handleDelete = () => {
    if (isLocked || !itemToDelete) return
    setDebitNotes((prev) => prev.filter(p => p.id !== itemToDelete.id))
    if (activeCompanyId) {
      void deleteEntityRemote(activeCompanyId, 'debitNotes', itemToDelete.id)
    }
    setDeleteDialogOpen(false)
    setItemToDelete(null)
    toast.success('Supplier Debit Note deleted')
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <ArrowUDownRight className="h-6 w-6 text-rose-600" weight="duotone" />
            Supplier Debit Notes (Purchase Returns & Claims)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Issue statutory debit notes against supplier purchases for goods returns, rate differences, and shortages
          </p>
        </div>

        <Dialog open={open} onOpenChange={(v) => {
          setOpen(v)
          if (!v) resetForm()
        }}>
          <DialogTrigger asChild>
            <Button disabled={isLocked} className="bg-rose-600 hover:bg-rose-700 text-white font-bold h-9 px-5 rounded-xl text-xs shadow-md shadow-rose-600/20">
              <Plus className="mr-1.5 h-4 w-4" weight="bold" /> Issue Debit Note
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[580px] p-6 max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2 text-slate-900">
                <ArrowUDownRight className="h-5 w-5 text-rose-600" weight="bold" />
                {editingItem ? `Edit Debit Note #${editingItem.noteNo || editingItem.id}` : 'Issue Supplier Debit Note'}
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              
              {/* Row 1: Note No & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700">Debit Note No.</Label>
                  <Input
                    placeholder="SDBN-001 (Auto if blank)"
                    value={noteNo}
                    onChange={(e) => setNoteNo(e.target.value)}
                    className="h-9 text-xs font-mono font-bold"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700">Note Date *</Label>
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="h-9 text-xs font-medium"
                    required
                  />
                </div>
              </div>

              {/* Row 2: Supplier Selection */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Supplier *</Label>
                <Popover open={supplierComboboxOpen} onOpenChange={setSupplierComboboxOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={supplierComboboxOpen}
                      className="w-full h-9 justify-between text-xs bg-white border-slate-200"
                    >
                      {selectedSupplier ? (
                        <span className="font-semibold text-slate-900 truncate">
                          {selectedSupplier.name} {selectedSupplier.gstin ? `(${selectedSupplier.gstin})` : ''} - {getStateName(partyStateCode)}
                        </span>
                      ) : "Select supplier..."}
                      <CaretUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[450px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search supplier name, GSTIN, city..." className="h-9 text-xs" />
                      <CommandList className="max-h-[220px] overflow-y-auto">
                        <CommandEmpty className="py-3 text-center text-xs text-slate-500">No supplier found.</CommandEmpty>
                        <CommandGroup>
                          {suppliers.map((s) => (
                            <CommandItem
                              key={s.id}
                              value={`${s.name} ${s.gstin || ''}`}
                              onSelect={() => {
                                setSelectedSupplierId(s.id)
                                setSupplierComboboxOpen(false)
                              }}
                              className="text-xs cursor-pointer py-2 px-3 flex items-center justify-between"
                            >
                              <div className="flex items-center gap-2">
                                <Check className={cn("h-4 w-4 text-rose-600 shrink-0", selectedSupplierId === s.id ? "opacity-100" : "opacity-0")} />
                                <div>
                                  <p className="font-bold text-slate-900">{s.name}</p>
                                  <p className="text-[10px] text-slate-400">
                                    GSTIN: {s.gstin || 'Unregistered'} | State: {getStateName(s.stateCode || (s.gstin ? s.gstin.slice(0, 2) : '19'))}
                                  </p>
                                </div>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Row 3: Reason & Original Invoice Ref */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700">Statutory GST Reason *</Label>
                  <Select value={reason} onValueChange={setReason}>
                    <SelectTrigger className="h-9 text-xs bg-white font-medium">
                      <SelectValue placeholder="Select Reason" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUTORY_NOTE_REASONS.map((r) => (
                        <SelectItem key={r.code} value={r.label} className="text-xs">
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700">Original Invoice Link</Label>
                  <Popover open={invoiceComboboxOpen} onOpenChange={setInvoiceComboboxOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={invoiceComboboxOpen}
                        className="w-full h-9 justify-between text-xs bg-white font-normal truncate"
                      >
                        {originalInvoiceNo ? `Inv #${originalInvoiceNo} (${originalInvoiceDate || 'Date'})` : "Select purchase invoice (Optional)..."}
                        <CaretUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[360px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search invoice #, date..." className="h-9 text-xs" />
                        <CommandList className="max-h-[200px] overflow-y-auto">
                          <CommandEmpty className="py-3 text-center text-xs text-slate-500">
                            {selectedSupplierId ? "No purchase invoices found." : "Select a supplier first."}
                          </CommandEmpty>
                          <CommandGroup>
                            {availableInvoices.map((inv) => (
                              <CommandItem
                                key={inv.id}
                                value={`Invoice #${inv.invoiceNo} ${inv.invoiceDate} ${inv.invoiceAmount}`}
                                onSelect={() => {
                                  setOriginalInvoiceNo(inv.invoiceNo)
                                  setOriginalInvoiceDate(inv.invoiceDate)
                                  setInvoiceComboboxOpen(false)
                                }}
                                className="text-xs cursor-pointer py-2 px-3 flex items-center justify-between"
                              >
                                <div>
                                  <p className="font-bold text-slate-900">Invoice #{inv.invoiceNo}</p>
                                  <p className="text-[10px] text-slate-400">Date: {inv.invoiceDate}</p>
                                </div>
                                <span className="font-mono font-bold text-slate-800 text-xs">
                                  {formatCurrency(inv.invoiceAmount)}
                                </span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Row 4: Amount, GST Rate, Treatment */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700">Amount (₹) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="h-9 text-xs font-bold font-mono text-slate-900"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700">GST Rate (%)</Label>
                  <Select value={String(gstRate)} onValueChange={(val) => setGstRate(Number(val))}>
                    <SelectTrigger className="h-9 text-xs bg-white font-bold font-mono">
                      <SelectValue placeholder="18%" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0% (Exempt / Non-GST)</SelectItem>
                      <SelectItem value="3">3% (Bullion)</SelectItem>
                      <SelectItem value="5">5% (Transport / Basic)</SelectItem>
                      <SelectItem value="12">12% (Standard Concession)</SelectItem>
                      <SelectItem value="18">18% (Standard 18%)</SelectItem>
                      <SelectItem value="28">28% (Luxury)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700">Tax Treatment</Label>
                  <div className="flex items-center gap-1 pt-0.5">
                    <Button
                      type="button"
                      variant={isTaxInclusive ? "default" : "outline"}
                      size="sm"
                      onClick={() => setIsTaxInclusive(true)}
                      className={`h-8 text-[11px] font-bold rounded-lg flex-1 ${isTaxInclusive ? 'bg-rose-600 text-white' : 'bg-white'}`}
                    >
                      Inclusive
                    </Button>
                    <Button
                      type="button"
                      variant={!isTaxInclusive ? "default" : "outline"}
                      size="sm"
                      onClick={() => setIsTaxInclusive(false)}
                      className={`h-8 text-[11px] font-bold rounded-lg flex-1 ${!isTaxInclusive ? 'bg-rose-600 text-white' : 'bg-white'}`}
                    >
                      +Tax
                    </Button>
                  </div>
                </div>
              </div>

              {/* Real-time GST Computation Card */}
              <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-rose-900">
                    Tax Breakdown ({taxBreakdown.isInterState ? 'Inter-State IGST' : 'Intra-State CGST+SGST'})
                  </span>
                  <span className="font-mono text-slate-600">
                    Taxable: <strong>{formatCurrency(taxBreakdown.taxableAmount)}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs font-mono pt-1">
                  {!taxBreakdown.isInterState ? (
                    <>
                      <div className="bg-white p-2 rounded-lg border border-rose-100 text-center">
                        <span className="text-[10px] text-slate-500 block font-sans">CGST ({taxBreakdown.cgstRate}%)</span>
                        <span className="font-bold text-rose-800">{formatCurrency(taxBreakdown.cgstAmount)}</span>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-rose-100 text-center">
                        <span className="text-[10px] text-slate-500 block font-sans">SGST ({taxBreakdown.sgstRate}%)</span>
                        <span className="font-bold text-rose-800">{formatCurrency(taxBreakdown.sgstAmount)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="col-span-2 bg-white p-2 rounded-lg border border-rose-100 text-center">
                      <span className="text-[10px] text-slate-500 block font-sans">IGST ({taxBreakdown.igstRate}%)</span>
                      <span className="font-bold text-rose-800">{formatCurrency(taxBreakdown.igstAmount)}</span>
                    </div>
                  )}

                  <div className="bg-rose-700 text-white p-2 rounded-lg text-center shadow-xs">
                    <span className="text-[10px] text-rose-100 block font-sans uppercase font-bold">Total Note</span>
                    <span className="font-extrabold text-xs">{formatCurrency(taxBreakdown.totalAmount)}</span>
                  </div>
                </div>
              </div>

              {/* Remarks */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Remarks / Reason</Label>
                <Textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Enter details for supplier debit note..."
                  className="text-xs min-h-[45px] bg-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)} className="h-9 px-4 text-xs font-semibold">
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="h-9 px-6 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs">
                  {editingItem ? 'Update Debit Note' : 'Save Debit Note'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Total Supplier Debit</p>
            <p className="text-2xl font-extrabold text-rose-600 tracking-tight">{formatCurrency(totalGrossAmount)}</p>
            <p className="text-xs text-slate-400 mt-1">{filteredItems.length} Notes in Period</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center shrink-0">
            <Calculator className="h-6 w-6" weight="duotone" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Total Taxable Adjusted</p>
            <p className="text-2xl font-extrabold text-slate-900 tracking-tight">{formatCurrency(totalTaxableAmount)}</p>
            <p className="text-xs text-slate-400 mt-1">Purchase Cost Reduction</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center shrink-0">
            <Receipt className="h-6 w-6" weight="duotone" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Input Tax Credit (ITC) Reversed</p>
            <p className="text-2xl font-extrabold text-blue-600 tracking-tight">{formatCurrency(totalTaxAmount)}</p>
            <p className="text-xs text-slate-400 mt-1">GSTR-3B Table 4(B) ITC Reversal</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shrink-0">
            <FileText className="h-6 w-6" weight="duotone" />
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-4">
        <PeriodDateFilter currentFY={currentFY} value={periodFilter} onChange={setPeriodFilter} />
        <div className="w-full sm:w-[260px]">
          <Select value={selectedEntity} onValueChange={setSelectedEntity}>
            <SelectTrigger className="h-9 text-xs bg-white">
              <SelectValue placeholder="All Suppliers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Suppliers</SelectItem>
              {suppliers.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Register Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-[#edf3fc]">
              <TableRow className="border-b border-slate-200/80">
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3">Note No / Date</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3">Supplier</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3">Reason (GSTR-2B)</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3">Original Inv Ref</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3 text-right">Taxable (₹)</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3 text-right">GST Breakup</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3 text-right">Total Amount (₹)</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-xs text-slate-500">
                    No supplier debit notes found for the selected period.
                  </TableCell>
                </TableRow>
              ) : (
                filteredItems.map((item) => {
                  const entity = suppliers.find(s => s.id === item.supplierId)
                  const isAuto = Boolean(item.isAutoGenerated || item.id.startsWith('debit-note-pr-') || item.sourceType === 'purchase_return')
                  const gross = item.totalAmount || item.amount || 0
                  const taxable = item.taxableAmount || item.amount || 0
                  const tax = (item.cgstAmount || 0) + (item.sgstAmount || 0) + (item.igstAmount || 0)

                  return (
                    <TableRow key={item.id} className="hover:bg-slate-50/80 border-b border-slate-100">
                      <TableCell>
                        <div className="flex flex-col text-xs">
                          <span className="font-mono font-bold text-slate-900">{item.noteNo || 'SDBN-Auto'}</span>
                          <span className="text-[10px] text-slate-500">{format(parseISO(item.date), 'dd MMM yyyy')}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{entity?.name || 'Unknown'}</span>
                          {isAuto && (
                            <span className="inline-flex items-center rounded-md bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-bold text-rose-700 border border-rose-500/20">
                              Auto (PR)
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        <Badge variant="outline" className="text-[10px] font-semibold bg-slate-50 border-slate-200">
                          {item.reason || 'Purchase Return'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-slate-600">
                        {item.originalInvoiceNo || item.invoiceRef ? (
                          <span>#{item.originalInvoiceNo || item.invoiceRef}</span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-700">
                        {formatCurrency(taxable)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {tax > 0 ? (
                          <div className="flex flex-col items-end">
                            <span className="font-bold text-rose-700">+{formatCurrency(tax)}</span>
                            <span className="text-[9px] text-slate-400 font-sans">
                              {item.isInterState ? `IGST ${item.gstRate || 18}%` : `CGST+SGST ${item.gstRate || 18}%`}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">0% GST</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono font-extrabold text-rose-600 text-xs">
                        {formatCurrency(gross)}
                      </TableCell>
                      <TableCell className="text-right">
                        <ThreeDotDropdown
                          onEdit={() => handleStartEdit(item)}
                          onDelete={() => {
                            setItemToDelete(item)
                            setDeleteDialogOpen(true)
                          }}
                          history={item.history}
                          entityType="Debit Note"
                          isLocked={isLocked || isAuto}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Supplier Debit Note</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this supplier debit note? This action cannot be undone and will restore supplier outstanding balance.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
