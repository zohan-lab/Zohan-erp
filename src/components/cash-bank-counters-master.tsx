import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Buildings,
  Coins,
  Bank,
  Plus,
  Trash,
  CreditCard,
  ArrowsLeftRight,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Counter, CounterType, CashBankTransaction, isBankType } from '@/lib/cash-bank-types'
import { calculateTotalCash, calculateTotalBank } from '@/lib/report-calculations'
import { ThreeDotDropdown } from '@/components/ui/three-dot-dropdown'
import { getChangedByLabel, getChangedByRole } from '@/lib/security-utils'
import { EditHistoryChange, EditHistoryLog } from '@/lib/types'

interface CashBankCountersMasterProps {
  counters: Counter[]
  transactions?: CashBankTransaction[]
  onUpdateCounters: (counters: Counter[]) => void
  isLocked?: boolean
}

/** Visual config per counter type */
const TYPE_BADGE_CLASS: Record<CounterType, string> = {
  Cash: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800',
  Savings: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800',
  Current: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-400 dark:border-indigo-800',
  'Bank CC / OD': 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800',
  Bank: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800',
}

const TYPE_LABEL: Record<CounterType, string> = {
  Cash: 'Physical Cash',
  Savings: 'Savings',
  Current: 'Current',
  'Bank CC / OD': 'Bank CC / OD',
  Bank: 'Bank',
}

function CounterTypeBadgeIcon({ type }: { type: CounterType }) {
  if (type === 'Cash') return <Coins className="h-3 w-3 mr-1" />
  if (type === 'Current') return <ArrowsLeftRight className="h-3 w-3 mr-1" />
  if (type === 'Bank CC / OD') return <CreditCard className="h-3 w-3 mr-1" />
  return <Bank className="h-3 w-3 mr-1" />
}

/** Returns the start of the current Indian financial year as YYYY-MM-DD */
function getFYStart(): string {
  const now = new Date()
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  return `${year}-04-01`
}

