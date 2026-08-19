import { getChangedByLabel, getChangedByRole } from '@/lib/security-utils'
import { useState, useMemo } from 'react'
import { FixedScheme, Item, MTBooking, Payment, PurchaseInvoice, Supplier } from '@/lib/types'
import { Counter, CashBankTransaction } from '@/lib/cash-bank-types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Plus, CurrencyDollar, Trash, Info, PencilSimple, FunnelSimple, Warning, DownloadSimple, CaretLeft, CaretRight } from '@phosphor-icons/react'
import { formatCurrency, calculatePaymentAllocations, isPaymentAdvance, getFYMonths, getFYFromDate } from '@/lib/calculations'
import { exportPurchaseInvoicePDF } from '@/lib/pdf-export'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { startOfMonth, endOfMonth, isWithinInterval, parseISO, format } from 'date-fns'
import { toast } from 'sonner'

import { PeriodDateFilter, PeriodFilterState, defaultPeriodFilterState, isRecordInPeriod } from '@/components/period-date-filter'

import { deletePayment, savePayment } from '@/lib/firebase-storage'
import { ThreeDotDropdown } from '@/components/ui/three-dot-dropdown'

interface PaymentsPageProps {
  payments: Payment[]
  setPayments: (updater: (prev: Payment[]) => Payment[]) => void
  setMTBookings: (updater: (prev: MTBooking[]) => MTBooking[]) => void
  invoices: PurchaseInvoice[]
  items: Item[]
  suppliers: Supplier[]
  fixedSchemes: FixedScheme[]
  currentFY: string
  isLocked?: boolean
  counters: Counter[]
  transactions: CashBankTransaction[]
  onUpdateCashBank: (counters: Counter[], transactions: CashBankTransaction[]) => void
  activeCompanyId?: string
}

