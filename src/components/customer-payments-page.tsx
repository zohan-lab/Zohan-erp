import { getChangedByLabel, getChangedByRole } from '@/lib/security-utils'
import { useState, useMemo, useEffect } from 'react'
import { CustomerPayment, Customer, SalesInvoice } from '@/lib/types'
import { Counter, CashBankTransaction } from '@/lib/cash-bank-types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Plus, CurrencyInr, Trash, Info, PencilSimple, FunnelSimple, Warning, CaretUpDown, Check, CaretLeft, CaretRight } from '@phosphor-icons/react'
import { formatCurrency, getFYMonths, getFYFromDate } from '@/lib/calculations'
import { startOfMonth, endOfMonth, isWithinInterval, parseISO, format } from 'date-fns'
import { toast } from 'sonner'
import { deleteCustomerPayment, saveCustomerPayment } from '@/lib/firebase-storage'
import { ThreeDotDropdown } from '@/components/ui/three-dot-dropdown'
import { cn } from '@/lib/utils'

import { PeriodDateFilter, PeriodFilterState, defaultPeriodFilterState, isRecordInPeriod } from '@/components/period-date-filter'

interface CustomerPaymentsPageProps {
  customerPayments: CustomerPayment[]
  setCustomerPayments: (updater: (prev: CustomerPayment[]) => CustomerPayment[]) => void
  customers: Customer[]
  salesInvoices: SalesInvoice[]
  currentFY: string
  isLocked?: boolean
  activeCompanyId: string
  activeFY: string
  counters: Counter[]
  transactions: CashBankTransaction[]
  onUpdateCashBank: (counters: Counter[], transactions: CashBankTransaction[]) => void
}

