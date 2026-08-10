import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type Unsubscribe
} from 'firebase/firestore'
import { db, isRemoteStorageEnabled, isFirebaseConfigured } from './firebase-client'
import { TenantData } from './storage-utils'

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
  if (!canUseRemoteStorage()) return null
  assertRemoteAvailable()

  try {
    const snap = await withTimeout(getDoc(masterPartitionRef(companyId)))
    if (!snap.exists()) return null
    return firestoreDocToSnapshot(companyId, tenantKey, snap.data() as FirestoreSnapshotDoc)
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

  const ref = masterPartitionRef(companyId)
  const deviceId = getDeviceId()

  try {
    let savedRevision = 0

    await withTimeout(
      runTransaction(db, async (tx) => {
        const existing = await tx.get(ref)

        if (existing.exists()) {
          const existingData = existing.data() as FirestoreSnapshotDoc
          const currentRevision = existingData.revision ?? 0

          // Optimistic concurrency: if caller has a tracked revision, enforce it
          if (expectedRevision !== null && currentRevision !== expectedRevision) {
            throw new RemoteSnapshotConflictError()
          }

          savedRevision = currentRevision + 1
        } else {
          savedRevision = 1
        }

        const now = new Date().toISOString()
        tx.set(ref, {
          payload: stripUndefined(payload),
          revision: savedRevision,
          updatedAt: now,
          deviceId
        } satisfies FirestoreSnapshotDoc)
      })
    )

    return {
      company_id: companyId,
      tenant_key: tenantKey,
      payload,
      revision: savedRevision,
      updated_at: new Date().toISOString(),
      device_id: deviceId
    }
  } catch (error) {
    if (error instanceof RemoteSnapshotConflictError) throw error
    if (error instanceof RemoteStorageUnavailableError) {
      markRemoteUnavailable()
      throw error
    }
    console.error('Firestore save failed:', error)
    markRemoteUnavailable()
    const errMsg = error instanceof Error ? error.message : 'Unknown Firestore save error'
    throw new RemoteStorageUnavailableError(`Firebase is temporarily unavailable: ${errMsg}`)
  }
}

/**
 * Subscribe to real-time updates for a tenant snapshot via Firestore onSnapshot.
 * Returns an unsubscribe function, or null if Firebase is not configured.
 */
export function subscribeTenantData(
  companyId: string,
  tenantKey: string = 'master_data',
  onSnapshotReceived: (snapshot: TenantSnapshot) => void
): (() => void) | null {
  if (!canUseRemoteStorage() || !db) return null

  const deviceId = getDeviceId()
  let unsubscribe: Unsubscribe

  try {
    unsubscribe = onSnapshot(
      masterPartitionRef(companyId),
      (snap) => {
        if (!snap.exists()) return
        const data = snap.data() as FirestoreSnapshotDoc
        // Ignore updates from this same device (we already applied them locally)
        if (data.deviceId === deviceId) return
        onSnapshotReceived(firestoreDocToSnapshot(companyId, tenantKey, data))
      },
      (error) => {
        console.error('Firestore realtime subscription error:', error)
      }
    )
  } catch (error) {
    console.error('Failed to subscribe to Firestore snapshot:', error)
    return null
  }

  return () => unsubscribe()
}
