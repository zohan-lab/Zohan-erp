import { db, isRemoteStorageEnabled, isFirebaseConfigured } from './firebase-client'
import { doc, getDocs, setDoc, deleteDoc, collection } from 'firebase/firestore'
import { BusinessMetadata } from './storage-utils'

export interface BusinessDetails {
  phone?: string
  email?: string
  billingAddress?: string
  state?: string
  city?: string
  pincode?: string
  businessType?: string
  industryType?: string
  registrationType?: string
  gstRegistered?: 'yes' | 'no'
  panNumber?: string
  website?: string
}

export interface BusinessCloudData {
  metadata: BusinessMetadata
  details: BusinessDetails
}

export async function saveBusinessToCloud(businessId: string, metadata: BusinessMetadata, details: BusinessDetails) {
  if (!isRemoteStorageEnabled || !isFirebaseConfigured || !db) return;
  try {
    await setDoc(doc(db, 'businesses', businessId), {
      metadata,
      details,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (e) {
    console.error('Failed to save business to cloud:', e);
  }
}

export async function loadBusinessesFromCloud(): Promise<BusinessCloudData[]> {
  if (!isRemoteStorageEnabled || !isFirebaseConfigured || !db) return [];
  try {
    const snap = await getDocs(collection(db, 'businesses'));
    return snap.docs.map(doc => doc.data() as BusinessCloudData);
  } catch (e) {
    console.error('Failed to load businesses from cloud:', e);
    return [];
  }
}

export async function deleteBusinessFromCloud(businessId: string) {
  if (!isRemoteStorageEnabled || !isFirebaseConfigured || !db) return;
  try {
    await deleteDoc(doc(db, 'businesses', businessId));
    
    // Also delete all partitions and snapshots for this business
    const partitionsRef = collection(db, 'tenants', businessId, 'partitions');
    const partSnap = await getDocs(partitionsRef);
    const snapshotsRef = collection(db, 'tenants', businessId, 'snapshots');
    const snap = await getDocs(snapshotsRef);
    const deletePromises = [
      ...partSnap.docs.map(docRef => deleteDoc(docRef.ref)),
      ...snap.docs.map(docRef => deleteDoc(docRef.ref))
    ];
    await Promise.all(deletePromises);
  } catch (e) {
    console.error('Failed to delete business from cloud:', e);
  }
}
