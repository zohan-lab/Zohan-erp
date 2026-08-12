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
  Pencil, 
  Trash 
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Counter, CashBankTransaction } from '@/lib/cash-bank-types'
import { calculateTotalCash, calculateTotalBank } from '@/lib/report-calculations'

interface CashBankCountersMasterProps {
  counters: Counter[]
  transactions?: CashBankTransaction[]
  onUpdateCounters: (counters: Counter[]) => void
  isLocked?: boolean
}

export default function CashBankCountersMaster({ 
  counters, 
  transactions = [],
  onUpdateCounters,
  isLocked = false 
}: CashBankCountersMasterProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState<'Cash' | 'Bank'>('Cash')
  const [openingBalance, setOpeningBalance] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

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

    if (editingId) {
      const editingCounter = counters.find(c => c.id === editingId)
      const hasTx = transactions.some(t => 
        t.counterId === editingId || 
        t.toCounterId === editingId || 
        (editingCounter && t.counterName && t.counterName.trim().toLowerCase() === editingCounter.name.trim().toLowerCase())
      )
      if (hasTx) {
        toast.error('Cannot edit counter because it has existing transactions.')
        return
      }

      const updatedCounters = counters.map(c => 
        c.id === editingId 
          ? { ...c, name: name.trim(), type }
          : c
      )
      onUpdateCounters(updatedCounters)
      toast.success('Counter updated successfully')
      setEditingId(null)
    } else {
      const newCounter: Counter = {
        id: 'counter_' + Date.now(),
        name: name.trim(),
        type,
        openingBalance: parseFloat(openingBalance) || 0,
        currentBalance: parseFloat(openingBalance) || 0
      }
      onUpdateCounters([...counters, newCounter])
      toast.success(`Counter "${newCounter.name}" created successfully`)
    }

    setName('')
    setType('Cash')
    setOpeningBalance('')
  }

  const startEdit = (counter: Counter) => {
    if (isLocked) {
      toast.error('Data is locked. Please unlock to make changes.')
      return
    }
    
    const hasTx = transactions.some(t => 
      t.counterId === counter.id || 
      t.toCounterId === counter.id || 
      (t.counterName && t.counterName.trim().toLowerCase() === counter.name.trim().toLowerCase())
    )
    if (hasTx) {
      toast.error(`Cannot edit counter "${counter.name}" because it has existing transactions.`)
      return
    }

    setEditingId(counter.id)
    setName(counter.name)
    setType(counter.type)
  }

  const handleDelete = (id: string) => {
    if (isLocked) {
      toast.error('Data is locked. Please unlock to make changes.')
      return
    }

    const target = counters.find(c => c.id === id)
    const hasTx = transactions.some(t => 
      t.counterId === id || 
      t.toCounterId === id || 
      (target && t.counterName && t.counterName.trim().toLowerCase() === target.name.trim().toLowerCase())
    )
    if (hasTx) {
      toast.error(`Cannot delete counter "${target?.name || 'Counter'}" because it has existing transactions.`)
      return
    }

    const updatedCounters = counters.filter(c => c.id !== id)
    onUpdateCounters(updatedCounters)
    toast.success('Counter deleted successfully')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setName('')
    setType('Cash')
    setOpeningBalance('')
  }

  const totalCash = calculateTotalCash(counters)

  const totalBank = calculateTotalBank(counters)

  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Buildings className="h-6 w-6 text-primary" weight="duotone" />
          Cash & Bank Master
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure and manage cash counters and bank accounts
        </p>
      </div>

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
              {counters.filter(c => c.type === 'Bank').length} account(s)
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" weight="duotone" />
            {editingId ? 'Edit Counter' : 'Add New Counter'}
          </CardTitle>
          <CardDescription>
            {editingId 
              ? 'Update counter name and type' 
              : 'Register a new physical cash point or commercial bank account'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="counter-type">Counter Type</Label>
                <Select 
                  value={type} 
                  onValueChange={(value: 'Cash' | 'Bank') => setType(value)}
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
                    <SelectItem value="Bank">
                      <div className="flex items-center gap-2">
                        <Bank className="h-4 w-4 text-blue-600" />
                        Bank Account
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
                  placeholder="e.g., Office, Godown, Self"
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
                    onClick={cancelEdit}
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
                  <TableHead className="text-right font-semibold">Live Balance</TableHead>
                  <TableHead className="text-center font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {counters.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
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
                            className={
                              counter.type === 'Cash' 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800' 
                                : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800'
                            }
                          >
                            {counter.type === 'Cash' ? (
                              <Coins className="h-3 w-3 mr-1" />
                            ) : (
                              <Bank className="h-3 w-3 mr-1" />
                            )}
                            {counter.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-mono font-bold text-foreground">
                            ₹{counter.currentBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => startEdit(counter)}
                              disabled={isLocked || hasTx}
                              className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950 disabled:opacity-30"
                              title={hasTx ? 'Cannot edit counter with existing transactions' : 'Edit Counter'}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={isLocked || hasTx}
                                  className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950 disabled:opacity-30"
                                  title={hasTx ? 'Cannot delete counter with existing transactions' : 'Delete Counter'}
                                >
                                  <Trash className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Counter</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete "{counter.name}"? This action cannot be undone and will remove all associated transactions.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(counter.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete Counter
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
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
