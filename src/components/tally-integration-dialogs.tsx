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
  CustomerPayment
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
    return generateTallySalesVouchers(filteredSales, customers, ledgerMapping, companyStateCode)
  }, [includeSales, filteredSales, customers, ledgerMapping, companyStateCode])

  const purchaseVouchers = useMemo(() => {
    if (!includePurchases) return []
    return generateTallyPurchaseVouchers(filteredPurchases, suppliers, ledgerMapping, companyStateCode)
  }, [includePurchases, filteredPurchases, suppliers, ledgerMapping, companyStateCode])

  const noteVouchers = useMemo(() => {
    if (!includeNotes) return []
    const cn = generateTallyCreditNoteVouchers(filteredCreditNotes, customers, ledgerMapping, companyStateCode)
    const dn = generateTallyDebitNoteVouchers(filteredDebitNotes, suppliers, ledgerMapping, companyStateCode)
    return [...cn, ...dn]
  }, [includeNotes, filteredCreditNotes, filteredDebitNotes, customers, suppliers, ledgerMapping, companyStateCode])

  const expenseVouchers = useMemo(() => {
    if (!includeExpenses) return []
    return generateTallyExpenseVouchers(filteredExpenses, ledgerMapping, companyStateCode)
  }, [includeExpenses, filteredExpenses, ledgerMapping, companyStateCode])

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

export interface TallyImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customers?: Customer[]
  suppliers?: Supplier[]
  onCommitImport?: (
    newPayments: Payment[],
    newCustomerPayments: CustomerPayment[],
    summary: { importedCount: number; skippedCount: number }
  ) => void
}

