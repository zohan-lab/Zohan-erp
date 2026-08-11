import { 
  PendingDiscount, 
  ReceivedDiscount, 
  Supplier,
  Customer,
  PendingAnnualDiscount,
  Item,
  PurchaseInvoice,
  SalesInvoice,
  Payment,
  CustomerPayment
} from './types'
import { formatCurrency, formatMT } from './calculations'

function downloadCSV(csvContent: string, filename: string) {
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function escapeCSV(value: any): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function exportDiscountWalletToExcel(
  pendingDiscounts: PendingDiscount[],
  receivedDiscounts: ReceivedDiscount[],
  suppliers: Supplier[],
  fy: string,
  businessName: string,
  supplierFilter?: string,
  categoryFilter?: string,
  monthFilter?: string
) {
  const supplierMap = new Map(suppliers.map(s => [s.id, s]))
  
  const totalExpected = pendingDiscounts.reduce((sum, pd) => sum + pd.expectedAmount, 0)
  const totalAllocated = receivedDiscounts.filter(rd => rd.status === 'Allocated').reduce((sum, rd) => sum + rd.amount, 0)
  const totalAdvance = receivedDiscounts.filter(rd => rd.status === 'Advance').reduce((sum, rd) => sum + rd.amount, 0)
  const totalPending = pendingDiscounts.reduce((sum, pd) => sum + pd.pendingAmount, 0)

  let csv = `${businessName}\n`
  csv += `Discount Wallet Report\n`
  csv += `Financial Year: ${fy}\n`
  csv += `Generated: ${new Date().toLocaleString('en-IN')}\n`
  
  if (supplierFilter && supplierFilter !== 'all') {
    const supplier = supplierMap.get(supplierFilter)
    csv += `Supplier: ${supplier?.name || 'Unknown'}\n`
  }
  
  if (categoryFilter && categoryFilter !== 'all') {
    const categoryLabel = categoryFilter === 'paymentCD' ? 'Payment CD' : 
                         categoryFilter === 'invoiceCloseCD' ? 'Invoice Close CD' : 
                         'Fixed Scheme'
    csv += `Category: ${categoryLabel}\n`
  }
  
  if (monthFilter && monthFilter !== 'All Months') {
    csv += `Month: ${monthFilter}\n`
  }
  
  csv += `\nSUMMARY\n`
  csv += `Expected Discounts,${formatCurrency(totalExpected)}\n`
  csv += `Received (Allocated),${formatCurrency(totalAllocated)}\n`
  csv += `Advance (Unallocated),${formatCurrency(totalAdvance)}\n`
  csv += `Pending Balance,${formatCurrency(totalPending)}\n`
  
  csv += `\nEARNED DISCOUNTS\n`
  csv += `Supplier,Invoice/Scheme,Type,Earned Date,Expected,Received,Pending,Status\n`
  
  const pendingData = pendingDiscounts
    .sort((a, b) => new Date(a.earnedDate).getTime() - new Date(b.earnedDate).getTime())
  
  if (pendingData.length === 0) {
    csv += `No earned discounts\n`
  } else {
    pendingData.forEach(pd => {
      const supplier = supplierMap.get(pd.supplierId)
      const typeLabel = pd.type === 'paymentCD' || pd.type === 'advanceCD' ? 'Payment CD' : 
                       pd.type === 'invoiceCloseCD' ? 'Invoice Close CD' : 
                       'Fixed Scheme'
      csv += `${escapeCSV(supplier?.name || 'Unknown')},`
      csv += `${escapeCSV(pd.invoiceNo || pd.schemeName || '-')},`
      csv += `${typeLabel},`
      csv += `${new Date(pd.earnedDate).toLocaleDateString('en-IN')},`
      csv += `${pd.expectedAmount},`
      csv += `${pd.receivedAmount},`
      csv += `${pd.pendingAmount},`
      csv += `${pd.status}\n`
    })
  }
  
  csv += `\nRECEIVED DISCOUNTS\n`
  csv += `Supplier,Received Date,Notes,Amount,Status\n`
  
  const receivedData = receivedDiscounts
    .sort((a, b) => new Date(b.discountReceivedDate).getTime() - new Date(a.discountReceivedDate).getTime())
  
  if (receivedData.length === 0) {
    csv += `No received discounts\n`
  } else {
    receivedData.forEach(rd => {
      const supplier = supplierMap.get(rd.supplierId)
      csv += `${escapeCSV(supplier?.name || 'Unknown')},`
      csv += `${new Date(rd.discountReceivedDate).toLocaleDateString('en-IN')},`
      csv += `${escapeCSV(rd.notes || '-')},`
      csv += `${rd.amount},`
      csv += `${rd.status}\n`
    })
  }
  
  const filename = `Discount_Wallet_${fy}_${new Date().toISOString().split('T')[0]}.csv`
  downloadCSV(csv, filename)
}

export function exportAnnualDiscountToExcel(
  pendingAnnual: PendingAnnualDiscount[],
  receivedDiscounts: ReceivedDiscount[],
  suppliers: Supplier[],
  fy: string,
  businessName: string,
  supplierFilter?: string
) {
  const supplierMap = new Map(suppliers.map(s => [s.id, s]))
  
  const totalExpected = pendingAnnual.reduce((sum, pd) => sum + pd.expectedAmount, 0)
  const totalAllocated = receivedDiscounts.filter(rd => rd.status === 'Allocated').reduce((sum, rd) => sum + rd.amount, 0)
  const totalAdvance = receivedDiscounts.filter(rd => rd.status === 'Advance').reduce((sum, rd) => sum + rd.amount, 0)
  const totalPending = pendingAnnual.reduce((sum, pd) => sum + pd.pendingAmount, 0)

  let csv = `${businessName}\n`
  csv += `Annual Discount Report\n`
  csv += `Financial Year: ${fy}\n`
  csv += `Generated: ${new Date().toLocaleString('en-IN')}\n`
  
  if (supplierFilter && supplierFilter !== 'all') {
    const supplier = supplierMap.get(supplierFilter)
    csv += `Supplier: ${supplier?.name || 'Unknown'}\n`
  }
  
  csv += `\nSUMMARY\n`
  csv += `Expected Annual Discount,${formatCurrency(totalExpected)}\n`
  csv += `Received (Allocated),${formatCurrency(totalAllocated)}\n`
  csv += `Advance (Unallocated),${formatCurrency(totalAdvance)}\n`
  csv += `Pending Balance,${formatCurrency(totalPending)}\n`
  
  csv += `\nEARNED ANNUAL DISCOUNTS\n`
  csv += `Supplier,Target MT,Achieved MT,Rate per MT,Expected,Received,Pending,Status\n`
  
  const pendingData = pendingAnnual
  
  if (pendingData.length === 0) {
    csv += `No earned annual discounts\n`
  } else {
    pendingData.forEach(pd => {
      csv += `${escapeCSV(pd.supplierName)},`
      csv += `${pd.targetMT},`
      csv += `${pd.achievedMT},`
      csv += `${pd.ratePerMT},`
      csv += `${pd.expectedAmount},`
      csv += `${pd.receivedAmount},`
      csv += `${pd.pendingAmount},`
      csv += `${pd.status}\n`
    })
  }
  
  csv += `\nRECEIVED ANNUAL DISCOUNTS\n`
  csv += `Supplier,Received Date,Notes,Amount,Status\n`
  
  const receivedData = receivedDiscounts
    .sort((a, b) => new Date(b.discountReceivedDate).getTime() - new Date(a.discountReceivedDate).getTime())
  
  if (receivedData.length === 0) {
    csv += `No received annual discounts\n`
  } else {
    receivedData.forEach(rd => {
      const supplier = supplierMap.get(rd.supplierId)
      csv += `${escapeCSV(supplier?.name || 'Unknown')},`
      csv += `${new Date(rd.discountReceivedDate).toLocaleDateString('en-IN')},`
      csv += `${escapeCSV(rd.notes || '-')},`
      csv += `${rd.amount},`
      csv += `${rd.status}\n`
    })
  }
  
  const filename = `Annual_Discount_${fy}_${new Date().toISOString().split('T')[0]}.csv`
  downloadCSV(csv, filename)
}

export function exportInventoryToExcel(
  inventoryData: Array<{
    itemId: string
    itemName: string
    totalPurchaseMT: number
    totalSalesMT: number
    balanceMT: number
    avgPurchaseRate: number
    currentStockValue: number
  }>,
  fy: string,
  businessName: string
) {
  const totals = inventoryData.reduce(
    (acc, item) => ({
      totalPurchaseMT: acc.totalPurchaseMT + item.totalPurchaseMT,
      totalSalesMT: acc.totalSalesMT + item.totalSalesMT,
      balanceMT: acc.balanceMT + item.balanceMT,
      totalStockValue: acc.totalStockValue + item.currentStockValue
    }),
    { totalPurchaseMT: 0, totalSalesMT: 0, balanceMT: 0, totalStockValue: 0 }
  )

  let csv = `${businessName}\n`
  csv += `Inventory Report\n`
  csv += `Financial Year: ${fy}\n`
  csv += `Generated: ${new Date().toLocaleString('en-IN')}\n`
  
  csv += `\nSUMMARY\n`
  csv += `Total Purchase,${formatMT(totals.totalPurchaseMT)}\n`
  csv += `Total Sales,${formatMT(totals.totalSalesMT)}\n`
  csv += `Closing Stock,${formatMT(totals.balanceMT)}\n`
  csv += `Stock Value,${formatCurrency(totals.totalStockValue)}\n`
  
  csv += `\nITEM-WISE INVENTORY\n`
  csv += `Item Name,Purchase (MT),Sales (MT),Balance (MT),Avg Rate,Stock Value\n`
  
  if (inventoryData.length === 0) {
    csv += `No inventory data\n`
  } else {
    inventoryData.forEach(item => {
      csv += `${escapeCSV(item.itemName)},`
      csv += `${item.totalPurchaseMT},`
      csv += `${item.totalSalesMT},`
      csv += `${item.balanceMT},`
      csv += `${item.avgPurchaseRate},`
      csv += `${item.currentStockValue}\n`
    })
  }
  
  csv += `\nTOTAL,${totals.totalPurchaseMT},${totals.totalSalesMT},${totals.balanceMT},,${totals.totalStockValue}\n`
  
  const filename = `Inventory_Report_${fy}_${new Date().toISOString().split('T')[0]}.csv`
  downloadCSV(csv, filename)
}

export function exportCDAtRiskToExcel(
  eligibleInvoices: Array<{
    invoiceId: string
    invoiceNo: string
    invoiceDate: string
    supplierName: string
    invoiceAmount: number
    paidAmount: number
    pendingAmount: number
    lastPaymentDate: string | null
    daysElapsed: number
    currentSlabDays: number
    currentCDRate: number
    nextSlabDays: number | null
    nextCDRate: number | null
    daysToNextSlab: number | null
    currentCDEarned: number
    potentialCDLoss: number
    status: string
  }>,
  ineligibleInvoices: Array<{
    invoiceId: string
    invoiceNo: string
    invoiceDate: string
    supplierName: string
    invoiceAmount: number
    paidAmount: number
    pendingAmount: number
    lastPaymentDate: string | null
    daysElapsed: number
    currentSlabDays: number
    currentCDRate: number
    status: string
  }>,
  fy: string,
  businessName: string
) {
  let csv = `${businessName}\n`
  csv += `CD at Risk Report\n`
  csv += `Financial Year: ${fy}\n`
  csv += `Generated: ${new Date().toLocaleString('en-IN')}\n`
  
  const totalAtRisk = eligibleInvoices.reduce((sum, inv) => sum + inv.potentialCDLoss, 0)
  const totalPending = eligibleInvoices.reduce((sum, inv) => sum + inv.pendingAmount, 0)
  
  csv += `\nSUMMARY\n`
  csv += `Total Invoices at Risk,${eligibleInvoices.length}\n`
  csv += `Total Pending Amount,${formatCurrency(totalPending)}\n`
  csv += `Total CD at Risk,${formatCurrency(totalAtRisk)}\n`
  
  csv += `\nELIGIBLE INVOICES - CD AT RISK\n`
  csv += `Invoice No,Supplier,Invoice Date,Invoice Amount,Pending Amount,Last Payment,Days Elapsed,Current Slab,Current CD%,Next Slab,Next CD%,Days to Next Slab,CD Earned,Potential Loss,Status\n`
  
  if (eligibleInvoices.length === 0) {
    csv += `No invoices at risk\n`
  } else {
    eligibleInvoices.forEach(inv => {
      csv += `${escapeCSV(inv.invoiceNo)},`
      csv += `${escapeCSV(inv.supplierName)},`
      csv += `${new Date(inv.invoiceDate).toLocaleDateString('en-IN')},`
      csv += `${inv.invoiceAmount},`
      csv += `${inv.pendingAmount},`
      csv += `${inv.lastPaymentDate ? new Date(inv.lastPaymentDate).toLocaleDateString('en-IN') : '-'},`
      csv += `${inv.daysElapsed},`
      csv += `${inv.currentSlabDays},`
      csv += `${inv.currentCDRate}%,`
      csv += `${inv.nextSlabDays || '-'},`
      csv += `${inv.nextCDRate !== null ? inv.nextCDRate + '%' : '-'},`
      csv += `${inv.daysToNextSlab !== null ? inv.daysToNextSlab : '-'},`
      csv += `${inv.currentCDEarned},`
      csv += `${inv.potentialCDLoss},`
      csv += `${inv.status}\n`
    })
  }
  
  csv += `\nINELIGIBLE INVOICES - NO CD APPLICABLE\n`
  csv += `Invoice No,Supplier,Invoice Date,Invoice Amount,Pending Amount,Last Payment,Days Elapsed,Status\n`
  
  if (ineligibleInvoices.length === 0) {
    csv += `No ineligible invoices\n`
  } else {
    ineligibleInvoices.forEach(inv => {
      csv += `${escapeCSV(inv.invoiceNo)},`
      csv += `${escapeCSV(inv.supplierName)},`
      csv += `${new Date(inv.invoiceDate).toLocaleDateString('en-IN')},`
      csv += `${inv.invoiceAmount},`
      csv += `${inv.pendingAmount},`
      csv += `${inv.lastPaymentDate ? new Date(inv.lastPaymentDate).toLocaleDateString('en-IN') : '-'},`
      csv += `${inv.daysElapsed},`
      csv += `${inv.status}\n`
    })
  }
  
  const filename = `CD_at_Risk_${fy}_${new Date().toISOString().split('T')[0]}.csv`
  downloadCSV(csv, filename)
}

export function exportSupplierLedgerToExcel(
  ledgerData: Array<{
    date: string
    particulars: string
    invoiceNo?: string
    debit: number
    credit: number
    balance: number
  }>,
  supplierName: string,
  openingBalance: number,
  closingBalance: number,
  fy: string,
  businessName: string
) {
  let csv = `${businessName}\n`
  csv += `Supplier Ledger\n`
  csv += `Supplier: ${supplierName}\n`
  csv += `Financial Year: ${fy}\n`
  csv += `Generated: ${new Date().toLocaleString('en-IN')}\n`
  
  csv += `\nOpening Balance,${formatCurrency(openingBalance)}\n`
  
  csv += `\nLEDGER ENTRIES\n`
  csv += `Date,Particulars,Invoice No,Debit,Credit,Balance\n`
  
  if (ledgerData.length === 0) {
    csv += `No transactions\n`
  } else {
    ledgerData.forEach(entry => {
      csv += `${new Date(entry.date).toLocaleDateString('en-IN')},`
      csv += `${escapeCSV(entry.particulars)},`
      csv += `${escapeCSV(entry.invoiceNo || '-')},`
      csv += `${entry.debit > 0 ? entry.debit : ''},`
      csv += `${entry.credit > 0 ? entry.credit : ''},`
      csv += `${entry.balance}\n`
    })
  }
  
  csv += `\nClosing Balance,${formatCurrency(closingBalance)}\n`
  
  const filename = `Supplier_Ledger_${supplierName.replace(/\s+/g, '_')}_${fy}_${new Date().toISOString().split('T')[0]}.csv`
  downloadCSV(csv, filename)
}

export function exportCustomerLedgerToExcel(
  ledgerData: Array<{
    date: string
    particulars: string
    invoiceNo?: string
    debit: number
    credit: number
    balance: number
  }>,
  customerName: string,
  openingBalance: number,
  closingBalance: number,
  fy: string,
  businessName: string
) {
  let csv = `${businessName}\n`
  csv += `Customer Ledger\n`
  csv += `Customer: ${customerName}\n`
  csv += `Financial Year: ${fy}\n`
  csv += `Generated: ${new Date().toLocaleString('en-IN')}\n`
  
  csv += `\nOpening Balance,${formatCurrency(openingBalance)}\n`
  
  csv += `\nLEDGER ENTRIES\n`
  csv += `Date,Particulars,Invoice No,Debit,Credit,Balance\n`
  
  if (ledgerData.length === 0) {
    csv += `No transactions\n`
  } else {
    ledgerData.forEach(entry => {
      csv += `${new Date(entry.date).toLocaleDateString('en-IN')},`
      csv += `${escapeCSV(entry.particulars)},`
      csv += `${escapeCSV(entry.invoiceNo || '-')},`
      csv += `${entry.debit > 0 ? entry.debit : ''},`
      csv += `${entry.credit > 0 ? entry.credit : ''},`
      csv += `${entry.balance}\n`
    })
  }
  
  csv += `\nClosing Balance,${formatCurrency(closingBalance)}\n`
  
  const filename = `Customer_Ledger_${customerName.replace(/\s+/g, '_')}_${fy}_${new Date().toISOString().split('T')[0]}.csv`
  downloadCSV(csv, filename)
}

export function exportInvoiceDetailsToExcel(
  invoiceDetails: {
    invoice: PurchaseInvoice
    supplier: Supplier | undefined
    items: Array<{
      itemName: string
      quantity: number
      rate: number
      amount: number
    }>
    paymentAllocations: Array<{
      paymentId: string
      paymentDate: string
      allocatedAmount: number
      daysFromInvoice: number
      cdRate: number
      cdAmount: number
    }>
    linkedExpenses: Array<{
      expenseId: string
      expenseDate: string
      expenseType: string
      amount: number
    }>
    itemCostBreakdown: Array<{
      itemName: string
      quantity: number
      basePrice: number
      fixedDiscount: number
      paymentCD: number
      invoiceCloseCD: number
      annualDiscount: number
      linkedExpenses: number
      finalCost: number
    }>
    totals: {
      totalQty: number
      totalAmount: number
      totalPaid: number
      totalPending: number
      totalCD: number
      totalExpenses: number
      avgCostPerMT: number
    }
  },
  fy: string,
  businessName: string
) {
  let csv = `${businessName}\n`
  csv += `Purchase Invoice Details\n`
  csv += `Financial Year: ${fy}\n`
  csv += `Generated: ${new Date().toLocaleString('en-IN')}\n`
  
  csv += `\nINVOICE INFORMATION\n`
  csv += `Invoice No,${escapeCSV(invoiceDetails.invoice.invoiceNo)}\n`
  csv += `Supplier,${escapeCSV(invoiceDetails.supplier?.name || 'Unknown')}\n`
  csv += `Invoice Date,${new Date(invoiceDetails.invoice.invoiceDate).toLocaleDateString('en-IN')}\n`
  csv += `Total Amount,${formatCurrency(invoiceDetails.invoice.invoiceAmount)}\n`
  
  csv += `\nITEMS\n`
  csv += `Item Name,Quantity (MT),Rate,Amount\n`
  invoiceDetails.items.forEach(item => {
    csv += `${escapeCSV(item.itemName)},${item.quantity},${item.rate},${item.amount}\n`
  })
  
  csv += `\nITEM-WISE COST BREAKDOWN\n`
  csv += `Item,Quantity (MT),Base Price/MT,Fixed Disc/MT,Payment CD/MT,Inv Close CD/MT,Annual Disc/MT,Expenses/MT,Final Cost/MT\n`
  invoiceDetails.itemCostBreakdown.forEach(item => {
    csv += `${escapeCSV(item.itemName)},${item.quantity},${item.basePrice},${item.fixedDiscount},${item.paymentCD},${item.invoiceCloseCD},${item.annualDiscount},${item.linkedExpenses},${item.finalCost}\n`
  })
  
  csv += `\nPAYMENT ALLOCATIONS\n`
  csv += `Payment Date,Amount Allocated,Days from Invoice,CD Rate %,CD Earned\n`
  invoiceDetails.paymentAllocations.forEach(payment => {
    csv += `${new Date(payment.paymentDate).toLocaleDateString('en-IN')},${payment.allocatedAmount},${payment.daysFromInvoice},${payment.cdRate}%,${payment.cdAmount}\n`
  })
  
  csv += `\nLINKED EXPENSES\n`
  csv += `Expense Date,Expense Type,Amount\n`
  invoiceDetails.linkedExpenses.forEach(expense => {
    csv += `${new Date(expense.expenseDate).toLocaleDateString('en-IN')},${escapeCSV(expense.expenseType)},${expense.amount}\n`
  })
  
  csv += `\nSUMMARY\n`
  csv += `Total Quantity (MT),${formatMT(invoiceDetails.totals.totalQty)}\n`
  csv += `Invoice Amount,${formatCurrency(invoiceDetails.totals.totalAmount)}\n`
  csv += `Total Paid,${formatCurrency(invoiceDetails.totals.totalPaid)}\n`
  csv += `Pending Amount,${formatCurrency(invoiceDetails.totals.totalPending)}\n`
  csv += `Total CD Earned,${formatCurrency(invoiceDetails.totals.totalCD)}\n`
  csv += `Total Expenses,${formatCurrency(invoiceDetails.totals.totalExpenses)}\n`
  csv += `Average Cost/MT,${formatCurrency(invoiceDetails.totals.avgCostPerMT)}\n`
  
  const filename = `Invoice_Details_${invoiceDetails.invoice.invoiceNo.replace(/\s+/g, '_')}_${fy}_${new Date().toISOString().split('T')[0]}.csv`
  downloadCSV(csv, filename)
}

export function exportPaymentDetailsToExcel(
  paymentDetails: {
    payment: Payment
    supplier: Supplier | undefined
    allocations: Array<{
      invoiceId: string
      invoiceNo: string
      invoiceDate: string
      allocatedAmount: number
      daysFromInvoice: number
      cdRate: number
      cdAmount: number
    }>
    totals: {
      totalAmount: number
      totalAllocated: number
      unallocatedAmount: number
      totalCDEarned: number
    }
  },
  fy: string,
  businessName: string
) {
  let csv = `${businessName}\n`
  csv += `Payment Details\n`
  csv += `Financial Year: ${fy}\n`
  csv += `Generated: ${new Date().toLocaleString('en-IN')}\n`
  
  csv += `\nPAYMENT INFORMATION\n`
  csv += `Supplier,${escapeCSV(paymentDetails.supplier?.name || 'Unknown')}\n`
  csv += `Payment Date,${new Date(paymentDetails.payment.paymentDate).toLocaleDateString('en-IN')}\n`
  csv += `Payment Amount,${formatCurrency(paymentDetails.payment.amount)}\n`
  
  csv += `\nINVOICE ALLOCATIONS\n`
  csv += `Invoice No,Invoice Date,Amount Allocated,Days from Invoice,CD Rate %,CD Earned\n`
  
  if (paymentDetails.allocations.length === 0) {
    csv += `No allocations (Advance payment)\n`
  } else {
    paymentDetails.allocations.forEach(alloc => {
      csv += `${escapeCSV(alloc.invoiceNo)},`
      csv += `${new Date(alloc.invoiceDate).toLocaleDateString('en-IN')},`
      csv += `${alloc.allocatedAmount},`
      csv += `${alloc.daysFromInvoice},`
      csv += `${alloc.cdRate}%,`
      csv += `${alloc.cdAmount}\n`
    })
  }
  
  csv += `\nSUMMARY\n`
  csv += `Payment Amount,${formatCurrency(paymentDetails.totals.totalAmount)}\n`
  csv += `Allocated to Invoices,${formatCurrency(paymentDetails.totals.totalAllocated)}\n`
  csv += `Unallocated (Advance),${formatCurrency(paymentDetails.totals.unallocatedAmount)}\n`
  csv += `Total CD Earned from this Payment,${formatCurrency(paymentDetails.totals.totalCDEarned)}\n`
  
  const filename = `Payment_Details_${paymentDetails.supplier?.name.replace(/\s+/g, '_')}_${new Date(paymentDetails.payment.paymentDate).toISOString().split('T')[0]}_${new Date().toISOString().split('T')[0]}.csv`
  downloadCSV(csv, filename)
}

export function exportGenericTableToCSV(data: any[], filename: string) {
  if (!data || data.length === 0) return
  const headers = Object.keys(data[0])
  let csv = headers.map(escapeCSV).join(',') + '\n'
  data.forEach(row => {
    csv += headers.map(h => escapeCSV(row[h])).join(',') + '\n'
  })
  downloadCSV(csv, filename.endsWith('.csv') ? filename : `${filename}.csv`)
}

export function exportCustomerAgingToExcel(
  aggregate: {
    customers: Array<{
      customerName: string
      gstin?: string
      phone?: string
      city?: string
      totalSales: number
      totalPayments: number
      totalOutstanding: number
      bracket0to30: number
      bracket31to60: number
      bracket61to90: number
      bracket90plus: number
      maxDaysOverdue: number
      performanceBadge: string
    }>
    totalOutstanding: number
    totalOverdue: number
    totalCritical90Plus: number
    bestPayerCount: number
    capitalBlockerCount: number
    heavyLifterCount: number
  },
  businessName: string,
  fy: string
) {
  let csv = `${escapeCSV(businessName)}\n`
  csv += `Customer Receivables & Aging Intelligence Report\n`
  csv += `Financial Year: ${escapeCSV(fy)}\n`
  csv += `Generated: ${new Date().toLocaleString('en-IN')}\n\n`

  csv += `SUMMARY METRICS\n`
  csv += `Total Outstanding Receivables,${aggregate.totalOutstanding}\n`
  csv += `Total Overdue (>30 Days),${aggregate.totalOverdue}\n`
  csv += `Critical Capital (>90 Days),${aggregate.totalCritical90Plus}\n`
  csv += `Best Payers,${aggregate.bestPayerCount}\n`
  csv += `Heavy Lifters,${aggregate.heavyLifterCount}\n`
  csv += `Capital Blockers,${aggregate.capitalBlockerCount}\n\n`

  csv += `CUSTOMER AGING BREAKDOWN\n`
  csv += `Customer Name,GSTIN,Phone,City,Total Sales,Total Payments,Total Outstanding,0-30 Days,31-60 Days,61-90 Days,90+ Days,Max Overdue (Days),Performance Badge\n`

  aggregate.customers.forEach((c) => {
    csv += `${escapeCSV(c.customerName)},`
    csv += `${escapeCSV(c.gstin || '-')},`
    csv += `${escapeCSV(c.phone || '-')},`
    csv += `${escapeCSV(c.city || '-')},`
    csv += `${c.totalSales},`
    csv += `${c.totalPayments},`
    csv += `${c.totalOutstanding},`
    csv += `${c.bracket0to30},`
    csv += `${c.bracket31to60},`
    csv += `${c.bracket61to90},`
    csv += `${c.bracket90plus},`
    csv += `${c.maxDaysOverdue},`
    csv += `${escapeCSV(c.performanceBadge)}\n`
  })

  downloadCSV(csv, `Customer_Aging_Report_${businessName.replace(/\s+/g, '_')}_${fy}.csv`)
}

