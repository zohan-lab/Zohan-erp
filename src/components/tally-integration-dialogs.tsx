import React, { useState, useMemo, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  FileXls,
  FileCode,
  Gear,
  CheckCircle,
  WarningCircle,
  DownloadSimple,
  FileArrowUp,
  Sparkle,
  CalendarBlank,
  ArrowsClockwise,
  CheckSquare,
  Square,
  ShieldCheck,
  Building,
  Scales,
  FileText,
  MagnifyingGlass,
  CaretDown,
  CaretRight,
  Funnel,
  Check,
  X,
  SlidersHorizontal,
  ArrowRight,
  Package
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
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
  InvoiceItem,
  AdditionalCharge,
  ExpenseType
} from '@/lib/types'
import { formatCurrency, roundCurrency } from '@/lib/calculations'
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
  parseTallyAccountingVouchersExcel,
  parseTallyPayments,
  exportPaymentsToTallyExcel,
  generateSampleTallyExcel,
  PaymentVoucher,
  TallyImportResult
} from '@/lib/tally-payment-excel'

const STORAGE_KEY_TALLY_MAPPING = 'erp_tally_ledger_mapping'

const MONTH_OPTIONS = [
  { value: '0', label: 'All Months (Full Financial Year)' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
]

export interface TallyExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  salesInvoices?: SalesInvoice[]
  purchaseInvoices?: PurchaseInvoice[]
  customerCreditNotes?: CustomerCreditNote[]
  customerDebitNotes?: CustomerDebitNote[]
  supplierDebitNotes?: SupplierDebitNote[]
  supplierCreditNotes?: SupplierCreditNote[]
  expenseEntries?: ExpenseEntry[]
  payments?: Payment[]
  customerPayments?: CustomerPayment[]
  customers?: Customer[]
  suppliers?: Supplier[]
  items?: Item[]
  expenseTypes?: ExpenseType[]
  businessName?: string
  companyStateCode?: string
  currentFY?: string
}

export function TallyExportDialog({
  open,
  onOpenChange,
  salesInvoices = [],
  purchaseInvoices = [],
  customerCreditNotes = [],
  customerDebitNotes = [],
  supplierDebitNotes = [],
  supplierCreditNotes = [],
  expenseEntries = [],
  payments = [],
  customerPayments = [],
  customers = [],
  suppliers = [],
  items = [],
  expenseTypes = [],
  businessName = 'SK TRADERS',
  companyStateCode = '19',
  currentFY = '2026-2027'
}: TallyExportDialogProps) {
  // Period filter
  const currentMonthNum = new Date().getMonth() + 1
  const [selectedMonth, setSelectedMonth] = useState<string>(String(currentMonthNum))
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()))

  // Module checkboxes
  const [includeSales, setIncludeSales] = useState(true)
  const [includePurchases, setIncludePurchases] = useState(true)
  const [includeNotes, setIncludeNotes] = useState(true)
  const [includeExpenses, setIncludeExpenses] = useState(true)
  const [includePayments, setIncludePayments] = useState(true)

  // Ledger mapping state
  const [ledgerMapping, setLedgerMapping] = useState<TallyLedgerMapping>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TALLY_MAPPING)
      return saved ? { ...DEFAULT_TALLY_LEDGER_MAPPING, ...JSON.parse(saved) } : DEFAULT_TALLY_LEDGER_MAPPING
    } catch {
      return DEFAULT_TALLY_LEDGER_MAPPING
    }
  })
  const [isMappingDialogOpen, setIsMappingDialogOpen] = useState(false)
  const [tempMapping, setTempMapping] = useState<TallyLedgerMapping>(ledgerMapping)

  // Date filtering predicate
  const filterByPeriod = (dateStr?: string) => {
    if (!dateStr) return true
    const m = parseInt(selectedMonth, 10)
    const y = parseInt(selectedYear, 10)
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return true
    if (m === 0) return true
    return (d.getMonth() + 1) === m && d.getFullYear() === y
  }

  // Filtered dataset
  const filteredSales = useMemo(() => salesInvoices.filter(i => filterByPeriod(i.invoiceDate)), [salesInvoices, selectedMonth, selectedYear])
  const filteredPurchases = useMemo(() => purchaseInvoices.filter(i => filterByPeriod(i.invoiceDate)), [purchaseInvoices, selectedMonth, selectedYear])
  const filteredCreditNotes = useMemo(() => customerCreditNotes.filter(n => filterByPeriod(n.date)), [customerCreditNotes, selectedMonth, selectedYear])
  const filteredDebitNotes = useMemo(() => supplierDebitNotes.filter(n => filterByPeriod(n.date)), [supplierDebitNotes, selectedMonth, selectedYear])
  const filteredExpenses = useMemo(() => expenseEntries.filter(e => filterByPeriod(e.expenseDate)), [expenseEntries, selectedMonth, selectedYear])
  const filteredPayments = useMemo(() => payments.filter(p => filterByPeriod(p.paymentDate)), [payments, selectedMonth, selectedYear])
  const filteredCustomerPayments = useMemo(() => customerPayments.filter(p => filterByPeriod(p.paymentDate)), [customerPayments, selectedMonth, selectedYear])

  // Generate multi-line compound vouchers
  const salesVouchers = useMemo(() => {
    if (!includeSales) return []
    return generateTallySalesVouchers(filteredSales, customers, items, ledgerMapping, companyStateCode)
  }, [includeSales, filteredSales, customers, items, ledgerMapping, companyStateCode])

  const purchaseVouchers = useMemo(() => {
    if (!includePurchases) return []
    return generateTallyPurchaseVouchers(filteredPurchases, suppliers, items, ledgerMapping, companyStateCode)
  }, [includePurchases, filteredPurchases, suppliers, items, ledgerMapping, companyStateCode])

  const noteVouchers = useMemo(() => {
    if (!includeNotes) return []
    const cn = generateTallyCreditNoteVouchers(filteredCreditNotes, customers, ledgerMapping, companyStateCode)
    const dn = generateTallyDebitNoteVouchers(filteredDebitNotes, suppliers, ledgerMapping, companyStateCode)
    return [...cn, ...dn]
  }, [includeNotes, filteredCreditNotes, filteredDebitNotes, customers, suppliers, ledgerMapping, companyStateCode])

  const expenseVouchers = useMemo(() => {
    if (!includeExpenses) return []
    return generateTallyExpenseVouchers(filteredExpenses, expenseTypes, ledgerMapping, companyStateCode)
  }, [includeExpenses, filteredExpenses, expenseTypes, ledgerMapping, companyStateCode])

  const paymentVouchers = useMemo(() => {
    if (!includePayments) return []
    const supplierMap = new Map(suppliers.map(s => [s.id, s]))
    const customerMap = new Map(customers.map(c => [c.id, c]))

    const list: TallyCompoundVoucher[] = []

    filteredPayments.forEach((p, idx) => {
      const sup = supplierMap.get(p.supplierId)
      const partyName = sup?.name || 'Supplier Account'
      list.push({
        id: p.id || `pay-${idx}`,
        voucherNumber: `PAY-${p.paymentDate?.replace(/-/g, '') || '000'}-${idx + 1}`,
        voucherDate: p.paymentDate || new Date().toISOString().split('T')[0],
        displayDate: p.paymentDate || '',
        voucherType: 'Payment',
        partyName,
        partyAddress: [sup?.address, sup?.city].filter(Boolean).join(', '),
        partyPincode: sup?.pincode,
        partyGstin: sup?.gstin,
        narration: `Being payment of ₹${p.amount} made to ${partyName}`,
        legs: [
          { ledgerName: partyName, amount: p.amount, drCr: 'Dr' },
          { ledgerName: p.counterName || ledgerMapping.defaultBankLedgerName, amount: p.amount, drCr: 'Cr' }
        ],
        totalAmount: p.amount,
        isBalanced: true,
        imbalanceDifference: 0
      })
    })

    filteredCustomerPayments.forEach((cp, idx) => {
      const cust = customerMap.get(cp.customerId)
      const partyName = cust?.name || 'Customer Account'
      list.push({
        id: cp.id || `rec-${idx}`,
        voucherNumber: `REC-${cp.paymentDate?.replace(/-/g, '') || '000'}-${idx + 1}`,
        voucherDate: cp.paymentDate || new Date().toISOString().split('T')[0],
        displayDate: cp.paymentDate || '',
        voucherType: 'Receipt',
        partyName,
        partyAddress: [cust?.address, cust?.city].filter(Boolean).join(', '),
        partyPincode: cust?.pincode,
        partyGstin: cust?.gstin,
        narration: `Being receipt of ₹${cp.amount} received from ${partyName}`,
        legs: [
          { ledgerName: cp.counterName || ledgerMapping.defaultBankLedgerName, amount: cp.amount, drCr: 'Dr' },
          { ledgerName: partyName, amount: cp.amount, drCr: 'Cr' }
        ],
        totalAmount: cp.amount,
        isBalanced: true,
        imbalanceDifference: 0
      })
    })

    return list
  }, [includePayments, filteredPayments, filteredCustomerPayments, suppliers, customers, ledgerMapping])

  // Total selected compound vouchers
  const allSelectedVouchers = useMemo(() => {
    return [
      ...salesVouchers,
      ...purchaseVouchers,
      ...noteVouchers,
      ...expenseVouchers,
      ...paymentVouchers
    ]
  }, [salesVouchers, purchaseVouchers, noteVouchers, expenseVouchers, paymentVouchers])

  const allSelectedCount = allSelectedVouchers.length
  const totalSelectedValue = allSelectedVouchers.reduce((s, v) => s + v.totalAmount, 0)

  // Toggle All
  const isAllChecked = includeSales && includePurchases && includeNotes && includeExpenses && includePayments
  const handleToggleSelectAll = () => {
    const next = !isAllChecked
    setIncludeSales(next)
    setIncludePurchases(next)
    setIncludeNotes(next)
    setIncludeExpenses(next)
    setIncludePayments(next)
  }

  // Export Actions
  const handleDownloadExcel = () => {
    if (allSelectedCount === 0) {
      toast.warning('Please select at least one module with available vouchers')
      return
    }
    const filename = `Tally_Prime_Export_${businessName.replace(/\s+/g, '_')}_${Date.now()}.xlsx`
    exportCompoundVouchersToTallyExcel(allSelectedVouchers, { filename })
    toast.success(`Exported ${allSelectedCount} Tally Prime multi-line vouchers to Excel`)
    onOpenChange(false)
  }

  const handleDownloadXML = () => {
    if (allSelectedCount === 0) {
      toast.warning('Please select at least one module with available vouchers')
      return
    }
    const xml = generateTallyXML(allSelectedVouchers, businessName)
    const filename = `Tally_Prime_Import_${businessName.replace(/\s+/g, '_')}_${Date.now()}.xml`
    downloadTallyXML(xml, filename)
    toast.success(`Generated Tally Prime XML with ${allSelectedCount} statutory double-entry vouchers`)
    onOpenChange(false)
  }

  const handleSaveLedgerMapping = () => {
    setLedgerMapping(tempMapping)
    try {
      localStorage.setItem(STORAGE_KEY_TALLY_MAPPING, JSON.stringify(tempMapping))
      toast.success('Tally Ledger Mapping saved successfully')
    } catch {
      toast.info('Saved in current session')
    }
    setIsMappingDialogOpen(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[620px] max-h-[90dvh] flex flex-col p-0 overflow-hidden rounded-2xl">
          <DialogHeader className="p-6 pb-4 border-b border-slate-100 shrink-0 space-y-1.5">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-lg font-bold flex items-center gap-2 text-slate-900">
                <span className="p-2 rounded-xl bg-violet-50 text-violet-700 border border-violet-100">
                  <Building className="w-5 h-5" weight="duotone" />
                </span>
                Export Transactions to Tally Prime
              </DialogTitle>
              <Badge variant="outline" className="text-xs bg-violet-50 text-violet-700 border-violet-200 font-semibold">
                Multi-Leg Double Entry
              </Badge>
            </div>
            <DialogDescription className="text-xs text-slate-500">
              Select transaction modules and period to export balanced accounting vouchers directly into Tally Prime Excel or XML format.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Period Filter Bar */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <CalendarBlank className="w-4 h-4 text-violet-600" />
                  1. Select Filing Period / Date Range
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="h-9 flex-1 bg-white text-xs font-medium">
                    <SelectValue placeholder="Select Month" />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_OPTIONS.map(m => (
                      <SelectItem key={m.value} value={m.value} className="text-xs">
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="h-9 w-28 bg-white text-xs font-medium">
                    <SelectValue placeholder="Year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2025" className="text-xs">2025</SelectItem>
                    <SelectItem value="2026" className="text-xs">2026</SelectItem>
                    <SelectItem value="2027" className="text-xs">2027</SelectItem>
                    <SelectItem value="2028" className="text-xs">2028</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Module Selection Checkboxes */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">
                  2. Select Modules to Include in Export
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleToggleSelectAll}
                  className="h-6 text-[11px] font-bold text-violet-600 hover:text-violet-700 hover:bg-violet-50 px-2"
                >
                  {isAllChecked ? 'Deselect All' : 'Select All'}
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-2 bg-slate-50/50 p-3 rounded-xl border border-slate-200/80 text-xs">
                {/* Sales Invoices */}
                <label className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200/60 hover:border-violet-300 transition-all cursor-pointer">
                  <div className="flex items-center gap-2.5">
                    <Checkbox checked={includeSales} onCheckedChange={v => setIncludeSales(!!v)} />
                    <div>
                      <span className="font-semibold text-slate-800">Sales Invoices</span>
                      <p className="text-[11px] text-slate-400">Dr Customer, Cr Sales, Cr Output Taxes, Round Off</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="font-mono text-[11px]">
                    {filteredSales.length} Vouchers
                  </Badge>
                </label>

                {/* Purchase Invoices */}
                <label className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200/60 hover:border-violet-300 transition-all cursor-pointer">
                  <div className="flex items-center gap-2.5">
                    <Checkbox checked={includePurchases} onCheckedChange={v => setIncludePurchases(!!v)} />
                    <div>
                      <span className="font-semibold text-slate-800">Purchase Invoices</span>
                      <p className="text-[11px] text-slate-400">Cr Supplier, Dr Purchase, Dr Input Taxes, Round Off</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="font-mono text-[11px]">
                    {filteredPurchases.length} Vouchers
                  </Badge>
                </label>

                {/* Credit & Debit Notes */}
                <label className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200/60 hover:border-violet-300 transition-all cursor-pointer">
                  <div className="flex items-center gap-2.5">
                    <Checkbox checked={includeNotes} onCheckedChange={v => setIncludeNotes(!!v)} />
                    <div>
                      <span className="font-semibold text-slate-800">Credit & Debit Notes</span>
                      <p className="text-[11px] text-slate-400">Customer CN & Supplier DN with original invoice link & tax reversals</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="font-mono text-[11px]">
                    {filteredCreditNotes.length + filteredDebitNotes.length} Vouchers
                  </Badge>
                </label>

                {/* Operating Expenses & GTA RCM */}
                <label className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200/60 hover:border-violet-300 transition-all cursor-pointer">
                  <div className="flex items-center gap-2.5">
                    <Checkbox checked={includeExpenses} onCheckedChange={v => setIncludeExpenses(!!v)} />
                    <div>
                      <span className="font-semibold text-slate-800">Expenses & GTA Freight RCM</span>
                      <p className="text-[11px] text-slate-400">Operational expenses with GST breakdown + Dual RCM journal vouchers</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="font-mono text-[11px]">
                    {filteredExpenses.length} Vouchers
                  </Badge>
                </label>

                {/* Customer Receipts & Supplier Payments */}
                <label className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200/60 hover:border-violet-300 transition-all cursor-pointer">
                  <div className="flex items-center gap-2.5">
                    <Checkbox checked={includePayments} onCheckedChange={v => setIncludePayments(!!v)} />
                    <div>
                      <span className="font-semibold text-slate-800">Bank Receipts & Payments</span>
                      <p className="text-[11px] text-slate-400">Customer bank receipts & Supplier payment payouts</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="font-mono text-[11px]">
                    {filteredPayments.length + filteredCustomerPayments.length} Vouchers
                  </Badge>
                </label>
              </div>
            </div>

            {/* Live Selection Summary Banner */}
            <div className="bg-violet-50/60 border border-violet-100 p-3 rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-violet-700 shrink-0" weight="bold" />
                <span className="font-medium text-violet-950">
                  Ready to Export: <strong className="font-bold">{allSelectedCount} Vouchers</strong>
                </span>
              </div>
              <span className="font-mono font-extrabold text-violet-900">
                Total Value: {formatCurrency(totalSelectedValue)}
              </span>
            </div>
          </div>

          {/* Footer Actions */}
          <DialogFooter className="p-4 border-t border-slate-100 bg-slate-50/50 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTempMapping(ledgerMapping)
                setIsMappingDialogOpen(true)
              }}
              className="text-xs h-9 font-semibold rounded-xl border-slate-200 text-slate-700"
            >
              <Gear className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
              Configure Ledgers
            </Button>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadXML}
                disabled={allSelectedCount === 0}
                className="text-xs h-9 font-bold rounded-xl border-violet-200 text-violet-700 hover:bg-violet-50"
              >
                <FileCode className="w-4 h-4 mr-1.5" />
                Download XML
              </Button>

              <Button
                size="sm"
                onClick={handleDownloadExcel}
                disabled={allSelectedCount === 0}
                className="text-xs h-9 font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
              >
                <FileXls className="w-4 h-4 mr-1.5" />
                Download Excel (.xlsx)
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ledger Mapping Dialog */}
      <Dialog open={isMappingDialogOpen} onOpenChange={setIsMappingDialogOpen}>
        <DialogContent className="sm:max-w-[540px] max-h-[90dvh] flex flex-col p-0 overflow-hidden rounded-2xl">
          <DialogHeader className="p-5 border-b border-slate-100 shrink-0">
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Gear className="w-5 h-5 text-violet-600" weight="duotone" />
              Tally Ledger Name Configuration
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Customize chart-of-accounts ledger names to match your Tally Prime company masters.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-5">
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
          </div>

          <DialogFooter className="p-4 border-t border-slate-100 bg-slate-50/50 shrink-0 gap-2">
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
    </>
  )
}

