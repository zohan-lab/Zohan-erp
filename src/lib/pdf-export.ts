import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { 
  PendingDiscount, 
  ReceivedDiscount, 
  Supplier,
  PendingAnnualDiscount,
  PurchaseInvoice,
  SalesInvoice,
  Customer,
  Item,
  InvoiceItem
} from './types'
import { formatCurrency, formatMT } from './calculations'
import { getInvoiceQtyForUnit } from './unit-conversion-service'
import { amountToWords } from './number-to-words'


function formatAmountForPDF(amount: number): string {
  const formatted = amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `Rs.${formatted}`
}

interface PDFExportOptions {
  title: string
  fy: string
  generatedDate: string
  businessName?: string
  filters?: {
    supplier?: string
    category?: string
    month?: string
  }
}

export function exportDiscountWalletPDF(
  pendingDiscounts: PendingDiscount[],
  receivedDiscounts: ReceivedDiscount[],
  suppliers: Supplier[],
  options: PDFExportOptions
) {
  const doc = new jsPDF('landscape')
  const supplierMap = new Map(suppliers.map(s => [s.id, s]))
  
  const totalExpected = pendingDiscounts.reduce((sum, pd) => sum + pd.expectedAmount, 0)
  const totalReceived = receivedDiscounts.reduce((sum, rd) => sum + rd.amount, 0)
  const totalAllocated = receivedDiscounts.filter(rd => rd.status === 'Allocated').reduce((sum, rd) => sum + rd.amount, 0)
  const totalAdvance = receivedDiscounts.filter(rd => rd.status === 'Advance').reduce((sum, rd) => sum + rd.amount, 0)
  const totalPending = pendingDiscounts.reduce((sum, pd) => sum + pd.pendingAmount, 0)

  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('Steel Trading ERP', 14, 15)
  
  doc.setFontSize(14)
  doc.text(options.title, 14, 23)
  
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Financial Year: ${options.fy}`, 14, 30)
  doc.text(`Generated: ${options.generatedDate}`, 14, 35)
  
  let filterYPos = 40
  
  if (options.filters?.supplier && options.filters.supplier !== 'all') {
    const supplier = supplierMap.get(options.filters.supplier)
    doc.text(`Supplier: ${supplier?.name || 'Unknown'}`, 14, filterYPos)
    filterYPos += 5
  }
  
  if (options.filters?.category && options.filters.category !== 'all') {
    const categoryLabel = options.filters.category === 'paymentCD' ? 'Payment CD' : 
                         options.filters.category === 'invoiceCloseCD' ? 'Invoice Close CD' : 
                         'Fixed Scheme'
    doc.text(`Category: ${categoryLabel}`, 14, filterYPos)
    filterYPos += 5
  }
  
  if (options.filters?.month && options.filters.month !== 'All Months') {
    doc.text(`Month: ${options.filters.month}`, 14, filterYPos)
    filterYPos += 5
  }

  let yPos = filterYPos + 2

  doc.setFillColor(245, 245, 250)
  doc.rect(14, yPos, 268, 24, 'F')
  
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('SUMMARY', 16, yPos + 5)
  
  doc.setFontSize(10)
  doc.text('Expected:', 16, yPos + 11)
  doc.setFont('helvetica', 'normal')
  doc.text(`₹${totalExpected.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 16, yPos + 16)
  
  doc.setFont('helvetica', 'bold')
  doc.text('Received (Allocated):', 70, yPos + 11)
  doc.setFont('helvetica', 'normal')
  doc.text(`₹${totalAllocated.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 70, yPos + 16)
  
  doc.setFont('helvetica', 'bold')
  doc.text('Advance (Unallocated):', 135, yPos + 11)
  doc.setFont('helvetica', 'normal')
  doc.text(`₹${totalAdvance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 135, yPos + 16)
  
  doc.setFont('helvetica', 'bold')
  doc.text('Pending Balance:', 200, yPos + 11)
  doc.setFont('helvetica', 'normal')
  doc.text(`₹${totalPending.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 200, yPos + 16)

  yPos += 30

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Earned Discounts', 14, yPos)
  yPos += 2

  const pendingTableData = pendingDiscounts
    .sort((a, b) => new Date(a.earnedDate).getTime() - new Date(b.earnedDate).getTime())
    .map(pd => {
      const supplier = supplierMap.get(pd.supplierId)
      const typeLabel = pd.type === 'paymentCD' || pd.type === 'advanceCD' ? 'Payment CD' : 
                       pd.type === 'invoiceCloseCD' ? 'Invoice Close CD' : 
                       pd.type === 'annual' ? 'Annual Target' :
                       'Fixed Scheme'
      
      return [
        supplier?.name || 'Unknown',
        pd.invoiceNo || pd.schemeName || '-',
        typeLabel,
        new Date(pd.earnedDate).toLocaleDateString('en-IN'),
        formatAmountForPDF(pd.expectedAmount),
        formatAmountForPDF(pd.receivedAmount),
        formatAmountForPDF(pd.pendingAmount),
        pd.status
      ]
    })

  autoTable(doc, {
    startY: yPos,
    head: [['Supplier', 'Invoice/Scheme', 'Type', 'Earned Date', 'Expected', 'Received', 'Pending', 'Status']],
    body: pendingTableData.length > 0 ? pendingTableData : [['No earned discounts', '', '', '', '', '', '', '']],
    theme: 'grid',
    headStyles: { fillColor: [64, 44, 120], fontSize: 9, fontStyle: 'bold', halign: 'center' },
    bodyStyles: { fontSize: 8, valign: 'middle' },
    columnStyles: {
      0: { cellWidth: 50, halign: 'left' },
      1: { cellWidth: 35, halign: 'left' },
      2: { cellWidth: 32, halign: 'left' },
      3: { cellWidth: 28, halign: 'center' },
      4: { cellWidth: 35, halign: 'right', fontStyle: 'bold' },
      5: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
      6: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
      7: { cellWidth: 38, halign: 'center' }
    },
    margin: { left: 14, right: 14 },
  })

  const finalY = (doc as any).lastAutoTable.finalY + 10

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Received Discounts', 14, finalY)

  const receivedTableData = receivedDiscounts
    .sort((a, b) => new Date(b.discountReceivedDate).getTime() - new Date(a.discountReceivedDate).getTime())
    .map(rd => {
      const supplier = supplierMap.get(rd.supplierId)
      
      return [
        supplier?.name || 'Unknown',
        new Date(rd.discountReceivedDate).toLocaleDateString('en-IN'),
        rd.notes || '-',
        rd.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        rd.status
      ]
    })

  autoTable(doc, {
    startY: finalY + 2,
    head: [['Supplier', 'Received Date', 'Notes', 'Amount', 'Status']],
    body: receivedTableData.length > 0 ? receivedTableData : [['No received discounts', '', '', '', '']],
    theme: 'grid',
    headStyles: { fillColor: [64, 44, 120], fontSize: 9, fontStyle: 'bold', halign: 'center' },
    bodyStyles: { fontSize: 8, valign: 'middle' },
    columnStyles: {
      0: { cellWidth: 55, halign: 'left' },
      1: { cellWidth: 35, halign: 'center' },
      2: { cellWidth: 100, halign: 'left' },
      3: { cellWidth: 40, halign: 'right', fontStyle: 'bold' },
      4: { cellWidth: 32, halign: 'center' }
    },
    margin: { left: 14, right: 14 },
  })

  const fileName = `Discount_Wallet_${options.fy}_${new Date().toISOString().split('T')[0]}.pdf`
  doc.save(fileName)
}

export function exportAnnualDiscountPDF(
  pendingAnnual: PendingAnnualDiscount[],
  receivedDiscounts: ReceivedDiscount[],
  suppliers: Supplier[],
  options: PDFExportOptions
) {
  const doc = new jsPDF('landscape')
  const supplierMap = new Map(suppliers.map(s => [s.id, s]))
  
  const totalExpected = pendingAnnual.reduce((sum, pd) => sum + pd.expectedAmount, 0)
  const totalReceived = receivedDiscounts.reduce((sum, rd) => sum + rd.amount, 0)
  const totalAllocated = receivedDiscounts.filter(rd => rd.status === 'Allocated').reduce((sum, rd) => sum + rd.amount, 0)
  const totalAdvance = receivedDiscounts.filter(rd => rd.status === 'Advance').reduce((sum, rd) => sum + rd.amount, 0)
  const totalPending = pendingAnnual.reduce((sum, pd) => sum + pd.pendingAmount, 0)

  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text(options.businessName || 'Steel Trading ERP', 14, 15)
  
  doc.setFontSize(14)
  doc.text(options.title, 14, 23)
  
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Financial Year: ${options.fy}`, 14, 30)
  doc.text(`Generated: ${options.generatedDate}`, 14, 35)
  
  let filterYPos = 40
  
  if (options.filters?.supplier && options.filters.supplier !== 'all') {
    const supplier = supplierMap.get(options.filters.supplier)
    doc.text(`Supplier: ${supplier?.name || 'Unknown'}`, 14, filterYPos)
    filterYPos += 5
  }
  
  if (options.filters?.month && options.filters.month !== 'All Months') {
    doc.text(`Month: ${options.filters.month}`, 14, filterYPos)
    filterYPos += 5
  }

  const yPos = filterYPos + 2

  doc.setFillColor(245, 245, 250)
  doc.rect(14, yPos, 268, 24, 'F')
  
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('SUMMARY', 16, yPos + 5)
  
  doc.setFontSize(10)
  doc.text('Expected:', 16, yPos + 11)
  doc.setFont('helvetica', 'normal')
  doc.text(`Rs.${totalExpected.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 16, yPos + 16)
  
  doc.setFont('helvetica', 'bold')
  doc.text('Received (Allocated):', 70, yPos + 11)
  doc.setFont('helvetica', 'normal')
  doc.text(`Rs.${totalAllocated.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 70, yPos + 16)
  
  doc.setFont('helvetica', 'bold')
  doc.text('Advance (Unallocated):', 135, yPos + 11)
  doc.setFont('helvetica', 'normal')
  doc.text(`Rs.${totalAdvance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 135, yPos + 16)
  
  doc.setFont('helvetica', 'bold')
  doc.text('Pending Balance:', 200, yPos + 11)
  doc.setFont('helvetica', 'normal')
  doc.text(`Rs.${totalPending.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 200, yPos + 16)

  let tableYPos = yPos + 30

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Earned Annual Discounts', 14, tableYPos)
  tableYPos += 2

  const pendingTableData = pendingAnnual
    .map(pd => [
      pd.supplierName,
      `${pd.targetMT.toFixed(2)} MT`,
      `${pd.achievedMT.toFixed(2)} MT`,
      pd.ratePerMT.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','),
      pd.expectedAmount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','),
      pd.receivedAmount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','),
      pd.pendingAmount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','),
      pd.status
    ])

  autoTable(doc, {
    startY: tableYPos,
    head: [['Supplier', 'Target MT', 'Achieved MT', 'Rate per MT', 'Expected', 'Received', 'Pending', 'Status']],
    body: pendingTableData.length > 0 ? pendingTableData : [['No earned annual discounts', '', '', '', '', '', '', '']],
    theme: 'grid',
    headStyles: { fillColor: [64, 44, 120], fontSize: 9, fontStyle: 'bold', halign: 'center' },
    bodyStyles: { fontSize: 8, valign: 'middle' },
    columnStyles: {
      0: { cellWidth: 55, halign: 'left' },
      1: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
      2: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
      3: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
      4: { cellWidth: 35, halign: 'right', fontStyle: 'bold' },
      5: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
      6: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
      7: { cellWidth: 40, halign: 'center' }
    },
    margin: { left: 14, right: 14 },
  })

  const finalY = (doc as any).lastAutoTable.finalY + 10

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Received Annual Discounts', 14, finalY)

  const receivedTableData = receivedDiscounts
    .sort((a, b) => new Date(b.discountReceivedDate).getTime() - new Date(a.discountReceivedDate).getTime())
    .map(rd => {
      const supplier = supplierMap.get(rd.supplierId)
      
      return [
        supplier?.name || 'Unknown',
        new Date(rd.discountReceivedDate).toLocaleDateString('en-IN'),
        rd.notes || '-',
        rd.amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','),
        rd.status
      ]
    })

  autoTable(doc, {
    startY: finalY + 2,
    head: [['Supplier', 'Received Date', 'Notes', 'Amount', 'Status']],
    body: receivedTableData.length > 0 ? receivedTableData : [['No received annual discounts', '', '', '', '']],
    theme: 'grid',
    headStyles: { fillColor: [64, 44, 120], fontSize: 9, fontStyle: 'bold', halign: 'center' },
    bodyStyles: { fontSize: 8, valign: 'middle' },
    columnStyles: {
      0: { cellWidth: 55, halign: 'left' },
      1: { cellWidth: 35, halign: 'center' },
      2: { cellWidth: 100, halign: 'left' },
      3: { cellWidth: 40, halign: 'right', fontStyle: 'bold' },
      4: { cellWidth: 32, halign: 'center' }
    },
    margin: { left: 14, right: 14 },
  })

  const fileName = `Annual_Discount_${options.fy}_${new Date().toISOString().split('T')[0]}.pdf`
  doc.save(fileName)
}

