import { Party, PartyType } from './types'
import { TenantData } from './storage-utils'

/**
 * WeakMap / Memoized cache for fast party lookups
 */
interface SelectorCache {
  partiesRef: Party[]
  partiesById: Map<string, Party>
}

let lastSelectorCache: SelectorCache | null = null

function getOrCreateCache(parties: Party[] = []): SelectorCache {
  if (lastSelectorCache && lastSelectorCache.partiesRef === parties) {
    return lastSelectorCache
  }

  const safeParties = Array.isArray(parties) ? parties : []
  const partiesById = new Map<string, Party>()

  for (const party of safeParties) {
    if (!party || !party.id) continue
    partiesById.set(party.id, party)
  }

  lastSelectorCache = {
    partiesRef: parties,
    partiesById
  }

  return lastSelectorCache
}

/**
 * Selector to return safe parties array from array or tenant structure
 */
export function getParties(input: Party[] | { parties?: Party[]; customers?: Party[]; suppliers?: Party[] } = []): Party[] {
  if (Array.isArray(input)) return input
  if (input && Array.isArray(input.parties)) return input.parties
  if (input && (Array.isArray(input.customers) || Array.isArray(input.suppliers))) {
    return migrateToUnifiedParties(input as any)
  }
  return []
}

/**
 * Legacy compatibility selectors
 */
export function getCustomers(parties: Party[] | { parties?: Party[]; customers?: Party[] } = []): Party[] {
  return getParties(parties)
}

export function getSuppliers(parties: Party[] | { parties?: Party[]; suppliers?: Party[] } = []): Party[] {
  return getParties(parties)
}

export function getPartiesByType(parties: Party[] = [], _type?: PartyType): Party[] {
  return Array.isArray(parties) ? parties : []
}

/**
 * Fast O(1) lookup for Party by ID
 */
export function getPartyById(
  input: Party[] | { parties?: Party[]; customers?: Party[]; suppliers?: Party[] } = [],
  id: string
): Party | undefined {
  if (!id) return undefined
  const list = getParties(input)
  return getOrCreateCache(list).partiesById.get(id)
}

/**
 * Helper to normalize opening balances to the standard convention:
 * Positive (> 0): Debit / Receivable / Advance Paid
 * Negative (< 0): Credit / Payable / Advance Received
 */
export function normalizeOpeningBalance(
  rawBalance: number | undefined | null,
  balanceType?: 'Credit' | 'Debit',
  alreadyNormalized: boolean = false
): { openingBalance: number; balanceType: 'Credit' | 'Debit' } {
  const num = typeof rawBalance === 'number' ? rawBalance : parseFloat(String(rawBalance || 0)) || 0

  if (num === 0) {
    return { openingBalance: 0, balanceType: balanceType || 'Debit' }
  }

  if (alreadyNormalized) {
    const resolvedType: 'Credit' | 'Debit' = num >= 0 ? 'Debit' : 'Credit'
    return { openingBalance: Math.abs(num), balanceType: balanceType || resolvedType }
  }

  if (balanceType === 'Credit' || num < 0) {
    return { openingBalance: Math.abs(num), balanceType: 'Credit' }
  } else {
    return { openingBalance: Math.abs(num), balanceType: 'Debit' }
  }
}

/**
 * Normalize an arbitrary party object into a fully compliant Party domain model.
 */
