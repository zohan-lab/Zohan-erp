import { getChangedByLabel } from '@/lib/security-utils'
import { useState, useMemo } from 'react'
import { SupplierDebitNote, Supplier } from '@/lib/types'
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
import { Plus, Trash, PencilSimple, CaretUpDown, Check } from '@phosphor-icons/react'
import { formatCurrency, getFYMonths, getFYFromDate } from '@/lib/calculations'
import { startOfMonth, endOfMonth, isWithinInterval, parseISO, format } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

import { PeriodDateFilter, PeriodFilterState, defaultPeriodFilterState, isRecordInPeriod } from '@/components/period-date-filter'

import { saveEntityRemote, deleteEntityRemote } from '@/lib/firebase-storage'
import { ThreeDotDropdown } from '@/components/ui/three-dot-dropdown'

interface SupplierDebitNotePageProps {
  debitNotes: SupplierDebitNote[]
  setDebitNotes: (updater: (prev: SupplierDebitNote[]) => SupplierDebitNote[]) => void
  suppliers: Supplier[]
  currentFY: string
  isLocked?: boolean
  activeCompanyId?: string
}

export default function SupplierDebitNotePage({ debitNotes, setDebitNotes, suppliers, currentFY, isLocked = false, activeCompanyId }: SupplierDebitNotePageProps) {
  const [open, setOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<SupplierDebitNote | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<SupplierDebitNote | null>(null)
  const [periodFilter, setPeriodFilter] = useState<PeriodFilterState>(defaultPeriodFilterState)
  const [selectedEntity, setSelectedEntity] = useState<string>('all')
  const [selectedEntityInForm, setSelectedEntityInForm] = useState<string>('')
  const [entityComboboxOpen, setEntityComboboxOpen] = useState(false)

  const filteredItems = useMemo(() => {
    let result = debitNotes.filter(p => isRecordInPeriod(p.date, p.fy, periodFilter, currentFY))
    
    if (selectedEntity !== 'all') {
      result = result.filter(p => p.supplierId === selectedEntity)
    }
    
    return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [debitNotes, periodFilter, currentFY, selectedEntity])
  
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
      const updated: SupplierDebitNote = {
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
            changes: [
              ...(editingItem.amount !== amount ? [{ field: 'Amount', from: String(editingItem.amount), to: String(amount) }] : []),
              ...(editingItem.supplierId !== selectedEntityInForm ? [{ field: 'Supplier', from: suppliers.find(s => s.id === editingItem.supplierId)?.name || '-', to: suppliers.find(s => s.id === selectedEntityInForm)?.name || '-' }] : []),
              ...(editingItem.date !== date ? [{ field: 'Date', from: editingItem.date, to: date }] : []),
              ...((editingItem.remarks || '') !== (remarks || '') ? [{ field: 'Remarks', from: editingItem.remarks || '-', to: remarks || '-' }] : [])
            ]
          }
        ]
      }
      setDebitNotes((prev) => prev.map(p => p.id === editingItem.id ? updated : p))
      if (activeCompanyId) {
        void saveEntityRemote(activeCompanyId, 'debitNotes', updated)
      }
      toast.success('Debit Note updated')
    } else {
      const newItem: SupplierDebitNote = {
        id: crypto.randomUUID(),
        supplierId: selectedEntityInForm,
        date,
        amount,
        remarks,
        fy: currentFY,
        createdAt: Date.now(),
        history: [
          {
            timestamp: new Date().toISOString(),
            action: 'created',
            changedBy: getChangedByLabel(),
            changes: [
              { field: 'Supplier', from: '', to: suppliers.find(s => s.id === selectedEntityInForm)?.name || '-' },
              { field: 'Amount', from: '', to: String(amount) },
              { field: 'Date', from: '', to: date },
              ...(remarks ? [{ field: 'Remarks', from: '', to: remarks }] : [])
            ]
          }
        ]
      }
      setDebitNotes((prev) => [...prev, newItem])
      if (activeCompanyId) {
        void saveEntityRemote(activeCompanyId, 'debitNotes', newItem)
      }
      toast.success('Debit Note added')
    }

    setOpen(false)
    setEditingItem(null)
    setSelectedEntityInForm('')
  }

  const handleDelete = () => {
    if (isLocked || !itemToDelete) return
    setDebitNotes((prev) => prev.filter(p => p.id !== itemToDelete.id))
    if (activeCompanyId) {
      void deleteEntityRemote(activeCompanyId, 'debitNotes', itemToDelete.id)
    }
    setDeleteDialogOpen(false)
    setItemToDelete(null)
    toast.success('Debit Note deleted')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Debit Notes</h1>
          <p className="text-muted-foreground">Manage debit notes for {currentFY}</p>
        </div>
        
        <Dialog open={open} onOpenChange={(v) => {
          setOpen(v)
          if (!v) { setEditingItem(null); setSelectedEntityInForm('') }
        }}>
          <DialogTrigger asChild>
            <Button disabled={isLocked}>
              <Plus className="mr-2 h-4 w-4" /> Add Debit Note
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{editingItem ? 'Edit' : 'Add'} Debit Note</DialogTitle>
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
                        ? suppliers.find((c) => c.id === selectedEntityInForm)?.name
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
                          {suppliers.map((c) => (
                            <CommandItem
                              key={c.id}
                              value={c.name}
                              onSelect={() => {
                                setSelectedEntityInForm(c.id)
                                setEntityComboboxOpen(false)
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", selectedEntityInForm === c.id ? "opacity-100" : "opacity-0")} />
                              {c.name}
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
              {suppliers.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
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
                    No debit notes found
                  </TableCell>
                </TableRow>
              ) : (
                filteredItems.map((item) => {
                  const entity = suppliers.find(c => c.id === item.supplierId)
                  const isAuto = Boolean(item.isAutoGenerated || item.id.startsWith('debit-note-pr-') || item.sourceType === 'purchase_return')
                  return (
                    <TableRow key={item.id}>
                      <TableCell>{format(parseISO(item.date), 'dd MMM yyyy')}</TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span>{entity?.name || 'Unknown'}</span>
                          {isAuto && (
                            <span className="inline-flex items-center rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400 border border-amber-500/20" title="Auto-generated from Purchase Return">
                              Auto (PR)
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium text-emerald-600">
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
                          entityType="Debit Note"
                          isLocked={isLocked || isAuto}
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
            <AlertDialogTitle>Delete Debit Note</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this debit note? This action cannot be undone.
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
