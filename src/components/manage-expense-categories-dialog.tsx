import { useState } from 'react'
import { ExpenseCategory, ExpenseEntry } from '@/lib/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { SlidersHorizontal, PencilSimple, Trash, TrendDown, LinkSimple } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { saveEntityRemote, deleteEntityRemote } from '@/lib/firebase-storage'

export const QUICK_SAC_CODES = [
  { code: '9965', label: '9965 - Transport / Freight (GTA)', rate: 5, rcm: true },
  { code: '9972', label: '9972 - Real Estate Rent (Office/Godown)', rate: 18, rcm: false },
  { code: '9987', label: '9987 - Repairs & Machinery Maintenance', rate: 18, rcm: false },
  { code: '9983', label: '9983 - Professional & Legal Services', rate: 18, rcm: false },
  { code: '9967', label: '9967 - Loading & Handling Charges', rate: 18, rcm: false },
  { code: '9969', label: '9969 - Electricity & Utilities', rate: 0, rcm: false },
  { code: '9954', label: '9954 - Construction & Works Contract', rate: 18, rcm: false },
]

interface ManageExpenseCategoriesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  expenseTypes: ExpenseCategory[]
  setExpenseTypes?: (updater: (prev: ExpenseCategory[]) => ExpenseCategory[]) => void
  expenseEntries?: ExpenseEntry[]
  activeCompanyId?: string
  isLocked?: boolean
}

