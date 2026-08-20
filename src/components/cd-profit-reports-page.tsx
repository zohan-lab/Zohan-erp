import React, { useState, useMemo } from 'react'
import {
  PurchaseInvoice,
  SalesInvoice,
  Party,
  Supplier,
  Customer,
  Item,
  ExpectedDiscount,
  ExpenseEntry,
  Payment,
  FixedScheme,
  MTBooking
} from '@/lib/types'
import {
  buildPurchaseLayers,
  allocateSalesFIFO,
  calculatePaymentCDReport,
  calculateItemProfitAnalysis,
  PeriodFilter,
  DateFilterRange,
  ReportFilterOptions
} from '@/lib/fifo-engine'
import {
  calculatePaymentAllocations,
  calculateExpectedDiscounts,
  formatCurrency
} from '@/lib/calculations'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
  Calendar,
  DownloadSimple,
  TrendUp,
  Scales,
  Receipt,
  Stack,
  ChartLine,
  ArrowRight,
  ClockCounterClockwise,
  CaretRight
} from '@phosphor-icons/react'
import { exportGenericTableToCSV } from '@/lib/excel-export'

interface CDProfitReportsPageProps {
  purchaseInvoices: PurchaseInvoice[]
  salesInvoices: SalesInvoice[]
  parties?: Party[]
  suppliers?: Supplier[]
  customers?: Customer[]
  items: Item[]
  payments?: Payment[]
  fixedSchemes?: FixedScheme[]
  mtBookings?: MTBooking[]
  expectedDiscounts?: ExpectedDiscount[]
  expenseEntries?: ExpenseEntry[]
  currentFY: string
  businessName: string
  initialTab?: string
}

