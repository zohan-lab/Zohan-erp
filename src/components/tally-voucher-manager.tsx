import React, { useState, useRef, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileArrowUp,
  FileArrowDown,
  DownloadSimple,
  ArrowsClockwise,
  CheckCircle,
  WarningCircle,
  WarningOctagon,
  MagnifyingGlass,
  FunnelSimple,
  Trash,
  CaretDown,
  CaretUp,
  ArrowBendDownRight,
  Sparkle,
  FileXls,
  CreditCard,
  Receipt,
  ArrowsLeftRight,
  DotsThreeVertical,
  X
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  parseTallyPayments,
  exportPaymentsToTallyExcel,
  generateSampleTallyExcel,
  PaymentVoucher,
  TallyImportResult,
  TallyVoucherType
} from '@/lib/tally-payment-excel'
import { formatCurrency } from '@/lib/calculations'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface TallyVoucherManagerProps {
  onImportToERP?: (vouchers: PaymentVoucher[]) => void
  className?: string
  defaultVouchers?: PaymentVoucher[]
}

export function TallyVoucherManager({
  onImportToERP,
  className,
  defaultVouchers
}: TallyVoucherManagerProps) {
  const [vouchers, setVouchers] = useState<PaymentVoucher[]>(defaultVouchers || [])
  const [errors, setErrors] = useState<string[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [fileName, setFileName] = useState<string | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({})

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'ALL' | TallyVoucherType>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'VALID' | 'ISSUES'>('ALL')

  const fileInputRef = useRef<HTMLInputElement>(null)

  // 1. Process Excel/CSV File
  const processFile = useCallback(async (file: File) => {
    const validExtensions = ['.xlsx', '.xls', '.csv']
    const hasValidExt = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext))

    if (!hasValidExt) {
      toast.error('Invalid file format. Please upload an Excel (.xlsx, .xls) or CSV file.')
      return
    }

    setIsParsing(true)
    setFileName(file.name)

    try {
      const arrayBuffer = await file.arrayBuffer()
      const result: TallyImportResult = parseTallyPayments(arrayBuffer)

      setVouchers(result.data)
      setErrors(result.errors)
      setWarnings(result.warnings)

      if (result.success && result.data.length > 0) {
        toast.success(`Imported ${result.data.length} Tally voucher(s) successfully`)
      } else if (result.data.length > 0) {
        toast.warning(
          `Imported ${result.data.length} voucher(s) with ${result.errors.length} validation issue(s)`
        )
      } else {
        toast.error(result.errors[0] || 'No valid Payment/Receipt vouchers found in file')
      }
    } catch (err: any) {
      console.error('File parsing error:', err)
      toast.error(`Error reading file: ${err?.message || 'Unknown error'}`)
      setErrors([`File read error: ${err?.message || 'Corrupted or unsupported file'}`])
    } finally {
      setIsParsing(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }, [])

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0])
    }
  }

  // 2. Load Demo Sample Data
  const handleLoadDemoData = () => {
    const demoVouchers: PaymentVoucher[] = [
      {
        id: 'demo-1',
        voucherNumber: 'PAY-2026-001',
        voucherDate: '2026-04-02',
        displayDate: '02-04-2026',
        type: 'PAYMENT',
        partyLedger: 'Tata Steel Processing Ltd',
        bankCashLedger: 'HDFC Bank Ltd (Current A/c)',
        amount: 450000,
        address: 'Plot 42, Industrial Area, Jamshedpur',
        pincode: '831001',
        status: 'valid',
        isValid: true
      },
      {
        id: 'demo-2',
        voucherNumber: 'PAY-2026-002',
        voucherDate: '2026-04-05',
        displayDate: '05-04-2026',
        type: 'PAYMENT',
        partyLedger: 'JSW Steel Processing Co',
        bankCashLedger: 'State Bank of India (Cash Credit)',
        amount: 1250000,
        address: 'Bandra Kurla Complex, Mumbai',
        pincode: '400051',
        status: 'valid',
        isValid: true
      },
      {
        id: 'demo-3',
        voucherNumber: 'REC-2026-001',
        voucherDate: '2026-04-08',
        displayDate: '08-04-2026',
        type: 'RECEIPT',
        partyLedger: 'Metro Infrastructure Corp',
        bankCashLedger: 'HDFC Bank Ltd (Current A/c)',
        amount: 875000,
        address: 'Salt Lake Sector V, Kolkata',
        pincode: '700091',
        status: 'valid',
        isValid: true
      },
      {
        id: 'demo-4',
        voucherNumber: 'REC-2026-002',
        voucherDate: '2026-04-10',
        displayDate: '10-04-2026',
        type: 'RECEIPT',
        partyLedger: 'Apex Building Solutions',
        bankCashLedger: 'Main Cash Counter',
        amount: 45000,
        address: 'GIDC Industrial Estate, Ahmedabad',
        pincode: '382445',
        status: 'valid',
        isValid: true
      },
      {
        id: 'demo-5',
        voucherNumber: 'CNT-2026-001',
        voucherDate: '2026-04-12',
        displayDate: '12-04-2026',
        type: 'CONTRA',
        partyLedger: 'HDFC Bank Ltd (Current A/c)',
        bankCashLedger: 'Main Cash Counter',
        amount: 100000,
        address: 'Petty cash bank withdrawal',
        status: 'valid',
        isValid: true
      }
    ]

    setVouchers(demoVouchers)
    setErrors([])
    setWarnings([])
    setFileName('Demo_Tally_Vouchers.xlsx')
    toast.success('Loaded 5 demo vouchers')
  }

  // Clear data
  const handleClear = () => {
    setVouchers([])
    setErrors([])
    setWarnings([])
    setFileName(null)
    setExpandedRows({})
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Toggle row expansion for double-entry breakdown
  const toggleRow = (id: string) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }))
  }

  // 3. Filtered vouchers dataset
  const filteredVouchers = useMemo(() => {
    return vouchers.filter(v => {
      // Type Filter
      if (typeFilter !== 'ALL' && v.type !== typeFilter) return false

      // Status Filter
      if (statusFilter === 'VALID' && (v.status !== 'valid' || v.isValid === false)) return false
      if (statusFilter === 'ISSUES' && v.status === 'valid' && v.isValid !== false) return false

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchNo = v.voucherNumber.toLowerCase().includes(q)
        const matchParty = v.partyLedger.toLowerCase().includes(q)
        const matchBank = v.bankCashLedger.toLowerCase().includes(q)
        const matchDate = (v.displayDate || v.voucherDate).toLowerCase().includes(q)
        const matchAddress = (v.address || '').toLowerCase().includes(q)
        if (!matchNo && !matchParty && !matchBank && !matchDate && !matchAddress) {
          return false
        }
      }

      return true
    })
  }, [vouchers, typeFilter, statusFilter, searchQuery])

  // Filter-Aware Valid Export list
  const filteredValidVouchers = useMemo(() => {
    return filteredVouchers.filter(v => v.isValid !== false && v.status !== 'error')
  }, [filteredVouchers])

  const filteredValidCount = filteredValidVouchers.length

  // 4. Filter-Aware Export Action
  const handleExportFiltered = () => {
    if (filteredValidCount === 0) {
      toast.error('No valid filtered vouchers available to export.')
      return
    }

    try {
      const filename = `Tally_Payments_Export_${Date.now()}.xlsx`
      exportPaymentsToTallyExcel(filteredValidVouchers, { filename })
      toast.success(`Exported ${filteredValidCount} filtered voucher(s) to ${filename}`)
    } catch (err: any) {
      toast.error(`Export failed: ${err?.message || 'Unknown error'}`)
    }
  }

  // Download Sample Template
  const handleDownloadSample = () => {
    try {
      generateSampleTallyExcel('Tally_Payment_Receipt_Sample.xlsx')
      toast.success('Sample Tally Excel template downloaded')
    } catch (err: any) {
      toast.error(`Failed to download template: ${err?.message || 'Unknown error'}`)
    }
  }

  // Summary Metrics
  const summary = useMemo(() => {
    const totalVouchers = vouchers.length
    const paymentList = filteredVouchers.filter(v => v.type === 'PAYMENT' && v.status !== 'error')
    const receiptList = filteredVouchers.filter(v => v.type === 'RECEIPT' && v.status !== 'error')
    const contraList = filteredVouchers.filter(v => v.type === 'CONTRA' && v.status !== 'error')

    const totalPaymentAmount = paymentList.reduce((sum, v) => sum + v.amount, 0)
    const totalReceiptAmount = receiptList.reduce((sum, v) => sum + v.amount, 0)
    const totalContraAmount = contraList.reduce((sum, v) => sum + v.amount, 0)

    const validCount = filteredVouchers.filter(v => v.status === 'valid' && v.isValid !== false).length
    const issuesCount = filteredVouchers.filter(v => v.status !== 'valid' || v.isValid === false).length

    return {
      totalVouchers,
      filteredTotal: filteredVouchers.length,
      paymentCount: paymentList.length,
      receiptCount: receiptList.length,
      contraCount: contraList.length,
      totalPaymentAmount,
      totalReceiptAmount,
      totalContraAmount,
      validCount,
      issuesCount
    }
  }, [vouchers, filteredVouchers])

  return (
    <div className={cn('space-y-4', className)}>
      {/* Hidden File Input for Import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx, .xls, .csv"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* ── Top Summary Header / Status Banner ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 shrink-0">
            <FileXls className="h-6 w-6" weight="duotone" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 leading-tight">
              Tally Payment & Receipt Vouchers
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Double-entry 2-row Excel import & export matching Tally Prime / ERP 9 format
            </p>
          </div>
        </div>

        {/* Compact File Indicator & Secondary Actions */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {fileName && (
            <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 text-xs py-1 px-2.5 gap-1.5">
              <FileXls className="h-3.5 w-3.5 text-indigo-600" />
              <span className="truncate max-w-[180px]">{fileName}</span>
            </Badge>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-500 hover:text-slate-700">
                <DotsThreeVertical className="h-4 w-4" weight="bold" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 text-xs">
              <DropdownMenuItem onClick={handleDownloadSample} className="cursor-pointer">
                <DownloadSimple className="h-3.5 w-3.5 mr-2 text-indigo-500" />
                Download Sample Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLoadDemoData} className="cursor-pointer">
                <Sparkle className="h-3.5 w-3.5 mr-2 text-emerald-500" />
                Load Demo Vouchers
              </DropdownMenuItem>
              {onImportToERP && vouchers.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onImportToERP(filteredValidVouchers)}
                    className="cursor-pointer text-emerald-700 focus:text-emerald-800"
                  >
                    <CheckCircle className="h-3.5 w-3.5 mr-2 text-emerald-600" />
                    Import Filtered to ERP ({filteredValidCount})
                  </DropdownMenuItem>
                </>
              )}
              {vouchers.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleClear} className="cursor-pointer text-rose-600 focus:text-rose-700">
                    <Trash className="h-3.5 w-3.5 mr-2" />
                    Clear All Vouchers
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── MAIN SEARCH, FILTER & ACTION TOOLBAR (Unified Row) ── */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Left / Center: Search & Filter Controls */}
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
            {/* Search Input */}
            <div className="relative w-full sm:w-64 min-w-[200px]">
              <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Search party, bank, voucher..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 text-xs h-8 bg-slate-50/70 border-slate-200 rounded-lg focus-visible:bg-white"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Type Filter Pills */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setTypeFilter('ALL')}
                className={cn(
                  'px-2.5 py-1 rounded-md font-medium text-[11px] transition-all',
                  typeFilter === 'ALL'
                    ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                )}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('PAYMENT')}
                className={cn(
                  'px-2.5 py-1 rounded-md font-medium text-[11px] transition-all',
                  typeFilter === 'PAYMENT'
                    ? 'bg-white text-violet-700 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-violet-700'
                )}
              >
                Payment
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('RECEIPT')}
                className={cn(
                  'px-2.5 py-1 rounded-md font-medium text-[11px] transition-all',
                  typeFilter === 'RECEIPT'
                    ? 'bg-white text-emerald-700 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-emerald-700'
                )}
              >
                Receipt
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('CONTRA')}
                className={cn(
                  'px-2.5 py-1 rounded-md font-medium text-[11px] transition-all',
                  typeFilter === 'CONTRA'
                    ? 'bg-white text-amber-700 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-amber-700'
                )}
              >
                Contra
              </button>
            </div>

            {/* Status Filter Pills */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                className={cn(
                  'px-2.5 py-1 rounded-md font-medium text-[11px] transition-all',
                  statusFilter === 'ALL'
                    ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                )}
              >
                All Status
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('VALID')}
                className={cn(
                  'px-2.5 py-1 rounded-md font-medium text-[11px] transition-all',
                  statusFilter === 'VALID'
                    ? 'bg-white text-emerald-700 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-emerald-700'
                )}
              >
                Valid Only
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('ISSUES')}
                className={cn(
                  'px-2.5 py-1 rounded-md font-medium text-[11px] transition-all',
                  statusFilter === 'ISSUES'
                    ? 'bg-white text-rose-700 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-rose-700'
                )}
              >
                Issues ({errors.length + vouchers.filter(v => v.status === 'error').length})
              </button>
            </div>
          </div>

          {/* Right: Import Tally & Filter-Aware Export Action Buttons */}
          <div className="flex items-center gap-2 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
            {/* Import Tally Button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isParsing}
              className="h-8 text-xs font-semibold text-slate-700 hover:text-indigo-600 hover:bg-indigo-50/60 border-slate-200"
            >
              {isParsing ? (
                <ArrowsClockwise className="h-3.5 w-3.5 mr-1.5 animate-spin text-indigo-600" />
              ) : (
                <FileArrowUp className="h-3.5 w-3.5 mr-1.5 text-indigo-600" weight="bold" />
              )}
              Import Tally
            </Button>

            {/* Filter-Aware Export Button */}
            <Button
              type="button"
              size="sm"
              onClick={handleExportFiltered}
              disabled={filteredValidCount === 0}
              className={cn(
                'h-8 text-xs font-semibold shadow-2xs transition-all',
                filteredValidCount > 0
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer'
                  : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed hover:bg-slate-100'
              )}
            >
              <FileArrowDown className="h-3.5 w-3.5 mr-1.5" weight="bold" />
              Export Filtered ({filteredValidCount}) to Tally
            </Button>
          </div>
        </div>
      </div>

      {/* ── Error & Warning Alert Banner ── */}
      <AnimatePresence>
        {(errors.length > 0 || warnings.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="space-y-2"
          >
            {errors.length > 0 && (
              <div className="bg-rose-50 border border-rose-200/80 rounded-xl p-3.5 text-rose-900 text-xs">
                <div className="flex items-center justify-between font-semibold text-rose-800 mb-1">
                  <div className="flex items-center gap-1.5">
                    <WarningOctagon className="h-4 w-4 text-rose-600" weight="fill" />
                    <span>Validation Issues Detected ({errors.length})</span>
                  </div>
                  <span className="text-[11px] text-rose-600 font-normal">
                    Invalid entries will be excluded from Tally Export
                  </span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-rose-700 max-h-28 overflow-y-auto text-[11px]">
                  {errors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3.5 text-amber-900 text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-amber-800 mb-1">
                  <WarningCircle className="h-4 w-4 text-amber-600" weight="fill" />
                  <span>Warnings ({warnings.length})</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-amber-700 max-h-24 overflow-y-auto text-[11px]">
                  {warnings.map((warn, idx) => (
                    <li key={idx}>{warn}</li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Summary Stat KPI Cards ── */}
      {vouchers.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-slate-200/80 shadow-2xs bg-white">
            <CardContent className="p-3.5 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                  Filtered Vouchers
                </p>
                <h3 className="text-xl font-bold text-slate-900 mt-0.5">
                  {summary.filteredTotal} <span className="text-xs font-normal text-slate-400">/ {summary.totalVouchers}</span>
                </h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] text-emerald-600 font-medium">{summary.validCount} valid</span>
                  {summary.issuesCount > 0 && (
                    <span className="text-[10px] text-rose-600 font-medium">· {summary.issuesCount} issues</span>
                  )}
                </div>
              </div>
              <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                <Receipt className="h-4.5 w-4.5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 shadow-2xs bg-white">
            <CardContent className="p-3.5 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold text-violet-600 uppercase tracking-wider">
                  Filtered Payments
                </p>
                <h3 className="text-xl font-bold text-violet-700 mt-0.5">
                  {formatCurrency(summary.totalPaymentAmount)}
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {summary.paymentCount} voucher(s)
                </p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center text-violet-600">
                <CreditCard className="h-4.5 w-4.5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 shadow-2xs bg-white">
            <CardContent className="p-3.5 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider">
                  Filtered Receipts
                </p>
                <h3 className="text-xl font-bold text-emerald-700 mt-0.5">
                  {formatCurrency(summary.totalReceiptAmount)}
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {summary.receiptCount} voucher(s)
                </p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                <FileArrowDown className="h-4.5 w-4.5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 shadow-2xs bg-white">
            <CardContent className="p-3.5 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider">
                  Contra / Transfers
                </p>
                <h3 className="text-xl font-bold text-amber-700 mt-0.5">
                  {formatCurrency(summary.totalContraAmount)}
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {summary.contraCount} voucher(s)
                </p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                <ArrowsLeftRight className="h-4.5 w-4.5" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Table or Empty State ── */}
      {vouchers.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200/80 p-8 text-center shadow-2xs">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3">
            <FileXls className="h-6 w-6" weight="duotone" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">No Tally Vouchers Loaded</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
            Click "Import Tally" in the toolbar above to upload an Excel voucher sheet, or load sample demo vouchers.
          </p>
          <div className="flex items-center justify-center gap-2.5">
            <Button
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <FileArrowUp className="h-3.5 w-3.5 mr-1.5" />
              Import Tally Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadDemoData}
              className="text-xs font-medium text-slate-700 border-slate-200 hover:bg-slate-50"
            >
              <Sparkle className="h-3.5 w-3.5 mr-1.5 text-emerald-500" />
              Load Demo Vouchers
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden">
          {/* Table View */}
          <div className="overflow-x-auto max-h-[500px]">
            <Table>
              <TableHeader className="bg-slate-50/80 sticky top-0 z-10">
                <TableRow className="border-b border-slate-200">
                  <TableHead className="w-8"></TableHead>
                  <TableHead className="text-xs font-semibold text-slate-700">Voucher No & Date</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-700">Type</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-700">Party Ledger</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-700">Bank / Cash Account</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-700 text-right">Amount (₹)</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-700 text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVouchers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-slate-400 text-xs">
                      No vouchers match the current search or filter criteria.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredVouchers.map(v => {
                    const isExpanded = !!expandedRows[v.id]
                    return (
                      <React.Fragment key={v.id}>
                        <TableRow
                          onClick={() => toggleRow(v.id)}
                          className={cn(
                            'cursor-pointer hover:bg-slate-50/80 transition-colors border-b border-slate-100',
                            isExpanded && 'bg-indigo-50/20'
                          )}
                        >
                          <TableCell className="py-2.5 px-2 text-center text-slate-400">
                            {isExpanded ? (
                              <CaretUp className="h-3.5 w-3.5 inline" />
                            ) : (
                              <CaretDown className="h-3.5 w-3.5 inline" />
                            )}
                          </TableCell>

                          <TableCell className="py-2.5 font-medium text-xs text-slate-900">
                            <div className="font-semibold">{v.voucherNumber}</div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {v.displayDate || v.voucherDate}
                            </div>
                          </TableCell>

                          <TableCell className="py-2.5">
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 border',
                                v.type === 'PAYMENT' && 'bg-violet-50 text-violet-700 border-violet-200',
                                v.type === 'RECEIPT' && 'bg-emerald-50 text-emerald-700 border-emerald-200',
                                v.type === 'CONTRA' && 'bg-amber-50 text-amber-700 border-amber-200'
                              )}
                            >
                              {v.type}
                            </Badge>
                          </TableCell>

                          <TableCell className="py-2.5 text-xs text-slate-800">
                            <div className="font-medium">{v.partyLedger}</div>
                            {(v.address || v.pincode) && (
                              <div className="text-[11px] text-slate-400 truncate max-w-xs mt-0.5">
                                {[v.address, v.pincode].filter(Boolean).join(', ')}
                              </div>
                            )}
                          </TableCell>

                          <TableCell className="py-2.5 text-xs text-slate-700 font-medium">
                            {v.bankCashLedger}
                          </TableCell>

                          <TableCell className="py-2.5 text-xs font-bold text-slate-900 text-right">
                            {formatCurrency(v.amount)}
                          </TableCell>

                          <TableCell className="py-2.5 text-center">
                            {v.status === 'valid' && v.isValid !== false ? (
                              <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold">
                                Valid
                              </Badge>
                            ) : v.status === 'warning' ? (
                              <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-semibold">
                                Warning
                              </Badge>
                            ) : (
                              <Badge className="bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-semibold">
                                Error
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>

                        {/* ── Expanded Double-Entry Breakdown ── */}
                        {isExpanded && (
                          <TableRow className="bg-slate-50/60 border-b border-slate-200">
                            <TableCell colSpan={7} className="p-3.5">
                              <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-2xs space-y-2.5">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                                    <ArrowBendDownRight className="h-3.5 w-3.5 text-indigo-600" />
                                    <span>Tally Double-Entry Journal Legs (2 Rows)</span>
                                  </div>
                                  <span className="text-[10px] text-slate-400">
                                    Key: {v.type}_{v.voucherNumber}_{v.voucherDate}
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
                                  {/* Debit Leg */}
                                  <div className="bg-emerald-50/40 border border-emerald-200/70 rounded-lg p-2.5">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="font-bold text-emerald-800 uppercase tracking-wider text-[10px]">
                                        Debit (Dr) Leg
                                      </span>
                                      <span className="font-bold text-emerald-700">
                                        {formatCurrency(v.amount)}
                                      </span>
                                    </div>
                                    <p className="font-semibold text-slate-900">
                                      {v.type === 'PAYMENT' ? v.partyLedger : v.bankCashLedger}
                                    </p>
                                    <p className="text-[10px] text-slate-500 mt-0.5">
                                      Role:{' '}
                                      {v.type === 'PAYMENT'
                                        ? 'Party Ledger (Receiving funds)'
                                        : 'Bank/Cash Account (Receiving funds)'}
                                    </p>
                                  </div>

                                  {/* Credit Leg */}
                                  <div className="bg-violet-50/40 border border-violet-200/70 rounded-lg p-2.5">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="font-bold text-violet-800 uppercase tracking-wider text-[10px]">
                                        Credit (Cr) Leg
                                      </span>
                                      <span className="font-bold text-violet-700">
                                        {formatCurrency(v.amount)}
                                      </span>
                                    </div>
                                    <p className="font-semibold text-slate-900">
                                      {v.type === 'PAYMENT' ? v.bankCashLedger : v.partyLedger}
                                    </p>
                                    <p className="text-[10px] text-slate-500 mt-0.5">
                                      Role:{' '}
                                      {v.type === 'PAYMENT'
                                        ? 'Bank/Cash Account (Disbursing funds)'
                                        : 'Party Ledger (Paying party)'}
                                    </p>
                                  </div>
                                </div>

                                {v.errors && v.errors.length > 0 && (
                                  <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-2 rounded-lg">
                                    <p className="font-semibold text-[11px]">Voucher Issues:</p>
                                    <ul className="list-disc list-inside mt-0.5 space-y-0.5 text-[10px]">
                                      {v.errors.map((err, i) => (
                                        <li key={i}>{err}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Table Footer */}
          <div className="p-2.5 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing {filteredVouchers.length} of {vouchers.length} voucher(s)
              {filteredValidCount !== filteredVouchers.length && (
                <span className="text-slate-400 ml-1">({filteredValidCount} exportable)</span>
              )}
            </span>
            <span className="text-[11px] text-slate-400">
              Click any row to expand double-entry details
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default TallyVoucherManager
