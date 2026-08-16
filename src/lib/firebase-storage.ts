import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  collection,
  getDocs,
  deleteDoc,
  writeBatch,
  type Unsubscribe
} from 'firebase/firestore'
import { db, isRemoteStorageEnabled, isFirebaseConfigured } from './firebase-client'
import { TenantData, TENANT_COLLECTION_KEYS } from './storage-utils'

// ─── Error Classes (kept identical to remote-storage.ts for App.tsx compatibility) ───

export class RemoteSnapshotConflictError extends Error {
  constructor(message = 'Remote data changed before your save completed. Reloading latest data.') {
    super(message)
    this.name = 'RemoteSnapshotConflictError'
  }
}

export class RemoteStorageUnavailableError extends Error {
  constructor(message = 'Firebase is temporarily unavailable. Your last change was not saved remotely yet.') {
    super(message)
    this.name = 'RemoteStorageUnavailableError'
  }
}

// ─── TenantSnapshot shape (matches old remote-storage interface) ──────────────

export interface TenantSnapshot {
  tenant_key: string
  company_id: string
  payload: TenantData
  revision: number
  updated_at: string
  device_id?: string
}

// ─── Internal Firestore document shape ───────────────────────────────────────

interface FirestoreSnapshotDoc {
  payload: TenantData
  revision: number
  updatedAt: string
  deviceId: string
}

// ─── Device ID ────────────────────────────────────────────────────────────────

const DEVICE_ID_KEY = 'app_device_id'

function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

// ─── Transient cooldown ───────────────────────────────────────────────────────

const TRANSIENT_COOLDOWN_MS = 60_000
let remoteUnavailableUntil = 0

function assertRemoteAvailable(): void {
  if (Date.now() < remoteUnavailableUntil) {
    throw new RemoteStorageUnavailableError()
  }
}

function markRemoteUnavailable(): void {
  remoteUnavailableUntil = Date.now() + TRANSIENT_COOLDOWN_MS
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function canUseRemoteStorage(): boolean {
  return isRemoteStorageEnabled && isFirebaseConfigured && Boolean(db)
}

function stripUndefined(val: any): any {
  if (val === undefined) return undefined
  if (val === null) return null

  if (Array.isArray(val)) {
    return val.map(stripUndefined).filter(v => v !== undefined)
  }

  if (typeof val === 'object') {
    const cleaned: any = {}
    for (const key in val) {
      const cleanedVal = stripUndefined(val[key])
      if (cleanedVal !== undefined) {
        cleaned[key] = cleanedVal
      }
    }
    return cleaned
  }
  return val
}

function withTimeout<T>(promise: Promise<T>, ms = 20000): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = window.setTimeout(
      () => reject(new RemoteStorageUnavailableError('Firebase request timed out.')),
      ms
    )
    promise.then(resolve).catch(reject).finally(() => window.clearTimeout(id))
  })
}

/**
 * Returns the Firestore document reference for a company's master partition.
 * Path: tenants/{companyId}/partitions/master_data
 */
function masterPartitionRef(companyId: string) {
  if (!db) throw new RemoteStorageUnavailableError('Firestore not initialised.')
  return doc(db, 'tenants', companyId, 'partitions', 'master_data')
}

function firestoreDocToSnapshot(
  companyId: string,
  tenantKey: string,
  data: FirestoreSnapshotDoc
): TenantSnapshot {
  return {
    company_id: companyId,
    tenant_key: tenantKey || 'master_data',
    payload: data.payload,
    revision: data.revision,
    updated_at: data.updatedAt,
    device_id: data.deviceId
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load tenant data from Firestore.
 * Returns null if the document does not exist yet.
 */
export async function loadRemoteTenantData(
  companyId: string,
  tenantKey: string = 'master_data'
): Promise<TenantSnapshot | null> {
  if (!canUseRemoteStorage() || !db) return null
  assertRemoteAvailable()

  try {
    const payload: any = {}
    let hasData = false

    const promises = TENANT_COLLECTION_KEYS.map(async (key) => {
      const colRef = collection(db!, 'tenants', companyId, key)
      const snap = await getDocs(colRef)
      if (!snap.empty) {
        hasData = true
      }
      payload[key] = snap.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      }))
    })

    await withTimeout(Promise.all(promises))

    if (!hasData) {
      // Backward-compatible migration check: does the legacy master_data monolithic doc exist?
      const legacyRef = masterPartitionRef(companyId)
      const legacySnap = await getDoc(legacyRef)
      if (legacySnap.exists()) {
        const legacyData = legacySnap.data() as FirestoreSnapshotDoc
        if (legacyData && legacyData.payload) {
          console.log(`🔄 Found legacy monolithic document for ${companyId}, migrating to subcollections...`)
          
          // Migrate each array in parallel
          const migratePromises: Promise<void>[] = []
          for (const key of TENANT_COLLECTION_KEYS) {
            const arr = legacyData.payload[key]
            if (Array.isArray(arr)) {
              for (const item of arr) {
                if (item && item.id) {
                  const docRef = doc(db!, 'tenants', companyId, key, item.id)
                  migratePromises.push(setDoc(docRef, stripUndefined(item)))
                }
              }
            }
          }
          await Promise.all(migratePromises)

          // Delete the legacy monolithic document
          await deleteDoc(legacyRef)
          console.log(`✅ Legacy monolithic document deleted for ${companyId}. Migration complete.`)

          // Recursively call loadRemoteTenantData to load from new subcollections
          return loadRemoteTenantData(companyId, tenantKey)
        }
      }
      return null
    }

    return {
      company_id: companyId,
      tenant_key: tenantKey,
      payload: payload as TenantData,
      revision: 1,
      updated_at: new Date().toISOString()
    }
  } catch (error) {
    if (error instanceof RemoteStorageUnavailableError) {
      markRemoteUnavailable()
      throw error
    }
    console.error('Firestore load failed:', error)
    markRemoteUnavailable()
    throw new RemoteStorageUnavailableError('Firebase data load timed out. Saved data was not overwritten.')
  }
}

