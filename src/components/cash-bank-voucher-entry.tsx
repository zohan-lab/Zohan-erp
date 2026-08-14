import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { 
  TrendUp, 
  TrendDown, 
  Coins, 
  Bank,
  ArrowsLeftRight
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Counter, CashBankTransaction } from '@/lib/cash-bank-types'

interface CashBankVoucherEntryProps {
  counters: Counter[]
  transactions: CashBankTransaction[]
  onUpdateAll: (counters: Counter[], transactions: CashBankTransaction[]) => void
  isLocked?: boolean
}

export default function CashBankVoucherEntry({ 
  counters, 
  transactions, 
  onUpdateAll,
  isLocked = false
}: CashBankVoucherEntryProps) {
  const [selectedCounterId, setSelectedCounterId] = useState('')
  const [toCounterId, setToCounterId] = useState('')
  const [type, setType] = useState<'In' | 'Out' | 'Transfer'>('In')
  const [amount, setAmount] = useState('')
  const [narration, setNarration] = useState('')
  const [voucherDate, setVoucherDate] = useState(new Date().toISOString().split('T')[0])

  const handlePost = (e: React.FormEvent) => {
    e.preventDefault()

    if (isLocked) {
      toast.error('Data is locked. Please unlock to make changes.')
      return
    }

    if (!selectedCounterId) {
      toast.error('Please select a counter')
      return
    }

    if (type === 'Transfer' && !toCounterId) {
      toast.error('Please select a destination counter')
      return
    }

    if (type === 'Transfer' && selectedCounterId === toCounterId) {
      toast.error('Source and destination counters cannot be the same')
      return
    }

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid amount')
      return
    }

    const amt = parseFloat(amount)
    const sourceCounter = counters.find(c => c.id === selectedCounterId)
    
    if (!sourceCounter) {
      toast.error('Selected counter not found')
      return
    }

    let toCounter: Counter | undefined
    if (type === 'Transfer') {
      toCounter = counters.find(c => c.id === toCounterId)
      if (!toCounter) {
        toast.error('Destination counter not found')
        return
      }
    }

    const updatedCounters = counters.map(c => {
      if (type === 'Transfer') {
        if (c.id === selectedCounterId) {
          const newBalance = c.currentBalance - amt
          if (newBalance < 0) {
            toast.warning('Transfer will result in negative balance')
          }
          return { ...c, currentBalance: newBalance }
        }
        if (c.id === toCounterId) {
          return { ...c, currentBalance: c.currentBalance + amt }
        }
      } else {
        if (c.id === selectedCounterId) {
          const newBalance = type === 'In' ? c.currentBalance + amt : c.currentBalance - amt
          if (newBalance < 0) {
            toast.warning('Transaction will result in negative balance')
          }
          return { ...c, currentBalance: newBalance }
        }
      }
      return c
    })

    const newTxn: CashBankTransaction = {
      id: 'txn_' + Date.now(),
      date: voucherDate,
      counterId: selectedCounterId,
      counterName: sourceCounter.name,
      type,
      amount: amt,
      narration: narration.trim(),
      ...(type === 'Transfer' && toCounter ? {
        toCounterId: toCounter.id,
        toCounterName: toCounter.name
      } : {})
    }

    onUpdateAll(updatedCounters, [newTxn, ...transactions])

    setAmount('')
    setNarration('')
    setSelectedCounterId('')
    setToCounterId('')
    
    const successMessage = type === 'Transfer' 
      ? 'Counter transfer recorded successfully'
      : type === 'In' 
        ? 'Cash In recorded successfully' 
        : 'Cash Out recorded successfully'
    
    toast.success(successMessage)
  }

  if (counters.length === 0) {
    return (
      <div className="space-y-6">
        <div className="border-b border-border pb-4">
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <TrendUp className="h-6 w-6 text-primary" weight="duotone" />
            Post Treasury Voucher
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Record cash flow and bank transfers
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Bank className="h-8 w-8 text-muted-foreground" weight="duotone" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">No Counters Found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                You need to create at least one counter or bank account before posting vouchers.
              </p>
              <p className="text-xs text-muted-foreground">
                Navigate to Cash & Bank Master to add your first counter.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <TrendUp className="h-6 w-6 text-primary" weight="duotone" />
          Post Treasury Voucher
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Record cash inflow and outflow transactions
        </p>
      </div>

      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendUp className="h-5 w-5 text-primary" weight="duotone" />
            Voucher Entry Form
          </CardTitle>
          <CardDescription>
            Post new cash in or cash out transaction to update counter balances
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePost} className="space-y-6">
            <div className="space-y-2">
              <Label>Voucher Direction</Label>
              <div className="flex gap-2 h-10">
                <Button
                  type="button"
                  variant={type === 'In' ? 'default' : 'outline'}
                  className={type === 'In' ? 'flex-1 bg-emerald-600 hover:bg-emerald-700' : 'flex-1'}
                  onClick={() => setType('In')}
                  disabled={isLocked}
                >
                  <TrendUp className="h-4 w-4 mr-1" weight="bold" />
                  Cash In
                </Button>
                <Button
                  type="button"
                  variant={type === 'Out' ? 'default' : 'outline'}
                  className={type === 'Out' ? 'flex-1 bg-rose-600 hover:bg-rose-700' : 'flex-1'}
                  onClick={() => setType('Out')}
                  disabled={isLocked}
                >
                  <TrendDown className="h-4 w-4 mr-1" weight="bold" />
                  Cash Out
                </Button>
                <Button
                  type="button"
                  variant={type === 'Transfer' ? 'default' : 'outline'}
                  className={type === 'Transfer' ? 'flex-1 bg-blue-600 hover:bg-blue-700' : 'flex-1'}
                  onClick={() => setType('Transfer')}
                  disabled={isLocked}
                >
                  <ArrowsLeftRight className="h-4 w-4 mr-1" weight="bold" />
                  Transfer Balance
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="select-counter">
                  {type === 'Transfer' ? 'Transfer money from' : 'Select cash / bank account'}
                </Label>
                <Select 
                  value={selectedCounterId} 
                  onValueChange={setSelectedCounterId}
                  disabled={isLocked}
                >
                  <SelectTrigger id="select-counter">
                    <SelectValue placeholder={type === 'Transfer' ? 'Select source account' : 'Select account'} />
                  </SelectTrigger>
                  <SelectContent>
                    {counters.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        <div className="flex items-center gap-2">
                          {c.type === 'Cash' ? (
                            <Coins className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <Bank className="h-4 w-4 text-blue-600" />
                          )}
                          <span>{c.name} ({c.type === 'Cash' ? 'Cash' : c.type})</span>
                          <span className="text-xs text-muted-foreground ml-auto">
                            ₹{c.currentBalance.toLocaleString('en-IN')}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {type === 'Transfer' && (
                <div className="space-y-2">
                  <Label htmlFor="to-counter">Transfer money to</Label>
                  <Select 
                    value={toCounterId} 
                    onValueChange={setToCounterId}
                    disabled={isLocked}
                  >
                    <SelectTrigger id="to-counter">
                      <SelectValue placeholder="Select destination account" />
                    </SelectTrigger>
                    <SelectContent>
                      {counters
                        .filter(c => c.id !== selectedCounterId)
                        .map(c => (
                          <SelectItem key={c.id} value={c.id}>
                            <div className="flex items-center gap-2">
                              {c.type === 'Cash' ? (
                                <Coins className="h-4 w-4 text-emerald-600" />
                              ) : (
                                <Bank className="h-4 w-4 text-blue-600" />
                              )}
                              <span>{c.name} ({c.type === 'Cash' ? 'Cash' : c.type})</span>
                              <span className="text-xs text-muted-foreground ml-auto">
                                ₹{c.currentBalance.toLocaleString('en-IN')}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="voucher-date">Date</Label>
                <Input
                  id="voucher-date"
                  type="date"
                  value={voucherDate}
                  onChange={(e) => setVoucherDate(e.target.value)}
                  disabled={isLocked}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (₹)</Label>
                <Input
                  id="amount"
                  type="number"
                  placeholder="5000"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={isLocked}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Current Balance</Label>
                <div className="flex min-h-11 items-center rounded-md border bg-muted/30 px-3 text-sm font-mono">
                  ₹{(counters.find(c => c.id === selectedCounterId)?.currentBalance || 0).toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="narration">Add Remarks</Label>
              <Textarea
                  id="narration"
                  placeholder="Enter transfer notes, reference number, or expense remarks"
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  disabled={isLocked}
                  className="min-h-20"
              />
            </div>

            <Button 
              type="submit" 
              className="w-full bg-primary hover:bg-primary/90 h-11"
              disabled={isLocked}
            >
              {type === 'Transfer' ? (
                <>
                  <ArrowsLeftRight className="h-5 w-5 mr-2" weight="bold" />
                  Post Counter Transfer Voucher
                </>
              ) : type === 'In' ? (
                <>
                  <TrendUp className="h-5 w-5 mr-2" weight="bold" />
                  Post Cash In Voucher Into System
                </>
              ) : (
                <>
                  <TrendDown className="h-5 w-5 mr-2" weight="bold" />
                  Post Cash Out Voucher Into System
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-1">Today's Entries</div>
              <div className="text-2xl font-bold text-foreground">
                {transactions.filter(t => t.date === new Date().toISOString().split('T')[0]).length}
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-1">Total Cash In</div>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                ₹{transactions
                  .filter(t => t.type === 'In')
                  .reduce((sum, t) => sum + t.amount, 0)
                  .toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-1">Total Cash Out</div>
              <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">
                ₹{transactions
                  .filter(t => t.type === 'Out')
                  .reduce((sum, t) => sum + t.amount, 0)
                  .toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
