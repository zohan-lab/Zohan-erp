import { getChangedByLabel, getChangedByRole } from '@/lib/security-utils'
import { useState, useMemo } from 'react'
import { PeriodDateFilter, PeriodFilterState, defaultPeriodFilterState, isRecordInPeriod } from '@/components/period-date-filter'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ExpenseEntry, ExpenseType, Supplier, PurchaseInvoice } from '@/lib/types'
import { Counter, CashBankTransaction, isBankType } from '@/lib/cash-bank-types'
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
import { getStateName } from '@/lib/constants/indian-states'
import { StateSelector } from '@/components/state-selector'
import { getInvoiceQtyForUnit } from '@/lib/unit-conversion-service'
import { saveEntityRemote, deleteEntityRemote } from '@/lib/firebase-storage'
import { ThreeDotDropdown } from '@/components/ui/three-dot-dropdown'
import { ManageExpenseCategoriesDialog, QUICK_SAC_CODES } from '@/components/manage-expense-categories-dialog'

export { QUICK_SAC_CODES as COMMON_HSN_SAC_CODES }

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
  const [payeeInputFocused, setPayeeInputFocused] = useState(false)
  const [notes, setNotes] = useState('')

  // GST & ITC Statutory Fields (Configured by Master Category, loaded in background)
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

  // Manage Categories Master Modal State
  const [manageTypesOpen, setManageTypesOpen] = useState(false)

  // Date / FY Filters State
  const [periodFilter, setPeriodFilter] = useState<PeriodFilterState>(defaultPeriodFilterState)

  // Search & Register Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterCounter, setFilterCounter] = useState<string>('all')
  const [filterGstOnly, setFilterGstOnly] = useState<string>('all')

  const selectedExpenseType = expenseTypes.find((et) => et.id === expenseTypeId)
  const isInvoiceLinked = selectedExpenseType?.linkType === 'invoice' || selectedExpenseType?.costLinkingType === 'invoice_landed'

  // Master-Child Category Selection: Loads statutory rules in background (Tally / Zoho Books Architecture)
  const handleCategoryChange = (catId: string) => {
    setExpenseTypeId(catId)
    const cat = expenseTypes.find((t) => t.id === catId)
    if (!cat) return

    const gstActive = Boolean(cat.isGstApplicable)
    setHasGst(gstActive)
    setHsnSacCode(cat.defaultSacCode || '')
    setGstRate(typeof cat.defaultGstRate === 'number' ? cat.defaultGstRate : 18)
    setIsRcm(Boolean(cat.isRcmDefault))
    
    if (cat.itcClassification) {
      const itc = cat.itcClassification === 'Inputs / Consumables' ? 'Inputs' : (cat.itcClassification as any)
      setItcType(itc)
      setIsItcEligible(itc !== 'Ineligible')
    } else {
      setItcType('Input Services')
      setIsItcEligible(true)
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

  // Aggregated payee list from verified Suppliers + Prior Expense entries
  const payeeSuggestions = useMemo(() => {
    const map = new Map<string, { id?: string; name: string; gstin?: string; stateCode?: string; source: 'Supplier Master' | 'Previous Payee' }>()

    // Prior Expense Entries
    expenseEntries.forEach((e) => {
      const clean = (e.supplierName || '').trim()
      if (clean && !map.has(clean.toLowerCase())) {
        map.set(clean.toLowerCase(), {
          name: clean,
          gstin: e.supplierGstin,
          stateCode: e.supplierStateCode,
          source: 'Previous Payee'
        })
      }
    })

    // Verified Supplier Master (higher priority)
    suppliers.forEach((s) => {
      const clean = (s.name || '').trim()
      if (clean) {
        map.set(clean.toLowerCase(), {
          id: s.id,
          name: clean,
          gstin: s.gstin,
          stateCode: s.stateCode,
          source: 'Supplier Master'
        })
      }
    })

    return Array.from(map.values())
  }, [suppliers, expenseEntries])

  // Matching payees when at least 1 character is typed
  const matchingPayees = useMemo(() => {
    const q = supplierName.trim().toLowerCase()
    if (q.length < 1) return []
    return payeeSuggestions.filter((p) => p.name.toLowerCase().includes(q))
  }, [supplierName, payeeSuggestions])

  const showPayeeSuggestions = payeeInputFocused && supplierName.trim().length >= 1

  const handleSelectPayee = (item: { id?: string; name: string; gstin?: string; stateCode?: string }) => {
    setSupplierName(item.name)
    if (item.id) setSupplierId(item.id)
    if (item.gstin) handleGstinChange(item.gstin)
    if (item.stateCode) setSupplierStateCode(item.stateCode)
    setPayeeInputFocused(false)
  }

  // Real-time GST calculation preview in background
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
    setPayeeInputFocused(false)
  }

  // Edit Expense Entry
  const handleEditExpense = (expense: ExpenseEntry) => {
    setEditingExpense(expense)
    setExpenseTypeId(expense.expenseTypeId || expense.categoryId || '')
    setExpenseDate(expense.expenseDate || expense.date || new Date().toISOString().split('T')[0])
    setAmount(String(expense.amount || ''))
    setSelectedCounterId(expense.counterId || expense.paymentAccountId || '')
    setSupplierId(expense.supplierId || '')
    setLinkedInvoiceId(expense.linkedInvoiceId || '')
    setNotes(expense.notes || '')

    // GST & ITC Fields
    setHasGst(Boolean(expense.hasGst))
    setIsRcm(Boolean(expense.isRcm))
    setSupplierName(expense.supplierName || '')
    setSupplierGstin(expense.supplierGstin || '')
    setSupplierStateCode(expense.supplierStateCode || '19')
    setInvoiceRefNo(expense.invoiceRefNo || '')
    setInvoiceRefDate(expense.invoiceRefDate || '')
    setHsnSacCode(expense.hsnSacCode || '')
    setIsTaxInclusive(expense.isTaxInclusive !== false)
    setGstRate(typeof expense.gstRate === 'number' ? expense.gstRate : 18)
    setIsItcEligible(expense.isItcEligible !== false)
    setItcType(expense.itcType || 'Input Services')

    // Scroll to top form
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Save / Update Expense Handler
  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault()

    if (isLocked) {
      toast.error('Cannot save in locked mode', { description: 'Unlock the financial period to make changes' })
      return
    }

    if (!expenseTypeId) {
      toast.error('Please select an expense category')
      return
    }

    const rawAmount = parseFloat(amount)
    if (isNaN(rawAmount) || rawAmount <= 0) {
      toast.error('Please enter a valid expense amount')
      return
    }

    if (!selectedCounterId) {
      toast.error('Please select a payment account / cash box')
      return
    }

    const selectedType = expenseTypes.find((et) => et.id === expenseTypeId)
    const isInvLinked = selectedType?.linkType === 'invoice' || selectedType?.costLinkingType === 'invoice_landed'

    if (isInvLinked && !linkedInvoiceId) {
      toast.error('Please link a purchase invoice for this landed cost/freight category')
      return
    }

    // GST Validations
    if (hasGst && !isRcm && supplierGstin.trim()) {
      if (supplierGstin.trim().length !== 15) {
        toast.error('GSTIN must be exactly 15 characters')
        return
      }
    }

    const selectedCounter = counters.find((c) => c.id === selectedCounterId)
    const selectedInvoice = invoices.find((i) => i.id === linkedInvoiceId)

    const baseExpenseData = {
      expenseDate,
      date: expenseDate,
      categoryId: expenseTypeId,
      categoryName: selectedType?.name || 'General Expense',
      expenseTypeId,
      amount: rawAmount,
      paymentAccountId: selectedCounterId,
      paymentAccountName: selectedCounter?.name || 'Cash Counter',
      counterId: selectedCounterId,
      counterName: selectedCounter?.name || 'Cash Counter',
      supplierId: supplierId || (selectedInvoice ? selectedInvoice.supplierId : undefined),
      linkedInvoiceId: linkedInvoiceId || undefined,
      originalInvoiceNumber: selectedInvoice ? selectedInvoice.invoiceNo : undefined,
      paymentMode: selectedCounter && isBankType(selectedCounter.type) ? 'bank' : 'cash',
      notes: notes.trim() || undefined,
      fy: currentFY,

      // GST & Statutory Tax Metadata
      hasGst,
      isRcm: hasGst ? isRcm : false,
      supplierName: hasGst ? (supplierName.trim() || undefined) : undefined,
      supplierGstin: hasGst ? (supplierGstin.trim().toUpperCase() || undefined) : undefined,
      supplierStateCode: hasGst ? supplierStateCode : undefined,
      invoiceRefNo: hasGst ? (invoiceRefNo.trim() || undefined) : undefined,
      invoiceRefDate: hasGst ? (invoiceRefDate || undefined) : undefined,
      hsnSacCode: hasGst ? (hsnSacCode.trim() || undefined) : undefined,
      isTaxInclusive: hasGst ? isTaxInclusive : true,
      gstRate: hasGst ? gstRate : 0,
      taxableAmount: hasGst ? taxBreakdown.taxableAmount : rawAmount,
      cgstAmount: hasGst ? taxBreakdown.cgstAmount : 0,
      sgstAmount: hasGst ? taxBreakdown.sgstAmount : 0,
      igstAmount: hasGst ? taxBreakdown.igstAmount : 0,
      totalExpenseAmount: hasGst ? taxBreakdown.totalExpenseAmount : rawAmount,
      isItcEligible: hasGst ? (itcType !== 'Ineligible') : false,
      itcType: hasGst ? itcType : undefined,
      itcClaimStatus: hasGst && itcType !== 'Ineligible' ? ('Available' as const) : ('Ineligible' as const)
    }

    if (editingExpense) {
      // 1. Revert previous counter balance delta (add back old amount)
      const oldGross = editingExpense.totalExpenseAmount || editingExpense.amount
      let updatedCounters = applyCounterBalanceDelta(counters, editingExpense.counterId || editingExpense.paymentAccountId || '', oldGross)

      // 2. Apply new counter balance delta (expense deducts funds)
      const newGross = baseExpenseData.totalExpenseAmount
      updatedCounters = applyCounterBalanceDelta(updatedCounters, selectedCounterId, -newGross)

      // 3. Update cash transaction log
      const txId = `txn-exp-${editingExpense.id}`
      const updatedTransactions = transactions.map((tx) => {
        if (tx.id === txId || (tx.narration && tx.narration.includes(editingExpense.id))) {
          return {
            ...tx,
            counterId: selectedCounterId,
            counterName: selectedCounter?.name || tx.counterName,
            amount: newGross,
            date: expenseDate,
            narration: `Expense: ${selectedType?.name || 'General Expense'} ${baseExpenseData.supplierName ? `(${baseExpenseData.supplierName})` : ''} - ${notes || 'Updated voucher'}`
          }
        }
        return tx
      })

      onUpdateCashBank(updatedCounters, updatedTransactions)

      // 4. Update Expense record
      const updatedExpense: ExpenseEntry = {
        ...editingExpense,
        ...baseExpenseData,
        history: [
          ...(editingExpense.history || []),
          {
            timestamp: new Date().toISOString(),
            action: 'updated',
            changedBy: getChangedByLabel(),
            changedByRole: getChangedByRole(),
            changes: [
              ...(editingExpense.amount !== rawAmount ? [{ field: 'Amount', from: String(editingExpense.amount), to: String(rawAmount) }] : []),
              ...(editingExpense.expenseTypeId !== expenseTypeId ? [{ field: 'Category', from: editingExpense.categoryName || '-', to: selectedType?.name || '-' }] : []),
              ...(editingExpense.expenseDate !== expenseDate ? [{ field: 'Date', from: editingExpense.expenseDate, to: expenseDate }] : []),
              ...((editingExpense.notes || '') !== (notes.trim() || '') ? [{ field: 'Notes', from: editingExpense.notes || '-', to: notes.trim() || '-' }] : [])
            ]
          }
        ]
      }

      setExpenseEntries((prev) => prev.map((e) => (e.id === editingExpense.id ? updatedExpense : e)))
      if (activeCompanyId) {
        void saveEntityRemote(activeCompanyId, 'expenseEntries', updatedExpense)
      }
      toast.success('Expense voucher updated successfully')
    } else {
      const newExpenseId = `EXP-${Date.now()}`
      const newGross = baseExpenseData.totalExpenseAmount

      // Deduct from Counter Balance
      const updatedCounters = applyCounterBalanceDelta(counters, selectedCounterId, -newGross)

      // Create Cash/Bank Transaction
      const newTx: CashBankTransaction = {
        id: `txn-exp-${newExpenseId}`,
        counterId: selectedCounterId,
        counterName: selectedCounter?.name || 'Cash Counter',
        type: 'Out',
        amount: newGross,
        date: expenseDate,
        narration: `Expense: ${selectedType?.name || 'General Expense'} ${baseExpenseData.supplierName ? `(${baseExpenseData.supplierName})` : ''} - ${notes || 'Expense Voucher'}`
      }

      onUpdateCashBank(updatedCounters, [newTx, ...transactions])

      const newExpense: ExpenseEntry = {
        id: newExpenseId,
        ...baseExpenseData,
        createdAt: Date.now(),
        history: [
          {
            timestamp: new Date().toISOString(),
            action: 'created',
            changedBy: getChangedByLabel(),
            changedByRole: getChangedByRole(),
            changes: [
              { field: 'Category', from: '', to: selectedType?.name || 'General Expense' },
              { field: 'Amount', from: '', to: String(newGross) },
              { field: 'Account', from: '', to: selectedCounter?.name || 'Cash Account' },
              { field: 'Date', from: '', to: expenseDate }
            ]
          }
        ]
      }

      setExpenseEntries((prev) => [newExpense, ...prev])
      if (activeCompanyId) {
        void saveEntityRemote(activeCompanyId, 'expenseEntries', newExpense)
      }
      toast.success('Expense voucher recorded successfully')
    }

    resetForm()
  }

  // Delete Expense Entry
  const handleDeleteExpense = (expense: ExpenseEntry) => {
    if (isLocked) {
      toast.error('Cannot delete in locked mode')
      return
    }

    // Refund counter balance
    const grossAmt = expense.totalExpenseAmount || expense.amount
    const updatedCounters = applyCounterBalanceDelta(counters, expense.counterId || expense.paymentAccountId || '', grossAmt)
    const txId = `txn-exp-${expense.id}`
    const updatedTransactions = transactions.filter((tx) => tx.id !== txId && !(tx.narration && tx.narration.includes(expense.id)))

    onUpdateCashBank(updatedCounters, updatedTransactions)

    setExpenseEntries((prev) => prev.filter((e) => e.id !== expense.id))
    if (activeCompanyId) {
      void deleteEntityRemote(activeCompanyId, 'expenseEntries', expense.id)
    }
    toast.success('Expense voucher deleted & account balance refunded')
  }

  // Filtered Expenses
  const filteredExpenses = useMemo(() => {
    return expenseEntries
      .filter((expense) => {
        const expenseD = expense.expenseDate || expense.date || ''
        const inPeriod = isRecordInPeriod(expenseD, expense.fy, periodFilter, currentFY)
        if (!inPeriod) return false

        if (filterType !== 'all' && (expense.expenseTypeId !== filterType && expense.categoryId !== filterType)) {
          return false
        }

        if (filterCounter !== 'all' && (expense.counterId !== filterCounter && expense.paymentAccountId !== filterCounter)) {
          return false
        }

        if (filterGstOnly === 'gst' && !expense.hasGst) return false
        if (filterGstOnly === 'nongst' && expense.hasGst) return false
        if (filterGstOnly === 'rcm' && (!expense.hasGst || !expense.isRcm)) return false

        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase()
          const catName = expense.categoryName || ''
          const suppName = expense.supplierName || ''
          const gstin = expense.supplierGstin || ''
          const invRef = expense.invoiceRefNo || ''
          const noteText = expense.notes || ''
          return (
            catName.toLowerCase().includes(q) ||
            suppName.toLowerCase().includes(q) ||
            gstin.toLowerCase().includes(q) ||
            invRef.toLowerCase().includes(q) ||
            noteText.toLowerCase().includes(q)
          )
        }

        return true
      })
      .sort((a, b) => new Date(b.expenseDate || b.date || '').getTime() - new Date(a.expenseDate || a.date || '').getTime())
  }, [expenseEntries, periodFilter, currentFY, filterType, filterCounter, filterGstOnly, searchTerm])

  // KPIs
  const { totalExpenses, totalTaxable, totalItcEligible, totalInputCgst, totalInputSgst, invoiceLinkedExpenses, netProfitExpenses } =
    useMemo(() => {
      let gross = 0
      let taxable = 0
      let itc = 0
      let cgst = 0
      let sgst = 0
      let invLinked = 0
      let netProfit = 0

      filteredExpenses.forEach((exp) => {
        const val = exp.totalExpenseAmount || exp.amount || 0
        const taxVal = exp.taxableAmount || exp.amount || 0
        gross += val
        taxable += taxVal

        if (exp.hasGst && exp.isItcEligible !== false && exp.itcType !== 'Ineligible') {
          const tCgst = exp.cgstAmount || 0
          const tSgst = exp.sgstAmount || 0
          const tIgst = exp.igstAmount || 0
          cgst += tCgst
          sgst += tSgst
          itc += tCgst + tSgst + tIgst
        }

        const cat = expenseTypes.find((t) => t.id === exp.expenseTypeId || t.id === exp.categoryId)
        if (cat?.linkType === 'invoice' || cat?.costLinkingType === 'invoice_landed' || exp.linkedInvoiceId) {
          invLinked += val
        } else {
          netProfit += val
        }
      })

      return {
        totalExpenses: gross,
        totalTaxable: taxable,
        totalItcEligible: itc,
        totalInputCgst: cgst,
        totalInputSgst: sgst,
        invoiceLinkedExpenses: invLinked,
        netProfitExpenses: netProfit
      }
    }, [filteredExpenses, expenseTypes])

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6 text-indigo-600" weight="duotone" />
            Expense Vouchers & Input Tax Credit (ITC)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Log operational & freight expenses with automated Master-Child statutory GST rules, RCM, and GSTR-3B ITC claims
          </p>
        </div>

        <div className="flex items-center gap-3">
          <PeriodDateFilter value={periodFilter} onChange={setPeriodFilter} currentFY={currentFY} />
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setManageTypesOpen(true)}
            className="h-9 gap-1.5 text-xs font-bold rounded-xl bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 shadow-2xs"
          >
            <SlidersHorizontal className="h-4 w-4 text-indigo-600" weight="bold" />
            Manage Categories Master
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Gross Expenses */}
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

        {/* Eligible Input Tax Credit (ITC) */}
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

        {/* Direct Invoice Linked Costs */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Invoice Landed Costs</p>
            <p className="text-2xl font-extrabold text-blue-600 tracking-tight">{formatCurrency(invoiceLinkedExpenses)}</p>
            <p className="text-xs text-slate-400 mt-1">Direct Freight & Procurement Cost</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100/60 flex items-center justify-center shrink-0">
            <LinkSimple className="h-6 w-6" weight="duotone" />
          </div>
        </div>

        {/* Net Profit Overhead Expenses */}
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

      {/* RADICALLY SIMPLIFIED EXPENSE VOUCHER ENTRY FORM (Tally / Zoho Books Style) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <Plus className="h-5 w-5" weight="bold" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {editingExpense ? `Edit Expense Voucher #${editingExpense.id}` : 'Record Expense Voucher (Fast Entry)'}
              </h2>
              <p className="text-xs text-slate-500">
                Master Category automatically applies statutory GST rates, SAC codes, and RCM rules in background
              </p>
            </div>
          </div>

          {editingExpense && (
            <Button variant="outline" size="sm" onClick={resetForm} className="h-8 text-xs font-semibold">
              Cancel Editing
            </Button>
          )}
        </div>

        <form onSubmit={handleSaveExpense} className="space-y-4">
          
          {/* Main Fast 5-Second Row: Category, Amount, Payment Account, Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* 1. Expense Category */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Expense Category <span className="text-red-500">*</span></Label>
              <Select value={expenseTypeId} onValueChange={handleCategoryChange}>
                <SelectTrigger className="w-full h-9 bg-white text-xs font-semibold">
                  <SelectValue placeholder="Select Expense Category" />
                </SelectTrigger>
                <SelectContent>
                  {expenseTypes.map((et) => (
                    <SelectItem key={et.id} value={et.id}>
                      <span className="flex items-center justify-between w-full gap-2">
                        <span>{et.name}</span>
                        {et.isGstApplicable && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono">
                            {et.defaultSacCode ? `SAC ${et.defaultSacCode}` : 'GST'} | {et.defaultGstRate ?? 18}%
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 2. Expense Amount */}
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

            {/* 3. Paid Through (Cash / Bank) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Paid Through <span className="text-red-500">*</span></Label>
              <Select value={selectedCounterId} onValueChange={setSelectedCounterId}>
                <SelectTrigger className="w-full h-9 bg-white text-xs font-medium">
                  <SelectValue placeholder="Select Cash / Bank Account" />
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

            {/* 4. Voucher Date */}
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

          </div>

          {/* Invoice Linking Row (Only if Landed Cost / Freight) */}
          {isInvoiceLinked && (
            <div className="bg-blue-50/60 p-3.5 rounded-xl border border-blue-200/80 space-y-1.5 animate-in fade-in-50 duration-150">
              <Label className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                <LinkSimple className="h-4 w-4 text-blue-600" weight="bold" />
                Linked Purchase Invoice (Mandatory for Landed Freight & Item Costing) <span className="text-red-500 font-extrabold">*</span>
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
                      <span className="text-slate-400">Search purchase invoice to link landed cost...</span>
                    )}
                    <CaretUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50 text-slate-500" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[440px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search invoice #, supplier name, date..." className="h-9 text-xs" />
                    <CommandList className="max-h-[240px] overflow-y-auto">
                      <CommandEmpty className="py-3 text-center text-xs text-slate-500">
                        No purchase invoices found.
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
                              className="text-xs cursor-pointer py-2 px-3 flex items-center justify-between"
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

          {/* STREAMLINED GST SECTION: Automatically expanded ONLY when category is GST registered */}
          {hasGst && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3.5 animate-in fade-in duration-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200/60 pb-2.5">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-700" weight="duotone" />
                  <span className="text-xs font-bold text-emerald-950">
                    Vendor Tax Details & Input Tax Credit (ITC)
                  </span>
                </div>

                {/* Statutory summary badge automatically computed from master defaults */}
                <div className="flex items-center gap-2 text-xs font-medium">
                  {isRcm ? (
                    <Badge variant="outline" className="bg-amber-100/90 text-amber-900 border-amber-300 font-bold text-[11px] gap-1">
                      RCM Section 9(3) · {gstRate}% GST {hsnSacCode ? `(SAC ${hsnSacCode})` : ''} · Simultaneous ITC Claim
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-white text-emerald-800 border-emerald-300 font-bold text-[11px]">
                      GST: {gstRate}% {hsnSacCode ? `(SAC ${hsnSacCode})` : ''} · {itcType} ITC ({taxBreakdown.isInterState ? 'IGST' : 'CGST+SGST'})
                    </Badge>
                  )}

                  {/* Amount Tax Treatment Switcher */}
                  <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-emerald-200">
                    <button
                      type="button"
                      onClick={() => setIsTaxInclusive(true)}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md transition-colors ${isTaxInclusive ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      Inclusive (MRP)
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsTaxInclusive(false)}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md transition-colors ${!isTaxInclusive ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      +Tax
                    </button>
                  </div>
                </div>
              </div>

              {/* Clean 4-Field Grid: Vendor Name, Vendor GSTIN, POS State, Invoice No & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                
                {/* Vendor / Payee Hybrid Auto-Suggest Input */}
                <div className="space-y-1 relative">
                  <Label className="text-[11px] font-bold text-slate-700">Vendor / Payee Name</Label>
                  <div className="relative">
                    <Input
                      type="text"
                      placeholder="Enter vendor or payee name..."
                      value={supplierName}
                      onChange={(e) => {
                        setSupplierName(e.target.value)
                        setPayeeInputFocused(true)
                      }}
                      onFocus={() => setPayeeInputFocused(true)}
                      onBlur={() => {
                        setTimeout(() => setPayeeInputFocused(false), 200)
                      }}
                      className="h-8.5 text-xs bg-white font-medium"
                    />

                    {/* Lightweight Floating Popover List (1-2+ chars typed) */}
                    {showPayeeSuggestions && matchingPayees.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden max-h-[220px] overflow-y-auto divide-y divide-slate-100 animate-in fade-in-50 duration-100">
                        <div className="px-2.5 py-1 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Suggested Payees ({matchingPayees.length})
                        </div>
                        {matchingPayees.map((item, idx) => (
                          <div
                            key={`${item.name}-${idx}`}
                            onMouseDown={(e) => {
                              e.preventDefault()
                              handleSelectPayee(item)
                            }}
                            className="px-3 py-2 text-xs hover:bg-indigo-50/70 cursor-pointer flex items-center justify-between transition-colors"
                          >
                            <div className="truncate mr-2">
                              <p className="font-bold text-slate-900 truncate">{item.name}</p>
                              <p className="text-[10px] text-slate-400 font-mono">
                                {item.gstin ? `GSTIN: ${item.gstin}` : 'Unregistered'}
                                {item.stateCode ? ` · ${getStateName(item.stateCode)}` : ''}
                              </p>
                            </div>
                            <Badge
                              variant="outline"
                              className={`text-[9px] font-semibold shrink-0 ${
                                item.source === 'Supplier Master'
                                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                  : 'bg-slate-50 text-slate-600 border-slate-200'
                              }`}
                            >
                              {item.source}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Vendor GSTIN */}
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-slate-700">
                    Vendor GSTIN {isRcm ? '(Optional for RCM)' : '(15 Digits)'}
                  </Label>
                  <Input
                    type="text"
                    placeholder={isRcm ? "Optional (Unregistered)" : "19AAAAA0000A1Z5"}
                    maxLength={15}
                    value={supplierGstin}
                    onChange={(e) => handleGstinChange(e.target.value)}
                    className="h-8.5 text-xs font-mono font-bold uppercase bg-white"
                  />
                </div>

                {/* Vendor State / POS */}
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-slate-700">Supplier State / POS</Label>
                  <StateSelector
                    value={supplierStateCode}
                    onChange={(code) => setSupplierStateCode(code)}
                  />
                </div>

                {/* Vendor Invoice Ref & Date */}
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-slate-700">Vendor Bill / Ref No.</Label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="text"
                      placeholder="INV-1024"
                      value={invoiceRefNo}
                      onChange={(e) => setInvoiceRefNo(e.target.value)}
                      className="h-8.5 text-xs bg-white font-mono flex-1"
                    />
                    <Input
                      type="date"
                      value={invoiceRefDate}
                      onChange={(e) => setInvoiceRefDate(e.target.value)}
                      className="h-8.5 text-xs bg-white w-32"
                    />
                  </div>
                </div>

              </div>

              {/* Compact 1-Line Tax Preview */}
              <div className="flex items-center justify-between text-xs bg-white px-3 py-1.5 rounded-lg border border-emerald-200/80">
                <span className="text-slate-600 font-medium">
                  Taxable: <strong className="font-mono text-slate-900">{formatCurrency(taxBreakdown.taxableAmount)}</strong>
                </span>
                <span className="text-slate-600 font-medium">
                  {taxBreakdown.isInterState ? (
                    <span>IGST ({taxBreakdown.igstRate}%): <strong className="font-mono text-emerald-700">{formatCurrency(taxBreakdown.igstAmount)}</strong></span>
                  ) : (
                    <span>CGST+SGST ({taxBreakdown.gstRate}%): <strong className="font-mono text-emerald-700">{formatCurrency(taxBreakdown.cgstAmount + taxBreakdown.sgstAmount)}</strong></span>
                  )}
                </span>
                <span className="font-bold text-emerald-800">
                  Total Gross: <span className="font-mono font-extrabold">{formatCurrency(taxBreakdown.totalExpenseAmount)}</span>
                </span>
              </div>

            </div>
          )}

          {/* Notes / Description */}
          <div className="space-y-1">
            <Label className="text-xs font-bold text-slate-700">Notes / Narration (Optional)</Label>
            <Textarea
              placeholder="Enter expense details or internal reference..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-xs min-h-[42px] bg-white"
            />
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-1 border-t border-slate-100">
            {editingExpense && (
              <Button type="button" variant="outline" onClick={resetForm} className="h-9 px-5 text-xs font-semibold rounded-xl">
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              disabled={isLocked}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-9 px-8 rounded-xl text-xs shadow-md shadow-indigo-600/20"
            >
              {editingExpense ? 'Update Expense Voucher' : 'Save Expense Voucher'}
            </Button>
          </div>

        </form>
      </div>

      {/* EXPENSES HISTORY REGISTER */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        
        {/* Register Toolbar */}
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60">
          <div className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-indigo-600" weight="duotone" />
            <h3 className="text-sm font-bold text-slate-900">Expense Vouchers Register ({filteredExpenses.length})</h3>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative w-56">
              <MagnifyingGlass className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Search category, vendor, bill #..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-8 text-xs bg-white"
              />
            </div>

            {/* Category Filter */}
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="h-8 text-xs w-44 bg-white">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {expenseTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Tax Filter */}
            <Select value={filterGstOnly} onValueChange={setFilterGstOnly}>
              <SelectTrigger className="h-8 text-xs w-36 bg-white">
                <SelectValue placeholder="GST Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tax Types</SelectItem>
                <SelectItem value="gst">GST Invoiced</SelectItem>
                <SelectItem value="rcm">RCM GTA</SelectItem>
                <SelectItem value="nongst">Non-GST</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Register Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-[#edf3fc]">
              <TableRow className="border-b border-slate-200/80">
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3">Date</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3">Category</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3">Vendor / Payee</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3">Paid Through</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3 text-right">Taxable (₹)</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3 text-right">GST / ITC (₹)</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3 text-right">Total Amount (₹)</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredExpenses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-xs text-slate-500">
                    No expense vouchers found for the selected period and filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredExpenses.map((expense) => {
                  const cat = expenseTypes.find((t) => t.id === expense.expenseTypeId || t.id === expense.categoryId)
                  const isInv = cat?.linkType === 'invoice' || cat?.costLinkingType === 'invoice_landed' || Boolean(expense.linkedInvoiceId)
                  const grossAmt = expense.totalExpenseAmount || expense.amount || 0
                  const taxableAmt = expense.taxableAmount || expense.amount || 0
                  const taxAmt = (expense.cgstAmount || 0) + (expense.sgstAmount || 0) + (expense.igstAmount || 0)

                  return (
                    <TableRow key={expense.id} className="hover:bg-slate-50/80 border-b border-slate-100">
                      <TableCell className="font-mono text-xs text-slate-700 whitespace-nowrap">
                        {expense.expenseDate || expense.date}
                      </TableCell>
                      
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-bold text-xs text-slate-900">{cat?.name || expense.categoryName || 'General Expense'}</span>
                          <span className="text-[10px] text-slate-400">
                            {isInv ? (
                              <span className="text-blue-600 font-semibold flex items-center gap-1">
                                <LinkSimple size={10} />
                                {expense.originalInvoiceNumber ? `Inv #${expense.originalInvoiceNumber}` : 'Landed Cost'}
                              </span>
                            ) : (
                              'Net Profit Overhead'
                            )}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-col text-xs">
                          <span className="font-bold text-slate-900">
                            {expense.supplierName || 'Self / Payee'}
                          </span>
                          {expense.supplierGstin && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              GSTIN: {expense.supplierGstin}
                            </span>
                          )}
                          {expense.invoiceRefNo && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              Bill: #{expense.invoiceRefNo}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="text-xs font-medium text-slate-700">
                        {expense.counterName || expense.paymentAccountName || 'Cash Account'}
                      </TableCell>

                      <TableCell className="text-right font-mono text-xs text-slate-700">
                        {formatCurrency(taxableAmt)}
                      </TableCell>

                      <TableCell className="text-right font-mono text-xs">
                        {expense.hasGst && taxAmt > 0 ? (
                          <div className="flex flex-col items-end">
                            <span className="font-bold text-emerald-600">+{formatCurrency(taxAmt)}</span>
                            <span className="text-[9px] text-slate-400 font-sans">
                              {expense.isRcm ? 'RCM 9(3)' : (expense.itcType || 'ITC')}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">0% Non-GST</span>
                        )}
                      </TableCell>

                      <TableCell className="text-right font-mono font-extrabold text-slate-900 text-xs">
                        {formatCurrency(grossAmt)}
                      </TableCell>

                      <TableCell className="text-right">
                        <ThreeDotDropdown
                          onEdit={() => handleEditExpense(expense)}
                          onDelete={() => handleDeleteExpense(expense)}
                          history={expense.history}
                          entityType="Expense Voucher"
                          isLocked={isLocked}
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

      {/* Shared Category Master Management Dialog */}
      <ManageExpenseCategoriesDialog
        open={manageTypesOpen}
        onOpenChange={setManageTypesOpen}
        expenseTypes={expenseTypes}
        setExpenseTypes={setExpenseTypes}
        expenseEntries={expenseEntries}
        activeCompanyId={activeCompanyId}
        isLocked={isLocked}
      />

    </div>
  )
}
