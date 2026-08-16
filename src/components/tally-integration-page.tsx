import React, { useState, useMemo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  FileXls,
  FileCode,
  Gear,
  CheckCircle,
  DownloadSimple,
  FileArrowUp,
  Sparkle,
  ArrowsClockwise,
  MagnifyingGlass,
  CaretDown,
  CaretRight,
  Funnel,
  SlidersHorizontal,
  Package,
  ArrowsLeftRight,
  Database
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  SalesInvoice,
  PurchaseInvoice,
  CustomerCreditNote,
  CustomerDebitNote,
  SupplierCreditNote,
  SupplierDebitNote,
  ExpenseEntry,
  Customer,
  Supplier,
  Payment,
  CustomerPayment,
  Item,
  InvoiceItem,
  ExpenseType
} from '@/lib/types'
import { Counter, CashBankTransaction } from '@/lib/cash-bank-types'
import { formatCurrency } from '@/lib/calculations'
import {
  TallyLedgerMapping,
  DEFAULT_TALLY_LEDGER_MAPPING,
  TallyCompoundVoucher,
  generateTallySalesVouchers,
  generateTallyPurchaseVouchers,
  generateTallyCreditNoteVouchers,
  generateTallyDebitNoteVouchers,
  generateTallyExpenseVouchers,
  exportCompoundVouchersToTallyExcel,
  generateTallyXML,
  downloadTallyXML
} from '@/lib/tally-universal-engine'
import {
  parseTallyAccountingVouchersExcel,
  generateSampleTallyExcel
} from '@/lib/tally-payment-excel'
import {
  parseTallyXmlVouchers,
  decodeXmlFileBuffer,
  TallyParsedXmlVoucher,
  TallyNewMasterCandidates
} from '@/lib/tally-xml-parser'

const STORAGE_KEY_TALLY_MAPPING = 'erp_tally_ledger_mapping'

