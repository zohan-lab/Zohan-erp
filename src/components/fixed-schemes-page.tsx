import { getChangedByLabel, getChangedByRole } from '@/lib/security-utils'
import { useState, useMemo, useEffect } from 'react'
import { FixedScheme, Supplier } from '@/lib/types'
import { getAvailableUnits } from '@/lib/custom-data-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash, Tag, FunnelSimple, Warning } from '@phosphor-icons/react'
import { formatCurrency, getFYMonths } from '@/lib/calculations'
import { toast } from 'sonner'

interface FixedSchemesPageProps {
  fixedSchemes: FixedScheme[]
  setFixedSchemes: (updater: (prev: FixedScheme[]) => FixedScheme[]) => void
  suppliers: Supplier[]
  currentFY: string
  isLocked?: boolean
}

type SchemeStatus = 'all' | 'active' | 'expired' | 'upcoming'

function addDays(date: string, days: number): string {
  const value = new Date(date)
  value.setDate(value.getDate() + days)
  return value.toISOString().split('T')[0]
}

export default function FixedSchemesPage({ fixedSchemes, setFixedSchemes, suppliers, currentFY, isLocked = false }: FixedSchemesPageProps) {
  const [availableUnits, setAvailableUnits] = useState(() => getAvailableUnits())

  useEffect(() => {
    const syncUnits = () => setAvailableUnits(getAvailableUnits())
    window.addEventListener('custom-units-updated', syncUnits)
    return () => window.removeEventListener('custom-units-updated', syncUnits)
  }, [])

  const [open, setOpen] = useState(false)
  const [editingScheme, setEditingScheme] = useState<FixedScheme | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [schemeToDelete, setSchemeToDelete] = useState<FixedScheme | null>(null)
  const [statusFilter, setStatusFilter] = useState<SchemeStatus>('all')
  const [supplierFilter, setSupplierFilter] = useState<string>('all')
  const [monthFilter, setMonthFilter] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [applyInMTBooking, setApplyInMTBooking] = useState<boolean>(true)

  const [schemeUnit, setSchemeUnit] = useState<string>('MT')

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    
    if (isLocked) {
      toast.error('Cannot save in locked mode', {
        description: 'Unlock the data in Settings to make changes'
      })
      return
    }
    
    const formData = new FormData(e.currentTarget)
    
    const supplierId = formData.get('supplierId') as string
    const schemeName = formData.get('schemeName') as string
    const ratePerMT = parseFloat(formData.get('ratePerMT') as string)
    const unit = schemeUnit || 'MT'
    const fromDate = formData.get('fromDate') as string
    const toDate = formData.get('toDate') as string
    const changeReason = ((formData.get('changeReason') as string) || '').trim() || (editingScheme ? 'Fixed scheme revision' : 'Initial fixed scheme setup')
    const changedAt = new Date().toISOString()

    if (!supplierId || !schemeName || !ratePerMT || !fromDate || !toDate) {
      toast.error('Please fill all required fields')
      return
    }

    if (new Date(fromDate) > new Date(toDate)) {
      toast.error('From Date must be before To Date')
      return
    }

    const nextVersion = (editingScheme?.version || 1) + (editingScheme ? 1 : 0)
    const scheme: FixedScheme = {
      id: editingScheme ? `scheme-${Date.now()}` : `scheme-${Date.now()}`,
      supplierId,
      schemeName,
      ratePerMT,
      unit,
      fromDate,
      toDate,
      applyInMTBooking,
      version: nextVersion,
      parentSchemeId: editingScheme?.parentSchemeId || editingScheme?.id,
      previousSchemeId: editingScheme?.id,
      changedBy: getChangedByLabel(), changedByRole: getChangedByRole(),
      changedAt,
      changeReason,
      approvalStatus: 'Approved'
    }

    if (editingScheme) {
      const updatedScheme: FixedScheme = {
        ...editingScheme,
        supplierId,
        schemeName,
        ratePerMT,
        unit,
        fromDate,
        toDate,
        applyInMTBooking,
        changedAt
      }
      setFixedSchemes((prev) => prev.map(s => s.id === editingScheme.id ? updatedScheme : s))
      toast.success('Fixed scheme updated successfully')
    } else {
      const newScheme: FixedScheme = {
        id: `scheme-${Date.now()}`,
        supplierId,
        schemeName,
        ratePerMT,
        unit,
        fromDate,
        toDate,
        applyInMTBooking,
        changedAt
      }
      setFixedSchemes((prev) => [...prev, newScheme])
      toast.success('Fixed scheme added successfully')
    }

    setOpen(false)
    setEditingScheme(null)
    setApplyInMTBooking(true)
  }

  const handleDeleteClick = (scheme: FixedScheme) => {
    if (isLocked) {
      toast.error('Cannot delete in locked mode', {
        description: 'Unlock the data in Settings to make changes'
      })
      return
    }
    setSchemeToDelete(scheme)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = () => {
    if (schemeToDelete) {
      setFixedSchemes((prev) => prev.filter(s => s.id !== schemeToDelete.id))
      toast.success('Fixed scheme deleted successfully')
      setDeleteDialogOpen(false)
      setSchemeToDelete(null)
    }
  }

  const handleEdit = (scheme: FixedScheme) => {
    if (isLocked) {
      toast.error('Cannot edit in locked mode', {
        description: 'Unlock the data in Settings to make changes'
      })
      return
    }
    setEditingScheme(scheme)
    setSchemeUnit(scheme.unit || 'MT')
    setApplyInMTBooking(scheme.applyInMTBooking !== false)
    setOpen(true)
  }

  const handleAdd = () => {
    if (isLocked) {
      toast.error('Cannot add in locked mode', {
        description: 'Unlock the data in Settings to make changes'
      })
      return
    }
    setEditingScheme(null)
    setSchemeUnit('MT')
    setApplyInMTBooking(true)
    setOpen(true)
  }

  const getSupplierName = (supplierId: string) => {
    return suppliers.find(s => s.id === supplierId)?.name || 'Unknown Supplier'
  }

  const getSchemeStatus = (scheme: FixedScheme): 'active' | 'expired' | 'upcoming' => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const fromDate = new Date(scheme.fromDate)
    const toDate = new Date(scheme.toDate)
    
    if (today < fromDate) return 'upcoming'
    if (today > toDate) return 'expired'
    return 'active'
  }

  const getStatusBadge = (status: 'active' | 'expired' | 'upcoming') => {
    const variants = {
      active: { variant: 'default' as const, label: 'Active', className: 'bg-success text-success-foreground' },
      expired: { variant: 'secondary' as const, label: 'Expired', className: 'bg-muted text-muted-foreground' },
      upcoming: { variant: 'secondary' as const, label: 'Upcoming', className: 'bg-warning text-warning-foreground' }
    }
    const config = variants[status]
    return <Badge variant={config.variant} className={config.className}>{config.label}</Badge>
  }

  const filteredSchemes = useMemo(() => {
    let filtered = fixedSchemes

    if (statusFilter !== 'all') {
      filtered = filtered.filter(scheme => getSchemeStatus(scheme) === statusFilter)
    }

    if (supplierFilter !== 'all') {
      filtered = filtered.filter(scheme => scheme.supplierId === supplierFilter)
    }

    if (monthFilter !== 'all') {
      const [year, month] = monthFilter.split('-')
      filtered = filtered.filter(scheme => {
        const fromDate = new Date(scheme.fromDate)
        const toDate = new Date(scheme.toDate)
        const filterDate = new Date(parseInt(year), parseInt(month) - 1)
        
        return (fromDate <= filterDate && toDate >= filterDate) ||
               (fromDate.getFullYear() === parseInt(year) && fromDate.getMonth() === parseInt(month) - 1) ||
               (toDate.getFullYear() === parseInt(year) && toDate.getMonth() === parseInt(month) - 1)
      })
    }

    return filtered.sort((a, b) => {
      const statusOrder = { active: 0, upcoming: 1, expired: 2 }
      const statusA = getSchemeStatus(a)
      const statusB = getSchemeStatus(b)
      if (statusOrder[statusA] !== statusOrder[statusB]) {
        return statusOrder[statusA] - statusOrder[statusB]
      }
      return new Date(b.fromDate).getTime() - new Date(a.fromDate).getTime()
    })
  }, [fixedSchemes, statusFilter, supplierFilter, monthFilter])

  const statusCounts = useMemo(() => {
    const counts = { all: fixedSchemes.length, active: 0, expired: 0, upcoming: 0 }
    fixedSchemes.forEach(scheme => {
      const status = getSchemeStatus(scheme)
      counts[status]++
    })
    return counts
  }, [fixedSchemes])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Fixed Schemes</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage fixed discount schemes by supplier and date range
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleAdd}>
              <Plus className="mr-2" size={18} />
              Add Fixed Scheme
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingScheme ? 'Edit Fixed Scheme' : 'Add New Fixed Scheme'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="supplierId">Supplier *</Label>
                <Select name="supplierId" defaultValue={editingScheme?.supplierId} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map(supplier => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="schemeName">Scheme Name *</Label>
                <Input 
                  id="schemeName" 
                  name="schemeName" 
                  defaultValue={editingScheme?.schemeName}
                  placeholder="e.g. Summer Discount, Bulk Purchase Scheme"
                  required 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fromDate">From Date *</Label>
                  <Input 
                    id="fromDate" 
                    name="fromDate" 
                    type="date"
                    defaultValue={editingScheme?.fromDate}
                    required 
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="toDate">To Date *</Label>
                  <Input 
                    id="toDate" 
                    name="toDate" 
                    type="date"
                    defaultValue={editingScheme?.toDate}
                    required 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="schemeUnit">Discount Unit *</Label>
                  <Select value={schemeUnit} onValueChange={setSchemeUnit}>
                    <SelectTrigger id="schemeUnit">
                      <SelectValue placeholder="Select Unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableUnits.map((u) => (
                        <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ratePerMT">Discount Rate (₹/{schemeUnit}) *</Label>
                  <Input 
                    id="ratePerMT" 
                    name="ratePerMT" 
                    type="number"
                    step="0.01"
                    defaultValue={editingScheme?.ratePerMT}
                    placeholder="0.00"
                    required 
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Fixed scheme discount applies ONLY to items purchased in the selected unit ({schemeUnit}).
              </p>

              <div className="space-y-2">
                <Label htmlFor="changeReason">Reason for Change</Label>
                <Input
                  id="changeReason"
                  name="changeReason"
                  defaultValue={editingScheme ? 'Fixed scheme revision' : 'Initial fixed scheme setup'}
                  placeholder="e.g. Supplier rate circular"
                />
              </div>

              <div className="space-y-3 pt-3 border-t border-border">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="applyInMTBooking" className="text-sm font-semibold">Apply in MT Booking Master</Label>
                    <p className="text-xs text-muted-foreground">
                      When enabled, this scheme will be available and applied in MT Booking calculations. When disabled, it will only apply to normal invoice-based calculations.
                    </p>
                  </div>
                  <Switch 
                    id="applyInMTBooking"
                    checked={applyInMTBooking}
                    onCheckedChange={setApplyInMTBooking}
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <Button type="button" variant="outline" onClick={() => {
                  setOpen(false)
                  setEditingScheme(null)
                }}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingScheme ? 'Update' : 'Add'} Scheme
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2 mb-4">
            <FunnelSimple className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Filters</CardTitle>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status-filter">Status</Label>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as SchemeStatus)}>
                <SelectTrigger id="status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All ({statusCounts.all})</SelectItem>
                  <SelectItem value="active">Active ({statusCounts.active})</SelectItem>
                  <SelectItem value="upcoming">Upcoming ({statusCounts.upcoming})</SelectItem>
                  <SelectItem value="expired">Expired ({statusCounts.expired})</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplier-filter">Supplier</Label>
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger id="supplier-filter">
                  <SelectValue placeholder="All Suppliers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Suppliers</SelectItem>
                  {suppliers.map(supplier => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="month-filter">Month</Label>
              <Select value={monthFilter} onValueChange={setMonthFilter}>
                <SelectTrigger id="month-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Months</SelectItem>
                  {getFYMonths(currentFY).map((month) => (
                    <SelectItem key={month.value} value={month.value}>
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredSchemes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Tag size={48} className="text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-center">
                {fixedSchemes.length === 0 
                  ? 'No fixed schemes yet. Add your first scheme to get started.'
                  : 'No schemes match the selected filters.'}
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Scheme Name</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>From Date</TableHead>
                    <TableHead>To Date</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">Discount Rate</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSchemes.map(scheme => (
                    <TableRow key={scheme.id}>
                      <TableCell>
                        {getStatusBadge(getSchemeStatus(scheme))}
                      </TableCell>
                      <TableCell className="font-medium">
                        {getSupplierName(scheme.supplierId)}
                      </TableCell>
                      <TableCell>{scheme.schemeName}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Badge variant="outline">v{scheme.version || 1}</Badge>
                          {scheme.approvalStatus && (
                            <div className="text-[11px] text-muted-foreground">{scheme.approvalStatus}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{scheme.fromDate}</TableCell>
                      <TableCell>{scheme.toDate}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-xs">{scheme.unit || 'MT'}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {formatCurrency(scheme.ratePerMT)} / {scheme.unit || 'MT'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleEdit(scheme)}
                          >
                            Edit
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleDeleteClick(scheme)}
                          >
                            <Trash size={16} className="text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Warning className="h-5 w-5 text-destructive" weight="fill" />
              Delete Fixed Scheme
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the fixed scheme <strong>{schemeToDelete?.schemeName}</strong> for <strong>{getSupplierName(schemeToDelete?.supplierId || '')}</strong>? 
              <br /><br />
              This action cannot be undone and will affect all related discount calculations.
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