export default function CDProfitReportsPage({
  purchaseInvoices = [],
  salesInvoices = [],
  parties,
  suppliers = [],
  customers = [],
  items = [],
  payments = [],
  fixedSchemes = [],
  mtBookings = [],
  expectedDiscounts: providedExpectedDiscounts,
  expenseEntries = [],
  currentFY,
  businessName,
  initialTab = 'profit-analysis'
}: CDProfitReportsPageProps) {
  const suppliersList = parties || (suppliers.length > 0 ? suppliers : customers)
  const customersList = parties || (customers.length > 0 ? customers : suppliers)

  const [activeTab, setActiveTab] = useState(initialTab)
  const [period, setPeriod] = useState<PeriodFilter>('monthly')
  const [customRange, setCustomRange] = useState<DateFilterRange>({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  })

  // Compute Expected Discounts dynamically if not explicitly provided
  const computedExpectedDiscounts = useMemo(() => {
    if (providedExpectedDiscounts && providedExpectedDiscounts.length > 0) {
      return providedExpectedDiscounts
    }
    const { allocations, paymentAdvanceInfo } = calculatePaymentAllocations(payments, purchaseInvoices)
    return calculateExpectedDiscounts(purchaseInvoices, payments, allocations, paymentAdvanceInfo, suppliersList, fixedSchemes, mtBookings, items)
  }, [providedExpectedDiscounts, purchaseInvoices, payments, suppliersList, fixedSchemes, mtBookings, items])

  const expectedDiscounts = computedExpectedDiscounts

  // Filters
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('all')
  const [selectedItemId, setSelectedItemId] = useState<string>('all')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedGodown, setSelectedGodown] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')

  // Item History Modal State
  const [selectedHistoryItemId, setSelectedHistoryItemId] = useState<string | null>(null)

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>()
    items.forEach(i => { if (i.category) set.add(i.category) })
    return Array.from(set)
  }, [items])

  const reportFilters: ReportFilterOptions = useMemo(() => ({
    supplierId: selectedSupplierId,
    itemId: selectedItemId,
    category: selectedCategory,
    godown: selectedGodown
  }), [selectedSupplierId, selectedItemId, selectedCategory, selectedGodown])

  // 1. Build Purchase Layers
  const purchaseLayers = useMemo(() => {
    return buildPurchaseLayers(purchaseInvoices, suppliersList, items, expectedDiscounts, expenseEntries)
  }, [purchaseInvoices, suppliersList, items, expectedDiscounts, expenseEntries])

  // 2. Allocate Sales FIFO
  const { allocations, updatedLayers } = useMemo(() => {
    return allocateSalesFIFO(salesInvoices, purchaseLayers, items, customersList)
  }, [salesInvoices, purchaseLayers, items, customersList])

  // 3. Payment CD Data
  const cdReportData = useMemo(() => {
    return calculatePaymentCDReport(
      purchaseInvoices,
      suppliersList,
      items,
      expectedDiscounts,
      expenseEntries,
      period,
      customRange,
      reportFilters
    )
  }, [purchaseInvoices, suppliersList, items, expectedDiscounts, expenseEntries, period, customRange, reportFilters])

  // 4. Profit Analysis Data
  const profitAnalysisRows = useMemo(() => {
    const rows = calculateItemProfitAnalysis(
      salesInvoices,
      allocations,
      items,
      customersList,
      period,
      customRange,
      reportFilters
    )
    if (!searchQuery.trim()) return rows
    const q = searchQuery.toLowerCase()
    return rows.filter(r =>
      r.itemName.toLowerCase().includes(q) ||
      r.salesInvoiceNo.toLowerCase().includes(q) ||
      r.customerName.toLowerCase().includes(q)
    )
  }, [salesInvoices, allocations, items, customersList, period, customRange, reportFilters, searchQuery])

  // 5. Active Stock Layers (Remaining Qty > 0)
  const activeStockLayers = useMemo(() => {
    return updatedLayers.filter(l => {
      if (l.remainingQty <= 0) return false
      if (selectedItemId !== 'all' && l.itemId !== selectedItemId) return false
      if (selectedCategory !== 'all' && l.category !== selectedCategory) return false
      if (selectedSupplierId !== 'all' && l.supplierId !== selectedSupplierId) return false
      return true
    })
  }, [updatedLayers, selectedItemId, selectedCategory, selectedSupplierId])

  // Total Stock Valuation
  const totalStockValuation = useMemo(() => {
    return activeStockLayers.reduce((sum, l) => sum + (l.remainingQty * l.landingCost), 0)
  }, [activeStockLayers])

  // Landing Cost Trend items (all items with purchase lots matching filters, without 5 item slice limit)
  const costTrendItems = useMemo(() => {
    return items.map(item => {
      const itemLayers = purchaseLayers.filter(l => {
        if (l.itemId !== item.id) return false
        if (selectedSupplierId !== 'all' && l.supplierId !== selectedSupplierId) return false
        if (selectedCategory !== 'all' && item.category !== selectedCategory) return false
        if (selectedItemId !== 'all' && item.id !== selectedItemId) return false
        if (searchQuery.trim() && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
        return true
      })
      return { item, itemLayers }
    }).filter(({ itemLayers }) => itemLayers.length > 0)
  }, [items, purchaseLayers, selectedSupplierId, selectedCategory, selectedItemId, searchQuery])

  // Item Cost History details for modal
  const itemCostHistory = useMemo(() => {
    if (!selectedHistoryItemId) return null
    const item = items.find(i => i.id === selectedHistoryItemId)
    const itemLayers = purchaseLayers.filter(l => l.itemId === selectedHistoryItemId)
    const itemAllocations = allocations.filter(a => a.itemId === selectedHistoryItemId)

    return {
      item,
      layers: itemLayers,
      allocations: itemAllocations
    }
  }, [selectedHistoryItemId, items, purchaseLayers, allocations])

  // Handle Excel Export
  const handleExportExcel = () => {
    if (activeTab === 'payment-cd') {
      const exportData = cdReportData.rows.map(r => ({
        Date: r.date,
        Supplier: r.supplierName,
        Invoice: r.invoiceNo,
        Item: r.itemName,
        Quantity: `${r.qty} ${r.activeUnit}`,
        'Purchase Amount': r.purchaseAmount,
        'Payment CD': r.paymentCD,
        'Close CD': r.closeCD,
        Scheme: r.schemeCD,
        'Total CD': r.totalCD,
        'Avg CD / Unit': r.avgCDPerUnit
      }))
      exportGenericTableToCSV(exportData, `Payment_CD_Report_${period}_${businessName.replace(/\s+/g, '_')}`)
    } else if (activeTab === 'profit-analysis') {
      const exportData = profitAnalysisRows.map(r => ({
        'Sale Date': r.saleDate,
        Invoice: r.salesInvoiceNo,
        Customer: r.customerName,
        Item: r.itemName,
        'Sold Qty': `${r.soldQty} ${r.activeUnit}`,
        'Selling Rate': r.sellingRate,
        'FIFO Landing Cost': r.fifoCost,
        'Profit / Unit': r.profitPerUnit,
        'Total Profit': r.totalProfit
      }))
      exportGenericTableToCSV(exportData, `Sales_Profit_Analysis_${period}_${businessName.replace(/\s+/g, '_')}`)
    } else if (activeTab === 'stock-layers') {
      const exportData = activeStockLayers.map(l => ({
        'Purchase Date': l.purchaseDate,
        'Invoice No': l.invoiceNo,
        Supplier: l.supplierName,
        Item: l.itemName,
        'Initial Qty': l.qty,
        'Remaining Qty': l.remainingQty,
        'Active Unit': l.activeUnit,
        'Purchase Price': l.purchaseRate,
        'Landing Cost / Unit': l.landingCost,
        'Layer Total Value': l.remainingQty * l.landingCost
      }))
      exportGenericTableToCSV(exportData, `Current_Stock_Layers_${businessName.replace(/\s+/g, '_')}`)
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-700 flex items-center justify-center font-bold">
              <Scales className="h-5 w-5" weight="bold" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Payment CD & FIFO Profit Analytics
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                {businessName} • FY {currentFY} • Precise landed costing & sales profit analysis
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={handleExportExcel}
            variant="outline"
            className="h-9 gap-2 text-xs font-semibold border-slate-200 hover:bg-slate-50"
          >
            <DownloadSimple className="h-4 w-4 text-emerald-600" />
            <span>Export CSV</span>
          </Button>
        </div>
      </div>

      {/* Filter Controls Bar */}
      <Card className="border-slate-200/80 shadow-2xs bg-white">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            {/* Period Selector Tabs */}
            <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setPeriod('daily')}
                className={`px-3 py-1.5 rounded-lg transition-all ${period === 'daily' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Daily
              </button>
              <button
                type="button"
                onClick={() => setPeriod('weekly')}
                className={`px-3 py-1.5 rounded-lg transition-all ${period === 'weekly' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Weekly
              </button>
              <button
                type="button"
                onClick={() => setPeriod('monthly')}
                className={`px-3 py-1.5 rounded-lg transition-all ${period === 'monthly' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setPeriod('custom')}
                className={`px-3 py-1.5 rounded-lg transition-all ${period === 'custom' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Custom Date Range
              </button>
            </div>

            {/* Custom Date Pickers */}
            {period === 'custom' && (
              <div className="flex items-center gap-2 text-xs">
                <Calendar className="h-4 w-4 text-slate-400" />
                <Input
                  type="date"
                  value={customRange.startDate || ''}
                  onChange={e => setCustomRange(prev => ({ ...prev, startDate: e.target.value }))}
                  className="h-8 text-xs w-36"
                />
                <span className="text-slate-400">to</span>
                <Input
                  type="date"
                  value={customRange.endDate || ''}
                  onChange={e => setCustomRange(prev => ({ ...prev, endDate: e.target.value }))}
                  className="h-8 text-xs w-36"
                />
              </div>
            )}
          </div>

          {/* Secondary Dropdown Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <Label className="text-[11px] font-semibold text-slate-500">Party</Label>
              <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All Parties" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Parties</SelectItem>
                  {suppliersList.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-[11px] font-semibold text-slate-500">Product / Item</Label>
              <Select value={selectedItemId} onValueChange={setSelectedItemId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All Products" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Products</SelectItem>
                  {items.map(i => (
                    <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-[11px] font-semibold text-slate-500">Category</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-[11px] font-semibold text-slate-500">Search</Label>
              <Input
                placeholder="Search invoice / customer..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Tabbed Sections */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-slate-200/60 p-1 rounded-2xl w-full sm:w-auto grid grid-cols-1 md:grid-cols-3 h-auto">
          <TabsTrigger value="profit-analysis" className="py-2.5 text-xs font-bold rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-2xs">
            <TrendUp className="h-4 w-4 mr-2 text-blue-600" />
            Item Profit Analysis
          </TabsTrigger>
          <TabsTrigger value="stock-layers" className="py-2.5 text-xs font-bold rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-2xs">
            <Stack className="h-4 w-4 mr-2 text-indigo-600" />
            Current Stock Layers
          </TabsTrigger>
          <TabsTrigger value="cost-trends" className="py-2.5 text-xs font-bold rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-2xs">
            <ChartLine className="h-4 w-4 mr-2 text-violet-600" />
            Landing Cost Trends
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: Payment CD Reports */}
        <TabsContent value="payment-cd" className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Card className="border-slate-200/80 shadow-2xs bg-white">
              <CardContent className="p-4 space-y-1">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Purchase Amount</p>
                <p className="text-lg font-bold text-slate-900 font-mono">
                  {formatCurrency(cdReportData.summary.purchaseAmount)}
                </p>
              </CardContent>
            </Card>

            <Card className="border-emerald-200/80 shadow-2xs bg-emerald-50/40">
              <CardContent className="p-4 space-y-1">
                <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">Payment CD Earned</p>
                <p className="text-lg font-extrabold text-emerald-800 font-mono">
                  {formatCurrency(cdReportData.summary.paymentCDEarned)}
                </p>
              </CardContent>
            </Card>

            <Card className="border-blue-200/80 shadow-2xs bg-blue-50/40">
              <CardContent className="p-4 space-y-1">
                <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider">Invoice Close CD</p>
                <p className="text-lg font-extrabold text-blue-800 font-mono">
                  {formatCurrency(cdReportData.summary.invoiceCloseCD)}
                </p>
              </CardContent>
            </Card>

            <Card className="border-purple-200/80 shadow-2xs bg-purple-50/40">
              <CardContent className="p-4 space-y-1">
                <p className="text-[11px] font-semibold text-purple-700 uppercase tracking-wider">Scheme CD</p>
                <p className="text-lg font-extrabold text-purple-800 font-mono">
                  {formatCurrency(cdReportData.summary.schemeCD)}
                </p>
              </CardContent>
            </Card>

            <Card className="border-amber-200/80 shadow-2xs bg-amber-50/40">
              <CardContent className="p-4 space-y-1">
                <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">Average CD / Unit</p>
                <p className="text-lg font-extrabold text-amber-900 font-mono">
                  {formatCurrency(cdReportData.summary.avgCDPerUnit)}
                </p>
              </CardContent>
            </Card>

            <Card className="border-emerald-300 shadow-2xs bg-emerald-100/50">
              <CardContent className="p-4 space-y-1">
                <p className="text-[11px] font-semibold text-emerald-900 uppercase tracking-wider">Net Landing Saved</p>
                <p className="text-lg font-black text-emerald-950 font-mono">
                  {formatCurrency(cdReportData.summary.netLandingCostSaved)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Payment CD Rows Table */}
          <Card className="border-slate-200/80 shadow-2xs bg-white">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-900">
                Payment CD Breakdown ({period.toUpperCase()})
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Itemized breakdown of cash discounts earned per purchase invoice
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Supplier</th>
                      <th className="py-3 px-4">Invoice No</th>
                      <th className="py-3 px-4">Item Name</th>
                      <th className="py-3 px-4 text-right">Qty</th>
                      <th className="py-3 px-4 text-right">Payment CD</th>
                      <th className="py-3 px-4 text-right">Close CD</th>
                      <th className="py-3 px-4 text-right">Scheme CD</th>
                      <th className="py-3 px-4 text-right font-extrabold">Total CD Earned</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {cdReportData.rows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400 font-sans text-xs">
                          No Payment CD records found for the selected filter criteria.
                        </td>
                      </tr>
                    ) : (
                      cdReportData.rows.map(r => (
                        <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-sans font-medium text-slate-700">{r.date}</td>
                          <td className="py-3 px-4 font-sans font-semibold text-slate-900">{r.supplierName}</td>
                          <td className="py-3 px-4 font-sans font-bold text-blue-700">{r.invoiceNo}</td>
                          <td className="py-3 px-4 font-sans font-semibold text-slate-800">
                            <button
                              type="button"
                              onClick={() => setSelectedHistoryItemId(r.itemId)}
                              className="hover:underline text-slate-900 flex items-center gap-1.5"
                            >
                              <span>{r.itemName}</span>
                              <CaretRight className="h-3 w-3 text-slate-400" />
                            </button>
                          </td>
                          <td className="py-3 px-4 text-right font-sans">{r.qty.toLocaleString()} {r.activeUnit}</td>
                          <td className="py-3 px-4 text-right text-emerald-700 font-bold">{formatCurrency(r.paymentCD)}</td>
                          <td className="py-3 px-4 text-right text-blue-700 font-bold">{formatCurrency(r.closeCD)}</td>
                          <td className="py-3 px-4 text-right text-purple-700 font-bold">{formatCurrency(r.schemeCD)}</td>
                          <td className="py-3 px-4 text-right font-extrabold text-emerald-900 bg-emerald-50/30">
                            {formatCurrency(r.totalCD)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: Item Profit Analysis */}
        <TabsContent value="profit-analysis" className="space-y-6">
          <Card className="border-slate-200/80 shadow-2xs bg-white">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-900">
                Sales Profit Analysis (FIFO Inventory Costing)
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Real-time gross profit computed by matching sales against exact purchase inventory layers
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Sale Date</th>
                      <th className="py-3 px-4">Invoice No</th>
                      <th className="py-3 px-4">Customer</th>
                      <th className="py-3 px-4">Item</th>
                      <th className="py-3 px-4 text-right">Sold Qty</th>
                      <th className="py-3 px-4 text-right">Selling Rate (Incl. GST)</th>
                      <th className="py-3 px-4 text-right">FIFO Landing Cost / Unit</th>
                      <th className="py-3 px-4 text-right">Profit / Unit</th>
                      <th className="py-3 px-4 text-right font-extrabold">Total Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {profitAnalysisRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400 font-sans text-xs">
                          No sales profit records found for the selected filter criteria.
                        </td>
                      </tr>
                    ) : (
                      profitAnalysisRows.map(row => (
                        <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-sans font-medium text-slate-700">{row.saleDate}</td>
                          <td className="py-3 px-4 font-sans font-bold text-blue-700">{row.salesInvoiceNo}</td>
                          <td className="py-3 px-4 font-sans text-slate-800">{row.customerName}</td>
                          <td className="py-3 px-4 font-sans font-semibold text-slate-900">
                            <button
                              type="button"
                              onClick={() => setSelectedHistoryItemId(row.itemId)}
                              className="hover:underline flex items-center gap-1.5"
                            >
                              <span>{row.itemName}</span>
                              <CaretRight className="h-3 w-3 text-slate-400" />
                            </button>
                          </td>
                          <td className="py-3 px-4 text-right font-sans">{row.soldQty.toLocaleString()} {row.activeUnit}</td>
                          <td className="py-3 px-4 text-right font-bold text-slate-900">{formatCurrency(row.sellingRate)}</td>
                          <td className="py-3 px-4 text-right font-bold text-amber-800">{formatCurrency(row.fifoCost)}</td>
                          <td className={`py-3 px-4 text-right font-bold ${row.profitPerUnit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                            {row.profitPerUnit >= 0 ? '+' : ''}{formatCurrency(row.profitPerUnit)} / {row.activeUnit}
                          </td>
                          <td className={`py-3 px-4 text-right font-extrabold ${row.totalProfit >= 0 ? 'text-emerald-900 bg-emerald-50/30' : 'text-red-700 bg-red-50/30'}`}>
                            {formatCurrency(row.totalProfit)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: Current Stock Layers */}
        <TabsContent value="stock-layers" className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-indigo-50/60 p-4 rounded-2xl border border-indigo-200">
            <div>
              <h3 className="text-sm font-bold text-indigo-950 flex items-center gap-2">
                <Stack className="h-5 w-5 text-indigo-600" weight="bold" />
                <span>FIFO Active Stock Layers Valuation</span>
              </h3>
              <p className="text-xs text-indigo-700">
                Exact remaining lots with landed purchase costs
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Badge className="bg-indigo-600 text-white font-mono text-sm py-1 px-3">
                Total Inventory Value: {formatCurrency(totalStockValuation)}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeStockLayers.length === 0 ? (
              <div className="col-span-full py-12 text-center text-slate-400 text-xs">
                No active stock layers found.
              </div>
            ) : (
              activeStockLayers.map(layer => (
                <Card key={layer.id} className="border-slate-200/80 shadow-2xs bg-white hover:border-indigo-300 transition-all">
                  <CardHeader className="p-4 pb-2 border-b border-slate-100 flex flex-row items-center justify-between space-y-0">
                    <div>
                      <Badge variant="outline" className="bg-slate-100 text-slate-700 text-[10px]">
                        {layer.batchNo}
                      </Badge>
                      <h4 className="text-sm font-bold text-slate-900 mt-1">{layer.itemName}</h4>
                    </div>
                    <span className="text-xs font-semibold text-slate-500">{layer.purchaseDate}</span>
                  </CardHeader>
                  <CardContent className="p-4 text-xs space-y-2 font-mono">
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-sans">Supplier:</span>
                      <span className="font-bold text-slate-800 font-sans">{layer.supplierName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-sans">Invoice:</span>
                      <span className="font-bold text-blue-700 font-sans">{layer.invoiceNo}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-sans">Remaining Stock:</span>
                      <span className="font-extrabold text-emerald-800">{layer.remainingQty} / {layer.qty} {layer.activeUnit}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-100 pt-2">
                      <span className="text-slate-500 font-sans">Landed Cost / Unit:</span>
                      <span className="font-extrabold text-indigo-900">{formatCurrency(layer.landingCost)}</span>
                    </div>
                    <div className="flex justify-between bg-slate-50 p-2 rounded-lg font-sans">
                      <span className="font-semibold text-slate-700">Layer Valuation:</span>
                      <span className="font-black text-slate-950 font-mono">{formatCurrency(layer.remainingQty * layer.landingCost)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* TAB 4: Landing Cost Trends */}
        <TabsContent value="cost-trends" className="space-y-6">
          <Card className="border-slate-200/80 shadow-2xs bg-white">
            <CardHeader>
              <CardTitle className="text-sm font-bold text-slate-900">
                Landing Cost Trend & Price Fluctuations
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Track how item landed purchase costs move over time across purchase lots
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                {costTrendItems.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-xs font-medium">
                    No purchase lots found for the selected filters.
                  </div>
                ) : (
                  costTrendItems.map(({ item, itemLayers }) => (
                    <div key={item.id} className="p-4 bg-slate-50/70 border border-slate-200/80 rounded-2xl space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">{item.name}</h4>
                          <p className="text-xs text-slate-500">{itemLayers.length} purchase lots recorded</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedHistoryItemId(item.id)}
                          className="text-xs font-semibold text-blue-700 hover:text-blue-900"
                        >
                          View Item Timeline →
                        </Button>
                      </div>

                      <div className="flex items-center gap-2 overflow-x-auto pb-2">
                        {itemLayers.map((l, i) => (
                          <div key={l.id} className="flex items-center gap-2">
                            <div className="p-2.5 bg-white border border-slate-200 rounded-xl font-mono text-xs min-w-[120px] shadow-2xs">
                              <p className="text-[10px] text-slate-400 font-sans">{l.purchaseDate}</p>
                              <p className="font-extrabold text-blue-950 mt-0.5">{formatCurrency(l.landingCost)}</p>
                              <p className="text-[10px] text-emerald-700 font-sans mt-0.5">{l.remainingQty} {l.activeUnit} left</p>
                            </div>
                            {i < itemLayers.length - 1 && (
                              <ArrowRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ITEM COST & SALES HISTORY MODAL */}
      {itemCostHistory && (
        <Dialog open={Boolean(selectedHistoryItemId)} onOpenChange={() => setSelectedHistoryItemId(null)}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <ClockCounterClockwise className="h-5 w-5 text-blue-600" />
                <span>Item Timeline & FIFO History: {itemCostHistory.item?.name}</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Complete purchase lot creation and sales consumption history
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 pt-4">
              {/* Purchase History Layers */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  Purchase Lots (Inventory Layers)
                </h4>
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Invoice</th>
                        <th className="py-2.5 px-3">Supplier</th>
                        <th className="py-2.5 px-3 text-right">Initial Qty</th>
                        <th className="py-2.5 px-3 text-right">Remaining Qty</th>
                        <th className="py-2.5 px-3 text-right">Landed Cost / Unit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {itemCostHistory.layers.map(l => (
                        <tr key={l.id} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-sans font-medium">{l.purchaseDate}</td>
                          <td className="py-2 px-3 font-bold text-blue-700">{l.invoiceNo}</td>
                          <td className="py-2 px-3 font-sans">{l.supplierName}</td>
                          <td className="py-2 px-3 text-right">{l.qty} {l.activeUnit}</td>
                          <td className="py-2 px-3 text-right font-bold text-emerald-700">{l.remainingQty} {l.activeUnit}</td>
                          <td className="py-2 px-3 text-right font-extrabold text-indigo-900">{formatCurrency(l.landingCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Sales Allocations */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  Sales Consumptions (FIFO Allocated)
                </h4>
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="py-2.5 px-3">Sale Date</th>
                        <th className="py-2.5 px-3">Sales Invoice</th>
                        <th className="py-2.5 px-3">Customer</th>
                        <th className="py-2.5 px-3">From Lot</th>
                        <th className="py-2.5 px-3 text-right">Qty Sold</th>
                        <th className="py-2.5 px-3 text-right">Selling Rate</th>
                        <th className="py-2.5 px-3 text-right">FIFO Cost</th>
                        <th className="py-2.5 px-3 text-right font-bold">Profit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {itemCostHistory.allocations.map(a => (
                        <tr key={a.id} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-sans font-medium">{a.saleDate}</td>
                          <td className="py-2 px-3 font-bold text-blue-700">{a.salesInvoiceNo}</td>
                          <td className="py-2 px-3 font-sans">{a.customerName}</td>
                          <td className="py-2 px-3 font-bold text-slate-600">{a.purchaseInvoiceNo}</td>
                          <td className="py-2 px-3 text-right">{a.allocatedQty} {a.activeUnit}</td>
                          <td className="py-2 px-3 text-right font-bold">{formatCurrency(a.sellingPricePerUnit)}</td>
                          <td className="py-2 px-3 text-right font-bold text-amber-800">{formatCurrency(a.fifoCostPerUnit)}</td>
                          <td className={`py-2 px-3 text-right font-extrabold ${a.totalProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                            {formatCurrency(a.totalProfit)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
