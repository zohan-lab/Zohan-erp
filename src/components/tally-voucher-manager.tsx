import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react'
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
  FileCode,
  Gear,
  CreditCard,
  Receipt,
  ArrowsLeftRight,
  DotsThreeVertical,
  X,
  FileText,
  Building,
  Scales
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  parseTallyPayments,
  parseTallyAccountingVouchersExcel,
  exportPaymentsToTallyExcel,
  generateSampleTallyExcel,
  PaymentVoucher,
  TallyImportResult,
  TallyVoucherType
} from '@/lib/tally-payment-excel'
import { parseTallyXmlVouchers, decodeXmlFileBuffer } from '@/lib/tally-xml-parser'
import {
  TallyLedgerMapping,
  DEFAULT_TALLY_LEDGER_MAPPING,
  TallyCompoundVoucher,
  generateTallySalesVouchers,
  generateTallyPurchaseVouchers,
  generateTallyCreditNoteVouchers,
  generateTallyDebitNoteVouchers,
  generateTallyExpenseVouchers,
  exportCompoundVouchersToTallyExcel,
  generateTallyXML,
  downloadTallyXML
} from '@/lib/tally-universal-engine'
import {
  SalesInvoice,
  PurchaseInvoice,
  CustomerCreditNote,
  CustomerDebitNote,
  SupplierCreditNote,
  SupplierDebitNote,
  ExpenseEntry,
  Customer,
  Supplier,
  Payment,
  CustomerPayment,
  Item,
  ExpenseType
} from '@/lib/types'
import { formatCurrency } from '@/lib/calculations'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface TallyVoucherManagerProps {
  salesInvoices?: SalesInvoice[]
  purchaseInvoices?: PurchaseInvoice[]
  customerCreditNotes?: CustomerCreditNote[]
  customerDebitNotes?: CustomerDebitNote[]
  supplierDebitNotes?: SupplierDebitNote[]
  supplierCreditNotes?: SupplierCreditNote[]
  expenseEntries?: ExpenseEntry[]
  customers?: Customer[]
  suppliers?: Supplier[]
  payments?: Payment[]
  customerPayments?: CustomerPayment[]
  items?: Item[]
  expenseTypes?: ExpenseType[]
  businessName?: string
  companyStateCode?: string
  onImportToERP?: (vouchers: PaymentVoucher[]) => void
  className?: string
  defaultVouchers?: PaymentVoucher[]
}

const STORAGE_KEY_TALLY_MAPPING = 'erp_tally_ledger_mapping'

