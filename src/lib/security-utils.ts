export interface AuditLogEntry {
  id: string
  timestamp: string
  action: string
  tenantKey?: string
  details?: Record<string, unknown>
}

export type UserRole = 'master_admin' | 'agent'
export type PermissionLevel = 'none' | 'view' | 'edit'
export type PermissionMap = Record<string, PermissionLevel>

export interface UserAccount {
  id: string
  username: string
  displayName: string
  role: UserRole
  permissions: PermissionMap
  isActive: boolean
  allowedCounters?: string[]
  allowedBusinesses?: string[]
  salt: string
  passcodeHash: string
  createdAt: string
  updatedAt: string
}

export interface AuthenticatedUser {
  id: string
  username: string
  displayName: string
  role: UserRole
  permissions: PermissionMap
  isActive: boolean
  allowedCounters?: string[]
  allowedBusinesses?: string[]
}

const AUDIT_LOG_KEY = 'app_audit_log'
const APP_LOCK_HASH_KEY = 'app_lock_hash'
const APP_LOCK_SALT_KEY = 'app_lock_salt'
const APP_AUTH_SESSION_KEY = 'app_auth_session'
const APP_AUTH_USER_ID_KEY = 'app_auth_user_id'
const APP_AUTH_ACTIVE_USER_KEY = 'app_auth_active_user'
const APP_USERS_KEY = 'app_user_accounts'
const PASSCODE_HASH_ITERATIONS = 210000

export function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function isAllowedRestoreKey(key: string): boolean {
  return (
    key === 'app_metadata' ||
    key === 'storedCompanies' ||
    key.startsWith('data_') ||
    key.startsWith('cashbank_')
  )
}

export function appendAuditLog(action: string, details?: Record<string, unknown>, tenantKey?: string): void {
  try {
    const current = safeJsonParse<AuditLogEntry[]>(localStorage.getItem(AUDIT_LOG_KEY), [])
    const entry: AuditLogEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      action,
      tenantKey,
      details
    }
    const next = [entry, ...current].slice(0, 1000)
    localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(next))
  } catch (error) {
    console.error('Failed to write audit log:', error)
  }
}

function bytesToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function createSalt(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes.buffer)
}

async function hashPasscode(passcode: string, salt: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passcode),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode(salt),
      iterations: PASSCODE_HASH_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  )
  return bytesToHex(derivedBits)
}

async function legacyHashPasscode(passcode: string, salt: string): Promise<string> {
  const encoded = new TextEncoder().encode(`${salt}:${passcode}`)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return bytesToHex(digest)
}

export function hasAppLock(): boolean {
  return hasMasterAdmin() || Boolean(localStorage.getItem(APP_LOCK_HASH_KEY) && localStorage.getItem(APP_LOCK_SALT_KEY))
}

export function hasAuthenticatedSession(): boolean {
  return sessionStorage.getItem(APP_AUTH_SESSION_KEY) === 'true' && Boolean(sessionStorage.getItem(APP_AUTH_USER_ID_KEY))
}

export function getUserAccounts(): UserAccount[] {
  return safeJsonParse<UserAccount[]>(localStorage.getItem(APP_USERS_KEY), [])
}

export function saveUserAccounts(accounts: UserAccount[], overwrite = false): void {
  if (overwrite) {
    localStorage.setItem(APP_USERS_KEY, JSON.stringify(accounts))
    return
  }
  const existing = safeJsonParse<UserAccount[]>(localStorage.getItem(APP_USERS_KEY), [])
  const map = new Map<string, UserAccount>()

  // Load existing accounts into map by id and normalized username
  existing.forEach((acc) => {
    map.set(acc.id, acc)
    map.set(`user:${acc.username.toLowerCase()}`, acc)
  })

  // Merge new or updated accounts
  accounts.forEach((acc) => {
    map.set(acc.id, acc)
    map.set(`user:${acc.username.toLowerCase()}`, acc)
  })

  const merged = Array.from(new Set(Array.from(map.values())))
  localStorage.setItem(APP_USERS_KEY, JSON.stringify(merged))
}

