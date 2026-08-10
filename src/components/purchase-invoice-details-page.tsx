import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { 
  PurchaseInvoice, 
  Payment, 
  PaymentAllocation, 
  Supplier, 
  Item,
  FixedScheme,
  ReceivedDiscount,
  ExpenseEntry,
  ExpenseType,
  MTBooking
} from '@/lib/types'
import { formatCurrency, formatMT, calculatePaymentAllocations, calculateExpectedDiscounts, getFYMonths, getFYFromDate, calculateDetailedPurchaseInvoiceBreakdown } from '@/lib/calculations'
import { getItemActiveUnitAndQty } from '@/lib/fifo-engine'
import { toBaseQuantity, getInvoiceQtyForUnit } from '@/lib/unit-conversion-service'
import { FileText, Calendar, Package, CurrencyDollar, CreditCard, TrendDown, Calculator, CaretDown, Check } from '@phosphor-icons/react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

interface PurchaseInvoiceDetailsPageProps {
  invoices: PurchaseInvoice[]
  payments: Payment[]
  suppliers: Supplier[]
  items: Item[]
  fixedSchemes: FixedScheme[]
  mtBookings?: MTBooking[]
  receivedDiscounts: ReceivedDiscount[]
  expenseEntries: ExpenseEntry[]
  expenseTypes: ExpenseType[]
  currentFY: string
  initialInvoiceNo?: string
}

interface DiscountBreakdown {
  paymentCDPerMT: number
  invoiceCloseCDPerMT: number
  fixedSchemePerMT: number
  totalCDPerMT: number
}

interface ItemCostBreakdown {
  itemId: string
  itemName: string
  activeUnit: string
  activeQuantity: number
  altUnit?: string
  altQuantity?: number
  displayQtyUnit: string
  pricePerUnit: number
  fixedDiscPerUnit: number
  paymentCDPerUnit: number
  invoiceCloseCDPerUnit: number
  totalCDPerUnit: number
  expensePerUnit: number
  additionalCostPerUnit: number
  costPerUnit: number
}

interface InvoiceDetails {
  invoice: PurchaseInvoice
  supplier: Supplier
  allocatedPayments: Array<{
    payment: Payment
    allocatedAmount: number
  }>
  paidAmount: number
  pendingAmount: number
  status: 'Open' | 'Partially Paid' | 'Closed'
  totalCDEarned: number
  cdPerMT: number
  discountBreakdown: DiscountBreakdown
  itemCostBreakdowns: ItemCostBreakdown[]
  linkedExpenses: Array<{
    expense: ExpenseEntry
    expenseType: ExpenseType
  }>
  totalLinkedExpense: number
  totalAdditionalCost: number
  netInvoiceAmount: number
  annualDiscountPerMT: number
}

import { PeriodDateFilter, PeriodFilterState, defaultPeriodFilterState, isRecordInPeriod } from '@/components/period-date-filter'