import {
  parseTallyXmlVouchers,
  decodeXmlFileBuffer,
  TallyParsedXmlVoucher,
  TallyNewMasterCandidates
} from '@/lib/tally-xml-parser'
import { Counter, CashBankTransaction } from '@/lib/cash-bank-types'

export interface VoucherRowOverride {
  included: boolean
  typeOverride?: TallyParsedXmlVoucher['normalizedType']
  matchedEntityType?: 'customer' | 'supplier' | 'expense' | 'counter' | 'unmapped'
  matchedEntityId?: string
  partyName?: string
  categoryId?: string
  fromCounterId?: string
  toCounterId?: string
}

export interface TallyImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customers?: Customer[]
  suppliers?: Supplier[]
  items?: Item[]
  expenseTypes?: ExpenseType[]
  counters?: Counter[]
  onCommitImport?: (
    newPayments: Payment[],
    newCustomerPayments: CustomerPayment[],
    summary?: { importedCount: number; skippedCount: number },
    extraEntities?: {
      salesInvoices?: SalesInvoice[]
      purchaseInvoices?: PurchaseInvoice[]
      creditNotes?: CustomerCreditNote[]
      debitNotes?: SupplierDebitNote[]
      expenseEntries?: ExpenseEntry[]
      cashBankTransactions?: CashBankTransaction[]
      newCustomers?: Customer[]
      newSuppliers?: Supplier[]
      newExpenseTypes?: ExpenseType[]
      newCounters?: Counter[]
      newItems?: Item[]
    }
  ) => void
}

