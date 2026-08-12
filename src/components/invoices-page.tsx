import { getChangedByLabel } from '@/lib/security-utils'
import { useState, useMemo } from 'react'
import { PurchaseInvoice, Supplier, Item, InvoiceItem, Payment, SalesInvoice, PurchaseReturn, SalesReturn, FixedScheme, ReceivedDiscount, ExpenseEntry, ExpenseType, MTBooking } from '@/lib/types'
import { calculateItemStockMap } from '@/lib/report-calculations'
import { normalizeLineItem, getItemConversionFactor, getInvoiceQtyForUnit } from '@/lib/unit-conversion-service'
import { Counter, CashBankTransaction } from '@/lib/cash-bank-types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowLeft, CaretLeft, Plus, Receipt, Trash, X, Info, PencilSimple, FunnelSimple, Warning, DownloadSimple, MagnifyingGlass, Barcode, Package, UserPlus, GearSix, Keyboard, UploadSimple, FileText, Wallet, TrendUp, SlidersHorizontal, Scales } from '@phosphor-icons/react'
import { formatCurrency, formatMT, getFYMonths, getFYFromDate, calculatePaymentAllocations, calculateRateWithGst, calculateBasicRateFromInclusive, calculateRoundOffAdjustment, calculateInvoiceFinalAmount, calculateCostBreakdownDetails, calculateInvoiceItemsTotals, calculateAdditionalChargesTotals } from '@/lib/calculations'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { InvoicePreviewDialog } from '@/components/invoice-preview-dialog'
import PurchaseInvoiceDetailsPage from '@/components/purchase-invoice-details-page'
import { exportPurchaseInvoicePDF } from '@/lib/pdf-export'
import { PartyEditorDialog } from '@/components/party-editor-dialog'
import { ItemEditorDialog } from '@/components/item-editor-dialog'

import { deleteInvoice, deletePayment, saveInvoice, savePayment } from '@/lib/firebase-storage'
import { ThreeDotDropdown } from '@/components/ui/three-dot-dropdown'

interface InvoicesPageProps {
  invoices: PurchaseInvoice[]
  setInvoices: (updater: (prev: PurchaseInvoice[]) => PurchaseInvoice[]) => void
  salesInvoices?: SalesInvoice[]
  purchaseReturns?: PurchaseReturn[]
  salesReturns?: SalesReturn[]
  suppliers: Supplier[]
  setSuppliers: (updater: (prev: Supplier[]) => Supplier[]) => void
  payments: Payment[]
  setPayments: (updater: (prev: Payment[]) => Payment[]) => void
  items: Item[]
  setItems: (updater: (prev: Item[]) => Item[]) => void
  currentFY: string
  isLocked?: boolean
  gstPercentage?: number
  counters: Counter[]
  transactions: CashBankTransaction[]
  onUpdateCashBank: (counters: Counter[], transactions: CashBankTransaction[]) => void
  onNavigateToInvoiceDetails?: (invoiceNo: string) => void
  fixedSchemes?: FixedScheme[]
  mtBookings?: MTBooking[]
  receivedDiscounts?: ReceivedDiscount[]
  expenseEntries?: ExpenseEntry[]
  expenseTypes?: ExpenseType[]
  activeCompanyId?: string
}

const DEFAULT_INVOICE_TERMS = '1. Goods once sold will not be taken back or exchanged\n2. All disputes are subject to [ENTER_YOUR_CITY_NAME] jurisdiction only'

import { PeriodDateFilter, PeriodFilterState, defaultPeriodFilterState, isRecordInPeriod } from '@/components/period-date-filter'