/**
 * Save tenant data to Firestore with optimistic concurrency via a revision counter.
 * If `expectedRevision` is non-null and the stored revision differs, throws RemoteSnapshotConflictError.
 */
export async function saveRemoteTenantData(
  companyId: string,
  tenantKey: string = 'master_data',
  payload: TenantData,
  expectedRevision: number | null
): Promise<TenantSnapshot | null> {
  if (!canUseRemoteStorage() || !db) return null
  assertRemoteAvailable()

  try {
    const deviceId = getDeviceId()
    const nowIso = new Date().toISOString()

    // 1. For each collection, find existing remote documents to prune deleted items
    for (const key of TENANT_COLLECTION_KEYS) {
      const colRef = collection(db!, 'tenants', companyId, key)
      const existingSnap = await getDocs(colRef)
      const memoryItems = (payload[key] || []) as any[]
      const memoryItemMap = new Map(memoryItems.map(item => [item.id, item]))

      // Operations queue: { type: 'set' | 'delete', ref, data? }
      const ops: Array<{ type: 'set' | 'delete'; ref: any; data?: any }> = []

      // Delete items present in remote Firestore but deleted locally
      existingSnap.docs.forEach(docSnap => {
        if (!memoryItemMap.has(docSnap.id)) {
          ops.push({ type: 'delete', ref: docSnap.ref })
        }
      })

      // Set/Update memory items
      memoryItems.forEach(item => {
        if (item && item.id) {
          const docRef = doc(db!, 'tenants', companyId, key, item.id)
          ops.push({
            type: 'set',
            ref: docRef,
            data: {
              ...stripUndefined(item),
              deviceId
            }
          })
        }
      })

      // Execute ops in batches of 400 (Firestore max is 500)
      const BATCH_SIZE = 400
      for (let i = 0; i < ops.length; i += BATCH_SIZE) {
        const chunk = ops.slice(i, i + BATCH_SIZE)
        const batch = writeBatch(db!)
        chunk.forEach(op => {
          if (op.type === 'delete') {
            batch.delete(op.ref)
          } else if (op.type === 'set') {
            batch.set(op.ref, op.data)
          }
        })
        await withTimeout(batch.commit())
      }
    }

    const nextRevision = (expectedRevision || 0) + 1

    return {
      company_id: companyId,
      tenant_key: tenantKey,
      payload,
      revision: nextRevision,
      updated_at: nowIso,
      device_id: deviceId
    }
  } catch (error) {
    if (error instanceof RemoteStorageUnavailableError) {
      markRemoteUnavailable()
      throw error
    }
    console.error('Firestore batch save failed:', error)
    markRemoteUnavailable()
    throw new RemoteStorageUnavailableError('Firebase temporary batch save error.')
  }
}

/**
 * Subscribe to real-time updates for a tenant snapshot via Firestore onSnapshot.
 * Returns an unsubscribe function, or null if Firebase is not configured.
 */
export function subscribeTenantData(
  companyId: string,
  tenantKey: string = 'master_data',
  onCollectionUpdate: (key: keyof TenantData, docs: any[]) => void
): (() => void) | null {
  if (!canUseRemoteStorage() || !db) return null

  const unsubscribes: Unsubscribe[] = []

  try {
    TENANT_COLLECTION_KEYS.forEach((key) => {
      const colRef = collection(db!, 'tenants', companyId, key)
      const unsub = onSnapshot(
        colRef,
        (snap) => {
          if (snap.metadata.hasPendingWrites) return

          const docs = snap.docs.map(doc => ({
            ...doc.data(),
            id: doc.id
          }))
          onCollectionUpdate(key, docs)
        },
        (error) => {
          console.error(`Firestore realtime subscription error for ${key}:`, error)
        }
      )
      unsubscribes.push(unsub)
    })
  } catch (error) {
    console.error('Failed to subscribe to Firestore subcollections:', error)
    return null
  }

  return () => {
    unsubscribes.forEach(unsub => unsub())
  }
}

/**
 * Standalone action-driven database operations.
 */
export async function saveInvoice(companyId: string, invoice: any): Promise<void> {
  await saveEntityRemote(companyId, 'invoices', invoice)
}

