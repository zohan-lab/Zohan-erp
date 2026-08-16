import { useEffect, useState } from 'react'
import { getChangedByLabel } from '@/lib/security-utils'
import { Customer, Supplier, PaymentCDRule, InvoiceCloseCDRule, SupplierCDRuleVersion, CDRuleChangeLog } from '@/lib/types'
import { getAvailableUnits } from '@/lib/custom-data-store'
import { getStateFromGstin, getStateByCode, getStateByName } from '@/lib/constants/indian-states'
import { StateSelector } from '@/components/state-selector'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash, UserPlus } from '@phosphor-icons/react'
import { toast } from 'sonner'

type PartyType = 'supplier' | 'customer'
type Party = Supplier | Customer

interface PartyEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: PartyType
  party?: Party | null
  existingParties?: Party[]
  onSave: (party: Party) => void
}

function isSupplier(type: PartyType, party?: Party | null): party is Supplier {
  return type === 'supplier' && !!party
}

function trimOrUndefined(value: string) {
  return value.trim() || undefined
}

function todayKey(): string {
  return new Date().toISOString().split('T')[0]
}

import { getFYStart } from '@/lib/calculations'

export function PartyEditorDialog({
  open,
  onOpenChange,
  type,
  party,
  existingParties = [],
  onSave
}: PartyEditorDialogProps) {
  const [availableUnits, setAvailableUnits] = useState(() => getAvailableUnits())

  useEffect(() => {
    const syncUnits = () => setAvailableUnits(getAvailableUnits())
    window.addEventListener('custom-units-updated', syncUnits)
    return () => window.removeEventListener('custom-units-updated', syncUnits)
  }, [])

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [state, setState] = useState('')
  const [stateCode, setStateCode] = useState('')
  const [pincode, setPincode] = useState('')
  const [city, setCity] = useState('')
  const [shippingSameAsBilling, setShippingSameAsBilling] = useState(true)
  const [shippingAddress, setShippingAddress] = useState('')
  const [shippingState, setShippingState] = useState('')
  const [shippingStateCode, setShippingStateCode] = useState('')
  const [shippingPincode, setShippingPincode] = useState('')
  const [shippingCity, setShippingCity] = useState('')
  const [gstin, setGstin] = useState('')
  const [openingBalance, setOpeningBalance] = useState('')
  const [openingBalanceDate, setOpeningBalanceDate] = useState(getFYStart())
  const [balanceType, setBalanceType] = useState<'Credit' | 'Debit'>('Credit')
  const [advanceCD, setAdvanceCD] = useState('')
  const [targetMT, setTargetMT] = useState('')
  const [targetRate, setTargetRate] = useState('')
  const [effectiveDate, setEffectiveDate] = useState(todayKey())
  const [changeReason, setChangeReason] = useState('')
  const [paymentCDRules, setPaymentCDRules] = useState<PaymentCDRule[]>([])
  const [invoiceCloseCDRules, setInvoiceCloseCDRules] = useState<InvoiceCloseCDRule[]>([])

  useEffect(() => {
    if (!open) return

    setName(party?.name || '')
    setPhone(party?.phone || '')
    setEmail(('email' in (party || {}) ? (party as Customer).email : '') || '')
    setAddress(party?.address || '')
    
    const initialBillingState = party?.stateName || party?.state || ''
    const resolvedBillingState = getStateByName(initialBillingState) || getStateByCode(party?.stateCode || initialBillingState)
    setState(resolvedBillingState?.name || initialBillingState)
    setStateCode(resolvedBillingState?.code || party?.stateCode || '')

    setPincode(party?.pincode || '')
    setCity(party?.city || '')
    setShippingSameAsBilling(party?.shippingSameAsBilling ?? true)
    setShippingAddress(party?.shippingAddress || '')

    const initialShippingState = party?.shippingStateName || party?.shippingState || ''
    const resolvedShippingState = getStateByName(initialShippingState) || getStateByCode(party?.shippingStateCode || initialShippingState)
    setShippingState(resolvedShippingState?.name || initialShippingState)
    setShippingStateCode(resolvedShippingState?.code || party?.shippingStateCode || '')

    setShippingPincode(party?.shippingPincode || '')
    setShippingCity(party?.shippingCity || '')
    setGstin(party?.gstin || '')
    setOpeningBalance(party?.openingBalance?.toString() || '')
    setOpeningBalanceDate(party?.openingBalanceDate || getFYStart())
    setBalanceType(party?.balanceType || (type === 'supplier' ? 'Credit' : 'Debit'))
    setAdvanceCD(isSupplier(type, party) ? party.advanceCDPercentage?.toString() || '' : '')
    setTargetMT(isSupplier(type, party) ? party.annualTarget?.targetMT?.toString() || '' : '')
    setTargetRate(isSupplier(type, party) ? party.annualTarget?.ratePerMT?.toString() || '' : '')
    setEffectiveDate(todayKey())
    setChangeReason(party ? 'Supplier rule revision' : 'Initial rule setup')
    setPaymentCDRules(isSupplier(type, party) ? [...(party.paymentCDRules || [])] : [])
    setInvoiceCloseCDRules(isSupplier(type, party) ? [...(party.invoiceCloseCDRules || [])] : [])
  }, [open, party, type])

  const clearAddress = () => {
    setAddress('')
    setState('')
    setStateCode('')
    setPincode('')
    setCity('')
    setShippingAddress('')
    setShippingState('')
    setShippingStateCode('')
    setShippingPincode('')
    setShippingCity('')
    setShippingSameAsBilling(true)
  }

  const handleGstinChange = (value: string) => {
    const cleanGstin = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15)
    setGstin(cleanGstin)
    
    const detectedState = getStateFromGstin(cleanGstin)
    if (detectedState) {
      setStateCode(detectedState.code)
      setState(detectedState.name)
    }
  }

  const handleSave = () => {
    const cleanName = name.trim()

    if (!cleanName) {
      toast.error('Party name is required')
      return
    }

    const duplicate = existingParties.some((candidate) => (
      candidate.id !== party?.id &&
      candidate.name.trim().toLowerCase() === cleanName.toLowerCase()
    ))

    if (duplicate) {
      toast.error(`${type === 'supplier' ? 'Supplier' : 'Customer'} already exists`)
      return
    }

    const cleanShippingAddress = shippingSameAsBilling ? address : shippingAddress
    const cleanShippingState = shippingSameAsBilling ? state : shippingState
    const cleanShippingStateCode = shippingSameAsBilling ? stateCode : shippingStateCode
    const cleanShippingPincode = shippingSameAsBilling ? pincode : shippingPincode
    const cleanShippingCity = shippingSameAsBilling ? city : shippingCity
    const openingBalanceValue = parseFloat(openingBalance) || 0

    if (type === 'supplier') {
      const supplier = party as Supplier | null | undefined
      const supplierId = supplier?.id || `supplier-${Date.now()}`
      const advanceCDValue = parseFloat(advanceCD) || 0
      const targetMTValue = parseFloat(targetMT) || 0
      const targetRateValue = parseFloat(targetRate) || 0
      const normalizedAdvanceCD = advanceCDValue > 0 ? advanceCDValue : undefined

      onSave({
        ...(supplier || {}),
        id: supplierId,
        name: cleanName,
        phone: trimOrUndefined(phone),
        address: trimOrUndefined(address),
        state: trimOrUndefined(state),
        stateCode: trimOrUndefined(stateCode),
        stateName: trimOrUndefined(state),
        pincode: trimOrUndefined(pincode),
        city: trimOrUndefined(city),
        shippingSameAsBilling,
        shippingAddress: trimOrUndefined(cleanShippingAddress),
        shippingState: trimOrUndefined(cleanShippingState),
        shippingStateCode: trimOrUndefined(cleanShippingStateCode),
        shippingStateName: trimOrUndefined(cleanShippingState),
        shippingPincode: trimOrUndefined(cleanShippingPincode),
        shippingCity: trimOrUndefined(cleanShippingCity),
        gstin: trimOrUndefined(gstin.toUpperCase()),
        openingBalance: openingBalanceValue !== 0 ? openingBalanceValue : undefined,
        openingBalanceDate: openingBalanceValue !== 0 ? openingBalanceDate : undefined,
        balanceType,
        advanceCDPercentage: normalizedAdvanceCD,
        annualTarget: targetMTValue > 0 || targetRateValue > 0 ? {
          targetMT: targetMTValue,
          ratePerMT: targetRateValue
        } : undefined,
        paymentCDRules,
        invoiceCloseCDRules,
        cdRuleVersions: supplier?.cdRuleVersions,
        cdRuleChangeLog: supplier?.cdRuleChangeLog
      } satisfies Supplier)
    } else {
      const customer = party as Customer | null | undefined
      onSave({
        ...(customer || {}),
        id: customer?.id || `customer-${Date.now()}`,
        name: cleanName,
        phone: trimOrUndefined(phone),
        email: trimOrUndefined(email),
        address: trimOrUndefined(address),
        state: trimOrUndefined(state),
        stateCode: trimOrUndefined(stateCode),
        stateName: trimOrUndefined(state),
        pincode: trimOrUndefined(pincode),
        city: trimOrUndefined(city),
        shippingSameAsBilling,
        shippingAddress: trimOrUndefined(cleanShippingAddress),
        shippingState: trimOrUndefined(cleanShippingState),
        shippingStateCode: trimOrUndefined(cleanShippingStateCode),
        shippingStateName: trimOrUndefined(cleanShippingState),
        shippingPincode: trimOrUndefined(cleanShippingPincode),
        shippingCity: trimOrUndefined(cleanShippingCity),
        gstin: trimOrUndefined(gstin.toUpperCase()),
        openingBalance: openingBalanceValue !== 0 ? openingBalanceValue : undefined,
        openingBalanceDate: openingBalanceValue !== 0 ? openingBalanceDate : undefined,
        balanceType
      } satisfies Customer)
    }

    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(720px,calc(100vw-2rem))] max-h-[82dvh] overflow-y-auto p-0">
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <UserPlus size={22} className="text-primary" weight="duotone" />
            {party ? `Edit ${type === 'supplier' ? 'Supplier' : 'Customer'}` : 'Create New Party'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          <div className="space-y-2">
            <Label htmlFor="sharedPartyName">Party Name <span className="text-destructive">*</span></Label>
            <Input
              id="sharedPartyName"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter name"
              className="h-11"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sharedPartyPhone">Mobile Number</Label>
              <Input
                id="sharedPartyPhone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="Enter Mobile Number"
                className="h-11"
              />
            </div>
            {type === 'customer' && (
              <div className="space-y-2">
                <Label htmlFor="sharedPartyEmail">Email</Label>
                <Input
                  id="sharedPartyEmail"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Enter Email"
                  className="h-11"
                />
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-muted/20">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="font-semibold">Address (Optional)</div>
              <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={clearAddress}>
                Remove
              </Button>
            </div>
            <div className="space-y-4 p-4">
              <div className="space-y-2">
                <Label htmlFor="sharedPartyAddress" className="text-xs uppercase text-muted-foreground">
                  Billing Address
                </Label>
                <Textarea
                  id="sharedPartyAddress"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="Enter billing address"
                  rows={3}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="sharedPartyState" className="text-xs uppercase text-muted-foreground">State</Label>
                  <StateSelector
                    id="sharedPartyState"
                    value={stateCode || state}
                    onChange={(code, name) => {
                      setStateCode(code)
                      setState(name)
                    }}
                    placeholder="Select State"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sharedPartyPincode" className="text-xs uppercase text-muted-foreground">Pincode</Label>
                  <Input id="sharedPartyPincode" value={pincode} onChange={(event) => setPincode(event.target.value)} placeholder="Enter Pincode" className="h-10" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sharedPartyCity" className="text-xs uppercase text-muted-foreground">City</Label>
                <Input id="sharedPartyCity" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Enter City" className="h-10" />
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={shippingSameAsBilling}
                  onChange={(event) => setShippingSameAsBilling(event.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                Shipping address same as billing address
              </label>
              {!shippingSameAsBilling && (
                <div className="space-y-4 rounded-lg border border-border bg-background/70 p-4">
                  <div className="font-semibold">Shipping Address</div>
                  <div className="space-y-2">
                    <Label htmlFor="sharedPartyShippingAddress" className="text-xs uppercase text-muted-foreground">
                      Shipping Address
                    </Label>
                    <Textarea
                      id="sharedPartyShippingAddress"
                      value={shippingAddress}
                      onChange={(event) => setShippingAddress(event.target.value)}
                      placeholder="Enter shipping address"
                      rows={3}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="sharedPartyShippingState" className="text-xs uppercase text-muted-foreground">State</Label>
                      <StateSelector
                        id="sharedPartyShippingState"
                        value={shippingStateCode || shippingState}
                        onChange={(code, name) => {
                          setShippingStateCode(code)
                          setShippingState(name)
                        }}
                        placeholder="Select State"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sharedPartyShippingPincode" className="text-xs uppercase text-muted-foreground">Pincode</Label>
                      <Input id="sharedPartyShippingPincode" value={shippingPincode} onChange={(event) => setShippingPincode(event.target.value)} placeholder="Enter Pincode" className="h-10" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sharedPartyShippingCity" className="text-xs uppercase text-muted-foreground">City</Label>
                    <Input id="sharedPartyShippingCity" value={shippingCity} onChange={(event) => setShippingCity(event.target.value)} placeholder="Enter City" className="h-10" />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/20">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="font-semibold">GSTIN (Optional)</div>
              <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setGstin('')}>
                Remove
              </Button>
            </div>
            <div className="space-y-2 p-4">
              <Label htmlFor="sharedPartyGstin" className="text-xs uppercase text-muted-foreground">GSTIN (First 2 digits auto-select state)</Label>
              <Input
                id="sharedPartyGstin"
                value={gstin}
                onChange={(event) => handleGstinChange(event.target.value)}
                placeholder="ex: 19AAAAA0000A1Z5"
                maxLength={15}
                className="h-10 font-mono tracking-wider"
              />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="mb-3 font-semibold">Accounting Details</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sharedPartyOpeningBalance">Opening Balance (₹)</Label>
                <Input
                  id="sharedPartyOpeningBalance"
                  type="number"
                  step="0.01"
                  value={openingBalance}
                  onChange={(event) => setOpeningBalance(event.target.value)}
                  placeholder="0.00"
                  className="h-10 font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sharedPartyBalanceType">Balance Type</Label>
                <Select value={balanceType} onValueChange={(val: 'Credit' | 'Debit') => setBalanceType(val)}>
                  <SelectTrigger id="sharedPartyBalanceType" className="h-10 text-xs bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent style={{ zIndex: 9999 }}>
                    {type === 'supplier' ? (
                      <>
                        <SelectItem value="Credit">Credit (Payable)</SelectItem>
                        <SelectItem value="Debit">Debit (Advance)</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="Debit">Debit (Receivable)</SelectItem>
                        <SelectItem value="Credit">Credit (Advance)</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {(parseFloat(openingBalance) || 0) !== 0 && (
                <div className="space-y-2 sm:col-span-2 animate-in fade-in duration-200">
                  <Label htmlFor="sharedPartyOpeningBalanceDate">As-On Date <span className="text-destructive">*</span></Label>
                  <Input
                    id="sharedPartyOpeningBalanceDate"
                    type="date"
                    value={openingBalanceDate}
                    onChange={(event) => setOpeningBalanceDate(event.target.value)}
                    className="h-10 text-xs"
                    required
                  />
                </div>
              )}
            </div>
          </div>        </div>

        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave}>
            {party ? 'Save Changes' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