export function TallyImportDialog({
  open,
  onOpenChange,
  customers = [],
  suppliers = [],
  onCommitImport
}: TallyImportDialogProps) {
  const [parsedVouchers, setParsedVouchers] = useState<PaymentVoucher[]>([])
  const [isParsing, setIsParsing] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [skipUnmapped, setSkipUnmapped] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const supplierMap = useMemo(() => new Map(suppliers.map(s => [s.name.trim().toLowerCase(), s])), [suppliers])
  const customerMap = useMemo(() => new Map(customers.map(c => [c.name.trim().toLowerCase(), c])), [customers])

  const processedList = useMemo(() => {
    return parsedVouchers.map(v => {
      const normParty = v.partyLedger.trim().toLowerCase()
      let matchedType: 'supplier' | 'customer' | 'unmapped' = 'unmapped'
      let matchedEntityId: string | undefined

      if (supplierMap.has(normParty)) {
        matchedType = 'supplier'
        matchedEntityId = supplierMap.get(normParty)?.id
      } else if (customerMap.has(normParty)) {
        matchedType = 'customer'
        matchedEntityId = customerMap.get(normParty)?.id
      }

      return {
        ...v,
        matchedType,
        matchedEntityId
      }
    })
  }, [parsedVouchers, supplierMap, customerMap])

  const matchedCount = processedList.filter(v => v.matchedType !== 'unmapped').length
  const unmappedCount = processedList.filter(v => v.matchedType === 'unmapped').length

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const file = files[0]
    setFileName(file.name)
    setIsParsing(true)

    try {
      const buffer = await file.arrayBuffer()
      const result: TallyImportResult = parseTallyPayments(buffer)

      setParsedVouchers(result.data)

      if (result.success && result.data.length > 0) {
        toast.success(`Parsed ${result.data.length} Tally voucher(s)`)
      } else if (result.data.length > 0) {
        toast.warning(`Parsed ${result.data.length} voucher(s) with validation notices`)
      } else {
        toast.error(result.errors[0] || 'No valid Payment/Receipt vouchers found in file')
      }
    } catch (err: any) {
      toast.error(`Import failed: ${err?.message || 'Error processing file'}`)
    } finally {
      setIsParsing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleCommit = () => {
    const newPayments: Payment[] = []
    const newCustomerPayments: CustomerPayment[] = []
    let skipped = 0

    processedList.forEach((v, idx) => {
      if (v.matchedType === 'supplier' && v.matchedEntityId) {
        newPayments.push({
          id: `tally-pay-${Date.now()}-${idx}`,
          supplierId: v.matchedEntityId,
          amount: v.amount,
          paymentDate: v.voucherDate || new Date().toISOString().split('T')[0],
          paymentMode: 'Bank',
          counterName: v.bankCashLedger,
          notes: `Imported from Tally Voucher #${v.voucherNumber}`,
          createdAt: Date.now()
        } as any)
      } else if (v.matchedType === 'customer' && v.matchedEntityId) {
        newCustomerPayments.push({
          id: `tally-rec-${Date.now()}-${idx}`,
          customerId: v.matchedEntityId,
          amount: v.amount,
          paymentDate: v.voucherDate || new Date().toISOString().split('T')[0],
          paymentMode: 'Bank',
          counterName: v.bankCashLedger,
          notes: `Imported from Tally Voucher #${v.voucherNumber}`,
          createdAt: Date.now()
        } as any)
      } else {
        skipped++
      }
    })

    const imported = newPayments.length + newCustomerPayments.length
    onCommitImport?.(newPayments, newCustomerPayments, { importedCount: imported, skippedCount: skipped })

    toast.success(`Successfully imported ${imported} voucher(s) into ERP ledger accounts`, {
      description: skipped > 0 ? `${skipped} unmapped/journal vouchers skipped per audit policy` : undefined
    })

    setParsedVouchers([])
    setFileName(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] p-6 rounded-2xl">
        <DialogHeader className="space-y-1.5">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-slate-900">
              <span className="p-2 rounded-xl bg-violet-50 text-violet-700 border border-violet-100">
                <FileArrowUp className="w-5 h-5" weight="duotone" />
              </span>
              Import Tally Vouchers into ERP
            </DialogTitle>
            <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold">
              Skip-Journal Policy
            </Badge>
          </div>
          <DialogDescription className="text-xs text-slate-500">
            Upload Tally Excel (.xlsx, .xls) or CSV export to parse payment and receipt vouchers with automatic master ledger matching.
          </DialogDescription>
        </DialogHeader>

        {/* Upload Drop Area */}
        <div className="border-2 border-dashed border-slate-200 hover:border-violet-400 bg-slate-50/60 p-5 rounded-2xl text-center space-y-3 transition-all">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".xlsx, .xls, .csv"
            className="hidden"
          />
          <div className="mx-auto w-10 h-10 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center">
            <FileArrowUp className="w-5 h-5" weight="bold" />
          </div>
          <div>
            <Button
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isParsing}
              className="h-8 text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-xl"
            >
              {isParsing ? 'Parsing Excel File...' : 'Select Tally Excel / CSV File'}
            </Button>
            <p className="text-[11px] text-slate-400 mt-1">
              Supports Tally Prime & ERP 9 standard 8-column voucher export format
            </p>
          </div>
          {fileName && (
            <Badge variant="secondary" className="text-xs font-mono">
              Loaded: {fileName}
            </Badge>
          )}
        </div>

        {/* Preview Table */}
        {processedList.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700">Parsed Voucher Preview ({processedList.length})</span>
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">
                  {matchedCount} Matched
                </Badge>
                {unmappedCount > 0 && (
                  <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 text-[10px]">
                    {unmappedCount} Unmapped
                  </Badge>
                )}
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white">
              <Table>
                <TableHeader className="bg-slate-50 sticky top-0">
                  <TableRow>
                    <TableHead className="text-[11px] font-bold text-slate-600">Type</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-600">Voucher No</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-600">Party Ledger</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-600 text-right">Amount (₹)</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-600 text-center">ERP Match</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processedList.map((v, idx) => (
                    <TableRow key={idx} className="text-xs">
                      <TableCell className="font-bold text-[10px]">{v.type}</TableCell>
                      <TableCell className="font-mono text-slate-900">{v.voucherNumber}</TableCell>
                      <TableCell className="font-semibold text-slate-800">{v.partyLedger}</TableCell>
                      <TableCell className="text-right font-mono font-bold text-slate-900">{formatCurrency(v.amount)}</TableCell>
                      <TableCell className="text-center">
                        {v.matchedType === 'supplier' && (
                          <Badge className="bg-blue-100 text-blue-800 text-[10px]">Supplier</Badge>
                        )}
                        {v.matchedType === 'customer' && (
                          <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">Customer</Badge>
                        )}
                        {v.matchedType === 'unmapped' && (
                          <Badge variant="outline" className="text-[10px] text-slate-400">Skip</Badge>
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
              disabled={matchedCount === 0}
              className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
            >
              Import {matchedCount} Verified Vouchers
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
