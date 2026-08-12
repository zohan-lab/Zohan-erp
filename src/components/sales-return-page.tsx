import { getChangedByLabel } from '@/lib/security-utils'
import { useState, useMemo } from 'react'
import { SalesReturn, Customer, Item, InvoiceItem, CustomerCreditNote } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, CaretLeft, Plus, PencilSimple, Trash, MagnifyingGlass, Barcode, Package, UserPlus, X, FileText, Check, Receipt, Wallet, TrendUp, SlidersHorizontal, Funnel, ArrowSquareOut, CalendarBlank } from '@phosphor-icons/react'
import { formatCurrency, formatMT, getFYMonths, getFYFromDate, calculateRateWithGst, calculateBasicRateFromInclusive, calculateInvoiceFinalAmount } from '@/lib/calculations'
import { toBaseQuantity } from '@/lib/unit-conversion-service'
import { startOfMonth, endOfMonth, isWithinInterval, parseISO, format } from 'date-fns'
import { toast } from 'sonner'
import { PartyEditorDialog } from '@/components/party-editor-dialog'
import { ItemEditorDialog } from '@/components/item-editor-dialog'

import { saveEntityRemote, deleteEntityRemote } from '@/lib/firebase-storage'
import { ThreeDotDropdown } from '@/components/ui/three-dot-dropdown'

interface SalesReturnPageProps {
  salesReturns: SalesReturn[]
  setSalesReturns: (updater: (prev: SalesReturn[]) => SalesReturn[]) => void
  customers: Customer[]
  setCustomers?: (updater: (prev: Customer[]) => Customer[]) => void
  items: Item[]
  setItems?: (updater: (prev: Item[]) => Item[]) => void
  creditNotes?: CustomerCreditNote[]
  setCreditNotes?: (updater: (prev: CustomerCreditNote[]) => CustomerCreditNote[]) => void
  currentFY: string
  isLocked?: boolean
  gstPercentage?: number
  activeCompanyId?: string
}

