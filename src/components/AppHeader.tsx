import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import {
  Bell,
  MagnifyingGlass,
  List,
  User,
  Gear,
  Lock,
  Plus,
  CaretDown,
  SignOut,
  FileArrowUp,
  FileArrowDown,
  ArrowsClockwise,
} from '@phosphor-icons/react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useState, useMemo, useRef } from 'react'
import { toast } from 'sonner'

import { generateFYList } from '@/lib/calculations'
import {
  parseTallyPayments,
  parseTallyAccountingVouchersExcel,
  exportPaymentsToTallyExcel,
  generateSampleTallyExcel,
  PaymentVoucher,
  TallyImportResult,
} from '@/lib/tally-payment-excel'
import { parseTallyXmlVouchers, decodeXmlFileBuffer } from '@/lib/tally-xml-parser'
import { Payment, CustomerPayment, Supplier, Customer, Item, ExpenseType } from '@/lib/types'

interface AppHeaderProps {
  sidebarExpanded: boolean
  setSidebarExpanded: (expanded: boolean) => void
  mobileSidebarOpen: boolean
  setMobileSidebarOpen: (open: boolean) => void
  onLockApp: () => void
  activeView: string
  safeBusinessName: string
  safeCurrentFY: string
  setActiveFY?: (fy: string) => void
  safeIsLocked: boolean
  currentUserLabel: string
  currentUserRole: string
  setShortcutsDialogOpen: (open: boolean) => void
  onLogout?: () => void
  // Optional data props for Tally actions
  payments?: Payment[]
  customerPayments?: CustomerPayment[]
  suppliers?: Supplier[]
  customers?: Customer[]
  vouchers?: PaymentVoucher[]
  onImportTally?: (vouchers: PaymentVoucher[]) => void
  onExportTally?: () => void
  onOpenTallyExport?: () => void
  onOpenTallyImport?: () => void
}

// Map view IDs to human-readable titles
const VIEW_TITLES: Record<string, { title: string; sub: string }> = {
  dashboard: { title: 'Dashboard', sub: 'Your business at a glance' },
  sales: { title: 'Sales', sub: 'Invoices & revenue' },
  purchases: { title: 'Purchases', sub: 'Bills & expenses' },
  inventory: { title: 'Inventory', sub: 'Stock & items' },
  customers: { title: 'Customers', sub: 'Customer ledger' },
  suppliers: { title: 'Suppliers', sub: 'Supplier ledger' },
  payments: { title: 'Payments', sub: 'Receipts & payouts' },
  expenses: { title: 'Expenses', sub: 'Operational expenses' },
  reports: { title: 'Reports', sub: 'Analytics & insights' },
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
}

