import { useState, useMemo } from 'react'
import { Party, Supplier, PurchaseInvoice } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Target, FilePdf } from '@phosphor-icons/react'
import { 
  formatCurrency,
  formatMT,
  calculateExpectedAnnualDiscounts,
  getFYFromDate
} from '@/lib/calculations'
import { exportAnnualDiscountPDF } from '@/lib/pdf-export'

interface AnnualDiscountPageProps {
  parties?: Party[]
  suppliers?: Supplier[]
  invoices: PurchaseInvoice[]
  currentFY: string
  businessName?: string
}

export default function AnnualDiscountPage({
  parties,
  suppliers = [],
  invoices,
  currentFY,
  businessName
}: AnnualDiscountPageProps) {
  const suppliersList = parties || suppliers || []
  const [selectedSupplier, setSelectedSupplier] = useState<string>('all')

  const fyInvoices = useMemo(() => invoices.filter(inv => inv.fy === currentFY || (inv.invoiceDate && getFYFromDate(inv.invoiceDate) === currentFY)), [invoices, currentFY])

  const expectedAnnual = useMemo(() => 
    calculateExpectedAnnualDiscounts(fyInvoices, suppliersList),
    [fyInvoices, suppliersList]
  )

  const filteredExpected = expectedAnnual.filter(exp => {
    if (selectedSupplier !== 'all' && exp.supplierId !== selectedSupplier) return false
    return true
  })

  const suppliersWithTargets = suppliersList.filter(s => s.annualTarget)

  const pendingForExport = useMemo(() => 
    filteredExpected.map(exp => ({
      ...exp,
      receivedAmount: 0,
      pendingAmount: exp.expectedAmount,
      status: 'Pending' as const
    })),
    [filteredExpected]
  )

  const handleExportPDF = () => {
    exportAnnualDiscountPDF(
      pendingForExport,
      [],
      suppliersList,
      {
        title: 'Annual Target Progress Report',
        fy: currentFY,
        generatedDate: new Date().toLocaleString('en-IN'),
        businessName,
        filters: {
          supplier: selectedSupplier
        }
      }
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Annual Target Progress</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Track volume-based annual target achievement (MT). Discount entries are managed in Discount Wallet.
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm"
          onClick={handleExportPDF}
          disabled={filteredExpected.length === 0}
        >
          <FilePdf className="mr-2" size={16} />
          Export PDF
        </Button>
      </div>

      <Card className="border-accent/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target size={20} />
            Filter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex-1">
            <Label className="text-xs mb-2 block">Party</Label>
            <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Parties</SelectItem>
                {suppliersWithTargets.map(supplier => (
                  <SelectItem key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {suppliersWithTargets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Target size={48} className="text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              No parties with annual targets configured. Add annual targets to parties in CD Rules first.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div>
          <h3 className="text-lg font-semibold mb-3">Annual Target Achievement</h3>
          {filteredExpected.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <Target size={40} className="text-muted-foreground mb-3" />
                <p className="text-muted-foreground text-center text-sm">
                  No annual targets found for the selected filters.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Party</TableHead>
                      <TableHead className="text-right">Target MT</TableHead>
                      <TableHead className="text-right">Achieved MT</TableHead>
                      <TableHead className="text-right">Progress %</TableHead>
                      <TableHead className="text-right">Rate per MT</TableHead>
                      <TableHead className="text-right">Expected Discount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredExpected.map(exp => {
                      const progressPercent = exp.targetMT > 0 ? (exp.achievedMT / exp.targetMT) * 100 : 0
                      const isComplete = progressPercent >= 100
                      
                      return (
                        <TableRow key={exp.id}>
                          <TableCell className="font-medium">{exp.supplierName}</TableCell>
                          <TableCell className="text-right font-mono">{formatMT(exp.targetMT)}</TableCell>
                          <TableCell className="text-right font-mono">{formatMT(exp.achievedMT)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                                <div 
                                  className={`h-full transition-all ${isComplete ? 'bg-success' : 'bg-primary'}`}
                                  style={{ width: `${Math.min(progressPercent, 100)}%` }}
                                />
                              </div>
                              <span className={`text-sm font-semibold ${isComplete ? 'text-success' : 'text-muted-foreground'}`}>
                                {progressPercent.toFixed(1)}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(exp.ratePerMT)}</TableCell>
                          <TableCell className="text-right font-mono font-semibold">{formatCurrency(exp.expectedAmount)}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