export function exportPendingStatementPDF(
  type: 'wallet' | 'annual',
  pendingDiscounts: any[],
  suppliers: Supplier[],
  options: PDFExportOptions
) {
  const doc = new jsPDF('landscape')
  const supplierMap = new Map(suppliers.map(s => [s.id, s]))
  
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text(options.businessName || 'Steel Trading ERP', 14, 15)
  
  doc.setFontSize(14)
  doc.text(options.title, 14, 23)
  
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Financial Year: ${options.fy}`, 14, 30)
  doc.text(`Generated: ${options.generatedDate}`, 14, 35)
  
  let filterYPos = 42

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('FILTERS APPLIED:', 14, filterYPos)
  filterYPos += 5
  
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  
  if (options.filters?.supplier && options.filters.supplier !== 'all') {
    const supplier = supplierMap.get(options.filters.supplier)
    doc.text(`• Supplier: ${supplier?.name || 'Unknown'}`, 16, filterYPos)
    filterYPos += 5
  } else {
    doc.text(`• Supplier: All Suppliers`, 16, filterYPos)
    filterYPos += 5
  }
  
  if (options.filters?.category && options.filters.category !== 'All') {
    doc.text(`• Discount Type: ${options.filters.category}`, 16, filterYPos)
    filterYPos += 5
  } else {
    doc.text(`• Discount Type: All Types`, 16, filterYPos)
    filterYPos += 5
  }
  
  if (options.filters?.month && options.filters.month !== 'All Months') {
    doc.text(`• Month: ${options.filters.month}`, 16, filterYPos)
    filterYPos += 5
  } else {
    doc.text(`• Month: All Months`, 16, filterYPos)
    filterYPos += 5
  }

  const yPos = filterYPos + 2

  if (type === 'wallet') {
    const walletPending = pendingDiscounts
    const totalExpected = walletPending.reduce((sum: number, pd: any) => sum + pd.expectedAmount, 0)
    const totalReceived = walletPending.reduce((sum: number, pd: any) => sum + pd.receivedAmount, 0)
    const totalPending = walletPending.reduce((sum: number, pd: any) => sum + pd.pendingAmount, 0)

    const paymentCDExpected = walletPending.filter((pd: any) => pd.type === 'paymentCD').reduce((sum: number, pd: any) => sum + pd.expectedAmount, 0)
    const invoiceCloseCDExpected = walletPending.filter((pd: any) => pd.type === 'invoiceCloseCD').reduce((sum: number, pd: any) => sum + pd.expectedAmount, 0)
    const fixedSchemeExpected = walletPending.filter((pd: any) => pd.type === 'fixedScheme').reduce((sum: number, pd: any) => sum + pd.expectedAmount, 0)
    const annualExpected = walletPending.filter((pd: any) => pd.type === 'annual').reduce((sum: number, pd: any) => sum + pd.expectedAmount, 0)

    doc.setFillColor(240, 248, 255)
    doc.rect(14, yPos, 268, 18, 'F')
    
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('Expected:', 16, yPos + 6)
    doc.setFont('helvetica', 'normal')
    doc.text('Rs ' + totalExpected.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 16, yPos + 12)
    
    doc.setFont('helvetica', 'bold')
    doc.text('Received:', 85, yPos + 6)
    doc.setFont('helvetica', 'normal')
    doc.text('Rs ' + totalReceived.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 85, yPos + 12)
    
    doc.setFont('helvetica', 'bold')
    doc.text('Pending:', 155, yPos + 6)
    doc.setFont('helvetica', 'normal')
    doc.text('Rs ' + totalPending.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 155, yPos + 12)

    let breakdownYPos = yPos + 22

    if (paymentCDExpected > 0 || invoiceCloseCDExpected > 0 || fixedSchemeExpected > 0 || annualExpected > 0) {
      doc.setFillColor(250, 250, 252)
      doc.rect(14, breakdownYPos, 268, 20, 'F')
      
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.text('BREAKDOWN BY TYPE:', 16, breakdownYPos + 5)
      
      doc.setFontSize(7)
      let xPos = 16
      
      if (paymentCDExpected > 0) {
        doc.setFont('helvetica', 'bold')
        doc.text('Rs ' + paymentCDExpected.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), xPos, breakdownYPos + 10)
        xPos += 56
      }
      
      if (invoiceCloseCDExpected > 0) {
        doc.setFont('helvetica', 'bold')
        doc.text('Rs ' + invoiceCloseCDExpected.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), xPos, breakdownYPos + 10)
        xPos += 56
      }
      
      if (fixedSchemeExpected > 0) {
        doc.setFont('helvetica', 'bold')
        doc.text('Rs ' + fixedSchemeExpected.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), xPos, breakdownYPos + 10)
        xPos += 56
      }
      
      if (annualExpected > 0) {
        doc.setFont('helvetica', 'bold')
        doc.text('Rs ' + annualExpected.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), xPos, breakdownYPos + 10)
      }
      
      breakdownYPos += 24
    }

    const tableData = walletPending
      .sort((a: any, b: any) => new Date(a.earnedDate).getTime() - new Date(b.earnedDate).getTime())
      .map((pd: any) => {
        const supplier = supplierMap.get(pd.supplierId)
        
        return [
          supplier?.name || 'Unknown',
          pd.schemeName || '-',
          pd.invoiceCount ? `${pd.invoiceCount}` : '-',
          pd.expectedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          pd.receivedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          pd.pendingAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          pd.status || '-'
        ]
      })

    autoTable(doc, {
      startY: breakdownYPos,
      head: [['Supplier', 'Scheme Name', 'Invoices', 'Expected', 'Received', 'Pending', 'Status']],
      body: tableData.length > 0 ? tableData : [['No earned discounts', '', '', '', '', '', '']],
      theme: 'grid',
      headStyles: { fillColor: [64, 44, 120], fontSize: 9, fontStyle: 'bold', halign: 'center' },
      bodyStyles: { fontSize: 8, valign: 'middle' },
      columnStyles: {
        0: { cellWidth: 55, halign: 'left' },
        1: { cellWidth: 50, halign: 'left' },
        2: { cellWidth: 25, halign: 'center' },
        3: { cellWidth: 38, halign: 'right', fontStyle: 'bold' },
        4: { cellWidth: 38, halign: 'right', fontStyle: 'bold' },
        5: { cellWidth: 38, halign: 'right', fontStyle: 'bold', fillColor: [255, 250, 230] },
        6: { cellWidth: 38, halign: 'center' }
      },
      margin: { left: 14, right: 14 },
    })
  } else {
    const annualPending = pendingDiscounts
    const totalExpected = annualPending.reduce((sum: number, pd: any) => sum + pd.expectedAmount, 0)
    const totalReceived = annualPending.reduce((sum: number, pd: any) => sum + pd.receivedAmount, 0)
    const totalPending = annualPending.reduce((sum: number, pd: any) => sum + pd.pendingAmount, 0)

    doc.setFillColor(240, 248, 255)
    doc.rect(14, yPos, 268, 18, 'F')
    
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('Expected:', 16, yPos + 6)
    doc.setFont('helvetica', 'normal')
    doc.text('Rs ' + totalExpected.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 16, yPos + 12)
    
    doc.setFont('helvetica', 'bold')
    doc.text('Received:', 85, yPos + 6)
    doc.setFont('helvetica', 'normal')
    doc.text('Rs ' + totalReceived.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 85, yPos + 12)
    
    doc.setFont('helvetica', 'bold')
    doc.text('Pending:', 155, yPos + 6)
    doc.setFont('helvetica', 'normal')
    doc.text('Rs ' + totalPending.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 155, yPos + 12)

    const tableData = annualPending
      .map((pd: any) => [
        pd.supplierName,
        formatMT(pd.targetMT || 0),
        formatMT(pd.achievedMT || 0),
        (pd.ratePerMT || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        pd.expectedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        pd.receivedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        pd.pendingAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        pd.status || '-'
      ])

    autoTable(doc, {
      startY: yPos + 22,
      head: [['Supplier', 'Target MT', 'Achieved MT', 'Rate per MT', 'Expected', 'Received', 'Pending', 'Status']],
      body: tableData.length > 0 ? tableData : [['No earned annual discounts', '', '', '', '', '', '', '']],
      theme: 'grid',
      headStyles: { fillColor: [64, 44, 120], fontSize: 9, fontStyle: 'bold', halign: 'center' },
      bodyStyles: { fontSize: 8, valign: 'middle' },
      columnStyles: {
        0: { cellWidth: 50, halign: 'left' },
        1: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
        2: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
        3: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
        4: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
        5: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
        6: { cellWidth: 32, halign: 'right', fontStyle: 'bold', fillColor: [255, 250, 230] },
        7: { cellWidth: 34, halign: 'center' }
      },
      margin: { left: 14, right: 14 },
    })
  }

  const fileName = type === 'wallet' 
    ? `Earned_Discounts_${options.fy}_${new Date().toISOString().split('T')[0]}.pdf`
    : `Annual_Discounts_${options.fy}_${new Date().toISOString().split('T')[0]}.pdf`
  
  doc.save(fileName)
}

interface ItemPurchaseDetail {
  itemId: string
  itemName: string
  totalQuantity: number
  totalAmount: number
  avgRate: number
  invoiceCount: number
  supplierCount: number
  firstPurchaseDate: string
  lastPurchaseDate: string
}

interface ItemSalesDetail {
  itemId: string
  itemName: string
  totalQuantity: number
  totalAmount: number
  avgRate: number
  invoiceCount: number
  customerCount: number
  firstSaleDate: string
  lastSaleDate: string
}

interface ItemTransactionDetail {
  date: string
  type: 'purchase' | 'sale'
  invoiceNo: string
  partyName: string
  quantity: number
  rate: number
  amount: number
}

interface ItemReportOptions {
  type: 'purchase' | 'sale' | 'transactions'
  itemName: string
  details?: ItemPurchaseDetail[] | ItemSalesDetail[]
  transactions?: ItemTransactionDetail[]
  fy: string
  businessName?: string
}

export function exportItemReportToPDF(options: ItemReportOptions) {
  const doc = new jsPDF('landscape')
  
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text(options.businessName || 'Steel Trading ERP', 14, 15)
  
  doc.setFontSize(14)
  const title = options.type === 'purchase' ? 'Item-Wise Purchase Report' :
                options.type === 'sale' ? 'Item-Wise Sales Report' :
                'Item Transaction History'
  doc.text(title, 14, 23)
  
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Financial Year: ${options.fy}`, 14, 30)
  doc.text(`Item: ${options.itemName}`, 14, 35)
  doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, 14, 40)

  let yPos = 47

  if (options.type === 'purchase' && options.details) {
    const purchaseDetails = options.details as ItemPurchaseDetail[]
    const totalQty = purchaseDetails.reduce((sum, d) => sum + d.totalQuantity, 0)
    const totalAmt = purchaseDetails.reduce((sum, d) => sum + d.totalAmount, 0)

    doc.setFillColor(245, 245, 250)
    doc.rect(14, yPos, 268, 18, 'F')
    
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text('SUMMARY', 16, yPos + 5)
    
    doc.setFontSize(10)
    doc.text('Total Quantity:', 16, yPos + 11)
    doc.setFont('helvetica', 'normal')
    doc.text(formatMT(totalQty), 16, yPos + 15)
    
    doc.setFont('helvetica', 'bold')
    doc.text('Total Amount:', 70, yPos + 11)
    doc.setFont('helvetica', 'normal')
    doc.text(formatCurrency(totalAmt), 70, yPos + 15)
    
    doc.setFont('helvetica', 'bold')
    doc.text('Avg Rate:', 135, yPos + 11)
    doc.setFont('helvetica', 'normal')
    doc.text(totalQty > 0 ? formatCurrency(totalAmt / totalQty) + ' per MT' : '-', 135, yPos + 15)

    const tableData = purchaseDetails.map(d => [
      d.itemName,
      formatMT(d.totalQuantity),
      formatCurrency(d.totalAmount),
      formatCurrency(d.avgRate) + ' per MT',
      d.invoiceCount.toString(),
      d.supplierCount.toString(),
      new Date(d.firstPurchaseDate).toLocaleDateString('en-IN'),
      new Date(d.lastPurchaseDate).toLocaleDateString('en-IN')
    ])

    autoTable(doc, {
      startY: yPos + 22,
      head: [['Item', 'Quantity (MT)', 'Amount', 'Avg Rate', 'Invoices', 'Suppliers', 'First Purchase', 'Last Purchase']],
      body: tableData.length > 0 ? tableData : [['No purchase data', '', '', '', '', '', '', '']],
      theme: 'grid',
      headStyles: { fillColor: [64, 44, 120], fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        1: { halign: 'right', fontStyle: 'bold' },
        2: { halign: 'right', fontStyle: 'bold' },
        3: { halign: 'right', fontStyle: 'bold' },
        4: { halign: 'center' },
        5: { halign: 'center' },
      },
      margin: { left: 14, right: 14 },
    })
  } else if (options.type === 'sale' && options.details) {
    const salesDetails = options.details as ItemSalesDetail[]
    const totalQty = salesDetails.reduce((sum, d) => sum + d.totalQuantity, 0)
    const totalAmt = salesDetails.reduce((sum, d) => sum + d.totalAmount, 0)

    doc.setFillColor(245, 245, 250)
    doc.rect(14, yPos, 268, 18, 'F')
    
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text('SUMMARY', 16, yPos + 5)
    
    doc.setFontSize(10)
    doc.text('Total Quantity:', 16, yPos + 11)
    doc.setFont('helvetica', 'normal')
    doc.text(formatMT(totalQty), 16, yPos + 15)
    
    doc.setFont('helvetica', 'bold')
    doc.text('Total Amount:', 70, yPos + 11)
    doc.setFont('helvetica', 'normal')
    doc.text(formatCurrency(totalAmt), 70, yPos + 15)
    
    doc.setFont('helvetica', 'bold')
    doc.text('Avg Rate:', 135, yPos + 11)
    doc.setFont('helvetica', 'normal')
    doc.text(totalQty > 0 ? formatCurrency(totalAmt / totalQty) + ' per MT' : '-', 135, yPos + 15)

    const tableData = salesDetails.map(d => [
      d.itemName,
      formatMT(d.totalQuantity),
      formatCurrency(d.totalAmount),
      formatCurrency(d.avgRate) + ' per MT',
      d.invoiceCount.toString(),
      d.customerCount.toString(),
      new Date(d.firstSaleDate).toLocaleDateString('en-IN'),
      new Date(d.lastSaleDate).toLocaleDateString('en-IN')
    ])

    autoTable(doc, {
      startY: yPos + 22,
      head: [['Item', 'Quantity (MT)', 'Amount', 'Avg Rate', 'Invoices', 'Customers', 'First Sale', 'Last Sale']],
      body: tableData.length > 0 ? tableData : [['No sales data', '', '', '', '', '', '', '']],
      theme: 'grid',
      headStyles: { fillColor: [64, 44, 120], fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        1: { halign: 'right', fontStyle: 'bold' },
        2: { halign: 'right', fontStyle: 'bold' },
        3: { halign: 'right', fontStyle: 'bold' },
        4: { halign: 'center' },
        5: { halign: 'center' },
      },
      margin: { left: 14, right: 14 },
    })
  } else if (options.type === 'transactions' && options.transactions) {
    const transactions = options.transactions
    const totalQty = transactions.reduce((sum, t) => sum + t.quantity, 0)
    const totalAmt = transactions.reduce((sum, t) => sum + t.amount, 0)
    const purchaseQty = transactions.filter(t => t.type === 'purchase').reduce((sum, t) => sum + t.quantity, 0)
    const saleQty = transactions.filter(t => t.type === 'sale').reduce((sum, t) => sum + t.quantity, 0)

    doc.setFillColor(245, 245, 250)
    doc.rect(14, yPos, 268, 18, 'F')
    
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text('SUMMARY', 16, yPos + 5)
    
    doc.setFontSize(10)
    doc.text('Purchase Qty:', 16, yPos + 11)
    doc.setFont('helvetica', 'normal')
    doc.text(formatMT(purchaseQty), 16, yPos + 15)
    
    doc.setFont('helvetica', 'bold')
    doc.text('Sale Qty:', 70, yPos + 11)
    doc.setFont('helvetica', 'normal')
    doc.text(formatMT(saleQty), 70, yPos + 15)
    
    doc.setFont('helvetica', 'bold')
    doc.text('Total Transactions:', 135, yPos + 11)
    doc.setFont('helvetica', 'normal')
    doc.text(transactions.length.toString(), 135, yPos + 15)

    const tableData = transactions.map(t => [
      new Date(t.date).toLocaleDateString('en-IN'),
      t.type === 'purchase' ? 'Purchase' : 'Sale',
      t.invoiceNo,
      t.partyName,
      formatMT(t.quantity),
      formatCurrency(t.rate) + ' per MT',
      formatCurrency(t.amount)
    ])

    autoTable(doc, {
      startY: yPos + 22,
      head: [['Date', 'Type', 'Invoice No', 'Party', 'Quantity (MT)', 'Rate', 'Amount']],
      body: tableData.length > 0 ? tableData : [['No transactions', '', '', '', '', '', '']],
      theme: 'grid',
      headStyles: { fillColor: [64, 44, 120], fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        4: { halign: 'right', fontStyle: 'bold' },
        5: { halign: 'right', fontStyle: 'bold' },
        6: { halign: 'right', fontStyle: 'bold' },
      },
      margin: { left: 14, right: 14 },
    })
  }

  const fileName = options.type === 'purchase' 
    ? `Item_Purchase_Report_${options.itemName.replace(/\s+/g, '_')}_${options.fy}_${new Date().toISOString().split('T')[0]}.pdf`
    : options.type === 'sale'
    ? `Item_Sales_Report_${options.itemName.replace(/\s+/g, '_')}_${options.fy}_${new Date().toISOString().split('T')[0]}.pdf`
    : `Item_Transactions_${options.itemName.replace(/\s+/g, '_')}_${options.fy}_${new Date().toISOString().split('T')[0]}.pdf`
  
  doc.save(fileName)
}

