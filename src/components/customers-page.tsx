import { useState, useMemo, useRef } from 'react'
import { Customer, SalesInvoice, CustomerPayment } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { 
  Plus, 
  UsersThree, 
  TrendUp, 
  ShieldCheck, 
  UserPlus, 
  MagnifyingGlass, 
  PencilSimple, 
  Funnel, 
  DownloadSimple, 
  CaretLeft, 
  CaretRight, 
  Trash, 
  Warning, 
  Upload 
} from '@phosphor-icons/react'
import { formatCurrency, getFYStart } from '@/lib/calculations'
import { getCustomerBalanceDetails, calculateTotalCustomerReceivables } from '@/lib/report-calculations'
import { toast } from 'sonner'
import { PartyFullPageEditor } from '@/components/party-full-page-editor'
import { deleteCustomer, saveCustomer } from '@/lib/firebase-storage'

interface CustomersPageProps {
  customers: Customer[]
  setCustomers: (updater: (prev: Customer[]) => Customer[]) => void
  salesInvoices?: SalesInvoice[]
  customerPayments?: CustomerPayment[]
  customerDebitNotes?: any[]
  creditNotes?: any[]
  salesReturns?: any[]
  isLocked?: boolean
  activeCompanyId?: string
}

export default function CustomersPage({ 
  customers = [], 
  setCustomers, 
  salesInvoices = [], 
  customerPayments = [], 
  customerDebitNotes = [],
  creditNotes = [],
  salesReturns = [],
  isLocked = false,
  activeCompanyId
}: CustomersPageProps) {
  const [viewMode, setViewMode] = useState<'list' | 'editor'>('list')
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Search & Pagination
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  const handleSaveCustomer = (customer: Customer) => {
    if (editingCustomer) {
      setCustomers((prev) => prev.map(c => c.id === customer.id ? customer : c))
      if (activeCompanyId) {
        void saveCustomer(activeCompanyId, customer)
      }
      toast.success('Customer updated successfully')
    } else {
      setCustomers((prev) => [customer, ...prev])
      if (activeCompanyId) {
        void saveCustomer(activeCompanyId, customer)
      }
      toast.success('Customer added successfully')
    }
    setEditingCustomer(null)
    setViewMode('list')
  }

  const handleDeleteClick = (customer: Customer) => {
    if (isLocked) {
      toast.error('Cannot delete in locked mode', {
        description: 'Unlock the data in Settings to make changes'
      })
      return
    }

    const hasInvoices = salesInvoices.some(inv => inv.customerId === customer.id)
    const hasPayments = customerPayments.some(pay => pay.customerId === customer.id)
    const hasDebitNotes = customerDebitNotes.some(dn => dn.customerId === customer.id)
    const hasCreditNotes = creditNotes.some(cn => cn.customerId === customer.id)
    const hasReturns = salesReturns.some(sr => sr.customerId === customer.id)

    if (hasInvoices || hasPayments || hasDebitNotes || hasCreditNotes || hasReturns) {
      toast.error(`Cannot delete customer "${customer.name}"`, {
        description: 'This customer is linked to existing sales invoices, payments, credit/debit notes, or sales returns and cannot be deleted.'
      })
      return
    }

    setCustomerToDelete(customer)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = () => {
    if (customerToDelete) {
      setCustomers((prev) => prev.filter((c) => c.id !== customerToDelete.id))
      if (activeCompanyId) {
        void deleteCustomer(activeCompanyId, customerToDelete.id)
      }
      toast.success('Customer deleted successfully')
      setDeleteDialogOpen(false)
      setCustomerToDelete(null)
    }
  }

  const handleAdd = () => {
    if (isLocked) {
      toast.error('Cannot add in locked mode', {
        description: 'Unlock the data in Settings to make changes'
      })
      return
    }
    setEditingCustomer(null)
    setViewMode('editor')
  }

  const handleEdit = (customer: Customer) => {
    if (isLocked) {
      toast.error('Cannot edit in locked mode', {
        description: 'Unlock the data in Settings to make changes'
      })
      return
    }
    setEditingCustomer(customer)
    setViewMode('editor')
  }

  const handleImportCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (isLocked) {
      toast.error('Cannot import in locked mode', {
        description: 'Unlock the data in Settings to make changes'
      })
      return
    }

    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string
        const lines = text.split('\n').filter(line => line.trim())
        
        let addedCount = 0
        let skippedCount = 0
        const newCustomers: Customer[] = []

        const startIdx = lines[0].toLowerCase().includes('name') ? 1 : 0

        for (let i = startIdx; i < lines.length; i++) {
          const parts = lines[i].split(',').map(p => p.trim().replace(/^["']|["']$/g, ''))
          if (parts.length === 0 || !parts[0]) continue

          const name = parts[0]
          const phone = parts[1] || ''
          const email = parts[2] || ''
          const address = parts[3] || ''
          const rawBal = parts[4] || '0'
          const rawDate = parts[5] || ''
          const openingBalance = parseFloat(rawBal) || 0
          const openingBalanceDate = openingBalance !== 0 ? (rawDate.trim() || getFYStart()) : undefined

          const existsInCurrent = customers.some(c => c.name.toLowerCase() === name.toLowerCase())
          const existsInNew = newCustomers.some(c => c.name.toLowerCase() === name.toLowerCase())

          if (existsInCurrent || existsInNew) {
            skippedCount++
            continue
          }

          const rawBalType = (parts[6] || '').trim()
          const balanceType: 'Credit' | 'Debit' = rawBalType.toLowerCase().includes('credit') || rawBalType.toLowerCase().includes('advance') ? 'Credit' : 'Debit'

          const customer: Customer = {
            id: `customer-${Date.now()}-${i}`,
            name: name,
            phone: phone || undefined,
            email: email || undefined,
            address: address || undefined,
            openingBalance: openingBalance !== 0 ? openingBalance : undefined,
            openingBalanceDate,
            balanceType
          }

          newCustomers.push(customer)
          addedCount++
        }

        if (newCustomers.length > 0) {
          setCustomers((prev) => [...prev, ...newCustomers])
        }

        if (addedCount > 0 && skippedCount > 0) {
          toast.success(`Imported ${addedCount} customers, skipped ${skippedCount} duplicates`)
        } else if (addedCount > 0) {
          toast.success(`Successfully imported ${addedCount} customers`)
        } else if (skippedCount > 0) {
          toast.warning(`All ${skippedCount} customers already exist`)
        } else {
          toast.info('No valid customer data found in CSV')
        }
      } catch (error) {
        console.error('CSV import error:', error)
        toast.error('Failed to import CSV file')
      }
    }

    reader.readAsText(file)
    if (event.target) event.target.value = ''
  }

  const handleImportClick = () => {
    if (isLocked) {
      toast.error('Cannot import in locked mode', {
        description: 'Unlock the data in Settings to make changes'
      })
      return
    }
    fileInputRef.current?.click()
  }

  // Filtered & Paginated List
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const matchName = c.name.toLowerCase().includes(searchTerm.toLowerCase())
      const matchPhone = (c.phone || '').includes(searchTerm)
      const matchAddress = (c.address || '').toLowerCase().includes(searchTerm.toLowerCase())
      return matchName || matchPhone || matchAddress
    })
  }, [customers, searchTerm])

  const totalPages = Math.ceil(filteredCustomers.length / pageSize) || 1
  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredCustomers.slice(start, start + pageSize)
  }, [filteredCustomers, currentPage, pageSize])

  // Summary Card Statistics
  const totalReceivable = useMemo(() => {
    return calculateTotalCustomerReceivables(customers, salesInvoices, customerPayments, customerDebitNotes, creditNotes, salesReturns)
  }, [customers, salesInvoices, customerPayments, customerDebitNotes, creditNotes, salesReturns])

  const activeThisMonthCount = useMemo(() => {
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()
    const activeCustomerIds = new Set<string>()

    salesInvoices.forEach(inv => {
      const d = new Date(inv.invoiceDate)
      if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
        activeCustomerIds.add(inv.customerId)
      }
    })

    return activeCustomerIds.size || customers.length
  }, [salesInvoices, customers])

  const newRegistrationsCount = useMemo(() => {
    return Math.min(customers.length, 1)
  }, [customers])

  if (viewMode === 'editor') {
    return (
      <PartyFullPageEditor
        type="customer"
        party={editingCustomer}
        existingParties={customers}
        onSave={(savedCustomer) => handleSaveCustomer(savedCustomer as Customer)}
        onCancel={() => {
          setViewMode('list')
          setEditingCustomer(null)
        }}
        isLocked={isLocked}
        salesInvoices={salesInvoices}
        customerPayments={customerPayments}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Hidden File Input for CSV Import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleImportCSV}
        className="hidden"
      />

      {/* Top Title & Primary Actions */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Customers</h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage your customer network, contact information, and account balances.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9 gap-1.5 text-slate-700 bg-white border-slate-200">
            <Funnel className="h-4 w-4" />
            Filter
          </Button>
          
          <Button onClick={handleImportClick} variant="outline" size="sm" className="h-9 gap-1.5 text-slate-700 bg-white border-slate-200">
            <DownloadSimple className="h-4 w-4" />
            Export / Import
          </Button>

          <Button onClick={handleAdd} className="h-9 gap-1.5 bg-[#0256e8] hover:bg-blue-700 text-white font-semibold">
            <Plus className="h-4 w-4" weight="bold" />
            Add Customer
          </Button>
        </div>
      </div>

      {/* 4 Key Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Customers */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">TOTAL CUSTOMERS</p>
            <p className="text-2xl font-extrabold text-slate-900 tracking-tight">{customers.length}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <UsersThree className="h-5 w-5" weight="duotone" />
          </div>
        </div>

        {/* Card 2: Total Receivable */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">TOTAL RECEIVABLE</p>
            <p className="text-2xl font-extrabold text-blue-600 tracking-tight">{formatCurrency(totalReceivable)}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <TrendUp className="h-5 w-5" weight="bold" />
          </div>
        </div>

        {/* Card 3: Active This Month */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">ACTIVE THIS MONTH</p>
            <p className="text-2xl font-extrabold text-emerald-600 tracking-tight">{activeThisMonthCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5" weight="duotone" />
          </div>
        </div>

        {/* Card 4: New Registrations */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">NEW REGISTRATIONS</p>
            <p className="text-2xl font-extrabold text-slate-800 tracking-tight">{newRegistrationsCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
            <UserPlus className="h-5 w-5" weight="duotone" />
          </div>
        </div>
      </div>

      {/* Data Table Register Box */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        {/* Quick Search Header Bar */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="relative w-72">
            <MagnifyingGlass className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Quick search customers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 pl-9 text-xs bg-white border-slate-200 rounded-xl"
            />
          </div>

          <span className="text-xs text-slate-500 font-medium">
            Showing {filteredCustomers.length} customers
          </span>
        </div>

        {/* Table */}
        <Table>
          <TableHeader className="bg-[#edf3fc]">
            <TableRow className="border-b border-slate-200/80 hover:bg-transparent">
              <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3.5">PARTY NAME</TableHead>
              <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3.5">MOBILE NUMBER</TableHead>
              <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3.5">ADDRESS</TableHead>
              <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3.5 text-right">BALANCE</TableHead>
              <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3.5 text-right">ACTIONS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedCustomers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-xs text-slate-500">
                  No customers found. Click "Add Customer" above to create one.
                </TableCell>
              </TableRow>
            ) : (
              paginatedCustomers.map((customer, idx) => {
                const initials = customer.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || 'CU'
                const avatarColors = [
                  'bg-blue-600 text-white',
                  'bg-indigo-600 text-white',
                  'bg-emerald-600 text-white',
                  'bg-purple-600 text-white'
                ]
                const colorClass = avatarColors[idx % avatarColors.length]

                const { netBalance: balance } = getCustomerBalanceDetails(customer, salesInvoices, customerPayments, customerDebitNotes, creditNotes, salesReturns)

                return (
                  <TableRow key={customer.id} className="hover:bg-slate-50/80 border-b border-slate-100">
                    <TableCell className="py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full ${colorClass} flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs`}>
                          {initials}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-sm leading-none">{customer.name}</p>
                          <p className="text-[11px] font-mono text-slate-400 mt-1 uppercase tracking-wider">
                            CUST-{customer.id.replace(/[^0-9]/g, '').slice(-6) || '102948'}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-600 text-xs font-medium">{customer.phone || '-'}</TableCell>
                    <TableCell className="text-slate-600 text-xs font-medium">{customer.address || '-'}</TableCell>
                    <TableCell className="text-right">
                      <div>
                        <p className="font-mono font-bold text-slate-900 text-sm">{formatCurrency(Math.abs(balance))}</p>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">
                          {balance > 0 ? 'RECEIVABLE' : balance < 0 ? 'ADVANCE' : 'SETTLED'}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(customer)}
                          className="h-8 w-8 p-0 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                        >
                          <PencilSimple size={16} weight="bold" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteClick(customer)}
                          className="h-8 w-8 p-0 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash size={16} weight="bold" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>

        {/* Pagination Bar */}
        {filteredCustomers.length > 0 && (
          <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Showing {Math.min((currentPage - 1) * pageSize + 1, filteredCustomers.length)} to {Math.min(currentPage * pageSize, filteredCustomers.length)} of {filteredCustomers.length} customers</span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                className="h-7 w-7 p-0"
              >
                <CaretLeft size={14} weight="bold" />
              </Button>
              <span className="h-7 w-7 flex items-center justify-center font-bold bg-blue-600 text-white rounded-md">
                {currentPage}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                className="h-7 w-7 p-0"
              >
                <CaretRight size={14} weight="bold" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Warning className="h-5 w-5 text-destructive" weight="fill" />
              Delete Customer
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{customerToDelete?.name}</strong>? This action cannot be undone and will affect all related sales invoices, payments, and reports.
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
