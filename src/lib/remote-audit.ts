import { db } from './firebase-client'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'

/**
 * Append a structured audit log entry to the Firestore `audit_logs` collection.
 *
 * @param companyId  - Tenant company ID (null for global actions)
 * @param tenantKey  - Storage tenant key (null for global actions)
 * @param action     - Machine-readable action slug (e.g. 'invoice_updated')
 * @param details    - Arbitrary key/value payload for the action
 * @param actor      - Human-readable label of the user who performed the action
 *                     (e.g. 'Master Admin', agent display name). Optional for
 *                     backward compatibility with existing call sites.
 */
export async function appendServerAuditLog(
  companyId: string | null,
  tenantKey: string | null,
  action: string,
  details: Record<string, unknown> = {},
  actor?: string
): Promise<void> {
  if (!db) return

  try {
    await addDoc(collection(db, 'audit_logs'), {
      companyId,
      tenantKey,
      action,
      details,
      // Store actor separately so it is queryable without parsing the details blob.
      ...(actor ? { actor } : {}),
      timestamp: serverTimestamp()
    })
  } catch (error) {
    console.error('Firebase audit log failed:', error)
  }
}
