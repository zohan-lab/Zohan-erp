import React, { useState, useEffect, useMemo } from 'react'
import {
  Party,
  Supplier,
  Customer,
  PurchaseInvoice,
  SalesInvoice,
  Payment,
  CustomerPayment,
  PaymentCDRule,
  InvoiceCloseCDRule,
  AnnualTarget,
  SupplierDebitNote,
  SupplierCreditNote,
  PurchaseReturn,
  GstRegistrationType
} from '@/lib/types'
import { getStateFromGstin, getStateByCode, getStateByName } from '@/lib/constants/indian-states'
import { StateSelector } from '@/components/state-selector'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { 
  CaretLeft, 
  UserPlus, 
  Building, 
  MapPin, 
  Bank, 
  CurrencyInr, 
  Receipt, 
  CalendarBlank, 
  Phone, 
  EnvelopeSimple, 
  CheckCircle, 
  Warning, 
  Plus, 
  Trash, 
  Percent, 
  ShieldCheck, 
  ArrowsClockwise,
  Info
} from '@phosphor-icons/react'
import { formatCurrency, getFYStart } from '@/lib/calculations'
import {
  getSupplierYTDInvoiced,
  getSupplierPendingPayments,
  getSupplierBalanceDetails,
  getCustomerBalanceDetails
} from '@/lib/report-calculations'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export type PartyType = 'party' | 'supplier' | 'customer'

interface PartyFullPageEditorProps {
  type?: PartyType
  party?: Supplier | Customer | Party | null
  existingParties?: (Supplier | Customer | Party)[]
  onSave: (savedParty: Party) => void
  onCancel: () => void
  isLocked?: boolean
  activeFY?: string
  // History & Metrics data
  invoices?: PurchaseInvoice[]
  salesInvoices?: SalesInvoice[]
  payments?: Payment[]
  customerPayments?: CustomerPayment[]
  debitNotes?: SupplierDebitNote[]
  supplierCreditNotes?: SupplierCreditNote[]
  purchaseReturns?: PurchaseReturn[]
}

function trimOrUndefined(value: string) {
  return value.trim() || undefined
}

