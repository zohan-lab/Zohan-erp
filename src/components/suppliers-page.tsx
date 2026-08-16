import { useState, useMemo, useEffect } from 'react'
import { getChangedByLabel } from '@/lib/security-utils'
import { Supplier, PurchaseInvoice, Payment, PaymentCDRule, InvoiceCloseCDRule, SupplierCDRuleVersion, CDRuleChangeLog, AnnualTarget, SupplierDebitNote, SupplierCreditNote, PurchaseReturn, ExpenseEntry } from '@/lib/types'
import { getAvailableUnits } from '@/lib/custom-data-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { 
  Plus, 
  Trash, 
  Building, 
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
  Phone, 
  EnvelopeSimple, 
  Clock, 
  CheckCircle, 
  Receipt,
  CurrencyInr,
  PlusCircle,
  Tag,
  ArrowsClockwise,
  CalendarBlank,
  FileText
} from '@phosphor-icons/react'
import { formatCurrency, getFYStart } from '@/lib/calculations'
import { calculateTotalSupplierPayables, getSupplierYTDInvoiced, getSupplierPendingPayments, getSupplierBalanceDetails } from '@/lib/report-calculations'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { PartyFullPageEditor } from '@/components/party-full-page-editor'
import { deleteSupplier, saveSupplier } from '@/lib/firebase-storage'

interface SuppliersPageProps {
  suppliers: Supplier[]
  setSuppliers: (updater: (prev: Supplier[]) => Supplier[]) => void
  invoices?: PurchaseInvoice[]
  payments?: Payment[]
  debitNotes?: SupplierDebitNote[]
  supplierCreditNotes?: SupplierCreditNote[]
  purchaseReturns?: PurchaseReturn[]
  expenseEntries?: ExpenseEntry[]
  isLocked?: boolean
  activeFY?: string
  activeCompanyId?: string
}