export function AppHeader({
  sidebarExpanded,
  setSidebarExpanded,
  mobileSidebarOpen,
  setMobileSidebarOpen,
  onLockApp,
  activeView,
  safeBusinessName,
  safeCurrentFY,
  setActiveFY,
  safeIsLocked,
  currentUserLabel,
  currentUserRole,
  setShortcutsDialogOpen,
  onLogout,
  payments = [],
  customerPayments = [],
  suppliers = [],
  customers = [],
  vouchers,
  onImportTally,
  onExportTally,
  onOpenTallyExport,
  onOpenTallyImport,
}: AppHeaderProps) {
  const viewMeta = VIEW_TITLES[activeView] ?? {
    title: activeView.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    sub: safeBusinessName,
  }
  const initials = getInitials(currentUserLabel || 'Master Admin')
  const fyOptions = useMemo(() => generateFYList(2015, 2040, safeCurrentFY), [safeCurrentFY])

  const [isImporting, setIsImporting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 1. Handle Import Tally Excel / XML
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const file = files[0]
    const isXml = file.name.toLowerCase().endsWith('.xml')
    const validExtensions = ['.xml', '.xlsx', '.xls', '.csv']
    const hasValidExt = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext))

    if (!hasValidExt) {
      toast.error('Invalid file format. Please upload an XML (.xml), Excel (.xlsx, .xls) or CSV file.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setIsImporting(true)
    try {
      if (isXml) {
        const buffer = await file.arrayBuffer()
        const text = decodeXmlFileBuffer(buffer)
        const xmlResult = parseTallyXmlVouchers(text, { customers, suppliers })
        if (xmlResult.success && xmlResult.vouchers.length > 0) {
          const paymentVouchers: PaymentVoucher[] = xmlResult.vouchers
            .filter(v => v.normalizedType === 'payment' || v.normalizedType === 'receipt')
            .map((v, idx) => ({
              id: v.id || `xml-vch-${idx}`,
              voucherNumber: v.voucherNumber,
              voucherDate: v.voucherDate,
              displayDate: v.displayDate,
              type: v.normalizedType === 'payment' ? 'PAYMENT' : 'RECEIPT',
              partyLedger: v.partyName,
              bankCashLedger: v.legs.find(l => l.ledgerName !== v.partyName)?.ledgerName || 'Bank Account',
              amount: v.totalAmount,
              status: v.isBalanced ? 'valid' : 'warning',
              isValid: v.isBalanced
            }))

          toast.success(
            `Imported ${xmlResult.summary.totalParsed} Tally XML voucher(s) (${xmlResult.summary.salesCount} Sales, ${xmlResult.summary.purchaseCount} Purchases, ${xmlResult.summary.paymentCount} Payments, ${xmlResult.summary.receiptCount} Receipts)`
          )
          if (paymentVouchers.length > 0) {
            onImportTally?.(paymentVouchers)
          }
        } else {
          toast.error(xmlResult.errors[0] || 'No valid vouchers found in uploaded XML file')
        }
      } else {
        const arrayBuffer = await file.arrayBuffer()
        const excelResult = parseTallyAccountingVouchersExcel(arrayBuffer, { customers, suppliers })

        if (excelResult.success && excelResult.vouchers.length > 0) {
          const paymentVouchers: PaymentVoucher[] = excelResult.vouchers
            .filter(v => v.normalizedType === 'payment' || v.normalizedType === 'receipt')
            .map((v, idx) => ({
              id: v.id || `excel-vch-${idx}`,
              voucherNumber: v.voucherNumber,
              voucherDate: v.voucherDate,
              displayDate: v.displayDate,
              type: v.normalizedType === 'payment' ? 'PAYMENT' : 'RECEIPT',
              partyLedger: v.partyName,
              bankCashLedger: v.legs.find(l => l.ledgerName !== v.partyName)?.ledgerName || 'Bank Account',
              amount: v.totalAmount,
              status: v.isBalanced ? 'valid' : 'warning',
              isValid: v.isBalanced
            }))

          toast.success(
            `Imported ${excelResult.vouchers.length} Tally voucher(s) from Excel (${excelResult.summary.salesCount} Sales, ${excelResult.summary.purchaseCount} Purchases, ${excelResult.summary.paymentCount} Payments, ${excelResult.summary.receiptCount} Receipts)`
          )
          if (paymentVouchers.length > 0) {
            onImportTally?.(paymentVouchers)
          }
        } else {
          toast.error(excelResult.errors[0] || 'No valid vouchers found in the uploaded Excel file')
        }
      }
    } catch (err: any) {
      console.error('Tally import error:', err)
      toast.error(`Import failed: ${err?.message || 'Error processing file'}`)
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // 2. Handle Export Tally Excel
  const handleExportTally = () => {
    if (onExportTally) {
      onExportTally()
      return
    }

    setIsExporting(true)
    try {
      let exportList: PaymentVoucher[] = []

      // If explicit vouchers were passed
      if (vouchers && vouchers.length > 0) {
        exportList = vouchers.filter(v => v.isValid !== false && v.status !== 'error')
      } else {
        // Map ERP Payments (Suppliers) & CustomerPayments (Customers) into Tally vouchers
        const supplierMap = new Map(suppliers.map(s => [s.id, s]))
        const customerMap = new Map(customers.map(c => [c.id, c]))

        const paymentVouchers: PaymentVoucher[] = (payments || []).map((p, idx) => {
          const sup = supplierMap.get(p.supplierId)
          return {
            id: p.id || `pay-${idx}`,
            voucherNumber: `PAY-${p.paymentDate?.replace(/-/g, '') || '000'}-${idx + 1}`,
            voucherDate: p.paymentDate || new Date().toISOString().split('T')[0],
            type: 'PAYMENT',
            partyLedger: sup?.name || 'Supplier Account',
            bankCashLedger: p.counterName || 'Bank/Cash Account',
            amount: p.amount || 0,
            address: [sup?.address, sup?.city, sup?.state].filter(Boolean).join(', ') || undefined,
            pincode: sup?.pincode || undefined,
            status: 'valid',
            isValid: true,
          }
        })

        const receiptVouchers: PaymentVoucher[] = (customerPayments || []).map((cp, idx) => {
          const cust = customerMap.get(cp.customerId)
          return {
            id: cp.id || `rec-${idx}`,
            voucherNumber: `REC-${cp.paymentDate?.replace(/-/g, '') || '000'}-${idx + 1}`,
            voucherDate: cp.paymentDate || new Date().toISOString().split('T')[0],
            type: 'RECEIPT',
            partyLedger: cust?.name || 'Customer Account',
            bankCashLedger: cp.counterName || 'Bank/Cash Account',
            amount: cp.amount || 0,
            address: [cust?.address, cust?.city, cust?.state].filter(Boolean).join(', ') || undefined,
            pincode: cust?.pincode || undefined,
            status: 'valid',
            isValid: true,
          }
        })

        exportList = [...paymentVouchers, ...receiptVouchers]
      }

      if (exportList.length === 0) {
        toast.info('No payment records found. Generating sample Tally template...')
        generateSampleTallyExcel(`Tally_Sample_Template_${Date.now()}.xlsx`)
        toast.success('Sample Tally Excel template downloaded')
      } else {
        const filename = `Tally_Payments_Export_${Date.now()}.xlsx`
        exportPaymentsToTallyExcel(exportList, { filename })
        toast.success(`Exported ${exportList.length} Tally voucher(s) to ${filename}`)
      }
    } catch (err: any) {
      console.error('Tally export error:', err)
      toast.error(`Export failed: ${err?.message || 'Unknown error'}`)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <header className="app-header h-16 bg-white border-b border-[#E8EAEF] px-4 md:px-6 flex items-center justify-between z-30 shrink-0 shadow-[0_1px_4px_rgba(91,95,239,0.06)]">
      {/* Hidden File Input for Tally Import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xml, .xlsx, .xls, .csv, text/xml, application/xml"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* ── Left: hamburger + page title ── */}
      <div className="flex items-center gap-3">
        {/* Mobile hamburger */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
          className="h-9 w-9 text-slate-500 md:hidden hover:bg-slate-100 rounded-xl"
          aria-label="Toggle navigation"
        >
          <List className="h-5 w-5" weight="bold" />
        </Button>

        {/* Desktop collapse */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarExpanded(!sidebarExpanded)}
          className="h-9 w-9 text-slate-500 hidden md:flex hover:bg-[#F1F3F9] rounded-xl"
          title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <List className="h-5 w-5" weight="bold" />
        </Button>

        {/* Page title + subtitle */}
        <motion.div
          key={activeView}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="hidden sm:flex flex-col"
        >
          <h1 className="text-[17px] font-extrabold text-slate-900 leading-tight tracking-tight">
            {viewMeta.title}
          </h1>
          <p className="text-[11px] text-slate-400 font-medium leading-none">
            {viewMeta.sub}
          </p>
        </motion.div>
      </div>

      {/* ── Center: search bar ── */}
      <div className="hidden md:flex items-center flex-1 max-w-md mx-6">
        <div className="relative w-full">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            readOnly
            onClick={() => setShortcutsDialogOpen(true)}
            placeholder="Search anything..."
            className="w-full h-9 pl-9 pr-16 text-sm text-slate-500 bg-[#F5F6FA] border border-[#E8EAEF] rounded-xl outline-none cursor-pointer hover:border-[#5B5FEF]/40 transition-colors placeholder:text-slate-400"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
            <kbd className="text-[10px] font-bold text-slate-400 bg-white border border-[#E8EAEF] rounded-md px-1.5 py-0.5 shadow-sm">⌘</kbd>
            <kbd className="text-[10px] font-bold text-slate-400 bg-white border border-[#E8EAEF] rounded-md px-1.5 py-0.5 shadow-sm">K</kbd>
          </span>
        </div>
      </div>

      {/* ── Right: controls ── */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Locked badge */}
        {safeIsLocked && (
          <span className="hidden sm:inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-xs font-semibold px-2.5 py-1 rounded-full border border-amber-200">
            <Lock className="h-3.5 w-3.5" weight="fill" />
            Read Only
          </span>
        )}

        {/* ── Tally Action Buttons (Immediately to the LEFT of Bell Icon) ── */}
        <div className="flex items-center gap-1.5">
          {/* Import Tally Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (onOpenTallyImport) {
                onOpenTallyImport()
              } else {
                fileInputRef.current?.click()
              }
            }}
            disabled={isImporting}
            className="h-8 px-2 sm:px-2.5 text-xs font-semibold text-slate-700 hover:text-[#5B5FEF] hover:bg-[#5B5FEF]/8 border-[#E8EAEF] rounded-xl shadow-2xs transition-all gap-1 cursor-pointer"
            title="Import Tally Excel Vouchers"
          >
            {isImporting ? (
              <ArrowsClockwise className="h-3.5 w-3.5 animate-spin text-[#5B5FEF]" />
            ) : (
              <FileArrowUp className="h-3.5 w-3.5 text-[#5B5FEF]" weight="bold" />
            )}
            <span className="hidden sm:inline text-[11px]">Import Tally</span>
          </Button>

          {/* Export Tally Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (onOpenTallyExport) {
                onOpenTallyExport()
              } else {
                handleExportTally()
              }
            }}
            disabled={isExporting}
            className="h-8 px-2 sm:px-2.5 text-xs font-semibold text-slate-700 hover:text-emerald-700 hover:bg-emerald-50 border-[#E8EAEF] rounded-xl shadow-2xs transition-all gap-1 cursor-pointer"
            title="Export Tally Excel Vouchers"
          >
            {isExporting ? (
              <ArrowsClockwise className="h-3.5 w-3.5 animate-spin text-emerald-600" />
            ) : (
              <FileArrowDown className="h-3.5 w-3.5 text-emerald-600" weight="bold" />
            )}
            <span className="hidden sm:inline text-[11px]">Export Tally</span>
          </Button>
        </div>

        {/* Notification bell */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-slate-500 hover:bg-[#F1F3F9] rounded-xl relative"
          title="Notifications"
        >
          <Bell className="h-4.5 w-4.5" weight="bold" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[#5B5FEF] ring-2 ring-white" />
        </Button>

        {/* Settings / shortcuts */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShortcutsDialogOpen(true)}
          className="h-9 w-9 text-slate-500 hover:bg-[#F1F3F9] rounded-xl"
          title="Shortcuts & settings"
        >
          <Gear className="h-4.5 w-4.5" weight="bold" />
        </Button>

        {/* Divider */}
        <div className="h-6 w-px bg-[#E8EAEF] mx-0.5 hidden sm:block" />

        {/* User avatar pill with Logout option */}
        <div
          onClick={onLogout}
          title="Click to Logout / Switch Account"
          className="flex items-center gap-2 bg-[#F5F6FA] border border-[#E8EAEF] rounded-xl px-2.5 py-1.5 cursor-pointer hover:bg-red-50 hover:border-red-200 group transition-all"
        >
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-[#5B5FEF] to-[#7C3AED] text-white flex items-center justify-center text-[11px] font-extrabold shadow-sm group-hover:from-red-500 group-hover:to-red-600 transition-all">
            {initials || <User className="h-3.5 w-3.5" weight="bold" />}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[12px] font-bold text-slate-900 leading-tight truncate max-w-[100px] group-hover:text-red-700">
              {currentUserLabel || 'Master Admin'}
            </span>
            <span className="text-[10px] text-slate-400 font-medium leading-tight capitalize group-hover:text-red-500">
              {currentUserRole || 'Administrator'}
            </span>
          </div>
        </div>

        {/* Dedicated Logout button for fast one-click exit */}
        {onLogout && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onLogout}
            className="h-9 w-9 text-red-500 hover:bg-red-100 hover:text-red-700 rounded-xl transition-all"
            title="Logout / Switch Account"
          >
            <SignOut className="h-4.5 w-4.5" weight="bold" />
          </Button>
        )}

        {/* Quick Action button */}
        <Button
          className="hidden sm:inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-[#5B5FEF] hover:bg-[#4A4ED8] text-white text-xs font-bold shadow-md shadow-[#5B5FEF]/25 transition-all"
          title="Quick action"
        >
          <Plus className="h-4 w-4" weight="bold" />
          <span>Quick Action</span>
        </Button>
      </div>
    </header>
  )
}

export default AppHeader