export function TallyVoucherManager({
  salesInvoices = [],
  purchaseInvoices = [],
  customerCreditNotes = [],
  customerDebitNotes = [],
  supplierDebitNotes = [],
  supplierCreditNotes = [],
  expenseEntries = [],
  customers = [],
  suppliers = [],
  payments = [],
  customerPayments = [],
  items = [],
  expenseTypes = [],
  businessName = 'SK TRADERS',
  companyStateCode = '19',
  onImportToERP,
  className,
  defaultVouchers
}: TallyVoucherManagerProps) {
  // Main Module Tab
  const [activeModule, setActiveModule] = useState<'payments' | 'sales' | 'purchases' | 'notes' | 'expenses'>('payments')

  // Ledger Mapping Configuration State
  const [ledgerMapping, setLedgerMapping] = useState<TallyLedgerMapping>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TALLY_MAPPING)
      return saved ? { ...DEFAULT_TALLY_LEDGER_MAPPING, ...JSON.parse(saved) } : DEFAULT_TALLY_LEDGER_MAPPING
    } catch {
      return DEFAULT_TALLY_LEDGER_MAPPING
    }
  })
  const [isMappingModalOpen, setIsMappingModalOpen] = useState(false)
  const [tempMapping, setTempMapping] = useState<TallyLedgerMapping>(ledgerMapping)

  // Payments / Receipts State (Import & 2-Line Manager)
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

  // Sync payments/customerPayments from props if vouchers empty
  useEffect(() => {
    if (vouchers.length === 0 && (payments.length > 0 || customerPayments.length > 0)) {
      const supplierMap = new Map(suppliers.map(s => [s.id, s]))
      const customerMap = new Map(customers.map(c => [c.id, c]))

      const payList: PaymentVoucher[] = payments.map((p, idx) => {
        const sup = supplierMap.get(p.supplierId)
        return {
          id: p.id || `pay-${idx}`,
          voucherNumber: `PAY-${p.paymentDate?.replace(/-/g, '') || '000'}-${idx + 1}`,
          voucherDate: p.paymentDate || new Date().toISOString().split('T')[0],
          type: 'PAYMENT',
          partyLedger: sup?.name || 'Supplier Account',
          bankCashLedger: p.counterName || ledgerMapping.defaultBankLedgerName,
          amount: p.amount || 0,
          address: [sup?.address, sup?.city, sup?.state].filter(Boolean).join(', ') || undefined,
          pincode: sup?.pincode || undefined,
          status: 'valid',
          isValid: true
        }
      })

      const recList: PaymentVoucher[] = customerPayments.map((cp, idx) => {
        const cust = customerMap.get(cp.customerId)
        return {
          id: cp.id || `rec-${idx}`,
          voucherNumber: `REC-${cp.paymentDate?.replace(/-/g, '') || '000'}-${idx + 1}`,
          voucherDate: cp.paymentDate || new Date().toISOString().split('T')[0],
          type: 'RECEIPT',
          partyLedger: cust?.name || 'Customer Account',
          bankCashLedger: cp.counterName || ledgerMapping.defaultBankLedgerName,
          amount: cp.amount || 0,
          address: [cust?.address, cust?.city, cust?.state].filter(Boolean).join(', ') || undefined,
          pincode: cust?.pincode || undefined,
          status: 'valid',
          isValid: true
        }
      })

      setVouchers([...payList, ...recList])
    }
  }, [payments, customerPayments, suppliers, customers, ledgerMapping])

  // Generate Multi-Line Compound Vouchers dynamically
  const compoundSalesVouchers = useMemo(() => {
    return generateTallySalesVouchers(salesInvoices, customers, items, ledgerMapping, companyStateCode)
  }, [salesInvoices, customers, items, ledgerMapping, companyStateCode])

  const compoundPurchaseVouchers = useMemo(() => {
    return generateTallyPurchaseVouchers(purchaseInvoices, suppliers, items, ledgerMapping, companyStateCode)
  }, [purchaseInvoices, suppliers, items, ledgerMapping, companyStateCode])

  const compoundNotesVouchers = useMemo(() => {
    const cn = generateTallyCreditNoteVouchers(customerCreditNotes, customers, ledgerMapping, companyStateCode)
    const dn = generateTallyDebitNoteVouchers(supplierDebitNotes, suppliers, ledgerMapping, companyStateCode)
    return [...cn, ...dn]
  }, [customerCreditNotes, supplierDebitNotes, customers, suppliers, ledgerMapping, companyStateCode])

  const compoundExpenseVouchers = useMemo(() => {
    return generateTallyExpenseVouchers(expenseEntries, expenseTypes, ledgerMapping, companyStateCode)
  }, [expenseEntries, expenseTypes, ledgerMapping, companyStateCode])

  // Save Ledger Mapping
  const handleSaveLedgerMapping = () => {
    setLedgerMapping(tempMapping)
    try {
      localStorage.setItem(STORAGE_KEY_TALLY_MAPPING, JSON.stringify(tempMapping))
      toast.success('Tally Ledger Mapping saved successfully')
    } catch {
      toast.warning('Saved in current session')
    }
    setIsMappingModalOpen(false)
  }

  // 1. Process XML / Excel / CSV File
  const processFile = useCallback(async (file: File) => {
    const isXml = file.name.toLowerCase().endsWith('.xml')
    const validExtensions = ['.xml', '.xlsx', '.xls', '.csv']
    const hasValidExt = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext))

    if (!hasValidExt) {
      toast.error('Invalid file format. Please upload an XML (.xml), Excel (.xlsx, .xls) or CSV file.')
      return
    }

    setIsParsing(true)
    setFileName(file.name)

    try {
      if (isXml) {
        const buffer = await file.arrayBuffer()
        const text = decodeXmlFileBuffer(buffer)
        const xmlResult = parseTallyXmlVouchers(text, { customers, suppliers, items, expenseTypes })
        
        const converted: PaymentVoucher[] = xmlResult.vouchers
          .filter(v => v.normalizedType === 'payment' || v.normalizedType === 'receipt')
          .map((v, idx) => ({
            id: v.id || `vch-xml-${idx}`,
            voucherNumber: v.voucherNumber,
            voucherDate: v.voucherDate,
            displayDate: v.displayDate,
            rawVoucherType: v.rawVoucherType,
            voucherType: v.rawVoucherType,
            type: v.normalizedType === 'payment' ? 'PAYMENT' : 'RECEIPT',
            partyLedger: v.partyName,
            bankCashLedger: v.legs.find(l => l.ledgerName !== v.partyName)?.ledgerName || 'Bank Account',
            amount: v.totalAmount,
            status: v.isBalanced ? 'valid' : 'warning',
            isValid: v.isBalanced,
            imbalanceDifference: v.imbalanceDifference,
            legs: v.legs
          }))

        setVouchers(converted)
        setErrors(xmlResult.errors)
        setWarnings(xmlResult.warnings)

        if (xmlResult.success && xmlResult.vouchers.length > 0) {
          toast.success(`Imported ${xmlResult.summary.totalParsed} Tally XML voucher(s) successfully`)
        } else if (xmlResult.vouchers.length > 0) {
          toast.warning(`Imported ${xmlResult.vouchers.length} voucher(s) with ${xmlResult.warnings.length} notice(s)`)
        } else {
          toast.error(xmlResult.errors[0] || 'No valid vouchers found in XML envelope')
        }
      } else {
        const arrayBuffer = await file.arrayBuffer()
        const excelResult = parseTallyAccountingVouchersExcel(arrayBuffer, { customers, suppliers, items, expenseTypes })

        const converted: PaymentVoucher[] = excelResult.vouchers
          .filter(v => v.normalizedType === 'payment' || v.normalizedType === 'receipt')
          .map((v, idx) => ({
            id: v.id || `vch-excel-${idx}`,
            voucherNumber: v.voucherNumber,
            voucherDate: v.voucherDate,
            displayDate: v.displayDate,
            rawVoucherType: v.rawVoucherType,
            voucherType: v.rawVoucherType,
            type: v.normalizedType === 'payment' ? 'PAYMENT' : 'RECEIPT',
            partyLedger: v.partyName,
            bankCashLedger: v.legs.find(l => l.ledgerName !== v.partyName)?.ledgerName || 'Bank Account',
            amount: v.totalAmount,
            status: v.isBalanced ? 'valid' : 'warning',
            isValid: v.isBalanced,
            imbalanceDifference: v.imbalanceDifference,
            legs: v.legs
          }))

        setVouchers(converted)
        setErrors(excelResult.errors)
        setWarnings(excelResult.warnings)

        if (excelResult.success && converted.length > 0) {
          toast.success(`Imported ${converted.length} Tally voucher(s) successfully from Excel`)
        } else if (converted.length > 0) {
          toast.warning(`Imported ${converted.length} voucher(s) with validation notices`)
        } else {
          toast.error(excelResult.errors[0] || 'No valid Payment/Receipt vouchers found in file')
        }
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
  }, [customers, suppliers, items, expenseTypes])

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
      }
    ]

    setVouchers(demoVouchers)
    setErrors([])
    setWarnings([])
    setFileName('Demo_Tally_Vouchers.xlsx')
    toast.info('Loaded demo Tally payment & receipt vouchers')
  }

  // 3. Export Handlers
  const handleExportCurrentExcel = () => {
    try {
      if (activeModule === 'payments') {
        const validList = vouchers.filter(v => v.isValid !== false && v.status !== 'error')
        if (validList.length === 0) {
          toast.warning('No valid Payment/Receipt vouchers to export')
          return
        }
        const filename = `Tally_Payments_${businessName.replace(/\s+/g, '_')}_${Date.now()}.xlsx`
        exportPaymentsToTallyExcel(validList, { filename })
        toast.success(`Exported ${validList.length} Payment/Receipt vouchers`)
      } else {
        const activeList =
          activeModule === 'sales'
            ? compoundSalesVouchers
            : activeModule === 'purchases'
            ? compoundPurchaseVouchers
            : activeModule === 'notes'
            ? compoundNotesVouchers
            : compoundExpenseVouchers

        if (activeList.length === 0) {
          toast.warning(`No ${activeModule} vouchers found to export`)
          return
        }
        const filename = `Tally_${activeModule.toUpperCase()}_${businessName.replace(/\s+/g, '_')}_${Date.now()}.xlsx`
        exportCompoundVouchersToTallyExcel(activeList, { filename })
        toast.success(`Exported ${activeList.length} ${activeModule} compound vouchers`)
      }
    } catch (err: any) {
      toast.error(`Export failed: ${err?.message || 'Unknown error'}`)
    }
  }

  const handleExportAllToTallyXML = () => {
    try {
      const allCompound = [
        ...compoundSalesVouchers,
        ...compoundPurchaseVouchers,
        ...compoundNotesVouchers,
        ...compoundExpenseVouchers
      ]

      if (allCompound.length === 0) {
        toast.warning('No vouchers available to export to Tally XML')
        return
      }

      const xml = generateTallyXML(allCompound, businessName)
      const filename = `Tally_Prime_Import_${businessName.replace(/\s+/g, '_')}_${Date.now()}.xml`
      downloadTallyXML(xml, filename)
      toast.success(`Generated Tally Prime XML with ${allCompound.length} double-entry vouchers`)
    } catch (err: any) {
      toast.error(`XML Export failed: ${err?.message || 'Unknown error'}`)
    }
  }

  const handleDownloadSample = () => {
    generateSampleTallyExcel()
    toast.success('Downloaded Tally Payment & Receipt Sample Excel')
  }

  const handleClear = () => {
    setVouchers([])
    setErrors([])
    setWarnings([])
    setFileName(null)
    toast.info('Cleared all vouchers')
  }

  // Filtered Payments/Receipts
  const filteredPaymentVouchers = useMemo(() => {
    return vouchers.filter(v => {
      if (typeFilter !== 'ALL' && v.type !== typeFilter) return false
      if (statusFilter === 'VALID' && (v.status !== 'valid' || v.isValid === false)) return false
      if (statusFilter === 'ISSUES' && v.status === 'valid' && v.isValid !== false) return false
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      return (
        v.partyLedger.toLowerCase().includes(q) ||
        v.bankCashLedger.toLowerCase().includes(q) ||
        v.voucherNumber.toLowerCase().includes(q)
      )
    })
  }, [vouchers, typeFilter, statusFilter, searchQuery])

  // Filtered Active Compound Vouchers
  const activeCompoundList = useMemo(() => {
    const raw =
      activeModule === 'sales'
        ? compoundSalesVouchers
        : activeModule === 'purchases'
        ? compoundPurchaseVouchers
        : activeModule === 'notes'
        ? compoundNotesVouchers
        : compoundExpenseVouchers

    if (!searchQuery.trim()) return raw
    const q = searchQuery.toLowerCase()
    return raw.filter(v =>
      v.partyName.toLowerCase().includes(q) ||
      v.voucherNumber.toLowerCase().includes(q) ||
      (v.partyGstin && v.partyGstin.toLowerCase().includes(q))
    )
  }, [
    activeModule,
    compoundSalesVouchers,
    compoundPurchaseVouchers,
    compoundNotesVouchers,
    compoundExpenseVouchers,
    searchQuery
  ])

  return (
    <div className={cn('space-y-6', className)}>
      {/* ── HEADER CARD ── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-violet-50 border border-violet-100 text-violet-700">
              <Building className="w-6 h-6" weight="duotone" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Tally Prime Integration & Double-Entry Engine
                </h1>
                <Badge variant="outline" className="text-[11px] font-semibold bg-violet-50 text-violet-700 border-violet-200">
                  Tally Prime 4.x / ERP 9
                </Badge>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Generate balanced multi-line statutory accounting entries (Dr/Cr) and export directly to Tally Prime Excel & XML
              </p>
            </div>
          </div>

          {/* Global Header Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTempMapping(ledgerMapping)
                setIsMappingModalOpen(true)
              }}
              className="h-9 text-xs font-semibold rounded-xl border-slate-200 hover:bg-slate-50 flex items-center gap-1.5"
            >
              <Gear className="w-4 h-4 text-slate-600" weight="bold" />
              Ledger Mapping
            </Button>

            <Button
              onClick={handleExportAllToTallyXML}
              className="h-9 px-3.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5"
            >
              <FileCode className="w-4 h-4" weight="bold" />
              Export Tally XML (.xml)
            </Button>

            <Button
              onClick={handleExportCurrentExcel}
              className="h-9 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5"
            >
              <FileXls className="w-4 h-4" weight="bold" />
              Export Excel (.xlsx)
            </Button>
          </div>
        </div>
      </div>

      {/* ── MODULE SELECTOR TABS ── */}
      <Tabs value={activeModule} onValueChange={v => setActiveModule(v as any)} className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-2.5">
          <TabsList className="bg-slate-100/90 p-1 rounded-xl h-10">
            <TabsTrigger
              value="payments"
              className="text-xs font-bold px-3.5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-violet-700 data-[state=active]:shadow-xs"
            >
              💳 Bank & Cash Vouchers ({vouchers.length})
            </TabsTrigger>
            <TabsTrigger
              value="sales"
              className="text-xs font-bold px-3.5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-violet-700 data-[state=active]:shadow-xs"
            >
              📤 Sales (Multi-Line) ({compoundSalesVouchers.length})
            </TabsTrigger>
            <TabsTrigger
              value="purchases"
              className="text-xs font-bold px-3.5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-violet-700 data-[state=active]:shadow-xs"
            >
              📥 Purchases (Multi-Line) ({compoundPurchaseVouchers.length})
            </TabsTrigger>
            <TabsTrigger
              value="notes"
              className="text-xs font-bold px-3.5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-violet-700 data-[state=active]:shadow-xs"
            >
              📜 Credit / Debit Notes ({compoundNotesVouchers.length})
            </TabsTrigger>
            <TabsTrigger
              value="expenses"
              className="text-xs font-bold px-3.5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-violet-700 data-[state=active]:shadow-xs"
            >
              🚛 Expenses & RCM ({compoundExpenseVouchers.length})
            </TabsTrigger>
          </TabsList>

          {/* Search Bar */}
          <div className="relative w-full sm:w-64">
            <MagnifyingGlass className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Search voucher, party..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs bg-white"
            />
          </div>
        </div>

        {/* ── TAB 1: PAYMENTS & RECEIPTS ── */}
        <TabsContent value="payments" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileInputChange}
                accept=".xml, .xlsx, .xls, .csv, text/xml, application/xml"
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isParsing}
                className="text-xs font-bold h-8 border-dashed"
              >
                <FileArrowUp className="w-3.5 h-3.5 mr-1.5 text-violet-600" />
                Upload Tally XML / Excel
              </Button>
              <Button variant="ghost" size="sm" onClick={handleDownloadSample} className="text-xs h-8 text-slate-600">
                <DownloadSimple className="w-3.5 h-3.5 mr-1 text-slate-500" />
                Sample
              </Button>
              <Button variant="ghost" size="sm" onClick={handleLoadDemoData} className="text-xs h-8 text-emerald-600">
                <Sparkle className="w-3.5 h-3.5 mr-1" />
                Demo Data
              </Button>
            </div>

            {onImportToERP && vouchers.length > 0 && (
              <Button
                size="sm"
                onClick={() => onImportToERP(filteredPaymentVouchers.filter(v => v.status === 'valid'))}
                className="text-xs font-bold h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                Import to ERP ({filteredPaymentVouchers.filter(v => v.status === 'valid').length})
              </Button>
            )}
          </div>

          <Card className="border-slate-200/80 shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow>
                    <TableHead className="text-xs font-bold text-slate-700">Type</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">Voucher No</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">Date</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">Party Account (Dr/Cr)</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">Bank / Cash Account</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">Amount (₹)</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPaymentVouchers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-xs text-slate-400">
                        No payment or receipt vouchers available.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPaymentVouchers.map(v => (
                      <TableRow key={v.id} className="hover:bg-slate-50/50">
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] font-bold',
                              v.type === 'PAYMENT' && 'bg-rose-50 text-rose-700 border-rose-200',
                              v.type === 'RECEIPT' && 'bg-emerald-50 text-emerald-700 border-emerald-200',
                              v.type === 'CONTRA' && 'bg-blue-50 text-blue-700 border-blue-200'
                            )}
                          >
                            {v.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs font-bold text-slate-900">{v.voucherNumber}</TableCell>
                        <TableCell className="text-xs text-slate-600">{v.displayDate || v.voucherDate}</TableCell>
                        <TableCell className="font-semibold text-xs text-slate-800">{v.partyLedger}</TableCell>
                        <TableCell className="text-xs text-slate-600">{v.bankCashLedger}</TableCell>
                        <TableCell className="text-xs text-right font-mono font-bold text-slate-900">
                          {formatCurrency(v.amount)}
                        </TableCell>
                        <TableCell className="text-center">
                          {v.status === 'valid' ? (
                            <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">Valid</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-[10px]">
                              Issue
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TABS 2, 3, 4, 5: COMPOUND MULTI-LINE VOUCHERS VIEW ── */}
        {activeModule !== 'payments' && (
          <TabsContent value={activeModule} className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              {activeCompoundList.length === 0 ? (
                <Card className="border-slate-200/80 shadow-sm p-8 text-center text-xs text-slate-400">
                  No {activeModule} double-entry vouchers found for the current period.
                </Card>
              ) : (
                activeCompoundList.map(v => (
                  <Card key={v.id} className="border-slate-200/80 shadow-sm overflow-hidden bg-white">
                    <div className="bg-slate-50/80 border-b border-slate-200 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <Badge className="bg-slate-800 text-white text-[11px] font-mono font-bold">
                          {v.voucherType}
                        </Badge>
                        <span className="font-mono text-xs font-extrabold text-indigo-900">#{v.voucherNumber}</span>
                        <span className="text-xs text-slate-500">•</span>
                        <span className="text-xs text-slate-600 font-medium">{v.displayDate}</span>
                        <span className="text-xs text-slate-500">•</span>
                        <span className="text-xs font-bold text-slate-800">{v.partyName}</span>
                        {v.partyGstin && (
                          <Badge variant="outline" className="text-[10px] font-mono text-slate-600">
                            {v.partyGstin}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-xs font-extrabold font-mono text-slate-900">
                            {formatCurrency(v.totalAmount)}
                          </span>
                        </div>
                        {v.isBalanced ? (
                          <Badge className="bg-emerald-100 text-emerald-800 text-[10px] flex items-center gap-1">
                            <CheckCircle className="w-3 h-3 text-emerald-600" />
                            Dr = Cr Balanced
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px] flex items-center gap-1">
                            <WarningCircle className="w-3 h-3" />
                            Diff: {formatCurrency(v.imbalanceDifference || 0)}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <CardContent className="p-0">
                      <Table>
                        <TableHeader className="bg-slate-50/40">
                          <TableRow>
                            <TableHead className="text-[11px] font-bold text-slate-600 w-16">Dr / Cr</TableHead>
                            <TableHead className="text-[11px] font-bold text-slate-600">Tally Ledger Name</TableHead>
                            <TableHead className="text-[11px] font-bold text-slate-600 text-right w-36">
                              Debit Amount (₹)
                            </TableHead>
                            <TableHead className="text-[11px] font-bold text-slate-600 text-right w-36">
                              Credit Amount (₹)
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {v.legs.map((leg, idx) => (
                            <TableRow key={idx} className="hover:bg-slate-50/40 text-xs font-mono">
                              <TableCell>
                                <span
                                  className={cn(
                                    'font-bold px-1.5 py-0.5 rounded text-[10px]',
                                    leg.drCr === 'Dr'
                                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  )}
                                >
                                  {leg.drCr}
                                </span>
                              </TableCell>
                              <TableCell className="font-sans font-semibold text-slate-800">
                                {leg.ledgerName}
                              </TableCell>
                              <TableCell className="text-right text-blue-700 font-bold">
                                {leg.drCr === 'Dr' ? formatCurrency(leg.amount) : '-'}
                              </TableCell>
                              <TableCell className="text-right text-emerald-700 font-bold">
                                {leg.drCr === 'Cr' ? formatCurrency(leg.amount) : '-'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <div className="bg-slate-50/60 p-2.5 px-4 text-[11px] text-slate-500 border-t border-slate-100 flex items-center gap-1.5">
                        <span className="font-semibold text-slate-700">Narration:</span>
                        <span>{v.narration}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* ── LEDGER MAPPING CONFIGURATION DIALOG ── */}
      <Dialog open={isMappingModalOpen} onOpenChange={setIsMappingModalOpen}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Gear className="w-5 h-5 text-violet-600" weight="duotone" />
              Tally Ledger Name Configuration
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Customize standard chart-of-accounts ledger names to match your Tally Prime company masters.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 py-2 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-slate-700 text-[11px]">Sales Account</label>
              <Input
                value={tempMapping.salesLedgerName}
                onChange={e => setTempMapping({ ...tempMapping, salesLedgerName: e.target.value })}
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-slate-700 text-[11px]">Purchase Account</label>
              <Input
                value={tempMapping.purchaseLedgerName}
                onChange={e => setTempMapping({ ...tempMapping, purchaseLedgerName: e.target.value })}
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700 text-[11px]">Output CGST</label>
              <Input
                value={tempMapping.outputCgstLedgerName}
                onChange={e => setTempMapping({ ...tempMapping, outputCgstLedgerName: e.target.value })}
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-slate-700 text-[11px]">Output SGST</label>
              <Input
                value={tempMapping.outputSgstLedgerName}
                onChange={e => setTempMapping({ ...tempMapping, outputSgstLedgerName: e.target.value })}
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700 text-[11px]">Output IGST</label>
              <Input
                value={tempMapping.outputIgstLedgerName}
                onChange={e => setTempMapping({ ...tempMapping, outputIgstLedgerName: e.target.value })}
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-slate-700 text-[11px]">Round Off Account</label>
              <Input
                value={tempMapping.roundOffLedgerName}
                onChange={e => setTempMapping({ ...tempMapping, roundOffLedgerName: e.target.value })}
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700 text-[11px]">Input CGST</label>
              <Input
                value={tempMapping.inputCgstLedgerName}
                onChange={e => setTempMapping({ ...tempMapping, inputCgstLedgerName: e.target.value })}
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-slate-700 text-[11px]">Input SGST</label>
              <Input
                value={tempMapping.inputSgstLedgerName}
                onChange={e => setTempMapping({ ...tempMapping, inputSgstLedgerName: e.target.value })}
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700 text-[11px]">Input IGST</label>
              <Input
                value={tempMapping.inputIgstLedgerName}
                onChange={e => setTempMapping({ ...tempMapping, inputIgstLedgerName: e.target.value })}
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-slate-700 text-[11px]">Sales Return</label>
              <Input
                value={tempMapping.salesReturnLedgerName}
                onChange={e => setTempMapping({ ...tempMapping, salesReturnLedgerName: e.target.value })}
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTempMapping(DEFAULT_TALLY_LEDGER_MAPPING)}
              className="text-xs h-8"
            >
              Reset to Defaults
            </Button>
            <Button
              size="sm"
              onClick={handleSaveLedgerMapping}
              className="text-xs h-8 bg-violet-600 hover:bg-violet-700 text-white font-bold"
            >
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default TallyVoucherManager