export default function SuppliersPage({ 
  suppliers = [], 
  setSuppliers, 
  invoices = [], 
  payments = [], 
  debitNotes = [],
  supplierCreditNotes = [],
  purchaseReturns = [],
  expenseEntries = [],
  isLocked = false, 
  activeFY,
  activeCompanyId
}: SuppliersPageProps) {
  // View mode: 'list' (Register table) | 'editor' (Full screen edit matching screenshot 2)
  const [viewMode, setViewMode] = useState<'list' | 'editor'>('list')
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)

  const [availableUnits, setAvailableUnits] = useState(() => getAvailableUnits())

  useEffect(() => {
    const syncUnits = () => setAvailableUnits(getAvailableUnits())
    window.addEventListener('custom-units-updated', syncUnits)
    return () => window.removeEventListener('custom-units-updated', syncUnits)
  }, [])

  // Filter & Search states for list view
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  // Delete confirmation modal state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null)

  // Filtered Suppliers for List Register
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((s) => {
      if (!searchTerm.trim()) return true
      const term = searchTerm.toLowerCase()
      return (
        s.name.toLowerCase().includes(term) ||
        (s.phone || '').toLowerCase().includes(term) ||
        (s.gstin || '').toLowerCase().includes(term) ||
        (s.address || '').toLowerCase().includes(term) ||
        s.id.toLowerCase().includes(term)
      )
    })
  }, [suppliers, searchTerm])

  // Pagination calculation
  const totalPages = Math.ceil(filteredSuppliers.length / pageSize) || 1
  const paginatedSuppliers = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredSuppliers.slice(start, start + pageSize)
  }, [filteredSuppliers, currentPage, pageSize])

  // Top Summary Card Metrics
  const totalSuppliersCount = suppliers.length
  
  const totalPayable = useMemo(() => {
    return calculateTotalSupplierPayables(suppliers, invoices, payments, debitNotes, supplierCreditNotes, purchaseReturns)
  }, [suppliers, invoices, payments, debitNotes, supplierCreditNotes, purchaseReturns])

  const activeThisMonthCount = useMemo(() => {
    // Count suppliers with recent purchase invoices or payments
    const activeIds = new Set([
      ...invoices.map((i) => i.supplierId),
      ...payments.map((p) => p.supplierId)
    ])
    return suppliers.filter((s) => activeIds.has(s.id)).length
  }, [suppliers, invoices, payments])

  const newRegistrationsCount = useMemo(() => {
    return Math.min(suppliers.length, 14) // Demo registration count
  }, [suppliers])

  // Helper: Open Editor in Add Mode
  const handleAddSupplier = () => {
    if (isLocked) return toast.error('Data is locked.')
    setEditingSupplier(null)
    setViewMode('editor')
  }

  // Helper: Open Editor in Edit Mode
  const handleEditSupplier = (supplier: Supplier) => {
    if (isLocked) return toast.error('Data is locked.')
    setEditingSupplier(supplier)
    setViewMode('editor')
  }

  // Delete Supplier
  const handleDeleteSupplier = (supplier: Supplier) => {
    if (isLocked) return toast.error('Data is locked.')

    const hasInvoices = invoices.some(inv => inv.supplierId === supplier.id)
    const hasPayments = payments.some(pay => pay.supplierId === supplier.id)
    const hasDebitNotes = debitNotes.some(dn => dn.supplierId === supplier.id)
    const hasCreditNotes = supplierCreditNotes.some(cn => cn.supplierId === supplier.id)
    const hasReturns = purchaseReturns.some(pr => pr.supplierId === supplier.id)
    const hasExpenses = (expenseEntries || []).some(e => e.supplierId === supplier.id || (e.supplierName && e.supplierName.trim().toLowerCase() === supplier.name.trim().toLowerCase()))

    if (hasInvoices || hasPayments || hasDebitNotes || hasCreditNotes || hasReturns || hasExpenses) {
      toast.error(`Cannot delete supplier "${supplier.name}"`, {
        description: 'This supplier is linked to existing invoices, payments, debit/credit notes, returns, or expense entries and cannot be deleted.'
      })
      return
    }

    setSupplierToDelete(supplier)
    setDeleteDialogOpen(true)
  }

  const confirmDeleteSupplier = () => {
    if (supplierToDelete) {
      setSuppliers((prev) => prev.filter((s) => s.id !== supplierToDelete.id))
      if (activeCompanyId) {
        void deleteSupplier(activeCompanyId, supplierToDelete.id)
      }
      toast.success(`Supplier "${supplierToDelete.name}" deleted`)
      setDeleteDialogOpen(false)
      setSupplierToDelete(null)
    }
  }

  // ==================== VIEW 1: SUPPLIERS REGISTER LIST (SCREENSHOT 1) ====================
  if (viewMode === 'list') {
    return (
      <div className="space-y-6 pb-12">
        
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Suppliers</h1>
            <p className="text-xs text-slate-500 font-medium">Manage your supplier network, contact information, and account balances.</p>
          </div>

          <div className="flex items-center gap-2.5">
            <Button variant="outline" className="border-slate-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 h-9 bg-white">
              <Funnel className="h-4 w-4 text-slate-500" />
              Filter
            </Button>
            <Button variant="outline" className="border-slate-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 h-9 bg-white">
              <DownloadSimple className="h-4 w-4 text-slate-500" />
              Export
            </Button>
            <Button
              onClick={handleAddSupplier}
              disabled={isLocked}
              className="bg-[#0256e8] hover:bg-[#0046cd] text-white font-bold rounded-xl px-4 py-2 flex items-center gap-1.5 text-xs shadow-2xs h-9"
            >
              <Plus className="h-4 w-4" weight="bold" />
              Add Supplier
            </Button>
          </div>
        </div>

        {/* Top 4 Summary Cards Row from Screenshot 1 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card 1: Total Suppliers */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">TOTAL SUPPLIERS</p>
              <p className="text-2xl font-extrabold text-slate-900 tracking-tight">{totalSuppliersCount}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0256e8] flex items-center justify-center shrink-0">
              <UsersThree className="h-5 w-5" weight="duotone" />
            </div>
          </div>

          {/* Card 2: Total Payable */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">TOTAL PAYABLE</p>
              <p className="text-2xl font-extrabold text-red-600 tracking-tight">{formatCurrency(totalPayable)}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
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
                placeholder="Quick search suppliers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 pl-9 text-xs bg-white border-slate-200 rounded-xl"
              />
            </div>

            <span className="text-xs text-slate-500 font-medium">
              Showing {filteredSuppliers.length} suppliers
            </span>
          </div>

          {/* Table matching Screenshot 1 */}
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
              {paginatedSuppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-xs text-slate-500">
                    No suppliers found. Click "Add Supplier" above to create one.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedSuppliers.map((supplier, idx) => {
                  const initials = supplier.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || 'SP'
                  const avatarColors = [
                    'bg-blue-600 text-white',
                    'bg-indigo-600 text-white',
                    'bg-emerald-600 text-white',
                    'bg-purple-600 text-white',
                    'bg-sky-600 text-white'
                  ]
                  const avatarColor = avatarColors[idx % avatarColors.length]
                  const { netBalance: balance } = getSupplierBalanceDetails(supplier, invoices, payments, debitNotes, supplierCreditNotes, purchaseReturns)
                  const isPayable = balance > 0
                  const isAdvance = balance < 0

                  return (
                    <TableRow key={supplier.id} className="hover:bg-slate-50/80 border-b border-slate-100">
                      {/* Party Name */}
                      <TableCell className="py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0", avatarColor)}>
                            {initials}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-xs">{supplier.name}</p>
                            <p className="text-[11px] font-mono text-slate-400">SUP-{supplier.id.slice(-6).toUpperCase()}</p>
                          </div>
                        </div>
                      </TableCell>

                      {/* Mobile Number */}
                      <TableCell className="text-slate-600 text-xs font-medium py-3.5">
                        {supplier.phone ? (
                          <span className="flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5 text-slate-400 inline" />
                            {supplier.phone}
                          </span>
                        ) : '-'}
                      </TableCell>

                      {/* Address */}
                      <TableCell className="text-slate-600 text-xs py-3.5 max-w-[260px] truncate">
                        {supplier.address || '-'}
                      </TableCell>

                      {/* Balance & Status Badge */}
                      <TableCell className="text-right py-3.5 font-mono">
                        <p className={cn("text-xs font-extrabold", isPayable ? "text-red-600" : isAdvance ? "text-emerald-600" : "text-slate-700")}>
                          {formatCurrency(Math.abs(balance))}
                        </p>
                        <span className={cn(
                          "inline-block text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full mt-0.5",
                          isPayable ? "bg-red-50 text-red-600" : isAdvance ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-600"
                        )}>
                          {isPayable ? 'PAYABLE' : isAdvance ? 'ADVANCE' : 'SETTLED'}
                        </span>
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditSupplier(supplier)}
                            disabled={isLocked}
                            className="h-8 w-8 p-0 text-slate-600 hover:bg-slate-100 rounded-lg"
                          >
                            <PencilSimple className="h-4 w-4" weight="bold" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteSupplier(supplier)}
                            disabled={isLocked}
                            className="h-8 w-8 p-0 text-red-600 hover:bg-red-50 rounded-lg"
                          >
                            <Trash className="h-4 w-4" weight="bold" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>

          {/* Pagination Footer */}
          <div className="px-4 py-3 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>
              Showing {paginatedSuppliers.length} of {filteredSuppliers.length} suppliers
            </span>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-7 w-7 p-0 rounded-lg"
              >
                <CaretLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="px-2 py-0.5 bg-[#0256e8] text-white font-bold rounded-lg text-xs">
                {currentPage}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="h-7 w-7 p-0 rounded-lg"
              >
                <CaretRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Delete Confirmation Alert */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-slate-900 flex items-center gap-2">
                <Trash className="h-5 w-5 text-red-600" />
                Delete Supplier
              </DialogTitle>
            </DialogHeader>
            <p className="text-xs text-slate-600 py-2">
              Are you sure you want to delete <span className="font-bold text-slate-900">"{supplierToDelete?.name}"</span>? This action cannot be undone.
            </p>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={confirmDeleteSupplier} className="bg-red-600 hover:bg-red-700 text-white font-bold">Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // ==================== VIEW 2: EDIT / ADD SUPPLIER PAGE ====================
  return (
    <PartyFullPageEditor
      type="supplier"
      party={editingSupplier}
      existingParties={suppliers}
      onSave={(savedSupplier) => {
        if (editingSupplier) {
          setSuppliers((prev) => prev.map((s) => (s.id === savedSupplier.id ? (savedSupplier as Supplier) : s)))
          if (activeCompanyId) {
            void saveSupplier(activeCompanyId, savedSupplier as Supplier)
          }
          toast.success(`Supplier "${savedSupplier.name}" updated successfully`)
        } else {
          setSuppliers((prev) => [savedSupplier as Supplier, ...prev])
          if (activeCompanyId) {
            void saveSupplier(activeCompanyId, savedSupplier as Supplier)
          }
          toast.success(`Supplier "${savedSupplier.name}" added successfully`)
        }
        setViewMode('list')
        setEditingSupplier(null)
      }}
      onCancel={() => {
        setViewMode('list')
        setEditingSupplier(null)
      }}
      isLocked={isLocked}
      activeFY={activeFY}
      invoices={invoices}
      payments={payments}
      debitNotes={debitNotes}
      supplierCreditNotes={supplierCreditNotes}
      purchaseReturns={purchaseReturns}
    />
  )
}
