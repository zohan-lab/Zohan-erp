import { useMemo, useState } from 'react'
import { ShieldCheck, UserPlus, Trash, PencilSimple, Prohibit, Crown, UserCircle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  AuthenticatedUser,
  createAgentAccount,
  deleteAgentAccount,
  getUserAccounts,
  PermissionLevel,
  PermissionMap,
  updateAgentAccount,
  updateMasterAdminProfile,
  UserAccount
} from '@/lib/security-utils'
import { updateRemoteMasterAdminProfile } from '@/lib/firebase-auth'
import { cn } from '@/lib/utils'

export interface PermissionOption {
  id: string
  label: string
  group: string
}

interface UserManagementPageProps {
  accounts: UserAccount[]
  permissionOptions: PermissionOption[]
  onAccountsChange: (accounts: UserAccount[]) => void
  securityMode?: 'local' | 'server'
  counters: any[]
  businesses?: { id: string; name: string }[]
  currentUser?: AuthenticatedUser | null
  onAdminProfileUpdate?: (updatedUser: AuthenticatedUser) => void
  onSaveAgent?: (input: {
    id: string
    displayName: string
    permissions: PermissionMap
    isActive: boolean
    allowedCounters?: string[]
    allowedBusinesses?: string[]
  }) => Promise<UserAccount[]>
  onCreateRemoteAgent?: (input: {
    email: string
    displayName: string
    passcode: string
    permissions: PermissionMap
    companyId: string
    allowedCounters?: string[]
    allowedBusinesses?: string[]
  }) => Promise<void>
}

const defaultPermission = 'none' as PermissionLevel

function emptyPermissions(options: PermissionOption[]): PermissionMap {
  return options.reduce<PermissionMap>((acc, option) => {
    acc[option.id] = option.id === 'dashboard' ? 'view' : defaultPermission
    return acc
  }, {})
}