export interface SupplierLedgerEntry {
  date: string
  description: string
  invoiceNo?: string
  debit: number
  credit: number
  balance: number
  type: 'invoice' | 'payment'
  refId: string
}

export interface SupplierLedgerExportOptions {
  supplierName: string
  fy: string
  businessName?: string
  totalDebit: number
  totalCredit: number
  closingBalance: number
  openingBalance: number
}

export function exportSupplierLedgerPDF(
  entries: SupplierLedgerEntry[],
  options: SupplierLedgerExportOptions
) {
  const doc = new jsPDF('landscape')
  
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text(options.businessName || 'Steel Trading ERP', 14, 15)
  
  doc.setFontSize(14)
  doc.text('Supplier Ledger Report', 14, 23)
  
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Financial Year: ${options.fy}`, 14, 30)
  doc.text(`Supplier: ${options.supplierName}`, 14, 35)
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 14, 40)

  let yPos = 47

  doc.setFillColor(245, 245, 250)
  doc.rect(14, yPos, 268, 18, 'F')
  
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('SUMMARY', 16, yPos + 5)
  
  doc.setFontSize(10)
  doc.text('Total Debit:', 16, yPos + 11)
  doc.setFont('helvetica', 'normal')
  doc.text(`Rs ${options.totalDebit.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`, 16, yPos + 15)
  
  doc.setFont('helvetica', 'bold')
  doc.text('Total Credit:', 80, yPos + 11)
  doc.setFont('helvetica', 'normal')
  doc.text(`Rs ${options.totalCredit.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`, 80, yPos + 15)
  
  doc.setFont('helvetica', 'bold')
  doc.text('Outstanding Balance:', 155, yPos + 11)
  doc.setFont('helvetica', 'normal')
  const balanceText = options.closingBalance > 0 
    ? `Rs ${Math.abs(options.closingBalance).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} Cr` 
    : options.closingBalance < 0 
    ? `Rs ${Math.abs(options.closingBalance).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} Dr`
    : 'Rs 0.00'
  doc.text(balanceText, 155, yPos + 15)

  yPos += 22

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Ledger Entries', 14, yPos)
  yPos += 2

  const tableData = entries.map(entry => {
    const balance = Math.abs(entry.balance)
    const balanceStr = entry.balance > 0 
      ? `${balance.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} Cr` 
      : entry.balance < 0 
      ? `${balance.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} Dr`
      : '0.00'
    
    return [
      new Date(entry.date).toLocaleDateString('en-IN'),
      entry.description,
      entry.invoiceNo || '-',
      entry.debit > 0 ? entry.debit.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '-',
      entry.credit > 0 ? entry.credit.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '-',
      balanceStr
    ]
  })

  const totalRow = [
    { content: 'TOTAL', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold' } },
    options.totalDebit.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','),
    options.totalCredit.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','),
    balanceText.replace('Rs ', '')
  ]

  autoTable(doc, {
    startY: yPos,
    head: [['Date', 'Description', 'Invoice No', 'Debit (Rs)', 'Credit (Rs)', 'Balance (Rs)']],
    body: tableData.length > 0 ? [...tableData, totalRow as any] : [['No transactions', '', '', '', '', '']],
    theme: 'grid',
    headStyles: { fillColor: [64, 44, 120], fontSize: 9, fontStyle: 'bold', halign: 'center' },
    bodyStyles: { fontSize: 8, valign: 'middle' },
    columnStyles: {
      0: { cellWidth: 30, halign: 'center' },
      1: { cellWidth: 60, halign: 'left' },
      2: { cellWidth: 40, halign: 'center' },
      3: { cellWidth: 40, halign: 'right', fontStyle: 'bold' },
      4: { cellWidth: 40, halign: 'right', fontStyle: 'bold' },
      5: { cellWidth: 52, halign: 'right', fontStyle: 'bold' }
    },
    margin: { left: 14, right: 14 },
  })

  const fileName = `Supplier_Ledger_${options.supplierName.replace(/\s+/g, '_')}_${options.fy}_${new Date().toISOString().split('T')[0]}.pdf`
  doc.save(fileName)
}

interface StyledInvoiceOptions {
  invoiceNo: string
  invoiceDate: string
  partyLabel: string
  partyName: string
  partyAddress?: string
  partyPhone?: string
  businessName: string
  state?: string
  phone?: string
  items?: InvoiceItem[]
  itemMap: Map<string, Item>
  totalQuantity?: number
  invoiceAmount: number
  additionalCost?: number
  additionalCostRemarks?: string
  roundOffAdjustment: number
  paidAmount?: number
  paymentCounterName?: string
  filePrefix: string
  footerLabel?: string
  advancePayment?: {
    paymentDate: string
    paymentAmount: number
    bookingMT?: number
    allocatedAmount: number
    remainingAdvanceAmount: number
    sourceLabel?: string
  }
}

function drawInvoiceTextBlock(doc: jsPDF, label: string, value: string, x: number, y: number, maxWidth = 48) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(45, 45, 45)
  doc.text(label.toUpperCase(), x, y)
  doc.setDrawColor(45, 45, 45)
  doc.setLineWidth(0.25)
  doc.line(x, y + 3, x + 5, y + 3)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(55, 55, 55)
  doc.text(value || '-', x, y + 13, { maxWidth })
}


function exportStyledInvoicePDF(options: StyledInvoiceOptions) {
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10; // Tally usually has smaller margins
  const contentWidth = pageWidth - margin * 2;
  const invoiceDate = options.invoiceDate
    ? new Date(options.invoiceDate).toLocaleDateString('en-IN')
    : '-';
  const amountDue = Math.max(0, options.invoiceAmount - (options.paidAmount || options.advancePayment?.allocatedAmount || 0));

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('INVOICE', pageWidth / 2, margin + 5, { align: 'center' });

  // Outer Border
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  const startY = margin + 10;
  // Let's draw the top block
  // Top left: Company
  doc.rect(margin, startY, contentWidth / 2, 35);
  // Top right: Invoice Info
  doc.rect(margin + contentWidth / 2, startY, contentWidth / 2, 35);

  // Buyer Info (Left)
  doc.rect(margin, startY + 35, contentWidth / 2, 30);
  // Dispatch Info (Right)
  doc.rect(margin + contentWidth / 2, startY + 35, contentWidth / 2, 30);

  // Fill Company Info
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(options.businessName.toUpperCase(), margin + 2, startY + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(options.state || '', margin + 2, startY + 9);
  if (options.phone) doc.text(`Phone: ${options.phone}`, margin + 2, startY + 13);
  doc.text('GSTIN/UIN: -', margin + 2, startY + 17);
  doc.text('State Name: -, Code: -', margin + 2, startY + 21);
  doc.text('E-Mail: -', margin + 2, startY + 25);

  // Fill Invoice Info (Right side)
  doc.setFont('helvetica', 'normal');
  const rightX = margin + contentWidth / 2 + 2;
  const col2X = margin + contentWidth * 0.75 + 2;
  
  doc.text('Invoice No.', rightX, startY + 5);
  doc.setFont('helvetica', 'bold');
  doc.text(options.invoiceNo, rightX, startY + 9);
  
  doc.setFont('helvetica', 'normal');
  doc.text('Dated', col2X, startY + 5);
  doc.setFont('helvetica', 'bold');
  doc.text(invoiceDate, col2X, startY + 9);

  // Grid lines inside Top Right
  doc.line(margin + contentWidth / 2, startY + 12, pageWidth - margin, startY + 12);
  doc.line(margin + contentWidth * 0.75, startY, margin + contentWidth * 0.75, startY + 35);

  doc.setFont('helvetica', 'normal');
  doc.text('Delivery Note', rightX, startY + 16);
  doc.text('Mode/Terms of Payment', col2X, startY + 16);
  
  doc.line(margin + contentWidth / 2, startY + 23, pageWidth - margin, startY + 23);
  doc.text('Reference No. & Date.', rightX, startY + 27);
  doc.text('Other References', col2X, startY + 27);

  // Buyer Info
  doc.setFontSize(8);
  doc.text('Buyer (Bill to)', margin + 2, startY + 35 + 4);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(options.partyName.toUpperCase(), margin + 2, startY + 35 + 9);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  if (options.partyAddress) {
    const splitAddr = doc.splitTextToSize(options.partyAddress, (contentWidth / 2) - 4);
    doc.text(splitAddr, margin + 2, startY + 35 + 13);
  }
  if (options.partyPhone) doc.text(`Phone: ${options.partyPhone}`, margin + 2, startY + 35 + 23);
  doc.text('GSTIN/UIN: -', margin + 2, startY + 35 + 27);

  // Dispatch Info (Right)
  doc.line(margin + contentWidth / 2, startY + 35 + 10, pageWidth - margin, startY + 35 + 10);
  doc.line(margin + contentWidth / 2, startY + 35 + 20, pageWidth - margin, startY + 35 + 20);

  doc.text('Dispatch Doc No.', rightX, startY + 35 + 4);
  doc.text('Delivery Note Date', col2X, startY + 35 + 4);
  
  doc.text('Dispatched through', rightX, startY + 35 + 14);
  doc.text('Destination', col2X, startY + 35 + 14);

  doc.text('Terms of Delivery', rightX, startY + 35 + 24);

  const tableStartY = startY + 65;
  const items = options.items || [];
  const rows = items.map((line, index) => {
    const item = options.itemMap.get(line.itemId);
    const unit = line.enteredUnit || item?.unit || 'KG';
    const qty = line.enteredQuantity || line.baseQuantity || 0;
    const rate = line.rate || (qty > 0 ? line.amount / qty : 0);
    return [
      (index + 1).toString(),
      line.itemNameSnapshot || item?.name || 'Unknown item',
      '-', // HSN/SAC
      qty.toLocaleString('en-IN', { maximumFractionDigits: 3 }),
      rate.toFixed(2), // Rate
      unit,
      line.amount.toFixed(2)
    ];
  });
  
  // Empty rows to stretch table to bottom
  while(rows.length < 10) {
    rows.push(['', '', '', '', '', '', '']);
  }

  autoTable(doc, {
    startY: tableStartY,
    head: [['Sl\\nNo.', 'Description of Goods', 'HSN/SAC', 'Quantity', 'Rate', 'per', 'Amount']],
    body: rows,
    theme: 'grid',
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.3,
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 8
    },
    bodyStyles: {
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.3,
      fontSize: 8,
      minCellHeight: 8
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 60, halign: 'left' },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 25, halign: 'right' },
      4: { cellWidth: 25, halign: 'right' },
      5: { cellWidth: 15, halign: 'center' },
      6: { cellWidth: 35, halign: 'right', fontStyle: 'bold' }
    },
    margin: { left: margin, right: margin }
  });

  const finalY = (doc as any).lastAutoTable.finalY;

  // Add additional rows for Subtotal, Discount, Additional Cost, Round Off
  let currentY = finalY;
  const rightColX = pageWidth - margin - 35; // Matches amount column
  
  if (options.additionalCost && options.additionalCost > 0) {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(margin, currentY, contentWidth, 8);
    doc.line(pageWidth - margin - 35, currentY, pageWidth - margin - 35, currentY + 8);
    
    doc.setFont('helvetica', 'bold');
    const costLabel = options.additionalCostRemarks 
      ? `Additional Cost (${options.additionalCostRemarks})` 
      : 'Additional Cost';
    doc.text(costLabel, pageWidth - margin - 40, currentY + 5, { align: 'right' });
    doc.text(options.additionalCost.toFixed(2), pageWidth - margin - 2, currentY + 5, { align: 'right' });
    
    currentY += 8;
  }

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.rect(margin, currentY, contentWidth, 8);
  doc.line(pageWidth - margin - 35, currentY, pageWidth - margin - 35, currentY + 8);
  
  doc.setFont('helvetica', 'bold');
  doc.text('Total', pageWidth - margin - 40, currentY + 5, { align: 'right' });
  doc.text(options.invoiceAmount.toFixed(2), pageWidth - margin - 2, currentY + 5, { align: 'right' });
  
  currentY += 8;

  if (options.paidAmount) {
    doc.rect(margin, currentY, contentWidth, 8);
    doc.line(pageWidth - margin - 35, currentY, pageWidth - margin - 35, currentY + 8);
    
    doc.setFont('helvetica', 'bold');
    const label = options.paymentCounterName 
      ? `Cash In (${options.paymentCounterName})` 
      : 'Amount Received / Paid';
    doc.text(label, pageWidth - margin - 40, currentY + 5, { align: 'right' });
    doc.text(options.paidAmount.toFixed(2), pageWidth - margin - 2, currentY + 5, { align: 'right' });
    
    currentY += 8;
    
    doc.rect(margin, currentY, contentWidth, 8);
    doc.line(pageWidth - margin - 35, currentY, pageWidth - margin - 35, currentY + 8);
    
    doc.text('Balance Due', pageWidth - margin - 40, currentY + 5, { align: 'right' });
    doc.text(amountDue.toFixed(2), pageWidth - margin - 2, currentY + 5, { align: 'right' });
    
    currentY += 8;
  } else if (options.advancePayment) {
    doc.rect(margin, currentY, contentWidth, 8);
    doc.line(pageWidth - margin - 35, currentY, pageWidth - margin - 35, currentY + 8);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Advance Applied', pageWidth - margin - 40, currentY + 5, { align: 'right' });
    doc.text(options.advancePayment.allocatedAmount.toFixed(2), pageWidth - margin - 2, currentY + 5, { align: 'right' });
    
    currentY += 8;
    
    doc.rect(margin, currentY, contentWidth, 8);
    doc.line(pageWidth - margin - 35, currentY, pageWidth - margin - 35, currentY + 8);
    
    doc.text('Balance Due', pageWidth - margin - 40, currentY + 5, { align: 'right' });
    doc.text(amountDue.toFixed(2), pageWidth - margin - 2, currentY + 5, { align: 'right' });
    
    currentY += 8;
  }

  // Amount in words
  doc.rect(margin, currentY, contentWidth, 15);
  doc.setFont('helvetica', 'normal');
  doc.text('Amount Chargeable (in words)', margin + 2, currentY + 4);
  doc.setFont('helvetica', 'bold');
  
  // Use amountToWords
  doc.text(amountToWords(options.invoiceAmount), margin + 2, currentY + 10);
  
  currentY += 15;

  // Footer / Declaration
  const footerHeight = 35;
  doc.rect(margin, currentY, contentWidth, footerHeight);
  doc.line(margin + contentWidth / 2, currentY, margin + contentWidth / 2, currentY + footerHeight);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Declaration', margin + 2, currentY + 4);
  doc.text('We declare that this invoice shows the actual price of the', margin + 2, currentY + 8);
  doc.text('goods described and that all particulars are true and correct.', margin + 2, currentY + 11);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(`for ${options.businessName.toUpperCase()}`, pageWidth - margin - 2, currentY + 5, { align: 'right' });
  
  doc.setFont('helvetica', 'normal');
  doc.text('Authorised Signatory', pageWidth - margin - 2, currentY + footerHeight - 3, { align: 'right' });

  const safeInvoiceNo = options.invoiceNo.replace(/[^a-z0-9_-]+/gi, '_');
  doc.save(`${options.filePrefix}_${safeInvoiceNo}.pdf`);
}
export function exportPurchaseInvoicePDF(
  invoice: PurchaseInvoice,
  supplier: Supplier | undefined,
  itemMap: Map<string, Item>,
  options: {
    businessName: string
    state?: string
    phone?: string
    paidAmount?: number
    paymentCounterName?: string
    advancePayment?: {
      paymentDate: string
      paymentAmount: number
      bookingMT?: number
      allocatedAmount: number
      remainingAdvanceAmount: number
      sourceLabel?: string
    }
  }
) {
  exportStyledInvoicePDF({
    invoiceNo: invoice.invoiceNo,
    invoiceDate: invoice.invoiceDate,
    partyLabel: 'Bill From',
    partyName: supplier?.name || 'Unknown Supplier',
    partyAddress: supplier?.address,
    partyPhone: supplier?.phone,
    businessName: options.businessName || 'SK TRADERS',
    state: options.state,
    phone: options.phone,
    items: invoice.items,
    itemMap,
    totalQuantity: getInvoiceQtyForUnit(invoice, 'MT', itemMap),
    invoiceAmount: invoice.invoiceAmount,
    additionalCost: invoice.additionalCost,
    additionalCostRemarks: invoice.additionalCostRemarks,
    roundOffAdjustment: invoice.roundOffAdjustment || 0,
    paidAmount: options.paidAmount,
    paymentCounterName: options.paymentCounterName,
    filePrefix: 'Purchase_Invoice',
    advancePayment: options.advancePayment
  })
}

export function exportSalesInvoicePDF(
  invoice: SalesInvoice,
  customer: Customer | undefined,
  itemMap: Map<string, Item>,
  options: {
    businessName: string
    state?: string
    phone?: string
    paidAmount?: number
    paymentCounterName?: string
  }
) {
  exportStyledInvoicePDF({
    invoiceNo: invoice.invoiceNo,
    invoiceDate: invoice.invoiceDate,
    partyLabel: 'Bill To',
    partyName: customer?.name || 'Unknown Customer',
    partyAddress: customer?.address,
    partyPhone: customer?.phone,
    businessName: options.businessName || 'SK TRADERS',
    state: options.state,
    phone: options.phone,
    items: invoice.items,
    itemMap,
    totalQuantity: getInvoiceQtyForUnit(invoice, 'MT', itemMap),
    invoiceAmount: invoice.invoiceAmount,
    additionalCost: invoice.additionalCost,
    additionalCostRemarks: invoice.additionalCostRemarks,
    roundOffAdjustment: invoice.roundOffAdjustment || 0,
    paidAmount: options.paidAmount,
    paymentCounterName: options.paymentCounterName,
    filePrefix: 'Sales_Invoice'
  })
}

export function exportCustomerAgingToPDF(
  aggregate: {
    customers: Array<{
      customerName: string
      city?: string
      totalSales: number
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
  options: { title: string; fy: string; generatedDate: string; businessName?: string }
) {
  const doc = new jsPDF('landscape')
  const businessName = options.businessName || 'Sahil ERP'

  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text(businessName, 14, 15)

  doc.setFontSize(14)
  doc.text(options.title || 'Customer Receivables & Aging Intelligence Report', 14, 23)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Financial Year: ${options.fy}`, 14, 30)
  doc.text(`Generated: ${options.generatedDate}`, 14, 35)

  const yPos = 42
  doc.setFillColor(245, 245, 250)
  doc.rect(14, yPos, 268, 20, 'F')

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('SUMMARY KPI DASHBOARD', 16, yPos + 5)

  doc.setFontSize(9)
  doc.text(`Total Outstanding: Rs.${aggregate.totalOutstanding.toLocaleString('en-IN')}`, 16, yPos + 12)
  doc.text(`Total Overdue (>30d): Rs.${aggregate.totalOverdue.toLocaleString('en-IN')}`, 90, yPos + 12)
  doc.text(`Critical (>90d): Rs.${aggregate.totalCritical90Plus.toLocaleString('en-IN')}`, 170, yPos + 12)
  doc.text(`Best Payers: ${aggregate.bestPayerCount}  |  Heavy Lifters: ${aggregate.heavyLifterCount}  |  Capital Blockers: ${aggregate.capitalBlockerCount}`, 16, yPos + 17)

  const tableData = aggregate.customers.map((c) => [
    c.customerName,
    c.city || '-',
    `Rs.${c.totalSales.toLocaleString('en-IN')}`,
    `Rs.${c.totalOutstanding.toLocaleString('en-IN')}`,
    `Rs.${c.bracket0to30.toLocaleString('en-IN')}`,
    `Rs.${c.bracket31to60.toLocaleString('en-IN')}`,
    `Rs.${c.bracket61to90.toLocaleString('en-IN')}`,
    `Rs.${c.bracket90plus.toLocaleString('en-IN')}`,
    `${c.maxDaysOverdue} days`,
    c.performanceBadge
  ])

  autoTable(doc, {
    startY: yPos + 24,
    head: [[
      'Customer',
      'City',
      'Total Sales',
      'Outstanding',
      '0-30 Days',
      '31-60 Days',
      '61-90 Days',
      '90+ Days',
      'Max Overdue',
      'Badge'
    ]],
    body: tableData,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [40, 50, 70], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 250, 252] }
  })

  doc.save(`Customer_Aging_Report_${businessName.replace(/\s+/g, '_')}_${options.fy}.pdf`)
}