export function persistActiveUserSession(user: AuthenticatedUser): void {
  try {
    sessionStorage.setItem(APP_AUTH_ACTIVE_USER_KEY, JSON.stringify(user))
    localStorage.setItem(APP_AUTH_ACTIVE_USER_KEY, JSON.stringify(user))
    sessionStorage.setItem(APP_AUTH_SESSION_KEY, 'true')
    sessionStorage.setItem(APP_AUTH_USER_ID_KEY, user.id)
  } catch (e) {
    console.error('Failed to persist active user session:', e)
  }
}

export const MASTER_ADMIN_EMAIL = 'sksahil299399@gmail.com'

export function isMasterAdminIdentifier(username: string | null | undefined): boolean {
  if (!username) return false
  const clean = username.trim().toLowerCase()
  // Strict: only the exact master admin email is a privileged identifier.
  // The legacy clean.includes('master') wildcard has been removed — it would
  // mis-elevate any address containing the word "master" (postmaster@, masterbatch@…).
  return clean === MASTER_ADMIN_EMAIL.toLowerCase()
}

function toAuthenticatedUser(account: UserAccount): AuthenticatedUser {
  const isMaster = account.role === 'master_admin' || isMasterAdminIdentifier(account.username)
  let displayName = account.displayName
  if (isMaster && (!displayName || displayName === account.username)) {
    displayName = 'Master Admin'
  }
  return {
    id: account.id,
    username: account.username,
    displayName: displayName,

    role: isMaster ? 'master_admin' : 'agent',
    permissions: account.permissions,
    isActive: account.isActive,
    allowedCounters: account.allowedCounters || [],
    allowedBusinesses: account.allowedBusinesses || []
  }
}

