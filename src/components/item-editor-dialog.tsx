import { useEffect, useState } from 'react'
import { Item } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { CaretDown, Check, MagnifyingGlass, Package, Plus, Scales, SquaresFour } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { getCustomCategories, saveCustomCategory, getCustomUnits, saveCustomUnit } from '@/lib/custom-data-store'
import { getFYStart } from '@/lib/calculations'

interface ItemEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: Item | null
  existingItems?: Item[]
  onSave: (item: Item) => void
  activeCompanyId?: string
}

const GST_OPTIONS = [
  { label: 'None', value: 'none', rate: undefined },
  { label: 'Exempted', value: 'exempted', rate: 0 },
  { label: 'GST @ 0%', value: '0', rate: 0 },
  { label: 'GST @ 0.1%', value: '0.1', rate: 0.1 },
  { label: 'GST @ 0.25%', value: '0.25', rate: 0.25 },
  { label: 'GST @ 1.5%', value: '1.5', rate: 1.5 },
  { label: 'GST @ 3%', value: '3', rate: 3 },
  { label: 'GST @ 5%', value: '5', rate: 5 },
  { label: 'GST @ 6%', value: '6', rate: 6 },
  { label: 'GST @ 8.9%', value: '8.9', rate: 8.9 },
  { label: 'GST @ 12%', value: '12', rate: 12 },
  { label: 'GST @ 13.8%', value: '13.8', rate: 13.8 },
  { label: 'GST @ 18%', value: '18', rate: 18 },
  { label: 'GST @ 14% + cess @ 12%', value: '14-cess-12', rate: 14 },
  { label: 'GST @ 28%', value: '28', rate: 28 },
  { label: 'GST @ 28% + Cess @ 5%', value: '28-cess-5', rate: 28 },
  { label: 'GST @ 40%', value: '40', rate: 40 },
  { label: 'GST @ 28% + Cess @ 36%', value: '28-cess-36', rate: 28 },
  { label: 'GST @ 28% + Cess @ 60%', value: '28-cess-60', rate: 28 }
]

