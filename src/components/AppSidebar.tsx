import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SquaresFour,
  CaretDown,
  Plus,
  Gear,
  DownloadSimple,
  UploadSimple,
  SignOut,
  Database,
  Bank,
} from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { AuthenticatedUser } from '@/lib/security-utils'

type NavItem = {
  id: string
  label: string
  icon: React.ComponentType<any>
}

type NavGroup = {
  title: string
  isSingle?: boolean
  items: NavItem[]
}

// Each group gets a color accent for its icon bg and active state
type ThemeConfig = {
  iconBg: string        // icon wrapper bg (inactive)
  iconColor: string     // icon color (inactive)
  activeBg: string      // item bg when active
  activeText: string    // item text/icon when active
  dotColor: string      // group header dot
  badgeBg: string       // item count badge
  hoverBg: string       // item hover bg
}

const GROUP_THEMES: Record<string, ThemeConfig> = {
  Parties: {
    iconBg: 'bg-teal-50',
    iconColor: 'text-teal-600',
    activeBg: 'bg-teal-600',
    activeText: 'text-white',
    dotColor: 'bg-teal-500',
    badgeBg: 'bg-teal-100 text-teal-700',
    hoverBg: 'hover:bg-teal-50',
  },
  Sales: {
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    activeBg: 'bg-[#5B5FEF]',
    activeText: 'text-white',
    dotColor: 'bg-blue-500',
    badgeBg: 'bg-blue-100 text-blue-700',
    hoverBg: 'hover:bg-[#5B5FEF]/8',
  },
  Purchase: {
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-600',
    activeBg: 'bg-violet-600',
    activeText: 'text-white',
    dotColor: 'bg-violet-500',
    badgeBg: 'bg-violet-100 text-violet-700',
    hoverBg: 'hover:bg-violet-50',
  },
  Expenses: {
    iconBg: 'bg-orange-50',
    iconColor: 'text-orange-500',
    activeBg: 'bg-orange-500',
    activeText: 'text-white',
    dotColor: 'bg-orange-400',
    badgeBg: 'bg-orange-100 text-orange-700',
    hoverBg: 'hover:bg-orange-50',
  },
  Items: {
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    activeBg: 'bg-emerald-500',
    activeText: 'text-white',
    dotColor: 'bg-emerald-500',
    badgeBg: 'bg-emerald-100 text-emerald-700',
    hoverBg: 'hover:bg-emerald-50',
  },
  'Cash & Bank': {
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    activeBg: 'bg-cyan-500',
    activeText: 'text-white',
    dotColor: 'bg-cyan-400',
    badgeBg: 'bg-cyan-100 text-cyan-700',
    hoverBg: 'hover:bg-cyan-50',
  },
  Reports: {
    iconBg: 'bg-rose-50',
    iconColor: 'text-rose-500',
    activeBg: 'bg-rose-500',
    activeText: 'text-white',
    dotColor: 'bg-rose-400',
    badgeBg: 'bg-rose-100 text-rose-700',
    hoverBg: 'hover:bg-rose-50',
  },
  'Discount Configuration': {
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-600',
    activeBg: 'bg-indigo-600',
    activeText: 'text-white',
    dotColor: 'bg-indigo-500',
    badgeBg: 'bg-indigo-100 text-indigo-700',
    hoverBg: 'hover:bg-indigo-50',
  },
  Admin: {
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-600',
    activeBg: 'bg-slate-700',
    activeText: 'text-white',
    dotColor: 'bg-slate-500',
    badgeBg: 'bg-slate-100 text-slate-600',
    hoverBg: 'hover:bg-slate-100',
  },
}