function createAccountId(role: UserRole): string {
  return `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function hasMasterAdmin(): boolean {
  return getUserAccounts().some((account) => account.role === 'master_admin' && account.isActive)
}

export function getCurrentUser(): AuthenticatedUser | null {
  const userId = sessionStorage.getItem(APP_AUTH_USER_ID_KEY)
  const cachedUserStr = sessionStorage.getItem(APP_AUTH_ACTIVE_USER_KEY) || localStorage.getItem(APP_AUTH_ACTIVE_USER_KEY)

  let cachedUser: AuthenticatedUser | null = null
  if (cachedUserStr) {
    try {
      cachedUser = JSON.parse(cachedUserStr) as AuthenticatedUser
    } catch (e) { }
  }

  if (userId) {
    const account = getUserAccounts().find((item) => item.id === userId && item.isActive)
    if (account) {
      const authUser = toAuthenticatedUser(account)
      persistActiveUserSession(authUser)
      return authUser
    }
  }

  if (cachedUser && cachedUser.isActive) {
    const freshAccount = getUserAccounts().find(
      a => a.id === cachedUser!.id || a.username.toLowerCase() === cachedUser!.username.toLowerCase()
    )
    if (freshAccount && freshAccount.isActive) {
      const authUser = toAuthenticatedUser(freshAccount)
      persistActiveUserSession(authUser)
      return authUser
    }
    return cachedUser
  }

  return null
}

/** Returns a human-readable label for edit history audit trails.
 *  Priority: displayName → username → 'Unknown User'.
 *  Master Admin is always returned as 'Master Admin' — the raw email is never surfaced. */
export function getChangedByLabel(): string {
  const user = getCurrentUser()
  if (!user) return 'Unknown User'
  const isMaster = user.role === 'master_admin' || isMasterAdminIdentifier(user.username)
  if (isMaster) return 'Master Admin'
  // Agents: prefer the human-readable displayName, fall back to username (which may be an email).

  return user.displayName || user.username || 'Unknown User'
}

/** Returns the current user's role for edit history icon differentiation. */
export function getChangedByRole(): UserRole | 'unknown' {
  const user = getCurrentUser()
  return user?.role || 'unknown'
}

export async function createMasterAdmin(username: string, displayName: string, passcode: string): Promise<AuthenticatedUser> {
  const now = new Date().toISOString()
  const accounts = getUserAccounts()
  const normalizedUsername = username.trim().toLowerCase().split('@')[0] || 'admin'
  const salt = createSalt()
  const passcodeHash = await hashPasscode(passcode, salt)
  const account: UserAccount = {
    id: createAccountId('master_admin'),
    username: normalizedUsername,
    displayName: displayName.trim() || 'Master Admin',
    role: 'master_admin',
    permissions: {},
    isActive: true,
    salt,
    passcodeHash,
    createdAt: now,
    updatedAt: now
  }
  const next = accounts.filter((item) => item.role !== 'master_admin')
  saveUserAccounts([account, ...next], true)
  const authUser = toAuthenticatedUser(account)
  persistActiveUserSession(authUser)
  appendAuditLog('master_admin_created', { username: account.username })
  return authUser
}

export async function createAgentAccount(input: {
  username: string
  displayName: string
  passcode: string
  permissions?: PermissionMap
  allowedCounters?: string[]
  allowedBusinesses?: string[]
}): Promise<UserAccount> {
  const accounts = getUserAccounts()
  const rawUsername = input.username.trim().toLowerCase()
  const normalizedUsername = rawUsername.split('@')[0]
  if (!rawUsername) throw new Error('Username is required')

  if (
    accounts.some(
      (account) =>
        account.username.toLowerCase() === rawUsername ||
        account.username.toLowerCase() === normalizedUsername ||
        account.username.toLowerCase().split('@')[0] === normalizedUsername
    )
  ) {
    throw new Error(`Username or email '${input.username.trim()}' already exists`)
  }

  const now = new Date().toISOString()
  const salt = createSalt()
  const passcodeHash = await hashPasscode(input.passcode, salt)
  const account: UserAccount = {
    id: createAccountId('agent'),
    username: rawUsername,
    displayName: input.displayName.trim() || normalizedUsername || rawUsername,
    role: 'agent',
    permissions: input.permissions || {},
    isActive: true,
    allowedCounters: input.allowedCounters || [],
    allowedBusinesses: input.allowedBusinesses || [],
    salt,
    passcodeHash,
    createdAt: now,
    updatedAt: now
  }
  saveUserAccounts([account, ...accounts])
  appendAuditLog('agent_account_created', { username: account.username })
  return account
}

export async function updateAgentAccount(id: string, input: {
  displayName: string
  passcode?: string
  permissions?: PermissionMap
  isActive?: boolean
  allowedCounters?: string[]
  allowedBusinesses?: string[]
}): Promise<UserAccount[]> {
  const accounts = getUserAccounts()
  const target = accounts.find((account) => account.id === id && account.role === 'agent')
  if (!target) throw new Error('Agent not found')

  let salt = target.salt
  let passcodeHash = target.passcodeHash
  if (input.passcode?.trim()) {
    salt = createSalt()
    passcodeHash = await hashPasscode(input.passcode, salt)
  }

  const nextAccounts = accounts.map((account) => {
    if (account.id !== id || account.role !== 'agent') return account
    return {
      ...account,
      displayName: input.displayName.trim() || account.username,
      permissions: input.permissions ?? account.permissions,
      isActive: input.isActive ?? account.isActive,
      allowedCounters: input.allowedCounters ?? account.allowedCounters,
      allowedBusinesses: input.allowedBusinesses ?? account.allowedBusinesses,
      salt,
      passcodeHash,
      updatedAt: new Date().toISOString()
    }
  })
  saveUserAccounts(nextAccounts, true)
  appendAuditLog('agent_account_updated', { agentId: id, isActive: input.isActive })
  return getUserAccounts()
}

export function deleteAgentAccount(id: string): UserAccount[] {
  const accounts = getUserAccounts()
  const target = accounts.find((account) => account.id === id && account.role === 'agent')
  if (!target) throw new Error('Agent not found')
  const next = accounts.filter((account) => account.id !== id)
  saveUserAccounts(next, true)
  appendAuditLog('agent_account_deleted', { agentId: id, username: target.username })
  if (sessionStorage.getItem(APP_AUTH_USER_ID_KEY) === id) {
    lockAppSession()
  }
  return next
}

export interface DetailedLoginResult {
  success: boolean
  user?: AuthenticatedUser
  error?: string
}

export async function verifyUserLoginDetailed(username: string, passcode: string): Promise<DetailedLoginResult> {
  const raw = username.trim().toLowerCase()
  if (!raw) return { success: false, error: 'Username is required' }
  const cleanUsername = raw.split('@')[0]

  const accounts = getUserAccounts()
  const account = accounts.find(
    (item) =>
      item.username.toLowerCase() === raw ||
      item.username.toLowerCase() === cleanUsername ||
      item.username.toLowerCase().split('@')[0] === cleanUsername ||
      item.username.toLowerCase().split('@')[0] === raw
  )

  if (!account) {
    return { success: false, error: `User '${username.trim()}' does not exist.` }
  }

  if (!account.isActive) {
    return { success: false, error: `Account '${account.username}' is disabled. Please contact Master Admin.` }
  }

  const hash = await hashPasscode(passcode, account.salt)
  let isValid = (hash === account.passcodeHash)

  if (!isValid) {
    const legacyHash = await legacyHashPasscode(passcode, account.salt)
    if (legacyHash === account.passcodeHash) {
      isValid = true
      const updatedAccounts = accounts.map((item) => (
        item.id === account.id
          ? { ...item, passcodeHash: hash, updatedAt: new Date().toISOString() }
          : item
      ))
      saveUserAccounts(updatedAccounts, true)
    }
  }

  if (!isValid) {
    return { success: false, error: `Incorrect passcode for user '${account.username}'.` }
  }

  const authUser = toAuthenticatedUser(account)
  persistActiveUserSession(authUser)
  appendAuditLog('user_logged_in', { username: account.username, role: account.role })
  return { success: true, user: authUser }
}

export async function verifyUserLogin(username: string, passcode: string): Promise<AuthenticatedUser | null> {
  const res = await verifyUserLoginDetailed(username, passcode)
  return res.user || null
}

export async function setAppPasscode(passcode: string): Promise<void> {
  const salt = createSalt()
  const hash = await hashPasscode(passcode, salt)
  localStorage.setItem(APP_LOCK_SALT_KEY, salt)
  localStorage.setItem(APP_LOCK_HASH_KEY, hash)
  sessionStorage.setItem(APP_AUTH_SESSION_KEY, 'true')
  sessionStorage.setItem(APP_AUTH_USER_ID_KEY, 'legacy-admin')
  appendAuditLog('app_lock_created')
}

export async function verifyAppPasscode(passcode: string): Promise<boolean> {
  const salt = localStorage.getItem(APP_LOCK_SALT_KEY)
  const storedHash = localStorage.getItem(APP_LOCK_HASH_KEY)
  if (!salt || !storedHash) return false
  const hash = await hashPasscode(passcode, salt)
  let isValid = hash === storedHash
  if (!isValid) {
    const legacyHash = await legacyHashPasscode(passcode, salt)
    isValid = legacyHash === storedHash
    if (isValid) {
      localStorage.setItem(APP_LOCK_HASH_KEY, hash)
    }
  }
  if (isValid) {
    sessionStorage.setItem(APP_AUTH_SESSION_KEY, 'true')
    sessionStorage.setItem(APP_AUTH_USER_ID_KEY, 'legacy-admin')
    appendAuditLog('app_unlocked')
  }
  return isValid
}

export function lockAppSession(): void {
  sessionStorage.removeItem(APP_AUTH_SESSION_KEY)
  sessionStorage.removeItem(APP_AUTH_USER_ID_KEY)
  sessionStorage.removeItem(APP_AUTH_ACTIVE_USER_KEY)
  localStorage.removeItem(APP_AUTH_ACTIVE_USER_KEY)
  appendAuditLog('app_locked')
}

export function sanitizeText(input: string | null | undefined): string {
  if (!input) return ''
  return String(input)
    .trim()
    .replace(/[<>]/g, '')
}

export function sanitizeNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

export function isValidGSTIN(gstin: string): boolean {
  if (!gstin) return true
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
  return gstinRegex.test(gstin.trim().toUpperCase())
}

export function isValidPAN(pan: string): boolean {
  if (!pan) return true
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/
  return panRegex.test(pan.trim().toUpperCase())
}
