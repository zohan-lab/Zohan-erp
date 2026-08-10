import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser,
  createUserWithEmailAndPassword,
  getAuth
} from 'firebase/auth'
import { initializeApp, deleteApp } from 'firebase/app'
import {
  doc,
  getDoc,
  getDocs,
  collection,
  updateDoc,
  setDoc,
  serverTimestamp
} from 'firebase/firestore'
import { firebaseConfig, auth, db, isFirebaseAuthEnabled, isFirebaseConfigured } from './firebase-client'
import { AuthenticatedUser, PermissionMap, UserAccount, isMasterAdminIdentifier, MASTER_ADMIN_EMAIL, getCurrentUser, getUserAccounts, persistActiveUserSession } from './security-utils'

// ─── Error Classes ────────────────────────────────────────────────────────────

export class RemoteAuthServiceUnavailableError extends Error {
  constructor(message = 'Firebase Auth is temporarily unavailable. Please try again in a moment.') {
    super(message)
    this.name = 'RemoteAuthServiceUnavailableError'
  }
}

// ─── Firestore User Profile Shape ─────────────────────────────────────────────

interface FirestoreUserProfile {
  email: string
  displayName: string | null
  role: 'master_admin' | 'agent'
  permissions: PermissionMap | null
  isActive: boolean
  companyId: string | null
  allowedCounters?: string[]
  allowedBusinesses?: string[]
  createdAt: string
  updatedAt: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function canUseFirebaseAuth(): boolean {
  return isFirebaseAuthEnabled && isFirebaseConfigured && Boolean(auth) && Boolean(db)
}

function withTimeout<T>(promise: Promise<T>, ms = 20000): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = window.setTimeout(
      () => reject(new RemoteAuthServiceUnavailableError('Firebase request timed out.')),
      ms
    )
    promise.then(resolve).catch(reject).finally(() => window.clearTimeout(id))
  })
}

function toAuthenticatedUser(uid: string, profile: FirestoreUserProfile): AuthenticatedUser {
  const isMaster = profile.role === 'master_admin' || isMasterAdminIdentifier(profile.email)
  return {
    id: uid,
    username: profile.email,
    displayName: profile.displayName || profile.email,
    role: isMaster ? 'master_admin' : 'agent',
    permissions: profile.permissions || {},
    isActive: profile.isActive,
    allowedCounters: profile.allowedCounters || [],
    allowedBusinesses: profile.allowedBusinesses || []
  }
}

function firebaseUserToAuthenticatedUser(fbUser: FirebaseUser): AuthenticatedUser | null {
  const email = fbUser.email?.trim().toLowerCase()
  if (!email) return null

  const localAccount = getUserAccounts().find(
    a => a.username.toLowerCase() === email || a.username.toLowerCase().split('@')[0] === email.split('@')[0]
  )
  if (localAccount) {
    const user: AuthenticatedUser = {
      id: fbUser.uid || localAccount.id,
      username: email,
      displayName: localAccount.displayName || fbUser.displayName || email,
      role: localAccount.role,
      permissions: localAccount.permissions || {},
      isActive: localAccount.isActive,
      allowedCounters: localAccount.allowedCounters || [],
      allowedBusinesses: localAccount.allowedBusinesses || []
    }
    persistActiveUserSession(user)
    return user
  }

  const isMaster = isMasterAdminIdentifier(email) || email === MASTER_ADMIN_EMAIL.toLowerCase()
  const user: AuthenticatedUser = {
    id: fbUser.uid,
    username: email,
    displayName: fbUser.displayName || email,
    role: isMaster ? 'master_admin' : 'agent',
    permissions: {},
    isActive: true
  }
  persistActiveUserSession(user)
  return user
}

