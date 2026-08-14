import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { 
  ArrowsLeftRight, 
  Plus, 
  Coins, 
  Bank, 
  Wallet, 
  SlidersHorizontal, 
  PencilSimple, 
  Trash, 
  MagnifyingGlass, 
  ArrowUpRight, 
  ArrowDownLeft, 
  PlusMinus,
  Receipt,
  CaretLeft,
  TrendUp,
  TrendDown,
  CreditCard
} from '@phosphor-icons/react'
import { formatCurrency } from '@/lib/calculations'
import { toast } from 'sonner'
import { Counter, CounterType, CashBankTransaction, isManualCounterTransaction, isBankType } from '@/lib/cash-bank-types'
import { calculateTotalCash, calculateTotalBank } from '@/lib/report-calculations'
import { ThreeDotDropdown } from '@/components/ui/three-dot-dropdown'
import { getChangedByLabel, getChangedByRole } from '@/lib/security-utils'
import { EditHistoryChange, EditHistoryLog } from '@/lib/types'
import { 
  saveCashBankCounter, 
  deleteCashBankCounter, 
  saveCashBankTransaction, 
  deleteCashBankTransaction 
} from '@/lib/firebase-storage'

type DisplayTransaction = CashBankTransaction & {
  displayId: string
  isTransferSide?: 'out' | 'in'
  displayCounterId: string
  displayCounterName: string
  runningBalance?: number
  _index: number
}

interface CashBankManagementProps {
  counters: Counter[]
  transactions: CashBankTransaction[]
  onUpdateAll: (counters: Counter[], transactions: CashBankTransaction[]) => void
  isLocked?: boolean
  activeCompanyId?: string
}

/** Returns the start of the current Indian financial year as YYYY-MM-DD */
function getFYStart(): string {
  const now = new Date()
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  return `${year}-04-01`
}