export interface CustomerLedgerEntry {
  date: string
  description: string
  invoiceNo?: string
  debit: number
  credit: number
  balance: number
  type: 'invoice' | 'payment'
  refId: string
}

export interface CustomerLedgerExportOptions {
  customerName: string
  fy: string
  businessName?: string
  totalDebit: number
  totalCredit: number
  closingBalance: number
  openingBalance: number
}

export function exportCustomerLedgerPDF(
  entries: CustomerLedgerEntry[],
  options: CustomerLedgerExportOptions
) {
  const doc = new jsPDF('landscape')
  
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text(options.businessName || 'Steel Trading ERP', 14, 15)
  
  doc.setFontSize(14)
  doc.text('Customer Ledger Report', 14, 23)
  
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Financial Year: ${options.fy}`, 14, 30)
  doc.text(`Customer: ${options.customerName}`, 14, 35)
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 14, 40)

  let yPos = 47

  doc.setFillColor(245, 245, 250)
  doc.rect(14, yPos, 268, 18, 'F')
  
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('SUMMARY', 16, yPos + 5)
  
  doc.setFontSize(10)
  doc.text('Total Debit:', 16, yPos + 11)
  doc.setFont('helvetica', 'normal')
  doc.text(`Rs ${options.totalDebit.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`, 16, yPos + 15)
  
  doc.setFont('helvetica', 'bold')
  doc.text('Total Credit:', 80, yPos + 11)
  doc.setFont('helvetica', 'normal')
  doc.text(`Rs ${options.totalCredit.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`, 80, yPos + 15)
  
  doc.setFont('helvetica', 'bold')
  doc.text('Outstanding Balance:', 155, yPos + 11)
  doc.setFont('helvetica', 'normal')
  const balanceText = options.closingBalance > 0 
    ? `Rs ${Math.abs(options.closingBalance).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} Dr` 
    : options.closingBalance < 0 
    ? `Rs ${Math.abs(options.closingBalance).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} Cr`
    : 'Rs 0.00'
  doc.text(balanceText, 155, yPos + 15)

  yPos += 22

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Ledger Entries', 14, yPos)
  yPos += 2

  const tableData = entries.map(entry => {
    const balance = Math.abs(entry.balance)
    const balanceStr = entry.balance > 0 
      ? `${balance.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} Dr` 
      : entry.balance < 0 
      ? `${balance.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} Cr`
      : '0.00'
    
    return [
      new Date(entry.date).toLocaleDateString('en-IN'),
      entry.description,
      entry.invoiceNo || '-',
      entry.debit > 0 ? entry.debit.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '-',
      entry.credit > 0 ? entry.credit.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '-',
      balanceStr
    ]
  })

  const totalRow = [
    { content: 'TOTAL', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold' } },
    options.totalDebit.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','),
    options.totalCredit.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','),
    balanceText.replace('Rs ', '')
  ]

  autoTable(doc, {
    startY: yPos,
    head: [['Date', 'Description', 'Invoice No', 'Debit (Rs)', 'Credit (Rs)', 'Balance (Rs)']],
    body: tableData.length > 0 ? [...tableData, totalRow as any] : [['No transactions', '', '', '', '', '']],
    theme: 'grid',
    headStyles: { fillColor: [40, 50, 70], fontSize: 9, fontStyle: 'bold', halign: 'center' },
    bodyStyles: { fontSize: 8, valign: 'middle' },
    columnStyles: {
      0: { cellWidth: 30, halign: 'center' },
      1: { cellWidth: 60, halign: 'left' },
      2: { cellWidth: 40, halign: 'center' },
      3: { cellWidth: 40, halign: 'right', fontStyle: 'bold' },
      4: { cellWidth: 40, halign: 'right', fontStyle: 'bold' },
      5: { cellWidth: 52, halign: 'right', fontStyle: 'bold' }
    },
    margin: { left: 14, right: 14 },
  })

  const fileName = `Customer_Ledger_${options.customerName.replace(/\s+/g, '_')}_${options.fy}_${new Date().toISOString().split('T')[0]}.pdf`
  doc.save(fileName)
}

export interface CDAtRiskExportOptions {
  currentFY: string
  businessName?: string
  summary: {
    totalAtRisk: number
    totalPaymentCDAtCurrentSlab: number
    totalInvoiceCDRisk: number
    totalPending: number
    criticalCount: number
    totalEligible: number
    totalIneligible: number
  }
}

export function exportCDAtRiskPDF(
  eligibleInvoices: any[],
  options: CDAtRiskExportOptions
) {
  const doc = new jsPDF('landscape')
  
  const formatAmount = (amount: number): string => {
    return amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text(options.businessName || 'Steel Trading ERP', 14, 15)
  
  doc.setFontSize(14)
  doc.text('CD at Risk Report (Multi-Unit Breakdown)', 14, 23)
  
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Financial Year: ${options.currentFY}`, 14, 30)
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 14, 35)
  
  const yPos = 42
  doc.setFillColor(245, 245, 250)
  doc.rect(14, yPos, 268, 20, 'F')
  
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('SUMMARY', 16, yPos + 5)
  
  doc.setFontSize(9)
  doc.text(`Total CD at Risk: Rs.${formatAmount(options.summary.totalAtRisk)}`, 16, yPos + 12)
  doc.text(`Payment CD Risk: Rs.${formatAmount(options.summary.totalPaymentCDAtCurrentSlab)}`, 90, yPos + 12)
  doc.text(`Invoice Close CD Risk: Rs.${formatAmount(options.summary.totalInvoiceCDRisk)}`, 170, yPos + 12)
  doc.text(`Eligible Invoices: ${options.summary.totalEligible}  |  Critical (>10k Risk): ${options.summary.criticalCount}`, 16, yPos + 17)

  const tableData = eligibleInvoices.map((inv) => {
    let unitBreakdownText = '-'
    if (inv.invoiceCloseBreakdown && inv.invoiceCloseBreakdown.length > 0) {
      unitBreakdownText = inv.invoiceCloseBreakdown
        .map((b: any) => `${b.quantity} ${b.unit}: Rs.${formatAmount(b.riskAmount)}`)
        .join('; ')
    }

    return [
      inv.supplierName || 'Unknown',
      inv.invoiceNo,
      inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString('en-IN') : '-',
      inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('en-IN') : '-',
      `Rs.${formatAmount(inv.pendingAmount)}`,
      `Rs.${formatAmount(inv.paymentCDAtCurrentSlab)}`,
      unitBreakdownText,
      `Rs.${formatAmount(inv.totalCDAtRisk)}`
    ]
  })

  autoTable(doc, {
    startY: yPos + 24,
    head: [[
      'Supplier',
      'Invoice No',
      'Invoice Date',
      'Due Date',
      'Pending Amount',
      'Payment CD Risk',
      'Invoice Close Breakdown',
      'Total CD at Risk'
    ]],
    body: tableData.length > 0 ? tableData : [['No CD at risk invoices', '', '', '', '', '', '', '']],
    theme: 'grid',
    headStyles: { fillColor: [180, 40, 40], fontSize: 8, fontStyle: 'bold', halign: 'center' },
    bodyStyles: { fontSize: 8, valign: 'middle' },
    columnStyles: {
      0: { cellWidth: 40, halign: 'left' },
      1: { cellWidth: 30, halign: 'center' },
      2: { cellWidth: 25, halign: 'center' },
      3: { cellWidth: 25, halign: 'center' },
      4: { cellWidth: 32, halign: 'right' },
      5: { cellWidth: 32, halign: 'right' },
      6: { cellWidth: 50, halign: 'left' },
      7: { cellWidth: 34, halign: 'right', fontStyle: 'bold' }
    },
    margin: { left: 14, right: 14 }
  })

  const fileName = `CD_at_Risk_${options.currentFY}_${new Date().toISOString().split('T')[0]}.pdf`
  doc.save(fileName)
}

