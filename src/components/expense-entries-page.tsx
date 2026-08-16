import { getChangedByLabel, getChangedByRole } from '@/lib/security-utils'
import { useState, useMemo } from 'react'
import { PeriodDateFilter, PeriodFilterState, defaultPeriodFilterState, isRecordInPeriod } from '@/components/period-date-filter'
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
  PencilSimple, 
  MagnifyingGlass, 
  SlidersHorizontal, 
  Receipt,
  FileText,
  Wallet,
  Check,
  CaretUpDown,
  ShieldCheck,
  Buildings,
  Calculator,
  Tag
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { 
  formatCurrency, 
  calculateExpenseTotals, 
  applyCounterBalanceDelta, 
  calculateExpenseTaxBreakdown 
} from '@/lib/calculations'
import { getStateName, getStateCode } from '@/lib/constants/indian-states'
import { StateSelector } from '@/components/state-selector'
import { getInvoiceQtyForUnit } from '@/lib/unit-conversion-service'
import { saveEntityRemote, deleteEntityRemote } from '@/lib/firebase-storage'
import { ThreeDotDropdown } from '@/components/ui/three-dot-dropdown'

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
  activeCompanyId?: string
}

export const COMMON_HSN_SAC_CODES = [
  { code: '9965', label: '9965 - Freight & Goods Transport (GTA)' },
  { code: '9972', label: '9972 - Real Estate Rent (Office / Godown)' },
  { code: '9987', label: '9987 - Maintenance & Machinery Repairs' },
  { code: '9983', label: '9983 - Professional & Legal Services' },
  { code: '9985', label: '9985 - Support & Security Services' },
  { code: '9967', label: '9967 - Loading & Handling Charges' },
  { code: '9954', label: '9954 - Works Contract & Construction' },
]

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
  onUpdateCashBank,
  activeCompanyId
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
  const [notes, setNotes] = useState('')

  // GST & ITC Form State
  const [hasGst, setHasGst] = useState(false)
  const [isRcm, setIsRcm] = useState(false)
  const [supplierName, setSupplierName] = useState('')
  const [supplierGstin, setSupplierGstin] = useState('')
  const [supplierStateCode, setSupplierStateCode] = useState('19')
  const [invoiceRefNo, setInvoiceRefNo] = useState('')
  const [invoiceRefDate, setInvoiceRefDate] = useState('')
  const [hsnSacCode, setHsnSacCode] = useState('')
  const [isTaxInclusive, setIsTaxInclusive] = useState(true)
  const [gstRate, setGstRate] = useState<number>(18)
  const [isItcEligible, setIsItcEligible] = useState(true)
  const [itcType, setItcType] = useState<'Inputs' | 'Capital Goods' | 'Input Services' | 'Ineligible'>('Input Services')

  // Modal State for Manage Expense Types
  const [manageTypesOpen, setManageTypesOpen] = useState(false)
  const [editingType, setEditingType] = useState<ExpenseType | null>(null)
  const [typeName, setTypeName] = useState('')
  const [typeDescription, setTypeDescription] = useState('')
  const [typeLinkType, setTypeLinkType] = useState<'invoice' | 'netprofit'>('netprofit')
  const [catIsGstApplicable, setCatIsGstApplicable] = useState(true)
  const [catDefaultSacCode, setCatDefaultSacCode] = useState('')
  const [catDefaultGstRate, setCatDefaultGstRate] = useState<number>(18)
  const [catIsRcmDefault, setCatIsRcmDefault] = useState(false)
  const [catItcClassification, setCatItcClassification] = useState<'Input Services' | 'Inputs / Consumables' | 'Capital Goods' | 'Ineligible'>('Input Services')

  // Date / FY Filters State
  const [periodFilter, setPeriodFilter] = useState<PeriodFilterState>(defaultPeriodFilterState)

  // Search & Register Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterCounter, setFilterCounter] = useState<string>('all')
  const [filterGstOnly, setFilterGstOnly] = useState<string>('all')

  const selectedExpenseType = expenseTypes.find((et) => et.id === expenseTypeId)
  const isInvoiceLinked = selectedExpenseType?.linkType === 'invoice' || selectedExpenseType?.costLinkingType === 'invoice_landed'

  // Master-Child Category Selection Handler (Tally / Zoho Books Architecture)
  const handleCategoryChange = (catId: string) => {
    setExpenseTypeId(catId)
    const cat = expenseTypes.find((t) => t.id === catId)
    if (!cat) return

    // Auto-populate statutory master defaults
    if (cat.isGstApplicable !== undefined) {
      setHasGst(cat.isGstApplicable)
    }
    if (cat.defaultSacCode) {
      setHsnSacCode(cat.defaultSacCode)
    }
    if (typeof cat.defaultGstRate === 'number') {
      setGstRate(cat.defaultGstRate)
    }
    if (cat.isRcmDefault !== undefined) {
      setIsRcm(cat.isRcmDefault)
    }
    if (cat.itcClassification) {
      const itc = cat.itcClassification === 'Inputs / Consumables' ? 'Inputs' : (cat.itcClassification as any)
      setItcType(itc)
      setIsItcEligible(itc !== 'Ineligible')
    }
  }

  // Handle GSTIN change with state detection
  const handleGstinChange = (value: string) => {
    const cleanGstin = value.trim().toUpperCase()
    setSupplierGstin(cleanGstin)
    if (cleanGstin.length >= 2) {
      const code = cleanGstin.slice(0, 2)
      if (/^\d{2}$/.test(code)) {
        setSupplierStateCode(code)
      }
    }
  }

  // Real-time GST calculation preview
  const taxBreakdown = useMemo(() => {
    return calculateExpenseTaxBreakdown({
      amount: parseFloat(amount) || 0,
      hasGst,
      isTaxInclusive,
      gstRate,
      supplierStateCode,
      companyStateCode: '19'
    })
  }, [amount, hasGst, isTaxInclusive, gstRate, supplierStateCode])

  // Reset Entry Form
  const resetForm = () => {
    setEditingExpense(null)
    setExpenseTypeId('')
    setExpenseDate(new Date().toISOString().split('T')[0])
    setAmount('')
    setSelectedCounterId('')
    setSupplierId('')
    setLinkedInvoiceId('')
    setNotes('')
    setHasGst(false)
    setIsRcm(false)
    setSupplierName('')
    setSupplierGstin('')
    setSupplierStateCode('19')
    setInvoiceRefNo('')
    setInvoiceRefDate('')
    setHsnSacCode('')
    setIsTaxInclusive(true)
    setGstRate(18)
    setIsItcEligible(true)
    setItcType('Input Services')
  }

  // Start Edit Mode
  const handleStartEdit = (entry: ExpenseEntry) => {
    setEditingExpense(entry)
    setExpenseTypeId(entry.expenseTypeId || entry.categoryId || '')
    setExpenseDate(entry.expenseDate || entry.date || new Date().toISOString().split('T')[0])
    setAmount(String(entry.amount || ''))
    setSelectedCounterId(entry.counterId || entry.paymentAccountId || '')
    setSupplierId(entry.supplierId || '')
    setLinkedInvoiceId(entry.linkedInvoiceId || '')
    setNotes(entry.notes || '')
    const gstActive = Boolean(entry.hasGst ?? entry.expenseWithGst)
    setHasGst(gstActive)
    setIsRcm(Boolean(entry.isRcm))
    setSupplierName(entry.supplierName || '')
    setSupplierGstin(entry.supplierGstin || '')
    setSupplierStateCode(entry.supplierStateCode || (entry.supplierGstin ? entry.supplierGstin.slice(0, 2) : '19'))
    setInvoiceRefNo(entry.invoiceRefNo || entry.originalInvoiceNumber || '')
    setInvoiceRefDate(entry.invoiceRefDate || '')
    setHsnSacCode(entry.hsnSacCode || '')
    setIsTaxInclusive(entry.isTaxInclusive !== false)
    setGstRate(typeof entry.gstRate === 'number' ? entry.gstRate : 18)
    setIsItcEligible(entry.isItcEligible !== false)
    setItcType(entry.itcType || 'Input Services')

    // Scroll to form smoothly
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Filter Expense Entries by Selected Date / FY Mode
  const dateFilteredExpenses = useMemo(() => {
    return expenseEntries.filter((e) => isRecordInPeriod(e.expenseDate, e.fy, periodFilter, currentFY))
  }, [expenseEntries, currentFY, periodFilter])

  // Summary Card Statistics
  const { 
    totalExpenses, 
    invoiceLinkedExpenses, 
    netProfitExpenses, 
    totalTaxable,
    totalInputCgst,
    totalInputSgst,
    totalInputIgst,
    totalItcEligible
  } = useMemo(() => {
    return calculateExpenseTotals(dateFilteredExpenses, expenseTypes)
  }, [dateFilteredExpenses, expenseTypes])

  // Filtered Register Data for Table
  const filteredRegister = useMemo(() => {
    return dateFilteredExpenses.filter((e) => {
      if (filterType !== 'all' && e.expenseTypeId !== filterType) return false
      if (filterCounter !== 'all' && e.counterId !== filterCounter) return false
      if (filterGstOnly === 'gst_only' && !(e.hasGst || e.expenseWithGst)) return false
      if (filterGstOnly === 'non_gst' && (e.hasGst || e.expenseWithGst)) return false
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase()
        const typeObj = expenseTypes.find((t) => t.id === e.expenseTypeId)
        const matchesNotes = (e.notes || '').toLowerCase().includes(term)
        const matchesType = (typeObj?.name || '').toLowerCase().includes(term)
        const matchesRef = (e.id || '').toLowerCase().includes(term) || (e.invoiceRefNo || '').toLowerCase().includes(term)
        const matchesGstin = (e.supplierGstin || '').toLowerCase().includes(term) || (e.supplierName || '').toLowerCase().includes(term)
        if (!matchesNotes && !matchesType && !matchesRef && !matchesGstin) return false
      }
      return true
    })
  }, [dateFilteredExpenses, filterType, filterCounter, filterGstOnly, searchTerm, expenseTypes])

  const filteredRegisterTotal = useMemo(() => {
    return calculateExpenseTotals(filteredRegister).totalExpenses
  }, [filteredRegister])

  // Save Expense Entry Submit
  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault()
    if (isLocked) return toast.error('Data is locked.')
    if (!expenseTypeId) return toast.error('Select an expense type')
    const rawAmt = parseFloat(amount)
    if (!rawAmt || rawAmt <= 0) return toast.error('Enter a valid amount')
    if (!expenseDate) return toast.error('Select an expense date')
    if (!selectedCounterId) return toast.error('Select a payment account')
    if (isInvoiceLinked && !linkedInvoiceId) {
      toast.error('Linked Purchase Invoice is mandatory for invoice-linked expenses!')
      return
    }

    if (hasGst && !isRcm && supplierGstin.trim() && supplierGstin.trim().length !== 15) {
      toast.error('Invalid GSTIN', { description: 'Indian GSTIN must be exactly 15 alphanumeric characters' })
      return
    }

    const selectedCounter = counters.find((c) => c.id === selectedCounterId)
    const typeObj = expenseTypes.find((t) => t.id === expenseTypeId)
    const grossAmountToPay = taxBreakdown.totalExpenseAmount

    if (editingExpense) {
      // Revert old counter balance if counter changed or amount updated
      let nextCounters = [...counters]
      let nextTx = [...transactions]

      const oldGross = editingExpense.totalExpenseAmount || editingExpense.amount || 0
      if (editingExpense.counterId) {
        nextCounters = applyCounterBalanceDelta(nextCounters, editingExpense.counterId, oldGross)
        nextTx = nextTx.filter((t) => t.id !== `tx-exp-${editingExpense.id}`)
      }

      // Deduct new gross amount from new selected counter
      nextCounters = applyCounterBalanceDelta(nextCounters, selectedCounterId, -grossAmountToPay)

      const cashBankTx: CashBankTransaction = {
        id: `tx-exp-${editingExpense.id}`,
        date: expenseDate,
        counterId: selectedCounterId,
        counterName: selectedCounter?.name || 'Counter',
        type: 'Out',
        amount: grossAmountToPay,
        narration: `Expense: ${typeObj?.name || 'General'}${hasGst ? ` (GST ₹${taxBreakdown.totalTaxAmount})` : ''} - ${notes || 'Updated entry'}`
      }

      const updatedEntry: ExpenseEntry = {
        ...editingExpense,
        date: expenseDate,
        expenseDate,
        categoryId: expenseTypeId,
        categoryName: typeObj?.name || 'General',
        expenseTypeId,
        amount: rawAmt,
        paymentAccountId: selectedCounterId,
        paymentAccountName: selectedCounter?.name || 'Counter',
        counterId: selectedCounterId,
        counterName: selectedCounter?.name || 'Counter',
        supplierId: supplierId || undefined,
        linkedInvoiceId: linkedInvoiceId || undefined,
        notes: notes.trim() || undefined,
        fy: currentFY,
        
        // GST & ITC Fields
        hasGst,
        expenseWithGst: hasGst,
        isRcm: hasGst ? isRcm : false,
        supplierName: supplierName.trim() || undefined,
        supplierGstin: supplierGstin.trim() || undefined,
        supplierStateCode: hasGst ? supplierStateCode : undefined,
        invoiceRefNo: invoiceRefNo.trim() || undefined,
        invoiceRefDate: invoiceRefDate || undefined,
        hsnSacCode: hsnSacCode.trim() || undefined,
        isTaxInclusive,
        gstRate: hasGst ? gstRate : 0,
        taxableAmount: taxBreakdown.taxableAmount,
        cgstAmount: taxBreakdown.cgstAmount,
        sgstAmount: taxBreakdown.sgstAmount,
        igstAmount: taxBreakdown.igstAmount,
        totalExpenseAmount: grossAmountToPay,
        isInterState: taxBreakdown.isInterState,
        isItcEligible: hasGst ? isItcEligible : false,
        itcType: hasGst ? itcType : undefined,
        updatedAt: new Date().toISOString(),

        history: [
          ...(editingExpense.history || []),
          {
            timestamp: new Date().toISOString(),
            action: 'updated',
            changedBy: getChangedByLabel(),
            changedByRole: getChangedByRole(),
            changes: [
              ...(editingExpense.amount !== rawAmt ? [{ field: 'Amount', from: String(editingExpense.amount), to: String(rawAmt) }] : []),
              ...(editingExpense.expenseTypeId !== expenseTypeId ? [{ field: 'Type', from: expenseTypes.find(t => t.id === editingExpense.expenseTypeId)?.name || '-', to: typeObj?.name || '-' }] : []),
              ...(editingExpense.expenseDate !== expenseDate ? [{ field: 'Date', from: editingExpense.expenseDate, to: expenseDate }] : []),
              ...((editingExpense.notes || '') !== (notes.trim() || '') ? [{ field: 'Notes', from: editingExpense.notes || '-', to: notes.trim() || '-' }] : [])
            ]
          }
        ]
      }

      setExpenseEntries((prev) => prev.map((item) => (item.id === editingExpense.id ? updatedEntry : item)))
      if (activeCompanyId) {
        void saveEntityRemote(activeCompanyId, 'expenseEntries', updatedEntry)
      }
      onUpdateCashBank(nextCounters, [cashBankTx, ...nextTx])
      toast.success('Expense entry updated successfully')
    } else {
      const newId = `exp-${Date.now()}`
      
      // Deduct gross amount from cash/bank counter balance
      const nextCounters = applyCounterBalanceDelta(counters, selectedCounterId, -grossAmountToPay)

      const cashBankTx: CashBankTransaction = {
        id: `tx-exp-${newId}`,
        date: expenseDate,
        counterId: selectedCounterId,
        counterName: selectedCounter?.name || 'Counter',
        type: 'Out',
        amount: grossAmountToPay,
        narration: `Expense: ${typeObj?.name || 'General'}${hasGst ? ` (GST ₹${taxBreakdown.totalTaxAmount})` : ''} - ${notes || 'New entry'}`
      }

      const newEntry: ExpenseEntry = {
        id: newId,
        date: expenseDate,
        expenseDate,
        categoryId: expenseTypeId,
        categoryName: typeObj?.name || 'General',
        expenseTypeId,
        amount: rawAmt,
        paymentAccountId: selectedCounterId,
        paymentAccountName: selectedCounter?.name || 'Counter',
        counterId: selectedCounterId,
        counterName: selectedCounter?.name || 'Counter',
        supplierId: supplierId || undefined,
        linkedInvoiceId: linkedInvoiceId || undefined,
        notes: notes.trim() || undefined,
        fy: currentFY,
        
        // GST & ITC Fields
        hasGst,
        expenseWithGst: hasGst,
        isRcm: hasGst ? isRcm : false,
        supplierName: supplierName.trim() || undefined,
        supplierGstin: supplierGstin.trim() || undefined,
        supplierStateCode: hasGst ? supplierStateCode : undefined,
        invoiceRefNo: invoiceRefNo.trim() || undefined,
        invoiceRefDate: invoiceRefDate || undefined,
        hsnSacCode: hsnSacCode.trim() || undefined,
        isTaxInclusive,
        gstRate: hasGst ? gstRate : 0,
        taxableAmount: taxBreakdown.taxableAmount,
        cgstAmount: taxBreakdown.cgstAmount,
        sgstAmount: taxBreakdown.sgstAmount,
        igstAmount: taxBreakdown.igstAmount,
        totalExpenseAmount: grossAmountToPay,
        isInterState: taxBreakdown.isInterState,
        isItcEligible: hasGst ? isItcEligible : false,
        itcType: hasGst ? itcType : undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),

        history: [
          {
            timestamp: new Date().toISOString(),
            action: 'created',
            changedBy: getChangedByLabel(),
            changedByRole: getChangedByRole(),
            changes: [
              { field: 'Type', from: '', to: typeObj?.name || '-' },
              { field: 'Amount', from: '', to: String(grossAmountToPay) },
              { field: 'Date', from: '', to: expenseDate },
              { field: 'Account', from: '', to: selectedCounter?.name || '-' }
            ]
          }
        ]
      }

      setExpenseEntries((prev) => [newEntry, ...prev])
      if (activeCompanyId) {
        void saveEntityRemote(activeCompanyId, 'expenseEntries', newEntry)
      }
      onUpdateCashBank(nextCounters, [cashBankTx, ...transactions])
      toast.success('Expense entry created successfully')
    }

    resetForm()
  }

  // Delete Expense Entry
  const handleDeleteExpense = (entry: ExpenseEntry) => {
    if (isLocked) return toast.error('Data is locked.')
    if (!window.confirm('Are you sure you want to delete this expense entry? Balance will be restored.')) return

    const grossToRestore = entry.totalExpenseAmount || entry.amount || 0
    const nextCounters = entry.counterId 
      ? applyCounterBalanceDelta(counters, entry.counterId, grossToRestore)
      : counters

    const nextTx = transactions.filter((t) => t.id !== `tx-exp-${entry.id}`)

    setExpenseEntries((prev) => prev.filter((item) => item.id !== entry.id))
    if (activeCompanyId) {
      void deleteEntityRemote(activeCompanyId, 'expenseEntries', entry.id)
    }
    onUpdateCashBank(nextCounters, nextTx)
    toast.success('Expense entry deleted successfully')
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6 text-blue-600" weight="duotone" />
            Expense Entries & Input Tax Credit (ITC)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Log operational & freight expenses with Indian GST compliance, Supplier GSTIN validation, and GSTR-3B ITC claims
          </p>
        </div>

        <div className="flex items-center gap-3">
          <PeriodDateFilter value={periodFilter} onChange={setPeriodFilter} currentFY={currentFY} />
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditingType(null)
              setTypeName('')
              setTypeDescription('')
              setTypeLinkType('netprofit')
              setManageTypesOpen(true)
            }}
            className="h-9 gap-1.5 text-xs font-semibold rounded-xl bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
          >
            <SlidersHorizontal className="h-4 w-4 text-slate-500" />
            Manage Categories
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Total Gross Expenses */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Total Expenses</p>
            <p className="text-2xl font-extrabold text-slate-900 tracking-tight">{formatCurrency(totalExpenses)}</p>
            <p className="text-xs text-slate-400 mt-1">Taxable: {formatCurrency(totalTaxable)}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center shrink-0">
            <Calculator className="h-6 w-6" weight="duotone" />
          </div>
        </div>

        {/* Card 2: Eligible Input Tax Credit (ITC) */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 mb-1">Eligible GST ITC</p>
            <p className="text-2xl font-extrabold text-emerald-600 tracking-tight">{formatCurrency(totalItcEligible)}</p>
            <p className="text-xs text-emerald-600/80 mt-1">
              CGST: {formatCurrency(totalInputCgst)} | SGST: {formatCurrency(totalInputSgst)}
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100/60 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-6 w-6" weight="duotone" />
          </div>
        </div>

        {/* Card 3: Direct Invoice Linked Costs */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Invoice Linked Costs</p>
            <p className="text-2xl font-extrabold text-[#0256e8] tracking-tight">{formatCurrency(invoiceLinkedExpenses)}</p>
            <p className="text-xs text-slate-400 mt-1">Freight & Landed Purchase Costs</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#0256e8] border border-blue-100/60 flex items-center justify-center shrink-0">
            <LinkSimple className="h-6 w-6" weight="duotone" />
          </div>
        </div>

        {/* Card 4: Net Profit Overhead Expenses */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">P&L Overheads</p>
            <p className="text-2xl font-extrabold text-indigo-600 tracking-tight">{formatCurrency(netProfitExpenses)}</p>
            <p className="text-xs text-slate-400 mt-1">Rent, Utilities, Admin & Repairs</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100/60 flex items-center justify-center shrink-0">
            <Wallet className="h-6 w-6" weight="duotone" />
          </div>
        </div>

      </div>

      {/* Expense Entry Creation / Edit Form Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-2xs space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Plus className="h-5 w-5" weight="bold" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {editingExpense ? `Edit Expense Entry #${editingExpense.id}` : 'Create New Expense Voucher'}
              </h2>
              <p className="text-xs text-slate-500">Record a business expense with tax breakdown and automated cash/bank deduction</p>
            </div>
          </div>

          {editingExpense && (
            <Button variant="outline" size="sm" onClick={resetForm} className="h-8 text-xs font-semibold">
              Cancel Editing
            </Button>
          )}
        </div>

        <form onSubmit={handleSaveExpense} className="space-y-5">
          
          {/* Row 1: Category, Amount, Date, Payment Account */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Expense Type / Category */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Expense Category <span className="text-red-500">*</span></Label>
              <Select value={expenseTypeId} onValueChange={handleCategoryChange}>
                <SelectTrigger className="w-full h-9 bg-white text-xs font-medium">
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent>
                  {expenseTypes.map((et) => (
                    <SelectItem key={et.id} value={et.id}>
                      <span className="flex items-center justify-between w-full gap-2">
                        <span>{et.name}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          et.linkType === 'invoice' || et.costLinkingType === 'invoice_landed' ? 'bg-blue-100 text-blue-700' : 'bg-indigo-100 text-indigo-700'
                        }`}>
                          {et.linkType === 'invoice' || et.costLinkingType === 'invoice_landed' ? 'Invoice Linked' : 'Net Profit'}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Expense Amount */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">
                Expense Amount (₹) <span className="text-red-500">*</span>
              </Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-9 text-xs font-bold text-slate-900 font-mono"
                required
              />
            </div>

            {/* Expense Date */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Voucher Date <span className="text-red-500">*</span></Label>
              <Input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="h-9 text-xs font-medium"
                required
              />
            </div>

            {/* Payment Account */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Paid Through (Counter) <span className="text-red-500">*</span></Label>
              <Select value={selectedCounterId} onValueChange={setSelectedCounterId}>
                <SelectTrigger className="w-full h-9 bg-white text-xs font-medium">
                  <SelectValue placeholder="Select Account / Cash Box" />
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

          {/* Invoice Linking Row if category is invoice-linked */}
          {isInvoiceLinked && (
            <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-200/70 space-y-2">
              <Label className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                <LinkSimple className="h-4 w-4 text-blue-600" weight="bold" />
                Linked Purchase Invoice <span className="text-red-500 font-extrabold">*</span>
              </Label>

              <Popover open={invoiceSearchOpen} onOpenChange={setInvoiceSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={invoiceSearchOpen}
                    className={cn(
                      "w-full h-9 justify-between bg-white text-xs text-left font-normal border-blue-200",
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
                      <span className="text-slate-400">Select Invoice to Link Expense (Mandatory for Freight/Direct Costs)...</span>
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
                                if (inv.supplierId) {
                                  setSupplierId(inv.supplierId)
                                  if (!supplierName) setSupplierName(supp?.name || '')
                                  if (!supplierGstin && supp?.gstin) handleGstinChange(supp.gstin)
                                }
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

          {/* GST & Input Tax Credit (ITC) Section */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" weight="duotone" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">GST Compliance & Input Tax Credit (ITC)</h3>
                  <p className="text-[11px] text-slate-500">Record vendor tax details, RCM applicability, and claim eligible GST input credit</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {hasGst && (
                  <div className="flex items-center gap-2 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                    <Switch
                      checked={isRcm}
                      onCheckedChange={(checked) => {
                        setIsRcm(checked)
                        if (checked) {
                          setGstRate(5)
                          if (!hsnSacCode) setHsnSacCode('9965')
                        }
                      }}
                      id="rcm-toggle-switch"
                    />
                    <Label htmlFor="rcm-toggle-switch" className="text-xs font-bold text-amber-900 cursor-pointer">
                      Applicable for RCM (Reverse Charge)
                    </Label>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Switch
                    checked={hasGst}
                    onCheckedChange={setHasGst}
                    id="gst-toggle-switch"
                  />
                  <Label htmlFor="gst-toggle-switch" className="text-xs font-bold text-slate-800 cursor-pointer">
                    {hasGst ? 'GST Registered Expense' : 'Non-GST / Unregistered'}
                  </Label>
                </div>
              </div>
            </div>

            {hasGst && (
              <div className="space-y-4 pt-1 animate-in fade-in-50 duration-200">
                
                {isRcm && (
                  <div className="p-3 bg-amber-50/90 rounded-xl border border-amber-300/80 text-xs text-amber-900 flex items-start gap-2">
                    <ShieldCheck className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" weight="bold" />
                    <div>
                      <span className="font-bold">Reverse Charge Mechanism (RCM) Active:</span> Tax liability is payable via Cash Ledger under Section 9(3) and eligible for simultaneous ITC claim in GSTR-3B Table 4(A)(3). Supplier GSTIN is optional.
                    </div>
                  </div>
                )}

                {/* Vendor GSTIN & State Auto-Detection */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700">Vendor / Supplier Name</Label>
                    <Input
                      type="text"
                      placeholder="e.g. Apex Logistics / Landlord Name"
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      className="h-9 text-xs bg-white"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700">
                      Supplier GSTIN {isRcm ? '(Optional for RCM)' : '(15 Digits)'}
                    </Label>
                    <Input
                      type="text"
                      placeholder={isRcm ? "Optional (Unregistered Vendor)" : "19AAAAA0000A1Z5"}
                      maxLength={15}
                      value={supplierGstin}
                      onChange={(e) => handleGstinChange(e.target.value)}
                      className="h-9 text-xs font-mono font-bold uppercase bg-white"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700">Supplier State / POS</Label>
                    <StateSelector
                      value={supplierStateCode}
                      onChange={(code) => setSupplierStateCode(code)}
                    />
                  </div>

                </div>

                {/* Invoice Ref & HSN/SAC */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700">Vendor Tax Invoice No.</Label>
                    <Input
                      type="text"
                      placeholder="INV-9821"
                      value={invoiceRefNo}
                      onChange={(e) => setInvoiceRefNo(e.target.value)}
                      className="h-9 text-xs bg-white font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700">Vendor Invoice Date</Label>
                    <Input
                      type="date"
                      value={invoiceRefDate}
                      onChange={(e) => setInvoiceRefDate(e.target.value)}
                      className="h-9 text-xs bg-white font-medium"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700">HSN / SAC Code</Label>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="text"
                        placeholder="9965"
                        value={hsnSacCode}
                        onChange={(e) => setHsnSacCode(e.target.value.trim())}
                        className="h-9 text-xs bg-white font-mono font-bold w-28"
                      />
                      <Select onValueChange={(val) => setHsnSacCode(val)}>
                        <SelectTrigger className="h-9 text-xs bg-white flex-1 truncate">
                          <SelectValue placeholder="Common SACs" />
                        </SelectTrigger>
                        <SelectContent>
                          {COMMON_HSN_SAC_CODES.map((s) => (
                            <SelectItem key={s.code} value={s.code} className="text-xs">
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                </div>

                {/* Tax Rate & Tax Inclusion Mode */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                  
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700">GST Rate (%)</Label>
                    <Select value={String(gstRate)} onValueChange={(val) => setGstRate(Number(val))}>
                      <SelectTrigger className="h-9 text-xs bg-white font-bold font-mono">
                        <SelectValue placeholder="18%" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">0% (Exempted)</SelectItem>
                        <SelectItem value="5">5% (Transport / Basic Services)</SelectItem>
                        <SelectItem value="12">12% (Contract & Freight)</SelectItem>
                        <SelectItem value="18">18% (Standard Business Services)</SelectItem>
                        <SelectItem value="28">28% (Luxury / Special)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700">Amount Tax Treatment</Label>
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        type="button"
                        variant={isTaxInclusive ? "default" : "outline"}
                        size="sm"
                        onClick={() => setIsTaxInclusive(true)}
                        className={`h-8 text-xs font-semibold rounded-lg flex-1 ${isTaxInclusive ? 'bg-blue-600 text-white' : 'bg-white'}`}
                      >
                        Tax Inclusive (MRP)
                      </Button>
                      <Button
                        type="button"
                        variant={!isTaxInclusive ? "default" : "outline"}
                        size="sm"
                        onClick={() => setIsTaxInclusive(false)}
                        className={`h-8 text-xs font-semibold rounded-lg flex-1 ${!isTaxInclusive ? 'bg-blue-600 text-white' : 'bg-white'}`}
                      >
                        Tax Exclusive (+GST)
                      </Button>
                    </div>
                  </div>

                  {/* ITC Eligibility & Type */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700">GSTR-3B ITC Classification</Label>
                    <Select value={itcType} onValueChange={(val: any) => {
                      setItcType(val)
                      setIsItcEligible(val !== 'Ineligible')
                    }}>
                      <SelectTrigger className="h-9 text-xs bg-white font-semibold">
                        <SelectValue placeholder="Input Services" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Input Services">Input Services (Table 4A-5)</SelectItem>
                        <SelectItem value="Inputs">Inputs / Consumables (Table 4A-5)</SelectItem>
                        <SelectItem value="Capital Goods">Capital Goods (Table 4A-5)</SelectItem>
                        <SelectItem value="Ineligible">Ineligible (Sec 17(5) Blocked)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                </div>

                {/* Live Tax Breakdown Card */}
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                      Tax Computation Breakdown ({taxBreakdown.isInterState ? 'Inter-State IGST' : 'Intra-State CGST+SGST'})
                    </span>
                    <p className="text-xs text-emerald-700">
                      Base Taxable: <strong className="font-mono text-slate-900">{formatCurrency(taxBreakdown.taxableAmount)}</strong>
                    </p>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono">
                    {!taxBreakdown.isInterState ? (
                      <>
                        <div className="bg-white px-3 py-1.5 rounded-lg border border-emerald-200 text-right">
                          <span className="text-[10px] text-slate-500 block font-sans">CGST ({taxBreakdown.cgstRate}%)</span>
                          <span className="font-bold text-emerald-700">{formatCurrency(taxBreakdown.cgstAmount)}</span>
                        </div>
                        <div className="bg-white px-3 py-1.5 rounded-lg border border-emerald-200 text-right">
                          <span className="text-[10px] text-slate-500 block font-sans">SGST ({taxBreakdown.sgstRate}%)</span>
                          <span className="font-bold text-emerald-700">{formatCurrency(taxBreakdown.sgstAmount)}</span>
                        </div>
                      </>
                    ) : (
                      <div className="bg-white px-3 py-1.5 rounded-lg border border-emerald-200 text-right">
                        <span className="text-[10px] text-slate-500 block font-sans">IGST ({taxBreakdown.igstRate}%)</span>
                        <span className="font-bold text-emerald-700">{formatCurrency(taxBreakdown.igstAmount)}</span>
                      </div>
                    )}

                    <div className="bg-emerald-700 text-white px-4 py-1.5 rounded-lg shadow-xs text-right">
                      <span className="text-[10px] text-emerald-100 block font-sans uppercase font-bold">Total Gross Payable</span>
                      <span className="font-extrabold text-sm">{formatCurrency(taxBreakdown.totalExpenseAmount)}</span>
                    </div>
                  </div>
                </div>

              </div>
            )}

          </div>

          {/* Notes / Remarks */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700">Notes / Narration</Label>
            <Textarea
              placeholder="Enter expense details, vendor remarks, or voucher reference..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-xs min-h-[50px] bg-white"
            />
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
            {editingExpense && (
              <Button type="button" variant="outline" onClick={resetForm} className="h-9 px-5 text-xs font-semibold rounded-xl">
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              disabled={isLocked}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-9 px-7 rounded-xl text-xs shadow-md shadow-blue-600/20"
            >
              {editingExpense ? 'Update Expense Voucher' : 'Save Expense Voucher'}
            </Button>
          </div>

        </form>
      </div>

      {/* Expenses History Register */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        
        {/* Register Header */}
        <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <FileText className="h-5 w-5" weight="duotone" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Expenses History Register</h2>
              <p className="text-xs text-slate-500">Chronological record of operational & GST expenses</p>
            </div>
          </div>

          <span className="bg-slate-100 text-slate-800 text-xs font-bold px-3.5 py-1.5 rounded-full border border-slate-200/80 font-mono">
            Total Filtered: {formatCurrency(filteredRegisterTotal)}
          </span>
        </div>

        {/* Filter Sub-bar */}
        <div className="px-5 py-3 bg-slate-50/70 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            
            {/* Filter by Category */}
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

            {/* Filter by GST Status */}
            <Select value={filterGstOnly} onValueChange={setFilterGstOnly}>
              <SelectTrigger className="w-36 h-8 bg-white border-slate-200 text-xs font-medium rounded-xl">
                <span className="text-slate-400 mr-1">GST:</span>
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Entries</SelectItem>
                <SelectItem value="gst_only">GST Only</SelectItem>
                <SelectItem value="non_gst">Non-GST</SelectItem>
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
                placeholder="Search vendor / GSTIN..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 pl-8 text-xs bg-white border-slate-200 rounded-xl w-48"
              />
            </div>
          </div>

          <span className="text-xs text-slate-500 font-medium">
            {filteredRegister.length} records
          </span>
        </div>

        {/* Expenses Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-[#edf3fc]">
              <TableRow className="border-b border-slate-200/80 hover:bg-transparent">
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3">Date</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3">Expense Category</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3">Vendor / GSTIN</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3">HSN/SAC</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3 text-right">Taxable (₹)</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3 text-right">GST Breakup</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3 text-right">Total Amount (₹)</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3">ITC Status</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRegister.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center text-xs text-slate-500">
                    No expense entries found for the selected period and filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredRegister.map((e) => {
                  const typeObj = expenseTypes.find((t) => t.id === e.expenseTypeId)
                  const isGst = Boolean(e.hasGst || e.expenseWithGst)
                  const grossAmount = e.totalExpenseAmount || e.amount || 0
                  const taxableAmount = e.taxableAmount ?? (isGst ? e.amount : e.amount)
                  const totalTax = (e.cgstAmount || 0) + (e.sgstAmount || 0) + (e.igstAmount || 0)

                  return (
                    <TableRow key={e.id} className="hover:bg-slate-50/80 border-b border-slate-100">
                      <TableCell className="text-slate-600 text-xs font-medium whitespace-nowrap">{e.expenseDate}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 text-xs">{typeObj?.name || 'General Expense'}</span>
                          {e.linkedInvoiceId && (
                            <span className="text-[10px] text-blue-600 font-semibold flex items-center gap-1">
                              <LinkSimple className="h-3 w-3" /> Linked to Invoice
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {e.supplierName || e.supplierGstin ? (
                          <div className="flex flex-col text-xs">
                            <span className="font-semibold text-slate-900">{e.supplierName || 'Vendor'}</span>
                            {e.supplierGstin && (
                              <span className="font-mono text-[10px] text-slate-500">{e.supplierGstin}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {e.hsnSacCode ? (
                          <span className="font-mono text-xs font-bold text-slate-700">{e.hsnSacCode}</span>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-700">
                        {formatCurrency(taxableAmount)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {isGst && totalTax > 0 ? (
                          <div className="flex flex-col items-end">
                            <span className="font-bold text-emerald-700">+{formatCurrency(totalTax)}</span>
                            <span className="text-[9px] text-slate-400 font-sans">
                              {e.isInterState ? `IGST ${e.gstRate}%` : `CGST+SGST ${e.gstRate}%`}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono font-extrabold text-slate-900 text-xs whitespace-nowrap">
                        {formatCurrency(grossAmount)}
                      </TableCell>
                      <TableCell>
                        {isGst && totalTax > 0 ? (
                          <Badge variant="outline" className={`text-[10px] font-bold ${
                            e.isItcEligible !== false && e.itcType !== 'Ineligible'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            {e.isItcEligible !== false && e.itcType !== 'Ineligible' 
                              ? `ITC: ${e.itcType || 'Eligible'}` 
                              : 'Ineligible'}
                          </Badge>
                        ) : (
                          <span className="text-slate-400 text-xs">Non-GST</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={isLocked}
                            onClick={() => handleStartEdit(e)}
                            className="h-7 w-7 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                          >
                            <PencilSimple className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={isLocked}
                            onClick={() => handleDeleteExpense(e)}
                            className="h-7 w-7 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                          >
                            <Trash className="h-4 w-4" />
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
      </div>

      {/* Manage Expense Categories Modal */}
      <Dialog open={manageTypesOpen} onOpenChange={setManageTypesOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-blue-600" />
              Manage Expense Categories (Master Configuration)
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <div className="space-y-1">
                <Label className="text-xs font-bold">Category Name *</Label>
                <Input
                  placeholder="e.g. Freight & Transportation, Office Rent, Electricity"
                  value={typeName}
                  onChange={(e) => setTypeName(e.target.value)}
                  className="h-8 text-xs bg-white"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold">Cost Linking Type *</Label>
                <Select value={typeLinkType} onValueChange={(val: any) => setTypeLinkType(val)}>
                  <SelectTrigger className="h-8 text-xs bg-white font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="netprofit">Net Profit (General Overhead)</SelectItem>
                    <SelectItem value="invoice">Invoice Landed Cost (Direct Freight/Handling)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Master Statutory GST Defaults */}
              <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-slate-800">GST Applicable by Default</Label>
                  <Switch
                    checked={catIsGstApplicable}
                    onCheckedChange={setCatIsGstApplicable}
                    id="cat-gst-switch"
                  />
                </div>

                {catIsGstApplicable && (
                  <div className="space-y-2.5 pt-1 border-t border-slate-100 animate-in fade-in-50 duration-150">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold text-slate-600">Default SAC Code</Label>
                        <div className="flex items-center gap-1">
                          <Input
                            placeholder="9965"
                            value={catDefaultSacCode}
                            onChange={(e) => setCatDefaultSacCode(e.target.value.trim())}
                            className="h-7 text-xs font-mono font-bold w-20"
                          />
                          <Select onValueChange={(val) => setCatDefaultSacCode(val)}>
                            <SelectTrigger className="h-7 text-[11px] flex-1 truncate">
                              <SelectValue placeholder="SAC" />
                            </SelectTrigger>
                            <SelectContent>
                              {COMMON_HSN_SAC_CODES.map(s => (
                                <SelectItem key={s.code} value={s.code} className="text-xs">{s.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold text-slate-600">Default GST Rate (%)</Label>
                        <Select value={String(catDefaultGstRate)} onValueChange={(val) => setCatDefaultGstRate(Number(val))}>
                          <SelectTrigger className="h-7 text-xs font-bold font-mono">
                            <SelectValue placeholder="18%" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">0% (Exempt)</SelectItem>
                            <SelectItem value="5">5% (Transport / Basic)</SelectItem>
                            <SelectItem value="12">12% (Standard Concession)</SelectItem>
                            <SelectItem value="18">18% (Standard 18%)</SelectItem>
                            <SelectItem value="28">28% (Luxury)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 items-center pt-1">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={catIsRcmDefault}
                          onCheckedChange={setCatIsRcmDefault}
                          id="cat-rcm-switch"
                        />
                        <Label htmlFor="cat-rcm-switch" className="text-[11px] font-bold text-amber-900 cursor-pointer">
                          RCM Default (e.g. GTA)
                        </Label>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold text-slate-600">Default GSTR-3B ITC</Label>
                        <Select value={catItcClassification} onValueChange={(val: any) => setCatItcClassification(val)}>
                          <SelectTrigger className="h-7 text-[11px] font-medium">
                            <SelectValue placeholder="Input Services" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Input Services">Input Services</SelectItem>
                            <SelectItem value="Inputs / Consumables">Inputs / Consumables</SelectItem>
                            <SelectItem value="Capital Goods">Capital Goods</SelectItem>
                            <SelectItem value="Ineligible">Ineligible (Blocked)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <Button
                type="button"
                size="sm"
                onClick={() => {
                  if (!typeName.trim()) return toast.error('Enter category name')
                  const newOrUpdated: ExpenseType = {
                    id: editingType ? editingType.id : `exp-cat-${Date.now()}`,
                    name: typeName.trim(),
                    description: typeDescription.trim() || undefined,
                    costLinkingType: typeLinkType === 'invoice' ? 'invoice_landed' : 'net_profit',
                    linkType: typeLinkType,
                    isGstApplicable: catIsGstApplicable,
                    defaultSacCode: catIsGstApplicable ? (catDefaultSacCode.trim() || undefined) : undefined,
                    defaultGstRate: catIsGstApplicable ? catDefaultGstRate : 0,
                    isRcmDefault: catIsGstApplicable ? catIsRcmDefault : false,
                    itcClassification: catIsGstApplicable ? catItcClassification : 'Ineligible'
                  }

                  if (editingType) {
                    const updated = expenseTypes.map(t => t.id === editingType.id ? newOrUpdated : t)
                    setExpenseTypes?.(() => updated)
                    if (activeCompanyId) void saveEntityRemote(activeCompanyId, 'expenseTypes', newOrUpdated)
                    toast.success('Expense category updated')
                    setEditingType(null)
                  } else {
                    setExpenseTypes?.((prev) => [...prev, newOrUpdated])
                    if (activeCompanyId) void saveEntityRemote(activeCompanyId, 'expenseTypes', newOrUpdated)
                    toast.success('Expense category created')
                  }

                  setTypeName('')
                  setTypeDescription('')
                  setTypeLinkType('netprofit')
                  setCatIsGstApplicable(true)
                  setCatDefaultSacCode('')
                  setCatDefaultGstRate(18)
                  setCatIsRcmDefault(false)
                  setCatItcClassification('Input Services')
                }}
                className="w-full h-8 text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-xs"
              >
                {editingType ? 'Update Category Master' : 'Add Category Master'}
              </Button>
            </div>

            {/* Existing Categories List */}
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {expenseTypes.map((t) => (
                <div key={t.id} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-white text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-slate-900">{t.name}</p>
                      {t.isGstApplicable && (
                        <Badge variant="outline" className="text-[9px] font-mono bg-emerald-50 text-emerald-700 border-emerald-200">
                          {t.defaultSacCode ? `SAC ${t.defaultSacCode}` : 'GST'} | {t.defaultGstRate}%
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                      {t.linkType === 'invoice' || t.costLinkingType === 'invoice_landed' ? 'Direct Invoice Landed Cost' : 'General Overhead'}
                      {t.isRcmDefault ? ' · RCM Applicable' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditingType(t)
                        setTypeName(t.name)
                        setTypeLinkType(t.linkType || (t.costLinkingType === 'invoice_landed' ? 'invoice' : 'netprofit'))
                        setCatIsGstApplicable(t.isGstApplicable !== false)
                        setCatDefaultSacCode(t.defaultSacCode || '')
                        setCatDefaultGstRate(typeof t.defaultGstRate === 'number' ? t.defaultGstRate : 18)
                        setCatIsRcmDefault(Boolean(t.isRcmDefault))
                        setCatItcClassification(t.itcClassification || 'Input Services')
                      }}
                      className="h-6 w-6 text-slate-500 hover:text-blue-600"
                    >
                      <PencilSimple className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (expenseEntries.some(e => e.expenseTypeId === t.id)) {
                          toast.error('Cannot delete category in use by existing expenses')
                          return
                        }
                        const updated = expenseTypes.filter(x => x.id !== t.id)
                        setExpenseTypes?.(() => updated)
                        if (activeCompanyId) void deleteEntityRemote(activeCompanyId, 'expenseTypes', t.id)
                        toast.success('Category removed')
                      }}
                      className="h-6 w-6 text-slate-500 hover:text-red-600"
                    >
                      <Trash className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setManageTypesOpen(false)} className="h-8 text-xs font-semibold">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
