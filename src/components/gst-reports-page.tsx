import { useState, useMemo } from 'react'
import {
  SalesInvoice,
  SalesReturn,
  CustomerCreditNote,
  CustomerDebitNote,
  PurchaseInvoice,
  PurchaseReturn,
  SupplierDebitNote,
  SupplierCreditNote,
  ExpenseEntry,
  Customer,
  Supplier,
  Party,
  Item
} from '@/lib/types'
import {
  computeMonthlyGstReport,
  MonthlyGstReport,
  GstReportSourceData,
  GstDateFilter
} from '@/lib/gst-report-calculations'
import { formatCurrency } from '@/lib/calculations'
import { exportGstReportsToExcel } from '@/lib/excel-export'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  FileText,
  FileXls,
  Receipt,
  DownloadSimple,
  ShieldCheck,
  Building,
  CheckCircle,
  CurrencyInr,
  ArrowsClockwise,
  MagnifyingGlass,
  ArrowUpRight,
  ArrowDownLeft,
  Scales,
  CalendarBlank,
  Tag,
  Info,
  WarningCircle
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface GstReportsPageProps {
  salesInvoices: SalesInvoice[]
  salesReturns: SalesReturn[]
  customerCreditNotes: CustomerCreditNote[]
  customerDebitNotes: CustomerDebitNote[]
  purchaseInvoices: PurchaseInvoice[]
  purchaseReturns: PurchaseReturn[]
  supplierDebitNotes: SupplierDebitNote[]
  supplierCreditNotes: SupplierCreditNote[]
  expenseEntries: ExpenseEntry[]
  parties?: Party[]
  customers?: Customer[]
  suppliers?: Supplier[]
  items?: Item[]
  currentFY: string
  businessName?: string
  activeCompanyId?: string
  companyStateCode?: string
}