async function fetchFirestoreProfile(uid: string): Promise<FirestoreUserProfile | null> {
  if (!db) return null
  try {
    const snap = await withTimeout(getDoc(doc(db, 'users', uid)))
    return snap.exists() ? (snap.data() as FirestoreUserProfile) : null
  } catch {
    return null
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check Firebase Auth for a currently-signed-in user and return the ERP profile.
 */
export async function getRemoteCurrentUser(): Promise<AuthenticatedUser | null> {
  if (!canUseFirebaseAuth() || !auth) return null

  // Wait for auth to settle (avoids race on page load)
  const fbUser = await withTimeout(
    new Promise<FirebaseUser | null>((resolve) => {
      const unsub = onAuthStateChanged(auth!, (user) => {
        unsub()
        resolve(user)
      })
    })
  )

  if (!fbUser) return null

  let profile = await fetchFirestoreProfile(fbUser.uid)
  if (!profile && fbUser.email && db) {
    try {
      const snap = await getDocs(collection(db, 'users'))
      const match = snap.docs.find(d => (d.data() as FirestoreUserProfile).email?.toLowerCase() === fbUser.email?.toLowerCase())
      if (match) {
        profile = match.data() as FirestoreUserProfile
      }
    } catch (e) {
      console.warn('Firestore profile lookup by email warning:', e)
    }
  }

  if (profile) {
    if (!profile.isActive) {
      await signOut(auth!)
      return null
    }
    const user = toAuthenticatedUser(fbUser.uid, profile)
    persistActiveUserSession(user)
    return user
  }

  const cachedUser = getCurrentUser()
  if (cachedUser && (cachedUser.id === fbUser.uid || cachedUser.username.toLowerCase() === fbUser.email?.toLowerCase())) {
    persistActiveUserSession(cachedUser)
    return cachedUser
  }

  return firebaseUserToAuthenticatedUser(fbUser)
}

/**
 * Sign in with email and password via Firebase Auth.
 */
export async function signInRemoteUser(
  email: string,
  password: string
): Promise<AuthenticatedUser | null> {
  if (!canUseFirebaseAuth() || !auth) return null

  const cleanEmail = email.trim().toLowerCase()
  const isMasterAdminEmail = cleanEmail === MASTER_ADMIN_EMAIL.toLowerCase() || isMasterAdminIdentifier(cleanEmail)

  try {
    const credential = await withTimeout(
      signInWithEmailAndPassword(auth, cleanEmail, password)
    )
    let profile = await fetchFirestoreProfile(credential.user.uid)
    if (!profile && db) {
      const now = new Date().toISOString()
      const newProfile: FirestoreUserProfile = {
        email: cleanEmail,
        displayName: credential.user.displayName || (isMasterAdminEmail ? 'Master Admin' : cleanEmail),
        role: isMasterAdminEmail ? 'master_admin' : 'agent',
        permissions: {},
        isActive: true,
        companyId: null,
        allowedCounters: [],
        allowedBusinesses: [],
        createdAt: now,
        updatedAt: now
      }
      try {
        await setDoc(doc(db, 'users', credential.user.uid), newProfile)
        profile = newProfile
      } catch (e) {
        console.warn('Auto-creating Firestore profile warning:', e)
      }
    }

    if (profile) {
      if (!profile.isActive) {
        await signOut(auth)
        throw new Error('Your account is inactive. Contact the admin.')
      }
      return toAuthenticatedUser(credential.user.uid, profile)
    }
    return firebaseUserToAuthenticatedUser(credential.user)
  } catch (error: unknown) {
    if (error instanceof RemoteAuthServiceUnavailableError) throw error
    const code = (error as { code?: string }).code

    // If account does not exist in Firebase Auth yet, auto-create/bootstrap on first login!
    if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
      try {
        const cred = await withTimeout(
          createUserWithEmailAndPassword(auth, cleanEmail, password)
        )
        const now = new Date().toISOString()
        const newProfile: FirestoreUserProfile = {
          email: cleanEmail,
          displayName: cred.user.displayName || (isMasterAdminEmail ? 'Master Admin' : cleanEmail),
          role: isMasterAdminEmail ? 'master_admin' : 'agent',
          permissions: {},
          isActive: true,
          companyId: null,
          allowedCounters: [],
          allowedBusinesses: [],
          createdAt: now,
          updatedAt: now
        }
        if (db) {
          await setDoc(doc(db, 'users', cred.user.uid), newProfile)
        }
        return toAuthenticatedUser(cred.user.uid, newProfile)
      } catch (createErr: unknown) {
        const createCode = (createErr as { code?: string })?.code
        if (createCode === 'auth/email-already-in-use') {
          throw new Error('Incorrect email or password.')
        }
        if (createCode === 'auth/weak-password') {
          throw new Error('Password should be at least 6 characters.')
        }
      }
    }

    const msg =
      code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found'
        ? 'Incorrect email or password.'
        : code === 'auth/too-many-requests'
          ? 'Too many login attempts. Try again later.'
          : (error instanceof Error ? error.message : 'Login failed.')
    throw new Error(msg)
  }
}

/**
 * Sign out from Firebase Auth.
 */
export async function signOutRemoteUser(): Promise<void> {
  if (!auth) return
  try {
    await signOut(auth)
  } catch (error) {
    console.warn('Firebase sign-out failed:', error)
  }
}

/**
 * List all user profiles from Firestore (master_admin only).
 */
export async function listRemoteUserProfiles(): Promise<UserAccount[]> {
  if (!canUseFirebaseAuth() || !db) return []
  const snap = await withTimeout(getDocs(collection(db, 'users')))
  return snap.docs.map((d) => {
    const data = d.data() as FirestoreUserProfile
    return {
      id: d.id,
      username: data.email,
      displayName: data.displayName || data.email,
      role: data.role,
      permissions: data.permissions || {},
      isActive: data.isActive,
      allowedCounters: data.allowedCounters || [],
      allowedBusinesses: data.allowedBusinesses || [],
      salt: '',
      passcodeHash: '',
      createdAt: data.createdAt || '',
      updatedAt: data.updatedAt || ''
    }
  })
}

/**
 * Update a user profile in Firestore.
 */
export async function updateRemoteUserProfile(input: {
  id: string
  companyId: string
  displayName: string
  role: 'master_admin' | 'agent'
  permissions: PermissionMap
  isActive: boolean
  allowedCounters?: string[]
  allowedBusinesses?: string[]
}): Promise<UserAccount[]> {
  if (!canUseFirebaseAuth() || !db) return []

  await withTimeout(
    updateDoc(doc(db, 'users', input.id), {
      displayName: input.displayName.trim(),
      role: input.role,
      permissions: input.permissions,
      isActive: input.isActive,
      companyId: input.companyId,
      allowedCounters: input.allowedCounters || [],
      allowedBusinesses: input.allowedBusinesses || [],
      updatedAt: new Date().toISOString()
    })
  )

  return listRemoteUserProfiles()
}

export async function createRemoteAgentAccount(input: {
  email: string
  displayName: string
  passcode: string
  companyId: string
  permissions?: PermissionMap
  allowedCounters?: string[]
  allowedBusinesses?: string[]
}): Promise<void> {
  if (!canUseFirebaseAuth() || !db) return

  const cleanEmail = input.email.trim().toLowerCase()
  const secondaryApp = initializeApp(firebaseConfig as any, `Secondary-${Date.now()}`)
  const secondaryAuth = getAuth(secondaryApp)

  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, input.passcode)
    const uid = cred.user.uid
    const now = new Date().toISOString()

    await withTimeout(
      setDoc(doc(db, 'users', uid), {
        email: cleanEmail,
        displayName: input.displayName.trim() || cleanEmail,
        role: 'agent',
        permissions: input.permissions || {},
        isActive: true,
        companyId: input.companyId,
        allowedCounters: input.allowedCounters || [],
        allowedBusinesses: input.allowedBusinesses || [],
        createdAt: now,
        updatedAt: now
      })
    )
  } catch (error: any) {
    if (error?.code === 'auth/email-already-in-use') {
      // If user already exists in Firebase Auth, attempt login or Firestore document overwrite
      const snap = await getDocs(collection(db, 'users'))
      const match = snap.docs.find(d => (d.data() as FirestoreUserProfile).email === cleanEmail)
      if (match) {
        await updateDoc(doc(db, 'users', match.id), {
          displayName: input.displayName.trim() || cleanEmail,
          permissions: input.permissions || {},
          allowedCounters: input.allowedCounters || [],
          allowedBusinesses: input.allowedBusinesses || [],
          updatedAt: new Date().toISOString()
        })
        return
      }
    }
    throw error
  } finally {
    await deleteApp(secondaryApp)
  }
}

/**
 * Create or overwrite a user profile in Firestore (call after Firebase Auth user creation).
 */
export async function createRemoteUserProfile(
  uid: string,
  email: string,
  displayName: string,
  role: 'master_admin' | 'agent',
  companyId: string,
  permissions: PermissionMap = {}
): Promise<void> {
  if (!db) return
  const now = new Date().toISOString()
  await withTimeout(
    setDoc(doc(db, 'users', uid), {
      email: email.trim().toLowerCase(),
      displayName: displayName.trim(),
      role,
      permissions,
      isActive: true,
      companyId,
      createdAt: now,
      updatedAt: now
    } satisfies FirestoreUserProfile)
  )
}

// Re-export for App.tsx compatibility
export { RemoteAuthServiceUnavailableError as default }
