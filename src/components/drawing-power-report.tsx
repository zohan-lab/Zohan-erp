import { useState, useMemo, useEffect } from 'react'
import {
  Item,
  PurchaseInvoice,
  SalesInvoice,
  PurchaseReturn,
  SalesReturn,
  Customer,
  CustomerPayment,
  CustomerCreditNote,
  CustomerDebitNote,
  Supplier,
  Payment,
  SupplierDebitNote,
  SupplierCreditNote
} from '@/lib/types'
import { Counter } from '@/lib/cash-bank-types'
import { calculateInventoryReport } from '@/lib/report-calculations'
import { computeCustomerAging } from '@/lib/customer-aging-engine'
import { getSupplierBalanceDetails } from '@/lib/report-calculations'
import { formatCurrency, formatMT } from '@/lib/calculations'
import { exportDrawingPowerPDF } from '@/lib/pdf-export'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Bank,
  FilePdf,
  CalendarBlank,
  CurrencyInr,
  ShieldCheck,
  ShieldWarning,
  CheckCircle,
  WarningOctagon,
  Printer,
  Cube,
  Clock,
  Users,
  TrendUp,
  Percent,
  SlidersHorizontal,
  MagnifyingGlass,
  ArrowSquareOut
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface DrawingPowerReportProps {
  items: Item[]
  purchaseInvoices: PurchaseInvoice[]
  salesInvoices: SalesInvoice[]
  purchaseReturns?: PurchaseReturn[]
  salesReturns?: SalesReturn[]
  customers: Customer[]
  customerPayments: CustomerPayment[]
  customerDebitNotes?: CustomerDebitNote[]
  creditNotes?: CustomerCreditNote[]
  suppliers: Supplier[]
  payments: Payment[]
  debitNotes?: SupplierDebitNote[]
  supplierCreditNotes?: SupplierCreditNote[]
  counters: Counter[]
  currentFY: string
  activeCompany?: string
}