const MONTH_OPTIONS = [
  { value: '0', label: 'All Months (Full Financial Year)' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
]

interface VoucherRowOverride {
  included?: boolean
  typeOverride?: TallyParsedXmlVoucher['normalizedType']
  partyName?: string
  matchedEntityType?: 'customer' | 'supplier' | 'expense' | 'counter' | 'unmapped'
  matchedEntityId?: string
  fromCounterId?: string
  toCounterId?: string
}

export interface TallyIntegrationPageProps {
  customers: Customer[]
  setCustomers: (c: Customer[]) => void
  suppliers: Supplier[]
  setSuppliers: (s: Supplier[]) => void
  items: Item[]
  setItems: (items: Item[]) => void
  expenseTypes: ExpenseType[]
  setExpenseTypes: (e: ExpenseType[]) => void
  counters: Counter[]
  cashBankCounters: Counter[]
  setCashBankCounters: (c: Counter[]) => void
  payments: Payment[]
  setPayments: (p: Payment[]) => void
  customerPayments: CustomerPayment[]
  setCustomerPayments: (p: CustomerPayment[]) => void
  salesInvoices: SalesInvoice[]
  setSalesInvoices: (s: SalesInvoice[]) => void
  purchaseInvoices: PurchaseInvoice[]
  setPurchaseInvoices: (p: PurchaseInvoice[]) => void
  creditNotes: CustomerCreditNote[]
  setCreditNotes: (c: CustomerCreditNote[]) => void
  debitNotes: SupplierDebitNote[]
  setDebitNotes: (d: SupplierDebitNote[]) => void
  customerDebitNotes?: CustomerDebitNote[]
  supplierCreditNotes?: SupplierCreditNote[]
  expenseEntries: ExpenseEntry[]
  setExpenseEntries: (e: ExpenseEntry[]) => void
  cashBankTransactions: CashBankTransaction[]
  setCashBankTransactions: (t: CashBankTransaction[]) => void
  businessName?: string
  companyStateCode?: string
  currentFY?: string
  initialTab?: 'import' | 'export'
}

export function TallyIntegrationPage({
  customers = [],
  setCustomers,
  suppliers = [],
  setSuppliers,
  items = [],
  setItems,
  expenseTypes = [],
  setExpenseTypes,
  counters = [],
  cashBankCounters = [],
  setCashBankCounters,
  payments = [],
  setPayments,
  customerPayments = [],
  setCustomerPayments,
  salesInvoices = [],
  setSalesInvoices,
  purchaseInvoices = [],
  setPurchaseInvoices,
  creditNotes = [],
  setCreditNotes,
  debitNotes = [],
  setDebitNotes,
  expenseEntries = [],
  setExpenseEntries,
  cashBankTransactions = [],
  setCashBankTransactions,
  businessName = 'SK TRADERS',
  companyStateCode = '19',
  currentFY = '2026-2027',
  initialTab = 'import'
}: TallyIntegrationPageProps) {
  const [activeTab, setActiveTab] = useState<'import' | 'export'>(initialTab)

  // ==========================================
  // 1. IMPORT WORKSPACE STATE & LOGIC
  // ==========================================
  const [parsedVouchers, setParsedVouchers] = useState<TallyParsedXmlVoucher[]>([])
  const [candidateMasters, setCandidateMasters] = useState<TallyNewMasterCandidates | null>(null)
  const [autoCreateMasters, setAutoCreateMasters] = useState(true)
  const [isParsing, setIsParsing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Interactive UI state
  const [overrides, setOverrides] = useState<Record<string, VoucherRowOverride>>({})
  const [expandedVoucherId, setExpandedVoucherId] = useState<string | null>(null)
  const [filterTab, setFilterTab] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Inventory Item Selector & Master Mapping State
  const [itemMappings, setItemMappings] = useState<Record<string, string>>({})
  const [itemOverrides, setItemOverrides] = useState<Record<string, Record<number, string>>>({})
  const [showItemMappingDrawer, setShowItemMappingDrawer] = useState(false)
  const [itemSearchQuery, setItemSearchQuery] = useState('')

  const handleGlobalItemMapping = (tallyItemName: string, targetItemId: string) => {
    const norm = tallyItemName.trim().toLowerCase()
    setItemMappings(prev => ({
      ...prev,
      [norm]: targetItemId
    }))
  }

  const handleVoucherItemOverride = (voucherId: string, itemIndex: number, targetItemId: string) => {
    setItemOverrides(prev => ({
      ...prev,
      [voucherId]: {
        ...(prev[voucherId] || {}),
        [itemIndex]: targetItemId
      }
    }))
  }

  // Module-wise Category Filter State
  const [selectedModules, setSelectedModules] = useState<{
    sales: boolean
    purchase: boolean
    receipt: boolean
    payment: boolean
    expense: boolean
    contra: boolean
    credit_note: boolean
    debit_note: boolean
  }>({
    sales: true,
    purchase: true,
    receipt: true,
    payment: true,
    expense: true,
    contra: true,
    credit_note: true,
    debit_note: true
  })

  const toggleModule = (mod: string, enabled: boolean) => {
    setSelectedModules(prev => ({ ...prev, [mod]: enabled }))
  }

  const selectOnlyInvoices = () => {
    setSelectedModules({
      sales: true,
      purchase: true,
      receipt: false,
      payment: false,
      expense: false,
      contra: false,
      credit_note: true,
      debit_note: true
    })
  }

  const selectOnlyBanking = () => {
    setSelectedModules({
      sales: false,
      purchase: false,
      receipt: true,
      payment: true,
      expense: true,
      contra: true,
      credit_note: false,
      debit_note: false
    })
  }

  const selectAllModules = () => {
    setSelectedModules({
      sales: true,
      purchase: true,
      receipt: true,
      payment: true,
      expense: true,
      contra: true,
      credit_note: true,
      debit_note: true
    })
  }

  const deselectAllModules = () => {
    setSelectedModules({
      sales: false,
      purchase: false,
      receipt: false,
      payment: false,
      expense: false,
      contra: false,
      credit_note: false,
      debit_note: false
    })
  }

  const supplierMap = useMemo(() => new Map(suppliers.map(s => [s.name.trim().toLowerCase(), s])), [suppliers])
  const customerMap = useMemo(() => new Map(customers.map(c => [c.name.trim().toLowerCase(), c])), [customers])
  const counterMap = useMemo(() => new Map(counters.map(c => [c.name.trim().toLowerCase(), c])), [counters])
  const expenseTypeMap = useMemo(() => new Map(expenseTypes.map(e => [e.name.trim().toLowerCase(), e])), [expenseTypes])
  const itemMap = useMemo(() => {
    const map = new Map(items.map(it => [it.name.trim().toLowerCase(), it]))
    items.forEach(it => {
      if (it.itemCode) map.set(it.itemCode.trim().toLowerCase(), it)
    })
    return map
  }, [items])

  const processedList = useMemo(() => {
    return parsedVouchers.map(v => {
      const override = overrides[v.id]
      const effectiveType = override?.typeOverride || v.normalizedType
      let partyName = (override?.partyName || v.partyName).trim()
      const normParty = partyName.toLowerCase()

      let matchedEntityType = override?.matchedEntityType || v.matchedEntityType || 'unmapped'
      let matchedEntityId = override?.matchedEntityId || v.matchedEntityId
      let contraDetails = v.contraDetails
      let expenseDetails = v.expenseDetails
      let isAutoCreated = false

      if (effectiveType === 'contra') {
        const fromName = v.contraDetails?.fromCounterName || v.legs.find(l => l.drCr === 'Cr')?.ledgerName || ''
        const toName = v.contraDetails?.toCounterName || v.legs.find(l => l.drCr === 'Dr')?.ledgerName || ''
        const fromId = override?.fromCounterId || v.contraDetails?.fromCounterId || counterMap.get(fromName.trim().toLowerCase())?.id
        const toId = override?.toCounterId || v.contraDetails?.toCounterId || counterMap.get(toName.trim().toLowerCase())?.id

        contraDetails = {
          fromCounterName: fromName,
          toCounterName: toName,
          fromCounterId: fromId,
          toCounterId: toId,
          amount: v.totalAmount
        }
      } else if (effectiveType === 'expense') {
        const expMatch = expenseTypeMap.get(normParty)
        if (expMatch) {
          matchedEntityType = 'expense'
          matchedEntityId = expMatch.id
        } else if (autoCreateMasters) {
          matchedEntityType = 'expense'
          isAutoCreated = true
        } else {
          matchedEntityType = 'unmapped'
        }
      } else if (effectiveType === 'payment' || effectiveType === 'purchase' || effectiveType === 'debit_note') {
        const suppMatch = supplierMap.get(normParty)
        if (suppMatch) {
          matchedEntityType = 'supplier'
          matchedEntityId = suppMatch.id
        } else if (autoCreateMasters) {
          matchedEntityType = 'supplier'
          isAutoCreated = true
        } else {
          matchedEntityType = 'unmapped'
        }
      } else if (effectiveType === 'receipt' || effectiveType === 'sales' || effectiveType === 'credit_note') {
        const custMatch = customerMap.get(normParty)
        if (custMatch) {
          matchedEntityType = 'customer'
          matchedEntityId = custMatch.id
        } else if (autoCreateMasters) {
          matchedEntityType = 'customer'
          isAutoCreated = true
        } else {
          matchedEntityType = 'unmapped'
        }
      }

      // Check item resolution & auto-create status
      let hasUnmappedItem = false
      const updatedInventory = (v.inventory || []).map((inv, idx) => {
        const normItem = inv.itemName.trim().toLowerCase()
        const mappedItemId = itemOverrides[v.id]?.[idx] || itemMappings[normItem]
        const matchedItem = mappedItemId && mappedItemId !== 'auto-create'
          ? items.find(it => it.id === mappedItemId)
          : itemMap.get(normItem)

        if (matchedItem) {
          return {
            ...inv,
            matchedItemId: matchedItem.id,
            isAutoCreatedItem: false
          }
        } else if (mappedItemId === 'auto-create' || autoCreateMasters) {
          return {
            ...inv,
            matchedItemId: undefined,
            isAutoCreatedItem: true
          }
        } else {
          hasUnmappedItem = true
          return {
            ...inv,
            matchedItemId: undefined,
            isAutoCreatedItem: false
          }
        }
      })

      const isIncluded = override?.included !== undefined ? override.included : (effectiveType !== 'skipped')

      return {
        ...v,
        effectiveType,
        partyName,
        matchedEntityType,
        matchedEntityId,
        isAutoCreated,
        contraDetails,
        expenseDetails,
        inventory: updatedInventory,
        hasUnmappedItem,
        isIncluded
      }
    })
  }, [parsedVouchers, overrides, autoCreateMasters, customerMap, supplierMap, counterMap, expenseTypeMap, itemMap, items, itemMappings, itemOverrides])

  // Distinct Tally Stock Items
  const distinctTallyItems = useMemo(() => {
    const map = new Map<string, {
      rawName: string
      normName: string
      totalQty: number
      unit: string
      sampleRate: number
      voucherCount: number
      matchedItem: Item | null
      isAutoCreate: boolean
    }>()

    processedList.forEach(v => {
      const modKey = v.effectiveType as keyof typeof selectedModules
      if (modKey in selectedModules && !selectedModules[modKey]) return

      (v.inventory || []).forEach(inv => {
        const raw = inv.itemName.trim()
        if (!raw) return
        const norm = raw.toLowerCase()

        if (!map.has(norm)) {
          const mappedId = itemMappings[norm]
          const existingItem = mappedId && mappedId !== 'auto-create'
            ? items.find(it => it.id === mappedId)
            : itemMap.get(norm) || null

          map.set(norm, {
            rawName: raw,
            normName: norm,
            totalQty: 0,
            unit: inv.unit || 'PCS',
            sampleRate: inv.rate,
            voucherCount: 0,
            matchedItem: existingItem || null,
            isAutoCreate: mappedId === 'auto-create' || (!existingItem && autoCreateMasters)
          })
        }

        const entry = map.get(norm)!
        entry.totalQty += inv.quantity || 0
        entry.voucherCount += 1
        if (inv.rate > 0) entry.sampleRate = inv.rate
      })
    })

    return Array.from(map.values())
  }, [processedList, selectedModules, itemMappings, itemMap, items, autoCreateMasters])

  // Filtered distinct items for search
  const filteredDistinctItems = useMemo(() => {
    if (!itemSearchQuery.trim()) return distinctTallyItems
    const q = itemSearchQuery.toLowerCase().trim()
    return distinctTallyItems.filter(it => it.rawName.toLowerCase().includes(q) || (it.matchedItem && it.matchedItem.name.toLowerCase().includes(q)))
  }, [distinctTallyItems, itemSearchQuery])

  // Compute live counts per module
  const moduleCounts = useMemo(() => {
    const counts = {
      sales: 0,
      purchase: 0,
      receipt: 0,
      payment: 0,
      expense: 0,
      contra: 0,
      credit_note: 0,
      debit_note: 0
    }
    processedList.forEach(v => {
      const t = v.effectiveType as keyof typeof counts
      if (t in counts) {
        counts[t]++
      }
    })
    return counts
  }, [processedList])

  // Count candidates for display filtered by active selected modules
  const newMastersSummary = useMemo(() => {
    const custSet = new Set<string>()
    const suppSet = new Set<string>()
    const expSet = new Set<string>()
    const cntrSet = new Set<string>()
    const itemSet = new Set<string>()

    processedList.forEach(v => {
      if (v.effectiveType === 'skipped') return
      const modKey = v.effectiveType as keyof typeof selectedModules
      if (modKey in selectedModules && !selectedModules[modKey]) return

      const norm = v.partyName.trim().toLowerCase()
      if (v.isAutoCreated) {
        if (v.matchedEntityType === 'customer' && !customerMap.has(norm)) custSet.add(v.partyName.trim())
        if (v.matchedEntityType === 'supplier' && !supplierMap.has(norm)) suppSet.add(v.partyName.trim())
        if (v.matchedEntityType === 'expense' && !expenseTypeMap.has(norm)) expSet.add(v.partyName.trim())
      }
      (v.inventory || []).forEach(inv => {
        if (inv.isAutoCreatedItem) itemSet.add(inv.itemName.trim())
      })
      if (v.effectiveType === 'contra') {
        const fromName = (v.contraDetails?.fromCounterName || '').trim()
        const toName = (v.contraDetails?.toCounterName || '').trim()
        if (fromName && !counterMap.has(fromName.toLowerCase())) cntrSet.add(fromName)
        if (toName && !counterMap.has(toName.toLowerCase())) cntrSet.add(toName)
      }
    })

    return {
      customersCount: custSet.size,
      suppliersCount: suppSet.size,
      expensesCount: expSet.size,
      countersCount: cntrSet.size,
      itemsCount: itemSet.size
    }
  }, [processedList, customerMap, supplierMap, expenseTypeMap, counterMap, selectedModules])

  // Summary counts
  const totalCount = processedList.length
  const matchedCount = processedList.filter(v => v.effectiveType !== 'skipped' && v.matchedEntityType !== 'unmapped' && !v.hasUnmappedItem).length
  const unmappedCount = processedList.filter(v => v.effectiveType !== 'skipped' && (v.matchedEntityType === 'unmapped' || v.hasUnmappedItem)).length
  const selectedCount = processedList.filter(v => {
    if (!v.isIncluded || v.effectiveType === 'skipped') return false
    const modKey = v.effectiveType as keyof typeof selectedModules
    if (modKey in selectedModules && !selectedModules[modKey]) return false
    return true
  }).length

  // Filtered list based on active tab, search query, and module selection
  const filteredList = useMemo(() => {
    return processedList.filter(v => {
      // 0. Module Filter
      const modKey = v.effectiveType as keyof typeof selectedModules
      if (modKey in selectedModules && !selectedModules[modKey]) {
        return false
      }

      // 1. Tab Filter
      if (filterTab === 'matched') {
        if (v.effectiveType === 'skipped' || v.matchedEntityType === 'unmapped' || v.hasUnmappedItem) return false
      } else if (filterTab === 'unmapped') {
        if (v.effectiveType === 'skipped' || (v.matchedEntityType !== 'unmapped' && !v.hasUnmappedItem)) return false
      } else if (filterTab === 'skipped') {
        if (v.effectiveType !== 'skipped') return false
      } else if (filterTab === 'notes') {
        if (v.effectiveType !== 'credit_note' && v.effectiveType !== 'debit_note') return false
      } else if (filterTab !== 'all') {
        if (v.effectiveType !== filterTab) return false
      }

      // 2. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchVch = v.voucherNumber.toLowerCase().includes(q)
        const matchParty = v.partyName.toLowerCase().includes(q)
        const matchAmt = v.totalAmount.toString().includes(q)
        const matchNarr = (v.narration || '').toLowerCase().includes(q)
        const matchLeg = v.legs.some(l => l.ledgerName.toLowerCase().includes(q))
        const matchItem = v.inventory.some(i => i.itemName.toLowerCase().includes(q))
        if (!matchVch && !matchParty && !matchAmt && !matchNarr && !matchLeg && !matchItem) return false
      }

      return true
    })
  }, [processedList, filterTab, searchQuery, selectedModules])

  // Bulk Actions
  const handleSelectAll = (select: boolean) => {
    setOverrides(prev => {
      const next = { ...prev }
      filteredList.forEach(v => {
        next[v.id] = { ...(next[v.id] || { included: select }), included: select }
      })
      return next
    })
  }

  const handleSelectMatchedOnly = () => {
    setOverrides(prev => {
      const next = { ...prev }
      processedList.forEach(v => {
        const isMatch = v.effectiveType !== 'skipped' && v.matchedEntityType !== 'unmapped' && !v.hasUnmappedItem
        next[v.id] = { ...(next[v.id] || { included: isMatch }), included: isMatch }
      })
      return next
    })
  }

  const handleTypeOverride = (voucherId: string, newType: TallyParsedXmlVoucher['normalizedType']) => {
    setOverrides(prev => ({
      ...prev,
      [voucherId]: {
        ...(prev[voucherId] || { included: true }),
        typeOverride: newType,
        matchedEntityId: undefined
      }
    }))
  }

  const handleEntityOverride = (voucherId: string, entityId: string, entityType: 'customer' | 'supplier' | 'expense' | 'counter') => {
    setOverrides(prev => ({
      ...prev,
      [voucherId]: {
        ...(prev[voucherId] || { included: true }),
        matchedEntityType: entityType,
        matchedEntityId: entityId === 'auto-create' ? undefined : entityId
      }
    }))
  }

  const handleIncludeToggle = (voucherId: string, included: boolean) => {
    setOverrides(prev => ({
      ...prev,
      [voucherId]: {
        ...(prev[voucherId] || { included }),
        included
      }
    }))
  }

  const processFile = async (file: File) => {
    setFileName(file.name)
    setIsParsing(true)

    const isXml = file.name.toLowerCase().endsWith('.xml')
    const validExtensions = ['.xml', '.xlsx', '.xls', '.csv']
    const hasValidExt = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext))

    if (!hasValidExt) {
      toast.error('Invalid file format. Please upload an XML (.xml), Excel (.xlsx, .xls) or CSV file.')
      setIsParsing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    try {
      if (isXml) {
        const buffer = await file.arrayBuffer()
        const text = decodeXmlFileBuffer(buffer)
        const result = parseTallyXmlVouchers(text, {
          customers,
          suppliers,
          items,
          expenseTypes,
          counters
        })

        setParsedVouchers(result.vouchers)
        setCandidateMasters(result.newMasterCandidates)

        const initialOverrides: Record<string, VoucherRowOverride> = {}
        result.vouchers.forEach(v => {
          initialOverrides[v.id] = {
            included: v.normalizedType !== 'skipped'
          }
        })
        setOverrides(initialOverrides)

        if (result.success && result.vouchers.length > 0) {
          toast.success(`Successfully parsed ${result.summary.totalParsed} Tally XML voucher(s)`)
        } else if (result.vouchers.length > 0) {
          toast.warning(`Parsed ${result.vouchers.length} voucher(s) with notices: ${result.warnings.join(', ')}`)
        } else {
          toast.error(result.errors[0] || 'No valid vouchers found in XML envelope')
        }
      } else {
        const buffer = await file.arrayBuffer()
        const result = parseTallyAccountingVouchersExcel(buffer, {
          customers,
          suppliers,
          items,
          expenseTypes,
          counters
        } as any)

        setParsedVouchers(result.vouchers)
        setCandidateMasters(result.newMasterCandidates)

        const initialOverrides: Record<string, VoucherRowOverride> = {}
        result.vouchers.forEach(v => {
          initialOverrides[v.id] = {
            included: v.normalizedType !== 'skipped'
          }
        })
        setOverrides(initialOverrides)

        if (result.success && result.vouchers.length > 0) {
          toast.success(`Parsed ${result.vouchers.length} Tally voucher(s) from Excel`)
        } else if (result.vouchers.length > 0) {
          toast.warning(`Parsed ${result.vouchers.length} voucher(s) with validation notices`)
        } else {
          toast.error(result.errors[0] || 'No valid vouchers found in file')
        }
      }
    } catch (err: any) {
      toast.error(`Import failed: ${err?.message || 'Error processing file'}`)
    } finally {
      setIsParsing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    await processFile(files[0])
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      await processFile(files[0])
    }
  }

  const handleCommit = () => {
    const newPayments: Payment[] = []
    const newCustomerPayments: CustomerPayment[] = []
    const newSalesInvoices: SalesInvoice[] = []
    const newPurchaseInvoices: PurchaseInvoice[] = []
    const newCreditNotes: CustomerCreditNote[] = []
    const newDebitNotes: SupplierDebitNote[] = []
    const newExpenseEntries: ExpenseEntry[] = []
    const newCashBankTransactions: CashBankTransaction[] = []

    const generatedCustomers: Customer[] = []
    const generatedSuppliers: Supplier[] = []
    const generatedExpenseTypes: ExpenseType[] = []
    const generatedCounters: Counter[] = []
    const generatedItems: Item[] = []

    const autoCustMap = new Map<string, string>()
    const autoSuppMap = new Map<string, string>()
    const autoExpMap = new Map<string, string>()
    const autoCntrMap = new Map<string, string>()
    const autoItemMap = new Map<string, string>()

    const activeModuleVouchers = processedList.filter(v => {
      const modKey = v.effectiveType as keyof typeof selectedModules
      if (modKey in selectedModules && !selectedModules[modKey]) return false
      return true
    })

    if (autoCreateMasters) {
      const timestamp = Date.now()
      let custSeq = 0, suppSeq = 0, expSeq = 0, cntrSeq = 0, itemSeq = 0

      activeModuleVouchers.forEach(v => {
        if (!v.isIncluded || v.effectiveType === 'skipped') return
        const norm = v.partyName.trim().toLowerCase()

        if (v.isAutoCreated) {
          if (v.matchedEntityType === 'customer' && !customerMap.has(norm) && !autoCustMap.has(norm)) {
            custSeq++
            const newId = `cust-auto-${timestamp}-${custSeq}`
            autoCustMap.set(norm, newId)
            generatedCustomers.push({
              id: newId,
              name: v.partyName.trim(),
              gstin: v.partyGstin || '',
              address: '',
              stateCode: '19',
              createdAt: timestamp
            } as Customer)
          } else if (v.matchedEntityType === 'supplier' && !supplierMap.has(norm) && !autoSuppMap.has(norm)) {
            suppSeq++
            const newId = `supp-auto-${timestamp}-${suppSeq}`
            autoSuppMap.set(norm, newId)
            generatedSuppliers.push({
              id: newId,
              name: v.partyName.trim(),
              gstin: v.partyGstin || '',
              address: '',
              stateCode: '19',
              paymentCDRules: [],
              invoiceCloseCDRules: [],
              createdAt: timestamp
            } as Supplier)
          } else if (v.matchedEntityType === 'expense' && !expenseTypeMap.has(norm) && !autoExpMap.has(norm)) {
            expSeq++
            const newId = `exp-auto-${timestamp}-${expSeq}`
            autoExpMap.set(norm, newId)
            generatedExpenseTypes.push({
              id: newId,
              name: v.partyName.trim(),
              linkType: 'netprofit',
              costLinkingType: 'net_profit'
            } as ExpenseType)
          }
        }

        // Auto-Create Missing Inventory Items
        (v.inventory || []).forEach((inv, iIdx) => {
          const normItem = inv.itemName.trim().toLowerCase()
          const customMappingId = itemOverrides[v.id]?.[iIdx] || itemMappings[normItem]
          const isMappedToExisting = customMappingId && customMappingId !== 'auto-create' && items.some(it => it.id === customMappingId)
          const isExactMatch = itemMap.has(normItem)

          if (!isMappedToExisting && !isExactMatch && !autoItemMap.has(normItem)) {
            itemSeq++
            const newId = `item-auto-${timestamp}-${itemSeq}`
            autoItemMap.set(normItem, newId)
            generatedItems.push({
              id: newId,
              name: inv.itemName.trim(),
              unit: inv.unit || 'PCS',
              purchasePrice: inv.rate || 0,
              salesPrice: inv.rate || 0,
              gstRate: 18,
              openingStock: 0,
              openingValue: 0
            } as Item)
          }
        })

        if (v.effectiveType === 'contra') {
          const fromName = (v.contraDetails?.fromCounterName || '').trim()
          const toName = (v.contraDetails?.toCounterName || '').trim()
          if (fromName && !counterMap.has(fromName.toLowerCase()) && !autoCntrMap.has(fromName.toLowerCase())) {
            cntrSeq++
            const newId = `cntr-auto-${timestamp}-${cntrSeq}`
            autoCntrMap.set(fromName.toLowerCase(), newId)
            generatedCounters.push({
              id: newId,
              name: fromName,
              type: fromName.toLowerCase().includes('cash') ? 'Cash' : 'Bank',
              openingBalance: 0,
              currentBalance: 0
            } as Counter)
          }
          if (toName && !counterMap.has(toName.toLowerCase()) && !autoCntrMap.has(toName.toLowerCase())) {
            cntrSeq++
            const newId = `cntr-auto-${timestamp}-${cntrSeq}`
            autoCntrMap.set(toName.toLowerCase(), newId)
            generatedCounters.push({
              id: newId,
              name: toName,
              type: toName.toLowerCase().includes('cash') ? 'Cash' : 'Bank',
              openingBalance: 0,
              currentBalance: 0
            } as Counter)
          }
        }
      })
    }

    activeModuleVouchers.forEach((v, idx) => {
      if (!v.isIncluded || v.effectiveType === 'skipped') return
      const norm = v.partyName.trim().toLowerCase()

      const targetCustId = v.matchedEntityId || autoCustMap.get(norm) || customerMap.get(norm)?.id
      const targetSuppId = v.matchedEntityId || autoSuppMap.get(norm) || supplierMap.get(norm)?.id
      const targetExpId = v.matchedEntityId || autoExpMap.get(norm) || expenseTypeMap.get(norm)?.id

      const fallbackCounterId = counters[0]?.id || 'counter-default'
      const fallbackCounterName = counters[0]?.name || 'Cash/Bank Counter'
      const contraFromId = v.contraDetails?.fromCounterId || autoCntrMap.get((v.contraDetails?.fromCounterName || '').toLowerCase()) || counterMap.get((v.contraDetails?.fromCounterName || '').toLowerCase())?.id || fallbackCounterId
      const contraToId = v.contraDetails?.toCounterId || autoCntrMap.get((v.contraDetails?.toCounterName || '').toLowerCase()) || counterMap.get((v.contraDetails?.toCounterName || '').toLowerCase())?.id || fallbackCounterId

      const resolveInvoiceItems = (): InvoiceItem[] => {
        if (v.inventory && v.inventory.length > 0) {
          return v.inventory.map((inv, iIdx) => {
            const normItem = inv.itemName.trim().toLowerCase()
            const customMappingId = itemOverrides[v.id]?.[iIdx] || itemMappings[normItem]
            const resolvedItem = customMappingId && customMappingId !== 'auto-create'
              ? items.find(it => it.id === customMappingId)
              : itemMap.get(normItem)

            const itemId = resolvedItem?.id || autoItemMap.get(normItem) || `item-gen-${iIdx + 1}`
            const itemName = resolvedItem?.name || inv.itemName
            const unit = resolvedItem?.unit || inv.unit || 'PCS'
            const gstRate = resolvedItem?.gstRate || 18

            return {
              itemId,
              enteredQuantity: inv.quantity || 1,
              enteredUnit: unit,
              baseQuantity: inv.quantity || 1,
              rate: inv.rate || 0,
              amount: inv.amount || ((inv.quantity || 1) * (inv.rate || 0)),
              taxableAmount: inv.amount || ((inv.quantity || 1) * (inv.rate || 0)),
              gstRate,
              cgstAmount: 0,
              sgstAmount: 0,
              igstAmount: 0,
              itemNameSnapshot: itemName,
              itemUnitSnapshot: unit
            }
          })
        }
        return [{
          itemId: 'item-gen-generic',
          enteredQuantity: 1,
          enteredUnit: 'PCS',
          baseQuantity: 1,
          rate: v.totalAmount,
          amount: v.totalAmount,
          taxableAmount: v.totalAmount,
          gstRate: 0,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: 0,
          itemNameSnapshot: v.partyName || 'General Item',
          itemUnitSnapshot: 'PCS'
        }]
      }

      if (v.effectiveType === 'payment') {
        newPayments.push({
          id: `pay-tally-${Date.now()}-${idx}`,
          paymentDate: v.voucherDate,
          supplierId: targetSuppId || 'supp-unmapped',
          amount: v.totalAmount,
          paymentMode: 'bank_transfer',
          notes: v.narration || `Tally Import: ${v.voucherNumber}`,
          fy: currentFY,
          createdAt: Date.now()
        } as unknown as Payment)
      } else if (v.effectiveType === 'receipt') {
        newCustomerPayments.push({
          id: `cp-tally-${Date.now()}-${idx}`,
          paymentDate: v.voucherDate,
          customerId: targetCustId || 'cust-unmapped',
          amount: v.totalAmount,
          paymentMode: 'bank_transfer',
          counterId: fallbackCounterId,
          counterName: fallbackCounterName,
          notes: v.narration || `Tally Import: ${v.voucherNumber}`,
          fy: currentFY,
          createdAt: Date.now()
        } as unknown as CustomerPayment)
      } else if (v.effectiveType === 'sales') {
        newSalesInvoices.push({
          id: `sinv-tally-${Date.now()}-${idx}`,
          invoiceNo: v.voucherNumber,
          invoiceDate: v.voucherDate,
          customerId: targetCustId || 'cust-unmapped',
          totalAmount: v.totalAmount,
          invoiceAmount: v.totalAmount,
          items: resolveInvoiceItems(),
          additionalCharges: (v.additionalCharges || []).map(ch => ({
            id: ch.id,
            chargeName: ch.ledgerName,
            amount: ch.finalAmt,
            taxableAmount: ch.taxableAmount,
            gstRate: ch.gstRate,
            cgstAmount: ch.cgstAmount,
            sgstAmount: ch.sgstAmount,
            igstAmount: ch.igstAmount
          })),
          notes: v.narration || `Tally Sales: ${v.voucherNumber}`,
          fy: currentFY,
          createdAt: Date.now()
        } as unknown as SalesInvoice)
      } else if (v.effectiveType === 'purchase') {
        newPurchaseInvoices.push({
          id: `pinv-tally-${Date.now()}-${idx}`,
          invoiceNo: v.voucherNumber,
          invoiceDate: v.voucherDate,
          supplierId: targetSuppId || 'supp-unmapped',
          totalAmount: v.totalAmount,
          invoiceAmount: v.totalAmount,
          items: resolveInvoiceItems(),
          additionalCharges: (v.additionalCharges || []).map(ch => ({
            id: ch.id,
            chargeName: ch.ledgerName,
            amount: ch.finalAmt,
            taxableAmount: ch.taxableAmount,
            gstRate: ch.gstRate,
            cgstAmount: ch.cgstAmount,
            sgstAmount: ch.sgstAmount,
            igstAmount: ch.igstAmount
          })),
          notes: v.narration || `Tally Purchase: ${v.voucherNumber}`,
          fy: currentFY,
          createdAt: Date.now()
        } as unknown as PurchaseInvoice)
      } else if (v.effectiveType === 'credit_note') {
        newCreditNotes.push({
          id: `cn-tally-${Date.now()}-${idx}`,
          creditNoteNo: v.voucherNumber,
          date: v.voucherDate,
          customerId: targetCustId || 'cust-unmapped',
          amount: v.totalAmount,
          reason: v.narration || 'Tally Credit Note Import',
          fy: currentFY,
          createdAt: Date.now()
        } as unknown as CustomerCreditNote)
      } else if (v.effectiveType === 'debit_note') {
        newDebitNotes.push({
          id: `dn-tally-${Date.now()}-${idx}`,
          debitNoteNo: v.voucherNumber,
          date: v.voucherDate,
          supplierId: targetSuppId || 'supp-unmapped',
          amount: v.totalAmount,
          reason: v.narration || 'Tally Debit Note Import',
          fy: currentFY,
          createdAt: Date.now()
        } as unknown as SupplierDebitNote)
      } else if (v.effectiveType === 'expense') {
        newExpenseEntries.push({
          id: `exp-tally-${Date.now()}-${idx}`,
          expenseDate: v.voucherDate,
          expenseTypeId: targetExpId || 'exp-unmapped',
          amount: v.totalAmount,
          description: v.narration || `Tally Expense: ${v.partyName}`,
          paymentMode: 'bank_transfer',
          fy: currentFY,
          createdAt: Date.now()
        } as unknown as ExpenseEntry)
      } else if (v.effectiveType === 'contra') {
        newCashBankTransactions.push({
          id: `cbt-tally-${Date.now()}-${idx}`,
          date: v.voucherDate,
          type: 'Transfer',
          counterId: contraFromId,
          counterName: v.contraDetails?.fromCounterName || 'Source Counter',
          amount: v.totalAmount,
          toCounterId: contraToId,
          toCounterName: v.contraDetails?.toCounterName || 'Destination Counter',
          narration: v.narration || `Tally Contra: ${v.voucherNumber}`
        } as unknown as CashBankTransaction)
      }
    })

    // Execute state updates
    if (generatedCustomers.length > 0) setCustomers([...customers, ...generatedCustomers])
    if (generatedSuppliers.length > 0) setSuppliers([...suppliers, ...generatedSuppliers])
    if (generatedExpenseTypes.length > 0) setExpenseTypes([...expenseTypes, ...generatedExpenseTypes])
    if (generatedCounters.length > 0) setCashBankCounters([...cashBankCounters, ...generatedCounters])
    if (generatedItems.length > 0) setItems([...items, ...generatedItems])

    if (newPayments.length > 0) setPayments([...payments, ...newPayments])
    if (newCustomerPayments.length > 0) setCustomerPayments([...customerPayments, ...newCustomerPayments])
    if (newSalesInvoices.length > 0) setSalesInvoices([...salesInvoices, ...newSalesInvoices])
    if (newPurchaseInvoices.length > 0) setPurchaseInvoices([...purchaseInvoices, ...newPurchaseInvoices])
    if (newCreditNotes.length > 0) setCreditNotes([...creditNotes, ...newCreditNotes])
    if (newDebitNotes.length > 0) setDebitNotes([...debitNotes, ...newDebitNotes])
    if (newExpenseEntries.length > 0) setExpenseEntries([...expenseEntries, ...newExpenseEntries])
    if (newCashBankTransactions.length > 0) setCashBankTransactions([...cashBankTransactions, ...newCashBankTransactions])

    const grandTotal = newPayments.length + newCustomerPayments.length + newSalesInvoices.length + newPurchaseInvoices.length + newCreditNotes.length + newDebitNotes.length + newExpenseEntries.length + newCashBankTransactions.length

    toast.success(`Successfully imported ${grandTotal} voucher(s) into Zohan ERP!`)
    setParsedVouchers([])
    setFileName(null)
    setOverrides({})
    setItemMappings({})
    setItemOverrides({})
  }

  const getVoucherBadge = (type: string, raw: string) => {
    switch (type) {
      case 'sales':
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] font-bold">Sales</Badge>
      case 'purchase':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[10px] font-bold">Purchase</Badge>
      case 'receipt':
        return <Badge className="bg-green-100 text-green-800 border-green-200 text-[10px] font-bold">Receipt</Badge>
      case 'payment':
        return <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 text-[10px] font-bold">Payment</Badge>
      case 'contra':
        return <Badge className="bg-cyan-100 text-cyan-800 border-cyan-200 text-[10px] font-bold">Contra</Badge>
      case 'expense':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] font-bold">Expense</Badge>
      case 'credit_note':
        return <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-[10px] font-bold">Credit Note</Badge>
      case 'debit_note':
        return <Badge className="bg-rose-100 text-rose-800 border-rose-200 text-[10px] font-bold">Debit Note</Badge>
      case 'skipped':
        return <Badge variant="outline" className="text-[10px] text-slate-400 bg-slate-50">Skipped (Journal)</Badge>
      default:
        return <Badge variant="outline" className="text-[10px] text-slate-500">{raw}</Badge>
    }
  }

  // ==========================================
  // 2. EXPORT WORKSPACE STATE & LOGIC
  // ==========================================
  const currentMonthNum = new Date().getMonth() + 1
  const [selectedMonth, setSelectedMonth] = useState<string>(String(currentMonthNum))
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()))

  const [includeSales, setIncludeSales] = useState(true)
  const [includePurchases, setIncludePurchases] = useState(true)
  const [includeNotes, setIncludeNotes] = useState(true)
  const [includeExpenses, setIncludeExpenses] = useState(true)
  const [includePayments, setIncludePayments] = useState(true)

  const [ledgerMapping, setLedgerMapping] = useState<TallyLedgerMapping>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TALLY_MAPPING)
      return saved ? { ...DEFAULT_TALLY_LEDGER_MAPPING, ...JSON.parse(saved) } : DEFAULT_TALLY_LEDGER_MAPPING
    } catch {
      return DEFAULT_TALLY_LEDGER_MAPPING
    }
  })
  const [showMappingSettings, setShowMappingSettings] = useState(false)
  const [tempMapping, setTempMapping] = useState<TallyLedgerMapping>(ledgerMapping)

  const filterByPeriod = (dateStr?: string) => {
    if (!dateStr) return true
    const m = parseInt(selectedMonth, 10)
    const y = parseInt(selectedYear, 10)
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return true
    if (m === 0) return true
    return (d.getMonth() + 1) === m && d.getFullYear() === y
  }

  const filteredSales = useMemo(() => salesInvoices.filter(i => filterByPeriod(i.invoiceDate)), [salesInvoices, selectedMonth, selectedYear])
  const filteredPurchases = useMemo(() => purchaseInvoices.filter(i => filterByPeriod(i.invoiceDate)), [purchaseInvoices, selectedMonth, selectedYear])
  const filteredCreditNotes = useMemo(() => creditNotes.filter(n => filterByPeriod(n.date)), [creditNotes, selectedMonth, selectedYear])
  const filteredDebitNotes = useMemo(() => debitNotes.filter(n => filterByPeriod(n.date)), [debitNotes, selectedMonth, selectedYear])
  const filteredExpenses = useMemo(() => expenseEntries.filter(e => filterByPeriod(e.expenseDate)), [expenseEntries, selectedMonth, selectedYear])
  const filteredPayments = useMemo(() => payments.filter(p => filterByPeriod(p.paymentDate)), [payments, selectedMonth, selectedYear])
  const filteredCustomerPayments = useMemo(() => customerPayments.filter(p => filterByPeriod(p.paymentDate)), [customerPayments, selectedMonth, selectedYear])

  const exportSalesVouchers = useMemo(() => {
    if (!includeSales) return []
    return generateTallySalesVouchers(filteredSales, customers, items, ledgerMapping, companyStateCode)
  }, [includeSales, filteredSales, customers, items, ledgerMapping, companyStateCode])

  const exportPurchaseVouchers = useMemo(() => {
    if (!includePurchases) return []
    return generateTallyPurchaseVouchers(filteredPurchases, suppliers, items, ledgerMapping, companyStateCode)
  }, [includePurchases, filteredPurchases, suppliers, items, ledgerMapping, companyStateCode])

  const exportNoteVouchers = useMemo(() => {
    if (!includeNotes) return []
    const cn = generateTallyCreditNoteVouchers(filteredCreditNotes, customers, ledgerMapping, companyStateCode)
    const dn = generateTallyDebitNoteVouchers(filteredDebitNotes, suppliers, ledgerMapping, companyStateCode)
    return [...cn, ...dn]
  }, [includeNotes, filteredCreditNotes, filteredDebitNotes, customers, suppliers, ledgerMapping, companyStateCode])

  const exportExpenseVouchers = useMemo(() => {
    if (!includeExpenses) return []
    return generateTallyExpenseVouchers(filteredExpenses, expenseTypes, ledgerMapping, companyStateCode)
  }, [includeExpenses, filteredExpenses, expenseTypes, ledgerMapping, companyStateCode])

  const exportPaymentVouchers = useMemo(() => {
    if (!includePayments) return []
    const supplierMapLocal = new Map(suppliers.map(s => [s.id, s]))
    const customerMapLocal = new Map(customers.map(c => [c.id, c]))
    const list: TallyCompoundVoucher[] = []

    filteredPayments.forEach((p, idx) => {
      const sup = supplierMapLocal.get(p.supplierId)
      const partyName = sup?.name || 'Supplier Account'
      list.push({
        id: p.id || `pay-${idx}`,
        voucherNumber: `PAY-${p.paymentDate?.replace(/-/g, '') || '000'}-${idx + 1}`,
        voucherDate: p.paymentDate || new Date().toISOString().split('T')[0],
        displayDate: p.paymentDate || '',
        voucherType: 'Payment',
        partyName,
        partyAddress: [sup?.address, sup?.city].filter(Boolean).join(', '),
        partyPincode: sup?.pincode,
        partyGstin: sup?.gstin,
        narration: `Being payment of ₹${p.amount} made to ${partyName}`,
        legs: [
          { ledgerName: partyName, amount: p.amount, drCr: 'Dr' },
          { ledgerName: p.counterName || ledgerMapping.defaultBankLedgerName, amount: p.amount, drCr: 'Cr' }
        ],
        totalAmount: p.amount,
        isBalanced: true,
        imbalanceDifference: 0
      })
    })

    filteredCustomerPayments.forEach((cp, idx) => {
      const cust = customerMapLocal.get(cp.customerId)
      const partyName = cust?.name || 'Customer Account'
      list.push({
        id: cp.id || `rec-${idx}`,
        voucherNumber: `REC-${cp.paymentDate?.replace(/-/g, '') || '000'}-${idx + 1}`,
        voucherDate: cp.paymentDate || new Date().toISOString().split('T')[0],
        displayDate: cp.paymentDate || '',
        voucherType: 'Receipt',
        partyName,
        partyAddress: [cust?.address, cust?.city].filter(Boolean).join(', '),
        partyPincode: cust?.pincode,
        partyGstin: cust?.gstin,
        narration: `Being receipt of ₹${cp.amount} received from ${partyName}`,
        legs: [
          { ledgerName: cp.counterName || ledgerMapping.defaultBankLedgerName, amount: cp.amount, drCr: 'Dr' },
          { ledgerName: partyName, amount: cp.amount, drCr: 'Cr' }
        ],
        totalAmount: cp.amount,
        isBalanced: true,
        imbalanceDifference: 0
      })
    })

    return list
  }, [includePayments, filteredPayments, filteredCustomerPayments, suppliers, customers, ledgerMapping])

  const allExportCompoundVouchers = useMemo(() => {
    return [
      ...exportSalesVouchers,
      ...exportPurchaseVouchers,
      ...exportNoteVouchers,
      ...exportExpenseVouchers,
      ...exportPaymentVouchers
    ]
  }, [exportSalesVouchers, exportPurchaseVouchers, exportNoteVouchers, exportExpenseVouchers, exportPaymentVouchers])

  const handleExportXML = () => {
    if (allExportCompoundVouchers.length === 0) {
      toast.error('No vouchers match the selected period and modules to export')
      return
    }
    const xml = generateTallyXML(allExportCompoundVouchers, businessName)
    const monthLabel = MONTH_OPTIONS.find(m => m.value === selectedMonth)?.label || 'Period'
    const fileNameExport = `Tally_Export_${businessName.replace(/[^a-zA-Z0-9]/g, '_')}_${selectedYear}_${monthLabel.replace(/\s+/g, '_')}.xml`
    downloadTallyXML(xml, fileNameExport)
    toast.success(`Exported ${allExportCompoundVouchers.length} voucher(s) to Tally XML!`)
  }

  const handleExportExcel = () => {
    if (allExportCompoundVouchers.length === 0) {
      toast.error('No vouchers match the selected period and modules to export')
      return
    }
    const monthLabel = MONTH_OPTIONS.find(m => m.value === selectedMonth)?.label || 'Period'
    const fileNameExport = `Tally_Export_${businessName.replace(/[^a-zA-Z0-9]/g, '_')}_${selectedYear}_${monthLabel.replace(/\s+/g, '_')}.xlsx`
    exportCompoundVouchersToTallyExcel(allExportCompoundVouchers, { filename: fileNameExport })
    toast.success(`Exported ${allExportCompoundVouchers.length} voucher(s) to Tally Excel!`)
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50/60 pb-16 space-y-6">
      {/* 1. Page Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-5 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-200">
              <ArrowsLeftRight className="w-6 h-6" weight="bold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">Tally Integration Hub</h1>
                <Badge className="bg-violet-100 text-violet-800 border-violet-200 text-[11px] font-bold">
                  Prime & ERP 9 XML / Excel
                </Badge>
                {fileName && (
                  <Badge variant="outline" className="text-xs font-mono text-emerald-700 bg-emerald-50 border-emerald-200">
                    File: {fileName}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Bidirectional data synchronization: Ingest Tally vouchers with item & master mapping, or export clean XML envelopes to Tally.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                generateSampleTallyExcel()
                toast.success('Downloaded Sample Tally Excel Template')
              }}
              className="text-xs h-9 px-3.5 rounded-xl border-slate-200 font-semibold text-slate-700 bg-white hover:bg-slate-50 shadow-2xs"
            >
              <DownloadSimple className="w-4 h-4 mr-1.5 text-slate-500" />
              Download Template
            </Button>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-auto">
              <TabsList className="bg-slate-100/90 p-1 h-9 rounded-xl border border-slate-200/80">
                <TabsTrigger value="import" className="text-xs px-3.5 py-1 font-bold rounded-lg data-[state=active]:bg-white data-[state=active]:text-violet-700 data-[state=active]:shadow-xs">
                  <FileArrowUp className="w-3.5 h-3.5 mr-1.5" />
                  Import from Tally
                </TabsTrigger>
                <TabsTrigger value="export" className="text-xs px-3.5 py-1 font-bold rounded-lg data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-xs">
                  <FileCode className="w-3.5 h-3.5 mr-1.5" />
                  Export to Tally
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </div>

      {/* 2. Main Page Content */}
      <div className="px-6 flex-1 flex flex-col space-y-6">
        {activeTab === 'import' ? (
          <div className="flex-1 flex flex-col space-y-5">
            {/* Step A: Upload Zone (or Compact Banner if file active) */}
            {parsedVouchers.length === 0 ? (
              <Card className="border-2 border-dashed border-violet-200 bg-white hover:border-violet-400 transition-all shadow-xs rounded-2xl">
                <CardContent className="p-8">
                  <div
                    className={cn(
                      'flex flex-col items-center justify-center text-center p-8 rounded-xl transition-all cursor-pointer bg-slate-50/50 hover:bg-violet-50/30',
                      isDragging && 'border-violet-600 bg-violet-50/60 scale-[0.99]'
                    )}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xml,.xlsx,.xls,.csv"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <div className="w-16 h-16 rounded-2xl bg-violet-100 text-violet-700 flex items-center justify-center mb-4 shadow-xs">
                      <FileArrowUp className="w-8 h-8" weight="duotone" />
                    </div>
                    <h3 className="text-base font-bold text-slate-800">
                      Upload Tally Daybook / Voucher Export
                    </h3>
                    <p className="text-xs text-slate-500 max-w-md mt-1 mb-4">
                      Drag and drop your Tally Daybook XML (Exported from Tally Prime / ERP 9) or 14-Column Excel Sheet.
                    </p>
                    <div className="flex items-center gap-3">
                      <Button
                        size="sm"
                        disabled={isParsing}
                        className="bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs h-9 px-5 rounded-xl shadow-xs"
                      >
                        {isParsing ? <ArrowsClockwise className="w-4 h-4 mr-2 animate-spin" /> : <FileCode className="w-4 h-4 mr-2" />}
                        Browse File (XML or Excel)
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          generateSampleTallyExcel()
                          toast.success('Downloaded Sample Tally Excel Template')
                        }}
                        className="text-xs h-9 px-4 rounded-xl border-slate-200 text-slate-600 bg-white hover:bg-slate-50"
                      >
                        <DownloadSimple className="w-3.5 h-3.5 mr-1.5" />
                        Sample Excel
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-4">
                {/* 1. Header with file details and reset */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                      <CheckCircle className="w-5 h-5" weight="fill" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm font-mono">{fileName}</span>
                        <Badge className="bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                          {processedList.length} Total Vouchers Loaded
                        </Badge>
                      </div>
                      <span className="text-xs text-slate-500">
                        {selectedCount} vouchers selected for database ingestion.
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs h-8 rounded-lg font-semibold"
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xml,.xlsx,.xls,.csv"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <FileArrowUp className="w-3.5 h-3.5 mr-1" />
                      Upload New File
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setParsedVouchers([])
                        setFileName(null)
                        setOverrides({})
                        setItemMappings({})
                        setItemOverrides({})
                      }}
                      className="text-xs h-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg"
                    >
                      Clear File
                    </Button>
                  </div>
                </div>

                {/* 2. Module Selector Bar */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3 bg-slate-50/80 rounded-xl border border-slate-200/80">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mr-1">
                      <Funnel size={14} className="text-violet-600" />
                      Modules to Import:
                    </span>

                    <Badge
                      variant="outline"
                      onClick={() => toggleModule('sales', !selectedModules.sales)}
                      className={cn(
                        'cursor-pointer px-2.5 py-1 rounded-lg text-xs font-semibold transition-all select-none',
                        selectedModules.sales ? 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-2xs font-bold' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-100 opacity-60'
                      )}
                    >
                      <Checkbox checked={selectedModules.sales} className="mr-1.5 h-3.5 w-3.5" />
                      Sales Invoices <span className="ml-1 text-[10px] opacity-80">({moduleCounts.sales})</span>
                    </Badge>

                    <Badge
                      variant="outline"
                      onClick={() => toggleModule('purchase', !selectedModules.purchase)}
                      className={cn(
                        'cursor-pointer px-2.5 py-1 rounded-lg text-xs font-semibold transition-all select-none',
                        selectedModules.purchase ? 'bg-blue-50 text-blue-800 border-blue-300 shadow-2xs font-bold' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-100 opacity-60'
                      )}
                    >
                      <Checkbox checked={selectedModules.purchase} className="mr-1.5 h-3.5 w-3.5" />
                      Purchase Invoices <span className="ml-1 text-[10px] opacity-80">({moduleCounts.purchase})</span>
                    </Badge>

                    <Badge
                      variant="outline"
                      onClick={() => toggleModule('receipt', !selectedModules.receipt)}
                      className={cn(
                        'cursor-pointer px-2.5 py-1 rounded-lg text-xs font-semibold transition-all select-none',
                        selectedModules.receipt ? 'bg-indigo-50 text-indigo-800 border-indigo-300 shadow-2xs font-bold' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-100 opacity-60'
                      )}
                    >
                      <Checkbox checked={selectedModules.receipt} className="mr-1.5 h-3.5 w-3.5" />
                      Customer Payments <span className="ml-1 text-[10px] opacity-80">({moduleCounts.receipt})</span>
                    </Badge>

                    <Badge
                      variant="outline"
                      onClick={() => toggleModule('payment', !selectedModules.payment)}
                      className={cn(
                        'cursor-pointer px-2.5 py-1 rounded-lg text-xs font-semibold transition-all select-none',
                        selectedModules.payment ? 'bg-violet-50 text-violet-800 border-violet-300 shadow-2xs font-bold' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-100 opacity-60'
                      )}
                    >
                      <Checkbox checked={selectedModules.payment} className="mr-1.5 h-3.5 w-3.5" />
                      Supplier Payments <span className="ml-1 text-[10px] opacity-80">({moduleCounts.payment})</span>
                    </Badge>

                    <Badge
                      variant="outline"
                      onClick={() => toggleModule('expense', !selectedModules.expense)}
                      className={cn(
                        'cursor-pointer px-2.5 py-1 rounded-lg text-xs font-semibold transition-all select-none',
                        selectedModules.expense ? 'bg-amber-50 text-amber-800 border-amber-300 shadow-2xs font-bold' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-100 opacity-60'
                      )}
                    >
                      <Checkbox checked={selectedModules.expense} className="mr-1.5 h-3.5 w-3.5" />
                      Expenses <span className="ml-1 text-[10px] opacity-80">({moduleCounts.expense})</span>
                    </Badge>

                    <Badge
                      variant="outline"
                      onClick={() => toggleModule('contra', !selectedModules.contra)}
                      className={cn(
                        'cursor-pointer px-2.5 py-1 rounded-lg text-xs font-semibold transition-all select-none',
                        selectedModules.contra ? 'bg-cyan-50 text-cyan-800 border-cyan-300 shadow-2xs font-bold' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-100 opacity-60'
                      )}
                    >
                      <Checkbox checked={selectedModules.contra} className="mr-1.5 h-3.5 w-3.5" />
                      Contra Transfers <span className="ml-1 text-[10px] opacity-80">({moduleCounts.contra})</span>
                    </Badge>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button variant="outline" size="sm" onClick={selectOnlyInvoices} className="h-7 text-[11px] font-semibold px-2 rounded-lg bg-white">
                      Select Only Invoices
                    </Button>
                    <Button variant="outline" size="sm" onClick={selectOnlyBanking} className="h-7 text-[11px] font-semibold px-2 rounded-lg bg-white">
                      Select Only Banking
                    </Button>
                    <Button variant="outline" size="sm" onClick={selectAllModules} className="h-7 text-[11px] font-semibold px-2 rounded-lg bg-white">
                      Select All
                    </Button>
                    <Button variant="ghost" size="sm" onClick={deselectAllModules} className="h-7 text-[11px] font-semibold px-2 rounded-lg text-slate-500 hover:text-slate-900">
                      Clear
                    </Button>
                  </div>
                </div>

                {/* 3. Candidate Masters & Item Mapping Bar */}
                <div className="flex flex-col gap-2 p-3 bg-gradient-to-r from-violet-50/70 via-purple-50/50 to-indigo-50/70 rounded-xl border border-violet-100">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Switch
                          id="autoCreateMasters"
                          checked={autoCreateMasters}
                          onCheckedChange={setAutoCreateMasters}
                        />
                        <Label htmlFor="autoCreateMasters" className="text-xs font-bold text-slate-800 cursor-pointer flex items-center gap-1.5">
                          Auto-Create Missing Masters &amp; Ledgers
                        </Label>
                      </div>

                      {autoCreateMasters && (
                        <div className="hidden sm:flex items-center gap-1.5 text-xs text-violet-900 flex-wrap">
                          <span className="text-[11px] font-semibold text-slate-500">Will create:</span>
                          {newMastersSummary.customersCount > 0 && (
                            <Badge variant="secondary" className="text-[10px] bg-white text-emerald-800 border-emerald-200">
                              +{newMastersSummary.customersCount} Customers
                            </Badge>
                          )}
                          {newMastersSummary.suppliersCount > 0 && (
                            <Badge variant="secondary" className="text-[10px] bg-white text-blue-800 border-blue-200">
                              +{newMastersSummary.suppliersCount} Suppliers
                            </Badge>
                          )}
                          {newMastersSummary.expensesCount > 0 && (
                            <Badge variant="secondary" className="text-[10px] bg-white text-amber-800 border-amber-200">
                              +{newMastersSummary.expensesCount} Expenses
                            </Badge>
                          )}
                          {newMastersSummary.itemsCount > 0 && (
                            <Badge variant="secondary" className="text-[10px] bg-white text-purple-800 border-purple-200">
                              +{newMastersSummary.itemsCount} Items
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>

                    {distinctTallyItems.length > 0 && (
                      <Button
                        size="sm"
                        variant={showItemMappingDrawer ? 'default' : 'outline'}
                        onClick={() => setShowItemMappingDrawer(prev => !prev)}
                        className={cn(
                          'h-7 text-xs font-bold px-3 rounded-lg transition-all',
                          showItemMappingDrawer
                            ? 'bg-violet-700 text-white shadow-xs'
                            : 'bg-white text-violet-700 border-violet-200 hover:bg-violet-50'
                        )}
                      >
                        <Package className="w-3.5 h-3.5 mr-1.5" />
                        Map Inventory Items ({distinctTallyItems.length})
                        <CaretDown className={cn('w-3.5 h-3.5 ml-1.5 transition-transform duration-200', showItemMappingDrawer && 'rotate-180')} />
                      </Button>
                    )}
                  </div>

                  {/* Expandable Inventory Item Mapping Drawer */}
                  {showItemMappingDrawer && distinctTallyItems.length > 0 && (
                    <div className="mt-2 pt-3 border-t border-violet-200/80 space-y-3 bg-white/90 p-3.5 rounded-xl border shadow-2xs">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            <Package className="w-4 h-4 text-violet-600" />
                            Inventory Items Mapping &amp; Master Selector
                            <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-200 font-mono">
                              {distinctTallyItems.length} Stock Items in Vouchers
                            </Badge>
                          </h4>
                          <p className="text-[11px] text-slate-500">
                            Map each Tally stock item to an existing ERP inventory item or auto-create it as a new item master.
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="relative w-48">
                            <MagnifyingGlass size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <Input
                              value={itemSearchQuery}
                              onChange={(e) => setItemSearchQuery(e.target.value)}
                              placeholder="Search items..."
                              className="h-7 text-xs pl-7 pr-2 bg-slate-50 border-slate-200 rounded-md"
                            />
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const autoMap: Record<string, string> = {}
                              distinctTallyItems.forEach(it => {
                                if (!it.matchedItem) {
                                  autoMap[it.normName] = 'auto-create'
                                }
                              })
                              setItemMappings(prev => ({ ...prev, ...autoMap }))
                              toast.success('Set all unmapped items to Auto-Create')
                            }}
                            className="h-7 text-[11px] font-semibold px-2.5 rounded-md text-purple-700 border-purple-200 bg-purple-50 hover:bg-purple-100"
                          >
                            <Sparkle className="w-3.5 h-3.5 mr-1" />
                            Auto-Create All
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1">
                        {filteredDistinctItems.map((itemStat) => {
                          const customMappedId = itemMappings[itemStat.normName]
                          const selectedTargetItem = customMappedId && customMappedId !== 'auto-create'
                            ? items.find(it => it.id === customMappedId)
                            : itemStat.matchedItem

                          const isAutoCreated = customMappedId === 'auto-create' || (!selectedTargetItem && autoCreateMasters)

                          return (
                            <div key={itemStat.normName} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 hover:bg-slate-50 flex flex-col justify-between gap-2">
                              <div className="space-y-0.5">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-bold text-slate-800 text-xs truncate" title={itemStat.rawName}>
                                    {itemStat.rawName}
                                  </span>
                                  {selectedTargetItem ? (
                                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[9px] px-1.5 py-0">
                                      ✓ Matched
                                    </Badge>
                                  ) : isAutoCreated ? (
                                    <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-[9px] px-1.5 py-0">
                                      ✨ New Item
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-amber-700 bg-amber-50 border-amber-200 text-[9px] px-1.5 py-0">
                                      ⚠️ Unmapped
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  Total Qty: {itemStat.totalQty.toLocaleString()} {itemStat.unit} • {itemStat.voucherCount} vouchers
                                </div>
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] font-semibold text-slate-500">Map to ERP Inventory Item:</label>
                                <Select
                                  value={customMappedId || (selectedTargetItem?.id) || (isAutoCreated ? 'auto-create' : '')}
                                  onValueChange={(val) => handleGlobalItemMapping(itemStat.rawName, val)}
                                >
                                  <SelectTrigger className="h-7 text-xs bg-white border-slate-200">
                                    <SelectValue placeholder="Select ERP item" />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-60">
                                    <SelectItem value="auto-create" className="text-purple-600 font-semibold text-xs">
                                      ✨ Auto-Create &quot;{itemStat.rawName}&quot;
                                    </SelectItem>
                                    {items.map(it => (
                                      <SelectItem key={it.id} value={it.id} className="text-xs">
                                        {it.name} ({it.category || 'General'}) • {it.unit || 'PCS'}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. Filter Tabs & Search Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                    <Button
                      size="sm"
                      variant={filterTab === 'all' ? 'default' : 'outline'}
                      onClick={() => setFilterTab('all')}
                      className={cn('h-8 text-xs font-semibold px-3 rounded-lg', filterTab === 'all' && 'bg-slate-900 text-white')}
                    >
                      All ({totalCount})
                    </Button>
                    <Button
                      size="sm"
                      variant={filterTab === 'matched' ? 'default' : 'outline'}
                      onClick={() => setFilterTab('matched')}
                      className={cn('h-8 text-xs font-semibold px-3 rounded-lg text-emerald-700 border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100', filterTab === 'matched' && 'bg-emerald-600 text-white border-emerald-600')}
                    >
                      Matched ({matchedCount})
                    </Button>
                    <Button
                      size="sm"
                      variant={filterTab === 'unmapped' ? 'default' : 'outline'}
                      onClick={() => setFilterTab('unmapped')}
                      className={cn('h-8 text-xs font-semibold px-3 rounded-lg text-rose-700 border-rose-200 bg-rose-50/50 hover:bg-rose-100', filterTab === 'unmapped' && 'bg-rose-600 text-white border-rose-600')}
                    >
                      Unmapped ({unmappedCount})
                    </Button>
                    <Button
                      size="sm"
                      variant={filterTab === 'sales' ? 'default' : 'outline'}
                      onClick={() => setFilterTab('sales')}
                      className={cn('h-8 text-xs font-semibold px-3 rounded-lg', filterTab === 'sales' && 'bg-emerald-600 text-white')}
                    >
                      Sales ({moduleCounts.sales})
                    </Button>
                    <Button
                      size="sm"
                      variant={filterTab === 'purchase' ? 'default' : 'outline'}
                      onClick={() => setFilterTab('purchase')}
                      className={cn('h-8 text-xs font-semibold px-3 rounded-lg', filterTab === 'purchase' && 'bg-blue-600 text-white')}
                    >
                      Purchase ({moduleCounts.purchase})
                    </Button>
                    <Button
                      size="sm"
                      variant={filterTab === 'receipt' ? 'default' : 'outline'}
                      onClick={() => setFilterTab('receipt')}
                      className={cn('h-8 text-xs font-semibold px-3 rounded-lg', filterTab === 'receipt' && 'bg-indigo-600 text-white')}
                    >
                      Receipts ({moduleCounts.receipt})
                    </Button>
                    <Button
                      size="sm"
                      variant={filterTab === 'payment' ? 'default' : 'outline'}
                      onClick={() => setFilterTab('payment')}
                      className={cn('h-8 text-xs font-semibold px-3 rounded-lg', filterTab === 'payment' && 'bg-violet-600 text-white')}
                    >
                      Payments ({moduleCounts.payment})
                    </Button>
                    <Button
                      size="sm"
                      variant={filterTab === 'contra' ? 'default' : 'outline'}
                      onClick={() => setFilterTab('contra')}
                      className={cn('h-8 text-xs font-semibold px-3 rounded-lg', filterTab === 'contra' && 'bg-cyan-600 text-white')}
                    >
                      Contra ({moduleCounts.contra})
                    </Button>
                    <Button
                      size="sm"
                      variant={filterTab === 'expense' ? 'default' : 'outline'}
                      onClick={() => setFilterTab('expense')}
                      className={cn('h-8 text-xs font-semibold px-3 rounded-lg', filterTab === 'expense' && 'bg-amber-600 text-white')}
                    >
                      Expenses ({moduleCounts.expense})
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative flex-1 sm:w-64">
                      <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search party, voucher #, ₹..."
                        className="h-8 text-xs pl-8 pr-3 bg-slate-50 border-slate-200 rounded-lg"
                      />
                    </div>
                    <Button size="sm" variant="outline" className="h-8 text-xs font-semibold px-2.5 rounded-lg" onClick={() => handleSelectAll(true)}>
                      Select All
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs font-semibold px-2.5 rounded-lg" onClick={() => handleSelectAll(false)}>
                      Deselect All
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs font-semibold px-2.5 rounded-lg text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100" onClick={handleSelectMatchedOnly}>
                      Select Matched
                    </Button>
                  </div>
                </div>

                {/* 5. Full-Height Preview Grid */}
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                  <Table>
                    <TableHeader className="bg-slate-100/90 z-10 border-b border-slate-200">
                      <TableRow className="hover:bg-slate-100">
                        <TableHead className="w-10 text-center">
                          <Checkbox
                            checked={selectedCount > 0 && selectedCount === filteredList.filter(v => v.effectiveType !== 'skipped').length}
                            onCheckedChange={(checked) => handleSelectAll(Boolean(checked))}
                          />
                        </TableHead>
                        <TableHead className="w-8"></TableHead>
                        <TableHead className="text-xs font-bold text-slate-700">Type</TableHead>
                        <TableHead className="text-xs font-bold text-slate-700">Voucher #</TableHead>
                        <TableHead className="text-xs font-bold text-slate-700">Date</TableHead>
                        <TableHead className="text-xs font-bold text-slate-700">Party / Account</TableHead>
                        <TableHead className="text-xs font-bold text-slate-700 text-right">Amount (₹)</TableHead>
                        <TableHead className="text-xs font-bold text-slate-700 text-center">Status / Mapping</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredList.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="h-48 text-center text-slate-400 text-xs">
                            No vouchers match your current filters.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredList.map((v) => {
                          const isExpanded = expandedVoucherId === v.id

                          return (
                            <React.Fragment key={v.id}>
                              <TableRow className={cn(
                                'transition-colors text-xs cursor-pointer',
                                !v.isIncluded ? 'opacity-40 bg-slate-50/50' : 'hover:bg-slate-50/80',
                                isExpanded && 'bg-slate-100/70 border-l-4 border-l-violet-600'
                              )}>
                                <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                  <Checkbox
                                    checked={v.isIncluded}
                                    disabled={v.effectiveType === 'skipped'}
                                    onCheckedChange={(chk) => handleIncludeToggle(v.id, Boolean(chk))}
                                  />
                                </TableCell>
                                <TableCell onClick={() => setExpandedVoucherId(isExpanded ? null : v.id)}>
                                  <Button variant="ghost" size="icon" className="h-6 w-6 p-0 text-slate-400 hover:text-slate-700">
                                    {isExpanded ? <CaretDown size={14} /> : <CaretRight size={14} />}
                                  </Button>
                                </TableCell>
                                <TableCell>{getVoucherBadge(v.effectiveType, v.rawVoucherType)}</TableCell>
                                <TableCell className="font-mono text-slate-900 font-semibold">{v.voucherNumber}</TableCell>
                                <TableCell className="font-mono text-slate-500 text-[11px]">{v.displayDate}</TableCell>
                                <TableCell className="font-semibold text-slate-800 max-w-[220px]">
                                  <div className="truncate" title={v.partyName}>{v.partyName}</div>
                                  {v.inventory && v.inventory.length > 0 && (
                                    <div className="text-[10px] text-slate-400 font-normal truncate">
                                      {v.inventory.length} item{v.inventory.length > 1 ? 's' : ''}: {v.inventory[0].itemName}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="text-right font-mono font-bold text-slate-900">
                                  {formatCurrency(v.totalAmount)}
                                </TableCell>
                                <TableCell className="text-center">
                                  {v.effectiveType === 'skipped' ? (
                                    <Badge variant="outline" className="text-[10px] text-slate-400">Skip Journal</Badge>
                                  ) : v.isAutoCreated ? (
                                    <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-[10px] font-semibold">
                                      + Auto {v.matchedEntityType === 'customer' ? 'Customer' : v.matchedEntityType === 'supplier' ? 'Supplier' : v.matchedEntityType === 'expense' ? 'Expense' : 'Counter'}
                                    </Badge>
                                  ) : v.matchedEntityType === 'unmapped' ? (
                                    <Badge variant="outline" className="text-[10px] text-rose-700 bg-rose-50 border-rose-200" title={v.skipReason}>
                                      Unmapped Master
                                    </Badge>
                                  ) : v.hasUnmappedItem ? (
                                    <Badge variant="outline" className="text-[10px] text-amber-700 bg-amber-50 border-amber-200" title={v.skipReason}>
                                      Unmapped Item
                                    </Badge>
                                  ) : v.effectiveType === 'contra' || v.matchedEntityType === 'counter' ? (
                                    <Badge className="bg-cyan-100 text-cyan-800 text-[10px]">Contra Transfer</Badge>
                                  ) : v.effectiveType === 'expense' || v.matchedEntityType === 'expense' ? (
                                    <Badge className="bg-amber-100 text-amber-800 text-[10px]">Expense Match</Badge>
                                  ) : v.matchedEntityType === 'supplier' ? (
                                    <Badge className="bg-blue-100 text-blue-800 text-[10px]">Supplier Match</Badge>
                                  ) : v.matchedEntityType === 'customer' ? (
                                    <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">Customer Match</Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[10px] text-slate-600 bg-slate-50 border-slate-200">General Match</Badge>
                                  )}
                                </TableCell>
                              </TableRow>

                              {/* Expanded Inspection Drawer */}
                              {isExpanded && (
                                <TableRow className="bg-slate-50/90 border-b border-slate-200">
                                  <TableCell colSpan={8} className="p-4 space-y-3">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                                      {/* Left Col: Ledger Entries Breakdown */}
                                      <div className="space-y-2">
                                        <div className="flex items-center justify-between text-xs font-bold text-slate-700 border-b pb-1">
                                          <span>Accounting Leg Breakdown</span>
                                          <span className="text-[11px] font-mono text-slate-500 font-normal">
                                            Dr: {formatCurrency(v.drTotal)} | Cr: {formatCurrency(v.crTotal)}
                                          </span>
                                        </div>
                                        <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                                          {v.legs.map((leg, lIdx) => (
                                            <div key={lIdx} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-slate-50 border border-slate-100">
                                              <div className="flex items-center gap-1.5 truncate max-w-[240px]">
                                                <Badge variant={leg.drCr === 'Dr' ? 'default' : 'outline'} className={cn(
                                                  'text-[9px] px-1 py-0 font-mono',
                                                  leg.drCr === 'Dr' ? 'bg-blue-600 text-white' : 'text-purple-700 border-purple-200 bg-purple-50'
                                                )}>
                                                  {leg.drCr}
                                                </Badge>
                                                <span className="font-semibold text-slate-800 truncate" title={leg.ledgerName}>{leg.ledgerName}</span>
                                              </div>
                                              <span className="font-mono font-bold text-slate-900 text-[11px]">
                                                {formatCurrency(leg.amount)}
                                              </span>
                                            </div>
                                          ))}
                                        </div>

                                        {v.narration && (
                                          <div className="mt-2 text-[11px] bg-slate-50 p-2 rounded border border-slate-200 text-slate-600">
                                            <span className="font-bold text-slate-700 mr-1">Narration:</span>
                                            {v.narration}
                                          </div>
                                        )}

                                        {v.inventory && v.inventory.length > 0 && (
                                          <div className="mt-2 space-y-1.5">
                                            <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                                              <span>Inventory Items ({v.inventory.length})</span>
                                              <span className="text-[10px] text-slate-400 font-normal">Per-line item selector</span>
                                            </div>
                                            <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                                              {v.inventory.map((inv, iIdx) => {
                                                const norm = inv.itemName.trim().toLowerCase()
                                                const lineMappedId = itemOverrides[v.id]?.[iIdx] || itemMappings[norm]
                                                const resolvedItem = lineMappedId && lineMappedId !== 'auto-create'
                                                  ? items.find(it => it.id === lineMappedId)
                                                  : (inv.matchedItemId ? items.find(it => it.id === inv.matchedItemId) : null)

                                                return (
                                                  <div key={iIdx} className="p-2 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1.5 text-[11px]">
                                                    <div className="flex items-center justify-between">
                                                      <div className="font-semibold text-slate-800 truncate max-w-[200px]" title={inv.itemName}>
                                                        {inv.itemName}
                                                      </div>
                                                      <span className="font-mono text-slate-600 text-[10px]">
                                                        {inv.quantity} {inv.unit} @ ₹{inv.rate} = {formatCurrency(inv.amount)}
                                                      </span>
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                      <span className="text-[10px] text-slate-500 font-semibold shrink-0">Map Line to:</span>
                                                      <Select
                                                        value={lineMappedId || (resolvedItem?.id) || (inv.isAutoCreatedItem ? 'auto-create' : '')}
                                                        onValueChange={(val) => handleVoucherItemOverride(v.id, iIdx, val)}
                                                      >
                                                        <SelectTrigger className="h-6 text-[10px] bg-white border-slate-200 flex-1">
                                                          <SelectValue placeholder="Select item" />
                                                        </SelectTrigger>
                                                        <SelectContent className="max-h-60">
                                                          <SelectItem value="auto-create" className="text-purple-600 font-semibold text-xs">
                                                            ✨ Auto-Create &quot;{inv.itemName}&quot;
                                                          </SelectItem>
                                                          {items.map(it => (
                                                            <SelectItem key={it.id} value={it.id} className="text-xs">
                                                              {it.name} ({it.category || 'General'}) • {it.unit || 'PCS'}
                                                            </SelectItem>
                                                          ))}
                                                        </SelectContent>
                                                      </Select>
                                                    </div>
                                                  </div>
                                                )
                                              })}
                                            </div>
                                          </div>
                                        )}
                                      </div>

                                      {/* Right Col: Interactive Voucher Override Controls */}
                                      <div className="space-y-3 border-l md:pl-4 border-slate-100">
                                        <div className="text-xs font-bold text-slate-700 border-b pb-1 flex items-center justify-between">
                                          <span>Voucher Controls &amp; Re-Mapping</span>
                                          <Badge variant="outline" className="text-[10px]">
                                            ID: {v.voucherNumber}
                                          </Badge>
                                        </div>

                                        {/* 1. Voucher Type Override */}
                                        <div className="space-y-1">
                                          <label className="text-[11px] font-semibold text-slate-600">Classification Type</label>
                                          <Select
                                            value={v.effectiveType}
                                            onValueChange={val => handleTypeOverride(v.id, val as any)}
                                          >
                                            <SelectTrigger className="h-8 text-xs bg-slate-50">
                                              <SelectValue placeholder="Select type" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="payment">Supplier Payment</SelectItem>
                                              <SelectItem value="expense">Expense Entry</SelectItem>
                                              <SelectItem value="receipt">Customer Receipt</SelectItem>
                                              <SelectItem value="contra">Contra Transfer</SelectItem>
                                              <SelectItem value="sales">Sales Invoice</SelectItem>
                                              <SelectItem value="purchase">Purchase Invoice</SelectItem>
                                              <SelectItem value="credit_note">Credit Note (Sales Return)</SelectItem>
                                              <SelectItem value="debit_note">Debit Note (Purchase Return)</SelectItem>
                                              <SelectItem value="skipped">Skip / Journal</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        </div>

                                        {/* 2. Target Master Mapping */}
                                        {v.effectiveType === 'payment' || v.effectiveType === 'purchase' || v.effectiveType === 'debit_note' ? (
                                          <div className="space-y-1">
                                            <label className="text-[11px] font-semibold text-slate-600">Linked Supplier Master</label>
                                            <Select
                                              value={v.matchedEntityId || (v.isAutoCreated ? 'auto-create' : '')}
                                              onValueChange={val => handleEntityOverride(v.id, val, 'supplier')}
                                            >
                                              <SelectTrigger className="h-8 text-xs bg-slate-50">
                                                <SelectValue placeholder="Map to Supplier" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="auto-create">
                                                  ✨ Auto-Create &quot;{v.partyName}&quot;
                                                </SelectItem>
                                                {suppliers.map(s => (
                                                  <SelectItem key={s.id} value={s.id}>
                                                    {s.name}
                                                  </SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                          </div>
                                        ) : v.effectiveType === 'sales' || v.effectiveType === 'receipt' || v.effectiveType === 'credit_note' ? (
                                          <div className="space-y-1">
                                            <label className="text-[11px] font-semibold text-slate-600">Linked Customer Master</label>
                                            <Select
                                              value={v.matchedEntityId || (v.isAutoCreated ? 'auto-create' : '')}
                                              onValueChange={val => handleEntityOverride(v.id, val, 'customer')}
                                            >
                                              <SelectTrigger className="h-8 text-xs bg-slate-50">
                                                <SelectValue placeholder="Map to Customer" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="auto-create">
                                                  ✨ Auto-Create &quot;{v.partyName}&quot;
                                                </SelectItem>
                                                {customers.map(c => (
                                                  <SelectItem key={c.id} value={c.id}>
                                                    {c.name}
                                                  </SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                          </div>
                                        ) : v.effectiveType === 'expense' ? (
                                          <div className="space-y-1">
                                            <label className="text-[11px] font-semibold text-slate-600">Linked Expense Category</label>
                                            <Select
                                              value={v.matchedEntityId || (v.isAutoCreated ? 'auto-create' : '')}
                                              onValueChange={val => handleEntityOverride(v.id, val, 'expense')}
                                            >
                                              <SelectTrigger className="h-8 text-xs bg-slate-50">
                                                <SelectValue placeholder="Map to Expense Type" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="auto-create">
                                                  ✨ Auto-Create &quot;{v.partyName}&quot;
                                                </SelectItem>
                                                {expenseTypes.map(e => (
                                                  <SelectItem key={e.id} value={e.id}>
                                                    {e.name}
                                                  </SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                          </div>
                                        ) : null}

                                        {/* 3. Include in Commit Switch */}
                                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                          <span className="text-xs font-semibold text-slate-700">Include in Database Commit</span>
                                          <Switch
                                            checked={v.isIncluded}
                                            onCheckedChange={checked => handleIncludeToggle(v.id, checked)}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )}
                            </React.Fragment>
                          )
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* 6. Action Bar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-3 border-t border-slate-200">
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                    <span>Selected for Ingestion:</span>
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200 font-bold">
                      {selectedCount} Vouchers
                    </Badge>
                    {autoCreateMasters && (
                      <span className="text-[11px] text-slate-400">
                        (Auto-creating {newMastersSummary.customersCount} Cust, {newMastersSummary.suppliersCount} Supp, {newMastersSummary.expensesCount} Exp, {newMastersSummary.itemsCount} Items)
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <Button
                      size="sm"
                      onClick={handleCommit}
                      disabled={selectedCount === 0}
                      className="text-xs h-10 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs"
                    >
                      <Database className="w-4 h-4 mr-1.5" />
                      Import {selectedCount} Vouchers to ERP
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ==========================================
             2. EXPORT TO TALLY WORKSPACE
             ========================================== */
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-base font-bold text-slate-900">Export Accounting Vouchers to Tally XML</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Generate clean, schema-compliant Tally XML envelopes or Multi-Column Excel sheets for direct import into Tally Prime / ERP 9.
              </p>
            </div>

            {/* A. Period & Modules Selection */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Financial Month</label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="h-9 text-xs bg-slate-50 border-slate-200 rounded-xl">
                    <SelectValue placeholder="Select Month" />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_OPTIONS.map(m => (
                      <SelectItem key={m.value} value={m.value} className="text-xs">
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Calendar Year</label>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="h-9 text-xs bg-slate-50 border-slate-200 rounded-xl">
                    <SelectValue placeholder="Select Year" />
                  </SelectTrigger>
                  <SelectContent>
                    {['2024', '2025', '2026', '2027', '2028'].map(y => (
                      <SelectItem key={y} value={y} className="text-xs">
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 flex flex-col justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowMappingSettings(prev => !prev)}
                  className="h-9 text-xs font-semibold rounded-xl border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700"
                >
                  <Gear className="w-4 h-4 mr-1.5 text-slate-500" />
                  Configure Tally Ledgers ({showMappingSettings ? 'Hide' : 'Show'})
                </Button>
              </div>
            </div>

            {/* B. Ledger Configuration Panel */}
            {showMappingSettings && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <SlidersHorizontal className="w-4 h-4 text-violet-600" />
                    Tally General Ledger Mapping Configuration
                  </h4>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setTempMapping(DEFAULT_TALLY_LEDGER_MAPPING)
                      setLedgerMapping(DEFAULT_TALLY_LEDGER_MAPPING)
                      localStorage.removeItem(STORAGE_KEY_TALLY_MAPPING)
                      toast.success('Reset to standard Tally ledger names')
                    }}
                    className="h-7 text-[11px] text-slate-500 hover:text-slate-800"
                  >
                    Reset Defaults
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-600">Sales Account</label>
                    <Input
                      value={tempMapping.salesLedgerName}
                      onChange={e => setTempMapping(p => ({ ...p, salesLedgerName: e.target.value }))}
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-600">Purchase Account</label>
                    <Input
                      value={tempMapping.purchaseLedgerName}
                      onChange={e => setTempMapping(p => ({ ...p, purchaseLedgerName: e.target.value }))}
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-600">Primary Bank Ledger</label>
                    <Input
                      value={tempMapping.defaultBankLedgerName}
                      onChange={e => setTempMapping(p => ({ ...p, defaultBankLedgerName: e.target.value }))}
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-600">Output CGST (Sales)</label>
                    <Input
                      value={tempMapping.outputCgstLedgerName}
                      onChange={e => setTempMapping(p => ({ ...p, outputCgstLedgerName: e.target.value }))}
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-600">Output SGST (Sales)</label>
                    <Input
                      value={tempMapping.outputSgstLedgerName}
                      onChange={e => setTempMapping(p => ({ ...p, outputSgstLedgerName: e.target.value }))}
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-600">Output IGST (Sales)</label>
                    <Input
                      value={tempMapping.outputIgstLedgerName}
                      onChange={e => setTempMapping(p => ({ ...p, outputIgstLedgerName: e.target.value }))}
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-600">Input CGST (Purchase)</label>
                    <Input
                      value={tempMapping.inputCgstLedgerName}
                      onChange={e => setTempMapping(p => ({ ...p, inputCgstLedgerName: e.target.value }))}
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-600">Input SGST (Purchase)</label>
                    <Input
                      value={tempMapping.inputSgstLedgerName}
                      onChange={e => setTempMapping(p => ({ ...p, inputSgstLedgerName: e.target.value }))}
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-600">Input IGST (Purchase)</label>
                    <Input
                      value={tempMapping.inputIgstLedgerName}
                      onChange={e => setTempMapping(p => ({ ...p, inputIgstLedgerName: e.target.value }))}
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setLedgerMapping(tempMapping)
                      localStorage.setItem(STORAGE_KEY_TALLY_MAPPING, JSON.stringify(tempMapping))
                      toast.success('Saved Tally ledger mappings')
                      setShowMappingSettings(false)
                    }}
                    className="h-8 text-xs bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-lg px-4"
                  >
                    Save Mapping
                  </Button>
                </div>
              </div>
            )}

            {/* C. Modules to Export */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700">Include Modules in Export:</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                <div
                  onClick={() => setIncludeSales(!includeSales)}
                  className={cn(
                    'p-3 rounded-xl border transition-all cursor-pointer select-none flex flex-col justify-between gap-1',
                    includeSales ? 'bg-emerald-50/70 border-emerald-300 text-emerald-900 shadow-2xs' : 'bg-slate-50 border-slate-200 text-slate-400 opacity-60'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">Sales Invoices</span>
                    <Checkbox checked={includeSales} className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-mono font-bold">{exportSalesVouchers.length} Vouchers</span>
                </div>

                <div
                  onClick={() => setIncludePurchases(!includePurchases)}
                  className={cn(
                    'p-3 rounded-xl border transition-all cursor-pointer select-none flex flex-col justify-between gap-1',
                    includePurchases ? 'bg-blue-50/70 border-blue-300 text-blue-900 shadow-2xs' : 'bg-slate-50 border-slate-200 text-slate-400 opacity-60'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">Purchase Invoices</span>
                    <Checkbox checked={includePurchases} className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-mono font-bold">{exportPurchaseVouchers.length} Vouchers</span>
                </div>

                <div
                  onClick={() => setIncludeNotes(!includeNotes)}
                  className={cn(
                    'p-3 rounded-xl border transition-all cursor-pointer select-none flex flex-col justify-between gap-1',
                    includeNotes ? 'bg-purple-50/70 border-purple-300 text-purple-900 shadow-2xs' : 'bg-slate-50 border-slate-200 text-slate-400 opacity-60'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">Credit/Debit Notes</span>
                    <Checkbox checked={includeNotes} className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-mono font-bold">{exportNoteVouchers.length} Vouchers</span>
                </div>

                <div
                  onClick={() => setIncludePayments(!includePayments)}
                  className={cn(
                    'p-3 rounded-xl border transition-all cursor-pointer select-none flex flex-col justify-between gap-1',
                    includePayments ? 'bg-indigo-50/70 border-indigo-300 text-indigo-900 shadow-2xs' : 'bg-slate-50 border-slate-200 text-slate-400 opacity-60'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">Banking / Payments</span>
                    <Checkbox checked={includePayments} className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-mono font-bold">{exportPaymentVouchers.length} Vouchers</span>
                </div>

                <div
                  onClick={() => setIncludeExpenses(!includeExpenses)}
                  className={cn(
                    'p-3 rounded-xl border transition-all cursor-pointer select-none flex flex-col justify-between gap-1',
                    includeExpenses ? 'bg-amber-50/70 border-amber-300 text-amber-900 shadow-2xs' : 'bg-slate-50 border-slate-200 text-slate-400 opacity-60'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">Expenses</span>
                    <Checkbox checked={includeExpenses} className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-mono font-bold">{exportExpenseVouchers.length} Vouchers</span>
                </div>
              </div>
            </div>

            {/* D. Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-200">
              <div className="text-xs text-slate-500 font-medium">
                Total Multi-Leg Vouchers Ready: <strong className="text-slate-900 font-mono text-sm">{allExportCompoundVouchers.length}</strong>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportExcel}
                  disabled={allExportCompoundVouchers.length === 0}
                  className="h-10 px-5 text-xs font-bold rounded-xl border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                >
                  <FileXls className="w-4 h-4 mr-2 text-emerald-600" />
                  Export to Excel (.xlsx)
                </Button>

                <Button
                  size="sm"
                  onClick={handleExportXML}
                  disabled={allExportCompoundVouchers.length === 0}
                  className="h-10 px-6 text-xs font-bold rounded-xl bg-violet-600 hover:bg-violet-700 text-white shadow-xs"
                >
                  <FileCode className="w-4 h-4 mr-2" />
                  Download Tally XML (.xml)
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