export default function CustomerPaymentsPage({ customerPayments, setCustomerPayments, customers, salesInvoices, currentFY, isLocked = false, activeCompanyId, activeFY, counters, transactions, onUpdateCashBank }: CustomerPaymentsPageProps) {
  const [open, setOpen] = useState(false)
  const [editingPayment, setEditingPayment] = useState<CustomerPayment | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [paymentToDelete, setPaymentToDelete] = useState<CustomerPayment | null>(null)
  const [periodFilter, setPeriodFilter] = useState<PeriodFilterState>(defaultPeriodFilterState)
  const [selectedCustomer, setSelectedCustomer] = useState<string>('all')
  const [selectedCustomerInForm, setSelectedCustomerInForm] = useState<string>('')
  const [customerComboboxOpen, setCustomerComboboxOpen] = useState(false)
  const [selectedCounterId, setSelectedCounterId] = useState<string>('')

  const calculateCustomerOutstanding = (customerId: string): number => {
    const fySalesInvoices = salesInvoices.filter(inv => inv.customerId === customerId)
    const fyCustomerPayments = customerPayments.filter(p => p.customerId === customerId)

    const totalReceivables = fySalesInvoices.reduce((sum, inv) => sum + inv.invoiceAmount, 0)
    const totalPaymentsReceived = fyCustomerPayments.reduce((sum, p) => sum + p.amount, 0)

    return totalReceivables - totalPaymentsReceived
  }

  const filteredPayments = useMemo(() => {
    let result = customerPayments.filter(p => isRecordInPeriod(p.paymentDate, p.fy, periodFilter, currentFY))

    if (selectedCustomer !== 'all') {
      result = result.filter(p => p.customerId === selectedCustomer)
    }

    return result
  }, [customerPayments, periodFilter, currentFY, selectedCustomer])

  const customerMap = useMemo(() => {
    return new Map(customers.map(c => [c.id, c]))
  }, [customers])

  const getCustomerName = (customerId: string) => {
    return customerMap.get(customerId)?.name || 'Unknown'
  }

  const sortedFilteredPayments = useMemo(() => {
    return [...filteredPayments].sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
  }, [filteredPayments])

  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 50

  useEffect(() => {
    setCurrentPage(1)
  }, [selectedCustomer, periodFilter, currentFY])

  const totalPages = Math.max(1, Math.ceil(sortedFilteredPayments.length / pageSize))
  const paginatedPayments = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedFilteredPayments.slice(start, start + pageSize)
  }, [sortedFilteredPayments, currentPage, pageSize])

  const totalReceived = filteredPayments.reduce((sum, p) => sum + p.amount, 0)

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
    const counterId = formData.get('counterId') as string

    if (!counterId) {
      toast.error('Please select an Account/Counter', {
        description: 'Account/Counter is required for tracking'
      })
      return
    }



    const selectedCounter = counters.find(c => c.id === counterId)
    if (!selectedCounter) {
      toast.error('Invalid counter selected')
      return
    }

    const paymentAmount = parseFloat(formData.get('amount') as string)
    const customerId = formData.get('customerId') as string
    const customerName = getCustomerName(customerId)

    const notes = formData.get('notes') as string || undefined

    if (editingPayment) {
      const updatedPayment: CustomerPayment = {
        ...editingPayment,
        customerId,
        paymentDate,
        amount: paymentAmount,
        notes,
        counterId: counterId,
        counterName: selectedCounter.name,
        history: [
          ...(editingPayment.history || []),
          {
            timestamp: new Date().toISOString(),
            action: 'updated',
            changedBy: getChangedByLabel(), changedByRole: getChangedByRole(),
            changes: [
              ...(editingPayment.amount !== paymentAmount ? [{ field: 'Amount', from: String(editingPayment.amount), to: String(paymentAmount) }] : []),
              ...(editingPayment.customerId !== customerId ? [{ field: 'Customer', from: getCustomerName(editingPayment.customerId), to: customerName }] : []),
              ...(editingPayment.paymentDate !== paymentDate ? [{ field: 'Date', from: editingPayment.paymentDate, to: paymentDate }] : []),
              ...(editingPayment.counterName !== selectedCounter.name ? [{ field: 'Account', from: editingPayment.counterName || '-', to: selectedCounter.name }] : []),
              ...((editingPayment.notes || '') !== (notes || '') ? [{ field: 'Notes', from: editingPayment.notes || '-', to: notes || '-' }] : [])
            ]
          }
        ]
      }
      setCustomerPayments((prev) => prev.map(p => p.id === editingPayment.id ? updatedPayment : p))
      if (activeCompanyId) {
        void saveCustomerPayment(activeCompanyId, updatedPayment)
      }

      let newCounters = [...counters]
      let newTransactions = [...transactions]

      const oldCounterId = editingPayment.counterId
      if (oldCounterId) {
        newCounters = newCounters.map(c =>
          c.id === oldCounterId ? { ...c, currentBalance: c.currentBalance - editingPayment.amount } : c
        )
      }
      newCounters = newCounters.map(c =>
        c.id === counterId ? { ...c, currentBalance: c.currentBalance + paymentAmount } : c
      )

      const txnId = `txn-cp-${editingPayment.id}`
      const existingTxn = newTransactions.find(t => t.id === txnId)
      if (existingTxn) {
        newTransactions = newTransactions.map(t =>
          t.id === txnId ? {
            ...t,
            date: paymentDate,
            counterId,
            counterName: selectedCounter.name,
            amount: paymentAmount,
            narration: `Customer Payment Edited: ${customerName} ${notes ? `(${notes})` : ''}`.trim()
          } : t
        )
      } else {
        newTransactions.push({
          id: txnId,
          date: paymentDate,
          counterId,
          counterName: selectedCounter.name,
          type: 'In',
          amount: paymentAmount,
          narration: `Customer Payment: ${customerName} ${notes ? `(${notes})` : ''}`.trim()
        })
      }
      onUpdateCashBank(newCounters, newTransactions)

    } else {
      const paymentId = `customer-payment-${Date.now()}`
      const payment: CustomerPayment = {
        id: paymentId,
        customerId,
        paymentDate,
        amount: paymentAmount,
        notes,
        counterId: counterId,
        counterName: selectedCounter.name,
        fy: getFYFromDate(paymentDate),
        history: [
          {
            timestamp: new Date().toISOString(),
            action: 'created',
            changedBy: getChangedByLabel(), changedByRole: getChangedByRole(),
            changes: [
              { field: 'Customer', from: '', to: customerName },
              { field: 'Amount', from: '', to: String(paymentAmount) },
              { field: 'Date', from: '', to: paymentDate },
              { field: 'Account', from: '', to: selectedCounter.name }
            ]
          }
        ]
      }
      setCustomerPayments((prev) => [...prev, payment])
      if (activeCompanyId) {
        void saveCustomerPayment(activeCompanyId, payment)
      }

      const newCounters = counters.map(c =>
        c.id === counterId ? { ...c, currentBalance: c.currentBalance + paymentAmount } : c
      )

      const newTransactions = [...transactions, {
        id: `txn-cp-${paymentId}`,
        date: paymentDate,
        counterId,
        counterName: selectedCounter.name,
        type: 'In',
        amount: paymentAmount,
        narration: `Customer Payment: ${customerName} ${notes ? `(${notes})` : ''}`.trim()
      } as CashBankTransaction]

      onUpdateCashBank(newCounters, newTransactions)
    }

    setOpen(false)
    setEditingPayment(null)
  }

  const handleEdit = (payment: CustomerPayment) => {
    if (isLocked) {
      toast.error('Cannot edit in locked mode', {
        description: 'Unlock the data in Settings to make changes'
      })
      return
    }
    setEditingPayment(payment)
    setSelectedCustomerInForm(payment.customerId)
    setSelectedCounterId(payment.counterId || '')
    setCustomerComboboxOpen(false)
    setOpen(true)
  }

  const handleDeleteClick = (payment: CustomerPayment) => {
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
      setCustomerPayments((prev) => prev.filter((p) => p.id !== paymentToDelete.id))

      let newCounters = counters
      if (paymentToDelete.counterId) {
        newCounters = newCounters.map(c =>
          c.id === paymentToDelete.counterId ? { ...c, currentBalance: c.currentBalance - paymentToDelete.amount } : c
        )
      }
      const newTransactions = transactions.filter(t => t.id !== `txn-cp-${paymentToDelete.id}`)
      onUpdateCashBank(newCounters, newTransactions)

      toast.success('Customer payment deleted successfully')
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
    setOpen(true)
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) {
      setEditingPayment(null)
      setSelectedCustomerInForm('')
      setSelectedCounterId('')
      setCustomerComboboxOpen(false)
    }
  }





  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-gradient-to-br from-success/10 to-success/5 border-success/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Total Payments Received</p>
                <p className="text-3xl font-semibold text-foreground">{customerPayments.length}</p>
              </div>
              <CurrencyInr size={40} weight="duotone" className="text-success" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Total Amount Received</p>
                <p className="text-3xl font-semibold text-foreground">{formatCurrency(totalReceived)}</p>
              </div>
              <div className="text-primary text-xl font-mono">₹</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <CurrencyInr size={22} weight="duotone" className="text-primary" />
              Customer Payments Received
            </h3>
            <Dialog open={open} onOpenChange={handleOpenChange}>
              <DialogTrigger asChild>
                <Button onClick={handleAdd} disabled={customers.length === 0}>
                  <Plus size={18} weight="bold" />
                  Add Payment
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingPayment ? 'Edit Customer Payment' : 'Record Customer Payment'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} key={editingPayment?.id || 'new-cust-payment'} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="customerId">Customer *</Label>
                    <Popover open={customerComboboxOpen} onOpenChange={setCustomerComboboxOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={customerComboboxOpen}
                          className="w-full justify-between"
                        >
                          {selectedCustomerInForm
                            ? customers.find((customer) => customer.id === selectedCustomerInForm)?.name
                            : "Select customer..."}
                          <CaretUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search customer..." className="h-9" />
                          <CommandList>
                            <CommandEmpty>No customer found.</CommandEmpty>
                            <CommandGroup>
                              {customers.map((customer) => (
                                <CommandItem
                                  key={customer.id}
                                  value={customer.name}
                                  onSelect={() => {
                                    setSelectedCustomerInForm(customer.id)
                                    setCustomerComboboxOpen(false)
                                  }}
                                >
                                  {customer.name}
                                  <Check
                                    className={cn(
                                      "ml-auto h-4 w-4",
                                      selectedCustomerInForm === customer.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <input
                      type="hidden"
                      name="customerId"
                      value={selectedCustomerInForm}
                      required
                    />
                  </div>

                  {selectedCustomerInForm && (
                    <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Current Outstanding:</span>
                        <span className="text-base font-bold text-primary">
                          {formatCurrency(calculateCustomerOutstanding(selectedCustomerInForm))}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="counterId">Account/Counter *</Label>
                    <Select
                      value={selectedCounterId}
                      onValueChange={setSelectedCounterId}
                      required
                    >
                      <SelectTrigger id="counterId" className={cn(!selectedCounterId && "text-muted-foreground")}>
                        <SelectValue placeholder="Select payment account..." />
                      </SelectTrigger>
                      <SelectContent>
                        {counters.length === 0 ? (
                          <div className="p-2 text-sm text-muted-foreground text-center">
                            No counters available. Please add a counter in Cash & Bank Master.
                          </div>
                        ) : (
                          counters.map((counter) => (
                            <SelectItem key={counter.id} value={counter.id}>
                              <div className="flex items-center gap-2">
                                <Badge variant={counter.type === 'Cash' ? 'default' : 'secondary'} className="text-xs">
                                  {counter.type}
                                </Badge>
                                <span>{counter.name}</span>
                                <span className="text-xs text-muted-foreground ml-auto">
                                  {formatCurrency(counter.currentBalance)}
                                </span>
                              </div>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <input type="hidden" name="counterId" value={selectedCounterId} required />
                    <p className="text-xs text-muted-foreground">Select where the payment is being received</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="paymentDate">Payment Date *</Label>
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
                      <Label htmlFor="amount">Amount (₹) *</Label>
                      <Input
                        id="amount"
                        name="amount"
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="0.00"
                        defaultValue={editingPayment?.amount}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      name="notes"
                      placeholder="Add any payment notes or reference"
                      rows={3}
                      defaultValue={editingPayment?.notes}
                    />
                  </div>

                  <div className="flex gap-3 justify-end pt-4">
                    <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                      Cancel
                    </Button>
                    <Button type="submit">{editingPayment ? 'Update Payment' : 'Record Payment'}</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="flex items-center gap-4 flex-wrap mb-4">
            <div className="flex items-center gap-2">
              <FunnelSimple size={18} className="text-muted-foreground" />
              <Label htmlFor="customer-filter" className="text-sm font-medium">Customer:</Label>
              <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                <SelectTrigger id="customer-filter" className="w-48 h-9">
                  <SelectValue placeholder="All Customers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  {customers.map(customer => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
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

          {customers.length === 0 ? (
            <div className="border border-dashed border-warning rounded-lg p-8 text-center bg-warning/5">
              <Info size={32} weight="duotone" className="mx-auto mb-2 text-warning" />
              <p className="text-muted-foreground">Please add customers first to record payments.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Date</TableHead>
                    <TableHead className="font-semibold">Customer</TableHead>
                    <TableHead className="font-semibold">Account/Counter</TableHead>
                    <TableHead className="font-semibold text-right">Amount</TableHead>
                    <TableHead className="font-semibold">Notes</TableHead>
                    <TableHead className="font-semibold text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customerPayments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                        No customer payments recorded for FY {currentFY}.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedPayments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>{new Date(payment.paymentDate).toLocaleDateString('en-IN')}</TableCell>
                        <TableCell className="font-medium">
                          {getCustomerName(payment.customerId)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {payment.counterName || 'Not Set'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium text-success">
                          {formatCurrency(payment.amount)}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                          {payment.notes || '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <ThreeDotDropdown
                            onEdit={() => handleEdit(payment)}
                            onDelete={() => handleDeleteClick(payment)}
                            history={payment.history}
                            entityType="Customer Payment"
                            isLocked={isLocked}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
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
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Warning className="h-5 w-5 text-destructive" weight="fill" />
              Delete Customer Payment
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this payment of <strong>{formatCurrency(paymentToDelete?.amount || 0)}</strong> from <strong>{getCustomerName(paymentToDelete?.customerId || '')}</strong>?
              <br /><br />
              This action cannot be undone and will affect all related calculations and reports.
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