export default function UserManagementPage({
  accounts,
  permissionOptions,
  counters,
  businesses = [],
  onAccountsChange,
  securityMode = 'local',
  currentUser,
  onAdminProfileUpdate,
  onSaveAgent,
  onCreateRemoteAgent
}: UserManagementPageProps) {
  const isServerMode = securityMode === 'server'
  const agentAccounts = useMemo(
    () => accounts.filter((account) => account.role === 'agent'),
    [accounts]
  )
  const masterAdminAccount = useMemo(
    () => accounts.find((acc) => acc.role === 'master_admin') || (currentUser?.role === 'master_admin' ? currentUser : null),
    [accounts, currentUser]
  )
  const [adminDisplayName, setAdminDisplayName] = useState(() => currentUser?.displayName || masterAdminAccount?.displayName || 'Master Admin')
  const [adminPasscode, setAdminPasscode] = useState('')
  const [isAdminSaving, setIsAdminSaving] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [passcode, setPasscode] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [permissions, setPermissions] = useState<PermissionMap>(() => emptyPermissions(permissionOptions))
  const [allowedCounters, setAllowedCounters] = useState<string[]>([])
  const [allowedBusinesses, setAllowedBusinesses] = useState<string[]>([])

  const handleSaveAdminProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!adminDisplayName.trim()) {
      toast.error('Admin display name cannot be empty')
      return
    }
    setIsAdminSaving(true)
    try {
      let updatedUser: AuthenticatedUser
      if (isServerMode && currentUser) {
        await updateRemoteMasterAdminProfile({
          id: currentUser.id,
          displayName: adminDisplayName
        })
        updatedUser = await updateMasterAdminProfile({
          displayName: adminDisplayName,
          passcode: adminPasscode.trim() || undefined
        })
      } else {
        updatedUser = await updateMasterAdminProfile({
          displayName: adminDisplayName,
          passcode: adminPasscode.trim() || undefined
        })
      }
      setAdminPasscode('')
      if (onAdminProfileUpdate) {
        onAdminProfileUpdate(updatedUser)
      }
      onAccountsChange(getUserAccounts())
      toast.success(`Admin profile updated! Active name: "${updatedUser.displayName}"`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update admin profile')
    } finally {
      setIsAdminSaving(false)
    }
  }

  const groupedOptions = useMemo(() => {
    return permissionOptions.reduce<Record<string, PermissionOption[]>>((acc, option) => {
      acc[option.group] = [...(acc[option.group] || []), option]
      return acc
    }, {})
  }, [permissionOptions])

  const toggleCounter = (counterId: string) => {
    setAllowedCounters(prev => 
      prev.includes(counterId) 
        ? prev.filter(id => id !== counterId)
        : [...prev, counterId]
    )
  }

  const displayedCounters = useMemo(() => {
    if (!allowedBusinesses || allowedBusinesses.length === 0) {
      return counters
    }
    return counters.filter(c => 
      allowedBusinesses.includes(c.businessId) || 
      allowedBusinesses.includes(c.businessName) ||
      allowedBusinesses.includes(c.companyId)
    )
  }, [counters, allowedBusinesses])

  const toggleBusiness = (businessId: string) => {
    setAllowedBusinesses(prev => {
      const isSelecting = !prev.includes(businessId)
      const nextBusinesses = isSelecting
        ? [...prev, businessId]
        : prev.filter(id => id !== businessId)

      const bizCounters = counters.filter(c => 
        c.businessId === businessId || 
        c.businessName === businessId || 
        c.companyId === businessId
      )
      const bizCounterIds = bizCounters.map(c => c.id)

      if (isSelecting) {
        setAllowedCounters(currentCounters => {
          const set = new Set([...currentCounters, ...bizCounterIds])
          return Array.from(set)
        })
      } else {
        setAllowedCounters(currentCounters => {
          return currentCounters.filter(id => !bizCounterIds.includes(id))
        })
      }

      return nextBusinesses
    })
  }

  const resetForm = () => {
    setEditingId(null)
    setDisplayName('')
    setUsername('')
    setPasscode('')
    setIsActive(true)
    setPermissions(emptyPermissions(permissionOptions))
    setAllowedCounters([])
    setAllowedBusinesses([])
  }

  const handleEdit = (account: UserAccount) => {
    setEditingId(account.id)
    setDisplayName(account.displayName)
    setUsername(account.username)
    setPasscode('')
    setIsActive(account.isActive)
    const base = { ...emptyPermissions(permissionOptions), ...account.permissions, dashboard: 'view' as PermissionLevel }
    if (!base['parties'] || base['parties'] === 'none') {
      const legacy = base['suppliers'] || base['customers'] || base['customer-ledger'] || base['supplier-ledger']
      if (legacy && legacy !== 'none') {
        base['parties'] = legacy
      }
    }
    setPermissions(base)
    setAllowedCounters((account as any).allowedCounters || [])
    setAllowedBusinesses((account as any).allowedBusinesses || [])
  }

  const setPermission = (id: string, level: PermissionLevel) => {
    setPermissions((prev) => ({
      ...prev,
      [id]: id === 'dashboard' ? 'view' : level
    }))
  }

  const grantAll = (level: PermissionLevel) => {
    setPermissions(prev => {
      const next: PermissionMap = { ...prev }
      permissionOptions.forEach(opt => {
        next[opt.id] = opt.id === 'dashboard' ? 'view' : level
      })
      return next
    })
    toast.success(`Set all permissions to ${level === 'edit' ? 'Edit' : level === 'view' ? 'View' : 'No access'}`)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!displayName.trim()) {
      toast.error('Agent name is required')
      return
    }

    if (!editingId && !username.trim()) {
      toast.error('Agent email is required')
      return
    }

    // Strict email validation — block any write (local + Firebase) if the email is malformed.
    // This eliminates the legacy path that synthesized fake @sktraders.local addresses.
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!editingId && !emailRegex.test(username.trim())) {
      toast.error('Please enter a valid email address (e.g. agent@yourcompany.com)')
      return
    }

    if (!editingId && passcode.trim().length < 6) {
      toast.error('Use at least 6 characters for the agent passcode')
      return
    }
    if (editingId && passcode.trim() && passcode.trim().length < 6) {
      toast.error('New passcode must be at least 6 characters')
      return
    }

    const fullPermissions: PermissionMap = {
      ...permissions,
      suppliers: permissions['parties'] || permissions['suppliers'] || 'none',
      customers: permissions['parties'] || permissions['customers'] || 'none',
      'customer-ledger': permissions['parties'] || permissions['customer-ledger'] || 'none',
      'supplier-ledger': permissions['parties'] || permissions['supplier-ledger'] || 'none',
    }

    try {
      if (editingId && isServerMode && onSaveAgent) {
        const nextAccounts = await onSaveAgent({
          id: editingId,
          displayName,
          permissions: fullPermissions,
          isActive,
          allowedCounters,
          allowedBusinesses
        })
        onAccountsChange(nextAccounts)
        toast.success('Server permissions updated')
      } else if (editingId) {
        const nextAccounts = await updateAgentAccount(editingId, {
          displayName,
          passcode: passcode.trim() || undefined,
          permissions: fullPermissions,
          isActive,
          allowedCounters,
          allowedBusinesses
        })
        if (isServerMode && onSaveAgent) {
          try {
            await onSaveAgent({
              id: editingId,
              displayName,
              permissions: fullPermissions,
              isActive,
              allowedCounters,
              allowedBusinesses
            })
          } catch (remoteErr) {
            console.warn('Remote agent update notice:', remoteErr)
          }
        }
        onAccountsChange(nextAccounts)
        toast.success('Agent updated')
      } else if (isServerMode && onCreateRemoteAgent) {
        await onCreateRemoteAgent({
          email: username.trim().toLowerCase(),
          displayName,
          passcode,
          permissions: fullPermissions,
          companyId: businesses[0]?.id || 'sk_traders',
          allowedCounters,
          allowedBusinesses
        })
        onAccountsChange(getUserAccounts())
        toast.success('Agent created successfully on server')
      } else {
        const created = await createAgentAccount({
          username,
          displayName,
          passcode,
          permissions: fullPermissions,
          allowedCounters,
          allowedBusinesses
        })
        if (isServerMode && onCreateRemoteAgent) {
          try {
            await onCreateRemoteAgent({
              email: username.trim().toLowerCase(),
              displayName,
              passcode,
              permissions: fullPermissions,
              companyId: '',
              allowedCounters,
              allowedBusinesses
            })
          } catch (remoteErr) {
            console.warn('Remote agent creation notice:', remoteErr)
          }
        }
        onAccountsChange(getUserAccounts())
        toast.success(`Agent created successfully! Username: "${created.username}"`)
      }
      resetForm()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save agent')
    }
  }

  const handleDelete = (account: UserAccount) => {
    if (isServerMode) {
      toast.error('Server users cannot be deleted from the browser. Disable the profile here, then remove the Auth user in Firebase if needed.')
      return
    }
    if (!window.confirm(`Delete agent "${account.displayName}"? This cannot be undone.`)) return
    try {
      const nextAccounts = deleteAgentAccount(account.id)
      onAccountsChange(nextAccounts)
      if (editingId === account.id) resetForm()
      toast.success('Agent deleted')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to delete agent')
    }
  }

  return (
    <div className="space-y-6">
      {/* Master Admin Profile Card */}
      <Card className="neo-card border-amber-200/60 bg-gradient-to-r from-amber-50/40 via-white to-amber-50/20 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-amber-900 text-lg">
            <Crown className="h-5 w-5 text-amber-500" weight="fill" />
            Master Admin Profile Settings
          </CardTitle>
          <CardDescription>
            Configure your custom display name (e.g. Sahil Khan). This name will be rendered alongside your Crown icon (👑) in all audit logs and edit history dialogs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveAdminProfile} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="admin-display-name" className="text-xs font-semibold text-slate-700">
                Admin Display Name
              </Label>
              <Input
                id="admin-display-name"
                value={adminDisplayName}
                onChange={(e) => setAdminDisplayName(e.target.value)}
                placeholder="e.g. Sahil Khan"
                className="bg-white/90 border-slate-200 focus:border-amber-500"
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="admin-passcode" className="text-xs font-semibold text-slate-700">
                New Passcode (optional)
              </Label>
              <Input
                id="admin-passcode"
                type="password"
                value={adminPasscode}
                onChange={(e) => setAdminPasscode(e.target.value)}
                placeholder="Leave blank to keep current passcode"
                className="bg-white/90 border-slate-200 focus:border-amber-500"
              />
            </div>
            <Button
              type="submit"
              disabled={isAdminSaving}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-md shadow-amber-600/20 transition-all cursor-pointer"
            >
              {isAdminSaving ? 'Saving...' : 'Save Profile'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Agent Access</h2>
          <p className="text-sm text-muted-foreground">
            {isServerMode
              ? 'Firebase user profiles control which ERP areas agents can view or edit.'
              : 'Create agent logins and limit which ERP areas they can view or edit.'}
          </p>
        </div>
        <Badge variant="outline" className="w-fit gap-2 px-3 py-1.5">
          <ShieldCheck className="h-4 w-4" weight="duotone" />
          Master admin only
        </Badge>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(320px,420px)_1fr]">
        <Card className="neo-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {editingId ? <PencilSimple className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
              {editingId ? 'Edit Agent' : 'Add Agent'}
            </CardTitle>
            <CardDescription>
              {isServerMode
                ? 'Create/invite users in Firebase Auth first. Then edit their permissions here.'
                : 'Agents login with their own username and passcode.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="agent-display-name">Agent name</Label>
                <Input
                  id="agent-display-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="e.g. Sales Operator"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="agent-username">Agent Email</Label>
                <Input
                  id="agent-username"
                  type="email"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="e.g. agent@yourcompany.com"
                  disabled={Boolean(editingId)}
                  autoCapitalize="none"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="agent-passcode">{editingId ? 'New passcode (optional)' : 'Passcode'}</Label>
                <Input
                  id="agent-passcode"
                  type="password"
                  value={passcode}
                  onChange={(event) => setPasscode(event.target.value)}
                  placeholder="Minimum 6 characters"
                />
              </div>


              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Assigned Counters</Label>
                  {allowedBusinesses.length > 0 && (
                    <span className="text-[11px] font-semibold text-primary">
                      Filtered by selected business ({allowedBusinesses.length})
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  Select which counters this agent can view/manage. (Counters are filtered by selected business).
                </p>
                {displayedCounters.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic rounded-xl border border-dashed border-border bg-muted/20 p-4 text-center">
                    {allowedBusinesses.length === 0 
                      ? 'No counters available.' 
                      : 'No counters found for the selected business(es).'}
                  </div>
                ) : (
                  <div className="grid gap-2 grid-cols-2">
                    {displayedCounters.map(counter => {
                      const isChecked = allowedCounters.includes(counter.id)
                      return (
                        <div 
                          key={`${counter.businessId || counter.businessName || ''}_${counter.id}`} 
                          onClick={() => toggleCounter(counter.id)}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${isChecked ? 'bg-primary/10 border-primary' : 'bg-background hover:bg-muted'}`}
                        >
                          <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${isChecked ? 'bg-primary border-primary' : 'border-input'}`}>
                            {isChecked && <ShieldCheck className="w-3 h-3 text-primary-foreground" />}
                          </div>
                          <div className="flex flex-col min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-sm font-medium truncate" title={counter.name}>{counter.name}</span>
                              {counter.businessName && (
                                <span className="text-[9px] bg-primary/15 text-primary px-1.5 py-0.5 rounded font-bold shrink-0 truncate">
                                  {counter.businessName}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">{counter.type}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Business Access</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Select which businesses this agent can access. (If none selected, agent can access all businesses).
                </p>
                {businesses.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic">No businesses configured yet.</div>
                ) : (
                  <div className="grid gap-2 grid-cols-2">
                    {businesses.map(biz => (
                      <div 
                        key={biz.id} 
                        onClick={() => toggleBusiness(biz.id)}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${allowedBusinesses.includes(biz.id) ? 'bg-primary/10 border-primary' : 'bg-background hover:bg-muted'}`}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${allowedBusinesses.includes(biz.id) ? 'bg-primary border-primary' : 'border-input'}`}>
                          {allowedBusinesses.includes(biz.id) && <ShieldCheck className="w-3 h-3 text-primary-foreground" />}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{biz.name}</span>
                          <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Company</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {editingId && (
                <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-3 py-3">
                  <div>
                    <div className="text-sm font-semibold">Agent active</div>
                    <div className="text-xs text-muted-foreground">Turn off to block login without deleting.</div>
                  </div>
                  <Switch checked={isActive} onCheckedChange={setIsActive} />
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button type="submit" className="flex-1">
                  {editingId ? 'Save Agent' : 'Create Agent'}
                </Button>
                {editingId && (
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="neo-card">
          <CardHeader className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <CardTitle>Permission Matrix</CardTitle>
              <CardDescription>
                View lets agents open a screen. Edit lets them create, update, and delete records.
              </CardDescription>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs font-semibold px-2.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200"
                onClick={() => grantAll('edit')}
              >
                Grant All Edit
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs font-semibold px-2.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200"
                onClick={() => grantAll('view')}
              >
                Grant All View
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs px-2.5 text-slate-600 hover:bg-slate-100"
                onClick={() => grantAll('none')}
              >
                Clear
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {Object.entries(groupedOptions).map(([group, options]) => (
              <div key={group} className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{group}</h3>
                <div className="grid gap-2 md:grid-cols-2">
                  {options.map((option) => (
                    <div
                      key={option.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/70 px-3 py-2 shadow-sm"
                    >
                      <span className="text-sm font-medium">{option.label}</span>
                      <Select
                        value={permissions[option.id] || defaultPermission}
                        onValueChange={(value) => setPermission(option.id, value as PermissionLevel)}
                        disabled={option.id === 'dashboard'}
                      >
                        <SelectTrigger className="h-9 w-[116px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No access</SelectItem>
                          <SelectItem value="view">View</SelectItem>
                          <SelectItem value="edit">Edit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="neo-card">
        <CardHeader>
          <CardTitle>Existing Agents</CardTitle>
          <CardDescription>
            {isServerMode
              ? 'Disable profiles here. Delete Auth users from the Firebase console or a trusted server function.'
              : 'Delete accounts that should no longer access company data.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {agentAccounts.length === 0 ? (
            <div className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-center">
              <Prohibit className="mb-2 h-7 w-7 text-muted-foreground" />
              <p className="text-sm font-semibold">No agent accounts yet</p>
              <p className="text-xs text-muted-foreground">Create the first one from the form above.</p>
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {agentAccounts.map((account) => {
                const editCount = Object.values(account.permissions).filter((level) => level === 'edit').length
                const viewCount = Object.values(account.permissions).filter((level) => level === 'view').length
                const accBusinesses = (account as any).allowedBusinesses || []
                return (
                  <div
                    key={account.id}
                    className={cn(
                      "rounded-2xl border border-border bg-background/75 p-4 shadow-sm",
                      !account.isActive && "opacity-60"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{account.displayName}</div>
                        <div className="text-xs text-muted-foreground">@{account.username}</div>
                      </div>
                      <Badge variant={account.isActive ? 'secondary' : 'outline'}>
                        {account.isActive ? 'Active' : 'Disabled'}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="rounded-full bg-muted px-2.5 py-1 font-medium">{editCount} edit</span>
                      <span className="rounded-full bg-muted px-2.5 py-1 font-medium">{viewCount} view-only</span>
                      <span className="rounded-full bg-primary/10 text-primary px-2.5 py-1 font-semibold">
                        {accBusinesses.length === 0 
                          ? 'All Businesses' 
                          : `${accBusinesses.length} Business(es)`}
                      </span>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => handleEdit(account)}>
                        <PencilSimple className="mr-1.5 h-4 w-4" />
                        Edit
                      </Button>
                      <Button type="button" variant={isServerMode ? 'outline' : 'destructive'} size="sm" onClick={() => handleDelete(account)}>
                        <Trash className="mr-1.5 h-4 w-4" />
                        {isServerMode ? 'Dashboard Delete' : 'Delete'}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
