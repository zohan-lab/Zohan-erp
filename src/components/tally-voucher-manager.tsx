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
  Eye,
  CreditCard,
  Receipt,
  ArrowsLeftRight,
  Info
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
  const [fileSize, setFileSize] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({})

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'ALL' | TallyVoucherType>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'VALID' | 'ISSUES'>('ALL')

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Handle file buffer parsing
  const processFile = useCallback(async (file: File) => {
    const validExtensions = ['.xlsx', '.xls', '.csv']
    const hasValidExt = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext))

    if (!hasValidExt) {
      toast.error('Invalid file format. Please upload an Excel (.xlsx, .xls) or CSV file.')
      return
    }

    setIsParsing(true)
    setFileName(file.name)
    setFileSize((file.size / 1024).toFixed(1) + ' KB')

    try {
      const arrayBuffer = await file.arrayBuffer()
      const result: TallyImportResult = parseTallyPayments(arrayBuffer)

      setVouchers(result.data)
      setErrors(result.errors)
      setWarnings(result.warnings)

      if (result.success && result.data.length > 0) {
        toast.success(`Successfully parsed ${result.data.length} Tally voucher(s)`)
      } else if (result.data.length > 0) {
        toast.warning(`Parsed ${result.data.length} voucher(s) with ${result.errors.length} issue(s)`)
      } else {
        toast.error(result.errors[0] || 'Failed to parse vouchers from Excel file')
      }
    } catch (err: any) {
      console.error('File parsing error:', err)
      toast.error(`Error reading file: ${err?.message || 'Unknown error'}`)
      setErrors([`File read error: ${err?.message || 'Corrupted or unsupported file'}`])
    } finally {
      setIsParsing(false)
    }
  }, [])

  // Drag & Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0])
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0])
    }
  }

  // Load sample demo vouchers directly
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
        status: 'valid'
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
        status: 'valid'
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
        status: 'valid'
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
        status: 'valid'
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
        status: 'valid'
      }
    ]

    setVouchers(demoVouchers)
    setErrors([])
    setWarnings([])
    setFileName('Demo_Tally_Vouchers.xlsx')
    setFileSize('Sample Data')
    toast.success('Loaded 5 sample Tally vouchers')
  }

  // Clear parsed data
  const handleClear = () => {
    setVouchers([])
    setErrors([])
    setWarnings([])
    setFileName(null)
    setFileSize(null)
    setExpandedRows({})
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Export current list to Excel
  const handleExport = () => {
    if (vouchers.length === 0) {
      toast.error('No vouchers available to export.')
      return
    }

    try {
      const filename = `Tally_Payments_Export_${Date.now()}.xlsx`
      exportPaymentsToTallyExcel(vouchers, { filename })
      toast.success(`Exported ${vouchers.length} vouchers to ${filename}`)
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

  // Toggle row expansion for double-entry breakdown
  const toggleRow = (id: string) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }))
  }

  // Filtered vouchers
  const filteredVouchers = useMemo(() => {
    return vouchers.filter(v => {
      // Type Filter
      if (typeFilter !== 'ALL' && v.type !== typeFilter) return false

      // Status Filter
      if (statusFilter === 'VALID' && v.status !== 'valid') return false
      if (statusFilter === 'ISSUES' && v.status === 'valid') return false

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

  // Summary Metrics
  const summary = useMemo(() => {
    const totalVouchers = vouchers.length
    const paymentList = vouchers.filter(v => v.type === 'PAYMENT' && v.status !== 'error')
    const receiptList = vouchers.filter(v => v.type === 'RECEIPT' && v.status !== 'error')
    const contraList = vouchers.filter(v => v.type === 'CONTRA' && v.status !== 'error')

    const totalPaymentAmount = paymentList.reduce((sum, v) => sum + v.amount, 0)
    const totalReceiptAmount = receiptList.reduce((sum, v) => sum + v.amount, 0)
    const totalContraAmount = contraList.reduce((sum, v) => sum + v.amount, 0)

    const validCount = vouchers.filter(v => v.status === 'valid').length
    const issuesCount = vouchers.filter(v => v.status !== 'valid').length

    return {
      totalVouchers,
      paymentCount: paymentList.length,
      receiptCount: receiptList.length,
      contraCount: contraList.length,
      totalPaymentAmount,
      totalReceiptAmount,
      totalContraAmount,
      validCount,
      issuesCount
    }
  }, [vouchers])

  return (
    <div className={cn('space-y-6', className)}>
      {/* ── Top Header & Actions ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <FileXls className="h-6 w-6" weight="duotone" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                Tally Payment & Receipt Manager
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Double-entry (2-row) Excel import and export utility compatible with Tally Prime & ERP 9
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadSample}
            className="text-xs font-medium text-slate-700 hover:text-indigo-600 hover:bg-indigo-50/50 border-slate-200"
          >
            <DownloadSimple className="h-4 w-4 mr-1.5 text-indigo-500" />
            Sample Template
          </Button>

          {vouchers.length === 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadDemoData}
              className="text-xs font-medium text-slate-700 hover:text-emerald-600 hover:bg-emerald-50/50 border-slate-200"
            >
              <Sparkle className="h-4 w-4 mr-1.5 text-emerald-500" />
              Load Demo Vouchers
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClear}
                className="text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200"
              >
                <Trash className="h-4 w-4 mr-1.5" />
                Clear
              </Button>

              <Button
                size="sm"
                onClick={handleExport}
                className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
              >
                <FileArrowDown className="h-4 w-4 mr-1.5" />
                Export to Tally Excel
              </Button>

              {onImportToERP && (
                <Button
                  size="sm"
                  onClick={() => onImportToERP(vouchers.filter(v => v.status !== 'error'))}
                  className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                >
                  <CheckCircle className="h-4 w-4 mr-1.5" />
                  Import into ERP
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Dropzone & Upload Area ── */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200',
          isDragging
            ? 'border-indigo-500 bg-indigo-50/40 scale-[1.005]'
            : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50/80 hover:border-slate-300'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx, .xls, .csv"
          onChange={handleFileInputChange}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center space-y-3">
          <div
            className={cn(
              'w-14 h-14 rounded-2xl flex items-center justify-center transition-colors shadow-sm',
              isDragging ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-600 border border-slate-200'
            )}
          >
            {isParsing ? (
              <ArrowsClockwise className="h-7 w-7 animate-spin text-indigo-600" />
            ) : (
              <FileArrowUp className="h-7 w-7" weight="duotone" />
            )}
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-800">
              {isParsing
                ? 'Parsing Tally Excel file...'
                : fileName
                ? `Uploaded: ${fileName} (${fileSize})`
                : 'Click to upload or drag & drop Tally Excel voucher sheet'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Supports .xlsx, .xls, and .csv exports with Payment, Receipt, and Contra vouchers
            </p>
          </div>

          {fileName && (
            <Badge variant="outline" className="bg-white text-slate-600 border-slate-200 text-[11px] font-normal">
              Click to replace file
            </Badge>
          )}
        </div>
      </div>

      {/* ── Error & Warning Alert Banner ── */}
      <AnimatePresence>
        {(errors.length > 0 || warnings.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-2"
          >
            {errors.length > 0 && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-900 text-xs">
                <div className="flex items-center gap-2 font-semibold text-rose-800 mb-1.5">
                  <WarningOctagon className="h-4 w-4 text-rose-600" weight="fill" />
                  <span>Validation Issues Detected ({errors.length})</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-rose-700 max-h-36 overflow-y-auto">
                  {errors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-900 text-xs">
                <div className="flex items-center gap-2 font-semibold text-amber-800 mb-1.5">
                  <WarningCircle className="h-4 w-4 text-amber-600" weight="fill" />
                  <span>Warnings ({warnings.length})</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-amber-700 max-h-28 overflow-y-auto">
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-slate-200/80 shadow-xs bg-white">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Total Vouchers
                </p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">
                  {summary.totalVouchers}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] text-emerald-600 font-medium">{summary.validCount} valid</span>
                  {summary.issuesCount > 0 && (
                    <span className="text-[11px] text-rose-600 font-medium">· {summary.issuesCount} issues</span>
                  )}
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
                <Receipt className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 shadow-xs bg-white">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-violet-600 uppercase tracking-wider">
                  Total Payments
                </p>
                <h3 className="text-2xl font-bold text-violet-700 mt-1">
                  {formatCurrency(summary.totalPaymentAmount)}
                </h3>
                <p className="text-[11px] text-slate-500 mt-1">
                  {summary.paymentCount} Payment Voucher(s)
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600">
                <CreditCard className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 shadow-xs bg-white">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">
                  Total Receipts
                </p>
                <h3 className="text-2xl font-bold text-emerald-700 mt-1">
                  {formatCurrency(summary.totalReceiptAmount)}
                </h3>
                <p className="text-[11px] text-slate-500 mt-1">
                  {summary.receiptCount} Receipt Voucher(s)
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                <FileArrowDown className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 shadow-xs bg-white">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider">
                  Contra / Transfers
                </p>
                <h3 className="text-2xl font-bold text-amber-700 mt-1">
                  {formatCurrency(summary.totalContraAmount)}
                </h3>
                <p className="text-[11px] text-slate-500 mt-1">
                  {summary.contraCount} Contra Voucher(s)
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                <ArrowsLeftRight className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Table & Filter Toolbar ── */}
      {vouchers.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          {/* Filter Bar */}
          <div className="p-4 border-b border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/50">
            <div className="relative flex-1 max-w-sm">
              <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search party, bank, voucher no..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 bg-white text-xs h-9 border-slate-200 rounded-lg"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Type Filter Buttons */}
              <div className="flex items-center bg-slate-200/70 p-0.5 rounded-lg text-xs">
                <button
                  onClick={() => setTypeFilter('ALL')}
                  className={cn(
                    'px-2.5 py-1 rounded-md font-medium transition-colors',
                    typeFilter === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  All ({vouchers.length})
                </button>
                <button
                  onClick={() => setTypeFilter('PAYMENT')}
                  className={cn(
                    'px-2.5 py-1 rounded-md font-medium transition-colors',
                    typeFilter === 'PAYMENT' ? 'bg-white text-violet-700 shadow-xs' : 'text-slate-600 hover:text-violet-700'
                  )}
                >
                  Payments ({vouchers.filter(v => v.type === 'PAYMENT').length})
                </button>
                <button
                  onClick={() => setTypeFilter('RECEIPT')}
                  className={cn(
                    'px-2.5 py-1 rounded-md font-medium transition-colors',
                    typeFilter === 'RECEIPT' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-emerald-700'
                  )}
                >
                  Receipts ({vouchers.filter(v => v.type === 'RECEIPT').length})
                </button>
                <button
                  onClick={() => setTypeFilter('CONTRA')}
                  className={cn(
                    'px-2.5 py-1 rounded-md font-medium transition-colors',
                    typeFilter === 'CONTRA' ? 'bg-white text-amber-700 shadow-xs' : 'text-slate-600 hover:text-amber-700'
                  )}
                >
                  Contra ({vouchers.filter(v => v.type === 'CONTRA').length})
                </button>
              </div>

              {/* Status Filter */}
              <div className="flex items-center bg-slate-200/70 p-0.5 rounded-lg text-xs">
                <button
                  onClick={() => setStatusFilter('ALL')}
                  className={cn(
                    'px-2 py-1 rounded-md font-medium transition-colors',
                    statusFilter === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  All Status
                </button>
                <button
                  onClick={() => setStatusFilter('VALID')}
                  className={cn(
                    'px-2 py-1 rounded-md font-medium transition-colors',
                    statusFilter === 'VALID' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-emerald-700'
                  )}
                >
                  Valid
                </button>
                <button
                  onClick={() => setStatusFilter('ISSUES')}
                  className={cn(
                    'px-2 py-1 rounded-md font-medium transition-colors',
                    statusFilter === 'ISSUES' ? 'bg-white text-rose-700 shadow-xs' : 'text-slate-600 hover:text-rose-700'
                  )}
                >
                  Issues
                </button>
              </div>
            </div>
          </div>

          {/* Vouchers Table */}
          <div className="overflow-x-auto max-h-[500px]">
            <Table>
              <TableHeader className="bg-slate-50 sticky top-0 z-10">
                <TableRow className="border-b border-slate-200">
                  <TableHead className="w-10"></TableHead>
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
                      No vouchers match the selected filter criteria.
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
                          <TableCell className="py-3 px-2 text-center text-slate-400">
                            {isExpanded ? (
                              <CaretUp className="h-4 w-4 inline" />
                            ) : (
                              <CaretDown className="h-4 w-4 inline" />
                            )}
                          </TableCell>

                          <TableCell className="py-3 font-medium text-xs text-slate-900">
                            <div className="font-semibold">{v.voucherNumber}</div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {v.displayDate || v.voucherDate}
                            </div>
                          </TableCell>

                          <TableCell className="py-3">
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

                          <TableCell className="py-3 text-xs text-slate-800">
                            <div className="font-medium">{v.partyLedger}</div>
                            {(v.address || v.pincode) && (
                              <div className="text-[11px] text-slate-400 truncate max-w-xs mt-0.5">
                                {[v.address, v.pincode].filter(Boolean).join(', ')}
                              </div>
                            )}
                          </TableCell>

                          <TableCell className="py-3 text-xs text-slate-700 font-medium">
                            {v.bankCashLedger}
                          </TableCell>

                          <TableCell className="py-3 text-xs font-bold text-slate-900 text-right">
                            {formatCurrency(v.amount)}
                          </TableCell>

                          <TableCell className="py-3 text-center">
                            {v.status === 'valid' && (
                              <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold">
                                Valid
                              </Badge>
                            )}
                            {v.status === 'warning' && (
                              <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-semibold">
                                Warning
                              </Badge>
                            )}
                            {v.status === 'error' && (
                              <Badge className="bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-semibold">
                                Error
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>

                        {/* ── Expanded Double-Entry Breakdown ── */}
                        {isExpanded && (
                          <TableRow className="bg-slate-50/60 border-b border-slate-200">
                            <TableCell colSpan={7} className="p-4">
                              <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs space-y-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                                    <ArrowBendDownRight className="h-4 w-4 text-indigo-600" />
                                    <span>Tally Double-Entry Journal Breakdown (2 Rows)</span>
                                  </div>
                                  <span className="text-[11px] text-slate-400">
                                    Composite Key: {v.type}_{v.voucherNumber}_{v.voucherDate}
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                  {/* Debit Leg */}
                                  <div className="bg-emerald-50/50 border border-emerald-200/70 rounded-lg p-3">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="font-bold text-emerald-800 uppercase tracking-wider text-[10px]">
                                        Debit (Dr) Entry
                                      </span>
                                      <span className="font-bold text-emerald-700">
                                        {formatCurrency(v.amount)}
                                      </span>
                                    </div>
                                    <p className="font-semibold text-slate-900">
                                      {v.type === 'PAYMENT' ? v.partyLedger : v.bankCashLedger}
                                    </p>
                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                      Role:{' '}
                                      {v.type === 'PAYMENT'
                                        ? 'Party Ledger (Receiving funds)'
                                        : 'Bank/Cash Account (Receiving funds)'}
                                    </p>
                                  </div>

                                  {/* Credit Leg */}
                                  <div className="bg-violet-50/50 border border-violet-200/70 rounded-lg p-3">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="font-bold text-violet-800 uppercase tracking-wider text-[10px]">
                                        Credit (Cr) Entry
                                      </span>
                                      <span className="font-bold text-violet-700">
                                        {formatCurrency(v.amount)}
                                      </span>
                                    </div>
                                    <p className="font-semibold text-slate-900">
                                      {v.type === 'PAYMENT' ? v.bankCashLedger : v.partyLedger}
                                    </p>
                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                      Role:{' '}
                                      {v.type === 'PAYMENT'
                                        ? 'Bank/Cash Account (Disbursing funds)'
                                        : 'Party Ledger (Paying party)'}
                                    </p>
                                  </div>
                                </div>

                                {v.errors && v.errors.length > 0 && (
                                  <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-2.5 rounded-lg">
                                    <p className="font-semibold">Voucher Issues:</p>
                                    <ul className="list-disc list-inside mt-1 space-y-0.5 text-[11px]">
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
          <div className="p-3 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing {filteredVouchers.length} of {vouchers.length} voucher(s)
            </span>
            <span className="text-[11px] text-slate-400">
              Click any row to view full 2-row double-entry journal details
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default TallyVoucherManager
