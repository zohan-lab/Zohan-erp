import { getChangedByLabel, getChangedByRole } from '@/lib/security-utils'
import { useState, useMemo } from 'react'
import { SupplierCreditNote, Supplier } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Plus, CaretUpDown, Check } from '@phosphor-icons/react'
import { formatCurrency, getFYFromDate } from '@/lib/calculations'
import { parseISO, format } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

import { PeriodDateFilter, PeriodFilterState, defaultPeriodFilterState, isRecordInPeriod } from '@/components/period-date-filter'
import { saveEntityRemote, deleteEntityRemote } from '@/lib/firebase-storage'
import { ThreeDotDropdown } from '@/components/ui/three-dot-dropdown'

interface SupplierCreditNotePageProps {
  supplierCreditNotes: SupplierCreditNote[]
  setSupplierCreditNotes: (updater: (prev: SupplierCreditNote[]) => SupplierCreditNote[]) => void
  suppliers: Supplier[]
  currentFY: string
  isLocked?: boolean
  activeCompanyId?: string
}

export default function SupplierCreditNotePage({
  supplierCreditNotes,
  setSupplierCreditNotes,
  suppliers,
  currentFY,
  isLocked = false,
  activeCompanyId
}: SupplierCreditNotePageProps) {
  const [open, setOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<SupplierCreditNote | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<SupplierCreditNote | null>(null)
  const [periodFilter, setPeriodFilter] = useState<PeriodFilterState>(defaultPeriodFilterState)
  const [selectedEntity, setSelectedEntity] = useState<string>('all')
  const [selectedEntityInForm, setSelectedEntityInForm] = useState<string>('')
  const [entityComboboxOpen, setEntityComboboxOpen] = useState(false)

  const filteredItems = useMemo(() => {
    let result = supplierCreditNotes.filter(p => isRecordInPeriod(p.date, p.fy, periodFilter, currentFY))

    if (selectedEntity !== 'all') {
      result = result.filter(p => p.supplierId === selectedEntity)
    }

    return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [supplierCreditNotes, periodFilter, currentFY, selectedEntity])

  const totalAmount = filteredItems.reduce((sum, p) => sum + p.amount, 0)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (isLocked) {
      toast.error('Cannot save in locked mode', { description: 'Unlock the data in Settings to make changes' })
      return
    }

    const formData = new FormData(e.currentTarget)
    const date = formData.get('date') as string
    const amount = parseFloat(formData.get('amount') as string)
    const remarks = formData.get('remarks') as string

    if (!selectedEntityInForm) {
      toast.error('Select a supplier')
      return
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid amount')
      return
    }

    if (editingItem) {
      const updated: SupplierCreditNote = {
        ...editingItem,
        supplierId: selectedEntityInForm,
        date,
        amount,
        remarks,
        history: [
          ...(editingItem.history || []),
          {
            timestamp: new Date().toISOString(),
            action: 'updated',
            changedBy: getChangedByLabel(),
            changedByRole: getChangedByRole(),
            changes: [
              ...(editingItem.amount !== amount ? [{ field: 'Amount', from: String(editingItem.amount), to: String(amount) }] : []),
              ...(editingItem.supplierId !== selectedEntityInForm ? [{ field: 'Supplier', from: suppliers.find(s => s.id === editingItem.supplierId)?.name || '-', to: suppliers.find(s => s.id === selectedEntityInForm)?.name || '-' }] : []),
              ...(editingItem.date !== date ? [{ field: 'Date', from: editingItem.date, to: date }] : []),
              ...((editingItem.remarks || '') !== (remarks || '') ? [{ field: 'Remarks', from: editingItem.remarks || '-', to: remarks || '-' }] : [])
            ]
          }
        ]
      }
      setSupplierCreditNotes((prev) => prev.map(p => p.id === editingItem.id ? updated : p))
      if (activeCompanyId) {
        void saveEntityRemote(activeCompanyId, 'supplierCreditNotes', updated)
      }
      toast.success('Credit Note updated')
    } else {
      const newItem: SupplierCreditNote = {
        id: crypto.randomUUID(),
        supplierId: selectedEntityInForm,
        date,
        amount,
        remarks,
        fy: getFYFromDate(date),
        createdAt: Date.now(),
        history: [
          {
            timestamp: new Date().toISOString(),
            action: 'created',
            changedBy: getChangedByLabel(),
            changedByRole: getChangedByRole(),
            changes: [
              { field: 'Supplier', from: '', to: suppliers.find(s => s.id === selectedEntityInForm)?.name || '-' },
              { field: 'Amount', from: '', to: String(amount) },
              { field: 'Date', from: '', to: date },
              ...(remarks ? [{ field: 'Remarks', from: '', to: remarks }] : [])
            ]
          }
        ]
      }
      setSupplierCreditNotes((prev) => [...prev, newItem])
      if (activeCompanyId) {
        void saveEntityRemote(activeCompanyId, 'supplierCreditNotes', newItem)
      }
      toast.success('Credit Note added')
    }

    setOpen(false)
    setEditingItem(null)
    setSelectedEntityInForm('')
  }

  const handleDelete = () => {
    if (isLocked || !itemToDelete) return
    setSupplierCreditNotes((prev) => prev.filter(p => p.id !== itemToDelete.id))
    if (activeCompanyId) {
      void deleteEntityRemote(activeCompanyId, 'supplierCreditNotes', itemToDelete.id)
    }
    setDeleteDialogOpen(false)
    setItemToDelete(null)
    toast.success('Credit Note deleted')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Credit Notes</h1>
          <p className="text-muted-foreground">Manage supplier credit notes for {currentFY}</p>
        </div>

        <Dialog open={open} onOpenChange={(v) => {
          setOpen(v)
          if (!v) { setEditingItem(null); setSelectedEntityInForm('') }
        }}>
          <DialogTrigger asChild>
            <Button disabled={isLocked}>
              <Plus className="mr-2 h-4 w-4" /> Add Credit Note
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{editingItem ? 'Edit' : 'Add'} Credit Note</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2 flex flex-col">
                <Label>Supplier</Label>
                <Popover open={entityComboboxOpen} onOpenChange={setEntityComboboxOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={entityComboboxOpen}
                      className="justify-between"
                    >
                      {selectedEntityInForm
                        ? suppliers.find((s) => s.id === selectedEntityInForm)?.name
                        : "Select supplier..."}
                      <CaretUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0">
                    <Command>
                      <CommandInput placeholder="Search supplier..." />
                      <CommandList>
                        <CommandEmpty>No supplier found.</CommandEmpty>
                        <CommandGroup>
                          {suppliers.map((s) => (
                            <CommandItem
                              key={s.id}
                              value={s.name}
                              onSelect={() => {
                                setSelectedEntityInForm(s.id)
                                setEntityComboboxOpen(false)
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", selectedEntityInForm === s.id ? "opacity-100" : "opacity-0")} />
                              {s.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  name="date"
                  type="date"
                  defaultValue={editingItem?.date || format(new Date(), 'yyyy-MM-dd')}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={editingItem?.amount}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="remarks">Remarks</Label>
                <Textarea
                  id="remarks"
                  name="remarks"
                  defaultValue={editingItem?.remarks}
                  placeholder="Optional notes"
                />
              </div>

              <div className="pt-4 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit">Save</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <PeriodDateFilter currentFY={currentFY} value={periodFilter} onChange={setPeriodFilter} />
        <div className="w-full sm:w-[250px]">
          <Select value={selectedEntity} onValueChange={setSelectedEntity}>
            <SelectTrigger>
              <SelectValue placeholder="All Suppliers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Suppliers</SelectItem>
              {suppliers.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Remarks</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No credit notes found
                  </TableCell>
                </TableRow>
              ) : (
                filteredItems.map((item) => {
                  const entity = suppliers.find(s => s.id === item.supplierId)
                  return (
                    <TableRow key={item.id}>
                      <TableCell>{format(parseISO(item.date), 'dd MMM yyyy')}</TableCell>
                      <TableCell className="font-medium">
                        <span>{entity?.name || 'Unknown'}</span>
                      </TableCell>
                      <TableCell className="text-right font-medium text-violet-600">
                        {formatCurrency(item.amount)}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{item.remarks || '-'}</TableCell>
                      <TableCell className="text-right">
                        <ThreeDotDropdown
                          onEdit={() => {
                            setEditingItem(item)
                            setSelectedEntityInForm(item.supplierId)
                            setOpen(true)
                          }}
                          onDelete={() => {
                            setItemToDelete(item)
                            setDeleteDialogOpen(true)
                          }}
                          history={item.history}
                          entityType="Credit Note"
                          isLocked={isLocked}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Credit Note</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this credit note? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
