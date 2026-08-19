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
  Database,
  Users,
  Tag,
  Bank
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
  Party,
  Payment,
  CustomerPayment,
  Item,
  InvoiceItem,
  ExpenseType
} from '@/lib/types'
import { Counter, CashBankTransaction } from '@/lib/cash-bank-types'
import { formatCurrency, roundCurrency } from '@/lib/calculations'
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
  matchedEntityType?: 'party' | 'expense' | 'counter' | 'unmapped'
  matchedEntityId?: string
  fromCounterId?: string
  toCounterId?: string
}

export interface TallyIntegrationPageProps {
  parties?: Party[]
  setParties?: (p: Party[]) => void
  customers?: Customer[]
  setCustomers?: (c: Customer[]) => void
  suppliers?: Supplier[]
  setSuppliers?: (s: Supplier[]) => void
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
  parties = [],
  setParties,
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

  // -------------------------------------------------------------
  // Comprehensive Unified Master Mapping States
  // -------------------------------------------------------------
  const [itemMappings, setItemMappings] = useState<Record<string, string>>({})
  const [partyMappings, setPartyMappings] = useState<Record<string, string>>({})
  const [expenseMappings, setExpenseMappings] = useState<Record<string, string>>({})
  const [counterMappings, setCounterMappings] = useState<Record<string, string>>({})
  const [itemOverrides, setItemOverrides] = useState<Record<string, Record<number, string>>>({})

  // Active accordion panel: 'items' | 'parties' | 'expenses' | 'counters' | null
  const [activeMappingPanel, setActiveMappingPanel] = useState<'items' | 'parties' | 'expenses' | 'counters' | null>(null)
  const [mappingSearchQuery, setMappingSearchQuery] = useState('')