export function ItemEditorDialog({
  open,
  onOpenChange,
  item,
  existingItems = [],
  onSave,
  activeCompanyId
}: ItemEditorDialogProps) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [gstRate, setGstRate] = useState('none')
  const [gstDropdownOpen, setGstDropdownOpen] = useState(false)
  const [purchasePrice, setPurchasePrice] = useState('')
  const [salesPrice, setSalesPrice] = useState('')
  const [unit, setUnit] = useState('NONE')
  const [alternativeUnit, setAlternativeUnit] = useState('NONE')
  const [primaryUnitRatio, setPrimaryUnitRatio] = useState('1')
  const [alternativeUnitRatio, setAlternativeUnitRatio] = useState('1')
  const [unitWeightKG, setUnitWeightKG] = useState('1000')
  const [openingStock, setOpeningStock] = useState('')
  const [openingStockDate, setOpeningStockDate] = useState(getFYStart())

  // Reactive Custom Categories & Units State
  const [customCategories, setCustomCategories] = useState<string[]>(() => getCustomCategories(activeCompanyId))
  const [customUnits, setCustomUnits] = useState<{ value: string; label: string }[]>(() => getCustomUnits(activeCompanyId))

  const [addCatDialogOpen, setAddCatDialogOpen] = useState(false)
  const [newCatName, setNewCatName] = useState('')

  const [addUnitDialogOpen, setAddUnitDialogOpen] = useState(false)
  const [newUnitCode, setNewUnitCode] = useState('')
  const [newUnitLabel, setNewUnitLabel] = useState('')

  useEffect(() => {
    const syncCategories = () => setCustomCategories(getCustomCategories(activeCompanyId))
    const syncUnits = () => setCustomUnits(getCustomUnits(activeCompanyId))
    syncCategories()
    syncUnits()
    window.addEventListener('custom-categories-updated', syncCategories)
    window.addEventListener('custom-units-updated', syncUnits)
    return () => {
      window.removeEventListener('custom-categories-updated', syncCategories)
      window.removeEventListener('custom-units-updated', syncUnits)
    }
  }, [activeCompanyId])

  useEffect(() => {
    if (!open) return
    setCustomCategories(getCustomCategories(activeCompanyId))
    setCustomUnits(getCustomUnits(activeCompanyId))
    setName(item?.name || '')
    setCategory(item?.category || '')
    setGstRate(typeof item?.gstRate === 'number' ? item.gstRate.toString() : 'none')
    setPurchasePrice(item?.purchasePrice?.toString() || '')
    setSalesPrice(item?.salesPrice?.toString() || '')
    const initialUnit = item?.unit || 'NONE'
    const initialAlt = item?.alternativeUnit || 'NONE'
    setUnit(initialUnit)
    setAlternativeUnit(initialAlt)
    
    const defaultPrimRatio = item?.primaryUnitRatio?.toString() || ((initialUnit === 'KG' && initialAlt === 'MT') ? '1000' : '1')
    const defaultAltRatio = item?.alternativeUnitRatio?.toString() || '1'
    setPrimaryUnitRatio(defaultPrimRatio)
    setAlternativeUnitRatio(defaultAltRatio)
    setUnitWeightKG(
      item?.conversionFactor?.toString() ||
      (initialUnit === 'MT' || initialAlt === 'MT' ? '1000' : (initialUnit === 'KG' ? '1' : '1'))
    )
    setOpeningStock(item?.openingStock?.toString() || '')
    setOpeningStockDate(item?.openingStockDate || getFYStart())
  }, [open, item])

  // Combine items categories & units
  const availableCategories = Array.from(
    new Set([
      ...customCategories,
      ...existingItems.map(i => i.category).filter((c): c is string => Boolean(c))
    ])
  )

  const handleCreateCategory = () => {
    const clean = newCatName.trim()
    if (!clean) return
    const updated = saveCustomCategory(clean, activeCompanyId)
    setCustomCategories(updated)
    setCategory(clean)
    setNewCatName('')
    setAddCatDialogOpen(false)
    toast.success(`Category "${clean}" created`)
  }

  const handleCreateUnit = () => {
    const code = newUnitCode.trim().toUpperCase()
    const label = newUnitLabel.trim() || code
    if (!code) return
    const updated = saveCustomUnit(code, label, activeCompanyId)
    setCustomUnits(updated)
    setUnit(code)
    setNewUnitCode('')
    setNewUnitLabel('')
    setAddUnitDialogOpen(false)
    toast.success(`Unit "${code}" added successfully`)
  }

  const selectedGstOption = GST_OPTIONS.find((option) => option.value === gstRate) || GST_OPTIONS[0]
  const parsedGstRate = selectedGstOption.rate

  const handleUnitChange = (newUnit: string) => {
    setUnit(newUnit)
    if (newUnit === 'MT') {
      setUnitWeightKG('1000')
    } else if (newUnit === 'KG') {
      setUnitWeightKG('1')
    } else {
      if (!unitWeightKG || unitWeightKG === '1000') {
        setUnitWeightKG('1')
      }
    }
  }

  const handleSave = () => {
    const cleanName = name.trim()

    if (!cleanName) {
      toast.error('Item name is required')
      return
    }

    const duplicate = existingItems.some((candidate) => (
      candidate.id !== item?.id &&
      candidate.name.trim().toLowerCase() === cleanName.toLowerCase()
    ))

    if (duplicate) {
      toast.error('Item already exists')
      return
    }

    const parsedOpeningStock = parseFloat(openingStock) || 0
    const parsedPurchasePrice = parseFloat(purchasePrice) || 0

    if (parsedOpeningStock > 0 && parsedPurchasePrice <= 0) {
      toast.error('Purchased price is required when opening stock is specified')
      return
    }

    const primRatio = parseFloat(primaryUnitRatio) || 1
    const altRatio = parseFloat(alternativeUnitRatio) || 1
    const parsedWeightKG = parseFloat(unitWeightKG) || 1
    
    let conversionFactor = 1
    if (alternativeUnit && alternativeUnit !== 'NONE') {
      if (unit === 'KG' && alternativeUnit === 'MT') {
        conversionFactor = primRatio > 0 && altRatio > 0 ? (primRatio / altRatio) : 1000
      } else if (unit === 'MT' && alternativeUnit === 'KG') {
        conversionFactor = primRatio > 0 && altRatio > 0 ? (altRatio / primRatio) : 1000
      } else {
        conversionFactor = primRatio > 0 && altRatio > 0 ? (primRatio / altRatio) : 1
      }
    } else if (unit === 'MT') {
      conversionFactor = 1000
    } else if (unit === 'KG') {
      conversionFactor = 1
    } else {
      conversionFactor = parsedWeightKG || 1
    }

    onSave({
      ...(item || {}),
      id: item?.id || `item-${Date.now()}`,
      name: cleanName,
      unit,
      alternativeUnit: alternativeUnit === 'NONE' ? undefined : alternativeUnit,
      primaryUnitRatio: primRatio,
      alternativeUnitRatio: altRatio,
      conversionFactor,
      category: category.trim() || undefined,
      purchasePrice: parsedPurchasePrice || undefined,
      salesPrice: parseFloat(salesPrice) || undefined,
      gstRate: typeof parsedGstRate === 'number' && Number.isFinite(parsedGstRate) ? parsedGstRate : undefined,
      openingStock: parsedOpeningStock > 0 ? parsedOpeningStock : undefined,
      openingStockDate: parsedOpeningStock > 0 ? openingStockDate : undefined,
      openingValue: (parsedOpeningStock > 0 && parsedPurchasePrice > 0) ? (parsedOpeningStock * parsedPurchasePrice) : item?.openingValue
    })
    onOpenChange(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[min(760px,calc(100vw-2rem))] max-h-[85dvh] overflow-y-auto p-0">
          <DialogHeader className="border-b border-border px-6 py-4 bg-slate-50/50">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold text-slate-800">
              <Package size={24} className="text-blue-600" weight="duotone" />
              {item ? 'Edit Item' : 'Create New Items'}
            </DialogTitle>
          </DialogHeader>

          <div className="p-6 space-y-5">
            {/* Header Badge */}
            <div className="flex items-center justify-between rounded-lg bg-blue-50/80 border border-blue-100 px-4 py-2.5">
              <span className="text-sm font-bold text-blue-800">Basic Details *</span>
              <span className="text-xs text-blue-600 font-medium">Configure pricing, GST, categories & measuring units</span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
              
              {/* ROW 1: Item Name & Category (Show Category in dropdown) */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="sharedItemName" className="font-semibold text-slate-700">
                    Items Names <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="sharedItemName"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="ex: TMT Bar 12mm"
                    className="h-11 border-slate-300 font-medium"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="sharedItemCategory" className="font-semibold text-slate-700">
                      Show Category in dropdown
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setAddCatDialogOpen(true)}
                      className="h-6 px-2 text-xs font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    >
                      <Plus size={12} className="mr-1" weight="bold" /> Add Category
                    </Button>
                  </div>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger id="sharedItemCategory" className="h-11 border-slate-300">
                      <SelectValue placeholder="Select Category" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {availableCategories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* ROW 2: Purchased Prices & Sales Price */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="sharedItemPurchasePrice" className="font-semibold text-slate-700">
                    Purchased Prices {(parseFloat(openingStock) || 0) > 0 ? <span className="text-destructive">*</span> : null}
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-slate-400 font-mono">₹</span>
                    <Input
                      id="sharedItemPurchasePrice"
                      type="number"
                      step="0.01"
                      min="0"
                      value={purchasePrice}
                      onChange={(event) => setPurchasePrice(event.target.value)}
                      placeholder="ex: 200"
                      className={cn(
                        "h-11 pl-7 font-mono border-slate-300",
                        ((parseFloat(openingStock) || 0) > 0 && (parseFloat(purchasePrice) || 0) <= 0) && "border-destructive focus-visible:ring-destructive"
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sharedItemSalesPrice" className="font-semibold text-slate-700">
                    Sales Price
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-slate-400 font-mono">₹</span>
                    <Input
                      id="sharedItemSalesPrice"
                      type="number"
                      step="0.01"
                      min="0"
                      value={salesPrice}
                      onChange={(event) => setSalesPrice(event.target.value)}
                      placeholder="ex: 250"
                      className="h-11 pl-7 font-mono border-slate-300"
                    />
                  </div>
                </div>
              </div>

              {/* ROW 3: GST Rates % & Opening Stocks */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="sharedItemGstRate" className="font-semibold text-slate-700">
                    GST Rates %
                  </Label>
                  <Popover open={gstDropdownOpen} onOpenChange={setGstDropdownOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        id="sharedItemGstRate"
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={gstDropdownOpen}
                        className="h-11 w-full justify-between rounded-xl border-slate-300 bg-background px-3 text-left font-normal shadow-2xs hover:bg-background"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <MagnifyingGlass size={16} className="shrink-0 text-slate-400" />
                          <span className="truncate text-sm font-medium text-slate-800">{selectedGstOption.label}</span>
                        </span>
                        <CaretDown size={16} className="shrink-0 text-slate-400" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-xl border-slate-200 p-0 shadow-xl"
                    >
                      <Command>
                        <CommandInput placeholder="Search GST rate..." className="text-sm" />
                        <CommandList className="max-h-[260px]">
                          <CommandEmpty>No GST rate found.</CommandEmpty>
                          <CommandGroup className="p-0">
                            {GST_OPTIONS.map((option) => (
                              <CommandItem
                                key={option.value}
                                value={option.label}
                                onSelect={() => {
                                  setGstRate(option.value)
                                  setGstDropdownOpen(false)
                                }}
                                className="rounded-none border-b border-slate-100 px-4 py-3 text-sm text-slate-600 last:border-b-0 data-[selected=true]:bg-blue-50 data-[selected=true]:text-blue-900"
                              >
                                <Check
                                  size={16}
                                  className={cn(
                                    'mr-1 text-blue-600',
                                    option.value === selectedGstOption.value ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                                {option.label}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sharedItemOpeningStock" className="font-semibold text-slate-700">
                    Opening Stocks
                  </Label>
                  <Input
                    id="sharedItemOpeningStock"
                    type="number"
                    step="0.001"
                    min="0"
                    value={openingStock}
                    onChange={(event) => setOpeningStock(event.target.value)}
                    placeholder={`ex: 150 ${unit}`}
                    className="h-11 font-mono border-slate-300"
                  />
                </div>
              </div>

              {(parseFloat(openingStock) || 0) > 0 && (
                <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50/60 animate-in fade-in duration-200">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="sharedItemOpeningStockDate" className="text-xs font-bold text-slate-700">
                      Opening Stock As-On Date <span className="text-destructive">*</span>
                    </Label>
                    <p className="text-[10px] text-slate-500">The date from which this opening stock is effective (typically start of financial year)</p>
                    <Input
                      id="sharedItemOpeningStockDate"
                      type="date"
                      value={openingStockDate}
                      onChange={(event) => setOpeningStockDate(event.target.value)}
                      className="h-8 text-xs bg-white"
                      required
                    />
                  </div>
                </div>
              )}

              {/* ROW 4: ADD UNIT BTN Section (Measuring Unit & Alternate Unit & Base Unit in KG) */}
              <div className="pt-2 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Scales size={18} className="text-emerald-600" weight="bold" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600">UNIT & BASE UNIT (KG) CONFIGURATION</span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAddUnitDialogOpen(true)}
                    className="h-7 border-emerald-300 text-emerald-700 bg-emerald-50/50 hover:bg-emerald-100 text-xs font-bold rounded-lg"
                  >
                    <Plus size={13} className="mr-1" weight="bold" /> Add Custom Unit
                  </Button>
                </div>

                {/* Base Unit Info Banner */}
                <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-emerald-600 text-white border-none font-bold text-[11px] px-2 py-0.5">
                      Base Unit: KG
                    </Badge>
                    <span className="text-emerald-900 font-medium">
                      All invoice linked expenses are divided by KG and allocated item-wise.
                    </span>
                  </div>
                  <span className="font-mono font-extrabold text-emerald-800">
                    1 {unit && unit !== 'NONE' ? unit : 'MT'} = {(unit === 'MT' || unit === 'NONE') ? '1,000' : (unit === 'KG' ? '1' : (parseFloat(unitWeightKG) || 1).toLocaleString())} KG
                  </span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="sharedItemUnit" className="font-semibold text-slate-700">
                      Measuring Unit
                    </Label>
                    <Select value={unit} onValueChange={handleUnitChange}>
                      <SelectTrigger id="sharedItemUnit" className="h-11 border-slate-300">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        <SelectItem value="NONE">None</SelectItem>
                        {customUnits.map((u) => (
                          <SelectItem key={u.value} value={u.value}>
                            {u.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="sharedItemAltUnit" className="font-semibold text-slate-700">
                      Alternate Unit
                    </Label>
                    <Select value={alternativeUnit} onValueChange={setAlternativeUnit}>
                      <SelectTrigger id="sharedItemAltUnit" className="h-11 border-slate-300">
                        <SelectValue placeholder="Select alternate unit" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        <SelectItem value="NONE">None</SelectItem>
                        {customUnits.map((u) => (
                          <SelectItem key={u.value} value={u.value}>
                            {u.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Item Weight in Base Unit (KG) Section */}
              <div className="p-4 bg-emerald-50/60 border border-emerald-200/90 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                    <Scales size={16} className="text-emerald-700" weight="bold" />
                    <span>Weight of 1 {unit} in Base Unit (KG)</span>
                  </Label>
                  <Badge variant="outline" className="bg-emerald-600 text-white border-none font-bold text-[10px] px-2 py-0.5 font-mono">
                    1 {unit} = {unit === 'MT' ? '1,000' : (unit === 'KG' ? '1' : (parseFloat(unitWeightKG) || 1).toLocaleString())} KG
                  </Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600 font-semibold">Weight per 1 {unit} (in KG)</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-700 min-w-[50px]">1 {unit} =</span>
                      <Input
                        type="number"
                        step="0.001"
                        min="0.001"
                        value={unit === 'KG' ? '1' : (unit === 'MT' ? '1000' : unitWeightKG)}
                        onChange={(e) => setUnitWeightKG(e.target.value)}
                        placeholder="e.g. 5.5"
                        className="h-10 font-mono text-right border-emerald-300 focus:border-emerald-600 bg-white font-bold text-emerald-900"
                        disabled={unit === 'KG' || unit === 'MT'}
                      />
                      <span className="font-bold text-sm text-emerald-800 min-w-[30px]">KG</span>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-600 leading-tight">
                    <span className="font-semibold text-slate-800">Note:</span> When buying or selling items in <span className="font-bold text-emerald-900">{unit}</span>, this weight in KGs is used to divide and allocate invoice freight & expenses item-wise.
                  </div>
                </div>
              </div>

              {/* ROW 5: Custom Unit Ratio when Alternate Unit is set */}
              {alternativeUnit !== 'NONE' && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center justify-between">
                    <span>Alternate Unit Ratio ({unit} ➔ {alternativeUnit})</span>
                    <span className="text-[11px] font-mono text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded font-semibold">
                      1 {unit} = {((parseFloat(alternativeUnitRatio) || 1) / (parseFloat(primaryUnitRatio) || 1)).toLocaleString()} {alternativeUnit}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                    {/* Primary Unit Quantity Input */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-slate-600">INPUT UNIT beside {unit}</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          step="0.001"
                          min="0.001"
                          value={primaryUnitRatio}
                          onChange={(e) => setPrimaryUnitRatio(e.target.value)}
                          className="h-10 font-mono text-right border-slate-300"
                        />
                        <span className="font-bold text-sm text-slate-700 min-w-[40px]">{unit}</span>
                      </div>
                    </div>

                    {/* Alternate Unit Quantity Input */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-slate-600">INPUT UNIT beside {alternativeUnit}</Label>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-400">=</span>
                        <Input
                          type="number"
                          step="0.001"
                          min="0.001"
                          value={alternativeUnitRatio}
                          onChange={(e) => setAlternativeUnitRatio(e.target.value)}
                          className="h-10 font-mono text-right border-slate-300"
                        />
                        <span className="font-bold text-sm text-slate-700 min-w-[40px]">{alternativeUnit}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6">
              {item ? 'Update Item' : 'Save Item'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* CREATE NEW CATEGORY DIALOG */}
      <Dialog open={addCatDialogOpen} onOpenChange={setAddCatDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SquaresFour size={20} className="text-blue-600" />
              Add New Category
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="newCategoryName">Category Name</Label>
            <Input
              id="newCategoryName"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="ex: Structural Steel"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateCategory()
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddCatDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateCategory} className="bg-blue-600 text-white font-bold">Add Category</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CREATE NEW UNIT DIALOG */}
      <Dialog open={addUnitDialogOpen} onOpenChange={setAddUnitDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scales size={20} className="text-emerald-600" />
              Add Custom Measuring Unit
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="newUnitCode">Unit Code (Short symbol) *</Label>
              <Input
                id="newUnitCode"
                value={newUnitCode}
                onChange={(e) => setNewUnitCode(e.target.value)}
                placeholder="ex: BAG, BUNDLE, BOX, LTR"
                className="font-mono uppercase"
              />
            </div>
            <div>
              <Label htmlFor="newUnitLabel">Unit Display Name</Label>
              <Input
                id="newUnitLabel"
                value={newUnitLabel}
                onChange={(e) => setNewUnitLabel(e.target.value)}
                placeholder="ex: Cement Bag, Steel Bundle"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddUnitDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateUnit} className="bg-emerald-600 text-white font-bold">Add Unit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
