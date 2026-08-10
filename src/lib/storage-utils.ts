/*
 * MULTI-TENANT LOCALSTORAGE UTILITIES
 * Manages isolated data partitions per business/FY
 */

export interface BusinessMetadata {
  id: string
  name: string
  startFY: string
}

export interface AppMetadata {
  businesses: BusinessMetadata[]
  activeCompanyId: string
  activeFY: string
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
  advanceBookingPickups: any[]
  discountLedgerEntries: any[]
  cashBankCounters: any[]
  cashBankTransactions: any[]
  creditNotes: any[]
  debitNotes: any[]
  salesReturns: any[]
  purchaseReturns: any[]
  userAccounts?: any[]
}

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

export function getTenantKey(companyId: string, fy: string): string {
  return `data_${companyId}_${fy}`
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

export function getTenantData(companyId: string, fy: string): TenantData {
  const key = getTenantKey(companyId, fy)
  let stored = localStorage.getItem(key)
  
  // Migration logic: Fallback to data_v3_ key if data_ key is not found
  if (!stored) {
    const v3Key = `data_v3_${companyId}_${fy}`
    const v3Stored = localStorage.getItem(v3Key)
    if (v3Stored) {
      stored = v3Stored
      localStorage.setItem(key, v3Stored)
    }
  }

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
      advanceBookingPickups: [],
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
  
  // Migration logic: Pull legacy Cash & Bank data if it's not already in TenantData
  const legacyCashBankKey = `cashbank_${companyId}_${fy}`
  const legacyCashBank = localStorage.getItem(legacyCashBankKey)
  if (legacyCashBank && (!parsedData.cashBankCounters || parsedData.cashBankCounters.length === 0)) {
    try {
      const cbData = JSON.parse(legacyCashBank)
      parsedData.cashBankCounters = cbData.counters || []
      parsedData.cashBankTransactions = cbData.transactions || []
      // Save migrated data immediately to update the local TenantData cache
      localStorage.setItem(key, JSON.stringify(parsedData))
    } catch (e) {
      console.error('Failed to parse legacy cashbank data for migration:', e)
    }
  }
  
  // Ensure fields exist for backward compatibility with older snapshots
  parsedData.cashBankCounters = parsedData.cashBankCounters || []
  parsedData.cashBankTransactions = parsedData.cashBankTransactions || []
  
  return parsedData
}

export function saveTenantData(companyId: string, fy: string, data: TenantData): void {
  const key = getTenantKey(companyId, fy)
  localStorage.setItem(key, JSON.stringify(data))
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