export async function saveSalesInvoice(companyId: string, invoice: any): Promise<void> {
  await saveEntityRemote(companyId, 'salesInvoices', invoice)
}

export async function updateItem(companyId: string, item: any): Promise<void> {
  await saveEntityRemote(companyId, 'items', item)
}

export async function saveItem(companyId: string, item: any): Promise<void> {
  await saveEntityRemote(companyId, 'items', item)
}

export async function saveSupplier(companyId: string, supplier: any): Promise<void> {
  await saveEntityRemote(companyId, 'suppliers', supplier)
}

export async function saveCustomer(companyId: string, customer: any): Promise<void> {
  await saveEntityRemote(companyId, 'customers', customer)
}

export async function savePayment(companyId: string, payment: any): Promise<void> {
  await saveEntityRemote(companyId, 'payments', payment)
}

export async function saveCustomerPayment(companyId: string, payment: any): Promise<void> {
  await saveEntityRemote(companyId, 'customerPayments', payment)
}

export async function deleteCustomer(companyId: string, customerId: string): Promise<void> {
  await deleteEntityRemote(companyId, 'customers', customerId)
}

export async function deleteSupplier(companyId: string, supplierId: string): Promise<void> {
  await deleteEntityRemote(companyId, 'suppliers', supplierId)
}

export async function deleteItem(companyId: string, itemId: string): Promise<void> {
  await deleteEntityRemote(companyId, 'items', itemId)
}

export async function deleteInvoice(companyId: string, invoiceId: string): Promise<void> {
  await deleteEntityRemote(companyId, 'invoices', invoiceId)
}

export async function deletePayment(companyId: string, paymentId: string): Promise<void> {
  await deleteEntityRemote(companyId, 'payments', paymentId)
}

export async function deleteSalesInvoice(companyId: string, invoiceId: string): Promise<void> {
  await deleteEntityRemote(companyId, 'salesInvoices', invoiceId)
}

export async function deleteCustomerPayment(companyId: string, paymentId: string): Promise<void> {
  await deleteEntityRemote(companyId, 'customerPayments', paymentId)
}

export async function deleteExpenseEntry(companyId: string, entryId: string): Promise<void> {
  await deleteEntityRemote(companyId, 'expenseEntries', entryId)
}

export async function deleteExpenseType(companyId: string, typeId: string): Promise<void> {
  await deleteEntityRemote(companyId, 'expenseTypes', typeId)
}

export async function deleteFixedScheme(companyId: string, schemeId: string): Promise<void> {
  await deleteEntityRemote(companyId, 'fixedSchemes', schemeId)
}

export async function deleteMTBooking(companyId: string, bookingId: string): Promise<void> {
  await deleteEntityRemote(companyId, 'mtBookings', bookingId)
}

export async function deleteCreditNote(companyId: string, noteId: string): Promise<void> {
  await deleteEntityRemote(companyId, 'creditNotes', noteId)
}

export async function deleteDebitNote(companyId: string, noteId: string): Promise<void> {
  await deleteEntityRemote(companyId, 'debitNotes', noteId)
}

export async function deleteCustomerDebitNote(companyId: string, noteId: string): Promise<void> {
  await deleteEntityRemote(companyId, 'customerDebitNotes', noteId)
}

export async function deleteSupplierCreditNote(companyId: string, noteId: string): Promise<void> {
  await deleteEntityRemote(companyId, 'supplierCreditNotes', noteId)
}

export async function deleteSalesReturn(companyId: string, returnId: string): Promise<void> {
  await deleteEntityRemote(companyId, 'salesReturns', returnId)
}

export async function deletePurchaseReturn(companyId: string, returnId: string): Promise<void> {
  await deleteEntityRemote(companyId, 'purchaseReturns', returnId)
}

export async function saveCashBankCounter(companyId: string, counter: any): Promise<void> {
  await saveEntityRemote(companyId, 'cashBankCounters', counter)
}

export async function deleteCashBankCounter(companyId: string, counterId: string): Promise<void> {
  await deleteEntityRemote(companyId, 'cashBankCounters', counterId)
}

export async function saveCashBankTransaction(companyId: string, transaction: any): Promise<void> {
  await saveEntityRemote(companyId, 'cashBankTransactions', transaction)
}

export async function deleteCashBankTransaction(companyId: string, transactionId: string): Promise<void> {
  await deleteEntityRemote(companyId, 'cashBankTransactions', transactionId)
}

export async function saveEntityRemote(companyId: string, collectionKey: string, entity: any): Promise<void> {
  if (!canUseRemoteStorage() || !db) return
  const docRef = doc(db!, 'tenants', companyId, collectionKey, entity.id)
  await setDoc(docRef, {
    ...stripUndefined(entity),
    deviceId: getDeviceId()
  })
}

export async function deleteEntityRemote(companyId: string, collectionKey: string, entityId: string): Promise<void> {
  if (!canUseRemoteStorage() || !db) return
  const docRef = doc(db!, 'tenants', companyId, collectionKey, entityId)
  await deleteDoc(docRef)
}
