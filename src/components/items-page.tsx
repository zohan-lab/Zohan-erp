import { useEffect, useState, useMemo } from 'react'
import { Item, PurchaseInvoice, SalesInvoice, PurchaseReturn, SalesReturn } from '@/lib/types'
import { calculateItemStockMap } from '@/lib/report-calculations'
import { getItemConversionFactor } from '@/lib/unit-conversion-service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Package, Trash, Pencil, Warning, SquaresFour, Scales, Folder, Check, X } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { deleteItem } from '@/lib/firebase-storage'
import { ItemEditorDialog } from '@/components/item-editor-dialog'
import { 
  getCustomCategories, 
  saveCustomCategory, 
  updateCustomCategory, 
  deleteCustomCategory, 
  getCustomUnits, 
  saveCustomUnit, 
  updateCustomUnit, 
  deleteCustomUnit 
} from '@/lib/custom-data-store'

interface ItemsPageProps {
  items: Item[]
  setItems: (updater: (prev: Item[]) => Item[]) => void
  purchaseInvoices?: PurchaseInvoice[]
  salesInvoices?: SalesInvoice[]
  purchaseReturns?: PurchaseReturn[]
  salesReturns?: SalesReturn[]
  isLocked?: boolean
  activeCompanyId?: string
}

export default function ItemsPage({
  items,
  setItems,
  purchaseInvoices = [],
  salesInvoices = [],
  purchaseReturns = [],
  salesReturns = [],
  isLocked = false,
  activeCompanyId
}: ItemsPageProps) {
  const [open, setOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Item | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<Item | null>(null)

  const stockMap = useMemo(() => {
    return calculateItemStockMap(items, purchaseInvoices, salesInvoices, purchaseReturns, salesReturns)
  }, [items, purchaseInvoices, salesInvoices, purchaseReturns, salesReturns])

  // Custom Category & Unit Manager Modals State
  const [customCategories, setCustomCategories] = useState<string[]>(() => getCustomCategories(activeCompanyId))
  const [customUnits, setCustomUnits] = useState<{ value: string; label: string }[]>(() => getCustomUnits(activeCompanyId))

  const [addCatDialogOpen, setAddCatDialogOpen] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [editingCatName, setEditingCatName] = useState<string | null>(null)
  const [editCatInputValue, setEditCatInputValue] = useState('')

  const [addUnitDialogOpen, setAddUnitDialogOpen] = useState(false)
  const [newUnitCode, setNewUnitCode] = useState('')
  const [newUnitLabel, setNewUnitLabel] = useState('')
  const [editingUnitCode, setEditingUnitCode] = useState<string | null>(null)
  const [editUnitCodeVal, setEditUnitCodeVal] = useState('')
  const [editUnitLabelVal, setEditUnitLabelVal] = useState('')

  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all')

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

  const isItemLinked = (itemId: string): boolean => {
    const inPurchase = purchaseInvoices.some(inv => (inv.items || []).some(i => i.itemId === itemId))
    if (inPurchase) return true
    const inSales = salesInvoices.some(inv => (inv.items || []).some(i => i.itemId === itemId))
    if (inSales) return true
    const inPurReturn = purchaseReturns.some(ret => (ret.items || []).some(i => i.itemId === itemId))
    if (inPurReturn) return true
    const inSalesReturn = salesReturns.some(ret => (ret.items || []).some(i => i.itemId === itemId))
    if (inSalesReturn) return true
    return false
  }

  const handleDeleteClick = (item: Item) => {
    if (isLocked) {
      toast.error('Cannot delete in locked mode', {
        description: 'Unlock the data in Settings to make changes'
      })
      return
    }

    if (isItemLinked(item.id)) {
      toast.error(`Cannot delete item "${item.name}"`, {
        description: 'This item is linked to existing invoices or returns and cannot be deleted.'
      })
      return
    }

    setItemToDelete(item)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = () => {
    if (itemToDelete) {
      setItems((prev) => prev.filter(item => item.id !== itemToDelete.id))
      if (activeCompanyId) {
        void deleteItem(activeCompanyId, itemToDelete.id)
      }
      toast.success('Item deleted successfully')
      setDeleteDialogOpen(false)
      setItemToDelete(null)
    }
  }

  const handleAdd = () => {
    if (isLocked) {
      toast.error('Cannot add in locked mode', {
        description: 'Unlock the data in Settings to make changes'
      })
      return
    }
    setEditingItem(null)
    setOpen(true)
  }

  const handleEdit = (item: Item) => {
    if (isLocked) {
      toast.error('Cannot edit in locked mode', {
        description: 'Unlock the data in Settings to make changes'
      })
      return
    }
    setEditingItem(item)
    setOpen(true)
  }

  const handleDialogClose = (isOpen: boolean) => {
    setOpen(isOpen)
    if (!isOpen) {
      setEditingItem(null)
    }
  }

  const handleSaveItem = (savedItem: Item) => {
    if (editingItem) {
      setItems((prev) => prev.map(item => item.id === savedItem.id ? savedItem : item))
      toast.success('Item updated successfully')
    } else {
      setItems((prev) => [...prev, savedItem])
      toast.success('Item added successfully')
    }
    setEditingItem(null)
  }

  const handleCreateCategory = () => {
    const clean = newCatName.trim()
    if (!clean) return
    const updated = saveCustomCategory(clean, activeCompanyId)
    setCustomCategories(updated)
    setNewCatName('')
    toast.success(`Category "${clean}" added!`)
  }

  const handleSaveCategoryEdit = (oldName: string) => {
    const clean = editCatInputValue.trim()
    if (!clean) return
    const updated = updateCustomCategory(oldName, clean, activeCompanyId)
    setCustomCategories(updated)
    setEditingCatName(null)
    setEditCatInputValue('')
    toast.success(`Category renamed to "${clean}"`)
  }

  const handleDeleteCategory = (catName: string) => {
    const isLinked = items.some(item => (item.category || '').trim().toLowerCase() === catName.trim().toLowerCase())
    if (isLinked) {
      toast.error(`Cannot delete category "${catName}"`, {
        description: 'This category is linked to existing items and cannot be deleted.'
      })
      return
    }

    if (!window.confirm(`Are you sure you want to delete category "${catName}"?`)) return

    const updated = deleteCustomCategory(catName, activeCompanyId)
    setCustomCategories(updated)
    toast.success(`Category "${catName}" deleted`)
  }

  const handleCreateUnit = () => {
    const code = newUnitCode.trim().toUpperCase()
    const label = newUnitLabel.trim() || code
    if (!code) return
    const updated = saveCustomUnit(code, label, activeCompanyId)
    setCustomUnits(updated)
    setNewUnitCode('')
    setNewUnitLabel('')
    toast.success(`Unit "${code}" added!`)
  }

  const handleSaveUnitEdit = (oldCode: string) => {
    const code = editUnitCodeVal.trim().toUpperCase()
    const label = editUnitLabelVal.trim() || code
    if (!code) return
    const updated = updateCustomUnit(oldCode, code, label, activeCompanyId)
    setCustomUnits(updated)
    setEditingUnitCode(null)
    setEditUnitCodeVal('')
    setEditUnitLabelVal('')
    toast.success(`Unit "${code}" updated`)
  }

  const handleDeleteUnit = (unitCode: string) => {
    const isLinked = items.some(
      item => item.unit?.toUpperCase() === unitCode.toUpperCase() || 
              item.alternativeUnit?.toUpperCase() === unitCode.toUpperCase()
    )

    if (isLinked) {
      toast.error(`Cannot delete unit "${unitCode}"`, {
        description: 'This unit is linked to existing items and cannot be deleted.'
      })
      return
    }

    if (!window.confirm(`Are you sure you want to delete measuring unit "${unitCode}"?`)) return

    const updated = deleteCustomUnit(unitCode, activeCompanyId)
    setCustomUnits(updated)
    toast.success(`Unit "${unitCode}" deleted`)
  }

  // Categories list combined from customCategories + assigned items categories
  const allCategoriesList = useMemo(() => {
    const itemCats = items.map(i => i.category).filter((c): c is string => Boolean(c))
    return Array.from(new Set([...customCategories, ...itemCats]))
  }, [customCategories, items])

  // Group items by category (Items under Category)
  const groupedItems = useMemo(() => {
    const map: Record<string, Item[]> = {}

    // First initialize empty arrays for all known categories
    allCategoriesList.forEach(cat => {
      map[cat] = []
    })

    // Assign items to their category
    items.forEach(item => {
      const cat = item.category || 'General'
      if (!map[cat]) map[cat] = []
      map[cat].push(item)
    })

    return map
  }, [allCategoriesList, items])

  // Filter categories to display
  const displayCategoryKeys = useMemo(() => {
    if (selectedCategoryFilter !== 'all') {
      return [selectedCategoryFilter]
    }
    // Show categories that have items first, then empty custom categories
    return Object.keys(groupedItems).sort((a, b) => {
      const countA = groupedItems[a]?.length || 0
      const countB = groupedItems[b]?.length || 0
      if (countA > 0 && countB === 0) return -1
      if (countA === 0 && countB > 0) return 1
      return a.localeCompare(b)
    })
  }, [groupedItems, selectedCategoryFilter])

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Item Master</h2>
          <p className="text-sm text-slate-500 mt-1">
            Items organized under Categories with pricing, GST %, and custom measuring units
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => setAddCatDialogOpen(true)}
            className="border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold"
          >
            <SquaresFour className="mr-1.5 h-4 w-4 text-blue-600" />
            Manage Categories
          </Button>
          <Button
            variant="outline"
            onClick={() => setAddUnitDialogOpen(true)}
            className="border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold"
          >
            <Scales className="mr-1.5 h-4 w-4 text-emerald-600" />
            Manage Units
          </Button>
          <Button onClick={handleAdd} className="bg-blue-600 hover:bg-blue-700 font-bold text-white shadow-2xs">
            <Plus className="mr-2" size={18} weight="bold" />
            Add Item
          </Button>
        </div>

        <ItemEditorDialog
          open={open}
          onOpenChange={handleDialogClose}
          item={editingItem}
          existingItems={items}
          onSave={handleSaveItem}
        />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-white border-slate-200">
          <CardContent className="p-5">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Items</div>
            <div className="text-3xl font-extrabold text-slate-900 font-mono">{items.length}</div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200">
          <CardContent className="p-5">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Active Categories</div>
            <div className="text-3xl font-extrabold text-blue-600 font-mono">{allCategoriesList.length}</div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="w-full">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Category Filter</div>
              <select
                value={selectedCategoryFilter}
                onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                className="w-full text-sm font-semibold bg-slate-100 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none"
              >
                <option value="all">All Categories ({items.length} items)</option>
                {allCategoriesList.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat} ({(groupedItems[cat] || []).length} items)
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SHOW ITEMS UNDER CATEGORY GROUPS */}
      {items.length === 0 ? (
        <Card className="bg-white border-slate-200">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package size={48} className="text-slate-300 mb-4" />
            <p className="text-slate-500 text-center font-medium">
              No items yet. Click "+ Add Item" to create your first item.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {displayCategoryKeys.map((catName) => {
            const categoryItems = groupedItems[catName] || []
            if (selectedCategoryFilter === 'all' && categoryItems.length === 0) {
              return null // Don't show empty categories when viewing 'all'
            }

            return (
              <Card key={catName} className="bg-white border border-slate-200 overflow-hidden shadow-2xs">
                {/* Category Header */}
                <CardHeader className="bg-slate-50 border-b border-slate-200 py-3.5 px-5 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                      <Folder size={18} weight="duotone" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-bold text-slate-900">{catName}</CardTitle>
                      <p className="text-xs text-slate-500 font-medium">
                        {categoryItems.length} {categoryItems.length === 1 ? 'item' : 'items'} under this category
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingItem({
                        id: '',
                        name: '',
                        unit: 'MT',
                        category: catName
                      })
                      setOpen(true)
                    }}
                    className="text-xs font-bold text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                  >
                    <Plus size={14} className="mr-1" weight="bold" /> Add Item to {catName}
                  </Button>
                </CardHeader>

                {/* Items under Category Table */}
                <CardContent className="p-0">
                  {categoryItems.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400 font-medium">
                      No items under {catName} category yet.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader className="bg-slate-50/50 text-[11px] uppercase tracking-wider text-slate-500">
                        <TableRow>
                          <TableHead className="font-bold text-slate-700">Item Name</TableHead>
                          <TableHead className="font-bold text-slate-700">Measuring & Alternative Unit</TableHead>
                          <TableHead className="text-right font-bold text-slate-700">Purchase Price</TableHead>
                          <TableHead className="text-right font-bold text-slate-700">Sales Price</TableHead>
                          <TableHead className="text-right font-bold text-slate-700">GST %</TableHead>
                          <TableHead className="text-right font-bold text-slate-700">Opening Stock</TableHead>
                          <TableHead className="text-right font-bold text-slate-700">Current Stock</TableHead>
                          <TableHead className="w-[80px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {categoryItems.map(item => {
                          const currentStockVal = stockMap.get(item.id)?.currentStock ?? item.openingStock ?? 0
                          return (
                            <TableRow key={item.id} className="hover:bg-slate-50/80">
                              <TableCell className="font-bold text-slate-900">{item.name}</TableCell>
                              <TableCell>
                                <div className="flex flex-col gap-0.5">
                                  <span className="font-mono text-xs font-bold text-slate-800">
                                    {item.unit}
                                    {item.alternativeUnit && item.alternativeUnit !== 'NONE' ? ` / ${item.alternativeUnit}` : ''}
                                  </span>
                                  {item.alternativeUnit && item.alternativeUnit !== 'NONE' && (
                                    <span className="text-[10px] text-slate-500 font-mono">
                                      1 {item.alternativeUnit} = {getItemConversionFactor(item, item.alternativeUnit).toLocaleString('en-IN')} {item.unit}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm font-semibold">
                                {typeof item.purchasePrice === 'number' ? `₹${item.purchasePrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm font-semibold text-emerald-700">
                                {typeof item.salesPrice === 'number' ? `₹${item.salesPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {typeof item.gstRate === 'number' ? `${item.gstRate}%` : '-'}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm font-semibold text-slate-600">
                                {typeof item.openingStock === 'number' ? `${item.openingStock.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${item.unit}` : '-'}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm font-bold text-blue-700">
                                {`${currentStockVal.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${item.unit}`}
                              </TableCell>
                              <TableCell>
                              <div className="flex items-center justify-end gap-1">
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => handleEdit(item)}
                                  className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-8 w-8 p-0"
                                >
                                  <Pencil size={16} weight="bold" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => handleDeleteClick(item)}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0"
                                >
                                  <Trash size={16} weight="bold" />
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
            )
          })}
        </div>
      )}

      {/* MANAGE CATEGORIES MODAL (Add, Edit, Delete Categories) */}
      <Dialog open={addCatDialogOpen} onOpenChange={setAddCatDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold">
              <SquaresFour size={22} className="text-blue-600" />
              Manage Product Categories
            </DialogTitle>
          </DialogHeader>

          {/* Add Category Section */}
          <div className="space-y-4 pt-1">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <Label htmlFor="newCategoryNamePage" className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Create New Category
              </Label>
              <div className="flex gap-2">
                <Input
                  id="newCategoryNamePage"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="ex: Structural Steel, TMT Bars"
                  className="bg-white"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateCategory()
                  }}
                />
                <Button onClick={handleCreateCategory} className="bg-blue-600 hover:bg-blue-700 text-white font-bold shrink-0">
                  <Plus size={16} className="mr-1" weight="bold" /> Add
                </Button>
              </div>
            </div>

            {/* List of Existing Categories with Edit & Delete */}
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                All Categories ({customCategories.length})
              </Label>
              <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
                {customCategories.length === 0 ? (
                  <div className="p-4 text-center text-slate-400 text-sm">No categories available</div>
                ) : (
                  customCategories.map((cat) => (
                    <div key={cat} className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors">
                      {editingCatName === cat ? (
                        <div className="flex items-center gap-2 flex-1 mr-2">
                          <Input
                            value={editCatInputValue}
                            onChange={(e) => setEditCatInputValue(e.target.value)}
                            className="h-8 text-sm font-semibold bg-white"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveCategoryEdit(cat)
                            }}
                          />
                          <Button size="sm" variant="ghost" onClick={() => handleSaveCategoryEdit(cat)} className="h-8 w-8 p-0 text-emerald-600">
                            <Check size={18} weight="bold" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingCatName(null)} className="h-8 w-8 p-0 text-slate-400">
                            <X size={18} weight="bold" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <span className="font-semibold text-slate-800 text-sm">{cat}</span>
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingCatName(cat)
                                setEditCatInputValue(cat)
                              }}
                              className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-50"
                              title="Edit Category"
                            >
                              <Pencil size={15} weight="bold" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteCategory(cat)}
                              className="h-8 w-8 p-0 text-red-600 hover:bg-red-50"
                              title="Delete Category"
                            >
                              <Trash size={15} weight="bold" />
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setAddCatDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MANAGE UNITS MODAL (Add, Edit, Delete Measuring Units) */}
      <Dialog open={addUnitDialogOpen} onOpenChange={setAddUnitDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold">
              <Scales size={22} className="text-emerald-600" />
              Manage Measuring Units
            </DialogTitle>
          </DialogHeader>

          {/* Add Unit Section */}
          <div className="space-y-4 pt-1">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Create Custom Measuring Unit
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="newUnitCodePage" className="text-[11px] text-slate-500 font-medium">Unit Symbol *</Label>
                  <Input
                    id="newUnitCodePage"
                    value={newUnitCode}
                    onChange={(e) => setNewUnitCode(e.target.value)}
                    placeholder="ex: BAG, LTR, BOX"
                    className="font-mono uppercase bg-white h-9"
                  />
                </div>
                <div>
                  <Label htmlFor="newUnitLabelPage" className="text-[11px] text-slate-500 font-medium">Display Name</Label>
                  <Input
                    id="newUnitLabelPage"
                    value={newUnitLabel}
                    onChange={(e) => setNewUnitLabel(e.target.value)}
                    placeholder="ex: Cement Bag"
                    className="bg-white h-9"
                  />
                </div>
              </div>
              <Button onClick={handleCreateUnit} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-9">
                <Plus size={16} className="mr-1" weight="bold" /> Add Custom Unit
              </Button>
            </div>

            {/* List of Existing Units with Edit & Delete */}
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                All Measuring Units ({customUnits.length})
              </Label>
              <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
                {customUnits.length === 0 ? (
                  <div className="p-4 text-center text-slate-400 text-sm">No units available</div>
                ) : (
                  customUnits.map((u) => (
                    <div key={u.value} className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors">
                      {editingUnitCode === u.value ? (
                        <div className="flex items-center gap-2 flex-1 mr-2">
                          <Input
                            value={editUnitCodeVal}
                            onChange={(e) => setEditUnitCodeVal(e.target.value)}
                            className="h-8 text-xs font-mono uppercase w-20 bg-white"
                            autoFocus
                          />
                          <Input
                            value={editUnitLabelVal}
                            onChange={(e) => setEditUnitLabelVal(e.target.value)}
                            className="h-8 text-xs font-semibold flex-1 bg-white"
                            placeholder="Display Label"
                          />
                          <Button size="sm" variant="ghost" onClick={() => handleSaveUnitEdit(u.value)} className="h-8 w-8 p-0 text-emerald-600">
                            <Check size={18} weight="bold" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingUnitCode(null)} className="h-8 w-8 p-0 text-slate-400">
                            <X size={18} weight="bold" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-800 border border-slate-200">
                              {u.value}
                            </span>
                            <span className="text-sm font-semibold text-slate-700">{u.label}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingUnitCode(u.value)
                                setEditUnitCodeVal(u.value)
                                setEditUnitLabelVal(u.label)
                              }}
                              className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-50"
                              title="Edit Unit"
                            >
                              <Pencil size={15} weight="bold" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteUnit(u.value)}
                              className="h-8 w-8 p-0 text-red-600 hover:bg-red-50"
                              title="Delete Unit"
                            >
                              <Trash size={15} weight="bold" />
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setAddUnitDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Warning className="h-5 w-5 text-destructive" weight="fill" />
              Delete Item
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{itemToDelete?.name}</strong>? This action cannot be undone and will affect all related invoices and reports.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
