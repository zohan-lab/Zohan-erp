import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { saveBusinessDetails, generateFYOptions } from '@/lib/storage-utils'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Trash,
  Pencil,
  Gear,
  Lock,
  LockOpen,
  Plus,
} from '@phosphor-icons/react'
import { KeyboardShortcutsDialog } from '@/components/keyboard-shortcuts-dialog'
import { BusinessMetadata } from '@/lib/storage-utils'
import { saveBusinessToCloud } from '@/lib/business-sync'

interface DataCounts {
  parties?: number
  suppliers?: number
  customers?: number
  items: number
  purchaseInvoices: number
  salesInvoices: number
  payments: number
  customerPayments: number
  expenseTypes: number
  expenseEntries: number
  receivedDiscounts: number
  fixedSchemes: number
  mtBookings: number
}

interface AppDialogsProps {
  shortcutsDialogOpen: boolean
  setShortcutsDialogOpen: (open: boolean) => void
  addBusinessDialogOpen: boolean
  setAddBusinessDialogOpen: (open: boolean) => void
  newBusinessName: string
  setNewBusinessName: (name: string) => void
  newBusinessStartFY: string
  setNewBusinessStartFY: (fy: string) => void
  handleAddBusiness: () => void
  editBusinessDialogOpen: boolean
  setEditBusinessDialogOpen: (open: boolean) => void
  editBusinessName: string
  setEditBusinessName: (name: string) => void
  handleEditBusiness: () => void
  handleDeleteBusiness: () => void
  activeCompany: string
  metadata: { businesses: BusinessMetadata[], activeCompanyId: string }
  settingsDialogOpen: boolean
  setSettingsDialogOpen: (open: boolean) => void
  tempGstPercentage: string
  setTempGstPercentage: (value: string) => void
  safeGstPercentage: number
  safeIsLocked: boolean
  handleToggleLock: () => void
  handleSettingsSave: () => void
  totalDataCount: number
  dataCounts: DataCounts
  handleClearAllData: () => void
}

