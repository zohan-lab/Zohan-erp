import { useState, useMemo } from 'react'
import {
  Customer,
  SalesInvoice,
  CustomerPayment,
  CustomerCreditNote,
  SalesReturn
} from '@/lib/types'
import {
  computeCustomerAging,
  CustomerAgingSummary,
  CustomerBillAging
} from '@/lib/customer-aging-engine'
import { exportCustomerAgingToExcel } from '@/lib/excel-export'
import { exportCustomerAgingToPDF } from '@/lib/pdf-export'
import {
  PeriodDateFilter,
  PeriodFilterState,
  defaultPeriodFilterState
} from '@/components/period-date-filter'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import {
  MagnifyingGlass,
  FilePdf,
  FileCsv,
  Hourglass,
  Clock,
  WarningOctagon,
  CheckCircle,
  TrendUp,
  CaretUp,
  CaretDown,
  Eye,
  UserCheck,
  UserList,
  ShieldWarning
} from '@phosphor-icons/react'

interface CustomerAgingReportPageProps {
  customers: Customer[]
  salesInvoices: SalesInvoice[]
  customerPayments: CustomerPayment[]
  creditNotes?: CustomerCreditNote[]
  salesReturns?: SalesReturn[]
  currentFY: string
  businessName?: string
}

type FilterTab = 'all' | 'overdue' | 'critical' | 'best' | 'blockers'
type SortField = 'outstanding' | 'maxOverdue' | 'name' | 'bracket90plus'
type SortOrder = 'asc' | 'desc'