export function TallyImportDialog({
  open,
  onOpenChange,
  customers = [],
  suppliers = [],
  items = [],
  expenseTypes = [],
  counters = [],
  onCommitImport
}: TallyImportDialogProps) {
  const [parsedVouchers, setParsedVouchers] = useState<TallyParsedXmlVoucher[]>([])
  const [candidateMasters, setCandidateMasters] = useState<TallyNewMasterCandidates | null>(null)
  const [autoCreateMasters, setAutoCreateMasters] = useState(true)
  const [isParsing, setIsParsing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Interactive UI state
  const [overrides, setOverrides] = useState<Record<string, VoucherRowOverride>>({})
  const [expandedVoucherId, setExpandedVoucherId] = useState<string | null>(null)
  const [filterTab, setFilterTab] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Inventory Item Selector & Master Mapping State
  const [itemMappings, setItemMappings] = useState<Record<string, string>>({})
  const [itemOverrides, setItemOverrides] = useState<Record<string, Record<number, string>>>({})
  const [showItemMappingDrawer, setShowItemMappingDrawer] = useState(false)
  const [itemSearchQuery, setItemSearchQuery] = useState('')

  const handleGlobalItemMapping = (tallyItemName: string, targetItemId: string) => {
    const norm = tallyItemName.trim().toLowerCase()
    setItemMappings(prev => ({
      ...prev,
      [norm]: targetItemId
    }))
  }

  const handleVoucherItemOverride = (voucherId: string, itemIndex: number, targetItemId: string) => {
    setItemOverrides(prev => ({
      ...prev,
      [voucherId]: {
        ...(prev[voucherId] || {}),
        [itemIndex]: targetItemId
      }
    }))
  }

  // Module-wise Category Filter State
  const [selectedModules, setSelectedModules] = useState<{
    sales: boolean
    purchase: boolean
    receipt: boolean
    payment: boolean
    expense: boolean
    contra: boolean
    credit_note: boolean
    debit_note: boolean
  }>({
    sales: true,
    purchase: true,
    receipt: true,
    payment: true,
    expense: true,
    contra: true,
    credit_note: true,
    debit_note: true
  })

  const toggleModule = (mod: string, enabled: boolean) => {
    setSelectedModules(prev => ({ ...prev, [mod]: enabled }))
  }

  const selectOnlyInvoices = () => {
    setSelectedModules({
      sales: true,
      purchase: true,
      receipt: false,
      payment: false,
      expense: false,
      contra: false,
      credit_note: true,
      debit_note: true
    })
  }

  const selectOnlyBanking = () => {
    setSelectedModules({
      sales: false,
      purchase: false,
      receipt: true,
      payment: true,
      expense: true,
      contra: true,
      credit_note: false,
      debit_note: false
    })
  }

  const selectAllModules = () => {
    setSelectedModules({
      sales: true,
      purchase: true,
      receipt: true,
      payment: true,
      expense: true,
      contra: true,
      credit_note: true,
      debit_note: true
    })
  }

  const deselectAllModules = () => {
    setSelectedModules({
      sales: false,
      purchase: false,
      receipt: false,
      payment: false,
      expense: false,
      contra: false,
      credit_note: false,
      debit_note: false
    })
  }

  const supplierMap = useMemo(() => new Map(suppliers.map(s => [s.name.trim().toLowerCase(), s])), [suppliers])
  const customerMap = useMemo(() => new Map(customers.map(c => [c.name.trim().toLowerCase(), c])), [customers])
  const counterMap = useMemo(() => new Map(counters.map(c => [c.name.trim().toLowerCase(), c])), [counters])
  const expenseTypeMap = useMemo(() => new Map(expenseTypes.map(e => [e.name.trim().toLowerCase(), e])), [expenseTypes])
  const itemMap = useMemo(() => {
    const map = new Map(items.map(it => [it.name.trim().toLowerCase(), it]))
    items.forEach(it => {
      if (it.itemCode) map.set(it.itemCode.trim().toLowerCase(), it)
    })
    return map
  }, [items])

  const processedList = useMemo(() => {
    return parsedVouchers.map(v => {
      const override = overrides[v.id]
      const effectiveType = override?.typeOverride || v.normalizedType
      let partyName = (override?.partyName || v.partyName).trim()
      const normParty = partyName.toLowerCase()

      let matchedEntityType = override?.matchedEntityType || v.matchedEntityType || 'unmapped'
      let matchedEntityId = override?.matchedEntityId || v.matchedEntityId
      let contraDetails = v.contraDetails
      let expenseDetails = v.expenseDetails
      let isAutoCreated = false

      if (effectiveType === 'contra') {
        const fromName = v.contraDetails?.fromCounterName || v.legs.find(l => l.drCr === 'Cr')?.ledgerName || ''
        const toName = v.contraDetails?.toCounterName || v.legs.find(l => l.drCr === 'Dr')?.ledgerName || ''
        const fromId = override?.fromCounterId || v.contraDetails?.fromCounterId || counterMap.get(fromName.trim().toLowerCase())?.id
        const toId = override?.toCounterId || v.contraDetails?.toCounterId || counterMap.get(toName.trim().toLowerCase())?.id

        contraDetails = {
          fromCounterName: fromName,
          toCounterName: toName,
          fromCounterId: fromId,
          toCounterId: toId,
          amount: v.totalAmount
        }

        if (fromId && toId) {
          matchedEntityType = 'counter'
          matchedEntityId = toId
        } else if (autoCreateMasters) {
          matchedEntityType = 'counter'
          isAutoCreated = true
        } else {
          matchedEntityType = 'unmapped'
        }
      } else if (effectiveType === 'payment') {
        if (matchedEntityType === 'supplier') {
          matchedEntityId = matchedEntityId || supplierMap.get(normParty)?.id
          if (!matchedEntityId && autoCreateMasters) {
            isAutoCreated = true
          }
        } else if (matchedEntityType === 'customer') {
          matchedEntityId = matchedEntityId || customerMap.get(normParty)?.id
          if (!matchedEntityId && autoCreateMasters) {
            isAutoCreated = true
          }
        } else if (matchedEntityType === 'expense') {
          matchedEntityId = matchedEntityId || expenseTypeMap.get(normParty)?.id
          if (!matchedEntityId && autoCreateMasters) {
            isAutoCreated = true
          }
        } else if (matchedEntityType === 'unmapped') {
          if (supplierMap.has(normParty)) {
            matchedEntityType = 'supplier'
            matchedEntityId = supplierMap.get(normParty)?.id
          } else if (autoCreateMasters) {
            matchedEntityType = 'supplier'
            isAutoCreated = true
          }
        }
      } else if (effectiveType === 'expense') {
        const catId = expenseDetails?.categoryId || matchedEntityId || expenseTypeMap.get(normParty)?.id
        if (catId) {
          matchedEntityType = 'expense'
          matchedEntityId = catId
        } else if (autoCreateMasters) {
          matchedEntityType = 'expense'
          isAutoCreated = true
        } else {
          matchedEntityType = 'unmapped'
        }
        expenseDetails = {
          categoryId: matchedEntityId,
          categoryName: partyName,
          amount: v.totalAmount,
          paymentAccountId: v.legs.find(l => l.drCr === 'Cr')?.ledgerName,
          paymentAccountName: v.legs.find(l => l.drCr === 'Cr')?.ledgerName
        }
      } else if (effectiveType === 'receipt') {
        if (matchedEntityType === 'customer') {
          matchedEntityId = matchedEntityId || customerMap.get(normParty)?.id
          if (!matchedEntityId && autoCreateMasters) {
            isAutoCreated = true
          }
        } else if (matchedEntityType === 'supplier') {
          matchedEntityId = matchedEntityId || supplierMap.get(normParty)?.id
          if (!matchedEntityId && autoCreateMasters) {
            isAutoCreated = true
          }
        } else if (matchedEntityType === 'unmapped') {
          if (customerMap.has(normParty)) {
            matchedEntityType = 'customer'
            matchedEntityId = customerMap.get(normParty)?.id
          } else if (autoCreateMasters) {
            matchedEntityType = 'customer'
            isAutoCreated = true
          }
        }
      } else if (effectiveType === 'sales' || effectiveType === 'credit_note') {
        if (matchedEntityType === 'customer') {
          matchedEntityId = matchedEntityId || customerMap.get(normParty)?.id
          if (!matchedEntityId && autoCreateMasters) {
            isAutoCreated = true
          }
        } else if (matchedEntityType === 'unmapped') {
          if (customerMap.has(normParty)) {
            matchedEntityType = 'customer'
            matchedEntityId = customerMap.get(normParty)?.id
          } else if (autoCreateMasters) {
            matchedEntityType = 'customer'
            isAutoCreated = true
          }
        }
      } else if (effectiveType === 'purchase' || effectiveType === 'debit_note') {
        if (matchedEntityType === 'supplier') {
          matchedEntityId = matchedEntityId || supplierMap.get(normParty)?.id
          if (!matchedEntityId && autoCreateMasters) {
            isAutoCreated = true
          }
        } else if (matchedEntityType === 'unmapped') {
          if (supplierMap.has(normParty)) {
            matchedEntityType = 'supplier'
            matchedEntityId = supplierMap.get(normParty)?.id
          } else if (autoCreateMasters) {
            matchedEntityType = 'supplier'
            isAutoCreated = true
          }
        }
      }

      // Check and resolve inventory items
      const resolvedInventory = (v.inventory || []).map((inv, iIdx) => {
        const normItem = inv.itemName.trim().toLowerCase()
        const customMappedId = itemOverrides[v.id]?.[iIdx] || itemMappings[normItem]
        const matchedItem = (customMappedId && customMappedId !== 'auto-create')
          ? items.find(it => it.id === customMappedId) || itemMap.get(normItem)
          : itemMap.get(normItem)

        const isAutoCreatedItem = !matchedItem && (customMappedId === 'auto-create' || autoCreateMasters)
        const isUnmapped = !matchedItem && !isAutoCreatedItem

        return {
          ...inv,
          customMappedId,
          matchedItemId: matchedItem?.id,
          matchedItemName: matchedItem?.name,
          matchedItemUnit: matchedItem?.unit || inv.unit || 'PCS',
          isAutoCreatedItem,
          isUnmapped
        }
      })

      const unmappedItems = resolvedInventory.filter(inv => inv.isUnmapped)
      const hasUnmappedItem = unmappedItems.length > 0

      let unmappedReason = v.skipReason
      if (effectiveType !== 'skipped') {
        if (matchedEntityType === 'unmapped') {
          unmappedReason = `Unmapped Party / Account: ${partyName}`
        } else if (hasUnmappedItem) {
          unmappedReason = `Unmapped Item: ${unmappedItems.map(i => i.itemName).join(', ')}`
        } else {
          unmappedReason = undefined
        }
      }

      const isIncluded = override?.included !== undefined ? override.included : (effectiveType !== 'skipped')

      return {
        ...v,
        inventory: resolvedInventory,
        effectiveType,
        partyName,
        matchedEntityType,
        matchedEntityId,
        contraDetails,
        expenseDetails,
        isAutoCreated,
        isIncluded,
        hasUnmappedItem,
        unmappedItemNames: unmappedItems.map(i => i.itemName),
        skipReason: unmappedReason
      }
    })
  }, [parsedVouchers, overrides, itemMappings, itemOverrides, supplierMap, customerMap, counterMap, expenseTypeMap, itemMap, items, autoCreateMasters])

  // Distinct Tally Items across all vouchers for master item selector
  const distinctTallyItems = useMemo(() => {
    const map = new Map<string, {
      rawName: string
      normName: string
      totalQty: number
      unit: string
      sampleRate: number
      voucherCount: number
      matchedItem: Item | null
      isAutoCreate: boolean
    }>()

    processedList.forEach(v => {
      const modKey = v.effectiveType as keyof typeof selectedModules
      if (modKey in selectedModules && !selectedModules[modKey]) return
      if (v.effectiveType === 'skipped') return

      (v.inventory || []).forEach(inv => {
        const raw = inv.itemName.trim()
        const norm = raw.toLowerCase()
        if (!map.has(norm)) {
          const mappedId = itemMappings[norm]
          const existingItem = mappedId && mappedId !== 'auto-create'
            ? items.find(it => it.id === mappedId)
            : itemMap.get(norm) || null

          map.set(norm, {
            rawName: raw,
            normName: norm,
            totalQty: 0,
            unit: inv.unit || 'PCS',
            sampleRate: inv.rate,
            voucherCount: 0,
            matchedItem: existingItem || null,
            isAutoCreate: mappedId === 'auto-create' || (!existingItem && autoCreateMasters)
          })
        }

        const entry = map.get(norm)!
        entry.totalQty += inv.quantity || 0
        entry.voucherCount += 1
        if (inv.rate > 0) entry.sampleRate = inv.rate
      })
    })

    return Array.from(map.values())
  }, [processedList, selectedModules, itemMappings, itemMap, items, autoCreateMasters])

  // Filtered distinct items for search
  const filteredDistinctItems = useMemo(() => {
    if (!itemSearchQuery.trim()) return distinctTallyItems
    const q = itemSearchQuery.toLowerCase().trim()
    return distinctTallyItems.filter(it => it.rawName.toLowerCase().includes(q) || (it.matchedItem && it.matchedItem.name.toLowerCase().includes(q)))
  }, [distinctTallyItems, itemSearchQuery])

  // Compute live counts per module
  const moduleCounts = useMemo(() => {
    const counts = {
      sales: 0,
      purchase: 0,
      receipt: 0,
      payment: 0,
      expense: 0,
      contra: 0,
      credit_note: 0,
      debit_note: 0
    }
    processedList.forEach(v => {
      const t = v.effectiveType as keyof typeof counts
      if (t in counts) {
        counts[t]++
      }
    })
    return counts
  }, [processedList])

  // Count candidates for display filtered by active selected modules
  const newMastersSummary = useMemo(() => {
    const custSet = new Set<string>()
    const suppSet = new Set<string>()
    const expSet = new Set<string>()
    const cntrSet = new Set<string>()
    const itemSet = new Set<string>()

    processedList.forEach(v => {
      if (v.effectiveType === 'skipped') return
      const modKey = v.effectiveType as keyof typeof selectedModules
      if (modKey in selectedModules && !selectedModules[modKey]) return

      const norm = v.partyName.trim().toLowerCase()
      if (v.isAutoCreated) {
        if (v.matchedEntityType === 'customer' && !customerMap.has(norm)) custSet.add(v.partyName.trim())
        if (v.matchedEntityType === 'supplier' && !supplierMap.has(norm)) suppSet.add(v.partyName.trim())
        if (v.matchedEntityType === 'expense' && !expenseTypeMap.has(norm)) expSet.add(v.partyName.trim())
      }
      (v.inventory || []).forEach(inv => {
        if (inv.isAutoCreatedItem) itemSet.add(inv.itemName.trim())
      })
      if (v.effectiveType === 'contra') {
        const fromName = (v.contraDetails?.fromCounterName || '').trim()
        const toName = (v.contraDetails?.toCounterName || '').trim()
        if (fromName && !counterMap.has(fromName.toLowerCase())) cntrSet.add(fromName)
        if (toName && !counterMap.has(toName.toLowerCase())) cntrSet.add(toName)
      }
    })

    return {
      customersCount: custSet.size,
      suppliersCount: suppSet.size,
      expensesCount: expSet.size,
      countersCount: cntrSet.size,
      itemsCount: itemSet.size
    }
  }, [processedList, customerMap, supplierMap, expenseTypeMap, counterMap, selectedModules])

  // Summary counts
  const totalCount = processedList.length
  const matchedCount = processedList.filter(v => v.effectiveType !== 'skipped' && v.matchedEntityType !== 'unmapped' && !v.hasUnmappedItem).length
  const unmappedCount = processedList.filter(v => v.effectiveType !== 'skipped' && (v.matchedEntityType === 'unmapped' || v.hasUnmappedItem)).length
  const skippedCount = processedList.filter(v => v.effectiveType === 'skipped').length
  const selectedCount = processedList.filter(v => {
    if (!v.isIncluded || v.effectiveType === 'skipped') return false
    const modKey = v.effectiveType as keyof typeof selectedModules
    if (modKey in selectedModules && !selectedModules[modKey]) return false
    return true
  }).length

  // Filtered list based on active tab, search query, and module selection
  const filteredList = useMemo(() => {
    return processedList.filter(v => {
      // 0. Module Filter
      const modKey = v.effectiveType as keyof typeof selectedModules
      if (modKey in selectedModules && !selectedModules[modKey]) {
        return false
      }

      // 1. Tab Filter
      if (filterTab === 'matched') {
        if (v.effectiveType === 'skipped' || v.matchedEntityType === 'unmapped' || v.hasUnmappedItem) return false
      } else if (filterTab === 'unmapped') {
        if (v.effectiveType === 'skipped' || (v.matchedEntityType !== 'unmapped' && !v.hasUnmappedItem)) return false
      } else if (filterTab === 'skipped') {
        if (v.effectiveType !== 'skipped') return false
      } else if (filterTab === 'notes') {
        if (v.effectiveType !== 'credit_note' && v.effectiveType !== 'debit_note') return false
      } else if (filterTab !== 'all') {
        if (v.effectiveType !== filterTab) return false
      }

      // 2. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchVch = v.voucherNumber.toLowerCase().includes(q)
        const matchParty = v.partyName.toLowerCase().includes(q)
        const matchAmt = v.totalAmount.toString().includes(q)
        const matchNarr = (v.narration || '').toLowerCase().includes(q)
        const matchLeg = v.legs.some(l => l.ledgerName.toLowerCase().includes(q))
        const matchItem = v.inventory.some(i => i.itemName.toLowerCase().includes(q))
        if (!matchVch && !matchParty && !matchAmt && !matchNarr && !matchLeg && !matchItem) return false
      }

      return true
    })
  }, [processedList, filterTab, searchQuery, selectedModules])

  // Bulk Actions
  const handleSelectAll = (select: boolean) => {
    setOverrides(prev => {
      const next = { ...prev }
      filteredList.forEach(v => {
        next[v.id] = { ...(next[v.id] || { included: select }), included: select }
      })
      return next
    })
  }

  const handleSelectMatchedOnly = () => {
    setOverrides(prev => {
      const next = { ...prev }
      processedList.forEach(v => {
        const isMatch = v.effectiveType !== 'skipped' && v.matchedEntityType !== 'unmapped' && !v.hasUnmappedItem
        next[v.id] = { ...(next[v.id] || { included: isMatch }), included: isMatch }
      })
      return next
    })
  }

  const handleExcludeUnmapped = () => {
    setOverrides(prev => {
      const next = { ...prev }
      processedList.forEach(v => {
        const isUnmapped = v.effectiveType === 'skipped' || v.matchedEntityType === 'unmapped' || v.hasUnmappedItem
        if (isUnmapped) {
          next[v.id] = { ...(next[v.id] || { included: false }), included: false }
        }
      })
      return next
    })
  }

  const handleTypeOverride = (voucherId: string, newType: TallyParsedXmlVoucher['normalizedType']) => {
    setOverrides(prev => ({
      ...prev,
      [voucherId]: {
        ...(prev[voucherId] || { included: true }),
        typeOverride: newType,
        matchedEntityId: undefined // Reset entity so it recalculates for the new type
      }
    }))
  }

  const handleEntityOverride = (voucherId: string, entityId: string, entityType: 'customer' | 'supplier' | 'expense' | 'counter') => {
    setOverrides(prev => ({
      ...prev,
      [voucherId]: {
        ...(prev[voucherId] || { included: true }),
        matchedEntityType: entityType,
        matchedEntityId: entityId === 'auto-create' ? undefined : entityId
      }
    }))
  }

  const handleIncludeToggle = (voucherId: string, included: boolean) => {
    setOverrides(prev => ({
      ...prev,
      [voucherId]: {
        ...(prev[voucherId] || { included }),
        included
      }
    }))
  }

  const processFile = async (file: File) => {
    setFileName(file.name)
    setIsParsing(true)

    const isXml = file.name.toLowerCase().endsWith('.xml')
    const validExtensions = ['.xml', '.xlsx', '.xls', '.csv']
    const hasValidExt = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext))

    if (!hasValidExt) {
      toast.error('Invalid file format. Please upload an XML (.xml), Excel (.xlsx, .xls) or CSV file.')
      setIsParsing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    try {
      if (isXml) {
        const buffer = await file.arrayBuffer()
        const text = decodeXmlFileBuffer(buffer)
        const result = parseTallyXmlVouchers(text, {
          customers,
          suppliers,
          items,
          expenseTypes,
          counters
        })

        setParsedVouchers(result.vouchers)
        setCandidateMasters(result.newMasterCandidates)

        const initialOverrides: Record<string, VoucherRowOverride> = {}
        result.vouchers.forEach(v => {
          initialOverrides[v.id] = {
            included: v.normalizedType !== 'skipped'
          }
        })
        setOverrides(initialOverrides)

        if (result.success && result.vouchers.length > 0) {
          toast.success(`Successfully parsed ${result.summary.totalParsed} Tally XML voucher(s)`)
        } else if (result.vouchers.length > 0) {
          toast.warning(`Parsed ${result.vouchers.length} voucher(s) with notices: ${result.warnings.join(', ')}`)
        } else {
          toast.error(result.errors[0] || 'No valid vouchers found in XML envelope')
        }
      } else {
        const buffer = await file.arrayBuffer()
        const result = parseTallyAccountingVouchersExcel(buffer, {
          customers,
          suppliers,
          items,
          expenseTypes,
          counters
        } as any)

        setParsedVouchers(result.vouchers)
        setCandidateMasters(result.newMasterCandidates)

        const initialOverrides: Record<string, VoucherRowOverride> = {}
        result.vouchers.forEach(v => {
          initialOverrides[v.id] = {
            included: v.normalizedType !== 'skipped'
          }
        })
        setOverrides(initialOverrides)

        if (result.success && result.vouchers.length > 0) {
          toast.success(`Parsed ${result.vouchers.length} Tally voucher(s) from Excel`)
        } else if (result.vouchers.length > 0) {
          toast.warning(`Parsed ${result.vouchers.length} voucher(s) with validation notices`)
        } else {
          toast.error(result.errors[0] || 'No valid vouchers found in file')
        }
      }
    } catch (err: any) {
      toast.error(`Import failed: ${err?.message || 'Error processing file'}`)
    } finally {
      setIsParsing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    await processFile(files[0])
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      await processFile(files[0])
    }
  }

  const handleCommit = () => {
    const newPayments: Payment[] = []
    const newCustomerPayments: CustomerPayment[] = []
    const newSalesInvoices: SalesInvoice[] = []
    const newPurchaseInvoices: PurchaseInvoice[] = []
    const newCreditNotes: CustomerCreditNote[] = []
    const newDebitNotes: SupplierDebitNote[] = []
    const newExpenseEntries: ExpenseEntry[] = []
    const newCashBankTransactions: CashBankTransaction[] = []

    const generatedCustomers: Customer[] = []
    const generatedSuppliers: Supplier[] = []
    const generatedExpenseTypes: ExpenseType[] = []
    const generatedCounters: Counter[] = []
    const generatedItems: Item[] = []

    const autoCustMap = new Map<string, string>()
    const autoSuppMap = new Map<string, string>()
    const autoExpMap = new Map<string, string>()
    const autoCntrMap = new Map<string, string>()
    const autoItemMap = new Map<string, string>()

    const activeModuleVouchers = processedList.filter(v => {
      const modKey = v.effectiveType as keyof typeof selectedModules
      if (modKey in selectedModules && !selectedModules[modKey]) return false
      return true
    })

    if (autoCreateMasters) {
      const timestamp = Date.now()
      let custSeq = 0, suppSeq = 0, expSeq = 0, cntrSeq = 0, itemSeq = 0

      activeModuleVouchers.forEach(v => {
        if (!v.isIncluded || v.effectiveType === 'skipped') return
        const norm = v.partyName.trim().toLowerCase()

        if (v.isAutoCreated) {
          if (v.matchedEntityType === 'customer' && !customerMap.has(norm) && !autoCustMap.has(norm)) {
            custSeq++
            const newId = `cust-auto-${timestamp}-${custSeq}`
            autoCustMap.set(norm, newId)
            generatedCustomers.push({
              id: newId,
              name: v.partyName.trim(),
              gstin: v.partyGstin || '',
              address: '',
              stateCode: '19',
              createdAt: timestamp
            } as Customer)
          } else if (v.matchedEntityType === 'supplier' && !supplierMap.has(norm) && !autoSuppMap.has(norm)) {
            suppSeq++
            const newId = `supp-auto-${timestamp}-${suppSeq}`
            autoSuppMap.set(norm, newId)
            generatedSuppliers.push({
              id: newId,
              name: v.partyName.trim(),
              gstin: v.partyGstin || '',
              address: '',
              stateCode: '19',
              paymentCDRules: [],
              invoiceCloseCDRules: [],
              createdAt: timestamp
            } as Supplier)
          } else if (v.matchedEntityType === 'expense' && !expenseTypeMap.has(norm) && !autoExpMap.has(norm)) {
            expSeq++
            const newId = `exp-auto-${timestamp}-${expSeq}`
            autoExpMap.set(norm, newId)
            generatedExpenseTypes.push({
              id: newId,
              name: v.partyName.trim(),
              linkType: 'netprofit',
              costLinkingType: 'net_profit'
            } as ExpenseType)
          }
        }

        // Auto-Create Missing Inventory Items (Only those NOT mapped to an existing ERP item)
        (v.inventory || []).forEach((inv, iIdx) => {
          const normItem = inv.itemName.trim().toLowerCase()
          const customMappingId = itemOverrides[v.id]?.[iIdx] || itemMappings[normItem]
          const isMappedToExisting = customMappingId && customMappingId !== 'auto-create' && items.some(it => it.id === customMappingId)
          const isExactMatch = itemMap.has(normItem)

          if (!isMappedToExisting && !isExactMatch && !autoItemMap.has(normItem)) {
            itemSeq++
            const newId = `item-auto-${timestamp}-${itemSeq}`
            autoItemMap.set(normItem, newId)
            generatedItems.push({
              id: newId,
              name: inv.itemName.trim(),
              unit: inv.unit || 'PCS',
              purchasePrice: inv.rate || 0,
              salesPrice: inv.rate || 0,
              gstRate: 18,
              openingStock: 0,
              openingValue: 0
            } as Item)
          }
        })

        // Check Contra Counters
        if (v.effectiveType === 'contra') {
          const fromName = (v.contraDetails?.fromCounterName || '').trim()
          const toName = (v.contraDetails?.toCounterName || '').trim()

          if (fromName && !counterMap.has(fromName.toLowerCase()) && !autoCntrMap.has(fromName.toLowerCase())) {
            cntrSeq++
            const newId = `cntr-auto-${timestamp}-${cntrSeq}`
            autoCntrMap.set(fromName.toLowerCase(), newId)
            generatedCounters.push({
              id: newId,
              name: fromName,
              type: fromName.toLowerCase().includes('cash') ? 'Cash' : 'Bank',
              openingBalance: 0,
              currentBalance: 0
            } as Counter)
          }

          if (toName && !counterMap.has(toName.toLowerCase()) && !autoCntrMap.has(toName.toLowerCase())) {
            cntrSeq++
            const newId = `cntr-auto-${timestamp}-${cntrSeq}`
            autoCntrMap.set(toName.toLowerCase(), newId)
            generatedCounters.push({
              id: newId,
              name: toName,
              type: toName.toLowerCase().includes('cash') ? 'Cash' : 'Bank',
              openingBalance: 0,
              currentBalance: 0
            } as Counter)
          }
        }
      })
    }

    let skipped = 0

    activeModuleVouchers.forEach((v, idx) => {
      if (!v.isIncluded || v.effectiveType === 'skipped' || v.matchedEntityType === 'unmapped' || v.hasUnmappedItem) {
        skipped++
        return
      }

      const normParty = v.partyName.trim().toLowerCase()

      if (v.effectiveType === 'payment' && v.matchedEntityType === 'supplier') {
        const suppId = v.matchedEntityId || autoSuppMap.get(normParty) || supplierMap.get(normParty)?.id
        if (suppId) {
          newPayments.push({
            id: `tally-pay-${Date.now()}-${idx}`,
            supplierId: suppId,
            amount: v.totalAmount,
            paymentDate: v.voucherDate || new Date().toISOString().split('T')[0],
            paymentMode: 'Bank',
            counterName: v.legs.find(l => l.ledgerName !== v.partyName)?.ledgerName || 'Bank Account',
            notes: `Imported from Tally Voucher #${v.voucherNumber}`,
            fy: '2025-2026',
            createdAt: Date.now()
          } as any)
        } else {
          skipped++
        }
      } else if (v.effectiveType === 'expense') {
        const crLeg = v.legs.find(l => l.drCr === 'Cr')
        const expCatId = v.expenseDetails?.categoryId || v.matchedEntityId || autoExpMap.get(normParty) || expenseTypeMap.get(normParty)?.id || 'exp-cat-general'
        newExpenseEntries.push({
          id: `tally-exp-${Date.now()}-${idx}`,
          date: v.voucherDate || new Date().toISOString().split('T')[0],
          expenseDate: v.voucherDate || new Date().toISOString().split('T')[0],
          categoryId: expCatId,
          categoryName: v.expenseDetails?.categoryName || v.partyName,
          expenseTypeId: expCatId,
          amount: v.totalAmount,
          paymentAccountId: crLeg?.ledgerName,
          paymentAccountName: crLeg?.ledgerName || 'Bank Account',
          paymentMode: 'Bank',
          notes: v.narration || `Imported from Tally Expense Voucher #${v.voucherNumber}`,
          fy: '2025-2026',
          createdAt: Date.now()
        } as any)
      } else if (v.effectiveType === 'contra') {
        const fromName = v.contraDetails?.fromCounterName || 'Source Counter'
        const toName = v.contraDetails?.toCounterName || 'Destination Counter'
        const fromId = v.contraDetails?.fromCounterId || autoCntrMap.get(fromName.toLowerCase()) || counterMap.get(fromName.trim().toLowerCase())?.id || 'counter-src'
        const toId = v.contraDetails?.toCounterId || autoCntrMap.get(toName.toLowerCase()) || counterMap.get(toName.trim().toLowerCase())?.id || 'counter-dst'

        newCashBankTransactions.push({
          id: `tally-contra-${Date.now()}-${idx}`,
          date: v.voucherDate || new Date().toISOString().split('T')[0],
          counterId: fromId,
          counterName: fromName,
          type: 'Transfer',
          amount: v.totalAmount,
          toCounterId: toId,
          toCounterName: toName,
          narration: v.narration || `Tally Contra Transfer #${v.voucherNumber}`
        })
      } else if (v.effectiveType === 'receipt' && v.matchedEntityType === 'customer') {
        const custId = v.matchedEntityId || autoCustMap.get(normParty) || customerMap.get(normParty)?.id
        if (custId) {
          newCustomerPayments.push({
            id: `tally-rec-${Date.now()}-${idx}`,
            customerId: custId,
            amount: v.totalAmount,
            paymentDate: v.voucherDate || new Date().toISOString().split('T')[0],
            paymentMode: 'Bank',
            counterName: v.legs.find(l => l.ledgerName !== v.partyName)?.ledgerName || 'Bank Account',
            notes: `Imported from Tally Voucher #${v.voucherNumber}`,
            fy: '2025-2026',
            createdAt: Date.now()
          } as any)
        } else {
          skipped++
        }
      } else if (v.effectiveType === 'sales' && v.matchedEntityType === 'customer') {
        const custId = v.matchedEntityId || autoCustMap.get(normParty) || customerMap.get(normParty)?.id || 'cust-cash'
        const charges: AdditionalCharge[] = (v.additionalCharges || []).map(c => ({
          id: c.id,
          name: c.name || c.chargeName || c.ledgerName || c.remarks || '',
          chargeName: c.chargeName || c.name || c.ledgerName || c.remarks || '',
          remarks: c.remarks || c.name || c.chargeName || c.ledgerName || '',
          sacCode: c.sacCode,
          taxMode: c.taxMode || 'gst',
          basicRate: c.basicRate,
          taxableAmount: c.taxableAmount,
          gstRate: c.gstRate,
          cgstAmount: c.cgstAmount,
          sgstAmount: c.sgstAmount,
          igstAmount: c.igstAmount,
          finalAmt: c.finalAmt
        }))
        const addCost = charges.reduce((s, c) => s + c.finalAmt, 0)
        const addCostBasic = charges.reduce((s, c) => s + c.basicRate, 0)
        const addCostRemarks = charges.map(c => c.remarks || c.name || c.chargeName).filter(Boolean).join(', ')

        const sanitizedItems: InvoiceItem[] = (v.inventory || []).map((inv, iIdx) => {
          const norm = inv.itemName.trim().toLowerCase()
          const customMappedId = itemOverrides[v.id]?.[iIdx] || itemMappings[norm]
          const resolvedItem = (customMappedId && customMappedId !== 'auto-create')
            ? items.find(it => it.id === customMappedId) || itemMap.get(norm)
            : itemMap.get(norm)

          const itemId = resolvedItem?.id || autoItemMap.get(norm) || 'item-gen'
          const itemName = resolvedItem?.name || inv.itemName
          const itemUnit = resolvedItem?.unit || inv.unit || 'PCS'
          const gstRate = resolvedItem?.gstRate ?? 18
          const halfGst = gstRate / 2
          const rawRate = inv.rate
          const rawAmount = inv.amount
          const lineTaxable = rawAmount
          const lineCgst = roundCurrency(lineTaxable * (halfGst / 100))
          const lineSgst = roundCurrency(lineTaxable * (halfGst / 100))
          const grossAmount = roundCurrency(rawAmount * (1 + gstRate / 100))
          const inclusiveRate = roundCurrency(rawRate * (1 + gstRate / 100))

          return {
            itemId,
            baseQuantity: inv.quantity,
            enteredQuantity: inv.quantity,
            enteredUnit: itemUnit,
            basicRate: rawRate,
            baseRate: inclusiveRate,
            enteredRate: inclusiveRate,
            rate: inclusiveRate,
            amount: grossAmount,
            taxableAmount: lineTaxable,
            gstRate,
            cgstRate: halfGst,
            cgstAmount: lineCgst,
            sgstRate: halfGst,
            sgstAmount: lineSgst,
            igstRate: 0,
            igstAmount: 0,
            itemNameSnapshot: itemName,
            itemUnitSnapshot: itemUnit
          }
        })

        newSalesInvoices.push({
          id: `inv-tally-${Date.now()}-${idx}`,
          invoiceNo: v.voucherNumber,
          customerId: custId,
          invoiceDate: v.voucherDate || new Date().toISOString().split('T')[0],
          invoiceAmount: v.totalAmount,
          totalAmount: v.totalAmount,
          additionalCharges: charges.length > 0 ? charges : undefined,
          additionalCost: addCost > 0 ? addCost : undefined,
          additionalCostBasicRate: addCostBasic > 0 ? addCostBasic : undefined,
          additionalCostRemarks: addCostRemarks || undefined,
          roundOff: v.roundOff || undefined,
          roundOffAdjustment: v.roundOff || undefined,
          taxableAmount: v.taxableAmount,
          cgstAmount: v.cgstAmount,
          sgstAmount: v.sgstAmount,
          igstAmount: v.igstAmount,
          items: sanitizedItems,
          fy: '2025-2026',
          history: []
        } as any)
      } else if (v.effectiveType === 'purchase' && v.matchedEntityType === 'supplier') {
        const suppId = v.matchedEntityId || autoSuppMap.get(normParty) || supplierMap.get(normParty)?.id
        if (suppId) {
          const charges: AdditionalCharge[] = (v.additionalCharges || []).map(c => ({
            id: c.id,
            name: c.name || c.chargeName || c.ledgerName || c.remarks || '',
            chargeName: c.chargeName || c.name || c.ledgerName || c.remarks || '',
            remarks: c.remarks || c.name || c.chargeName || c.ledgerName || '',
            sacCode: c.sacCode,
            taxMode: c.taxMode || 'gst',
            basicRate: c.basicRate,
            taxableAmount: c.taxableAmount,
            gstRate: c.gstRate,
            cgstAmount: c.cgstAmount,
            sgstAmount: c.sgstAmount,
            igstAmount: c.igstAmount,
            finalAmt: c.finalAmt
          }))
          const addCost = charges.reduce((s, c) => s + c.finalAmt, 0)
          const addCostBasic = charges.reduce((s, c) => s + c.basicRate, 0)
          const addCostRemarks = charges.map(c => c.remarks || c.name || c.chargeName).filter(Boolean).join(', ')

          const sanitizedItems: InvoiceItem[] = (v.inventory || []).map((inv, iIdx) => {
            const norm = inv.itemName.trim().toLowerCase()
            const customMappedId = itemOverrides[v.id]?.[iIdx] || itemMappings[norm]
            const resolvedItem = (customMappedId && customMappedId !== 'auto-create')
              ? items.find(it => it.id === customMappedId) || itemMap.get(norm)
              : itemMap.get(norm)

            const itemId = resolvedItem?.id || autoItemMap.get(norm) || 'item-gen'
            const itemName = resolvedItem?.name || inv.itemName
            const itemUnit = resolvedItem?.unit || inv.unit || 'PCS'
            const gstRate = resolvedItem?.gstRate ?? 18
            const halfGst = gstRate / 2
            const rawRate = inv.rate
            const rawAmount = inv.amount
            const lineTaxable = rawAmount
            const lineCgst = roundCurrency(lineTaxable * (halfGst / 100))
            const lineSgst = roundCurrency(lineTaxable * (halfGst / 100))
            const grossAmount = roundCurrency(rawAmount * (1 + gstRate / 100))
            const inclusiveRate = roundCurrency(rawRate * (1 + gstRate / 100))

            return {
              itemId,
              baseQuantity: inv.quantity,
              enteredQuantity: inv.quantity,
              enteredUnit: itemUnit,
              basicRate: rawRate,
              baseRate: inclusiveRate,
              enteredRate: inclusiveRate,
              rate: inclusiveRate,
              amount: grossAmount,
              taxableAmount: lineTaxable,
              gstRate,
              cgstRate: halfGst,
              cgstAmount: lineCgst,
              sgstRate: halfGst,
              sgstAmount: lineSgst,
              igstRate: 0,
              igstAmount: 0,
              itemNameSnapshot: itemName,
              itemUnitSnapshot: itemUnit
            }
          })

          newPurchaseInvoices.push({
            id: `pur-tally-${Date.now()}-${idx}`,
            invoiceNo: v.voucherNumber,
            supplierId: suppId,
            invoiceDate: v.voucherDate || new Date().toISOString().split('T')[0],
            invoiceAmount: v.totalAmount,
            totalAmount: v.totalAmount,
            additionalCharges: charges.length > 0 ? charges : undefined,
            additionalCost: addCost > 0 ? addCost : undefined,
            additionalCostBasicRate: addCostBasic > 0 ? addCostBasic : undefined,
            additionalCostRemarks: addCostRemarks || undefined,
            roundOff: v.roundOff || undefined,
            roundOffAdjustment: v.roundOff || undefined,
            taxableAmount: v.taxableAmount,
            cgstAmount: v.cgstAmount,
            sgstAmount: v.sgstAmount,
            igstAmount: v.igstAmount,
            items: sanitizedItems,
            fy: '2025-2026',
            createdAt: Date.now(),
            history: []
          } as any)
        } else {
          skipped++
        }
      } else if (v.effectiveType === 'credit_note' && v.matchedEntityType === 'customer') {
        const custId = v.matchedEntityId || autoCustMap.get(normParty) || customerMap.get(normParty)?.id
        if (custId) {
          newCreditNotes.push({
            id: `tally-cn-${Date.now()}-${idx}`,
            creditNoteNumber: v.voucherNumber,
            customerId: custId,
            date: v.voucherDate || new Date().toISOString().split('T')[0],
            amount: v.totalAmount,
            reason: v.narration || 'Imported from Tally Credit Note',
            createdAt: Date.now()
          } as any)
        } else {
          skipped++
        }
      } else if (v.effectiveType === 'debit_note' && v.matchedEntityType === 'supplier') {
        const suppId = v.matchedEntityId || autoSuppMap.get(normParty) || supplierMap.get(normParty)?.id
        if (suppId) {
          newDebitNotes.push({
            id: `tally-dn-${Date.now()}-${idx}`,
            debitNoteNumber: v.voucherNumber,
            supplierId: suppId,
            date: v.voucherDate || new Date().toISOString().split('T')[0],
            amount: v.totalAmount,
            reason: v.narration || 'Imported from Tally Debit Note',
            createdAt: Date.now()
          } as any)
        } else {
          skipped++
        }
      } else {
        skipped++
      }
    })

    const imported = newPayments.length + newCustomerPayments.length + newSalesInvoices.length + newPurchaseInvoices.length + newCreditNotes.length + newDebitNotes.length + newExpenseEntries.length + newCashBankTransactions.length
    
    onCommitImport?.(newPayments, newCustomerPayments, { importedCount: imported, skippedCount: skipped }, {
      salesInvoices: newSalesInvoices,
      purchaseInvoices: newPurchaseInvoices,
      creditNotes: newCreditNotes,
      debitNotes: newDebitNotes,
      expenseEntries: newExpenseEntries,
      cashBankTransactions: newCashBankTransactions,
      newCustomers: generatedCustomers,
      newSuppliers: generatedSuppliers,
      newExpenseTypes: generatedExpenseTypes,
      newCounters: generatedCounters,
      newItems: generatedItems
    })

    const createdSummary = [
      generatedCustomers.length > 0 ? `${generatedCustomers.length} customer(s)` : null,
      generatedSuppliers.length > 0 ? `${generatedSuppliers.length} supplier(s)` : null,
      generatedExpenseTypes.length > 0 ? `${generatedExpenseTypes.length} expense category(ies)` : null,
      generatedCounters.length > 0 ? `${generatedCounters.length} bank/cash counter(s)` : null,
      generatedItems.length > 0 ? `${generatedItems.length} inventory item(s)` : null
    ].filter(Boolean).join(', ')

    toast.success(`Successfully imported ${imported} voucher(s) into ERP accounts`, {
      description: createdSummary ? `Auto-created: ${createdSummary}` : (skipped > 0 ? `${skipped} unmapped/journal vouchers skipped` : undefined)
    })

    setParsedVouchers([])
    setCandidateMasters(null)
    setOverrides({})
    setFileName(null)
    onOpenChange(false)
  }

  const getVoucherBadge = (type: TallyParsedXmlVoucher['normalizedType'], raw: string) => {
    switch (type) {
      case 'sales':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[10px] font-bold">Sales</Badge>
      case 'purchase':
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] font-bold">Purchase</Badge>
      case 'receipt':
        return <Badge className="bg-violet-100 text-violet-800 border-violet-200 text-[10px] font-bold">Receipt</Badge>
      case 'payment':
        return <Badge className="bg-orange-100 text-orange-800 border-orange-200 text-[10px] font-bold">Supplier Payment</Badge>
      case 'expense':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] font-bold">Expense</Badge>
      case 'contra':
        return <Badge className="bg-cyan-100 text-cyan-800 border-cyan-200 text-[10px] font-bold">Contra Transfer</Badge>
      case 'credit_note':
        return <Badge className="bg-rose-100 text-rose-800 border-rose-200 text-[10px] font-bold">Credit Note</Badge>
      case 'debit_note':
        return <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 text-[10px] font-bold">Debit Note</Badge>
      default:
        return <Badge variant="outline" className="text-[10px] text-slate-500">{raw}</Badge>
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent fullScreen hideClose className="bg-background flex flex-col p-0 overflow-hidden border-none shadow-none">
        <DialogHeader className="px-6 py-3 border-b border-slate-200 bg-white/95 backdrop-blur shrink-0 space-y-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-xl bg-violet-50 text-violet-700 border border-violet-100 shadow-2xs">
                <FileArrowUp className="w-5 h-5" weight="duotone" />
              </span>
              <div>
                <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  Tally Voucher Ingestion Workspace
                  <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-200 font-bold">
                    XML & 14-Col Excel
                  </Badge>
                  {fileName && (
                    <Badge variant="secondary" className="text-[10px] font-mono text-slate-700">
                      {fileName}
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Full-screen workspace: Inspect, select modules, match accounts, auto-create missing masters, and commit to Zohan ERP.
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {processedList.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setParsedVouchers([])
                    setFileName(null)
                    setOverrides({})
                  }}
                  className="h-8 text-xs text-slate-600 hover:text-slate-900"
                >
                  Upload New File
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                className="h-8 w-8 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
              >
                <X size={18} weight="bold" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Upload Drop Area */}
        {processedList.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-8 bg-slate-50/50">
            <div
              onDragOver={e => {
                e.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={cn(
                'max-w-xl w-full border-2 border-dashed p-10 rounded-3xl text-center space-y-4 transition-all cursor-pointer bg-white shadow-xs',
                isDragging ? 'border-violet-600 bg-violet-50/80 scale-[0.99]' : 'border-slate-300 hover:border-violet-400'
              )}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".xml, .xlsx, .xls, .csv, text/xml, application/xml"
                className="hidden"
              />
              <div className="mx-auto w-14 h-14 rounded-2xl bg-violet-100 text-violet-700 flex items-center justify-center shadow-inner">
                <FileArrowUp className="w-8 h-8" weight="bold" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">Upload Tally Prime Vouchers</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Drag & drop native Tally XML export (<span className="font-mono text-violet-700">.xml</span>) or 14-Column Excel Sheet (<span className="font-mono text-violet-700">.xlsx, .xls, .csv</span>)
                </p>
              </div>
              <div>
                <Button
                  size="sm"
                  type="button"
                  onClick={e => {
                    e.stopPropagation()
                    fileInputRef.current?.click()
                  }}
                  disabled={isParsing}
                  className="h-10 px-5 text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-xl shadow-xs"
                >
                  {isParsing ? 'Parsing Vouchers...' : 'Browse File'}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col flex-1 overflow-hidden min-h-0 bg-slate-50/50">
            {/* 1. Module-Wise Multi-Select Filter Bar */}
            <div className="px-6 py-2.5 bg-white border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-700 mr-1 flex items-center gap-1.5">
                  <Funnel size={14} weight="bold" className="text-violet-600" /> Modules to Import:
                </span>

                {moduleCounts.sales > 0 && (
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 cursor-pointer bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs hover:bg-slate-100 transition-colors">
                    <Checkbox checked={selectedModules.sales} onCheckedChange={(chk) => toggleModule('sales', !!chk)} />
                    <span>Sales Invoices</span>
                    <Badge className="ml-0.5 h-4 px-1.5 text-[10px] bg-blue-100 text-blue-800 border-0 font-bold">{moduleCounts.sales}</Badge>
                  </label>
                )}

                {moduleCounts.purchase > 0 && (
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 cursor-pointer bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs hover:bg-slate-100 transition-colors">
                    <Checkbox checked={selectedModules.purchase} onCheckedChange={(chk) => toggleModule('purchase', !!chk)} />
                    <span>Purchase Invoices</span>
                    <Badge className="ml-0.5 h-4 px-1.5 text-[10px] bg-emerald-100 text-emerald-800 border-0 font-bold">{moduleCounts.purchase}</Badge>
                  </label>
                )}

                {moduleCounts.receipt > 0 && (
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 cursor-pointer bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs hover:bg-slate-100 transition-colors">
                    <Checkbox checked={selectedModules.receipt} onCheckedChange={(chk) => toggleModule('receipt', !!chk)} />
                    <span>Customer Payments</span>
                    <Badge className="ml-0.5 h-4 px-1.5 text-[10px] bg-violet-100 text-violet-800 border-0 font-bold">{moduleCounts.receipt}</Badge>
                  </label>
                )}

                {moduleCounts.payment > 0 && (
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 cursor-pointer bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs hover:bg-slate-100 transition-colors">
                    <Checkbox checked={selectedModules.payment} onCheckedChange={(chk) => toggleModule('payment', !!chk)} />
                    <span>Supplier Payments</span>
                    <Badge className="ml-0.5 h-4 px-1.5 text-[10px] bg-orange-100 text-orange-800 border-0 font-bold">{moduleCounts.payment}</Badge>
                  </label>
                )}

                {moduleCounts.expense > 0 && (
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 cursor-pointer bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs hover:bg-slate-100 transition-colors">
                    <Checkbox checked={selectedModules.expense} onCheckedChange={(chk) => toggleModule('expense', !!chk)} />
                    <span>Expenses</span>
                    <Badge className="ml-0.5 h-4 px-1.5 text-[10px] bg-amber-100 text-amber-800 border-0 font-bold">{moduleCounts.expense}</Badge>
                  </label>
                )}

                {moduleCounts.contra > 0 && (
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 cursor-pointer bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs hover:bg-slate-100 transition-colors">
                    <Checkbox checked={selectedModules.contra} onCheckedChange={(chk) => toggleModule('contra', !!chk)} />
                    <span>Contra Transfers</span>
                    <Badge className="ml-0.5 h-4 px-1.5 text-[10px] bg-cyan-100 text-cyan-800 border-0 font-bold">{moduleCounts.contra}</Badge>
                  </label>
                )}

                {(moduleCounts.credit_note > 0 || moduleCounts.debit_note > 0) && (
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 cursor-pointer bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs hover:bg-slate-100 transition-colors">
                    <Checkbox
                      checked={selectedModules.credit_note && selectedModules.debit_note}
                      onCheckedChange={(chk) => {
                        toggleModule('credit_note', !!chk)
                        toggleModule('debit_note', !!chk)
                      }}
                    />
                    <span>Credit/Debit Notes</span>
                    <Badge className="ml-0.5 h-4 px-1.5 text-[10px] bg-rose-100 text-rose-800 border-0 font-bold">
                      {moduleCounts.credit_note + moduleCounts.debit_note}
                    </Badge>
                  </label>
                )}
              </div>

              <div className="flex items-center gap-1.5 ml-auto">
                <Button size="sm" variant="outline" className="h-7 text-[11px] font-semibold px-2.5 bg-white hover:bg-slate-50 rounded-lg" onClick={selectOnlyInvoices}>
                  Select Only Invoices
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[11px] font-semibold px-2.5 bg-white hover:bg-slate-50 rounded-lg" onClick={selectOnlyBanking}>
                  Select Only Banking
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[11px] font-semibold px-2.5 bg-white hover:bg-slate-50 rounded-lg" onClick={selectAllModules}>
                  Select All
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-[11px] font-semibold px-2 text-slate-500 hover:text-slate-800 rounded-lg" onClick={deselectAllModules}>
                  Clear
                </Button>
              </div>
            </div>

            {/* 2. Auto-Creation Toggle & Candidate Summary Bar */}
            <div className="px-6 py-2 bg-violet-50/70 border-b border-violet-100 flex items-center justify-between gap-3 flex-wrap shrink-0">
              <div className="flex items-center space-x-2">
                <Switch
                  id="auto-create-masters-toggle"
                  checked={autoCreateMasters}
                  onCheckedChange={setAutoCreateMasters}
                />
                <Label htmlFor="auto-create-masters-toggle" className="text-xs font-bold text-slate-800 cursor-pointer">
                  Auto-Create Missing Masters &amp; Ledgers
                </Label>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {distinctTallyItems.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowItemMappingDrawer(prev => !prev)}
                    className={cn(
                      "h-7 text-[11px] font-bold px-2.5 rounded-lg border shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer",
                      showItemMappingDrawer
                        ? "bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700"
                        : "bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100"
                    )}
                  >
                    <Package size={14} weight="bold" />
                    <span>Map Inventory Items ({distinctTallyItems.length})</span>
                    <CaretDown size={12} className={cn("transition-transform duration-200", showItemMappingDrawer && "rotate-180")} />
                  </Button>
                )}
                {autoCreateMasters && newMastersSummary.customersCount > 0 && (
                  <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[10px]">
                    +{newMastersSummary.customersCount} Customers
                  </Badge>
                )}
                {autoCreateMasters && newMastersSummary.suppliersCount > 0 && (
                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">
                    +{newMastersSummary.suppliersCount} Suppliers
                  </Badge>
                )}
                {autoCreateMasters && newMastersSummary.expensesCount > 0 && (
                  <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]">
                    +{newMastersSummary.expensesCount} Expenses
                  </Badge>
                )}
                {autoCreateMasters && newMastersSummary.countersCount > 0 && (
                  <Badge className="bg-cyan-100 text-cyan-800 border-cyan-200 text-[10px]">
                    +{newMastersSummary.countersCount} Counters
                  </Badge>
                )}
                {autoCreateMasters && newMastersSummary.itemsCount > 0 && (
                  <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 text-[10px]">
                    +{newMastersSummary.itemsCount} New Items
                  </Badge>
                )}
              </div>
            </div>

            {/* Expandable Inventory Item Mapping Panel */}
            {showItemMappingDrawer && distinctTallyItems.length > 0 && (
              <div className="bg-slate-900 text-white p-4 border-b border-slate-800 shadow-inner shrink-0 max-h-72 overflow-y-auto space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      <Package size={16} weight="duotone" />
                    </span>
                    <div>
                      <h4 className="text-xs font-bold text-slate-100 flex items-center gap-2">
                        Inventory Items Mapping &amp; Master Selector
                        <Badge className="bg-indigo-500/30 text-indigo-200 text-[10px] font-mono border-indigo-400/40">
                          {distinctTallyItems.length} Stock Item{distinctTallyItems.length > 1 ? 's' : ''} in Vouchers
                        </Badge>
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Map each Tally stock item to an existing ERP inventory item or auto-create it as a new item master.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <MagnifyingGlass size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={itemSearchQuery}
                        onChange={(e) => setItemSearchQuery(e.target.value)}
                        placeholder="Search items..."
                        className="h-7 text-xs pl-8 w-44 bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500 rounded-lg"
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        distinctTallyItems.forEach(it => {
                          handleGlobalItemMapping(it.rawName, 'auto-create')
                        })
                      }}
                      className="h-7 text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 text-indigo-300 border-slate-700"
                    >
                      ✨ Auto-Create All
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowItemMappingDrawer(false)}
                      className="h-7 w-7 p-0 text-slate-400 hover:text-white"
                    >
                      <X size={14} />
                    </Button>
                  </div>
                </div>

                {/* Items Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
                  {filteredDistinctItems.map((tItem, idx) => {
                    const currentMappedId = itemMappings[tItem.normName]
                    const resolvedTarget = currentMappedId && currentMappedId !== 'auto-create'
                      ? items.find(it => it.id === currentMappedId)
                      : tItem.matchedItem

                    const isAutoCreate = currentMappedId === 'auto-create' || (!resolvedTarget && autoCreateMasters)

                    return (
                      <div key={idx} className="bg-slate-800/90 rounded-xl p-2.5 border border-slate-700/80 space-y-2 flex flex-col justify-between shadow-2xs">
                        <div>
                          <div className="flex items-start justify-between gap-1.5">
                            <span className="text-xs font-bold text-slate-100 truncate" title={tItem.rawName}>
                              {tItem.rawName}
                            </span>
                            {currentMappedId && currentMappedId !== 'auto-create' ? (
                              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[9px] shrink-0">
                                🔗 Mapped
                              </Badge>
                            ) : resolvedTarget ? (
                              <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-[9px] shrink-0">
                                ✓ Matched
                              </Badge>
                            ) : isAutoCreate ? (
                              <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-[9px] shrink-0">
                                ✨ New Item
                              </Badge>
                            ) : (
                              <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/30 text-[9px] shrink-0">
                                ⚠️ Unmapped
                              </Badge>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            Total Qty: {tItem.totalQty.toLocaleString('en-IN')} {tItem.unit} • {tItem.voucherCount} voucher{tItem.voucherCount > 1 ? 's' : ''}
                          </div>
                        </div>

                        {/* Item Selector Dropdown */}
                        <div className="space-y-1 pt-1">
                          <label className="text-[10px] text-slate-400 font-semibold block">Map to ERP Inventory Item:</label>
                          <Select
                            value={currentMappedId || (resolvedTarget?.id) || (isAutoCreate ? 'auto-create' : '')}
                            onValueChange={(val) => handleGlobalItemMapping(tItem.rawName, val)}
                          >
                            <SelectTrigger className="h-7 text-xs bg-slate-900 border-slate-700 text-slate-200">
                              <SelectValue placeholder="Select ERP item" />
                            </SelectTrigger>
                            <SelectContent className="max-h-72">
                              <SelectItem value="auto-create" className="font-semibold text-purple-600">
                                ✨ Auto-Create New Master &quot;{tItem.rawName}&quot;
                              </SelectItem>
                              {items.map(it => (
                                <SelectItem key={it.id} value={it.id}>
                                  {it.name} ({it.category || 'General'}) • {it.unit || 'PCS'}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 3. Interactive Filter Pills, Search Bar & Bulk Actions */}
            <div className="px-6 py-2.5 bg-white border-b border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                <Button
                  size="sm"
                  variant={filterTab === 'all' ? 'default' : 'outline'}
                  onClick={() => setFilterTab('all')}
                  className={cn(
                    'h-7 px-2.5 text-xs font-semibold rounded-lg',
                    filterTab === 'all' ? 'bg-slate-900 text-white' : 'text-slate-600 bg-white'
                  )}
                >
                  All ({filteredList.length})
                </Button>
                <Button
                  size="sm"
                  variant={filterTab === 'matched' ? 'default' : 'outline'}
                  onClick={() => setFilterTab('matched')}
                  className={cn(
                    'h-7 px-2.5 text-xs font-semibold rounded-lg',
                    filterTab === 'matched' ? 'bg-emerald-700 text-white' : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                  )}
                >
                  Matched ({matchedCount})
                </Button>
                <Button
                  size="sm"
                  variant={filterTab === 'unmapped' ? 'default' : 'outline'}
                  onClick={() => setFilterTab('unmapped')}
                  className={cn(
                    'h-7 px-2.5 text-xs font-semibold rounded-lg',
                    filterTab === 'unmapped' ? 'bg-rose-700 text-white' : 'text-rose-700 bg-rose-50 border-rose-200'
                  )}
                >
                  Unmapped ({unmappedCount})
                </Button>
                <Button
                  size="sm"
                  variant={filterTab === 'skipped' ? 'default' : 'outline'}
                  onClick={() => setFilterTab('skipped')}
                  className={cn(
                    'h-7 px-2.5 text-xs font-semibold rounded-lg',
                    filterTab === 'skipped' ? 'bg-slate-700 text-white' : 'text-slate-600 bg-slate-100 border-slate-200'
                  )}
                >
                  Skipped ({skippedCount})
                </Button>
                <Button
                  size="sm"
                  variant={filterTab === 'sales' ? 'default' : 'outline'}
                  onClick={() => setFilterTab('sales')}
                  className={cn(
                    'h-7 px-2.5 text-xs font-semibold rounded-lg',
                    filterTab === 'sales' ? 'bg-blue-600 text-white' : 'text-blue-700 bg-blue-50 border-blue-200'
                  )}
                >
                  Sales ({moduleCounts.sales})
                </Button>
                <Button
                  size="sm"
                  variant={filterTab === 'purchase' ? 'default' : 'outline'}
                  onClick={() => setFilterTab('purchase')}
                  className={cn(
                    'h-7 px-2.5 text-xs font-semibold rounded-lg',
                    filterTab === 'purchase' ? 'bg-emerald-700 text-white' : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                  )}
                >
                  Purchase ({moduleCounts.purchase})
                </Button>
                <Button
                  size="sm"
                  variant={filterTab === 'receipt' ? 'default' : 'outline'}
                  onClick={() => setFilterTab('receipt')}
                  className={cn(
                    'h-7 px-2.5 text-xs font-semibold rounded-lg',
                    filterTab === 'receipt' ? 'bg-violet-700 text-white' : 'text-violet-700 bg-violet-50 border-violet-200'
                  )}
                >
                  Receipts ({moduleCounts.receipt})
                </Button>
                <Button
                  size="sm"
                  variant={filterTab === 'payment' ? 'default' : 'outline'}
                  onClick={() => setFilterTab('payment')}
                  className={cn(
                    'h-7 px-2.5 text-xs font-semibold rounded-lg',
                    filterTab === 'payment' ? 'bg-orange-600 text-white' : 'text-orange-700 bg-orange-50 border-orange-200'
                  )}
                >
                  Payments ({moduleCounts.payment})
                </Button>
                <Button
                  size="sm"
                  variant={filterTab === 'expense' ? 'default' : 'outline'}
                  onClick={() => setFilterTab('expense')}
                  className={cn(
                    'h-7 px-2.5 text-xs font-semibold rounded-lg',
                    filterTab === 'expense' ? 'bg-amber-600 text-white' : 'text-amber-700 bg-amber-50 border-amber-200'
                  )}
                >
                  Expenses ({moduleCounts.expense})
                </Button>
                <Button
                  size="sm"
                  variant={filterTab === 'contra' ? 'default' : 'outline'}
                  onClick={() => setFilterTab('contra')}
                  className={cn(
                    'h-7 px-2.5 text-xs font-semibold rounded-lg',
                    filterTab === 'contra' ? 'bg-cyan-600 text-white' : 'text-cyan-700 bg-cyan-50 border-cyan-200'
                  )}
                >
                  Contra ({moduleCounts.contra})
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:w-64">
                  <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search party, voucher #, ₹..."
                    className="h-8 text-xs pl-8 pr-3 bg-slate-50 border-slate-200 rounded-lg"
                  />
                </div>
                <Button size="sm" variant="outline" className="h-8 text-xs font-semibold px-2.5 rounded-lg" onClick={() => handleSelectAll(true)}>
                  Select All
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs font-semibold px-2.5 rounded-lg" onClick={() => handleSelectAll(false)}>
                  Deselect All
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs font-semibold px-2.5 rounded-lg text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100" onClick={handleSelectMatchedOnly}>
                  Select Matched
                </Button>
              </div>
            </div>

            {/* 4. Full-Height Preview Grid */}
            <div className="flex-1 overflow-y-auto min-h-0 bg-white">
              <Table>
                <TableHeader className="sticky top-0 bg-slate-100 z-10 shadow-2xs border-b border-slate-200">
                  <TableRow className="hover:bg-slate-100">
                    <TableHead className="w-10 text-center">
                      <Checkbox
                        checked={selectedCount > 0 && selectedCount === filteredList.filter(v => v.effectiveType !== 'skipped').length}
                        onCheckedChange={(checked) => handleSelectAll(Boolean(checked))}
                      />
                    </TableHead>
                    <TableHead className="w-8"></TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">Type</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">Voucher #</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">Date</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">Party / Account</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">Amount (₹)</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-center">Status / Mapping</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredList.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-48 text-center text-slate-400 text-xs">
                        No vouchers match your current filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredList.map((v) => {
                      const isExpanded = expandedVoucherId === v.id

                      return (
                        <React.Fragment key={v.id}>
                          <TableRow className={cn(
                            'transition-colors text-xs cursor-pointer',
                            !v.isIncluded ? 'opacity-40 bg-slate-50/50' : 'hover:bg-slate-50/80',
                            isExpanded && 'bg-slate-100/70 border-l-4 border-l-violet-600'
                          )}>
                            <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={v.isIncluded}
                                disabled={v.effectiveType === 'skipped'}
                                onCheckedChange={(chk) => handleIncludeToggle(v.id, Boolean(chk))}
                              />
                            </TableCell>
                            <TableCell onClick={() => setExpandedVoucherId(isExpanded ? null : v.id)}>
                              <Button variant="ghost" size="icon" className="h-6 w-6 p-0 text-slate-400 hover:text-slate-700">
                                {isExpanded ? <CaretDown size={14} /> : <CaretRight size={14} />}
                              </Button>
                            </TableCell>
                            <TableCell>{getVoucherBadge(v.effectiveType, v.rawVoucherType)}</TableCell>
                            <TableCell className="font-mono text-slate-900 font-semibold">{v.voucherNumber}</TableCell>
                            <TableCell className="font-mono text-slate-500 text-[11px]">{v.displayDate}</TableCell>
                            <TableCell className="font-semibold text-slate-800 max-w-[200px]">
                              <div className="truncate" title={v.partyName}>{v.partyName}</div>
                              {v.inventory && v.inventory.length > 0 && (
                                <div className="text-[10px] text-slate-400 font-normal truncate">
                                  {v.inventory.length} item{v.inventory.length > 1 ? 's' : ''}: {v.inventory[0].itemName}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono font-bold text-slate-900">
                              {formatCurrency(v.totalAmount)}
                            </TableCell>
                            <TableCell className="text-center">
                              {v.effectiveType === 'skipped' ? (
                                <Badge variant="outline" className="text-[10px] text-slate-400">Skip Journal</Badge>
                              ) : v.isAutoCreated ? (
                                <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-[10px] font-semibold">
                                  + Auto {v.matchedEntityType === 'customer' ? 'Customer' : v.matchedEntityType === 'supplier' ? 'Supplier' : v.matchedEntityType === 'expense' ? 'Expense' : 'Counter'}
                                </Badge>
                              ) : v.matchedEntityType === 'unmapped' ? (
                                <Badge variant="outline" className="text-[10px] text-rose-700 bg-rose-50 border-rose-200" title={v.skipReason}>
                                  Unmapped Master
                                </Badge>
                              ) : v.hasUnmappedItem ? (
                                <Badge variant="outline" className="text-[10px] text-amber-700 bg-amber-50 border-amber-200" title={v.skipReason}>
                                  Unmapped Item
                                </Badge>
                              ) : v.effectiveType === 'contra' || v.matchedEntityType === 'counter' ? (
                                <Badge className="bg-cyan-100 text-cyan-800 text-[10px]">Contra Transfer</Badge>
                              ) : v.effectiveType === 'expense' || v.matchedEntityType === 'expense' ? (
                                <Badge className="bg-amber-100 text-amber-800 text-[10px]">Expense Match</Badge>
                              ) : v.matchedEntityType === 'supplier' ? (
                                <Badge className="bg-blue-100 text-blue-800 text-[10px]">Supplier Match</Badge>
                              ) : v.matchedEntityType === 'customer' ? (
                                <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">Customer Match</Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] text-slate-600 bg-slate-50 border-slate-200">General Match</Badge>
                              )}
                            </TableCell>
                          </TableRow>

                          {/* Expanded Inspection Drawer */}
                          {isExpanded && (
                            <TableRow className="bg-slate-50/90 border-b border-slate-200">
                              <TableCell colSpan={8} className="p-4 space-y-3">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                                  {/* Left Col: Ledger Entries Breakdown */}
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between text-xs font-bold text-slate-700 border-b pb-1">
                                      <span>Accounting Leg Breakdown</span>
                                      <span className="text-[11px] font-mono text-slate-500 font-normal">
                                        Dr: {formatCurrency(v.drTotal)} | Cr: {formatCurrency(v.crTotal)}
                                      </span>
                                    </div>
                                    <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                                      {v.legs.map((leg, lIdx) => (
                                        <div key={lIdx} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-slate-50 border border-slate-100">
                                          <div className="flex items-center gap-1.5 truncate max-w-[240px]">
                                            <Badge variant={leg.drCr === 'Dr' ? 'default' : 'outline'} className={cn(
                                              'text-[9px] px-1 py-0 font-mono',
                                              leg.drCr === 'Dr' ? 'bg-blue-600 text-white' : 'text-purple-700 border-purple-200 bg-purple-50'
                                            )}>
                                              {leg.drCr}
                                            </Badge>
                                            <span className="font-semibold text-slate-800 truncate" title={leg.ledgerName}>{leg.ledgerName}</span>
                                          </div>
                                          <span className="font-mono font-bold text-slate-900 text-[11px]">
                                            {formatCurrency(leg.amount)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>

                                    {v.narration && (
                                      <div className="mt-2 text-[11px] bg-slate-50 p-2 rounded border border-slate-200 text-slate-600">
                                        <span className="font-bold text-slate-700 mr-1">Narration:</span>
                                        {v.narration}
                                      </div>
                                    )}

                                    {v.inventory && v.inventory.length > 0 && (
                                      <div className="mt-2 space-y-1.5">
                                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                                          <span>Inventory Items ({v.inventory.length})</span>
                                          <span className="text-[10px] text-slate-400 font-normal">Per-line item selector</span>
                                        </div>
                                        <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                                          {v.inventory.map((inv, iIdx) => {
                                            const norm = inv.itemName.trim().toLowerCase()
                                            const lineMappedId = itemOverrides[v.id]?.[iIdx] || itemMappings[norm]
                                            const resolvedItem = lineMappedId && lineMappedId !== 'auto-create'
                                              ? items.find(it => it.id === lineMappedId)
                                              : (inv.matchedItemId ? items.find(it => it.id === inv.matchedItemId) : null)

                                            return (
                                              <div key={iIdx} className="p-2 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1.5 text-[11px]">
                                                <div className="flex items-center justify-between">
                                                  <div className="font-semibold text-slate-800 truncate max-w-[200px]" title={inv.itemName}>
                                                    {inv.itemName}
                                                  </div>
                                                  <span className="font-mono text-slate-600 text-[10px]">
                                                    {inv.quantity} {inv.unit} @ ₹{inv.rate} = {formatCurrency(inv.amount)}
                                                  </span>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                  <span className="text-[10px] text-slate-500 font-semibold shrink-0">Map Line to:</span>
                                                  <Select
                                                    value={lineMappedId || (resolvedItem?.id) || (inv.isAutoCreatedItem ? 'auto-create' : '')}
                                                    onValueChange={(val) => handleVoucherItemOverride(v.id, iIdx, val)}
                                                  >
                                                    <SelectTrigger className="h-6 text-[10px] bg-white border-slate-200 flex-1">
                                                      <SelectValue placeholder="Select item" />
                                                    </SelectTrigger>
                                                    <SelectContent className="max-h-60">
                                                      <SelectItem value="auto-create" className="text-purple-600 font-semibold text-xs">
                                                        ✨ Auto-Create &quot;{inv.itemName}&quot;
                                                      </SelectItem>
                                                      {items.map(it => (
                                                        <SelectItem key={it.id} value={it.id} className="text-xs">
                                                          {it.name} ({it.category || 'General'}) • {it.unit || 'PCS'}
                                                        </SelectItem>
                                                      ))}
                                                    </SelectContent>
                                                  </Select>
                                                </div>
                                              </div>
                                            )
                                          })}
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Right Col: Interactive Voucher Override Controls */}
                                  <div className="space-y-3 border-l md:pl-4 border-slate-100">
                                    <div className="text-xs font-bold text-slate-700 border-b pb-1 flex items-center justify-between">
                                      <span>Voucher Controls &amp; Re-Mapping</span>
                                      <Badge variant="outline" className="text-[10px]">
                                        ID: {v.voucherNumber}
                                      </Badge>
                                    </div>

                                    {/* 1. Voucher Type Override */}
                                    <div className="space-y-1">
                                      <label className="text-[11px] font-semibold text-slate-600">Classification Type</label>
                                      <Select
                                        value={v.effectiveType}
                                        onValueChange={val => handleTypeOverride(v.id, val as any)}
                                      >
                                        <SelectTrigger className="h-8 text-xs bg-slate-50">
                                          <SelectValue placeholder="Select type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="payment">Supplier Payment</SelectItem>
                                          <SelectItem value="expense">Expense Entry</SelectItem>
                                          <SelectItem value="receipt">Customer Receipt</SelectItem>
                                          <SelectItem value="contra">Contra Transfer</SelectItem>
                                          <SelectItem value="sales">Sales Invoice</SelectItem>
                                          <SelectItem value="purchase">Purchase Invoice</SelectItem>
                                          <SelectItem value="credit_note">Credit Note (Sales Return)</SelectItem>
                                          <SelectItem value="debit_note">Debit Note (Purchase Return)</SelectItem>
                                          <SelectItem value="skipped">Skip / Journal</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>

                                    {/* 2. Target Master Mapping */}
                                    {v.effectiveType === 'payment' || v.effectiveType === 'purchase' || v.effectiveType === 'debit_note' ? (
                                      <div className="space-y-1">
                                        <label className="text-[11px] font-semibold text-slate-600">Linked Supplier Master</label>
                                        <Select
                                          value={v.matchedEntityId || (v.isAutoCreated ? 'auto-create' : '')}
                                          onValueChange={val => handleEntityOverride(v.id, val, 'supplier')}
                                        >
                                          <SelectTrigger className="h-8 text-xs bg-slate-50">
                                            <SelectValue placeholder="Map to Supplier" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="auto-create">
                                              ✨ Auto-Create &quot;{v.partyName}&quot;
                                            </SelectItem>
                                            {suppliers.map(s => (
                                              <SelectItem key={s.id} value={s.id}>
                                                {s.name}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    ) : v.effectiveType === 'sales' || v.effectiveType === 'receipt' || v.effectiveType === 'credit_note' ? (
                                      <div className="space-y-1">
                                        <label className="text-[11px] font-semibold text-slate-600">Linked Customer Master</label>
                                        <Select
                                          value={v.matchedEntityId || (v.isAutoCreated ? 'auto-create' : '')}
                                          onValueChange={val => handleEntityOverride(v.id, val, 'customer')}
                                        >
                                          <SelectTrigger className="h-8 text-xs bg-slate-50">
                                            <SelectValue placeholder="Map to Customer" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="auto-create">
                                              ✨ Auto-Create &quot;{v.partyName}&quot;
                                            </SelectItem>
                                            {customers.map(c => (
                                              <SelectItem key={c.id} value={c.id}>
                                                {c.name}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    ) : v.effectiveType === 'expense' ? (
                                      <div className="space-y-1">
                                        <label className="text-[11px] font-semibold text-slate-600">Linked Expense Category</label>
                                        <Select
                                          value={v.matchedEntityId || (v.isAutoCreated ? 'auto-create' : '')}
                                          onValueChange={val => handleEntityOverride(v.id, val, 'expense')}
                                        >
                                          <SelectTrigger className="h-8 text-xs bg-slate-50">
                                            <SelectValue placeholder="Map to Expense Type" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="auto-create">
                                              ✨ Auto-Create &quot;{v.partyName}&quot;
                                            </SelectItem>
                                            {expenseTypes.map(e => (
                                              <SelectItem key={e.id} value={e.id}>
                                                {e.name}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    ) : null}

                                    {/* 3. Include in Commit Switch */}
                                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                      <span className="text-xs font-semibold text-slate-700">Include in Database Commit</span>
                                      <Switch
                                        checked={v.isIncluded}
                                        onCheckedChange={checked => handleIncludeToggle(v.id, checked)}
                                      />
                                    </div>
                                  </div>
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
          </div>
        )}

        <DialogFooter className="px-6 py-3 border-t border-slate-200 bg-white flex items-center justify-between gap-4 shrink-0 sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              generateSampleTallyExcel()
              toast.success('Downloaded Sample Tally Excel Template')
            }}
            className="text-xs h-8 text-slate-600 hover:text-slate-900"
          >
            <DownloadSimple className="w-3.5 h-3.5 mr-1" />
            Download Sample Excel
          </Button>

          {processedList.length > 0 && (
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 font-medium">
              <span>Selected for Ingestion:</span>
              <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200 font-bold">
                {selectedCount} Vouchers
              </Badge>
              {autoCreateMasters && (
                <span className="text-[11px] text-slate-400">
                  (Auto-creating {newMastersSummary.customersCount} Cust, {newMastersSummary.suppliersCount} Supp, {newMastersSummary.expensesCount} Exp, {newMastersSummary.itemsCount} Items)
                </span>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs h-9 px-4"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCommit}
              disabled={selectedCount === 0}
              className="text-xs h-9 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs"
            >
              Import {selectedCount} Vouchers
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