export default function DrawingPowerReport({
  items = [],
  purchaseInvoices = [],
  salesInvoices = [],
  purchaseReturns = [],
  salesReturns = [],
  customers = [],
  customerPayments = [],
  customerDebitNotes = [],
  creditNotes = [],
  suppliers = [],
  payments = [],
  debitNotes = [],
  supplierCreditNotes = [],
  counters = [],
  currentFY,
  activeCompany = 'SK TRADERS'
}: DrawingPowerReportProps) {
  // As-On Date for statement (Defaults to current date)
  const [asOnDate, setAsOnDate] = useState<string>(() => new Date().toISOString().split('T')[0])

  // Filter available Bank CC / OD accounts
  const ccOdAccounts = useMemo(() => {
    return counters.filter((c) => c.type === 'Bank CC / OD')
  }, [counters])

  // Selected Bank Account ID
  const [selectedBankId, setSelectedBankId] = useState<string>(() => {
    return ccOdAccounts[0]?.id || 'custom'
  })

  // Sanctioned Limit and Margin Percentage state (Initialized from selected counter or default)
  const [sanctionedLimit, setSanctionedLimit] = useState<string>(() => {
    return ccOdAccounts[0]?.sanctionedLimit ? String(ccOdAccounts[0].sanctionedLimit) : '10000000'
  })

  const [marginPercentage, setMarginPercentage] = useState<string>(() => {
    return ccOdAccounts[0]?.marginPercentage != null ? String(ccOdAccounts[0].marginPercentage) : '25'
  })

  // Active Tab
  const [activeTab, setActiveTab] = useState<'statement' | 'inventory' | 'debtors' | 'creditors'>('statement')

  // Search terms per tab
  const [stockSearch, setStockSearch] = useState('')
  const [debtorSearch, setDebtorSearch] = useState('')
  const [creditorSearch, setCreditorSearch] = useState('')

  // Sync bank account change
  const handleBankChange = (bankId: string) => {
    setSelectedBankId(bankId)
    if (bankId === 'custom') return

    const bank = ccOdAccounts.find((c) => c.id === bankId)
    if (bank) {
      if (bank.sanctionedLimit != null) setSanctionedLimit(String(bank.sanctionedLimit))
      if (bank.marginPercentage != null) setMarginPercentage(String(bank.marginPercentage))
      toast.info(`Loaded parameters for ${bank.name}`)
    }
  }

  // Selected Bank Object
  const selectedBank = useMemo(() => {
    if (selectedBankId === 'custom') {
      return {
        id: 'custom',
        name: 'Custom / Generic CC-OD Account',
        type: 'Bank CC / OD' as const,
        openingBalance: 0,
        currentBalance: 0,
        sanctionedLimit: parseFloat(sanctionedLimit) || 0,
        marginPercentage: parseFloat(marginPercentage) || 0
      }
    }
    return ccOdAccounts.find((c) => c.id === selectedBankId) || {
      id: 'default',
      name: 'Bank CC / OD',
      type: 'Bank CC / OD' as const,
      openingBalance: 0,
      currentBalance: 0,
      sanctionedLimit: parseFloat(sanctionedLimit) || 0,
      marginPercentage: parseFloat(marginPercentage) || 0
    }
  }, [selectedBankId, ccOdAccounts, sanctionedLimit, marginPercentage])

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. INVENTORY VALUATION COMPONENT (As of As-On Date)
  // ─────────────────────────────────────────────────────────────────────────────
  const inventoryBreakdown = useMemo(() => {
    const periodPurchases = purchaseInvoices.filter((inv) => !asOnDate || inv.invoiceDate <= asOnDate)
    const periodSales = salesInvoices.filter((inv) => !asOnDate || inv.invoiceDate <= asOnDate)
    const periodPurchaseReturns = purchaseReturns.filter((pr) => !asOnDate || (pr.returnDate || '') <= asOnDate)
    const periodSalesReturns = salesReturns.filter((sr) => !asOnDate || (sr.returnDate || '') <= asOnDate)

    const rawInventory = calculateInventoryReport(
      items,
      periodPurchases,
      periodSales,
      periodPurchaseReturns,
      periodSalesReturns,
      { periodType: 'custom', fromDate: '', toDate: asOnDate },
      currentFY
    )

    return rawInventory.map((item) => ({
      itemId: item.itemId,
      itemName: item.itemName,
      category: item.category || 'General',
      unit: item.unit,
      quantity: item.balanceMT || 0,
      rate: item.avgPurchaseRate || 0,
      value: item.currentStockValue || 0
    }))
  }, [items, purchaseInvoices, salesInvoices, purchaseReturns, salesReturns, asOnDate, currentFY])

  const totalStockValue = useMemo(() => {
    return inventoryBreakdown.reduce((sum, item) => sum + (item.value > 0 ? item.value : 0), 0)
  }, [inventoryBreakdown])

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. DEBTORS AGING & ELIGIBLE BOOK DEBTS (< 90 Days as of As-On Date)
  // ─────────────────────────────────────────────────────────────────────────────
  const debtorsAgingResult = useMemo(() => {
    // Reference Date is the exact selected As-On Date (NOT hardcoded new Date())
    const referenceDate = asOnDate ? new Date(asOnDate + 'T00:00:00') : new Date()

    const periodSales = salesInvoices.filter((inv) => !asOnDate || inv.invoiceDate <= asOnDate)
    const periodPayments = customerPayments.filter((p) => !asOnDate || p.paymentDate <= asOnDate)
    const periodCreditNotes = creditNotes.filter((cn) => !asOnDate || cn.date <= asOnDate)
    const periodDebitNotes = customerDebitNotes.filter((dn) => !asOnDate || dn.date <= asOnDate)
    const periodSalesReturns = salesReturns.filter((sr) => !asOnDate || (sr.returnDate || '') <= asOnDate)

    const agingAggregate = computeCustomerAging(
      customers,
      periodSales,
      periodPayments,
      periodCreditNotes,
      periodSalesReturns,
      referenceDate,
      periodDebitNotes
    )

    const customerList = agingAggregate.customers.map((c) => {
      // Eligible debts: 0-30 days + 31-60 days + 61-90 days
      const eligible = (c.bracket0to30 || 0) + (c.bracket31to60 || 0) + (c.bracket61to90 || 0)
      // Ineligible debts: > 90 days overdue
      const ineligible = c.bracket90plus || 0
      const total = c.totalOutstanding || 0

      return {
        customerId: c.customerId,
        customerName: c.customerName,
        phone: c.phone,
        totalOutstanding: Math.max(0, total),
        eligibleAmount: Math.max(0, eligible),
        ineligibleAmount: Math.max(0, ineligible),
        isEligible: eligible > 0
      }
    })

    const totalEligibleDebtors = customerList.reduce((sum, c) => sum + c.eligibleAmount, 0)
    const totalIneligibleDebtors = customerList.reduce((sum, c) => sum + c.ineligibleAmount, 0)
    const totalDebtorsOutstanding = customerList.reduce((sum, c) => sum + c.totalOutstanding, 0)

    return {
      customers: customerList,
      totalEligibleDebtors,
      totalIneligibleDebtors,
      totalDebtorsOutstanding
    }
  }, [customers, salesInvoices, customerPayments, creditNotes, customerDebitNotes, salesReturns, asOnDate])

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. CREDITORS (TRADE PAYABLES) COMPONENT (As of As-On Date)
  // ─────────────────────────────────────────────────────────────────────────────
  const creditorsBreakdown = useMemo(() => {
    const periodPurchases = purchaseInvoices.filter((inv) => !asOnDate || inv.invoiceDate <= asOnDate)
    const periodPayments = payments.filter((p) => !asOnDate || p.paymentDate <= asOnDate)
    const periodDebitNotes = debitNotes.filter((dn) => !asOnDate || dn.date <= asOnDate)
    const periodCreditNotes = supplierCreditNotes.filter((cn) => !asOnDate || cn.date <= asOnDate)
    const periodReturns = purchaseReturns.filter((pr) => !asOnDate || (pr.returnDate || '') <= asOnDate)

    const list = suppliers.map((supplier) => {
      const { payableBalance, netBalance, totalInvoiced, totalPaid } = getSupplierBalanceDetails(
        supplier,
        periodPurchases,
        periodPayments,
        periodDebitNotes,
        periodCreditNotes,
        periodReturns
      )

      return {
        supplierId: supplier.id,
        supplierName: supplier.name,
        phone: supplier.phone,
        totalInvoiced,
        totalPaid,
        netBalance,
        payableAmount: Math.max(0, payableBalance)
      }
    })

    const totalCreditors = list.reduce((sum, s) => sum + s.payableAmount, 0)

    return {
      suppliers: list,
      totalCreditors
    }
  }, [suppliers, purchaseInvoices, payments, debitNotes, supplierCreditNotes, purchaseReturns, asOnDate])

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. DRAWING POWER (DP) CORE EQUATION & COMPARISON METRICS
  // ─────────────────────────────────────────────────────────────────────────────
  const dpCalculations = useMemo(() => {
    const limit = parseFloat(sanctionedLimit) || 0
    const marginPct = parseFloat(marginPercentage) || 0

    const stock = totalStockValue
    const debtors = debtorsAgingResult.totalEligibleDebtors
    const creditors = creditorsBreakdown.totalCreditors

    // Gross Base = (Stock + Eligible Debtors) - Creditors
    const grossBase = Math.max(0, stock + debtors - creditors)

    // Margin Deduction (Haircut) = Gross Base * (Margin % / 100)
    const marginDeduction = grossBase * (marginPct / 100)

    // Net Calculated Drawing Power = Gross Base - Margin Deduction
    const netDrawingPower = Math.max(0, grossBase - marginDeduction)

    // Final Usable Drawing Power = Min(Net DP, Sanctioned Limit)
    const finalDP = Math.min(netDrawingPower, limit)

    // Deficit or Cushion
    const limitCoverageRatio = limit > 0 ? (netDrawingPower / limit) * 100 : 0
    const isFullLimitCovered = netDrawingPower >= limit
    const unutilizedMargin = Math.max(0, netDrawingPower - limit)
    const dpDeficit = netDrawingPower < limit ? limit - netDrawingPower : 0

    return {
      stockValue: stock,
      eligibleDebtors: debtors,
      ineligibleDebtors: debtorsAgingResult.totalIneligibleDebtors,
      totalCreditors: creditors,
      grossBase,
      marginPercentage: marginPct,
      marginDeduction,
      netDrawingPower,
      sanctionedLimit: limit,
      finalDP,
      limitCoverageRatio,
      isFullLimitCovered,
      unutilizedMargin,
      dpDeficit
    }
  }, [totalStockValue, debtorsAgingResult, creditorsBreakdown, sanctionedLimit, marginPercentage])

  // ─────────────────────────────────────────────────────────────────────────────
  // PDF Export Handler
  // ─────────────────────────────────────────────────────────────────────────────
  const handleExportPDF = () => {
    exportDrawingPowerPDF({
      businessName: activeCompany,
      currentFY,
      asOnDate,
      bankAccountName: selectedBank.name,
      sanctionedLimit: dpCalculations.sanctionedLimit,
      marginPercentage: dpCalculations.marginPercentage,
      summary: {
        stockValue: dpCalculations.stockValue,
        eligibleDebtors: dpCalculations.eligibleDebtors,
        ineligibleDebtors: dpCalculations.ineligibleDebtors,
        totalCreditors: dpCalculations.totalCreditors,
        grossBase: dpCalculations.grossBase,
        marginDeduction: dpCalculations.marginDeduction,
        netDrawingPower: dpCalculations.netDrawingPower,
        sanctionedLimit: dpCalculations.sanctionedLimit,
        finalDP: dpCalculations.finalDP
      },
      stockBreakdown: inventoryBreakdown.filter((i) => i.value > 0),
      debtorsBreakdown: debtorsAgingResult.customers.filter((d) => d.totalOutstanding > 0),
      creditorsBreakdown: creditorsBreakdown.suppliers.filter((c) => c.payableAmount > 0)
    })
    toast.success('Drawing Power statement PDF generated successfully')
  }

  // Print Handler
  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="space-y-6 pb-16">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Drawing Power Report (DP)</h1>
            <Badge variant="outline" className="bg-blue-50 text-[#0256e8] border-blue-200 text-[11px] font-bold">
              Bank Stock Statement
            </Badge>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Dynamic bank drawing power computation based on live stock valuation, 90-day eligible debtors, and supplier payables.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            onClick={handlePrint}
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 text-slate-700 bg-white border-slate-200 hover:bg-slate-50 font-semibold rounded-xl text-xs"
          >
            <Printer className="h-4 w-4 text-slate-500" />
            Print
          </Button>

          <Button
            onClick={handleExportPDF}
            size="sm"
            className="h-9 gap-1.5 bg-[#0256e8] hover:bg-[#0046cd] text-white font-semibold rounded-xl text-xs shadow-2xs"
          >
            <FilePdf className="h-4 w-4" weight="bold" />
            Export Bank PDF
          </Button>
        </div>
      </div>

      {/* Control Configuration Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs">
        <div className="flex items-center gap-2 mb-3">
          <SlidersHorizontal className="h-4 w-4 text-indigo-600" weight="bold" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Bank & Valuation Parameters</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Parameter 1: Statement As-On Date */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <CalendarBlank className="h-3.5 w-3.5 text-blue-600" />
              As-On Statement Date
            </Label>
            <Input
              type="date"
              value={asOnDate}
              onChange={(e) => setAsOnDate(e.target.value)}
              className="h-9 text-xs bg-slate-50/50 border-slate-200 rounded-xl font-medium"
              required
            />
            <p className="text-[10px] text-slate-400">Aging reference point for ≤ 90 day debtor cutoff</p>
          </div>

          {/* Parameter 2: Bank Account Selector */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Bank className="h-3.5 w-3.5 text-indigo-600" />
              Select CC / OD Account
            </Label>
            <Select value={selectedBankId} onValueChange={handleBankChange}>
              <SelectTrigger className="h-9 text-xs bg-slate-50/50 border-slate-200 rounded-xl font-medium">
                <SelectValue placeholder="Select Bank" />
              </SelectTrigger>
              <SelectContent>
                {ccOdAccounts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} {c.sanctionedLimit ? `(Limit: ${formatCurrency(c.sanctionedLimit)})` : ''}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Custom / Generic Bank Simulation</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-slate-400">Auto-populates saved sanction limit & margin haircut</p>
          </div>

          {/* Parameter 3: Bank Haircut Margin % */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Percent className="h-3.5 w-3.5 text-amber-600" />
              Bank Margin (Haircut %)
            </Label>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={marginPercentage}
              onChange={(e) => setMarginPercentage(e.target.value)}
              className="h-9 text-xs bg-slate-50/50 border-slate-200 rounded-xl font-bold text-slate-900"
              placeholder="e.g. 25"
            />
            <p className="text-[10px] text-slate-400">Standard bank stock margin (typically 25%)</p>
          </div>

          {/* Parameter 4: Sanctioned Limit (₹) */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <CurrencyInr className="h-3.5 w-3.5 text-emerald-600" />
              Sanctioned CC / OD Limit (₹)
            </Label>
            <Input
              type="number"
              min="0"
              step="10000"
              value={sanctionedLimit}
              onChange={(e) => setSanctionedLimit(e.target.value)}
              className="h-9 text-xs bg-slate-50/50 border-slate-200 rounded-xl font-extrabold text-blue-700"
              placeholder="e.g. 10000000"
            />
            <p className="text-[10px] text-slate-400">Maximum drawing ceiling approved by bank</p>
          </div>
        </div>
      </div>

      {/* Primary KPI Summary Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Stock Value */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">A. Inventory Stock</p>
            <p className="text-xl font-extrabold text-slate-900 tracking-tight">{formatCurrency(dpCalculations.stockValue)}</p>
            <p className="text-[10px] text-slate-400 mt-1">{inventoryBreakdown.length} items valued at WACM</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Cube className="h-5 w-5" weight="duotone" />
          </div>
        </div>

        {/* Card 2: Eligible Book Debts */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">B. Eligible Debtors</p>
            <p className="text-xl font-extrabold text-emerald-600 tracking-tight">{formatCurrency(dpCalculations.eligibleDebtors)}</p>
            <p className="text-[10px] text-slate-400 mt-1">
              ≤ 90 days ({formatCurrency(dpCalculations.ineligibleDebtors)} disallowed)
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Clock className="h-5 w-5" weight="duotone" />
          </div>
        </div>

        {/* Card 3: Total Creditors */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">C. Trade Creditors</p>
            <p className="text-xl font-extrabold text-amber-600 tracking-tight">{formatCurrency(dpCalculations.totalCreditors)}</p>
            <p className="text-[10px] text-slate-400 mt-1">Deducted from gross security</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Users className="h-5 w-5" weight="duotone" />
          </div>
        </div>

        {/* Card 4: Final Usable Drawing Power */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl border border-slate-800 p-4 shadow-md flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">Final Usable DP</p>
            <p className="text-2xl font-black text-white tracking-tight">{formatCurrency(dpCalculations.finalDP)}</p>
            <div className="flex items-center gap-1 mt-1">
              <span className={cn(
                "inline-block text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md",
                dpCalculations.isFullLimitCovered ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
              )}>
                {dpCalculations.isFullLimitCovered ? '100% Covered' : `Capped at DP`}
              </span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-300 flex items-center justify-center shrink-0 border border-blue-400/30">
            <ShieldCheck className="h-5 w-5" weight="bold" />
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="space-y-4">
        <TabsList className="bg-white border border-slate-200/80 p-1 rounded-xl h-11 shadow-2xs">
          <TabsTrigger value="statement" className="text-xs font-bold rounded-lg data-[state=active]:bg-slate-900 data-[state=active]:text-white gap-2">
            <Bank className="h-4 w-4" />
            Drawing Power Statement
          </TabsTrigger>
          <TabsTrigger value="inventory" className="text-xs font-bold rounded-lg data-[state=active]:bg-slate-900 data-[state=active]:text-white gap-2">
            <Cube className="h-4 w-4" />
            Stock Schedule ({inventoryBreakdown.length})
          </TabsTrigger>
          <TabsTrigger value="debtors" className="text-xs font-bold rounded-lg data-[state=active]:bg-slate-900 data-[state=active]:text-white gap-2">
            <Clock className="h-4 w-4" />
            Debtors Aging (90-Day Filter)
          </TabsTrigger>
          <TabsTrigger value="creditors" className="text-xs font-bold rounded-lg data-[state=active]:bg-slate-900 data-[state=active]:text-white gap-2">
            <Users className="h-4 w-4" />
            Creditors Schedule ({creditorsBreakdown.suppliers.length})
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: FORMAL DRAWING POWER STATEMENT */}
        <TabsContent value="statement" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Col (8/12): Step-by-Step Formal Bank Computation Table */}
            <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Drawing Power Statement (Bank Format)</h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Computation as on {new Date(asOnDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <Badge variant="outline" className="font-mono text-xs font-bold bg-white">
                  FY {currentFY}
                </Badge>
              </div>

              <div className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/60 border-b border-slate-100">
                      <TableHead className="text-xs font-bold text-slate-600 w-12 text-center">Ref</TableHead>
                      <TableHead className="text-xs font-bold text-slate-600">Particulars / Security Head</TableHead>
                      <TableHead className="text-xs font-bold text-slate-600 text-right">Gross Amount (₹)</TableHead>
                      <TableHead className="text-xs font-bold text-slate-600 text-right">Net Impact (₹)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="hover:bg-slate-50/50">
                      <TableCell className="text-center font-bold text-slate-400 text-xs">A</TableCell>
                      <TableCell className="text-xs font-medium text-slate-800">
                        Value of Paid / Available Physical Inventory
                        <p className="text-[10px] text-slate-400">Total closing stock valued at weighted average purchase cost</p>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-600">{formatCurrency(dpCalculations.stockValue)}</TableCell>
                      <TableCell className="text-right font-mono font-bold text-xs text-slate-900">{formatCurrency(dpCalculations.stockValue)}</TableCell>
                    </TableRow>

                    <TableRow className="hover:bg-slate-50/50">
                      <TableCell className="text-center font-bold text-slate-400 text-xs">B</TableCell>
                      <TableCell className="text-xs font-medium text-slate-800">
                        Eligible Book Debts (≤ 90 Days Overdue)
                        <p className="text-[10px] text-emerald-600 font-medium">Excludes overdue debts beyond 90 days ({formatCurrency(dpCalculations.ineligibleDebtors)})</p>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-600">{formatCurrency(dpCalculations.eligibleDebtors)}</TableCell>
                      <TableCell className="text-right font-mono font-bold text-xs text-emerald-600">+{formatCurrency(dpCalculations.eligibleDebtors)}</TableCell>
                    </TableRow>

                    <TableRow className="hover:bg-slate-50/50">
                      <TableCell className="text-center font-bold text-slate-400 text-xs">C</TableCell>
                      <TableCell className="text-xs font-medium text-slate-800">
                        Less: Trade Creditors (Supplier Payables)
                        <p className="text-[10px] text-slate-400">Unpaid supplier liabilities hypothecated to bank</p>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-600">{formatCurrency(dpCalculations.totalCreditors)}</TableCell>
                      <TableCell className="text-right font-mono font-bold text-xs text-amber-600">-{formatCurrency(dpCalculations.totalCreditors)}</TableCell>
                    </TableRow>

                    <TableRow className="bg-slate-50/80 font-bold border-t border-slate-200">
                      <TableCell className="text-center text-xs text-slate-700">D</TableCell>
                      <TableCell className="text-xs text-slate-900">
                        Gross Working Capital Security Base = (A + B) - C
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-500">—</TableCell>
                      <TableCell className="text-right font-mono text-sm text-slate-900">{formatCurrency(dpCalculations.grossBase)}</TableCell>
                    </TableRow>

                    <TableRow className="hover:bg-slate-50/50">
                      <TableCell className="text-center font-bold text-slate-400 text-xs">E</TableCell>
                      <TableCell className="text-xs font-medium text-slate-800">
                        Less: Bank Haircut Margin ({dpCalculations.marginPercentage}%)
                        <p className="text-[10px] text-slate-400">Stipulated margin deducted on Gross Base D</p>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-600">{dpCalculations.marginPercentage}%</TableCell>
                      <TableCell className="text-right font-mono font-bold text-xs text-red-600">-{formatCurrency(dpCalculations.marginDeduction)}</TableCell>
                    </TableRow>

                    <TableRow className="bg-blue-50/60 font-bold border-t border-blue-200">
                      <TableCell className="text-center text-xs text-blue-700">F</TableCell>
                      <TableCell className="text-xs text-blue-950 font-extrabold">
                        Net Calculated Drawing Power (DP) = D - E
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-blue-600">—</TableCell>
                      <TableCell className="text-right font-mono text-sm font-extrabold text-[#0256e8]">{formatCurrency(dpCalculations.netDrawingPower)}</TableCell>
                    </TableRow>

                    <TableRow className="hover:bg-slate-50/50">
                      <TableCell className="text-center font-bold text-slate-400 text-xs">G</TableCell>
                      <TableCell className="text-xs font-medium text-slate-800">
                        Bank Sanctioned CC / OD Limit
                        <p className="text-[10px] text-slate-400">Approved facility limit under sanction terms</p>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-600">—</TableCell>
                      <TableCell className="text-right font-mono font-bold text-xs text-slate-800">{formatCurrency(dpCalculations.sanctionedLimit)}</TableCell>
                    </TableRow>

                    <TableRow className="bg-slate-900 text-white font-extrabold border-t-2 border-slate-900">
                      <TableCell className="text-center text-xs text-blue-300">H</TableCell>
                      <TableCell className="text-xs text-white">
                        FINAL USABLE DRAWING POWER = Min(F, G)
                        <p className="text-[10px] text-slate-300 font-normal">Maximum legally allowable overdraft withdrawal</p>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-400">—</TableCell>
                      <TableCell className="text-right font-mono text-base text-emerald-400">{formatCurrency(dpCalculations.finalDP)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Right Col (4/12): Bank Facility Health & Compliance Cards */}
            <div className="lg:col-span-4 space-y-4">
              {/* Card 1: Facility Utilization Assessment */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-blue-600" weight="bold" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">Facility Health Summary</h3>
                </div>

                <div className="space-y-3 pt-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-medium">Sanction Limit:</span>
                    <span className="font-mono font-bold text-slate-900">{formatCurrency(dpCalculations.sanctionedLimit)}</span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-medium">Calculated DP:</span>
                    <span className="font-mono font-bold text-[#0256e8]">{formatCurrency(dpCalculations.netDrawingPower)}</span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-medium">Coverage Ratio:</span>
                    <span className={cn(
                      "font-mono font-extrabold",
                      dpCalculations.limitCoverageRatio >= 100 ? "text-emerald-600" : "text-amber-600"
                    )}>
                      {dpCalculations.limitCoverageRatio.toFixed(1)}%
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-100">
                    <div className={cn(
                      "p-3 rounded-xl flex items-start gap-2.5",
                      dpCalculations.isFullLimitCovered ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-amber-50 text-amber-800 border border-amber-200"
                    )}>
                      {dpCalculations.isFullLimitCovered ? (
                        <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" weight="fill" />
                      ) : (
                        <WarningOctagon className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" weight="fill" />
                      )}
                      <div className="text-[11px] leading-relaxed">
                        <p className="font-bold">
                          {dpCalculations.isFullLimitCovered
                            ? 'Sanctioned Limit Fully Covered'
                            : 'Drawing Power Constrained'}
                        </p>
                        <p className="text-[10px] mt-0.5 opacity-90">
                          {dpCalculations.isFullLimitCovered
                            ? `Net security exceeds facility limit by ${formatCurrency(dpCalculations.unutilizedMargin)}.`
                            : `Deficit of ${formatCurrency(dpCalculations.dpDeficit)}. Borrowing is capped at ${formatCurrency(dpCalculations.netDrawingPower)}.`}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Security Composition */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">Security Asset Ratio</h4>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                      Inventory Share:
                    </span>
                    <span className="font-mono font-bold text-slate-800">
                      {dpCalculations.grossBase > 0 ? ((dpCalculations.stockValue / (dpCalculations.stockValue + dpCalculations.eligibleDebtors)) * 100).toFixed(1) : 0}%
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      Debtors Share (≤ 90d):
                    </span>
                    <span className="font-mono font-bold text-slate-800">
                      {dpCalculations.grossBase > 0 ? ((dpCalculations.eligibleDebtors / (dpCalculations.stockValue + dpCalculations.eligibleDebtors)) * 100).toFixed(1) : 0}%
                    </span>
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                      Disallowed Debtors:
                    </span>
                    <span className="font-mono font-bold text-red-600">
                      {formatCurrency(dpCalculations.ineligibleDebtors)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* TAB 2: INVENTORY STOCK BREAKDOWN */}
        <TabsContent value="inventory" className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
              <div className="relative w-72">
                <MagnifyingGlass className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Search item or category..."
                  value={stockSearch}
                  onChange={(e) => setStockSearch(e.target.value)}
                  className="h-9 pl-9 text-xs bg-white border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex items-center gap-3 text-xs font-medium text-slate-600">
                <span>Total Inventory Value: <strong className="font-mono font-extrabold text-slate-900">{formatCurrency(dpCalculations.stockValue)}</strong></span>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[500px]">
              <Table>
                <TableHeader className="sticky top-0 bg-slate-50 z-10">
                  <TableRow className="border-b border-slate-100">
                    <TableHead className="text-xs font-bold text-slate-600">Item Description</TableHead>
                    <TableHead className="text-xs font-bold text-slate-600">Category</TableHead>
                    <TableHead className="text-xs font-bold text-slate-600 text-right">Closing Quantity</TableHead>
                    <TableHead className="text-xs font-bold text-slate-600 text-right">Valuation Rate (WACM)</TableHead>
                    <TableHead className="text-xs font-bold text-slate-600 text-right">Total Stock Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventoryBreakdown
                    .filter((item) => {
                      if (!stockSearch.trim()) return true
                      const term = stockSearch.toLowerCase()
                      return item.itemName.toLowerCase().includes(term) || item.category.toLowerCase().includes(term)
                    })
                    .map((item) => (
                      <TableRow key={item.itemId} className="hover:bg-slate-50/80 border-b border-slate-100">
                        <TableCell className="py-3 text-xs font-bold text-slate-900">{item.itemName}</TableCell>
                        <TableCell className="py-3 text-xs text-slate-500">
                          <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 text-[10px]">
                            {item.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3 text-xs font-mono font-semibold text-right text-slate-800">
                          {item.quantity.toLocaleString('en-IN', { maximumFractionDigits: 3 })} {item.unit}
                        </TableCell>
                        <TableCell className="py-3 text-xs font-mono text-right text-slate-600">
                          {formatCurrency(item.rate)}
                        </TableCell>
                        <TableCell className="py-3 text-xs font-mono font-bold text-right text-slate-900">
                          {formatCurrency(item.value)}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* TAB 3: DEBTORS AGING BREAKDOWN (< 90 vs > 90 Days) */}
        <TabsContent value="debtors" className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
              <div className="relative w-72">
                <MagnifyingGlass className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Search customer name..."
                  value={debtorSearch}
                  onChange={(e) => setDebtorSearch(e.target.value)}
                  className="h-9 pl-9 text-xs bg-white border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex items-center gap-4 text-xs font-semibold">
                <span className="text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                  Eligible (≤ 90d): {formatCurrency(dpCalculations.eligibleDebtors)}
                </span>
                <span className="text-red-600 bg-red-50 px-2.5 py-1 rounded-lg border border-red-100">
                  Disallowed (&gt; 90d): {formatCurrency(dpCalculations.ineligibleDebtors)}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[500px]">
              <Table>
                <TableHeader className="sticky top-0 bg-slate-50 z-10">
                  <TableRow className="border-b border-slate-100">
                    <TableHead className="text-xs font-bold text-slate-600">Customer Name</TableHead>
                    <TableHead className="text-xs font-bold text-slate-600 text-right">Total Outstanding</TableHead>
                    <TableHead className="text-xs font-bold text-slate-600 text-right">Eligible (≤ 90 Days)</TableHead>
                    <TableHead className="text-xs font-bold text-slate-600 text-right">Ineligible (&gt; 90 Days)</TableHead>
                    <TableHead className="text-xs font-bold text-slate-600 text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {debtorsAgingResult.customers
                    .filter((c) => {
                      if (!debtorSearch.trim()) return true
                      const term = debtorSearch.toLowerCase()
                      return c.customerName.toLowerCase().includes(term) || (c.phone || '').includes(term)
                    })
                    .map((cust) => (
                      <TableRow key={cust.customerId} className="hover:bg-slate-50/80 border-b border-slate-100">
                        <TableCell className="py-3 text-xs font-bold text-slate-900">
                          {cust.customerName}
                          {cust.phone && <p className="text-[10px] text-slate-400 font-normal">{cust.phone}</p>}
                        </TableCell>
                        <TableCell className="py-3 text-xs font-mono font-semibold text-right text-slate-700">
                          {formatCurrency(cust.totalOutstanding)}
                        </TableCell>
                        <TableCell className="py-3 text-xs font-mono font-bold text-right text-emerald-600">
                          {formatCurrency(cust.eligibleAmount)}
                        </TableCell>
                        <TableCell className="py-3 text-xs font-mono font-medium text-right text-red-600">
                          {cust.ineligibleAmount > 0 ? formatCurrency(cust.ineligibleAmount) : '—'}
                        </TableCell>
                        <TableCell className="py-3 text-center">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] font-bold",
                              cust.eligibleAmount > 0 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"
                            )}
                          >
                            {cust.eligibleAmount > 0 ? 'Eligible' : 'Excluded'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* TAB 4: CREDITORS BREAKDOWN */}
        <TabsContent value="creditors" className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
              <div className="relative w-72">
                <MagnifyingGlass className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Search supplier name..."
                  value={creditorSearch}
                  onChange={(e) => setCreditorSearch(e.target.value)}
                  className="h-9 pl-9 text-xs bg-white border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex items-center gap-3 text-xs font-medium text-slate-600">
                <span>Total Creditors Liability: <strong className="font-mono font-extrabold text-amber-600">{formatCurrency(dpCalculations.totalCreditors)}</strong></span>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[500px]">
              <Table>
                <TableHeader className="sticky top-0 bg-slate-50 z-10">
                  <TableRow className="border-b border-slate-100">
                    <TableHead className="text-xs font-bold text-slate-600">Supplier Name</TableHead>
                    <TableHead className="text-xs font-bold text-slate-600 text-right">Invoiced</TableHead>
                    <TableHead className="text-xs font-bold text-slate-600 text-right">Paid</TableHead>
                    <TableHead className="text-xs font-bold text-slate-600 text-right">Net Outstanding Payable</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {creditorsBreakdown.suppliers
                    .filter((s) => {
                      if (!creditorSearch.trim()) return true
                      const term = creditorSearch.toLowerCase()
                      return s.supplierName.toLowerCase().includes(term) || (s.phone || '').includes(term)
                    })
                    .map((sup) => (
                      <TableRow key={sup.supplierId} className="hover:bg-slate-50/80 border-b border-slate-100">
                        <TableCell className="py-3 text-xs font-bold text-slate-900">
                          {sup.supplierName}
                          {sup.phone && <p className="text-[10px] text-slate-400 font-normal">{sup.phone}</p>}
                        </TableCell>
                        <TableCell className="py-3 text-xs font-mono text-right text-slate-600">
                          {formatCurrency(sup.totalInvoiced)}
                        </TableCell>
                        <TableCell className="py-3 text-xs font-mono text-right text-slate-600">
                          {formatCurrency(sup.totalPaid)}
                        </TableCell>
                        <TableCell className="py-3 text-xs font-mono font-bold text-right text-amber-600">
                          {formatCurrency(sup.payableAmount)}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
