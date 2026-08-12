/*
 * MULTI-TENANT LOCALSTORAGE UTILITIES
 * Manages isolated data partitions per business/FY
 */

export interface BusinessMetadata {
  id: string
  name: string
  startFY?: string
}

export interface AppMetadata {
  businesses: BusinessMetadata[]
  activeCompanyId: string
  activeFY?: string
}

export interface TenantData {
  suppliers: any[]
  customers: any[]
  items: any[]
  invoices: any[]
  payments: any[]
  receivedDiscounts: any[]
  salesInvoices: any[]
  customerPayments: any[]
  expenseTypes: any[]
  expenseEntries: any[]
  fixedSchemes: any[]
  mtBookings: any[]
  discountLedgerEntries: any[]
  cashBankCounters: any[]
  cashBankTransactions: any[]
  creditNotes: any[]
  debitNotes: any[]
  salesReturns: any[]
  purchaseReturns: any[]
  userAccounts?: any[]
}

export const TENANT_COLLECTION_KEYS: Array<keyof TenantData> = [
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
  'discountLedgerEntries',
  'cashBankCounters',
  'cashBankTransactions',
  'creditNotes',
  'debitNotes',
  'salesReturns',
  'purchaseReturns',
  'userAccounts'
]

const METADATA_KEY = 'app_metadata'

export function getMetadata(): AppMetadata {
  const stored = localStorage.getItem(METADATA_KEY)
  if (!stored) {
    const defaultMeta: AppMetadata = {
      businesses: [],
      activeCompanyId: '',
      activeFY: ''
    }
    localStorage.setItem(METADATA_KEY, JSON.stringify(defaultMeta))
    return defaultMeta
  }
  return JSON.parse(stored)
}

export function saveMetadata(metadata: AppMetadata): void {
  localStorage.setItem(METADATA_KEY, JSON.stringify(metadata))
}

export function getTenantKey(companyId: string, _fy?: string): string {
  return `data_${companyId}_master`
}

export function getBusinessDetails(companyId: string): any | null {
  if (!companyId) return null
  const stored = localStorage.getItem(`business_details_${companyId}`)
  return stored ? JSON.parse(stored) : null
}

export function saveBusinessDetails(companyId: string, details: any): void {
  if (!companyId) return
  localStorage.setItem(`business_details_${companyId}`, JSON.stringify(details))
}

export function deleteTenantData(companyId: string): void {
  if (!companyId) return
  const prefix1 = `data_${companyId}_`
  const prefix2 = `data_v3_${companyId}_`
  const prefix3 = `cashbank_${companyId}_`
  const prefix4 = `remote_cache_${companyId}_`
  const detailsKey = `business_details_${companyId}`

  localStorage.removeItem(detailsKey)

  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key) {
      if (
        key.startsWith(prefix1) ||
        key.startsWith(prefix2) ||
        key.startsWith(prefix3) ||
        key.startsWith(prefix4)
      ) {
        keysToRemove.push(key)
      }
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k))
}

export function getTenantData(companyId: string, _fy?: string): TenantData {
  const key = getTenantKey(companyId)
  const stored = localStorage.getItem(key)
  
  if (!stored) {
    const emptyData: TenantData = {
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
      discountLedgerEntries: [],
      cashBankCounters: [],
      cashBankTransactions: [],
      creditNotes: [],
      debitNotes: [],
      salesReturns: [],
      purchaseReturns: [],
      userAccounts: []
    }
    localStorage.setItem(key, JSON.stringify(emptyData))
    return emptyData
  }
  
  const parsedData: TenantData = JSON.parse(stored)
  
  // Ensure array fields exist for safety
  parsedData.suppliers = parsedData.suppliers || []
  parsedData.customers = parsedData.customers || []
  parsedData.items = parsedData.items || []
  parsedData.invoices = parsedData.invoices || []
  parsedData.payments = parsedData.payments || []
  parsedData.receivedDiscounts = parsedData.receivedDiscounts || []
  parsedData.salesInvoices = parsedData.salesInvoices || []
  parsedData.customerPayments = parsedData.customerPayments || []
  parsedData.expenseTypes = parsedData.expenseTypes || []
  parsedData.expenseEntries = parsedData.expenseEntries || []
  parsedData.fixedSchemes = parsedData.fixedSchemes || []
  parsedData.mtBookings = parsedData.mtBookings || []
  parsedData.discountLedgerEntries = parsedData.discountLedgerEntries || []
  parsedData.cashBankCounters = parsedData.cashBankCounters || []
  parsedData.cashBankTransactions = parsedData.cashBankTransactions || []
  parsedData.creditNotes = parsedData.creditNotes || []
  parsedData.debitNotes = parsedData.debitNotes || []
  parsedData.salesReturns = parsedData.salesReturns || []
  parsedData.purchaseReturns = parsedData.purchaseReturns || []
  
  return parsedData
}

export function saveTenantData(companyId: string, fyOrData: string | TenantData, data?: TenantData): void {
  const key = getTenantKey(companyId)
  const payload = typeof fyOrData === 'object' ? fyOrData : (data || ({} as TenantData))
  localStorage.setItem(key, JSON.stringify(payload))
}

export function generateFYOptions(): string[] {
  const years: string[] = []
  for (let i = 2021; i <= 2039; i++) {
    years.push(`FY${i}-${(i + 1).toString().slice(2)}`)
  }
  return years
}

export function createBusinessId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