export function ManageExpenseCategoriesDialog({
  open,
  onOpenChange,
  expenseTypes = [],
  setExpenseTypes,
  expenseEntries = [],
  activeCompanyId,
  isLocked = false
}: ManageExpenseCategoriesDialogProps) {
  const [editingType, setEditingType] = useState<ExpenseCategory | null>(null)
  const [typeName, setTypeName] = useState('')
  const [typeDescription, setTypeDescription] = useState('')
  const [typeLinkType, setTypeLinkType] = useState<'invoice' | 'netprofit'>('netprofit')
  
  // Statutory Defaults
  const [isGstApplicable, setIsGstApplicable] = useState(false)
  const [defaultSacCode, setDefaultSacCode] = useState('')
  const [defaultGstRate, setDefaultGstRate] = useState<number>(18)
  const [isRcmDefault, setIsRcmDefault] = useState(false)
  const [itcClassification, setItcClassification] = useState<'Input Services' | 'Inputs / Consumables' | 'Capital Goods' | 'Ineligible'>('Input Services')

  const resetForm = () => {
    setEditingType(null)
    setTypeName('')
    setTypeDescription('')
    setTypeLinkType('netprofit')
    setIsGstApplicable(false)
    setDefaultSacCode('')
    setDefaultGstRate(18)
    setIsRcmDefault(false)
    setItcClassification('Input Services')
  }

  const handleStartEdit = (category: ExpenseCategory) => {
    setEditingType(category)
    setTypeName(category.name)
    setTypeDescription(category.description || '')
    setTypeLinkType(category.linkType || (category.costLinkingType === 'invoice_landed' ? 'invoice' : 'netprofit'))
    setIsGstApplicable(Boolean(category.isGstApplicable))
    setDefaultSacCode(category.defaultSacCode || '')
    setDefaultGstRate(typeof category.defaultGstRate === 'number' ? category.defaultGstRate : 18)
    setIsRcmDefault(Boolean(category.isRcmDefault))
    setItcClassification(category.itcClassification || 'Input Services')
  }

  const handleSaveCategory = () => {
    if (isLocked) {
      toast.error('Cannot save in locked mode')
      return
    }

    if (!typeName.trim()) {
      toast.error('Enter category name')
      return
    }

    const payload: ExpenseCategory = {
      id: editingType ? editingType.id : `exp-cat-${Date.now()}`,
      name: typeName.trim(),
      description: typeDescription.trim() || undefined,
      costLinkingType: typeLinkType === 'invoice' ? 'invoice_landed' : 'net_profit',
      linkType: typeLinkType,
      isGstApplicable,
      defaultSacCode: isGstApplicable ? (defaultSacCode.trim() || undefined) : undefined,
      defaultGstRate: isGstApplicable ? defaultGstRate : 0,
      isRcmDefault: isGstApplicable ? isRcmDefault : false,
      itcClassification: isGstApplicable ? itcClassification : 'Ineligible'
    }

    if (editingType) {
      const updated = expenseTypes.map(t => t.id === editingType.id ? payload : t)
      setExpenseTypes?.(() => updated)
      if (activeCompanyId) void saveEntityRemote(activeCompanyId, 'expenseTypes', payload)
      toast.success('Expense category updated')
    } else {
      setExpenseTypes?.((prev) => [...prev, payload])
      if (activeCompanyId) void saveEntityRemote(activeCompanyId, 'expenseTypes', payload)
      toast.success('Expense category created')
    }

    resetForm()
  }

  const handleDeleteCategory = (catId: string) => {
    if (isLocked) {
      toast.error('Cannot delete in locked mode')
      return
    }

    const isInUse = expenseEntries.some(e => e.expenseTypeId === catId || e.categoryId === catId)
    if (isInUse) {
      toast.error('Cannot delete category in use by existing vouchers')
      return
    }

    const updated = expenseTypes.filter(x => x.id !== catId)
    setExpenseTypes?.(() => updated)
    if (activeCompanyId) void deleteEntityRemote(activeCompanyId, 'expenseTypes', catId)
    toast.success('Category removed')
    if (editingType?.id === catId) resetForm()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => {
      onOpenChange(v)
      if (!v) resetForm()
    }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2 text-slate-900">
            <SlidersHorizontal className="h-5 w-5 text-indigo-600" weight="duotone" />
            Manage Expense Categories (Master Setup)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          
          {/* Add / Edit Category Master Card */}
          <div className="space-y-3.5 p-4 bg-slate-50/80 rounded-2xl border border-slate-200">
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-800">Category Name *</Label>
              <Input
                placeholder="e.g. Freight Inward, Godown Rent, Tea & Refreshment"
                value={typeName}
                onChange={(e) => setTypeName(e.target.value)}
                className="h-8.5 text-xs bg-white font-medium"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-800">Cost Linking Type *</Label>
              <Select value={typeLinkType} onValueChange={(val: any) => setTypeLinkType(val)}>
                <SelectTrigger className="h-8.5 text-xs bg-white font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="netprofit">Net Profit Overhead (Operational Expense)</SelectItem>
                  <SelectItem value="invoice">Invoice Landed Cost (Direct Purchase Freight/Handling)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* GST Applicable Toggle */}
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="dlg-gst-switch" className="text-xs font-bold text-slate-900 block cursor-pointer">
                    GST Applicable for this Category
                  </Label>
                  <span className="text-[10px] text-slate-500">
                    Enable for tax-invoiced services (Freight, Rent, Legal, Repairs)
                  </span>
                </div>
                <Switch
                  checked={isGstApplicable}
                  onCheckedChange={setIsGstApplicable}
                  id="dlg-gst-switch"
                />
              </div>

              {isGstApplicable && (
                <div className="space-y-3 pt-2.5 border-t border-slate-100 animate-in fade-in duration-150">
                  
                  {/* Default SAC Code */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-[11px] font-bold text-slate-700">Default SAC Code</Label>
                      <span className="text-[10px] text-slate-400">Quick selector</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Input
                        placeholder="9965"
                        value={defaultSacCode}
                        onChange={(e) => setDefaultSacCode(e.target.value.trim())}
                        className="h-8 text-xs font-mono font-bold w-24 bg-white"
                      />
                      <Select onValueChange={(val) => {
                        setDefaultSacCode(val)
                        const found = QUICK_SAC_CODES.find(q => q.code === val)
                        if (found) {
                          setDefaultGstRate(found.rate)
                          setIsRcmDefault(found.rcm)
                        }
                      }}>
                        <SelectTrigger className="h-8 text-[11px] flex-1 truncate bg-white font-medium">
                          <SelectValue placeholder="Select Common SAC..." />
                        </SelectTrigger>
                        <SelectContent>
                          {QUICK_SAC_CODES.map((s) => (
                            <SelectItem key={s.code} value={s.code} className="text-xs">
                              {s.label} ({s.rate}%)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Rate & RCM */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold text-slate-700">Default GST Rate</Label>
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

                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold text-slate-700">ITC Classification</Label>
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

                  {/* RCM Toggle */}
                  <div className="flex items-center gap-2 pt-1">
                    <Switch
                      checked={isRcmDefault}
                      onCheckedChange={setIsRcmDefault}
                      id="dlg-rcm-switch"
                    />
                    <Label htmlFor="dlg-rcm-switch" className="text-[11px] font-bold text-amber-900 cursor-pointer">
                      RCM Applicable by Default (e.g. Freight / GTA Section 9(3))
                    </Label>
                  </div>

                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              {editingType && (
                <Button type="button" variant="outline" size="sm" onClick={resetForm} className="h-8 text-xs font-semibold">
                  Cancel
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                onClick={handleSaveCategory}
                className="flex-1 h-8 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
              >
                {editingType ? 'Update Category' : 'Save Category Master'}
              </Button>
            </div>
          </div>

          {/* Existing Categories List */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-slate-700">Existing Categories ({expenseTypes.length})</Label>
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {expenseTypes.map((t) => {
                const isInv = t.linkType === 'invoice' || t.costLinkingType === 'invoice_landed'
                return (
                  <div key={t.id} className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-white text-xs hover:border-slate-300 transition-colors">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{t.name}</span>
                        {t.isGstApplicable ? (
                          <Badge variant="outline" className="text-[9px] font-mono font-bold bg-emerald-50 text-emerald-700 border-emerald-200">
                            {t.defaultSacCode ? `SAC ${t.defaultSacCode}` : 'GST'} | {t.defaultGstRate ?? 18}%
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] bg-slate-50 text-slate-500 border-slate-200">
                            Non-GST
                          </Badge>
                        )}
                        {t.isRcmDefault && (
                          <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-800 border-amber-200">
                            RCM
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {isInv ? 'Direct Landed Cost (Invoice)' : 'Overhead (Net Profit)'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleStartEdit(t)}
                        className="h-7 w-7 text-slate-500 hover:text-indigo-600"
                      >
                        <PencilSimple className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteCategory(t.id)}
                        className="h-7 w-7 text-slate-500 hover:text-red-600"
                      >
                        <Trash className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

        </div>

        <DialogFooter className="pt-2 border-t border-slate-100">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="h-8.5 text-xs font-semibold">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