export default function CashBankManagement({ 
  counters = [], 
  transactions = [], 
  onUpdateAll,
  isLocked = false,
  activeCompanyId
}: CashBankManagementProps) {
  // Modal states
  const [transferOpen, setTransferOpen] = useState(false)
  const [addReduceOpen, setAddReduceOpen] = useState(false)
  const [manageCountersOpen, setManageCountersOpen] = useState(false)

  // Transfer Form state
  const [fromCounterId, setFromCounterId] = useState('')
  const [toCounterId, setToCounterId] = useState('')
  const [transferAmount, setTransferAmount] = useState('')
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0])
  const [transferNarration, setTransferNarration] = useState('')

  // Add/Reduce Form state
  const [addReduceType, setAddReduceType] = useState<'In' | 'Out'>('In')
  const [targetCounterId, setTargetCounterId] = useState('')
  const [addReduceAmount, setAddReduceAmount] = useState('')
  const [addReduceDate, setAddReduceDate] = useState(new Date().toISOString().split('T')[0])
  const [addReduceNarration, setAddReduceNarration] = useState('')

  // Manage Counter Form state
  const [editingCounter, setEditingCounter] = useState<Counter | null>(null)
  const [counterName, setCounterName] = useState('')
  const [counterType, setCounterType] = useState<CounterType>('Cash')
  const [counterOpeningBal, setCounterOpeningBal] = useState('0')
  const [counterObDate, setCounterObDate] = useState(getFYStart())
  const [counterSanctionedLimit, setCounterSanctionedLimit] = useState('')
  const [counterMarginPct, setCounterMarginPct] = useState('')

  // Filter Ledger states
  const [filterCounter, setFilterCounter] = useState<string>('all')
  const [filterType, setFilterType] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  // Calculate totals
  const totalCash = useMemo(() => calculateTotalCash(counters), [counters])

  const totalBank = useMemo(() => calculateTotalBank(counters), [counters])

  // Filtered Ledger Calculation
  const ledgerData = useMemo(() => {
    let expanded: DisplayTransaction[] = []
    transactions.forEach((t, i) => {
      if (t.type === 'Transfer') {
        expanded.push({ 
          ...t, 
          displayId: `${t.id}-out`, 
          isTransferSide: 'out', 
          displayCounterId: t.counterId,
          displayCounterName: t.counterName,
          _index: i * 10
        })
        expanded.push({ 
          ...t, 
          displayId: `${t.id}-in`, 
          isTransferSide: 'in', 
          displayCounterId: t.toCounterId!,
          displayCounterName: t.toCounterName!,
          _index: i * 10 + 1
        })
      } else {
        expanded.push({ 
          ...t, 
          displayId: t.id, 
          displayCounterId: t.counterId,
          displayCounterName: t.counterName,
          _index: i * 10
        })
      }
    })

    // Sort ascending for running balance calculation
    const expandedAscending = expanded.sort((a, b) => {
      const timeDiff = new Date(a.date).getTime() - new Date(b.date).getTime()
      if (timeDiff !== 0) return timeDiff
      return a._index - b._index
    })

    // Filter by counter for balance calculation
    let filteredForBalance = expandedAscending
    if (filterCounter !== 'all') {
      filteredForBalance = filteredForBalance.filter((t) => t.displayCounterId === filterCounter)
    }
    
    let currentBal = 0
    if (filterCounter === 'all') {
      currentBal = counters.reduce((sum, c) => sum + (c.openingBalance || 0), 0)
    } else {
      const counter = counters.find((c) => c.id === filterCounter)
      if (counter) currentBal = counter.openingBalance || 0
    }
    
    const withBalance = filteredForBalance.map((t) => {
      if (filterCounter !== 'all') {
        if (t.type === 'In' || (t.type === 'Transfer' && t.isTransferSide === 'in')) {
          currentBal += t.amount
        } else {
          currentBal -= t.amount
        }
      } else {
        if (t.type === 'In') {
          currentBal += t.amount
        } else if (t.type === 'Out') {
          currentBal -= t.amount
        }
      }
      return { ...t, runningBalance: currentBal }
    })

    // Apply remaining filters (Type, Date, Search)
    let result = withBalance.reverse()

    if (filterType !== 'all') {
      result = result.filter((t) => {
        if (filterType === 'In') return t.type === 'In' || (t.type === 'Transfer' && t.isTransferSide === 'in')
        if (filterType === 'Out') return t.type === 'Out' || (t.type === 'Transfer' && t.isTransferSide === 'out')
        if (filterType === 'Transfer') return t.type === 'Transfer'
        return true
      })
    }

    if (dateFrom) {
      result = result.filter((t) => t.date >= dateFrom)
    }

    if (dateTo) {
      result = result.filter((t) => t.date <= dateTo)
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      result = result.filter((t) => 
        t.narration.toLowerCase().includes(term) || 
        t.displayCounterName.toLowerCase().includes(term) ||
        t.id.toLowerCase().includes(term)
      )
    }

    return result
  }, [transactions, counters, filterCounter, filterType, dateFrom, dateTo, searchTerm])

  // Calculation totals for display
  const summaryIn = useMemo(() => {
    return ledgerData.reduce((sum, t) => {
      if (t.type === 'In' || (t.type === 'Transfer' && t.isTransferSide === 'in')) return sum + t.amount
      return sum
    }, 0)
  }, [ledgerData])

  const summaryOut = useMemo(() => {
    return ledgerData.reduce((sum, t) => {
      if (t.type === 'Out' || (t.type === 'Transfer' && t.isTransferSide === 'out')) return sum + t.amount
      return sum
    }, 0)
  }, [ledgerData])

  // Handler: Transfer Money
  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isLocked) return toast.error('Data is locked.')
    if (!fromCounterId || !toCounterId) return toast.error('Select source and destination counters')
    if (fromCounterId === toCounterId) return toast.error('Source and destination cannot be the same')
    const amt = parseFloat(transferAmount)
    if (!amt || amt <= 0) return toast.error('Enter a valid amount')

    const source = counters.find((c) => c.id === fromCounterId)
    const dest = counters.find((c) => c.id === toCounterId)

    const nextCounters = counters.map((c) => {
      const current = typeof c.currentBalance === 'number' && Number.isFinite(c.currentBalance)
        ? c.currentBalance
        : (c.openingBalance || 0)
      if (c.id === fromCounterId) {
        const updated = { ...c, currentBalance: current - amt }
        if (activeCompanyId) void saveCashBankCounter(activeCompanyId, updated)
        return updated
      }
      if (c.id === toCounterId) {
        const updated = { ...c, currentBalance: current + amt }
        if (activeCompanyId) void saveCashBankCounter(activeCompanyId, updated)
        return updated
      }
      return c
    })

    const newTx: CashBankTransaction = {
      id: `tx-tr-${Date.now()}`,
      date: transferDate,
      counterId: fromCounterId,
      counterName: source?.name || 'Counter',
      type: 'Transfer',
      amount: amt,
      narration: transferNarration.trim() || `Transfer: ${source?.name} ➔ ${dest?.name}`,
      toCounterId: toCounterId,
      toCounterName: dest?.name || 'Counter'
    }

    if (activeCompanyId) {
      void saveCashBankTransaction(activeCompanyId, newTx)
    }

    onUpdateAll(nextCounters, [newTx, ...transactions])
    toast.success(`Transferred ${formatCurrency(amt)} from ${source?.name} to ${dest?.name}`)
    setTransferAmount('')
    setTransferNarration('')
    setTransferOpen(false)
  }

  // Handler: Add/Reduce Money
  const handleAddReduceSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isLocked) return toast.error('Data is locked.')
    if (!targetCounterId) return toast.error('Select a counter')
    const amt = parseFloat(addReduceAmount)
    if (!amt || amt <= 0) return toast.error('Enter a valid amount')

    const target = counters.find((c) => c.id === targetCounterId)
    const isAdd = addReduceType === 'In'

    const nextCounters = counters.map((c) => {
      if (c.id === targetCounterId) {
        const current = typeof c.currentBalance === 'number' && Number.isFinite(c.currentBalance)
          ? c.currentBalance
          : (c.openingBalance || 0)
        const updated = { ...c, currentBalance: isAdd ? current + amt : current - amt }
        if (activeCompanyId) void saveCashBankCounter(activeCompanyId, updated)
        return updated
      }
      return c
    })

    const newTx: CashBankTransaction = {
      id: `tx-ar-${Date.now()}`,
      date: addReduceDate,
      counterId: targetCounterId,
      counterName: target?.name || 'Counter',
      type: addReduceType,
      amount: amt,
      narration: addReduceNarration.trim() || (isAdd ? 'Cash In / Deposit' : 'Cash Out / Expense')
    }

    if (activeCompanyId) {
      void saveCashBankTransaction(activeCompanyId, newTx)
    }

    onUpdateAll(nextCounters, [newTx, ...transactions])
    toast.success(`${isAdd ? 'Cash In' : 'Cash Out'} of ${formatCurrency(amt)} recorded for ${target?.name}`)
    setAddReduceAmount('')
    setAddReduceNarration('')
    setAddReduceOpen(false)
  }

  // Handler: Save Counter (Add or Edit)
  const handleCounterSave = (e: React.FormEvent) => {
    e.preventDefault()
    if (isLocked) return toast.error('Data is locked.')
    if (!counterName.trim()) return toast.error('Enter counter name')
    const openBal = parseFloat(counterOpeningBal) || 0
    const isCCOD = counterType === 'Bank CC / OD'

    if (isCCOD) {
      if (!counterSanctionedLimit || parseFloat(counterSanctionedLimit) <= 0)
        return toast.error('Enter a valid Sanctioned Limit for CC / OD account')
      if (!counterMarginPct || parseFloat(counterMarginPct) < 0 || parseFloat(counterMarginPct) > 100)
        return toast.error('Margin / Haircut Percentage must be between 0 and 100')
    }

    if (editingCounter) {
      const changes: EditHistoryChange[] = []
      if (editingCounter.name !== counterName.trim()) {
        changes.push({ field: 'Counter Name', from: editingCounter.name, to: counterName.trim() })
      }
      if (editingCounter.type !== counterType) {
        changes.push({ field: 'Account Type', from: editingCounter.type, to: counterType })
      }
      if (editingCounter.openingBalance !== openBal) {
        changes.push({ field: 'Opening Balance', from: formatCurrency(editingCounter.openingBalance || 0), to: formatCurrency(openBal) })
      }
      if ((editingCounter.openingBalanceDate || '') !== (openBal !== 0 ? (counterObDate || '') : '')) {
        changes.push({ field: 'As-On Date', from: editingCounter.openingBalanceDate || 'None', to: counterObDate || 'None' })
      }
      if (isCCOD && (editingCounter.sanctionedLimit || 0) !== (parseFloat(counterSanctionedLimit) || 0)) {
        changes.push({ 
          field: 'Sanctioned Limit', 
          from: formatCurrency(editingCounter.sanctionedLimit || 0), 
          to: formatCurrency(parseFloat(counterSanctionedLimit) || 0) 
        })
      }
      if (isCCOD && (editingCounter.marginPercentage || 0) !== (parseFloat(counterMarginPct) || 0)) {
        changes.push({ 
          field: 'Margin %', 
          from: `${editingCounter.marginPercentage || 0}%`, 
          to: `${parseFloat(counterMarginPct) || 0}%` 
        })
      }

      const updatedHistory: EditHistoryLog[] = [
        ...(editingCounter.history || []),
        ...(changes.length > 0 ? [{
          timestamp: new Date().toISOString(),
          action: 'updated' as const,
          changedBy: getChangedByLabel(),
          changedByRole: getChangedByRole(),
          changes
        }] : [])
      ]

      const diff = openBal - editingCounter.openingBalance
      const current = typeof editingCounter.currentBalance === 'number' && Number.isFinite(editingCounter.currentBalance)
        ? editingCounter.currentBalance
        : (editingCounter.openingBalance || 0)

      const updatedCounter: Counter = {
        ...editingCounter,
        name: counterName.trim(),
        type: counterType,
        openingBalance: openBal,
        currentBalance: current + diff,
        openingBalanceDate: openBal !== 0 ? counterObDate : undefined,
        sanctionedLimit: isCCOD ? parseFloat(counterSanctionedLimit) : undefined,
        marginPercentage: isCCOD ? parseFloat(counterMarginPct) : undefined,
        history: updatedHistory,
      }

      if (activeCompanyId) {
        void saveCashBankCounter(activeCompanyId, updatedCounter)
      }

      const nextCounters = counters.map((c) => 
        c.id === editingCounter.id ? updatedCounter : c
      )
      onUpdateAll(nextCounters, transactions)
      toast.success(`Counter "${counterName}" updated`)
    } else {
      const changes: EditHistoryChange[] = [
        { field: 'Counter Name', from: '', to: counterName.trim() },
        { field: 'Account Type', from: '', to: counterType },
        { field: 'Opening Balance', from: '', to: formatCurrency(openBal) },
        ...(openBal !== 0 && counterObDate ? [{ field: 'As-On Date', from: '', to: counterObDate }] : []),
        ...(isCCOD && counterSanctionedLimit ? [{ field: 'Sanctioned Limit', from: '', to: formatCurrency(parseFloat(counterSanctionedLimit)) }] : []),
        ...(isCCOD && counterMarginPct ? [{ field: 'Margin %', from: '', to: `${counterMarginPct}%` }] : [])
      ]

      const newCounter: Counter = {
        id: `cnt-${Date.now()}`,
        name: counterName.trim(),
        type: counterType,
        openingBalance: openBal,
        currentBalance: openBal,
        openingBalanceDate: openBal !== 0 ? counterObDate : undefined,
        ...(isCCOD && {
          sanctionedLimit: parseFloat(counterSanctionedLimit),
          marginPercentage: parseFloat(counterMarginPct),
        }),
        history: [
          {
            timestamp: new Date().toISOString(),
            action: 'created',
            changedBy: getChangedByLabel(),
            changedByRole: getChangedByRole(),
            changes
          }
        ]
      }

      if (activeCompanyId) {
        void saveCashBankCounter(activeCompanyId, newCounter)
      }

      onUpdateAll([...counters, newCounter], transactions)
      toast.success(`Counter "${counterName}" added`)
    }

    setCounterName('')
    setCounterOpeningBal('0')
    setCounterObDate(getFYStart())
    setCounterSanctionedLimit('')
    setCounterMarginPct('')
    setEditingCounter(null)
  }

  // Handler: Delete Counter
  const handleDeleteCounter = (id: string) => {
    if (isLocked) return toast.error('Data is locked.')
    const target = counters.find((c) => c.id === id)
    if (!target) return

    const hasTx = transactions.some((t) => 
      t.counterId === id || 
      t.toCounterId === id || 
      (t.counterName && t.counterName.trim().toLowerCase() === target.name.trim().toLowerCase())
    )
    if (hasTx) {
      if (!window.confirm(`Warning: "${target.name}" has existing recorded transactions. Deleting it will remove the counter entry. Are you sure you want to delete?`)) {
        return
      }
    } else {
      if (!window.confirm(`Delete counter "${target.name}"? This action cannot be undone.`)) return
    }

    if (activeCompanyId) {
      void deleteCashBankCounter(activeCompanyId, id)
    }

    const nextCounters = counters.filter((c) => c.id !== id)
    onUpdateAll(nextCounters, transactions)
    toast.success(`Counter "${target.name}" deleted`)
  }

  // Handler: Delete Transaction
  const handleDeleteTransaction = (t: DisplayTransaction) => {
    if (isLocked) return toast.error('Data is locked.')
    if (!isManualCounterTransaction(t)) {
      toast.error('Only direct counter entries (Add/Reduce Money) can be deleted from Cash & Bank')
      return
    }
    if (!window.confirm('Delete this transaction entry? Balances will be restored.')) return

    const rawId = t.id.replace(/-out$|-in$/, '')
    const targetTx = transactions.find((tx) => tx.id === rawId)
    if (!targetTx) return

    // Revert counter balances accurately without mutating openingBalance
    const nextCounters = counters.map((c) => {
      const current = typeof c.currentBalance === 'number' && Number.isFinite(c.currentBalance)
        ? c.currentBalance
        : (c.openingBalance || 0)

      if (targetTx.type === 'In' && c.id === targetTx.counterId) {
        const updated = { ...c, currentBalance: current - targetTx.amount }
        if (activeCompanyId) void saveCashBankCounter(activeCompanyId, updated)
        return updated
      }
      if (targetTx.type === 'Out' && c.id === targetTx.counterId) {
        const updated = { ...c, currentBalance: current + targetTx.amount }
        if (activeCompanyId) void saveCashBankCounter(activeCompanyId, updated)
        return updated
      }
      if (targetTx.type === 'Transfer') {
        if (c.id === targetTx.counterId) {
          const updated = { ...c, currentBalance: current + targetTx.amount }
          if (activeCompanyId) void saveCashBankCounter(activeCompanyId, updated)
          return updated
        }
        if (c.id === targetTx.toCounterId) {
          const updated = { ...c, currentBalance: current - targetTx.amount }
          if (activeCompanyId) void saveCashBankCounter(activeCompanyId, updated)
          return updated
        }
      }
      return c
    })

    const nextTx = transactions.filter((tx) => tx.id !== rawId)

    // Permanently remove transaction from remote storage
    if (activeCompanyId) {
      void deleteCashBankTransaction(activeCompanyId, rawId)
    }

    onUpdateAll(nextCounters, nextTx)
    toast.success('Transaction deleted and balance restored')
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header Bar with Exact 3 Action Buttons matching User Diagram */}
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
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Cash & Bank Management</h1>
            <p className="text-xs text-slate-500 font-medium">Transfer money, manage cash in/out, and track counter ledgers</p>
          </div>
        </div>

        {/* Top 3 Action Buttons from Diagram */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            onClick={() => {
              setFromCounterId(counters[0]?.id || '')
              setToCounterId(counters[1]?.id || counters[0]?.id || '')
              setTransferOpen(true)
            }}
            disabled={isLocked}
            className="bg-[#0256e8] hover:bg-[#0046cd] text-white font-semibold rounded-xl px-4 py-2.5 shadow-2xs flex items-center gap-2 text-xs"
          >
            <ArrowsLeftRight className="h-4 w-4" weight="bold" />
            Transfer Money
          </Button>

          <Button
            onClick={() => {
              setTargetCounterId(counters[0]?.id || '')
              setAddReduceOpen(true)
            }}
            disabled={isLocked}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl px-4 py-2.5 shadow-2xs flex items-center gap-2 text-xs"
          >
            <PlusMinus className="h-4 w-4" weight="bold" />
            Add/Reduce Money
          </Button>

          <Button
            onClick={() => setManageCountersOpen(true)}
            disabled={isLocked}
            variant="outline"
            className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold rounded-xl px-4 py-2.5 flex items-center gap-2 text-xs"
          >
            <SlidersHorizontal className="h-4 w-4 text-indigo-600" weight="bold" />
            Add/manage Category
          </Button>
        </div>
      </div>

      {/* Main 2-Column Grid Layout: Middle Column (Cash/Bank Totals & Counters List) + Right Area (Filter Ledger) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Middle Column (Width: 4/12): Cash Totals, Bank Totals & Individual Counter Cards */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* Total Cash Card */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Total Cash</p>
              <p className="text-2xl font-extrabold text-slate-900 tracking-tight">{formatCurrency(totalCash)}</p>
              <p className="text-xs text-slate-400 mt-1">Sum of all cash counters</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100/60 flex items-center justify-center shrink-0">
              <Coins className="h-6 w-6" weight="duotone" />
            </div>
          </div>

          {/* Total Bank Card */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Total Bank</p>
              <p className="text-2xl font-extrabold text-slate-900 tracking-tight">{formatCurrency(totalBank)}</p>
              <p className="text-xs text-slate-400 mt-1">Sum of all bank accounts</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100/60 flex items-center justify-center shrink-0">
              <Bank className="h-6 w-6" weight="duotone" />
            </div>
          </div>

          {/* Individual Counters List Section (Counter 1, Counter 2, etc.) */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Wallet className="h-4 w-4 text-[#0256e8]" weight="duotone" />
                <span>Counters & Accounts</span>
              </h3>
              <button
                onClick={() => setManageCountersOpen(true)}
                disabled={isLocked}
                className="text-xs font-semibold text-[#0256e8] hover:underline flex items-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" weight="bold" />
                New
              </button>
            </div>

            {counters.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">
                No counters configured yet. Click "Add/manage Category" above to add your first counter.
              </div>
            ) : (
              <div className="space-y-3">
                {counters.map((c) => {
                    const badgeClass = c.type === 'Cash'
                      ? 'bg-emerald-100 text-emerald-700'
                      : c.type === 'Current'
                      ? 'bg-indigo-100 text-indigo-700'
                      : c.type === 'Bank CC / OD'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-blue-100 text-blue-700' // Savings, Bank (legacy)

                    return (
                  <div key={c.id} className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">{c.name}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeClass}`}>
                          {c.type || 'Cash'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                        Opening: {formatCurrency(c.openingBalance || 0)}
                      </p>
                      {c.type === 'Bank CC / OD' && c.sanctionedLimit != null && (
                        <p className="text-[10px] text-amber-600 font-medium mt-0.5">
                          Limit: ₹{c.sanctionedLimit.toLocaleString('en-IN')}
                          {c.marginPercentage != null && ` · Margin: ${c.marginPercentage}%`}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-extrabold text-slate-900">{formatCurrency(c.currentBalance || 0)}</p>
                      <button
                        onClick={() => {
                          setTargetCounterId(c.id)
                          setAddReduceOpen(true)
                        }}
                        disabled={isLocked}
                        className="text-[11px] font-bold text-[#0256e8] hover:underline mt-0.5 inline-block"
                      >
                        + Entry
                      </button>
                    </div>
                  </div>
                    )
                  })}

              </div>
            )}
          </div>
        </div>

        {/* Right Section (Width: 8/12): Filter Ledger & Transaction History Table */}
        <div className="lg:col-span-8">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
            
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#0256e8] flex items-center justify-center">
                  <Receipt className="h-5 w-5" weight="duotone" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Filter Ledger</h2>
                  <p className="text-xs text-slate-500">Live transaction register and running balances</p>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs font-semibold">
                <span className="text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                  In: {formatCurrency(summaryIn)}
                </span>
                <span className="text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-100">
                  Out: {formatCurrency(summaryOut)}
                </span>
              </div>
            </div>

            {/* Filter Sub-bar */}
            <div className="px-5 py-3.5 bg-slate-50/70 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                
                {/* Counter Filter */}
                <Select value={filterCounter} onValueChange={setFilterCounter}>
                  <SelectTrigger className="w-40 h-8 bg-white border-slate-200 text-xs font-medium rounded-xl">
                    <span className="text-slate-400 mr-1">Counter:</span>
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Counters</SelectItem>
                    {counters.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Type Filter */}
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-32 h-8 bg-white border-slate-200 text-xs font-medium rounded-xl">
                    <span className="text-slate-400 mr-1">Type:</span>
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="In">Cash In</SelectItem>
                    <SelectItem value="Out">Cash Out</SelectItem>
                    <SelectItem value="Transfer">Transfer</SelectItem>
                  </SelectContent>
                </Select>

                {/* Date Range Filters */}
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400 text-xs font-medium">From:</span>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-8 text-xs bg-white border-slate-200 rounded-xl w-32"
                  />
                  <span className="text-slate-400 text-xs font-medium">To:</span>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-8 text-xs bg-white border-slate-200 rounded-xl w-32"
                  />
                </div>

                {/* Search */}
                <div className="relative">
                  <MagnifyingGlass className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    type="text"
                    placeholder="Search narration..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-8 pl-8 text-xs bg-white border-slate-200 rounded-xl w-40"
                  />
                </div>
              </div>

              <span className="bg-slate-100 text-slate-700 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-slate-200/60">
                {ledgerData.length} entries
              </span>
            </div>

            {/* Table */}
            <div className="overflow-x-auto min-w-full">
              <Table className="w-full min-w-[800px]">
                <TableHeader className="bg-[#edf3fc]">
                  <TableRow className="border-b border-slate-200/80 hover:bg-transparent">
                    <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3 whitespace-nowrap min-w-[90px]">DATE</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3 whitespace-nowrap min-w-[130px]">COUNTER</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3 whitespace-nowrap min-w-[110px]">TYPE</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3 whitespace-nowrap min-w-[180px]">NARRATION</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3 text-right whitespace-nowrap min-w-[100px]">IN (CR)</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3 text-right whitespace-nowrap min-w-[100px]">OUT (DR)</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3 text-right whitespace-nowrap min-w-[120px]">RUNNING BAL</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3 text-right whitespace-nowrap min-w-[70px]">ACTION</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledgerData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-12 text-center text-xs text-slate-500">
                        No cash/bank ledger transactions found for the selected filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    ledgerData.map((t) => {
                      const isIn = t.type === 'In' || (t.type === 'Transfer' && t.isTransferSide === 'in')
                      const isOut = t.type === 'Out' || (t.type === 'Transfer' && t.isTransferSide === 'out')
                      return (
                        <TableRow key={t.displayId} className="hover:bg-slate-50/80 border-b border-slate-100">
                          <TableCell className="text-slate-600 text-xs font-medium whitespace-nowrap">{t.date}</TableCell>
                          <TableCell className="font-semibold text-slate-900 text-xs whitespace-nowrap min-w-[130px]">{t.displayCounterName}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {t.type === 'Transfer' ? (
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] font-bold">
                                <ArrowsLeftRight className="mr-1 h-3 w-3 inline" />
                                {t.isTransferSide === 'in' ? 'Transfer In' : 'Transfer Out'}
                              </Badge>
                            ) : isIn ? (
                              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold">
                                <ArrowDownLeft className="mr-1 h-3 w-3 inline" /> Cash In
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-bold">
                                <ArrowUpRight className="mr-1 h-3 w-3 inline" /> Cash Out
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-slate-700 text-xs font-medium min-w-[180px] max-w-[320px] whitespace-normal break-words">{t.narration}</TableCell>
                          <TableCell className="text-right font-mono font-bold text-emerald-600 text-xs whitespace-nowrap">
                            {isIn ? formatCurrency(t.amount) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-amber-600 text-xs whitespace-nowrap">
                            {isOut ? formatCurrency(t.amount) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono font-extrabold text-slate-900 text-xs whitespace-nowrap">
                            {t.runningBalance !== undefined ? formatCurrency(t.runningBalance) : '-'}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            {isManualCounterTransaction(t) ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteTransaction(t)}
                                disabled={isLocked}
                                className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg"
                                title="Delete Counter Entry"
                              >
                                <Trash className="h-3.5 w-3.5" weight="bold" />
                              </Button>
                            ) : (
                              <span className="text-[11px] text-slate-400 font-medium italic select-none">Synced</span>
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

      </div>

      {/* POP-UP DIALOG 1: Transfer Money (From Diagram) */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <ArrowsLeftRight className="h-5 w-5 text-[#0256e8]" weight="bold" />
              Transfer Money Between Counters
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleTransferSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">From Counter (Source)</Label>
              <Select value={fromCounterId} onValueChange={setFromCounterId}>
                <SelectTrigger className="w-full h-9 bg-white text-xs">
                  <SelectValue placeholder="Select Source Counter" />
                </SelectTrigger>
                <SelectContent>
                  {counters.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name} ({formatCurrency(c.currentBalance)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">To Counter (Destination)</Label>
              <Select value={toCounterId} onValueChange={setToCounterId}>
                <SelectTrigger className="w-full h-9 bg-white text-xs">
                  <SelectValue placeholder="Select Destination Counter" />
                </SelectTrigger>
                <SelectContent>
                  {counters.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name} ({formatCurrency(c.currentBalance)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Amount (₹)</Label>
                <Input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  className="h-9 text-xs font-bold text-slate-900"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Date</Label>
                <Input
                  type="date"
                  value={transferDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                  className="h-9 text-xs"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Narration / Remark</Label>
              <Textarea
                placeholder="Optional transfer note..."
                value={transferNarration}
                onChange={(e) => setTransferNarration(e.target.value)}
                className="text-xs min-h-[60px]"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setTransferOpen(false)} className="h-9 text-xs">Cancel</Button>
              <Button type="submit" className="bg-[#0256e8] hover:bg-[#0046cd] text-white h-9 text-xs font-bold">Execute Transfer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* POP-UP DIALOG 2: Add / Reduce Money (From Diagram) */}
      <Dialog open={addReduceOpen} onOpenChange={setAddReduceOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <PlusMinus className="h-5 w-5 text-emerald-600" weight="bold" />
              Add / Reduce Money (Cash In & Out)
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddReduceSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Entry Type</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAddReduceType('In')}
                  className={`py-2 text-xs font-bold rounded-xl border flex items-center justify-center gap-1.5 ${
                    addReduceType === 'In'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300 ring-2 ring-emerald-500/20'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  <ArrowDownLeft className="h-4 w-4" weight="bold" />
                  Add Money (Cash In)
                </button>

                <button
                  type="button"
                  onClick={() => setAddReduceType('Out')}
                  className={`py-2 text-xs font-bold rounded-xl border flex items-center justify-center gap-1.5 ${
                    addReduceType === 'Out'
                      ? 'bg-amber-50 text-amber-700 border-amber-300 ring-2 ring-amber-500/20'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  <ArrowUpRight className="h-4 w-4" weight="bold" />
                  Reduce Money (Cash Out)
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Counter / Bank Account</Label>
              <Select value={targetCounterId} onValueChange={setTargetCounterId}>
                <SelectTrigger className="w-full h-9 bg-white text-xs">
                  <SelectValue placeholder="Select Counter" />
                </SelectTrigger>
                <SelectContent>
                  {counters.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name} ({formatCurrency(c.currentBalance)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Amount (₹)</Label>
                <Input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={addReduceAmount}
                  onChange={(e) => setAddReduceAmount(e.target.value)}
                  className="h-9 text-xs font-bold text-slate-900"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Date</Label>
                <Input
                  type="date"
                  value={addReduceDate}
                  onChange={(e) => setAddReduceDate(e.target.value)}
                  className="h-9 text-xs"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Category / Remark</Label>
              <Textarea
                placeholder="Deposit, withdrawal, expense, or adjustment remark..."
                value={addReduceNarration}
                onChange={(e) => setAddReduceNarration(e.target.value)}
                className="text-xs min-h-[60px]"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setAddReduceOpen(false)} className="h-9 text-xs">Cancel</Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 text-xs font-bold">Post Entry</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* POP-UP DIALOG 3: Add / Manage Category (From Diagram) */}
      <Dialog open={manageCountersOpen} onOpenChange={setManageCountersOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <SlidersHorizontal className="h-5 w-5 text-indigo-600" weight="bold" />
              Add & Manage Counters & Categories
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 pt-2">
            {/* Create/Edit Counter Form */}
            <form onSubmit={handleCounterSave} className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                {editingCounter ? `Edit Counter: ${editingCounter.name}` : 'Add New Counter / Bank Account'}
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-slate-700">Counter Name</Label>
                  <Input
                    placeholder={counterType === 'Bank CC / OD' ? 'e.g. HDFC CC, SBI OD' : 'e.g. Counter 1, HDFC Bank'}
                    value={counterName}
                    onChange={(e) => setCounterName(e.target.value)}
                    className="h-8 text-xs bg-white"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-slate-700">Account Type</Label>
                  <Select value={counterType} onValueChange={(val: CounterType) => setCounterType(val)}>
                    <SelectTrigger className="h-8 text-xs bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cash">
                        <div className="flex items-center gap-1.5">
                          <Coins className="h-3.5 w-3.5 text-emerald-600" />
                          Physical Cash
                        </div>
                      </SelectItem>
                      <SelectItem value="Savings">
                        <div className="flex items-center gap-1.5">
                          <Bank className="h-3.5 w-3.5 text-blue-600" />
                          Savings Account
                        </div>
                      </SelectItem>
                      <SelectItem value="Current">
                        <div className="flex items-center gap-1.5">
                          <ArrowsLeftRight className="h-3.5 w-3.5 text-indigo-600" />
                          Current Account
                        </div>
                      </SelectItem>
                      <SelectItem value="Bank CC / OD">
                        <div className="flex items-center gap-1.5">
                          <CreditCard className="h-3.5 w-3.5 text-amber-600" />
                          Bank CC / OD
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-slate-700">Opening Balance (₹)</Label>
                  <Input
                    type="number"
                    step="any"
                    value={counterOpeningBal}
                    onChange={(e) => setCounterOpeningBal(e.target.value)}
                    className="h-8 text-xs bg-white"
                  />
                </div>
              </div>

              {/* As-On Date: shown when opening balance is non-zero */}
              {(parseFloat(counterOpeningBal) || 0) !== 0 && (
                <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50/60">
                  <div className="flex-1 space-y-1">
                    <Label className="text-[11px] font-bold text-slate-700">
                      As-On Date <span className="text-destructive">*</span>
                    </Label>
                    <p className="text-[10px] text-slate-500">Date from which this opening balance is effective</p>
                    <Input
                      type="date"
                      value={counterObDate}
                      onChange={(e) => setCounterObDate(e.target.value)}
                      className="h-8 text-xs bg-white"
                      required
                    />
                  </div>
                </div>
              )}

              {/* CC / OD conditional fields */}
              {counterType === 'Bank CC / OD' && (
                <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50/60">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-bold text-amber-800">
                      Sanctioned Limit (₹) <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="number"
                      placeholder="e.g. 10000000"
                      min="1"
                      step="1"
                      value={counterSanctionedLimit}
                      onChange={(e) => setCounterSanctionedLimit(e.target.value)}
                      className="h-8 text-xs bg-white border-amber-300"
                      required={counterType === 'Bank CC / OD'}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-bold text-amber-800">
                      Margin / Haircut % <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="number"
                      placeholder="e.g. 25"
                      min="0"
                      max="100"
                      step="0.01"
                      value={counterMarginPct}
                      onChange={(e) => setCounterMarginPct(e.target.value)}
                      className="h-8 text-xs bg-white border-amber-300"
                      required={counterType === 'Bank CC / OD'}
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                {editingCounter && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingCounter(null)
                      setCounterName('')
                      setCounterOpeningBal('0')
                      setCounterObDate(getFYStart())
                      setCounterSanctionedLimit('')
                      setCounterMarginPct('')
                    }}
                    className="h-7 text-xs"
                  >
                    Cancel Edit
                  </Button>
                )}
                <Button type="submit" size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white h-7 text-xs font-bold">
                  {editingCounter ? 'Update Counter' : 'Save Counter'}
                </Button>
              </div>
            </form>

            {/* List of Existing Counters */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Configured Counters</h4>
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {counters.map((c) => {
                  const hasTx = transactions.some((t) => 
                    t.counterId === c.id || 
                    t.toCounterId === c.id || 
                    (t.counterName && t.counterName.trim().toLowerCase() === c.name.trim().toLowerCase())
                  )

                  return (
                    <div key={c.id} className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">{c.name}</span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 font-semibold ${
                              c.type === 'Cash'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : c.type === 'Current'
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                : c.type === 'Bank CC / OD'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}
                          >
                            {c.type}
                          </Badge>
                          {hasTx && (
                            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 font-medium bg-slate-100 text-slate-500 border-none">
                              Has Entries
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Opening: {formatCurrency(c.openingBalance || 0)}{c.openingBalanceDate ? ` · As-On: ${new Date(c.openingBalanceDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''} | Current: <span className="font-bold text-slate-800">{formatCurrency(c.currentBalance || 0)}</span>
                        </p>
                        {c.type === 'Bank CC / OD' && c.sanctionedLimit != null && (
                          <p className="text-[10px] text-amber-600 font-medium mt-0.5">
                            Limit: ₹{c.sanctionedLimit.toLocaleString('en-IN')}{c.marginPercentage != null ? ` · Margin: ${c.marginPercentage}%` : ''}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center">
                        <ThreeDotDropdown
                          onEdit={() => {
                            setEditingCounter(c)
                            setCounterName(c.name)
                            setCounterType(c.type || 'Cash')
                            setCounterOpeningBal(c.openingBalance?.toString() || '0')
                            setCounterObDate(c.openingBalanceDate || getFYStart())
                            setCounterSanctionedLimit(c.sanctionedLimit != null ? String(c.sanctionedLimit) : '')
                            setCounterMarginPct(c.marginPercentage != null ? String(c.marginPercentage) : '')
                            toast.info(`Editing counter: ${c.name}`)
                          }}
                          onDelete={() => handleDeleteCounter(c.id)}
                          history={c.history}
                          entityType="Counter"
                          isLocked={isLocked}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" onClick={() => setManageCountersOpen(false)} className="h-8 text-xs font-bold">Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