const MONTHS = [
  { value: '0', label: 'All Months (Full FY)' },
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

export default function GstReportsPage({
  salesInvoices = [],
  salesReturns = [],
  customerCreditNotes = [],
  customerDebitNotes = [],
  purchaseInvoices = [],
  purchaseReturns = [],
  supplierDebitNotes = [],
  supplierCreditNotes = [],
  expenseEntries = [],
  parties,
  customers = [],
  suppliers = [],
  items = [],
  currentFY = '2026-2027',
  businessName = 'SK TRADERS',
  companyStateCode = '19'
}: GstReportsPageProps) {
  const suppliersList = parties || (suppliers.length > 0 ? suppliers : customers)
  const customersList = parties || (customers.length > 0 ? customers : suppliers)

  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const m = new Date().getMonth() + 1
    return String(m)
  })
  
  const currentCalYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState<string>(String(currentCalYear))

  const [activeTab, setActiveTab] = useState<'gstr3b' | 'gstr1' | 'gstr2b'>('gstr3b')
  const [gstr1SubTab, setGstr1SubTab] = useState<'b2b' | 'b2clarge' | 'b2c' | 'notes' | 'hsn'>('b2b')
  const [gstr2bSourceFilter, setGstr2bSourceFilter] = useState<string>('all')

  const [searchTerm, setSearchTerm] = useState('')

  // Construct source dataset
  const sourceData: GstReportSourceData = useMemo(() => ({
    salesInvoices,
    salesReturns,
    customerCreditNotes,
    customerDebitNotes,
    purchaseInvoices,
    purchaseReturns,
    supplierDebitNotes,
    supplierCreditNotes,
    expenseEntries,
    customers: customersList,
    suppliers: suppliersList,
    items,
    companyStateCode
  }), [
    salesInvoices,
    salesReturns,
    customerCreditNotes,
    customerDebitNotes,
    purchaseInvoices,
    purchaseReturns,
    supplierDebitNotes,
    supplierCreditNotes,
    expenseEntries,
    customersList,
    suppliersList,
    items,
    companyStateCode
  ])

  // Compute live statutory GST report
  const filter: GstDateFilter = useMemo(() => {
    const m = parseInt(selectedMonth, 10)
    const y = parseInt(selectedYear, 10)
    if (m > 0) {
      return { month: m, year: y, fy: currentFY }
    }
    return { year: y, fy: currentFY }
  }, [selectedMonth, selectedYear, currentFY])

  const report: MonthlyGstReport = useMemo(() => {
    return computeMonthlyGstReport(sourceData, filter)
  }, [sourceData, filter])

  // Filtered GSTR-1 & GSTR-2B tables for search
  const filteredB2B = useMemo(() => {
    if (!searchTerm.trim()) return report.gstr1.b2b
    const q = searchTerm.toLowerCase()
    return report.gstr1.b2b.filter(b => 
      b.partyName.toLowerCase().includes(q) ||
      b.gstin.toLowerCase().includes(q) ||
      b.invoiceNo.toLowerCase().includes(q)
    )
  }, [report.gstr1.b2b, searchTerm])

  const filteredB2CLarge = useMemo(() => {
    const list = report.gstr1.b2cLarge || []
    if (!searchTerm.trim()) return list
    const q = searchTerm.toLowerCase()
    return list.filter(b =>
      b.partyName.toLowerCase().includes(q) ||
      b.invoiceNo.toLowerCase().includes(q) ||
      b.posName.toLowerCase().includes(q)
    )
  }, [report.gstr1.b2cLarge, searchTerm])

  const filteredNotes = useMemo(() => {
    if (!searchTerm.trim()) return report.gstr1.notes
    const q = searchTerm.toLowerCase()
    return report.gstr1.notes.filter(n => 
      n.partyName.toLowerCase().includes(q) ||
      n.gstin.toLowerCase().includes(q) ||
      n.noteNo.toLowerCase().includes(q) ||
      n.originalInvoiceNo.toLowerCase().includes(q)
    )
  }, [report.gstr1.notes, searchTerm])

  const filteredGstr2bItems = useMemo(() => {
    return report.gstr2b.items.filter(item => {
      if (gstr2bSourceFilter !== 'all' && item.source !== gstr2bSourceFilter) return false
      if (!searchTerm.trim()) return true
      const q = searchTerm.toLowerCase()
      return (
        item.partyName.toLowerCase().includes(q) ||
        item.gstin.toLowerCase().includes(q) ||
        item.voucherNo.toLowerCase().includes(q) ||
        item.hsnSac.toLowerCase().includes(q)
      )
    })
  }, [report.gstr2b.items, gstr2bSourceFilter, searchTerm])

  const handleExportExcel = () => {
    try {
      exportGstReportsToExcel(report, businessName, currentFY)
      toast.success('GST Compliance Workbook generated successfully', {
        description: `Exported GSTR-3B, GSTR-1, and GSTR-2B for ${report.periodLabel}`
      })
    } catch (err) {
      toast.error('Failed to export Excel workbook')
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700">
              <FileText className="w-5 h-5" weight="duotone" />
            </span>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                GST Reports & Statutory Hub
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Live GSTR-3B monthly return view, GSTR-1 outward registers, and GSTR-2B ITC reconciliation
              </p>
            </div>
          </div>
        </div>

        {/* Global Period Controls & Action */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="h-9 w-[150px] bg-white text-xs font-semibold">
                <SelectValue placeholder="Select Month" />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map(m => (
                  <SelectItem key={m.value} value={m.value} className="text-xs">
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="h-9 w-[95px] bg-white text-xs font-semibold">
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

          <Button
            onClick={handleExportExcel}
            className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center gap-2"
          >
            <FileXls className="w-4 h-4" weight="bold" />
            Export GST Excel (.xlsx)
          </Button>
        </div>
      </div>

      {/* 3 Live Top-Level Statutory KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* KPI 1: Total Output Tax Liability */}
        <Card className="border-slate-200/80 shadow-sm overflow-hidden bg-gradient-to-br from-white to-slate-50/50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                1. Total Output Liability (3.1)
              </span>
              <span className="p-2 rounded-xl bg-rose-50 border border-rose-100 text-rose-600">
                <ArrowUpRight className="w-4 h-4" weight="bold" />
              </span>
            </div>
            <div className="mt-3">
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                {formatCurrency(report.kpis.totalOutputTax)}
              </h2>
              <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5 font-medium">
                <span>Taxable Sales: <strong className="text-slate-700">{formatCurrency(report.kpis.totalTaxableSales)}</strong></span>
                <span>•</span>
                <span>RCM: <strong className="text-rose-700">{formatCurrency(report.kpis.totalRcmLiability)}</strong></span>
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-600 font-mono">
              <span>IGST: {formatCurrency(report.gstr3b.table31.totalLiability.igst)}</span>
              <span>CGST: {formatCurrency(report.gstr3b.table31.totalLiability.cgst)}</span>
              <span>SGST: {formatCurrency(report.gstr3b.table31.totalLiability.sgst)}</span>
            </div>
          </CardContent>
        </Card>

        {/* KPI 2: Total Eligible Input Tax Credit */}
        <Card className="border-slate-200/80 shadow-sm overflow-hidden bg-gradient-to-br from-white to-slate-50/50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                2. Total Eligible ITC (4C)
              </span>
              <span className="p-2 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600">
                <ArrowDownLeft className="w-4 h-4" weight="bold" />
              </span>
            </div>
            <div className="mt-3">
              <h2 className="text-2xl font-extrabold text-emerald-700 tracking-tight">
                {formatCurrency(report.kpis.totalEligibleItc)}
              </h2>
              <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5 font-medium">
                <span>Purchases ITC: <strong className="text-slate-700">{formatCurrency(report.gstr2b.totals.purchaseItc)}</strong></span>
                <span>•</span>
                <span>Expenses ITC: <strong className="text-slate-700">{formatCurrency(report.gstr2b.totals.expenseItc)}</strong></span>
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-600 font-mono">
              <span>IGST: {formatCurrency(report.gstr3b.table4.netItcAvailable.igst)}</span>
              <span>CGST: {formatCurrency(report.gstr3b.table4.netItcAvailable.cgst)}</span>
              <span>SGST: {formatCurrency(report.gstr3b.table4.netItcAvailable.sgst)}</span>
            </div>
          </CardContent>
        </Card>

        {/* KPI 3: Net Cash Tax Discharge Required */}
        <Card className="border-slate-200/80 shadow-sm overflow-hidden bg-gradient-to-br from-indigo-50/40 via-white to-blue-50/30 border-l-4 border-l-indigo-600">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-900">
                3. Net Cash Tax Payable (5.1)
              </span>
              <span className="p-2 rounded-xl bg-indigo-100 text-indigo-700">
                <Scales className="w-4 h-4" weight="bold" />
              </span>
            </div>
            <div className="mt-3">
              <h2 className="text-2xl font-extrabold text-indigo-900 tracking-tight">
                {formatCurrency(report.kpis.netCashPayable)}
              </h2>
              <p className="text-[11px] text-indigo-700 font-medium mt-1">
                Net cash liability required to be paid in electronic cash ledger
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-indigo-100/60 flex items-center justify-between text-[10px] text-indigo-800 font-mono font-bold">
              <span>Cash IGST: {formatCurrency(report.gstr3b.table51.cashPayable.igst)}</span>
              <span>Cash CGST: {formatCurrency(report.gstr3b.table51.cashPayable.cgst)}</span>
              <span>Cash SGST: {formatCurrency(report.gstr3b.table51.cashPayable.sgst)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tab Navigation (GSTR-3B / GSTR-1 / GSTR-2B) */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <TabsList className="bg-slate-100/80 p-1 rounded-xl h-11">
            <TabsTrigger 
              value="gstr3b" 
              className="text-xs font-bold px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm"
            >
              🏛️ GSTR-3B Monthly Return View
            </TabsTrigger>
            <TabsTrigger 
              value="gstr1" 
              className="text-xs font-bold px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm"
            >
              📤 GSTR-1 Sales & Notes Register
            </TabsTrigger>
            <TabsTrigger 
              value="gstr2b" 
              className="text-xs font-bold px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm"
            >
              📥 GSTR-2B Purchase & ITC Hub
            </TabsTrigger>
          </TabsList>

          <Badge variant="outline" className="h-7 text-xs font-semibold bg-white text-slate-700 border-slate-200">
            Filing Period: {report.periodLabel}
          </Badge>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: GSTR-3B MONTHLY RETURN VIEW                                        */}
        {/* ========================================================================= */}
        <TabsContent value="gstr3b" className="space-y-6 animate-in fade-in duration-200">
          
          {/* Table 3.1: Details of Outward Supplies & Inward Liable to RCM */}
          <Card className="border-slate-200/80 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/80 border-b border-slate-200 py-3.5 px-5">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[11px] font-mono font-bold">3.1</span>
                    Tax on Outward and Reverse Charge Inward Supplies
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 mt-0.5">
                    Net taxable sales and tax liabilities under Section 9(1) and Section 9(3) RCM
                  </CardDescription>
                </div>
                <Badge className="bg-slate-800 text-white text-xs font-mono font-bold">
                  Total Liability: {formatCurrency(report.gstr3b.table31.totalLiability.totalTax)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow>
                    <TableHead className="text-xs font-bold text-slate-700 w-[45%]">Nature of Supplies</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">Taxable Value (₹)</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">IGST (₹)</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">CGST (₹)</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">SGST / UT (₹)</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">Total Tax (₹)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="hover:bg-slate-50/50">
                    <TableCell className="font-semibold text-xs text-slate-800">
                      (a) Outward taxable supplies (net of returns & credit notes)
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono font-bold text-slate-900">
                      {formatCurrency(report.gstr3b.table31.outwardTaxable.taxableAmount)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono text-slate-600">
                      {formatCurrency(report.gstr3b.table31.outwardTaxable.igst)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono text-slate-600">
                      {formatCurrency(report.gstr3b.table31.outwardTaxable.cgst)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono text-slate-600">
                      {formatCurrency(report.gstr3b.table31.outwardTaxable.sgst)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono font-bold text-indigo-700">
                      {formatCurrency(report.gstr3b.table31.outwardTaxable.totalTax)}
                    </TableCell>
                  </TableRow>

                  <TableRow className="hover:bg-slate-50/50">
                    <TableCell className="font-semibold text-xs text-slate-800">
                      (b) Outward taxable supplies (zero rated)
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono text-slate-400">₹0.00</TableCell>
                    <TableCell className="text-xs text-right font-mono text-slate-400">₹0.00</TableCell>
                    <TableCell className="text-xs text-right font-mono text-slate-400">₹0.00</TableCell>
                    <TableCell className="text-xs text-right font-mono text-slate-400">₹0.00</TableCell>
                    <TableCell className="text-xs text-right font-mono text-slate-400">₹0.00</TableCell>
                  </TableRow>

                  <TableRow className="hover:bg-slate-50/50">
                    <TableCell className="font-semibold text-xs text-slate-800">
                      (c) Other outward supplies (nil rated, exempted)
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono text-slate-400">₹0.00</TableCell>
                    <TableCell className="text-xs text-right font-mono text-slate-400">₹0.00</TableCell>
                    <TableCell className="text-xs text-right font-mono text-slate-400">₹0.00</TableCell>
                    <TableCell className="text-xs text-right font-mono text-slate-400">₹0.00</TableCell>
                    <TableCell className="text-xs text-right font-mono text-slate-400">₹0.00</TableCell>
                  </TableRow>

                  <TableRow className="hover:bg-slate-50/50 bg-rose-50/20">
                    <TableCell className="font-semibold text-xs text-rose-950 flex items-center gap-1.5">
                      (d) Inward supplies liable to reverse charge (RCM / GTA freight)
                      <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-700 border-rose-200">
                        Cash Pay Required
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono font-bold text-rose-900">
                      {formatCurrency(report.gstr3b.table31.inwardRcm.taxableAmount)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono text-rose-700">
                      {formatCurrency(report.gstr3b.table31.inwardRcm.igst)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono text-rose-700">
                      {formatCurrency(report.gstr3b.table31.inwardRcm.cgst)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono text-rose-700">
                      {formatCurrency(report.gstr3b.table31.inwardRcm.sgst)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono font-bold text-rose-800">
                      {formatCurrency(report.gstr3b.table31.inwardRcm.totalTax)}
                    </TableCell>
                  </TableRow>

                  {/* Total Row */}
                  <TableRow className="bg-slate-100/80 font-bold border-t-2 border-slate-300">
                    <TableCell className="text-xs font-extrabold text-slate-900">
                      Total Tax Liability (3.1)
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono font-extrabold text-slate-900">
                      {formatCurrency(report.gstr3b.table31.totalLiability.taxableAmount)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono font-extrabold text-slate-900">
                      {formatCurrency(report.gstr3b.table31.totalLiability.igst)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono font-extrabold text-slate-900">
                      {formatCurrency(report.gstr3b.table31.totalLiability.cgst)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono font-extrabold text-slate-900">
                      {formatCurrency(report.gstr3b.table31.totalLiability.sgst)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono font-extrabold text-indigo-900">
                      {formatCurrency(report.gstr3b.table31.totalLiability.totalTax)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Table 4: Eligible Input Tax Credit (ITC) */}
          <Card className="border-slate-200/80 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/80 border-b border-slate-200 py-3.5 px-5">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[11px] font-mono font-bold">4</span>
                    Eligible Input Tax Credit (ITC)
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 mt-0.5">
                    Input tax credit available from purchase invoices, eligible expense vouchers, and RCM claims
                  </CardDescription>
                </div>
                <Badge className="bg-emerald-700 text-white text-xs font-mono font-bold">
                  Net ITC (4C): {formatCurrency(report.gstr3b.table4.netItcAvailable.totalTax)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow>
                    <TableHead className="text-xs font-bold text-slate-700 w-[45%]">Details</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">IGST (₹)</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">CGST (₹)</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">SGST / UT (₹)</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">Total ITC (₹)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-slate-50/40">
                    <TableCell colSpan={5} className="font-bold text-xs text-slate-700 uppercase tracking-wider py-2">
                      (A) ITC Available (whether in full or part)
                    </TableCell>
                  </TableRow>

                  <TableRow className="hover:bg-slate-50/50">
                    <TableCell className="text-xs text-slate-800 pl-6">
                      (3) Inward supplies liable to reverse charge (GTA / RCM ITC claim)
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono text-slate-700">
                      {formatCurrency(report.gstr3b.table4.itcRcmInward.igst)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono text-slate-700">
                      {formatCurrency(report.gstr3b.table4.itcRcmInward.cgst)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono text-slate-700">
                      {formatCurrency(report.gstr3b.table4.itcRcmInward.sgst)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono font-bold text-emerald-700">
                      {formatCurrency(report.gstr3b.table4.itcRcmInward.totalTax)}
                    </TableCell>
                  </TableRow>

                  <TableRow className="hover:bg-slate-50/50">
                    <TableCell className="text-xs text-slate-800 pl-6">
                      (5) All other ITC (Purchases + Eligible Expenses - Supplier Credit Notes)
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono text-slate-700">
                      {formatCurrency(report.gstr3b.table4.itcAllOther.igst)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono text-slate-700">
                      {formatCurrency(report.gstr3b.table4.itcAllOther.cgst)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono text-slate-700">
                      {formatCurrency(report.gstr3b.table4.itcAllOther.sgst)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono font-bold text-emerald-700">
                      {formatCurrency(report.gstr3b.table4.itcAllOther.totalTax)}
                    </TableCell>
                  </TableRow>

                  <TableRow className="bg-slate-50/40">
                    <TableCell colSpan={5} className="font-bold text-xs text-slate-700 uppercase tracking-wider py-2">
                      (B) ITC Reversed
                    </TableCell>
                  </TableRow>

                  <TableRow className="hover:bg-slate-50/50">
                    <TableCell className="text-xs text-slate-800 pl-6">
                      (2) Others (Purchase Returns + Supplier Debit Notes)
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono text-rose-600">
                      {formatCurrency(report.gstr3b.table4.itcReversals.igst)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono text-rose-600">
                      {formatCurrency(report.gstr3b.table4.itcReversals.cgst)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono text-rose-600">
                      {formatCurrency(report.gstr3b.table4.itcReversals.sgst)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono font-bold text-rose-700">
                      {formatCurrency(report.gstr3b.table4.itcReversals.totalTax)}
                    </TableCell>
                  </TableRow>

                  {/* Net ITC Row */}
                  <TableRow className="bg-emerald-50/40 font-bold border-t-2 border-emerald-200">
                    <TableCell className="text-xs font-extrabold text-emerald-950">
                      (C) Net ITC Available (A) - (B)
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono font-extrabold text-emerald-950">
                      {formatCurrency(report.gstr3b.table4.netItcAvailable.igst)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono font-extrabold text-emerald-950">
                      {formatCurrency(report.gstr3b.table4.netItcAvailable.cgst)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono font-extrabold text-emerald-950">
                      {formatCurrency(report.gstr3b.table4.netItcAvailable.sgst)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono font-extrabold text-emerald-800">
                      {formatCurrency(report.gstr3b.table4.netItcAvailable.totalTax)}
                    </TableCell>
                  </TableRow>

                  <TableRow className="hover:bg-slate-50/50 text-slate-500">
                    <TableCell className="text-xs pl-6">
                      (D) Ineligible ITC under Section 17(5) (Blocked Expenses)
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono">
                      {formatCurrency(report.gstr3b.table4.ineligibleItc.igst)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono">
                      {formatCurrency(report.gstr3b.table4.ineligibleItc.cgst)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono">
                      {formatCurrency(report.gstr3b.table4.ineligibleItc.sgst)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono font-bold">
                      {formatCurrency(report.gstr3b.table4.ineligibleItc.totalTax)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Table 5.1: Payment of Tax (Cash Discharge) */}
          <Card className="border-slate-200/80 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/80 border-b border-slate-200 py-3.5 px-5">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[11px] font-mono font-bold">5.1</span>
                    Payment of Tax (Cash Discharge Required)
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 mt-0.5">
                    Net cash liability payable after set-off of eligible ITC across tax heads
                  </CardDescription>
                </div>
                <Badge className="bg-indigo-700 text-white text-xs font-mono font-bold">
                  Total Cash Payable: {formatCurrency(report.gstr3b.table51.cashPayable.totalTax)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow>
                    <TableHead className="text-xs font-bold text-slate-700 w-[40%]">Tax Head Description</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">Total Tax Payable (₹)</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">Paid through ITC (₹)</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">Tax Paid in Cash (₹)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="hover:bg-slate-50/50">
                    <TableCell className="font-semibold text-xs text-slate-800">
                      Integrated Tax (IGST)
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono text-slate-700">
                      {formatCurrency(report.gstr3b.table51.taxPayable.igst)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono text-emerald-700">
                      {formatCurrency(report.gstr3b.table51.itcPaid.igst)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono font-bold text-indigo-700">
                      {formatCurrency(report.gstr3b.table51.cashPayable.igst)}
                    </TableCell>
                  </TableRow>

                  <TableRow className="hover:bg-slate-50/50">
                    <TableCell className="font-semibold text-xs text-slate-800">
                      Central Tax (CGST)
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono text-slate-700">
                      {formatCurrency(report.gstr3b.table51.taxPayable.cgst)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono text-emerald-700">
                      {formatCurrency(report.gstr3b.table51.itcPaid.cgst)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono font-bold text-indigo-700">
                      {formatCurrency(report.gstr3b.table51.cashPayable.cgst)}
                    </TableCell>
                  </TableRow>

                  <TableRow className="hover:bg-slate-50/50">
                    <TableCell className="font-semibold text-xs text-slate-800">
                      State / UT Tax (SGST)
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono text-slate-700">
                      {formatCurrency(report.gstr3b.table51.taxPayable.sgst)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono text-emerald-700">
                      {formatCurrency(report.gstr3b.table51.itcPaid.sgst)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono font-bold text-indigo-700">
                      {formatCurrency(report.gstr3b.table51.cashPayable.sgst)}
                    </TableCell>
                  </TableRow>

                  {/* Summary Total */}
                  <TableRow className="bg-indigo-50/30 font-bold border-t-2 border-indigo-200">
                    <TableCell className="text-xs font-extrabold text-indigo-950">
                      TOTAL CASH DISCHARGE REQUIRED
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono font-extrabold text-slate-900">
                      {formatCurrency(report.gstr3b.table51.taxPayable.totalTax)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono font-extrabold text-emerald-700">
                      {formatCurrency(report.gstr3b.table51.itcPaid.totalTax)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono font-extrabold text-indigo-900">
                      {formatCurrency(report.gstr3b.table51.cashPayable.totalTax)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========================================================================= */}
        {/* TAB 2: GSTR-1 OUTWARD SUPPLIES & NOTES REGISTER                           */}
        {/* ========================================================================= */}
        <TabsContent value="gstr1" className="space-y-5 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant={gstr1SubTab === 'b2b' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setGstr1SubTab('b2b')}
                className="text-xs font-bold h-8"
              >
                Table 4A - B2B Invoices ({report.gstr1.b2b.length})
              </Button>
              <Button
                variant={gstr1SubTab === 'b2clarge' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setGstr1SubTab('b2clarge')}
                className="text-xs font-bold h-8"
              >
                Table 5 - B2C Large ({report.gstr1.b2cLarge?.length || 0})
              </Button>
              <Button
                variant={gstr1SubTab === 'b2c' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setGstr1SubTab('b2c')}
                className="text-xs font-bold h-8"
              >
                Table 7 - B2C Small ({report.gstr1.b2cSmall?.length || report.gstr1.b2c.length})
              </Button>
              <Button
                variant={gstr1SubTab === 'notes' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setGstr1SubTab('notes')}
                className="text-xs font-bold h-8"
              >
                Table 9B - Credit/Debit Notes ({report.gstr1.notes.length})
              </Button>
              <Button
                variant={gstr1SubTab === 'hsn' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setGstr1SubTab('hsn')}
                className="text-xs font-bold h-8"
              >
                Table 12 - HSN ({report.gstr1.hsn.length})
              </Button>
            </div>

            <div className="relative w-full sm:w-64">
              <MagnifyingGlass className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Search party, GSTIN, invoice..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 pl-8 text-xs bg-slate-50"
              />
            </div>
          </div>

          {/* Sub-View: B2B Invoices */}
          {gstr1SubTab === 'b2b' && (
            <Card className="border-slate-200/80 shadow-sm overflow-hidden">
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-slate-50/80">
                    <TableRow>
                      <TableHead className="text-xs font-bold text-slate-700">Recipient GSTIN</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700">Customer Name</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700">Invoice No</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700">Date</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700">POS</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 text-right">Taxable (₹)</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 text-right">Rate</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 text-right">IGST (₹)</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 text-right">CGST (₹)</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 text-right">SGST (₹)</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 text-right">Total (₹)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredB2B.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-8 text-xs text-slate-400">
                          No B2B sales invoices found for this period.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredB2B.map(b => (
                        <TableRow key={b.id} className="hover:bg-slate-50/50">
                          <TableCell className="font-mono text-xs font-bold text-indigo-700">{b.gstin}</TableCell>
                          <TableCell className="font-semibold text-xs text-slate-800">{b.partyName}</TableCell>
                          <TableCell className="font-mono text-xs text-slate-700">{b.invoiceNo}</TableCell>
                          <TableCell className="text-xs text-slate-600">{b.invoiceDate}</TableCell>
                          <TableCell className="text-xs text-slate-600">{b.pos} - {b.posName}</TableCell>
                          <TableCell className="text-xs text-right font-mono font-bold text-slate-900">{formatCurrency(b.taxableValue)}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{b.gstRate}%</TableCell>
                          <TableCell className="text-xs text-right font-mono text-slate-600">{formatCurrency(b.igst)}</TableCell>
                          <TableCell className="text-xs text-right font-mono text-slate-600">{formatCurrency(b.cgst)}</TableCell>
                          <TableCell className="text-xs text-right font-mono text-slate-600">{formatCurrency(b.sgst)}</TableCell>
                          <TableCell className="text-xs text-right font-mono font-bold text-slate-900">{formatCurrency(b.invoiceValue)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Sub-View: Table 5 B2C Large (Inter-state unregistered > ₹1 Lakh) */}
          {gstr1SubTab === 'b2clarge' && (
            <Card className="border-slate-200/80 shadow-sm overflow-hidden">
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-slate-50/80">
                    <TableRow>
                      <TableHead className="text-xs font-bold text-slate-700">Invoice No</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700">Invoice Date</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700">Customer Name</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700">Place of Supply (POS)</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 text-right">Taxable Value (₹)</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 text-right">Rate (%)</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 text-right">IGST (₹)</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 text-right">Invoice Value (₹)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredB2CLarge.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-xs text-slate-400">
                          No B2C Large (Inter-state unregistered &gt; ₹1 Lakh) invoices found for this period.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredB2CLarge.map(b => (
                        <TableRow key={b.id} className="hover:bg-slate-50/50">
                          <TableCell className="font-mono text-xs font-bold text-indigo-700">{b.invoiceNo}</TableCell>
                          <TableCell className="text-xs text-slate-600">{b.invoiceDate}</TableCell>
                          <TableCell className="font-semibold text-xs text-slate-800">{b.partyName}</TableCell>
                          <TableCell className="text-xs text-slate-600">{b.pos} - {b.posName}</TableCell>
                          <TableCell className="text-xs text-right font-mono font-bold text-slate-900">{formatCurrency(b.taxableValue)}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{b.gstRate}%</TableCell>
                          <TableCell className="text-xs text-right font-mono text-slate-600">{formatCurrency(b.igst)}</TableCell>
                          <TableCell className="text-xs text-right font-mono font-bold text-indigo-700">{formatCurrency(b.totalInvoiceValue)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Sub-View: B2C Summary */}
          {gstr1SubTab === 'b2c' && (
            <Card className="border-slate-200/80 shadow-sm overflow-hidden">
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-slate-50/80">
                    <TableRow>
                      <TableHead className="text-xs font-bold text-slate-700">Place of Supply (POS)</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 text-right">Tax Rate (%)</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 text-right">Invoices Count</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 text-right">Total Taxable (₹)</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 text-right">IGST (₹)</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 text-right">CGST (₹)</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 text-right">SGST (₹)</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 text-right">Total Value (₹)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.gstr1.b2c.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-xs text-slate-400">
                          No B2C unregistered sales found for this period.
                        </TableCell>
                      </TableRow>
                    ) : (
                      report.gstr1.b2c.map((c, idx) => (
                        <TableRow key={idx} className="hover:bg-slate-50/50">
                          <TableCell className="font-semibold text-xs text-slate-800">{c.pos} - {c.posName}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{c.gstRate}%</TableCell>
                          <TableCell className="text-xs text-right font-mono">{c.count}</TableCell>
                          <TableCell className="text-xs text-right font-mono font-bold text-slate-900">{formatCurrency(c.taxableValue)}</TableCell>
                          <TableCell className="text-xs text-right font-mono text-slate-600">{formatCurrency(c.igst)}</TableCell>
                          <TableCell className="text-xs text-right font-mono text-slate-600">{formatCurrency(c.cgst)}</TableCell>
                          <TableCell className="text-xs text-right font-mono text-slate-600">{formatCurrency(c.sgst)}</TableCell>
                          <TableCell className="text-xs text-right font-mono font-bold text-indigo-700">{formatCurrency(c.totalInvoiceValue)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Sub-View: Table 9B Credit / Debit Notes */}
          {gstr1SubTab === 'notes' && (
            <Card className="border-slate-200/80 shadow-sm overflow-hidden">
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-slate-50/80">
                    <TableRow>
                      <TableHead className="text-xs font-bold text-slate-700">GSTIN</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700">Party Name</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700">Note Type</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700">Note No</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700">Date</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700">Original Inv No</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700">Reason</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 text-right">Taxable (₹)</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 text-right">Tax (₹)</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 text-right">Gross (₹)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredNotes.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8 text-xs text-slate-400">
                          No customer credit or debit notes found for this period.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredNotes.map(n => (
                        <TableRow key={n.id} className="hover:bg-slate-50/50">
                          <TableCell className="font-mono text-xs font-bold text-slate-700">{n.gstin}</TableCell>
                          <TableCell className="font-semibold text-xs text-slate-800">{n.partyName}</TableCell>
                          <TableCell>
                            <Badge className={cn("text-[10px] font-bold", n.noteType === 'C' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-blue-100 text-blue-800 border-blue-200')}>
                              {n.noteTypeName}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs font-bold text-slate-900">{n.noteNo}</TableCell>
                          <TableCell className="text-xs text-slate-600">{n.noteDate}</TableCell>
                          <TableCell className="font-mono text-xs text-slate-600">{n.originalInvoiceNo}</TableCell>
                          <TableCell className="text-xs text-slate-600">{n.reason}</TableCell>
                          <TableCell className="text-xs text-right font-mono font-bold text-slate-900">{formatCurrency(n.taxableValue)}</TableCell>
                          <TableCell className="text-xs text-right font-mono text-slate-700">{formatCurrency(n.igst + n.cgst + n.sgst)}</TableCell>
                          <TableCell className="text-xs text-right font-mono font-extrabold text-slate-900">{formatCurrency(n.totalAmount)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Sub-View: Table 12 HSN Summary */}
          {gstr1SubTab === 'hsn' && (
            <Card className="border-slate-200/80 shadow-sm overflow-hidden">
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-slate-50/80">
                    <TableRow>
                      <TableHead className="text-xs font-bold text-slate-700">HSN / SAC</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700">Description</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700">UQC</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 text-right">Total Qty</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 text-right">Total Value (₹)</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 text-right">Taxable Value (₹)</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 text-right">IGST (₹)</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 text-right">CGST (₹)</TableHead>
                      <TableHead className="text-xs font-bold text-slate-700 text-right">SGST (₹)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.gstr1.hsn.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-xs text-slate-400">
                          No HSN item data available for this period.
                        </TableCell>
                      </TableRow>
                    ) : (
                      report.gstr1.hsn.map((h, idx) => (
                        <TableRow key={idx} className="hover:bg-slate-50/50">
                          <TableCell className="font-mono text-xs font-bold text-indigo-700">{h.hsn}</TableCell>
                          <TableCell className="font-semibold text-xs text-slate-800">{h.description}</TableCell>
                          <TableCell className="text-xs text-slate-600">{h.uqc}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{h.totalQty}</TableCell>
                          <TableCell className="text-xs text-right font-mono font-bold text-slate-900">{formatCurrency(h.totalValue)}</TableCell>
                          <TableCell className="text-xs text-right font-mono text-slate-700">{formatCurrency(h.taxableValue)}</TableCell>
                          <TableCell className="text-xs text-right font-mono text-slate-600">{formatCurrency(h.igst)}</TableCell>
                          <TableCell className="text-xs text-right font-mono text-slate-600">{formatCurrency(h.cgst)}</TableCell>
                          <TableCell className="text-xs text-right font-mono text-slate-600">{formatCurrency(h.sgst)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ========================================================================= */}
        {/* TAB 3: GSTR-2B INWARD SUPPLIES & ITC REGISTER                             */}
        {/* ========================================================================= */}
        <TabsContent value="gstr2b" className="space-y-5 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2">
              <Select value={gstr2bSourceFilter} onValueChange={setGstr2bSourceFilter}>
                <SelectTrigger className="h-8 w-[180px] text-xs font-semibold">
                  <SelectValue placeholder="Filter Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All Inward Supplies</SelectItem>
                  <SelectItem value="purchase_invoice" className="text-xs">Purchase Invoices Only</SelectItem>
                  <SelectItem value="expense_entry" className="text-xs">Expense Entries Only</SelectItem>
                  <SelectItem value="supplier_credit_note" className="text-xs">Supplier Credit Notes</SelectItem>
                  <SelectItem value="supplier_debit_note" className="text-xs">Supplier Debit Notes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="relative w-full sm:w-64">
              <MagnifyingGlass className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Search vendor, GSTIN, voucher..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 pl-8 text-xs bg-slate-50"
              />
            </div>
          </div>

          <Card className="border-slate-200/80 shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow>
                    <TableHead className="text-xs font-bold text-slate-700">Type</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">Voucher No</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">Date</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">Supplier / Payee GSTIN</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">Party Name</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">ITC Category</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">Taxable (₹)</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">Rate</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">IGST (₹)</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">CGST (₹)</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">SGST (₹)</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">Total ITC (₹)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGstr2bItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center py-8 text-xs text-slate-400">
                        No inward supplies or expense entries found for this period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredGstr2bItems.map(item => (
                      <TableRow key={item.id} className="hover:bg-slate-50/50">
                        <TableCell>
                          <Badge 
                            variant="outline" 
                            className={cn(
                              "text-[10px] font-bold",
                              item.source === 'purchase_invoice' && 'bg-blue-50 text-blue-700 border-blue-200',
                              item.source === 'expense_entry' && item.isRcm && 'bg-rose-50 text-rose-700 border-rose-200',
                              item.source === 'expense_entry' && !item.isRcm && 'bg-purple-50 text-purple-700 border-purple-200',
                              item.source === 'supplier_credit_note' && 'bg-amber-50 text-amber-700 border-amber-200',
                              item.source === 'supplier_debit_note' && 'bg-red-50 text-red-700 border-red-200'
                            )}
                          >
                            {item.sourceLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs font-bold text-slate-900">{item.voucherNo}</TableCell>
                        <TableCell className="text-xs text-slate-600">{item.voucherDate}</TableCell>
                        <TableCell className="font-mono text-xs text-slate-700 font-bold">{item.gstin}</TableCell>
                        <TableCell className="font-semibold text-xs text-slate-800">{item.partyName}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px] font-medium">
                            {item.itcClassification}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono font-bold text-slate-900">{formatCurrency(item.taxableAmount)}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{item.gstRate}%</TableCell>
                        <TableCell className="text-xs text-right font-mono text-slate-600">{formatCurrency(item.igst)}</TableCell>
                        <TableCell className="text-xs text-right font-mono text-slate-600">{formatCurrency(item.cgst)}</TableCell>
                        <TableCell className="text-xs text-right font-mono text-slate-600">{formatCurrency(item.sgst)}</TableCell>
                        <TableCell className={cn("text-xs text-right font-mono font-extrabold", item.itcEligible ? "text-emerald-700" : "text-slate-400 line-through")}>
                          {formatCurrency(item.igst + item.cgst + item.sgst)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