export function PartyFullPageEditor({
  type = 'party',
  party,
  existingParties = [],
  onSave,
  onCancel,
  isLocked = false,
  activeFY,
  invoices = [],
  salesInvoices = [],
  payments = [],
  customerPayments = [],
  debitNotes = [],
  supplierCreditNotes = [],
  purchaseReturns = []
}: PartyFullPageEditorProps) {
  const isEditing = Boolean(party && party.id)
  const isSupplier = type === 'supplier'
  const isCustomer = type === 'customer'
  const partyLabel = isSupplier ? 'Supplier' : isCustomer ? 'Customer' : 'Party'

  // Form State: Profile & Basic Details
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [gstin, setGstin] = useState('')
  const [gstRegistrationType, setGstRegistrationType] = useState<GstRegistrationType>('Unregistered')

  // Form State: Billing Address
  const [address, setAddress] = useState('')
  const [state, setState] = useState('')
  const [stateCode, setStateCode] = useState('')
  const [city, setCity] = useState('')
  const [pincode, setPincode] = useState('')

  // Form State: Shipping Address
  const [shippingSameAsBilling, setShippingSameAsBilling] = useState(true)
  const [shippingAddress, setShippingAddress] = useState('')
  const [shippingState, setShippingState] = useState('')
  const [shippingStateCode, setShippingStateCode] = useState('')
  const [shippingCity, setShippingCity] = useState('')
  const [shippingPincode, setShippingPincode] = useState('')

  // Form State: Accounting & Balance Details
  const [openingBalance, setOpeningBalance] = useState('0')
  const [openingBalanceDate, setOpeningBalanceDate] = useState(getFYStart())
  const [balanceType, setBalanceType] = useState<'Credit' | 'Debit'>('Credit')

  // Form State: Supplier Specific CD & Target Rules
  const [advanceCDPercentage, setAdvanceCDPercentage] = useState('0')
  const [paymentCDRules, setPaymentCDRules] = useState<PaymentCDRule[]>([])
  const [newPayMinDays, setNewPayMinDays] = useState('0')
  const [newPayMaxDays, setNewPayMaxDays] = useState('15')
  const [newPayRate, setNewPayRate] = useState('1.0')

  const [invoiceCloseCDRules, setInvoiceCloseCDRules] = useState<InvoiceCloseCDRule[]>([])
  const [newCloseMinDays, setNewCloseMinDays] = useState('0')
  const [newCloseMaxDays, setNewCloseMaxDays] = useState('15')
  const [newCloseRate, setNewCloseRate] = useState('100')
  const [newCloseUnit, setNewCloseUnit] = useState('MT')

  const [targetMT, setTargetMT] = useState('0')
  const [targetRatePerMT, setTargetRatePerMT] = useState('0')

  // Initialize form from props
  useEffect(() => {
    if (!party) {
      setName('')
      setPhone('')
      setEmail('')
      setGstin('')
      setGstRegistrationType('Unregistered')
      setAddress('')
      setState('West Bengal')
      setStateCode('19')
      setCity('')
      setPincode('')
      setShippingSameAsBilling(true)
      setShippingAddress('')
      setShippingState('West Bengal')
      setShippingStateCode('19')
      setShippingCity('')
      setShippingPincode('')
      setOpeningBalance('0')
      setOpeningBalanceDate(getFYStart())
      setBalanceType(isSupplier ? 'Credit' : 'Debit')
      setAdvanceCDPercentage('0')
      setPaymentCDRules([])
      setInvoiceCloseCDRules([])
      setTargetMT('0')
      setTargetRatePerMT('0')
      return
    }

    setName(party.name || '')
    setPhone(party.phone || '')
    setEmail(('email' in party ? party.email : '') || '')
    setGstin(party.gstin || '')
    setGstRegistrationType(
      party.gstRegistrationType ||
      (party.gstin && party.gstin.trim().length === 15 ? 'Registered' : 'Unregistered')
    )

    setAddress(party.address || '')
    const resolvedState = getStateByName(party.stateName || party.state) || getStateByCode(party.stateCode || party.state)
    setState(resolvedState?.name || party.state || 'West Bengal')
    setStateCode(resolvedState?.code || party.stateCode || '19')
    setCity(party.city || '')
    setPincode(party.pincode || '')

    const sameShipping = party.shippingSameAsBilling ?? true
    setShippingSameAsBilling(sameShipping)
    setShippingAddress(party.shippingAddress || '')
    const resolvedShipState = getStateByName(party.shippingStateName || party.shippingState) || getStateByCode(party.shippingStateCode || party.shippingState)
    setShippingState(resolvedShipState?.name || party.shippingState || 'West Bengal')
    setShippingStateCode(resolvedShipState?.code || party.shippingStateCode || '19')
    setShippingCity(party.shippingCity || '')
    setShippingPincode(party.shippingPincode || '')

    setOpeningBalance((party.openingBalance || 0).toString())
    setOpeningBalanceDate(party.openingBalanceDate || getFYStart())
    setBalanceType(party.balanceType || (isSupplier ? 'Credit' : 'Debit'))

    if (isSupplier && 'paymentCDRules' in party) {
      const sup = party as Supplier
      setAdvanceCDPercentage((sup.advanceCDPercentage || 0).toString())
      setPaymentCDRules(sup.paymentCDRules || [])
      setInvoiceCloseCDRules(sup.invoiceCloseCDRules || [])
      setTargetMT((sup.annualTarget?.targetMT || 0).toString())
      setTargetRatePerMT((sup.annualTarget?.ratePerMT || 0).toString())
    }
  }, [party, isSupplier])

  // GSTIN auto-detection handler
  const handleGstinChange = (value: string) => {
    const cleanGstin = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15)
    setGstin(cleanGstin)
    
    // Auto-detect and switch registration type
    if (cleanGstin.length === 15) {
      setGstRegistrationType('Registered')
    } else if (cleanGstin.length === 0 && gstRegistrationType === 'Registered') {
      setGstRegistrationType('Unregistered')
    }

    // Auto-detect state from first 2 digits
    const detected = getStateFromGstin(cleanGstin)
    if (detected) {
      setStateCode(detected.code)
      setState(detected.name)
      if (shippingSameAsBilling) {
        setShippingStateCode(detected.code)
        setShippingState(detected.name)
      }
    }
  }

  // Supplier CD rule handlers
  const handleAddPaymentCDTier = () => {
    const minD = parseInt(newPayMinDays) || 0
    const maxD = parseInt(newPayMaxDays) || 0
    const rate = parseFloat(newPayRate) || 0
    if (maxD <= minD) return toast.error('Max days must be greater than Min days')
    setPaymentCDRules((prev) => [...prev, { minDays: minD, maxDays: maxD, percentageRate: rate }])
    setNewPayMinDays(maxD.toString())
    setNewPayMaxDays((maxD + 15).toString())
  }

  const handleRemovePaymentCDTier = (index: number) => {
    setPaymentCDRules((prev) => prev.filter((_, i) => i !== index))
  }

  const handleAddCloseRule = () => {
    const minD = parseInt(newCloseMinDays) || 0
    const maxD = parseInt(newCloseMaxDays) || 0
    const rate = parseFloat(newCloseRate) || 0
    const unit = newCloseUnit || 'MT'
    if (maxD <= minD) return toast.error('Max days must be greater than Min days')
    setInvoiceCloseCDRules((prev) => [...prev, { minDays: minD, maxDays: maxD, ratePerMT: rate, unit }])
    setNewCloseMinDays(maxD.toString())
    setNewCloseMaxDays((maxD + 15).toString())
  }

  const handleRemoveCloseRule = (index: number) => {
    setInvoiceCloseCDRules((prev) => prev.filter((_, i) => i !== index))
  }

  // Right-side metrics calculation for existing party
  const partyInvoices = useMemo(() => {
    if (!party?.id) return []
    if (isSupplier) {
      return invoices.filter(inv => inv.supplierId === party.id)
    } else {
      return salesInvoices.filter(inv => inv.customerId === party.id)
    }
  }, [party, isSupplier, invoices, salesInvoices])

  const totalInvoicedYTD = useMemo(() => {
    if (!party?.id) return 0
    if (isSupplier) {
      return getSupplierYTDInvoiced(party.id, invoices, activeFY)
    } else {
      return partyInvoices.reduce((sum, inv) => sum + (inv.invoiceAmount || 0), 0)
    }
  }, [party, isSupplier, invoices, partyInvoices, activeFY])

  const pendingAmount = useMemo(() => {
    if (!party?.id) return 0
    if (isSupplier) {
      return getSupplierPendingPayments(party as Supplier, invoices, payments, activeFY)
    } else {
      const details = getCustomerBalanceDetails(party as Customer, salesInvoices, customerPayments)
      return Math.max(0, details.netBalance)
    }
  }, [party, isSupplier, invoices, payments, salesInvoices, customerPayments, activeFY])

  const lastTransactionDate = useMemo(() => {
    if (partyInvoices.length === 0) return 'No transactions yet'
    const sorted = [...partyInvoices].sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime())
    return sorted[0].invoiceDate
  }, [partyInvoices])

  // Form Submit Handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isLocked) return toast.error('Data is locked.')
    if (!name.trim()) return toast.error('Party Name is required')

    const cleanName = name.trim()
    const duplicate = existingParties.some(p => p.id !== party?.id && p.name.trim().toLowerCase() === cleanName.toLowerCase())
    if (duplicate) {
      return toast.error(`${partyLabel} with this name already exists`)
    }

    const opBal = parseFloat(openingBalance) || 0
    const cleanShippingAddress = shippingSameAsBilling ? address : shippingAddress
    const cleanShippingState = shippingSameAsBilling ? state : shippingState
    const cleanShippingStateCode = shippingSameAsBilling ? stateCode : shippingStateCode
    const cleanShippingCity = shippingSameAsBilling ? city : shippingCity
    const cleanShippingPincode = shippingSameAsBilling ? pincode : shippingPincode

    const advCD = parseFloat(advanceCDPercentage) || 0
    const tMT = parseFloat(targetMT) || 0
    const tRate = parseFloat(targetRatePerMT) || 0
    const annualTarget: AnnualTarget | undefined = (tMT > 0 || tRate > 0) ? { targetMT: tMT, ratePerMT: tRate } : undefined

    const partyToSave: Party = {
      ...(party || {}),
      id: party?.id || `party-${Date.now()}`,
      name: cleanName,
      phone: trimOrUndefined(phone),
      email: trimOrUndefined(email),
      address: trimOrUndefined(address),
      state: trimOrUndefined(state),
      stateCode: trimOrUndefined(stateCode),
      stateName: trimOrUndefined(state),
      city: trimOrUndefined(city),
      pincode: trimOrUndefined(pincode),
      shippingSameAsBilling,
      shippingAddress: trimOrUndefined(cleanShippingAddress),
      shippingState: trimOrUndefined(cleanShippingState),
      shippingStateCode: trimOrUndefined(cleanShippingStateCode),
      shippingStateName: trimOrUndefined(cleanShippingState),
      shippingCity: trimOrUndefined(cleanShippingCity),
      shippingPincode: trimOrUndefined(cleanShippingPincode),
      gstin: trimOrUndefined(gstin.toUpperCase()),
      gstRegistrationType,
      openingBalance: opBal !== 0 ? opBal : undefined,
      openingBalanceDate: opBal !== 0 ? openingBalanceDate : undefined,
      balanceType,
      advanceCDPercentage: advCD > 0 ? advCD : undefined,
      paymentCDRules: paymentCDRules.length > 0 ? paymentCDRules : undefined,
      invoiceCloseCDRules: invoiceCloseCDRules.length > 0 ? invoiceCloseCDRules : undefined,
      annualTarget,
      cdRuleVersions: (party as any)?.cdRuleVersions,
      cdRuleChangeLog: (party as any)?.cdRuleChangeLog
    }

    onSave(partyToSave)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pb-20 max-w-7xl mx-auto px-2 sm:px-4">
      {/* Top Navigation & Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-20 py-3 -mx-2 sm:-mx-4 px-4 sm:px-6 shadow-2xs">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onCancel}
            className="h-9 w-9 rounded-full text-slate-700 hover:bg-slate-100"
          >
            <CaretLeft className="h-5 w-5" weight="bold" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                {isEditing ? `Edit ${partyLabel}: ${party?.name}` : `Add New ${partyLabel}`}
              </h1>
              <Badge variant="outline" className="text-[11px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border-blue-200">
                {partyLabel}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Configure profile info, GST jurisdiction, billing & shipping addresses
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="border-slate-200 text-xs font-semibold rounded-xl px-4 h-9 bg-white"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isLocked}
            className="bg-[#0256e8] hover:bg-[#0046cd] text-white font-bold rounded-xl px-5 h-9 text-xs shadow-sm flex items-center gap-1.5"
          >
            <CheckCircle className="h-4 w-4" weight="bold" />
            {isEditing ? `Update ${partyLabel}` : `Save ${partyLabel}`}
          </Button>
        </div>
      </div>

      {/* Main Grid Layout: 8 cols Form + 4 cols Widget */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Form Area (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* CARD 1: Profile & Basic Details */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
              <UserPlus className="h-4 w-4 text-[#0256e8]" weight="bold" />
              <span>Basic Profile Details</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="partyName" className="text-xs font-bold text-slate-700">
                  Party Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="partyName"
                  type="text"
                  placeholder={`e.g. ${isSupplier ? 'Alpha Steel Distributors Pvt Ltd' : 'Modern Builders & Contractors'}`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-10 text-xs bg-white font-semibold text-slate-900 focus-visible:ring-blue-500"
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="gstRegistrationType" className="text-xs font-bold text-slate-700">
                    GST Registration Type
                  </Label>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] px-2 py-0.5 font-bold uppercase tracking-wider",
                      gstRegistrationType === 'Registered'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : gstRegistrationType === 'Composition'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-blue-50 text-blue-700 border-blue-200'
                    )}
                  >
                    {gstRegistrationType === 'Registered'
                      ? 'B2B Registered'
                      : gstRegistrationType === 'Composition'
                      ? 'Composition Scheme'
                      : 'B2C Retail / Consumer'}
                  </Badge>
                </div>
                <Select
                  value={gstRegistrationType}
                  onValueChange={(val: GstRegistrationType) => setGstRegistrationType(val)}
                >
                  <SelectTrigger id="gstRegistrationType" className="h-10 text-xs bg-white font-medium">
                    <SelectValue placeholder="Select Registration Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Registered">Registered Regular (B2B Tax Invoices & ITC)</SelectItem>
                    <SelectItem value="Unregistered">Unregistered / Retail (B2C Standard)</SelectItem>
                    <SelectItem value="Composition">Composition Scheme (Quarterly GST)</SelectItem>
                    <SelectItem value="Consumer">Consumer / End Customer (B2C Retail)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-slate-500">
                  {gstRegistrationType === 'Registered'
                    ? 'Identified as B2B for GSTR-1 Table 4 tax invoicing.'
                    : 'Identified as B2C for GSTR-1 Table 5 / Table 7 retail summaries.'}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="partyGstin" className="text-xs font-bold text-slate-700">
                  GSTIN Number (15 Digits)
                </Label>
                <Input
                  id="partyGstin"
                  type="text"
                  placeholder="ex: 19AAAAA0000A1Z5"
                  value={gstin}
                  onChange={(e) => handleGstinChange(e.target.value)}
                  maxLength={15}
                  className="h-10 text-xs bg-white font-mono tracking-wider text-slate-900 uppercase"
                />
                <p className="text-[10px] text-slate-500">
                  First 2 digits will auto-detect matching State. Entering 15 digits auto-sets B2B Registered.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="partyPhone" className="text-xs font-bold text-slate-700">
                  Mobile / Phone Number
                </Label>
                <Input
                  id="partyPhone"
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-10 text-xs bg-white"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="partyEmail" className="text-xs font-bold text-slate-700">
                  Email Address
                </Label>
                <Input
                  id="partyEmail"
                  type="email"
                  placeholder="accounts@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-10 text-xs bg-white"
                />
              </div>
            </div>
          </div>

          {/* CARD 2: Detailed Billing Address Card */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
              <MapPin className="h-4 w-4 text-[#0256e8]" weight="bold" />
              <span>Billing Address & GST Jurisdiction</span>
            </h3>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="partyAddress" className="text-xs font-bold text-slate-700">
                  Billing Address
                </Label>
                <Textarea
                  id="partyAddress"
                  placeholder="Plot No. 12, Industrial Estate, Main Road..."
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="text-xs min-h-[72px]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="partyState" className="text-xs font-bold text-slate-700">
                    State (GST Code) <span className="text-destructive">*</span>
                  </Label>
                  <StateSelector
                    id="partyState"
                    value={stateCode || state}
                    onChange={(code, sName) => {
                      setStateCode(code)
                      setState(sName)
                      if (shippingSameAsBilling) {
                        setShippingStateCode(code)
                        setShippingState(sName)
                      }
                    }}
                    placeholder="Select State"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="partyCity" className="text-xs font-bold text-slate-700">
                    City
                  </Label>
                  <Input
                    id="partyCity"
                    type="text"
                    placeholder="e.g. Kolkata"
                    value={city}
                    onChange={(e) => {
                      setCity(e.target.value)
                      if (shippingSameAsBilling) setShippingCity(e.target.value)
                    }}
                    className="h-10 text-xs bg-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="partyPincode" className="text-xs font-bold text-slate-700">
                    Pincode
                  </Label>
                  <Input
                    id="partyPincode"
                    type="text"
                    placeholder="700001"
                    value={pincode}
                    onChange={(e) => {
                      setPincode(e.target.value)
                      if (shippingSameAsBilling) setShippingPincode(e.target.value)
                    }}
                    className="h-10 text-xs bg-white font-mono"
                  />
                </div>
              </div>

              {/* Shipping Address Same As Billing Checkbox */}
              <div className="pt-2 border-t border-slate-100">
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={shippingSameAsBilling}
                    onChange={(e) => setShippingSameAsBilling(e.target.checked)}
                    className="h-4 w-4 rounded accent-[#0256e8] cursor-pointer"
                  />
                  <span>Shipping address is same as billing address</span>
                </label>
              </div>

              {/* Expanded Shipping Address Section */}
              {!shippingSameAsBilling && (
                <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 space-y-4 animate-in fade-in duration-200">
                  <div className="flex items-center gap-2 text-xs font-bold text-blue-900 border-b border-blue-100 pb-2">
                    <Building className="h-4 w-4 text-blue-600" />
                    <span>Shipping / Consignee Address</span>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="shippingAddress" className="text-xs font-bold text-slate-700">
                      Shipping Street Address
                    </Label>
                    <Textarea
                      id="shippingAddress"
                      placeholder="Warehouse / Site Address..."
                      value={shippingAddress}
                      onChange={(e) => setShippingAddress(e.target.value)}
                      className="text-xs min-h-[64px] bg-white"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="shippingState" className="text-xs font-bold text-slate-700">
                        Shipping State
                      </Label>
                      <StateSelector
                        id="shippingState"
                        value={shippingStateCode || shippingState}
                        onChange={(code, sName) => {
                          setShippingStateCode(code)
                          setShippingState(sName)
                        }}
                        placeholder="Select Shipping State"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="shippingCity" className="text-xs font-bold text-slate-700">
                        Shipping City
                      </Label>
                      <Input
                        id="shippingCity"
                        type="text"
                        placeholder="e.g. Howrah"
                        value={shippingCity}
                        onChange={(e) => setShippingCity(e.target.value)}
                        className="h-10 text-xs bg-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="shippingPincode" className="text-xs font-bold text-slate-700">
                        Shipping Pincode
                      </Label>
                      <Input
                        id="shippingPincode"
                        type="text"
                        placeholder="711101"
                        value={shippingPincode}
                        onChange={(e) => setShippingPincode(e.target.value)}
                        className="h-10 text-xs bg-white font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* CARD 3: Accounting & Opening Balance */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
              <Bank className="h-4 w-4 text-[#0256e8]" weight="bold" />
              <span>Opening Balance & Ledger Setup</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="openingBalance" className="text-xs font-bold text-slate-700">
                  Opening Balance (₹)
                </Label>
                <Input
                  id="openingBalance"
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  className="h-10 text-xs font-bold font-mono text-slate-900 bg-white"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">
                  Balance Type
                </Label>
                <Select value={balanceType} onValueChange={(val: 'Credit' | 'Debit') => setBalanceType(val)}>
                  <SelectTrigger className="h-10 text-xs bg-white font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Credit">
                      Credit ({isSupplier ? 'Payable to Supplier' : 'Advance from Customer'})
                    </SelectItem>
                    <SelectItem value="Debit">
                      Debit ({isSupplier ? 'Advance to Supplier' : 'Receivable from Customer'})
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(parseFloat(openingBalance) || 0) !== 0 && (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50/70">
                <CalendarBlank className="h-5 w-5 text-blue-600 shrink-0" />
                <div className="flex-1 space-y-1">
                  <Label className="text-xs font-bold text-slate-700">
                    Opening Balance Date <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={openingBalanceDate}
                    onChange={(e) => setOpeningBalanceDate(e.target.value)}
                    className="h-8 text-xs bg-white w-44 font-mono"
                  />
                </div>
              </div>
            )}
          </div>

          {/* CARD 4: Supplier CD & Annual Target Rules (Supplier Only) */}
          {isSupplier && (
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Percent className="h-4 w-4 text-[#0256e8]" weight="bold" />
                  <span>Cash Discount (CD) & Annual Target Rules</span>
                </h3>
                <Badge variant="outline" className="text-[10px] bg-slate-50 font-mono">
                  Supplier Exclusive
                </Badge>
              </div>

              {/* Advance CD % */}
              <div className="space-y-2 p-3.5 rounded-xl border border-slate-100 bg-slate-50/50">
                <Label htmlFor="advCD" className="text-xs font-bold text-slate-800">
                  Advance CD % (Unallocated Payment Discount)
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="advCD"
                    type="number"
                    step="0.01"
                    placeholder="3.0"
                    value={advanceCDPercentage}
                    onChange={(e) => setAdvanceCDPercentage(e.target.value)}
                    className="h-9 text-xs bg-white w-32 font-mono"
                  />
                  <span className="text-xs text-slate-500 font-medium">% discount applied to advance payment before invoice date</span>
                </div>
              </div>

              {/* Payment CD Slabs Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-slate-800">Payment Days CD Slabs</Label>
                  <span className="text-[11px] text-slate-500">{paymentCDRules.length} slabs configured</span>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <tr>
                        <th className="py-2 px-3 text-left">Min Days</th>
                        <th className="py-2 px-3 text-left">Max Days</th>
                        <th className="py-2 px-3 text-right">CD Rate %</th>
                        <th className="py-2 px-3 text-center w-16">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paymentCDRules.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-4 text-center text-slate-400">
                            No payment CD slabs added. Add below if applicable.
                          </td>
                        </tr>
                      ) : (
                        paymentCDRules.map((rule, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-2 px-3 font-mono">{rule.minDays} days</td>
                            <td className="py-2 px-3 font-mono">{rule.maxDays} days</td>
                            <td className="py-2 px-3 text-right font-bold text-blue-600 font-mono">{rule.percentageRate}%</td>
                            <td className="py-2 px-3 text-center">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemovePaymentCDTier(idx)}
                                className="h-6 w-6 p-0 text-red-600 hover:bg-red-50"
                              >
                                <Trash className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Add Slab Row */}
                <div className="grid grid-cols-4 gap-2 pt-1">
                  <Input
                    type="number"
                    placeholder="Min Days"
                    value={newPayMinDays}
                    onChange={(e) => setNewPayMinDays(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                  <Input
                    type="number"
                    placeholder="Max Days"
                    value={newPayMaxDays}
                    onChange={(e) => setNewPayMaxDays(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Rate %"
                    value={newPayRate}
                    onChange={(e) => setNewPayRate(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddPaymentCDTier}
                    className="h-8 text-xs bg-slate-800 hover:bg-slate-900 text-white font-bold"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Slab
                  </Button>
                </div>
              </div>

              {/* Annual Target Section */}
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <Label className="text-xs font-bold text-slate-800">Annual Target & Bonus Discount</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-[11px] text-slate-600 font-medium">Target Quantity (MT)</span>
                    <Input
                      type="number"
                      step="any"
                      placeholder="e.g. 500 MT"
                      value={targetMT}
                      onChange={(e) => setTargetMT(e.target.value)}
                      className="h-9 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[11px] text-slate-600 font-medium">Bonus Rate (₹ per MT)</span>
                    <Input
                      type="number"
                      step="any"
                      placeholder="e.g. ₹50 / MT"
                      value={targetRatePerMT}
                      onChange={(e) => setTargetRatePerMT(e.target.value)}
                      className="h-9 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Summary & Stats Column (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Card: Financial Summary Widget */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Receipt className="h-4 w-4 text-[#0256e8]" weight="bold" />
                <span>{isEditing ? `${partyLabel} Summary` : 'Party Overview'}</span>
              </h3>
              {isEditing && (
                <Badge variant="outline" className="text-[10px] bg-slate-50 font-mono">
                  {partyInvoices.length} Invoices
                </Badge>
              )}
            </div>

            {isEditing ? (
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">Total Invoiced (YTD)</span>
                  <span className="font-bold text-slate-900 font-mono">{formatCurrency(totalInvoicedYTD)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">Outstanding Balance</span>
                  <span className={cn("font-bold font-mono", pendingAmount > 0 ? "text-red-600" : "text-emerald-600")}>
                    {formatCurrency(pendingAmount)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">Last Invoice Date</span>
                  <span className="font-semibold text-slate-700 font-mono">{lastTransactionDate}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-slate-500 font-medium">GST Jurisdiction</span>
                  <span className="font-bold text-blue-700 font-mono">
                    [{stateCode || '19'}] {state || 'West Bengal'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-100 text-xs text-blue-900 space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-blue-950">
                  <Info className="h-4 w-4 text-blue-700" />
                  <span>GST State Code Guidelines</span>
                </div>
                <p className="text-[11px] text-blue-800 leading-relaxed">
                  Enter the party's 15-digit GSTIN to automatically determine the state code. Transactions with base state <strong>[19] West Bengal</strong> will calculate CGST & SGST (9% + 9%), while other states will apply IGST (18%).
                </p>
              </div>
            )}
          </div>

          {/* Card: Quick GST Helper */}
          <div className="bg-slate-50 rounded-2xl border border-slate-200/80 p-5 space-y-3">
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" weight="bold" />
              <span>GST Compliance & Validation</span>
            </h4>
            <div className="space-y-2 text-[11px] text-slate-600">
              <div className="flex items-start gap-2">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>Valid 15-character GSTIN format enables inter/intra-state tax automation.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>Separate shipping address can be configured for multi-site consignees.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>Opening balance integrates into the real-time financial ledger.</span>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="space-y-2">
            <Button
              type="submit"
              disabled={isLocked}
              className="w-full bg-[#0256e8] hover:bg-[#0046cd] text-white font-bold h-11 text-xs rounded-xl shadow-md flex items-center justify-center gap-2"
            >
              <CheckCircle className="h-4 w-4" weight="bold" />
              {isEditing ? `Update ${partyLabel}` : `Create ${partyLabel}`}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="w-full border-slate-200 text-xs font-semibold h-10 rounded-xl bg-white"
            >
              Cancel and Return
            </Button>
          </div>
        </div>
      </div>
    </form>
  )
}