export default function PurchaseInvoiceDetailsPage({
  invoices,
  payments,
  suppliers,
  items,
  fixedSchemes,
  mtBookings = [],
  receivedDiscounts,
  expenseEntries,
  expenseTypes,
  currentFY,
  initialInvoiceNo = ''
}: PurchaseInvoiceDetailsPageProps) {
  const [selectedSupplier, setSelectedSupplier] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [searchInvoiceNo, setSearchInvoiceNo] = useState(initialInvoiceNo)
  const [periodFilter, setPeriodFilter] = useState<PeriodFilterState>(defaultPeriodFilterState)
  const [includeAnnualDiscount, setIncludeAnnualDiscount] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, Record<string, boolean>>>({})

  // Update search when initialInvoiceNo is provided via navigation
  useMemo(() => {
    if (initialInvoiceNo) {
      setSearchInvoiceNo(initialInvoiceNo)
      setSelectedSupplier('all')
      setSelectedStatus('all')
      setPeriodFilter(defaultPeriodFilterState)
    }
  }, [initialInvoiceNo])

  const toggleSection = (invoiceId: string, section: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [invoiceId]: {
        ...(prev[invoiceId] || {}),
        [section]: !(prev[invoiceId]?.[section] ?? (section === 'itemCost' && Boolean(searchInvoiceNo)))
      }
    }))
  }

  const isSectionOpen = (invoiceId: string, section: string) => {
    if (collapsedSections[invoiceId]?.[section] !== undefined) {
      return collapsedSections[invoiceId][section]
    }
    if (section === 'itemCost') {
      return Boolean(searchInvoiceNo)
    }
    return false
  }

  const isInvoiceMatchingSearch = (invoiceId: string) => {
    if (!searchInvoiceNo.trim()) return false
    const invoice = invoices.find(i => i.id === invoiceId)
    if (invoice && invoice.invoiceNo.toLowerCase().includes(searchInvoiceNo.trim().toLowerCase())) {
      return true
    }
    return false
  }

  const supplierMap = useMemo(() => new Map(suppliers.map(s => [s.id, s])), [suppliers])
  const itemMap = useMemo(() => new Map(items.map(i => [i.id, i])), [items])
  const expenseTypeMap = useMemo(() => new Map(expenseTypes.map(e => [e.id, e])), [expenseTypes])

  const { allocations: paymentAllocations, paymentAdvanceInfo } = useMemo(
    () => calculatePaymentAllocations(payments, invoices),
    [payments, invoices]
  )

  const expectedDiscounts = useMemo(
    () => calculateExpectedDiscounts(invoices, payments, paymentAllocations, paymentAdvanceInfo, suppliers, fixedSchemes, mtBookings, items),
    [invoices, payments, paymentAllocations, paymentAdvanceInfo, suppliers, fixedSchemes, mtBookings, items]
  )

  const invoiceDetails = useMemo((): InvoiceDetails[] => {
    return invoices
      .map(invoice => {
        const supplier = supplierMap.get(invoice.supplierId)!
        
        const invAllocations = paymentAllocations.filter(a => a.invoiceId === invoice.id)
        const allocatedPayments = invAllocations.map(alloc => {
          const payment = payments.find(p => p.id === alloc.paymentId)!
          return {
            payment,
            allocatedAmount: alloc.allocatedAmount
          }
        })

        const detailed = calculateDetailedPurchaseInvoiceBreakdown(
          invoice,
          paymentAllocations,
          expectedDiscounts,
          expenseEntries,
          supplier,
          itemMap,
          includeAnnualDiscount
        )

        const linkedExpenses = detailed.linkedExpenses.map(expense => {
          const expenseType = expenseTypeMap.get(expense.expenseTypeId)!
          return { expense, expenseType }
        })

        const annualDiscountPerMT = supplier?.annualTarget?.ratePerMT || 0

        return {
          invoice,
          supplier,
          allocatedPayments,
          paidAmount: detailed.paidAmount,
          pendingAmount: detailed.pendingAmount,
          status: detailed.status,
          totalCDEarned: detailed.totalCDEarned,
          cdPerMT: detailed.discountBreakdown.totalCDPerMT,
          discountBreakdown: detailed.discountBreakdown,
          itemCostBreakdowns: detailed.itemCostBreakdowns,
          linkedExpenses,
          totalLinkedExpense: detailed.totalLinkedExpense,
          totalAdditionalCost: detailed.totalAdditionalCost,
          netInvoiceAmount: detailed.netInvoiceAmount,
          annualDiscountPerMT
        }
      })
  }, [invoices, payments, paymentAllocations, suppliers, expectedDiscounts, expenseEntries, expenseTypes, currentFY, supplierMap, expenseTypeMap, itemMap, receivedDiscounts, includeAnnualDiscount])

  const filteredInvoiceDetails = useMemo(() => {
    return invoiceDetails.filter(detail => {
      if (selectedSupplier !== 'all' && detail.invoice.supplierId !== selectedSupplier) return false
      if (selectedStatus !== 'all' && detail.status !== selectedStatus) return false
      if (searchInvoiceNo && !detail.invoice.invoiceNo.toLowerCase().includes(searchInvoiceNo.toLowerCase())) return false
      if (!isRecordInPeriod(detail.invoice.invoiceDate, detail.invoice.fy, periodFilter, currentFY)) return false
      return true
    })
  }, [invoiceDetails, selectedSupplier, selectedStatus, searchInvoiceNo, periodFilter, currentFY])

  const summaryStats = useMemo(() => {
    const totalInvoices = filteredInvoiceDetails.length
    const totalAmount = filteredInvoiceDetails.reduce((sum, d) => sum + d.invoice.invoiceAmount, 0)
    const totalPaid = filteredInvoiceDetails.reduce((sum, d) => sum + d.paidAmount, 0)
    const totalPending = filteredInvoiceDetails.reduce((sum, d) => sum + d.pendingAmount, 0)
    const totalCDEarned = filteredInvoiceDetails.reduce((sum, d) => sum + d.totalCDEarned, 0)
    const totalQty = filteredInvoiceDetails.reduce((sum, d) => sum + getInvoiceQtyForUnit(d.invoice, 'MT', items), 0)
    const avgCDPerMT = totalQty > 0 ? totalCDEarned / totalQty : 0

    return {
      totalInvoices,
      totalAmount,
      totalPaid,
      totalPending,
      totalCDEarned,
      totalQty,
      avgCDPerMT
    }
  }, [filteredInvoiceDetails])

  const statCards = [
    {
      label: 'Invoices',
      value: summaryStats.totalInvoices.toString(),
      helper: 'Filtered records',
      icon: FileText,
      tone: 'text-primary',
      surface: 'bg-primary/10'
    },
    {
      label: 'Invoice Value',
      value: formatCurrency(summaryStats.totalAmount),
      helper: 'Total billed amount',
      icon: CurrencyDollar,
      tone: 'text-primary',
      surface: 'bg-primary/10'
    },
    {
      label: 'Paid',
      value: formatCurrency(summaryStats.totalPaid),
      helper: 'Allocated payments',
      icon: CreditCard,
      tone: 'text-success',
      surface: 'bg-success/10'
    },
    {
      label: 'Pending',
      value: formatCurrency(summaryStats.totalPending),
      helper: 'Still payable',
      icon: TrendDown,
      tone: 'text-destructive',
      surface: 'bg-destructive/10'
    },
    {
      label: 'CD Earned',
      value: formatCurrency(summaryStats.totalCDEarned),
      helper: 'Total discount benefit',
      icon: Calculator,
      tone: 'text-accent',
      surface: 'bg-accent/10'
    }
  ]

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Closed':
        return <Badge className="bg-success text-success-foreground">Closed</Badge>
      case 'Partially Paid':
        return <Badge className="bg-warning text-warning-foreground">Partially Paid</Badge>
      case 'Open':
        return <Badge variant="destructive">Open</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-border/70 bg-gradient-to-br from-background via-muted/25 to-background p-5 shadow-[10px_10px_28px_rgba(15,23,42,0.10),-10px_-10px_28px_rgba(255,255,255,0.72)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <FileText size={15} weight="duotone" />
              Invoice intelligence
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-normal text-foreground">Purchase Invoice Details</h2>
              <p className="text-sm text-muted-foreground">Track payment status, CD earnings, item cost, and linked expenses in one view.</p>
            </div>
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border border-border/70 bg-background/80 px-4 py-3 text-sm shadow-sm">
            <Checkbox
              id="include-annual"
              checked={includeAnnualDiscount}
              onCheckedChange={(checked) => setIncludeAnnualDiscount(checked === true)}
            />
            <span className="font-medium text-foreground">Include Annual Discount in Cost Calculation</span>
          </label>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[1fr_0.85fr_1fr_1.6fr_auto]">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Supplier</Label>
            <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
              <SelectTrigger className="h-11 rounded-2xl bg-background/80 shadow-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Suppliers</SelectItem>
                {suppliers.map(supplier => (
                  <SelectItem key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Status</Label>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="h-11 rounded-2xl bg-background/80 shadow-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Open">Open</SelectItem>
                <SelectItem value="Partially Paid">Partially Paid</SelectItem>
                <SelectItem value="Closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <PeriodDateFilter currentFY={currentFY} value={periodFilter} onChange={setPeriodFilter} />

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Search Invoice</Label>
            <Input
              placeholder="Search by invoice number..."
              value={searchInvoiceNo}
              onChange={(e) => setSearchInvoiceNo(e.target.value)}
              className="h-11 rounded-2xl bg-background/80 shadow-sm"
            />
          </div>

          <div className="flex items-end">
            <Button
              variant="ghost"
              onClick={() => {
                setSelectedSupplier('all')
                setSelectedStatus('all')
                setSearchInvoiceNo('')
                setPeriodFilter(defaultPeriodFilterState)
              }}
              className="h-11 rounded-2xl"
            >
              Clear Filters
            </Button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {statCards.map((stat) => {
          const Icon = stat.icon
          return (
            <div
              key={stat.label}
              className="min-h-[132px] min-w-0 rounded-[24px] border border-border/70 bg-background/80 p-4 shadow-[8px_8px_22px_rgba(15,23,42,0.09),-8px_-8px_22px_rgba(255,255,255,0.72)]"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-2xl", stat.surface)}>
                  <Icon size={20} weight="duotone" className={stat.tone} />
                </div>
              </div>
              <div className="text-xs font-semibold uppercase text-muted-foreground">{stat.label}</div>
              <div className={cn("mt-1 break-words font-mono text-[1.35rem] font-bold leading-tight [font-variant-numeric:tabular-nums]", stat.tone)}>{stat.value}</div>
              <div className="mt-2 text-xs text-muted-foreground">{stat.helper}</div>
            </div>
          )
        })}
      </section>

      <section className="rounded-[28px] border border-border/70 bg-background/70 p-4 shadow-[10px_10px_28px_rgba(15,23,42,0.08),-10px_-10px_28px_rgba(255,255,255,0.70)]">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-foreground">Invoice Register</h3>
            <p className="text-sm text-muted-foreground">Open any invoice to inspect items, CD breakup, payments, and expenses.</p>
          </div>
          <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">
            {filteredInvoiceDetails.length} record{filteredInvoiceDetails.length === 1 ? '' : 's'}
          </Badge>
        </div>

          <div className="space-y-3">
            {filteredInvoiceDetails.map(detail => (
              <Card key={detail.invoice.id} className="overflow-hidden rounded-[24px] border border-border/70 bg-gradient-to-br from-background to-muted/20 shadow-sm transition-shadow hover:shadow-[8px_8px_22px_rgba(15,23,42,0.08),-8px_-8px_22px_rgba(255,255,255,0.68)]">
                <Collapsible
                  open={isSectionOpen(detail.invoice.id, 'invoice')}
                  onOpenChange={() => toggleSection(detail.invoice.id, 'invoice')}
                >
                  <CollapsibleTrigger className="w-full">
                    <CardHeader className="p-4 transition-colors hover:bg-primary/5 md:p-5">
                      <div className="space-y-4">
                        <div className="grid gap-3 xl:grid-cols-[minmax(220px,1.15fr)_minmax(0,2fr)] xl:items-center">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                              <CaretDown
                                className={cn(
                                  "h-5 w-5 text-primary transition-transform duration-200",
                                  isSectionOpen(detail.invoice.id, 'invoice') && "rotate-180"
                                )}
                              />
                            </div>
                            <div className="min-w-0 text-left">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="break-all font-mono text-xl font-bold leading-tight text-foreground">{detail.invoice.invoiceNo}</span>
                                {getStatusBadge(detail.status)}
                              </div>
                              <div className="mt-1 truncate text-sm text-muted-foreground">{detail.supplier.name}</div>
                            </div>
                          </div>

                          <div className="grid gap-2 text-left text-sm sm:grid-cols-2">
                            <div className="rounded-2xl bg-muted/30 px-3 py-2">
                              <div className="text-[11px] font-semibold uppercase text-muted-foreground">Invoice date</div>
                              <div className="font-medium text-foreground">{format(new Date(detail.invoice.invoiceDate), 'dd MMM yyyy')}</div>
                            </div>
                            {detail.invoice.orderDate ? (
                              <div className="rounded-2xl bg-muted/30 px-3 py-2">
                                <div className="text-[11px] font-semibold uppercase text-muted-foreground">Order date</div>
                                <div className="font-medium text-foreground">{format(new Date(detail.invoice.orderDate), 'dd MMM yyyy')}</div>
                              </div>
                            ) : (
                              <div className="rounded-2xl bg-muted/30 px-3 py-2">
                                <div className="text-[11px] font-semibold uppercase text-muted-foreground">Order date</div>
                                <div className="font-medium text-muted-foreground">Not set</div>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="grid gap-3 text-left text-sm md:grid-cols-3">
                          <div className="min-w-0 rounded-2xl bg-primary/10 px-4 py-3">
                            <div className="text-[11px] font-semibold uppercase text-muted-foreground">Amount</div>
                            <div className="mt-1 break-words font-mono text-lg font-bold leading-tight text-primary [font-variant-numeric:tabular-nums]">{formatCurrency(detail.invoice.invoiceAmount)}</div>
                          </div>
                          <div className="min-w-0 rounded-2xl bg-success/10 px-4 py-3">
                            <div className="text-[11px] font-semibold uppercase text-muted-foreground">Paid</div>
                            <div className="mt-1 break-words font-mono text-lg font-bold leading-tight text-success [font-variant-numeric:tabular-nums]">{formatCurrency(detail.paidAmount)}</div>
                          </div>
                          <div className="min-w-0 rounded-2xl bg-destructive/10 px-4 py-3">
                            <div className="text-[11px] font-semibold uppercase text-muted-foreground">Pending</div>
                            <div className="mt-1 break-words font-mono text-lg font-bold leading-tight text-destructive [font-variant-numeric:tabular-nums]">{formatCurrency(detail.pendingAmount)}</div>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="space-y-4 border-t border-border/70 bg-background/70 p-4">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                          <div className="text-xs font-semibold uppercase text-muted-foreground">CD Earned</div>
                          <div className="mt-1 font-mono text-xl font-bold text-accent">{formatCurrency(detail.totalCDEarned)}</div>
                        </div>
                        <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                          <div className="text-xs font-semibold uppercase text-muted-foreground">Linked Expense</div>
                          <div className="mt-1 font-mono text-xl font-bold text-warning">{formatCurrency(detail.totalLinkedExpense)}</div>
                        </div>
                      </div>
                  {includeAnnualDiscount && detail.annualDiscountPerMT > 0 && (
                    <div className="bg-accent/10 border-l-4 border-l-accent rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Calculator size={18} className="text-accent" />
                        <h4 className="font-semibold">Annual Discount Applied</h4>
                      </div>
                      <div className="text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Annual Discount per Unit:</span>
                          <span className="font-bold text-accent text-lg">{formatCurrency(detail.annualDiscountPerMT)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {detail.invoice.items && detail.invoice.items.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                        <Package size={16} className="text-primary" />
                        Invoice Items Summary
                      </h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item</TableHead>
                            <TableHead className="text-right">Quantity</TableHead>
                            <TableHead className="text-right">Rate</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detail.invoice.items.map((item, idx) => {
                            const itemData = itemMap.get(item.itemId)
                            const active = getItemActiveUnitAndQty(itemData, item.enteredUnit, item.enteredQuantity, item.weightKG, item.baseQuantity)
                            const altUnit = active.unit
                            const altQty = active.qty
                            const totalItemAmount = item.amount || ((item.rate || 0) * (item.enteredQuantity || 1))
                            const ratePerAltUnit = altQty > 0 ? totalItemAmount / altQty : item.rate

                            const displayQty = `${altQty.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${altUnit}`
                            const displayRate = `${formatCurrency(ratePerAltUnit)} / ${altUnit}`

                            return (
                              <TableRow key={idx}>
                                <TableCell className="font-medium">
                                  {itemData?.name || 'Unknown Item'}
                                </TableCell>
                                <TableCell className="text-right font-mono font-medium">
                                  {displayQty}
                                </TableCell>
                                <TableCell className="text-right font-mono font-medium">
                                  {displayRate}
                                </TableCell>
                                <TableCell className="text-right font-semibold">{formatCurrency(item.amount)}</TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  <div className="max-w-md">
                    <div>
                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                        <CurrencyDollar size={16} className="text-success" />
                        Payment Status
                      </h4>
                      <div className="bg-muted rounded-lg p-3 space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Invoice Amount:</span>
                          <span className="font-semibold">{formatCurrency(detail.invoice.invoiceAmount)}</span>
                        </div>
                        {detail.invoice.additionalCost && detail.invoice.additionalCost > 0 && (
                          <div className="flex justify-between bg-accent/10 -mx-3 px-3 py-1.5">
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              Additional Cost
                              {detail.invoice.additionalCostRemarks && (
                                <span className="text-[10px] italic">({detail.invoice.additionalCostRemarks})</span>
                              )}
                              :
                            </span>
                            <span className="text-xs font-semibold">{formatCurrency(detail.invoice.additionalCost)}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Paid Amount:</span>
                          <span className="font-semibold text-success">{formatCurrency(detail.paidAmount)}</span>
                        </div>
                        <div className="flex justify-between border-t pt-2">
                          <span className="text-sm text-muted-foreground">Pending Amount:</span>
                          <span className="font-bold text-destructive">{formatCurrency(detail.pendingAmount)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {detail.itemCostBreakdowns.length > 0 && (
                    <Collapsible
                      open={isSectionOpen(detail.invoice.id, 'itemCost')}
                      onOpenChange={() => toggleSection(detail.invoice.id, 'itemCost')}
                    >
                      <CollapsibleTrigger className="w-full">
                        <div className="flex items-center justify-between p-3 rounded-lg hover:bg-accent/50 transition-colors border border-border">
                          <h4 className="font-semibold flex items-center gap-2">
                            <Calculator size={16} className="text-primary" />
                            Item-wise Cost Breakdown
                          </h4>
                          <CaretDown 
                            className={cn(
                              "h-5 w-5 text-muted-foreground transition-transform duration-200",
                              isSectionOpen(detail.invoice.id, 'itemCost') && "rotate-180"
                            )}
                          />
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-3">
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/50">
                                <TableHead>Item</TableHead>
                                <TableHead className="text-right">Qty / Unit</TableHead>
                                <TableHead className="text-right">Price / Unit (Incl. GST)</TableHead>
                                <TableHead className="text-right">Fixed Disc / Unit</TableHead>
                                <TableHead className="text-right">Payment CD / Unit</TableHead>
                                <TableHead className="text-right">Close CD / Unit</TableHead>
                                <TableHead className="text-right">Total CD / Unit</TableHead>
                                {includeAnnualDiscount && (
                                  <TableHead className="text-right">Annual Disc / Unit</TableHead>
                                )}
                                <TableHead className="text-right">Expense / Unit</TableHead>
                                <TableHead className="text-right">Add. Cost / Unit</TableHead>
                                <TableHead className="text-right font-semibold">Landed Cost / Unit</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {detail.itemCostBreakdowns.map((breakdown, idx) => (
                                <TableRow key={idx}>
                                  <TableCell className="font-medium">
                                    {breakdown.itemName}
                                  </TableCell>
                                  <TableCell className="text-right font-mono font-medium">
                                    {breakdown.displayQtyUnit}
                                  </TableCell>
                                  <TableCell className="text-right">{formatCurrency(breakdown.pricePerUnit)}</TableCell>
                                  <TableCell className="text-right text-success">
                                    {breakdown.fixedDiscPerUnit > 0 ? `-${formatCurrency(breakdown.fixedDiscPerUnit)}` : formatCurrency(0)}
                                  </TableCell>
                                  <TableCell className="text-right text-success">
                                    {breakdown.paymentCDPerUnit > 0 ? `-${formatCurrency(breakdown.paymentCDPerUnit)}` : formatCurrency(0)}
                                  </TableCell>
                                  <TableCell className="text-right text-success">
                                    {breakdown.invoiceCloseCDPerUnit > 0 ? `-${formatCurrency(breakdown.invoiceCloseCDPerUnit)}` : formatCurrency(0)}
                                  </TableCell>
                                  <TableCell className="text-right font-semibold text-accent">
                                    {breakdown.totalCDPerUnit > 0 ? `-${formatCurrency(breakdown.totalCDPerUnit)}` : formatCurrency(0)}
                                  </TableCell>
                                  {includeAnnualDiscount && (
                                    <TableCell className="text-right text-success">
                                      {detail.annualDiscountPerMT > 0 ? `-${formatCurrency(detail.annualDiscountPerMT)}` : formatCurrency(0)}
                                    </TableCell>
                                  )}
                                  <TableCell className="text-right text-warning">
                                    {breakdown.expensePerUnit > 0 ? `+${formatCurrency(breakdown.expensePerUnit)}` : formatCurrency(0)}
                                  </TableCell>
                                  <TableCell className="text-right text-warning">
                                    {breakdown.additionalCostPerUnit > 0 ? `+${formatCurrency(breakdown.additionalCostPerUnit)}` : formatCurrency(0)}
                                  </TableCell>
                                  <TableCell className="text-right font-bold text-primary">
                                    {formatCurrency(breakdown.costPerUnit)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {detail.allocatedPayments.length > 0 && (
                    <Collapsible
                      open={isSectionOpen(detail.invoice.id, 'payments')}
                      onOpenChange={() => toggleSection(detail.invoice.id, 'payments')}
                    >
                      <CollapsibleTrigger className="w-full">
                        <div className="flex items-center justify-between p-3 rounded-lg hover:bg-accent/50 transition-colors border border-border">
                          <h4 className="font-semibold flex items-center gap-2">
                            <CreditCard size={16} className="text-success" />
                            Payment Allocations ({detail.allocatedPayments.length})
                          </h4>
                          <CaretDown 
                            className={cn(
                              "h-5 w-5 text-muted-foreground transition-transform duration-200",
                              isSectionOpen(detail.invoice.id, 'payments') && "rotate-180"
                            )}
                          />
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-3">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Payment Date</TableHead>
                              <TableHead className="text-right">Allocated Amount</TableHead>
                              <TableHead className="text-right">Days</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {detail.allocatedPayments.map((ap, idx) => {
                              const days = Math.floor(
                                (new Date(ap.payment.paymentDate).getTime() - 
                                 new Date(detail.invoice.invoiceDate).getTime()) / 
                                (1000 * 60 * 60 * 24)
                              )
                              const displayDays = Math.max(0, days)
                              return (
                                <TableRow key={idx}>
                                  <TableCell>{format(new Date(ap.payment.paymentDate), 'dd MMM yyyy')}</TableCell>
                                  <TableCell className="text-right font-semibold">
                                    {formatCurrency(ap.allocatedAmount)}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Badge variant={displayDays === 0 ? 'default' : 'secondary'}>
                                      {displayDays} days
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {detail.linkedExpenses.length > 0 && (
                    <Collapsible
                      open={isSectionOpen(detail.invoice.id, 'expenses')}
                      onOpenChange={() => toggleSection(detail.invoice.id, 'expenses')}
                    >
                      <CollapsibleTrigger className="w-full">
                        <div className="flex items-center justify-between p-3 rounded-lg hover:bg-accent/50 transition-colors border border-border">
                          <h4 className="font-semibold flex items-center gap-2">
                            <TrendDown size={16} className="text-warning" />
                            Linked Expenses ({detail.linkedExpenses.length})
                          </h4>
                          <CaretDown 
                            className={cn(
                              "h-5 w-5 text-muted-foreground transition-transform duration-200",
                              isSectionOpen(detail.invoice.id, 'expenses') && "rotate-180"
                            )}
                          />
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-3">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Expense Type</TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead>Notes</TableHead>
                              <TableHead className="text-right">Amount</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {detail.linkedExpenses.map((le, idx) => (
                              <TableRow key={idx}>
                                <TableCell className="font-medium">{le.expenseType.name}</TableCell>
                                <TableCell>{format(new Date(le.expense.expenseDate), 'dd MMM yyyy')}</TableCell>
                                <TableCell className="text-sm text-muted-foreground">{le.expense.notes || '-'}</TableCell>
                                <TableCell className="text-right font-semibold">{formatCurrency(le.expense.amount)}</TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="bg-muted/50">
                              <TableCell colSpan={3} className="font-semibold">Total Linked Expense</TableCell>
                              <TableCell className="text-right font-bold">{formatCurrency(detail.totalLinkedExpense)}</TableCell>
                            </TableRow>
                            <TableRow className="bg-primary/5">
                              <TableCell colSpan={3} className="font-semibold">Net Invoice Amount</TableCell>
                              <TableCell className="text-right font-bold text-primary">{formatCurrency(detail.netInvoiceAmount)}</TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            ))}

            {filteredInvoiceDetails.length === 0 && (
              <div className="rounded-[24px] border border-dashed border-border bg-muted/20 py-12 text-center text-muted-foreground">
                  No invoices found matching the selected filters.
              </div>
            )}
          </div>
      </section>
    </div>
  )
}
