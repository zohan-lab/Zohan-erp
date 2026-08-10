import { useState, useMemo } from 'react'
import { PeriodDateFilter, PeriodFilterState, defaultPeriodFilterState, isRecordInPeriod } from '@/components/period-date-filter'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { ExpenseEntry, ExpenseType, Supplier, PurchaseInvoice } from '@/lib/types'
import { Counter, CashBankTransaction } from '@/lib/cash-bank-types'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { 
  Plus, 
  Trash, 
  LinkSimple, 
  TrendDown, 
  PencilSimple, 
  MagnifyingGlass, 
  SlidersHorizontal, 
  Receipt,
  FileText,
  Wallet,
  ArrowDownRight,
  CaretLeft,
  Check,
  Funnel,
  CaretUpDown
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { formatCurrency, calculateExpenseTotals, applyCounterBalanceDelta } from '@/lib/calculations'
import { getInvoiceQtyForUnit } from '@/lib/unit-conversion-service'

interface ExpenseEntriesPageProps {
  expenseEntries: ExpenseEntry[]
  setExpenseEntries: (updater: (prev: ExpenseEntry[]) => ExpenseEntry[]) => void
  expenseTypes: ExpenseType[]
  setExpenseTypes?: (updater: (prev: ExpenseType[]) => ExpenseType[]) => void
  suppliers: Supplier[]
  invoices: PurchaseInvoice[]
  currentFY: string
  isLocked?: boolean
  counters: Counter[]
  transactions: CashBankTransaction[]
  onUpdateCashBank: (counters: Counter[], transactions: CashBankTransaction[]) => void
}

export default function ExpenseEntriesPage({
  expenseEntries = [],
  setExpenseEntries,
  expenseTypes = [],
  setExpenseTypes,
  suppliers = [],
  invoices = [],
  currentFY,
  isLocked = false,
  counters = [],
  transactions = [],
  onUpdateCashBank
}: ExpenseEntriesPageProps) {
  // Form State for Expense Entry
  const [editingExpense, setEditingExpense] = useState<ExpenseEntry | null>(null)
  const [expenseTypeId, setExpenseTypeId] = useState('')
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0])
  const [amount, setAmount] = useState('')
  const [selectedCounterId, setSelectedCounterId] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [linkedInvoiceId, setLinkedInvoiceId] = useState('')
  const [invoiceSearchOpen, setInvoiceSearchOpen] = useState(false)
  const [expenseWithGst, setExpenseWithGst] = useState(false)
  const [notes, setNotes] = useState('')

  // Modal State for Manage Expense Types
  const [manageTypesOpen, setManageTypesOpen] = useState(false)
  const [editingType, setEditingType] = useState<ExpenseType | null>(null)
  const [typeName, setTypeName] = useState('')
  const [typeDescription, setTypeDescription] = useState('')
  const [typeLinkType, setTypeLinkType] = useState<'invoice' | 'netprofit'>('netprofit')

  // Date / FY Filters State
  const [periodFilter, setPeriodFilter] = useState<PeriodFilterState>(defaultPeriodFilterState)

  // Search & Register Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterCounter, setFilterCounter] = useState<string>('all')

  const selectedExpenseType = expenseTypes.find((et) => et.id === expenseTypeId)
  const isInvoiceLinked = selectedExpenseType?.linkType === 'invoice'

  // Reset Entry Form
  const resetForm = () => {
    setEditingExpense(null)
    setExpenseTypeId('')
    setExpenseDate(new Date().toISOString().split('T')[0])
    setAmount('')
    setSelectedCounterId('')
    setSupplierId('')
    setLinkedInvoiceId('')
    setExpenseWithGst(false)
    setNotes('')
  }

  // Filter Expense Entries by Selected Date / FY Mode
  const dateFilteredExpenses = useMemo(() => {
    return expenseEntries.filter((e) => isRecordInPeriod(e.expenseDate, e.fy, periodFilter, currentFY))
  }, [expenseEntries, currentFY, periodFilter])

  // Summary Card Statistics
  const { totalExpenses, invoiceLinkedExpenses, netProfitExpenses } = useMemo(() => {
    return calculateExpenseTotals(dateFilteredExpenses, expenseTypes)
  }, [dateFilteredExpenses, expenseTypes])

  // Filtered Register Data for Table
  const filteredRegister = useMemo(() => {
    return dateFilteredExpenses.filter((e) => {
      if (filterType !== 'all' && e.expenseTypeId !== filterType) return false
      if (filterCounter !== 'all' && e.counterId !== filterCounter) return false
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase()
        const typeObj = expenseTypes.find((t) => t.id === e.expenseTypeId)
        const matchesNotes = (e.notes || '').toLowerCase().includes(term)
        const matchesType = (typeObj?.name || '').toLowerCase().includes(term)
        const matchesRef = (e.id || '').toLowerCase().includes(term)
        if (!matchesNotes && !matchesType && !matchesRef) return false
      }
      return true
    })
  }, [dateFilteredExpenses, filterType, filterCounter, searchTerm, expenseTypes])

  const filteredRegisterTotal = useMemo(() => {
    return calculateExpenseTotals(filteredRegister).totalExpenses
  }, [filteredRegister])

  // Save Expense Entry Submit
  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault()
    if (isLocked) return toast.error('Data is locked.')
    if (!expenseTypeId) return toast.error('Select an expense type')
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) return toast.error('Enter a valid amount')
    if (!expenseDate) return toast.error('Select an expense date')
    if (!selectedCounterId) return toast.error('Select a payment counter/account')
    if (isInvoiceLinked && !linkedInvoiceId) {
      toast.error('Linked Purchase Invoice is mandatory for invoice-linked expenses!')
      return
    }

    const selectedCounter = counters.find((c) => c.id === selectedCounterId)
    const typeObj = expenseTypes.find((t) => t.id === expenseTypeId)

    if (editingExpense) {
      // Revert old counter balance if counter changed or amount updated
      let nextCounters = [...counters]
      let nextTx = [...transactions]

      if (editingExpense.counterId) {
        nextCounters = applyCounterBalanceDelta(nextCounters, editingExpense.counterId, editingExpense.amount)
        nextTx = nextTx.filter((t) => t.id !== `tx-exp-${editingExpense.id}`)
      }

      // Deduct new amount from new selected counter
      nextCounters = applyCounterBalanceDelta(nextCounters, selectedCounterId, -amt)

      const cashBankTx: CashBankTransaction = {
        id: `tx-exp-${editingExpense.id}`,
        date: expenseDate,
        counterId: selectedCounterId,
        counterName: selectedCounter?.name || 'Counter',
        type: 'Out',
        amount: amt,
        narration: `Expense: ${typeObj?.name || 'General'} - ${notes || 'Updated entry'}`
      }

      const updatedEntry: ExpenseEntry = {
        ...editingExpense,
        expenseTypeId,
        expenseDate,
        amount: amt,
        counterId: selectedCounterId,
        supplierId: supplierId || undefined,
        linkedInvoiceId: linkedInvoiceId || undefined,
        expenseWithGst,
        notes: notes.trim() || undefined,
        fy: currentFY
      }

      setExpenseEntries((prev) => prev.map((item) => (item.id === editingExpense.id ? updatedEntry : item)))
      onUpdateCashBank(nextCounters, [cashBankTx, ...nextTx])
      toast.success('Expense entry updated successfully')
    } else {
      const newId = `exp-${Date.now()}`
      
      // Deduct amount from cash/bank counter balance
      const nextCounters = applyCounterBalanceDelta(counters, selectedCounterId, -amt)

      const cashBankTx: CashBankTransaction = {
        id: `tx-exp-${newId}`,
        date: expenseDate,
        counterId: selectedCounterId,
        counterName: selectedCounter?.name || 'Counter',
        type: 'Out',
        amount: amt,
        narration: `Expense: ${typeObj?.name || 'General'} - ${notes || 'New entry'}`
      }

      const newEntry: ExpenseEntry = {
        id: newId,
        expenseTypeId,
        expenseDate,
        amount: amt,
        counterId: selectedCounterId,
        supplierId: supplierId || undefined,
        linkedInvoiceId: linkedInvoiceId || undefined,
        expenseWithGst,
        notes: notes.trim() || undefined,
        fy: currentFY
      }

      setExpenseEntries((prev) => [newEntry, ...prev])
      onUpdateCashBank(nextCounters, [cashBankTx, ...transactions])
      toast.success('Expense entry created successfully')
    }

    resetForm()
  }

  // Delete Expense Entry
  const handleDeleteExpense = (entry: ExpenseEntry) => {
    if (isLocked) return toast.error('Data is locked.')
    if (!window.confirm('Are you sure you want to delete this expense entry? Balance will be restored.')) return

    // Restore counter balance
    const nextCounters = entry.counterId 
      ? applyCounterBalanceDelta(counters, entry.counterId, entry.amount)
      : counters

    const nextTx = transactions.filter((t) => t.id !== `tx-exp-${entry.id}`)
    setExpenseEntries((prev) => prev.filter((e) => e.id !== entry.id))
    onUpdateCashBank(nextCounters, nextTx)
    toast.success('Expense entry deleted and counter balance restored')
  }

  // Save / Update Expense Type (Modal)
  const handleSaveType = (e: React.FormEvent) => {
    e.preventDefault()
    if (isLocked) return toast.error('Data is locked.')
    if (!typeName.trim()) return toast.error('Enter expense type name')

    if (!setExpenseTypes) {
      toast.error('Expense type modification is restricted')
      return
    }

    if (editingType) {
      setExpenseTypes((prev) => prev.map((t) => 
        t.id === editingType.id 
          ? { ...t, name: typeName.trim(), description: typeDescription.trim() || undefined, linkType: typeLinkType }
          : t
      ))
      toast.success(`Expense Type "${typeName}" updated`)
    } else {
      const newType: ExpenseType = {
        id: `expt-${Date.now()}`,
        name: typeName.trim(),
        description: typeDescription.trim() || undefined,
        linkType: typeLinkType
      }
      setExpenseTypes((prev) => [...prev, newType])
      toast.success(`Expense Type "${typeName}" created`)
    }

    setTypeName('')
    setTypeDescription('')
    setTypeLinkType('netprofit')
    setEditingType(null)
  }

  // Delete Expense Type
  const handleDeleteType = (id: string) => {
    if (isLocked) return toast.error('Data is locked.')
    const count = expenseEntries.filter((e) => e.expenseTypeId === id).length
    if (count > 0) return toast.error(`Cannot delete type: ${count} expense entries rely on it.`)
    if (!window.confirm('Delete this expense type?')) return

    if (setExpenseTypes) {
      setExpenseTypes((prev) => prev.filter((t) => t.id !== id))
      toast.success('Expense type deleted')
    }
  }

  return (
    <div className="space-y-6 pb-12">
      
      {/* Page Title & Top Action Bar matching Diagram */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-slate-700 hover:bg-slate-200/60"
          >
            <CaretLeft className="h-5 w-5" weight="bold" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Expenses System</h1>
            <p className="text-xs text-slate-500 font-medium">Record operational expenses, track invoice-linked costs, and manage categories</p>
          </div>
        </div>

        {/* Date to date / current fy and previous fy Filter + Add/manage Expenses Type Button */}
        <div className="flex flex-wrap items-center gap-2.5">
          
          <PeriodDateFilter currentFY={currentFY} value={periodFilter} onChange={setPeriodFilter} />

          {/* Action Button from Diagram: Add/manage Expenses type */}
          <Button
            onClick={() => {
              setTypeName('')
              setTypeDescription('')
              setTypeLinkType('netprofit')
              setEditingType(null)
              setManageTypesOpen(true)
            }}
            disabled={isLocked}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl px-4 py-2.5 shadow-2xs flex items-center gap-2 text-xs"
          >
            <SlidersHorizontal className="h-4 w-4" weight="bold" />
            Add/manage Expenses type
          </Button>
        </div>
      </div>

      {/* Top 3 Summary Cards matching Diagram Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        
        {/* Card 1: Total Expenses */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Total Expenses</p>
            <p className="text-2xl font-extrabold text-slate-900 tracking-tight">{formatCurrency(totalExpenses)}</p>
            <p className="text-xs text-slate-400 mt-1">All recorded expense entries</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 border border-amber-100/60 flex items-center justify-center shrink-0">
            <TrendDown className="h-6 w-6" weight="duotone" />
          </div>
        </div>

        {/* Card 2: Invoice Linked Expenses */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Invoice Linked Expenses</p>
            <p className="text-2xl font-extrabold text-[#0256e8] tracking-tight">{formatCurrency(invoiceLinkedExpenses)}</p>
            <p className="text-xs text-slate-400 mt-1">Direct costs linked to purchases</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#0256e8] border border-blue-100/60 flex items-center justify-center shrink-0">
            <LinkSimple className="h-6 w-6" weight="duotone" />
          </div>
        </div>

        {/* Card 3: Net Profit Expenses */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Net Profit Expenses</p>
            <p className="text-2xl font-extrabold text-indigo-600 tracking-tight">{formatCurrency(netProfitExpenses)}</p>
            <p className="text-xs text-slate-400 mt-1">Operational & general P&L expenses</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100/60 flex items-center justify-center shrink-0">
            <Wallet className="h-6 w-6" weight="duotone" />
          </div>
        </div>

      </div>

      {/* Section 1 from Diagram: Create Expenses Entry Form & Redesign */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Plus className="h-5 w-5" weight="bold" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {editingExpense ? `Edit Expense Entry #${editingExpense.id}` : 'Create Expense Entry'}
              </h2>
              <p className="text-xs text-slate-500">Record a new expense transaction and link payment account</p>
            </div>
          </div>

          {editingExpense && (
            <Button variant="outline" size="sm" onClick={resetForm} className="h-8 text-xs">
              Cancel Editing
            </Button>
          )}
        </div>

        <form onSubmit={handleSaveExpense} className="space-y-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Expense Type */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Expense Type *</Label>
              <Select value={expenseTypeId} onValueChange={setExpenseTypeId}>
                <SelectTrigger className="w-full h-9 bg-white text-xs">
                  <SelectValue placeholder="Select Expense Category" />
                </SelectTrigger>
                <SelectContent>
                  {expenseTypes.map((et) => (
                    <SelectItem key={et.id} value={et.id}>
                      <span className="flex items-center justify-between w-full gap-2">
                        <span>{et.name}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          et.linkType === 'invoice' ? 'bg-blue-100 text-blue-700' : 'bg-indigo-100 text-indigo-700'
                        }`}>
                          {et.linkType === 'invoice' ? 'Invoice Linked' : 'Net Profit'}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Amount (₹) *</Label>
              <Input
                type="number"
                step="any"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-9 text-xs font-bold text-slate-900"
                required
              />
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Expense Date *</Label>
              <Input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="h-9 text-xs"
                required
              />
            </div>

            {/* Payment Counter / Account */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Payment Account (Counter) *</Label>
              <Select value={selectedCounterId} onValueChange={setSelectedCounterId}>
                <SelectTrigger className="w-full h-9 bg-white text-xs">
                  <SelectValue placeholder="Select Payment Account" />
                </SelectTrigger>
                <SelectContent>
                  {counters.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({formatCurrency(c.currentBalance)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            
            {/* Linked Invoice if Invoice Linked */}
            {isInvoiceLinked && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-bold text-slate-700">
                  Linked Purchase Invoice <span className="text-red-500 font-extrabold">*</span>
                </Label>

                <Popover open={invoiceSearchOpen} onOpenChange={setInvoiceSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={invoiceSearchOpen}
                      className={cn(
                        "w-full h-9 justify-between bg-white text-xs text-left font-normal border-slate-200",
                        !linkedInvoiceId && "text-slate-400 border-amber-300 bg-amber-50/20"
                      )}
                    >
                      {linkedInvoiceId ? (() => {
                        const inv = invoices.find((i) => i.id === linkedInvoiceId)
                        const supp = suppliers.find((s) => s.id === inv?.supplierId)
                        return inv ? (
                          <span className="font-semibold text-slate-900 truncate">
                            Invoice #{inv.invoiceNo} · {supp?.name || 'Supplier'} ({inv.invoiceDate}) · {formatCurrency(inv.invoiceAmount)}
                          </span>
                        ) : "Select Invoice to Link Expense..."
                      })() : (
                        <span className="text-slate-400">Select Invoice to Link Expense (Mandatory)...</span>
                      )}
                      <CaretUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50 text-slate-500" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[420px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search invoice #, supplier name, date..." className="h-9 text-xs" />
                      <CommandList className="max-h-[260px] overflow-y-auto">
                        <CommandEmpty className="py-4 text-center text-xs text-slate-500">
                          No matching purchase invoices found.
                        </CommandEmpty>
                        <CommandGroup>
                          {invoices.map((inv) => {
                            const supp = suppliers.find((s) => s.id === inv.supplierId)
                            const searchLabel = `Invoice #${inv.invoiceNo} ${supp?.name || ''} ${inv.invoiceDate} ${inv.invoiceAmount}`
                            return (
                              <CommandItem
                                key={inv.id}
                                value={searchLabel}
                                onSelect={() => {
                                  setLinkedInvoiceId(inv.id)
                                  if (inv.supplierId) setSupplierId(inv.supplierId)
                                  setInvoiceSearchOpen(false)
                                }}
                                className="text-xs cursor-pointer py-2.5 px-3 flex items-center justify-between"
                              >
                                <div className="flex items-center gap-2">
                                  <Check className={cn("h-4 w-4 text-indigo-600 shrink-0", linkedInvoiceId === inv.id ? "opacity-100" : "opacity-0")} />
                                  <div>
                                    <p className="font-bold text-slate-900">
                                      Invoice #{inv.invoiceNo} <span className="font-medium text-slate-600">· {supp?.name || 'Supplier'}</span>
                                    </p>
                                    <p className="text-[10px] text-slate-400">
                                      Date: {inv.invoiceDate} | Qty: {getInvoiceQtyForUnit(inv, 'MT')} MT
                                    </p>
                                  </div>
                                </div>
                                <span className="font-mono font-extrabold text-slate-900 text-xs">
                                  {formatCurrency(inv.invoiceAmount)}
                                </span>
                              </CommandItem>
                            )
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {/* GST Applicable Toggle */}
            <div className="space-y-1.5 flex flex-col justify-center">
              <Label className="text-xs font-bold text-slate-700">GST Applicable</Label>
              <div className="flex items-center gap-2 pt-1">
                <Switch
                  checked={expenseWithGst}
                  onCheckedChange={setExpenseWithGst}
                  id="gst-mode"
                />
                <label htmlFor="gst-mode" className="text-xs text-slate-600 font-medium cursor-pointer">
                  {expenseWithGst ? 'GST Included in Expense' : 'No GST Claim'}
                </label>
              </div>
            </div>

          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700">Notes / Remarks</Label>
            <Textarea
              placeholder="Enter expense details or vendor remarks..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-xs min-h-[50px]"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="submit"
              disabled={isLocked}
              className="bg-[#0256e8] hover:bg-[#0046cd] text-white font-bold h-9 px-6 rounded-xl text-xs"
            >
              {editingExpense ? 'Update Expense Entry' : 'Save Expense Entry'}
            </Button>
          </div>
        </form>
      </div>

      {/* Section 2 from Diagram: Expenses History Register */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <FileText className="h-5 w-5" weight="duotone" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Expenses History</h2>
              <p className="text-xs text-slate-500">Register of all logged expenses</p>
            </div>
          </div>

          <span className="bg-slate-100 text-slate-700 text-xs font-bold px-3 py-1 rounded-full border border-slate-200/60">
            Total Filtered: {formatCurrency(filteredRegisterTotal)}
          </span>
        </div>

        {/* Filter Sub-bar */}
        <div className="px-5 py-3 bg-slate-50/70 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            
            {/* Filter by Type */}
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-44 h-8 bg-white border-slate-200 text-xs font-medium rounded-xl">
                <span className="text-slate-400 mr-1">Category:</span>
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {expenseTypes.map((et) => (
                  <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Filter by Counter */}
            <Select value={filterCounter} onValueChange={setFilterCounter}>
              <SelectTrigger className="w-40 h-8 bg-white border-slate-200 text-xs font-medium rounded-xl">
                <span className="text-slate-400 mr-1">Account:</span>
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                {counters.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Search */}
            <div className="relative">
              <MagnifyingGlass className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
              <Input
                type="text"
                placeholder="Search notes/ref..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 pl-8 text-xs bg-white border-slate-200 rounded-xl w-44"
              />
            </div>
          </div>

          <span className="text-xs text-slate-500 font-medium">
            {filteredRegister.length} records
          </span>
        </div>

        {/* Expenses Table */}
        <Table>
          <TableHeader className="bg-[#edf3fc]">
            <TableRow className="border-b border-slate-200/80 hover:bg-transparent">
              <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3">DATE</TableHead>
              <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3">EXPENSE TYPE</TableHead>
              <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3">LINK TYPE</TableHead>
              <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3">PAYMENT ACCOUNT</TableHead>
              <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3">NOTES / DETAILS</TableHead>
              <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3 text-right">AMOUNT (₹)</TableHead>
              <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3 text-right">ACTIONS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRegister.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-xs text-slate-500">
                  No expense entries found for the selected period and filters.
                </TableCell>
              </TableRow>
            ) : (
              filteredRegister.map((e) => {
                const typeObj = expenseTypes.find((t) => t.id === e.expenseTypeId)
                const counterObj = counters.find((c) => c.id === e.counterId)
                const isInvoice = typeObj?.linkType === 'invoice' || Boolean(e.linkedInvoiceId)
                return (
                  <TableRow key={e.id} className="hover:bg-slate-50/80 border-b border-slate-100">
                    <TableCell className="text-slate-600 text-xs font-medium">{e.expenseDate}</TableCell>
                    <TableCell className="font-bold text-slate-900 text-xs">{typeObj?.name || 'General Expense'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] font-bold ${
                        isInvoice ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      }`}>
                        {isInvoice ? 'Invoice Linked' : 'Net Profit'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-700 text-xs font-medium">{counterObj?.name || '-'}</TableCell>
                    <TableCell className="text-slate-600 text-xs max-w-[220px] truncate">{e.notes || '-'}</TableCell>
                    <TableCell className="text-right font-mono font-extrabold text-slate-900 text-xs">
                      {formatCurrency(e.amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingExpense(e)
                            setExpenseTypeId(e.expenseTypeId)
                            setExpenseDate(e.expenseDate)
                            setAmount(e.amount.toString())
                            setSelectedCounterId(e.counterId || '')
                            setSupplierId(e.supplierId || '')
                            setLinkedInvoiceId(e.linkedInvoiceId || '')
                            setExpenseWithGst(Boolean(e.expenseWithGst))
                            setNotes(e.notes || '')
                            window.scrollTo({ top: 0, behavior: 'smooth' })
                          }}
                          disabled={isLocked}
                          className="h-7 w-7 p-0 text-slate-600 hover:bg-slate-100 rounded-lg"
                        >
                          <PencilSimple className="h-3.5 w-3.5" weight="bold" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteExpense(e)}
                          disabled={isLocked}
                          className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg"
                        >
                          <Trash className="h-3.5 w-3.5" weight="bold" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* POP-UP DIALOG from Diagram: Add / Manage Expense Types */}
      <Dialog open={manageTypesOpen} onOpenChange={setManageTypesOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <SlidersHorizontal className="h-5 w-5 text-indigo-600" weight="bold" />
              Add & Manage Expense Types
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 pt-2">
            
            {/* Create/Edit Form */}
            <form onSubmit={handleSaveType} className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                {editingType ? `Edit Type: ${editingType.name}` : 'Add New Expense Type'}
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-slate-700">Expense Type Name *</Label>
                  <Input
                    placeholder="e.g. Office Rent, Freight, Tea"
                    value={typeName}
                    onChange={(e) => setTypeName(e.target.value)}
                    className="h-8 text-xs bg-white"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-slate-700">Link Category *</Label>
                  <Select value={typeLinkType} onValueChange={(val: 'invoice' | 'netprofit') => setTypeLinkType(val)}>
                    <SelectTrigger className="h-8 text-xs bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="netprofit">Net Profit (General P&L)</SelectItem>
                      <SelectItem value="invoice">Invoice Linked (Purchase Cost)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-slate-700">Description (Optional)</Label>
                <Input
                  placeholder="Brief notes about this expense type..."
                  value={typeDescription}
                  onChange={(e) => setTypeDescription(e.target.value)}
                  className="h-8 text-xs bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                {editingType && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingType(null)
                      setTypeName('')
                      setTypeDescription('')
                      setTypeLinkType('netprofit')
                    }}
                    className="h-7 text-xs"
                  >
                    Cancel
                  </Button>
                )}
                <Button type="submit" size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white h-7 text-xs font-bold">
                  {editingType ? 'Update Type' : 'Save Expense Type'}
                </Button>
              </div>
            </form>

            {/* Configured Expense Types List */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Configured Expense Types</h4>
              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                {expenseTypes.map((et) => (
                  <div key={et.id} className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">{et.name}</span>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                          et.linkType === 'invoice' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        }`}>
                          {et.linkType === 'invoice' ? 'Invoice Linked' : 'Net Profit'}
                        </Badge>
                      </div>
                      {et.description && <p className="text-[11px] text-slate-500 mt-0.5">{et.description}</p>}
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingType(et)
                          setTypeName(et.name)
                          setTypeDescription(et.description || '')
                          setTypeLinkType(et.linkType || 'netprofit')
                        }}
                        className="h-7 w-7 p-0 text-slate-600 hover:bg-slate-100"
                      >
                        <PencilSimple className="h-3.5 w-3.5" weight="bold" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteType(et.id)}
                        className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                      >
                        <Trash className="h-3.5 w-3.5" weight="bold" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          <DialogFooter className="pt-2">
            <Button type="button" onClick={() => setManageTypesOpen(false)} className="h-8 text-xs font-bold">Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
