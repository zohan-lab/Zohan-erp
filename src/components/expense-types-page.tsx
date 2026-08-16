import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ExpenseCategory, ExpenseType, ExpenseEntry } from '@/lib/types'
import { Plus, Trash, Receipt, LinkSimple, TrendDown, Warning, PencilSimple, SlidersHorizontal } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { COMMON_HSN_SAC_CODES } from '@/components/expense-entries-page'

interface ExpenseTypesPageProps {
  expenseTypes: ExpenseType[]
  setExpenseTypes: (updater: (prev: ExpenseType[]) => ExpenseType[]) => void
  expenseEntries: ExpenseEntry[]
  isLocked?: boolean
}

export default function ExpenseTypesPage({ expenseTypes, setExpenseTypes, expenseEntries, isLocked = false }: ExpenseTypesPageProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<ExpenseType | null>(null)
  const [deleteAlertOpen, setDeleteAlertOpen] = useState(false)
  const [expenseTypeToDelete, setExpenseTypeToDelete] = useState<ExpenseType | null>(null)

  // Form States
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [linkType, setLinkType] = useState<'invoice' | 'netprofit'>('netprofit')
  const [isGstApplicable, setIsGstApplicable] = useState(true)
  const [defaultSacCode, setDefaultSacCode] = useState('')
  const [defaultGstRate, setDefaultGstRate] = useState<number>(18)
  const [isRcmDefault, setIsRcmDefault] = useState(false)
  const [itcClassification, setItcClassification] = useState<'Input Services' | 'Inputs / Consumables' | 'Capital Goods' | 'Ineligible'>('Input Services')

  const resetForm = () => {
    setEditingItem(null)
    setName('')
    setDescription('')
    setLinkType('netprofit')
    setIsGstApplicable(true)
    setDefaultSacCode('')
    setDefaultGstRate(18)
    setIsRcmDefault(false)
    setItcClassification('Input Services')
  }

  const handleStartEdit = (category: ExpenseCategory) => {
    setEditingItem(category)
    setName(category.name)
    setDescription(category.description || '')
    setLinkType(category.linkType || (category.costLinkingType === 'invoice_landed' ? 'invoice' : 'netprofit'))
    setIsGstApplicable(category.isGstApplicable !== false)
    setDefaultSacCode(category.defaultSacCode || '')
    setDefaultGstRate(typeof category.defaultGstRate === 'number' ? category.defaultGstRate : 18)
    setIsRcmDefault(Boolean(category.isRcmDefault))
    setItcClassification(category.itcClassification || 'Input Services')
    setIsAddDialogOpen(true)
  }

  const handleSaveExpenseType = () => {
    if (isLocked) {
      toast.error('Cannot save in locked mode', {
        description: 'Unlock data in Settings to make changes'
      })
      return
    }

    if (!name.trim()) {
      toast.error('Please enter expense category name')
      return
    }

    const payload: ExpenseCategory = {
      id: editingItem ? editingItem.id : `exp-cat-${Date.now()}`,
      name: name.trim(),
      description: description.trim() || undefined,
      costLinkingType: linkType === 'invoice' ? 'invoice_landed' : 'net_profit',
      linkType,
      isGstApplicable,
      defaultSacCode: isGstApplicable ? (defaultSacCode.trim() || undefined) : undefined,
      defaultGstRate: isGstApplicable ? defaultGstRate : 0,
      isRcmDefault: isGstApplicable ? isRcmDefault : false,
      itcClassification: isGstApplicable ? itcClassification : 'Ineligible'
    }

    if (editingItem) {
      setExpenseTypes((prev) => prev.map(et => et.id === editingItem.id ? payload : et))
      toast.success('Expense category updated successfully')
    } else {
      setExpenseTypes((prev) => [...prev, payload])
      toast.success('Expense category added successfully')
    }

    setIsAddDialogOpen(false)
    resetForm()
  }

  const getExpenseEntriesCount = (expenseTypeId: string) => {
    return expenseEntries.filter(entry => entry.expenseTypeId === expenseTypeId || entry.categoryId === expenseTypeId).length
  }

  const handleDeleteClick = (expenseType: ExpenseType) => {
    if (isLocked) {
      toast.error('Cannot delete in locked mode', {
        description: 'Unlock data in Settings to make changes'
      })
      return
    }

    const count = getExpenseEntriesCount(expenseType.id)
    if (count > 0) {
      setExpenseTypeToDelete(expenseType)
      setDeleteAlertOpen(true)
      return
    }

    setExpenseTypes((prev) => prev.filter(et => et.id !== expenseType.id))
    toast.success('Expense category deleted')
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100">
            <SlidersHorizontal className="h-6 w-6" weight="duotone" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Expense Category Master</h1>
            <p className="text-xs text-slate-500 mt-0.5">Master-Child statutory configuration for GST, RCM, and Cost Linking</p>
          </div>
        </div>

        <Dialog open={isAddDialogOpen} onOpenChange={(v) => {
          setIsAddDialogOpen(v)
          if (!v) resetForm()
        }}>
          <DialogTrigger asChild>
            <Button
              disabled={isLocked}
              onClick={() => resetForm()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-9 px-5 rounded-xl text-xs shadow-md shadow-indigo-600/20"
            >
              <Plus className="mr-1.5 h-4 w-4" weight="bold" />
              Add Expense Category
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2 text-slate-900">
                <Receipt className="h-5 w-5 text-indigo-600" weight="duotone" />
                {editingItem ? `Edit Category: ${editingItem.name}` : 'Add Expense Category Master'}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Configure accounting behavior, GST rate, and RCM defaults for this expense ledger
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 text-xs">
              
              {/* Category Name */}
              <div className="space-y-1.5">
                <Label htmlFor="name" className="font-bold text-slate-700">Category Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Freight & Transportation, Machinery Repairs, Godown Rent"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-9 text-xs font-semibold"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label htmlFor="description" className="font-bold text-slate-700">Description / Ledger Notes</Label>
                <Textarea
                  id="description"
                  placeholder="Optional details or internal accounting instructions..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="text-xs bg-white min-h-[50px]"
                />
              </div>

              {/* Cost Linking Mode */}
              <div className="space-y-2">
                <Label className="font-bold text-slate-700">Cost Linking Type *</Label>
                <Tabs value={linkType} onValueChange={(v) => setLinkType(v as 'invoice' | 'netprofit')}>
                  <TabsList className="grid w-full grid-cols-2 h-9 p-1">
                    <TabsTrigger value="netprofit" className="text-xs font-bold gap-1.5">
                      <TrendDown size={14} weight="bold" />
                      Net Profit (Overhead)
                    </TabsTrigger>
                    <TabsTrigger value="invoice" className="text-xs font-bold gap-1.5">
                      <LinkSimple size={14} weight="bold" />
                      Invoice Landed Cost
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="netprofit" className="mt-2 text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    Deducted as operational expense from Net Profit in P&L reporting
                  </TabsContent>
                  <TabsContent value="invoice" className="mt-2 text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    Linked to specific purchase invoices to compute true landed procurement cost
                  </TabsContent>
                </Tabs>
              </div>

              {/* Master Statutory GST Defaults */}
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs font-bold text-indigo-950 block">GST Applicable by Default</Label>
                    <span className="text-[10px] text-slate-500">Auto-enables tax calculations when creating vouchers</span>
                  </div>
                  <Switch
                    checked={isGstApplicable}
                    onCheckedChange={setIsGstApplicable}
                    id="master-gst-switch"
                  />
                </div>

                {isGstApplicable && (
                  <div className="space-y-3 pt-2 border-t border-indigo-100/80 animate-in fade-in duration-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold text-slate-700">Default SAC Code</Label>
                        <div className="flex items-center gap-1">
                          <Input
                            placeholder="9965"
                            value={defaultSacCode}
                            onChange={(e) => setDefaultSacCode(e.target.value.trim())}
                            className="h-8 text-xs font-mono font-bold w-20 bg-white"
                          />
                          <Select onValueChange={(val) => setDefaultSacCode(val)}>
                            <SelectTrigger className="h-8 text-[11px] flex-1 truncate bg-white">
                              <SelectValue placeholder="SAC" />
                            </SelectTrigger>
                            <SelectContent>
                              {COMMON_HSN_SAC_CODES.map(s => (
                                <SelectItem key={s.code} value={s.code} className="text-xs">{s.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold text-slate-700">Default GST Rate (%)</Label>
                        <Select value={String(defaultGstRate)} onValueChange={(val) => setDefaultGstRate(Number(val))}>
                          <SelectTrigger className="h-8 text-xs font-bold font-mono bg-white">
                            <SelectValue placeholder="18%" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">0% (Exempt)</SelectItem>
                            <SelectItem value="5">5% (Transport / Basic)</SelectItem>
                            <SelectItem value="12">12% (Standard Concession)</SelectItem>
                            <SelectItem value="18">18% (Standard 18%)</SelectItem>
                            <SelectItem value="28">28% (Luxury)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center pt-1">
                      <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-indigo-100">
                        <Switch
                          checked={isRcmDefault}
                          onCheckedChange={setIsRcmDefault}
                          id="master-rcm-switch"
                        />
                        <Label htmlFor="master-rcm-switch" className="text-[11px] font-bold text-amber-900 cursor-pointer">
                          RCM Default (Section 9(3))
                        </Label>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold text-slate-700">Default GSTR-3B ITC</Label>
                        <Select value={itcClassification} onValueChange={(val: any) => setItcClassification(val)}>
                          <SelectTrigger className="h-8 text-[11px] font-medium bg-white">
                            <SelectValue placeholder="Input Services" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Input Services">Input Services</SelectItem>
                            <SelectItem value="Inputs / Consumables">Inputs / Consumables</SelectItem>
                            <SelectItem value="Capital Goods">Capital Goods</SelectItem>
                            <SelectItem value="Ineligible">Ineligible (Blocked)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="pt-2 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={() => setIsAddDialogOpen(false)} className="h-8 text-xs font-semibold">
                Cancel
              </Button>
              <Button onClick={handleSaveExpenseType} size="sm" className="h-8 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs">
                {editingItem ? 'Update Category' : 'Save Category Master'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Category List */}
      <Card className="rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <CardHeader className="bg-slate-50/50 pb-4">
          <CardTitle className="text-sm font-bold text-slate-900">Configured Expense Categories</CardTitle>
          <CardDescription className="text-xs">Master ledger categories and statutory presets</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {expenseTypes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Receipt size={48} className="mx-auto mb-4 opacity-50" />
              <p className="font-bold text-slate-700">No expense categories configured yet</p>
              <p className="text-xs text-slate-400 mt-1">Add expense categories to track costs and GST compliance</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-[#edf3fc]">
                <TableRow className="border-b border-slate-200/80">
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3">Category Name</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3">Cost Linking</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3">GST & SAC Preset</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3">GSTR-3B ITC</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3 text-center">Vouchers</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-700 py-3 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenseTypes.map((et) => {
                  const entriesCount = getExpenseEntriesCount(et.id)
                  const isInv = et.linkType === 'invoice' || et.costLinkingType === 'invoice_landed'

                  return (
                    <TableRow key={et.id} className="hover:bg-slate-50/80 border-b border-slate-100">
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-bold text-xs text-slate-900">{et.name}</span>
                          {et.description && (
                            <span className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{et.description}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {isInv ? (
                          <Badge variant="outline" className="text-[10px] font-bold bg-blue-50 text-blue-700 border-blue-200 gap-1">
                            <LinkSimple size={12} weight="bold" />
                            Invoice Landed Cost
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] font-bold bg-slate-50 text-slate-700 border-slate-200 gap-1">
                            <TrendDown size={12} weight="bold" />
                            Net Profit Overhead
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {et.isGstApplicable !== false ? (
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border-emerald-200">
                              {et.defaultSacCode ? `SAC ${et.defaultSacCode}` : 'GST'} | {typeof et.defaultGstRate === 'number' ? et.defaultGstRate : 18}%
                            </Badge>
                            {et.isRcmDefault && (
                              <Badge variant="outline" className="text-[9px] font-bold bg-amber-50 text-amber-800 border-amber-200">
                                RCM 9(3)
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Non-GST / Exempt</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-medium text-slate-600">
                        {et.isGstApplicable !== false ? (et.itcClassification || 'Input Services') : '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={entriesCount > 0 ? "secondary" : "outline"} className="text-xs font-mono font-bold">
                          {entriesCount}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleStartEdit(et)}
                            className="h-7 w-7 p-0 text-slate-500 hover:text-indigo-600"
                          >
                            <PencilSimple size={15} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteClick(et)}
                            className="h-7 w-7 p-0 text-slate-500 hover:text-destructive"
                          >
                            <Trash size={15} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteAlertOpen} onOpenChange={setDeleteAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10">
                <Warning className="text-destructive" weight="duotone" size={24} />
              </div>
              <AlertDialogTitle>Cannot Delete Expense Category</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="space-y-3 text-xs">
              <p>
                The expense category <strong>"{expenseTypeToDelete?.name}"</strong> cannot be deleted because it has{' '}
                <strong>{expenseTypeToDelete ? getExpenseEntriesCount(expenseTypeToDelete.id) : 0} expense vouchers</strong>{' '}
                associated with it.
              </p>
              <p className="text-foreground font-medium">
                To delete this category:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>Go to the Expense Entries page</li>
                <li>Delete or reassign vouchers using this category</li>
                <li>Return here to delete the category master</li>
              </ol>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setDeleteAlertOpen(false)
              setExpenseTypeToDelete(null)
            }}>
              Close
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