export default function PaymentsPage({ payments, setPayments, setMTBookings, invoices, items, suppliers, fixedSchemes, currentFY, isLocked = false, counters, transactions, onUpdateCashBank, activeCompanyId }: PaymentsPageProps) {
  const [open, setOpen] = useState(false)
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [paymentToDelete, setPaymentToDelete] = useState<Payment | null>(null)
  const [periodFilter, setPeriodFilter] = useState<PeriodFilterState>(defaultPeriodFilterState)
  const [selectedSupplier, setSelectedSupplier] = useState<string>('all')
  const [formSupplierId, setFormSupplierId] = useState('')
  const [selectedCounterId, setSelectedCounterId] = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')

  const supplierMap = useMemo(() => new Map(suppliers.map(s => [s.id, s])), [suppliers])
  const invoiceMap = useMemo(() => new Map(invoices.map(inv => [inv.id, inv])), [invoices])
  const itemMap = useMemo(() => new Map(items.map(item => [item.id, item])), [items])

  const { allocations, paymentAdvanceInfo } = useMemo(() =>
    calculatePaymentAllocations(payments, invoices),
    [payments, invoices]
  )

  const allocationsByPaymentId = useMemo(() => {
    const map = new Map<string, typeof allocations>()
    allocations.forEach(a => {
      const arr = map.get(a.paymentId) || []
      arr.push(a)
      map.set(a.paymentId, arr)
    })
    map.forEach((arr) => {
      arr.sort((a, b) => {
        const invA = invoiceMap.get(a.invoiceId)
        const invB = invoiceMap.get(b.invoiceId)
        if (!invA || !invB) return 0
        return invA.invoiceDate.localeCompare(invB.invoiceDate)
      })
    })
    return map
  }, [allocations, invoiceMap])

  const filteredPayments = useMemo(() => {
    let result = payments.filter(p => isRecordInPeriod(p.paymentDate, p.fy, periodFilter, currentFY))

    if (selectedSupplier !== 'all') {
      result = result.filter(p => p.supplierId === selectedSupplier)
    }

    return result
  }, [payments, periodFilter, currentFY, selectedSupplier])

  const sortedFilteredPayments = useMemo(() => {
    return [...filteredPayments].sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
  }, [filteredPayments])

  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 50

  const totalPages = Math.max(1, Math.ceil(sortedFilteredPayments.length / pageSize))
  const paginatedPayments = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedFilteredPayments.slice(start, start + pageSize)
  }, [sortedFilteredPayments, currentPage, pageSize])

  const totalAmount = filteredPayments.reduce((sum, p) => sum + p.amount, 0)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (isLocked) {
      toast.error('Cannot save in locked mode', {
        description: 'Unlock the data in Settings to make changes'
      })
      return
    }

    const formData = new FormData(e.currentTarget)
    const paymentDate = formData.get('paymentDate') as string
    const supplierId = formSupplierId
    const counterId = selectedCounterId
    const amount = parseFloat(paymentAmount)

    if (!supplierId) {
      toast.error('Select a supplier')
      return
    }

    if (!counterId) {
      toast.error('Select a payment account (Counter)')
      return
    }

    const selectedCounter = counters.find(c => c.id === counterId)
    if (!selectedCounter) {
      toast.error('Invalid counter selected')
      return
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid payment amount')
      return
    }

    if (editingPayment) {
      const updatedPayment: Payment = {
        ...editingPayment,
        supplierId,
        paymentDate: formData.get('paymentDate') as string,
        amount,
        doNotApplyCD: false,
        counterId: counterId,
        counterName: selectedCounter.name,
        history: [
          ...(editingPayment.history || []),
          {
            timestamp: new Date().toISOString(),
            action: 'updated',
            changedBy: getChangedByLabel(), changedByRole: getChangedByRole(),
            changes: [
              ...(editingPayment.amount !== amount ? [{ field: 'Amount', from: String(editingPayment.amount), to: String(amount) }] : []),
              ...(editingPayment.supplierId !== supplierId ? [{ field: 'Supplier', from: suppliers.find(s => s.id === editingPayment.supplierId)?.name || '-', to: suppliers.find(s => s.id === supplierId)?.name || '-' }] : []),
              ...(editingPayment.paymentDate !== (formData.get('paymentDate') as string) ? [{ field: 'Date', from: editingPayment.paymentDate, to: formData.get('paymentDate') as string }] : []),
              ...(editingPayment.counterName !== selectedCounter.name ? [{ field: 'Account', from: editingPayment.counterName || '-', to: selectedCounter.name }] : [])
            ]
          }
        ]
      }
      setPayments((prev) => prev.map(p => p.id === editingPayment.id ? updatedPayment : p))
      if (activeCompanyId) {
        void savePayment(activeCompanyId, updatedPayment)
      }

      let newCounters = [...counters]
      let newTransactions = [...transactions]

      const oldCounterId = editingPayment.counterId
      if (oldCounterId) {
        newCounters = newCounters.map(c =>
          c.id === oldCounterId ? { ...c, currentBalance: c.currentBalance + editingPayment.amount } : c
        )
      }
      newCounters = newCounters.map(c =>
        c.id === counterId ? { ...c, currentBalance: c.currentBalance - amount } : c
      )

      const supplierName = suppliers.find(s => s.id === supplierId)?.name || 'Unknown'
      const txnId = `txn-sp-${editingPayment.id}`
      const existingTxn = newTransactions.find(t => t.id === txnId)
      if (existingTxn) {
        newTransactions = newTransactions.map(t =>
          t.id === txnId ? {
            ...t,
            date: paymentDate,
            counterId,
            counterName: selectedCounter.name,
            amount: amount,
            narration: `Supplier Payment Edited: ${supplierName}`.trim()
          } : t
        )
      } else {
        newTransactions.push({
          id: txnId,
          date: paymentDate,
          counterId,
          counterName: selectedCounter.name,
          type: 'Out',
          amount: amount,
          narration: `Supplier Payment: ${supplierName}`.trim()
        })
      }
      onUpdateCashBank(newCounters, newTransactions)

    } else {
      const paymentId = `payment-${Date.now()}`
      const payment: Payment = {
        id: paymentId,
        supplierId,
        paymentDate: formData.get('paymentDate') as string,
        amount,
        doNotApplyCD: false,
        counterId: counterId,
        counterName: selectedCounter.name,
        fy: getFYFromDate(paymentDate),
        createdAt: Date.now(),
        history: [
          {
            timestamp: new Date().toISOString(),
            action: 'created',
            changedBy: getChangedByLabel(), changedByRole: getChangedByRole(),
            changes: [
              { field: 'Supplier', from: '', to: suppliers.find(s => s.id === supplierId)?.name || '-' },
              { field: 'Amount', from: '', to: String(amount) },
              { field: 'Date', from: '', to: formData.get('paymentDate') as string },
              { field: 'Account', from: '', to: selectedCounter.name }
            ]
          }
        ]
      }
      setPayments((prev) => [...prev, payment])
      if (activeCompanyId) {
        void savePayment(activeCompanyId, payment)
      }

      const newCounters = counters.map(c =>
        c.id === counterId ? { ...c, currentBalance: c.currentBalance - amount } : c
      )

      const supplierName = suppliers.find(s => s.id === supplierId)?.name || 'Unknown'
      const newTransactions = [...transactions, {
        id: `txn-sp-${paymentId}`,
        date: paymentDate,
        counterId,
        counterName: selectedCounter.name,
        type: 'Out',
        amount: amount,
        narration: `Supplier Payment: ${supplierName}`.trim()
      } as CashBankTransaction]

      onUpdateCashBank(newCounters, newTransactions)
    }

    setOpen(false)
    setEditingPayment(null)
    setFormSupplierId('')
    setPaymentAmount('')
  }

  const handleEdit = (payment: Payment) => {
    if (isLocked) {
      toast.error('Cannot edit in locked mode', {
        description: 'Unlock the data in Settings to make changes'
      })
      return
    }
    setEditingPayment(payment)
    setFormSupplierId(payment.supplierId)
    setSelectedCounterId(payment.counterId || '')
    setPaymentAmount(String(payment.amount || ''))
    setOpen(true)
  }

  const handleDeleteClick = (payment: Payment) => {
    if (isLocked) {
      toast.error('Cannot delete in locked mode', {
        description: 'Unlock the data in Settings to make changes'
      })
      return
    }
    setPaymentToDelete(payment)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = () => {
    if (paymentToDelete) {
      setPayments((prev) => prev.filter(p => p.id !== paymentToDelete.id))

      let newCounters = counters
      if (paymentToDelete.counterId) {
        newCounters = newCounters.map(c =>
          c.id === paymentToDelete.counterId ? { ...c, currentBalance: c.currentBalance + paymentToDelete.amount } : c
        )
      }
      const newTransactions = transactions.filter(t => t.id !== `txn-sp-${paymentToDelete.id}`)
      onUpdateCashBank(newCounters, newTransactions)

      toast.success('Payment deleted successfully')
      setDeleteDialogOpen(false)
      setPaymentToDelete(null)
    }
  }

  const handleAdd = () => {
    if (isLocked) {
      toast.error('Cannot add in locked mode', {
        description: 'Unlock the data in Settings to make changes'
      })
      return
    }
    setEditingPayment(null)

    setFormSupplierId('')
    setSelectedCounterId('')
    setPaymentAmount('')
    setOpen(true)
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) {
      setEditingPayment(null)
      setFormSupplierId('')
      setSelectedCounterId('')
      setPaymentAmount('')
    }
  }





  const handleDownloadInvoicePDF = (
    invoice: PurchaseInvoice | undefined,
    payment?: Payment,
    allocatedAmount = 0,
    totalAllocatedForPayment = 0
  ) => {
    if (!invoice) {
      toast.error('Invoice not found')
      return
    }

    exportPurchaseInvoicePDF(invoice, supplierMap.get(invoice.supplierId), itemMap, {
      businessName: 'SK TRADERS',
      state: 'West Bengal',
      phone: '9083876218',
      advancePayment: payment ? {
        paymentDate: payment.paymentDate,
        paymentAmount: payment.amount,
        bookingMT: payment.bookingMT,
        allocatedAmount,
        remainingAdvanceAmount: Math.max(0, payment.amount - totalAllocatedForPayment),
        sourceLabel: payment.isAdvance || payment.bookingMT ? 'Advance Supplier Payment' : 'Supplier Payment Allocation'
      } : undefined
    })
    toast.success(`Downloaded invoice ${invoice.invoiceNo}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Payments</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Chronological FIFO allocation - advances auto-allocate to future invoices
          </p>
        </div>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button onClick={handleAdd} disabled={suppliers.length === 0}>
              <Plus className="mr-2" size={18} />
              Add Payment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingPayment ? 'Edit Payment' : 'Add New Payment'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} key={editingPayment?.id || 'new-supp-payment'} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="supplierId">Supplier</Label>
                <Select name="supplierId" value={formSupplierId} onValueChange={setFormSupplierId}>
                  <SelectTrigger id="supplierId">
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map(supplier => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="paymentDate">Payment Date</Label>
                <Input
                  id="paymentDate"
                  name="paymentDate"
                  type="date"
                  defaultValue={editingPayment?.paymentDate || format(new Date(), 'yyyy-MM-dd')}

                  required
                />
                <p className="text-xs text-muted-foreground">For reports, ageing, and scheme eligibility</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="counterId">Payment Account</Label>
                <Select name="counterId" value={selectedCounterId} onValueChange={setSelectedCounterId} required>
                  <SelectTrigger id="counterId">
                    <SelectValue placeholder="Select Cash/Bank account" />
                  </SelectTrigger>
                  <SelectContent>
                    {counters.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} ({c.type}) - Bal: ₹{c.currentBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">Amount (₹)</Label>
                <Input
                  id="amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(event) => setPaymentAmount(event.target.value)}
                  required
                />
              </div>

              <Button type="submit" className="w-full">
                {editingPayment ? 'Update Payment' : 'Add Payment'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {suppliers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CurrencyDollar size={48} className="text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              Please add suppliers first before creating payments.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="bg-accent/10 border-accent/20">
            <CardContent className="pt-6">
              <div className="flex gap-3">
                <Info size={20} className="text-accent mt-0.5 flex-shrink-0" />
                <div className="space-y-2 text-sm">
                  <p className="font-medium text-foreground">Complete FIFO Allocation System</p>
                  <ul className="text-muted-foreground space-y-1">
                    <li>• Payment on Jan 1 (₹5L) + Invoice on Jan 3 (₹10L) = ₹5L auto-allocated to invoice</li>
                    <li>• Payment on Jan 1 (₹15L) + Invoice on Jan 3 (₹10L) = ₹10L to invoice, ₹5L advance</li>
                    <li>• Adding invoice on Jan 2 recalculates everything chronologically</li>
                    <li>• All allocations always calculated from source data in date order</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <FunnelSimple size={18} className="text-muted-foreground" />
                  <Label htmlFor="supplier-filter" className="text-sm font-medium">Supplier:</Label>
                  <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                    <SelectTrigger id="supplier-filter" className="w-48 h-9">
                      <SelectValue placeholder="All Suppliers" />
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

                <PeriodDateFilter currentFY={currentFY} value={periodFilter} onChange={setPeriodFilter} />

                <Badge variant="secondary" className="gap-1.5 ml-auto">
                  {filteredPayments.length} payment{filteredPayments.length !== 1 ? 's' : ''}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground mb-1">Total Payments</div>
              <div className="text-2xl font-mono font-semibold">{formatCurrency(totalAmount)}</div>
            </CardContent>
          </Card>

          {payments.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CurrencyDollar size={48} className="text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-center">
                  No payments yet. Add your first payment.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Booking MT</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Allocated To</TableHead>
                      <TableHead className="w-[120px] text-center">Invoice PDF</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedPayments.map(payment => {
                      const supplier = supplierMap.get(payment.supplierId)
                      const sortedPaymentAllocations = allocationsByPaymentId.get(payment.id) || []
                      const totalAllocated = sortedPaymentAllocations.reduce((sum, a) => sum + a.allocatedAmount, 0)
                      const unallocated = payment.amount - totalAllocated
                      const isAdvance = isPaymentAdvance(payment, allocations)

                      return (
                        <TableRow key={payment.id}>
                          <TableCell>{supplier?.name || 'Unknown'}</TableCell>
                          <TableCell>{new Date(payment.paymentDate).toLocaleDateString('en-IN')}</TableCell>
                          <TableCell className="text-right">
                            <div className="space-y-1">
                              <div className="font-mono">{formatCurrency(payment.amount)}</div>
                              {isAdvance && unallocated > 0 && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="text-xs text-muted-foreground">
                                      Allocated: {formatCurrency(totalAllocated)} |
                                      <span className="text-accent font-medium"> Advance: {formatCurrency(unallocated)}</span>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Unallocated amount will auto-allocate to future invoices</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {payment.bookingMT ? (
                              <div className="space-y-1">
                                <div className="font-mono">{payment.bookingMT.toFixed(3)} MT</div>
                                {payment.bookingMarketRate && (
                                  <div className="text-xs text-muted-foreground">
                                    {formatCurrency(payment.bookingMarketRate)} / MT
                                  </div>
                                )}
                              </div>
                            ) : '-'}
                          </TableCell>
                          <TableCell>
                            {isAdvance ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge className="bg-accent text-accent-foreground cursor-help">Advance</Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Payment has unallocated amount (treated as 0-day CD)</p>
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <Badge variant="secondary">Regular</Badge>
                            )}

                          </TableCell>
                            <TableCell>
                              <div className="text-sm space-y-2 min-w-[280px] max-w-md">
                                {sortedPaymentAllocations.length === 0 ? (
                                  <span className="text-muted-foreground text-xs">No allocation yet</span>
                                ) : (
                                  sortedPaymentAllocations.map((alloc, idx) => {
                                    const invoice = invoiceMap.get(alloc.invoiceId)
                                    return (
                                      <div key={alloc.id} className="flex min-w-0 items-center gap-2 rounded-xl border border-border/70 bg-background/70 p-1.5 shadow-[var(--neo-shadow-xs)]">
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <div className="grid min-w-0 flex-1 cursor-help grid-cols-[auto_minmax(58px,1fr)_auto] items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-muted/50">
                                              <Badge variant="outline" className="text-xs font-mono">#{idx + 1}</Badge>
                                              <span className="truncate text-xs text-muted-foreground">{invoice?.invoiceNo || 'Invoice'}</span>
                                              <span className="whitespace-nowrap text-right font-mono text-xs font-semibold">{formatCurrency(alloc.allocatedAmount)}</span>
                                            </div>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <div className="space-y-1">
                                              <p className="font-medium">FIFO Allocation #{idx + 1}</p>
                                              <p className="text-xs">Invoice Date: {invoice?.invoiceDate && new Date(invoice.invoiceDate).toLocaleDateString('en-IN')}</p>
                                              <p className="text-xs">Amount: {formatCurrency(alloc.allocatedAmount)}</p>
                                            </div>
                                          </TooltipContent>
                                        </Tooltip>
                                      </div>
                                    )
                                  })
                                )}
                              </div>
                            </TableCell>
                          <TableCell>
                            <div className="flex flex-col items-center gap-1.5">
                              {sortedPaymentAllocations.length === 0 ? (
                                <span className="text-xs text-muted-foreground">-</span>
                              ) : (
                                sortedPaymentAllocations.map((alloc, idx) => {
                                  const invoice = invoiceMap.get(alloc.invoiceId)
                                  return (
                                    <Button
                                      key={alloc.id}
                                      type="button"
                                      variant="default"
                                      size="sm"
                                      className="h-8 rounded-lg px-3 text-xs font-bold shadow-[var(--neo-shadow-xs)]"
                                      onClick={() => handleDownloadInvoicePDF(invoice, payment, alloc.allocatedAmount, totalAllocated)}
                                      title={`Download invoice ${invoice?.invoiceNo || ''}`}
                                      aria-label={`Download invoice ${invoice?.invoiceNo || ''}`}
                                    >
                                      <DownloadSimple className="mr-1 h-3.5 w-3.5" weight="bold" />
                                      PDF {sortedPaymentAllocations.length > 1 ? idx + 1 : ''}
                                    </Button>
                                  )
                                })
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <ThreeDotDropdown
                                onEdit={() => handleEdit(payment)}
                                onDelete={() => handleDeleteClick(payment)}
                                history={payment.history}
                                entityType="Supplier Payment"
                                isLocked={isLocked}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>

                {sortedFilteredPayments.length > pageSize && (
                  <div className="flex items-center justify-between p-4 border-t border-border text-xs text-muted-foreground bg-card">
                    <div>
                      Showing {Math.min((currentPage - 1) * pageSize + 1, sortedFilteredPayments.length)} to {Math.min(currentPage * pageSize, sortedFilteredPayments.length)} of {sortedFilteredPayments.length} payments
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="h-8 gap-1"
                      >
                        <CaretLeft size={14} />
                        Previous
                      </Button>
                      <span className="font-medium text-foreground px-2">Page {currentPage} of {totalPages}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="h-8 gap-1"
                      >
                        Next
                        <CaretRight size={14} />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Warning className="h-5 w-5 text-destructive" weight="fill" />
              Delete Payment
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this payment of <strong>{formatCurrency(paymentToDelete?.amount || 0)}</strong> to <strong>{supplierMap.get(paymentToDelete?.supplierId || '')?.name}</strong>?
              <br /><br />
              This action cannot be undone and will affect all FIFO allocations and cash discount calculations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
