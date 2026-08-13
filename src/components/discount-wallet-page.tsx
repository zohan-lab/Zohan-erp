import { useState, useMemo, useEffect } from 'react'
import { ReceivedDiscount, Supplier, PurchaseInvoice, Payment, DiscountCategory, FixedScheme, PendingDiscount, ExpectedAnnualDiscount, PendingAnnualDiscount, MTBooking, Item, SupplierDebitNote } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { getChangedByLabel, getChangedByRole } from '@/lib/security-utils'
import { saveEntityRemote, deleteEntityRemote } from '@/lib/firebase-storage'

import { Plus, TrendUp, Trash, FunnelSimple, FilePdf, CaretRight, Pencil, Wallet, Clock, ArrowRight } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  formatCurrency, 
  formatMT,
  calculatePaymentAllocations,
  calculateExpectedDiscounts,
  calculateExpectedAnnualDiscounts,
  calculateDiscountAllocations,
  calculateAnnualDiscountAllocations,
  calculatePendingDiscounts,
  calculatePendingAnnualDiscounts,
  getFYDateRange,
  formatDateForInput,
} from '@/lib/calculations'
import { exportPendingStatementPDF } from '@/lib/pdf-export'

export interface CDLedgerTransfer {
  id: string
  supplierId: string
  amount: number
  date: string
  reference?: string
  remarks?: string
  noteType: 'debit_note' | 'credit_note'
  debitNoteId?: string
  createdAt: string
  createdBy?: string
  createdByRole?: string
}

interface DiscountWalletPageProps {
  suppliers: Supplier[]
  invoices: PurchaseInvoice[]
  payments: Payment[]
  receivedDiscounts: ReceivedDiscount[]
  debitNotes?: SupplierDebitNote[]
  setDebitNotes?: (updater: (prev: SupplierDebitNote[]) => SupplierDebitNote[]) => void
  onAddReceivedDiscount?: (discount: ReceivedDiscount) => void
  onUpdateReceivedDiscount?: (discount: ReceivedDiscount) => void
  onDeleteReceivedDiscount?: (id: string) => void
  onUpdateInvoiceDiscountReceived?: (invoiceId: string, discountReceived: number) => void
  setReceivedDiscounts?: (updater: (prev: ReceivedDiscount[]) => ReceivedDiscount[]) => void
  fixedSchemes?: FixedScheme[]
  mtBookings?: MTBooking[]
  items?: Item[]
  currentFY: string
  businessName?: string
  isLocked?: boolean
  activeCompanyId?: string
}

