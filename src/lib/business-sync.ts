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
    const cleanMeta = {
      id: metadata.id,
      name: metadata.name
    }
    await setDoc(doc(db, 'businesses', businessId), {
      metadata: cleanMeta,
      details: details || {},
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
    const list = snap.docs.map(d => {
      const data = d.data() as BusinessCloudData;
      return {
        metadata: {
          id: data.metadata?.id || d.id,
          name: data.metadata?.name || d.id
        },
        details: data.details || {}
      };
    });

    const hasSKTraders = list.some(b => b.metadata?.id === 'sk_traders');
    if (!hasSKTraders) {
      const skTradersData: BusinessCloudData = {
        metadata: { id: 'sk_traders', name: 'SK TRADERS' },
        details: {}
      };
      void saveBusinessToCloud('sk_traders', skTradersData.metadata, skTradersData.details);
      list.unshift(skTradersData);
    }
    return list;
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
