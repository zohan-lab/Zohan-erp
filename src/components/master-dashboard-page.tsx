import { useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { AnimatedValue, AnimatedCard } from '@/components/animated-value'
import { motion, AnimatePresence } from 'framer-motion'
import {
  PurchaseInvoice,
  SalesInvoice,
  Payment,
  CustomerPayment,
  Supplier,
  Customer,
  Item,
  ExpenseEntry,
  ExpenseType,
  FixedScheme,
  ReceivedDiscount,
  PurchaseReturn,
  SalesReturn,
  MTBooking
} from '@/lib/types'
import {
  calculatePaymentAllocations,
  calculateExpectedDiscounts,
  calculateExpectedAnnualDiscounts,
  formatCurrency
} from '@/lib/calculations'
import {
  calculateInventoryReport,
  calculateCDAtRisk
} from '@/lib/report-calculations'
import {
  TrendUp,
  TrendDown,
  Package,
  CurrencyInr,
  Wallet,
  Tag,
  ChartBar,
  ShoppingCart,
  Cube,
  DotsThreeVertical,
  CaretDown,
  Lightning,
  Megaphone,
  User,
  Users,
  DotsThree,
  Truck,
  Crown,
  Fire,
  HourglassHigh,
  ArrowRight,
  BoxArrowUp,
  Stack
} from '@phosphor-icons/react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import CDExpiryAlert from '@/components/cd-expiry-alert'

function formatUnitSummary(volumeMap: Record<string, number>, maxUnits: number = 2): string {
  if (!volumeMap) return ''
  const entries = Object.entries(volumeMap).filter(([_, qty]) => (Number(qty) || 0) > 0)
  if (entries.length === 0) return '0 items in stock'

  const formatted = entries.map(([unit, qty]) => `${(Number(qty) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`)
  if (formatted.length <= maxUnits) {
    return formatted.join(' • ')
  }
  const topUnits = formatted.slice(0, maxUnits).join(' • ')
  const remaining = formatted.length - maxUnits
  return `${topUnits} (+${remaining} more)`
}

interface MasterDashboardPageProps {
  currentUser?: any
  cashBankCounters?: any[]
  suppliers: Supplier[]
  customers: Customer[]
  items: Item[]
  purchaseInvoices: PurchaseInvoice[]
  salesInvoices: SalesInvoice[]
  purchaseReturns?: PurchaseReturn[]
  salesReturns?: SalesReturn[]
  payments: Payment[]
  customerPayments: CustomerPayment[]
  expenseEntries: ExpenseEntry[]
  expenseTypes: ExpenseType[]
  fixedSchemes: FixedScheme[]
  mtBookings?: MTBooking[]
  receivedDiscounts: ReceivedDiscount[]
  currentFY: string
  onNavigateToReport: (reportName: string) => void
}

// Decorative SVG Sparklines for KPI Cards
function Sparkline({ color }: { color: string }) {
  return (
    <div className="w-full h-8 mt-2 overflow-hidden">
      <svg viewBox="0 0 120 30" className="w-full h-full preserve-3d" preserveAspectRatio="none">
        <path
          d="M 0,20 Q 20,8 40,18 T 80,10 T 120,15 L 120,30 L 0,30 Z"
          fill={`${color}15`}
        />
        <path
          d="M 0,20 Q 20,8 40,18 T 80,10 T 120,15"
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}

export default function MasterDashboardPage({
  suppliers,
  customers,
  items,
  purchaseInvoices,
  salesInvoices,
  purchaseReturns = [],
  salesReturns = [],
  payments,
  customerPayments,
  expenseEntries,
  expenseTypes,
  fixedSchemes,
  mtBookings = [],
  receivedDiscounts,
  currentFY,
  onNavigateToReport
}: MasterDashboardPageProps) {
  const { allocations: paymentAllocations, paymentAdvanceInfo } = useMemo(() => {
    return calculatePaymentAllocations(payments, purchaseInvoices)
  }, [payments, purchaseInvoices])

  const expectedDiscounts = useMemo(() => {
    return calculateExpectedDiscounts(
      purchaseInvoices,
      payments,
      paymentAllocations,
      paymentAdvanceInfo,
      suppliers,
      fixedSchemes,
      mtBookings,
      items
    )
  }, [purchaseInvoices, payments, paymentAllocations, paymentAdvanceInfo, suppliers, fixedSchemes, mtBookings, items])

  const expectedAnnual = useMemo(() => {
    return calculateExpectedAnnualDiscounts(purchaseInvoices, suppliers)
  }, [purchaseInvoices, suppliers])

  const inventoryData = useMemo(() => {
    return calculateInventoryReport(items, purchaseInvoices, salesInvoices, purchaseReturns, salesReturns)
  }, [items, purchaseInvoices, salesInvoices, purchaseReturns, salesReturns])

  const cdAtRiskData = useMemo(() => {
    return calculateCDAtRisk(purchaseInvoices, payments, paymentAllocations, suppliers, items)
  }, [purchaseInvoices, payments, paymentAllocations, suppliers, items])

  // Helper functions for safe invoice access
  const getSafeInvoiceAmount = (inv: any): number => {
    if (!inv) return 0
    const amt = inv.totalAmount ?? inv.invoiceAmount ?? inv.finalAmount ?? 0
    return typeof amt === 'number' && !isNaN(amt) ? amt : 0
  }

  const getSafeInvoiceDate = (inv: any): string => {
    if (!inv) return ''
    const d = inv.invoiceDate || inv.date || ''
    return typeof d === 'string' ? d : ''
  }

  const getSafeInvoiceNumber = (inv: any): string => {
    if (!inv) return ''
    return String(inv.invoiceNumber || inv.invoiceNo || inv.id || '')
  }

  const totalPayables = useMemo(() => {
    const totalInvoiceAmount = purchaseInvoices.reduce((sum, inv) => sum + getSafeInvoiceAmount(inv), 0)
    const totalPaid = paymentAllocations.reduce((sum, alloc) => sum + (alloc.allocatedAmount || 0), 0)
    return Math.max(0, totalInvoiceAmount - totalPaid)
  }, [purchaseInvoices, paymentAllocations])

  const totalReceivables = useMemo(() => {
    const totalSalesAmount = salesInvoices.reduce((sum, inv) => sum + getSafeInvoiceAmount(inv), 0)
    const totalReceived = customerPayments.reduce((sum, payment) => sum + (payment.amount || 0), 0)
    return Math.max(0, totalSalesAmount - totalReceived)
  }, [salesInvoices, customerPayments])

  const totalStockValue = useMemo(() => {
    return inventoryData.reduce((sum, item) => sum + (item.currentStockValue || 0), 0)
  }, [inventoryData])

  const stockSummary = useMemo(() => {
    const byUnit: { [unit: string]: number } = {}
    inventoryData.forEach(item => {
      const u = item.unit || 'KG'
      if (!byUnit[u]) {
        byUnit[u] = 0
      }
      byUnit[u] += item.balanceMT || 0
    })
    return byUnit
  }, [inventoryData])

  const netProfit = useMemo(() => {
    const totalSalesRevenue = salesInvoices.reduce((sum, inv) => sum + getSafeInvoiceAmount(inv), 0)
    const totalPurchaseCost = purchaseInvoices.reduce((sum, inv) => sum + getSafeInvoiceAmount(inv), 0)
    const totalExpenses = expenseEntries
      .filter(entry => {
        const expType = expenseTypes.find(t => t.id === entry.expenseTypeId)
        return expType?.linkType === 'netprofit'
      })
      .reduce((sum, entry) => sum + (entry.amount || 0), 0)
    
    return totalSalesRevenue - totalPurchaseCost - totalExpenses
  }, [salesInvoices, purchaseInvoices, expenseEntries, expenseTypes])

  const salesVsPurchaseData = useMemo(() => {
    const monthlyData: { [key: string]: { sales: number; purchase: number } } = {}
    
    salesInvoices.forEach(inv => {
      const rawDate = getSafeInvoiceDate(inv)
      if (!rawDate) return
      const month = rawDate.slice(0, 7)
      if (!monthlyData[month]) monthlyData[month] = { sales: 0, purchase: 0 }
      monthlyData[month].sales += getSafeInvoiceAmount(inv)
    })
    
    purchaseInvoices.forEach(inv => {
      const rawDate = getSafeInvoiceDate(inv)
      if (!rawDate) return
      const month = rawDate.slice(0, 7)
      if (!monthlyData[month]) monthlyData[month] = { sales: 0, purchase: 0 }
      monthlyData[month].purchase += getSafeInvoiceAmount(inv)
    })
    
    const sorted = Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, data]) => ({
        month: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short' }),
        Sales: Math.round(data.sales / 100000 * 100) / 100,
        Purchase: Math.round(data.purchase / 100000 * 100) / 100
      }))

    if (sorted.length === 0) {
      return [
        { month: 'Jul 26', Sales: 2.75, Purchase: 0.85 }
      ]
    }

    return sorted
  }, [salesInvoices, purchaseInvoices])

  const expenseDistribution = useMemo(() => {
    const expenseByType: { [key: string]: number } = {}
    
    expenseEntries.forEach(entry => {
      const expType = expenseTypes.find(t => t.id === entry.expenseTypeId)
      if (expType) {
        expenseByType[expType.name] = (expenseByType[expType.name] || 0) + entry.amount
      }
    })
    
    const sorted = Object.entries(expenseByType)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)

    if (sorted.length === 0) {
      return [
        { name: 'Transport', value: 100 }
      ]
    }
    return sorted
  }, [expenseEntries, expenseTypes])

  const totalDiscountsPending = useMemo(() => {
    const totalExpected = expectedDiscounts.reduce((sum, disc) => sum + disc.expectedAmount, 0)
    const allocatedReceived = receivedDiscounts
      .filter(rd => rd.type === 'wallet' && rd.status === 'Allocated')
      .reduce((sum, rd) => sum + rd.amount, 0)
    return totalExpected - allocatedReceived
  }, [expectedDiscounts, receivedDiscounts])

  const totalDiscountsReceived = useMemo(() => {
    return receivedDiscounts
      .filter(rd => rd.type === 'wallet')
      .reduce((sum, rd) => sum + rd.amount, 0)
  }, [receivedDiscounts])

  const totalAnnualDiscountPending = useMemo(() => {
    const totalExpected = expectedAnnual.reduce((sum, disc) => sum + disc.expectedAmount, 0)
    const allocatedReceived = receivedDiscounts
      .filter(rd => rd.type === 'annual' && rd.status === 'Allocated')
      .reduce((sum, rd) => sum + rd.amount, 0)
    return totalExpected - allocatedReceived
  }, [expectedAnnual, receivedDiscounts])

  const totalPendingDiscounts = useMemo(() => {
    return totalDiscountsPending + totalAnnualDiscountPending
  }, [totalDiscountsPending, totalAnnualDiscountPending])

  const totalSalesRevenue = useMemo(() => {
    return salesInvoices.reduce((sum, inv) => sum + getSafeInvoiceAmount(inv), 0)
  }, [salesInvoices])

  const profitMargin = useMemo(() => {
    const totalRev = salesInvoices.reduce((sum, inv) => sum + getSafeInvoiceAmount(inv), 0)
    if (totalRev === 0) return 0
    return (netProfit / totalRev) * 100
  }, [netProfit, salesInvoices])

  const purchaseVolumeByUnit = useMemo(() => {
    const byUnit: { [unit: string]: number } = {}
    purchaseInvoices.forEach(inv => {
      if (inv.items && Array.isArray(inv.items)) {
        inv.items.forEach(item => {
          const itemData = items.find(i => i.id === item.itemId)
          const unit = item.enteredUnit || itemData?.unit || 'KG'
          if (!byUnit[unit]) byUnit[unit] = 0
          byUnit[unit] += item.enteredQuantity || 0
        })
      }
    })
    return byUnit
  }, [purchaseInvoices, items])

  const salesVolumeByUnit = useMemo(() => {
    const byUnit: { [unit: string]: number } = {}
    salesInvoices.forEach(inv => {
      if (inv.items && Array.isArray(inv.items)) {
        inv.items.forEach(item => {
          const itemData = items.find(i => i.id === item.itemId)
          const unit = item.enteredUnit || itemData?.unit || 'KG'
          if (!byUnit[unit]) byUnit[unit] = 0
          byUnit[unit] += item.enteredQuantity || 0
        })
      }
    })
    return byUnit
  }, [salesInvoices, items])

  const totalPurchaseValue = useMemo(() => {
    return purchaseInvoices.reduce((sum, inv) => sum + getSafeInvoiceAmount(inv), 0)
  }, [purchaseInvoices])

  const recentTransactions = useMemo(() => {
    const allTransactions: Array<{
      rawDate: Date
      dateFormatted: string
      type: 'Payment' | 'Invoice' | 'Purchase'
      description: string
      module: 'Purchase' | 'Sales'
      amount: number
      status: 'Completed' | 'Paid' | 'Pending'
    }> = []

    purchaseInvoices.forEach(inv => {
      const supplier = suppliers.find(s => s.id === inv.supplierId)
      const rawDate = getSafeInvoiceDate(inv)
      const d = rawDate ? new Date(rawDate) : new Date()
      const validDate = isNaN(d.getTime()) ? new Date() : d
      allTransactions.push({
        rawDate: validDate,
        dateFormatted: validDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ', 10:15 AM',
        type: 'Purchase',
        description: `Purchase Bill - ${getSafeInvoiceNumber(inv) || 'BILL-2026'}`,
        module: 'Purchase',
        amount: getSafeInvoiceAmount(inv),
        status: 'Pending'
      })
    })

    salesInvoices.forEach(inv => {
      const customer = customers.find(c => c.id === inv.customerId)
      const rawDate = getSafeInvoiceDate(inv)
      const d = rawDate ? new Date(rawDate) : new Date()
      const validDate = isNaN(d.getTime()) ? new Date() : d
      allTransactions.push({
        rawDate: validDate,
        dateFormatted: validDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ', 10:15 AM',
        type: 'Invoice',
        description: `Sales Invoice - ${getSafeInvoiceNumber(inv) || 'INV-2026'}`,
        module: 'Sales',
        amount: getSafeInvoiceAmount(inv),
        status: 'Paid'
      })
    })

    payments.forEach(payment => {
      const supplier = suppliers.find(s => s.id === payment.supplierId)
      const rawDate = payment.paymentDate || ''
      const d = rawDate ? new Date(rawDate) : new Date()
      const validDate = isNaN(d.getTime()) ? new Date() : d
      allTransactions.push({
        rawDate: validDate,
        dateFormatted: validDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ', 11:24 AM',
        type: 'Payment',
        description: `Payment to ${supplier?.name || 'Supplier'}`,
        module: 'Purchase',
        amount: payment.amount || 0,
        status: 'Completed'
      })
    })

    customerPayments.forEach(payment => {
      const customer = customers.find(c => c.id === payment.customerId)
      const rawDate = payment.paymentDate || ''
      const d = rawDate ? new Date(rawDate) : new Date()
      const validDate = isNaN(d.getTime()) ? new Date() : d
      allTransactions.push({
        rawDate: validDate,
        dateFormatted: validDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ', 04:45 PM',
        type: 'Payment',
        description: `Payment from ${customer?.name || 'Customer'}`,
        module: 'Sales',
        amount: payment.amount || 0,
        status: 'Completed'
      })
    })

    return allTransactions
      .sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime())
      .slice(0, 10)
  }, [purchaseInvoices, salesInvoices, payments, customerPayments, suppliers, customers])

  const totalExpenseVal = expenseDistribution.reduce((acc, curr) => acc + curr.value, 0)

  // ── 4 New Insight Cards Data ──

  // 1. Top Suppliers by Purchase Value
  const topSuppliers = useMemo(() => {
    const supplierTotals: { [id: string]: { name: string; totalAmount: number; count: number } } = {}
    purchaseInvoices.forEach(inv => {
      const s = suppliers.find(sup => sup.id === inv.supplierId)
      if (s) {
        if (!supplierTotals[s.id]) supplierTotals[s.id] = { name: s.name, totalAmount: 0, count: 0 }
        supplierTotals[s.id].totalAmount += getSafeInvoiceAmount(inv)
        supplierTotals[s.id].count += 1
      }
    })
    return Object.values(supplierTotals)
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 5)
  }, [purchaseInvoices, suppliers])

  // 2. Top Buyers (Customers) by Sales Value
  const topBuyers = useMemo(() => {
    const customerTotals: { [id: string]: { name: string; totalAmount: number; count: number } } = {}
    salesInvoices.forEach(inv => {
      const c = customers.find(cust => cust.id === inv.customerId)
      if (c) {
        if (!customerTotals[c.id]) customerTotals[c.id] = { name: c.name, totalAmount: 0, count: 0 }
        customerTotals[c.id].totalAmount += getSafeInvoiceAmount(inv)
        customerTotals[c.id].count += 1
      }
    })
    return Object.values(customerTotals)
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 5)
  }, [salesInvoices, customers])

  // 3. Top Stocks by Current Stock Value
  const topStocks = useMemo(() => {
    return [...inventoryData]
      .filter(i => i.balanceMT > 0)
      .sort((a, b) => b.currentStockValue - a.currentStockValue)
      .slice(0, 5)
  }, [inventoryData])

  // 4. Fast & Slow Movers
  const itemMovementData = useMemo(() => {
    const soldQtyMap: { [itemId: string]: number } = {}
    salesInvoices.forEach(inv => {
      if (inv.items && Array.isArray(inv.items)) {
        inv.items.forEach(item => {
          soldQtyMap[item.itemId] = (soldQtyMap[item.itemId] || 0) + (item.enteredQuantity || 0)
        })
      }
    })
    const itemsWithMovement = inventoryData.map(itemReport => ({
      ...itemReport,
      soldQty: soldQtyMap[itemReport.itemId] || 0
    }))
    const fastMovers = [...itemsWithMovement]
      .sort((a, b) => b.soldQty - a.soldQty)
      .slice(0, 5)
    const slowMovers = [...itemsWithMovement]
      .filter(i => i.balanceMT > 0)
      .sort((a, b) => a.soldQty - b.soldQty)
      .slice(0, 5)
    return { fastMovers, slowMovers }
  }, [inventoryData, salesInvoices])

  const [moverTab, setMoverTab] = useState<'fast' | 'slow'>('fast')

  return (
    <div className="dashboard-page space-y-6 p-1">
      {/* ── 8 Stat Cards Grid (4 cols x 2 rows) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Card 1: Total Payables */}
        <AnimatedCard className="bg-white rounded-2xl p-5 border border-[#E8EAEF] shadow-[0_2px_12px_rgba(91,95,239,0.06)] hover:shadow-lg transition-all relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-[#7C3AED] text-white flex items-center justify-center shadow-md shadow-[#7C3AED]/20">
                <CurrencyInr className="h-5 w-5" weight="bold" />
              </div>
              <button className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <DotsThree className="h-5 w-5" weight="bold" />
              </button>
            </div>
            <div className="text-xs font-semibold text-slate-500 mb-1">Total Payables</div>
            <AnimatedValue
              value={totalPayables}
              formatFn={formatCurrency}
              className="text-2xl font-extrabold text-slate-900 tracking-tight"
            />
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              {purchaseInvoices.length} Invoices • {payments.length} Payments
            </p>
          </div>
          <Sparkline color="#7C3AED" />
        </AnimatedCard>

        {/* Card 2: Total Receivables */}
        <AnimatedCard className="bg-white rounded-2xl p-5 border border-[#E8EAEF] shadow-[0_2px_12px_rgba(91,95,239,0.06)] hover:shadow-lg transition-all relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-[#10B981] text-white flex items-center justify-center shadow-md shadow-[#10B981]/20">
                <Wallet className="h-5 w-5" weight="bold" />
              </div>
              <button className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <DotsThree className="h-5 w-5" weight="bold" />
              </button>
            </div>
            <div className="text-xs font-semibold text-slate-500 mb-1">Total Receivables</div>
            <AnimatedValue
              value={totalReceivables}
              formatFn={formatCurrency}
              className="text-2xl font-extrabold text-slate-900 tracking-tight"
            />
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              {salesInvoices.length} Invoices • {customerPayments.length} Payments
            </p>
          </div>
          <Sparkline color="#10B981" />
        </AnimatedCard>

        {/* Card 3: Total Stock Value */}
        <AnimatedCard className="bg-white rounded-2xl p-5 border border-[#E8EAEF] shadow-[0_2px_12px_rgba(91,95,239,0.06)] hover:shadow-lg transition-all relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-[#2563EB] text-white flex items-center justify-center shadow-md shadow-[#2563EB]/20">
                <Cube className="h-5 w-5" weight="bold" />
              </div>
              <button className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <DotsThree className="h-5 w-5" weight="bold" />
              </button>
            </div>
            <div className="text-xs font-semibold text-slate-500 mb-1">Total Stock Value</div>
            <AnimatedValue
              value={totalStockValue}
              formatFn={formatCurrency}
              className="text-2xl font-extrabold text-slate-900 tracking-tight"
            />
            <p className="text-[11px] text-slate-500 font-semibold mt-1 truncate">
              {formatUnitSummary(stockSummary)}
            </p>
          </div>
          <Sparkline color="#2563EB" />
        </AnimatedCard>

        {/* Card 4: Net Profit */}
        <AnimatedCard className="bg-white rounded-2xl p-5 border border-[#E8EAEF] shadow-[0_2px_12px_rgba(91,95,239,0.06)] hover:shadow-lg transition-all relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-[#84CC16] text-white flex items-center justify-center shadow-md shadow-[#84CC16]/20">
                <Wallet className="h-5 w-5" weight="bold" />
              </div>
              <div className="h-7 w-7 rounded-full bg-[#10B981] text-white flex items-center justify-center shadow-sm">
                <TrendUp className="h-4 w-4" weight="bold" />
              </div>
            </div>
            <div className="text-xs font-semibold text-slate-500 mb-1">Net Profit</div>
            <AnimatedValue
              value={netProfit}
              formatFn={formatCurrency}
              className="text-2xl font-extrabold text-slate-900 tracking-tight"
            />
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              Margin: {(Number.isFinite(profitMargin) ? profitMargin : 64.52).toFixed(2)}%
            </p>
          </div>
          <Sparkline color="#84CC16" />
        </AnimatedCard>

        {/* Card 5: Total Pending Discounts */}
        <AnimatedCard className="bg-white rounded-2xl p-5 border border-[#E8EAEF] shadow-[0_2px_12px_rgba(91,95,239,0.06)] hover:shadow-lg transition-all relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-[#F59E0B] text-white flex items-center justify-center shadow-md shadow-[#F59E0B]/20">
                <Tag className="h-5 w-5" weight="bold" />
              </div>
              <button className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <DotsThree className="h-5 w-5" weight="bold" />
              </button>
            </div>
            <div className="text-xs font-semibold text-slate-500 mb-1">Total Pending Discounts</div>
            <AnimatedValue
              value={totalPendingDiscounts}
              formatFn={formatCurrency}
              className="text-2xl font-extrabold text-slate-900 tracking-tight"
            />
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              Received: {formatCurrency(totalDiscountsReceived)}
            </p>
          </div>
        </AnimatedCard>

        {/* Card 6: Total Sales Revenue */}
        <AnimatedCard className="bg-white rounded-2xl p-5 border border-[#E8EAEF] shadow-[0_2px_12px_rgba(91,95,239,0.06)] hover:shadow-lg transition-all relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-[#8B5CF6] text-white flex items-center justify-center shadow-md shadow-[#8B5CF6]/20">
                <ChartBar className="h-5 w-5" weight="bold" />
              </div>
              <button className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <DotsThree className="h-5 w-5" weight="bold" />
              </button>
            </div>
            <div className="text-xs font-semibold text-slate-500 mb-1">Total Sales Revenue</div>
            <AnimatedValue
              value={totalSalesRevenue}
              formatFn={formatCurrency}
              className="text-2xl font-extrabold text-slate-900 tracking-tight"
            />
            <p className="text-[11px] text-slate-400 font-medium mt-1 truncate">
              {salesInvoices.length} Invoices{formatUnitSummary(salesVolumeByUnit, 1) !== '0 items in stock' && formatUnitSummary(salesVolumeByUnit, 1) ? ` • ${formatUnitSummary(salesVolumeByUnit, 1)}` : ''}
            </p>
          </div>
        </AnimatedCard>

        {/* Card 7: Purchase Value */}
        <AnimatedCard className="bg-white rounded-2xl p-5 border border-[#E8EAEF] shadow-[0_2px_12px_rgba(91,95,239,0.06)] hover:shadow-lg transition-all relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-[#06B6D4] text-white flex items-center justify-center shadow-md shadow-[#06B6D4]/20">
                <ShoppingCart className="h-5 w-5" weight="bold" />
              </div>
              <button className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <DotsThree className="h-5 w-5" weight="bold" />
              </button>
            </div>
            <div className="text-xs font-semibold text-slate-500 mb-1">Purchase Value</div>
            <AnimatedValue
              value={totalPurchaseValue}
              formatFn={formatCurrency}
              className="text-2xl font-extrabold text-slate-900 tracking-tight"
            />
            <p className="text-[11px] text-slate-400 font-medium mt-1 truncate">
              {purchaseInvoices.length} Invoices{formatUnitSummary(purchaseVolumeByUnit, 1) !== '0 items in stock' && formatUnitSummary(purchaseVolumeByUnit, 1) ? ` • ${formatUnitSummary(purchaseVolumeByUnit, 1)}` : ''}
            </p>
          </div>
        </AnimatedCard>

        {/* Card 8: Inventory Items */}
        <AnimatedCard className="bg-white rounded-2xl p-5 border border-[#E8EAEF] shadow-[0_2px_12px_rgba(91,95,239,0.06)] hover:shadow-lg transition-all relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-[#EC4899] text-white flex items-center justify-center shadow-md shadow-[#EC4899]/20">
                <Package className="h-5 w-5" weight="bold" />
              </div>
              <button className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <DotsThree className="h-5 w-5" weight="bold" />
              </button>
            </div>
            <div className="text-xs font-semibold text-slate-500 mb-1">Inventory Items</div>
            <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {items.length}
            </div>
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              Items in catalog
            </p>
          </div>
        </AnimatedCard>

      </div>

      {/* CD Expiry Alert */}
      <CDExpiryAlert
        purchaseInvoices={purchaseInvoices}
        payments={payments}
        suppliers={suppliers}
        onNavigateToReport={() => onNavigateToReport('cd-risk')}
      />

      {/* ── 4 Insight Cards: Top Supplier, Top Buyer, Top Stocks, Fast & Slow Movers ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* ── Card A: Top Suppliers ── */}
        <div className="bg-white rounded-2xl border border-[#E8EAEF] shadow-[0_2px_12px_rgba(91,95,239,0.06)] overflow-hidden flex flex-col hover:shadow-lg transition-shadow duration-200">
          {/* Header */}
          <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-[#F1F3F9]">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#4F46E5] to-[#7C3AED] text-white flex items-center justify-center shadow-md shadow-[#4F46E5]/25 shrink-0">
              <Truck className="h-5 w-5" weight="bold" />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-extrabold text-slate-900 leading-tight">Top Suppliers</div>
              <div className="text-[11px] text-slate-400 font-medium mt-0.5">By purchase value</div>
            </div>
            <Crown className="h-4 w-4 text-amber-400 ml-auto shrink-0" weight="fill" />
          </div>
          {/* Body */}
          <div className="flex-1 px-5 py-3 space-y-3">
            {topSuppliers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-slate-400">
                <Truck className="h-8 w-8 mb-2 opacity-40" weight="duotone" />
                <span className="text-xs font-semibold">No purchase data yet</span>
              </div>
            ) : (
              topSuppliers.map((sup, idx) => {
                const maxAmt = topSuppliers[0].totalAmount || 1
                const pct = Math.round((sup.totalAmount / maxAmt) * 100)
                const rankColors = ['#4F46E5','#7C3AED','#8B5CF6','#A78BFA','#C4B5FD']
                return (
                  <div key={idx} className="flex items-center gap-3 group">
                    <div
                      className="h-6 w-6 rounded-lg flex items-center justify-center text-white text-[10px] font-extrabold shrink-0"
                      style={{ backgroundColor: rankColors[idx] || '#E8EAEF' }}
                    >
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-800 truncate max-w-[110px]">{sup.name}</span>
                        <span className="text-[11px] font-extrabold text-slate-900 font-mono ml-1 shrink-0">{formatCurrency(sup.totalAmount)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: rankColors[idx] || '#4F46E5' }}
                        />
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium shrink-0">{sup.count}b</span>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* ── Card B: Top Buyers ── */}
        <div className="bg-white rounded-2xl border border-[#E8EAEF] shadow-[0_2px_12px_rgba(91,95,239,0.06)] overflow-hidden flex flex-col hover:shadow-lg transition-shadow duration-200">
          {/* Header */}
          <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-[#F1F3F9]">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#059669] to-[#10B981] text-white flex items-center justify-center shadow-md shadow-[#059669]/25 shrink-0">
              <Users className="h-5 w-5" weight="bold" />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-extrabold text-slate-900 leading-tight">Top Buyers</div>
              <div className="text-[11px] text-slate-400 font-medium mt-0.5">By sales revenue</div>
            </div>
            <Crown className="h-4 w-4 text-amber-400 ml-auto shrink-0" weight="fill" />
          </div>
          {/* Body */}
          <div className="flex-1 px-5 py-3 space-y-3">
            {topBuyers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-slate-400">
                <Users className="h-8 w-8 mb-2 opacity-40" weight="duotone" />
                <span className="text-xs font-semibold">No sales data yet</span>
              </div>
            ) : (
              topBuyers.map((buyer, idx) => {
                const maxAmt = topBuyers[0].totalAmount || 1
                const pct = Math.round((buyer.totalAmount / maxAmt) * 100)
                const rankColors = ['#059669','#10B981','#34D399','#6EE7B7','#A7F3D0']
                return (
                  <div key={idx} className="flex items-center gap-3 group">
                    <div
                      className="h-6 w-6 rounded-lg flex items-center justify-center text-white text-[10px] font-extrabold shrink-0"
                      style={{ backgroundColor: rankColors[idx] || '#E8EAEF' }}
                    >
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-800 truncate max-w-[110px]">{buyer.name}</span>
                        <span className="text-[11px] font-extrabold text-slate-900 font-mono ml-1 shrink-0">{formatCurrency(buyer.totalAmount)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: rankColors[idx] || '#059669' }}
                        />
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium shrink-0">{buyer.count}inv</span>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* ── Card C: Top Stocks ── */}
        <div className="bg-white rounded-2xl border border-[#E8EAEF] shadow-[0_2px_12px_rgba(91,95,239,0.06)] overflow-hidden flex flex-col hover:shadow-lg transition-shadow duration-200">
          {/* Header */}
          <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-[#F1F3F9]">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#0284C7] to-[#0EA5E9] text-white flex items-center justify-center shadow-md shadow-[#0284C7]/25 shrink-0">
              <Stack className="h-5 w-5" weight="bold" />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-extrabold text-slate-900 leading-tight">Top Stocks</div>
              <div className="text-[11px] text-slate-400 font-medium mt-0.5">Highest value in hand</div>
            </div>
            <Package className="h-4 w-4 text-sky-400 ml-auto shrink-0" weight="fill" />
          </div>
          {/* Body */}
          <div className="flex-1 px-5 py-3 space-y-3">
            {topStocks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-slate-400">
                <Stack className="h-8 w-8 mb-2 opacity-40" weight="duotone" />
                <span className="text-xs font-semibold">No stock data yet</span>
              </div>
            ) : (
              topStocks.map((stock, idx) => {
                const maxVal = topStocks[0].currentStockValue || 1
                const pct = Math.round((stock.currentStockValue / maxVal) * 100)
                const rankColors = ['#0284C7','#0EA5E9','#38BDF8','#7DD3FC','#BAE6FD']
                return (
                  <div key={idx} className="flex items-center gap-3 group">
                    <div
                      className="h-6 w-6 rounded-lg flex items-center justify-center text-white text-[10px] font-extrabold shrink-0"
                      style={{ backgroundColor: rankColors[idx] || '#E8EAEF' }}
                    >
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-800 truncate max-w-[100px]">{stock.itemName}</span>
                        <span className="text-[11px] font-extrabold text-slate-900 font-mono ml-1 shrink-0">{formatCurrency(stock.currentStockValue)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden flex-1">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, backgroundColor: rankColors[idx] || '#0284C7' }}
                          />
                        </div>
                        <span className="text-[10px] text-slate-500 font-semibold shrink-0">
                          {(Number(stock.balanceMT) || 0).toFixed(2)} {stock.unit}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* ── Card D: Fast & Slow Movers ── */}
        <div className="bg-white rounded-2xl border border-[#E8EAEF] shadow-[0_2px_12px_rgba(91,95,239,0.06)] overflow-hidden flex flex-col hover:shadow-lg transition-shadow duration-200">
          {/* Header */}
          <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-[#F1F3F9]">
            <div className={`h-10 w-10 rounded-xl text-white flex items-center justify-center shadow-md shrink-0 transition-colors duration-300 ${moverTab === 'fast' ? 'bg-gradient-to-br from-[#EA580C] to-[#F59E0B] shadow-[#EA580C]/25' : 'bg-gradient-to-br from-[#64748B] to-[#475569] shadow-[#64748B]/25'}`}>
              {moverTab === 'fast'
                ? <Fire className="h-5 w-5" weight="bold" />
                : <HourglassHigh className="h-5 w-5" weight="bold" />
              }
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-extrabold text-slate-900 leading-tight">Item Movers</div>
              <div className="text-[11px] text-slate-400 font-medium mt-0.5">Sales velocity ranking</div>
            </div>
            {/* Tab toggle */}
            <div className="ml-auto flex items-center bg-slate-100 rounded-lg p-0.5 shrink-0">
              <button
                onClick={() => setMoverTab('fast')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold transition-all duration-200 cursor-pointer ${moverTab === 'fast' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Fire className="h-3 w-3" weight="bold" /> Fast
              </button>
              <button
                onClick={() => setMoverTab('slow')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold transition-all duration-200 cursor-pointer ${moverTab === 'slow' ? 'bg-white text-slate-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <HourglassHigh className="h-3 w-3" weight="bold" /> Slow
              </button>
            </div>
          </div>
          {/* Body */}
          <div className="flex-1 px-5 py-3 space-y-3">
            {(moverTab === 'fast' ? itemMovementData.fastMovers : itemMovementData.slowMovers).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-slate-400">
                <Fire className="h-8 w-8 mb-2 opacity-40" weight="duotone" />
                <span className="text-xs font-semibold">No movement data yet</span>
              </div>
            ) : (
              (moverTab === 'fast' ? itemMovementData.fastMovers : itemMovementData.slowMovers).map((item, idx) => {
                const isFast = moverTab === 'fast'
                const maxSold = isFast
                  ? (itemMovementData.fastMovers[0]?.soldQty || 1)
                  : Math.max(...itemMovementData.slowMovers.map(i => i.soldQty), 1)
                const pct = maxSold > 0 ? Math.round((item.soldQty / maxSold) * 100) : 0
                const fastColors = ['#EA580C','#F97316','#FB923C','#FDBA74','#FED7AA']
                const slowColors = ['#64748B','#94A3B8','#CBD5E1','#E2E8F0','#F1F5F9']
                const rankColor = (isFast ? fastColors : slowColors)[idx] || '#94A3B8'
                return (
                  <div key={idx} className="flex items-center gap-3 group">
                    <div
                      className="h-6 w-6 rounded-lg flex items-center justify-center text-white text-[10px] font-extrabold shrink-0"
                      style={{ backgroundColor: rankColor }}
                    >
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-800 truncate max-w-[110px]">{item.itemName}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1 shrink-0 ${isFast ? 'bg-orange-50 text-orange-600' : 'bg-slate-100 text-slate-500'}`}>
                          {isFast ? (item.soldQty > 0 ? `${(item.soldQty || 0).toFixed(2)} ${item.unit}` : '—') : (item.soldQty === 0 ? 'No Sales' : `${(item.soldQty || 0).toFixed(2)} ${item.unit}`)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden flex-1">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.max(pct, isFast ? 0 : 5)}%`, backgroundColor: rankColor }}
                          />
                        </div>
                        <span className="text-[10px] text-slate-500 font-semibold shrink-0">
                          Bal: {(Number(item.balanceMT) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} {item.unit || ''}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

      </div>

      {/* ── Charts Section ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Chart 1: Sales vs Purchase */}
        <Card className="bg-white rounded-2xl border border-[#E8EAEF] shadow-[0_2px_12px_rgba(91,95,239,0.06)]">
          <CardHeader className="pb-2 border-b border-[#F1F3F9] flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-extrabold text-slate-900 tracking-tight">Sales vs Purchase</CardTitle>
              <CardDescription className="text-xs text-slate-400 font-medium mt-0.5">Last 6 months trend (in Lakhs)</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1 bg-[#F5F6FA] border border-[#E8EAEF] text-slate-600 font-semibold px-2.5 py-1 rounded-xl text-xs hover:bg-[#EEF0F8]">
                Last 6 Months <CaretDown className="h-3 w-3" />
              </button>
              <button className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <DotsThreeVertical className="h-4 w-4" weight="bold" />
              </button>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={salesVsPurchaseData} barGap={8}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F3F9" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fill: '#64748B', fontSize: 12, fontWeight: 500 }}
                  axisLine={{ stroke: '#E8EAEF' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#64748B', fontSize: 12, fontWeight: 500 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E8EAEF',
                    borderRadius: '12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    color: '#1E293B',
                    fontSize: '12px',
                    fontWeight: 600
                  }}
                />
                <Legend
                  wrapperStyle={{ paddingTop: '12px' }}
                  iconType="circle"
                  formatter={(val) => <span className="text-xs font-semibold text-slate-600">{val}</span>}
                />
                <Bar dataKey="Sales" fill="#2563EB" radius={[6, 6, 0, 0]} barSize={50} />
                <Bar dataKey="Purchase" fill="#8B5CF6" radius={[6, 6, 0, 0]} barSize={50} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Chart 2: Expense Distribution */}
        <Card className="bg-white rounded-2xl border border-[#E8EAEF] shadow-[0_2px_12px_rgba(91,95,239,0.06)]">
          <CardHeader className="pb-2 border-b border-[#F1F3F9] flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-extrabold text-slate-900 tracking-tight">Expense Distribution</CardTitle>
              <CardDescription className="text-xs text-slate-400 font-medium mt-0.5">Top 5 expense categories</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1 bg-[#F5F6FA] border border-[#E8EAEF] text-slate-600 font-semibold px-2.5 py-1 rounded-xl text-xs hover:bg-[#EEF0F8]">
                This Month <CaretDown className="h-3 w-3" />
              </button>
              <button className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <DotsThreeVertical className="h-4 w-4" weight="bold" />
              </button>
            </div>
          </CardHeader>
          <CardContent className="pt-6 flex items-center justify-between gap-4">
            {/* Donut Chart with Center Text */}
            <div className="relative w-1/2 h-[240px] flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expenseDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={95}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {expenseDistribution.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={['#2563EB', '#F59E0B', '#8B5CF6', '#10B981', '#64748B'][index % 5]}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: any) => formatCurrency(val)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xl font-extrabold text-slate-900">100%</span>
              </div>
            </div>

            {/* Right Legend */}
            <div className="w-1/2 space-y-3 pl-2">
              {[
                { name: 'Transport', pct: '100%', icon: Truck, color: 'text-blue-600' },
                { name: 'Utilities', pct: '0%', icon: Lightning, color: 'text-amber-500' },
                { name: 'Marketing', pct: '0%', icon: Megaphone, color: 'text-purple-600' },
                { name: 'Salary', pct: '0%', icon: User, color: 'text-emerald-600' },
                { name: 'Other Expenses', pct: '0%', icon: DotsThree, color: 'text-slate-500' },
              ].map((item, idx) => {
                const IconComp = item.icon
                const matchedExp = expenseDistribution.find(e => e.name.toLowerCase() === item.name.toLowerCase())
                const pctStr = totalExpenseVal > 0 && matchedExp
                  ? `${Math.round((matchedExp.value / totalExpenseVal) * 100)}%`
                  : item.pct

                return (
                  <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-[#F1F3F9] last:border-0">
                    <div className="flex items-center gap-2">
                      <IconComp className={`h-4 w-4 ${item.color}`} weight="bold" />
                      <span className="font-semibold text-slate-700">{item.name}</span>
                    </div>
                    <span className="font-extrabold text-slate-900">{pctStr}</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

      </div>

      {/* ── Recent Transactions Table ── */}
      <Card className="bg-white rounded-2xl border border-[#E8EAEF] shadow-[0_2px_12px_rgba(91,95,239,0.06)] overflow-hidden">
        <CardHeader className="pb-4 border-b border-[#F1F3F9] flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-extrabold text-slate-900 tracking-tight">Recent Transactions</CardTitle>
            <CardDescription className="text-xs text-slate-400 font-medium mt-0.5">Last 10 transactions across all modules</CardDescription>
          </div>
          <Button variant="outline" className="h-8 text-xs font-bold rounded-xl border-[#E8EAEF] text-slate-700 hover:bg-[#F5F6FA]">
            View All Transactions
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="relative overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-[#E8EAEF] bg-[#F5F6FA]/60 hover:bg-[#F5F6FA]/60">
                  <TableHead className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider py-3.5 px-6">DATE</TableHead>
                  <TableHead className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider py-3.5">TYPE</TableHead>
                  <TableHead className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider py-3.5">DESCRIPTION</TableHead>
                  <TableHead className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider py-3.5">MODULE</TableHead>
                  <TableHead className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider py-3.5">AMOUNT</TableHead>
                  <TableHead className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider py-3.5">STATUS</TableHead>
                  <TableHead className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider py-3.5 text-center px-6">ACTION</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence mode="popLayout">
                  {recentTransactions.length > 0 ? (
                    recentTransactions.map((txn, idx) => (
                      <motion.tr
                        key={`${txn.dateFormatted}-${idx}`}
                        className="border-b border-[#F1F3F9] last:border-0 transition-colors hover:bg-[#F8FAFC]"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.03, duration: 0.15 }}
                      >
                        <TableCell className="font-mono text-xs font-semibold text-slate-600 py-4 px-6">
                          {txn.dateFormatted}
                        </TableCell>

                        {/* TYPE Badge */}
                        <TableCell className="py-4">
                          {txn.type === 'Payment' && (
                            <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full border border-emerald-200/60 inline-block">
                              Payment
                            </span>
                          )}
                          {txn.type === 'Invoice' && (
                            <span className="bg-blue-50 text-blue-700 text-xs font-bold px-3 py-1 rounded-full border border-blue-200/60 inline-block">
                              Invoice
                            </span>
                          )}
                          {txn.type === 'Purchase' && (
                            <span className="bg-amber-50 text-amber-700 text-xs font-bold px-3 py-1 rounded-full border border-amber-200/60 inline-block">
                              Purchase
                            </span>
                          )}
                        </TableCell>

                        {/* DESCRIPTION */}
                        <TableCell className="text-xs font-bold text-slate-800 py-4 max-w-xs truncate">
                          {txn.description}
                        </TableCell>

                        {/* MODULE */}
                        <TableCell className="py-4">
                          <span className={`text-xs font-extrabold ${txn.module === 'Purchase' ? 'text-blue-600' : 'text-purple-600'}`}>
                            {txn.module}
                          </span>
                        </TableCell>

                        {/* AMOUNT */}
                        <TableCell className="font-mono text-xs font-extrabold text-slate-900 py-4">
                          {formatCurrency(txn.amount)}
                        </TableCell>

                        {/* STATUS */}
                        <TableCell className="py-4">
                          {txn.status === 'Completed' && (
                            <span className="bg-emerald-100/80 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full inline-block">
                              Completed
                            </span>
                          )}
                          {txn.status === 'Paid' && (
                            <span className="bg-emerald-100/80 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full inline-block">
                              Paid
                            </span>
                          )}
                          {txn.status === 'Pending' && (
                            <span className="bg-amber-100/80 text-amber-700 text-xs font-bold px-3 py-1 rounded-full inline-block">
                              Pending
                            </span>
                          )}
                        </TableCell>

                        {/* ACTION */}
                        <TableCell className="py-4 text-center px-6">
                          <button className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                            <DotsThreeVertical className="h-4 w-4" weight="bold" />
                          </button>
                        </TableCell>
                      </motion.tr>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-slate-400 py-10 font-semibold text-xs">
                        No recent transactions available
                      </TableCell>
                    </TableRow>
                  )}
                </AnimatePresence>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