export default function InvoicesPage({
  invoices,
  setInvoices,
  salesInvoices = [],
  purchaseReturns = [],
  salesReturns = [],
  suppliers,
  setSuppliers,
  payments,
  setPayments,
  items,
  setItems,
  currentFY,
  isLocked = false,
  gstPercentage = 18,
  counters,
  transactions,
  onUpdateCashBank,
  onNavigateToInvoiceDetails,
  fixedSchemes = [],
  mtBookings = [],
  receivedDiscounts = [],
  expenseEntries = [],
  expenseTypes = [],
  activeCompanyId
}: InvoicesPageProps) {
  const stockMap = useMemo(() => {
    return calculateItemStockMap(items, invoices, salesInvoices, purchaseReturns, salesReturns)
  }, [items, invoices, salesInvoices, purchaseReturns, salesReturns])
  const [open, setOpen] = useState(false)
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([])
  const [editingInvoice, setEditingInvoice] = useState<PurchaseInvoice | null>(null)
  const [previewInvoice, setPreviewInvoice] = useState<PurchaseInvoice | null>(null)
  const [detailsInvoice, setDetailsInvoice] = useState<PurchaseInvoice | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [invoiceToDelete, setInvoiceToDelete] = useState<PurchaseInvoice | null>(null)
  const [periodFilter, setPeriodFilter] = useState<PeriodFilterState>(defaultPeriodFilterState)
  const [selectedSupplier, setSelectedSupplier] = useState<string>('all')
  type AdditionalCharge = { id: string; remarks: string; basicRate: number; taxMode: 'none' | 'gst'; gstRate: number; finalAmt: number };
  const [additionalCharges, setAdditionalCharges] = useState<AdditionalCharge[]>([])

  const additionalCostBasicRate = additionalCharges.reduce((sum, c) => sum + (c.basicRate || 0), 0)
  const additionalCostFinal = additionalCharges.reduce((sum, c) => sum + (c.finalAmt || 0), 0)
  const [roundOffAdjustment, setRoundOffAdjustment] = useState<number>(0)
  const [amountPaid, setAmountPaid] = useState('')
  const [selectedCounterId, setSelectedCounterId] = useState('')
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false)
  const [supplierSearch, setSupplierSearch] = useState('')
  const [showQuickSupplier, setShowQuickSupplier] = useState(false)
  const [showQuickItem, setShowQuickItem] = useState(false)
  const [itemPickerOpen, setItemPickerOpen] = useState(false)
  const [itemSearch, setItemSearch] = useState('')
  const [selectedItemCategory, setSelectedItemCategory] = useState('all')
  const [selectedPickerItemId, setSelectedPickerItemId] = useState('')
  const [pickerQuantities, setPickerQuantities] = useState<Record<string, number>>({})
  const [pickerUnits, setPickerUnits] = useState<Record<string, string>>({})
  const [showAdditionalCharge, setShowAdditionalCharge] = useState(false)
  const [showInvoiceNotes, setShowInvoiceNotes] = useState(false)
  const [invoiceNotes, setInvoiceNotes] = useState('')
  const [showInvoiceTerms, setShowInvoiceTerms] = useState(false)
  const [invoiceTerms, setInvoiceTerms] = useState('')

  // Item-wise cost breakdown with Base Unit in KG calculation
  const costBreakdownDetails = useMemo(() => {
    return calculateCostBreakdownDetails(invoiceItems, items, additionalCostFinal)
  }, [invoiceItems, items, additionalCostFinal])

  const filteredInvoices = useMemo(() => {
    let result = invoices.filter(inv => isRecordInPeriod(inv.invoiceDate, inv.fy, periodFilter, currentFY))
    if (selectedSupplier !== 'all') {
      result = result.filter(inv => inv.supplierId === selectedSupplier)
    }
    return result
  }, [invoices, periodFilter, currentFY, selectedSupplier])

  const totalMT = filteredInvoices.reduce((sum, inv) => sum + getInvoiceQtyForUnit(inv, 'MT', items), 0)
  const totalAmount = filteredInvoices.reduce((sum, inv) => sum + inv.invoiceAmount, 0)

  const getInvoicePaymentId = (invoiceId: string) => `purchase-invoice-payment-${invoiceId}`

  const syncInvoicePayment = (invoiceId: string, supplierId: string, invoiceNo: string, invoiceDate: string, rawAmount: number, counterId: string) => {
    const paidAmount = Math.max(0, rawAmount || 0)
    const paymentId = getInvoicePaymentId(invoiceId)
    const selectedCounter = counters.find(c => c.id === counterId)
    const oldPayment = payments.find(p => p.id === paymentId)

    const payment: Payment = {
      id: paymentId,
      supplierId,
      paymentDate: invoiceDate,
      amount: paidAmount,
      counterId: counterId,
      counterName: selectedCounter?.name || 'Unknown',
      isAdvance: false,
      doNotApplyCD: false,
      fy: currentFY,
      createdAt: Date.now()
    }

    if (activeCompanyId) {
      if (paidAmount <= 0) {
        void deletePayment(activeCompanyId, paymentId)
      } else {
        void savePayment(activeCompanyId, payment)
      }
    }

    setPayments((prev) => {
      if (paidAmount <= 0) {
        return prev.filter((payment) => payment.id !== paymentId)
      }

      const exists = prev.some((candidate) => candidate.id === paymentId)
      if (!exists) return [...prev, payment]

      return prev.map((candidate) => (
        candidate.id === paymentId
          ? {
            ...candidate,
            ...payment,
            createdAt: candidate.createdAt || payment.createdAt
          }
          : candidate
      ))
    })

    let newCounters = [...counters]
    let newTransactions = [...transactions]
    const txnId = `txn-sp-${paymentId}`

    if (paidAmount <= 0) {
      if (oldPayment?.counterId) {
        newCounters = newCounters.map(c => c.id === oldPayment.counterId ? { ...c, currentBalance: c.currentBalance + oldPayment.amount } : c)
      }
      newTransactions = newTransactions.filter(t => t.id !== txnId)
    } else {
      if (oldPayment?.counterId) {
        newCounters = newCounters.map(c => c.id === oldPayment.counterId ? { ...c, currentBalance: c.currentBalance + oldPayment.amount } : c)
      }
      if (counterId) {
        newCounters = newCounters.map(c => c.id === counterId ? { ...c, currentBalance: c.currentBalance - paidAmount } : c)
      }

      const supplierName = suppliers.find(s => s.id === supplierId)?.name || 'Unknown'

      const existingTxn = newTransactions.find(t => t.id === txnId)
      if (existingTxn) {
        newTransactions = newTransactions.map(t => t.id === txnId ? {
          ...t,
          date: invoiceDate,
          counterId: counterId,
          counterName: selectedCounter?.name || 'Unknown',
          amount: paidAmount,
          narration: `Supplier Payment for Invoice ${invoiceNo}: ${supplierName}`.trim()
        } : t)
      } else {
        newTransactions.push({
          id: txnId,
          date: invoiceDate,
          counterId: counterId,
          counterName: selectedCounter?.name || 'Unknown',
          type: 'Out',
          amount: paidAmount,
          narration: `Supplier Payment for Invoice ${invoiceNo}: ${supplierName}`.trim()
        })
      }
    }

    onUpdateCashBank(newCounters, newTransactions)

    if (paidAmount > 0) {
      toast.success(`Payment linked to invoice ${invoiceNo}`)
    }
  }

  const getInvoiceItemGstRate = (itemId: string) => {
    const item = items.find((candidate) => candidate.id === itemId)
    return typeof item?.gstRate === 'number' && !Number.isNaN(item.gstRate)
      ? item.gstRate
      : gstPercentage
  }

  const calculateRateWithItemGst = (basicRate: number, itemId: string) => (
    calculateRateWithGst(basicRate, getInvoiceItemGstRate(itemId))
  )

  const updatePickerQuantity = (itemId: string, nextQuantity: number | null) => {
    setPickerQuantities((prev) => {
      const updated = { ...prev }
      if (nextQuantity === null) {
        delete updated[itemId]
      } else {
        const quantity = Math.max(0, Number.isFinite(nextQuantity) ? nextQuantity : 0)
        updated[itemId] = quantity
      }
      return updated
    })
  }

  const updatePickerUnit = (itemId: string, unit: string) => {
    setPickerUnits((prev) => ({ ...prev, [itemId]: unit }))
  }

  const resetItemPicker = () => {
    setSelectedPickerItemId('')
    setItemSearch('')
    setSelectedItemCategory('all')
    setPickerQuantities({})
    setPickerUnits({})
  }

  const addInvoiceItemWithItem = (itemId: string, rawQuantity = 0, chosenUnit?: string) => {
    const item = items.find((candidate) => candidate.id === itemId)
    const basicRate = item?.purchasePrice || 0
    const rate = calculateRateWithItemGst(basicRate, itemId)
    const defaultEntryUnit = item?.unit || 'KG'
    const activeUnit = chosenUnit || defaultEntryUnit

    const norm = normalizeLineItem(item, rawQuantity, activeUnit, rate)
    const enteredQuantity = rawQuantity

    setInvoiceItems(prev => {
      const existingIndex = prev.findIndex(existing => existing.itemId === itemId)

      if (existingIndex !== -1) {
        // Item already exists, merge quantities
        const updated = [...prev]
        const existing = updated[existingIndex]
        const newEnteredQuantity = (existing.enteredQuantity || (existing as any).entryQuantity || 0) + enteredQuantity
        const newNorm = normalizeLineItem(item, newEnteredQuantity, activeUnit, existing.rate)

        updated[existingIndex] = {
          ...existing,
          enteredQuantity: newEnteredQuantity,
          enteredUnit: activeUnit,
          baseQuantity: newNorm.baseQuantity,
          baseRate: newNorm.baseRate,
          amount: parseFloat((newNorm.baseAmount).toFixed(2))
        }
        return updated
      }

      // If it doesn't exist, create a new row or fill an empty one
      const row: InvoiceItem = {
        itemId,
        enteredQuantity,
        enteredUnit: activeUnit,
        baseQuantity: norm.baseQuantity,
        basicRate,
        rate,
        amount: parseFloat((norm.baseAmount).toFixed(2)),
        baseRate: norm.baseRate,
        enteredRate: rate
      }

      const emptyIndex = prev.findIndex(existing => !existing.itemId)
      if (emptyIndex === -1) return [...prev, row]
      return prev.map((existing, index) => index === emptyIndex ? row : existing)
    })
  }

  const handleAddSelectedItemToBill = () => {
    const selectedEntries = Object.entries(pickerQuantities).filter(([, quantity]) => quantity > 0)
    if (selectedEntries.length === 0) {
      toast.error('Please add quantity for an item first')
      return
    }

    selectedEntries.forEach(([itemId, rawQty]) => {
      const chosenUnit = pickerUnits[itemId]
      addInvoiceItemWithItem(itemId, rawQty, chosenUnit)
    })
    setItemPickerOpen(false)
    resetItemPicker()
  }

  const updateInvoiceItem = (index: number, field: string, value: string | number) => {
    setInvoiceItems(prev => {
      const updated = [...prev]
      const itemRow = { ...updated[index] }
      const selectedItemDef = items.find(i => i.id === itemRow.itemId)

      if (field === 'itemId') {
        const newItemId = value as string
        const selectedDef = items.find(i => i.id === newItemId)
        const defaultUnit = selectedDef?.unit || 'KG'

        const existingIndex = prev.findIndex((r, i) => r.itemId === newItemId && i !== index)

        if (existingIndex !== -1) {
          // Merge into existing row
          const existing = { ...updated[existingIndex] }
          const combinedEnteredQty = (existing.enteredQuantity || (existing as any).entryQuantity || 0) + (itemRow.enteredQuantity || (itemRow as any).entryQuantity || 0)
          const normCombined = normalizeLineItem(selectedDef, combinedEnteredQty, existing.enteredUnit || (existing as any).entryUnit || defaultUnit, existing.rate)
          existing.enteredQuantity = combinedEnteredQty
          existing.enteredUnit = existing.enteredUnit || (existing as any).entryUnit || defaultUnit
          existing.baseQuantity = normCombined.baseQuantity
          existing.amount = parseFloat((normCombined.baseAmount).toFixed(2))
          updated[existingIndex] = existing

          // Clear current row
          itemRow.itemId = ''
          itemRow.enteredQuantity = 0
          itemRow.baseQuantity = 0
          itemRow.basicRate = 0
          itemRow.rate = 0
          itemRow.amount = 0
          itemRow.enteredUnit = defaultUnit
        } else {
          itemRow.itemId = newItemId
          const basicRate = itemRow.basicRate && itemRow.basicRate > 0 ? itemRow.basicRate : selectedDef?.purchasePrice || 0
          itemRow.basicRate = basicRate
          itemRow.rate = calculateRateWithItemGst(basicRate, itemRow.itemId)
          itemRow.enteredUnit = defaultUnit
        }
      } else if (field === 'enteredUnit' || field === 'entryUnit') {
        itemRow.enteredUnit = value as string
      } else if (field === 'enteredQuantity' || field === 'entryQuantity') {
        const numVal = parseFloat(value as string) || 0
        itemRow.enteredQuantity = numVal
      } else if (field === 'weightKG') {
        const valStr = value as string
        const numVal = valStr !== '' ? parseFloat(valStr) : undefined
        itemRow.weightKG = numVal !== undefined && !isNaN(numVal) ? numVal : undefined
      } else if (field === 'basicRate') {
        const basicRate = parseFloat(value as string) || 0
        const itemGstPct = getInvoiceItemGstRate(itemRow.itemId)
        itemRow.basicRate = basicRate
        itemRow.rate = calculateRateWithGst(basicRate, itemGstPct)
      } else if (field === 'rate') {
        const rateWithTax = parseFloat(value as string) || 0
        const itemGstPct = getInvoiceItemGstRate(itemRow.itemId)
        itemRow.rate = rateWithTax
        itemRow.basicRate = calculateBasicRateFromInclusive(rateWithTax, itemGstPct)
      }

      const currentEnteredQty = itemRow.enteredQuantity !== undefined && itemRow.enteredQuantity !== null ? itemRow.enteredQuantity : ((itemRow as any).entryQuantity || 0)
      const currentUnit = itemRow.enteredUnit || (itemRow as any).entryUnit || selectedItemDef?.unit || 'KG'
      const currentRate = itemRow.rate || 0

      const norm = normalizeLineItem(selectedItemDef, currentEnteredQty, currentUnit, currentRate)
      itemRow.enteredQuantity = currentEnteredQty
      itemRow.enteredUnit = currentUnit
      itemRow.baseQuantity = norm.baseQuantity
      itemRow.baseRate = norm.baseRate
      itemRow.enteredRate = currentRate
      itemRow.amount = parseFloat((norm.baseAmount).toFixed(2))

      updated[index] = itemRow
      return updated
    })
  }

  const removeInvoiceItem = (index: number) => {
    setInvoiceItems(prev => prev.filter((_, i) => i !== index))
  }

  const handleUpdateCharge = (id: string, field: keyof AdditionalCharge, value: any) => {
    setAdditionalCharges(prev => prev.map(c => {
      if (c.id !== id) return c;
      const updated = { ...c, [field]: value };

      if (field === 'basicRate' || field === 'taxMode' || field === 'gstRate') {
        const rate = field === 'basicRate' ? parseFloat(value) || 0 : updated.basicRate;
        const mode = field === 'taxMode' ? value : updated.taxMode;
        const gRate = field === 'gstRate' ? parseFloat(value) || 0 : updated.gstRate;

        updated.finalAmt = mode === 'gst' ? calculateRateWithGst(rate, gRate) : rate;
        if (field === 'basicRate') updated.basicRate = rate;
        if (field === 'gstRate') updated.gstRate = gRate;
      }
      return updated;
    }));
  }

  const addAnotherCharge = () => {
    setAdditionalCharges(prev => [...prev, {
      id: Math.random().toString(36).substring(7),
      remarks: '',
      basicRate: 0,
      taxMode: 'none',
      gstRate: gstPercentage,
      finalAmt: 0
    }]);
  }

  const removeCharge = (id: string) => {
    setAdditionalCharges(prev => {
      const next = prev.filter(c => c.id !== id);
      if (next.length === 0) setShowAdditionalCharge(false);
      return next;
    });
  }

  const handleRoundOff = () => {
    const { totalAmount: totalAmt } = calculateInvoiceItemsTotals(invoiceItems)
    const { adjustment } = calculateRoundOffAdjustment(totalAmt, additionalCostFinal)
    setRoundOffAdjustment(adjustment)
    toast.success(`Round-off adjustment: ${adjustment >= 0 ? '+' : ''}${formatCurrency(adjustment)}`)
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (isLocked) {
      toast.error('Cannot save in locked mode', {
        description: 'Unlock the data in Settings to make changes'
      })
      return
    }

    const formData = new FormData(e.currentTarget)
    const supplierId = selectedSupplierId || (formData.get('supplierId') as string)
    const invoiceNo = formData.get('invoiceNo') as string
    const invoiceDate = formData.get('invoiceDate') as string

    if (!supplierId) {
      toast.error('Select or create a supplier before saving the invoice')
      return
    }

    const isDuplicate = invoices.some(inv =>
      inv.supplierId === supplierId &&
      inv.invoiceNo.trim().toLowerCase() === invoiceNo.trim().toLowerCase() &&
      inv.id !== editingInvoice?.id
    )

    if (isDuplicate) {
      const supplierName = suppliers.find(s => s.id === supplierId)?.name || 'this supplier'
      toast.error('Duplicate Invoice Number', {
        description: `Invoice number "${invoiceNo}" already exists for ${supplierName}. Please use a different invoice number.`,
        duration: 5000
      })
      return
    }


    if (invoiceItems.length === 0) {
      toast.error('Please add at least one item to the invoice')
      document.getElementById('purchase-invoice-items')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      return
    }

    for (let i = 0; i < invoiceItems.length; i++) {
      const item = invoiceItems[i]
      if (!item.itemId) {
        toast.error(`Row ${i + 1}: Please select an item`)
        document.getElementById('purchase-invoice-items')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
        return
      }
      if (!item.enteredQuantity || item.enteredQuantity <= 0) {
        toast.error(`Row ${i + 1}: Please enter a valid quantity greater than 0`)
        document.getElementById('purchase-invoice-items')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
        return
      }
      if (!item.rate || item.rate <= 0) {
        toast.error(`Row ${i + 1}: Please enter a valid rate greater than 0`)
        document.getElementById('purchase-invoice-items')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
        return
      }
    }

    const { totalQty, totalAmount: totalAmt } = calculateInvoiceItemsTotals(invoiceItems)
    const { basicRateTotal: additionalCostBasicRate, finalAmtTotal: additionalCost, remarksJoined: additionalCostRemarks } = calculateAdditionalChargesTotals(additionalCharges)
    const roundOffAdjustment = parseFloat(formData.get('roundOffAdjustment') as string) || 0
    const finalInvoiceAmount = calculateInvoiceFinalAmount(totalAmt, additionalCost, roundOffAdjustment)
    const amountValue = amountPaid || formData.get('amountPaid') as string
    const finalAmountPaid = Math.max(0, parseFloat(amountValue) || 0)
    const counterId = formData.get('counterId') as string

    if (finalAmountPaid > 0 && !counterId) {
      toast.error('Please select a payment account')
      return
    }

    const sanitizedItems: InvoiceItem[] = invoiceItems.map(item => {
      const itemDef = items.find(i => i.id === item.itemId)
      return {
        itemId: item.itemId,
        enteredQuantity: item.enteredQuantity,
        enteredUnit: item.enteredUnit,
        baseQuantity: item.baseQuantity,
        rate: item.rate,
        amount: item.amount,
        basicRate: item.basicRate,
        baseRate: item.baseRate,
        enteredRate: item.enteredRate,
        itemNameSnapshot: itemDef?.name,
        itemUnitSnapshot: itemDef?.unit
      }
    })

    if (editingInvoice) {
      const updated: PurchaseInvoice = {
        ...editingInvoice,
        supplierId: supplierId,
        invoiceNo: invoiceNo,
        invoiceDate: invoiceDate,
        items: sanitizedItems,
        invoiceAmount: finalInvoiceAmount,
        additionalCost: additionalCost,
        additionalCostBasicRate: additionalCostBasicRate || undefined,
        additionalCostRemarks: additionalCostRemarks || undefined,
        roundOffAdjustment: roundOffAdjustment || undefined,
        history: [
          ...(editingInvoice.history || []),
          {
            timestamp: new Date().toISOString(),
            action: 'updated',
            changedBy: getChangedByLabel(),
            changes: [
              ...(editingInvoice.invoiceAmount !== finalInvoiceAmount ? [{ field: 'Amount', from: String(editingInvoice.invoiceAmount), to: String(finalInvoiceAmount) }] : []),
              ...(editingInvoice.invoiceNo !== invoiceNo ? [{ field: 'Invoice No', from: editingInvoice.invoiceNo, to: invoiceNo }] : []),
              ...(editingInvoice.invoiceDate !== invoiceDate ? [{ field: 'Date', from: editingInvoice.invoiceDate, to: invoiceDate }] : []),
              ...(editingInvoice.supplierId !== supplierId ? [{ field: 'Supplier', from: suppliers.find(s => s.id === editingInvoice.supplierId)?.name || '-', to: suppliers.find(s => s.id === supplierId)?.name || '-' }] : [])
            ]
          }
        ]
      }
      setInvoices((prev) => prev.map(inv => inv.id === editingInvoice.id ? updated : inv))
      if (activeCompanyId) {
        void saveInvoice(activeCompanyId, updated)
      }
      syncInvoicePayment(editingInvoice.id, supplierId, invoiceNo, invoiceDate, finalAmountPaid, counterId)
      toast.success('Invoice updated successfully')
    } else {
      const invoiceId = `invoice-${Date.now()}`
      const invoice: PurchaseInvoice = {
        id: invoiceId,
        supplierId: supplierId,
        invoiceNo: invoiceNo,
        invoiceDate: invoiceDate,
        items: sanitizedItems,
        invoiceAmount: finalInvoiceAmount,
        additionalCost: additionalCost,
        additionalCostBasicRate: additionalCostBasicRate || undefined,
        additionalCostRemarks: additionalCostRemarks || undefined,
        roundOffAdjustment: roundOffAdjustment || undefined,
        fy: getFYFromDate(invoiceDate),
        createdAt: Date.now(),
        history: [
          {
            timestamp: new Date().toISOString(),
            action: 'created',
            changedBy: getChangedByLabel(),
            changes: [
              { field: 'Invoice No', from: '', to: invoiceNo },
              { field: 'Supplier', from: '', to: suppliers.find(s => s.id === supplierId)?.name || '-' },
              { field: 'Amount', from: '', to: String(finalInvoiceAmount) },
              { field: 'Date', from: '', to: invoiceDate }
            ]
          }
        ]
      }
      setInvoices((prev) => [...prev, invoice])
      if (activeCompanyId) {
        void saveInvoice(activeCompanyId, invoice)
      }
      syncInvoicePayment(invoiceId, supplierId, formData.get('invoiceNo') as string, formData.get('invoiceDate') as string, finalAmountPaid, counterId)
      toast.success('Invoice added successfully')
    }

    setOpen(false)
    setInvoiceItems([])
    setEditingInvoice(null)
    setSupplierPickerOpen(false)
    setSupplierSearch('')
    setAmountPaid('')
    setShowAdditionalCharge(false)
    setShowInvoiceNotes(false)
    setInvoiceNotes('')
    setShowInvoiceTerms(false)
    setInvoiceTerms('')
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (newOpen && !editingInvoice) {
      setSelectedSupplierId('')
      setSupplierPickerOpen(false)
      setSupplierSearch('')
      setShowQuickSupplier(false)
      setShowQuickItem(false)
      setItemPickerOpen(false)
      setItemSearch('')
      setSelectedItemCategory('all')
      setSelectedPickerItemId('')
      setPickerQuantities({})
      setInvoiceItems([])
      setRoundOffAdjustment(0)
      setAmountPaid('')
      setShowAdditionalCharge(false)
      setShowInvoiceNotes(false)
      setInvoiceNotes('')
      setShowInvoiceTerms(false)
      setInvoiceTerms('')

      setTimeout(() => {
        document.querySelector('.erp-invoice-body')?.scrollTo({ top: 0 })
        const invoiceDateInput = document.getElementById('invoiceDate') as HTMLInputElement
        if (invoiceDateInput) {
          invoiceDateInput.value = format(new Date(), 'yyyy-MM-dd')
        }
      }, 0)
    } else if (!newOpen) {
      setInvoiceItems([])
      setEditingInvoice(null)
      setSelectedSupplierId('')
      setSupplierPickerOpen(false)
      setSupplierSearch('')
      setShowQuickSupplier(false)
      setShowQuickItem(false)
      setItemPickerOpen(false)
      setItemSearch('')
      setSelectedItemCategory('all')
      setSelectedPickerItemId('')
      setPickerQuantities({})
      setRoundOffAdjustment(0)
      setAmountPaid('')
      setShowAdditionalCharge(false)
      setShowInvoiceNotes(false)
      setInvoiceNotes('')
      setShowInvoiceTerms(false)
      setInvoiceTerms('')
    }
  }

  const handleEdit = (invoice: PurchaseInvoice) => {
    if (isLocked) {
      toast.error('Cannot edit in locked mode', {
        description: 'Unlock the data in Settings to make changes'
      })
      return
    }
    setEditingInvoice(invoice)
    setSelectedSupplierId(invoice.supplierId)
    setSupplierPickerOpen(false)
    setSupplierSearch('')
    setInvoiceItems(invoice.items || [])
    const hasCost = Boolean(invoice.additionalCost || invoice.additionalCostBasicRate || invoice.additionalCostRemarks);
    setShowAdditionalCharge(hasCost);
    if (hasCost) {
      setAdditionalCharges([{
        id: Math.random().toString(36).substring(7),
        remarks: invoice.additionalCostRemarks || '',
        basicRate: invoice.additionalCostBasicRate || 0,
        taxMode: invoice.additionalCostBasicRate && invoice.additionalCost && invoice.additionalCost > invoice.additionalCostBasicRate ? 'gst' : 'none',
        gstRate: gstPercentage,
        finalAmt: invoice.additionalCost || 0
      }]);
    } else {
      setAdditionalCharges([]);
    }
    setRoundOffAdjustment(invoice.roundOffAdjustment || 0)
    const linkedPayment = payments.find((payment) => payment.id === getInvoicePaymentId(invoice.id))
    setAmountPaid(linkedPayment ? String(linkedPayment.amount) : '')
    setSelectedCounterId(linkedPayment?.counterId || '')
    setShowInvoiceNotes(false)
    setInvoiceNotes('')
    setShowInvoiceTerms(false)
    setInvoiceTerms('')
    setOpen(true)
  }

  const handleDeleteClick = (invoice: PurchaseInvoice) => {
    if (isLocked) {
      toast.error('Cannot delete in locked mode', {
        description: 'Unlock the data in Settings to make changes'
      })
      return
    }
    setInvoiceToDelete(invoice)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = () => {
    if (invoiceToDelete) {
      setInvoices((prev) => prev.filter(inv => inv.id !== invoiceToDelete.id))
      setPayments((prev) => prev.filter((payment) => payment.id !== getInvoicePaymentId(invoiceToDelete.id)))
      if (activeCompanyId) {
        void deleteInvoice(activeCompanyId, invoiceToDelete.id)
        void deletePayment(activeCompanyId, getInvoicePaymentId(invoiceToDelete.id))
      }
      toast.success('Invoice deleted successfully')
      setDeleteDialogOpen(false)
      setInvoiceToDelete(null)
    }
  }

  const handleAdd = () => {
    if (isLocked) {
      toast.error('Cannot add in locked mode', {
        description: 'Unlock the data in Settings to make changes'
      })
      return
    }
    setEditingInvoice(null)
    setOpen(true)
  }

  const supplierMap = useMemo(() => new Map(suppliers.map(s => [s.id, s])), [suppliers])
  const selectedInvoiceSupplier = selectedSupplierId ? supplierMap.get(selectedSupplierId) : undefined
  const filteredSuppliers = suppliers.filter((supplier) => {
    const query = supplierSearch.trim().toLowerCase()
    if (!query) return true
    return [supplier.name, supplier.phone, supplier.gstin]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query))
  })
  const itemMap = useMemo(() => new Map(items.map(i => [i.id, i])), [items])
  const filteredPickerItems = useMemo(() => {
    const query = itemSearch.trim().toLowerCase()
    return items
      .filter(item => {
        if (selectedItemCategory !== 'all' && item.category !== selectedItemCategory) return false
        if (!query) return true
        return [
          item.name,
          item.itemCode,
          item.category,
          item.description,
          item.unit
        ].some(value => (value || '').toLowerCase().includes(query))
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [itemSearch, items, selectedItemCategory])

  const { totalAmount: totalInvoiceAmount, totalQty: totalInvoiceQty } = calculateInvoiceItemsTotals(invoiceItems)
  const finalInvoiceAmountPreview = calculateInvoiceFinalAmount(totalInvoiceAmount, additionalCostFinal, roundOffAdjustment)
  const paidAmountPreview = Math.min(
    Math.max(parseFloat(amountPaid) || 0, 0),
    finalInvoiceAmountPreview
  )
  const balanceAmountPreview = Math.max(finalInvoiceAmountPreview - paidAmountPreview, 0)



  const handleDownloadInvoicePDF = (invoice: PurchaseInvoice) => {
    const directPayment = payments.find((payment) => payment.id === getInvoicePaymentId(invoice.id))
    const allocs = calculatePaymentAllocations(payments, invoices).allocations
    const allocatedPaid = allocs.filter((a) => a.invoiceId === invoice.id).reduce((sum, a) => sum + a.allocatedAmount, 0)
    const paidAmount = directPayment ? directPayment.amount : (allocatedPaid || 0)
    exportPurchaseInvoicePDF(invoice, supplierMap.get(invoice.supplierId), itemMap, {
      businessName: 'SK TRADERS',
      state: 'West Bengal',
      phone: '9083876218',
      paidAmount: paidAmount,
      paymentCounterName: directPayment?.counterName
    })
    toast.success(`Downloaded invoice ${invoice.invoiceNo}`)
  }

  if (detailsInvoice) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDetailsInvoice(null)}
            className="gap-2 font-bold text-slate-700 hover:bg-slate-100 rounded-xl"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Purchase Invoices
          </Button>
          <span className="text-xs text-slate-500 font-semibold">
            Viewing Purchase Invoice Details Report for Invoice #{detailsInvoice.invoiceNo}
          </span>
        </div>
        <PurchaseInvoiceDetailsPage
          invoices={invoices}
          payments={payments}
          suppliers={suppliers}
          items={items}
          fixedSchemes={fixedSchemes}
          mtBookings={mtBookings}
          receivedDiscounts={receivedDiscounts}
          expenseEntries={expenseEntries}
          expenseTypes={expenseTypes}
          currentFY={currentFY}
          initialInvoiceNo={detailsInvoice.invoiceNo}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-12">
      {!open && (
        <>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full text-slate-700 hover:bg-slate-200/60"
              >
                <CaretLeft className="h-5 w-5" weight="bold" />
              </Button>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Purchase Invoices</h1>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
            {/* Card 1: Total Invoices */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Total Purchase Invoices</p>
                <p className="text-3xl font-extrabold text-slate-900 tracking-tight">{invoices.length}</p>
                <p className="text-xs font-semibold text-blue-600 flex items-center gap-1 mt-2">
                  <TrendUp className="h-3.5 w-3.5" weight="bold" /> 0% from last month
                </p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100/60 flex items-center justify-center shrink-0">
                <Receipt className="h-6 w-6" weight="duotone" />
              </div>
            </div>

            {/* Card 3: Total Purchase Amount */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Total Purchase Amount</p>
                <p className="text-3xl font-extrabold text-slate-900 tracking-tight">{formatCurrency(totalAmount)}</p>
                <p className="text-xs font-normal text-slate-400 mt-2">Reflects final settlement values</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100/60 flex items-center justify-center shrink-0">
                <Wallet className="h-6 w-6" weight="duotone" />
              </div>
            </div>
          </div>
        </>
      )}

      {open ? (
        <div className="erp-invoice-page-shell">
          <form onSubmit={handleSubmit} key={editingInvoice?.id || 'new-purchase-invoice'} className="erp-invoice-form erp-invoice-page-form">
            <div className="erp-invoice-page-header">
              <div className="flex min-w-0 items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-full"
                  onClick={() => handleOpenChange(false)}
                  aria-label="Back to purchase invoices"
                >
                  <ArrowLeft size={24} />
                </Button>
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-semibold">
                    {editingInvoice ? 'Edit Purchase Invoice' : 'Create Purchase Invoice'}
                  </h2>
                  <p className="text-sm text-muted-foreground">Bill from supplier and add invoice items</p>
                </div>
              </div>
              <div className="erp-reference-actions">
                <Button type="button" variant="ghost" size="icon" className="erp-keyboard-button" aria-label="Keyboard shortcuts">
                  <Keyboard size={20} weight="fill" />
                </Button>
                <Button type="button" variant="outline" className="erp-upload-button">
                  <Barcode size={18} weight="bold" />
                  Upload using Phone
                </Button>
                <Button type="button" variant="outline" className="erp-settings-button">
                  <GearSix size={22} weight="duotone" />
                  Settings
                </Button>
                <Button type="button" variant="outline" className="erp-save-new-button" disabled>
                  Save & New
                </Button>
                <Button type="submit" className="erp-save-button" disabled={invoiceItems.length === 0}>
                  {editingInvoice ? 'Update' : 'Save'}
                </Button>
              </div>
            </div>
            <div className="erp-invoice-body erp-invoice-page-body">
              <div className="erp-form-panel">
                <h3 className="erp-section-title">Bill From</h3>
                <div className="erp-responsive-grid">
                  <div className="erp-party-picker-field">
                    <input type="hidden" name="supplierId" value={selectedSupplierId} />
                    {!supplierPickerOpen && selectedInvoiceSupplier ? (
                      <div className="flex items-center justify-between p-3.5 bg-[#5B5FEF]/10 border-2 border-[#5B5FEF] rounded-2xl shadow-sm">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-[#5B5FEF] text-white flex items-center justify-center font-extrabold text-sm shrink-0 shadow-sm">
                            {selectedInvoiceSupplier.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-extrabold text-slate-900 truncate">
                              {selectedInvoiceSupplier.name}
                            </div>
                            <div className="text-xs font-bold text-[#5B5FEF]">
                              Balance: {formatCurrency(selectedInvoiceSupplier.openingBalance || 0)}
                            </div>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSupplierPickerOpen(true)
                            setSupplierSearch('')
                          }}
                          className="h-8 px-3 text-xs font-bold text-[#5B5FEF] bg-white border-[#5B5FEF]/30 hover:bg-[#5B5FEF] hover:text-white rounded-xl shadow-2xs transition-all shrink-0 ml-2"
                        >
                          Change Party
                        </Button>
                      </div>
                    ) : !supplierPickerOpen && !selectedInvoiceSupplier ? (
                      <button
                        type="button"
                        className="erp-party-add-box"
                        onClick={() => setSupplierPickerOpen(true)}
                      >
                        <Plus size={18} weight="bold" />
                        Add Party
                      </button>
                    ) : (
                      <div className="erp-party-dropdown-card">
                        <div className="erp-party-search-row">
                          <MagnifyingGlass size={20} />
                          <input
                            id="supplierId"
                            type="text"
                            value={supplierSearch}
                            onChange={(event) => setSupplierSearch(event.target.value)}
                            onFocus={() => setSupplierPickerOpen(true)}
                            placeholder="Search party by name or number"
                            autoComplete="off"
                          />
                          <button
                            type="button"
                            aria-label="Toggle supplier list"
                            onClick={() => setSupplierPickerOpen(false)}
                          >
                            <span>✕</span>
                          </button>
                        </div>

                        <div className="erp-party-options">
                          <div className="erp-party-options-head">
                            <span>Party Name</span>
                            <span>Balance</span>
                          </div>
                          {filteredSuppliers.map((supplier) => (
                            <button
                              type="button"
                              key={supplier.id}
                              className="erp-party-option"
                              onClick={() => {
                                setSelectedSupplierId(supplier.id)
                                setSupplierSearch('')
                                setSupplierPickerOpen(false)
                              }}
                            >
                              <span>{supplier.name}</span>
                              <span>{formatCurrency(supplier.openingBalance || 0)}</span>
                            </button>
                          ))}
                          <button
                            type="button"
                            className="erp-party-create-option"
                            onClick={() => {
                              setSupplierPickerOpen(false)
                              setShowQuickSupplier(true)
                            }}
                          >
                            <Plus size={16} weight="bold" />
                            Create Party
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="invoiceNo" className="text-xs font-medium">Invoice Number <span className="text-destructive">*</span></Label>
                    <Input
                      id="invoiceNo"
                      name="invoiceNo"
                      defaultValue={editingInvoice?.invoiceNo}
                      placeholder="INV-001"
                      className="h-8 bg-background text-xs"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="invoiceDate" className="text-xs font-medium">Invoice Date <span className="text-destructive">*</span></Label>
                    <Input
                      id="invoiceDate"
                      name="invoiceDate"
                      type="date"
                      defaultValue={editingInvoice?.invoiceDate || format(new Date(), 'yyyy-MM-dd')}

                      className="h-8 bg-background text-xs"
                      required
                    />
                    <p className="text-[10px] text-muted-foreground">For payments, reports, ageing, and fixed scheme eligibility</p>
                  </div>
                </div>
              </div>

              <div id="purchase-invoice-items" className="space-y-2.5">
                <div className="erp-section-toolbar">
                  <h3 className="erp-section-title">
                    Invoice Items <span className="text-destructive">*</span>
                  </h3>
                  <span className="text-[10px] text-muted-foreground font-medium">
                    Rate uses item GST • fallback company GST: {gstPercentage}%
                  </span>
                </div>

                <div className="erp-reference-table-wrap">
                  {items.length === 0 && (
                    <div className="px-4 py-3 text-sm text-muted-foreground border-b border-border/50">
                      No item master found. Click <span className="font-semibold text-primary">Add Item</span>, then use Create New Item inside the list.
                    </div>
                  )}
                  <div className="erp-reference-item-table">
                    <div className="erp-reference-item-head">
                      <span>No</span>
                      <span>Items</span>
                      <span>HSN/ SAC</span>
                      <span>Qty</span>
                      <span>Price (excl. Tax)</span>
                      <span>Price (incl. Tax)</span>
                      <span>Discount</span>
                      <span>Tax</span>
                      <span>Amount (₹)</span>
                      <button type="button" className="erp-reference-row-plus" onClick={() => setItemPickerOpen(true)} aria-label="Add item">
                        <Plus size={22} weight="bold" />
                      </button>
                    </div>

                    {invoiceItems.map((invoiceItem, index) => (
                      <div className="erp-reference-item-row" key={index}>
                        <span className="erp-reference-row-number">{index + 1}</span>
                        <Select value={invoiceItem.itemId} onValueChange={(value) => updateInvoiceItem(index, 'itemId', value)}>
                          <SelectTrigger className="erp-reference-cell-input">
                            <SelectValue placeholder="Select an item" />
                          </SelectTrigger>
                          <SelectContent>
                            {items.map(item => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.name} ({item.unit})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input value="-" disabled className="erp-reference-cell-input text-center" />
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              step="0.001"
                              min="0"
                              value={invoiceItem.enteredQuantity ?? (invoiceItem as any).entryQuantity ?? ''}
                              onChange={(e) => updateInvoiceItem(index, 'enteredQuantity', e.target.value)}
                              placeholder="0"
                              className="erp-reference-cell-input font-mono text-right flex-1 min-w-[70px]"
                            />
                            {(() => {
                              const sel = items.find(i => i.id === invoiceItem.itemId)
                              const baseUnit = sel?.unit || 'KG'
                              const activeUnit = invoiceItem.enteredUnit || (invoiceItem as any).entryUnit || baseUnit
                              return (
                                <select
                                  value={activeUnit}
                                  onChange={(e) => updateInvoiceItem(index, 'enteredUnit', e.target.value)}
                                  className="text-xs font-bold font-mono bg-slate-100 border border-slate-300 rounded px-1 py-1 text-slate-800 focus:outline-none"
                                >
                                  <option value={baseUnit}>{baseUnit}</option>
                                  {sel?.alternativeUnit && sel.alternativeUnit !== 'NONE' && (
                                    <option value={sel.alternativeUnit}>{sel.alternativeUnit}</option>
                                  )}
                                </select>
                              )
                            })()}
                          </div>
                          {(() => {
                            const sel = items.find(i => i.id === invoiceItem.itemId)
                            const activeUnit = invoiceItem.enteredUnit || (invoiceItem as any).entryUnit || sel?.unit
                            if (sel && activeUnit && activeUnit !== sel.unit) {
                              const factor = getItemConversionFactor(sel, activeUnit)
                              const baseQty = invoiceItem.baseQuantity ?? ((invoiceItem.enteredQuantity || 0) * factor)
                              const baseRate = factor > 0 ? (invoiceItem.rate || 0) / factor : 0
                              return (
                                <span className="text-[10px] font-mono font-bold text-indigo-700 bg-indigo-50 px-1 py-0.5 rounded text-right">
                                  Base: {baseQty.toLocaleString('en-IN')} {sel.unit} (@ ₹{baseRate.toFixed(2)}/{sel.unit})
                                </span>
                              )
                            }
                            return null
                          })()}
                        </div>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={invoiceItem.basicRate || ''}
                          onChange={(e) => updateInvoiceItem(index, 'basicRate', e.target.value)}
                          placeholder="Excl. Tax"
                          className="erp-reference-cell-input font-mono text-right"
                        />
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={invoiceItem.rate || ''}
                          onChange={(e) => updateInvoiceItem(index, 'rate', e.target.value)}
                          placeholder="Incl. Tax"
                          className="erp-reference-cell-input font-mono text-right font-bold text-blue-900 bg-blue-50/50 border-blue-200"
                        />
                        <Input value="-" disabled className="erp-reference-cell-input text-center" />
                        <Input value={`GST @ ${getInvoiceItemGstRate(invoiceItem.itemId)}%`} disabled className="erp-reference-cell-input text-center" />
                        <Input value={formatCurrency(invoiceItem.amount)} disabled className="erp-reference-cell-input font-mono text-right" />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="erp-reference-remove-row"
                          onClick={() => removeInvoiceItem(index)}
                          aria-label="Remove item"
                        >
                          <X size={16} weight="bold" />
                        </Button>
                      </div>
                    ))}

                    <div className="erp-reference-add-item-row">
                      <button type="button" className="erp-reference-add-item-dashed" onClick={() => setItemPickerOpen(true)}>
                        <Plus size={18} weight="bold" />
                        Add Item
                      </button>

                    </div>
                  </div>
                </div>



                <div className="erp-invoice-reference-footer">
                  {/* Column 1: Invoice Information */}
                  <div className="erp-footer-col erp-footer-col-left">
                    <div className="erp-footer-section">
                      <div className="erp-footer-section-header">
                        <FileText size={20} weight="fill" />
                        <div>
                          <h3>Invoice Information</h3>
                          <p>Add notes and terms related to this purchase.</p>
                        </div>
                      </div>
                      <div className="erp-footer-section-content">
                        {/* Invoice Notes */}
                        <div className="erp-inner-card">
                          <div className="erp-inner-card-header">
                            <h4><FileText size={16} weight="bold" /> Invoice Notes</h4>
                            {!showInvoiceNotes && (
                              <button type="button" className="erp-inner-card-action" onClick={() => setShowInvoiceNotes(true)}>
                                <Plus size={14} weight="bold" /> Add Notes
                              </button>
                            )}
                          </div>
                          {showInvoiceNotes && (
                            <div className="erp-inner-card-body">
                              <Textarea
                                value={invoiceNotes}
                                onChange={(event) => setInvoiceNotes(event.target.value)}
                                placeholder="Enter notes here..."
                              />
                              <span className="erp-char-count">{invoiceNotes.length} / 500</span>
                              <button type="button" className="absolute top-2 right-2 text-muted-foreground hover:text-destructive" onClick={() => { setShowInvoiceNotes(false); setInvoiceNotes('') }}>
                                <X size={16} weight="bold" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Terms & Conditions */}
                        <div className="erp-inner-card">
                          <div className="erp-inner-card-header">
                            <h4><Receipt size={16} weight="bold" /> Terms & Conditions</h4>
                            {!showInvoiceTerms && (
                              <button type="button" className="erp-inner-card-action" onClick={() => { setShowInvoiceTerms(true); setInvoiceTerms((current) => current || DEFAULT_INVOICE_TERMS) }}>
                                <Plus size={14} weight="bold" /> Add Terms
                              </button>
                            )}
                          </div>
                          {showInvoiceTerms && (
                            <div className="erp-inner-card-body">
                              <Textarea
                                value={invoiceTerms}
                                onChange={(event) => setInvoiceTerms(event.target.value)}
                                placeholder="Enter terms and conditions..."
                              />
                              <span className="erp-char-count">{invoiceTerms.length} / 1000</span>
                              <button type="button" className="absolute top-2 right-2 text-muted-foreground hover:text-destructive" onClick={() => { setShowInvoiceTerms(false); setInvoiceTerms('') }}>
                                <X size={16} weight="bold" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Column 2: Payment Settlement */}
                  <div className="erp-footer-col erp-footer-col-middle">
                    <div className="erp-footer-section">
                      <div className="erp-footer-section-header">
                        <Wallet size={20} weight="fill" />
                        <div>
                          <h3>Payment Settlement</h3>
                          <p>Record the amount paid while saving this purchase invoice.</p>
                        </div>
                      </div>
                      <div className="erp-footer-section-content">
                        <input type="hidden" name="amountPaid" value={amountPaid} />
                        {amountPaid && parseFloat(amountPaid) > 0 && (
                          <input type="hidden" name="counterId" value={selectedCounterId} />
                        )}

                        <div className="erp-payment-fields-row mt-1">
                          <div className="erp-payment-field">
                            <label>Amount Paid</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">₹</span>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                max={finalInvoiceAmountPreview || undefined}
                                value={amountPaid}
                                onChange={(event) => setAmountPaid(event.target.value)}
                                placeholder="0.00"
                                className="pl-8 font-mono text-right"
                              />
                            </div>
                          </div>
                          <div className="erp-payment-field">
                            <label>Payment Account</label>
                            <Select value={selectedCounterId} onValueChange={setSelectedCounterId} required={parseFloat(amountPaid) > 0}>
                              <SelectTrigger className="h-10 text-sm">
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
                        </div>

                        <div className="erp-payment-summary-box">
                          <div className="erp-payment-summary-row">
                            <span>Total Payable</span>
                            <span className="value">₹{finalInvoiceAmountPreview.toFixed(2)}</span>
                          </div>
                          <div className="erp-payment-summary-row">
                            <span>Amount Paid</span>
                            <span className="value text-blue-600">₹{paidAmountPreview.toFixed(2)}</span>
                          </div>
                          <div className="erp-payment-summary-row divider"></div>
                          <div className="erp-payment-summary-row balance">
                            <span>Balance Due</span>
                            <span className="value">₹{balanceAmountPreview.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Column 3: Additional Charges & Summary */}
                  <div className="erp-footer-col erp-footer-col-right">
                    <div className="erp-footer-section">
                      <div className="erp-footer-section-header w-full justify-between items-center mb-1">
                        <div className="flex items-center gap-2">
                          <div className="icon-container flex items-center justify-center text-blue-500 bg-blue-50 p-1 rounded">
                            <Receipt size={18} weight="bold" />
                          </div>
                          <h3 className="m-0 text-base">Additional Charges</h3>
                        </div>
                        <div className="text-sm font-semibold">
                          Total Charges: <span className="font-mono text-blue-600 ml-1">₹{additionalCostFinal.toFixed(2)}</span>
                        </div>
                      </div>
                      <div className="erp-footer-section-content">
                        {additionalCharges.length === 0 ? (
                          <button type="button" className="erp-add-charge-btn" onClick={addAnotherCharge}>
                            <Plus size={16} weight="bold" /> Add Additional Charge
                          </button>
                        ) : (
                          <div className="flex flex-col gap-3">
                            {additionalCharges.map((charge) => (
                              <div key={charge.id} className="erp-charge-dashed-card">
                                <Input
                                  type="text"
                                  value={charge.remarks}
                                  onChange={(e) => handleUpdateCharge(charge.id, 'remarks', e.target.value)}
                                  placeholder="e.g. Transport Charge"
                                  className="bg-muted/50 border-muted"
                                />
                                <div className="erp-charge-row-inputs">
                                  <div className="relative flex-1">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm">₹</span>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={charge.basicRate || ''}
                                      onChange={(e) => handleUpdateCharge(charge.id, 'basicRate', e.target.value)}
                                      placeholder="0.00"
                                      className="pl-7 font-mono text-right"
                                    />
                                  </div>
                                  <Select value={charge.taxMode} onValueChange={(value) => handleUpdateCharge(charge.id, 'taxMode', value)}>
                                    <SelectTrigger className="w-[140px]">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">No Tax Applicable</SelectItem>
                                      <SelectItem value="gst">GST Applicable</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  {charge.taxMode === 'gst' && (
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={charge.gstRate || ''}
                                      onChange={(e) => handleUpdateCharge(charge.id, 'gstRate', e.target.value)}
                                      placeholder="GST %"
                                      className="w-20 font-mono text-right"
                                    />
                                  )}
                                  <button type="button" onClick={() => removeCharge(charge.id)} className="flex items-center justify-center shrink-0">
                                    <Trash size={16} />
                                  </button>
                                </div>
                              </div>
                            ))}
                            <div className="pt-1 px-1">
                              <button type="button" className="erp-text-link" onClick={addAnotherCharge}>
                                <Plus size={14} weight="bold" /> Add Another Charge
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="erp-footer-section flex-1">
                      <div className="erp-footer-section-header items-center mb-1">
                        <FileText size={20} weight="fill" />
                        <h3 className="m-0 text-base">Invoice Summary</h3>
                      </div>
                      <div className="erp-footer-section-content justify-end">
                        <div className="erp-invoice-summary-list">
                          <div className="erp-summary-item">
                            <span>Total Quantity</span>
                            <span className="value">{formatMT(totalInvoiceQty)}</span>
                          </div>
                          <div className="erp-summary-divider"></div>
                          <div className="erp-summary-item">
                            <span>Items Subtotal</span>
                            <span className="value">₹{totalInvoiceAmount.toFixed(2)}</span>
                          </div>
                          <div className="erp-summary-divider"></div>
                          <div className="erp-summary-item">
                            <span>Additional Charges</span>
                            <span className="value">₹{additionalCostFinal.toFixed(2)}</span>
                          </div>
                          <div className="erp-summary-divider"></div>
                          <div className="erp-summary-item">
                            <span>Tax Amount</span>
                            <span className="value">₹0.00</span>
                          </div>
                          <div className="erp-summary-divider"></div>
                          <div className="erp-summary-item discount">
                            <span>Discount / Adjustment</span>
                            <span className="value">- ₹{Math.abs(roundOffAdjustment).toFixed(2)}</span>
                          </div>
                          {paidAmountPreview > 0 && (
                            <>
                              <div className="erp-summary-divider"></div>
                              <div className="erp-summary-item text-emerald-600 font-bold">
                                <span>Amount Paid</span>
                                <span className="value text-emerald-600 font-bold">₹{paidAmountPreview.toFixed(2)}</span>
                              </div>
                              <div className="erp-summary-divider"></div>
                              <div className="erp-summary-item text-[#5B5FEF] font-bold">
                                <span>Balance Due</span>
                                <span className="value text-[#5B5FEF] font-bold">₹{balanceAmountPreview.toFixed(2)}</span>
                              </div>
                            </>
                          )}
                        </div>

                        <div className="erp-final-amount-block mt-auto">
                          <span className="label">Final Invoice Amount</span>
                          <span className="amount">₹{(totalInvoiceAmount + additionalCostFinal + roundOffAdjustment).toFixed(2)}</span>
                          <input type="hidden" name="roundOffAdjustment" value={roundOffAdjustment} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="erp-global-footer-alert">
                  <Info size={18} weight="fill" />
                  Values are updated automatically based on your entries.
                </div>
              </div>
            </div>

            <div className="erp-dialog-footer">
              <div className="erp-dialog-actions">
                <Button
                  type="button"
                  variant="outline"
                  className="erp-secondary-action flex-1"
                  onClick={() => handleOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="erp-primary-action flex-1"
                  disabled={invoiceItems.length === 0}
                >
                  {editingInvoice ? 'Update Invoice' : 'Create Invoice'}
                </Button>
              </div>
            </div>
          </form>
        </div>
      ) : null}

      <PartyEditorDialog
        open={showQuickSupplier}
        onOpenChange={setShowQuickSupplier}
        type="supplier"
        existingParties={suppliers}
        onSave={(party) => {
          const supplier = party as Supplier
          setSuppliers((prev) => [...prev, supplier])
          setSelectedSupplierId(supplier.id)
          setShowQuickSupplier(false)
          toast.success(`Supplier "${supplier.name}" created`)
        }}
      />

      <Dialog
        open={itemPickerOpen}
        onOpenChange={(nextOpen) => {
          setItemPickerOpen(nextOpen)
          if (!nextOpen) resetItemPicker()
        }}
      >
        <DialogContent
          className="erp-item-picker-dialog max-h-[82dvh] p-0"
          style={{ width: 'min(1180px, calc(100vw - 2rem))', maxWidth: 'min(1180px, calc(100vw - 2rem))' }}
        >
          <DialogHeader className="erp-item-picker-header border-b border-border px-6 py-5">
            <DialogTitle className="erp-item-picker-title text-xl">Add Items to Bill</DialogTitle>
          </DialogHeader>

          <div className="erp-item-picker-body space-y-4 px-6 py-5">
            <div className="erp-item-picker-toolbar grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
              <div className="erp-item-picker-search relative">
                <MagnifyingGlass size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={itemSearch}
                  onChange={(event) => setItemSearch(event.target.value)}
                  placeholder="Search by Item/ Serial no./ HSN code/ SKU/ Custom Field / Category"
                  className="erp-item-picker-input h-11 pl-10 pr-10"
                />
                <Barcode size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              </div>
              <Select value={selectedItemCategory} onValueChange={setSelectedItemCategory}>
                <SelectTrigger className="erp-item-picker-category h-11">
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {[...new Set(items.map(item => item.category).filter(Boolean))].map(category => (
                    <SelectItem key={category} value={category!}>{category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" className="erp-item-picker-create h-11" onClick={() => setShowQuickItem(true)}>
                Create New Item
              </Button>
            </div>

            <div className="erp-item-picker-table-card overflow-hidden rounded-xl border border-border">
              <div className="erp-item-picker-table-scroll max-h-[420px] overflow-y-auto">
                <Table className="erp-item-picker-table">
                  <TableHeader className="erp-item-picker-table-head sticky top-0 z-10 bg-muted">
                    <TableRow>
                      <TableHead className="w-[26%]">Item Name</TableHead>
                      <TableHead className="w-[12%]">Item Code</TableHead>
                      <TableHead className="text-right w-[14%]">Stock</TableHead>
                      <TableHead className="text-right w-[14%]">Sales Price</TableHead>
                      <TableHead className="text-right w-[14%]">Purchase Price</TableHead>
                      <TableHead className="text-right w-[20%] min-w-[180px]">Quantity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPickerItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-72 text-center text-muted-foreground">
                          No items found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPickerItems.map(item => {
                        const pickerQuantity = pickerQuantities[item.id] !== undefined ? pickerQuantities[item.id] : 0
                        const isSelected = pickerQuantities[item.id] !== undefined
                        const defaultUnit = item.unit || 'MT'
                        const activeUnit = pickerUnits[item.id] || defaultUnit

                        return (
                          <TableRow
                            key={item.id}
                            className={isSelected ? 'erp-item-picker-row is-selected bg-primary/10' : 'erp-item-picker-row'}
                          >
                            <TableCell className="font-medium">{item.name}</TableCell>
                            <TableCell>{item.itemCode || '-'}</TableCell>
                            <TableCell className="text-right font-mono font-semibold text-blue-700">
                              {(stockMap.get(item.id)?.currentStock ?? item.openingStock ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })} {item.unit}
                            </TableCell>
                            <TableCell className="text-right font-mono">{item.salesPrice ? formatCurrency(item.salesPrice) : '-'}</TableCell>
                            <TableCell className="text-right font-mono">{item.purchasePrice ? formatCurrency(item.purchasePrice) : '-'}</TableCell>
                            <TableCell className="text-right">
                              {isSelected ? (
                                <div className="inline-flex items-center justify-end gap-1 bg-slate-100/90 p-0.5 rounded-lg border border-slate-200 shrink-0">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-slate-600 hover:bg-white hover:text-slate-900 rounded-md shrink-0"
                                    onClick={() => updatePickerQuantity(item.id, pickerQuantity <= 1 ? null : pickerQuantity - 1)}
                                  >
                                    -
                                  </Button>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.001"
                                    value={pickerQuantity}
                                    onChange={(event) => updatePickerQuantity(item.id, event.target.value === '' ? 0 : parseFloat(event.target.value))}
                                    className="h-7 w-14 px-1 text-center font-mono text-xs bg-white border-0 shadow-none focus-visible:ring-0 font-bold"
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-slate-600 hover:bg-white hover:text-slate-900 rounded-md shrink-0"
                                    onClick={() => updatePickerQuantity(item.id, pickerQuantity + 1)}
                                  >
                                    +
                                  </Button>
                                  {item.alternativeUnit && item.alternativeUnit !== 'NONE' ? (
                                    <select
                                      value={activeUnit}
                                      onChange={(e) => updatePickerUnit(item.id, e.target.value)}
                                      className="h-7 text-xs font-bold font-mono bg-white border border-slate-200 rounded-md px-1 text-slate-800 focus:outline-none cursor-pointer ml-0.5"
                                    >
                                      <option value={item.unit}>{item.unit}</option>
                                      <option value={item.alternativeUnit}>{item.alternativeUnit}</option>
                                    </select>
                                  ) : (
                                    <span className="text-xs font-bold font-mono text-slate-600 px-1.5">{item.unit}</span>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-1.5">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 px-3 text-xs font-semibold border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 shrink-0"
                                    onClick={() => {
                                      setSelectedPickerItemId(item.id)
                                      updatePickerQuantity(item.id, 1)
                                    }}
                                  >
                                    + Add
                                  </Button>
                                  {item.alternativeUnit && item.alternativeUnit !== 'NONE' ? (
                                    <select
                                      value={activeUnit}
                                      onChange={(e) => updatePickerUnit(item.id, e.target.value)}
                                      className="h-8 text-xs font-bold font-mono bg-slate-100 border border-slate-300 rounded-md px-1.5 text-slate-800 focus:outline-none cursor-pointer shrink-0"
                                    >
                                      <option value={item.unit}>{item.unit}</option>
                                      <option value={item.alternativeUnit}>{item.alternativeUnit}</option>
                                    </select>
                                  ) : (
                                    <span className="text-xs font-bold font-mono text-slate-500 min-w-[32px] text-left">{item.unit}</span>
                                  )}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          <div className="erp-item-picker-footer flex items-center justify-between border-t border-border px-6 py-4">
            <div className="erp-item-picker-selected-count text-sm text-primary">
              Show {Object.values(pickerQuantities).filter((quantity) => quantity > 0).length} Item(s) Selected
            </div>
            <div className="erp-item-picker-actions flex gap-3">
              <Button type="button" variant="outline" onClick={() => {
                setItemPickerOpen(false)
                resetItemPicker()
              }}>
                Cancel [ESC]
              </Button>
              <Button type="button" onClick={handleAddSelectedItemToBill} disabled={Object.values(pickerQuantities).every((quantity) => quantity <= 0)}>
                Add to Bill [F7]
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ItemEditorDialog
        open={showQuickItem}
        onOpenChange={setShowQuickItem}
        existingItems={items}
        onSave={(item) => {
          setItems((prev) => [...prev, item])
          setSelectedPickerItemId(item.id)
          setShowQuickItem(false)
          toast.success(`Item "${item.name}" created`)
        }}
      />
      {!open && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
          {/* Card Header */}
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#0256e8] flex items-center justify-center">
                <Receipt className="h-5 w-5" weight="duotone" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">Purchase Invoice List</h2>
            </div>
            <Button onClick={handleAdd} className="bg-[#0256e8] hover:bg-[#0046cd] text-white font-semibold rounded-xl px-4 py-2.5 shadow-2xs flex items-center gap-2">
              <Plus className="h-4 w-4" weight="bold" />
              Add Purchase Invoice
            </Button>
          </div>

          {/* Filter Sub-bar */}
          <div className="px-5 py-3.5 bg-slate-50/70 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <SlidersHorizontal className="h-4 w-4" weight="bold" />
                <span>Filters:</span>
              </div>

              <div className="flex items-center gap-2">
                <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                  <SelectTrigger className="w-48 h-9 bg-white border-slate-200 text-xs font-medium rounded-xl">
                    <span className="text-slate-400 mr-1">Supplier:</span>
                    <SelectValue placeholder="All Suppliers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Suppliers</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <PeriodDateFilter currentFY={currentFY} value={periodFilter} onChange={setPeriodFilter} />
            </div>

            <span className="bg-slate-100 text-slate-700 text-xs font-semibold px-3 py-1 rounded-full border border-slate-200/60">
              {filteredInvoices.length} invoices found
            </span>
          </div>

          {/* Table */}
          <Table>
            <TableHeader className="bg-[#edf3fc]">
              <TableRow className="border-b border-slate-200/80 hover:bg-transparent">
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3.5">INVOICE NO</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3.5">DATE</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3.5">SUPPLIER</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3.5 text-right">AMOUNT</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3.5 text-right">ACTIONS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-16 text-center">
                    <div className="max-w-sm mx-auto space-y-3">
                      <div className="w-16 h-16 rounded-full bg-blue-50 text-[#0256e8] flex items-center justify-center mx-auto border border-blue-100 shadow-2xs">
                        <Receipt size={32} weight="duotone" />
                      </div>
                      <h3 className="text-base font-bold text-slate-900">No invoices found</h3>
                      <p className="text-xs text-slate-500">
                        No purchase invoices found for FY {currentFY}. Add your first invoice to get started.
                      </p>
                      <button
                        onClick={handleAdd}
                        className="inline-flex items-center gap-1.5 text-sm font-bold text-[#0256e8] hover:underline pt-2"
                      >
                        <Plus className="h-4 w-4" weight="bold" />
                        Create First Invoice
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredInvoices
                  .sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime())
                  .map((invoice) => {
                    const supplier = supplierMap.get(invoice.supplierId)

                    return (
                      <TableRow key={invoice.id} className="hover:bg-slate-50/80 border-b border-slate-100">
                        <TableCell className="font-mono font-bold text-slate-900 text-sm">
                          <button
                            type="button"
                            onClick={() => setDetailsInvoice(invoice)}
                            className="text-[#0256e8] hover:text-blue-800 hover:underline flex items-center gap-1 font-mono font-bold text-left cursor-pointer group"
                            title="Click to view full Invoice Details Report"
                          >
                            <FileText size={15} className="text-blue-600 group-hover:text-blue-800" />
                            {invoice.invoiceNo}
                          </button>
                        </TableCell>
                        <TableCell className="text-slate-600 text-xs font-medium">{new Date(invoice.invoiceDate).toLocaleDateString('en-IN')}</TableCell>
                        <TableCell className="font-semibold text-slate-800 text-sm">{supplier?.name || 'Unknown'}</TableCell>
                        <TableCell className="text-right font-mono font-bold text-slate-900 text-sm">{formatCurrency(invoice.invoiceAmount)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDetailsInvoice(invoice)}
                              className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg"
                              aria-label={`View Invoice Details Report for ${invoice.invoiceNo}`}
                              title="View Invoice Details Report"
                            >
                              <FileText size={16} weight="bold" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setPreviewInvoice(invoice)}
                              className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg"
                              aria-label={`Preview invoice ${invoice.invoiceNo}`}
                              title="Preview Invoice"
                            >
                              <Receipt size={16} weight="bold" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownloadInvoicePDF(invoice)}
                              className="h-8 gap-1 px-2 text-xs font-semibold text-slate-700 border-slate-200 hover:bg-slate-100 rounded-lg"
                              aria-label={`Download invoice ${invoice.invoiceNo} PDF`}
                              title="Download PDF"
                            >
                              <DownloadSimple size={14} weight="bold" />
                              PDF
                            </Button>
                            <ThreeDotDropdown
                              onEdit={() => handleEdit(invoice)}
                              onDelete={() => handleDeleteClick(invoice)}
                              history={invoice.history}
                              entityType="Purchase Invoice"
                              isLocked={isLocked}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
              )}
            </TableBody>
          </Table>

          {/* Table Footer */}
          <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium bg-white">
            <div>Showing 0 to {filteredInvoices.length} of {filteredInvoices.length} entries</div>
            <div className="flex items-center gap-1">
              <button className="h-7 w-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 disabled:opacity-50" disabled>‹</button>
              <button className="h-7 w-7 rounded-lg bg-[#0256e8] text-white font-bold flex items-center justify-center">1</button>
              <button className="h-7 w-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 disabled:opacity-50" disabled>›</button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Plus Button */}
      {!open && (
        <button
          onClick={handleAdd}
          className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-[#0256e8] text-white shadow-lg flex items-center justify-center z-40 hover:scale-105 transition-transform"
          title="Add Purchase Invoice"
        >
          <Plus className="h-6 w-6" weight="bold" />
        </button>
      )}

      {previewInvoice && (
        <InvoicePreviewDialog
          open={Boolean(previewInvoice)}
          onOpenChange={(open) => !open && setPreviewInvoice(null)}
          mode="purchase"
          invoiceNo={previewInvoice.invoiceNo}
          invoiceDate={previewInvoice.invoiceDate}
          partyName={supplierMap.get(previewInvoice.supplierId)?.name || 'Unknown supplier'}
          items={previewInvoice.items || []}
          itemMap={itemMap}
          totalAmount={previewInvoice.invoiceAmount}
          additionalCost={previewInvoice.additionalCost}
          additionalCostRemarks={previewInvoice.additionalCostRemarks}
          paidAmount={(() => {
            const directPayment = payments.find((payment) => payment.id === getInvoicePaymentId(previewInvoice.id))
            if (directPayment) return directPayment.amount
            const allocs = calculatePaymentAllocations(payments, invoices).allocations
            return allocs.filter(a => a.invoiceId === previewInvoice.id).reduce((s, a) => s + a.allocatedAmount, 0)
          })()}
        />
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Warning className="h-5 w-5 text-destructive" weight="fill" />
              Delete Purchase Invoice
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete invoice <strong>{invoiceToDelete?.invoiceNo}</strong> from <strong>{supplierMap.get(invoiceToDelete?.supplierId || '')?.name}</strong>?
              <br /><br />
              This action cannot be undone and will affect all related calculations, payments, and reports.
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
  );
}