export interface MTBookingsExportOptions {
  currentFY: string
  supplierFilterName?: string
  statusFilterName?: string
  getSupplierName: (id: string) => string
}

export function exportMTBookingsPDF(
  bookings: any[],
  options: MTBookingsExportOptions
) {
  const doc = new jsPDF('landscape')
  const pageWidth = doc.internal.pageSize.getWidth()
  
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('MT Booking Report', pageWidth / 2, 15, { align: 'center' })
  
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`Financial Year: ${options.currentFY}`, pageWidth / 2, 22, { align: 'center' })
  
  let yPos = 30
  
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('Filters Applied:', 14, yPos)
  yPos += 5
  
  doc.setFont('helvetica', 'normal')
  doc.text(`Supplier: ${options.supplierFilterName || 'All Suppliers'}`, 14, yPos)
  yPos += 5
  doc.text(`Status: ${options.statusFilterName || 'All Status'}`, 14, yPos)
  yPos += 8
  
  const formatDateStr = (dateStr?: string) => dateStr ? new Date(dateStr).toLocaleDateString('en-IN') : '-'
  const formatCurr = (val: number) => `Rs.${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const tableData = bookings.map(booking => {
    let schemeNames = 'No scheme'
    if (booking.rateMode === 'manual') {
      schemeNames = 'Manual Entry'
    } else if (booking.lockedSchemes && booking.lockedSchemes.length > 0) {
      schemeNames = booking.lockedSchemes.map((s: any) => s.schemeName).join(', ')
    }
    
    return [
      options.getSupplierName(booking.supplierId),
      formatDateStr(booking.orderDate),
      formatDateStr(booking.consumeStartDate),
      `${booking.bookedMT.toFixed(3)} ${booking.unit || 'MT'}`,
      `${booking.consumedMT.toFixed(3)} ${booking.unit || 'MT'}`,
      `${booking.remainingMT.toFixed(3)} ${booking.unit || 'MT'}`,
      schemeNames,
      booking.totalLockedRate ? formatCurr(booking.totalLockedRate) : '-',
      booking.status
    ]
  })
  
  autoTable(doc, {
    startY: yPos,
    head: [['Supplier', 'Order Date', 'Consume From', 'Booked', 'Consumed', 'Remaining', 'Locked Scheme', 'Scheme Rate', 'Status']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center'
    },
    bodyStyles: {
      fontSize: 8
    },
    columnStyles: {
      0: { halign: 'left', cellWidth: 40 },
      1: { halign: 'center', cellWidth: 25 },
      2: { halign: 'center', cellWidth: 25 },
      3: { halign: 'right', cellWidth: 25 },
      4: { halign: 'right', cellWidth: 25 },
      5: { halign: 'right', cellWidth: 25 },
      6: { halign: 'left', cellWidth: 45 },
      7: { halign: 'right', cellWidth: 25 },
      8: { halign: 'center', cellWidth: 20 }
    },
    margin: { left: 14, right: 14 }
  })
  
  const finalY = (doc as any).lastAutoTable.finalY || yPos + 20
  
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text(`Total Bookings: ${bookings.length}`, 14, finalY + 10)
  doc.text(`Active: ${bookings.filter(b => b.status === 'Active').length}`, 14, finalY + 15)
  doc.text(`Consumed: ${bookings.filter(b => b.status === 'Consumed').length}`, 14, finalY + 20)
  
  const totalBookedMT = bookings.reduce((sum, b) => sum + b.bookedMT, 0)
  const totalConsumedMT = bookings.reduce((sum, b) => sum + b.consumedMT, 0)
  const totalRemainingMT = bookings.reduce((sum, b) => sum + b.remainingMT, 0)
  
  doc.text(`Total Booked: ${totalBookedMT.toFixed(3)}`, pageWidth - 80, finalY + 10)
  doc.text(`Total Consumed: ${totalConsumedMT.toFixed(3)}`, pageWidth - 80, finalY + 15)
  doc.text(`Total Remaining: ${totalRemainingMT.toFixed(3)}`, pageWidth - 80, finalY + 20)
  
  const fileName = `MT_Booking_Report_${options.currentFY}_${new Date().toISOString().split('T')[0]}.pdf`
  doc.save(fileName)
}

export interface InventoryReportExportOptions {
  currentFY: string
  businessName?: string
  totals: {
    totalOpeningValue: number
    totalPurchaseValue: number
    totalSalesValue: number
    totalStockValue: number
  }
}

export function exportInventoryReportPDF(
  inventoryData: any[],
  options: InventoryReportExportOptions
) {
  const doc = new jsPDF('landscape')
  const businessName = options.businessName || 'Steel Trading ERP'
  
  const formatAmount = (amount: number): string => {
    const val = Number.isFinite(Number(amount)) ? Number(amount) : 0
    const formatted = val.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return `Rs.${formatted}`
  }
  
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text(businessName, 14, 15)
  
  doc.setFontSize(14)
  doc.text('Inventory Report', 14, 23)
  
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Financial Year: ${options.currentFY}`, 14, 30)
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 14, 35)
  
  const yPos = 42
  doc.setFillColor(245, 245, 250)
  doc.rect(14, yPos, 268, 20, 'F')
  
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('SUMMARY', 16, yPos + 5)
  
  doc.setFontSize(10)
  doc.text('Opening Stock:', 16, yPos + 11)
  doc.setFont('helvetica', 'normal')
  doc.text(formatAmount(options.totals.totalOpeningValue), 16, yPos + 15)

  doc.setFont('helvetica', 'bold')
  doc.text('Total Purchase:', 80, yPos + 11)
  doc.setFont('helvetica', 'normal')
  doc.text(formatAmount(options.totals.totalPurchaseValue), 80, yPos + 15)
  
  doc.setFont('helvetica', 'bold')
  doc.text('Total Sales:', 140, yPos + 11)
  doc.setFont('helvetica', 'normal')
  doc.text(formatAmount(options.totals.totalSalesValue), 140, yPos + 15)
  
  doc.setFont('helvetica', 'bold')
  doc.text('Closing Stock Value:', 200, yPos + 11)
  doc.setFont('helvetica', 'normal')
  doc.text(formatAmount(options.totals.totalStockValue), 200, yPos + 15)

  const tableData = inventoryData.map(item => {
    const secUnit = item.secondaryUnit
    const fmt = (primaryQty: number, secQty?: number, preferAlt?: boolean) => {
      const mainU = preferAlt && secUnit ? secUnit : item.unit
      const mainQ = preferAlt && typeof secQty === 'number' ? secQty : primaryQty
      
      const secU = preferAlt && secUnit ? item.unit : secUnit
      const secQ = preferAlt && typeof secQty === 'number' ? primaryQty : secQty

      const primStr = `${mainQ.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${mainU}`
      if (secU && secU !== mainU && typeof secQ === 'number') {
        const secStr = secQ.toLocaleString('en-IN', { maximumFractionDigits: 3 })
        return `${primStr} (${secStr} ${secU})`
      }
      return primStr
    }

    return [
      item.itemName,
      secUnit && secUnit !== item.unit ? `${item.unit} / ${secUnit}` : item.unit,
      item.openingStockMT > 0 ? fmt(item.openingStockMT, item.secondaryOpeningStock, false) : '-',
      fmt(item.totalPurchaseMT, item.secondaryTotalPurchase, item.preferAltPurchase),
      fmt(item.totalSalesMT, item.secondaryTotalSales, item.preferAltSale),
      fmt(item.balanceMT, item.secondaryBalance, false),
      formatAmount(item.avgPurchaseRate),
      formatAmount(item.avgSalesRate),
      formatAmount(item.currentStockValue)
    ]
  })

  autoTable(doc, {
    startY: yPos + 24,
    head: [['Item Name', 'Unit', 'Opening', 'Purchased', 'Sold', 'Balance', 'Avg Purch Rate', 'Avg Sales Rate', 'Stock Value']],
    body: tableData.length > 0 ? tableData : [['No inventory data', '', '', '', '', '', '', '', '']],
    theme: 'grid',
    headStyles: { fillColor: [64, 44, 120], fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  })

  const fileName = `Inventory_Report_${options.currentFY}_${new Date().toISOString().split('T')[0]}.pdf`
  doc.save(fileName)
}

