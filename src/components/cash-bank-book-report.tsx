import { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { Wallet, Funnel, X, ArrowLeft, ArrowRight, ArrowUpRight, ArrowDownLeft, Coins, Bank } from '@phosphor-icons/react'
import { Counter, CashBankTransaction, isBankType } from '@/lib/cash-bank-types'
import { calculateTotalCash, calculateTotalBank, calculateTotalLiquid } from '@/lib/report-calculations'

type DisplayTransaction = CashBankTransaction & {
  displayId: string;
  isTransferSide?: 'out' | 'in';
  displayCounterId: string;
  displayCounterName: string;
  runningBalance?: number;
  _index: number;
};

interface CashBankBookReportProps {
  counters: Counter[]
  transactions: CashBankTransaction[]
}

export default function CashBankBookReport({
  counters,
  transactions,
}: CashBankBookReportProps) {
  const [filterCounter, setFilterCounter] = useState<string>('all')
  const [filterType, setFilterType] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const allTransactions = useMemo(() => {
    let expanded: DisplayTransaction[] = [];
    transactions.forEach((t, i) => {
      if (t.type === 'Transfer') {
        expanded.push({ 
          ...t, 
          displayId: `${t.id}-out`, 
          isTransferSide: 'out', 
          displayCounterId: t.counterId,
          displayCounterName: t.counterName,
          _index: i * 10
        });
        expanded.push({ 
          ...t, 
          displayId: `${t.id}-in`, 
          isTransferSide: 'in', 
          displayCounterId: t.toCounterId!,
          displayCounterName: t.toCounterName!,
          _index: i * 10 + 1
        });
      } else {
        expanded.push({ 
          ...t, 
          displayId: t.id, 
          displayCounterId: t.counterId,
          displayCounterName: t.counterName,
          _index: i * 10
        });
      }
    });

    // Sort ascending for balance calculation
    let expandedAscending = expanded.sort((a, b) => {
      const timeDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a._index - b._index;
    });

    // Filter by counter BEFORE calculating balance
    let filteredForBalance = expandedAscending;
    if (filterCounter !== 'all') {
      filteredForBalance = filteredForBalance.filter(t => t.displayCounterId === filterCounter);
    }
    
    let currentBalance = 0;
    if (filterCounter === 'all') {
      currentBalance = counters.reduce((sum, c) => sum + (c.openingBalance || 0), 0);
    } else {
      const counter = counters.find(c => c.id === filterCounter);
      if (counter) currentBalance = counter.openingBalance || 0;
    }
    
    const withBalance = filteredForBalance.map(t => {
      if (filterCounter !== 'all') {
        if (t.type === 'In' || t.isTransferSide === 'in') {
          currentBalance += t.amount;
        } else if (t.type === 'Out' || t.isTransferSide === 'out') {
          currentBalance -= t.amount;
        }
      } else {
        if (t.type === 'In') {
          currentBalance += t.amount;
        } else if (t.type === 'Out') {
          currentBalance -= t.amount;
        }
      }
      return { ...t, runningBalance: currentBalance };
    });

    // NOW apply the remaining filters
    let finalFiltered = withBalance;
    if (filterType !== 'all') {
      finalFiltered = finalFiltered.filter(t => t.type.toLowerCase() === filterType.toLowerCase())
    }
    if (dateFrom) {
      finalFiltered = finalFiltered.filter(t => new Date(t.date) >= new Date(dateFrom))
    }
    if (dateTo) {
      const to = new Date(dateTo)
      to.setHours(23, 59, 59, 999)
      finalFiltered = finalFiltered.filter(t => new Date(t.date) <= to)
    }

    // Finally, sort descending for display
    return finalFiltered.sort((a, b) => {
      const timeDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
      if (timeDiff !== 0) return timeDiff;
      return b._index - a._index;
    });
  }, [transactions, counters, filterCounter, filterType, dateFrom, dateTo])

  const clearFilters = () => {
    setFilterCounter('all')
    setFilterType('all')
    setDateFrom('')
    setDateTo('')
  }

  const activeFiltersCount = 
    (filterCounter !== 'all' ? 1 : 0) + 
    (filterType !== 'all' ? 1 : 0) + 
    (dateFrom ? 1 : 0) + 
    (dateTo ? 1 : 0)

  const totalCash = calculateTotalCash(counters)

  const totalBank = calculateTotalBank(counters)

  const totalLiquid = calculateTotalLiquid(counters)

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto animate-in fade-in duration-700 ease-out p-2 sm:p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tighter text-zinc-900">
            Cash & Bank Ledger
          </h1>
          <p className="text-sm font-medium text-zinc-500">
            Real-time financial balances and transaction history
          </p>
        </div>
      </div>

      {/* Balances Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Total Cash Balance */}
        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200 shadow-sm transition-all duration-300 hover:shadow-md rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Coins className="h-5 w-5 text-emerald-600" weight="duotone" />
              Total Cash Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tracking-tighter text-emerald-700">
              ₹{totalCash.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs font-medium text-emerald-600/80 mt-2 uppercase tracking-widest">
              {counters.filter(c => c.type === 'Cash').length} counter(s)
            </p>
          </CardContent>
        </Card>

        {/* Total Bank Balance */}
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 shadow-sm transition-all duration-300 hover:shadow-md rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Bank className="h-5 w-5 text-blue-600" weight="duotone" />
              Total Bank Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tracking-tighter text-blue-700">
              ₹{totalBank.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs font-medium text-blue-600/80 mt-2 uppercase tracking-widest">
              {counters.filter(c => isBankType(c.type)).length} account(s)
            </p>
          </CardContent>
        </Card>

        {/* Individual Counters */}
        {[...counters].sort((a, b) => {
          if (isBankType(a.type) && !isBankType(b.type)) return -1;
          if (!isBankType(a.type) && isBankType(b.type)) return 1;
          return 0;
        }).map(c => (
          <div 
            key={c.id} 
            className="group relative overflow-hidden rounded-2xl bg-white border border-zinc-200/80 p-6 shadow-sm transition-all duration-300 hover:shadow-md hover:border-zinc-300"
          >
            <div className="flex justify-between items-start mb-6">
              <span className="text-sm font-medium text-zinc-500 truncate pr-2">
                {c.name}
              </span>
              <div className="flex items-center rounded-full bg-zinc-100 px-2.5 py-1 text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
                {c.type}
              </div>
            </div>
            <div className="text-3xl font-semibold tracking-tighter text-zinc-900">
              ₹{c.currentBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        ))}
      </div>

      {/* Ledger Section */}
      <div className="rounded-2xl bg-white border border-zinc-200/80 shadow-sm overflow-hidden flex flex-col">
        {/* Filters Toolbar */}
        <div className="px-5 py-4 border-b border-zinc-100 bg-zinc-50/50">
          <div className="flex flex-col sm:flex-row flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 mr-auto">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white border border-zinc-200 shadow-sm">
                <Funnel className="h-3.5 w-3.5 text-zinc-600" weight="bold" />
              </div>
              <span className="text-sm font-medium text-zinc-900">Filter Ledger</span>
            </div>
            
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <Select value={filterCounter} onValueChange={setFilterCounter}>
                <SelectTrigger className="h-9 w-[160px] rounded-full border-zinc-200 bg-white px-4 text-sm font-medium focus:ring-0 shadow-sm">
                  <SelectValue placeholder="All Counters" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all" className="rounded-lg cursor-pointer">All Counters</SelectItem>
                  {counters.map(c => (
                    <SelectItem key={c.id} value={c.id} className="rounded-lg cursor-pointer">{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="h-9 w-[140px] rounded-full border-zinc-200 bg-white px-4 text-sm font-medium focus:ring-0 shadow-sm">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all" className="rounded-lg cursor-pointer">All Types</SelectItem>
                  <SelectItem value="in" className="rounded-lg cursor-pointer">Cash In</SelectItem>
                  <SelectItem value="out" className="rounded-lg cursor-pointer">Cash Out</SelectItem>
                  <SelectItem value="transfer" className="rounded-lg cursor-pointer">Transfers</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 h-9 shadow-sm">
                <Input 
                  type="date" 
                  value={dateFrom} 
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-8 w-[110px] border-0 focus-visible:ring-0 shadow-none px-1 text-sm bg-transparent"
                />
                <span className="text-zinc-400 text-xs font-medium uppercase tracking-widest">to</span>
                <Input 
                  type="date" 
                  value={dateTo} 
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-8 w-[110px] border-0 focus-visible:ring-0 shadow-none px-1 text-sm bg-transparent"
                />
              </div>

              {activeFiltersCount > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={clearFilters}
                  className="h-9 rounded-full px-4 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
                >
                  <X className="h-4 w-4 mr-1.5" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Transactions List */}
        <div className="w-full overflow-x-auto p-1">
          <Table className="border-0 bg-transparent">
            <TableHeader className="bg-transparent backdrop-blur-none border-b border-zinc-100">
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="font-semibold text-xs uppercase tracking-widest text-zinc-500 w-[140px] pl-6 h-12">Date</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-widest text-zinc-500 h-12">Transaction Details</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-widest text-zinc-500 text-right w-[160px] h-12">Amount</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-widest text-zinc-500 text-right w-[180px] pr-8 h-12">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="border-0">
              {allTransactions.length === 0 ? (
                <TableRow className="border-0">
                  <TableCell colSpan={4} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center text-zinc-400">
                      <Wallet className="h-8 w-8 mb-4 opacity-40" weight="light" />
                      <p className="font-medium text-sm">No transactions found</p>
                      <p className="text-xs opacity-60 mt-1">Adjust your filters to see more results</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                allTransactions.map((txn) => {
                  const isTransfer = txn.type === 'Transfer';
                  const isOut = txn.type === 'Out' || (isTransfer && txn.isTransferSide === 'out');
                  
                  let Icon = ArrowDownLeft;
                  let iconBgClass = "bg-emerald-50 text-emerald-600";
                  
                  if (isTransfer) {
                    Icon = isOut ? ArrowUpRight : ArrowDownLeft;
                    iconBgClass = isOut ? "bg-zinc-100 text-zinc-600" : "bg-zinc-100 text-zinc-600";
                  } else if (isOut) {
                    Icon = ArrowUpRight;
                    iconBgClass = "bg-rose-50 text-rose-600";
                  }

                  return (
                    <TableRow key={txn.displayId} className="hover:bg-zinc-50/80 border-b border-zinc-100 last:border-0 transition-colors duration-200">
                      <TableCell className="pl-6 align-middle py-4">
                        <div className="font-medium text-sm text-zinc-500 whitespace-nowrap">
                          {new Date(txn.date).toLocaleDateString('en-US', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </div>
                      </TableCell>
                      
                      <TableCell className="align-middle py-4">
                        <div className="flex items-center gap-4 w-max">
                          <div className={`flex shrink-0 items-center justify-center w-9 h-9 rounded-full ${iconBgClass}`}>
                            <Icon className="h-4 w-4" weight="bold" />
                          </div>
                          <div className="flex flex-col justify-center gap-1">
                            {isTransfer ? (
                              <div className="flex items-center gap-2">
                                <span className="font-semibold tracking-tight text-zinc-900 text-sm">
                                  {txn.isTransferSide === 'out' ? txn.counterName : txn.toCounterName}
                                </span>
                                <ArrowRight className="w-3.5 h-3.5 text-zinc-400" weight="bold" />
                                <span className="font-semibold tracking-tight text-zinc-900 text-sm">
                                  {txn.isTransferSide === 'out' ? txn.toCounterName : txn.counterName}
                                </span>
                              </div>
                            ) : (
                              <div className="font-semibold tracking-tight text-zinc-900 text-sm">
                                {txn.displayCounterName}
                              </div>
                            )}
                            
                            {txn.narration && (
                              <div className="text-sm text-zinc-500 max-w-[500px] truncate">
                                {txn.narration}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      
                      <TableCell className="text-right align-middle py-4">
                        <div className={`font-semibold tracking-tight text-[15px] whitespace-nowrap ${isOut ? 'text-zinc-900' : 'text-emerald-600'}`}>
                          {isOut ? '-' : '+'}₹{Math.abs(txn.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </TableCell>
                      
                      <TableCell className="text-right pr-8 align-middle py-4">
                        <div className="font-mono text-sm font-medium text-zinc-400 whitespace-nowrap">
                          {txn.runningBalance !== undefined ? (
                            `₹${txn.runningBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          ) : '—'}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
