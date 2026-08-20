import { useState, useMemo } from 'react'
import { PeriodDateFilter, PeriodFilterState, defaultPeriodFilterState, isRecordInPeriod } from '@/components/period-date-filter'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { 
  PurchaseInvoice, 
  Payment, 
  PaymentAllocation, 
  Party,
  Supplier,
  FixedScheme,
  ReceivedDiscount,
  MTBooking,
  Item
} from '@/lib/types'
import { formatCurrency, formatMT, calculatePaymentAllocations, calculateExpectedDiscounts, isPaymentAdvance, getFYMonths } from '@/lib/calculations'
import { getInvoiceQtyForUnit } from '@/lib/unit-conversion-service'
import { CreditCard, Calendar, FileText, Coins, CheckCircle, Clock, CaretDown, Check, TrendUp, TrendDown } from '@phosphor-icons/react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

interface PaymentDetailsPageProps {
  payments: Payment[]
  invoices: PurchaseInvoice[]
  parties?: Party[]
  suppliers?: Supplier[]
  fixedSchemes: FixedScheme[]
  mtBookings?: MTBooking[]
  items?: Item[]
  receivedDiscounts: ReceivedDiscount[]
  currentFY: string
}

interface PaymentDetails {
  payment: Payment
  supplier: Supplier
  allocatedInvoices: Array<{
    invoice: PurchaseInvoice
    allocatedAmount: number
    advanceAmount: number
    regularAmount: number
    days: number
    cdEarned: number
    advanceCDEarned: number
    regularCDEarned: number
    cdPercentage: number
    advanceCDPercentage: number
    cdPerMT: number
    invoiceCloseCDEarned: number
    invoiceCloseCDDays: number
    invoiceCloseCDRate: number
  }>
  allocatedAmount: number
  unallocatedAmount: number
  isAdvance: boolean
  totalCDEarned: number
  totalPaymentCDEarned: number
  totalAdvanceCDEarned: number
  totalRegularCDEarned: number
  totalInvoiceCloseCDEarned: number
  unallocatedAdvanceCDEarned: number
}

