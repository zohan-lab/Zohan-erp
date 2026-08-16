import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { formatCurrency, calculateInvoiceTaxBreakdown } from '@/lib/calculations'
import { Item, InvoiceItem } from '@/lib/types'

interface InvoicePreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'sales' | 'purchase'
  invoiceNo: string
  invoiceDate: string
  partyName: string
  partyAddress?: string
  partyPhone?: string
  partyState?: string
  items: InvoiceItem[]
  itemMap: Map<string, Item>
  totalAmount: number
  taxableAmount?: number
  cgstRate?: number
  cgstAmount?: number
  sgstRate?: number
  sgstAmount?: number
  igstRate?: number
  igstAmount?: number
  roundOff?: number
  additionalCost?: number
  additionalCostRemarks?: string
  paidAmount?: number
}

function getActiveBusinessName() {
  try {
    const metadata = JSON.parse(localStorage.getItem('app_metadata') || '{}')
    const active = metadata.businesses?.find((business: { id: string }) => business.id === metadata.activeCompanyId)
    return active?.name || 'SK TRADERS'
  } catch {
    return 'SK TRADERS'
  }
}

export function InvoicePreviewDialog({
  open,
  onOpenChange,
  mode,
  invoiceNo,
  invoiceDate,
  partyName,
  partyAddress,
  partyPhone,
  partyState,
  items,
  itemMap,
  totalAmount,
  taxableAmount: propTaxable,
  cgstRate: propCgstRate,
  cgstAmount: propCgstAmount,
  sgstRate: propSgstRate,
  sgstAmount: propSgstAmount,
  igstRate: propIgstRate,
  igstAmount: propIgstAmount,
  roundOff: propRoundOff,
  additionalCost,
  additionalCostRemarks,
  paidAmount
}: InvoicePreviewDialogProps) {
  const businessName = getActiveBusinessName()
  const title = 'INVOICE'

  const taxSummary = calculateInvoiceTaxBreakdown({
    items,
    itemsMaster: Array.from(itemMap.values()),
    additionalCostFinal: additionalCost,
    partyState: partyState
  })

  const taxable = propTaxable !== undefined ? propTaxable : taxSummary.taxableAmount
  const isInterState = taxSummary.isInterState
  const cgstRate = propCgstRate !== undefined ? propCgstRate : taxSummary.cgstRate
  const cgstAmount = propCgstAmount !== undefined ? propCgstAmount : taxSummary.cgstAmount
  const sgstRate = propSgstRate !== undefined ? propSgstRate : taxSummary.sgstRate
  const sgstAmount = propSgstAmount !== undefined ? propSgstAmount : taxSummary.sgstAmount
  const igstRate = propIgstRate !== undefined ? propIgstRate : taxSummary.igstRate
  const igstAmount = propIgstAmount !== undefined ? propIgstAmount : taxSummary.igstAmount
  const roundOff = propRoundOff !== undefined ? propRoundOff : taxSummary.roundOff

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="invoice-preview-dialog max-w-[980px] p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{title} {invoiceNo}</DialogTitle>
        </DialogHeader>
        <div className="invoice-preview-shell">
          <div className="invoice-preview-toolbar">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Generated Invoice</p>
              <h2 className="text-lg font-semibold">{invoiceNo}</h2>
            </div>
            <Button type="button" size="sm" onClick={() => window.print()}>
              Print
            </Button>
          </div>

          <div className="billbook-page">
            <div className="billbook-topline">
              <span>{title}</span>
              <span>ORIGINAL FOR RECIPIENT</span>
            </div>

            <div className="billbook-header">
              <h1>{businessName}</h1>
              <p>West Bengal</p>
              <p>Mobile: 9083876218</p>
            </div>

            <div className="billbook-party-row">
              <div>
                <p className="billbook-label">{mode === 'sales' ? 'BILL TO' : 'SUPPLIER'}</p>
                <h3>{partyName}</h3>
                <p>Address: {partyAddress || '-'}</p>
                <p>Mobile: {partyPhone || '-'}</p>
              </div>
              <div className="billbook-meta-grid">
                <div>
                  <p>Invoice No.</p>
                  <strong>{invoiceNo}</strong>
                </div>
                <div>
                  <p>Invoice Date</p>
                  <strong>{new Date(invoiceDate).toLocaleDateString('en-IN')}</strong>
                </div>
                <div>
                  <p>Due Date</p>
                  <strong>-</strong>
                </div>
              </div>
            </div>

            <table className="billbook-table">
              <thead>
                <tr>
                  <th>S.NO.</th>
                  <th>ITEMS</th>
                  <th>HSN/SAC</th>
                  <th>QTY.</th>
                  <th>UNIT</th>
                  <th>RATE</th>
                  <th>TAXABLE</th>
                  <th>GST %</th>
                  <th>AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={9}>No items</td>
                  </tr>
                ) : items.map((line, index) => {
                  const item = itemMap.get(line.itemId)
                  const lineInfo = taxSummary.lineBreakdowns[index]
                  const unit = line.enteredUnit || item?.unit || 'KG'
                  const qty = line.enteredQuantity || line.baseQuantity || 0
                  const hsn = item?.hsnCode || '7214'
                  const basicRate = lineInfo?.basicRate ?? line.basicRate ?? (qty > 0 ? line.amount / qty : 0)
                  const rowTaxable = lineInfo?.taxableAmount ?? (qty * basicRate)
                  const gstPct = lineInfo?.gstRate ?? item?.gstRate ?? 18
                  const rowTotal = lineInfo?.totalAmount ?? line.amount

                  return (
                    <tr key={`${line.itemId}-${index}`}>
                      <td>{index + 1}</td>
                      <td>
                        <strong>{line.itemNameSnapshot || item?.name || 'Unknown item'}</strong>
                        <span>{item?.description || ''}</span>
                      </td>
                      <td>{hsn}</td>
                      <td>{qty.toLocaleString('en-IN', { maximumFractionDigits: 3 })}</td>
                      <td>{unit}</td>
                      <td>{formatCurrency(basicRate)}</td>
                      <td>{formatCurrency(rowTaxable)}</td>
                      <td>{gstPct}%</td>
                      <td>{formatCurrency(rowTotal)}</td>
                    </tr>
                  )
                })}
                {Array.from({ length: Math.max(0, 6 - items.length) }).map((_, index) => (
                  <tr key={`blank-${index}`} className="billbook-empty-row">
                    <td>&nbsp;</td>
                    <td />
                    <td />
                    <td />
                    <td />
                    <td />
                    <td />
                    <td />
                    <td />
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={8} style={{ textAlign: 'right' }}>Taxable Value</td>
                  <td>{formatCurrency(taxable)}</td>
                </tr>
                {!isInterState ? (
                  <>
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'right' }}>CGST @ {cgstRate}%</td>
                      <td>{formatCurrency(cgstAmount)}</td>
                    </tr>
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'right' }}>SGST @ {sgstRate}%</td>
                      <td>{formatCurrency(sgstAmount)}</td>
                    </tr>
                  </>
                ) : (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'right' }}>IGST @ {igstRate}%</td>
                    <td>{formatCurrency(igstAmount)}</td>
                  </tr>
                )}
                {additionalCost && additionalCost > 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'right' }}>
                      Additional Cost {additionalCostRemarks ? `(${additionalCostRemarks})` : ''}
                    </td>
                    <td>{formatCurrency(additionalCost)}</td>
                  </tr>
                ) : null}
                {roundOff !== 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'right' }}>Round Off</td>
                    <td>{roundOff >= 0 ? '+' : ''}{formatCurrency(roundOff)}</td>
                  </tr>
                )}
                <tr>
                  <td colSpan={8} style={{ textAlign: 'right', fontWeight: 'bold' }}>Total</td>
                  <td style={{ fontWeight: 'bold' }}>{formatCurrency(totalAmount)}</td>
                </tr>
                {paidAmount && paidAmount > 0 ? (
                  <>
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'right' }}>Amount Paid</td>
                      <td>{formatCurrency(paidAmount)}</td>
                    </tr>
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'right', fontWeight: 'bold' }}>Balance Due</td>
                      <td style={{ fontWeight: 'bold' }}>{formatCurrency(Math.max(0, totalAmount - paidAmount))}</td>
                    </tr>
                  </>
                ) : null}
              </tfoot>
            </table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