export default function DiscountWalletPage({
  suppliers,
  invoices,
  payments,
  receivedDiscounts,
  debitNotes = [],
  setDebitNotes,
  onAddReceivedDiscount,
  onUpdateReceivedDiscount,
  onDeleteReceivedDiscount,
  onUpdateInvoiceDiscountReceived,
  setReceivedDiscounts,
  fixedSchemes = [],
  mtBookings = [],
  items = [],
  currentFY,
  businessName,
  isLocked = false,
  activeCompanyId
}: DiscountWalletPageProps) {
  const [activeTab, setActiveTab] = useState<'pending' | 'received'>('pending')
  const [selectedSupplier, setSelectedSupplier] = useState<string>(() => suppliers[0]?.id || '')
  const [discountTypeFilter, setDiscountTypeFilter] = useState<'all' | 'wallet' | 'cd'>('all')
  const [receivedTypeFilter, setReceivedTypeFilter] = useState<Set<'annual' | 'wallet'>>(() => 
    new Set(['annual', 'wallet'])
  )
  const [expandedReceivedRows, setExpandedReceivedRows] = useState<Set<string>>(new Set())
  const [editingDiscount, setEditingDiscount] = useState<ReceivedDiscount | null>(null)
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set(['paymentCD', 'invoiceCloseCD', 'fixedScheme', 'annual'])
  )
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set(['all']))
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [expandedPayments, setExpandedPayments] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState(false)
  const [dialogType, setDialogType] = useState<'wallet' | 'annual'>('wallet')

  // Transfer to Ledger modal states
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [transferHistoryOpen, setTransferHistoryOpen] = useState(false)
  const [transferAmount, setTransferAmount] = useState('')
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0])
  const [transferRef, setTransferRef] = useState('')
  const [transferRemarks, setTransferRemarks] = useState('')
  const [transferNoteType, setTransferNoteType] = useState<'debit_note' | 'credit_note'>('debit_note')

  // Persistent CD Ledger Transfers
  const [transfers, setTransfers] = useState<CDLedgerTransfer[]>(() => {
    try {
      const key = `app_cd_ledger_transfers_${activeCompanyId || 'default'}`
      const stored = localStorage.getItem(key)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })

  const updateTransfers = (updater: (prev: CDLedgerTransfer[]) => CDLedgerTransfer[]) => {
    setTransfers(prev => {
      const next = updater(prev)
      try {
        const key = `app_cd_ledger_transfers_${activeCompanyId || 'default'}`
        localStorage.setItem(key, JSON.stringify(next))
      } catch (e) {
        console.error('Failed to save CD ledger transfers:', e)
      }
      return next
    })
  }

  // Ensure selectedSupplier defaults to first supplier if unset or invalid
  useEffect(() => {
    if ((selectedSupplier === 'all' || !selectedSupplier) && suppliers.length > 0) {
      setSelectedSupplier(suppliers[0].id)
    }
  }, [suppliers, selectedSupplier])

  // Current supplier object & Claimable Pool metrics
  const currentSupplierObj = useMemo(() => 
    suppliers.find(s => s.id === selectedSupplier), 
    [suppliers, selectedSupplier]
  )

  const supplierReceivedDiscounts = useMemo(() => {
    if (!selectedSupplier) return []
    return receivedDiscounts.filter(rd => rd.supplierId === selectedSupplier)
  }, [receivedDiscounts, selectedSupplier])

  const totalReceivedAmountForSupplier = useMemo(() => {
    return supplierReceivedDiscounts.reduce((sum, rd) => sum + (rd.amount || 0), 0)
  }, [supplierReceivedDiscounts])

  const supplierTransfers = useMemo(() => {
    if (!selectedSupplier) return []
    return transfers.filter(t => t.supplierId === selectedSupplier)
  }, [transfers, selectedSupplier])

  const totalTransferredAmountForSupplier = useMemo(() => {
    return supplierTransfers.reduce((sum, t) => sum + (t.amount || 0), 0)
  }, [supplierTransfers])

  const claimablePoolBalance = useMemo(() => {
    return Math.max(0, totalReceivedAmountForSupplier - totalTransferredAmountForSupplier)
  }, [totalReceivedAmountForSupplier, totalTransferredAmountForSupplier])

  const handleExecuteTransfer = () => {
    const amt = parseFloat(transferAmount)
    if (isNaN(amt) || amt <= 0) {
      toast.error('Enter a valid transfer amount greater than 0.')
      return
    }
    if (amt > claimablePoolBalance + 0.01) {
      toast.error(`Transfer amount cannot exceed available pool balance (${formatCurrency(claimablePoolBalance)}).`)
      return
    }
    if (!selectedSupplier) {
      toast.error('Select a supplier first.')
      return
    }

    const now = Date.now()
    const refStr = transferRef.trim() || `CD-CLAIM-${now.toString().slice(-6)}`
    const noteRemarks = transferRemarks.trim() || `Claimable CD incentive pool transferred to supplier ledger`

    const newDebitNote: SupplierDebitNote = {
      id: `dn-cd-${now}`,
      supplierId: selectedSupplier,
      date: transferDate || new Date().toISOString().split('T')[0],
      amount: amt,
      invoiceRef: refStr,
      remarks: noteRemarks,
      fy: currentFY,
      createdAt: now,
      isAutoGenerated: true,
      sourceType: 'manual',
      sourceId: `cd-transfer-${now}`
    }

    if (setDebitNotes) {
      setDebitNotes(prev => [newDebitNote, ...prev])
    }
    if (activeCompanyId) {
      void saveEntityRemote(activeCompanyId, 'debitNotes', newDebitNote)
    }

    const newTransfer: CDLedgerTransfer = {
      id: `transfer-${now}`,
      supplierId: selectedSupplier,
      amount: amt,
      date: transferDate || new Date().toISOString().split('T')[0],
      reference: refStr,
      remarks: noteRemarks,
      noteType: transferNoteType,
      debitNoteId: newDebitNote.id,
      createdAt: new Date().toISOString(),
      createdBy: getChangedByLabel(),
      createdByRole: getChangedByRole()
    }

    updateTransfers(prev => [newTransfer, ...prev])
    toast.success(`₹${amt.toLocaleString('en-IN')} transferred to ${currentSupplierObj?.name || 'supplier'}'s ledger as Debit Note.`)
    
    setTransferAmount('')
    setTransferRef('')
    setTransferRemarks('')
    setTransferDialogOpen(false)
  }

  const handleDeleteTransfer = (transfer: CDLedgerTransfer) => {
    if (isLocked) {
      toast.error('System is locked.')
      return
    }
    updateTransfers(prev => prev.filter(t => t.id !== transfer.id))
    if (transfer.debitNoteId && setDebitNotes) {
      setDebitNotes(prev => prev.filter(dn => dn.id !== transfer.debitNoteId))
      if (activeCompanyId) {
        void deleteEntityRemote(activeCompanyId, 'debitNotes', transfer.debitNoteId)
      }
    }
    toast.success('Transfer entry reverted and removed from ledger.')
  }

  // Date range filter state — defaults to current FY date range
  const defaultFYRange = getFYDateRange(currentFY)
  const defaultFromDate = defaultFYRange ? formatDateForInput(defaultFYRange.startDate) : ''
  const defaultToDate = defaultFYRange ? formatDateForInput(defaultFYRange.endDate) : ''
  const [fromDate, setFromDate] = useState<string>(defaultFromDate)
  const [toDate, setToDate] = useState<string>(defaultToDate)

  // Filter invoices/payments by date range instead of FY
  const fyInvoices = useMemo(() => invoices.filter(inv => {
    if (!inv.invoiceDate) return false
    if (fromDate && inv.invoiceDate < fromDate) return false
    if (toDate && inv.invoiceDate > toDate) return false
    return true
  }), [invoices, fromDate, toDate])

  const fyPayments = useMemo(() => payments.filter(p => {
    if (!p.paymentDate) return false
    if (fromDate && p.paymentDate < fromDate) return false
    if (toDate && p.paymentDate > toDate) return false
    return true
  }), [payments, fromDate, toDate])

  const fyReceivedDiscounts = useMemo(() => receivedDiscounts.filter(rd => {
    if (rd.type !== 'wallet') return false
    if (!rd.discountReceivedDate) return false
    if (fromDate && rd.discountReceivedDate < fromDate) return false
    if (toDate && rd.discountReceivedDate > toDate) return false
    return true
  }), [receivedDiscounts, fromDate, toDate])

  const fyReceivedAnnual = useMemo(() => receivedDiscounts.filter(rd => {
    if (rd.type !== 'annual') return false
    if (!rd.discountReceivedDate) return false
    if (fromDate && rd.discountReceivedDate < fromDate) return false
    if (toDate && rd.discountReceivedDate > toDate) return false
    return true
  }), [receivedDiscounts, fromDate, toDate])

  const { allocations: paymentAllocations, paymentAdvanceInfo } = useMemo(() => 
    calculatePaymentAllocations(fyPayments, fyInvoices),
    [fyPayments, fyInvoices]
  )

  const expectedDiscounts = useMemo(() => 
    calculateExpectedDiscounts(fyInvoices, fyPayments, paymentAllocations, paymentAdvanceInfo, suppliers, fixedSchemes, mtBookings, items),
    [fyInvoices, fyPayments, paymentAllocations, paymentAdvanceInfo, suppliers, fixedSchemes, mtBookings, items]
  )

  const expectedAnnual = useMemo(() => 
    calculateExpectedAnnualDiscounts(fyInvoices, suppliers),
    [fyInvoices, suppliers]
  )

  const { allocations: discountAllocations, receivedStatus } = useMemo(() => 
    calculateDiscountAllocations(fyReceivedDiscounts, expectedDiscounts),
    [fyReceivedDiscounts, expectedDiscounts]
  )

  const { allocations: annualAllocations, receivedStatus: annualReceivedStatus } = useMemo(() => 
    calculateAnnualDiscountAllocations(fyReceivedAnnual, expectedAnnual),
    [fyReceivedAnnual, expectedAnnual]
  )

  const pendingDiscounts = useMemo(() => 
    calculatePendingDiscounts(expectedDiscounts, discountAllocations, suppliers),
    [expectedDiscounts, discountAllocations, suppliers]
  )

  const pendingAnnual = useMemo(() => 
    calculatePendingAnnualDiscounts(expectedAnnual, annualAllocations),
    [expectedAnnual, annualAllocations]
  )

  const combinedPending = useMemo(() => {
    const regular = pendingDiscounts.map(pd => ({ ...pd, isAnnual: false }))
    const annual = pendingAnnual.map(pa => ({
      id: pa.id,
      supplierId: pa.supplierId,
      invoiceId: undefined,
      schemeId: undefined,
      type: 'annual' as const,
      earnedDate: new Date().toISOString().split('T')[0],
      eligibleQuantityMT: pa.achievedMT,
      ratePerMT: pa.ratePerMT,
      expectedAmount: pa.expectedAmount,
      invoiceNo: undefined,
      schemeName: 'Annual Target',
      receivedAmount: pa.receivedAmount,
      pendingAmount: pa.pendingAmount,
      status: pa.status,
      isAnnual: true
    }))
    return [...regular, ...annual]
  }, [pendingDiscounts, pendingAnnual])

  const filteredExpected = useMemo(() => {
    return expectedDiscounts.filter(exp => {
      if (selectedSupplier !== 'all' && exp.supplierId !== selectedSupplier) return false
      
      const normalizedType = exp.type === 'advanceCD' ? 'paymentCD' : exp.type
      if (!selectedCategories.has(normalizedType)) return false
      
      if (!selectedMonths.has('all')) {
        if (exp.type === 'paymentCD' || exp.type === 'advanceCD') {
          const payment = fyPayments.find(p => p.id === exp.paymentId)
          if (payment) {
            const paymentDate = new Date(payment.paymentDate)
            const paymentMonth = `${paymentDate.getFullYear()}-${String(paymentDate.getMonth() + 1).padStart(2, '0')}`
            if (!selectedMonths.has(paymentMonth)) return false
          } else {
            const earnedDate = new Date(exp.earnedDate)
            const earnedMonth = `${earnedDate.getFullYear()}-${String(earnedDate.getMonth() + 1).padStart(2, '0')}`
            if (!selectedMonths.has(earnedMonth)) return false
          }
        } else {
          const invoice = fyInvoices.find(inv => inv.id === exp.invoiceId)
          if (invoice) {
            const invoiceDate = new Date(invoice.invoiceDate)
            const invoiceMonth = `${invoiceDate.getFullYear()}-${String(invoiceDate.getMonth() + 1).padStart(2, '0')}`
            if (!selectedMonths.has(invoiceMonth)) return false
          } else {
            const earnedDate = new Date(exp.earnedDate)
            const earnedMonth = `${earnedDate.getFullYear()}-${String(earnedDate.getMonth() + 1).padStart(2, '0')}`
            if (!selectedMonths.has(earnedMonth)) return false
          }
        }
      }
      return true
    })
  }, [expectedDiscounts, selectedSupplier, selectedCategories, selectedMonths, fyInvoices, fyPayments])

  const filteredExpectedAnnual = useMemo(() => {
    return expectedAnnual.filter(exp => {
      if (selectedSupplier !== 'all' && exp.supplierId !== selectedSupplier) return false
      if (!selectedCategories.has('annual')) return false
      if (!selectedMonths.has('all')) {
        return false
      }
      return true
    })
  }, [expectedAnnual, selectedSupplier, selectedCategories, selectedMonths])

  const filteredExpectedIds = useMemo(() => {
    return new Set([
      ...filteredExpected.map(e => e.id),
      ...filteredExpectedAnnual.map(e => e.id)
    ])
  }, [filteredExpected, filteredExpectedAnnual])

  const totalExpected = useMemo(() => {
    return filteredExpected.reduce((sum, exp) => sum + exp.expectedAmount, 0) + 
           filteredExpectedAnnual.reduce((sum, exp) => sum + exp.expectedAmount, 0)
  }, [filteredExpected, filteredExpectedAnnual])

  const ruleVersionComparison = useMemo(() => {
    const allocatedByExpectedId = new Map<string, number>()
    for (const allocation of discountAllocations) {
      allocatedByExpectedId.set(
        allocation.expectedDiscountId,
        (allocatedByExpectedId.get(allocation.expectedDiscountId) || 0) + allocation.allocatedAmount
      )
    }

    const groups = new Map<string, {
      key: string
      supplierName: string
      ruleName: string
      versionLabel: string
      rateLabel: string
      effectiveLabel: string
      paymentCDSummary?: string
      invoiceCloseCDSummary?: string
      expectedAmount: number
      receivedAmount: number
      isOld: boolean
    }>()

    // 1. Process supplier versions directly for selected suppliers
    const targetSuppliers = selectedSupplier === 'all'
      ? suppliers
      : suppliers.filter((s) => s.id === selectedSupplier)

    for (const supplier of targetSuppliers) {
      const versions = supplier.cdRuleVersions && supplier.cdRuleVersions.length > 0
        ? supplier.cdRuleVersions
        : [{
            id: `${supplier.id}-current`,
            version: 1,
            ruleName: 'Supplier CD Rules',
            effectiveFrom: new Date().toISOString().split('T')[0],
            paymentCDRules: supplier.paymentCDRules || [],
            invoiceCloseCDRules: supplier.invoiceCloseCDRules || [],
            advanceCDPercentage: supplier.advanceCDPercentage,
            approvalStatus: 'Approved' as const,
            changedBy: 'System',
            changedAt: new Date().toISOString(),
            reason: 'Current'
          }]

      for (const ver of versions) {
        const key = ver.id

        // Extract Payment CD rules + Advance CD %
        const payRules = (ver.paymentCDRules && ver.paymentCDRules.length > 0)
          ? ver.paymentCDRules
          : (supplier.paymentCDRules || [])
        const advPct = ver.advanceCDPercentage ?? supplier.advanceCDPercentage

        const payParts: string[] = []
        if (advPct && advPct > 0) {
          payParts.push(`Advance: ${advPct}%`)
        }
        if (payRules.length > 0) {
          payRules.forEach((r) => {
            payParts.push(`${r.percentageRate}% (${r.minDays}-${r.maxDays}d)`)
          })
        }
        const paymentCDSummary = payParts.length > 0 ? payParts.join(', ') : undefined

        // Extract Invoice Close CD rules
        const invCloseRules = (ver.invoiceCloseCDRules && ver.invoiceCloseCDRules.length > 0)
          ? ver.invoiceCloseCDRules
          : (supplier.invoiceCloseCDRules || [])

        const invoiceCloseCDSummary = invCloseRules.length > 0
          ? invCloseRules.map((r) => {
              const unitStr = r.unit ? `/${r.unit}` : '/MT'
              return `${formatCurrency(r.ratePerMT)}${unitStr} (${r.minDays}-${r.maxDays}d)`
            }).join(', ')
          : undefined

        const isOld = Boolean(ver.effectiveTo && new Date(ver.effectiveTo) < new Date())

        groups.set(key, {
          key,
          supplierName: supplier.name,
          ruleName: ver.ruleName || 'Supplier CD Rules',
          versionLabel: `v${ver.version || 1}`,
          rateLabel: '',
          effectiveLabel: ver.effectiveTo ? `Effective up to ${ver.effectiveTo}` : `Effective from ${ver.effectiveFrom}`,
          paymentCDSummary,
          invoiceCloseCDSummary,
          expectedAmount: 0,
          receivedAmount: 0,
          isOld
        })
      }
    }

    // 2. Accumulate amounts from filteredExpected
    for (const expected of filteredExpected) {
      const supplier = suppliers.find((item) => item.id === expected.supplierId)
      const fixedScheme = expected.schemeId ? fixedSchemes.find((scheme) => scheme.id === expected.schemeId) : undefined
      const supplierVersion = expected.ruleVersionId
        ? supplier?.cdRuleVersions?.find((version) => version.id === expected.ruleVersionId)
        : undefined

      const key = expected.ruleVersionId || expected.schemeId || `${expected.supplierId}-current`

      if (!groups.has(key)) {
        const typeLabel = expected.type === 'advanceCD' || expected.type === 'paymentCD'
          ? 'Payment CD'
          : expected.type === 'invoiceCloseCD'
            ? 'Invoice Close CD'
            : expected.schemeName || 'Fixed Scheme'

        const versionNumber = supplierVersion?.version || fixedScheme?.version || expected.ruleVersion || 1
        const effectiveFrom = supplierVersion?.effectiveFrom || fixedScheme?.fromDate || expected.earnedDate
        const effectiveTo = supplierVersion?.effectiveTo || fixedScheme?.toDate
        const isOld = Boolean(effectiveTo && new Date(effectiveTo) < new Date())

        groups.set(key, {
          key,
          supplierName: supplier?.name || 'Unknown Supplier',
          ruleName: supplierVersion?.ruleName || fixedScheme?.schemeName || typeLabel,
          versionLabel: `v${versionNumber}`,
          rateLabel: expected.ratePerMT > 0 ? `${formatCurrency(expected.ratePerMT)}/MT` : '',
          effectiveLabel: effectiveTo ? `Effective up to ${effectiveTo}` : `Effective from ${effectiveFrom}`,
          expectedAmount: 0,
          receivedAmount: 0,
          isOld
        })
      }

      const group = groups.get(key)!
      group.expectedAmount += expected.expectedAmount
      group.receivedAmount += allocatedByExpectedId.get(expected.id) || 0
    }

    return Array.from(groups.values())
      .sort((a, b) => Number(a.isOld) - Number(b.isOld) || a.supplierName.localeCompare(b.supplierName) || a.ruleName.localeCompare(b.ruleName))
  }, [filteredExpected, discountAllocations, suppliers, fixedSchemes, selectedSupplier])

  const allReceivedDiscounts = useMemo(() => {
    const wallet = fyReceivedDiscounts.map(rd => ({ ...rd, type: rd.type || 'wallet' as const }))
    const annual = fyReceivedAnnual.map(rd => ({ ...rd, type: rd.type || 'annual' as const }))
    return [...wallet, ...annual]
  }, [fyReceivedDiscounts, fyReceivedAnnual])

  const combinedReceivedStatus = useMemo(() => 
    new Map([...receivedStatus, ...annualReceivedStatus]),
    [receivedStatus, annualReceivedStatus]
  )

  const totalReceived = useMemo(() => {
    return allReceivedDiscounts.reduce((sum, rd) => {
      if (selectedSupplier !== 'all' && rd.supplierId !== selectedSupplier) return sum
      
      if (!receivedTypeFilter.has(rd.type)) return sum
      
      const allocationsForRd = rd.type === 'annual' 
        ? annualAllocations.filter(a => a.receivedDiscountId === rd.id)
        : discountAllocations.filter(a => a.receivedDiscountId === rd.id)
      
      if (!selectedMonths.has('all')) {
        const allocationsMatchingFilter = allocationsForRd.filter(alloc => {
          return filteredExpectedIds.has(alloc.expectedDiscountId)
        })
        
        const totalAllocatedForFilteredMonth = allocationsMatchingFilter
          .reduce((s, a) => s + a.allocatedAmount, 0)
        
        return sum + totalAllocatedForFilteredMonth
      }
      
      const totalAllocatedForRd = allocationsForRd
        .reduce((s, a) => s + a.allocatedAmount, 0)
      
      return sum + totalAllocatedForRd
    }, 0)
  }, [allReceivedDiscounts, selectedSupplier, receivedTypeFilter, selectedMonths, annualAllocations, discountAllocations, filteredExpectedIds])

  const filteredReceived = useMemo(() => {
    return allReceivedDiscounts.filter(rd => {
      if (selectedSupplier !== 'all' && rd.supplierId !== selectedSupplier) return false
      
      const discountType = rd.type || 'wallet'
      if (!receivedTypeFilter.has(discountType)) return false
      
      if (!selectedMonths.has('all')) {
        const allocationsForRd = rd.type === 'annual' 
          ? annualAllocations.filter(a => a.receivedDiscountId === rd.id)
          : discountAllocations.filter(a => a.receivedDiscountId === rd.id)
        
        const hasAllocationInFilteredMonth = allocationsForRd.some(alloc => 
          filteredExpectedIds.has(alloc.expectedDiscountId)
        )
        
        if (!hasAllocationInFilteredMonth) return false
      }
      
      return true
    })
  }, [allReceivedDiscounts, selectedSupplier, receivedTypeFilter, selectedMonths, annualAllocations, discountAllocations, filteredExpectedIds])

  const filteredPending = useMemo(() => {
    return combinedPending.filter(pd => {
      if (selectedSupplier !== 'all' && pd.supplierId !== selectedSupplier) return false
      
      const normalizedType = pd.type === 'advanceCD' ? 'paymentCD' : pd.type
      if (!selectedCategories.has(normalizedType)) return false
      
      if (!selectedMonths.has('all')) {
        if (pd.isAnnual) return false
        const earnedDate = new Date(pd.earnedDate)
        const earnedMonth = `${earnedDate.getFullYear()}-${String(earnedDate.getMonth() + 1).padStart(2, '0')}`
        if (!selectedMonths.has(earnedMonth)) return false
      }
      return true
    })
  }, [combinedPending, selectedSupplier, selectedCategories, selectedMonths])
  
  const totalAllocated = totalReceived
  
  const totalAdvance = useMemo(() => {
    return filteredReceived.reduce((sum, rd) => {
      const status = combinedReceivedStatus.get(rd.id)
      const totalAllocated = status?.allocated || 0
      const advanceForThisRd = Math.max(0, rd.amount - totalAllocated)
      
      return sum + advanceForThisRd
    }, 0)
  }, [filteredReceived, combinedReceivedStatus])
  
  const totalPending = useMemo(() => totalExpected - totalReceived, [totalExpected, totalReceived])

  const [selectedSupplierForDiscount, setSelectedSupplierForDiscount] = useState<string>('')
  const [selectedDiscountType, setSelectedDiscountType] = useState<DiscountCategory | ''>('')
  const [selectedPendingDiscountName, setSelectedPendingDiscountName] = useState<string>('')

  const pendingBySupplierAndType = useMemo(() => {
    const map = new Map<string, Map<DiscountCategory, number>>()
    
    for (const pd of combinedPending) {
      if (!map.has(pd.supplierId)) {
        map.set(pd.supplierId, new Map())
      }
      const supplierMap = map.get(pd.supplierId)!
      const normalizedType = pd.type === 'advanceCD' ? 'paymentCD' : pd.type
      const currentPending = supplierMap.get(normalizedType) || 0
      supplierMap.set(normalizedType, currentPending + pd.pendingAmount)
    }
    
    return map
  }, [combinedPending])

  const pendingDiscountsByName = useMemo(() => {
    if (!selectedSupplierForDiscount || !selectedDiscountType) {
      return []
    }

    const nameMap = new Map<string, { name: string, amount: number }>()
    
    for (const pd of combinedPending) {
      const matchesType = selectedDiscountType === 'paymentCD' 
        ? (pd.type === 'paymentCD' || pd.type === 'advanceCD')
        : pd.type === selectedDiscountType
      
      if (pd.supplierId !== selectedSupplierForDiscount || !matchesType) {
        continue
      }

      const discountName = pd.schemeName || 
                          (pd.type === 'paymentCD' || pd.type === 'advanceCD' ? 'Payment CD' : 
                           pd.type === 'invoiceCloseCD' ? 'Invoice Close CD' : 
                           'Unknown')
      
      if (!nameMap.has(discountName)) {
        nameMap.set(discountName, { name: discountName, amount: 0 })
      }
      
      const entry = nameMap.get(discountName)!
      entry.amount += pd.pendingAmount
    }
    
    return Array.from(nameMap.values())
      .filter(item => item.amount > 0)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [combinedPending, selectedSupplierForDiscount, selectedDiscountType])

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>, discountType: 'wallet' | 'annual') => {
    e.preventDefault()
    
    if (isLocked) {
      toast.error('Cannot save in locked mode', {
        description: 'Unlock the data in Settings to make changes'
      })
      return
    }
    
    if (discountType === 'wallet' && !selectedDiscountType) {
      toast.error('Please select discount type')
      return
    }
    
    if (discountType === 'wallet' && selectedDiscountType === 'fixedScheme' && !selectedPendingDiscountName) {
      toast.error('Please select discount name')
      return
    }
    
    const formData = new FormData(e.currentTarget)
    const discountReceivedDate = formData.get('discountReceivedDate') as string


    const receivedData: ReceivedDiscount = {
      id: editingDiscount?.id || `received-${Date.now()}`,
      supplierId: formData.get('supplierId') as string,
      discountReceivedDate: formData.get('discountReceivedDate') as string,
      amount: parseFloat(formData.get('amount') as string),
      notes: formData.get('notes') as string,
      status: 'Allocated',
      type: discountType,
      fy: currentFY,
      allocateToDiscountType: discountType === 'wallet' && selectedDiscountType ? selectedDiscountType as any : undefined,
      allocateToSchemeName: discountType === 'wallet' && selectedDiscountType === 'fixedScheme' && selectedPendingDiscountName ? selectedPendingDiscountName : undefined
    }

    setReceivedDiscounts?.((prev) => {
      return editingDiscount 
        ? prev.map(rd => rd.id === editingDiscount.id ? receivedData : rd)
        : [...prev, receivedData]
    })

    setOpen(false)
    setEditingDiscount(null)
    toast.success(editingDiscount ? 'Discount updated successfully' : 'Discount recorded successfully', {
      description: `Allocated to ${receivedData.allocateToSchemeName || (receivedData.allocateToDiscountType === 'paymentCD' ? 'Payment CD' : receivedData.allocateToDiscountType === 'advanceCD' ? 'Payment CD' : receivedData.allocateToDiscountType === 'invoiceCloseCD' ? 'Invoice Close CD' : receivedData.allocateToDiscountType === 'fixedScheme' ? 'Fixed Scheme' : 'all discounts')}`
    })
  }

  const handleDelete = (id: string) => {
    if (isLocked) {
      toast.error('Cannot delete in locked mode', {
        description: 'Unlock the data in Settings to make changes'
      })
      return
    }
    if (confirm('Are you sure you want to delete this received discount? This will recalculate all pending amounts.')) {
      setReceivedDiscounts?.((prev) => prev.filter(rd => rd.id !== id))
    }
  }

  const handleAdd = (type: 'wallet' | 'annual') => {
    if (isLocked) {
      toast.error('Cannot add in locked mode', {
        description: 'Unlock the data in Settings to make changes'
      })
      return
    }
    setDialogType(type)
    setSelectedSupplierForDiscount('')
    setSelectedDiscountType('')
    setSelectedPendingDiscountName('')
    setEditingDiscount(null)
    setOpen(true)
  }

  const handleEdit = (rd: ReceivedDiscount) => {
    if (isLocked) {
      toast.error('Cannot edit in locked mode', {
        description: 'Unlock the data in Settings to make changes'
      })
      return
    }
    setEditingDiscount(rd)
    setDialogType(rd.type)
    setSelectedSupplierForDiscount(rd.supplierId)
    setSelectedDiscountType(rd.allocateToDiscountType || '')
    setSelectedPendingDiscountName(rd.allocateToSchemeName || '')
    setOpen(true)
  }

  const supplierMap = new Map(suppliers.map(s => [s.id, s]))

  const groupedPendingByScheme = useMemo(() => {
    const groups = new Map<string, PendingDiscount & {
      invoiceCount: number
      invoices: string[]
      invoiceDetails: PendingDiscount[]
      isAnnual?: boolean
      earnedMonthDisplay?: string
      paymentDate?: string
      paymentAmount?: number
      cdPercentage?: number
      paymentId?: string
      isPaymentWise?: boolean
      schemeSourceMonth?: string
      hasFilteredInvoices?: boolean
      paymentBreakdown?: Array<{
        paymentId: string
        paymentDate: string
        paymentAmount: number
        expectedAmount: number
        receivedAmount: number
        pendingAmount: number
        cdPercentage: number
        invoiceDetails: PendingDiscount[]
        status: string
      }>
    }>()

    const isMonthFilterActive = !selectedMonths.has('all')
    const processedPayments = new Set<string>()
    
    for (const pd of filteredPending) {
      const isPaymentCDType = pd.type === 'paymentCD' || pd.type === 'advanceCD'
      const normalizedType = isPaymentCDType ? 'paymentCD' : pd.type
      
      const schemeName = normalizedType === 'paymentCD' ? 'Payment CD' : 
                        normalizedType === 'invoiceCloseCD' ? `${('ruleName' in pd ? pd.ruleName : undefined) || 'Invoice Close CD'} (₹${pd.ratePerMT || 0})` : 
                        normalizedType === 'annual' ? 'Annual Target' :
                        pd.schemeName || 'Unknown'
      
      if (isPaymentCDType) {
        const expectedDiscount = expectedDiscounts.find(ed => ed.id === pd.id)
        const paymentId = expectedDiscount?.paymentId
        const payment = paymentId ? fyPayments.find(p => p.id === paymentId) : null
        
        if (payment) {
          const key = `${pd.supplierId}-paymentCD-group`
          
          if (!groups.has(key)) {
            groups.set(key, {
              ...pd,
              id: key,
              type: normalizedType,
              schemeName: 'Payment CD',
              expectedAmount: 0,
              receivedAmount: 0,
              pendingAmount: 0,
              invoiceCount: 0,
              invoices: [],
              invoiceDetails: [],
              eligibleQuantityMT: 0,
              ratePerMT: 0,
              isAnnual: false,
              earnedMonthDisplay: !selectedMonths.has('all') ? Array.from(selectedMonths).join(', ') : undefined,
              paymentDate: undefined,
              paymentAmount: 0,
              cdPercentage: 0,
              paymentId: undefined,
              isPaymentWise: true,
              paymentBreakdown: []
            })
          }
          
          const group = groups.get(key)!
          group.expectedAmount += pd.expectedAmount
          group.receivedAmount += pd.receivedAmount
          group.pendingAmount += pd.pendingAmount
          
          let paymentBreakdownEntry = group.paymentBreakdown!.find(pb => pb.paymentId === payment.id)
          if (!paymentBreakdownEntry) {
            paymentBreakdownEntry = {
              paymentId: payment.id,
              paymentDate: payment.paymentDate,
              paymentAmount: payment.amount,
              expectedAmount: 0,
              receivedAmount: 0,
              pendingAmount: 0,
              cdPercentage: 0,
              invoiceDetails: [],
              status: 'Pending'
            }
            group.paymentBreakdown!.push(paymentBreakdownEntry)
            
            const paymentKey = `${pd.supplierId}-${payment.id}`
            if (!processedPayments.has(paymentKey)) {
              group.paymentAmount! += payment.amount
              processedPayments.add(paymentKey)
            }
          }
          
          paymentBreakdownEntry.expectedAmount += pd.expectedAmount
          paymentBreakdownEntry.receivedAmount += pd.receivedAmount
          paymentBreakdownEntry.pendingAmount += pd.pendingAmount
          
          if (pd.invoiceNo && pd.invoiceId && !paymentBreakdownEntry.invoiceDetails.some(inv => inv.invoiceId === pd.invoiceId)) {
            paymentBreakdownEntry.invoiceDetails.push({
              ...pd,
              type: normalizedType
            })
          }
          
          if (!group.earnedDate || new Date(pd.earnedDate) < new Date(group.earnedDate)) {
            group.earnedDate = pd.earnedDate
          }
          
          group.status = group.receivedAmount === 0 ? 'Pending' : 
                         group.receivedAmount >= group.expectedAmount ? 'Received' : 
                         'Partially Received'
        }
      } else {
        const pdUnit = 'unit' in pd ? pd.unit : 'MT'
        const key = `${pd.supplierId}-${normalizedType}-${normalizedType === 'paymentCD' ? 'Payment CD' : schemeName}-${pdUnit || 'MT'}`
        
        if (!groups.has(key)) {
          const invoice = fyInvoices.find(inv => inv.id === pd.invoiceId)
          let schemeSourceMonth: string | undefined
          
          if (invoice && normalizedType === 'fixedScheme') {
            const invoiceDate = new Date(invoice.invoiceDate)
            schemeSourceMonth = `${invoiceDate.getFullYear()}-${String(invoiceDate.getMonth() + 1).padStart(2, '0')}`
          }
          
          groups.set(key, {
            ...pd,
            id: key,
            type: normalizedType,
            schemeName,
            expectedAmount: 0,
            receivedAmount: 0,
            pendingAmount: 0,
            invoiceCount: 0,
            invoices: [],
            invoiceDetails: [],
            eligibleQuantityMT: 0,
            ratePerMT: 0,
            isAnnual: pd.isAnnual,
            earnedMonthDisplay: !selectedMonths.has('all') ? Array.from(selectedMonths).join(', ') : undefined,
            isPaymentWise: false,
            schemeSourceMonth,
            hasFilteredInvoices: false
          })
        }

        const group = groups.get(key)!
        group.expectedAmount += pd.expectedAmount
        group.receivedAmount += pd.receivedAmount
        group.pendingAmount += pd.pendingAmount
        
        if (!pd.isAnnual) {
          if (pd.invoiceNo && pd.invoiceId) {
            const invoice = fyInvoices.find(inv => inv.id === pd.invoiceId)
            const invoiceIsInFilteredMonth = invoice && (() => {
              if (!isMonthFilterActive) return true
              const invoiceDate = new Date(invoice.invoiceDate)
              const invoiceMonth = `${invoiceDate.getFullYear()}-${String(invoiceDate.getMonth() + 1).padStart(2, '0')}`
              return selectedMonths.has(invoiceMonth)
            })()
            
            if (invoiceIsInFilteredMonth) {
              group.hasFilteredInvoices = true
            }
            
            const existingInvoiceDetail = group.invoiceDetails.find(inv => inv.invoiceId === pd.invoiceId)
            
            if (!existingInvoiceDetail) {
              group.invoiceCount += 1
              group.invoices.push(pd.invoiceId)
              group.invoiceDetails.push({
                ...pd,
                type: normalizedType
              })
              group.eligibleQuantityMT += pd.eligibleQuantityMT
            } else {
              existingInvoiceDetail.expectedAmount += pd.expectedAmount
              existingInvoiceDetail.receivedAmount += pd.receivedAmount
              existingInvoiceDetail.pendingAmount += pd.pendingAmount
              existingInvoiceDetail.eligibleQuantityMT += pd.eligibleQuantityMT
              group.eligibleQuantityMT += pd.eligibleQuantityMT
            }
          } else {
            group.eligibleQuantityMT += pd.eligibleQuantityMT
          }
        } else {
          group.eligibleQuantityMT += pd.eligibleQuantityMT
        }
        
        if (!group.earnedDate || new Date(pd.earnedDate) < new Date(group.earnedDate)) {
          group.earnedDate = pd.earnedDate
        }
        
        group.status = group.receivedAmount === 0 ? 'Pending' : 
                       group.receivedAmount >= group.expectedAmount ? 'Received' : 
                       'Partially Received'
        
        if (group.eligibleQuantityMT > 0 && group.expectedAmount > 0) {
          group.ratePerMT = group.expectedAmount / group.eligibleQuantityMT
        }
      }
    }
    
    const result = Array.from(groups.values())
    
    result.forEach(group => {
      if (group.isPaymentWise && group.paymentAmount && group.paymentAmount > 0) {
        group.cdPercentage = (group.expectedAmount / group.paymentAmount) * 100
        
        if (group.paymentBreakdown) {
          group.paymentBreakdown.forEach(pb => {
            if (pb.paymentAmount > 0) {
              const payment = fyPayments.find(p => p.id === pb.paymentId)
              if (payment) {
                const allocations = paymentAllocations.filter(pa => pa.paymentId === pb.paymentId)
                const supplier = supplierMap.get(payment.supplierId)
                
                if (supplier && allocations.length > 0) {
                  const paymentInfo = paymentAdvanceInfo.get(payment.id)
                  let totalCDEarned = 0
                  
                  for (const allocation of allocations) {
                    const invoice = fyInvoices.find(inv => inv.id === allocation.invoiceId)
                    if (!invoice) continue
                    
                    const isAdvanceAllocation = paymentInfo?.allocationIsAdvanceMap.get(allocation.id) || false
                    let cdPercentage = 0
                    
                    if (isAdvanceAllocation) {
                      cdPercentage = supplier.advanceCDPercentage || 3
                    } else {
                      const paymentDate = new Date(payment.paymentDate)
                      const invoiceDate = new Date(invoice.invoiceDate)
                      const daysDiff = Math.floor((paymentDate.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24))
                      
                      for (const rule of supplier.paymentCDRules || []) {
                        if (daysDiff >= rule.minDays && daysDiff <= rule.maxDays) {
                          cdPercentage = rule.percentageRate
                          break
                        }
                      }
                    }
                    
                    totalCDEarned += (allocation.allocatedAmount * cdPercentage / 100)
                  }
                  
                  pb.cdPercentage = (totalCDEarned / pb.paymentAmount) * 100
                } else {
                  pb.cdPercentage = 0
                }
              } else {
                pb.cdPercentage = 0
              }
            } else {
              pb.cdPercentage = 0
            }
            pb.status = pb.receivedAmount === 0 ? 'Pending' : 
                       pb.receivedAmount >= pb.expectedAmount ? 'Received' : 
                       'Partially Received'
          })
          
          group.paymentBreakdown.sort((a, b) => 
            new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime()
          )
        }
      }
    })
    
    return result.sort((a, b) => {
      const typeOrder = { 'paymentCD': 1, 'invoiceCloseCD': 2, 'fixedScheme': 3, 'annual': 4 }
      const aOrder = typeOrder[a.type] || 99
      const bOrder = typeOrder[b.type] || 99
      if (aOrder !== bOrder) return aOrder - bOrder
      return new Date(a.earnedDate).getTime() - new Date(b.earnedDate).getTime()
    })
  }, [filteredPending, selectedMonths, expectedDiscounts, fyPayments])

  const isMonthFilterActive = !selectedMonths.has('all')

  const handleExportPendingOnly = () => {
    const dateRangeLabel = (fromDate || toDate)
      ? `${fromDate || '...'} to ${toDate || '...'}`
      : 'All Dates'
    const categoryLabel = Array.from(new Set(
      Array.from(selectedCategories).map(cat => {
        if (cat === 'paymentCD' || cat === 'advanceCD') return 'Payment CD'
        if (cat === 'invoiceCloseCD') return 'Invoice Close CD'
        if (cat === 'fixedScheme') return 'Fixed Scheme'
        if (cat === 'annual') return 'Annual Target'
        return 'All'
      })
    )).join(', ')
    
    exportPendingStatementPDF(
      'wallet',
      groupedPendingByScheme,
      suppliers,
      {
        title: 'Earned Discounts Statement (Scheme Wise)',
        fy: currentFY,
        generatedDate: new Date().toLocaleString('en-IN'),
        businessName,
        filters: {
          supplier: selectedSupplier,
          category: categoryLabel,
          month: dateRangeLabel
        }
      }
    )
  }


  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev)
      if (newSet.has(groupId)) {
        newSet.delete(groupId)
      } else {
        newSet.add(groupId)
      }
      return newSet
    })
  }

  const togglePayment = (paymentKey: string) => {
    setExpandedPayments(prev => {
      const newSet = new Set(prev)
      if (newSet.has(paymentKey)) {
        newSet.delete(paymentKey)
      } else {
        newSet.add(paymentKey)
      }
      return newSet
    })
  }

  const toggleReceivedRow = (rowId: string) => {
    setExpandedReceivedRows(prev => {
      const newSet = new Set(prev)
      if (newSet.has(rowId)) {
        newSet.delete(rowId)
      } else {
        newSet.add(rowId)
      }
      return newSet
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Discount Wallet</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Live calculated discount expectations vs received amounts
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleExportPendingOnly}
            disabled={filteredPending.length === 0}
          >
            <FilePdf className="mr-2" size={16} />
            Export PDF
          </Button>
          <Dialog open={open} onOpenChange={(isOpen) => {
            setOpen(isOpen)
            if (!isOpen) {
              setEditingDiscount(null)
              setSelectedSupplierForDiscount('')
              setSelectedDiscountType('')
              setSelectedPendingDiscountName('')
            }
          }}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => handleAdd('wallet')} disabled={suppliers.length === 0}>
                <Plus className="mr-2" size={16} />
                Receive Other Discounts
              </Button>
            </DialogTrigger>
            <DialogTrigger asChild>
              <Button size="sm" variant="secondary" onClick={() => handleAdd('annual')} disabled={suppliers.length === 0}>
                <Plus className="mr-2" size={16} />
                Receive Annual Discount
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingDiscount 
                  ? (dialogType === 'wallet' ? 'Edit Other Discount' : 'Edit Annual Discount')
                  : (dialogType === 'wallet' ? 'Record Other Discounts' : 'Record Annual Discount')
                }
              </DialogTitle>
              <DialogDescription>
                {dialogType === 'wallet' 
                  ? 'This will allocate to Payment CD, Fixed Scheme, Invoice Close CD, etc. (NOT Annual Discount)'
                  : 'This will allocate ONLY to Annual Discount'
                }
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={(e) => handleSubmit(e, dialogType)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="supplierId">Supplier</Label>
                <Select 
                  name="supplierId" 
                  required 
                  value={selectedSupplierForDiscount} 
                  onValueChange={(value) => {
                    setSelectedSupplierForDiscount(value)
                    setSelectedDiscountType('')
                  }}
                >
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

              {dialogType === 'wallet' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="discountType">
                      Discount Type <span className="text-destructive">*</span>
                      {!selectedSupplierForDiscount && (
                        <span className="text-xs text-muted-foreground ml-2">(Select supplier first)</span>
                      )}
                    </Label>
                    <Select 
                      name="discountType" 
                      required 
                      value={selectedDiscountType}
                      onValueChange={(value) => {
                        setSelectedDiscountType(value as DiscountCategory)
                        setSelectedPendingDiscountName('')
                      }}
                      disabled={!selectedSupplierForDiscount}
                    >
                      <SelectTrigger id="discountType">
                        <SelectValue placeholder={selectedSupplierForDiscount ? "Select discount type" : "Select supplier first"} />
                      </SelectTrigger>
                      <SelectContent>
                        {(['paymentCD', 'invoiceCloseCD', 'fixedScheme'] as const).map(type => {
                          const pendingAmount = selectedSupplierForDiscount 
                            ? (pendingBySupplierAndType.get(selectedSupplierForDiscount)?.get(type) || 0)
                            : 0
                          const typeLabel = type === 'paymentCD' ? 'Payment CD' : 
                                           type === 'invoiceCloseCD' ? 'Invoice Close CD' : 
                                           'Fixed Scheme'
                          return (
                            <SelectItem key={type} value={type}>
                              <div className="flex items-center justify-between w-full gap-4">
                                <span>{typeLabel}</span>
                                <span className={cn(
                                  "text-xs font-mono font-semibold ml-auto",
                                  pendingAmount > 0 ? "text-primary" : "text-muted-foreground"
                                )}>
                                  {formatCurrency(pendingAmount)}
                                </span>
                              </div>
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                    {selectedDiscountType && selectedSupplierForDiscount && (
                      <p className="text-xs text-muted-foreground">
                        Pending: {formatCurrency(pendingBySupplierAndType.get(selectedSupplierForDiscount)?.get(selectedDiscountType) || 0)}
                      </p>
                    )}
                  </div>

                  {selectedDiscountType === 'fixedScheme' && pendingDiscountsByName.length > 0 && (
                    <div className="space-y-2">
                      <Label htmlFor="pendingDiscountName">
                        Pending Discount Name <span className="text-destructive">*</span>
                      </Label>
                      <Select 
                        name="pendingDiscountName" 
                        required 
                        value={selectedPendingDiscountName}
                        onValueChange={setSelectedPendingDiscountName}
                      >
                        <SelectTrigger id="pendingDiscountName">
                          <SelectValue placeholder="Select discount name" />
                        </SelectTrigger>
                        <SelectContent>
                          {pendingDiscountsByName.map(({ name, amount }) => (
                            <SelectItem key={name} value={name}>
                              <div className="flex items-center justify-between w-full gap-4">
                                <span>{name}</span>
                                <span className={cn(
                                  "text-xs font-mono font-semibold ml-auto",
                                  amount > 0 ? "text-primary" : "text-muted-foreground"
                                )}>
                                  {formatCurrency(amount)}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedPendingDiscountName && (
                        <p className="text-xs text-muted-foreground">
                          Pending: {formatCurrency(pendingDiscountsByName.find(d => d.name === selectedPendingDiscountName)?.amount || 0)}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="discountReceivedDate">
                  Discount Received Date <span className="text-destructive">*</span>
                </Label>
                <Input 
                  id="discountReceivedDate" 
                  name="discountReceivedDate" 
                  type="date"
                  defaultValue={editingDiscount ? editingDiscount.discountReceivedDate : undefined}
                  required 
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">
                  Amount <span className="text-destructive">*</span>
                </Label>
                <Input 
                  id="amount" 
                  name="amount" 
                  type="number"
                  step="0.01"
                  defaultValue={editingDiscount ? editingDiscount.amount : undefined}
                  required 
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea 
                  id="notes"
                  name="notes" 
                  placeholder="Optional notes..."
                  defaultValue={editingDiscount ? editingDiscount.notes : undefined}
                />
              </div>

              <Button type="submit" className="w-full">
                {editingDiscount ? 'Update Discount' : 'Record Discount'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Card className="border-accent/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <FunnelSimple size={18} className="text-primary" />
            Discount Wallet Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label className="text-xs mb-1.5 block font-medium">Supplier *</Label>
              <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a supplier" />
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

            <div>
              <Label className="text-xs mb-1.5 block font-medium">Discount Types</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-10 w-full justify-between font-normal">
                    <div className="flex items-center gap-2 truncate">
                      <FunnelSimple size={15} className="text-muted-foreground shrink-0" />
                      <span className="truncate text-xs">
                        {selectedCategories.size === 4
                          ? 'All Discount Types'
                          : selectedCategories.size === 0
                          ? 'No Types Selected'
                          : `${selectedCategories.size} Types Selected`}
                      </span>
                    </div>
                    <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 h-5">
                      {selectedCategories.size}/4
                    </Badge>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3" align="start">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between pb-2 border-b">
                      <span className="text-xs font-semibold">Filter Discount Types</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[11px] px-1.5 text-primary"
                        onClick={() => {
                          if (selectedCategories.size === 4) {
                            setSelectedCategories(new Set())
                          } else {
                            setSelectedCategories(new Set(['paymentCD', 'invoiceCloseCD', 'fixedScheme', 'annual']))
                          }
                        }}
                      >
                        {selectedCategories.size === 4 ? 'Clear All' : 'Select All'}
                      </Button>
                    </div>
                    <div className="space-y-2.5 pt-1">
                      {[
                        { id: 'paymentCD', label: 'Payment CD' },
                        { id: 'invoiceCloseCD', label: 'Invoice Close CD' },
                        { id: 'fixedScheme', label: 'Fixed Scheme' },
                        { id: 'annual', label: 'Annual Target' },
                      ].map((type) => (
                        <div key={type.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`popover-filter-${type.id}`}
                            checked={selectedCategories.has(type.id)}
                            onCheckedChange={(checked) => {
                              setSelectedCategories((prev) => {
                                const next = new Set(prev)
                                if (checked) next.add(type.id)
                                else next.delete(type.id)
                                return next
                              })
                            }}
                          />
                          <Label htmlFor={`popover-filter-${type.id}`} className="text-xs cursor-pointer flex-1">
                            {type.label}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label className="text-xs mb-1.5 block font-medium">From Date</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full"
              />
            </div>

            <div>
              <Label className="text-xs mb-1.5 block font-medium">To Date</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Claimable Discount Pool Card */}
      {!selectedSupplier ? (
        <Card className="border-dashed p-8 text-center bg-muted/20">
          <CardContent className="pt-6">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-3">
              <FunnelSimple size={24} />
            </div>
            <h3 className="text-lg font-semibold mb-1">No Supplier Selected</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Please select a supplier from the filter dropdown above to view claimable discount balances and wallet data.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-background shadow-sm">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                    <Wallet size={22} weight="bold" />
                  </div>
                  <CardTitle className="text-lg font-bold text-foreground">Claimable Discount Pool</CardTitle>
                  <Badge variant="outline" className="text-xs font-normal border-primary/30 text-primary bg-primary/5">
                    {currentSupplierObj?.name || 'Supplier'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Accumulated unadjusted incentive pool available for direct ledger transfer
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="default"
                  size="sm"
                  className="h-9 gap-1.5 font-medium shadow-sm"
                  onClick={() => {
                    setTransferAmount(claimablePoolBalance > 0 ? String(claimablePoolBalance) : '')
                    setTransferDialogOpen(true)
                  }}
                  disabled={claimablePoolBalance <= 0 || isLocked}
                >
                  <Wallet size={16} weight="bold" />
                  Transfer to Ledger
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 font-medium"
                  onClick={() => setTransferHistoryOpen(true)}
                >
                  <Clock size={16} />
                  View History ({supplierTransfers.length})
                </Button>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-primary/10">
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">Available Claimable Pool</div>
                <div className="text-2xl font-mono font-bold text-primary">
                  {formatCurrency(claimablePoolBalance)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Unadjusted incentives ready for ledger</div>
              </div>

              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">Total Incentives Received</div>
                <div className="text-xl font-mono font-semibold text-emerald-600">
                  {formatCurrency(totalReceivedAmountForSupplier)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Accumulated received discounts</div>
              </div>

              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">Total Transferred to Ledger</div>
                <div className="text-xl font-mono font-semibold text-blue-600">
                  {formatCurrency(totalTransferredAmountForSupplier)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Issued via Debit Notes</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}



      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground mb-1">Expected Discounts</div>
            <div className="text-2xl font-mono font-semibold text-foreground">{formatCurrency(totalExpected)}</div>
            <div className="flex flex-wrap gap-1 mt-2">
              {[
                { key: 'paymentCD', types: ['paymentCD', 'advanceCD'], label: 'Pmt CD' },
                { key: 'invoiceCloseCD', types: ['invoiceCloseCD'], label: 'Inv CD' },
                { key: 'fixedScheme', types: ['fixedScheme'], label: 'Scheme' },
                { key: 'annual', types: ['annual'], label: 'Annual' }
              ].map(({ key, types, label }) => {
                const typeExpected = filteredExpected.filter(e => types.includes(e.type)).reduce((sum, e) => sum + e.expectedAmount, 0) +
                                    (key === 'annual' ? filteredExpectedAnnual.reduce((sum, e) => sum + e.expectedAmount, 0) : 0)
                return typeExpected > 0 ? (
                  <Badge key={key} variant="outline" className="text-[10px] px-1.5 py-0">
                    {label}: {formatCurrency(typeExpected)}
                  </Badge>
                ) : null
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {(fromDate || toDate) ? `${fromDate || '...'} to ${toDate || '...'}` : 'All dates'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground mb-1">Received Amount</div>
            <div className="text-2xl font-mono font-semibold text-success">{formatCurrency(totalAllocated)}</div>
            <p className="text-xs text-muted-foreground mt-1">Against earned discounts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground mb-1">Pending Balance</div>
            <div className="text-2xl font-mono font-semibold text-warning">{formatCurrency(totalPending)}</div>
            <p className="text-xs text-muted-foreground mt-1">Yet to receive</p>
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Earned Discounts (Scheme Wise)</h3>
          <div className="flex gap-2 text-xs">
            {[
              { key: 'paymentCD', types: ['paymentCD', 'advanceCD'], label: 'Payment CD' },
              { key: 'invoiceCloseCD', types: ['invoiceCloseCD'], label: 'Invoice Close CD' },
              { key: 'fixedScheme', types: ['fixedScheme'], label: 'Fixed Scheme' },
              { key: 'annual', types: ['annual'], label: 'Annual' }
            ].map(({ key, types, label }) => {
              const shouldShow = types.some(t => selectedCategories.has(t as any))
              if (!shouldShow) return null
              
              const count = filteredPending.filter(pd => types.includes(pd.type)).length
              return count > 0 ? (
                <Badge key={key} variant="secondary" className="text-xs font-mono">
                  {label}: {count}
                </Badge>
              ) : null
            })}
          </div>
        </div>
        {groupedPendingByScheme.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-8">
              <TrendUp size={40} className="text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-center text-sm mb-2">
                No earned discounts found for the selected filters.
              </p>
              {selectedCategories.size < 4 && (
                <p className="text-xs text-muted-foreground text-center">
                  Try enabling more discount types in the filters above.
                </p>
              )}
              {!selectedMonths.has('all') && (
                <p className="text-xs text-muted-foreground text-center">
                  No CDs were earned in the selected date range.
                  Payment CD and Invoice Close CD are earned when payments are made.
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]"></TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Payment Date / Scheme</TableHead>
                    <TableHead>Type / CD %</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="text-right">Pending</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedPendingByScheme.map((group, index) => {
                    const supplier = supplierMap.get(group.supplierId)
                    const typeLabel = group.type === 'paymentCD' || group.type === 'advanceCD' ? 'Payment CD' : 
                                     group.type === 'invoiceCloseCD' ? 'Invoice Close CD' : 
                                     group.type === 'annual' ? 'Annual Target' :
                                     'Fixed Scheme'
                    const groupId = `${group.supplierId}-${group.type}-${group.schemeName}-${index}`
                    const isExpanded = expandedGroups.has(groupId)
                    
                    const canExpandLevel1 = group.isPaymentWise && group.paymentBreakdown && group.paymentBreakdown.length > 0
                    const canExpandLevel1Alt = (!group.isAnnual && !group.isPaymentWise && group.invoiceDetails && group.invoiceDetails.length > 0)
                    const canExpand = canExpandLevel1 || canExpandLevel1Alt
                    
                    return (
                      <>
                        <TableRow 
                          key={groupId}
                          className={canExpand ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}
                          onClick={canExpand ? () => toggleGroup(groupId) : undefined}
                        >
                          <TableCell>
                            {canExpand ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleGroup(groupId)
                                }}
                              >
                                <motion.div
                                  initial={false}
                                  animate={{ rotate: isExpanded ? 90 : 0 }}
                                  transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                                >
                                  <CaretRight size={16} weight="bold" />
                                </motion.div>
                              </Button>
                            ) : null}
                          </TableCell>
                          <TableCell>{supplier?.name || 'Unknown'}</TableCell>
                          <TableCell className="font-medium">
                            {group.isPaymentWise ? (
                              <span className="text-sm">Payment CD</span>
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                <span>{group.schemeName}</span>
                                {isMonthFilterActive && group.schemeSourceMonth && !selectedMonths.has(group.schemeSourceMonth) && (
                                  <Badge variant="outline" className="text-[10px] px-1 py-0 w-fit border-primary/30 text-primary">
                                    From {group.schemeSourceMonth}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <Badge variant="outline" className="text-xs w-fit">{typeLabel}</Badge>
                              {group.isPaymentWise && group.cdPercentage && (
                                <Badge variant="secondary" className="text-xs w-fit font-mono">
                                  Avg {group.cdPercentage.toFixed(2)}%
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {group.isAnnual ? (
                              <Badge variant="secondary" className="text-xs font-mono">{formatMT(group.eligibleQuantityMT)} MT</Badge>
                            ) : group.isPaymentWise ? (
                              <Badge variant="secondary" className="text-xs font-mono">
                                {group.paymentBreakdown ? `${group.paymentBreakdown.length} payments` : '-'}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs font-mono">{group.invoiceCount} inv</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(group.expectedAmount)}</TableCell>
                          <TableCell className="text-right font-mono text-success">{formatCurrency(group.receivedAmount)}</TableCell>
                          <TableCell className="text-right font-mono text-warning">{formatCurrency(group.pendingAmount)}</TableCell>
                          <TableCell>
                            {group.status === 'Pending' && <Badge variant="outline" className="border-warning text-warning">Pending</Badge>}
                            {group.status === 'Partially Received' && <Badge className="bg-warning text-warning-foreground">Partial</Badge>}
                            {group.status === 'Received' && <Badge className="bg-success text-success-foreground">Received</Badge>}
                          </TableCell>
                        </TableRow>
                        <AnimatePresence initial={false}>
                          {isExpanded && canExpand && (
                            <TableRow key={`${groupId}-expanded`}>
                              <TableCell colSpan={10} className="p-0 border-0">
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ 
                                    height: "auto", 
                                    opacity: 1,
                                    transition: {
                                      height: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
                                      opacity: { duration: 0.25, ease: "easeOut", delay: 0.05 }
                                    }
                                  }}
                                  exit={{ 
                                    height: 0, 
                                    opacity: 0,
                                    transition: {
                                      height: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
                                      opacity: { duration: 0.15, ease: "easeIn" }
                                    }
                                  }}
                                  className="overflow-hidden bg-muted/30"
                                >
                                  <div className="p-4">
                                    {group.isPaymentWise && group.paymentBreakdown ? (
                                      <>
                                        <div className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
                                          Payment Breakdown ({group.paymentBreakdown.length})
                                        </div>
                                        <div className="bg-card rounded-lg border overflow-hidden">
                                          <Table>
                                            <TableHeader>
                                              <TableRow>
                                                <TableHead className="text-xs w-[40px]"></TableHead>
                                                <TableHead className="text-xs">Payment Date</TableHead>
                                                <TableHead className="text-xs text-right">Payment Amount</TableHead>
                                                <TableHead className="text-xs text-right">CD %</TableHead>
                                                <TableHead className="text-xs text-right">CD Earned</TableHead>
                                                <TableHead className="text-xs text-right">Received</TableHead>
                                                <TableHead className="text-xs text-right">Pending</TableHead>
                                                <TableHead className="text-xs">Status</TableHead>
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {group.paymentBreakdown.map((payment, pidx) => {
                                                const paymentKey = `${groupId}-payment-${payment.paymentId}`
                                                const isPaymentExpanded = expandedPayments.has(paymentKey)
                                                const hasInvoices = payment.invoiceDetails && payment.invoiceDetails.length > 0
                                                
                                                return (
                                                  <>
                                                    <TableRow
                                                      key={paymentKey}
                                                      className={hasInvoices ? "cursor-pointer hover:bg-muted/30 transition-colors" : ""}
                                                      onClick={hasInvoices ? () => togglePayment(paymentKey) : undefined}
                                                    >
                                                      <TableCell>
                                                        {hasInvoices ? (
                                                          <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-5 w-5 p-0"
                                                            onClick={(e) => {
                                                              e.stopPropagation()
                                                              togglePayment(paymentKey)
                                                            }}
                                                          >
                                                            <motion.div
                                                              initial={false}
                                                              animate={{ rotate: isPaymentExpanded ? 90 : 0 }}
                                                              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                                                            >
                                                              <CaretRight size={14} weight="bold" />
                                                            </motion.div>
                                                          </Button>
                                                        ) : null}
                                                      </TableCell>
                                                      <TableCell className="text-sm">{new Date(payment.paymentDate).toLocaleDateString('en-IN')}</TableCell>
                                                      <TableCell className="text-sm text-right font-mono">{formatCurrency(payment.paymentAmount)}</TableCell>
                                                      <TableCell className="text-sm text-right font-mono">{payment.cdPercentage.toFixed(2)}%</TableCell>
                                                      <TableCell className="text-sm text-right font-mono">{formatCurrency(payment.expectedAmount)}</TableCell>
                                                      <TableCell className="text-sm text-right font-mono text-success">{formatCurrency(payment.receivedAmount)}</TableCell>
                                                      <TableCell className="text-sm text-right font-mono text-warning">{formatCurrency(payment.pendingAmount)}</TableCell>
                                                      <TableCell className="text-sm">
                                                        {payment.status === 'Pending' && <Badge variant="outline" className="text-xs border-warning text-warning">Pending</Badge>}
                                                        {payment.status === 'Partially Received' && <Badge className="text-xs bg-warning text-warning-foreground">Partial</Badge>}
                                                        {payment.status === 'Received' && <Badge className="text-xs bg-success text-success-foreground">Received</Badge>}
                                                      </TableCell>
                                                    </TableRow>
                                                    <AnimatePresence initial={false}>
                                                      {isPaymentExpanded && hasInvoices && (
                                                        <TableRow key={`${paymentKey}-invoices`}>
                                                          <TableCell colSpan={9} className="p-0 border-0">
                                                            <motion.div
                                                              initial={{ height: 0, opacity: 0 }}
                                                              animate={{ 
                                                                height: "auto", 
                                                                opacity: 1,
                                                                transition: {
                                                                  height: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
                                                                  opacity: { duration: 0.2, ease: "easeOut", delay: 0.03 }
                                                                }
                                                              }}
                                                              exit={{ 
                                                                height: 0, 
                                                                opacity: 0,
                                                                transition: {
                                                                  height: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
                                                                  opacity: { duration: 0.12, ease: "easeIn" }
                                                                }
                                                              }}
                                                              className="overflow-hidden bg-muted/50"
                                                            >
                                                              <div className="p-3 pl-12">
                                                                <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                                                                  Invoice Allocations ({payment.invoiceDetails.length})
                                                                </div>
                                                                <div className="bg-card rounded border overflow-hidden">
                                                                  <Table>
                                                                    <TableHeader>
                                                                      <TableRow>
                                                                        <TableHead className="text-xs">Invoice No</TableHead>
                                                                        <TableHead className="text-xs">Invoice Date</TableHead>
                                                                        <TableHead className="text-xs text-right">Allocated Amount</TableHead>
                                                                        <TableHead className="text-xs text-right">Expected</TableHead>
                                                                        <TableHead className="text-xs text-right">Received</TableHead>
                                                                        <TableHead className="text-xs text-right">Pending</TableHead>
                                                                      </TableRow>
                                                                    </TableHeader>
                                                                    <TableBody>
                                                                      {payment.invoiceDetails
                                                                        .sort((a, b) => new Date(a.earnedDate).getTime() - new Date(b.earnedDate).getTime())
                                                                        .map((invoice, iidx) => {
                                                                          const allocation = paymentAllocations.find(pa => 
                                                                            pa.paymentId === payment.paymentId && 
                                                                            pa.invoiceId === invoice.invoiceId
                                                                          )
                                                                          
                                                                          return (
                                                                            <motion.tr
                                                                              key={`${invoice.invoiceNo}-${iidx}`}
                                                                              initial={{ opacity: 0, x: -8 }}
                                                                              animate={{ 
                                                                                opacity: 1, 
                                                                                x: 0,
                                                                                transition: {
                                                                                  delay: iidx * 0.02,
                                                                                  duration: 0.15,
                                                                                  ease: "easeOut"
                                                                                }
                                                                              }}
                                                                              className="border-b border-border last:border-0"
                                                                            >
                                                                              <TableCell className="text-xs font-mono">{invoice.invoiceNo}</TableCell>
                                                                              <TableCell className="text-xs">{invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString('en-IN') : '-'}</TableCell>
                                                                              <TableCell className="text-xs text-right font-mono">
                                                                                {allocation ? formatCurrency(allocation.allocatedAmount) : '-'}
                                                                              </TableCell>
                                                                              <TableCell className="text-xs text-right font-mono">{formatCurrency(invoice.expectedAmount)}</TableCell>
                                                                              <TableCell className="text-xs text-right font-mono text-success">{formatCurrency(invoice.receivedAmount)}</TableCell>
                                                                              <TableCell className="text-xs text-right font-mono text-warning">{formatCurrency(invoice.pendingAmount)}</TableCell>
                                                                            </motion.tr>
                                                                          )
                                                                        })}
                                                                    </TableBody>
                                                                  </Table>
                                                                </div>
                                                              </div>
                                                            </motion.div>
                                                          </TableCell>
                                                        </TableRow>
                                                      )}
                                                    </AnimatePresence>
                                                  </>
                                                )
                                              })}
                                            </TableBody>
                                          </Table>
                                        </div>
                                      </>
                                    ) : (
                                      <>
                                        <div className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
                                          Individual Invoices ({group.invoiceCount})
                                        </div>
                                        <div className="bg-card rounded-lg border overflow-hidden">
                                          <Table>
                                            <TableHeader>
                                              <TableRow>
                                                <TableHead className="text-xs">Invoice No</TableHead>
                                                <TableHead className="text-xs">Invoice Date</TableHead>
                                                <TableHead className="text-xs text-right">Qty</TableHead>
                                                <TableHead className="text-xs text-right">Expected</TableHead>
                                                <TableHead className="text-xs text-right">Received</TableHead>
                                                <TableHead className="text-xs text-right">Pending</TableHead>
                                                <TableHead className="text-xs">Status</TableHead>
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {group.invoiceDetails
                                                .sort((a, b) => new Date(a.earnedDate).getTime() - new Date(b.earnedDate).getTime())
                                                .map((invoice, idx) => {
                                                  const displayQty = invoice.eligibleQuantityMT
                                                  const unit = invoice.unit || 'MT'
                                                  
                                                  return (
                                                    <motion.tr
                                                      key={`${invoice.invoiceNo}-${idx}`}
                                                      initial={{ opacity: 0, x: -10 }}
                                                      animate={{ 
                                                        opacity: 1, 
                                                        x: 0,
                                                        transition: {
                                                          delay: idx * 0.03,
                                                          duration: 0.2,
                                                          ease: "easeOut"
                                                        }
                                                      }}
                                                      className="border-b border-border last:border-0"
                                                    >
                                                      <TableCell className="text-sm font-mono">{invoice.invoiceNo}</TableCell>
                                                      <TableCell className="text-sm">{invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString('en-IN') : '-'}</TableCell>
                                                      <TableCell className="text-sm text-right font-mono">{displayQty.toLocaleString('en-IN', { maximumFractionDigits: 3 })} {unit}</TableCell>
                                                      <TableCell className="text-sm text-right font-mono">{formatCurrency(invoice.expectedAmount)}</TableCell>
                                                      <TableCell className="text-sm text-right font-mono text-success">{formatCurrency(invoice.receivedAmount)}</TableCell>
                                                      <TableCell className="text-sm text-right font-mono text-warning">{formatCurrency(invoice.pendingAmount)}</TableCell>
                                                      <TableCell className="text-sm">
                                                        {invoice.status === 'Pending' && <Badge variant="outline" className="text-xs border-warning text-warning">Pending</Badge>}
                                                        {invoice.status === 'Partially Received' && <Badge className="text-xs bg-warning text-warning-foreground">Partial</Badge>}
                                                        {invoice.status === 'Received' && <Badge className="text-xs bg-success text-success-foreground">Received</Badge>}
                                                      </TableCell>
                                                    </motion.tr>
                                                  )
                                                })}
                                            </TableBody>
                                          </Table>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </motion.div>
                              </TableCell>
                            </TableRow>
                          )}
                        </AnimatePresence>
                      </>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Received Discounts</h3>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground">Show:</Label>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="filter-received-other"
                  checked={receivedTypeFilter.has('wallet')}
                  onCheckedChange={(checked) => {
                    setReceivedTypeFilter(prev => {
                      const newSet = new Set(prev)
                      if (checked) {
                        newSet.add('wallet')
                      } else {
                        newSet.delete('wallet')
                      }
                      return newSet
                    })
                  }}
                />
                <label
                  htmlFor="filter-received-other"
                  className="text-sm font-medium leading-none cursor-pointer"
                >
                  Other
                </label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="filter-received-annual"
                  checked={receivedTypeFilter.has('annual')}
                  onCheckedChange={(checked) => {
                    setReceivedTypeFilter(prev => {
                      const newSet = new Set(prev)
                      if (checked) {
                        newSet.add('annual')
                      } else {
                        newSet.delete('annual')
                      }
                      return newSet
                    })
                  }}
                />
                <label
                  htmlFor="filter-received-annual"
                  className="text-sm font-medium leading-none cursor-pointer"
                >
                  Annual
                </label>
              </div>
            </div>
            <Badge variant="secondary" className="text-xs font-mono">
              {filteredReceived.length} of {allReceivedDiscounts.length}
            </Badge>
          </div>
        </div>
        {filteredReceived.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-8">
              <TrendUp size={40} className="text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-center text-sm">
                No discounts received yet. Record your first discount receipt.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Discount Received Date</TableHead>
                    <TableHead>Allocate Type</TableHead>
                    <TableHead>Allocated To</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="text-right">Total Amount</TableHead>
                    <TableHead className="text-right">Allocated</TableHead>
                    <TableHead className="text-right">Advance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[120px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReceived
                    .sort((a, b) => new Date(b.discountReceivedDate).getTime() - new Date(a.discountReceivedDate).getTime())
                    .map(rd => {
                      const supplier = supplierMap.get(rd.supplierId)
                      const status = combinedReceivedStatus.get(rd.id)
                      
                      const allocationsForRd = rd.type === 'annual' 
                        ? annualAllocations.filter(a => a.receivedDiscountId === rd.id)
                        : discountAllocations.filter(a => a.receivedDiscountId === rd.id)
                      
                      const totalAllocated = status?.allocated || 0
                      const allocatedAmt = totalAllocated
                      const advanceAmt = Math.max(0, rd.amount - totalAllocated)
                      
                      const allocatedToLabel = rd.allocateToSchemeName 
                        ? rd.allocateToSchemeName 
                        : rd.allocateToDiscountType 
                          ? (rd.allocateToDiscountType === 'paymentCD' || rd.allocateToDiscountType === 'advanceCD' ? 'Payment CD' : 
                             rd.allocateToDiscountType === 'invoiceCloseCD' ? 'Invoice Close CD' : 
                             'Fixed Scheme')
                          : 'All'
                      
                      const allExpected = rd.type === 'annual' ? expectedAnnual : expectedDiscounts
                      const schemeBreakdown = new Map<string, { amount: number; count: number }>()
                      
                      allocationsForRd.forEach(alloc => {
                        if (rd.type === 'annual') {
                          const expectedDisc = expectedAnnual.find(e => e.id === alloc.expectedDiscountId)
                          if (expectedDisc && filteredExpectedIds.has(alloc.expectedDiscountId)) {
                            const schemeName = 'Annual Discount'
                            const existing = schemeBreakdown.get(schemeName) || { amount: 0, count: 0 }
                            schemeBreakdown.set(schemeName, {
                              amount: existing.amount + alloc.allocatedAmount,
                              count: existing.count + 1
                            })
                          }
                        } else {
                          const expectedDisc = expectedDiscounts.find(e => e.id === alloc.expectedDiscountId)
                          if (expectedDisc && filteredExpectedIds.has(alloc.expectedDiscountId)) {
                            const schemeName = expectedDisc.schemeName || 
                                             (expectedDisc.type === 'paymentCD' || expectedDisc.type === 'advanceCD' ? 'Payment CD' : 
                                              expectedDisc.type === 'invoiceCloseCD' ? 'Invoice Close CD' : 
                                              'Other')
                            const existing = schemeBreakdown.get(schemeName) || { amount: 0, count: 0 }
                            schemeBreakdown.set(schemeName, {
                              amount: existing.amount + alloc.allocatedAmount,
                              count: existing.count + 1
                            })
                          }
                        }
                      })
                      
                      const isExpanded = expandedReceivedRows.has(rd.id)
                      const hasAllocations = schemeBreakdown.size > 0
                      
                      return (
                        <>
                          <TableRow key={rd.id} className={cn(isExpanded && "border-b-0")}>
                            <TableCell>
                              {hasAllocations && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={() => toggleReceivedRow(rd.id)}
                                >
                                  <motion.div
                                    animate={{ rotate: isExpanded ? 90 : 0 }}
                                    transition={{ duration: 0.2 }}
                                  >
                                    <CaretRight className="h-4 w-4" />
                                  </motion.div>
                                </Button>
                              )}
                            </TableCell>
                            <TableCell>{supplier?.name || 'Unknown'}</TableCell>
                            <TableCell>{new Date(rd.discountReceivedDate).toLocaleDateString('en-IN')}</TableCell>
                            <TableCell>
                              <Badge 
                                variant={rd.type === 'annual' ? 'default' : 'secondary'}
                                className={rd.type === 'annual' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}
                              >
                                {rd.type === 'annual' ? 'Annual' : 'Other'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm font-medium">{allocatedToLabel}</span>
                            </TableCell>
                            <TableCell className="max-w-xs truncate text-muted-foreground text-sm">{rd.notes || '-'}</TableCell>
                            <TableCell className="text-right font-mono font-semibold">{formatCurrency(rd.amount)}</TableCell>
                            <TableCell className="text-right font-mono text-success">{formatCurrency(allocatedAmt)}</TableCell>
                            <TableCell className="text-right font-mono text-accent">{formatCurrency(advanceAmt)}</TableCell>
                            <TableCell>
                              {Math.abs(totalAllocated - rd.amount) < 0.01 || totalAllocated >= rd.amount ? (
                                <Badge className="bg-success text-success-foreground">Allocated</Badge>
                              ) : totalAllocated > 0 ? (
                                <Badge className="bg-warning text-warning-foreground">Partial</Badge>
                              ) : (
                                <Badge variant="secondary" className="bg-accent/10 text-accent border-accent/20">Advance</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {!isLocked && (
                                <div className="flex items-center gap-1">
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => handleEdit(rd)}
                                    title="Edit"
                                  >
                                    <Pencil size={16} className="text-primary" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => handleDelete(rd.id)}
                                    title="Delete"
                                  >
                                    <Trash size={16} className="text-destructive" />
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                          <AnimatePresence>
                            {isExpanded && hasAllocations && (
                              <TableRow key={`${rd.id}-breakdown`}>
                                <TableCell colSpan={11} className="p-0 bg-muted/30">
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ 
                                      height: "auto", 
                                      opacity: 1,
                                      transition: {
                                        height: { 
                                          type: "spring",
                                          stiffness: 300,
                                          damping: 30
                                        },
                                        opacity: { duration: 0.2 }
                                      }
                                    }}
                                    exit={{ 
                                      height: 0, 
                                      opacity: 0,
                                      transition: {
                                        height: { 
                                          type: "spring",
                                          stiffness: 350,
                                          damping: 28
                                        },
                                        opacity: { duration: 0.15 }
                                      }
                                    }}
                                    className="overflow-hidden"
                                  >
                                    <div className="p-4 space-y-3">
                                      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                        <div className="h-px flex-1 bg-border"></div>
                                        <span>Allocation Breakdown by Scheme</span>
                                        <div className="h-px flex-1 bg-border"></div>
                                      </div>
                                      <div className="bg-card rounded-lg border border-border overflow-hidden">
                                        <Table>
                                          <TableHeader>
                                            <TableRow className="bg-muted/50">
                                              <TableHead className="text-xs">Scheme Name</TableHead>
                                              <TableHead className="text-xs text-right">Invoices</TableHead>
                                              <TableHead className="text-xs text-right">Amount Allocated</TableHead>
                                              <TableHead className="text-xs text-right">% of Total</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {Array.from(schemeBreakdown.entries())
                                              .sort((a, b) => b[1].amount - a[1].amount)
                                              .map(([schemeName, data], idx) => {
                                                const percentage = (data.amount / allocatedAmt) * 100
                                                return (
                                                  <motion.tr
                                                    key={schemeName}
                                                    initial={{ opacity: 0, x: -10 }}
                                                    animate={{ 
                                                      opacity: 1, 
                                                      x: 0,
                                                      transition: {
                                                        delay: idx * 0.05,
                                                        duration: 0.2
                                                      }
                                                    }}
                                                    className="border-b border-border last:border-0"
                                                  >
                                                    <TableCell className="font-medium text-sm">
                                                      {schemeName}
                                                    </TableCell>
                                                    <TableCell className="text-right text-sm font-mono text-muted-foreground">
                                                      {data.count}
                                                    </TableCell>
                                                    <TableCell className="text-right text-sm font-mono font-semibold text-success">
                                                      {formatCurrency(data.amount)}
                                                    </TableCell>
                                                    <TableCell className="text-right text-sm">
                                                      <div className="flex items-center justify-end gap-2">
                                                        <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                                          <motion.div
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${percentage}%` }}
                                                            transition={{ delay: idx * 0.05 + 0.1, duration: 0.5 }}
                                                            className="h-full bg-success"
                                                          />
                                                        </div>
                                                        <span className="font-mono text-xs text-muted-foreground min-w-[3rem]">
                                                          {percentage.toFixed(1)}%
                                                        </span>
                                                      </div>
                                                    </TableCell>
                                                  </motion.tr>
                                                )
                                              })}
                                          </TableBody>
                                        </Table>
                                      </div>
                                    </div>
                                  </motion.div>
                                </TableCell>
                              </TableRow>
                            )}
                          </AnimatePresence>
                        </>
                      )
                    })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Transfer to Ledger Dialog */}
      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Wallet className="h-5 w-5 text-primary" />
              Transfer CD Pool to Ledger
            </DialogTitle>
            <DialogDescription>
              Issue a Debit Note to adjust the claimable discount balance directly into {currentSupplierObj?.name || 'the supplier'}'s ledger.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
              <div className="text-xs text-muted-foreground">Available Claimable Pool Balance</div>
              <div className="text-xl font-mono font-bold text-primary">
                {formatCurrency(claimablePoolBalance)}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Transfer Amount (₹) *</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-5 text-[11px] px-1.5 text-primary font-mono"
                  onClick={() => setTransferAmount(String(claimablePoolBalance))}
                >
                  Transfer Full ({formatCurrency(claimablePoolBalance)})
                </Button>
              </div>
              <Input
                type="number"
                step="0.01"
                placeholder="Enter amount to transfer"
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Transfer Date *</Label>
              <Input
                type="date"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Action / Note Type</Label>
              <Select value={transferNoteType} onValueChange={(val: any) => setTransferNoteType(val)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="debit_note">Supplier Debit Note (Adjust Payable)</SelectItem>
                  <SelectItem value="credit_note">Credit Note Adjustment</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Reference / Ref No.</Label>
              <Input
                placeholder="e.g. CD-CLAIM-2026-001"
                value={transferRef}
                onChange={(e) => setTransferRef(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Remarks / Notes</Label>
              <Textarea
                rows={2}
                placeholder="Transfer notes or details"
                value={transferRemarks}
                onChange={(e) => setTransferRemarks(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleExecuteTransfer}>
              Confirm Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer History Dialog */}
      <Dialog open={transferHistoryOpen} onOpenChange={setTransferHistoryOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Clock className="h-5 w-5 text-primary" />
              CD Pool Ledger Transfer History
            </DialogTitle>
            <DialogDescription>
              Audit log of all claimable discount pool amounts transferred to {currentSupplierObj?.name || 'supplier'}'s ledger.
            </DialogDescription>
          </DialogHeader>

          {supplierTransfers.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm border rounded-lg border-dashed">
              No ledger transfers recorded for this supplier yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Transferred Amount</TableHead>
                  <TableHead>Note Type / Ref</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead>Transferred By</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supplierTransfers.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs">{t.date}</TableCell>
                    <TableCell className="text-right font-mono font-bold text-primary">
                      {formatCurrency(t.amount)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <Badge variant="outline" className="w-fit text-[10px] uppercase">
                          {t.noteType === 'debit_note' ? 'Debit Note' : 'Credit Note'}
                        </Badge>
                        <span className="text-xs font-mono text-muted-foreground mt-0.5">{t.reference}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">{t.remarks || '-'}</TableCell>
                    <TableCell className="text-xs">
                      {t.createdBy || 'System'}
                      {t.createdByRole === 'master_admin' && <Badge variant="secondary" className="ml-1 text-[9px] px-1 py-0">Master</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteTransfer(t)}
                        title="Revert Transfer Entry"
                        disabled={isLocked}
                      >
                        <Trash size={14} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferHistoryOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