export default function CustomerAgingReportPage({
  customers = [],
  salesInvoices = [],
  customerPayments = [],
  creditNotes = [],
  salesReturns = [],
  currentFY,
  businessName = 'SK TRADERS'
}: CustomerAgingReportPageProps) {
  const [periodFilter, setPeriodFilter] = useState<PeriodFilterState>(defaultPeriodFilterState)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [sortField, setSortField] = useState<SortField>('outstanding')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerAgingSummary | null>(null)

  // 1. Date Filter Logic
  const filteredSalesInvoices = useMemo(() => {
    if (periodFilter.periodType === 'all') return salesInvoices
    return salesInvoices.filter((inv) => {
      if (periodFilter.fromDate && inv.invoiceDate < periodFilter.fromDate) return false
      if (periodFilter.toDate && inv.invoiceDate > periodFilter.toDate) return false
      return true
    })
  }, [salesInvoices, periodFilter])

  // 2. Compute Aging Aggregate
  const agingAggregate = useMemo(() => {
    return computeCustomerAging(
      customers,
      filteredSalesInvoices,
      customerPayments,
      creditNotes,
      salesReturns
    )
  }, [customers, filteredSalesInvoices, customerPayments, creditNotes, salesReturns])

  // 3. Search & Tab Filtered Customers
  const processedCustomers = useMemo(() => {
    let list = [...agingAggregate.customers]

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter(
        (c) =>
          c.customerName.toLowerCase().includes(q) ||
          (c.phone && c.phone.includes(q)) ||
          (c.city && c.city.toLowerCase().includes(q)) ||
          (c.gstin && c.gstin.toLowerCase().includes(q))
      )
    }

    // Tab filter
    if (activeTab === 'overdue') {
      list = list.filter((c) => c.totalOverdue > 0)
    } else if (activeTab === 'critical') {
      list = list.filter((c) => c.bracket90plus > 0)
    } else if (activeTab === 'best') {
      list = list.filter((c) => c.performanceBadge === 'Best Payer')
    } else if (activeTab === 'blockers') {
      list = list.filter((c) => c.performanceBadge === 'Capital Blocker')
    }

    // Sort
    list.sort((a, b) => {
      let diff = 0
      if (sortField === 'outstanding') {
        diff = a.totalOutstanding - b.totalOutstanding
      } else if (sortField === 'maxOverdue') {
        diff = a.maxDaysOverdue - b.maxDaysOverdue
      } else if (sortField === 'bracket90plus') {
        diff = a.bracket90plus - b.bracket90plus
      } else if (sortField === 'name') {
        diff = a.customerName.localeCompare(b.customerName)
      }
      return sortOrder === 'desc' ? -diff : diff
    })

    return list
  }, [agingAggregate.customers, searchQuery, activeTab, sortField, sortOrder])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  // Formatting helper
  const fmt = (val: number) => `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

  const handleExportPDF = () => {
    exportCustomerAgingToPDF(agingAggregate, {
      title: 'Customer Receivables & Aging Intelligence Report',
      fy: currentFY,
      generatedDate: new Date().toLocaleString('en-IN'),
      businessName
    })
  }

  const handleExportExcel = () => {
    exportCustomerAgingToExcel(agingAggregate, businessName, currentFY)
  }

  const getBadgeStyle = (badge: string) => {
    switch (badge) {
      case 'Best Payer':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
      case 'Capital Blocker':
        return 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 font-semibold'
      case 'Heavy Lifter':
        return 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950 dark:text-indigo-300'
      default:
        return 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300'
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-[1600px] mx-auto">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Clock className="w-7 h-7 text-primary" weight="duotone" />
            Customer Receivables & Aging Intelligence
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Bill-wise customer receivables analysis, overdue risk categorization & capital grading
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PeriodDateFilter currentFY={currentFY} value={periodFilter} onChange={setPeriodFilter} />

          <Button variant="outline" size="sm" onClick={handleExportPDF} className="h-8 gap-1.5 text-xs">
            <FilePdf className="w-4 h-4 text-rose-600" />
            Export PDF
          </Button>

          <Button variant="outline" size="sm" onClick={handleExportExcel} className="h-8 gap-1.5 text-xs">
            <FileCsv className="w-4 h-4 text-emerald-600" />
            Export Excel
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Outstanding
            </CardTitle>
            <UserList className="w-5 h-5 text-primary" weight="duotone" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {fmt(agingAggregate.totalOutstanding)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Across {agingAggregate.totalCustomersWithBalance} customers with balance
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Overdue (&gt;30 Days)
            </CardTitle>
            <Hourglass className="w-5 h-5 text-amber-500" weight="duotone" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
              {fmt(agingAggregate.totalOverdue)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {agingAggregate.totalOutstanding > 0
                ? `${((agingAggregate.totalOverdue / agingAggregate.totalOutstanding) * 100).toFixed(1)}% of total outstanding`
                : '0% of total outstanding'}
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Critical Blocked (&gt;90d)
            </CardTitle>
            <WarningOctagon className="w-5 h-5 text-rose-600" weight="duotone" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
              {fmt(agingAggregate.totalCritical90Plus)}
            </div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <ShieldWarning className="w-3.5 h-3.5 text-rose-500" />
              {agingAggregate.capitalBlockerCount} Capital Blocker accounts
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Collection Health
            </CardTitle>
            <CheckCircle className="w-5 h-5 text-emerald-600" weight="duotone" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {agingAggregate.averageCollectionDays} Days
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {agingAggregate.bestPayerCount} Best Payers, {agingAggregate.heavyLifterCount} Heavy Lifters
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs & Search Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-muted/30 p-2 rounded-lg border">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant={activeTab === 'all' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('all')}
            className="h-8 text-xs"
          >
            All Accounts ({agingAggregate.customers.length})
          </Button>
          <Button
            variant={activeTab === 'overdue' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('overdue')}
            className="h-8 text-xs text-amber-700 dark:text-amber-400"
          >
            Overdue (&gt;30d)
          </Button>
          <Button
            variant={activeTab === 'critical' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('critical')}
            className="h-8 text-xs text-rose-700 dark:text-rose-400"
          >
            Critical (&gt;90d)
          </Button>
          <Button
            variant={activeTab === 'best' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('best')}
            className="h-8 text-xs text-emerald-700 dark:text-emerald-400"
          >
            Best Payers ({agingAggregate.bestPayerCount})
          </Button>
          <Button
            variant={activeTab === 'blockers' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('blockers')}
            className="h-8 text-xs text-rose-800 dark:text-rose-300"
          >
            Capital Blockers ({agingAggregate.capitalBlockerCount})
          </Button>
        </div>

        <div className="relative min-w-[240px]">
          <MagnifyingGlass className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customer, phone, city..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs bg-background"
          />
        </div>
      </div>

      {/* Main Table */}
      <Card className="border shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/60 text-xs font-semibold"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center gap-1">
                      Customer Name
                      {sortField === 'name' && (sortOrder === 'asc' ? <CaretUp className="w-3 h-3" /> : <CaretDown className="w-3 h-3" />)}
                    </div>
                  </TableHead>
                  <TableHead className="text-xs font-semibold">City / Phone</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Total Sales</TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/60 text-xs font-semibold text-right"
                    onClick={() => handleSort('outstanding')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Outstanding
                      {sortField === 'outstanding' && (sortOrder === 'asc' ? <CaretUp className="w-3 h-3" /> : <CaretDown className="w-3 h-3" />)}
                    </div>
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-right">0–30 Days</TableHead>
                  <TableHead className="text-xs font-semibold text-right text-amber-600">31–60 Days</TableHead>
                  <TableHead className="text-xs font-semibold text-right text-orange-600">61–90 Days</TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/60 text-xs font-semibold text-right text-rose-600"
                    onClick={() => handleSort('bracket90plus')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      90+ Days
                      {sortField === 'bracket90plus' && (sortOrder === 'asc' ? <CaretUp className="w-3 h-3" /> : <CaretDown className="w-3 h-3" />)}
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/60 text-xs font-semibold text-center"
                    onClick={() => handleSort('maxOverdue')}
                  >
                    <div className="flex items-center justify-center gap-1">
                      Max Overdue
                      {sortField === 'maxOverdue' && (sortOrder === 'asc' ? <CaretUp className="w-3 h-3" /> : <CaretDown className="w-3 h-3" />)}
                    </div>
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-center">Performance Grade</TableHead>
                  <TableHead className="text-xs font-semibold text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {processedCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground text-xs">
                      No customer accounts match the selected filters or search parameters.
                    </TableCell>
                  </TableRow>
                ) : (
                  processedCustomers.map((cust) => {
                    const isCritical = cust.bracket90plus > 0
                    const isOverdue = cust.totalOverdue > 0

                    return (
                      <TableRow
                        key={cust.customerId}
                        className={`hover:bg-muted/30 text-xs ${
                          isCritical
                            ? 'bg-rose-50/40 dark:bg-rose-950/20'
                            : isOverdue
                            ? 'bg-amber-50/30 dark:bg-amber-950/10'
                            : ''
                        }`}
                      >
                        <TableCell className="font-medium">
                          <div className="font-semibold text-foreground">{cust.customerName}</div>
                          {cust.gstin && (
                            <div className="text-[10px] text-muted-foreground">GST: {cust.gstin}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div>{cust.city || '-'}</div>
                          {cust.phone && <div className="text-[10px] text-muted-foreground">{cust.phone}</div>}
                        </TableCell>
                        <TableCell className="text-right font-mono">{fmt(cust.totalSales)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          {fmt(cust.totalOutstanding)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">
                          {cust.bracket0to30 > 0 ? fmt(cust.bracket0to30) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-amber-700 dark:text-amber-400">
                          {cust.bracket31to60 > 0 ? fmt(cust.bracket31to60) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-orange-700 dark:text-orange-400">
                          {cust.bracket61to90 > 0 ? fmt(cust.bracket61to90) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-rose-700 dark:text-rose-400">
                          {cust.bracket90plus > 0 ? fmt(cust.bracket90plus) : '-'}
                        </TableCell>
                        <TableCell className="text-center font-mono">
                          {cust.maxDaysOverdue > 0 ? (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${
                                cust.maxDaysOverdue > 90
                                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                  : cust.maxDaysOverdue > 30
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                  : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {cust.maxDaysOverdue} days
                            </span>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">On Time</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${getBadgeStyle(cust.performanceBadge)}`}>
                            {cust.performanceBadge}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedCustomer(cust)}
                            className="h-7 w-7 p-0 hover:bg-muted"
                            title="Inspect Bill-wise Aging"
                          >
                            <Eye className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                          </Button>
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

      {/* Bill-wise Drilldown Modal */}
      <Dialog open={Boolean(selectedCustomer)} onOpenChange={() => setSelectedCustomer(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <UserCheck className="w-5 h-5 text-primary" />
              Bill-Wise Aging Breakdown: {selectedCustomer?.customerName}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Detailed list of unpaid sales invoices, payment allocations, and overdue day calculations.
            </DialogDescription>
          </DialogHeader>

          {selectedCustomer && (
            <div className="space-y-4 my-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-muted/40 p-3 rounded-lg border text-xs">
                <div>
                  <span className="text-muted-foreground block text-[10px]">Total Outstanding</span>
                  <span className="font-bold text-sm">{fmt(selectedCustomer.totalOutstanding)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Overdue Amount</span>
                  <span className="font-bold text-sm text-amber-600">{fmt(selectedCustomer.totalOverdue)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Max Overdue</span>
                  <span className="font-bold text-sm">{selectedCustomer.maxDaysOverdue} Days</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Performance Grade</span>
                  <Badge variant="outline" className={`text-[10px] mt-0.5 ${getBadgeStyle(selectedCustomer.performanceBadge)}`}>
                    {selectedCustomer.performanceBadge}
                  </Badge>
                </div>
              </div>

              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow className="text-xs">
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Invoice Date</TableHead>
                      <TableHead className="text-right">Original Amount</TableHead>
                      <TableHead className="text-right">Paid Amount</TableHead>
                      <TableHead className="text-right">Pending Amount</TableHead>
                      <TableHead className="text-center">Days Overdue</TableHead>
                      <TableHead className="text-center">Bracket</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedCustomer.billAging.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-6 text-xs text-muted-foreground">
                          All invoices for this customer are fully settled. Zero pending balance.
                        </TableCell>
                      </TableRow>
                    ) : (
                      selectedCustomer.billAging.map((bill) => (
                        <TableRow key={bill.invoiceId} className="text-xs">
                          <TableCell className="font-semibold font-mono">{bill.invoiceNo}</TableCell>
                          <TableCell>{new Date(bill.invoiceDate).toLocaleDateString('en-IN')}</TableCell>
                          <TableCell className="text-right font-mono">{fmt(bill.originalAmount)}</TableCell>
                          <TableCell className="text-right font-mono text-emerald-600">{fmt(bill.paidAmount)}</TableCell>
                          <TableCell className="text-right font-mono font-bold text-foreground">
                            {fmt(bill.pendingAmount)}
                          </TableCell>
                          <TableCell className="text-center font-mono">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                bill.ageDays > 90
                                  ? 'bg-rose-100 text-rose-800'
                                  : bill.ageDays > 30
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {bill.ageDays} days
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${
                                bill.bracket === '90_plus'
                                  ? 'border-rose-400 bg-rose-50 text-rose-700'
                                  : bill.bracket === '61_90'
                                  ? 'border-orange-400 bg-orange-50 text-orange-700'
                                  : bill.bracket === '31_60'
                                  ? 'border-amber-400 bg-amber-50 text-amber-700'
                                  : 'border-slate-300 bg-slate-50 text-slate-700'
                              }`}
                            >
                              {bill.bracket.replace('_', '–').replace('plus', '+')} Days
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