export function normalizeParty(party: Partial<Party> & { name?: string }, fallbackType?: PartyType): Party {
  const isAlreadyNormalized = typeof party.openingBalance === 'number' && Boolean(party.balanceType)

  const { openingBalance, balanceType } = normalizeOpeningBalance(
    party.openingBalance,
    party.balanceType,
    isAlreadyNormalized
  )

  const gstin = party.gstin ? party.gstin.trim().toUpperCase() : undefined
  const stateCode = party.stateCode || (gstin && /^\d{2}/.test(gstin) ? gstin.slice(0, 2) : undefined)

  const now = new Date().toISOString()
  const createdAt = party.createdAt
    ? (typeof party.createdAt === 'number' ? new Date(party.createdAt).toISOString() : String(party.createdAt))
    : now
  const updatedAt = party.updatedAt
    ? (typeof party.updatedAt === 'number' ? new Date(party.updatedAt).toISOString() : String(party.updatedAt))
    : now

  return {
    id: party.id || `party-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: (party.name || '').trim(),
    phone: party.phone || '',
    partyType: party.partyType || fallbackType,
    gstin,
    address: party.address ? party.address.trim() : undefined,
    openingBalance,
    creditLimit: typeof party.creditLimit === 'number' ? party.creditLimit : undefined,
    createdAt,
    updatedAt,

    email: party.email ? party.email.trim() : undefined,
    state: party.state,
    stateCode,
    stateName: party.stateName || party.state,
    pincode: party.pincode,
    city: party.city,
    shippingSameAsBilling: party.shippingSameAsBilling,
    shippingAddress: party.shippingAddress,
    shippingState: party.shippingState,
    shippingStateCode: party.shippingStateCode,
    shippingStateName: party.shippingStateName,
    shippingPincode: party.shippingPincode,
    shippingCity: party.shippingCity,
    openingBalanceDate: party.openingBalanceDate,
    balanceType,
    paymentCDRules: party.paymentCDRules || [],
    invoiceCloseCDRules: party.invoiceCloseCDRules || [],
    advanceCDPercentage: party.advanceCDPercentage,
    cdRuleVersions: party.cdRuleVersions,
    cdRuleChangeLog: party.cdRuleChangeLog,
    annualTarget: party.annualTarget
  }
}

/**
 * Factory to create a new Party instance with full defaults.
 */
export function createParty(data: Partial<Party> & { name: string }): Party {
  return normalizeParty(data)
}

/**
 * Convert any customer, supplier, or raw party record to a typed Party model.
 */
export function toParty(entity: any, fallbackType?: PartyType): Party {
  return normalizeParty(entity, fallbackType)
}

/**
 * Automated, Idempotent Data Migration Utility
 * Merges legacy customers and suppliers into a single parties collection without data loss.
 */
export function migrateToUnifiedParties(tenantData: Partial<TenantData> = {}): Party[] {
  const partyMap = new Map<string, Party>()
  const gstinLookup = new Map<string, string>()
  const nameLookup = new Map<string, string>()

  const registerParty = (raw: any, fallbackType?: PartyType) => {
    if (!raw || !raw.name) return
    const gstinKey = raw.gstin ? raw.gstin.trim().toUpperCase() : null
    const nameKey = (raw.name || '').trim().toLowerCase()

    const existingId =
      (raw.id && partyMap.has(raw.id) ? raw.id : null) ||
      (gstinKey && gstinLookup.has(gstinKey) ? gstinLookup.get(gstinKey) : null) ||
      (nameKey && nameLookup.has(nameKey) ? nameLookup.get(nameKey) : null)

    if (existingId && partyMap.has(existingId)) {
      const existing = partyMap.get(existingId)!
      const incoming = normalizeParty(raw, fallbackType)

      // Combine opening balance across counterparty records
      const existingBal = typeof existing.openingBalance === 'number' ? existing.openingBalance : 0
      const incomingBal = typeof incoming.openingBalance === 'number' ? incoming.openingBalance : 0
      const existingSigned = existing.balanceType === 'Credit' ? -existingBal : existingBal
      const incomingSigned = incoming.balanceType === 'Credit' ? -incomingBal : incomingBal
      const combinedNet = existingSigned + incomingSigned

      const merged = normalizeParty({
        ...incoming,
        ...existing,
        id: existing.id,
        name: existing.name || incoming.name,
        gstin: existing.gstin || incoming.gstin,
        phone: existing.phone || incoming.phone,
        address: existing.address || incoming.address,
        openingBalance: Math.abs(combinedNet),
        balanceType: combinedNet < 0 ? 'Credit' : 'Debit',
        paymentCDRules: existing.paymentCDRules?.length ? existing.paymentCDRules : incoming.paymentCDRules,
        invoiceCloseCDRules: existing.invoiceCloseCDRules?.length ? existing.invoiceCloseCDRules : incoming.invoiceCloseCDRules,
        advanceCDPercentage: existing.advanceCDPercentage ?? incoming.advanceCDPercentage,
        annualTarget: existing.annualTarget || incoming.annualTarget
      })
      partyMap.set(existing.id, merged)
    } else {
      const party = normalizeParty(raw, fallbackType)
      partyMap.set(party.id, party)
      if (gstinKey) gstinLookup.set(gstinKey, party.id)
      if (nameKey) nameLookup.set(nameKey, party.id)
    }
  }

  // 1. Process existing `parties` first if present
  if (Array.isArray(tenantData.parties)) {
    for (const raw of tenantData.parties) {
      registerParty(raw)
    }
  }

  // 2. Process legacy `customers`
  if (Array.isArray(tenantData.customers)) {
    for (const raw of tenantData.customers) {
      registerParty(raw, 'CUSTOMER')
    }
  }

  // 3. Process legacy `suppliers`
  if (Array.isArray(tenantData.suppliers)) {
    for (const raw of tenantData.suppliers) {
      registerParty(raw, 'SUPPLIER')
    }
  }

  return Array.from(partyMap.values())
}

/**
 * Merge updates to party list
 */
export function mergePartiesUpdate(
  prevParties: Party[],
  updater: Party[] | ((prev: Party[]) => Party[])
): Party[] {
  const next = typeof updater === 'function' ? updater(prevParties) : updater
  return Array.isArray(next) ? next.map(p => normalizeParty(p)) : []
}