interface AppSidebarProps {
  sidebarRef: React.RefObject<HTMLElement | null>
  sidebarExpanded: boolean
  mobileSidebarOpen: boolean
  setMobileSidebarOpen: (open: boolean) => void
  isHoveringsidebar: boolean
  activeView: string
  activeCompany: string
  activeFY: string
  safeStoredCompanies: string[]
  openGroups: Record<string, boolean>
  navGroups: NavGroup[]
  setActiveView: (view: string) => void
  setActiveCompany: (company: string) => void
  setActiveFY: (fy: string) => void
  setAddBusinessDialogOpen: (open: boolean) => void
  handleOpenEditBusiness: () => void
  handleGroupToggle: (groupTitle: string, isOpen: boolean) => void
  handleNavigate: (viewId: string, groupTitle: string) => void
  handleSingleEntityBackup: () => void
  handleMasterBackup: () => void
  handleSmartRestore: (e: React.ChangeEvent<HTMLInputElement>) => void
  canManageSystem: boolean
  onLogout?: () => void
  currentUser?: AuthenticatedUser | null
  metadataBusinesses?: { id: string; name: string }[]
}

export function AppSidebar({
  sidebarRef,
  sidebarExpanded,
  mobileSidebarOpen,
  setMobileSidebarOpen,
  isHoveringsidebar,
  activeView,
  activeCompany,
  activeFY,
  safeStoredCompanies,
  openGroups,
  navGroups,
  setActiveView,
  setActiveCompany,
  setActiveFY,
  setAddBusinessDialogOpen,
  handleOpenEditBusiness,
  handleGroupToggle,
  handleNavigate,
  handleSingleEntityBackup,
  handleMasterBackup,
  handleSmartRestore,
  canManageSystem,
  onLogout,
  currentUser,
  metadataBusinesses = [],
}: AppSidebarProps) {
  const isVisuallyExpanded = sidebarExpanded || isHoveringsidebar || mobileSidebarOpen

  const visibleCompanies = useMemo(() => {
    if (!currentUser || currentUser.role !== 'agent') return safeStoredCompanies
    const allowed = currentUser.allowedBusinesses || []
    if (allowed.length === 0) return safeStoredCompanies

    const allowedNames = (metadataBusinesses || [])
      .filter(b => allowed.includes(b.id) || allowed.includes(b.name))
      .map(b => b.name)

    if (allowedNames.length === 0) {
      return safeStoredCompanies.filter(c => allowed.includes(c))
    }

    return safeStoredCompanies.filter(c => allowedNames.includes(c))
  }, [safeStoredCompanies, currentUser, metadataBusinesses])

  return (
    <motion.aside
      ref={sidebarRef}
      initial={false}
      animate={{
        width: isVisuallyExpanded ? 268 : 72,
      }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 30,
        mass: 0.8,
      }}
      className={cn(
        'app-sidebar fixed inset-y-0 left-0 z-50 flex flex-col overflow-hidden',
        'bg-white border-r border-[#E8EAEF] shadow-[2px_0_12px_rgba(91,95,239,0.06)]',
        'md:relative md:z-auto shrink-0',
        mobileSidebarOpen && 'is-mobile-open',
        mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      )}
    >
      {/* ── Brand Header ── */}
      <div className="px-4 py-4 border-b border-[#E8EAEF] shrink-0">
        <div className="flex items-center gap-3">
          {/* Logo icon */}
          <div className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-[#5B5FEF] to-[#7C3AED] text-white flex items-center justify-center shadow-md shadow-[#5B5FEF]/30">
            <Bank className="h-5 w-5" weight="fill" />
          </div>

          <AnimatePresence mode="wait">
            {isVisuallyExpanded && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15 }}
                className="flex-1 min-w-0"
              >
                <h1 className="text-[15px] font-extrabold text-slate-900 tracking-tight leading-tight truncate" title={activeCompany}>
                  {activeCompany || 'SK ERP'}
                </h1>
                <p className="text-[10px] text-slate-400 font-medium leading-tight truncate">
                  Financial Management
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Company selector */}
        {isVisuallyExpanded && (
          <div className="mt-3 pt-3 border-t border-[#F1F3F9]">
            <div className="flex items-center gap-1">
              <select
                value={activeCompany}
                onChange={(e) => setActiveCompany(e.target.value)}
                disabled={visibleCompanies.length <= 1}
                className="flex-1 text-xs font-semibold text-slate-700 bg-[#F5F6FA] border border-[#E8EAEF] rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#5B5FEF]/30 truncate"
              >
                {visibleCompanies.map((company) => (
                  <option key={company} value={company}>
                    {company}
                  </option>
                ))}
              </select>
              {canManageSystem && (
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-slate-400 hover:text-[#5B5FEF] hover:bg-[#5B5FEF]/8 rounded-lg"
                    title="Add Business"
                    onClick={() => setAddBusinessDialogOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-slate-400 hover:text-[#5B5FEF] hover:bg-[#5B5FEF]/8 rounded-lg"
                    title="Edit Business"
                    onClick={handleOpenEditBusiness}
                  >
                    <Gear className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Navigation (Scrollable) ── */}
      <div className="flex-1 min-h-0 overflow-y-auto py-3 px-2.5">
        <nav className="space-y-0.5">

          {/* Dashboard */}
          <button
            onClick={() => setActiveView('dashboard')}
            title={!isVisuallyExpanded ? 'Dashboard' : undefined}
            className={cn(
              'w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-sm font-semibold transition-all text-left group',
              activeView === 'dashboard'
                ? 'bg-[#5B5FEF] text-white shadow-md shadow-[#5B5FEF]/25'
                : 'text-slate-600 hover:bg-[#5B5FEF]/8 hover:text-slate-900',
            )}
          >
            <div className={cn(
              'h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors',
              activeView === 'dashboard'
                ? 'bg-white/20 text-white'
                : 'bg-blue-50 text-blue-600 group-hover:bg-blue-100',
            )}>
              <SquaresFour className="h-4.5 w-4.5" weight="duotone" />
            </div>
            <AnimatePresence mode="wait">
              {isVisuallyExpanded && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1 }}
                  className="truncate"
                >
                  Dashboard
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          {/* Nav groups */}
          {navGroups.map((group) => {
            const isGroupOpen = openGroups[group.title] ?? true
            const theme = GROUP_THEMES[group.title] || GROUP_THEMES.Sales

            /* Collapsed sidebar — icon-only */
            if (!isVisuallyExpanded) {
              return (
                <div key={group.title} className="space-y-0.5 py-1">
                  {group.items.map((item) => {
                    const Icon = item.icon
                    const isActive = activeView === item.id
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleNavigate(item.id, group.title)}
                        title={item.label}
                        className={cn(
                          'w-full flex items-center justify-center p-2.5 rounded-xl transition-all',
                          isActive
                            ? `${theme.activeBg} ${theme.activeText} shadow-sm`
                            : `${theme.iconBg} ${theme.iconColor} opacity-80 hover:opacity-100 ${theme.hoverBg}`,
                        )}
                      >
                        <Icon className="h-4.5 w-4.5" weight="duotone" />
                      </button>
                    )
                  })}
                </div>
              )
            }

            /* Single-item group (no collapsible header) */
            if (group.isSingle) {
              const item = group.items[0]
              const Icon = item.icon
              const isActive = activeView === item.id
              return (
                <div key={group.title} className="py-0.5">
                  <button
                    onClick={() => handleNavigate(item.id, group.title)}
                    className={cn(
                      'w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-sm font-semibold transition-all text-left group',
                      isActive
                        ? `${theme.activeBg} ${theme.activeText} shadow-md shadow-[#5B5FEF]/20`
                        : `text-slate-600 ${theme.hoverBg} hover:text-slate-900`,
                    )}
                  >
                    <div className={cn(
                      'h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                      isActive
                        ? 'bg-white/20'
                        : `${theme.iconBg} ${theme.iconColor}`,
                    )}>
                      <Icon className="h-4 w-4" weight="duotone" />
                    </div>
                    <span className="truncate">{item.label}</span>
                  </button>
                </div>
              )
            }

            /* Collapsible group */
            return (
              <Collapsible
                key={group.title}
                open={isGroupOpen}
                onOpenChange={(open) => handleGroupToggle(group.title, open)}
                className="py-1"
              >
                {/* Group header */}
                {group.title !== 'Primary' && (
                  <CollapsibleTrigger className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold tracking-widest uppercase text-slate-400 hover:text-slate-700 transition-colors group/trigger">
                    <div className="flex items-center gap-2">
                      <span className={cn('h-1.5 w-1.5 rounded-full', theme.dotColor)} />
                      <span>{group.title}</span>
                      <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full font-bold', theme.badgeBg)}>
                        {group.items.length}
                      </span>
                    </div>
                    <CaretDown
                      className={cn(
                        'h-3 w-3 text-slate-300 group-hover/trigger:text-slate-500 transition-transform duration-200',
                        isGroupOpen ? 'rotate-0' : '-rotate-90',
                      )}
                    />
                  </CollapsibleTrigger>
                )}

                <CollapsibleContent className="space-y-0.5 mt-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon
                    const isActive = activeView === item.id
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleNavigate(item.id, group.title)}
                        className={cn(
                          'w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-sm font-medium transition-all text-left group/item',
                          isActive
                            ? `${theme.activeBg} ${theme.activeText} shadow-md shadow-[#5B5FEF]/20 font-semibold`
                            : `text-slate-600 ${theme.hoverBg} hover:text-slate-900`,
                        )}
                      >
                        <div className={cn(
                          'h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                          isActive
                            ? 'bg-white/20'
                            : `${theme.iconBg} ${theme.iconColor} group-hover/item:opacity-90`,
                        )}>
                          <Icon className="h-4 w-4" weight="duotone" />
                        </div>
                        <span className="truncate text-[13px]">{item.label}</span>
                      </button>
                    )
                  })}
                </CollapsibleContent>
              </Collapsible>
            )
          })}
        </nav>
      </div>

      {/* ── Bottom footer ── */}
      {isVisuallyExpanded && (
        <div className="p-4 border-t border-[#E8EAEF] bg-[#F5F6FA] space-y-2 shrink-0">
          {canManageSystem && (
            <>
              <p className="text-[10px] font-extrabold tracking-widest text-slate-400 uppercase px-1">
                Data Management
              </p>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={handleSingleEntityBackup}
                  title="Backup current business/year"
                  className="flex items-center justify-center gap-1.5 h-8 text-xs font-semibold rounded-xl border border-[#E8EAEF] bg-white text-slate-600 hover:bg-[#F1F3F9] hover:border-[#5B5FEF]/30 transition-all shadow-sm"
                >
                  <DownloadSimple className="w-3.5 h-3.5 text-slate-400" weight="bold" />
                  Single
                </button>

                <button
                  onClick={handleMasterBackup}
                  title="Full Master Backup"
                  className="flex items-center justify-center gap-1.5 h-8 text-xs font-semibold rounded-xl border border-[#E8EAEF] bg-white text-slate-600 hover:bg-[#F1F3F9] hover:border-[#5B5FEF]/30 transition-all shadow-sm"
                >
                  <Database className="w-3.5 h-3.5 text-slate-400" weight="bold" />
                  Master
                </button>
              </div>

              <div>
                <input
                  type="file"
                  id="sidebar-smart-restore"
                  accept=".json"
                  className="hidden"
                  onChange={handleSmartRestore}
                />
                <label
                  htmlFor="sidebar-smart-restore"
                  className="flex items-center justify-center gap-2 w-full h-9 rounded-xl text-xs font-semibold bg-[#5B5FEF]/10 border border-[#5B5FEF]/20 text-[#5B5FEF] hover:bg-[#5B5FEF]/15 cursor-pointer transition-all"
                >
                  <UploadSimple className="w-4 h-4" weight="bold" />
                  Restore Backup File
                </label>
              </div>
            </>
          )}

          {onLogout && (
            <button
              onClick={onLogout}
              className="flex items-center justify-center gap-2 w-full h-9 rounded-xl text-xs font-bold text-red-600 bg-red-50 border border-red-200/80 hover:bg-red-100 hover:border-red-300 transition-all shadow-sm"
              title="Logout / Switch Account"
            >
              <SignOut className="w-4 h-4 text-red-600" weight="bold" />
              Logout / Switch Account
            </button>
          )}
        </div>
      )}
    </motion.aside>
  )
}
