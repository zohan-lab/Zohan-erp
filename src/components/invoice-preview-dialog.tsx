import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/calculations'
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
  items: InvoiceItem[]
  itemMap: Map<string, Item>
  totalAmount: number
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
  items,
  itemMap,
  totalAmount,
  additionalCost,
  additionalCostRemarks,
  paidAmount
}: InvoicePreviewDialogProps) {
  const businessName = getActiveBusinessName()
  const title = 'INVOICE'
  const subtotal = additionalCost && additionalCost > 0 ? totalAmount - additionalCost : totalAmount

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
                  <th>QTY.</th>
                  <th>RATE</th>
                  <th>DISC.</th>
                  <th>AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No items</td>
                  </tr>
                ) : items.map((line, index) => {
                  const item = itemMap.get(line.itemId)
                  const unit = line.enteredUnit || item?.unit || 'KG'
                  const qty = line.enteredQuantity || line.baseQuantity || 0
                  const rate = line.rate || (qty > 0 ? line.amount / qty : 0)
                  return (
                    <tr key={`${line.itemId}-${index}`}>
                      <td>{index + 1}</td>
                      <td>
                        <strong>{item?.name || 'Unknown item'}</strong>
                        <span>{item?.description || unit}</span>
                      </td>
                      <td>{qty.toLocaleString('en-IN', { maximumFractionDigits: 3 })} {unit}</td>
                      <td>{formatCurrency(rate)}</td>
                      <td>0</td>
                      <td>{formatCurrency(line.amount)}</td>
                    </tr>
                  )
                })}
                {Array.from({ length: Math.max(0, 8 - items.length) }).map((_, index) => (
                  <tr key={`blank-${index}`} className="billbook-empty-row">
                    <td>&nbsp;</td>
                    <td />
                    <td />
                    <td />
                    <td />
                    <td />
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {additionalCost && additionalCost > 0 ? (
                  <>
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'right' }}>Subtotal</td>
                      <td>{formatCurrency(subtotal)}</td>
                    </tr>
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'right' }}>
                        Additional Cost {additionalCostRemarks ? `(${additionalCostRemarks})` : ''}
                      </td>
                      <td>{formatCurrency(additionalCost)}</td>
                    </tr>
                  </>
                ) : null}
                <tr>
                  <td colSpan={5} style={{ textAlign: 'right', fontWeight: 'bold' }}>Total</td>
                  <td style={{ fontWeight: 'bold' }}>{formatCurrency(totalAmount)}</td>
                </tr>
                {paidAmount && paidAmount > 0 ? (
                  <>
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'right' }}>Amount Paid</td>
                      <td>{formatCurrency(paidAmount)}</td>
                    </tr>
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'right', fontWeight: 'bold' }}>Balance Due</td>
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
