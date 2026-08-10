import { useState, useMemo } from 'react'
import { PurchaseReturn, Supplier, Item, InvoiceItem, SupplierDebitNote } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, CaretLeft, Plus, PencilSimple, Trash, MagnifyingGlass, Barcode, Package, UserPlus, X, FileText, Check, Receipt, Wallet, TrendUp, SlidersHorizontal } from '@phosphor-icons/react'
import { formatCurrency, formatMT, getFYMonths, getFYFromDate, calculateRateWithGst, calculateBasicRateFromInclusive, calculateInvoiceFinalAmount, calculateInvoiceItemsTotals } from '@/lib/calculations'
import { toBaseQuantity, getInvoiceQtyForUnit } from '@/lib/unit-conversion-service'
import { startOfMonth, endOfMonth, isWithinInterval, parseISO, format } from 'date-fns'
import { toast } from 'sonner'
import { PartyEditorDialog } from '@/components/party-editor-dialog'
import { ItemEditorDialog } from '@/components/item-editor-dialog'

interface PurchaseReturnPageProps {
  purchaseReturns: PurchaseReturn[]
  setPurchaseReturns: (updater: (prev: PurchaseReturn[]) => PurchaseReturn[]) => void
  suppliers: Supplier[]
  setSuppliers?: (updater: (prev: Supplier[]) => Supplier[]) => void
  items: Item[]
  setItems?: (updater: (prev: Item[]) => Item[]) => void
  debitNotes?: SupplierDebitNote[]
  setDebitNotes?: (updater: (prev: SupplierDebitNote[]) => SupplierDebitNote[]) => void
  currentFY: string
  isLocked?: boolean
  gstPercentage?: number
}

