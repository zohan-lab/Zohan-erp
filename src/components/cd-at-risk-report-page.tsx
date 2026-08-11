import { useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PurchaseInvoice, Payment, Supplier, Item } from '@/lib/types'
import { calculateCDAtRisk, InvoiceCloseCDUnitBreakdown } from '@/lib/report-calculations'
import { calculatePaymentAllocations, formatCurrency, formatMT } from '@/lib/calculations'
import { Warning, Clock, TrendDown, CaretDown, FilePdf, Shield, CoinVertical, Receipt, Funnel, X } from '@phosphor-icons/react'
import { format } from 'date-fns'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { motion, AnimatePresence } from 'framer-motion'
import { exportCDAtRiskPDF } from '@/lib/pdf-export'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface CDAtRiskReportPageProps {
  purchaseInvoices: PurchaseInvoice[]
  payments: Payment[]
  suppliers: Supplier[]
  items?: Item[]
  currentFY: string
  businessName?: string
}

export default function CDAtRiskReportPage({
  purchaseInvoices,
  payments,
  suppliers,
  items = [],
  currentFY,
  businessName = 'Steel Trading ERP'
}: CDAtRiskReportPageProps) {
  const [ineligibleOpen, setIneligibleOpen] = useState(false)
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([])
  const [supplierFilterOpen, setSupplierFilterOpen] = useState(false)

  const { allocations: paymentAllocations } = useMemo(() => {
    return calculatePaymentAllocations(payments, purchaseInvoices)
  }, [payments, purchaseInvoices])

  const cdAtRiskData = useMemo(() => {
    const allData = calculateCDAtRisk(purchaseInvoices, payments, paymentAllocations, suppliers, items)
    
    if (selectedSuppliers.length === 0) {
      return allData
    }
    
    return allData.filter(d => selectedSuppliers.includes(d.supplierId))
  }, [purchaseInvoices, payments, paymentAllocations, suppliers, selectedSuppliers])

  const { eligibleInvoices, ineligibleInvoices } = useMemo(() => {
    const eligible = cdAtRiskData.filter(d => d.totalCDAtRisk > 0)
    const ineligible = cdAtRiskData.filter(d => d.totalCDAtRisk === 0)
    return { eligibleInvoices: eligible, ineligibleInvoices: ineligible }
  }, [cdAtRiskData])

  const summary = useMemo(() => {
    const totalAtRisk = eligibleInvoices.reduce((sum, d) => sum + d.totalCDAtRisk, 0)
    const totalPaymentCDAtCurrentSlab = eligibleInvoices.reduce((sum, d) => sum + d.totalPaymentCDAtCurrentSlab, 0)
    const totalInvoiceCDRisk = eligibleInvoices.reduce((sum, d) => sum + d.invoiceCloseCDRisk, 0)
    const totalPending = cdAtRiskData.reduce((sum, d) => sum + d.pendingAmount, 0)
    const criticalCount = eligibleInvoices.filter(d => d.totalCDAtRisk > 10000).length

    return {
      totalAtRisk,
      totalPaymentCDAtCurrentSlab,
      totalInvoiceCDRisk,
      totalPending,
      criticalCount,
      totalEligible: eligibleInvoices.length,
      totalIneligible: ineligibleInvoices.length
    }
  }, [cdAtRiskData, eligibleInvoices, ineligibleInvoices])

  const handleExportPDF = () => {
    exportCDAtRiskPDF(eligibleInvoices, {
      currentFY,
      businessName,
      summary
    })
    toast.success('PDF exported successfully')
  }

  const handleToggleSupplier = (supplierId: string) => {
    setSelectedSuppliers(prev => 
      prev.includes(supplierId) 
        ? prev.filter(id => id !== supplierId)
        : [...prev, supplierId]
    )
  }

  const handleSelectAllSuppliers = () => {
    if (selectedSuppliers.length === suppliers.length) {
      setSelectedSuppliers([])
    } else {
      setSelectedSuppliers(suppliers.map(s => s.id))
    }
  }

  const handleClearSupplierFilter = () => {
    setSelectedSuppliers([])
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 sm:p-8 text-white shadow-xl border border-slate-800">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-12 w-64 h-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 px-3 py-1 text-xs font-semibold backdrop-blur-sm">
                <Shield className="mr-1.5 h-3.5 w-3.5" /> CD Risk Analytics
              </Badge>
              <Badge variant="outline" className="text-slate-300 border-slate-700 font-mono text-xs">
                FY {currentFY}
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-sans">
              Cash Discount Risk Intelligence
            </h1>
            <p className="text-sm text-slate-300 max-w-2xl">
              Track multi-unit discount losses, payment CD slab risks, and upcoming CD expiry thresholds to protect supplier margins.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            <Button
              onClick={handleExportPDF}
              disabled={cdAtRiskData.length === 0}
              className="bg-white text-slate-900 hover:bg-slate-100 font-semibold shadow-md gap-2"
            >
              <FilePdf className="h-4 w-4 text-red-600" />
              Export Detailed PDF
            </Button>
          </div>
        </div>
      </div>

      <Card className="border border-slate-200/80 shadow-sm bg-white/80 backdrop-blur-sm">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Funnel className="h-4 w-4 text-indigo-600" /> Filter by Supplier:
              </div>
              <Popover open={supplierFilterOpen} onOpenChange={setSupplierFilterOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-9 min-w-[220px] justify-between border-slate-300 font-medium text-slate-800 shadow-none hover:bg-slate-50",
                      selectedSuppliers.length > 0 && "border-indigo-500 bg-indigo-50/50 text-indigo-900"
                    )}
                  >
                    <span className="truncate">
                      {selectedSuppliers.length === 0
                        ? "All Suppliers"
                        : selectedSuppliers.length === suppliers.length
                        ? "All Suppliers"
                        : `${selectedSuppliers.length} Suppliers Selected`}
                    </span>
                    <CaretDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[320px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search supplier..." />
                    <CommandList>
                      <CommandEmpty>No supplier found.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          onSelect={handleSelectAllSuppliers}
                          className="font-semibold text-slate-800"
                        >
                          <Checkbox
                            checked={selectedSuppliers.length === suppliers.length}
                            className="mr-2"
                          />
                          Select All Suppliers
                        </CommandItem>
                        {suppliers.map((supplier) => (
                          <CommandItem
                            key={supplier.id}
                            onSelect={() => handleToggleSupplier(supplier.id)}
                            className="text-slate-700"
                          >
                            <Checkbox
                              checked={selectedSuppliers.includes(supplier.id)}
                              className="mr-2"
                            />
                            {supplier.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {selectedSuppliers.length > 0 && selectedSuppliers.length < suppliers.length && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearSupplierFilter}
                  className="h-8 px-2 text-xs text-slate-500 hover:text-slate-900"
                >
                  <X className="h-3 w-3 mr-1" /> Reset Filter
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
              <span>Showing {eligibleInvoices.length} eligible invoice{eligibleInvoices.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-amber-200/80 bg-gradient-to-br from-amber-50/50 via-white to-white shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-amber-900">Total Payment CD Risk</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <TrendDown className="h-4 w-4 text-amber-700" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-mono font-bold text-amber-700">
              {formatCurrency(summary.totalPaymentCDAtCurrentSlab)}
            </div>
            <p className="text-xs text-slate-500 mt-1 font-sans">
              Current slab payment CD value
            </p>
          </CardContent>
        </Card>

        <Card className="border-indigo-200/80 bg-gradient-to-br from-indigo-50/50 via-white to-white shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-indigo-900">Invoice CD Loss</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <CoinVertical className="h-4 w-4 text-indigo-700" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-mono font-bold text-indigo-700">
              {formatCurrency(summary.totalInvoiceCDRisk)}
            </div>
            <p className="text-xs text-slate-500 mt-1 font-sans">
              Multi-unit invoice close CD risk
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700">Total Pending Amount</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center">
              <Receipt className="h-4 w-4 text-slate-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-mono font-bold text-slate-900">
              {formatCurrency(summary.totalPending)}
            </div>
            <p className="text-xs text-slate-500 mt-1 font-sans">
              Unpaid purchase invoice balance
            </p>
          </CardContent>
        </Card>

        <Card className="border-rose-200/80 bg-gradient-to-br from-rose-50/50 via-white to-white shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-rose-900">Critical At-Risk Invoices</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-rose-100 flex items-center justify-center">
              <Warning className="h-4 w-4 text-rose-700" weight="fill" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-mono font-bold text-rose-700">
              {summary.criticalCount}
            </div>
            <p className="text-xs text-slate-500 mt-1 font-sans">
              CD risk &gt; ₹10,000 threshold
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border border-slate-200 shadow-md overflow-hidden bg-white">
        <CardHeader className="bg-slate-900 text-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                Eligible Invoices - CD Available
                <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs font-semibold">
                  {summary.totalEligible} Active
                </Badge>
              </CardTitle>
              <CardDescription className="text-slate-300 text-xs mt-1">
                Invoices currently within eligible CD slab periods — structured CD types & at-risk amounts after pending amount
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-100/90 border-b border-slate-200">
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider py-3">invoice no</TableHead>
                <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider py-3">Supplier</TableHead>
                <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider py-3">Date</TableHead>
                <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider text-center py-3">Aging</TableHead>
                <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider text-right py-3">Pending Amount</TableHead>
                <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider pl-4 py-3 border-l border-slate-300">CD Types</TableHead>
                <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider text-right py-3 border-l border-slate-300">Amount At-risk</TableHead>
                <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider text-center py-3 border-l border-slate-300">Next Slab</TableHead>
                <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider text-right py-3 border-l border-slate-300">Total Cd Risk</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {eligibleInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Clock className="h-8 w-8 text-slate-300" />
                      <p className="font-medium text-slate-700">No eligible invoices with active CD</p>
                      <p className="text-xs text-slate-400">All purchase invoices are either paid or beyond CD slab eligibility.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                eligibleInvoices.map((data) => {
                  const cdRows: {
                    type: string
                    detail: string
                    amountAtRisk: number
                    nextSlab: string
                    badgeStyle: string
                  }[] = []

                  // Payment CD sub-row
                  if (data.totalPaymentCDAtCurrentSlab > 0 || data.paymentCDRisk > 0) {
                    const payNextDays = data.paymentCDNextSlabDays || 0
                    const payNextRate = data.nextSlabPaymentCDRate || 0
                    const payNextText = payNextDays > 0
                      ? `${payNextDays}d (${payNextRate}%)`
                      : (payNextRate > 0 ? `${payNextRate}%` : 'Max Slab')

                    cdRows.push({
                      type: 'Payment Cd',
                      detail: `(${data.currentSlabPaymentCDRate}%)`,
                      amountAtRisk: data.paymentCDRisk > 0 ? data.paymentCDRisk : data.totalPaymentCDAtCurrentSlab,
                      nextSlab: payNextText,
                      badgeStyle: 'bg-emerald-100 text-emerald-800 border-emerald-200'
                    })
                  }

                  // Invoice Closed CD sub-rows (per unit or rule)
                  if (data.invoiceCloseCDBreakdown && data.invoiceCloseCDBreakdown.length > 0) {
                    data.invoiceCloseCDBreakdown.forEach((item) => {
                      const unitNextDays = item.nextSlabDays || 0
                      const unitNextRate = item.nextRate || 0
                      const unitNextText = unitNextDays > 0
                        ? `${unitNextDays}d (₹${unitNextRate}/${item.unit})`
                        : (unitNextRate > 0 ? `₹${unitNextRate}/${item.unit}` : 'Max Slab')

                      cdRows.push({
                        type: 'Invoice Closed Cd',
                        detail: `(${item.quantity} ${item.unit} @ ₹${item.currentRate}/${item.unit})`,
                        amountAtRisk: item.riskAmount > 0 ? item.riskAmount : item.currentAmount,
                        nextSlab: unitNextText,
                        badgeStyle: 'bg-indigo-100 text-indigo-800 border-indigo-200'
                      })
                    })
                  } else if (data.invoiceCloseCDRisk > 0 || data.currentSlabInvoiceCloseCDRate > 0) {
                    const invNextDays = data.invoiceCloseCDNextSlabDays || 0
                    const invNextRate = data.nextSlabInvoiceCloseCDRate || 0
                    const invNextText = invNextDays > 0
                      ? `${invNextDays}d (₹${invNextRate}/MT)`
                      : (invNextRate > 0 ? `₹${invNextRate}/MT` : 'Max Slab')

                    cdRows.push({
                      type: 'Invoice Closed Cd',
                      detail: `(₹${data.currentSlabInvoiceCloseCDRate}/MT)`,
                      amountAtRisk: data.invoiceCloseCDRisk,
                      nextSlab: invNextText,
                      badgeStyle: 'bg-indigo-100 text-indigo-800 border-indigo-200'
                    })
                  }

                  if (cdRows.length === 0) {
                    cdRows.push({
                      type: 'No CD Risk',
                      detail: '',
                      amountAtRisk: 0,
                      nextSlab: '-',
                      badgeStyle: 'bg-slate-100 text-slate-600 border-slate-200'
                    })
                  }

                  return (
                    <TableRow key={data.invoiceId} className="hover:bg-slate-50/80 transition-colors border-b border-slate-200">
                      {/* invoice no */}
                      <TableCell className="font-medium font-mono text-slate-900 text-sm align-top py-3">
                        {data.invoiceNo}
                      </TableCell>

                      {/* Supplier */}
                      <TableCell className="font-medium text-slate-800 text-sm align-top py-3">
                        {data.supplierName}
                      </TableCell>

                      {/* Date */}
                      <TableCell className="text-slate-600 text-sm align-top py-3 whitespace-nowrap">
                        {format(new Date(data.invoiceDate), 'dd MMM yyyy')}
                      </TableCell>

                      {/* Aging */}
                      <TableCell className="text-center font-mono align-top py-3">
                        <Badge 
                          variant="outline"
                          className={cn(
                            "font-semibold text-xs px-2 py-0.5 whitespace-nowrap",
                            data.daysSinceInvoice > 60 ? "bg-rose-50 text-rose-700 border-rose-200" :
                            data.daysSinceInvoice > 30 ? "bg-amber-50 text-amber-700 border-amber-200" :
                            "bg-slate-100 text-slate-700 border-slate-200"
                          )}
                        >
                          {data.daysSinceInvoice}d
                        </Badge>
                      </TableCell>

                      {/* Pending Amount */}
                      <TableCell className="text-right font-mono font-medium text-slate-900 align-top py-3 whitespace-nowrap">
                        {formatCurrency(data.pendingAmount)}
                      </TableCell>

                      {/* CD Types, Amount At-risk, Next Slab Sub-table */}
                      <TableCell colSpan={3} className="p-0 align-top border-l border-slate-200">
                        <div className="divide-y divide-slate-100">
                          {cdRows.map((row, idx) => (
                            <div key={idx} className="grid grid-cols-[1.4fr_1fr_1fr] items-center px-3 py-2 text-xs font-mono">
                              {/* CD Types */}
                              <div className="flex items-center gap-1.5 overflow-hidden">
                                <span className={cn("px-1.5 py-0.5 rounded text-[11px] font-semibold shrink-0 border", row.badgeStyle)}>
                                  {row.type}
                                </span>
                                {row.detail && (
                                  <span className="text-slate-600 font-medium truncate text-[11px]">
                                    {row.detail}
                                  </span>
                                )}
                              </div>

                              {/* Amount At-risk */}
                              <div className="text-right font-bold text-slate-900 text-xs pr-2 border-l border-slate-100 pl-2">
                                {formatCurrency(row.amountAtRisk)}
                              </div>

                              {/* Next Slab */}
                              <div className="text-center text-slate-600 font-medium text-xs border-l border-slate-100 pl-2">
                                {row.nextSlab}
                              </div>
                            </div>
                          ))}
                        </div>
                      </TableCell>

                      {/* Total Cd Risk */}
                      <TableCell className="text-right font-mono font-bold align-top py-3 whitespace-nowrap border-l border-slate-200">
                        <span className={cn(
                          "text-base font-extrabold",
                          data.totalCDAtRisk > 10000 ? "text-rose-600" : "text-amber-600"
                        )}>
                          {formatCurrency(data.totalCDAtRisk)}
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Collapsible open={ineligibleOpen} onOpenChange={setIneligibleOpen}>
        <Card className="border border-slate-200 shadow-sm bg-slate-50/50 overflow-hidden">
          <CollapsibleTrigger className="w-full">
            <CardHeader className="cursor-pointer hover:bg-slate-100/80 transition-colors p-5">
              <div className="flex items-center justify-between">
                <div className="text-left space-y-1">
                  <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                    Ineligible Invoices - CD Expired
                    <Badge variant="secondary" className="bg-slate-200 text-slate-700 font-semibold text-xs">
                      {summary.totalIneligible}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Invoices that have exceeded all CD slab periods — no further cash discount available
                  </CardDescription>
                </div>
                <motion.div
                  animate={{ rotate: ineligibleOpen ? 180 : 0 }}
                  transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                >
                  <CaretDown className="h-5 w-5 text-slate-500" />
                </motion.div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <AnimatePresence initial={false}>
            {ineligibleOpen && (
              <CollapsibleContent forceMount asChild>
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ 
                    height: "auto", 
                    opacity: 1,
                    transition: {
                      height: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
                      opacity: { duration: 0.25, ease: "easeOut", delay: 0.05 }
                    }
                  }}
                  exit={{ 
                    height: 0, 
                    opacity: 0,
                    transition: {
                      height: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
                      opacity: { duration: 0.15, ease: "easeIn" }
                    }
                  }}
                  className="overflow-hidden"
                >
                  <CardContent className="pt-0 p-6">
                    <Table>
                      <TableHeader className="bg-slate-200/70">
                        <TableRow>
                          <TableHead className="font-bold text-slate-700 text-xs">Invoice No</TableHead>
                          <TableHead className="font-bold text-slate-700 text-xs">Supplier</TableHead>
                          <TableHead className="font-bold text-slate-700 text-xs">Invoice Date</TableHead>
                          <TableHead className="font-bold text-slate-700 text-xs text-right">Days Elapsed</TableHead>
                          <TableHead className="font-bold text-slate-700 text-xs text-right">Pending Amount</TableHead>
                          <TableHead className="font-bold text-slate-700 text-xs text-center">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ineligibleInvoices.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-6 text-slate-500 text-sm">
                              No expired invoices.
                            </TableCell>
                          </TableRow>
                        ) : (
                          ineligibleInvoices.map((data) => (
                            <TableRow key={data.invoiceId} className="hover:bg-slate-100/50">
                              <TableCell className="font-mono text-sm text-slate-800">{data.invoiceNo}</TableCell>
                              <TableCell className="text-sm text-slate-800">{data.supplierName}</TableCell>
                              <TableCell className="text-sm text-slate-600">{format(new Date(data.invoiceDate), 'dd MMM yyyy')}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{data.daysSinceInvoice}d</TableCell>
                              <TableCell className="text-right font-mono text-sm text-slate-800">{formatCurrency(data.pendingAmount)}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant="secondary" className="bg-slate-200 text-slate-600 text-xs font-semibold">
                                  CD Expired
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </motion.div>
              </CollapsibleContent>
            )}
          </AnimatePresence>
        </Card>
      </Collapsible>
    </div>
  )
}