export default function SalesReturnPage({
  salesReturns,
  setSalesReturns,
  customers,
  setCustomers,
  items,
  setItems,
  creditNotes = [],
  setCreditNotes,
  currentFY,
  isLocked = false,
  gstPercentage = 18,
  activeCompanyId
}: SalesReturnPageProps) {
  const [open, setOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<SalesReturn | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<SalesReturn | null>(null)
  
  // List Filters
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')
  const [selectedCustomerFilter, setSelectedCustomerFilter] = useState<string>('all')

  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('')
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
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
  const [showQuickCustomer, setShowQuickCustomer] = useState(false)
  const [showQuickItem, setShowQuickItem] = useState(false)

  const filteredReturns = useMemo(() => {
    let result = salesReturns
    
    if (fromDate) {
      result = result.filter(p => p.returnDate >= fromDate)
    }
    if (toDate) {
      result = result.filter(p => p.returnDate <= toDate)
    }
    
    if (selectedCustomerFilter !== 'all') {
      result = result.filter(p => p.customerId === selectedCustomerFilter)
    }
    
    return result.sort((a, b) => new Date(b.returnDate).getTime() - new Date(a.returnDate).getTime())
  }, [salesReturns, fromDate, toDate, selectedCustomerFilter])
  
  const totalAmount = filteredReturns.reduce((sum, p) => sum + p.amount, 0)

  // Calculations for active form
  const itemsSubtotal = useMemo(() => {
    return returnItems.reduce((sum, item) => sum + (item.amount || 0), 0)
  }, [returnItems])

  const calculatedTotalAmount = useMemo(() => {
    return calculateInvoiceFinalAmount(itemsSubtotal, additionalCost, roundOffAdjustment)
  }, [itemsSubtotal, additionalCost, roundOffAdjustment])

  const customerMap = new Map(customers.map(c => [c.id, c]))
  const selectedCustomer = selectedCustomerId ? customerMap.get(selectedCustomerId) : undefined

  const filteredCustomers = customers.filter((customer) => {
    const query = customerSearch.trim().toLowerCase()
    if (!query) return true
    return [customer.name, customer.phone, customer.gstin]
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
        const rate = item?.salesPrice || 0
        const defaultEntryUnit = item?.alternativeUnit && item.alternativeUnit !== 'NONE' ? item.alternativeUnit : (item?.unit || 'KG')
        const activeUnit = pickerUnits[itemId] || defaultEntryUnit
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
    setSelectedCustomerId('')
    setCustomerSearch('')
    setReturnNo(`SR-${Date.now().toString().slice(-6)}`)
    setReturnDate(format(new Date(), 'yyyy-MM-dd'))
    setReturnItems([])
    setAdditionalCost(0)
    setRoundOffAdjustment(0)
    setRemarks('')
    setOpen(true)
  }

  const handleOpenEdit = (item: SalesReturn) => {
    if (isLocked) {
      toast.error('Cannot edit in locked mode')
      return
    }
    setEditingItem(item)
    setSelectedCustomerId(item.customerId)
    setCustomerSearch('')
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
        const defaultUnit = selectedDef?.alternativeUnit && selectedDef.alternativeUnit !== 'NONE' ? selectedDef.alternativeUnit : (selectedDef?.unit || 'KG')
        updated.enteredUnit = defaultUnit
        if (selectedDef && selectedDef.salesPrice) {
          updated.rate = selectedDef.salesPrice
        }
      }

      if (field === 'enteredQuantity' || field === 'entryQuantity') {
        const numVal = Number(value) || 0
        updated.enteredQuantity = numVal
        const activeUnit = updated.enteredUnit || (selectedDef?.alternativeUnit && selectedDef.alternativeUnit !== 'NONE' ? selectedDef.alternativeUnit : (selectedDef?.unit || 'KG'))
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

    if (!selectedCustomerId) {
      toast.error('Select a customer before saving')
      return
    }

    if (returnItems.length === 0) {
      toast.error('Please add at least one item to return')
      return
    }



    const returnId = editingItem ? editingItem.id : `sr-${Date.now()}`
    const finalReturnNo = returnNo.trim() || `SR-${Date.now().toString().slice(-6)}`
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

    const salesReturnRecord: SalesReturn = {
      id: returnId,
      customerId: selectedCustomerId,
      returnNo: finalReturnNo,
      returnDate,
      amount: calculatedTotalAmount,
      items: sanitizedReturnItems,
      additionalCost,
      roundOffAdjustment,
      invoiceRef: finalReturnNo,
      remarks,
      fy: getFYFromDate(returnDate),
      createdAt: editingItem?.createdAt || Date.now(),
      history: editingItem
        ? [
            ...(editingItem.history || []),
            {
              timestamp: new Date().toISOString(),
              action: 'updated',
              changedBy: getChangedByLabel(),
              changes: [
                ...(editingItem.amount !== calculatedTotalAmount ? [{ field: 'Amount', from: String(editingItem.amount), to: String(calculatedTotalAmount) }] : []),
                ...(editingItem.customerId !== selectedCustomerId ? [{ field: 'Customer', from: customers.find(c => c.id === editingItem.customerId)?.name || '-', to: customers.find(c => c.id === selectedCustomerId)?.name || '-' }] : []),
                ...(editingItem.returnDate !== returnDate ? [{ field: 'Date', from: editingItem.returnDate, to: returnDate }] : [])
              ]
            }
          ]
        : [
            {
              timestamp: new Date().toISOString(),
              action: 'created',
              changedBy: getChangedByLabel(),
              changes: [
                { field: 'Return No', from: '', to: finalReturnNo },
                { field: 'Customer', from: '', to: customers.find(c => c.id === selectedCustomerId)?.name || '-' },
                { field: 'Amount', from: '', to: String(calculatedTotalAmount) },
                { field: 'Date', from: '', to: returnDate }
              ]
            }
          ]
    }

    // Auto-create / update Customer Credit Note
    const creditNoteId = `credit-note-sr-${returnId}`
    const creditNoteRecord: CustomerCreditNote = {
      id: creditNoteId,
      customerId: selectedCustomerId,
      date: returnDate,
      amount: calculatedTotalAmount,
      invoiceRef: finalReturnNo,
      remarks: `Sales Return #${finalReturnNo}${remarks ? ' - ' + remarks : ''}`,
      fy: getFYFromDate(returnDate),
      createdAt: Date.now(),
      isAutoGenerated: true,
      sourceType: 'sales_return',
      sourceId: returnId,
      history: editingItem
        ? [
            ...(creditNotes.find(c => c.id === creditNoteId)?.history || []),
            {
              timestamp: new Date().toISOString(),
              action: 'updated',
              changedBy: getChangedByLabel(),
              changes: [
                ...(editingItem.amount !== calculatedTotalAmount ? [{ field: 'Amount', from: String(editingItem.amount), to: String(calculatedTotalAmount) }] : [])
              ]
            }
          ]
        : [
            {
              timestamp: new Date().toISOString(),
              action: 'created',
              changedBy: getChangedByLabel(),
              details: 'Auto-generated from Sales Return'
            }
          ]
    }

    // Save Sales Return
    setSalesReturns(prev => {
      const exists = prev.some(s => s.id === returnId)
      return exists ? prev.map(s => s.id === returnId ? salesReturnRecord : s) : [...prev, salesReturnRecord]
    })

    // Auto-save Credit Note
    if (setCreditNotes) {
      setCreditNotes(prev => {
        const exists = prev.some(c => c.id === creditNoteId)
        return exists ? prev.map(c => c.id === creditNoteId ? creditNoteRecord : c) : [...prev, creditNoteRecord]
      })
    }

    if (activeCompanyId) {
      void saveEntityRemote(activeCompanyId, 'salesReturns', salesReturnRecord)
      void saveEntityRemote(activeCompanyId, 'creditNotes', creditNoteRecord)
    }

    toast.success(editingItem ? 'Sales Return & Credit Note updated' : 'Sales Return & Credit Note created', {
      description: `Items added back to inventory. Credit Note of ${formatCurrency(calculatedTotalAmount)} auto-generated.`
    })

    setOpen(false)
    setEditingItem(null)
  }

  const handleDelete = () => {
    if (isLocked || !itemToDelete) return
    const returnId = itemToDelete.id
    const creditNoteId = `credit-note-sr-${returnId}`

    setSalesReturns(prev => prev.filter(s => s.id !== returnId))
    if (setCreditNotes) {
      setCreditNotes(prev => prev.filter(c => c.id !== creditNoteId))
    }

    if (activeCompanyId) {
      void deleteEntityRemote(activeCompanyId, 'salesReturns', returnId)
      void deleteEntityRemote(activeCompanyId, 'creditNotes', creditNoteId)
    }

    setDeleteDialogOpen(false)
    setItemToDelete(null)
    toast.success('Sales Return & associated Credit Note deleted')
  }

  return (
    <div className="space-y-6 pb-12">
      {!open ? (
        <>
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full border border-slate-200/80 bg-white text-slate-500 hover:bg-slate-50 shadow-2xs"
              >
                <CaretLeft className="h-5 w-5" weight="bold" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sales Returns</h1>
                <p className="text-xs text-slate-500 font-medium">Track and manage all sales returns in one place</p>
              </div>
            </div>
          </div>

          {/* Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
            {/* Card 1: Total Return Records */}
            <div className="bg-white rounded-3xl border border-slate-200/70 p-6 shadow-2xs relative overflow-hidden flex items-start justify-between">
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-purple-50 text-[#5B5FEF] border border-purple-100/60 flex items-center justify-center mb-3">
                  <ArrowSquareOut className="h-6 w-6" weight="duotone" />
                </div>
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">TOTAL RETURN RECORDS</p>
                <p className="text-3xl font-extrabold text-slate-900 tracking-tight">{filteredReturns.length}</p>
                <p className="text-xs font-semibold text-[#5B5FEF] flex items-center gap-1 mt-2">
                  <TrendUp className="h-3.5 w-3.5" weight="bold" /> 0% from last month
                </p>
              </div>
              
              {/* Decorative Violet Wave */}
              <svg className="absolute bottom-0 right-0 w-48 h-24 opacity-25 pointer-events-none" viewBox="0 0 200 80" fill="none">
                <path d="M0 60 C40 20, 80 70, 120 30 C160 -10, 180 40, 200 20 L200 80 L0 80 Z" fill="url(#violet-grad-sr)" />
                <path d="M0 60 C40 20, 80 70, 120 30 C160 -10, 180 40, 200 20" stroke="#5B5FEF" strokeWidth="2.5" fill="none" />
                <defs>
                  <linearGradient id="violet-grad-sr" x1="0" y1="0" x2="0" y2="80">
                    <stop offset="0%" stopColor="#5B5FEF" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#5B5FEF" stopOpacity="0" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            {/* Card 2: Total Return Value */}
            <div className="bg-white rounded-3xl border border-slate-200/70 p-6 shadow-2xs relative overflow-hidden flex items-start justify-between">
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100/60 flex items-center justify-center mb-3">
                  <Wallet className="h-6 w-6" weight="duotone" />
                </div>
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">TOTAL RETURN VALUE</p>
                <p className="text-3xl font-extrabold text-slate-900 tracking-tight">{formatCurrency(totalAmount)}</p>
                <p className="text-xs font-normal text-slate-400 mt-2">Reflects auto-created credit notes</p>
              </div>

              <div className="w-9 h-9 rounded-full bg-slate-50 border border-slate-100 text-emerald-600 flex items-center justify-center shrink-0 z-10 shadow-2xs">
                <Wallet className="h-4.5 w-4.5" weight="bold" />
              </div>

              {/* Decorative Emerald Wave */}
              <svg className="absolute bottom-0 right-0 w-48 h-24 opacity-25 pointer-events-none" viewBox="0 0 200 80" fill="none">
                <path d="M0 70 C50 40, 90 75, 130 35 C170 -5, 185 50, 200 25 L200 80 L0 80 Z" fill="url(#emerald-grad-sr)" />
                <path d="M0 70 C50 40, 90 75, 130 35 C170 -5, 185 50, 200 25" stroke="#10B981" strokeWidth="2.5" fill="none" />
                <defs>
                  <linearGradient id="emerald-grad-sr" x1="0" y1="0" x2="0" y2="80">
                    <stop offset="0%" stopColor="#10B981" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </div>

          {/* List Register Container */}
          <div className="bg-white rounded-3xl border border-slate-200/70 shadow-2xs overflow-hidden">
            {/* Card Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-[#5B5FEF] flex items-center justify-center border border-purple-100">
                  <FileText className="h-5 w-5" weight="duotone" />
                </div>
                <h2 className="text-lg font-bold text-slate-900">Sales Return List</h2>
              </div>
              <Button 
                onClick={handleOpenAdd} 
                disabled={isLocked} 
                className="bg-[#5B5FEF] hover:bg-[#4B4FEF] text-white font-bold rounded-2xl px-5 py-2.5 shadow-md shadow-[#5B5FEF]/25 flex items-center gap-2 transition-all"
              >
                <Plus className="h-4 w-4" weight="bold" />
                Add Sales Return
              </Button>
            </div>

            {/* Filter Sub-bar */}
            <div className="px-6 py-4 bg-[#FAFAFD] border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4">
                {/* Filter Badge */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-50/80 text-[#5B5FEF] border border-purple-100 text-xs font-bold">
                  <Funnel className="h-3.5 w-3.5" weight="bold" />
                  <span>Filters</span>
                </div>

                <div className="flex items-center gap-2">
                  <Select value={selectedCustomerFilter} onValueChange={setSelectedCustomerFilter}>
                    <SelectTrigger className="w-52 h-9 bg-white border-slate-200/80 text-xs font-medium rounded-xl shadow-2xs">
                      <span className="text-slate-400 mr-1">Customer:</span>
                      <SelectValue placeholder="All Customers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Customer</SelectItem>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-medium">From:</span>
                  <div className="relative">
                    <Input
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="w-38 h-9 bg-white border-slate-200/80 text-xs font-medium rounded-xl shadow-2xs pr-8"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-medium">To:</span>
                  <div className="relative">
                    <Input
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className="w-38 h-9 bg-white border-slate-200/80 text-xs font-medium rounded-xl shadow-2xs pr-8"
                    />
                  </div>
                </div>
              </div>

              <span className="bg-purple-50/60 text-[#5B5FEF] text-xs font-bold px-3.5 py-1 rounded-full border border-purple-100/80">
                {filteredReturns.length} returns found
              </span>
            </div>

            {/* Table */}
            <Table>
              <TableHeader className="bg-[#F3F4FD]">
                <TableRow className="border-b border-slate-200/60 hover:bg-transparent">
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider text-slate-500 py-3.5 px-6">DATE</TableHead>
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider text-slate-500 py-3.5">RETURN / REF NO</TableHead>
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider text-slate-500 py-3.5">CUSTOMER</TableHead>
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider text-slate-500 py-3.5">STATUS</TableHead>
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider text-slate-500 py-3.5 text-right">RETURN AMOUNT</TableHead>
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider text-slate-500 py-3.5 text-right px-6">ACTIONS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReturns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-20 text-center">
                      <div className="max-w-sm mx-auto space-y-4">
                        {/* 3D Purple Gift Box with floating document illustration */}
                        <div className="w-32 h-32 mx-auto relative flex items-center justify-center">
                          <svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="64" cy="64" r="52" fill="#F4F5FD" />
                            
                            {/* Open Box Base */}
                            <path d="M38 72L64 84L90 72V94L64 104L38 94V72Z" fill="#8B5CF6" opacity="0.8" />
                            <path d="M38 72L64 84V104L38 94V72Z" fill="#7C3AED" />
                            <path d="M64 84L90 72V94L64 104V84Z" fill="#A78BFA" />
                            
                            {/* Open Flaps */}
                            <path d="M38 72L24 60L50 52L64 64L38 72Z" fill="#C4B5FD" />
                            <path d="M90 72L104 60L78 52L64 64L90 72Z" fill="#DDD6FE" />
                            
                            {/* Floating Document */}
                            <rect x="46" y="24" width="36" height="46" rx="5" fill="white" stroke="#A78BFA" strokeWidth="2" />
                            <line x1="52" y1="34" x2="68" y2="34" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
                            <line x1="52" y1="40" x2="74" y2="40" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
                            <line x1="52" y1="46" x2="64" y2="46" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
                            
                            {/* Refresh Icon Circle on Document */}
                            <circle cx="64" cy="54" r="9" fill="#5B5FEF" />
                            <path d="M61.5 54A2.5 2.5 0 0 1 66 52.5M66.5 54A2.5 2.5 0 0 1 62 55.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
                            
                            {/* Sparkles */}
                            <circle cx="24" cy="38" r="2.5" fill="#A78BFA" />
                            <circle cx="104" cy="34" r="3" fill="#A78BFA" />
                            <circle cx="98" cy="88" r="2" fill="#C4B5FD" />
                            <circle cx="30" cy="92" r="2" fill="#C4B5FD" />
                          </svg>
                        </div>

                        <div>
                          <h3 className="text-lg font-bold text-slate-900">No sales returns found</h3>
                          <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">
                            No sales returns recorded for this period. Add your first return to get started.
                          </p>
                        </div>

                        <div className="pt-2">
                          <Button
                            onClick={handleOpenAdd}
                            disabled={isLocked}
                            variant="outline"
                            className="border-2 border-[#5B5FEF] text-[#5B5FEF] hover:bg-[#5B5FEF]/5 font-bold rounded-2xl px-6 py-2.5 gap-2 transition-all"
                          >
                            <Plus className="h-4 w-4" weight="bold" />
                            Create First Return
                          </Button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredReturns.map(item => {
                    const customer = customers.find(c => c.id === item.customerId)
                    return (
                      <TableRow key={item.id} className="hover:bg-slate-50/80 border-b border-slate-100 transition-colors">
                        <TableCell className="text-slate-600 text-xs font-semibold py-4 px-6">{item.returnDate}</TableCell>
                        <TableCell className="font-mono font-bold text-slate-900 text-sm py-4">{item.returnNo || item.invoiceRef || '-'}</TableCell>
                        <TableCell className="font-semibold text-slate-800 text-sm py-4">{customer?.name || 'Unknown'}</TableCell>
                        <TableCell className="py-4">
                          <span className="bg-purple-50 text-[#5B5FEF] text-xs font-bold px-3 py-1 rounded-full border border-purple-200/60 inline-block">
                            Credit Note Generated
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-emerald-600 text-sm py-4">
                          {formatCurrency(item.amount)}
                        </TableCell>
                        <TableCell className="text-right py-4 px-6">
                            <ThreeDotDropdown
                              onEdit={() => handleOpenEdit(item)}
                              onDelete={() => { setItemToDelete(item); setDeleteDialogOpen(true) }}
                              history={item.history}
                              entityType="Sales Return"
                              isLocked={isLocked}
                            />
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>

            {/* Table Footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium bg-white">
              <div>Showing 0 to {filteredReturns.length} of {filteredReturns.length} entries</div>
              <div className="flex items-center gap-1.5">
                <button className="h-8 w-8 rounded-xl border border-slate-200 flex items-center justify-center text-slate-400 disabled:opacity-40 hover:bg-slate-50 transition-colors" disabled>‹</button>
                <button className="h-8 w-8 rounded-xl bg-[#5B5FEF] text-white font-bold flex items-center justify-center shadow-xs">1</button>
                <button className="h-8 w-8 rounded-xl border border-slate-200 flex items-center justify-center text-slate-400 disabled:opacity-40 hover:bg-slate-50 transition-colors" disabled>›</button>
              </div>
            </div>
          </div>

          {/* Floating Plus Action Button */}
          <button
            onClick={handleOpenAdd}
            disabled={isLocked}
            className="fixed bottom-8 left-8 w-12 h-12 rounded-full bg-[#5B5FEF] text-white shadow-lg shadow-[#5B5FEF]/30 flex items-center justify-center z-40 hover:scale-105 transition-transform"
            title="Add Sales Return"
          >
            <Plus className="h-6 w-6" weight="bold" />
          </button>
        </>
      ) : (
        /* If form is OPEN, render FULL PAGE Shell view exactly like SalesInvoicesPage! */
        <div className="erp-invoice-page-shell">
          <form onSubmit={handleSubmit} className="erp-invoice-form erp-invoice-page-form">
            <div className="erp-invoice-page-header">
              <div className="flex min-w-0 items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-full"
                  onClick={() => setOpen(false)}
                  aria-label="Back to sales returns"
                >
                  <ArrowLeft size={24} />
                </Button>
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-semibold">
                    {editingItem ? 'Edit Sales Return' : 'Create Sales Return'}
                  </h2>
                  <p className="text-sm text-muted-foreground">Return goods from customer and auto-generate Credit Note</p>
                </div>
              </div>
              <div className="erp-reference-actions flex items-center gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="erp-save-button" disabled={returnItems.length === 0}>
                  {editingItem ? 'Update Return & Credit Note' : 'Save Return & Credit Note'}
                </Button>
              </div>
            </div>

            {/* Main Form Body */}
            <div className="erp-invoice-body erp-invoice-page-body space-y-6">
              {/* Panel 1: Bill To / Return From Customer */}
              <div className="erp-form-panel">
                <h3 className="erp-section-title">Return From Customer</h3>
                <div className="erp-responsive-grid">
                  <div className="erp-party-picker-field">
                    <input type="hidden" name="customerId" value={selectedCustomerId} />
                    {!customerPickerOpen && selectedCustomer ? (
                      <div className="flex items-center justify-between p-3.5 bg-[#5B5FEF]/10 border-2 border-[#5B5FEF] rounded-2xl shadow-sm">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-[#5B5FEF] text-white flex items-center justify-center font-extrabold text-sm shrink-0 shadow-sm">
                            {selectedCustomer.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-extrabold text-slate-900 truncate">
                              {selectedCustomer.name}
                            </div>
                            <div className="text-xs font-bold text-[#5B5FEF]">
                              Balance: {formatCurrency(selectedCustomer.openingBalance || 0)}
                            </div>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setCustomerPickerOpen(true)
                            setCustomerSearch('')
                          }}
                          className="h-8 px-3 text-xs font-bold text-[#5B5FEF] bg-white border-[#5B5FEF]/30 hover:bg-[#5B5FEF] hover:text-white rounded-xl shadow-2xs transition-all shrink-0 ml-2"
                        >
                          Change Party
                        </Button>
                      </div>
                    ) : !customerPickerOpen && !selectedCustomer ? (
                      <button
                        type="button"
                        className="erp-party-add-box"
                        onClick={() => setCustomerPickerOpen(true)}
                      >
                        <Plus size={18} weight="bold" />
                        Select Customer
                      </button>
                    ) : (
                      <div className="erp-party-dropdown-card">
                        <div className="erp-party-search-row">
                          <MagnifyingGlass size={20} />
                          <input
                            id="customerId"
                            type="text"
                            value={customerSearch}
                            onChange={(event) => setCustomerSearch(event.target.value)}
                            onFocus={() => setCustomerPickerOpen(true)}
                            placeholder="Search customer by name or number"
                            autoComplete="off"
                          />
                          <button
                            type="button"
                            aria-label="Toggle customer list"
                            onClick={() => setCustomerPickerOpen(false)}
                          >
                            <span>✕</span>
                          </button>
                        </div>

                        <div className="erp-party-options">
                          <div className="erp-party-options-head">
                            <span>Customer Name</span>
                            <span>Balance</span>
                          </div>
                          {filteredCustomers.map((customer) => (
                            <button
                              type="button"
                              key={customer.id}
                              className="erp-party-option"
                              onClick={() => {
                                setSelectedCustomerId(customer.id)
                                setCustomerSearch('')
                                setCustomerPickerOpen(false)
                              }}
                            >
                              <span>{customer.name}</span>
                              <span>{formatCurrency(customer.openingBalance || 0)}</span>
                            </button>
                          ))}
                          {setCustomers && (
                            <button
                              type="button"
                              className="erp-party-create-option"
                              onClick={() => {
                                setCustomerPickerOpen(false)
                                setShowQuickCustomer(true)
                              }}
                            >
                              <Plus size={16} weight="bold" />
                              Create Customer
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="returnNo" className="text-xs font-medium">Return / Ref Number <span className="text-destructive">*</span></Label>
                    <Input 
                      id="returnNo" 
                      value={returnNo}
                      onChange={e => setReturnNo(e.target.value)}
                      placeholder="SR-001"
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
              <div id="sales-return-items" className="space-y-2.5">
                <div className="erp-section-toolbar flex items-center justify-between">
                  <h3 className="erp-section-title">
                    Return Items <span className="text-destructive">*</span>
                  </h3>
                  <span className="text-[10px] text-muted-foreground font-medium">
                    Returned items will be automatically added back into inventory stock
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
                              const defaultAlt = sel?.alternativeUnit && sel.alternativeUnit !== 'NONE' ? sel.alternativeUnit : (sel?.unit || 'KG')
                              const activeUnit = lineItem.enteredUnit || (lineItem as any).entryUnit || defaultAlt
                              return (
                                <select
                                  value={activeUnit}
                                  onChange={(e) => handleUpdateLineItem(index, 'enteredUnit', e.target.value)}
                                  className="text-xs font-bold font-mono bg-slate-100 border border-slate-300 rounded px-1 py-1 text-slate-800 focus:outline-none"
                                >
                                  {sel?.alternativeUnit && sel.alternativeUnit !== 'NONE' && (
                                    <option value={sel.alternativeUnit}>{sel.alternativeUnit}</option>
                                  )}
                                  <option value={sel?.unit || 'KG'}>{sel?.unit || 'KG'}</option>
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
                        <p className="text-xs text-muted-foreground">Specify reason for customer return or notes.</p>
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
                      Note: Saving this return will auto-create/update a Credit Note of <span className="font-semibold text-foreground">{formatCurrency(calculatedTotalAmount)}</span>.
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
                      <TableHead className="text-right w-[18%]">Sales Price</TableHead>
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
                        const defaultAlt = item.alternativeUnit && item.alternativeUnit !== 'NONE' ? item.alternativeUnit : item.unit
                        const activeUnit = pickerUnits[item.id] || defaultAlt

                        return (
                          <TableRow
                            key={item.id}
                            className={isSelected ? 'erp-item-picker-row is-selected bg-primary/10' : 'erp-item-picker-row'}
                          >
                            <TableCell className="font-medium">{item.name}</TableCell>
                            <TableCell>{item.itemCode || '-'}</TableCell>
                            <TableCell className="text-right font-mono">{item.openingStock ?? 0} {item.unit}</TableCell>
                            <TableCell className="text-right font-mono">{item.salesPrice ? formatCurrency(item.salesPrice) : '-'}</TableCell>
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
                                      <option value={item.alternativeUnit}>{item.alternativeUnit}</option>
                                      <option value={item.unit}>{item.unit}</option>
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
                                      <option value={item.alternativeUnit}>{item.alternativeUnit}</option>
                                      <option value={item.unit}>{item.unit}</option>
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
            <AlertDialogTitle>Delete Sales Return?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this sales return record AND automatically delete its associated Credit Note. Inventory stock will be adjusted.
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

      {/* Quick Add Customer Dialog */}
      {setCustomers && (
        <PartyEditorDialog
          open={showQuickCustomer}
          onOpenChange={setShowQuickCustomer}
          type="customer"
          onSave={newCustomer => {
            setCustomers(prev => [...prev, newCustomer as Customer])
            setSelectedCustomerId(newCustomer.id)
            toast.success(`Customer "${newCustomer.name}" added`)
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
