/*
 * SK TRADERS - Source-Driven Financial Management System
 * 
 * MULTI-TENANT ARCHITECTURE: LOCALSTORAGE PARTITION DESIGN
 * =========================================================
 * 
 * This application uses a strict multi-tenant isolation model:
 * 
 * 1. METADATA STORAGE:
 *    - Single key 'app_metadata' stores:
 *      { businesses: [{ id, name, startFY }], activeCompanyId, activeFY }
 * 
 * 2. TENANT DATA PARTITIONS:
 *    - Each business/FY combination stores data in isolated key:
 *      `data_${companyId}_${fy}`
 *    - Contains: suppliers, customers, items, invoices, payments, etc.
 * 
 * 3. ANTI-CRASH SWITCHING PROTOCOL:
 *    - BEFORE loading new tenant data:
 *      a) Reset all operational states to empty arrays []
 *      b) Clear calculation memos
 *      c) Render safe empty UI
 *    - AFTER state reset complete:
 *      d) Load new tenant data from LocalStorage
 *      e) Populate states with new data or empty defaults
 * 
 * 4. SOURCE-DRIVEN CALCULATION RULES:
 *    - All reports calculate live from source data
 *    - No stored calculation results
 *    - Timestamps control FIFO ordering
 *    - Received discounts are immutable
 * 
 * 5. BACKUP/RESTORE ARCHITECTURE:
 *    - Single Entity Export: Only current `data_${id}_${fy}` JSON
 *    - Master Backup: Full metadata + all data_* keys
 *    - Smart Import: Auto-detect type and restore accordingly
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { motion, AnimatePresence } from 'framer-motion'
import { useKeyboardShortcuts, ShortcutAction } from '@/hooks/use-keyboard-shortcuts'
import { KeyboardShortcutsDialog } from '@/components/keyboard-shortcuts-dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { 
  Database, 
  SquaresFour,
  Users,
  Package,
  UsersThree,
  Receipt,
  CreditCard,
  Wallet,
  ChartBar,
  FileText,
  ChartPie,
  Cube,
  CalendarBlank,
  Trash,
  CaretDown,
  DownloadSimple,
  UploadSimple,
  Pencil,
  Buildings,
  Gear,
  Lock,
  LockOpen,
  CaretLeft,
  CaretRight,
  Keyboard,
  BookBookmark,
  Plus,
  Bank,
  UserGear,
  Scales,
  Percent
} from '@phosphor-icons/react'

import SupplierCDRulesPage from '@/components/supplier-cd-rules-page'
import { toast, Toaster } from 'sonner'
import { getCurrentFY } from '@/lib/calculations'
import { cn } from '@/lib/utils'
import { 
  createSingleEntityBackup, 
  downloadSingleEntityBackup,
  createMasterBackup,
  downloadMasterBackup,
  validateBackup, 
  detectBackupType,
  SingleEntityBackupData,
  MasterBackupData
} from '@/lib/backup-utils'
import {
  getMetadata,
  saveMetadata,
  getTenantData,
  saveTenantData,
  generateFYOptions,
  createBusinessId,
  getTenantKey,
  deleteTenantData,
  AppMetadata,
  BusinessMetadata,
  TenantData
} from '@/lib/storage-utils'
import {
  appendAuditLog,
  AuthenticatedUser,
  createAgentAccount,
  createMasterAdmin,
  getCurrentUser,
  getUserAccounts,
  hasAppLock,
  hasAuthenticatedSession,
  isAllowedRestoreKey,
  lockAppSession,
  PermissionLevel,
  safeJsonParse,
  saveUserAccounts,
  UserAccount,
  verifyAppPasscode,
  verifyUserLogin,
  verifyUserLoginDetailed
} from '@/lib/security-utils'
import {
  canUseRemoteStorage,
  loadRemoteTenantData,
  RemoteSnapshotConflictError,
  RemoteStorageUnavailableError,
  saveRemoteTenantData,
  subscribeTenantData
} from '@/lib/firebase-storage'
import { appendServerAuditLog } from '@/lib/remote-audit'
import { isLocalCacheDisabled } from '@/lib/firebase-client'
import {
  canUseFirebaseAuth,
  createRemoteAgentAccount,
  getRemoteCurrentUser,
  listRemoteUserProfiles,
  RemoteAuthServiceUnavailableError,
  signInRemoteUser,
  signOutRemoteUser,
  updateRemoteUserProfile
} from '@/lib/firebase-auth'
import {
  Supplier,
  PurchaseInvoice,
  Payment,
  ReceivedDiscount,
  Customer,
  Item,
  SalesInvoice,
  CustomerPayment,
  CustomerCreditNote,
  SupplierDebitNote,
  SalesReturn,
  PurchaseReturn,
  ExpenseType,
  ExpenseEntry,
  FixedScheme,
  MTBooking
} from '@/lib/types'
import { AppHeader } from '@/components/AppHeader'
import { AppSidebar } from '@/components/AppSidebar'
import { AppDialogs } from '@/components/AppDialogs'
import { AddBusinessDialog } from '@/components/add-business-dialog'
import SuppliersPage from '@/components/suppliers-page'
import ItemsPage from '@/components/items-page'
import InvoicesPage from '@/components/invoices-page'
import PaymentsPage from '@/components/payments-page'
import DiscountWalletPage from '@/components/discount-wallet-page'
import AnnualDiscountPage from '@/components/annual-discount-page'
import CustomersPage from '@/components/customers-page'
import SalesInvoicesPage from '@/components/sales-invoices-page'
import CustomerPaymentsPage from '@/components/customer-payments-page'
import SupplierLedgerPage from '@/components/supplier-ledger-page'
import CustomerLedgerPage from '@/components/customer-ledger-page'
import ExpenseTypesPage from '@/components/expense-types-page'
import ExpenseEntriesPage from '@/components/expense-entries-page'
import FixedSchemesPage from '@/components/fixed-schemes-page'
import MTBookingsPage from '@/components/mt-bookings-page'
import InventoryReportPage from '@/components/inventory-report-page'
import CDAtRiskReportPage from '@/components/cd-at-risk-report-page'
import CDProfitReportsPage from '@/components/cd-profit-reports-page'
import MasterDashboardPage from '@/components/master-dashboard-page'
import PurchaseInvoiceDetailsPage from '@/components/purchase-invoice-details-page'
import PaymentDetailsPage from '@/components/payment-details-page'
import CashBankCountersMaster from '@/components/cash-bank-counters-master'
import CashBankVoucherEntry from '@/components/cash-bank-voucher-entry'
import CashBankBookReport from '@/components/cash-bank-book-report'
import CashBankManagement from '@/components/cash-bank-management'
import UserManagementPage, { PermissionOption } from '@/components/user-management-page'
import CustomerCreditNotePage from '@/components/customer-credit-note-page'
import SupplierDebitNotePage from '@/components/supplier-debit-note-page'
import SalesReturnPage from '@/components/sales-return-page'
import PurchaseReturnPage from '@/components/purchase-return-page'
import { loadBusinessesFromCloud, saveBusinessToCloud, deleteBusinessFromCloud } from '@/lib/business-sync'

const tenantDataCollectionKeys: Array<keyof TenantData> = [
  'suppliers',
  'customers',
  'items',
  'invoices',
  'payments',
  'receivedDiscounts',
  'salesInvoices',
  'customerPayments',
  'expenseTypes',
  'expenseEntries',
  'fixedSchemes',
  'mtBookings',
  'advanceBookingPickups',
  'discountLedgerEntries',
  'creditNotes',
  'debitNotes',
  'salesReturns',
  'purchaseReturns',
  'userAccounts'
]

function isPrimitive(val: any) {
  return val === null || val === undefined || typeof val !== 'object';
}

function areObjectsSemanticallyEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (isPrimitive(a) || isPrimitive(b)) {
    const normalize = (v: any) => (v === null || v === undefined) ? '' : String(v);
    return normalize(a) === normalize(b);
  }
  
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const hasIds = a.length > 0 && a[0] && typeof a[0] === 'object' && 'id' in a[0];
    if (hasIds) {
      const bMap = new Map(b.map((item: any) => [item ? item.id : '', item]));
      for (const itemA of a) {
        if (!itemA) continue;
        const itemB = bMap.get(itemA.id);
        if (!itemB) return false;
        if (!areObjectsSemanticallyEqual(itemA, itemB)) return false;
      }
      return true;
    } else {
      for (let i = 0; i < a.length; i++) {
        if (!areObjectsSemanticallyEqual(a[i], b[i])) return false;
      }
      return true;
    }
  }

  const keysA = Object.keys(a).filter(k => a[k] !== undefined && a[k] !== null);
  const keysB = Object.keys(b).filter(k => b[k] !== undefined && b[k] !== null);
  if (keysA.length !== keysB.length) return false;

  for (const k of keysA) {
    if (!areObjectsSemanticallyEqual(a[k], b[k])) return false;
  }
  return true;
}

function hasTenantRecords(data: TenantData): boolean {
  return tenantDataCollectionKeys.some((key) => Array.isArray(data[key]) && data[key].length > 0)
}

type TenantCacheEnvelope = {
  payload: TenantData
  revision: number | null
  updatedAt: string
}

function getTenantCacheKey(companyId: string, tenantKey: string): string {
  return `remote_cache_${companyId}_${tenantKey}`
}

function readTenantCache(companyId: string, tenantKey: string): TenantCacheEnvelope | null {
  if (isLocalCacheDisabled) return null
  try {
    const raw = localStorage.getItem(getTenantCacheKey(companyId, tenantKey))
    return raw ? safeJsonParse<TenantCacheEnvelope | null>(raw, null) : null
  } catch (error) {
    console.error('Failed to read tenant cache:', error)
    return null
  }
}

function safeLocalStorageSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch (error: any) {
    console.warn(`LocalStorage write warning for "${key}":`, error)
    if (error?.name === 'QuotaExceededError' || error?.code === 22 || String(error).includes('Quota')) {
      console.warn('LocalStorage quota exceeded. Pruning orphaned cache keys...')
      try {
        const keysToRemove: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)
          if (k && (k.startsWith('tenant_cache_') || k.includes('_temp_') || k.includes('_backup_old_'))) {
            keysToRemove.push(k)
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k))
        localStorage.setItem(key, value)
        return true
      } catch (retryError) {
        console.error('LocalStorage write failed after pruning:', retryError)
      }
    }
    return false
  }
}

function writeTenantCache(
  companyId: string,
  tenantKey: string,
  payload: TenantData,
  revision: number | null
): void {
  if (isLocalCacheDisabled) return
  safeLocalStorageSet(tenantKey, JSON.stringify(payload))
  safeLocalStorageSet(getTenantCacheKey(companyId, tenantKey), JSON.stringify({
    payload,
    revision,
    updatedAt: new Date().toISOString()
  }))
}

type NavItem = {
  id: string
  label: string
  icon: React.ComponentType<any>
}

type NavGroup = {
  title: string
  isSingle?: boolean
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    title: 'Sales',
    items: [
      { id: 'sales-invoices', label: 'Sales Invoice', icon: Receipt },
      { id: 'customer-payments', label: 'Payment In', icon: CreditCard },
      { id: 'customer-credit-notes', label: 'Credit Note', icon: FileText },
      { id: 'sales-returns', label: 'Sales Return', icon: Receipt },
      { id: 'customer-ledger', label: 'Customer Ledger', icon: FileText },
      { id: 'customers', label: 'Customer', icon: UsersThree },
    ]
  },
  {
    title: 'Purchase',
    items: [
      { id: 'invoices', label: 'Purchased Invoice', icon: Receipt },
      { id: 'payments', label: 'Payment Out', icon: CreditCard },
      { id: 'supplier-debit-notes', label: 'Debit Note', icon: FileText },
      { id: 'purchase-returns', label: 'Purchased Return', icon: Receipt },
      { id: 'supplier-ledger', label: 'Supplier Ledger', icon: FileText },
      { id: 'suppliers', label: 'Supplier', icon: Users },
    ]
  },
  {
    title: 'Expenses',
    isSingle: true,
    items: [
      { id: 'expense-entries', label: 'Expenses', icon: FileText },
    ]
  },
  {
    title: 'Items',
    isSingle: true,
    items: [
      { id: 'items', label: 'Items', icon: Package },
    ]
  },
  {
    title: 'Cash & Bank',
    isSingle: true,
    items: [
      { id: 'cash-bank-master', label: 'Cash & Bank', icon: Bank },
    ]
  },
  {
    title: 'Reports',
    items: [
      { id: 'cd-profit-report', label: 'Payment CD & Profit Analytics', icon: Scales },
      { id: 'inventory', label: 'Inventory Report', icon: Cube },
      { id: 'cd-risk', label: 'CD at Risk', icon: ChartBar },
      { id: 'wallet', label: 'Discount Wallet', icon: Wallet },
      { id: 'annual', label: 'Annual Discount', icon: ChartPie },
      { id: 'invoice-details', label: 'Invoice Details', icon: Receipt },
      { id: 'payment-details', label: 'Payment Details', icon: CreditCard },
    ]
  },
  {
    title: 'Discount Configuration',
    items: [
      { id: 'supplier-cd-rules', label: 'Supplier CD Rules', icon: Percent },
      { id: 'fixed-schemes', label: 'Fixed Schemes', icon: CalendarBlank },
      { id: 'mt-bookings', label: 'MT Booking Master', icon: BookBookmark },
    ]
  }
]

const adminNavGroup: NavGroup = {
  title: 'Admin',
  items: [
    { id: 'user-management', label: 'Agent Access', icon: UserGear },
  ]
}

const permissionOptions: PermissionOption[] = [
  { id: 'dashboard', label: 'Dashboard', group: 'Overview' },
  ...navGroups.flatMap((group) => group.items.map((item) => ({
    id: item.id,
    label: item.label,
    group: group.title
  })))
]

const viewNames: Record<string, string> = {
  'dashboard': 'Dashboard',
  'suppliers': 'Suppliers',
  'customers': 'Customers',
  'items': 'Items',
  'invoices': 'Purchase Invoices',
  'payments': 'Supplier Payments',
  'sales-invoices': 'Sales Invoices',
  'customer-payments': 'Customer Payments',
  'expense-entries': 'Expense Entries',
  'cd-profit-report': 'Payment CD & Profit Analytics',
  'inventory': 'Inventory Report',
  'cd-risk': 'CD at Risk',
  'wallet': 'Discount Wallet',
  'annual': 'Annual Discount',
  'supplier-ledger': 'Supplier Ledger',
  'customer-ledger': 'Customer Ledger',
  'invoice-details': 'Invoice Details',
  'payment-details': 'Payment Details',
  'expense-types': 'Expense Types',
  'fixed-schemes': 'Fixed Schemes',
  'mt-bookings': 'MT Booking Master',
  'cash-bank-master': 'Cash & Bank',
  'cash-bank-voucher': 'Cash/Bank Voucher',
  'cash-bank-ledger': 'Cash & Bank Ledger',
  'user-management': 'Agent Access',
  'customer-credit-notes': 'Credit Note',
  'supplier-debit-notes': 'Debit Note',
  'sales-returns': 'Sales Return',
  'purchase-returns': 'Purchase Return',
}

function App() {
  const useServerAuth = canUseFirebaseAuth()
  const [metadata, setMetadata] = useState<AppMetadata>(() => {
    const meta = getMetadata()
    if (!meta.businesses || meta.businesses.length === 0) {
      const defaultMeta: AppMetadata = {
        businesses: [{ id: 'sk_traders', name: 'SK TRADERS', startFY: getCurrentFY() }],
        activeCompanyId: 'sk_traders',
        activeFY: getCurrentFY()
      }
      saveMetadata(defaultMeta)
      return defaultMeta
    }
    return meta
  })

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [receivedDiscounts, setReceivedDiscounts] = useState<ReceivedDiscount[]>([])
  const [salesInvoices, setSalesInvoices] = useState<SalesInvoice[]>([])
  const [customerPayments, setCustomerPayments] = useState<CustomerPayment[]>([])
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([])
  const [expenseEntries, setExpenseEntries] = useState<ExpenseEntry[]>([])
  const [fixedSchemes, setFixedSchemes] = useState<FixedScheme[]>([])
  const [mtBookings, setMTBookings] = useState<MTBooking[]>([])
  const [advanceBookingPickups, setAdvanceBookingPickups] = useState<any[]>([])
  const [discountLedgerEntries, setDiscountLedgerEntries] = useState<any[]>([])
  const [cashBankCounters, setCashBankCounters] = useState<any[]>([])
  const [cashBankTransactions, setCashBankTransactions] = useState<any[]>([])
  const [creditNotes, setCreditNotes] = useState<CustomerCreditNote[]>([])
  const [debitNotes, setDebitNotes] = useState<SupplierDebitNote[]>([])
  const [salesReturns, setSalesReturns] = useState<SalesReturn[]>([])
  const [purchaseReturns, setPurchaseReturns] = useState<PurchaseReturn[]>([])
  const [selectedInvoiceDetailsNo, setSelectedInvoiceDetailsNo] = useState<string>('')

  const handleNavigateToInvoiceDetails = (invoiceNo: string) => {
    setSelectedInvoiceDetailsNo(invoiceNo)
    setActiveView('invoice-details')
  }

  
  const [isLocked, setIsLocked] = useState(false)
  const [gstPercentage, setGstPercentage] = useState(18)
  const [authMode, setAuthMode] = useState<'setup' | 'unlock'>(() => useServerAuth ? 'unlock' : hasAppLock() ? 'unlock' : 'setup')
  const [isAuthenticated, setIsAuthenticated] = useState(() => useServerAuth ? false : hasAuthenticatedSession())
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(() => useServerAuth ? null : getCurrentUser())
  const [userAccounts, setUserAccounts] = useState<UserAccount[]>(() => getUserAccounts())
  const [authUsername, setAuthUsername] = useState(useServerAuth ? '' : 'admin')
  const [authDisplayName, setAuthDisplayName] = useState('Master Admin')
  const [authPasscode, setAuthPasscode] = useState('')
  const [authConfirmPasscode, setAuthConfirmPasscode] = useState('')
  const [authError, setAuthError] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [authHydrated, setAuthHydrated] = useState(!useServerAuth)
  const [tenantHydrated, setTenantHydrated] = useState(false)
  
  const setActiveCompany = (companyName: string) => {
    const business = metadata.businesses.find(b => b.name === companyName)
    if (business && business.id !== metadata.activeCompanyId) {
      setSuppliers([])
      setCustomers([])
      setItems([])
      setInvoices([])
      setPayments([])
      setReceivedDiscounts([])
      setSalesInvoices([])
      setCustomerPayments([])
      setExpenseTypes([])
      setExpenseEntries([])
      setFixedSchemes([])
      setMTBookings([])
      setCashBankCounters([])
      setCashBankTransactions([])
      setCreditNotes([])
      setDebitNotes([])
      setSalesReturns([])
      setPurchaseReturns([])
      const updatedMeta: AppMetadata = {
        ...metadata,
        activeCompanyId: business.id,
        activeFY: business.startFY || metadata.activeFY || getCurrentFY()
      }
      setMetadata(updatedMeta)
      saveMetadata(updatedMeta)
    }
  }
  
  const setActiveFY = (fy: string) => {
    if (fy !== metadata.activeFY) {
      setSuppliers([])
      setCustomers([])
      setItems([])
      setInvoices([])
      setPayments([])
      setReceivedDiscounts([])
      setSalesInvoices([])
      setCustomerPayments([])
      setExpenseTypes([])
      setExpenseEntries([])
      setFixedSchemes([])
      setMTBookings([])
      setCashBankCounters([])
      setCashBankTransactions([])
      setCreditNotes([])
      setDebitNotes([])
      setSalesReturns([])
      setPurchaseReturns([])
      const updatedMeta: AppMetadata = { ...metadata, activeFY: fy }
      setMetadata(updatedMeta)
      saveMetadata(updatedMeta)
    }
  }

  useEffect(() => {
    if (metadata && metadata.activeCompanyId) {
      saveMetadata(metadata)
    }
  }, [metadata])
  
  const [activeView, setActiveView] = useState('dashboard')
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    'Sales': true,
    'Purchase': false,
    'Expenses': false,
    'Items': false,
    'Cash & Bank': false,
    'Reports': false,
    'Discount Configuration': false,
    'Admin': false
  })
  
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false)
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [tempGstPercentage, setTempGstPercentage] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [isHoveringsidebar, setIsHoveringsidebar] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)
  const remoteRevisionRef = useRef<Record<string, number | null>>({})
  const lastSavedDataRef = useRef<string>('')
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false)
  const [addBusinessDialogOpen, setAddBusinessDialogOpen] = useState(false)
  const [editBusinessDialogOpen, setEditBusinessDialogOpen] = useState(false)
  const [newBusinessName, setNewBusinessName] = useState('')
  const [newBusinessStartFY, setNewBusinessStartFY] = useState(getCurrentFY())
  const [editBusinessName, setEditBusinessName] = useState('')

  const currentActiveBusiness = metadata.businesses.find(b => b.id === metadata.activeCompanyId)
  const activeCompany = currentActiveBusiness?.name || 'SK TRADERS'
  const activeFY = currentActiveBusiness?.startFY || metadata.activeFY || getCurrentFY()
  const tenantKey = getTenantKey(metadata.activeCompanyId, activeFY)
  const cashBankKey = `cashbank_${metadata.activeCompanyId}_${activeFY}`
  const storedCompanies = metadata.businesses.map(b => b.name)

  const safeSuppliers = suppliers || []
  const safeCustomers = customers || []
  const safeItems = items || []
  const safeInvoices = invoices || []
  const safePayments = payments || []
  const safeReceivedDiscounts = receivedDiscounts || []
  const safeSalesInvoices = salesInvoices || []
  const safeCustomerPayments = customerPayments || []
  const safeExpenseTypes = expenseTypes || []
  const safeExpenseEntries = expenseEntries || []
  const safeCreditNotes = creditNotes || []
  const safeDebitNotes = debitNotes || []
  const safeSalesReturns = salesReturns || []
  const safePurchaseReturns = purchaseReturns || []
  const safeFixedSchemes = fixedSchemes || []
  const safeMTBookings = mtBookings || []
  const safeStoredCompanies = storedCompanies || ['SK TRADERS']
  const safeIsLocked = isLocked || false
  const canSyncRemoteTenant = !useServerAuth || (authHydrated && isAuthenticated && Boolean(currentUser))
  const safeGstPercentage = gstPercentage || 18
  const safeBusinessName = activeCompany || 'SK TRADERS'
  const safeCurrentFY = activeFY || getCurrentFY()
  const isMasterAdmin = currentUser?.role === 'master_admin'
  const availableNavGroups = useMemo(() => {
    if (isMasterAdmin) return [...navGroups, adminNavGroup]
    return navGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          const level = currentUser?.permissions[item.id] || 'none'
          return level === 'view' || level === 'edit'
        })
      }))
      .filter((group) => group.items.length > 0)
  }, [currentUser, isMasterAdmin])

  // Filter Cash & Bank Counters for Agents
  const agentAllowedCounters = currentUser?.role === 'agent' ? (currentUser.allowedCounters || []) : []
  const visibleCashBankCounters = useMemo(() => {
    if (currentUser?.role !== 'agent') return cashBankCounters
    if (agentAllowedCounters.length === 0) return []
    return cashBankCounters.filter(c => agentAllowedCounters.includes(c.id))
  }, [cashBankCounters, currentUser, agentAllowedCounters])

  const visibleCashBankTransactions = useMemo(() => {
    if (currentUser?.role !== 'agent') return cashBankTransactions
    if (agentAllowedCounters.length === 0) return []
    return cashBankTransactions.filter(t => {
      if (t.type === 'Transfer') {
        return agentAllowedCounters.includes(t.counterId) || agentAllowedCounters.includes(t.toCounterId || '')
      }
      return agentAllowedCounters.includes(t.counterId)
    })
  }, [cashBankTransactions, currentUser, agentAllowedCounters])

  const allBusinessCounters = useMemo(() => {
    const map = new Map<string, any>()

    metadata.businesses.forEach((biz) => {
      const fy = metadata.activeFY || biz.startFY || '2026-27'
      const tenant = getTenantData(biz.id, fy)
      if (tenant && Array.isArray(tenant.cashBankCounters)) {
        tenant.cashBankCounters.forEach((counter: any) => {
          if (counter && counter.id) {
            map.set(`${biz.id}_${counter.id}`, {
              ...counter,
              businessId: biz.id,
              businessName: biz.name
            })
          }
        })
      }
    })

    if (Array.isArray(cashBankCounters)) {
      cashBankCounters.forEach((counter: any) => {
        if (counter && counter.id) {
          const key = `${metadata.activeCompanyId}_${counter.id}`
          if (!map.has(key)) {
            map.set(key, {
              ...counter,
              businessId: metadata.activeCompanyId,
              businessName: activeCompany || 'Default Business'
            })
          }
        }
      })
    }

    return Array.from(map.values())
  }, [metadata.businesses, metadata.activeFY, metadata.activeCompanyId, activeCompany, cashBankCounters])

  const canAccessView = useCallback((viewId: string) => {
    if (viewId === 'dashboard') return true
    if (viewId === 'user-management') return isMasterAdmin
    if (isMasterAdmin) return true
    const level = currentUser?.permissions[viewId] || 'none'
    return level === 'view' || level === 'edit'
  }, [currentUser, isMasterAdmin])
  const permissionLevelFor = useCallback((viewId: string): PermissionLevel => {
    if (isMasterAdmin) return 'edit'
    if (viewId === 'dashboard') return 'view'
    return currentUser?.permissions[viewId] || 'none'
  }, [currentUser, isMasterAdmin])
  const canEditView = useCallback((viewId: string) => permissionLevelFor(viewId) === 'edit', [permissionLevelFor])
  const isViewReadOnly = useCallback((viewId: string) => safeIsLocked || !canEditView(viewId), [canEditView, safeIsLocked])


  // Sync businesses from cloud
  useEffect(() => {
    if (useServerAuth && !isAuthenticated) return;

    let cancelled = false;
    const syncBusinesses = async () => {
      const cloudBusinesses = await loadBusinessesFromCloud();
      if (cancelled || !cloudBusinesses.length) return;
      
      setMetadata(prev => {
        const cloudMetadataList = cloudBusinesses.map(cb => cb.metadata);
        
        // Sync details to localStorage
        for (const cb of cloudBusinesses) {
          if (cb.details) {
            localStorage.setItem(`business_details_${cb.metadata.id}`, JSON.stringify(cb.details));
          }
        }
        
        // Check if business list has changed (additions or deletions in cloud)
        const isDifferent = 
          prev.businesses.length !== cloudMetadataList.length ||
          prev.businesses.some((b, i) => b.id !== cloudMetadataList[i]?.id || b.name !== cloudMetadataList[i]?.name);

        if (isDifferent) {
          const validActive = cloudMetadataList.find(b => b.id === prev.activeCompanyId) 
            ? prev.activeCompanyId 
            : cloudMetadataList[0]?.id || prev.activeCompanyId;
          const activeBiz = cloudMetadataList.find(b => b.id === validActive);
          
          const nextMeta: AppMetadata = {
            ...prev,
            businesses: cloudMetadataList,
            activeCompanyId: validActive,
            activeFY: activeBiz?.startFY || prev.activeFY
          };
          saveMetadata(nextMeta);
          return nextMeta;
        }
        return prev;
      });
    };
    syncBusinesses();
    return () => { cancelled = true; };
  }, [useServerAuth, isAuthenticated]);

  useEffect(() => {
    if (!useServerAuth) return
    let cancelled = false

    const hydrateRemoteUser = async () => {
      setAuthHydrated(false)
      try {
        const user = await getRemoteCurrentUser()
        if (cancelled) return
        setCurrentUser(user)
        setIsAuthenticated(Boolean(user))
        setAuthMode('unlock')
      } catch (error) {
        if (cancelled) return
        const message = error instanceof RemoteAuthServiceUnavailableError
          ? error.message
          : 'Unable to load server login profile.'
        setCurrentUser(null)
        setIsAuthenticated(false)
        setAuthMode('unlock')
        setAuthError(message)
        toast.error(message)
      } finally {
        if (!cancelled) {
          setAuthHydrated(true)
        }
      }
    }

    hydrateRemoteUser()

    return () => {
      cancelled = true
    }
  }, [useServerAuth])

  useEffect(() => {
    if (!useServerAuth || !isMasterAdmin || activeView !== 'user-management') return
    listRemoteUserProfiles()
      .then((remoteAccounts) => {
        const localAccounts = getUserAccounts()
        const map = new Map<string, UserAccount>()
        localAccounts.forEach(a => map.set(a.username.toLowerCase(), a))
        remoteAccounts.forEach(a => {
          const existing = map.get(a.username.toLowerCase())
          if (existing) {
            map.set(a.username.toLowerCase(), { ...existing, ...a, id: existing.id })
          } else {
            map.set(a.username.toLowerCase(), a)
          }
        })
        const merged = Array.from(map.values())
        setUserAccounts(merged)
        saveUserAccounts(merged)
      })
      .catch((error) => {
        console.warn('Unable to load remote server users:', error)
        setUserAccounts(getUserAccounts())
      })
  }, [useServerAuth, isMasterAdmin, activeView])

  useEffect(() => {
    if (!canAccessView(activeView)) {
      setActiveView('dashboard')
    }
  }, [activeView, canAccessView])

  const agentAllowedBusinesses = currentUser?.role === 'agent' ? (currentUser.allowedBusinesses || []) : []

  useEffect(() => {
    if (currentUser?.role === 'agent' && agentAllowedBusinesses.length > 0) {
      const allowedBiz = metadata.businesses.filter(b => agentAllowedBusinesses.includes(b.id) || agentAllowedBusinesses.includes(b.name))
      if (allowedBiz.length > 0) {
        const isCurrentAllowed = allowedBiz.some(b => b.id === metadata.activeCompanyId || b.name === activeCompany)
        if (!isCurrentAllowed) {
          const firstAllowed = allowedBiz[0]
          setMetadata(prev => ({
            ...prev,
            activeCompanyId: firstAllowed.id
          }))
          setActiveCompany(firstAllowed.name)
        }
      }
    }
  }, [currentUser, agentAllowedBusinesses, metadata.businesses, metadata.activeCompanyId, activeCompany])

  useEffect(() => {
    if (useServerAuth) return
    if (isAuthenticated && !currentUser) {
      lockAppSession()
      setIsAuthenticated(false)
      setAuthMode(hasAppLock() ? 'unlock' : 'setup')
    }
  }, [currentUser, isAuthenticated, useServerAuth])

  useEffect(() => {
    if (useServerAuth && !canSyncRemoteTenant) {
      setTenantHydrated(false)
      return
    }

    let cancelled = false
    setTenantHydrated(false)
    setSuppliers([])
    setCustomers([])
    setItems([])
    setInvoices([])
    setPayments([])
    setReceivedDiscounts([])
    setSalesInvoices([])
    setCustomerPayments([])
    setExpenseTypes([])
    setExpenseEntries([])
    setFixedSchemes([])
    setMTBookings([])
    setAdvanceBookingPickups([])
    setDiscountLedgerEntries([])
    setCashBankCounters([])
    setCashBankTransactions([])

    const partitionKey = tenantKey
    const companyId = metadata.activeCompanyId
    const cachedSnapshot = readTenantCache(companyId, partitionKey)
    const storedData = isLocalCacheDisabled ? null : localStorage.getItem(partitionKey)

    const applyTenantData = (parsedData: Partial<TenantData>) => {
      if (cancelled) return
      const normalizedData: TenantData = {
        suppliers: parsedData.suppliers || [],
        customers: parsedData.customers || [],
        items: parsedData.items || [],
        invoices: parsedData.invoices || [],
        payments: parsedData.payments || [],
        receivedDiscounts: parsedData.receivedDiscounts || [],
        salesInvoices: parsedData.salesInvoices || [],
        customerPayments: parsedData.customerPayments || [],
        expenseTypes: parsedData.expenseTypes || [],
        expenseEntries: parsedData.expenseEntries || [],
        fixedSchemes: parsedData.fixedSchemes || [],
        mtBookings: parsedData.mtBookings || [],
        advanceBookingPickups: parsedData.advanceBookingPickups || [],
        discountLedgerEntries: parsedData.discountLedgerEntries || [],
        cashBankCounters: parsedData.cashBankCounters || [],
        cashBankTransactions: parsedData.cashBankTransactions || [],
        creditNotes: parsedData.creditNotes || [],
        debitNotes: parsedData.debitNotes || [],
        salesReturns: parsedData.salesReturns || [],
        purchaseReturns: parsedData.purchaseReturns || [],
        userAccounts: parsedData.userAccounts || getUserAccounts() || []
      }
      lastSavedDataRef.current = JSON.stringify(normalizedData)
      setSuppliers(normalizedData.suppliers)
      setCustomers(normalizedData.customers)
      setItems(normalizedData.items)
      setInvoices(normalizedData.invoices)
      setPayments(normalizedData.payments)
      setReceivedDiscounts(normalizedData.receivedDiscounts)
      setSalesInvoices(normalizedData.salesInvoices)
      setCustomerPayments(normalizedData.customerPayments)
      setExpenseTypes(normalizedData.expenseTypes)
      setExpenseEntries(normalizedData.expenseEntries)
      setFixedSchemes(normalizedData.fixedSchemes)
      setMTBookings(normalizedData.mtBookings)
      setAdvanceBookingPickups(normalizedData.advanceBookingPickups)
      setDiscountLedgerEntries(normalizedData.discountLedgerEntries)
      setCashBankCounters(normalizedData.cashBankCounters)
      setCashBankTransactions(normalizedData.cashBankTransactions)
      setCreditNotes(normalizedData.creditNotes)
      setDebitNotes(normalizedData.debitNotes)
      setSalesReturns(normalizedData.salesReturns)
      setPurchaseReturns(normalizedData.purchaseReturns)
      if (normalizedData.userAccounts && normalizedData.userAccounts.length > 0) {
        setUserAccounts(normalizedData.userAccounts)
        saveUserAccounts(normalizedData.userAccounts)
      }
    }

    if (storedData) {
      try {
        const parsedData: TenantData = JSON.parse(storedData)
        applyTenantData(parsedData)
      } catch (error) {
        console.error('Failed to load tenant data:', error)
      }
    } else if (cachedSnapshot?.payload) {
      remoteRevisionRef.current[partitionKey] = cachedSnapshot.revision
      applyTenantData(cachedSnapshot.payload)
    }

    const loadRemote = async () => {
      try {
        const restoredKeysStr = localStorage.getItem('restored_keys')
        const restoredKeys = restoredKeysStr ? JSON.parse(restoredKeysStr) : {}
        const isRestored = restoredKeys[partitionKey] === true || restoredKeys[`data_${companyId}_${activeFY}`] === true

        if (canUseRemoteStorage()) {
          if (isRestored) {
            console.log(`Skipping remote load for ${partitionKey} because it was recently restored locally. Data will be pushed to remote.`)
            delete restoredKeys[partitionKey]
            delete restoredKeys[`data_${companyId}_${activeFY}`]
            localStorage.setItem('restored_keys', JSON.stringify(restoredKeys))
            // Force expectedRevision to null so it overwrites remote without conflict
            remoteRevisionRef.current[partitionKey] = null
            // Clear lastSavedDataRef so the sync hook does not short-circuit
            lastSavedDataRef.current = ''
          } else {
            const remoteSnapshot = await loadRemoteTenantData(companyId, partitionKey)
            if (remoteSnapshot && !cancelled) {
              remoteRevisionRef.current[partitionKey] = remoteSnapshot.revision
              writeTenantCache(companyId, partitionKey, remoteSnapshot.payload, remoteSnapshot.revision)
              applyTenantData(remoteSnapshot.payload)
              appendAuditLog('remote_tenant_loaded', undefined, partitionKey)
            } else if (remoteSnapshot === null && !cancelled) {
              // Remote document was deleted in Firebase; clear stale local storage cache so old data is not restored
              localStorage.removeItem(partitionKey)
              applyTenantData({})
            }
          }
        }
        if (!cancelled) setTenantHydrated(true)
      } catch (error) {
        if (cancelled) return
        const message = error instanceof RemoteStorageUnavailableError
          ? error.message
          : 'Unable to load saved company data from Firebase.'
        toast.error(message)
        if (!isLocalCacheDisabled && (storedData || cachedSnapshot?.payload)) {
          if (cachedSnapshot?.payload && !storedData) {
            remoteRevisionRef.current[partitionKey] = cachedSnapshot.revision
            applyTenantData(cachedSnapshot.payload)
          }
          setTenantHydrated(true)
        } else {
          setTenantHydrated(false)
        }
      }
    }

    loadRemote()

    return () => {
      cancelled = true
    }
  }, [metadata.activeCompanyId, activeFY, tenantKey, useServerAuth, canSyncRemoteTenant])

  useEffect(() => {
    if (!tenantHydrated) return
    if (useServerAuth && !canSyncRemoteTenant) return

    const partitionKey = tenantKey
    const tenantData: TenantData = {
      suppliers,
      customers,
      items,
      invoices,
      payments,
      receivedDiscounts,
      salesInvoices,
      customerPayments,
      expenseTypes,
      expenseEntries,
      fixedSchemes,
      mtBookings,
      advanceBookingPickups,
      discountLedgerEntries,
      cashBankCounters,
      cashBankTransactions,
      creditNotes,
      debitNotes,
      salesReturns,
      purchaseReturns,
      userAccounts
    }

    if (lastSavedDataRef.current) {
      try {
        const last = JSON.parse(lastSavedDataRef.current)
        if (areObjectsSemanticallyEqual(tenantData, last)) {
          return
        }
      } catch (e) {}
    }

    if (canUseRemoteStorage() && remoteRevisionRef.current[partitionKey] == null && !hasTenantRecords(tenantData)) {
      return
    }
    
    console.log('💾 Scheduling remote save. itemsCount:', items.length, 'expectedRevision:', remoteRevisionRef.current[partitionKey])

    writeTenantCache(
      metadata.activeCompanyId,
      partitionKey,
      tenantData,
      remoteRevisionRef.current[partitionKey] ?? null
    )
    if (canUseRemoteStorage()) {
      const timerId = setTimeout(() => {
        const saveRemote = async () => {
          console.log('💾 Running saveRemote to Firestore. itemsCount:', items.length, 'expectedRevision:', remoteRevisionRef.current[partitionKey])
          const snapshot = await saveRemoteTenantData(
            metadata.activeCompanyId,
            partitionKey,
            tenantData,
            remoteRevisionRef.current[partitionKey] ?? null
          )
          if (snapshot) {
            console.log('💾 saveRemote SUCCESS. New revision:', snapshot.revision, 'New itemsCount:', snapshot.payload.items?.length || 0)
            remoteRevisionRef.current[partitionKey] = snapshot.revision
            lastSavedDataRef.current = JSON.stringify(tenantData)
            writeTenantCache(metadata.activeCompanyId, partitionKey, snapshot.payload, snapshot.revision)
          }
        }

        saveRemote()
          .catch(async (error) => {
            console.error('❌ saveRemote FAILED:', error)
            if (error instanceof RemoteSnapshotConflictError) {
              toast.error('Remote data changed. Reloading latest company data.')
              const latest = await loadRemoteTenantData(metadata.activeCompanyId, partitionKey)
              if (latest) {
                console.log('💾 Reloaded snapshot after conflict. Revision:', latest.revision, 'itemsCount:', latest.payload.items?.length || 0)
                remoteRevisionRef.current[partitionKey] = latest.revision
                const normalizedData: TenantData = {
                  suppliers: latest.payload.suppliers || [],
                  customers: latest.payload.customers || [],
                  items: latest.payload.items || [],
                  invoices: latest.payload.invoices || [],
                  payments: latest.payload.payments || [],
                  receivedDiscounts: latest.payload.receivedDiscounts || [],
                  salesInvoices: latest.payload.salesInvoices || [],
                  customerPayments: latest.payload.customerPayments || [],
                  expenseTypes: latest.payload.expenseTypes || [],
                  expenseEntries: latest.payload.expenseEntries || [],
                  fixedSchemes: latest.payload.fixedSchemes || [],
                  mtBookings: latest.payload.mtBookings || [],
                  advanceBookingPickups: latest.payload.advanceBookingPickups || [],
                  discountLedgerEntries: latest.payload.discountLedgerEntries || [],
                  cashBankCounters: latest.payload.cashBankCounters || [],
                  cashBankTransactions: latest.payload.cashBankTransactions || [],
                  creditNotes: latest.payload.creditNotes || [],
                  debitNotes: latest.payload.debitNotes || [],
                  salesReturns: latest.payload.salesReturns || [],
                  purchaseReturns: latest.payload.purchaseReturns || []
                }
                lastSavedDataRef.current = JSON.stringify(normalizedData)
                writeTenantCache(metadata.activeCompanyId, partitionKey, normalizedData, latest.revision)
                setSuppliers(normalizedData.suppliers)
                setCustomers(normalizedData.customers)
                setItems(normalizedData.items)
                setInvoices(normalizedData.invoices)
                setPayments(normalizedData.payments)
                setReceivedDiscounts(normalizedData.receivedDiscounts)
                setSalesInvoices(normalizedData.salesInvoices)
                setCustomerPayments(normalizedData.customerPayments)
                setExpenseTypes(normalizedData.expenseTypes)
                setExpenseEntries(normalizedData.expenseEntries)
                setFixedSchemes(normalizedData.fixedSchemes)
                setMTBookings(normalizedData.mtBookings)
                setAdvanceBookingPickups(normalizedData.advanceBookingPickups)
                setDiscountLedgerEntries(normalizedData.discountLedgerEntries)
                setCashBankCounters(normalizedData.cashBankCounters)
                setCashBankTransactions(normalizedData.cashBankTransactions)
              }
              return
            }
            toast.error(error instanceof Error ? error.message : 'Remote save failed')
          })
      }, 1500)

      return () => clearTimeout(timerId)
    }
    appendAuditLog('tenant_data_saved', {
      suppliers: suppliers.length,
      customers: customers.length,
      invoices: invoices.length,
      payments: payments.length,
      salesInvoices: salesInvoices.length,
      customerPayments: customerPayments.length
    }, partitionKey)
  }, [
    metadata.activeCompanyId,
    activeFY,
    suppliers,
    customers,
    items,
    invoices,
    payments,
    receivedDiscounts,
    salesInvoices,
    customerPayments,
    expenseTypes,
    expenseEntries,
    fixedSchemes,
    mtBookings,
    advanceBookingPickups,
    discountLedgerEntries,
    cashBankCounters,
    cashBankTransactions,
    tenantKey,
    tenantHydrated,
    useServerAuth,
    canSyncRemoteTenant
  ])

  useEffect(() => {
    if (!tenantHydrated || !canUseRemoteStorage()) return
    if (useServerAuth && !canSyncRemoteTenant) return
    return subscribeTenantData(metadata.activeCompanyId, tenantKey, (remoteSnapshot) => {
      console.log('📡 Realtime subscription received update:', {
        revision: remoteSnapshot.revision,
        deviceId: remoteSnapshot.device_id,
        localDeviceId: localStorage.getItem('app_device_id'),
        itemsCount: remoteSnapshot.payload.items?.length || 0
      })
      remoteRevisionRef.current[tenantKey] = remoteSnapshot.revision
      const normalizedData: TenantData = {
        suppliers: remoteSnapshot.payload.suppliers || [],
        customers: remoteSnapshot.payload.customers || [],
        items: remoteSnapshot.payload.items || [],
        invoices: remoteSnapshot.payload.invoices || [],
        payments: remoteSnapshot.payload.payments || [],
        receivedDiscounts: remoteSnapshot.payload.receivedDiscounts || [],
        salesInvoices: remoteSnapshot.payload.salesInvoices || [],
        customerPayments: remoteSnapshot.payload.customerPayments || [],
        expenseTypes: remoteSnapshot.payload.expenseTypes || [],
        expenseEntries: remoteSnapshot.payload.expenseEntries || [],
        fixedSchemes: remoteSnapshot.payload.fixedSchemes || [],
        mtBookings: remoteSnapshot.payload.mtBookings || [],
        advanceBookingPickups: remoteSnapshot.payload.advanceBookingPickups || [],
        discountLedgerEntries: remoteSnapshot.payload.discountLedgerEntries || [],
        cashBankCounters: remoteSnapshot.payload.cashBankCounters || [],
        cashBankTransactions: remoteSnapshot.payload.cashBankTransactions || [],
        creditNotes: remoteSnapshot.payload.creditNotes || [],
        debitNotes: remoteSnapshot.payload.debitNotes || [],
        salesReturns: remoteSnapshot.payload.salesReturns || [],
        purchaseReturns: remoteSnapshot.payload.purchaseReturns || []
      }
      lastSavedDataRef.current = JSON.stringify(normalizedData)
      writeTenantCache(metadata.activeCompanyId, tenantKey, normalizedData, remoteSnapshot.revision)
      setSuppliers(normalizedData.suppliers)
      setCustomers(normalizedData.customers)
      setItems(normalizedData.items)
      setInvoices(normalizedData.invoices)
      setPayments(normalizedData.payments)
      setReceivedDiscounts(normalizedData.receivedDiscounts)
      setSalesInvoices(normalizedData.salesInvoices)
      setCustomerPayments(normalizedData.customerPayments)
      setExpenseTypes(normalizedData.expenseTypes)
      setExpenseEntries(normalizedData.expenseEntries)
      setFixedSchemes(normalizedData.fixedSchemes)
      setMTBookings(normalizedData.mtBookings)
      setAdvanceBookingPickups(normalizedData.advanceBookingPickups)
      setDiscountLedgerEntries(normalizedData.discountLedgerEntries)
      setCashBankCounters(normalizedData.cashBankCounters)
      setCashBankTransactions(normalizedData.cashBankTransactions)
      setCreditNotes(normalizedData.creditNotes)
      setDebitNotes(normalizedData.debitNotes)
      setSalesReturns(normalizedData.salesReturns)
      setPurchaseReturns(normalizedData.purchaseReturns)
      appendAuditLog('remote_tenant_realtime_update', undefined, tenantKey)
    }) || undefined
  }, [metadata.activeCompanyId, tenantHydrated, tenantKey, useServerAuth, canSyncRemoteTenant])


  const handleLogout = () => {
    setCurrentUser(null)
    setIsAuthenticated(false)
    setAuthPasscode('')
    setAuthConfirmPasscode('')
  }

  const handleAuthSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAuthError('')

    if (useServerAuth) {
      if (!authUsername.trim()) {
        setAuthError('Enter your email or username.')
        return
      }
      if (!authPasscode.trim()) {
        setAuthError('Enter your password.')
        return
      }

      try {
        setAuthBusy(true)
        let email = authUsername.trim().toLowerCase()
        if (!email.includes('@')) {
          email = `${email}@sktraders.local`
        }

        let user: AuthenticatedUser | null = null

        // 1. Check local agent accounts first
        const localRes = await verifyUserLoginDetailed(authUsername, authPasscode)
        if (localRes.user) {
          user = localRes.user
        } else if (email !== authUsername.trim().toLowerCase()) {
          const localResEmail = await verifyUserLoginDetailed(email, authPasscode)
          if (localResEmail.user) {
            user = localResEmail.user
          }
        }

        // 2. If not found locally, try remote server sign-in
        if (!user) {
          try {
            user = await signInRemoteUser(email, authPasscode)
          } catch (remoteErr) {
            if (localRes.error && !localRes.error.includes('does not exist')) {
              setAuthError(localRes.error)
              return
            }
            setAuthError(remoteErr instanceof Error ? remoteErr.message : 'Incorrect email or password.')
            return
          }
        }

        if (!user) {
          setAuthError('No active profile found for this user.')
          return
        }

        setCurrentUser(user)
        setIsAuthenticated(true)
        setAuthPasscode('')
        toast.success(`Welcome, ${user.displayName}`)
      } catch (error) {
        setAuthError(error instanceof Error ? error.message : 'Login failed.')
      } finally {
        setAuthBusy(false)
      }
      return
    }

    if (authMode === 'unlock' && !authUsername.trim()) {
      setAuthError('Enter your username.')
      return
    }

    if (authPasscode.trim().length < 6) {
      setAuthError('Use at least 6 characters.')
      return
    }

    try {
      setAuthBusy(true)
      if (authMode === 'setup') {
        if (!authUsername.trim()) {
          setAuthError('Master admin username is required.')
          return
        }
        if (authPasscode !== authConfirmPasscode) {
          setAuthError('Passcodes do not match.')
          return
        }
        const user = await createMasterAdmin(authUsername, authDisplayName, authPasscode)
        setCurrentUser(user)
        setUserAccounts(getUserAccounts())
        setIsAuthenticated(true)
        toast.success('Master admin created')
      } else {
        const loginRes = await verifyUserLoginDetailed(authUsername, authPasscode)
        let user = loginRes.user || null

        if (!user && getUserAccounts().length === 0 && authUsername.trim().toLowerCase() === 'admin') {
          const legacyValid = await verifyAppPasscode(authPasscode)
          if (legacyValid) {
            user = await createMasterAdmin('admin', 'Master Admin', authPasscode)
            setUserAccounts(getUserAccounts())
            toast.success('Old passcode upgraded to master admin')
          }
        }

        if (!user) {
          setAuthError(loginRes.error || 'Incorrect username or passcode.')
          return
        }
        setCurrentUser(user)
        setIsAuthenticated(true)
        toast.success(`Welcome, ${user.displayName}`)
      }
      setAuthUsername(authMode === 'setup' ? 'admin' : authUsername)
      setAuthPasscode('')
      setAuthConfirmPasscode('')
    } finally {
      setAuthBusy(false)
    }
  }

  const handleLockApp = async () => {
    if (useServerAuth) {
      await signOutRemoteUser()
    } else {
      lockAppSession()
    }
    setIsAuthenticated(false)
    setCurrentUser(null)
    setAuthMode('unlock')
    setAuthUsername(useServerAuth ? '' : 'admin')
    setAuthPasscode('')
    setAuthConfirmPasscode('')
    toast.success('App locked')
  }

  const handleClearAllData = async () => {
    if (!isMasterAdmin) {
      toast.error('Only master admin can clear company data')
      return
    }
    try {
      setSuppliers([])
      setCustomers([])
      setItems([])
      setInvoices([])
      setPayments([])
      setReceivedDiscounts([])
      setSalesInvoices([])
      setCustomerPayments([])
      setExpenseTypes([])
      setExpenseEntries([])
      setFixedSchemes([])
      setMTBookings([])
      
      const partitionKey = tenantKey
      const emptyTenantData: TenantData = {
        suppliers: [],
        customers: [],
        items: [],
        invoices: [],
        payments: [],
        receivedDiscounts: [],
        salesInvoices: [],
        customerPayments: [],
        expenseTypes: [],
        expenseEntries: [],
        fixedSchemes: [],
        mtBookings: [],
        advanceBookingPickups: [],
        discountLedgerEntries: [],
        cashBankCounters: [],
        cashBankTransactions: [],
        creditNotes: [],
        debitNotes: [],
        salesReturns: [],
        purchaseReturns: []
      }
      writeTenantCache(metadata.activeCompanyId, partitionKey, emptyTenantData, remoteRevisionRef.current[partitionKey] ?? null)
      localStorage.removeItem(cashBankKey)
      appendAuditLog('tenant_data_cleared', { cashBankCleared: true }, partitionKey)
      void appendServerAuditLog(metadata.activeCompanyId, partitionKey, 'tenant_data_cleared', { cashBankCleared: true })
      
      toast.success('All data cleared successfully')
    } catch (error) {
      toast.error('Failed to clear data')
    }
  }



  const handleRestoreFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!isMasterAdmin) {
      toast.error('Only master admin can restore data')
      return
    }
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string)
        
        if (data.type === 'MASTER_DATA_BACKUP' && data.storageData) {
          const restoredKeys = JSON.parse(localStorage.getItem('restored_keys') || '{}')
          Object.keys(data.storageData).forEach((key) => {
            if (isAllowedRestoreKey(key)) {
              localStorage.setItem(key, JSON.stringify(data.storageData[key]))
              restoredKeys[key] = true
            }
          })
          localStorage.setItem('restored_keys', JSON.stringify(restoredKeys))
          appendAuditLog('legacy_master_restore')
          void appendServerAuditLog(metadata.activeCompanyId, tenantKey, 'legacy_master_restore')
          
          setRestoreDialogOpen(false)
          toast.success('Master backup restored successfully!')
          
          setTimeout(() => {
            window.location.reload()
          }, 500)
          
          return
        }
        
        if (!validateBackup(data)) {
          toast.error('Invalid backup file format')
          return
        }

        if (data.backupType === 'single') {
          const singleData = data as SingleEntityBackupData
          setSuppliers(singleData.data.suppliers)
          setCustomers(singleData.data.customers)
          setItems(singleData.data.items)
          setInvoices(singleData.data.invoices)
          setPayments(singleData.data.payments)
          setReceivedDiscounts(singleData.data.receivedDiscounts)
          setSalesInvoices(singleData.data.salesInvoices)
          setCustomerPayments(singleData.data.customerPayments)
          setExpenseTypes(singleData.data.expenseTypes)
          setExpenseEntries(singleData.data.expenseEntries)
          setFixedSchemes(singleData.data.fixedSchemes)
          setMTBookings(singleData.data.mtBookings || [])
          if (singleData.cashBankData) {
            localStorage.setItem(cashBankKey, JSON.stringify(singleData.cashBankData))
          }
          appendAuditLog('single_restore', { company: singleData.company, fy: singleData.fy }, tenantKey)
          void appendServerAuditLog(metadata.activeCompanyId, tenantKey, 'single_restore', { company: singleData.company, fy: singleData.fy })

          setRestoreDialogOpen(false)
          toast.success(`Data restored from backup (FY ${singleData.fy})`)
        } else {
          toast.error('Unknown backup format')
        }
      } catch (error) {
        console.error('Restore failed:', error)
        toast.error('Failed to read backup file')
      }
    }
    reader.readAsText(file)
    
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSettingsOpen = useCallback(() => {
    if (!isMasterAdmin) {
      toast.error('Only master admin can open settings')
      return
    }
    setTempGstPercentage(safeGstPercentage.toString())
    setSettingsDialogOpen(true)
  }, [isMasterAdmin, safeGstPercentage])

  const handleToggleLock = () => {
    if (!isMasterAdmin) {
      toast.error('Only master admin can toggle read-only mode')
      return
    }
    setIsLocked((prev) => !prev)
    if (!safeIsLocked) {
      toast.success('Data locked - Read-only mode enabled')
    } else {
      toast.success('Data unlocked - Edit mode enabled')
    }
  }

  const handleSettingsSave = () => {
    let hasChanges = false

    if (tempGstPercentage.trim()) {
      const gstValue = parseFloat(tempGstPercentage)
      if (!isNaN(gstValue) && gstValue >= 0 && gstValue <= 100) {
        if (gstValue !== gstPercentage) {
          setGstPercentage(gstValue)
          hasChanges = true
        }
      } else {
        toast.error('GST percentage must be between 0 and 100')
        return
      }
    }
    
    setSettingsDialogOpen(false)
    
    if (hasChanges) {
      toast.success('Settings updated successfully')
    }
  }

  const handleAddBusiness = () => {
    if (!isMasterAdmin) {
      toast.error('Only master admin can add businesses')
      return
    }
    if (!newBusinessName.trim()) {
      toast.error('Please enter a business name')
      return
    }
    
    const businessId = newBusinessName.toLowerCase().replace(/[^a-z0-9]+/g, '_')
    
    if (metadata.businesses.find(b => b.id === businessId)) {
      toast.error('A business with this name already exists')
      return
    }
    
    const newBusiness: BusinessMetadata = {
      id: businessId,
      name: newBusinessName.trim(),
      startFY: newBusinessStartFY
    }
    
    const updatedMetadata = {
      ...metadata,
      businesses: [...metadata.businesses, newBusiness],
      activeCompanyId: businessId,
      activeFY: newBusinessStartFY
    }
    
    setMetadata(updatedMetadata)
    saveMetadata(updatedMetadata)
    saveBusinessToCloud(businessId, newBusiness, {})
    appendAuditLog('business_created', { businessId, businessName: newBusiness.name })
    void appendServerAuditLog(businessId, `data_${businessId}_${newBusinessStartFY}`, 'business_created', { businessId, businessName: newBusiness.name })
    
    setSuppliers([])
    setCustomers([])
    setItems([])
    setInvoices([])
    setPayments([])
    setReceivedDiscounts([])
    setSalesInvoices([])
    setCustomerPayments([])
    setExpenseTypes([])
    setExpenseEntries([])
    setFixedSchemes([])
    setMTBookings([])
    setCashBankCounters([])
    setCashBankTransactions([])
    
    setNewBusinessName('')
    setNewBusinessStartFY(getCurrentFY())
    setAddBusinessDialogOpen(false)
    
    toast.success(`Business "${newBusiness.name}" created successfully`)
  }

  const handleEditBusiness = () => {
    if (!isMasterAdmin) {
      toast.error('Only master admin can edit businesses')
      return
    }
    if (!editBusinessName.trim()) {
      toast.error('Please enter a business name')
      return
    }
    
    const updatedMetadata = {
      ...metadata,
      businesses: metadata.businesses.map(b =>
        b.id === metadata.activeCompanyId
          ? { ...b, name: editBusinessName.trim() }
          : b
      )
    }
    
    setMetadata(updatedMetadata)
    saveMetadata(updatedMetadata)
    appendAuditLog('business_renamed', { businessId: metadata.activeCompanyId, newName: editBusinessName.trim() })
    void appendServerAuditLog(metadata.activeCompanyId, tenantKey, 'business_renamed', { businessId: metadata.activeCompanyId, newName: editBusinessName.trim() })
    
    setEditBusinessDialogOpen(false)
    toast.success('Business name updated successfully')
  }

  const handleDeleteBusiness = () => {
    if (!isMasterAdmin) {
      toast.error('Only master admin can delete businesses')
      return
    }
    if (metadata.businesses.length === 1) {
      toast.error('Cannot delete the last business')
      return
    }
    
    const businessToDelete = metadata.businesses.find(b => b.id === metadata.activeCompanyId)
    
    deleteTenantData(metadata.activeCompanyId)
    
    const remainingBusinesses = metadata.businesses.filter(b => b.id !== metadata.activeCompanyId)
    const newActive = remainingBusinesses[0]
    
    const updatedMetadata = {
      ...metadata,
      businesses: remainingBusinesses,
      activeCompanyId: newActive.id,
      activeFY: newActive.startFY
    }
    
    setMetadata(updatedMetadata)
    saveMetadata(updatedMetadata)
    deleteBusinessFromCloud(businessToDelete?.id || metadata.activeCompanyId)
    appendAuditLog('business_deleted', {
      businessId: businessToDelete?.id,
      businessName: businessToDelete?.name
    })
    void appendServerAuditLog(metadata.activeCompanyId, tenantKey, 'business_deleted', {
      businessId: businessToDelete?.id,
      businessName: businessToDelete?.name
    })
    
    setSuppliers([])
    setCustomers([])
    setItems([])
    setInvoices([])
    setPayments([])
    setReceivedDiscounts([])
    setSalesInvoices([])
    setCustomerPayments([])
    setExpenseTypes([])
    setExpenseEntries([])
    setFixedSchemes([])
    setMTBookings([])
    setCashBankCounters([])
    setCashBankTransactions([])
    
    setEditBusinessDialogOpen(false)
    toast.success(`Business "${businessToDelete?.name}" deleted successfully`)
  }

  const handleOpenEditBusiness = () => {
    if (!isMasterAdmin) {
      toast.error('Only master admin can edit businesses')
      return
    }
    const currentBusiness = metadata.businesses.find(b => b.id === metadata.activeCompanyId)
    setEditBusinessName(currentBusiness?.name || '')
    setEditBusinessDialogOpen(true)
  }

  const handleNavigate = (viewId: string, groupTitle: string) => {
    if (!canAccessView(viewId)) {
      toast.error(`No access to ${viewNames[viewId] || 'this area'}`)
      return
    }
    setActiveView(viewId)
    setMobileSidebarOpen(false)
  }
  
  const handleGroupToggle = (groupTitle: string, isOpen: boolean) => {
    if (isOpen) {
      setOpenGroups(prev => {
        const newState: Record<string, boolean> = { [groupTitle]: true }
        Object.keys(prev).forEach(key => {
          if (key !== groupTitle) newState[key] = false
        })
        return newState
      })
    } else {
      setOpenGroups(prev => ({ ...prev, [groupTitle]: false }))
    }
  }

  const handleSingleEntityBackup = () => {
    if (!isMasterAdmin) {
      toast.error('Only master admin can create backups')
      return
    }
    try {
      const cashBankRaw = localStorage.getItem(cashBankKey)
      const backup = createSingleEntityBackup(
        activeCompany,
        activeFY,
        safeSuppliers,
        safeCustomers,
        safeItems,
        safeInvoices,
        safePayments,
        safeReceivedDiscounts,
        safeSalesInvoices,
        safeCustomerPayments,
        safeExpenseTypes,
        safeExpenseEntries,
        safeFixedSchemes,
        safeMTBookings,
        cashBankRaw ? safeJsonParse(cashBankRaw, null) : undefined
      )
      downloadSingleEntityBackup(backup)
      appendAuditLog('single_backup_created', { company: activeCompany, fy: activeFY }, tenantKey)
      void appendServerAuditLog(metadata.activeCompanyId, tenantKey, 'single_backup_created', { company: activeCompany, fy: activeFY })
      toast.success(`Backup created for ${activeCompany} - ${activeFY}`)
    } catch (error) {
      toast.error("Single entity backup failed!")
    }
  }

  const handleMasterBackup = () => {
    if (!isMasterAdmin) {
      toast.error('Only master admin can create master backups')
      return
    }
    try {
      const backupBundle: Record<string, string> = {}
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && (key === 'app_metadata' || key.startsWith('data_') || key.startsWith('cashbank_') || key === 'storedCompanies')) {
          backupBundle[key] = localStorage.getItem(key) || ''
        }
      }
      const blob = new Blob([JSON.stringify({ type: 'MASTER_SYSTEM_BACKUP', storageData: backupBundle }, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `sk_traders_master_backup_${new Date().toISOString().split('T')[0]}.json`
      link.click()
      URL.revokeObjectURL(url)
      appendAuditLog('master_backup_created', { keyCount: Object.keys(backupBundle).length })
      void appendServerAuditLog(metadata.activeCompanyId, tenantKey, 'master_backup_created', { keyCount: Object.keys(backupBundle).length })
      toast.success("Full Master Backup downloaded successfully!")
    } catch (error) {
      toast.error("Backup failed!")
    }
  }

  const handleSmartRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isMasterAdmin) {
      toast.error('Only master admin can restore backups')
      e.target.value = ''
      return
    }
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!parsed) {
          toast.error("Invalid file structure.");
          return;
        }

        // 1. MASTER SYSTEM RESTORE
        if (parsed.type === 'MASTER_SYSTEM_BACKUP' && parsed.storageData) {
          const restoredKeys = JSON.parse(localStorage.getItem('restored_keys') || '{}')
          Object.entries(parsed.storageData).forEach(([key, value]) => {
            if (isAllowedRestoreKey(key) && typeof value === 'string') {
              localStorage.setItem(key, value);
              restoredKeys[key] = true;
            }
          });
          localStorage.setItem('restored_keys', JSON.stringify(restoredKeys))
          appendAuditLog('master_restore', { keyCount: Object.keys(parsed.storageData).length })
          void appendServerAuditLog(metadata.activeCompanyId, tenantKey, 'master_restore', { keyCount: Object.keys(parsed.storageData).length })
          toast.success("Master Backup Detected! All businesses restored. Reloading...");
          setTimeout(() => window.location.reload(), 1200);
        } 
        // 2. SINGLE ENTITY RESTORE (Fail-Safe Implementation)
        else if (parsed.company && parsed.fy && parsed.data) {
          const companyName = parsed.company.trim();
          const companyId = parsed.companyId || companyName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
          const financialYear = parsed.fy;

          // Guard against double-stringification
          const cleanDataStr = typeof parsed.data === 'string' ? parsed.data : JSON.stringify(parsed.data);

          // Write to all possible key variations to ensure data isolation hooks find it
          localStorage.setItem(`data_${companyName}_${financialYear}`, cleanDataStr);
          localStorage.setItem(`data_${companyId}_${financialYear}`, cleanDataStr);
          if (parsed.cashBankData) {
            localStorage.setItem(`cashbank_${companyId}_${financialYear}`, JSON.stringify(parsed.cashBankData));
          }

          const restoredKeys = JSON.parse(localStorage.getItem('restored_keys') || '{}')
          restoredKeys[`data_${companyId}_${financialYear}`] = true
          restoredKeys[`data_v3_${companyId}_${financialYear}`] = true
          localStorage.setItem('restored_keys', JSON.stringify(restoredKeys))

          // Update app_metadata to register the business
          try {
            const metadataRaw = localStorage.getItem('app_metadata');
            let currentMetadata: AppMetadata;
            
            if (metadataRaw) {
              currentMetadata = JSON.parse(metadataRaw);
            } else {
              currentMetadata = {
                businesses: [],
                activeCompanyId: '',
                activeFY: getCurrentFY()
              };
            }

            if (!Array.isArray(currentMetadata.businesses)) {
              currentMetadata.businesses = [];
            }

            const exists = currentMetadata.businesses.some((b) => b.id === companyId);

            if (!exists) {
              const newBusiness: BusinessMetadata = {
                id: companyId,
                name: companyName,
                startFY: financialYear
              };
              currentMetadata.businesses.push(newBusiness);
              
              if (!currentMetadata.activeCompanyId) {
                currentMetadata.activeCompanyId = companyId;
                currentMetadata.activeFY = financialYear;
              }
              
              saveMetadata(currentMetadata);
            }

            // Set as active business and FY for immediate view after reload
            currentMetadata.activeCompanyId = companyId;
            currentMetadata.activeFY = financialYear;
            saveMetadata(currentMetadata);

          } catch (registryError) {
            console.error("Failed to auto-register company in dropdown list", registryError);
          }

          toast.success(`Single Backup Restored successfully for ${companyName} (${financialYear})!`);
          appendAuditLog('single_smart_restore', { companyName, companyId, financialYear }, `data_${companyId}_${financialYear}`)
          void appendServerAuditLog(companyId, `data_${companyId}_${financialYear}`, 'single_smart_restore', { companyName, companyId, financialYear })
          setTimeout(() => window.location.reload(), 1200);
        } 
        else {
          toast.error("Unrecognized backup file format.");
        }
      } catch (err) {
        toast.error("Failed to parse the backup file safely.");
      }
    };
    reader.readAsText(file);
    
    if (e.target) {
      e.target.value = ''
    }
  }

  const dataCounts = {
    suppliers: safeSuppliers.length,
    customers: safeCustomers.length,
    items: safeItems.length,
    purchaseInvoices: safeInvoices.length,
    salesInvoices: safeSalesInvoices.length,
    payments: safePayments.length,
    customerPayments: safeCustomerPayments.length,
    expenseTypes: safeExpenseTypes.length,
    expenseEntries: safeExpenseEntries.length,
    receivedDiscounts: safeReceivedDiscounts.length,
    fixedSchemes: safeFixedSchemes.length,
    mtBookings: safeMTBookings.length
  }
  const totalDataCount = Object.values(dataCounts).reduce((sum, count) => sum + count, 0)

  const handleShortcut = useCallback((action: ShortcutAction) => {
    switch (action) {
      case 'settings':
        handleSettingsOpen()
        if (isMasterAdmin) toast.info('Opening settings', { duration: 1500 })
        break
      case 'backup':
        handleMasterBackup()
        break
      case 'restore':
        if (!isMasterAdmin) {
          toast.error('Only master admin can restore backups')
          break
        }
        setRestoreDialogOpen(true)
        toast.info('Opening restore dialog', { duration: 1500 })
        break
      case 'toggle-sidebar':
        setSidebarExpanded(prev => !prev)
        break
      case 'help':
        setShortcutsDialogOpen(true)
        break
      case 'dashboard':
      case 'suppliers':
      case 'customers':
      case 'items':
      case 'invoices':
      case 'payments':
      case 'sales-invoices':
      case 'customer-payments':
      case 'expense-entries':
      case 'cd-profit-report':
      case 'inventory':
      case 'cd-risk':
      case 'wallet':
      case 'annual':
      case 'supplier-ledger':
      case 'customer-ledger':
      case 'invoice-details':
      case 'payment-details':
      case 'expense-types':
      case 'fixed-schemes':
      case 'mt-bookings':
      case 'cash-bank-master':
      case 'cash-bank-voucher':
      case 'cash-bank-ledger':
      case 'customer-credit-notes':
      case 'supplier-debit-notes':
      case 'sales-returns':
      case 'purchase-returns':
        if (!canAccessView(action)) {
          toast.error(`No access to ${viewNames[action] || 'this area'}`)
          break
        }
        setActiveView(action)
        toast.success(`Navigating to ${viewNames[action]}`, { duration: 1500 })
        break
    }
  }, [settingsDialogOpen, restoreDialogOpen, shortcutsDialogOpen, handleSettingsOpen, isMasterAdmin, canAccessView])

  useKeyboardShortcuts(handleShortcut, !settingsDialogOpen && !restoreDialogOpen && !shortcutsDialogOpen)

  const renderContent = () => {
    const getContent = () => {
      if (!canAccessView(activeView)) {
        return (
          <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-[var(--neo-shadow-sm)]">
              <Lock className="h-7 w-7" weight="duotone" />
            </div>
            <h2 className="text-2xl font-bold">No access</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Your agent account does not have permission to open {viewNames[activeView] || 'this area'}.
            </p>
          </div>
        )
      }

      switch (activeView) {
        case 'dashboard':
          return (
            <MasterDashboardPage
              currentUser={currentUser}
              cashBankCounters={visibleCashBankCounters}
              suppliers={safeSuppliers}
              customers={safeCustomers}
              items={safeItems}
              purchaseInvoices={safeInvoices}
              salesInvoices={safeSalesInvoices}
              purchaseReturns={safePurchaseReturns}
              salesReturns={safeSalesReturns}
              payments={safePayments}
              customerPayments={safeCustomerPayments}
              expenseEntries={safeExpenseEntries}
              expenseTypes={safeExpenseTypes}
              fixedSchemes={safeFixedSchemes}
              mtBookings={mtBookings}
              receivedDiscounts={safeReceivedDiscounts}
              currentFY={safeCurrentFY}
              onNavigateToReport={(reportName) => setActiveView(reportName)}
            />
          )
        case 'suppliers':
          return (
            <SuppliersPage 
              suppliers={safeSuppliers} 
              setSuppliers={setSuppliers} 
              invoices={safeInvoices}
              payments={safePayments}
              isLocked={isViewReadOnly('suppliers')} 
              changedBy={currentUser?.displayName || currentUser?.username || 'Master Admin'} 
            />
          )
        case 'customers':
          return <CustomersPage customers={safeCustomers} setCustomers={setCustomers} isLocked={isViewReadOnly('customers')} salesInvoices={safeSalesInvoices} customerPayments={safeCustomerPayments} />
        case 'items':
          return (
            <ItemsPage
              items={safeItems}
              setItems={setItems}
              purchaseInvoices={safeInvoices}
              salesInvoices={safeSalesInvoices}
              purchaseReturns={safePurchaseReturns}
              salesReturns={safeSalesReturns}
              isLocked={isViewReadOnly('items')}
              activeCompanyId={metadata.activeCompanyId}
            />
          )
        case 'invoices':
          return (
            <InvoicesPage
              invoices={safeInvoices}
              setInvoices={setInvoices}
              salesInvoices={safeSalesInvoices}
              purchaseReturns={safePurchaseReturns}
              salesReturns={safeSalesReturns}
              suppliers={safeSuppliers}
              setSuppliers={setSuppliers}
              payments={safePayments}
              setPayments={setPayments}
              items={safeItems}
              setItems={setItems}
              currentFY={safeCurrentFY}
              isLocked={isViewReadOnly('invoices')}
              gstPercentage={safeGstPercentage}
              counters={visibleCashBankCounters}
              transactions={visibleCashBankTransactions}
              onUpdateCashBank={(c, t) => {
                setCashBankCounters(c)
                setCashBankTransactions(t)
              }}
              fixedSchemes={safeFixedSchemes}
              mtBookings={mtBookings}
              receivedDiscounts={safeReceivedDiscounts}
              expenseEntries={safeExpenseEntries}
              expenseTypes={safeExpenseTypes}
              onNavigateToInvoiceDetails={handleNavigateToInvoiceDetails}
            />
          )
        case 'payments':
          return (
            <PaymentsPage
              payments={safePayments}
              setPayments={setPayments}
              setMTBookings={setMTBookings}
              invoices={safeInvoices}
              items={safeItems}
              suppliers={safeSuppliers}
              fixedSchemes={safeFixedSchemes}
              currentFY={safeCurrentFY}
              isLocked={isViewReadOnly('payments')}
              counters={visibleCashBankCounters}
              transactions={visibleCashBankTransactions}
              onUpdateCashBank={(c, t) => {
                setCashBankCounters(c)
                setCashBankTransactions(t)
              }}
            />
          )
        case 'sales-invoices':
          return (
            <SalesInvoicesPage
              salesInvoices={safeSalesInvoices}
              setSalesInvoices={setSalesInvoices}
              purchaseInvoices={safeInvoices}
              purchaseReturns={safePurchaseReturns}
              salesReturns={safeSalesReturns}
              customers={safeCustomers}
              setCustomers={setCustomers}
              customerPayments={safeCustomerPayments}
              setCustomerPayments={setCustomerPayments}
              items={safeItems}
              setItems={setItems}
              currentFY={safeCurrentFY}
              isLocked={isViewReadOnly('sales-invoices')}
              counters={visibleCashBankCounters}
              transactions={visibleCashBankTransactions}
              onUpdateCashBank={(c, t) => {
                setCashBankCounters(c)
                setCashBankTransactions(t)
              }}
            />
          )
        case 'customer-payments':
          return (
            <CustomerPaymentsPage
              customerPayments={safeCustomerPayments}
              setCustomerPayments={setCustomerPayments}
              customers={safeCustomers}
              salesInvoices={safeSalesInvoices}
              currentFY={safeCurrentFY}
              isLocked={isViewReadOnly('customer-payments')}
              activeCompanyId={metadata.activeCompanyId}
              activeFY={safeCurrentFY}
              counters={visibleCashBankCounters}
              transactions={visibleCashBankTransactions}
              onUpdateCashBank={(c, t) => {
                setCashBankCounters(c)
                setCashBankTransactions(t)
              }}
            />
          )
        case 'supplier-cd-rules':
          return (
            <SupplierCDRulesPage
              suppliers={safeSuppliers}
              setSuppliers={setSuppliers}
              isLocked={isViewReadOnly('supplier-cd-rules')}
            />
          )
        case 'fixed-schemes':
          return (
            <FixedSchemesPage
              fixedSchemes={safeFixedSchemes}
              setFixedSchemes={setFixedSchemes}
              suppliers={safeSuppliers}
              currentFY={safeCurrentFY}
              isLocked={isViewReadOnly('fixed-schemes')}
            />
          )
        case 'mt-bookings':
          return (
            <MTBookingsPage
              mtBookings={safeMTBookings}
              setMTBookings={setMTBookings}
              suppliers={safeSuppliers}
              fixedSchemes={safeFixedSchemes}
              invoices={safeInvoices}
              items={safeItems}
              currentFY={safeCurrentFY}
              isLocked={isViewReadOnly('mt-bookings')}
            />
          )
        case 'wallet':
          return (
            <DiscountWalletPage
              suppliers={safeSuppliers}
              invoices={safeInvoices}
              payments={safePayments}
              receivedDiscounts={safeReceivedDiscounts}
              items={safeItems}
              setReceivedDiscounts={setReceivedDiscounts}
              fixedSchemes={safeFixedSchemes}
              mtBookings={safeMTBookings}
              currentFY={safeCurrentFY}
              businessName={safeBusinessName}
              isLocked={isViewReadOnly('wallet')}
            />
          )
        case 'annual':
          return (
            <AnnualDiscountPage
              suppliers={safeSuppliers}
              invoices={safeInvoices}
              currentFY={safeCurrentFY}
              businessName={safeBusinessName}
            />
          )
        case 'supplier-ledger':
          return (
            <SupplierLedgerPage
              suppliers={safeSuppliers}
              invoices={safeInvoices}
              payments={safePayments}
              debitNotes={safeDebitNotes}
              purchaseReturns={safePurchaseReturns}
              currentFY={safeCurrentFY}
              businessName={safeBusinessName}
            />
          )
        case 'customer-ledger':
          return (
            <CustomerLedgerPage
              customers={safeCustomers}
              salesInvoices={safeSalesInvoices}
              customerPayments={safeCustomerPayments}
              creditNotes={safeCreditNotes}
              salesReturns={safeSalesReturns}
              currentFY={safeCurrentFY}
            />
          )
        case 'expense-types':
        case 'expense-entries':
          return (
            <ExpenseEntriesPage
              expenseEntries={safeExpenseEntries}
              setExpenseEntries={setExpenseEntries}
              expenseTypes={safeExpenseTypes}
              setExpenseTypes={setExpenseTypes}
              suppliers={safeSuppliers}
              invoices={safeInvoices}
              currentFY={safeCurrentFY}
              isLocked={isViewReadOnly('expense-entries')}
              counters={visibleCashBankCounters}
              transactions={visibleCashBankTransactions}
              onUpdateCashBank={(c, t) => {
                setCashBankCounters(c)
                setCashBankTransactions(t)
              }}
            />
          )
        case 'cd-profit-report':
          return (
            <CDProfitReportsPage
              purchaseInvoices={safeInvoices}
              salesInvoices={safeSalesInvoices}
              suppliers={safeSuppliers}
              customers={safeCustomers}
              items={safeItems}
              payments={safePayments}
              fixedSchemes={safeFixedSchemes}
              mtBookings={mtBookings}
              expenseEntries={safeExpenseEntries}
              currentFY={safeCurrentFY}
              businessName={safeBusinessName}
            />
          )
        case 'inventory':
          return (
            <InventoryReportPage
              items={safeItems}
              purchaseInvoices={safeInvoices}
              salesInvoices={safeSalesInvoices}
              purchaseReturns={safePurchaseReturns}
              salesReturns={safeSalesReturns}
              currentFY={safeCurrentFY}
              businessName={safeBusinessName}
            />
          )
        case 'cd-risk':
          return (
            <CDAtRiskReportPage
              purchaseInvoices={safeInvoices}
              payments={safePayments}
              suppliers={safeSuppliers}
              items={safeItems}
              currentFY={safeCurrentFY}
              businessName={safeBusinessName}
            />
          )
        case 'invoice-details':
          return (
            <PurchaseInvoiceDetailsPage
              invoices={safeInvoices}
              payments={safePayments}
              suppliers={safeSuppliers}
              items={safeItems}
              fixedSchemes={safeFixedSchemes}
              mtBookings={mtBookings}
              receivedDiscounts={safeReceivedDiscounts}
              expenseEntries={safeExpenseEntries}
              expenseTypes={safeExpenseTypes}
              currentFY={safeCurrentFY}
              initialInvoiceNo={selectedInvoiceDetailsNo}
            />
          )
        case 'payment-details':
          return (
            <PaymentDetailsPage
              payments={safePayments}
              invoices={safeInvoices}
              suppliers={safeSuppliers}
              fixedSchemes={safeFixedSchemes}
              mtBookings={mtBookings}
              items={safeItems}
              receivedDiscounts={safeReceivedDiscounts}
              currentFY={safeCurrentFY}
            />
          )
        case 'cash-bank-master':
        case 'cash-bank-voucher':
        case 'cash-bank-ledger':
          return (
            <CashBankManagement 
              counters={visibleCashBankCounters} 
              transactions={visibleCashBankTransactions} 
              onUpdateAll={(c, t) => {
                setCashBankCounters(c)
                setCashBankTransactions(t)
              }}
              isLocked={isViewReadOnly('cash-bank-master')} 
            />
          )
        case 'customer-credit-notes':
          return <CustomerCreditNotePage creditNotes={safeCreditNotes} setCreditNotes={setCreditNotes} customers={safeCustomers} currentFY={safeCurrentFY} isLocked={isViewReadOnly('customer-credit-notes')} />
        case 'supplier-debit-notes':
          return <SupplierDebitNotePage debitNotes={safeDebitNotes} setDebitNotes={setDebitNotes} suppliers={safeSuppliers} currentFY={safeCurrentFY} isLocked={isViewReadOnly('supplier-debit-notes')} />
        case 'sales-returns':
          return (
            <SalesReturnPage
              salesReturns={safeSalesReturns}
              setSalesReturns={setSalesReturns}
              customers={safeCustomers}
              setCustomers={setCustomers}
              items={safeItems}
              setItems={setItems}
              creditNotes={safeCreditNotes}
              setCreditNotes={setCreditNotes}
              currentFY={safeCurrentFY}
              isLocked={isViewReadOnly('sales-returns')}
            />
          )
        case 'purchase-returns':
          return (
            <PurchaseReturnPage
              purchaseReturns={safePurchaseReturns}
              setPurchaseReturns={setPurchaseReturns}
              suppliers={safeSuppliers}
              setSuppliers={setSuppliers}
              items={safeItems}
              setItems={setItems}
              debitNotes={safeDebitNotes}
              setDebitNotes={setDebitNotes}
              currentFY={safeCurrentFY}
              isLocked={isViewReadOnly('purchase-returns')}
            />
          )
        case 'user-management':
          return (
            <UserManagementPage
              accounts={userAccounts}
              permissionOptions={permissionOptions}
              onAccountsChange={(nextAccounts) => {
                setUserAccounts(nextAccounts)
                saveUserAccounts(nextAccounts)
              }}
              counters={allBusinessCounters}
              businesses={metadata.businesses}
              securityMode={useServerAuth ? 'server' : 'local'}
              onCreateRemoteAgent={useServerAuth ? async (input) => {
                await createRemoteAgentAccount({
                  email: input.email,
                  displayName: input.displayName,
                  passcode: input.passcode,
                  companyId: metadata.activeCompanyId,
                  permissions: input.permissions,
                  allowedCounters: input.allowedCounters,
                  allowedBusinesses: input.allowedBusinesses
                })
                await createAgentAccount({
                  username: input.email,
                  displayName: input.displayName,
                  passcode: input.passcode,
                  permissions: input.permissions,
                  allowedCounters: input.allowedCounters,
                  allowedBusinesses: input.allowedBusinesses
                })
                setUserAccounts(getUserAccounts())
              } : undefined}
              onSaveAgent={useServerAuth ? (input) => updateRemoteUserProfile({
                id: input.id,
                companyId: metadata.activeCompanyId,
                displayName: input.displayName,
                role: 'agent',
                permissions: input.permissions,
                isActive: input.isActive,
                allowedCounters: input.allowedCounters,
                allowedBusinesses: input.allowedBusinesses
              }) : undefined}
            />
          )
        default:
          return null
      }
    }

    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={activeView}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{
            duration: 0.25,
            ease: [0.4, 0, 0.2, 1]
          }}
        >
          {getContent()}
        </motion.div>
      </AnimatePresence>
    )
  }

  useEffect(() => {
    const handleGlobalEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (settingsDialogOpen) {
          setSettingsDialogOpen(false)
          event.preventDefault()
        } else if (restoreDialogOpen) {
          setRestoreDialogOpen(false)
          event.preventDefault()
        }
      }
    }

    document.addEventListener('keydown', handleGlobalEscape)
    return () => document.removeEventListener('keydown', handleGlobalEscape)
  }, [settingsDialogOpen, restoreDialogOpen])

  useEffect(() => {
    const hasSeenShortcutsHint = localStorage.getItem('shortcuts-hint-seen')
    if (!hasSeenShortcutsHint) {
      setTimeout(() => {
        toast.info(
          <div className="flex items-center gap-2">
            <Keyboard className="h-4 w-4" />
            <span>Press <kbd className="px-2 py-0.5 bg-muted rounded text-xs font-mono mx-1">Ctrl+K</kbd> for keyboard shortcuts</span>
          </div>,
          {
            duration: 5000,
          }
        )
        localStorage.setItem('shortcuts-hint-seen', 'true')
      }, 2000)
    }
  }, [])

  useEffect(() => {
    const handleMouseEnter = () => {
      setIsHoveringsidebar(true)
    }

    const handleMouseLeave = () => {
      setIsHoveringsidebar(false)
    }

    const sidebar = sidebarRef.current
    if (sidebar) {
      sidebar.addEventListener('mouseenter', handleMouseEnter)
      sidebar.addEventListener('mouseleave', handleMouseLeave)
      
      return () => {
        sidebar.removeEventListener('mouseenter', handleMouseEnter)
        sidebar.removeEventListener('mouseleave', handleMouseLeave)
      }
    }
  }, [])

  if (!authHydrated) {
    return (
      <div className="min-h-dvh bg-background text-foreground flex items-center justify-center p-6">
        <Toaster position="top-right" richColors />
        <div className="rounded-[1.5rem] border border-white/60 bg-background px-6 py-5 shadow-[var(--neo-shadow)] text-sm font-semibold text-muted-foreground">
          Checking secure session...
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-dvh bg-background text-foreground flex items-center justify-center p-6">
        <Toaster position="top-right" richColors />
        <form
          onSubmit={handleAuthSubmit}
          className="w-full max-w-md rounded-[1.5rem] border border-white/60 bg-background p-6 shadow-[var(--neo-shadow)] space-y-5"
        >
          <div className="space-y-2">
            <div className="h-12 w-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-[var(--neo-shadow-sm)]">
              <Lock className="h-6 w-6" weight="fill" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              {useServerAuth ? 'Login to SK TRADERS' : authMode === 'setup' ? 'Create Master Admin' : 'Login to SK TRADERS'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {useServerAuth
                ? 'Use your Supabase Auth email and password. Roles are verified on the server.'
                : authMode === 'setup'
                ? 'Create the master admin account before adding agents.'
                : 'Enter your username and passcode to access company data.'}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="app-username">{useServerAuth ? 'Email' : 'Username'}</Label>
            <Input
              id="app-username"
              type={useServerAuth ? 'email' : 'text'}
              value={authUsername}
              onChange={(event) => setAuthUsername(event.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoFocus
              required
            />
          </div>

          {!useServerAuth && authMode === 'setup' && (
            <div className="space-y-2">
              <Label htmlFor="app-display-name">Display name</Label>
              <Input
                id="app-display-name"
                value={authDisplayName}
                onChange={(event) => setAuthDisplayName(event.target.value)}
                autoComplete="name"
                required
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="app-passcode">Passcode</Label>
            <Input
              id="app-passcode"
              type="password"
              value={authPasscode}
              onChange={(event) => setAuthPasscode(event.target.value)}
              autoComplete={authMode === 'setup' ? 'new-password' : 'current-password'}
              required
            />
          </div>

          {!useServerAuth && authMode === 'setup' && (
            <div className="space-y-2">
              <Label htmlFor="app-passcode-confirm">Confirm passcode</Label>
              <Input
                id="app-passcode-confirm"
                type="password"
                value={authConfirmPasscode}
                onChange={(event) => setAuthConfirmPasscode(event.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
          )}

          {authError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
              {authError}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={authBusy}>
            {authBusy ? 'Please wait...' : useServerAuth ? 'Login' : authMode === 'setup' ? 'Enable App Lock' : 'Unlock'}
          </Button>
        </form>
      </div>
    )
  }

  return (
    <>
      <Toaster position="top-right" richColors />
      <AnimatePresence>
        {mobileSidebarOpen && (
          <motion.div
            role="button"
            tabIndex={0}
            aria-label="Close navigation"
            className="mobile-sidebar-backdrop fixed inset-0 z-40 bg-slate-900/35 backdrop-blur-sm md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onPointerDown={(event) => {
              event.preventDefault()
              setMobileSidebarOpen(false)
            }}
            onTouchStart={(event) => {
              event.preventDefault()
              setMobileSidebarOpen(false)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setMobileSidebarOpen(false)
              }
            }}
          />
        )}
      </AnimatePresence>
      
      {(settingsDialogOpen || restoreDialogOpen) && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.3 }}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] pointer-events-none"
        >
          <div className="bg-popover/95 backdrop-blur-sm border border-border rounded-lg px-4 py-2 shadow-lg flex items-center gap-2">
            <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono font-semibold">ESC</kbd>
            <span className="text-xs text-muted-foreground">Press to close</span>
          </div>
        </motion.div>
      )}
      
      <div className="flex h-screen bg-background overflow-hidden">
        <AppSidebar
          onLogout={handleLogout}
          sidebarRef={sidebarRef}
          sidebarExpanded={sidebarExpanded}
          mobileSidebarOpen={mobileSidebarOpen}
          setMobileSidebarOpen={setMobileSidebarOpen}
          isHoveringsidebar={isHoveringsidebar}
          activeView={activeView}
          activeCompany={activeCompany}
          activeFY={activeFY}
          safeStoredCompanies={safeStoredCompanies}
          openGroups={openGroups}
          navGroups={availableNavGroups}
          setActiveView={setActiveView}
          setActiveCompany={setActiveCompany}
          setActiveFY={setActiveFY}
          setAddBusinessDialogOpen={setAddBusinessDialogOpen}
          handleOpenEditBusiness={handleOpenEditBusiness}
          handleGroupToggle={handleGroupToggle}
          handleNavigate={handleNavigate}
          handleSingleEntityBackup={handleSingleEntityBackup}
          handleMasterBackup={handleMasterBackup}
          handleSmartRestore={handleSmartRestore}
          canManageSystem={isMasterAdmin}
        />

      <main className="flex-1 flex flex-col overflow-hidden bg-[#f6f9fc]">
        <AppHeader
          sidebarExpanded={sidebarExpanded}
          setSidebarExpanded={setSidebarExpanded}
          mobileSidebarOpen={mobileSidebarOpen}
          setMobileSidebarOpen={setMobileSidebarOpen}
          onLockApp={handleLockApp}
          activeView={activeView}
          safeBusinessName={safeBusinessName}
          safeCurrentFY={safeCurrentFY}
          setActiveFY={setActiveFY}
          safeIsLocked={safeIsLocked}
          currentUserLabel={currentUser?.displayName || 'Guest'}
          currentUserRole={isMasterAdmin ? 'Master' : 'Agent'}
          setShortcutsDialogOpen={setShortcutsDialogOpen}
          onLogout={handleLogout}
        />

        <AppDialogs
          shortcutsDialogOpen={shortcutsDialogOpen}
          setShortcutsDialogOpen={setShortcutsDialogOpen}
          addBusinessDialogOpen={addBusinessDialogOpen}
          setAddBusinessDialogOpen={setAddBusinessDialogOpen}
          newBusinessName={newBusinessName}
          setNewBusinessName={setNewBusinessName}
          newBusinessStartFY={newBusinessStartFY}
          setNewBusinessStartFY={setNewBusinessStartFY}
          handleAddBusiness={handleAddBusiness}
          editBusinessDialogOpen={editBusinessDialogOpen}
          setEditBusinessDialogOpen={setEditBusinessDialogOpen}
          editBusinessName={editBusinessName}
          setEditBusinessName={setEditBusinessName}
          handleEditBusiness={handleEditBusiness}
          handleDeleteBusiness={handleDeleteBusiness}
          activeCompany={activeCompany}
          metadata={metadata}
          settingsDialogOpen={settingsDialogOpen}
          setSettingsDialogOpen={setSettingsDialogOpen}
          tempGstPercentage={tempGstPercentage}
          setTempGstPercentage={setTempGstPercentage}
          safeGstPercentage={safeGstPercentage}
          safeIsLocked={safeIsLocked}
          handleToggleLock={handleToggleLock}
          handleSettingsSave={handleSettingsSave}
          totalDataCount={totalDataCount}
          dataCounts={dataCounts}
          handleClearAllData={handleClearAllData}
        />

        <div className="flex-1 overflow-auto app-workspace bg-[#f6f9fc]">
          <motion.div 
            className="px-responsive-xl py-responsive-lg app-content-frame"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, delay: 0.1 }}
          >
            {renderContent()}
          </motion.div>
        </div>
      </main>
    </div>
    </>
  )
}

export default App