export default function PaymentDetailsPage({
  payments,
  invoices,
  parties,
  suppliers = [],
  fixedSchemes,
  mtBookings = [],
  items = [],
  receivedDiscounts,
  currentFY
}: PaymentDetailsPageProps) {
  const suppliersList = parties || suppliers || []
  const [selectedSupplier, setSelectedSupplier] = useState<string>('all')
  const [selectedMode, setSelectedMode] = useState<string>('all')
  const [selectedType, setSelectedType] = useState<string>('all')
  const [searchPaymentNo, setSearchPaymentNo] = useState('')
  const [periodFilter, setPeriodFilter] = useState<PeriodFilterState>(defaultPeriodFilterState)
  const [collapsedCards, setCollapsedCards] = useState<Record<string, boolean>>({})

  const supplierMap = useMemo(() => new Map(suppliersList.map(s => [s.id, s])), [suppliersList])

  const { allocations: paymentAllocations, paymentAdvanceInfo } = useMemo(
    () => calculatePaymentAllocations(payments, invoices),
    [payments, invoices]
  )

  const expectedDiscounts = useMemo(
    () => calculateExpectedDiscounts(invoices, payments, paymentAllocations, paymentAdvanceInfo, suppliersList, fixedSchemes, mtBookings, items),
    [invoices, payments, paymentAllocations, paymentAdvanceInfo, suppliersList, fixedSchemes, mtBookings, items]
  )

  const paymentDetails = useMemo((): PaymentDetails[] => {
    return payments
      .map(payment => {
        const supplier = supplierMap.get(payment.supplierId)
        if (!supplier) return null
        
        const isAdvancePayment = isPaymentAdvance(payment, paymentAllocations)
        
        const advanceInfo = paymentAdvanceInfo.get(payment.id)
        const advanceCDPercentage = supplier.advanceCDPercentage || 0
        
        const payAllocations = paymentAllocations.filter(a => a.paymentId === payment.id)
        
        const allocatedInvoices = payAllocations
          .map(alloc => {
            const invoice = invoices.find(i => i.id === alloc.invoiceId)
            if (!invoice) return null
          
          const wasAdvanceAllocation = advanceInfo?.allocationIsAdvanceMap.get(alloc.id) || false

          const invoiceDateObj = new Date(invoice.invoiceDate)
          const paymentDateObj = new Date(payment.paymentDate)
          invoiceDateObj.setHours(0, 0, 0, 0)
          paymentDateObj.setHours(0, 0, 0, 0)
          const days = Math.max(0, Math.floor((paymentDateObj.getTime() - invoiceDateObj.getTime()) / (1000 * 60 * 60 * 24)))
          
          const advanceCDForThisAlloc = expectedDiscounts.find(
            ed => ed.id === `advanceCD-${alloc.id}` && ed.type === 'advanceCD'
          )
          const regularCDForThisAlloc = expectedDiscounts.find(
            ed => ed.id === `paymentCD-${alloc.id}` && ed.type === 'paymentCD'
          )
          
          const advanceCDEarnedForAlloc = advanceCDForThisAlloc?.expectedAmount || 0
          const regularCDEarnedForAlloc = regularCDForThisAlloc?.expectedAmount || 0
          
          let regularCDPercentage = 0
          if (regularCDEarnedForAlloc > 0 && alloc.allocatedAmount > 0) {
            regularCDPercentage = (regularCDEarnedForAlloc / alloc.allocatedAmount) * 100
          }
          
          const cdEarned = advanceCDEarnedForAlloc + regularCDEarnedForAlloc

          const totalCDFromInvoice = payment.doNotApplyCD ? 0 : expectedDiscounts
            .filter(ed => ed.invoiceId === invoice.id && ed.paymentId === payment.id)
            .reduce((sum, cd) => sum + cd.expectedAmount, 0)
          
          const invoiceMT = getInvoiceQtyForUnit(invoice, 'MT')
          const cdPerMT = invoiceMT > 0 ? totalCDFromInvoice / invoiceMT : 0

          const invoiceAllocations = paymentAllocations.filter(a => a.invoiceId === invoice.id)
          const totalInvoiceAllocated = invoiceAllocations.reduce((sum, a) => sum + a.allocatedAmount, 0)
          const isInvoiceFullyPaid = totalInvoiceAllocated >= invoice.invoiceAmount
          
          const lastPaymentForInvoice = payments
            .filter(p => invoiceAllocations.some(a => a.paymentId === p.id))
            .sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime())[0]
          
          let invoiceCloseCDEarned = 0
          let invoiceCloseCDDays = 0
          let invoiceCloseCDRate = 0
          
          if (isInvoiceFullyPaid && lastPaymentForInvoice && lastPaymentForInvoice.id === payment.id && !payment.doNotApplyCD) {
            const invoiceCloseCDs = expectedDiscounts.filter(
              ed => ed.invoiceId === invoice.id && ed.type === 'invoiceCloseCD'
            )
            
            if (invoiceCloseCDs.length > 0) {
              invoiceCloseCDEarned = invoiceCloseCDs.reduce((sum, ed) => sum + ed.expectedAmount, 0)
              invoiceCloseCDRate = invoiceCloseCDs[0].ratePerMT
              
              const invDateObj = new Date(invoice.invoiceDate)
              const pmtDateObj = new Date(payment.paymentDate)
              invDateObj.setHours(0, 0, 0, 0)
              pmtDateObj.setHours(0, 0, 0, 0)
              
              invoiceCloseCDDays = Math.max(0, Math.floor(
                (pmtDateObj.getTime() - invDateObj.getTime()) / (1000 * 60 * 60 * 24)
              ))
            }
          }

          return {
            invoice,
            allocatedAmount: alloc.allocatedAmount,
            advanceAmount: wasAdvanceAllocation ? alloc.allocatedAmount : 0,
            regularAmount: wasAdvanceAllocation ? 0 : alloc.allocatedAmount,
            days,
            cdEarned,
            advanceCDEarned: advanceCDEarnedForAlloc,
            regularCDEarned: regularCDEarnedForAlloc,
            cdPercentage: wasAdvanceAllocation ? 0 : regularCDPercentage,
            advanceCDPercentage: wasAdvanceAllocation ? advanceCDPercentage : 0,
            cdPerMT,
            invoiceCloseCDEarned,
            invoiceCloseCDDays,
            invoiceCloseCDRate
          }
        })
        .filter((ai): ai is NonNullable<typeof ai> => ai !== null)
        
        const allocatedAmount = allocatedInvoices.reduce((sum, ai) => sum + ai.allocatedAmount, 0)
        const unallocatedAmount = Math.max(0, payment.amount - allocatedAmount)
        
        const totalRegularCDEarned = expectedDiscounts
          .filter(ed => ed.paymentId === payment.id && ed.type === 'paymentCD')
          .reduce((sum, cd) => sum + cd.expectedAmount, 0)
        
        const totalAdvanceCDEarned = payment.doNotApplyCD ? 0 : expectedDiscounts
          .filter(ed => ed.paymentId === payment.id && ed.type === 'advanceCD')
          .reduce((sum, cd) => sum + cd.expectedAmount, 0)
        
        const unallocatedAdvanceCDEarned = payment.doNotApplyCD ? 0 : expectedDiscounts
          .filter(ed => ed.paymentId === payment.id && ed.type === 'advanceCD' && ed.id.includes('unallocated'))
          .reduce((sum, cd) => sum + cd.expectedAmount, 0)
        
        const totalInvoiceCloseCDEarned = allocatedInvoices.reduce((sum, ai) => sum + ai.invoiceCloseCDEarned, 0)
        const totalPaymentCDEarned = totalRegularCDEarned + totalAdvanceCDEarned
        const totalCDEarned = totalPaymentCDEarned + totalInvoiceCloseCDEarned

        return {
          payment,
          supplier,
          allocatedInvoices,
          allocatedAmount,
          unallocatedAmount,
          isAdvance: isAdvancePayment,
          totalCDEarned,
          totalPaymentCDEarned,
          totalAdvanceCDEarned,
          totalRegularCDEarned,
          totalInvoiceCloseCDEarned,
          unallocatedAdvanceCDEarned
        }
      })
      .filter((detail): detail is NonNullable<typeof detail> => detail !== null)
      .sort((a, b) => new Date(b.payment.paymentDate).getTime() - new Date(a.payment.paymentDate).getTime())
  }, [payments, invoices, paymentAllocations, paymentAdvanceInfo, suppliersList, expectedDiscounts, currentFY, supplierMap])

  const filteredPaymentDetails = useMemo(() => {
    return paymentDetails.filter(detail => {
      if (selectedSupplier !== 'all' && detail.payment.supplierId !== selectedSupplier) return false
      if (selectedType === 'advance' && !detail.isAdvance) return false
      if (selectedType === 'allocated' && detail.isAdvance) return false
      if (!isRecordInPeriod(detail.payment.paymentDate, detail.payment.fy, periodFilter, currentFY)) return false
      return true
    })
  }, [paymentDetails, selectedSupplier, selectedType, periodFilter, currentFY])

  const summaryStats = useMemo(() => {
    const totalPayments = filteredPaymentDetails.length
    const totalAmount = filteredPaymentDetails.reduce((sum, d) => sum + d.payment.amount, 0)
    const totalAllocated = filteredPaymentDetails.reduce((sum, d) => sum + d.allocatedAmount, 0)
    const totalUnallocated = filteredPaymentDetails.reduce((sum, d) => sum + d.unallocatedAmount, 0)
    const totalCDEarned = filteredPaymentDetails.reduce((sum, d) => sum + d.totalCDEarned, 0)
    const totalPaymentCDEarned = filteredPaymentDetails.reduce((sum, d) => sum + d.totalPaymentCDEarned, 0)
    const totalAdvanceCDEarned = filteredPaymentDetails.reduce((sum, d) => sum + d.totalAdvanceCDEarned, 0)
    const totalRegularCDEarned = filteredPaymentDetails.reduce((sum, d) => sum + d.totalRegularCDEarned, 0)
    const totalInvoiceCloseCDEarned = filteredPaymentDetails.reduce((sum, d) => sum + d.totalInvoiceCloseCDEarned, 0)
    const advancePayments = filteredPaymentDetails.filter(d => d.isAdvance).length
    const fullyAllocated = filteredPaymentDetails.filter(d => !d.isAdvance).length

    return {
      totalPayments,
      totalAmount,
      totalAllocated,
      totalUnallocated,
      totalCDEarned,
      totalPaymentCDEarned,
      totalAdvanceCDEarned,
      totalRegularCDEarned,
      totalInvoiceCloseCDEarned,
      advancePayments,
      fullyAllocated
    }
  }, [filteredPaymentDetails])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="text-success" />
            Payment Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <div>
              <Label>Supplier</Label>
              <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Parties</SelectItem>
                  {suppliersList.map(supplier => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Payment Type</Label>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="allocated">Fully Allocated</SelectItem>
                  <SelectItem value="advance">Advance/Partial</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <PeriodDateFilter currentFY={currentFY} value={periodFilter} onChange={setPeriodFilter} />

            <div className="flex items-end gap-2 md:col-span-2">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => {
                  setSelectedSupplier('all')
                  setSelectedMode('all')
                  setSelectedType('all')
                  setPeriodFilter(defaultPeriodFilterState)
                }}
              >
                Clear Filters
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground mb-1">Total Payments</div>
                <div className="text-2xl font-bold">{summaryStats.totalPayments}</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground mb-1">Total Amount</div>
                <div className="text-lg font-semibold text-primary">{formatCurrency(summaryStats.totalAmount)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground mb-1">Allocated</div>
                <div className="text-lg font-semibold text-success">{formatCurrency(summaryStats.totalAllocated)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground mb-1">Unallocated</div>
                <div className="text-lg font-semibold text-warning">{formatCurrency(summaryStats.totalUnallocated)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground mb-1">Total CD Earned</div>
                <div className="text-lg font-semibold text-accent">{formatCurrency(summaryStats.totalCDEarned)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground mb-1">Fully Allocated</div>
                <div className="text-lg font-semibold text-success">{summaryStats.fullyAllocated}</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground mb-1">Advance</div>
                <div className="text-lg font-semibold text-warning">{summaryStats.advancePayments}</div>
              </CardContent>
            </Card>
          </div>

          {summaryStats.totalCDEarned > 0 && (
            <Card className="mb-6 border-accent/30 bg-accent/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Coins className="text-accent" size={18} />
                  CD Breakdown: Payment vs Invoice Close
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-background rounded-lg p-4 border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm text-muted-foreground">Total CD Earned</div>
                      <Coins className="text-accent" size={16} />
                    </div>
                    <div className="text-2xl font-bold text-accent">{formatCurrency(summaryStats.totalCDEarned)}</div>
                    <div className="text-xs text-muted-foreground mt-1">100%</div>
                  </div>

                  <div className="bg-background rounded-lg p-4 border border-success/50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm text-muted-foreground">Payment CD</div>
                      <TrendUp className="text-success" size={16} weight="bold" />
                    </div>
                    <div className="text-2xl font-bold text-success">{formatCurrency(summaryStats.totalPaymentCDEarned)}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {summaryStats.totalCDEarned > 0 
                        ? `${((summaryStats.totalPaymentCDEarned / summaryStats.totalCDEarned) * 100).toFixed(1)}%`
                        : '0%'}
                    </div>
                  </div>

                  <div className="bg-background rounded-lg p-4 border border-primary/50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm text-muted-foreground">Invoice Close CD</div>
                      <CheckCircle className="text-primary" size={16} weight="bold" />
                    </div>
                    <div className="text-2xl font-bold text-primary">{formatCurrency(summaryStats.totalInvoiceCloseCDEarned)}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {summaryStats.totalCDEarned > 0 
                        ? `${((summaryStats.totalInvoiceCloseCDEarned / summaryStats.totalCDEarned) * 100).toFixed(1)}%`
                        : '0%'}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-4">
            {filteredPaymentDetails.map(detail => (
              <Card key={detail.payment.id} className={`border-l-4 ${detail.isAdvance ? 'border-l-warning' : 'border-l-success'}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <CardTitle className="text-xl flex items-center gap-2">
                          <Calendar size={18} />
                          {format(new Date(detail.payment.paymentDate), 'dd MMM yyyy')}
                        </CardTitle>
                        {detail.isAdvance ? (
                          <Badge className="bg-warning text-warning-foreground">Advance/Partial</Badge>
                        ) : (
                          <Badge className="bg-success text-success-foreground">Fully Allocated</Badge>
                        )}
                        {detail.payment.doNotApplyCD && (
                          <Badge variant="outline" className="border-warning text-warning-foreground">
                            No CD
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <span className="font-medium">{detail.supplier.name}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-primary">
                        {formatCurrency(detail.payment.amount)}
                      </div>
                      {detail.totalCDEarned > 0 && (
                        <div className="space-y-1">
                          <div className="text-sm text-accent font-semibold flex items-center justify-end gap-1">
                            <Coins size={14} />
                            Total CD: {formatCurrency(detail.totalCDEarned)}
                          </div>
                          {(detail.totalAdvanceCDEarned > 0 || detail.totalRegularCDEarned > 0) && (
                            <div className="text-xs text-muted-foreground text-right space-y-0.5">
                              <div className="text-xs font-medium text-muted-foreground mb-1">Payment CD breakdown:</div>
                              {detail.totalAdvanceCDEarned > 0 && (
                                <div className="flex items-center justify-end gap-1">
                                  <TrendUp size={12} className="text-success" />
                                  <span className="text-success font-medium">Advance: {formatCurrency(detail.totalAdvanceCDEarned)}</span>
                                </div>
                              )}
                              {detail.totalRegularCDEarned > 0 && (
                                <div className="flex items-center justify-end gap-1">
                                  <TrendDown size={12} className="text-success" />
                                  <span className="text-success font-medium">Regular: {formatCurrency(detail.totalRegularCDEarned)}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-muted rounded-lg p-3">
                      <div className="text-sm text-muted-foreground mb-1">Payment Amount</div>
                      <div className="text-lg font-bold">{formatCurrency(detail.payment.amount)}</div>
                    </div>
                    <div className="bg-success/10 rounded-lg p-3">
                      <div className="text-sm text-muted-foreground mb-1">Allocated Amount</div>
                      <div className="text-lg font-bold text-success">{formatCurrency(detail.allocatedAmount)}</div>
                    </div>
                    <div className={`rounded-lg p-3 ${detail.unallocatedAmount > 0 ? 'bg-warning/10' : 'bg-muted'}`}>
                      <div className="text-sm text-muted-foreground mb-1">Unallocated Amount</div>
                      <div className={`text-lg font-bold ${detail.unallocatedAmount > 0 ? 'text-warning' : ''}`}>
                        {formatCurrency(detail.unallocatedAmount)}
                      </div>
                    </div>
                  </div>

                  {detail.allocatedInvoices.length > 0 ? (
                    <div>
                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                        <FileText size={16} className="text-primary" />
                        Invoice Allocations ({detail.allocatedInvoices.length})
                      </h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Invoice No</TableHead>
                            <TableHead>Invoice Date</TableHead>
                            <TableHead className="text-right">Invoice Amount</TableHead>
                            <TableHead className="text-right">Allocated</TableHead>
                            <TableHead className="text-right">Type</TableHead>
                            <TableHead className="text-right">Payment CD %</TableHead>
                            <TableHead className="text-right">Payment CD</TableHead>
                            <TableHead className="text-right">Invoice Close CD</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detail.allocatedInvoices.map((ai, idx) => (
                            <TableRow key={idx} className={ai.advanceAmount > 0 ? 'bg-warning/5' : ''}>
                              <TableCell className="font-medium">{ai.invoice.invoiceNo}</TableCell>
                              <TableCell>{format(new Date(ai.invoice.invoiceDate), 'dd MMM yyyy')}</TableCell>
                              <TableCell className="text-right">{formatCurrency(ai.invoice.invoiceAmount)}</TableCell>
                              <TableCell className="text-right font-semibold text-primary">
                                {formatCurrency(ai.allocatedAmount)}
                              </TableCell>
                              <TableCell className="text-right">
                                {ai.advanceAmount > 0 ? (
                                  <Badge variant="outline" className="border-warning text-warning-foreground bg-warning/10">
                                    Advance
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary">
                                    {ai.days} days
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {detail.payment.doNotApplyCD ? (
                                  <span className="text-muted-foreground">0%</span>
                                ) : ai.advanceAmount > 0 ? (
                                  <span className="font-medium text-success">{detail.supplier.advanceCDPercentage || 0}%</span>
                                ) : ai.cdPercentage > 0 ? (
                                  <span className="font-medium text-success">{ai.cdPercentage}%</span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {detail.payment.doNotApplyCD ? (
                                  <span className="text-muted-foreground">₹0</span>
                                ) : (ai.advanceCDEarned > 0 || ai.regularCDEarned > 0) ? (
                                  <div className="font-semibold text-success">{formatCurrency(ai.advanceCDEarned + ai.regularCDEarned)}</div>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {ai.invoiceCloseCDEarned > 0 ? (
                                  <div className="space-y-1">
                                    <div className="font-semibold text-primary">{formatCurrency(ai.invoiceCloseCDEarned)}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {ai.invoiceCloseCDDays} days @ ₹{ai.invoiceCloseCDRate}/MT
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                          {detail.unallocatedAmount > 0 && (
                            <TableRow className="bg-warning/5">
                              <TableCell colSpan={3} className="font-semibold text-warning">Unallocated Advance Amount</TableCell>
                              <TableCell className="text-right font-semibold text-warning">
                                {formatCurrency(detail.unallocatedAmount)}
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge variant="outline" className="border-warning text-warning-foreground">Advance</Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <span className="font-medium text-warning">{detail.supplier.advanceCDPercentage || 0}%</span>
                              </TableCell>
                              <TableCell className="text-right font-semibold text-warning">
                              </TableCell>
                            </TableRow>
                          )}
                          {detail.totalCDEarned > 0 && (
                            <TableRow className="bg-accent/5">
                              <TableCell colSpan={6} className="font-semibold text-right">Total Payment CD from this Payment</TableCell>
                              <TableCell className="text-right font-bold text-accent">
                                {formatCurrency(detail.totalCDEarned)}
                              </TableCell>
                              <TableCell className="text-right font-bold text-primary">
                                {formatCurrency(detail.totalInvoiceCloseCDEarned)}
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="bg-warning/10 border border-warning/20 rounded-lg p-4 flex items-center gap-3">
                      <Clock size={24} className="text-warning" />
                      <div>
                        <div className="font-semibold text-warning">Advance Payment - Not Yet Allocated</div>
                        <div className="text-sm text-muted-foreground">
                          This payment will be automatically allocated when new invoices are added (0-day CD applicable)
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            {filteredPaymentDetails.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No payments found matching the selected filters.
                </CardContent>
              </Card>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