export default function PurchaseReturnPage({
  purchaseReturns,
  setPurchaseReturns,
  suppliers,
  setSuppliers,
  items,
  setItems,
  debitNotes = [],
  setDebitNotes,
  currentFY,
  isLocked = false,
  gstPercentage = 18
}: PurchaseReturnPageProps) {
  const [open, setOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<PurchaseReturn | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<PurchaseReturn | null>(null)
  
  // List Filters
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState<string>('all')

  const filteredReturns = useMemo(() => {
    let result = purchaseReturns
    
    if (fromDate) {
      result = result.filter(p => p.returnDate >= fromDate)
    }
    if (toDate) {
      result = result.filter(p => p.returnDate <= toDate)
    }
    
    if (selectedSupplierFilter !== 'all') {
      result = result.filter(p => p.supplierId === selectedSupplierFilter)
    }
    
    return result.sort((a, b) => new Date(b.returnDate).getTime() - new Date(a.returnDate).getTime())
  }, [purchaseReturns, fromDate, toDate, selectedSupplierFilter])
  
  const totalAmount = filteredReturns.reduce((sum, p) => sum + p.amount, 0)
  const totalQuantityMT = filteredReturns.reduce((sum, p) => sum + getInvoiceQtyForUnit(p, 'MT', items), 0)

  // Form State
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('')
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false)
  const [supplierSearch, setSupplierSearch] = useState('')
  const [returnNo, setReturnNo] = useState<string>('')
  const [returnDate, setReturnDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
  const [returnItems, setReturnItems] = useState<InvoiceItem[]>([])
  const [additionalCost, setAdditionalCost] = useState<number>(0)
  const [roundOffAdjustment, setRoundOffAdjustment] = useState<number>(0)
  const [remarks, setRemarks] = useState<string>('')

  // Item Picker Modal state
  const [itemPickerOpen, setItemPickerOpen] = useState(false)
  const [itemSearch, setItemSearch] = useState('')
  const [selectedItemCategory, setSelectedItemCategory] = useState('all')
  const [pickerQuantities, setPickerQuantities] = useState<Record<string, number>>({})
  const [pickerUnits, setPickerUnits] = useState<Record<string, string>>({})

  // Quick party/item dialogs
  const [showQuickSupplier, setShowQuickSupplier] = useState(false)
  const [showQuickItem, setShowQuickItem] = useState(false)

  const fyItems = useMemo(() => purchaseReturns.filter(p => p.fy === currentFY || (p.returnDate && getFYFromDate(p.returnDate) === currentFY)), [purchaseReturns, currentFY])
  const fyMonths = getFYMonths(currentFY)
  
  // Calculations for active form
  const itemsSubtotal = useMemo(() => {
    return returnItems.reduce((sum, item) => sum + (item.amount || 0), 0)
  }, [returnItems])

  const totalReturnMT = useMemo(() => {
    return returnItems.reduce((sum, item) => sum + ((item.baseQuantity || 0) / 1000), 0)
  }, [returnItems])

  const calculatedTotalAmount = useMemo(() => {
    return calculateInvoiceFinalAmount(itemsSubtotal, additionalCost, roundOffAdjustment)
  }, [itemsSubtotal, additionalCost, roundOffAdjustment])

  const supplierMap = new Map(suppliers.map(s => [s.id, s]))
  const selectedSupplier = selectedSupplierId ? supplierMap.get(selectedSupplierId) : undefined

  const filteredSuppliers = suppliers.filter((supplier) => {
    const query = supplierSearch.trim().toLowerCase()
    if (!query) return true
    return [supplier.name, supplier.phone, supplier.gstin]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query))
  })

  const filteredPickerItems = useMemo(() => {
    const query = itemSearch.trim().toLowerCase()
    return items
      .filter(item => {
        if (selectedItemCategory !== 'all' && item.category !== selectedItemCategory) return false
        if (!query) return true
        return [
          item.name,
          item.itemCode,
          item.category,
          item.description,
          item.unit
        ].some(value => (value || '').toLowerCase().includes(query))
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [itemSearch, items, selectedItemCategory])

  const updatePickerQuantity = (itemId: string, nextQuantity: number | null) => {
    setPickerQuantities((prev) => {
      const updated = { ...prev }
      if (nextQuantity === null) {
        delete updated[itemId]
      } else {
        const quantity = Math.max(0, Number.isFinite(nextQuantity) ? nextQuantity : 0)
        updated[itemId] = quantity
      }
      return updated
    })
  }

  const updatePickerUnit = (itemId: string, unit: string) => {
    setPickerUnits((prev) => ({ ...prev, [itemId]: unit }))
  }

  const resetItemPicker = () => {
    setItemSearch('')
    setSelectedItemCategory('all')
    setPickerQuantities({})
    setPickerUnits({})
  }

  const handleAddSelectedItemToBill = () => {
    const newItems: InvoiceItem[] = []

    Object.entries(pickerQuantities).forEach(([itemId, rawQty]) => {
      if (rawQty > 0) {
        const item = items.find(i => i.id === itemId)
        const rate = item?.purchasePrice || 0
        const defaultUnit = item?.unit || 'KG'
        const activeUnit = pickerUnits[itemId] || defaultUnit
        const enteredQuantity = rawQty
        const baseQuantity = item ? toBaseQuantity(item, rawQty, activeUnit) : rawQty

        newItems.push({
          itemId,
          enteredQuantity,
          enteredUnit: activeUnit,
          baseQuantity,
          rate,
          amount: parseFloat((enteredQuantity * rate).toFixed(2))
        })
      }
    })

    if (newItems.length > 0) {
      setReturnItems(prev => {
        const prevCopy = [...prev]
        newItems.forEach(newItem => {
          const idx = prevCopy.findIndex(x => x.itemId === newItem.itemId)
          if (idx !== -1) {
            const existing = prevCopy[idx]
            const updatedEnteredQty = (existing.enteredQuantity || 0) + newItem.enteredQuantity
            const updatedBaseQty = (existing.baseQuantity || 0) + newItem.baseQuantity
            prevCopy[idx] = {
              ...existing,
              enteredQuantity: updatedEnteredQty,
              enteredUnit: newItem.enteredUnit,
              baseQuantity: updatedBaseQty,
              amount: parseFloat((updatedEnteredQty * existing.rate).toFixed(2))
            }
          } else {
            prevCopy.push(newItem)
          }
        })
        return prevCopy
      })
    }

    setItemPickerOpen(false)
    resetItemPicker()
  }

  const handleOpenAdd = () => {
    if (isLocked) {
      toast.error('Cannot add in locked mode')
      return
    }
    setEditingItem(null)
    setSelectedSupplierId('')
    setSupplierSearch('')
    setReturnNo(`PR-${Date.now().toString().slice(-6)}`)
    setReturnDate(format(new Date(), 'yyyy-MM-dd'))
    setReturnItems([])
    setAdditionalCost(0)
    setRoundOffAdjustment(0)
    setRemarks('')
    setOpen(true)
  }

  const handleOpenEdit = (item: PurchaseReturn) => {
    if (isLocked) {
      toast.error('Cannot edit in locked mode')
      return
    }
    setEditingItem(item)
    setSelectedSupplierId(item.supplierId)
    setSupplierSearch('')
    setReturnNo(item.returnNo || item.invoiceRef || '')
    setReturnDate(item.returnDate)
    setReturnItems(item.items || [])
    setAdditionalCost(item.additionalCost || 0)
    setRoundOffAdjustment(item.roundOffAdjustment || 0)
    setRemarks(item.remarks || '')
    setOpen(true)
  }

  const handleUpdateLineItem = (index: number, field: string, value: any) => {
    setReturnItems(prev => prev.map((itemRow, idx) => {
      if (idx !== index) return itemRow
      const selectedDef = items.find(i => i.id === (field === 'itemId' ? value : itemRow.itemId))
      const updated = { ...itemRow, [field]: value }
      
      if (field === 'itemId') {
        const defaultUnit = selectedDef?.unit || 'KG'
        updated.enteredUnit = defaultUnit
        if (selectedDef && selectedDef.purchasePrice) {
          updated.rate = selectedDef.purchasePrice
        }
      }

      if (field === 'enteredQuantity' || field === 'entryQuantity') {
        const numVal = Number(value) || 0
        updated.enteredQuantity = numVal
        const activeUnit = updated.enteredUnit || selectedDef?.unit || 'KG'
        updated.baseQuantity = toBaseQuantity(selectedDef, numVal, activeUnit)
      } else if (field === 'enteredUnit' || field === 'entryUnit') {
        updated.enteredUnit = value as string
        const activeUnit = updated.enteredUnit
        const numVal = updated.enteredQuantity || 0
        updated.baseQuantity = toBaseQuantity(selectedDef, numVal, activeUnit)
      } else if (field === 'basicRate') {
        const basicRate = Number(value) || 0
        const itemGstPct = selectedDef?.gstRate || gstPercentage
        updated.basicRate = basicRate
        updated.rate = calculateRateWithGst(basicRate, itemGstPct)
      } else if (field === 'rate') {
        const rateWithTax = Number(value) || 0
        const itemGstPct = selectedDef?.gstRate || gstPercentage
        updated.rate = rateWithTax
        updated.basicRate = calculateBasicRateFromInclusive(rateWithTax, itemGstPct)
      }

      const qty = updated.enteredQuantity || 0
      const rate = Number(updated.rate) || 0
      updated.amount = parseFloat((qty * rate).toFixed(2))
      return updated
    }))
  }

  const handleRemoveLineItem = (index: number) => {
    setReturnItems(prev => prev.filter((_, idx) => idx !== index))
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    
    if (isLocked) {
      toast.error('Cannot save in locked mode')
      return
    }

    if (!selectedSupplierId) {
      toast.error('Select a supplier before saving')
      return
    }

    if (returnItems.length === 0) {
      toast.error('Please add at least one item to return')
      return
    }



    const returnId = editingItem ? editingItem.id : `pr-${Date.now()}`
    const finalReturnNo = returnNo.trim() || `PR-${Date.now().toString().slice(-6)}`
    const sanitizedReturnItems: InvoiceItem[] = returnItems.map(item => ({
      itemId: item.itemId,
      enteredQuantity: item.enteredQuantity,
      enteredUnit: item.enteredUnit,
      baseQuantity: item.baseQuantity,
      rate: item.rate,
      amount: item.amount,
      basicRate: item.basicRate,
      baseRate: item.baseRate,
      enteredRate: item.enteredRate
    }))

    const purchaseReturnRecord: PurchaseReturn = {
      id: returnId,
      supplierId: selectedSupplierId,
      returnNo: finalReturnNo,
      returnDate,
      amount: calculatedTotalAmount,
      items: sanitizedReturnItems,
      additionalCost,
      roundOffAdjustment,
      invoiceRef: finalReturnNo,
      remarks,
      fy: getFYFromDate(returnDate),
      createdAt: editingItem?.createdAt || Date.now()
    }

    // Auto-create / update Supplier Debit Note
    const debitNoteId = `debit-note-pr-${returnId}`
    const debitNoteRecord: SupplierDebitNote = {
      id: debitNoteId,
      supplierId: selectedSupplierId,
      date: returnDate,
      amount: calculatedTotalAmount,
      invoiceRef: finalReturnNo,
      remarks: `Purchase Return #${finalReturnNo}${remarks ? ' - ' + remarks : ''}`,
      fy: getFYFromDate(returnDate),
      createdAt: Date.now(),
      isAutoGenerated: true,
      sourceType: 'purchase_return',
      sourceId: returnId
    }

    // Save Purchase Return
    setPurchaseReturns(prev => {
      const exists = prev.some(p => p.id === returnId)
      return exists ? prev.map(p => p.id === returnId ? purchaseReturnRecord : p) : [...prev, purchaseReturnRecord]
    })

    // Auto-save Debit Note
    if (setDebitNotes) {
      setDebitNotes(prev => {
        const exists = prev.some(d => d.id === debitNoteId)
        return exists ? prev.map(d => d.id === debitNoteId ? debitNoteRecord : d) : [...prev, debitNoteRecord]
      })
    }

    toast.success(editingItem ? 'Purchase Return & Debit Note updated' : 'Purchase Return & Debit Note created', {
      description: `Items deducted from inventory. Debit Note of ${formatCurrency(calculatedTotalAmount)} auto-generated.`
    })

    setOpen(false)
    setEditingItem(null)
  }

  const handleDelete = () => {
    if (isLocked || !itemToDelete) return
    const returnId = itemToDelete.id
    const debitNoteId = `debit-note-pr-${returnId}`

    setPurchaseReturns(prev => prev.filter(p => p.id !== returnId))
    if (setDebitNotes) {
      setDebitNotes(prev => prev.filter(d => d.id !== debitNoteId))
    }

    setDeleteDialogOpen(false)
    setItemToDelete(null)
    toast.success('Purchase Return & associated Debit Note deleted')
  }

  return (
    <div className="space-y-6 pb-12">
      {!open ? (
        <>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full text-slate-700 hover:bg-slate-200/60"
              >
                <CaretLeft className="h-5 w-5" weight="bold" />
              </Button>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Purchase Returns</h1>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
            {/* Card 1: Total Return Records */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Total Return Records</p>
                <p className="text-3xl font-extrabold text-slate-900 tracking-tight">{filteredReturns.length}</p>
                <p className="text-xs font-semibold text-blue-600 flex items-center gap-1 mt-2">
                  <TrendUp className="h-3.5 w-3.5" weight="bold" /> 0% from last month
                </p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100/60 flex items-center justify-center shrink-0">
                <Receipt className="h-6 w-6" weight="duotone" />
              </div>
            </div>

            {/* Card 3: Total Return Value */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Total Return Value</p>
                <p className="text-3xl font-extrabold text-slate-900 tracking-tight">{formatCurrency(totalAmount)}</p>
                <p className="text-xs font-normal text-slate-400 mt-2">Reflects auto-created debit notes</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100/60 flex items-center justify-center shrink-0">
                <Wallet className="h-6 w-6" weight="duotone" />
              </div>
            </div>
          </div>

          {/* List Register Container */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
            {/* Card Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#0256e8] flex items-center justify-center">
                  <Receipt className="h-5 w-5" weight="duotone" />
                </div>
                <h2 className="text-lg font-bold text-slate-900">Purchase Return List</h2>
              </div>
              <Button onClick={handleOpenAdd} disabled={isLocked} className="bg-[#0256e8] hover:bg-[#0046cd] text-white font-semibold rounded-xl px-4 py-2.5 shadow-2xs flex items-center gap-2">
                <Plus className="h-4 w-4" weight="bold" />
                Add Purchase Return
              </Button>
            </div>

            {/* Filter Sub-bar */}
            <div className="px-5 py-3.5 bg-slate-50/70 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <SlidersHorizontal className="h-4 w-4" weight="bold" />
                  <span>Filters:</span>
                </div>

                <div className="flex items-center gap-2">
                  <Select value={selectedSupplierFilter} onValueChange={setSelectedSupplierFilter}>
                    <SelectTrigger className="w-48 h-9 bg-white border-slate-200 text-xs font-medium rounded-xl">
                      <span className="text-slate-400 mr-1">Supplier:</span>
                      <SelectValue placeholder="All Suppliers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Suppliers</SelectItem>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium">From:</span>
                  <Input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="w-36 h-9 bg-white border-slate-200 text-xs font-medium rounded-xl"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium">To:</span>
                  <Input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="w-36 h-9 bg-white border-slate-200 text-xs font-medium rounded-xl"
                  />
                </div>
              </div>

              <span className="bg-slate-100 text-slate-700 text-xs font-semibold px-3 py-1 rounded-full border border-slate-200/60">
                {filteredReturns.length} returns found
              </span>
            </div>

            {/* Table */}
            <Table>
              <TableHeader className="bg-[#edf3fc]">
                <TableRow className="border-b border-slate-200/80 hover:bg-transparent">
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3.5">DATE</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3.5">RETURN / REF NO</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3.5">SUPPLIER</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3.5">STATUS</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3.5 text-right">RETURN AMOUNT</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3.5 text-right">ACTIONS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReturns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-16 text-center">
                      <div className="max-w-sm mx-auto space-y-3">
                        <div className="w-16 h-16 rounded-full bg-blue-50 text-[#0256e8] flex items-center justify-center mx-auto border border-blue-100 shadow-2xs">
                          <Receipt size={32} weight="duotone" />
                        </div>
                        <h3 className="text-base font-bold text-slate-900">No purchase returns found</h3>
                        <p className="text-xs text-slate-500">
                          No purchase returns recorded for this period. Add your first return to get started.
                        </p>
                        <button
                          onClick={handleOpenAdd}
                          disabled={isLocked}
                          className="inline-flex items-center gap-1.5 text-sm font-bold text-[#0256e8] hover:underline pt-2"
                        >
                          <Plus className="h-4 w-4" weight="bold" />
                          Create First Return
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredReturns.map(item => {
                    const supplier = suppliers.find(s => s.id === item.supplierId)
                    return (
                      <TableRow key={item.id} className="hover:bg-slate-50/80 border-b border-slate-100">
                        <TableCell className="text-slate-600 text-xs font-medium">{item.returnDate}</TableCell>
                        <TableCell className="font-mono font-bold text-slate-900 text-sm">{item.returnNo || item.invoiceRef || '-'}</TableCell>
                        <TableCell className="font-semibold text-slate-800 text-sm">{supplier?.name || 'Unknown'}</TableCell>
                        <TableCell>
                          <span className="bg-purple-50 text-purple-700 text-xs font-bold px-3 py-1 rounded-full border border-purple-200/60 inline-block">
                            Debit Note Generated
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-emerald-600 text-sm">
                          {formatCurrency(item.amount)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(item)} disabled={isLocked} className="h-8 w-8 p-0 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg">
                              <PencilSimple className="h-4 w-4" weight="bold" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => { setItemToDelete(item); setDeleteDialogOpen(true) }} disabled={isLocked} className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg">
                              <Trash className="h-4 w-4" weight="bold" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>

            {/* Table Footer */}
            <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium bg-white">
              <div>Showing 0 to {filteredReturns.length} of {filteredReturns.length} entries</div>
              <div className="flex items-center gap-1">
                <button className="h-7 w-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 disabled:opacity-50" disabled>‹</button>
                <button className="h-7 w-7 rounded-lg bg-[#0256e8] text-white font-bold flex items-center justify-center">1</button>
                <button className="h-7 w-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 disabled:opacity-50" disabled>›</button>
              </div>
            </div>
          </div>

          {/* Floating Plus Button */}
          <button
            onClick={handleOpenAdd}
            disabled={isLocked}
            className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-[#0256e8] text-white shadow-lg flex items-center justify-center z-40 hover:scale-105 transition-transform"
            title="Add Purchase Return"
          >
            <Plus className="h-6 w-6" weight="bold" />
          </button>
        </>
      ) : (
        /* If form is OPEN, render FULL PAGE Shell view exactly like InvoicesPage! */
        <div className="erp-invoice-page-shell">
          <form onSubmit={handleSubmit} className="erp-invoice-form erp-invoice-page-form">
            {/* Top Bar Header */}
            <div className="erp-invoice-page-header">
              <div className="flex min-w-0 items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-full"
                  onClick={() => setOpen(false)}
                  aria-label="Back to purchase returns"
                >
                  <ArrowLeft size={24} />
                </Button>
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-semibold">
                    {editingItem ? 'Edit Purchase Return' : 'Create Purchase Return'}
                  </h2>
                  <p className="text-sm text-muted-foreground">Return goods to supplier and auto-generate Debit Note</p>
                </div>
              </div>
              <div className="erp-reference-actions flex items-center gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="erp-save-button" disabled={returnItems.length === 0}>
                  {editingItem ? 'Update Return & Debit Note' : 'Save Return & Debit Note'}
                </Button>
              </div>
            </div>

            {/* Main Form Body */}
            <div className="erp-invoice-body erp-invoice-page-body space-y-6">
              {/* Panel 1: Bill From / Return To Supplier */}
              <div className="erp-form-panel">
                <h3 className="erp-section-title">Return To Supplier</h3>
                <div className="erp-responsive-grid">
                  <div className="erp-party-picker-field">
                    <input type="hidden" name="supplierId" value={selectedSupplierId} />
                    {!supplierPickerOpen && selectedSupplier ? (
                        <div className="flex items-center justify-between p-3.5 bg-[#5B5FEF]/10 border-2 border-[#5B5FEF] rounded-2xl shadow-sm">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-[#5B5FEF] text-white flex items-center justify-center font-extrabold text-sm shrink-0 shadow-sm">
                              {selectedSupplier.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-extrabold text-slate-900 truncate">
                                {selectedSupplier.name}
                              </div>
                              <div className="text-xs font-bold text-[#5B5FEF]">
                                Balance: {formatCurrency(selectedSupplier.openingBalance || 0)}
                              </div>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSupplierPickerOpen(true)
                              setSupplierSearch('')
                            }}
                            className="h-8 px-3 text-xs font-bold text-[#5B5FEF] bg-white border-[#5B5FEF]/30 hover:bg-[#5B5FEF] hover:text-white rounded-xl shadow-2xs transition-all shrink-0 ml-2"
                          >
                            Change Party
                          </Button>
                        </div>
                      ) : !supplierPickerOpen && !selectedSupplier ? (
                      <button
                        type="button"
                        className="erp-party-add-box"
                        onClick={() => setSupplierPickerOpen(true)}
                      >
                        <Plus size={18} weight="bold" />
                        Select Supplier
                      </button>
                    ) : (
                      <div className="erp-party-dropdown-card">
                        <div className="erp-party-search-row">
                          <MagnifyingGlass size={20} />
                          <input
                            id="supplierId"
                            type="text"
                            value={supplierSearch}
                            onChange={(event) => setSupplierSearch(event.target.value)}
                            onFocus={() => setSupplierPickerOpen(true)}
                            placeholder="Search supplier by name or number"
                            autoComplete="off"
                          />
                          <button
                            type="button"
                            aria-label="Toggle supplier list"
                            onClick={() => setSupplierPickerOpen(false)}
                          >
                            <span>✕</span>
                          </button>
                        </div>

                        {supplierPickerOpen && (
                          <div className="erp-party-options">
                            <div className="erp-party-options-head">
                              <span>Supplier Name</span>
                              <span>Balance</span>
                            </div>
                            {filteredSuppliers.map((supplier) => (
                              <button
                                type="button"
                                key={supplier.id}
                                className="erp-party-option"
                                onClick={() => {
                                  setSelectedSupplierId(supplier.id)
                                  setSupplierSearch('')
                                  setSupplierPickerOpen(false)
                                }}
                              >
                                <span>{supplier.name}</span>
                                <span>{formatCurrency(supplier.openingBalance || 0)}</span>
                              </button>
                            ))}
                            {setSuppliers && (
                              <button
                                type="button"
                                className="erp-party-create-option"
                                onClick={() => {
                                  setSupplierPickerOpen(false)
                                  setShowQuickSupplier(true)
                                }}
                              >
                                <Plus size={16} weight="bold" />
                                Create Supplier
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="returnNo" className="text-xs font-medium">Return / Ref Number <span className="text-destructive">*</span></Label>
                    <Input 
                      id="returnNo" 
                      value={returnNo}
                      onChange={e => setReturnNo(e.target.value)}
                      placeholder="PR-001"
                      className="h-8 bg-background text-xs font-mono"
                      required 
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="returnDate" className="text-xs font-medium">Return Date <span className="text-destructive">*</span></Label>
                    <Input 
                      id="returnDate" 
                      type="date"
                      value={returnDate}
                      onChange={e => setReturnDate(e.target.value)}
                      className="h-8 bg-background text-xs"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Panel 2: Return Items Table */}
              <div id="purchase-return-items" className="space-y-2.5">
                <div className="erp-section-toolbar flex items-center justify-between">
                  <h3 className="erp-section-title">
                    Return Items <span className="text-destructive">*</span>
                  </h3>
                  <span className="text-[10px] text-muted-foreground font-medium">
                    Returned items will be automatically deducted from inventory stock
                  </span>
                </div>

                <div className="erp-reference-table-wrap border rounded-xl overflow-hidden bg-card">
                  <div className="erp-reference-item-table">
                    <div className="erp-reference-item-head">
                      <span>No</span>
                      <span>Items</span>
                      <span>HSN/ SAC</span>
                      <span>Qty</span>
                      <span>Price (excl. Tax)</span>
                      <span>Price (incl. Tax)</span>
                      <span>Discount</span>
                      <span>Tax</span>
                      <span>Amount (₹)</span>
                      <button type="button" className="erp-reference-row-plus" onClick={() => setItemPickerOpen(true)} aria-label="Add item">
                        <Plus size={22} weight="bold" />
                      </button>
                    </div>

                    {returnItems.map((lineItem, index) => {
                      const selectedItem = items.find(i => i.id === lineItem.itemId)
                      return (
                        <div className="erp-reference-item-row" key={index}>
                          <span className="erp-reference-row-number">{index + 1}</span>
                          <Select value={lineItem.itemId} onValueChange={(val) => handleUpdateLineItem(index, 'itemId', val)}>
                            <SelectTrigger className="erp-reference-cell-input">
                              <SelectValue placeholder="Select an item" />
                            </SelectTrigger>
                            <SelectContent>
                              {items.map(item => (
                                <SelectItem key={item.id} value={item.id}>
                                  {item.name} ({item.unit})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input value="-" disabled className="erp-reference-cell-input text-center" />
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              step="0.001"
                              min="0"
                              value={lineItem.enteredQuantity ?? (lineItem as any).entryQuantity ?? ''}
                              onChange={(e) => handleUpdateLineItem(index, 'enteredQuantity', e.target.value)}
                              placeholder="0"
                              className="erp-reference-cell-input font-mono text-right flex-1 min-w-[70px]"
                            />
                            {(() => {
                              const sel = items.find(i => i.id === lineItem.itemId)
                              const activeUnit = lineItem.enteredUnit || (lineItem as any).entryUnit || sel?.unit || 'KG'
                              return (
                                <select
                                  value={activeUnit}
                                  onChange={(e) => handleUpdateLineItem(index, 'enteredUnit', e.target.value)}
                                  className="text-xs font-bold font-mono bg-slate-100 border border-slate-300 rounded px-1 py-1 text-slate-800 focus:outline-none"
                                >
                                  <option value={sel?.unit || 'KG'}>{sel?.unit || 'KG'}</option>
                                  {sel?.alternativeUnit && sel.alternativeUnit !== 'NONE' && (
                                    <option value={sel.alternativeUnit}>{sel.alternativeUnit}</option>
                                  )}
                                </select>
                              )
                            })()}
                          </div>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={lineItem.basicRate || ''}
                            onChange={(e) => handleUpdateLineItem(index, 'basicRate', e.target.value)}
                            placeholder="Excl. Tax"
                            className="erp-reference-cell-input font-mono text-right"
                          />
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={lineItem.rate || ''}
                            onChange={(e) => handleUpdateLineItem(index, 'rate', e.target.value)}
                            placeholder="Incl. Tax"
                            className="erp-reference-cell-input font-mono text-right font-bold text-blue-900 bg-blue-50/50 border-blue-200"
                          />
                          <Input value="-" disabled className="erp-reference-cell-input text-center" />
                          <Input value={`GST @ ${selectedItem?.gstRate || gstPercentage}%`} disabled className="erp-reference-cell-input text-center" />
                          <Input value={formatCurrency(lineItem.amount || 0)} disabled className="erp-reference-cell-input font-mono text-right" />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="erp-reference-remove-row text-destructive"
                            onClick={() => handleRemoveLineItem(index)}
                            aria-label="Remove item"
                          >
                            <X size={16} weight="bold" />
                          </Button>
                        </div>
                      )
                    })}

                    <div className="erp-reference-add-item-row p-2">
                      <button type="button" className="erp-reference-add-item-dashed" onClick={() => setItemPickerOpen(true)}>
                        <Plus size={18} weight="bold" />
                        Add Item to Return
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Panel 3: Footer Sections (Remarks & Totals) */}
              <div className="erp-invoice-reference-footer grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4 border-t">
                {/* Column 1: Remarks / Notes */}
                <div className="erp-footer-col">
                  <div className="erp-footer-section">
                    <div className="erp-footer-section-header flex items-center gap-2 mb-2">
                      <FileText size={20} weight="fill" className="text-primary" />
                      <div>
                        <h3 className="font-semibold text-sm">Return Notes & Remarks</h3>
                        <p className="text-xs text-muted-foreground">Specify reason for return or notes for supplier.</p>
                      </div>
                    </div>
                    <div className="erp-footer-section-content">
                      <Textarea 
                        value={remarks} 
                        onChange={(e) => setRemarks(e.target.value)} 
                        placeholder="Enter return notes or reasons..." 
                        rows={5}
                      />
                    </div>
                  </div>
                </div>

                {/* Column 2: Additional Charges & Totals Box */}
                <div className="erp-footer-col">
                  <div className="bg-muted/40 p-5 rounded-xl border space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground font-medium">Total Items Quantity:</span>
                      <span className="font-semibold font-mono">{formatMT(totalReturnMT)}</span>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground font-medium">Items Subtotal:</span>
                      <span className="font-semibold font-mono">{formatCurrency(itemsSubtotal)}</span>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground font-medium">Additional Costs:</span>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">₹</span>
                        <Input
                          type="number"
                          step="0.01"
                          className="h-8 w-28 text-right font-mono text-sm bg-background"
                          value={additionalCost || ''}
                          onChange={e => setAdditionalCost(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground font-medium">Round-Off Adjustment:</span>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">₹</span>
                        <Input
                          type="number"
                          step="0.01"
                          className="h-8 w-28 text-right font-mono text-sm bg-background"
                          value={roundOffAdjustment || ''}
                          onChange={e => setRoundOffAdjustment(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    </div>

                    <div className="border-t pt-3 mt-2 flex items-center justify-between">
                      <span className="font-bold text-base text-foreground">Total Return Amount:</span>
                      <span className="font-extrabold text-xl text-emerald-600 dark:text-emerald-400 font-mono tracking-tight">
                        {formatCurrency(calculatedTotalAmount)}
                      </span>
                    </div>

                    <p className="text-[11px] text-muted-foreground pt-1 border-t border-dashed">
                      Note: Saving this return will auto-create/update a Debit Note of <span className="font-semibold text-foreground">{formatCurrency(calculatedTotalAmount)}</span>.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Item Picker Modal Dialog */}
      <Dialog
        open={itemPickerOpen}
        onOpenChange={(nextOpen) => {
          setItemPickerOpen(nextOpen)
          if (!nextOpen) resetItemPicker()
        }}
      >
        <DialogContent
          className="erp-item-picker-dialog max-h-[85vh] p-0"
          style={{ width: 'min(1100px, calc(100vw - 2rem))', maxWidth: 'min(1100px, calc(100vw - 2rem))' }}
        >
          <DialogHeader className="erp-item-picker-header border-b border-border px-6 py-5">
            <DialogTitle className="erp-item-picker-title text-xl font-bold">Add Return Items</DialogTitle>
          </DialogHeader>

          <div className="erp-item-picker-body space-y-4 px-6 py-5">
            <div className="erp-item-picker-toolbar grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
              <div className="erp-item-picker-search relative">
                <MagnifyingGlass size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={itemSearch}
                  onChange={(event) => setItemSearch(event.target.value)}
                  placeholder="Search by Item name / code / category"
                  className="erp-item-picker-input h-11 pl-10 pr-10"
                />
                <Barcode size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              </div>
              <Select value={selectedItemCategory} onValueChange={setSelectedItemCategory}>
                <SelectTrigger className="erp-item-picker-category h-11">
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {[...new Set(items.map(item => item.category).filter(Boolean))].map(category => (
                    <SelectItem key={category} value={category!}>{category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {setItems && (
                <Button type="button" className="erp-item-picker-create h-11" onClick={() => setShowQuickItem(true)}>
                  Create New Item
                </Button>
              )}
            </div>

            <div className="erp-item-picker-table-card overflow-hidden rounded-xl border border-border">
              <div className="erp-item-picker-table-scroll max-h-[400px] overflow-y-auto">
                <Table className="erp-item-picker-table">
                  <TableHeader className="erp-item-picker-table-head sticky top-0 z-10 bg-muted">
                    <TableRow>
                      <TableHead className="w-[30%]">Item Name</TableHead>
                      <TableHead className="w-[15%]">Item Code</TableHead>
                      <TableHead className="text-right w-[15%]">Stock</TableHead>
                      <TableHead className="text-right w-[18%]">Purchase Price</TableHead>
                      <TableHead className="text-right w-[22%] min-w-[180px]">Return Quantity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPickerItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-48 text-center text-muted-foreground">
                          No items found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPickerItems.map(item => {
                        const pickerQuantity = pickerQuantities[item.id] !== undefined ? pickerQuantities[item.id] : 0
                        const isSelected = pickerQuantities[item.id] !== undefined
                        const defaultUnit = item.unit || 'MT'
                        const activeUnit = pickerUnits[item.id] || defaultUnit

                        return (
                          <TableRow
                            key={item.id}
                            className={isSelected ? 'erp-item-picker-row is-selected bg-primary/10' : 'erp-item-picker-row'}
                          >
                            <TableCell className="font-medium">{item.name}</TableCell>
                            <TableCell>{item.itemCode || '-'}</TableCell>
                            <TableCell className="text-right font-mono">{item.openingStock ?? 0} {item.unit}</TableCell>
                            <TableCell className="text-right font-mono">{item.purchasePrice ? formatCurrency(item.purchasePrice) : '-'}</TableCell>
                            <TableCell className="text-right">
                              {isSelected ? (
                                <div className="inline-flex items-center justify-end gap-1 bg-slate-100/90 p-0.5 rounded-lg border border-slate-200 shrink-0">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-slate-600 hover:bg-white hover:text-slate-900 rounded-md shrink-0"
                                    onClick={() => updatePickerQuantity(item.id, pickerQuantity <= 1 ? null : pickerQuantity - 1)}
                                  >
                                    -
                                  </Button>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.001"
                                    value={pickerQuantity}
                                    onChange={(event) => updatePickerQuantity(item.id, event.target.value === '' ? 0 : parseFloat(event.target.value))}
                                    className="h-7 w-14 px-1 text-center font-mono text-xs bg-white border-0 shadow-none focus-visible:ring-0 font-bold"
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-slate-600 hover:bg-white hover:text-slate-900 rounded-md shrink-0"
                                    onClick={() => updatePickerQuantity(item.id, pickerQuantity + 1)}
                                  >
                                    +
                                  </Button>
                                  {item.alternativeUnit && item.alternativeUnit !== 'NONE' ? (
                                    <select
                                      value={activeUnit}
                                      onChange={(e) => updatePickerUnit(item.id, e.target.value)}
                                      className="h-7 text-xs font-bold font-mono bg-white border border-slate-200 rounded-md px-1 text-slate-800 focus:outline-none cursor-pointer ml-0.5"
                                    >
                                      <option value={item.unit}>{item.unit}</option>
                                      <option value={item.alternativeUnit}>{item.alternativeUnit}</option>
                                    </select>
                                  ) : (
                                    <span className="text-xs font-bold font-mono text-slate-600 px-1.5">{item.unit}</span>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-1.5">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 px-3 text-xs font-semibold border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 shrink-0"
                                    onClick={() => {
                                      updatePickerQuantity(item.id, 1)
                                    }}
                                  >
                                    + Add
                                  </Button>
                                  {item.alternativeUnit && item.alternativeUnit !== 'NONE' ? (
                                    <select
                                      value={activeUnit}
                                      onChange={(e) => updatePickerUnit(item.id, e.target.value)}
                                      className="h-8 text-xs font-bold font-mono bg-slate-100 border border-slate-300 rounded-md px-1.5 text-slate-800 focus:outline-none cursor-pointer shrink-0"
                                    >
                                      <option value={item.unit}>{item.unit}</option>
                                      <option value={item.alternativeUnit}>{item.alternativeUnit}</option>
                                    </select>
                                  ) : (
                                    <span className="text-xs font-bold font-mono text-slate-500 min-w-[32px] text-left">{item.unit}</span>
                                  )}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          <div className="erp-item-picker-footer flex items-center justify-between border-t border-border px-6 py-4">
            <div className="erp-item-picker-selected-count text-sm text-primary font-medium">
              {Object.values(pickerQuantities).filter((quantity) => quantity > 0).length} Item(s) Selected
            </div>
            <div className="erp-item-picker-actions flex gap-3">
              <Button type="button" variant="outline" onClick={() => {
                setItemPickerOpen(false)
                resetItemPicker()
              }}>
                Cancel
              </Button>
              <Button type="button" onClick={handleAddSelectedItemToBill} disabled={Object.values(pickerQuantities).every((quantity) => quantity <= 0)}>
                Add to Return
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Purchase Return?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this purchase return record AND automatically delete its associated Debit Note. Inventory stock will be restored.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Quick Add Supplier Dialog */}
      {setSuppliers && (
        <PartyEditorDialog
          open={showQuickSupplier}
          onOpenChange={setShowQuickSupplier}
          type="supplier"
          onSave={newSupplier => {
            setSuppliers(prev => [...prev, newSupplier as Supplier])
            setSelectedSupplierId(newSupplier.id)
            toast.success(`Supplier "${newSupplier.name}" added`)
          }}
        />
      )}

      {/* Quick Add Item Dialog */}
      {setItems && (
        <ItemEditorDialog
          open={showQuickItem}
          onOpenChange={setShowQuickItem}
          onSave={newItem => {
            setItems(prev => [...prev, newItem])
            toast.success(`Item "${newItem.name}" added`)
          }}
        />
      )}
    </div>
  )
}