export function AppDialogs({
  shortcutsDialogOpen,
  setShortcutsDialogOpen,
  addBusinessDialogOpen,
  setAddBusinessDialogOpen,
  newBusinessName,
  setNewBusinessName,
  newBusinessStartFY,
  setNewBusinessStartFY,
  handleAddBusiness,
  editBusinessDialogOpen,
  setEditBusinessDialogOpen,
  editBusinessName,
  setEditBusinessName,
  handleEditBusiness,
  handleDeleteBusiness,
  activeCompany,
  metadata,
  settingsDialogOpen,
  setSettingsDialogOpen,
  tempGstPercentage,
  setTempGstPercentage,
  safeGstPercentage,
  safeIsLocked,
  handleToggleLock,
  handleSettingsSave,
  totalDataCount,
  dataCounts,
  handleClearAllData,
}: AppDialogsProps) {
  const [businessPhone, setBusinessPhone] = useState('')
  const [businessEmail, setBusinessEmail] = useState('')
  const [billingAddress, setBillingAddress] = useState('')
  const [businessState, setBusinessState] = useState('West Bengal')
  const [businessCity, setBusinessCity] = useState('')
  const [businessPincode, setBusinessPincode] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [industryType, setIndustryType] = useState('')
  const [registrationType, setRegistrationType] = useState('Private Limited Company')
  const [gstRegistered, setGstRegistered] = useState<'yes' | 'no'>('no')
  const [panNumber, setPanNumber] = useState('')
  const [website, setWebsite] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleCreateBusinessWithDetails = () => {
    const businessId = newBusinessName.toLowerCase().replace(/[^a-z0-9]+/g, '_')
    if (newBusinessName.trim()) {
      const details = {
        phone: businessPhone.trim(),
        email: businessEmail.trim(),
        billingAddress: billingAddress.trim(),
        state: businessState,
        city: businessCity.trim(),
        pincode: businessPincode.trim(),
        businessType,
        industryType,
        registrationType,
        gstRegistered,
        panNumber: panNumber.trim(),
        website: website.trim()
      }
      saveBusinessDetails(businessId, details)
      
      const newBusinessMeta = {
        id: businessId,
        name: newBusinessName.trim()
      }
      saveBusinessToCloud(businessId, newBusinessMeta, details)
    }
    handleAddBusiness()
    setBusinessPhone('')
    setBusinessEmail('')
    setBillingAddress('')
    setBusinessCity('')
    setBusinessPincode('')
    setBusinessType('')
    setIndustryType('')
    setPanNumber('')
    setWebsite('')
  }

  return (
    <>
      <KeyboardShortcutsDialog
        open={shortcutsDialogOpen}
        onOpenChange={setShortcutsDialogOpen}
      />

      <Dialog open={addBusinessDialogOpen} onOpenChange={setAddBusinessDialogOpen}>
        <DialogContent className="business-settings-dialog max-w-[1120px]">
          <DialogHeader className="business-settings-header">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary" />
                Business Settings
              </DialogTitle>
              <DialogDescription>
                Create new business and enter company settings information
              </DialogDescription>
            </div>
            <Button onClick={handleCreateBusinessWithDetails}>Save Changes</Button>
          </DialogHeader>
          <div className="business-settings-grid">
            <div className="business-upload-box">
              <Plus className="h-6 w-6" />
              <strong>Upload Logo</strong>
              <span>PNG/JPG, max 5 MB.</span>
            </div>

            <div className="business-settings-form">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="new-business-name">Business Name <span className="text-destructive">*</span></Label>
                  <Input id="new-business-name" value={newBusinessName} onChange={(e) => setNewBusinessName(e.target.value)} placeholder="Enter business name" />
                </div>
                <div className="space-y-2">
                  <Label>Company Phone Number</Label>
                  <Input value={businessPhone} onChange={(e) => setBusinessPhone(e.target.value)} placeholder="9083876218" />
                </div>
                <div className="space-y-2">
                  <Label>Company E-Mail</Label>
                  <Input type="email" value={businessEmail} onChange={(e) => setBusinessEmail(e.target.value)} placeholder="Enter company e-mail" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Billing Address</Label>
                  <Textarea value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} placeholder="Enter Billing Address" className="min-h-20" />
                </div>
                <div className="space-y-2">
                  <Label>State</Label>
                  <Input value={businessState} onChange={(e) => setBusinessState(e.target.value)} placeholder="West Bengal" />
                </div>
                <div className="space-y-2">
                  <Label>Pincode</Label>
                  <Input value={businessPincode} onChange={(e) => setBusinessPincode(e.target.value)} placeholder="Enter Pincode" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>City</Label>
                  <Input value={businessCity} onChange={(e) => setBusinessCity(e.target.value)} placeholder="Enter City" />
                </div>
                <div className="space-y-2">
                  <Label>PAN Number</Label>
                  <Input value={panNumber} onChange={(e) => setPanNumber(e.target.value.toUpperCase())} placeholder="Enter your PAN Number" />
                </div>
              </div>
            </div>

            <div className="business-settings-form">
              <div className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Business Type</Label>
                    <Input value={businessType} onChange={(e) => setBusinessType(e.target.value)} placeholder="Select" />
                  </div>
                  <div className="space-y-2">
                    <Label>Industry Type</Label>
                    <Input value={industryType} onChange={(e) => setIndustryType(e.target.value)} placeholder="Select Industry Type" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Business Registration Type</Label>
                  <Input value={registrationType} onChange={(e) => setRegistrationType(e.target.value)} placeholder="Private Limited Company" />
                </div>
                <div className="rounded-lg bg-muted/40 px-4 py-3 text-xs font-medium">
                  Note: Terms & Conditions and Signature added below will be shown on your invoices.
                </div>
                <div>
                  <Label>Signature</Label>
                  <div className="business-signature-box">+ Add Signature</div>
                </div>
                <div className="space-y-2">
                  <Label>Are you GST Registered?</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <Button type="button" variant={gstRegistered === 'yes' ? 'default' : 'outline'} onClick={() => setGstRegistered('yes')}>Yes</Button>
                    <Button type="button" variant={gstRegistered === 'no' ? 'default' : 'outline'} onClick={() => setGstRegistered('no')}>No</Button>
                  </div>
                </div>
                <div className="business-extra-row">
                  <Input placeholder="Website" disabled />
                  <span>=</span>
                  <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="www.website.com" />
                  <Button type="button">Add</Button>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddBusinessDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateBusinessWithDetails}>Create New Business</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editBusinessDialogOpen} onOpenChange={setEditBusinessDialogOpen}>
        <DialogContent className="modal-content max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gear className="h-5 w-5 text-primary" />
              Edit/Delete Business
            </DialogTitle>
            <DialogDescription>
              Update the business name or delete this business profile
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-business-name">Business Name</Label>
              <Input
                id="edit-business-name"
                value={editBusinessName}
                onChange={(e) => setEditBusinessName(e.target.value)}
                placeholder="Enter business name"
              />
            </div>
            <div className="pt-4 border-t border-border">
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="font-semibold text-destructive">Delete Business</Label>
                  <p className="text-xs text-muted-foreground">
                    Permanently delete this business and all its data. This action cannot be undone.
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      type="button"
                      variant="outline" 
                      size="sm"
                      className="w-full gap-2 justify-start border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={metadata.businesses.length === 1}
                    >
                      <Trash className="h-4 w-4" />
                      Delete Business
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2">
                        <Trash className="h-5 w-5 text-destructive" />
                        Delete Business
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete "{activeCompany}"? This will permanently delete all data for this business. This action cannot be undone.
                        <div className="flex items-center space-x-2 mt-4 p-3 bg-destructive/10 rounded-md">
                          <input 
                            type="checkbox" 
                            id="confirm-delete-checkbox" 
                            className="w-4 h-4 accent-destructive"
                            checked={confirmDelete}
                            onChange={(e) => setConfirmDelete(e.target.checked)}
                          />
                          <Label htmlFor="confirm-delete-checkbox" className="text-sm font-medium text-destructive">
                            I understand that if I delete this profile, the business data will be permanently deleted and cannot be restored.
                          </Label>
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={() => setConfirmDelete(false)}>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          handleDeleteBusiness();
                          setConfirmDelete(false);
                        }}
                        disabled={!confirmDelete}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                      >
                        Delete Business
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditBusinessDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditBusiness}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent className="modal-content max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gear className="h-5 w-5 text-primary" />
              Settings
            </DialogTitle>
            <DialogDescription>
              Update your business settings, financial year, GST, and chart colors
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid w-full grid-cols-1">
              <TabsTrigger value="general">General</TabsTrigger>
            </TabsList>
            
            <TabsContent value="general" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="gst-percentage">GST Percentage (%)</Label>
                <Input
                  id="gst-percentage"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={tempGstPercentage}
                  onChange={(e) => setTempGstPercentage(e.target.value)}
                  placeholder="Enter GST percentage (e.g., 18)"
                />
                <p className="text-xs text-muted-foreground">
                  Current: {safeGstPercentage}% • Used for calculating Rate from Basic Rate
                </p>
              </div>

              <div className="pt-4 border-t border-border space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="font-semibold">Data Lock</Label>
                    <p className="text-xs text-muted-foreground">
                      {safeIsLocked ? 'Data is locked - Read-only mode' : 'Data is unlocked - Edit mode'}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant={safeIsLocked ? "destructive" : "default"}
                    size="sm"
                    onClick={handleToggleLock}
                    className="gap-2"
                  >
                    {safeIsLocked ? (
                      <>
                        <LockOpen className="h-4 w-4" />
                        Unlock
                      </>
                    ) : (
                      <>
                        <Lock className="h-4 w-4" />
                        Lock
                      </>
                    )}
                  </Button>
                </div>

                <div className="pt-4 border-t border-border">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="font-semibold text-destructive">Clear All Data</Label>
                      <p className="text-xs text-muted-foreground">
                        Permanently delete all data from your system. This action cannot be undone.
                      </p>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          type="button"
                          variant="outline" 
                          size="sm"
                          className="w-full gap-2 justify-start border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={totalDataCount === 0}
                        >
                          <Trash className="h-4 w-4" />
                          Clear All Data
                          {totalDataCount > 0 && (
                            <Badge variant="secondary" className="ml-auto text-xs px-2 py-0 h-5">
                              {totalDataCount}
                            </Badge>
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="flex items-center gap-2">
                            <Trash className="h-5 w-5 text-destructive" />
                            Clear All Data
                          </AlertDialogTitle>
                          <AlertDialogDescription className="space-y-3">
                            <p>
                              This will permanently delete all data from your system. This action cannot be undone.
                            </p>
                            <div className="text-xs bg-muted p-3 rounded-md space-y-1">
                              <div className="flex justify-between">
                                <span>Parties:</span>
                                <span className="font-mono font-semibold">{dataCounts.parties ?? ((dataCounts.suppliers || 0) + (dataCounts.customers || 0))}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Items:</span>
                                <span className="font-mono font-semibold">{dataCounts.items}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Purchase Invoices:</span>
                                <span className="font-mono font-semibold">{dataCounts.purchaseInvoices}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Sales Invoices:</span>
                                <span className="font-mono font-semibold">{dataCounts.salesInvoices}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Payments:</span>
                                <span className="font-mono font-semibold">{dataCounts.payments}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Cust. Payments:</span>
                                <span className="font-mono font-semibold">{dataCounts.customerPayments}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Expense Types:</span>
                                <span className="font-mono font-semibold">{dataCounts.expenseTypes}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Expense Entries:</span>
                                <span className="font-mono font-semibold">{dataCounts.expenseEntries}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Received Discounts:</span>
                                <span className="font-mono font-semibold">{dataCounts.receivedDiscounts}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Fixed Schemes:</span>
                                <span className="font-mono font-semibold">{dataCounts.fixedSchemes}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>MT Bookings:</span>
                                <span className="font-mono font-semibold">{dataCounts.mtBookings}</span>
                              </div>
                            </div>
                            <p className="text-destructive font-semibold">
                              This action cannot be undone!
                            </p>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleClearAllData}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Clear All Data
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              const details = {
                phone: businessPhone.trim(),
                email: businessEmail.trim(),
                billingAddress: billingAddress.trim(),
                state: businessState,
                city: businessCity.trim(),
                pincode: businessPincode.trim(),
                businessType,
                industryType,
                registrationType,
                gstRegistered,
                panNumber: panNumber.trim(),
                website: website.trim()
              }
              saveBusinessDetails(metadata.activeCompanyId, details)
              const businessMeta = metadata.businesses.find(b => b.id === metadata.activeCompanyId)
              if (businessMeta) {
                saveBusinessToCloud(metadata.activeCompanyId, businessMeta, details)
              }
              handleSettingsSave()
            }}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