export default function CashBankCountersMaster({
  counters,
  transactions = [],
  onUpdateCounters,
  isLocked = false,
}: CashBankCountersMasterProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState<CounterType>('Cash')
  const [openingBalance, setOpeningBalance] = useState('')
  const [openingBalanceDate, setOpeningBalanceDate] = useState(getFYStart())
  const [sanctionedLimit, setSanctionedLimit] = useState('')
  const [marginPercentage, setMarginPercentage] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const isCCOD = type === 'Bank CC / OD'

  const resetForm = () => {
    setName('')
    setType('Cash')
    setOpeningBalance('')
    setOpeningBalanceDate(getFYStart())
    setSanctionedLimit('')
    setMarginPercentage('')
    setEditingId(null)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (isLocked) {
      toast.error('Data is locked. Please unlock to make changes.')
      return
    }

    if (!name.trim()) {
      toast.error('Please enter a counter name')
      return
    }

    if (isCCOD) {
      if (!sanctionedLimit || parseFloat(sanctionedLimit) <= 0) {
        toast.error('Please enter a valid Sanctioned Limit for CC / OD account')
        return
      }
      if (!marginPercentage || parseFloat(marginPercentage) < 0 || parseFloat(marginPercentage) > 100) {
        toast.error('Please enter a valid Margin / Haircut Percentage (0–100)')
        return
      }
    }

    if (editingId) {
      const editingCounter = counters.find(c => c.id === editingId)
      if (!editingCounter) return

      const openBal = parseFloat(openingBalance) || 0
      const changes: EditHistoryChange[] = []
      if (editingCounter.name !== name.trim()) {
        changes.push({ field: 'Counter Name', from: editingCounter.name, to: name.trim() })
      }
      if (editingCounter.type !== type) {
        changes.push({ field: 'Account Type', from: editingCounter.type, to: type })
      }
      if (editingCounter.openingBalance !== openBal) {
        changes.push({ field: 'Opening Balance', from: `₹${(editingCounter.openingBalance || 0).toLocaleString('en-IN')}`, to: `₹${openBal.toLocaleString('en-IN')}` })
      }
      if ((editingCounter.openingBalanceDate || '') !== (openBal !== 0 ? (openingBalanceDate || '') : '')) {
        changes.push({ field: 'As-On Date', from: editingCounter.openingBalanceDate || 'None', to: openingBalanceDate || 'None' })
      }
      if (isCCOD && (editingCounter.sanctionedLimit || 0) !== (parseFloat(sanctionedLimit) || 0)) {
        changes.push({ 
          field: 'Sanctioned Limit', 
          from: `₹${(editingCounter.sanctionedLimit || 0).toLocaleString('en-IN')}`, 
          to: `₹${(parseFloat(sanctionedLimit) || 0).toLocaleString('en-IN')}` 
        })
      }
      if (isCCOD && (editingCounter.marginPercentage || 0) !== (parseFloat(marginPercentage) || 0)) {
        changes.push({ 
          field: 'Margin %', 
          from: `${editingCounter.marginPercentage || 0}%`, 
          to: `${parseFloat(marginPercentage) || 0}%` 
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
      const updatedCounters = counters.map(c =>
        c.id === editingId
          ? {
              ...c,
              name: name.trim(),
              type,
              openingBalance: openBal,
              currentBalance: c.currentBalance + diff,
              openingBalanceDate: openBal !== 0 ? openingBalanceDate : undefined,
              sanctionedLimit: isCCOD ? parseFloat(sanctionedLimit) : undefined,
              marginPercentage: isCCOD ? parseFloat(marginPercentage) : undefined,
              history: updatedHistory,
            }
          : c
      )
      onUpdateCounters(updatedCounters)
      toast.success('Counter updated successfully')
    } else {
      const openBal = parseFloat(openingBalance) || 0
      const changes: EditHistoryChange[] = [
        { field: 'Counter Name', from: '', to: name.trim() },
        { field: 'Account Type', from: '', to: type },
        { field: 'Opening Balance', from: '', to: `₹${openBal.toLocaleString('en-IN')}` },
        ...(openBal !== 0 && openingBalanceDate ? [{ field: 'As-On Date', from: '', to: openingBalanceDate }] : []),
        ...(isCCOD && sanctionedLimit ? [{ field: 'Sanctioned Limit', from: '', to: `₹${parseFloat(sanctionedLimit).toLocaleString('en-IN')}` }] : []),
        ...(isCCOD && marginPercentage ? [{ field: 'Margin %', from: '', to: `${marginPercentage}%` }] : [])
      ]

      const newCounter: Counter = {
        id: 'counter_' + Date.now(),
        name: name.trim(),
        type,
        openingBalance: openBal,
        currentBalance: openBal,
        openingBalanceDate: openBal !== 0 ? openingBalanceDate : undefined,
        ...(isCCOD && {
          sanctionedLimit: parseFloat(sanctionedLimit),
          marginPercentage: parseFloat(marginPercentage),
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
      onUpdateCounters([...counters, newCounter])
      toast.success(`Counter "${newCounter.name}" created successfully`)
    }

    resetForm()
  }

  const startEdit = (counter: Counter) => {
    if (isLocked) {
      toast.error('Data is locked. Please unlock to make changes.')
      return
    }

    setEditingId(counter.id)
    setName(counter.name)
    setType(counter.type)
    setOpeningBalance(counter.openingBalance != null ? String(counter.openingBalance) : '0')
    setOpeningBalanceDate(counter.openingBalanceDate || getFYStart())
    setSanctionedLimit(counter.sanctionedLimit != null ? String(counter.sanctionedLimit) : '')
    setMarginPercentage(counter.marginPercentage != null ? String(counter.marginPercentage) : '')
  }

  const handleDelete = (id: string) => {
    if (isLocked) {
      toast.error('Data is locked. Please unlock to make changes.')
      return
    }

    const target = counters.find(c => c.id === id)
    if (!target) return

    const hasTx = transactions.some(t =>
      t.counterId === id ||
      t.toCounterId === id ||
      (t.counterName && t.counterName.trim().toLowerCase() === target.name.trim().toLowerCase())
    )
    if (hasTx) {
      if (!window.confirm(`Warning: Counter "${target.name}" has recorded transactions. Deleting it will remove the account. Are you sure you want to delete?`)) {
        return
      }
    } else {
      if (!window.confirm(`Delete counter "${target.name}"? This action cannot be undone.`)) {
        return
      }
    }

    const updatedCounters = counters.filter(c => c.id !== id)
    onUpdateCounters(updatedCounters)
    toast.success('Counter deleted successfully')
  }

  const totalCash = calculateTotalCash(counters)
  const totalBank = calculateTotalBank(counters)

  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Buildings className="h-6 w-6 text-primary" weight="duotone" />
          Cash &amp; Bank Master
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure and manage cash counters and bank accounts
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-emerald-900 border-emerald-200 dark:border-emerald-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Coins className="h-4 w-4 text-emerald-600 dark:text-emerald-400" weight="duotone" />
              Total Cash Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
              ₹{totalCash.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
              {counters.filter(c => c.type === 'Cash').length} counter(s)
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-blue-200 dark:border-blue-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Bank className="h-4 w-4 text-blue-600 dark:text-blue-400" weight="duotone" />
              Total Bank Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
              ₹{totalBank.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              {counters.filter(c => isBankType(c.type)).length} account(s) — Savings, Current &amp; CC/OD
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Add / Edit Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" weight="duotone" />
            {editingId ? 'Edit Counter' : 'Add New Counter'}
          </CardTitle>
          <CardDescription>
            {editingId
              ? 'Update counter name and type'
              : 'Register a new physical cash point or commercial bank account'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Row 1: Type, Name, Opening Balance */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="counter-type">Account Type</Label>
                <Select
                  value={type}
                  onValueChange={(value: CounterType) => setType(value)}
                  disabled={isLocked}
                >
                  <SelectTrigger id="counter-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">
                      <div className="flex items-center gap-2">
                        <Coins className="h-4 w-4 text-emerald-600" />
                        Physical Cash
                      </div>
                    </SelectItem>
                    <SelectItem value="Savings">
                      <div className="flex items-center gap-2">
                        <Bank className="h-4 w-4 text-blue-600" />
                        Savings Account
                      </div>
                    </SelectItem>
                    <SelectItem value="Current">
                      <div className="flex items-center gap-2">
                        <ArrowsLeftRight className="h-4 w-4 text-indigo-600" />
                        Current Account
                      </div>
                    </SelectItem>
                    <SelectItem value="Bank CC / OD">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-amber-600" />
                        Bank CC / OD
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="counter-name">Counter Name</Label>
                <Input
                  id="counter-name"
                  type="text"
                  placeholder={isCCOD ? 'e.g., HDFC CC, SBI OD' : 'e.g., Office, Godown, Self'}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isLocked}
                  required
                />
              </div>

              {!editingId && (
                <div className="space-y-2">
                  <Label htmlFor="opening-balance">Opening Balance (₹)</Label>
                  <Input
                    id="opening-balance"
                    type="number"
                    placeholder="0.00"
                    step="0.01"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    disabled={isLocked}
                  />
                </div>
              )}
            </div>

            {/* As-On Date: shown when opening balance is non-zero and not editing */}
            {!editingId && (parseFloat(openingBalance) || 0) !== 0 && (
              <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-800/40 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="space-y-1.5 flex-1">
                  <Label htmlFor="ob-date" className="font-semibold">
                    As-On Date
                    <span className="text-destructive ml-0.5">*</span>
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    The date from which this opening balance is effective (typically start of financial year)
                  </p>
                  <Input
                    id="ob-date"
                    type="date"
                    value={openingBalanceDate}
                    onChange={(e) => setOpeningBalanceDate(e.target.value)}
                    disabled={isLocked}
                    required
                  />
                </div>
              </div>
            )}

            {/* Row 2: CC / OD conditional fields */}
            {isCCOD && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg border border-amber-200 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/30 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="space-y-1.5">
                  <Label htmlFor="sanctioned-limit" className="text-amber-800 dark:text-amber-300 font-semibold">
                    Sanctioned Limit (₹)
                    <span className="text-destructive ml-0.5">*</span>
                  </Label>
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Total approved credit / OD limit granted by the bank
                  </p>
                  <Input
                    id="sanctioned-limit"
                    type="number"
                    placeholder="e.g., 10000000"
                    min="1"
                    step="1"
                    value={sanctionedLimit}
                    onChange={(e) => setSanctionedLimit(e.target.value)}
                    disabled={isLocked}
                    required={isCCOD}
                    className="border-amber-300 focus-visible:ring-amber-400"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="margin-percentage" className="text-amber-800 dark:text-amber-300 font-semibold">
                    Margin / Haircut Percentage (%)
                    <span className="text-destructive ml-0.5">*</span>
                  </Label>
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Bank's stock / asset margin applied on collateral (e.g., 25 or 30)
                  </p>
                  <Input
                    id="margin-percentage"
                    type="number"
                    placeholder="e.g., 25"
                    min="0"
                    max="100"
                    step="0.01"
                    value={marginPercentage}
                    onChange={(e) => setMarginPercentage(e.target.value)}
                    disabled={isLocked}
                    required={isCCOD}
                    className="border-amber-300 focus-visible:ring-amber-400"
                  />
                </div>
              </div>
            )}

            <div className="flex gap-2">
              {editingId ? (
                <>
                  <Button type="submit" className="flex-1" disabled={isLocked}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Save Changes
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetForm}
                    disabled={isLocked}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button type="submit" className="w-full" disabled={isLocked}>
                  <Plus className="h-4 w-4 mr-2" />
                  Register Counter Entry
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Master Counter List */}
      <Card>
        <CardHeader>
          <CardTitle>Master Counter List</CardTitle>
          <CardDescription>
            View and manage all configured counters and bank accounts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Counter Name</TableHead>
                  <TableHead className="font-semibold">Account Type</TableHead>
                  <TableHead className="font-semibold">Opening Balance / As-On Date</TableHead>
                  <TableHead className="font-semibold">CC/OD Details</TableHead>
                  <TableHead className="text-right font-semibold">Live Balance</TableHead>
                  <TableHead className="text-center font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {counters.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No counters configured yet. Add your first counter above.
                    </TableCell>
                  </TableRow>
                ) : (
                  counters.map((counter) => {
                    const hasTx = transactions.some(t =>
                      t.counterId === counter.id ||
                      t.toCounterId === counter.id ||
                      (t.counterName && t.counterName.trim().toLowerCase() === counter.name.trim().toLowerCase())
                    )

                    return (
                      <TableRow key={counter.id} className="hover:bg-muted/30">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground">{counter.name}</span>
                            {hasTx && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-medium">
                                Has Entries
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={TYPE_BADGE_CLASS[counter.type] ?? TYPE_BADGE_CLASS['Savings']}
                          >
                            <CounterTypeBadgeIcon type={counter.type} />
                            {TYPE_LABEL[counter.type] ?? counter.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs space-y-0.5">
                            <p className="font-medium text-foreground">
                              ₹{(counter.openingBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </p>
                            {counter.openingBalanceDate ? (
                              <p className="text-muted-foreground">
                                As-On: {new Date(counter.openingBalanceDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </p>
                            ) : (
                              <p className="text-muted-foreground">No date set</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {counter.type === 'Bank CC / OD' && counter.sanctionedLimit != null ? (
                            <div className="text-xs space-y-0.5">
                              <p className="text-amber-700 dark:text-amber-400 font-medium">
                                Limit: ₹{counter.sanctionedLimit.toLocaleString('en-IN')}
                              </p>
                              {counter.marginPercentage != null && (
                                <p className="text-muted-foreground">
                                  Margin: {counter.marginPercentage}%
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-mono font-bold text-foreground">
                            ₹{counter.currentBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center">
                            <ThreeDotDropdown
                              onEdit={() => startEdit(counter)}
                              onDelete={() => handleDelete(counter.id)}
                              history={counter.history}
                              entityType="Counter"
                              isLocked={isLocked}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
