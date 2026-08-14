import { useState, useMemo, useEffect } from 'react'
import { getChangedByLabel } from '@/lib/security-utils'
import { Supplier, PurchaseInvoice, Payment, PaymentCDRule, InvoiceCloseCDRule, SupplierCDRuleVersion, CDRuleChangeLog, AnnualTarget } from '@/lib/types'
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
import { calculateTotalSupplierPayables, getSupplierYTDInvoiced, getSupplierPendingPayments } from '@/lib/report-calculations'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { deleteSupplier, saveSupplier } from '@/lib/firebase-storage'

interface SuppliersPageProps {
  suppliers: Supplier[]
  setSuppliers: (updater: (prev: Supplier[]) => Supplier[]) => void
  invoices?: PurchaseInvoice[]
  payments?: Payment[]
  isLocked?: boolean
  activeFY?: string
  activeCompanyId?: string
}

export default function SuppliersPage({ 
  suppliers = [], 
  setSuppliers, 
  invoices = [], 
  payments = [], 
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

  // Full History Dialog state
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false)

  // Form State for Editor view (Screenshot 2)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [gstin, setGstin] = useState('')
  const [openingBalance, setOpeningBalance] = useState('0')
  const [openingBalanceDate, setOpeningBalanceDate] = useState(getFYStart())
  const [balanceType, setBalanceType] = useState<'Credit' | 'Debit'>('Credit')

  // CD Feature Effective Date
  const [effectiveFromDate, setEffectiveFromDate] = useState<string>(new Date().toISOString().split('T')[0])

  // CD Feature 1: Payment CD Rules & Advance CD %
  const [advanceCDPercentage, setAdvanceCDPercentage] = useState('0')
  const [paymentCDRules, setPaymentCDRules] = useState<PaymentCDRule[]>([])
  const [newPayMinDays, setNewPayMinDays] = useState('0')
  const [newPayMaxDays, setNewPayMaxDays] = useState('15')
  const [newPayRate, setNewPayRate] = useState('1.0')

  // CD Feature 2: Invoice Closed CD Rules
  const [invoiceCloseCDRules, setInvoiceCloseCDRules] = useState<InvoiceCloseCDRule[]>([])
  const [newCloseMinDays, setNewCloseMinDays] = useState('0')
  const [newCloseMaxDays, setNewCloseMaxDays] = useState('15')
  const [newCloseRate, setNewCloseRate] = useState('100')
  const [newCloseUnit, setNewCloseUnit] = useState('MT')

  // CD Feature 3: Annual Target
  const [targetMT, setTargetMT] = useState('0')
  const [targetRatePerMT, setTargetRatePerMT] = useState('0')

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
    return calculateTotalSupplierPayables(suppliers)
  }, [suppliers])

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

  // Total Configured Rules Calculation for right side summary card
  const totalConfiguredRulesCount = useMemo(() => {
    let count = 0
    if (parseFloat(advanceCDPercentage) > 0) count += 1
    count += paymentCDRules.length
    count += invoiceCloseCDRules.length
    if (parseFloat(targetMT) > 0 || parseFloat(targetRatePerMT) > 0) count += 1
    return count
  }, [advanceCDPercentage, paymentCDRules, invoiceCloseCDRules, targetMT, targetRatePerMT])

  // Helper: Open Editor in Add Mode
  const handleAddSupplier = () => {
    if (isLocked) return toast.error('Data is locked.')
    setEditingSupplier(null)
    setName('')
    setPhone('')
    setEmail('')
    setAddress('')
    setGstin('')
    setOpeningBalance('0')
    setOpeningBalanceDate(getFYStart())
    setBalanceType('Credit')
    setEffectiveFromDate(new Date().toISOString().split('T')[0])
    setAdvanceCDPercentage('0')
    setPaymentCDRules([])
    setInvoiceCloseCDRules([])
    setTargetMT('0')
    setTargetRatePerMT('0')
    setViewMode('editor')
  }

  // Helper: Open Editor in Edit Mode
  const handleEditSupplier = (supplier: Supplier) => {
    if (isLocked) return toast.error('Data is locked.')
    setEditingSupplier(supplier)
    setName(supplier.name || '')
    setPhone(supplier.phone || '')
    setEmail(supplier.email || '')
    setAddress(supplier.address || '')
    setGstin(supplier.gstin || '')
    setOpeningBalance((supplier.openingBalance || 0).toString())
    setOpeningBalanceDate(supplier.openingBalanceDate || getFYStart())
    setBalanceType(supplier.balanceType || 'Credit')
    setEffectiveFromDate(supplier.cdRuleVersions?.[0]?.effectiveFrom || new Date().toISOString().split('T')[0])
    setAdvanceCDPercentage((supplier.advanceCDPercentage || 0).toString())
    setPaymentCDRules(supplier.paymentCDRules || [])
    setInvoiceCloseCDRules(supplier.invoiceCloseCDRules || [])
    setTargetMT((supplier.annualTarget?.targetMT || 0).toString())
    setTargetRatePerMT((supplier.annualTarget?.ratePerMT || 0).toString())
    setViewMode('editor')
  }

  // Helper: Save Supplier (Create or Update)
  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault()
    if (isLocked) return toast.error('Data is locked.')
    if (!name.trim()) return toast.error('Party Name is required')

    const opBal = parseFloat(openingBalance) || 0
    const advCD = parseFloat(advanceCDPercentage) || 0
    const tMT = parseFloat(targetMT) || 0
    const tRate = parseFloat(targetRatePerMT) || 0

    const annualTarget: AnnualTarget | undefined = (tMT > 0 || tRate > 0) ? {
      targetMT: tMT,
      ratePerMT: tRate
    } : undefined

    if (editingSupplier) {


      const updatedSupplier: Supplier = {
        ...editingSupplier,
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        gstin: gstin.trim() || undefined,
        openingBalance: opBal,
        openingBalanceDate: opBal !== 0 ? openingBalanceDate : undefined,
        balanceType,
        advanceCDPercentage: advCD,
        paymentCDRules,
        invoiceCloseCDRules,
        annualTarget,
        cdRuleVersions: editingSupplier.cdRuleVersions,
        cdRuleChangeLog: editingSupplier.cdRuleChangeLog
      }

      setSuppliers((prev) => prev.map((s) => (s.id === editingSupplier.id ? updatedSupplier : s)))
      if (activeCompanyId) {
        void saveSupplier(activeCompanyId, updatedSupplier)
      }
      toast.success(`Supplier "${name}" updated successfully`)
    } else {
      const newId = `sup-${Date.now()}`

      const newSupplier: Supplier = {
        id: newId,
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        gstin: gstin.trim() || undefined,
        openingBalance: opBal,
        openingBalanceDate: opBal !== 0 ? openingBalanceDate : undefined,
        balanceType,
        advanceCDPercentage: advCD,
        paymentCDRules,
        invoiceCloseCDRules,
        annualTarget,
      }

      setSuppliers((prev) => [newSupplier, ...prev])
      if (activeCompanyId) {
        void saveSupplier(activeCompanyId, newSupplier)
      }
      toast.success(`Supplier "${name}" added successfully`)
    }

    setViewMode('list')
  }

  // Delete Supplier
  const handleDeleteSupplier = (supplier: Supplier) => {
    if (isLocked) return toast.error('Data is locked.')

    const hasInvoices = invoices.some(inv => inv.supplierId === supplier.id)
    const hasPayments = payments.some(pay => pay.supplierId === supplier.id)

    if (hasInvoices || hasPayments) {
      toast.error(`Cannot delete supplier "${supplier.name}"`, {
        description: 'This supplier is linked to existing invoices or payments and cannot be deleted.'
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

  // Calculated metrics for editing supplier (Purchase Summary Card in Screenshot 2)
  const currentSupplierInvoices = useMemo(() => {
    if (!editingSupplier) return []
    return invoices.filter((inv) => inv.supplierId === editingSupplier.id)
  }, [editingSupplier, invoices])

  const totalInvoicedYTD = useMemo(() => {
    if (!editingSupplier) return 0
    return getSupplierYTDInvoiced(editingSupplier.id, invoices, activeFY)
  }, [editingSupplier, invoices, activeFY])

  const pendingPayments = useMemo(() => {
    if (!editingSupplier) return 0
    return getSupplierPendingPayments(editingSupplier, invoices, payments, activeFY)
  }, [editingSupplier, invoices, payments, activeFY])

  const lastPurchaseDate = useMemo(() => {
    if (currentSupplierInvoices.length === 0) return 'No purchases yet'
    const sorted = [...currentSupplierInvoices].sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime())
    return sorted[0].invoiceDate
  }, [currentSupplierInvoices])

  // CD Tier Adders
  const handleAddPaymentCDTier = () => {
    const minD = parseInt(newPayMinDays) || 0
    const maxD = parseInt(newPayMaxDays) || 0
    const rate = parseFloat(newPayRate) || 0
    if (maxD <= minD) return toast.error('Max days must be greater than Min days')
    setPaymentCDRules((prev) => [...prev, { minDays: minD, maxDays: maxD, percentageRate: rate }])
    setNewPayMinDays(maxD.toString())
    setNewPayMaxDays((maxD + 15).toString())
  }

  const handleAddInvoiceCloseRule = () => {
    const minD = parseInt(newCloseMinDays) || 0
    const maxD = parseInt(newCloseMaxDays) || 0
    const rate = parseFloat(newCloseRate) || 0
    const unit = newCloseUnit || 'MT'
    if (maxD <= minD) return toast.error('Max days must be greater than Min days')
    setInvoiceCloseCDRules((prev) => [...prev, { minDays: minD, maxDays: maxD, ratePerMT: rate, unit }])
    setNewCloseMinDays(maxD.toString())
    setNewCloseMaxDays((maxD + 15).toString())
  }

  // Derived audit versions list for history modal dialog (Full details version mapping)
  const auditVersionsList = useMemo(() => {
    if (!editingSupplier) return []
    const versions = editingSupplier.cdRuleVersions || []
    if (versions.length > 0) return versions

    // Fallback initial baseline version if none exists
    return [{
      id: `v-baseline-${editingSupplier.id}`,
      version: 1,
      ruleName: 'Supplier CD Rules Baseline',
      effectiveFrom: effectiveFromDate,
      paymentCDRules: editingSupplier.paymentCDRules || [],
      invoiceCloseCDRules: editingSupplier.invoiceCloseCDRules || [],
      advanceCDPercentage: editingSupplier.advanceCDPercentage || 0,
      changedBy: getChangedByLabel(),
      changedAt: new Date().toISOString(),
      reason: 'Initial setup baseline',
      approvalStatus: 'Approved' as const
    }]
  }, [editingSupplier, effectiveFromDate])


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
                  const bal = supplier.openingBalance || 0
                  const isPayable = (supplier.balanceType || 'Credit') === 'Credit' && bal > 0
                  const isAdvance = supplier.balanceType === 'Debit' && bal > 0

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
                          {formatCurrency(bal)}
                        </p>
                        {supplier.openingBalanceDate && bal !== 0 && (
                          <p className="text-[10px] text-slate-400 font-normal">
                            As-On: {new Date(supplier.openingBalanceDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </p>
                        )}
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

  // ==================== VIEW 2: EDIT / ADD SUPPLIER PAGE (SCREENSHOT 2) ====================
  return (
    <div className="space-y-6 pb-16">
      
      {/* Header Bar matching Screenshot 2 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setViewMode('list')}
            className="h-9 w-9 rounded-full text-slate-700 hover:bg-slate-200/60"
          >
            <CaretLeft className="h-5 w-5" weight="bold" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {editingSupplier ? `Edit Supplier: ${editingSupplier.name}` : 'Add New Supplier'}
            </h1>
            <p className="text-xs text-slate-500 font-medium">Manage supplier master data and discount configurations</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setViewMode('list')}
            className="border-slate-200 text-xs font-semibold rounded-xl px-4 h-9 bg-white"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveSupplier}
            disabled={isLocked}
            className="bg-[#0256e8] hover:bg-[#0046cd] text-white font-bold rounded-xl px-5 h-9 text-xs shadow-2xs"
          >
            {editingSupplier ? 'Update Supplier' : 'Save Supplier'}
          </Button>
        </div>
      </div>

      {/* Main Grid: Left Column (Profile & CD Features) + Right Column (CD Rules History & Purchase Summary) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left / Middle Column (Width 8/12) */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Profile Details Card */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-2xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
              <UserPlus className="h-4 w-4 text-[#0256e8]" weight="bold" />
              <span>Profile Details</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Party Name *</Label>
                <Input
                  type="text"
                  placeholder="e.g. Alpha Logistics Solutions"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-9 text-xs bg-white font-semibold text-slate-900"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">GSTIN Number</Label>
                <Input
                  type="text"
                  placeholder="27AAACG0000Z1Z5"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value)}
                  className="h-9 text-xs bg-white font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Mobile Number</Label>
                <Input
                  type="text"
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-9 text-xs bg-white"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Email Address</Label>
                <Input
                  type="email"
                  placeholder="vendor@alphalogistics.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-9 text-xs bg-white"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Address</Label>
              <Textarea
                placeholder="Suite 405, Enterprise Plaza, Industrial Area..."
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="text-xs min-h-[70px]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Opening Balance (₹)</Label>
                <Input
                  type="number"
                  step="any"
                  placeholder="125000"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  className="h-9 text-xs font-bold text-slate-900"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Balance Type</Label>
                <Select value={balanceType} onValueChange={(val: 'Credit' | 'Debit') => setBalanceType(val)}>
                  <SelectTrigger className="h-9 text-xs bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Credit">Credit (Payable)</SelectItem>
                    <SelectItem value="Debit">Debit (Advance)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* As-On Date: shown when opening balance is non-zero */}
            {(parseFloat(openingBalance) || 0) !== 0 && (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50/60 animate-in fade-in duration-200">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs font-bold text-slate-700">
                    Opening Balance As-On Date <span className="text-destructive">*</span>
                  </Label>
                  <p className="text-[10px] text-slate-500">The date from which this opening balance is effective (typically start of financial year)</p>
                  <Input
                    type="date"
                    value={openingBalanceDate}
                    onChange={(e) => setOpeningBalanceDate(e.target.value)}
                    className="h-8 text-xs bg-white"
                    required
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column (Width 4/12): PURCHASE SUMMARY */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#0256e8] rounded-2xl p-5 text-white shadow-md space-y-4">
            <div className="flex items-center gap-2 border-b border-blue-400/40 pb-3">
              <Receipt className="h-5 w-5 text-blue-200" weight="duotone" />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-white">PURCHASE SUMMARY</h3>
            </div>

            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-blue-100">Total Invoiced YTD</span>
                <span className="text-sm font-extrabold text-white font-mono">{formatCurrency(totalInvoicedYTD)}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-blue-100">Pending Payments</span>
                <span className="text-sm font-extrabold text-white font-mono">{formatCurrency(pendingPayments)}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-blue-100">Last Purchase</span>
                <span className="text-xs font-bold text-white">{lastPurchaseDate}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Full Audit History Dialog (Redesigned with ALL DETAILS as requested) */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader className="border-b border-slate-100 pb-3">
            <DialogTitle className="flex items-center gap-2 text-slate-900 text-lg">
              <Clock className="h-5 w-5 text-[#0256e8]" weight="bold" />
              <span>CD Rules Change Log & Audit History</span>
            </DialogTitle>
            <p className="text-xs text-slate-500 font-medium">
              Showing complete breakdown of all historical CD rule versions for <span className="font-bold text-slate-800">{editingSupplier?.name || name}</span>
            </p>
          </DialogHeader>

          <div className="space-y-4 pt-2 text-xs">
            {auditVersionsList.map((ver) => {
              const payRules = ver.paymentCDRules || []
              const closeRules = ver.invoiceCloseCDRules || []
              const advCD = ver.advanceCDPercentage || 0

              return (
                <div key={ver.id} className="p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs space-y-3">
                  
                  {/* Version Header Bar */}
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-[#0256e8] text-white font-mono font-bold text-xs px-2 py-0.5">
                        Version #{ver.version}
                      </Badge>
                      <span className="font-bold text-slate-900 text-sm">{ver.ruleName}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                        <CalendarBlank className="h-3.5 w-3.5 text-slate-400" />
                        Effective: <strong className="text-slate-800 font-mono">{ver.effectiveFrom}</strong>
                      </span>
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-extrabold uppercase">
                        {ver.approvalStatus || 'Approved'}
                      </Badge>
                    </div>
                  </div>

                  {/* ALL DETAILS Breakdown Box */}
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">CONFIGURED CD RULES BREAKDOWN</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {/* Advance CD */}
                      <div className="p-2 rounded-lg bg-white border border-slate-200/70">
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">1. ADVANCE CD</span>
                        <span className="font-extrabold text-slate-900 text-sm">{advCD}%</span>
                      </div>

                      {/* Prompt CD */}
                      <div className="p-2 rounded-lg bg-white border border-slate-200/70">
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">2. PROMPT CD TIERS</span>
                        {payRules.length === 0 ? (
                          <span className="text-slate-500 italic">None configured</span>
                        ) : (
                          <div className="space-y-0.5 mt-0.5">
                            {payRules.map((r, idx) => (
                              <div key={idx} className="font-bold text-slate-800 text-[11px]">
                                {r.minDays} to {r.maxDays} Days ➔ <span className="text-[#0256e8]">{r.percentageRate}% CD</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Invoice Closed CD */}
                      <div className="p-2 rounded-lg bg-white border border-slate-200/70">
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">3. INVOICE CLOSED CD RULES</span>
                        {closeRules.length === 0 ? (
                          <span className="text-slate-500 italic">None configured</span>
                        ) : (
                          <div className="space-y-0.5 mt-0.5">
                            {closeRules.map((r, idx) => (
                              <div key={idx} className="font-bold text-slate-800 text-[11px]">
                                {r.minDays} to {r.maxDays} Days ➔ <span className="text-indigo-700">₹{r.ratePerMT} / MT</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Annual Target */}
                      <div className="p-2 rounded-lg bg-white border border-slate-200/70">
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">4. ANNUAL TARGET</span>
                        <span className="font-bold text-emerald-700 text-[11px]">
                          {parseFloat(targetMT) > 0 || parseFloat(targetRatePerMT) > 0
                            ? `${targetMT} MT @ ₹${targetRatePerMT} / MT`
                            : 'None configured'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Audit Metadata Footer */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100 gap-1">
                    <span><strong>Reason:</strong> {ver.reason}</span>
                    <span>Changed by <strong className="text-slate-800">{ver.changedBy}</strong> at {new Date(ver.changedAt).toLocaleString()}</span>
                  </div>

                </div>
              )
            })}
          </div>

          <DialogFooter className="border-t border-slate-100 pt-3">
            <Button onClick={() => setHistoryDialogOpen(false)} className="h-9 px-6 bg-[#0256e8] hover:bg-[#0046cd] text-white text-xs font-bold rounded-xl">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
