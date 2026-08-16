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
  FileText
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
  ExpenseType
} from '@/lib/types'
import { formatCurrency } from '@/lib/calculations'
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
        <DialogContent className="sm:max-w-[620px] p-6 rounded-2xl">
          <DialogHeader className="space-y-1.5">
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

          {/* Footer Actions */}
          <DialogFooter className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2">
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
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Gear className="w-5 h-5 text-violet-600" weight="duotone" />
              Tally Ledger Name Configuration
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Customize chart-of-accounts ledger names to match your Tally Prime company masters.
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
      const normParty = v.partyName.trim().toLowerCase()
      let matchedEntityType = v.matchedEntityType || 'unmapped'
      let matchedEntityId = v.matchedEntityId
      let contraDetails = v.contraDetails
      let expenseDetails = v.expenseDetails
      let isAutoCreated = false

      if (v.normalizedType === 'contra') {
        const fromName = v.contraDetails?.fromCounterName || v.legs.find(l => l.drCr === 'Cr')?.ledgerName || ''
        const toName = v.contraDetails?.toCounterName || v.legs.find(l => l.drCr === 'Dr')?.ledgerName || ''
        const fromId = counterMap.get(fromName.trim().toLowerCase())?.id
        const toId = counterMap.get(toName.trim().toLowerCase())?.id

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
          matchedEntityId = toId || 'auto-counter'
          isAutoCreated = true
        } else {
          matchedEntityType = 'unmapped'
        }
      } else if (v.normalizedType === 'expense') {
        if (expenseTypeMap.has(normParty)) {
          matchedEntityType = 'expense'
          matchedEntityId = expenseTypeMap.get(normParty)?.id
        } else if (autoCreateMasters) {
          matchedEntityType = 'expense'
          isAutoCreated = true
        }
      } else if (v.normalizedType === 'sales' || v.normalizedType === 'credit_note') {
        if (customerMap.has(normParty)) {
          matchedEntityType = 'customer'
          matchedEntityId = customerMap.get(normParty)?.id
        } else if (supplierMap.has(normParty)) {
          matchedEntityType = 'supplier'
          matchedEntityId = supplierMap.get(normParty)?.id
        } else if (autoCreateMasters) {
          matchedEntityType = 'customer'
          isAutoCreated = true
        }
      } else if (v.normalizedType === 'purchase' || v.normalizedType === 'debit_note') {
        if (supplierMap.has(normParty)) {
          matchedEntityType = 'supplier'
          matchedEntityId = supplierMap.get(normParty)?.id
        } else if (customerMap.has(normParty)) {
          matchedEntityType = 'customer'
          matchedEntityId = customerMap.get(normParty)?.id
        } else if (autoCreateMasters) {
          matchedEntityType = 'supplier'
          isAutoCreated = true
        }
      } else if (v.normalizedType === 'payment') {
        if (supplierMap.has(normParty)) {
          matchedEntityType = 'supplier'
          matchedEntityId = supplierMap.get(normParty)?.id
        } else if (expenseTypeMap.has(normParty)) {
          matchedEntityType = 'expense'
          matchedEntityId = expenseTypeMap.get(normParty)?.id
        } else if (autoCreateMasters) {
          matchedEntityType = 'supplier'
          isAutoCreated = true
        }
      } else if (v.normalizedType === 'receipt') {
        if (customerMap.has(normParty)) {
          matchedEntityType = 'customer'
          matchedEntityId = customerMap.get(normParty)?.id
        } else if (supplierMap.has(normParty)) {
          matchedEntityType = 'supplier'
          matchedEntityId = supplierMap.get(normParty)?.id
        } else if (autoCreateMasters) {
          matchedEntityType = 'customer'
          isAutoCreated = true
        }
      }

      // Check inventory item matching
      const unmappedItems = (v.inventory || []).filter(inv => !itemMap.has(inv.itemName.trim().toLowerCase()))
      const hasUnmappedItem = unmappedItems.length > 0
      let unmappedReason = v.skipReason

      if (v.normalizedType !== 'skipped') {
        if (v.normalizedType === 'contra' && matchedEntityType === 'unmapped') {
          unmappedReason = `Unmapped Counter: ${!contraDetails?.fromCounterId ? contraDetails?.fromCounterName : contraDetails?.toCounterName}`
        } else if (matchedEntityType === 'unmapped') {
          unmappedReason = `Unmapped Master: ${v.partyName}`
        } else if (hasUnmappedItem) {
          unmappedReason = `Unmapped Item: ${unmappedItems.map(i => i.itemName).join(', ')}`
        } else if (isAutoCreated) {
          unmappedReason = undefined
        }
      }

      return {
        ...v,
        matchedEntityType,
        matchedEntityId,
        contraDetails,
        expenseDetails,
        isAutoCreated,
        hasUnmappedItem,
        unmappedItemNames: unmappedItems.map(i => i.itemName),
        skipReason: unmappedReason
      }
    })
  }, [parsedVouchers, supplierMap, customerMap, counterMap, expenseTypeMap, itemMap, counters.length, autoCreateMasters])

  // Count candidates for display
  const newMastersSummary = useMemo(() => {
    const custSet = new Set<string>()
    const suppSet = new Set<string>()
    const expSet = new Set<string>()
    const cntrSet = new Set<string>()

    processedList.forEach(v => {
      if (v.normalizedType === 'skipped') return
      const norm = v.partyName.trim().toLowerCase()
      if (v.isAutoCreated) {
        if (v.matchedEntityType === 'customer' && !customerMap.has(norm)) custSet.add(v.partyName.trim())
        if (v.matchedEntityType === 'supplier' && !supplierMap.has(norm)) suppSet.add(v.partyName.trim())
        if (v.matchedEntityType === 'expense' && !expenseTypeMap.has(norm)) expSet.add(v.partyName.trim())
      }
      if (v.normalizedType === 'contra') {
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
      countersCount: cntrSet.size
    }
  }, [processedList, customerMap, supplierMap, expenseTypeMap, counterMap])

  const validCount = processedList.filter(v => v.normalizedType !== 'skipped' && v.matchedEntityType !== 'unmapped' && !v.hasUnmappedItem).length
  const unmappedCount = processedList.filter(v => v.normalizedType !== 'skipped' && (v.matchedEntityType === 'unmapped' || v.hasUnmappedItem)).length
  const skippedCount = processedList.filter(v => v.normalizedType === 'skipped').length

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

    const autoCustMap = new Map<string, string>()
    const autoSuppMap = new Map<string, string>()
    const autoExpMap = new Map<string, string>()
    const autoCntrMap = new Map<string, string>()

    if (autoCreateMasters) {
      const timestamp = Date.now()
      let custSeq = 0, suppSeq = 0, expSeq = 0, cntrSeq = 0

      processedList.forEach(v => {
        if (v.normalizedType === 'skipped') return
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

        // Check Contra Counters
        if (v.normalizedType === 'contra') {
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

    processedList.forEach((v, idx) => {
      if (v.normalizedType === 'skipped' || v.matchedEntityType === 'unmapped' || v.hasUnmappedItem) {
        skipped++
        return
      }

      const normParty = v.partyName.trim().toLowerCase()

      if (v.normalizedType === 'payment' && v.matchedEntityType === 'supplier') {
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
            createdAt: Date.now()
          } as any)
        } else {
          skipped++
        }
      } else if (v.normalizedType === 'expense') {
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
      } else if (v.normalizedType === 'contra') {
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
      } else if (v.normalizedType === 'receipt' && v.matchedEntityType === 'customer') {
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
            createdAt: Date.now()
          } as any)
        } else {
          skipped++
        }
      } else if (v.normalizedType === 'sales' && v.matchedEntityType === 'customer') {
        const custId = v.matchedEntityId || autoCustMap.get(normParty) || customerMap.get(normParty)?.id
        if (custId) {
          newSalesInvoices.push({
            id: `tally-inv-${Date.now()}-${idx}`,
            invoiceNumber: v.voucherNumber,
            customerId: custId,
            date: v.voucherDate || new Date().toISOString().split('T')[0],
            totalAmount: v.totalAmount,
            taxableAmount: v.legs.find(l => l.ledgerName.toLowerCase().includes('sale'))?.amount || v.totalAmount,
            status: 'Confirmed',
            items: v.inventory.map(inv => ({
              itemId: itemMap.get(inv.itemName.toLowerCase())?.id || 'item-gen',
              baseQuantity: inv.quantity,
              rate: inv.rate,
              amount: inv.amount
            })),
            createdAt: Date.now()
          } as any)
        } else {
          skipped++
        }
      } else if (v.normalizedType === 'purchase' && v.matchedEntityType === 'supplier') {
        const suppId = v.matchedEntityId || autoSuppMap.get(normParty) || supplierMap.get(normParty)?.id
        if (suppId) {
          newPurchaseInvoices.push({
            id: `tally-pur-${Date.now()}-${idx}`,
            invoiceNumber: v.voucherNumber,
            supplierId: suppId,
            invoiceDate: v.voucherDate || new Date().toISOString().split('T')[0],
            totalAmount: v.totalAmount,
            taxableAmount: v.legs.find(l => l.ledgerName.toLowerCase().includes('purchase'))?.amount || v.totalAmount,
            items: v.inventory.map(inv => ({
              itemId: itemMap.get(inv.itemName.toLowerCase())?.id || 'item-gen',
              baseQuantity: inv.quantity,
              rate: inv.rate,
              amount: inv.amount
            })),
            createdAt: Date.now()
          } as any)
        } else {
          skipped++
        }
      } else if (v.normalizedType === 'credit_note' && v.matchedEntityType === 'customer') {
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
      } else if (v.normalizedType === 'debit_note' && v.matchedEntityType === 'supplier') {
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
      newCounters: generatedCounters
    })

    const createdSummary = [
      generatedCustomers.length > 0 ? `${generatedCustomers.length} customer(s)` : null,
      generatedSuppliers.length > 0 ? `${generatedSuppliers.length} supplier(s)` : null,
      generatedExpenseTypes.length > 0 ? `${generatedExpenseTypes.length} expense category(ies)` : null,
      generatedCounters.length > 0 ? `${generatedCounters.length} bank/cash counter(s)` : null
    ].filter(Boolean).join(', ')

    toast.success(`Successfully imported ${imported} voucher(s) into ERP accounts`, {
      description: createdSummary ? `Auto-created: ${createdSummary}` : (skipped > 0 ? `${skipped} unmapped/journal vouchers skipped` : undefined)
    })

    setParsedVouchers([])
    setCandidateMasters(null)
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
      <DialogContent className="sm:max-w-[760px] p-6 rounded-2xl">
        <DialogHeader className="space-y-1.5">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-slate-900">
              <span className="p-2 rounded-xl bg-violet-50 text-violet-700 border border-violet-100">
                <FileArrowUp className="w-5 h-5" weight="duotone" />
              </span>
              Import Tally Vouchers (XML / Excel)
            </DialogTitle>
            <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold">
              Skip-Journal Policy
            </Badge>
          </div>
          <DialogDescription className="text-xs text-slate-500">
            Upload Tally Native XML (.xml) or Excel (.xlsx, .xls, .csv) to ingest Sales, Purchases, Receipts, Payments, Contra Transfers, and Notes.
          </DialogDescription>
        </DialogHeader>

        {/* Upload Drop Area */}
        <div
          onDragOver={e => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={cn(
            'border-2 border-dashed p-5 rounded-2xl text-center space-y-3 transition-all cursor-pointer',
            isDragging ? 'border-violet-600 bg-violet-50/80 scale-[0.99]' : 'border-slate-200 hover:border-violet-400 bg-slate-50/60'
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
          <div className="mx-auto w-10 h-10 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center">
            <FileArrowUp className="w-5 h-5" weight="bold" />
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
              className="h-8 text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-xl shadow-xs"
            >
              {isParsing ? 'Parsing Vouchers...' : 'Select Tally XML / Excel File'}
            </Button>
            <p className="text-[11px] text-slate-400 mt-1.5">
              Drag & Drop or click to upload native Tally XML (<span className="font-mono">.xml</span>) or Excel (<span className="font-mono">.xlsx, .xls, .csv</span>)
            </p>
          </div>
          {fileName && (
            <Badge variant="secondary" className="text-xs font-mono">
              Loaded: {fileName}
            </Badge>
          )}
        </div>

        {/* Auto-Creation Toggle & Candidate Summary */}
        {processedList.length > 0 && (
          <div className="flex items-center justify-between bg-violet-50/60 border border-violet-100 p-3 rounded-xl gap-2 flex-wrap">
            <div className="flex items-center space-x-2.5">
              <Switch
                id="auto-create-masters-toggle"
                checked={autoCreateMasters}
                onCheckedChange={setAutoCreateMasters}
              />
              <Label htmlFor="auto-create-masters-toggle" className="text-xs font-bold text-slate-800 cursor-pointer">
                Auto-Create Missing Masters & Ledgers
              </Label>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {autoCreateMasters && newMastersSummary.customersCount > 0 && (
                <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[10px]">
                  +{newMastersSummary.customersCount} New Customers
                </Badge>
              )}
              {autoCreateMasters && newMastersSummary.suppliersCount > 0 && (
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">
                  +{newMastersSummary.suppliersCount} New Suppliers
                </Badge>
              )}
              {autoCreateMasters && newMastersSummary.expensesCount > 0 && (
                <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]">
                  +{newMastersSummary.expensesCount} New Expenses
                </Badge>
              )}
              {autoCreateMasters && newMastersSummary.countersCount > 0 && (
                <Badge className="bg-cyan-100 text-cyan-800 border-cyan-200 text-[10px]">
                  +{newMastersSummary.countersCount} New Counters
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Preview Table */}
        {processedList.length > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700">Parsed Voucher Preview ({processedList.length})</span>
              <div className="flex items-center gap-1.5">
                <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">
                  {validCount} Matched
                </Badge>
                {unmappedCount > 0 && (
                  <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 text-[10px]">
                    {unmappedCount} Unmapped
                  </Badge>
                )}
                {skippedCount > 0 && (
                  <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200 text-[10px]">
                    {skippedCount} Skipped (Journal/Memo)
                  </Badge>
                )}
              </div>
            </div>

            <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white">
              <Table>
                <TableHeader className="bg-slate-50 sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="text-[11px] font-bold text-slate-600">Type</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-600">Voucher No</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-600">Date</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-600">Party Ledger</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-600 text-right">Amount (₹)</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-600 text-center">Status / Match</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processedList.map((v, idx) => (
                    <TableRow key={idx} className="text-xs">
                      <TableCell>{getVoucherBadge(v.normalizedType, v.rawVoucherType)}</TableCell>
                      <TableCell className="font-mono text-slate-900">{v.voucherNumber}</TableCell>
                      <TableCell className="font-mono text-slate-500 text-[11px]">{v.displayDate}</TableCell>
                      <TableCell className="font-semibold text-slate-800 max-w-[160px]">
                        <div className="truncate" title={v.partyName}>{v.partyName}</div>
                        {v.inventory && v.inventory.length > 0 && (
                          <div className="text-[10px] text-slate-400 font-normal truncate" title={v.inventory.map(i => `${i.quantity} ${i.unit || ''} ${i.itemName}`).join(', ')}>
                            {v.inventory.length} item{v.inventory.length > 1 ? 's' : ''}: {v.inventory[0].itemName}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-slate-900">
                        {formatCurrency(v.totalAmount)}
                      </TableCell>
                      <TableCell className="text-center">
                        {v.normalizedType === 'skipped' ? (
                          <Badge variant="outline" className="text-[10px] text-slate-400">Skip Journal</Badge>
                        ) : v.isAutoCreated ? (
                          <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-[10px] font-semibold">
                            + Auto {v.matchedEntityType === 'customer' ? 'Customer' : v.matchedEntityType === 'supplier' ? 'Supplier' : v.matchedEntityType === 'expense' ? 'Expense' : 'Counter'}
                          </Badge>
                        ) : v.matchedEntityType === 'unmapped' ? (
                          <Badge variant="outline" className="text-[10px] text-rose-700 bg-rose-50 border-rose-200" title={`Unmapped Master: ${v.partyName}`}>
                            Unmapped Master: {v.partyName.length > 12 ? v.partyName.slice(0, 12) + '...' : v.partyName}
                          </Badge>
                        ) : v.hasUnmappedItem ? (
                          <Badge variant="outline" className="text-[10px] text-amber-700 bg-amber-50 border-amber-200" title={`Unmapped Item: ${v.unmappedItemNames?.join(', ')}`}>
                            Unmapped Item
                          </Badge>
                        ) : v.normalizedType === 'contra' || v.matchedEntityType === 'counter' ? (
                          <Badge className="bg-cyan-100 text-cyan-800 text-[10px]">Contra Transfer</Badge>
                        ) : v.normalizedType === 'expense' || v.matchedEntityType === 'expense' ? (
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
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              generateSampleTallyExcel()
              toast.success('Downloaded Sample Tally Excel Template')
            }}
            className="text-xs h-8 text-slate-600"
          >
            <DownloadSimple className="w-3.5 h-3.5 mr-1" />
            Download Sample Excel
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs h-8"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCommit}
              disabled={validCount === 0}
              className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
            >
              Import {validCount} Verified Vouchers
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
