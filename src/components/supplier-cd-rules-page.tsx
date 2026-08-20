import { getChangedByLabel, getChangedByRole } from '@/lib/security-utils'
import { useState, useEffect } from 'react'
import { Party, Supplier, PaymentCDRule, InvoiceCloseCDRule } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tag, Trash, Info, Percent, Clock, Gear, CaretDown, CaretRight } from '@phosphor-icons/react'
import { formatCurrency } from '@/lib/calculations'
import { getAvailableUnits } from '@/lib/custom-data-store'
import { toast } from 'sonner'

interface SupplierCDRulesPageProps {
  parties?: Party[]
  setParties?: (updater: (prev: Party[]) => Party[]) => void
  suppliers?: Supplier[]
  setSuppliers?: (updater: (prev: Supplier[]) => Supplier[]) => void
  isLocked?: boolean
}

export default function SupplierCDRulesPage({ parties, setParties, suppliers = [], setSuppliers, isLocked }: SupplierCDRulesPageProps) {
  const suppliersList = parties || suppliers || []
  const setSuppliersHandler = setParties || setSuppliers || (() => {})
  const [availableUnits, setAvailableUnits] = useState(() => getAvailableUnits())


  useEffect(() => {
    const syncUnits = () => setAvailableUnits(getAvailableUnits())
    window.addEventListener('custom-units-updated', syncUnits)
    return () => window.removeEventListener('custom-units-updated', syncUnits)
  }, [])

  // DO NOT auto-select supplier! Start empty until user selects a supplier
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('')

  // Modals visibility
  const [editPaymentModalOpen, setEditPaymentModalOpen] = useState<boolean>(false)
  const [editCloseModalOpen, setEditCloseModalOpen] = useState<boolean>(false)
  const [editTargetModalOpen, setEditTargetModalOpen] = useState<boolean>(false)

  // Separate History Category State (PaymentCD vs InvoiceClosedCD)
  const [historyCategory, setHistoryCategory] = useState<'PaymentCD' | 'InvoiceClosedCD' | null>(null)

  // Single Expandable History Accordion tracking state (only 1 item open at a time; previous expands collapse automatically)
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null)

  // SEPARATE / INDEPENDENT Effective From Dates for each section (Defaults to current date)
  const [payEffectiveDate, setPayEffectiveDate] = useState<string>(new Date().toISOString().split('T')[0])
  const [closeEffectiveDate, setCloseEffectiveDate] = useState<string>(new Date().toISOString().split('T')[0])
  const [targetEffectiveDate, setTargetEffectiveDate] = useState<string>(new Date().toISOString().split('T')[0])

  // Draft form states for Payment CD Rules modal (FRESH START)
  const [draftAdvanceCD, setDraftAdvanceCD] = useState<string>('')
  const [draftPaymentRules, setDraftPaymentRules] = useState<PaymentCDRule[]>([])
  const [payChangeReason, setPayChangeReason] = useState<string>('')
  const [newPayMin, setNewPayMin] = useState<string>('')
  const [newPayMax, setNewPayMax] = useState<string>('')
  const [newPayRate, setNewPayRate] = useState<string>('')

  // Draft form states for Invoice Closed CD Rules modal (FRESH START)
  const [draftCloseRules, setDraftCloseRules] = useState<InvoiceCloseCDRule[]>([])
  const [closeChangeReason, setCloseChangeReason] = useState<string>('')
  const [newCloseMin, setNewCloseMin] = useState<string>('')
  const [newCloseMax, setNewCloseMax] = useState<string>('')
  const [newCloseRate, setNewCloseRate] = useState<string>('')
  const [newCloseUnit, setNewCloseUnit] = useState<string>('MT')

  // Draft form states for Annual Target modal (FRESH START)
  const [draftTargetMT, setDraftTargetMT] = useState<string>('')
  const [draftTargetRate, setDraftTargetRate] = useState<string>('')
  const [draftTargetUnit, setDraftTargetUnit] = useState<string>('MT')
  const [targetChangeReason, setTargetChangeReason] = useState<string>('')

  const selectedSupplier = suppliersList.find((s) => s.id === selectedSupplierId)

  // Open FRESH Payment CD Rules Modal (Clean slate inputs & Current Date as default effective date)
  const openEditPaymentModal = () => {
    if (!selectedSupplier) return
    setPayEffectiveDate(new Date().toISOString().split('T')[0])
    setDraftAdvanceCD('')
    setDraftPaymentRules([])
    setPayChangeReason('')
    setNewPayMin('')
    setNewPayMax('')
    setNewPayRate('')
    setEditPaymentModalOpen(true)
  }

  // Open FRESH Invoice Closed CD Rules Modal (Clean slate inputs & Current Date as default effective date)
  const openEditCloseModal = () => {
    if (!selectedSupplier) return
    setCloseEffectiveDate(new Date().toISOString().split('T')[0])
    setDraftCloseRules([])
    setCloseChangeReason('')
    setNewCloseMin('')
    setNewCloseMax('')
    setNewCloseRate('')
    setNewCloseUnit('MT')
    setEditCloseModalOpen(true)
  }

  // Open FRESH Annual Target Modal (Clean slate inputs & Current Date as default effective date)
  const openEditTargetModal = () => {
    if (!selectedSupplier) return
    setTargetEffectiveDate(new Date().toISOString().split('T')[0])
    setDraftTargetMT(selectedSupplier.annualTarget?.targetMT?.toString() || '')
    setDraftTargetRate(selectedSupplier.annualTarget?.ratePerMT?.toString() || '')
    setDraftTargetUnit(selectedSupplier.annualTarget?.unit || 'MT')
    setTargetChangeReason('')
    setEditTargetModalOpen(true)
  }

  // Single Accordion Toggle: Expand current item, collapse previous
  const toggleHistoryItem = (id: string) => {
    setExpandedHistoryId((prev) => (prev === id ? null : id))
  }

  // Add Tier in Payment Modal
  const handleAddPaymentTier = () => {
    const min = parseInt(newPayMin)
    const max = parseInt(newPayMax)
    const rate = parseFloat(newPayRate)

    if (isNaN(min) || isNaN(max) || isNaN(rate)) {
      toast.error('Please enter valid numbers for Payment CD tier')
      return
    }
    if (min < 0 || max < min) {
      toast.error('Invalid day range (Min Days must be <= Max Days)')
      return
    }

    setDraftPaymentRules((prev) => [...prev, { minDays: min, maxDays: max, percentageRate: rate }])
    setNewPayMin('')
    setNewPayMax('')
    setNewPayRate('')
    toast.success('Payment CD tier added')
  }

  // Save Payment CD Rules: New rules become active; old rules archived to history
  const handleSavePaymentRules = () => {
    if (!selectedSupplier) return
    const advNum = parseFloat(draftAdvanceCD) || 0

    const currentVersions = selectedSupplier.cdRuleVersions || []
    const newVersionNumber = currentVersions.length + 1

    const historyEntry = {
      id: `${selectedSupplier.id}-pay-v${newVersionNumber}`,
      version: newVersionNumber,
      ruleName: `Payment CD Rules v${newVersionNumber}`,
      effectiveFrom: payEffectiveDate,
      paymentCDRules: draftPaymentRules,
      invoiceCloseCDRules: selectedSupplier.invoiceCloseCDRules || [],
      advanceCDPercentage: advNum > 0 ? advNum : undefined,
      approvalStatus: 'Approved' as const,
      changedBy: getChangedByLabel(), changedByRole: getChangedByRole(),
      changedAt: new Date().toISOString(),
      reason: payChangeReason || 'Updated Payment CD Rules'
    }

    const updatedSupplier: Supplier = {
      ...selectedSupplier,
      advanceCDPercentage: advNum > 0 ? advNum : undefined,
      paymentCDRules: draftPaymentRules,
      cdRuleVersions: [historyEntry, ...currentVersions],
      cdRuleChangeLog: [
        {
          id: `log-${Date.now()}`,
          supplierId: selectedSupplier.id,
          ruleName: `Payment CD Rules v${newVersionNumber}`,
          ruleVersion: newVersionNumber,
          previousValues: {
            paymentCDRules: selectedSupplier.paymentCDRules || [],
            invoiceCloseCDRules: selectedSupplier.invoiceCloseCDRules || [],
            advanceCDPercentage: selectedSupplier.advanceCDPercentage
          },
          newValues: {
            paymentCDRules: draftPaymentRules,
            invoiceCloseCDRules: selectedSupplier.invoiceCloseCDRules || [],
            advanceCDPercentage: advNum > 0 ? advNum : undefined,
            effectiveFrom: payEffectiveDate
          },
          effectiveDate: payEffectiveDate,
          changedBy: getChangedByLabel(), changedByRole: getChangedByRole(),
          changedAt: new Date().toISOString(),
          reason: payChangeReason || 'Updated Payment CD Rules',
          approvalStatus: 'Approved'
        },
        ...(selectedSupplier.cdRuleChangeLog || [])
      ]
    }

    setSuppliersHandler((prev) => prev.map((s) => (s.id === selectedSupplier.id ? updatedSupplier : s)))
    setEditPaymentModalOpen(false)
    toast.success(`Payment CD Rules updated for ${selectedSupplier.name}!`)
  }

  // Add Rule in Invoice Closed Modal
  const handleAddCloseRule = () => {
    const min = parseInt(newCloseMin)
    const max = parseInt(newCloseMax)
    const rate = parseFloat(newCloseRate)

    if (isNaN(min) || isNaN(max) || isNaN(rate)) {
      toast.error('Please enter valid numbers for Invoice Closed CD rule')
      return
    }
    if (min < 0 || max < min) {
      toast.error('Invalid day range (Min Days must be <= Max Days)')
      return
    }

    setDraftCloseRules((prev) => [...prev, { minDays: min, maxDays: max, ratePerMT: rate, unit: newCloseUnit }])
    setNewCloseMin('')
    setNewCloseMax('')
    setNewCloseRate('')
    toast.success('Invoice Closed CD rule added')
  }

  // Save Invoice Closed CD Rules: New rules become active; old rules archived to history
  const handleSaveCloseRules = () => {
    if (!selectedSupplier) return

    const currentVersions = selectedSupplier.cdRuleVersions || []
    const newVersionNumber = currentVersions.length + 1

    const historyEntry = {
      id: `${selectedSupplier.id}-close-v${newVersionNumber}`,
      version: newVersionNumber,
      ruleName: `Invoice Closed CD Rules v${newVersionNumber}`,
      effectiveFrom: closeEffectiveDate,
      paymentCDRules: selectedSupplier.paymentCDRules || [],
      invoiceCloseCDRules: draftCloseRules,
      advanceCDPercentage: selectedSupplier.advanceCDPercentage,
      approvalStatus: 'Approved' as const,
      changedBy: getChangedByLabel(), changedByRole: getChangedByRole(),
      changedAt: new Date().toISOString(),
      reason: closeChangeReason || 'Updated Invoice Closed CD Rules'
    }

    const updatedSupplier: Supplier = {
      ...selectedSupplier,
      invoiceCloseCDRules: draftCloseRules,
      cdRuleVersions: [historyEntry, ...currentVersions],
      cdRuleChangeLog: [
        {
          id: `log-${Date.now()}`,
          supplierId: selectedSupplier.id,
          ruleName: `Invoice Closed CD Rules v${newVersionNumber}`,
          ruleVersion: newVersionNumber,
          previousValues: {
            paymentCDRules: selectedSupplier.paymentCDRules || [],
            invoiceCloseCDRules: selectedSupplier.invoiceCloseCDRules || [],
            advanceCDPercentage: selectedSupplier.advanceCDPercentage
          },
          newValues: {
            paymentCDRules: selectedSupplier.paymentCDRules || [],
            invoiceCloseCDRules: draftCloseRules,
            advanceCDPercentage: selectedSupplier.advanceCDPercentage,
            effectiveFrom: closeEffectiveDate
          },
          effectiveDate: closeEffectiveDate,
          changedBy: getChangedByLabel(), changedByRole: getChangedByRole(),
          changedAt: new Date().toISOString(),
          reason: closeChangeReason || 'Updated Invoice Closed CD Rules',
          approvalStatus: 'Approved'
        },
        ...(selectedSupplier.cdRuleChangeLog || [])
      ]
    }

    setSuppliersHandler((prev) => prev.map((s) => (s.id === selectedSupplier.id ? updatedSupplier : s)))
    setEditCloseModalOpen(false)
    toast.success(`Invoice Closed CD Rules updated for ${selectedSupplier.name}!`)
  }

  // Save Annual Target: New target becomes active; old target archived to history
  const handleSaveTarget = () => {
    if (!selectedSupplier) return
    const mt = parseFloat(draftTargetMT) || 0
    const rate = parseFloat(draftTargetRate) || 0
    const unit = draftTargetUnit || 'MT'
    const annualTarget = (mt > 0 || rate > 0) ? { targetMT: mt, ratePerMT: rate, unit } : undefined

    const currentVersions = selectedSupplier.cdRuleVersions || []
    const newVersionNumber = currentVersions.length + 1

    const historyEntry = {
      id: `${selectedSupplier.id}-target-v${newVersionNumber}`,
      version: newVersionNumber,
      ruleName: `Annual Target v${newVersionNumber}`,
      effectiveFrom: targetEffectiveDate,
      paymentCDRules: selectedSupplier.paymentCDRules || [],
      invoiceCloseCDRules: selectedSupplier.invoiceCloseCDRules || [],
      advanceCDPercentage: selectedSupplier.advanceCDPercentage,
      approvalStatus: 'Approved' as const,
      changedBy: getChangedByLabel(), changedByRole: getChangedByRole(),
      changedAt: new Date().toISOString(),
      reason: targetChangeReason || 'Updated Annual Target'
    }

    const updatedSupplier: Supplier = {
      ...selectedSupplier,
      annualTarget,
      cdRuleVersions: [historyEntry, ...currentVersions]
    }

    setSuppliersHandler((prev) => prev.map((s) => (s.id === selectedSupplier.id ? updatedSupplier : s)))
    setEditTargetModalOpen(false)
    toast.success(`Annual Target updated for ${selectedSupplier.name}!`)
  }

  // Filter history log entries specifically for Payment CD or Invoice Closed CD
  const filteredHistoryVersions = (selectedSupplier?.cdRuleVersions || []).filter((ver) => {
    if (historyCategory === 'PaymentCD') {
      return ver.ruleName.toLowerCase().includes('payment cd')
    }
    if (historyCategory === 'InvoiceClosedCD') {
      return ver.ruleName.toLowerCase().includes('invoice closed cd')
    }
    return true
  })

  // Get active effective date for payment CD card
  const paymentCDActiveVersionDate = selectedSupplier?.cdRuleVersions?.find(v => v.ruleName.toLowerCase().includes('payment cd'))?.effectiveFrom || payEffectiveDate

  // Get active effective date for invoice closed CD card
  const invoiceCloseActiveVersionDate = selectedSupplier?.cdRuleVersions?.find(v => v.ruleName.toLowerCase().includes('invoice closed cd'))?.effectiveFrom || closeEffectiveDate

  return (
    <div className="space-y-6 pb-16">
      {/* Top Header matching diagram: Discount & CD Configuration */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Percent className="h-6 w-6 text-[#0256e8]" weight="duotone" />
            Discount & CD Configuration
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Manage supplier Payment CD Rules, Invoice Closed CD Rules, and Annual Target
          </p>
        </div>

        {/* Party Selection Dropdown */}
        <div className="w-full sm:w-80">
          <Label className="text-xs font-bold text-slate-700">Select Party</Label>
          <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
            <SelectTrigger className="h-10 text-xs bg-white font-semibold text-slate-900 border-slate-300 shadow-2xs">
              <SelectValue placeholder="Choose party..." />
            </SelectTrigger>
            <SelectContent>
              {suppliersList.map((s) => (
                <SelectItem key={s.id} value={s.id} className="text-xs font-medium">
                  {s.name} {s.city ? `(${s.city})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* When NO party is selected, display explicit clean placeholder */}
      {!selectedSupplier ? (
        <Card className="p-12 text-center border-dashed border-slate-300 bg-slate-50/50">
          <Info className="h-10 w-10 text-slate-400 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-slate-700 mb-1">No Party Selected</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Please select a party from the dropdown above to view or configure their CD rules and annual targets.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">

          {/* CARD 1: Payment CD Rules */}
          <div className="bg-slate-100/90 rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
            {/* Card Header matching diagram */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Tag className="h-5 w-5 text-[#0256e8]" weight="bold" />
                  <span>Payment CD Rules</span>
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Effect from applicable date: <span className="font-bold text-slate-800">{paymentCDActiveVersionDate}</span>
                </p>
              </div>

              {/* Action Buttons: UPDATE HISTORY BTN & UPDATE RULES BTN with Gear icon */}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => { setHistoryCategory('PaymentCD'); setExpandedHistoryId(null); }}
                  className="h-8 text-xs font-bold bg-white text-slate-700 border-slate-300 hover:bg-slate-50 rounded-xl px-3"
                >
                  <Clock className="mr-1.5 h-3.5 w-3.5 text-[#0256e8]" />
                  UPDATE HISTORY
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={openEditPaymentModal}
                  disabled={isLocked}
                  className="h-8 text-xs font-bold bg-[#0256e8] hover:bg-[#0046cd] text-white rounded-xl px-4 shadow-2xs gap-1.5"
                >
                  <Gear className="h-3.5 w-3.5" weight="bold" />
                  UPDATE RULES
                </Button>
              </div>
            </div>

            {/* Non-editable Card Body displaying current rules matching diagram */}
            <div className="space-y-2 text-xs">
              {/* Advance CD Row */}
              <div className="p-3 bg-white rounded-xl border border-slate-200/80 flex items-center justify-between shadow-2xs">
                <span className="font-semibold text-slate-700">Advance Cd</span>
                <span className="font-mono font-extrabold text-[#0256e8] text-sm">
                  {selectedSupplier.advanceCDPercentage !== undefined ? `${selectedSupplier.advanceCDPercentage}%` : 'Not configured'}
                </span>
              </div>

              {/* Prompt CD Tiers Rows */}
              {!selectedSupplier.paymentCDRules || selectedSupplier.paymentCDRules.length === 0 ? (
                <div className="p-3 bg-white/60 rounded-xl border border-dashed border-slate-200 text-slate-400 font-medium">
                  No payment CD tiers configured. Click 'UPDATE RULES' above to configure.
                </div>
              ) : (
                selectedSupplier.paymentCDRules.map((rule, idx) => (
                  <div key={idx} className="p-3 bg-white rounded-xl border border-slate-200/80 flex items-center justify-between shadow-2xs">
                    <span className="font-semibold text-slate-800">
                      {rule.minDays} to {rule.maxDays} Days
                    </span>
                    <span className="font-mono font-extrabold text-[#0256e8] text-sm">
                      {rule.percentageRate}%
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* CARD 2: INVOICE CLOSED CD Rules */}
          <div className="bg-slate-100/90 rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
            {/* Card Header matching diagram */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Tag className="h-5 w-5 text-indigo-600" weight="bold" />
                  <span>INVOICE CLOSED CD Rules</span>
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Effect from applicable date: <span className="font-bold text-slate-800">{invoiceCloseActiveVersionDate}</span>
                </p>
              </div>

              {/* Action Buttons: UPDATE HISTORY BTN & UPDATE RULES BTN with Gear icon */}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => { setHistoryCategory('InvoiceClosedCD'); setExpandedHistoryId(null); }}
                  className="h-8 text-xs font-bold bg-white text-slate-700 border-slate-300 hover:bg-slate-50 rounded-xl px-3"
                >
                  <Clock className="mr-1.5 h-3.5 w-3.5 text-indigo-600" />
                  UPDATE HISTORY
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={openEditCloseModal}
                  disabled={isLocked}
                  className="h-8 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4 shadow-2xs gap-1.5"
                >
                  <Gear className="h-3.5 w-3.5" weight="bold" />
                  UPDATE RULES
                </Button>
              </div>
            </div>

            {/* Non-editable Card Body displaying current rules matching diagram */}
            <div className="space-y-2 text-xs">
              {!selectedSupplier.invoiceCloseCDRules || selectedSupplier.invoiceCloseCDRules.length === 0 ? (
                <div className="p-3 bg-white/60 rounded-xl border border-dashed border-slate-200 text-slate-400 font-medium">
                  No invoice closing CD rules configured. Click 'UPDATE RULES' above to configure.
                </div>
              ) : (
                selectedSupplier.invoiceCloseCDRules.map((rule, idx) => (
                  <div key={idx} className="p-3 bg-white rounded-xl border border-slate-200/80 flex items-center justify-between shadow-2xs">
                    <span className="font-semibold text-slate-800">
                      {rule.minDays} to {rule.maxDays} Days
                    </span>
                    <span className="font-mono font-extrabold text-indigo-700 text-sm">
                      {formatCurrency(rule.ratePerMT)} / {rule.unit || 'MT'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* CARD 3: ANNUAL TARGET */}
          <div className="bg-slate-100/90 rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
            {/* Card Header matching diagram */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Tag className="h-5 w-5 text-emerald-600" weight="bold" />
                  <span>ANNUAL TARGET</span>
                </h3>
              </div>

              {/* Action Button: UPDATE TARGET BTN with Gear icon */}
              <Button
                type="button"
                size="sm"
                onClick={openEditTargetModal}
                disabled={isLocked}
                className="h-8 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-4 shadow-2xs gap-1.5"
              >
                <Gear className="h-3.5 w-3.5" weight="bold" />
                UPDATE TARGET
              </Button>
            </div>

            {/* Non-editable Card Body displaying Target Volume & Rate/UNIT */}
            <div className="p-4 bg-white rounded-xl border border-slate-200/80 grid grid-cols-1 sm:grid-cols-2 gap-4 shadow-2xs text-xs">
              <div>
                <div className="text-slate-400 font-semibold uppercase text-[10px]">Target Volume</div>
                <div className="font-mono font-extrabold text-slate-900 text-base mt-0.5">
                  {selectedSupplier.annualTarget?.targetMT !== undefined ? `${selectedSupplier.annualTarget.targetMT} ${selectedSupplier.annualTarget?.unit || 'MT'}` : 'Not configured'}
                </div>
              </div>
              <div>
                <div className="text-slate-400 font-semibold uppercase text-[10px]">Rate / UNIT</div>
                <div className="font-mono font-extrabold text-emerald-700 text-base mt-0.5">
                  {selectedSupplier.annualTarget?.ratePerMT !== undefined ? `${formatCurrency(selectedSupplier.annualTarget.ratePerMT)} / ${selectedSupplier.annualTarget?.unit || 'MT'}` : 'Not configured'}
                </div>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* MODAL 1: EDIT PAYMENT CD RULES POPUP (FRESH SLATE) */}
      <Dialog open={editPaymentModalOpen} onOpenChange={setEditPaymentModalOpen}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader className="border-b border-slate-100 pb-3">
            <DialogTitle className="flex items-center gap-2 text-slate-900 text-lg">
              <Gear className="h-5 w-5 text-[#0256e8]" weight="bold" />
              <span>Update Payment CD Rules</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2 text-xs">
            {/* Payment CD Independent Effective From Date (Defaults to current date) */}
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-700">Effective From Date *</Label>
              <Input
                type="date"
                value={payEffectiveDate}
                onChange={(e) => setPayEffectiveDate(e.target.value)}
                className="h-9 text-xs bg-white font-mono font-bold text-[#0256e8]"
                required
              />
            </div>

            {/* Advance CD Percentage */}
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-700">Advance CD Percentage (%)</Label>
              <Input
                type="number"
                step="any"
                placeholder="Enter CD % (e.g. 2.5)"
                value={draftAdvanceCD}
                onChange={(e) => setDraftAdvanceCD(e.target.value)}
                className="h-9 text-xs font-bold bg-white text-[#0256e8]"
              />
            </div>

            {/* Tiers List & Form */}
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-700">Prompt CD Days Tiers</Label>
              {draftPaymentRules.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No payment CD tiers added. Add new tiers below.</p>
              ) : (
                <div className="space-y-1.5">
                  {draftPaymentRules.map((rule, idx) => (
                    <div key={idx} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800">
                        {rule.minDays} to {rule.maxDays} Days ➔ <span className="font-bold text-[#0256e8]">{rule.percentageRate}% CD</span>
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDraftPaymentRules((prev) => prev.filter((_, i) => i !== idx))}
                        className="h-6 w-6 p-0 text-red-600 hover:bg-red-50"
                      >
                        <Trash className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Tier Inline */}
              <div className="flex items-center gap-2 pt-2">
                <Input
                  type="number"
                  placeholder="Min Days"
                  value={newPayMin}
                  onChange={(e) => setNewPayMin(e.target.value)}
                  className="h-8 text-xs w-24 bg-white"
                />
                <span className="text-slate-400 text-xs">to</span>
                <Input
                  type="number"
                  placeholder="Max Days"
                  value={newPayMax}
                  onChange={(e) => setNewPayMax(e.target.value)}
                  className="h-8 text-xs w-24 bg-white"
                />
                <Input
                  type="number"
                  step="any"
                  placeholder="CD %"
                  value={newPayRate}
                  onChange={(e) => setNewPayRate(e.target.value)}
                  className="h-8 text-xs w-24 bg-white font-bold text-[#0256e8]"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddPaymentTier}
                  className="h-8 bg-[#0256e8] text-white text-xs font-bold rounded-lg px-3"
                >
                  + Add Tier
                </Button>
              </div>
            </div>

            {/* Change Reason Note */}
            <div className="space-y-1 pt-2">
              <Label className="text-xs font-bold text-slate-700">Reason for Change (Optional)</Label>
              <Input
                type="text"
                placeholder="e.g. Revised Payment CD terms"
                value={payChangeReason}
                onChange={(e) => setPayChangeReason(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="border-t border-slate-100 pt-3">
            <Button variant="outline" size="sm" onClick={() => setEditPaymentModalOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSavePaymentRules} className="bg-[#0256e8] text-white font-bold">Save Rules</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: EDIT INVOICE CLOSED CD RULES POPUP (FRESH SLATE) */}
      <Dialog open={editCloseModalOpen} onOpenChange={setEditCloseModalOpen}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader className="border-b border-slate-100 pb-3">
            <DialogTitle className="flex items-center gap-2 text-slate-900 text-lg">
              <Gear className="h-5 w-5 text-indigo-600" weight="bold" />
              <span>Update Invoice Closed CD Rules</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2 text-xs">
            {/* Invoice Closed CD Independent Effective From Date (Defaults to current date) */}
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-700">Effective From Date *</Label>
              <Input
                type="date"
                value={closeEffectiveDate}
                onChange={(e) => setCloseEffectiveDate(e.target.value)}
                className="h-9 text-xs bg-white font-mono font-bold text-indigo-700"
                required
              />
            </div>

            {/* Rules List & Form */}
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-700">Closing Rate Slabs</Label>
              {draftCloseRules.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No invoice closing CD rules added. Add new rules below.</p>
              ) : (
                <div className="space-y-1.5">
                  {draftCloseRules.map((rule, idx) => (
                    <div key={idx} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800">
                        {rule.minDays} to {rule.maxDays} Days ➔ <span className="font-bold text-indigo-700">{formatCurrency(rule.ratePerMT)} / {rule.unit || 'MT'}</span>
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDraftCloseRules((prev) => prev.filter((_, i) => i !== idx))}
                        className="h-6 w-6 p-0 text-red-600 hover:bg-red-50"
                      >
                        <Trash className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Rule Inline */}
              <div className="flex items-center gap-2 pt-2">
                <Input
                  type="number"
                  placeholder="Min Days"
                  value={newCloseMin}
                  onChange={(e) => setNewCloseMin(e.target.value)}
                  className="h-8 text-xs w-24 bg-white"
                />
                <span className="text-slate-400 text-xs">to</span>
                <Input
                  type="number"
                  placeholder="Max Days"
                  value={newCloseMax}
                  onChange={(e) => setNewCloseMax(e.target.value)}
                  className="h-8 text-xs w-24 bg-white"
                />
                <Input
                  type="number"
                  step="any"
                  placeholder="Rate"
                  value={newCloseRate}
                  onChange={(e) => setNewCloseRate(e.target.value)}
                  className="h-8 text-xs w-20 bg-white font-bold text-indigo-700"
                />
                <select
                  value={newCloseUnit}
                  onChange={(e) => setNewCloseUnit(e.target.value)}
                  className="h-8 text-xs min-w-[80px] rounded-md border border-input bg-white px-2 font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {availableUnits.map((u) => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddCloseRule}
                  className="h-8 bg-indigo-600 text-white text-xs font-bold rounded-lg px-3"
                >
                  + Add Rule
                </Button>
              </div>
            </div>

            {/* Change Reason Note */}
            <div className="space-y-1 pt-2">
              <Label className="text-xs font-bold text-slate-700">Reason for Change (Optional)</Label>
              <Input
                type="text"
                placeholder="e.g. Updated closing CD rates"
                value={closeChangeReason}
                onChange={(e) => setCloseChangeReason(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="border-t border-slate-100 pt-3">
            <Button variant="outline" size="sm" onClick={() => setEditCloseModalOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSaveCloseRules} className="bg-indigo-600 text-white font-bold">Save Rules</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: EDIT ANNUAL TARGET POPUP (FRESH SLATE) */}
      <Dialog open={editTargetModalOpen} onOpenChange={setEditTargetModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="border-b border-slate-100 pb-3">
            <DialogTitle className="flex items-center gap-2 text-slate-900 text-lg">
              <Gear className="h-5 w-5 text-emerald-600" weight="bold" />
              <span>Update Annual Target</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2 text-xs">
            {/* Annual Target Independent Effective From Date (Defaults to current date) */}
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-700">Effective From Date *</Label>
              <Input
                type="date"
                value={targetEffectiveDate}
                onChange={(e) => setTargetEffectiveDate(e.target.value)}
                className="h-9 text-xs bg-white font-mono font-bold text-emerald-700"
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-700">Target Unit *</Label>
              <select
                value={draftTargetUnit}
                onChange={(e) => setDraftTargetUnit(e.target.value)}
                className="h-9 w-full text-xs rounded-md border border-input bg-white px-2 font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {availableUnits.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-700">Target Volume ({draftTargetUnit})</Label>
              <Input
                type="number"
                step="any"
                placeholder="1000"
                value={draftTargetMT}
                onChange={(e) => setDraftTargetMT(e.target.value)}
                className="h-9 text-xs font-bold bg-white text-slate-900"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-700">Target Rate per {draftTargetUnit} (₹)</Label>
              <Input
                type="number"
                step="any"
                placeholder="50"
                value={draftTargetRate}
                onChange={(e) => setDraftTargetRate(e.target.value)}
                className="h-9 text-xs font-bold bg-white text-emerald-700"
              />
            </div>

            <div className="space-y-1 pt-2">
              <Label className="text-xs font-bold text-slate-700">Reason for Change (Optional)</Label>
              <Input
                type="text"
                placeholder="e.g. Annual target revision"
                value={targetChangeReason}
                onChange={(e) => setTargetChangeReason(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="border-t border-slate-100 pt-3">
            <Button variant="outline" size="sm" onClick={() => setEditTargetModalOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSaveTarget} className="bg-emerald-600 text-white font-bold">Save Target</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 4: FILTERED HISTORY DIALOG (PAYMENT CD VS INVOICE CLOSED CD) */}
      <Dialog open={historyCategory !== null} onOpenChange={(open) => { if (!open) setHistoryCategory(null) }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader className="border-b border-slate-100 pb-3">
            <DialogTitle className="flex items-center gap-2 text-slate-900 text-lg">
              <Clock className="h-5 w-5 text-[#0256e8]" weight="bold" />
              <span>
                {historyCategory === 'PaymentCD'
                  ? 'Payment CD Rules Update History'
                  : 'Invoice Closed CD Rules Update History'}
              </span>
            </DialogTitle>
            <p className="text-xs text-slate-500 font-medium">
              Audit log of historical {historyCategory === 'PaymentCD' ? 'Payment CD' : 'Invoice Closed CD'} rule changes for <span className="font-bold text-slate-800">{selectedSupplier?.name}</span>
            </p>
          </DialogHeader>

          <div className="space-y-3 pt-2 text-xs">
            {filteredHistoryVersions.length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-6">
                No historical {historyCategory === 'PaymentCD' ? 'Payment CD' : 'Invoice Closed CD'} update versions recorded yet.
              </p>
            ) : (
              filteredHistoryVersions.map((ver) => {
                const isExpanded = expandedHistoryId === ver.id
                return (
                  <Collapsible
                    key={ver.id}
                    open={isExpanded}
                    onOpenChange={() => toggleHistoryItem(ver.id)}
                    className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden"
                  >
                    <CollapsibleTrigger asChild>
                      <div className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-2.5">
                          {isExpanded ? (
                            <CaretDown className="h-4 w-4 text-[#0256e8] font-bold" />
                          ) : (
                            <CaretRight className="h-4 w-4 text-slate-400 font-bold" />
                          )}
                          <div>
                            <span className="font-bold text-slate-900 text-xs">{ver.ruleName}</span>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              Changed by {ver.changedBy} on {new Date(ver.changedAt).toLocaleString()}
                            </p>
                          </div>
                        </div>

                        <Badge variant="outline" className="bg-blue-50 text-[#0256e8] border-blue-200 font-mono text-[10px]">
                          Effective: {ver.effectiveFrom}
                        </Badge>
                      </div>
                    </CollapsibleTrigger>

                    <CollapsibleContent className="p-4 bg-slate-50 border-t border-slate-200/80 space-y-3">
                      {ver.reason && (
                        <div className="text-xs text-slate-600 bg-amber-50/80 border border-amber-200/60 p-2.5 rounded-lg">
                          <span className="font-bold text-amber-900">Note: </span>
                          <span>{ver.reason}</span>
                        </div>
                      )}

                      {/* Detailed Breakdown of Historical Rules */}
                      <div className="space-y-3">
                        {historyCategory === 'PaymentCD' && (
                          <div>
                            <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                              Payment CD Rules (Historical)
                            </div>
                            <div className="space-y-1">
                              <div className="p-2 bg-white rounded-lg border border-slate-200 flex justify-between text-xs">
                                <span className="text-slate-600 font-medium">Advance CD</span>
                                <span className="font-mono font-bold text-[#0256e8]">
                                  {ver.advanceCDPercentage !== undefined ? `${ver.advanceCDPercentage}%` : 'None'}
                                </span>
                              </div>
                              {ver.paymentCDRules && ver.paymentCDRules.length > 0 ? (
                                ver.paymentCDRules.map((rule, rIdx) => (
                                  <div key={rIdx} className="p-2 bg-white rounded-lg border border-slate-200 flex justify-between text-xs">
                                    <span className="text-slate-700">{rule.minDays} to {rule.maxDays} Days</span>
                                    <span className="font-mono font-bold text-[#0256e8]">{rule.percentageRate}% CD</span>
                                  </div>
                                ))
                              ) : (
                                <p className="text-[11px] text-slate-400 italic">No prompt CD tiers recorded in this version.</p>
                              )}
                            </div>
                          </div>
                        )}

                        {historyCategory === 'InvoiceClosedCD' && (
                          <div>
                            <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                              Invoice Closed CD Rules (Historical)
                            </div>
                            <div className="space-y-1">
                              {ver.invoiceCloseCDRules && ver.invoiceCloseCDRules.length > 0 ? (
                                ver.invoiceCloseCDRules.map((rule, cIdx) => (
                                  <div key={cIdx} className="p-2 bg-white rounded-lg border border-slate-200 flex justify-between text-xs">
                                    <span className="text-slate-700">{rule.minDays} to {rule.maxDays} Days</span>
                                    <span className="font-mono font-bold text-indigo-700">
                                      {formatCurrency(rule.ratePerMT)} / {rule.unit || 'MT'}
                                    </span>
                                  </div>
                                ))
                              ) : (
                                <p className="text-[11px] text-slate-400 italic">No invoice closing CD rules recorded in this version.</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )
              })
            )}
          </div>

          <DialogFooter className="border-t border-slate-100 pt-3">
            <Button size="sm" onClick={() => setHistoryCategory(null)} className="bg-[#0256e8] text-white font-bold">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
