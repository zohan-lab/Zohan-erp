import { initializeApp, getApps } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
}

const remoteStorageFlag = import.meta.env.VITE_ENABLE_REMOTE_STORAGE as string | undefined
const firebaseAuthFlag = import.meta.env.VITE_ENABLE_FIREBASE_AUTH as string | undefined
const disableLocalCacheFlag = import.meta.env.VITE_DISABLE_LOCAL_CACHE as string | undefined

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.appId
)

export const isRemoteStorageEnabled = remoteStorageFlag !== 'false'
export const isFirebaseAuthEnabled = firebaseAuthFlag === 'true'
export const isLocalCacheDisabled = true

// Initialize Firebase only once (Vite HMR safety)
const firebaseApp = isFirebaseConfigured
  ? (getApps().length === 0 ? initializeApp(firebaseConfig as Required<typeof firebaseConfig>) : getApps()[0])
  : null

export const auth = firebaseApp ? getAuth(firebaseApp) : null
export const db = firebaseApp ? getFirestore(firebaseApp) : null