export interface DrawingPowerExportOptions {
  businessName?: string
  currentFY?: string
  asOnDate: string
  bankAccountName: string
  sanctionedLimit: number
  marginPercentage: number
  summary: {
    stockValue: number
    eligibleDebtors: number
    ineligibleDebtors: number
    totalCreditors: number
    grossBase: number
    marginDeduction: number
    netDrawingPower: number
    sanctionedLimit: number
    finalDP: number
  }
  stockBreakdown: Array<{
    itemName: string
    category: string
    unit: string
    quantity: number
    rate: number
    value: number
  }>
  debtorsBreakdown: Array<{
    customerName: string
    totalOutstanding: number
    eligibleAmount: number
    ineligibleAmount: number
  }>
  creditorsBreakdown: Array<{
    supplierName: string
    payableAmount: number
  }>
}

export function exportDrawingPowerPDF(options: DrawingPowerExportOptions) {
  const doc = new jsPDF('portrait')
  const businessName = options.businessName || 'SK TRADERS'

  const formatAmount = (val: number): string => {
    const num = Number.isFinite(Number(val)) ? Number(val) : 0
    return 'Rs. ' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  // Header Banner
  doc.setFillColor(15, 23, 42) // slate-900
  doc.rect(0, 0, 210, 32, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(businessName.toUpperCase(), 14, 13)

  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text('STATEMENT OF DRAWING POWER & HYPOTHECATED ASSETS', 14, 20)

  doc.setFontSize(8)
  doc.text(`As on Date: ${new Date(options.asOnDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} | FY: ${options.currentFY || '2026-27'} | Bank: ${options.bankAccountName}`, 14, 27)

  doc.setTextColor(0, 0, 0)

  // Executive DP Calculation Box
  const startY = 38
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(14, startY, 182, 60, 3, 3, 'F')
  doc.setDrawColor(226, 232, 240)
  doc.roundedRect(14, startY, 182, 60, 3, 3, 'D')

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 41, 59)
  doc.text('1. DRAWING POWER CALCULATION STATEMENT', 18, startY + 7)

  const summaryRows = [
    ['A. Total Value of Inventory / Stock', formatAmount(options.summary.stockValue)],
    ['B. Eligible Book Debts (Outstanding <= 90 Days)', formatAmount(options.summary.eligibleDebtors)],
    ['C. Less: Trade Creditors / Supplier Liabilities', `(${formatAmount(options.summary.totalCreditors)})`],
    ['D. Gross Working Capital Security Base = (A + B) - C', formatAmount(options.summary.grossBase)],
    [`E. Less: Bank Haircut Margin (${options.marginPercentage}%)`, `(${formatAmount(options.summary.marginDeduction)})`],
    ['F. Net Calculated Drawing Power (DP) = D - E', formatAmount(options.summary.netDrawingPower)],
    ['G. Sanctioned CC / OD Limit', formatAmount(options.summary.sanctionedLimit)],
    ['H. FINAL USABLE DRAWING POWER = Min(F, G)', formatAmount(options.summary.finalDP)]
  ]

  autoTable(doc, {
    startY: startY + 10,
    body: summaryRows,
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: 1.2 },
    columnStyles: {
      0: { fontStyle: 'normal', cellWidth: 125 },
      1: { halign: 'right', fontStyle: 'bold', cellWidth: 45 }
    },
    didParseCell: (data) => {
      if (data.row.index === 3 || data.row.index === 5 || data.row.index === 7) {
        data.cell.styles.fontStyle = 'bold'
        if (data.row.index === 7) {
          data.cell.styles.textColor = [2, 86, 232]
        }
      }
    },
    margin: { left: 18, right: 18 }
  })

  let currentY = (doc as any).lastAutoTable.finalY + 10

  // Section 2: Stock Schedule
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 41, 59)
  doc.text('2. INVENTORY & STOCK VALUATION SCHEDULE', 14, currentY)

  const stockTableData = options.stockBreakdown.map((s, idx) => [
    idx + 1,
    s.itemName,
    s.category || 'General',
    `${s.quantity.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${s.unit}`,
    formatAmount(s.rate),
    formatAmount(s.value)
  ])

  autoTable(doc, {
    startY: currentY + 3,
    head: [['#', 'Item Description', 'Category', 'Closing Qty', 'Valuation Rate', 'Stock Value']],
    body: stockTableData.length > 0 ? stockTableData : [['-', 'No inventory items found', '-', '-', '-', 'Rs. 0.00']],
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7.5, cellPadding: 1.5 },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 55 },
      2: { cellWidth: 35 },
      3: { halign: 'right', cellWidth: 25 },
      4: { halign: 'right', cellWidth: 25 },
      5: { halign: 'right', fontStyle: 'bold', cellWidth: 32 }
    },
    margin: { left: 14, right: 14 }
  })

  currentY = (doc as any).lastAutoTable.finalY + 10

  // Section 3: Book Debts (Debtors Aging) Schedule
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 41, 59)
  doc.text('3. BOOK DEBTS AGING SCHEDULE (ELIGIBLE <= 90 DAYS)', 14, currentY)

  const debtorsTableData = options.debtorsBreakdown.map((d, idx) => [
    idx + 1,
    d.customerName,
    formatAmount(d.totalOutstanding),
    formatAmount(d.eligibleAmount),
    formatAmount(d.ineligibleAmount),
    d.eligibleAmount > 0 ? 'Eligible' : 'Excluded'
  ])

  autoTable(doc, {
    startY: currentY + 3,
    head: [['#', 'Customer Name', 'Total Debt', '<= 90 Days (Eligible)', '> 90 Days (Ineligible)', 'Status']],
    body: debtorsTableData.length > 0 ? debtorsTableData : [['-', 'No outstanding debtor balances', 'Rs. 0.00', 'Rs. 0.00', 'Rs. 0.00', 'Settled']],
    theme: 'grid',
    headStyles: { fillColor: [14, 116, 144], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7.5, cellPadding: 1.5 },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 60 },
      2: { halign: 'right', cellWidth: 28 },
      3: { halign: 'right', fontStyle: 'bold', cellWidth: 32 },
      4: { halign: 'right', cellWidth: 30 },
      5: { halign: 'center', cellWidth: 22 }
    },
    margin: { left: 14, right: 14 }
  })

  currentY = (doc as any).lastAutoTable.finalY + 10

  // Check page overflow for section 4 & declarations
  if (currentY > 210) {
    doc.addPage()
    currentY = 20
  }

  // Section 4: Creditors Schedule
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 41, 59)
  doc.text('4. TRADE CREDITORS (SUPPLIERS) SCHEDULE', 14, currentY)

  const creditorsTableData = options.creditorsBreakdown.map((c, idx) => [
    idx + 1,
    c.supplierName,
    formatAmount(c.payableAmount)
  ])

  autoTable(doc, {
    startY: currentY + 3,
    head: [['#', 'Supplier / Creditor Name', 'Outstanding Payable Amount']],
    body: creditorsTableData.length > 0 ? creditorsTableData : [['-', 'No supplier payable liabilities', 'Rs. 0.00']],
    theme: 'grid',
    headStyles: { fillColor: [180, 83, 9], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7.5, cellPadding: 1.5 },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 110 },
      2: { halign: 'right', fontStyle: 'bold', cellWidth: 62 }
    },
    margin: { left: 14, right: 14 }
  })

  currentY = (doc as any).lastAutoTable.finalY + 12

  if (currentY > 235) {
    doc.addPage()
    currentY = 20
  }

  // Certification & Signatures
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(14, currentY, 182, 42, 2, 2, 'F')
  doc.setDrawColor(203, 213, 225)
  doc.roundedRect(14, currentY, 182, 42, 2, 2, 'D')

  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'italic')
  doc.setTextColor(71, 85, 105)
  doc.text(
    'DECLARATION & CERTIFICATE: We hereby certify that the stocks, receivables, and trade liabilities stated above represent true and accurate records as on the date hereof. The goods and book debts hypothecated to the Bank are free from any prior charge or encumbrance. All debtors outstanding beyond 90 days have been strictly excluded from the drawing power calculation.',
    18,
    currentY + 6,
    { maxWidth: 174 }
  )

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 23, 42)
  doc.text(`For ${businessName.toUpperCase()}`, 18, currentY + 28)
  doc.text('Authorised Signatory / Managing Partner', 18, currentY + 36)

  doc.text('Verified & Checked by:', 125, currentY + 28)
  doc.text('Branch Manager / Bank Official', 125, currentY + 36)

  const fileName = `Drawing_Power_Statement_${options.asOnDate}_${options.bankAccountName.replace(/\s+/g, '_')}.pdf`
  doc.save(fileName)
}