  // Master update handlers
  const handleItemMapping = (tallyName: string, targetId: string) => {
    setItemMappings(prev => ({ ...prev, [tallyName.trim().toLowerCase()]: targetId }))
  }
  const handlePartyMapping = (tallyName: string, targetId: string) => {
    setPartyMappings(prev => ({ ...prev, [tallyName.trim().toLowerCase()]: targetId }))
  }
  const handleExpenseMapping = (tallyName: string, targetId: string) => {
    setExpenseMappings(prev => ({ ...prev, [tallyName.trim().toLowerCase()]: targetId }))
  }
  const handleCounterMapping = (tallyName: string, targetId: string) => {
    setCounterMappings(prev => ({ ...prev, [tallyName.trim().toLowerCase()]: targetId }))
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

  // Unified Parties Master Lookup
  const effectiveParties = useMemo(() => {
    const combined: Party[] = []
    if (parties && parties.length > 0) {
      combined.push(...parties)
    } else {
      const legacy = [...customers, ...suppliers]
      legacy.forEach(c => {
        combined.push({
          id: c.id,
          name: c.name,
          phone: c.phone || '',
          gstin: c.gstin || '',
          stateCode: c.stateCode || '',
          billingAddress: (c as any).billingAddress || (c as any).address || '',
          shippingAddress: (c as any).shippingAddress || '',
          fy: currentFY
        } as Party)
      })
    }

    const hasCash = combined.some(p => p.id === 'party-cash' || p.id === 'cust-cash' || p.name.trim().toLowerCase() === 'cash' || p.name.trim().toLowerCase() === 'cash customer')
    if (!hasCash) {
      combined.unshift({
        id: 'party-cash',
        name: 'Cash Customer',
        phone: '',
        gstin: '',
        stateCode: '19',
        billingAddress: '',
        shippingAddress: '',
        fy: currentFY
      } as Party)
    }

    return combined
  }, [parties, customers, suppliers, currentFY])

  const partyMap = useMemo(() => {
    const map = new Map<string, Party>()
    effectiveParties.forEach(p => {
      if (p.name) map.set(p.name.trim().toLowerCase(), p)
      if (p.id) map.set(p.id.toLowerCase(), p)
    })
    const cashParty = effectiveParties.find(p => p.name.toLowerCase() === 'cash customer' || p.name.toLowerCase() === 'cash' || p.id === 'party-cash' || p.id === 'cust-cash')
    if (cashParty) {
      map.set('cash', cashParty)
      map.set('cash customer', cashParty)
      map.set('cash a/c', cashParty)
      map.set('cash account', cashParty)
    }
    return map
  }, [effectiveParties])

  const counterMap = useMemo(() => new Map(counters.map(c => [c.name.trim().toLowerCase(), c])), [counters])
  const expenseTypeMap = useMemo(() => new Map(expenseTypes.map(e => [e.name.trim().toLowerCase(), e])), [expenseTypes])
  const itemMap = useMemo(() => {
    const map = new Map(items.map(it => [it.name.trim().toLowerCase(), it]))
    items.forEach(it => {
      if (it.itemCode) map.set(it.itemCode.trim().toLowerCase(), it)
    })
    return map
  }, [items])

  // Processed Vouchers List with Unified Party & Master Mapping Engine
  const processedList = useMemo(() => {
    return parsedVouchers.map(v => {
      const override = overrides[v.id]
      const effectiveType = override?.typeOverride || v.normalizedType
      let partyName = (override?.partyName || v.partyName).trim()
      const normParty = partyName.toLowerCase()

      let matchedEntityType: 'party' | 'expense' | 'counter' | 'unmapped' = 'unmapped'
      let matchedEntityId = override?.matchedEntityId
      let contraDetails = v.contraDetails
      let expenseDetails = v.expenseDetails
      let isAutoCreated = false

      if (effectiveType === 'contra') {
        const fromName = v.contraDetails?.fromCounterName || v.legs.find(l => l.drCr === 'Cr')?.ledgerName || ''
        const toName = v.contraDetails?.toCounterName || v.legs.find(l => l.drCr === 'Dr')?.ledgerName || ''
        const fromMapped = counterMappings[fromName.trim().toLowerCase()]
        const toMapped = counterMappings[toName.trim().toLowerCase()]

        const fromId = override?.fromCounterId || (fromMapped && fromMapped !== 'auto-create' ? fromMapped : counterMap.get(fromName.trim().toLowerCase())?.id)
        const toId = override?.toCounterId || (toMapped && toMapped !== 'auto-create' ? toMapped : counterMap.get(toName.trim().toLowerCase())?.id)

        contraDetails = {
          fromCounterName: fromName,
          toCounterName: toName,
          fromCounterId: fromId,
          toCounterId: toId,
          amount: v.totalAmount
        }

        matchedEntityType = 'counter'
        if (fromMapped === 'auto-create' || toMapped === 'auto-create' || (!fromId && autoCreateMasters) || (!toId && autoCreateMasters)) {
          isAutoCreated = true
        }
      } else if (effectiveType === 'expense') {
        const mappedExpId = expenseMappings[normParty]
        const expMatch = mappedExpId && mappedExpId !== 'auto-create'
          ? expenseTypes.find(e => e.id === mappedExpId)
          : (override?.matchedEntityId ? expenseTypes.find(e => e.id === override.matchedEntityId) : expenseTypeMap.get(normParty))

        if (expMatch) {
          matchedEntityType = 'expense'
          matchedEntityId = expMatch.id
          isAutoCreated = false
        } else if (mappedExpId === 'auto-create' || autoCreateMasters) {
          matchedEntityType = 'expense'
          matchedEntityId = undefined
          isAutoCreated = true
        } else {
          matchedEntityType = 'unmapped'
          matchedEntityId = undefined
        }
      } else {
        // All financial party transactions: sales, purchase, receipt, payment, credit_note, debit_note
        const mappedPartyId = partyMappings[normParty]
        const partyMatch = mappedPartyId && mappedPartyId !== 'auto-create'
          ? effectiveParties.find(p => p.id === mappedPartyId)
          : (override?.matchedEntityId ? effectiveParties.find(p => p.id === override.matchedEntityId) : partyMap.get(normParty))

        if (partyMatch) {
          matchedEntityType = 'party'
          matchedEntityId = partyMatch.id
          isAutoCreated = false
        } else if (mappedPartyId === 'auto-create' || autoCreateMasters) {
          matchedEntityType = 'party'
          matchedEntityId = undefined
          isAutoCreated = true
        } else {
          matchedEntityType = 'unmapped'
          matchedEntityId = undefined
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
  }, [
    parsedVouchers,
    overrides,
    autoCreateMasters,
    partyMap,
    counterMap,
    expenseTypeMap,
    itemMap,
    effectiveParties,
    items,
    expenseTypes,
    itemMappings,
    partyMappings,
    expenseMappings,
    counterMappings,
    itemOverrides
  ])

  // -------------------------------------------------------------
  // Distinct Extracted Masters from Vouchers
  // -------------------------------------------------------------

  // 1. Inventory Items
  const distinctTallyItems = useMemo(() => {
    const map = new Map<string, {
      rawName: string
      normName: string
      totalQty: number
      unit: string
      sampleRate: number
      totalAmount: number
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
            sampleRate: inv.rate || 0,
            totalAmount: 0,
            voucherCount: 0,
            matchedItem: existingItem || null,
            isAutoCreate: mappedId === 'auto-create' || (!existingItem && autoCreateMasters)
          })
        }

        const entry = map.get(norm)!
        entry.totalQty += inv.quantity || 0
        entry.totalAmount += inv.amount || ((inv.quantity || 0) * (inv.rate || 0))
        entry.voucherCount += 1
        if (inv.rate > 0) entry.sampleRate = inv.rate
      })
    })

    return Array.from(map.values())
  }, [processedList, selectedModules, itemMappings, itemMap, items, autoCreateMasters])

  // 2. Unified Parties (Sales, Purchase, Receipt, Payment, Credit Notes, Debit Notes)
  const distinctTallyParties = useMemo(() => {
    const map = new Map<string, {
      rawName: string
      normName: string
      voucherCount: number
      totalAmount: number
      gstin?: string
      matchedParty: Party | null
      isAutoCreate: boolean
    }>()

    processedList.forEach(v => {
      const modKey = v.effectiveType as keyof typeof selectedModules
      if (modKey in selectedModules && !selectedModules[modKey]) return
      if (v.effectiveType === 'contra' || v.effectiveType === 'expense') return

      const raw = v.partyName?.trim()
      if (!raw) return
      const norm = raw.toLowerCase()

      if (!map.has(norm)) {
        const mappedId = partyMappings[norm]
        const existingParty = mappedId && mappedId !== 'auto-create'
          ? effectiveParties.find(p => p.id === mappedId)
          : partyMap.get(norm) || null

        map.set(norm, {
          rawName: raw,
          normName: norm,
          voucherCount: 0,
          totalAmount: 0,
          gstin: v.partyGstin,
          matchedParty: existingParty || null,
          isAutoCreate: mappedId === 'auto-create' || (!existingParty && autoCreateMasters)
        })
      }

      const entry = map.get(norm)!
      entry.voucherCount += 1
      entry.totalAmount += v.totalAmount || 0
      if (!entry.gstin && v.partyGstin) entry.gstin = v.partyGstin
    })

    return Array.from(map.values())
  }, [processedList, selectedModules, partyMappings, partyMap, effectiveParties, autoCreateMasters])

  // 3. Expenses
  const distinctTallyExpenses = useMemo(() => {
    const map = new Map<string, {
      rawName: string
      normName: string
      voucherCount: number
      totalAmount: number
      matchedExpense: ExpenseType | null
      isAutoCreate: boolean
    }>()

    processedList.forEach(v => {
      const modKey = v.effectiveType as keyof typeof selectedModules
      if (modKey in selectedModules && !selectedModules[modKey]) return
      if (v.effectiveType !== 'expense') return

      const raw = v.partyName.trim()
      if (!raw) return
      const norm = raw.toLowerCase()

      if (!map.has(norm)) {
        const mappedId = expenseMappings[norm]
        const existingExp = mappedId && mappedId !== 'auto-create'
          ? expenseTypes.find(e => e.id === mappedId)
          : expenseTypeMap.get(norm) || null

        map.set(norm, {
          rawName: raw,
          normName: norm,
          voucherCount: 0,
          totalAmount: 0,
          matchedExpense: existingExp || null,
          isAutoCreate: mappedId === 'auto-create' || (!existingExp && autoCreateMasters)
        })
      }

      const entry = map.get(norm)!
      entry.voucherCount += 1
      entry.totalAmount += v.totalAmount || 0
    })

    return Array.from(map.values())
  }, [processedList, selectedModules, expenseMappings, expenseTypeMap, expenseTypes, autoCreateMasters])

  // 4. Cash / Bank Counters
  const distinctTallyCounters = useMemo(() => {
    const map = new Map<string, {
      rawName: string
      normName: string
      voucherCount: number
      totalAmount: number
      matchedCounter: Counter | null
      isAutoCreate: boolean
    }>()

    processedList.forEach(v => {
      const modKey = v.effectiveType as keyof typeof selectedModules
      if (modKey in selectedModules && !selectedModules[modKey]) return

      const counterNamesToCheck: string[] = []
      if (v.effectiveType === 'contra') {
        if (v.contraDetails?.fromCounterName) counterNamesToCheck.push(v.contraDetails.fromCounterName)
        if (v.contraDetails?.toCounterName) counterNamesToCheck.push(v.contraDetails.toCounterName)
      } else if (v.effectiveType === 'payment' || v.effectiveType === 'receipt' || v.effectiveType === 'expense') {
        const bankLeg = v.legs.find(l => l.drCr === (v.effectiveType === 'receipt' ? 'Dr' : 'Cr'))
        if (bankLeg?.ledgerName) counterNamesToCheck.push(bankLeg.ledgerName)
      }

      counterNamesToCheck.forEach(rawName => {
        const raw = rawName.trim()
        if (!raw) return
        const norm = raw.toLowerCase()

        if (!map.has(norm)) {
          const mappedId = counterMappings[norm]
          const existingCtr = mappedId && mappedId !== 'auto-create'
            ? counters.find(c => c.id === mappedId)
            : counterMap.get(norm) || null

          map.set(norm, {
            rawName: raw,
            normName: norm,
            voucherCount: 0,
            totalAmount: 0,
            matchedCounter: existingCtr || null,
            isAutoCreate: mappedId === 'auto-create' || (!existingCtr && autoCreateMasters)
          })
        }

        const entry = map.get(norm)!
        entry.voucherCount += 1
        entry.totalAmount += v.totalAmount || 0
      })
    })

    return Array.from(map.values())
  }, [processedList, selectedModules, counterMappings, counterMap, counters, autoCreateMasters])

  // Filtered distinct lists for search within accordions
  const filteredDistinctItems = useMemo(() => {
    if (!mappingSearchQuery.trim()) return distinctTallyItems
    const q = mappingSearchQuery.toLowerCase()
    return distinctTallyItems.filter(i => i.rawName.toLowerCase().includes(q) || (i.matchedItem && i.matchedItem.name.toLowerCase().includes(q)))
  }, [distinctTallyItems, mappingSearchQuery])

  const filteredDistinctParties = useMemo(() => {
    if (!mappingSearchQuery.trim()) return distinctTallyParties
    const q = mappingSearchQuery.toLowerCase()
    return distinctTallyParties.filter(p => p.rawName.toLowerCase().includes(q) || (p.matchedParty && p.matchedParty.name.toLowerCase().includes(q)))
  }, [distinctTallyParties, mappingSearchQuery])

  const filteredDistinctExpenses = useMemo(() => {
    if (!mappingSearchQuery.trim()) return distinctTallyExpenses
    const q = mappingSearchQuery.toLowerCase()
    return distinctTallyExpenses.filter(e => e.rawName.toLowerCase().includes(q) || (e.matchedExpense && e.matchedExpense.name.toLowerCase().includes(q)))
  }, [distinctTallyExpenses, mappingSearchQuery])

  const filteredDistinctCounters = useMemo(() => {
    if (!mappingSearchQuery.trim()) return distinctTallyCounters
    const q = mappingSearchQuery.toLowerCase()
    return distinctTallyCounters.filter(c => c.rawName.toLowerCase().includes(q) || (c.matchedCounter && c.matchedCounter.name.toLowerCase().includes(q)))
  }, [distinctTallyCounters, mappingSearchQuery])

  // Missing Masters summary for creation pill
  const newMastersSummary = useMemo(() => {
    const newParties = distinctTallyParties.filter(p => !p.matchedParty && (partyMappings[p.normName] === 'auto-create' || autoCreateMasters))
    const newItems = distinctTallyItems.filter(i => !i.matchedItem && (itemMappings[i.normName] === 'auto-create' || autoCreateMasters))
    const newExpenses = distinctTallyExpenses.filter(e => !e.matchedExpense && (expenseMappings[e.normName] === 'auto-create' || autoCreateMasters))
    const newCounters = distinctTallyCounters.filter(c => !c.matchedCounter && (counterMappings[c.normName] === 'auto-create' || autoCreateMasters))

    return {
      partiesCount: newParties.length,
      itemsCount: newItems.length,
      expensesCount: newExpenses.length,
      countersCount: newCounters.length,
      totalNew: newParties.length + newItems.length + newExpenses.length + newCounters.length
    }
  }, [distinctTallyParties, distinctTallyItems, distinctTallyExpenses, distinctTallyCounters, partyMappings, itemMappings, expenseMappings, counterMappings, autoCreateMasters])

  // Filtered vouchers for display in table
  const displayVouchers = useMemo(() => {
    return processedList.filter(v => {
      const modKey = v.effectiveType as keyof typeof selectedModules
      if (modKey in selectedModules && !selectedModules[modKey]) return false

      if (filterTab === 'matched' && (v.matchedEntityType === 'unmapped' || v.hasUnmappedItem)) return false
      if (filterTab === 'unmapped' && (v.matchedEntityType !== 'unmapped' && !v.hasUnmappedItem)) return false
      if (filterTab === 'sales' && v.effectiveType !== 'sales') return false
      if (filterTab === 'purchase' && v.effectiveType !== 'purchase') return false
      if (filterTab === 'receipt' && v.effectiveType !== 'receipt') return false
      if (filterTab === 'payment' && v.effectiveType !== 'payment') return false
      if (filterTab === 'contra' && v.effectiveType !== 'contra') return false
      if (filterTab === 'expense' && v.effectiveType !== 'expense') return false

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchNum = v.voucherNumber.toLowerCase().includes(q)
        const matchParty = v.partyName.toLowerCase().includes(q)
        const matchNarr = (v.narration || '').toLowerCase().includes(q)
        const matchAmt = v.totalAmount.toString().includes(q)
        if (!matchNum && !matchParty && !matchNarr && !matchAmt) return false
      }

      return true
    })
  }, [processedList, selectedModules, filterTab, searchQuery])

  // Count totals for summary pills
  const moduleCounts = useMemo(() => {
    const counts = { sales: 0, purchase: 0, receipt: 0, payment: 0, expense: 0, contra: 0, credit_note: 0, debit_note: 0 }
    processedList.forEach(v => {
      const t = v.effectiveType as keyof typeof counts
      if (t in counts) counts[t] += 1
    })
    return counts
  }, [processedList])

  const selectedCount = useMemo(() => {
    return displayVouchers.filter(v => v.isIncluded).length
  }, [displayVouchers])

  // Handle Drag & Drop / File Selection
  const handleFileUpload = async (file: File) => {
    setIsParsing(true)
    setFileName(file.name)
    try {
      if (file.name.endsWith('.xml')) {
        const buffer = await file.arrayBuffer()
        const xmlText = decodeXmlFileBuffer(buffer)
        const result = parseTallyXmlVouchers(xmlText, { companyStateCode })
        setParsedVouchers(result.vouchers)
        toast.success(`Loaded ${result.summary?.totalParsed || result.vouchers.length} vouchers from ${file.name}`)
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
        const buffer = await file.arrayBuffer()
        const result = parseTallyAccountingVouchersExcel(buffer, { companyStateCode })
        setParsedVouchers(result.vouchers)
        toast.success(`Loaded ${result.summary?.totalParsed || result.vouchers.length} accounting vouchers from Excel`)
      } else {
        toast.error('Unsupported file format. Please upload .xml, .xlsx, or .xls')
      }
    } catch (err: any) {
      console.error(err)
      toast.error(`Parsing error: ${err?.message || 'Failed to read Tally file'}`)
    } finally {
      setIsParsing(false)
    }
  }

  const handleIncludeToggle = (voucherId: string, included: boolean) => {
    setOverrides(prev => ({
      ...prev,
      [voucherId]: {
        ...(prev[voucherId] || {}),
        included
      }
    }))
  }

  const handleSelectAllVisible = (included: boolean) => {
    setOverrides(prev => {
      const next = { ...prev }
      displayVouchers.forEach(v => {
        if (v.effectiveType !== 'skipped') {
          next[v.id] = { ...(next[v.id] || {}), included }
        }
      })
      return next
    })
  }

  const handleSelectOnlyMatched = () => {
    setOverrides(prev => {
      const next = { ...prev }
      displayVouchers.forEach(v => {
        const isMatched = v.matchedEntityType !== 'unmapped' && !v.hasUnmappedItem && v.effectiveType !== 'skipped'
        next[v.id] = { ...(next[v.id] || {}), included: isMatched }
      })
      return next
    })
  }

  // COMMIT ALL IMPORTED DATA INTO ZOHAN ERP DATABASE
  const handleCommit = () => {
    const includedVouchers = processedList.filter(v => v.isIncluded && v.effectiveType !== 'skipped')
    if (includedVouchers.length === 0) {
      toast.error('No vouchers selected for ingestion.')
      return
    }

    // 1. Gather all auto-created masters
    const newPartiesMap = new Map<string, Party>()
    const newExpenseTypesMap = new Map<string, ExpenseType>()
    const newCountersMap = new Map<string, Counter>()
    const newItemsMap = new Map<string, Item>()

    distinctTallyItems.forEach(stat => {
      const customMapped = itemMappings[stat.normName]
      if (customMapped === 'auto-create' || (!stat.matchedItem && autoCreateMasters)) {
        if (!newItemsMap.has(stat.normName)) {
          const newItemId = `item-tally-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
          newItemsMap.set(stat.normName, {
            id: newItemId,
            name: stat.rawName,
            category: 'General Goods',
            unit: stat.unit || 'PCS',
            basicRate: stat.sampleRate || 0,
            salePrice: stat.sampleRate || 0,
            gstPercentage: 18,
            hsnCode: '7214',
            stockQuantity: stat.totalQty || 0,
            openingStock: 0,
            minStockLevel: 0
          } as Item)
        }
      }
    })

    distinctTallyParties.forEach(stat => {
      const customMapped = partyMappings[stat.normName]
      if (customMapped === 'auto-create' || (!stat.matchedParty && autoCreateMasters)) {
        if (!newPartiesMap.has(stat.normName)) {
          const newPartyId = `party-tally-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
          const partyGstin = stat.gstin || ''
          const partyState = partyGstin ? partyGstin.slice(0, 2) : '19'
          newPartiesMap.set(stat.normName, {
            id: newPartyId,
            name: stat.rawName,
            phone: '',
            gstin: partyGstin,
            stateCode: partyState,
            billingAddress: '',
            shippingAddress: '',
            openingBalance: 0,
            balanceType: 'Debit',
            fy: currentFY
          } as Party)
        }
      }
    })

    distinctTallyExpenses.forEach(stat => {
      const customMapped = expenseMappings[stat.normName]
      if (customMapped === 'auto-create' || (!stat.matchedExpense && autoCreateMasters)) {
        if (!newExpenseTypesMap.has(stat.normName)) {
          const newExpId = `exp-type-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
          newExpenseTypesMap.set(stat.normName, {
            id: newExpId,
            name: stat.rawName,
            category: 'Operational',
            description: 'Imported from Tally',
            gstRate: 0,
            isRcmApplicable: false
          } as ExpenseType)
        }
      }
    })

    distinctTallyCounters.forEach(stat => {
      const customMapped = counterMappings[stat.normName]
      if (customMapped === 'auto-create' || (!stat.matchedCounter && autoCreateMasters)) {
        if (!newCountersMap.has(stat.normName)) {
          const newCtrId = `ctr-tally-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
          newCountersMap.set(stat.normName, {
            id: newCtrId,
            name: stat.rawName,
            type: stat.rawName.toLowerCase().includes('cash') ? 'cash' : 'bank',
            currentBalance: 0,
            openingBalance: 0,
            balanceType: 'Debit',
            accountNumber: '',
            ifscCode: '',
            bankName: stat.rawName,
            isDefault: false
          } as unknown as Counter)
        }
      }
    })

    const generatedParties = Array.from(newPartiesMap.values())
    const generatedExpenseTypes = Array.from(newExpenseTypesMap.values())
    const generatedCounters = Array.from(newCountersMap.values())
    const generatedItems = Array.from(newItemsMap.values())

    // 2. Build Transaction Entity Records
    const newSalesInvoices: SalesInvoice[] = []
    const newPurchaseInvoices: PurchaseInvoice[] = []
    const newPayments: Payment[] = []
    const newCustomerPayments: CustomerPayment[] = []
    const newCreditNotes: CustomerCreditNote[] = []
    const newDebitNotes: SupplierDebitNote[] = []
    const newExpenseEntries: ExpenseEntry[] = []
    const newCashBankTransactions: CashBankTransaction[] = []

    includedVouchers.forEach((v, idx) => {
      const normParty = v.partyName.trim().toLowerCase()
      const targetPartyId = v.matchedEntityId || partyMappings[normParty] || newPartiesMap.get(normParty)?.id || 'party-unmapped'
      const targetExpId = v.matchedEntityId || expenseMappings[normParty] || newExpenseTypesMap.get(normParty)?.id || 'exp-unmapped'

      const contraFromId = v.contraDetails?.fromCounterId || newCountersMap.get((v.contraDetails?.fromCounterName || '').trim().toLowerCase())?.id || 'counter-1'
      const contraToId = v.contraDetails?.toCounterId || newCountersMap.get((v.contraDetails?.toCounterName || '').trim().toLowerCase())?.id || 'counter-2'

      const builtItems: InvoiceItem[] = (v.inventory || []).map((inv, iIdx) => {
        const normItem = inv.itemName.trim().toLowerCase()
        const lineOverrideId = itemOverrides[v.id]?.[iIdx]
        const targetItemId = lineOverrideId || inv.matchedItemId || itemMappings[normItem] || newItemsMap.get(normItem)?.id || 'item-unmapped'
        return {
          id: `item-line-${Date.now()}-${idx}-${iIdx}`,
          itemId: targetItemId,
          quantity: inv.quantity || 1,
          enteredQuantity: inv.quantity || 1,
          baseQuantity: inv.quantity || 1,
          enteredUnit: inv.unit || 'PCS',
          unit: inv.unit || 'PCS',
          rate: inv.rate || 0,
          basicRate: inv.rate || 0,
          salePrice: inv.rate || 0,
          amount: inv.amount || ((inv.quantity || 1) * (inv.rate || 0)),
          grossAmount: inv.amount || ((inv.quantity || 1) * (inv.rate || 0)),
          taxableAmount: inv.amount || 0,
          gstPercentage: 18,
          finalAmount: inv.amount || 0
        } as unknown as InvoiceItem
      })

      if (v.effectiveType === 'sales') {
        newSalesInvoices.push({
          id: `sinv-tally-${Date.now()}-${idx}`,
          invoiceNo: v.voucherNumber,
          invoiceDate: v.voucherDate,
          partyId: targetPartyId,
          customerId: targetPartyId,
          partyNameSnapshot: v.partyName,
          items: builtItems,
          invoiceAmount: v.totalAmount,
          totalAmount: v.totalAmount,
          taxableAmount: builtItems.reduce((s, it) => s + (it.taxableAmount || 0), 0) || v.totalAmount,
          status: 'Confirmed',
          fy: currentFY,
          remarks: v.narration || `Imported from Tally (${v.rawVoucherType})`
        } as unknown as SalesInvoice)
      } else if (v.effectiveType === 'purchase') {
        newPurchaseInvoices.push({
          id: `pinv-tally-${Date.now()}-${idx}`,
          invoiceNo: v.voucherNumber,
          invoiceDate: v.voucherDate,
          partyId: targetPartyId,
          supplierId: targetPartyId,
          partyNameSnapshot: v.partyName,
          items: builtItems,
          invoiceAmount: v.totalAmount,
          totalAmount: v.totalAmount,
          taxableAmount: builtItems.reduce((s, it) => s + (it.taxableAmount || 0), 0) || v.totalAmount,
          fy: currentFY,
          remarks: v.narration || `Imported from Tally (${v.rawVoucherType})`
        } as unknown as PurchaseInvoice)
      } else if (v.effectiveType === 'receipt') {
        newCustomerPayments.push({
          id: `cpay-tally-${Date.now()}-${idx}`,
          partyId: targetPartyId,
          customerId: targetPartyId,
          paymentDate: v.voucherDate,
          amount: v.totalAmount,
          paymentMode: 'bank_transfer',
          referenceNo: v.voucherNumber,
          remarks: v.narration || `Tally Receipt: ${v.voucherNumber}`,
          fy: currentFY
        } as unknown as CustomerPayment)
      } else if (v.effectiveType === 'payment') {
        newPayments.push({
          id: `pay-tally-${Date.now()}-${idx}`,
          partyId: targetPartyId,
          supplierId: targetPartyId,
          paymentDate: v.voucherDate,
          amount: v.totalAmount,
          paymentMode: 'bank_transfer',
          referenceNo: v.voucherNumber,
          remarks: v.narration || `Tally Payment: ${v.voucherNumber}`,
          fy: currentFY
        } as unknown as Payment)
      } else if (v.effectiveType === 'credit_note') {
        newCreditNotes.push({
          id: `cn-tally-${Date.now()}-${idx}`,
          noteNo: v.voucherNumber,
          date: v.voucherDate,
          partyId: targetPartyId,
          customerId: targetPartyId,
          supplierId: targetPartyId,
          partyNameSnapshot: v.partyName,
          amount: v.totalAmount,
          totalAmount: v.totalAmount,
          reason: '01 - Sales / Goods Return',
          fy: currentFY,
          remarks: v.narration || `Tally Credit Note: ${v.voucherNumber}`
        } as unknown as CustomerCreditNote)
      } else if (v.effectiveType === 'debit_note') {
        newDebitNotes.push({
          id: `dn-tally-${Date.now()}-${idx}`,
          noteNo: v.voucherNumber,
          date: v.voucherDate,
          partyId: targetPartyId,
          supplierId: targetPartyId,
          customerId: targetPartyId,
          partyNameSnapshot: v.partyName,
          amount: v.totalAmount,
          totalAmount: v.totalAmount,
          reason: '01 - Purchase Return / Goods Rejected',
          fy: currentFY,
          remarks: v.narration || `Tally Debit Note: ${v.voucherNumber}`
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
    if (generatedParties.length > 0) {
      if (setParties) setParties([...effectiveParties, ...generatedParties])
      if (setCustomers) setCustomers([...customers, ...(generatedParties as any)])
      if (setSuppliers) setSuppliers([...suppliers, ...(generatedParties as any)])
    }
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
    setPartyMappings({})
    setExpenseMappings({})
    setCounterMappings({})
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
        return <Badge className="bg-violet-100 text-violet-800 border-violet-200 text-[10px] font-bold">Debit Note</Badge>
      default:
        return <Badge variant="outline" className="text-[10px] text-slate-500">{raw || type}</Badge>
    }
  }

  // ==========================================
  // 2. EXPORT WORKSPACE STATE & LOGIC
  // ==========================================
  const [selectedMonth, setSelectedMonth] = useState<string>('0')
  const [selectedYear, setSelectedYear] = useState<string>('2026')
  const [exportModules, setExportModules] = useState<{
    sales: boolean
    purchase: boolean
    creditNotes: boolean
    debitNotes: boolean
    expenses: boolean
  }>({
    sales: true,
    purchase: true,
    creditNotes: true,
    debitNotes: true,
    expenses: true
  })
  const [showMappingSettings, setShowMappingSettings] = useState(false)
  const [ledgerMapping, setLedgerMapping] = useState<TallyLedgerMapping>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_TALLY_MAPPING)
    if (saved) {
      try { return JSON.parse(saved) } catch (e) {}
    }
    return DEFAULT_TALLY_LEDGER_MAPPING
  })
  const [tempMapping, setTempMapping] = useState<TallyLedgerMapping>(ledgerMapping)

  // Filter vouchers by month for export
  const exportVouchers = useMemo(() => {
    const filterByDate = (dateStr: string) => {
      if (!dateStr) return false
      const [y, m] = dateStr.split('-')
      if (selectedYear && y !== selectedYear) return false
      if (selectedMonth !== '0' && parseInt(m, 10) !== parseInt(selectedMonth, 10)) return false
      return true
    }

    const res: TallyCompoundVoucher[] = []
    if (exportModules.sales) {
      const filtered = salesInvoices.filter(i => filterByDate(i.invoiceDate))
      res.push(...generateTallySalesVouchers(filtered, effectiveParties, items, ledgerMapping, companyStateCode))
    }
    if (exportModules.purchase) {
      const filtered = purchaseInvoices.filter(i => filterByDate(i.invoiceDate))
      res.push(...generateTallyPurchaseVouchers(filtered, effectiveParties, items, ledgerMapping, companyStateCode))
    }
    if (exportModules.creditNotes) {
      const filtered = creditNotes.filter(cn => filterByDate(cn.date))
      res.push(...generateTallyCreditNoteVouchers(filtered, effectiveParties, ledgerMapping, companyStateCode))
    }
    if (exportModules.debitNotes) {
      const filtered = debitNotes.filter(dn => filterByDate(dn.date))
      res.push(...generateTallyDebitNoteVouchers(filtered, effectiveParties, ledgerMapping, companyStateCode))
    }
    if (exportModules.expenses) {
      const filtered = expenseEntries.filter(e => filterByDate(e.expenseDate))
      res.push(...generateTallyExpenseVouchers(filtered, expenseTypes, ledgerMapping, companyStateCode))
    }
    return res
  }, [salesInvoices, purchaseInvoices, creditNotes, debitNotes, expenseEntries, effectiveParties, items, expenseTypes, selectedMonth, selectedYear, exportModules, ledgerMapping, companyStateCode])

  const handleExportXML = () => {
    if (exportVouchers.length === 0) {
      toast.error('No vouchers match the selected export period.')
      return
    }
    const xml = generateTallyXML(exportVouchers, companyStateCode)
    const fname = `Tally_Accounting_Vouchers_${businessName.replace(/\s+/g, '_')}_${selectedYear}_M${selectedMonth}.xml`
    downloadTallyXML(xml, fname)
    toast.success(`Exported ${exportVouchers.length} vouchers to ${fname}`)
  }

  const handleExportExcel = () => {
    if (exportVouchers.length === 0) {
      toast.error('No vouchers match the selected export period.')
      return
    }
    const fname = `Tally_Accounting_Vouchers_${businessName.replace(/\s+/g, '_')}_${selectedYear}_M${selectedMonth}.xlsx`
    exportCompoundVouchersToTallyExcel(exportVouchers, { filename: fname })
    toast.success(`Exported ${exportVouchers.length} vouchers to ${fname}`)
  }

  return (
    <div className="space-y-6">
      {/* Top Hero Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-xs">
            <ArrowsLeftRight className="h-6 w-6" weight="duotone" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Tally Integration Hub</h1>
              <Badge variant="secondary" className="text-[10px] font-mono font-semibold bg-purple-50 text-purple-700 border-purple-200">
                Prime &amp; ERP 9 XML / Excel
              </Badge>
              {fileName && (
                <Badge variant="outline" className="text-[10px] font-mono bg-emerald-50 text-emerald-800 border-emerald-300">
                  File: {fileName}
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Bidirectional data synchronization: Ingest Tally vouchers with item &amp; master mapping, or export clean XML envelopes to Tally.
            </p>
          </div>
        </div>

        {/* Tab & Template Actions */}
        <div className="flex items-center gap-2 self-end md:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => generateSampleTallyExcel()}
            className="text-xs h-9 rounded-xl border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold"
          >
            <DownloadSimple className="w-4 h-4 mr-1.5 text-slate-500" />
            Download Template
          </Button>

          <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as 'import' | 'export')}>
            <TabsList className="bg-slate-100 p-1 rounded-xl h-9">
              <TabsTrigger value="import" className="text-xs px-3.5 py-1 font-bold rounded-lg data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-xs">
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

      {/* Main Workspace: Import vs Export */}
      {activeTab === 'import' ? (
        <div className="space-y-4">
          {/* File Upload Zone */}
          {parsedVouchers.length === 0 ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setIsDragging(false)
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleFileUpload(e.dataTransfer.files[0])
                }
              }}
              className={cn(
                'border-2 border-dashed rounded-2xl p-12 text-center transition-all bg-white flex flex-col items-center justify-center gap-3',
                isDragging ? 'border-indigo-500 bg-indigo-50/50 scale-[0.99]' : 'border-slate-300 hover:border-slate-400'
              )}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                accept=".xml,.xlsx,.xls,.csv"
                className="hidden"
              />
              <div className="h-16 w-16 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-2xs">
                <FileArrowUp className="h-8 w-8" weight="duotone" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Upload Tally Accounting Vouchers</h3>
                <p className="text-xs text-slate-500 max-w-md mt-1">
                  Upload exported <strong>Tally XML Daybook / Vouchers</strong> or Multi-Column Excel exports.
                  All sales, purchases, payments, receipts, credit/debit notes, inventory items &amp; ledger legs will be automatically parsed.
                </p>
              </div>
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={isParsing}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-6 h-9 rounded-xl shadow-xs mt-2"
              >
                {isParsing ? <ArrowsClockwise className="w-4 h-4 mr-2 animate-spin" /> : <FileXls className="w-4 h-4 mr-2" />}
                {isParsing ? 'Parsing Vouchers...' : 'Browse Computer Files'}
              </Button>
            </div>
          ) : (
            /* Parsed Vouchers Interactive Review & Reconciliation Grid */
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
              {/* 1. Ingestion File Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <CheckCircle className="h-5 w-5" weight="fill" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800 text-sm">{fileName}</span>
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">
                        {parsedVouchers.length} Total Vouchers Loaded
                      </Badge>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {selectedCount} vouchers selected for database ingestion.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-8 text-xs font-semibold px-3 rounded-lg border-slate-200 bg-slate-50 hover:bg-slate-100"
                  >
                    <FileArrowUp className="w-3.5 h-3.5 mr-1 text-slate-500" />
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
                      setPartyMappings({})
                      setExpenseMappings({})
                      setCounterMappings({})
                      setItemOverrides({})
                    }}
                    className="h-8 text-xs font-semibold px-3 rounded-lg text-rose-600 hover:bg-rose-50"
                  >
                    Clear File
                  </Button>
                </div>
              </div>

              {/* 2. Module Filter Badges */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-slate-600 flex items-center gap-1 mr-1">
                    <Funnel className="w-3.5 h-3.5 text-slate-400" />
                    Modules to import:
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

              {/* 3. Unified Master Mapping Accordion Toolbar */}
              <div className="flex flex-col gap-2.5 p-3 bg-gradient-to-r from-violet-50/70 via-purple-50/50 to-indigo-50/70 rounded-xl border border-violet-100">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="autoCreateMasters"
                        checked={autoCreateMasters}
                        onCheckedChange={setAutoCreateMasters}
                      />
                      <Label htmlFor="autoCreateMasters" className="text-xs font-bold text-slate-800 cursor-pointer flex items-center gap-1.5">
                        Auto-Create Missing Masters
                      </Label>
                    </div>

                    {autoCreateMasters && (
                      <div className="hidden lg:flex items-center gap-1.5 text-xs text-violet-900 flex-wrap">
                        <span className="text-[11px] font-semibold text-slate-500">Will create:</span>
                        {newMastersSummary.partiesCount > 0 && (
                          <Badge variant="secondary" className="text-[10px] bg-white text-emerald-800 border-emerald-200">
                            +{newMastersSummary.partiesCount} Parties
                          </Badge>
                        )}
                        {newMastersSummary.expensesCount > 0 && (
                          <Badge variant="secondary" className="text-[10px] bg-white text-amber-800 border-amber-200">
                            +{newMastersSummary.expensesCount} Exp
                          </Badge>
                        )}
                        {newMastersSummary.itemsCount > 0 && (
                          <Badge variant="secondary" className="text-[10px] bg-white text-purple-800 border-purple-200">
                            +{newMastersSummary.itemsCount} Items
                          </Badge>
                        )}
                        {newMastersSummary.countersCount > 0 && (
                          <Badge variant="secondary" className="text-[10px] bg-white text-cyan-800 border-cyan-200">
                            +{newMastersSummary.countersCount} Bank/Cash
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Master Mapping Triggers */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Button
                      size="sm"
                      variant={activeMappingPanel === 'items' ? 'default' : 'outline'}
                      onClick={() => {
                        setActiveMappingPanel(prev => prev === 'items' ? null : 'items')
                        setMappingSearchQuery('')
                      }}
                      className={cn(
                        'h-7 text-xs font-bold px-2.5 rounded-lg transition-all',
                        activeMappingPanel === 'items'
                          ? 'bg-purple-700 text-white shadow-xs'
                          : 'bg-white text-purple-700 border-purple-200 hover:bg-purple-50'
                      )}
                    >
                      <Package className="w-3.5 h-3.5 mr-1" />
                      Items ({distinctTallyItems.length})
                      <CaretDown className={cn('w-3 h-3 ml-1 transition-transform duration-200', activeMappingPanel === 'items' && 'rotate-180')} />
                    </Button>

                    <Button
                      size="sm"
                      variant={activeMappingPanel === 'parties' ? 'default' : 'outline'}
                      onClick={() => {
                        setActiveMappingPanel(prev => prev === 'parties' ? null : 'parties')
                        setMappingSearchQuery('')
                      }}
                      className={cn(
                        'h-7 text-xs font-bold px-2.5 rounded-lg transition-all',
                        activeMappingPanel === 'parties'
                          ? 'bg-emerald-700 text-white shadow-xs'
                          : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                      )}
                    >
                      <Users className="w-3.5 h-3.5 mr-1" />
                      Parties ({distinctTallyParties.length})
                      <CaretDown className={cn('w-3 h-3 ml-1 transition-transform duration-200', activeMappingPanel === 'parties' && 'rotate-180')} />
                    </Button>

                    <Button
                      size="sm"
                      variant={activeMappingPanel === 'expenses' ? 'default' : 'outline'}
                      onClick={() => {
                        setActiveMappingPanel(prev => prev === 'expenses' ? null : 'expenses')
                        setMappingSearchQuery('')
                      }}
                      className={cn(
                        'h-7 text-xs font-bold px-2.5 rounded-lg transition-all',
                        activeMappingPanel === 'expenses'
                          ? 'bg-amber-700 text-white shadow-xs'
                          : 'bg-white text-amber-700 border-amber-200 hover:bg-amber-50'
                      )}
                    >
                      <Tag className="w-3.5 h-3.5 mr-1" />
                      Expenses ({distinctTallyExpenses.length})
                      <CaretDown className={cn('w-3 h-3 ml-1 transition-transform duration-200', activeMappingPanel === 'expenses' && 'rotate-180')} />
                    </Button>

                    <Button
                      size="sm"
                      variant={activeMappingPanel === 'counters' ? 'default' : 'outline'}
                      onClick={() => {
                        setActiveMappingPanel(prev => prev === 'counters' ? null : 'counters')
                        setMappingSearchQuery('')
                      }}
                      className={cn(
                        'h-7 text-xs font-bold px-2.5 rounded-lg transition-all',
                        activeMappingPanel === 'counters'
                          ? 'bg-cyan-700 text-white shadow-xs'
                          : 'bg-white text-cyan-700 border-cyan-200 hover:bg-cyan-50'
                      )}
                    >
                      <Bank className="w-3.5 h-3.5 mr-1" />
                      Bank / Cash ({distinctTallyCounters.length})
                      <CaretDown className={cn('w-3 h-3 ml-1 transition-transform duration-200', activeMappingPanel === 'counters' && 'rotate-180')} />
                    </Button>
                  </div>
                </div>

                {/* Master Accordion Expanded Panel Content */}
                {activeMappingPanel && (
                  <div className="mt-2 pt-3 border-t border-violet-200/60 bg-white p-4 rounded-xl shadow-xs space-y-3">
                    {/* Panel 1: Items */}
                    {activeMappingPanel === 'items' && (
                      <>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                              <Package className="w-4 h-4 text-purple-600" />
                              Inventory Items Master Mapping
                              <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200 font-mono">
                                {distinctTallyItems.length} Distinct Stock Items
                              </Badge>
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              Map each stock item from Tally vouchers to an existing ERP item or auto-create a new catalog item.
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="relative w-48">
                              <MagnifyingGlass size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                              <Input
                                value={mappingSearchQuery}
                                onChange={(e) => setMappingSearchQuery(e.target.value)}
                                placeholder="Search items..."
                                className="h-7 text-xs pl-7 pr-2 bg-slate-50 border-slate-200 rounded-md"
                              />
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const autoMap: Record<string, string> = {}
                                distinctTallyItems.forEach(i => {
                                  if (!i.matchedItem) autoMap[i.normName] = 'auto-create'
                                })
                                setItemMappings(prev => ({ ...prev, ...autoMap }))
                                toast.success('Set all unmapped items to Auto-Create')
                              }}
                              className="h-7 text-[11px] font-semibold px-2.5 rounded-md text-purple-700 border-purple-200 bg-purple-50 hover:bg-purple-100"
                            >
                              <Sparkle className="w-3.5 h-3.5 mr-1" />
                              Auto-Create All Unmapped
                            </Button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1">
                          {filteredDistinctItems.map((itemStat) => {
                            const customMappedId = itemMappings[itemStat.normName]
                            const selectedTargetItem = customMappedId && customMappedId !== 'auto-create'
                              ? items.find(i => i.id === customMappedId)
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
                                        ✨ Auto-Create
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-amber-700 bg-amber-50 border-amber-200 text-[9px] px-1.5 py-0">
                                        ⚠️ Unmapped
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-400 font-mono">
                                    {itemStat.voucherCount} voucher(s) • Total Qty: {itemStat.totalQty} {itemStat.unit} • ₹{itemStat.sampleRate}/unit
                                  </div>
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[10px] font-semibold text-slate-500">Map to ERP Item:</label>
                                  <Select
                                    value={customMappedId || (selectedTargetItem?.id) || (isAutoCreated ? 'auto-create' : '')}
                                    onValueChange={(val) => handleItemMapping(itemStat.rawName, val)}
                                  >
                                    <SelectTrigger className="h-7 text-xs bg-white border-slate-200">
                                      <SelectValue placeholder="Select Item" />
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
                      </>
                    )}

                    {/* Panel 2: Unified Parties */}
                    {activeMappingPanel === 'parties' && (
                      <>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                              <Users className="w-4 h-4 text-emerald-600" />
                              Parties Ledger Mapping &amp; Master Selector
                              <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 font-mono">
                                {distinctTallyParties.length} Counterparty Accounts
                              </Badge>
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              Map each party ledger in Tally vouchers to an existing ERP party or auto-create a party master.
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="relative w-48">
                              <MagnifyingGlass size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                              <Input
                                value={mappingSearchQuery}
                                onChange={(e) => setMappingSearchQuery(e.target.value)}
                                placeholder="Search parties..."
                                className="h-7 text-xs pl-7 pr-2 bg-slate-50 border-slate-200 rounded-md"
                              />
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const autoMap: Record<string, string> = {}
                                distinctTallyParties.forEach(p => {
                                  if (!p.matchedParty) autoMap[p.normName] = 'auto-create'
                                })
                                setPartyMappings(prev => ({ ...prev, ...autoMap }))
                                toast.success('Set all unmapped parties to Auto-Create')
                              }}
                              className="h-7 text-[11px] font-semibold px-2.5 rounded-md text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                            >
                              <Sparkle className="w-3.5 h-3.5 mr-1" />
                              Auto-Create All Unmapped
                            </Button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1">
                          {filteredDistinctParties.map((partyStat) => {
                            const customMappedId = partyMappings[partyStat.normName]
                            const selectedTargetParty = customMappedId && customMappedId !== 'auto-create'
                              ? effectiveParties.find(p => p.id === customMappedId)
                              : partyStat.matchedParty

                            const isAutoCreated = customMappedId === 'auto-create' || (!selectedTargetParty && autoCreateMasters)

                            return (
                              <div key={partyStat.normName} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 hover:bg-slate-50 flex flex-col justify-between gap-2">
                                <div className="space-y-0.5">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-bold text-slate-800 text-xs truncate" title={partyStat.rawName}>
                                      {partyStat.rawName}
                                    </span>
                                    {selectedTargetParty ? (
                                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[9px] px-1.5 py-0">
                                        ✓ Matched
                                      </Badge>
                                    ) : isAutoCreated ? (
                                      <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-[9px] px-1.5 py-0">
                                        ✨ Auto-Create
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-amber-700 bg-amber-50 border-amber-200 text-[9px] px-1.5 py-0">
                                        ⚠️ Unmapped
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-400 font-mono">
                                    {partyStat.voucherCount} voucher(s) • Total: {formatCurrency(partyStat.totalAmount)} {partyStat.gstin ? `• GST: ${partyStat.gstin}` : ''}
                                  </div>
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[10px] font-semibold text-slate-500">Map to ERP Party:</label>
                                  <Select
                                    value={customMappedId || (selectedTargetParty?.id) || (isAutoCreated ? 'auto-create' : '')}
                                    onValueChange={(val) => handlePartyMapping(partyStat.rawName, val)}
                                  >
                                    <SelectTrigger className="h-7 text-xs bg-white border-slate-200">
                                      <SelectValue placeholder="Select Party" />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-60">
                                      <SelectItem value="auto-create" className="text-purple-600 font-semibold text-xs">
                                        ✨ Auto-Create &quot;{partyStat.rawName}&quot;
                                      </SelectItem>
                                      {effectiveParties.map(p => (
                                        <SelectItem key={p.id} value={p.id} className="text-xs">
                                          {p.name} {p.phone ? `(${p.phone})` : ''}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </>
                    )}

                    {/* Panel 3: Expenses */}
                    {activeMappingPanel === 'expenses' && (
                      <>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                              <Tag className="w-4 h-4 text-amber-600" />
                              Expense Ledger Category Mapping
                              <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 font-mono">
                                {distinctTallyExpenses.length} Expense Heads
                              </Badge>
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              Map direct / indirect expense ledgers from Tally to expense heads in Zohan ERP.
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="relative w-48">
                              <MagnifyingGlass size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                              <Input
                                value={mappingSearchQuery}
                                onChange={(e) => setMappingSearchQuery(e.target.value)}
                                placeholder="Search expenses..."
                                className="h-7 text-xs pl-7 pr-2 bg-slate-50 border-slate-200 rounded-md"
                              />
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const autoMap: Record<string, string> = {}
                                distinctTallyExpenses.forEach(e => {
                                  if (!e.matchedExpense) autoMap[e.normName] = 'auto-create'
                                })
                                setExpenseMappings(prev => ({ ...prev, ...autoMap }))
                                toast.success('Set all unmapped expenses to Auto-Create')
                              }}
                              className="h-7 text-[11px] font-semibold px-2.5 rounded-md text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100"
                            >
                              <Sparkle className="w-3.5 h-3.5 mr-1" />
                              Auto-Create All Unmapped
                            </Button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1">
                          {filteredDistinctExpenses.map((expStat) => {
                            const customMappedId = expenseMappings[expStat.normName]
                            const selectedTargetExp = customMappedId && customMappedId !== 'auto-create'
                              ? expenseTypes.find(e => e.id === customMappedId)
                              : expStat.matchedExpense

                            const isAutoCreated = customMappedId === 'auto-create' || (!selectedTargetExp && autoCreateMasters)

                            return (
                              <div key={expStat.normName} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 hover:bg-slate-50 flex flex-col justify-between gap-2">
                                <div className="space-y-0.5">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-bold text-slate-800 text-xs truncate" title={expStat.rawName}>
                                      {expStat.rawName}
                                    </span>
                                    {selectedTargetExp ? (
                                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[9px] px-1.5 py-0">
                                        ✓ Matched
                                      </Badge>
                                    ) : isAutoCreated ? (
                                      <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-[9px] px-1.5 py-0">
                                        ✨ Auto-Create
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-amber-700 bg-amber-50 border-amber-200 text-[9px] px-1.5 py-0">
                                        ⚠️ Unmapped
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-400 font-mono">
                                    {expStat.voucherCount} voucher(s) • Total: {formatCurrency(expStat.totalAmount)}
                                  </div>
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[10px] font-semibold text-slate-500">Map to Expense Type:</label>
                                  <Select
                                    value={customMappedId || (selectedTargetExp?.id) || (isAutoCreated ? 'auto-create' : '')}
                                    onValueChange={(val) => handleExpenseMapping(expStat.rawName, val)}
                                  >
                                    <SelectTrigger className="h-7 text-xs bg-white border-slate-200">
                                      <SelectValue placeholder="Select Expense Head" />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-60">
                                      <SelectItem value="auto-create" className="text-purple-600 font-semibold text-xs">
                                        ✨ Auto-Create &quot;{expStat.rawName}&quot;
                                      </SelectItem>
                                      {expenseTypes.map(e => (
                                        <SelectItem key={e.id} value={e.id} className="text-xs">
                                          {e.name} {e.description ? `(${e.description})` : ''}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </>
                    )}

                    {/* Panel 4: Cash / Bank Counters */}
                    {activeMappingPanel === 'counters' && (
                      <>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                              <Bank className="w-4 h-4 text-cyan-600" />
                              Bank &amp; Cash Counter Mapping
                              <Badge variant="outline" className="text-[10px] bg-cyan-50 text-cyan-700 border-cyan-200 font-mono">
                                {distinctTallyCounters.length} Accounts
                              </Badge>
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              Map Tally bank &amp; cash ledgers to ERP Cash &amp; Bank counters for automated balance ledgering.
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="relative w-48">
                              <MagnifyingGlass size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                              <Input
                                value={mappingSearchQuery}
                                onChange={(e) => setMappingSearchQuery(e.target.value)}
                                placeholder="Search accounts..."
                                className="h-7 text-xs pl-7 pr-2 bg-slate-50 border-slate-200 rounded-md"
                              />
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const autoMap: Record<string, string> = {}
                                distinctTallyCounters.forEach(c => {
                                  if (!c.matchedCounter) autoMap[c.normName] = 'auto-create'
                                })
                                setCounterMappings(prev => ({ ...prev, ...autoMap }))
                                toast.success('Set all unmapped bank/cash accounts to Auto-Create')
                              }}
                              className="h-7 text-[11px] font-semibold px-2.5 rounded-md text-cyan-700 border-cyan-200 bg-cyan-50 hover:bg-cyan-100"
                            >
                              <Sparkle className="w-3.5 h-3.5 mr-1" />
                              Auto-Create All Unmapped
                            </Button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1">
                          {filteredDistinctCounters.map((ctrStat) => {
                            const customMappedId = counterMappings[ctrStat.normName]
                            const selectedTargetCtr = customMappedId && customMappedId !== 'auto-create'
                              ? counters.find(c => c.id === customMappedId)
                              : ctrStat.matchedCounter

                            const isAutoCreated = customMappedId === 'auto-create' || (!selectedTargetCtr && autoCreateMasters)

                            return (
                              <div key={ctrStat.normName} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 hover:bg-slate-50 flex flex-col justify-between gap-2">
                                <div className="space-y-0.5">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-bold text-slate-800 text-xs truncate" title={ctrStat.rawName}>
                                      {ctrStat.rawName}
                                    </span>
                                    {selectedTargetCtr ? (
                                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[9px] px-1.5 py-0">
                                        ✓ Matched
                                      </Badge>
                                    ) : isAutoCreated ? (
                                      <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-[9px] px-1.5 py-0">
                                        ✨ Auto-Create
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-amber-700 bg-amber-50 border-amber-200 text-[9px] px-1.5 py-0">
                                        ⚠️ Unmapped
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-400 font-mono">
                                    {ctrStat.voucherCount} voucher(s) • Total: {formatCurrency(ctrStat.totalAmount)}
                                  </div>
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[10px] font-semibold text-slate-500">Map to Bank/Cash Counter:</label>
                                  <Select
                                    value={customMappedId || (selectedTargetCtr?.id) || (isAutoCreated ? 'auto-create' : '')}
                                    onValueChange={(val) => handleCounterMapping(ctrStat.rawName, val)}
                                  >
                                    <SelectTrigger className="h-7 text-xs bg-white border-slate-200">
                                      <SelectValue placeholder="Select Counter" />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-60">
                                      <SelectItem value="auto-create" className="text-purple-600 font-semibold text-xs">
                                        ✨ Auto-Create &quot;{ctrStat.rawName}&quot;
                                      </SelectItem>
                                      {counters.map(c => (
                                        <SelectItem key={c.id} value={c.id} className="text-xs">
                                          {c.name} ({c.type.toUpperCase()})
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* 4. Filter Tabs & Search Bar */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    variant={filterTab === 'all' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setFilterTab('all')}
                    className="h-7 text-xs px-2.5 rounded-lg"
                  >
                    All ({processedList.length})
                  </Button>
                  <Button
                    variant={filterTab === 'matched' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setFilterTab('matched')}
                    className="h-7 text-xs px-2.5 rounded-lg text-emerald-700 hover:text-emerald-800"
                  >
                    Matched ({processedList.filter(v => v.matchedEntityType !== 'unmapped' && !v.hasUnmappedItem).length})
                  </Button>
                  <Button
                    variant={filterTab === 'unmapped' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setFilterTab('unmapped')}
                    className="h-7 text-xs px-2.5 rounded-lg text-rose-600 hover:text-rose-700"
                  >
                    Unmapped ({processedList.filter(v => v.matchedEntityType === 'unmapped' || v.hasUnmappedItem).length})
                  </Button>
                  <Button
                    variant={filterTab === 'sales' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setFilterTab('sales')}
                    className="h-7 text-xs px-2.5 rounded-lg"
                  >
                    Sales ({moduleCounts.sales})
                  </Button>
                  <Button
                    variant={filterTab === 'purchase' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setFilterTab('purchase')}
                    className="h-7 text-xs px-2.5 rounded-lg"
                  >
                    Purchase ({moduleCounts.purchase})
                  </Button>
                  <Button
                    variant={filterTab === 'receipt' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setFilterTab('receipt')}
                    className="h-7 text-xs px-2.5 rounded-lg"
                  >
                    Receipts ({moduleCounts.receipt})
                  </Button>
                  <Button
                    variant={filterTab === 'payment' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setFilterTab('payment')}
                    className="h-7 text-xs px-2.5 rounded-lg"
                  >
                    Payments ({moduleCounts.payment})
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative w-56">
                    <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search party, voucher #, ₹..."
                      className="h-8 text-xs pl-8 bg-slate-50 border-slate-200 rounded-lg"
                    />
                  </div>

                  <Button variant="outline" size="sm" onClick={() => handleSelectAllVisible(true)} className="h-8 text-xs font-semibold px-2.5 bg-white">
                    Select All
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleSelectAllVisible(false)} className="h-8 text-xs font-semibold px-2.5 bg-white">
                    Deselect All
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleSelectOnlyMatched} className="h-8 text-xs font-semibold px-2.5 bg-emerald-50 text-emerald-700 border-emerald-200">
                    Select Matched
                  </Button>
                </div>
              </div>

              {/* 5. Vouchers Review Table */}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow className="text-[11px] font-bold text-slate-700">
                      <TableHead className="w-10 text-center">
                        <Checkbox
                          checked={displayVouchers.length > 0 && displayVouchers.every(v => v.isIncluded)}
                          onCheckedChange={(chk) => handleSelectAllVisible(Boolean(chk))}
                        />
                      </TableHead>
                      <TableHead className="w-8"></TableHead>
                      <TableHead className="w-24">TYPE</TableHead>
                      <TableHead className="w-32 font-mono">VOUCHER #</TableHead>
                      <TableHead className="w-28 font-mono">DATE</TableHead>
                      <TableHead>PARTY / ACCOUNT</TableHead>
                      <TableHead className="text-right w-36">AMOUNT (₹)</TableHead>
                      <TableHead className="text-center w-36">STATUS / MAPPING</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-xs">
                    {displayVouchers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-10 text-slate-400">
                          No vouchers found matching filter criteria.
                        </TableCell>
                      </TableRow>
                    ) : (
                      displayVouchers.map((v) => {
                        const isExpanded = expandedVoucherId === v.id
                        return (
                          <React.Fragment key={v.id}>
                            <TableRow className={cn(
                              'hover:bg-slate-50/80 transition-colors border-b border-slate-100',
                              !v.isIncluded && 'opacity-40 bg-slate-50/40',
                              v.hasUnmappedItem && 'bg-amber-50/30'
                            )}>
                              <TableCell className="text-center">
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
                                    + Auto {v.matchedEntityType === 'party' ? 'Party' : v.matchedEntityType === 'expense' ? 'Expense' : 'Counter'}
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
                                ) : (
                                  <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">Party Match</Badge>
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
                                                : (inv.matchedItemId ? items.find(it => it.id === inv.matchedItemId) : itemMap.get(norm))

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

                                      <div className="space-y-1">
                                        <label className="text-[11px] font-semibold text-slate-600">Reclassify Transaction Type:</label>
                                        <Select
                                          value={v.effectiveType}
                                          onValueChange={(typeVal) => {
                                            setOverrides(prev => ({
                                              ...prev,
                                              [v.id]: {
                                                ...(prev[v.id] || {}),
                                                typeOverride: typeVal as any
                                              }
                                            }))
                                          }}
                                        >
                                          <SelectTrigger className="h-8 text-xs bg-slate-50 border-slate-200">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="sales">Sales Invoice</SelectItem>
                                            <SelectItem value="purchase">Purchase Invoice</SelectItem>
                                            <SelectItem value="receipt">Customer Payment</SelectItem>
                                            <SelectItem value="payment">Supplier Payment</SelectItem>
                                            <SelectItem value="credit_note">Credit Note</SelectItem>
                                            <SelectItem value="debit_note">Debit Note</SelectItem>
                                            <SelectItem value="expense">Expense Entry</SelectItem>
                                            <SelectItem value="contra">Contra Cash/Bank Transfer</SelectItem>
                                            <SelectItem value="skipped">Skip Ingestion</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>

                                      {/* Counter Mapping if Contra */}
                                      {v.effectiveType === 'contra' ? (
                                        <div className="space-y-2 pt-1 border-t border-slate-100">
                                          <div className="space-y-1">
                                            <label className="text-[11px] font-semibold text-slate-600">From Account (Source Counter):</label>
                                            <Select
                                              value={v.contraDetails?.fromCounterId || ''}
                                              onValueChange={(cid) => {
                                                setOverrides(prev => ({
                                                  ...prev,
                                                  [v.id]: {
                                                    ...(prev[v.id] || {}),
                                                    fromCounterId: cid
                                                  }
                                                }))
                                              }}
                                            >
                                              <SelectTrigger className="h-7 text-xs bg-slate-50 border-slate-200">
                                                <SelectValue placeholder="Select Source Account" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                {counters.map(c => (
                                                  <SelectItem key={c.id} value={c.id} className="text-xs">
                                                    {c.name} ({c.type})
                                                  </SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                          </div>

                                          <div className="space-y-1">
                                            <label className="text-[11px] font-semibold text-slate-600">To Account (Destination Counter):</label>
                                            <Select
                                              value={v.contraDetails?.toCounterId || ''}
                                              onValueChange={(cid) => {
                                                setOverrides(prev => ({
                                                  ...prev,
                                                  [v.id]: {
                                                    ...(prev[v.id] || {}),
                                                    toCounterId: cid
                                                  }
                                                }))
                                              }}
                                            >
                                              <SelectTrigger className="h-7 text-xs bg-slate-50 border-slate-200">
                                                <SelectValue placeholder="Select Destination Account" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                {counters.map(c => (
                                                  <SelectItem key={c.id} value={c.id} className="text-xs">
                                                    {c.name} ({c.type})
                                                  </SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                          </div>
                                        </div>
                                      ) : v.effectiveType === 'expense' ? (
                                        <div className="space-y-1 pt-1 border-t border-slate-100">
                                          <label className="text-[11px] font-semibold text-slate-600">Map to Expense Head:</label>
                                          <Select
                                            value={v.matchedEntityId || ''}
                                            onValueChange={(eid) => {
                                              setOverrides(prev => ({
                                                ...prev,
                                                [v.id]: {
                                                  ...(prev[v.id] || {}),
                                                  matchedEntityId: eid,
                                                  matchedEntityType: 'expense'
                                                }
                                              }))
                                            }}
                                          >
                                            <SelectTrigger className="h-8 text-xs bg-slate-50 border-slate-200">
                                              <SelectValue placeholder="Select Expense Category" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {expenseTypes.map(e => (
                                                <SelectItem key={e.id} value={e.id} className="text-xs">
                                                  {e.name} {e.description ? `(${e.description})` : ''}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      ) : (
                                        <div className="space-y-1 pt-1 border-t border-slate-100">
                                          <label className="text-[11px] font-semibold text-slate-600">Map to Party:</label>
                                          <Select
                                            value={v.matchedEntityId || ''}
                                            onValueChange={(pid) => {
                                              setOverrides(prev => ({
                                                ...prev,
                                                [v.id]: {
                                                  ...(prev[v.id] || {}),
                                                  matchedEntityId: pid,
                                                  matchedEntityType: 'party'
                                                }
                                              }))
                                            }}
                                          >
                                            <SelectTrigger className="h-8 text-xs bg-slate-50 border-slate-200">
                                              <SelectValue placeholder="Select Party" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {effectiveParties.map(p => (
                                                <SelectItem key={p.id} value={p.id} className="text-xs">
                                                  {p.name} {p.phone ? `(${p.phone})` : ''}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      )}

                                      <div className="pt-2 flex items-center justify-between">
                                        <span className="text-xs text-slate-500 font-semibold">Include in database import</span>
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
                      (Auto-creating {newMastersSummary.partiesCount} Parties, {newMastersSummary.expensesCount} Exp, {newMastersSummary.itemsCount} Items, {newMastersSummary.countersCount} Counters)
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
                  <label className="text-[11px] font-semibold text-slate-600">Output CGST</label>
                  <Input
                    value={tempMapping.outputCgstLedgerName}
                    onChange={e => setTempMapping(p => ({ ...p, outputCgstLedgerName: e.target.value }))}
                    className="h-8 text-xs bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600">Output SGST</label>
                  <Input
                    value={tempMapping.outputSgstLedgerName}
                    onChange={e => setTempMapping(p => ({ ...p, outputSgstLedgerName: e.target.value }))}
                    className="h-8 text-xs bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600">Output IGST</label>
                  <Input
                    value={tempMapping.outputIgstLedgerName}
                    onChange={e => setTempMapping(p => ({ ...p, outputIgstLedgerName: e.target.value }))}
                    className="h-8 text-xs bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600">Input CGST</label>
                  <Input
                    value={tempMapping.inputCgstLedgerName}
                    onChange={e => setTempMapping(p => ({ ...p, inputCgstLedgerName: e.target.value }))}
                    className="h-8 text-xs bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600">Input SGST</label>
                  <Input
                    value={tempMapping.inputSgstLedgerName}
                    onChange={e => setTempMapping(p => ({ ...p, inputSgstLedgerName: e.target.value }))}
                    className="h-8 text-xs bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600">Input IGST</label>
                  <Input
                    value={tempMapping.inputIgstLedgerName}
                    onChange={e => setTempMapping(p => ({ ...p, inputIgstLedgerName: e.target.value }))}
                    className="h-8 text-xs bg-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <Button
                  size="sm"
                  onClick={() => {
                    setLedgerMapping(tempMapping)
                    localStorage.setItem(STORAGE_KEY_TALLY_MAPPING, JSON.stringify(tempMapping))
                    setShowMappingSettings(false)
                    toast.success('Saved custom Tally ledger mapping')
                  }}
                  className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                >
                  Save Configuration
                </Button>
              </div>
            </div>
          )}

          {/* C. Modules Checklist */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700">Include Modules in Export:</label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                <Checkbox
                  checked={exportModules.sales}
                  onCheckedChange={c => setExportModules(p => ({ ...p, sales: Boolean(c) }))}
                />
                Sales Invoices
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                <Checkbox
                  checked={exportModules.purchase}
                  onCheckedChange={c => setExportModules(p => ({ ...p, purchase: Boolean(c) }))}
                />
                Purchase Invoices
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                <Checkbox
                  checked={exportModules.creditNotes}
                  onCheckedChange={c => setExportModules(p => ({ ...p, creditNotes: Boolean(c) }))}
                />
                Credit Notes
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                <Checkbox
                  checked={exportModules.debitNotes}
                  onCheckedChange={c => setExportModules(p => ({ ...p, debitNotes: Boolean(c) }))}
                />
                Debit Notes
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                <Checkbox
                  checked={exportModules.expenses}
                  onCheckedChange={c => setExportModules(p => ({ ...p, expenses: Boolean(c) }))}
                />
                Expenses (with GTA RCM)
              </label>
            </div>
          </div>

          {/* D. Export Action Buttons & Summary */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-slate-800">
                Ready to Export: <span className="text-indigo-600 font-black">{exportVouchers.length} Vouchers</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Total Accounting Amount: <span className="font-mono font-semibold text-slate-700">{formatCurrency(exportVouchers.reduce((s, v) => s + v.totalAmount, 0))}</span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={handleExportExcel}
                disabled={exportVouchers.length === 0}
                className="h-9 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs"
              >
                <FileXls className="w-4 h-4 mr-1.5" />
                Export Multi-Column Excel
              </Button>
              <Button
                onClick={handleExportXML}
                disabled={exportVouchers.length === 0}
                className="h-9 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs"
              >
                <FileCode className="w-4 h-4 mr-1.5" />
                Export Tally Prime XML
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
