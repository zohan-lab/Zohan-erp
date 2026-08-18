export interface EditHistoryChange {
  field: string
  from: string
  to: string
}

export interface EditHistoryLog {
  timestamp: string
  action: 'created' | 'updated' | string
  changedBy: string
  /** Role of the actor at the time of the edit. Used by the audit trail renderer
   *  to reliably display the correct badge without guessing from the name string.
   *  Optional for backward compatibility with legacy log entries. */
  changedByRole?: string
  details?: string
  changes?: EditHistoryChange[]
}

export interface Item {
  id: string
  name: string
  unit: string
  alternativeUnit?: string
  primaryUnitRatio?: number
  alternativeUnitRatio?: number
  conversionFactor?: number
  description?: string
  openingStock?: number
  openingValue?: number
  /** ISO date string (YYYY-MM-DD) for when opening stock was recorded */
  openingStockDate?: string
  category?: string
  purchasePrice?: number
  salesPrice?: number
  gstRate?: number
  itemCode?: string
  hsnCode?: string
}

export type PartyType = 'CUSTOMER' | 'SUPPLIER' | string

export interface Party {
  id: string
  name: string
  phone?: string
  email?: string
  address?: string
  state?: string
  stateCode?: string
  stateName?: string
  pincode?: string
  city?: string
  shippingSameAsBilling?: boolean
  shippingAddress?: string
  shippingState?: string
  shippingStateCode?: string
  shippingStateName?: string
  shippingPincode?: string
  shippingCity?: string
  gstin?: string
  partyType?: PartyType
  
  // Balances
  openingBalance?: number
  /** ISO date string (YYYY-MM-DD) for when opening balance was recorded */
  openingBalanceDate?: string
  balanceType?: 'Credit' | 'Debit'
  creditLimit?: number

  // Optional CD / Discount configs
  paymentCDRules?: PaymentCDRule[]
  invoiceCloseCDRules?: InvoiceCloseCDRule[]
  advanceCDPercentage?: number
  cdRuleVersions?: SupplierCDRuleVersion[]
  cdRuleChangeLog?: CDRuleChangeLog[]
  annualTarget?: AnnualTarget

  createdAt?: string | number
  updatedAt?: string | number
}

export type Supplier = Party

export interface PaymentCDRule {
  minDays: number
  maxDays: number
  percentageRate: number
}

export interface InvoiceCloseCDRule {
  minDays: number
  maxDays: number
  ratePerMT: number
  unit?: string
}

export type RuleApprovalStatus = 'Pending' | 'Approved' | 'Rejected'

export interface SupplierCDRuleVersion {
  id: string
  version: number
  ruleName: string
  effectiveFrom: string
  effectiveTo?: string
  paymentCDRules: PaymentCDRule[]
  invoiceCloseCDRules: InvoiceCloseCDRule[]
  advanceCDPercentage?: number
  changedBy: string
  changedAt: string
  reason: string
  approvalStatus: RuleApprovalStatus
}

export interface CDRuleChangeLog {
  id: string
  supplierId: string
  ruleName: string
  ruleVersion: number
  previousValues: {
    paymentCDRules: PaymentCDRule[]
    invoiceCloseCDRules: InvoiceCloseCDRule[]
    advanceCDPercentage?: number
    effectiveFrom?: string
    effectiveTo?: string
  }
  newValues: {
    paymentCDRules: PaymentCDRule[]
    invoiceCloseCDRules: InvoiceCloseCDRule[]
    advanceCDPercentage?: number
    effectiveFrom: string
    effectiveTo?: string
  }
  effectiveDate: string
  changedBy: string
  changedByRole?: string
  changedAt: string
  reason: string
  approvalStatus: RuleApprovalStatus
}

export interface FixedScheme {
  id: string
  supplierId: string
  schemeName: string
  ratePerMT: number
  unit?: string
  fromDate: string
  toDate: string
  applyInMTBooking?: boolean
  version?: number
  parentSchemeId?: string
  previousSchemeId?: string
  changedBy?: string
  changedByRole?: string
  changedAt?: string
  changeReason?: string
  approvalStatus?: RuleApprovalStatus
}

export interface AnnualTarget {
  targetMT: number
  ratePerMT: number
  unit?: string
}

export type Customer = Party

export interface InvoiceTaxSummary {
  taxableAmount: number
  isInterState: boolean
  cgstRate: number
  cgstAmount: number
  sgstRate: number
  sgstAmount: number
  igstRate: number
  igstAmount: number
  totalTaxAmount: number
  roundOff: number
  totalAmount: number
}

export interface InvoiceItem {
  itemId: string
  enteredQuantity: number
  enteredUnit: string
  baseQuantity: number
  weightKG?: number
  basicRate?: number
  rate: number
  amount: number
  baseRate?: number
  enteredRate?: number
  
  // Frozen Item Snapshots for Legal Immutability
  itemNameSnapshot?: string
  hsnCodeSnapshot?: string
  unitSnapshot?: string
  itemUnitSnapshot?: string
  categorySnapshot?: string
  basicRateSnapshot?: number
  gstRateSnapshot?: number
  itemDescriptionSnapshot?: string

  taxableAmount?: number
  gstRate?: number
  cgstRate?: number
  cgstAmount?: number
  sgstRate?: number
  sgstAmount?: number
  igstRate?: number
  igstAmount?: number
  discountAmount?: number
}

export interface AdditionalCharge {
  id: string
  name?: string
  chargeName?: string
  remarks: string
  basicRate: number
  taxMode: 'none' | 'gst'
  gstRate: number
  finalAmt: number
  sacCode?: string
  taxableAmount?: number
  cgstAmount?: number
  sgstAmount?: number
  igstAmount?: number
}

export interface PurchaseInvoice {
  id: string
  supplierId: string
  partyId?: string
  invoiceNo: string
  invoiceDate: string
  orderDate?: string
  items?: InvoiceItem[]
  additionalCharges?: AdditionalCharge[]
  invoiceAmount: number
  additionalCost?: number
  additionalCostBasicRate?: number
  additionalCostRemarks?: string
  roundOffAdjustment?: number

  // Frozen Party Snapshots for Legal Immutability
  partyNameSnapshot?: string
  supplierNameSnapshot?: string
  partyGstinSnapshot?: string
  partyPhoneSnapshot?: string
  partyAddressSnapshot?: string
  billingAddressSnapshot?: string
  shippingAddressSnapshot?: string
  stateCodeSnapshot?: string
  stateNameSnapshot?: string

  // Structured GST tax breakdown
  taxableAmount?: number
  cgstRate?: number
  cgstAmount?: number
  sgstRate?: number
  sgstAmount?: number
  igstRate?: number
  igstAmount?: number
  roundOff?: number
  totalAmount?: number
  isInterState?: boolean

  fy: string
  createdAt?: number
  history?: EditHistoryLog[]
}

export interface Payment {
  id: string
  supplierId: string
  partyId?: string
  paymentDate: string
  amount: number
  paymentMode?: string
  isAdvance?: boolean
  bookingMT?: number
  bookingMarketRate?: number
  mtBookingId?: string
  doNotApplyCD?: boolean
  counterId?: string
  counterName?: string
  partyNameSnapshot?: string
  counterNameSnapshot?: string
  fy: string
  createdAt?: number
  advanceCDSnapshot?: number
  history?: EditHistoryLog[]
}

export interface PaymentAllocation {
  id: string
  paymentId: string
  invoiceId: string
  allocatedAmount: number
  fy: string
}

export interface PaymentAdvanceInfo {
  paymentId: string
  advanceAmount: number
  allocatedAmount: number
  outstandingAtPaymentTime: number
  allocationIsAdvanceMap: Map<string, boolean>
}

export interface ReceivedDiscount {
  id: string
  supplierId: string
  discountReceivedDate: string
  amount: number
  notes: string
  status: 'Allocated' | 'Advance'
  type: 'wallet' | 'annual'
  fy: string
  allocateToDiscountType?: 'paymentCD' | 'invoiceCloseCD' | 'fixedScheme' | 'advanceCD'
  allocateToSchemeName?: string
}

export interface DiscountAllocation {
  id: string
  receivedDiscountId: string
  expectedDiscountId: string
  allocatedAmount: number
}

export interface ExpectedDiscount {
  id: string
  supplierId: string
  invoiceId?: string
  schemeId?: string
  paymentId?: string
  ruleVersionId?: string
  ruleVersion?: number
  ruleName?: string
  type: 'paymentCD' | 'invoiceCloseCD' | 'fixedScheme' | 'annual' | 'advanceCD'
  earnedDate: string
  invoiceDate?: string
  eligibleQuantityMT: number
  ratePerMT: number
  expectedAmount: number
  unit?: string
  invoiceNo?: string
  schemeName?: string
  mtBookingId?: string
  mtBookingRuleSource?: 'current' | 'previous'
  marketRateComparison?: 'currentLower' | 'currentHigher' | 'equal' | 'legacy'
  bookedMarketRate?: number
  currentMarketRate?: number
}

export interface ExpectedAnnualDiscount {
  id: string
  supplierId: string
  supplierName: string
  targetMT: number
  achievedMT: number
  ratePerMT: number
  expectedAmount: number
}

export interface PendingDiscount extends ExpectedDiscount {
  receivedAmount: number
  pendingAmount: number
  status: 'Pending' | 'Partially Received' | 'Received'
}

export interface PendingAnnualDiscount extends ExpectedAnnualDiscount {
  receivedAmount: number
  pendingAmount: number
  status: 'Pending' | 'Partially Received' | 'Received'
}

export type DiscountCategory = 'paymentCD' | 'invoiceCloseCD' | 'fixedScheme' | 'advanceCD' | 'annual' | 'all'

export interface SalesInvoice {
  id: string
  customerId: string
  partyId?: string
  invoiceNo: string
  invoiceDate: string
  items?: InvoiceItem[]
  additionalCharges?: AdditionalCharge[]
  invoiceAmount: number
  additionalCost?: number
  additionalCostBasicRate?: number
  additionalCostRemarks?: string
  roundOffAdjustment?: number

  // Frozen Party Snapshots for Legal Immutability
  partyNameSnapshot?: string
  customerNameSnapshot?: string
  partyGstinSnapshot?: string
  partyPhoneSnapshot?: string
  partyAddressSnapshot?: string
  billingAddressSnapshot?: string
  shippingAddressSnapshot?: string
  stateCodeSnapshot?: string
  stateNameSnapshot?: string

  // Structured GST tax breakdown
  taxableAmount?: number
  cgstRate?: number
  cgstAmount?: number
  sgstRate?: number
  sgstAmount?: number
  igstRate?: number
  igstAmount?: number
  roundOff?: number
  totalAmount?: number
  isInterState?: boolean
  orderDate?: string
  fy: string
  createdAt?: number
  history?: EditHistoryLog[]
}

export interface CustomerPayment {
  id: string
  customerId: string
  partyId?: string
  paymentDate: string
  amount: number
  notes?: string
  paymentMode?: string
  isAdvance?: boolean
  counterId?: string
  counterName?: string
  partyNameSnapshot?: string
  counterNameSnapshot?: string
  fy: string
  createdAt?: number
  history?: EditHistoryLog[]
}

export interface LedgerEntry {
  date: string
  description: string
  invoiceNo?: string
  debit: number
  credit: number
  balance: number
  type: 'invoice' | 'payment'
  refId: string
}

export interface ExpenseCategory {
  id: string
  name: string
  description?: string
  linkType?: 'invoice' | 'netprofit'
  costLinkingType?: 'net_profit' | 'invoice_landed'
  
  // Master GST & Statutory Defaults
  isGstApplicable?: boolean
  defaultSacCode?: string
  defaultGstRate?: number
  isRcmDefault?: boolean
  itcClassification?: 'Input Services' | 'Inputs / Consumables' | 'Capital Goods' | 'Ineligible'
}

export type ExpenseType = ExpenseCategory

export interface ExpenseEntry {
  id: string
  date?: string
  expenseDate: string
  categoryId?: string
  categoryName?: string
  expenseTypeId: string
  amount: number
  paymentAccountId?: string
  paymentAccountName?: string
  counterId?: string
  counterName?: string
  supplierId?: string
  linkedInvoiceId?: string
  originalInvoiceNumber?: string
  paymentMode?: string
  notes?: string
  fy: string
  
  // GST & ITC Metadata
  hasGst?: boolean
  expenseWithGst?: boolean
  supplierName?: string
  supplierGstin?: string
  supplierStateCode?: string
  invoiceRefNo?: string
  invoiceRefDate?: string
  hsnSacCode?: string
  isTaxInclusive?: boolean
  gstRate?: number
  taxableAmount?: number
  cgstAmount?: number
  sgstAmount?: number
  igstAmount?: number
  totalExpenseAmount?: number
  isInterState?: boolean
  
  // GSTR-3B Table 4 Compliance
  isItcEligible?: boolean
  itcType?: 'Inputs' | 'Capital Goods' | 'Input Services' | 'Ineligible'
  isRcm?: boolean // Reverse Charge Mechanism under Sec 9(3)
  
  createdAt?: string | number
  updatedAt?: string
  history?: EditHistoryLog[]
}

export interface LockedScheme {
  schemeId: string
  schemeName: string
  ratePerMT: number
  ruleVersionId?: string
  ruleVersion?: number
  effectiveFrom?: string
  effectiveTo?: string
}

export type MTBookingTieBreakPreference = 'current' | 'previous' | 'highestBenefit' | 'manual'

export interface MTBooking {
  id: string
  supplierId: string
  orderDate: string
  consumeStartDate: string
  bookedMT: number
  unit?: string
  notes?: string
  fy: string
  rateMode: 'auto' | 'manual'
  lockedSchemes?: LockedScheme[]
  totalLockedRate?: number
  manualRate?: number
  bookedMarketRate?: number
  tieBreakPreference?: MTBookingTieBreakPreference
  manualSelection?: 'current' | 'previous'
}

export interface MTBookingConsumption {
  bookingId: string
  invoiceId: string
  consumedMT: number
  lockedCDRate: number
  lockedSchemeName: string
}

export interface CreditNote {
  id: string
  noteNo?: string
  partyId?: string
  customerId?: string // backward compatibility
  supplierId?: string // backward compatibility
  date: string
  amount: number
  reason?: string
  originalInvoiceNo?: string
  originalInvoiceDate?: string
  invoiceRef?: string
  remarks?: string
  fy: string
  
  // GST Tax Breakup
  taxableAmount?: number
  gstRate?: number
  cgstRate?: number
  cgstAmount?: number
  sgstRate?: number
  sgstAmount?: number
  igstRate?: number
  igstAmount?: number
  totalAmount?: number
  roundOff?: number
  isInterState?: boolean
  isTaxInclusive?: boolean

  partyNameSnapshot?: string
  partyGstinSnapshot?: string

  createdAt?: number
  isAutoGenerated?: boolean
  sourceType?: 'sales_return' | 'purchase_return' | 'manual' | string
  sourceId?: string
  history?: EditHistoryLog[]
}

export type CustomerCreditNote = CreditNote
export type SupplierCreditNote = CreditNote

export interface DebitNote {
  id: string
  noteNo?: string
  partyId?: string
  customerId?: string // backward compatibility
  supplierId?: string // backward compatibility
  date: string
  amount: number
  reason?: string
  originalInvoiceNo?: string
  originalInvoiceDate?: string
  invoiceRef?: string
  remarks?: string
  fy: string

  // GST Tax Breakup
  taxableAmount?: number
  gstRate?: number
  cgstRate?: number
  cgstAmount?: number
  sgstRate?: number
  sgstAmount?: number
  igstRate?: number
  igstAmount?: number
  totalAmount?: number
  roundOff?: number
  isInterState?: boolean
  isTaxInclusive?: boolean

  partyNameSnapshot?: string
  partyGstinSnapshot?: string

  createdAt?: number
  isAutoGenerated?: boolean
  sourceType?: 'purchase_return' | 'sales_return' | 'manual' | string
  sourceId?: string
  history?: EditHistoryLog[]
}

export type CustomerDebitNote = DebitNote
export type SupplierDebitNote = DebitNote

export interface SalesReturn {
  id: string
  customerId: string
  partyId?: string
  returnNo?: string
  returnDate: string
  amount: number
  totalAmount?: number
  items?: InvoiceItem[]
  additionalCost?: number
  roundOffAdjustment?: number
  invoiceRef?: string
  remarks?: string
  fy: string
  createdAt?: number
  history?: EditHistoryLog[]
}

export interface PurchaseReturn {
  id: string
  supplierId: string
  partyId?: string
  returnNo?: string
  returnDate: string
  amount: number
  totalAmount?: number
  items?: InvoiceItem[]
  additionalCost?: number
  roundOffAdjustment?: number
  invoiceRef?: string
  remarks?: string
  fy: string
  createdAt?: number
  history?: EditHistoryLog[]
}

// FIFO Inventory Layer
export interface PurchaseLayer {
  id: string
  purchaseInvoiceId: string
  invoiceNo: string
  supplierId: string
  supplierName: string
  itemId: string
  itemName: string
  category?: string
  activeUnit: string
  baseUnit?: string
  baseQty?: number
  baseLandingCost?: number
  unitWeightKG: number
  purchaseDate: string
  qty: number
  remainingQty: number
  purchaseRate: number
  landingCost: number
  paymentCD: number
  invoiceCloseCD: number
  schemeCD: number
  expense: number
  batchNo?: string
}

// Sale Allocation from FIFO Layers
export interface SaleAllocation {
  id: string
  salesInvoiceId: string
  salesInvoiceNo: string
  customerId: string
  customerName: string
  purchaseLayerId: string
  purchaseInvoiceId: string
  purchaseInvoiceNo: string
  supplierName: string
  itemId: string
  itemName: string
  activeUnit: string
  baseUnit?: string
  baseAllocatedQty?: number
  allocatedQty: number
  fifoCostPerUnit: number
  sellingPricePerUnit: number
  profitPerUnit: number
  totalProfit: number
  saleDate: string
}

// Payment CD Report Row
export interface PaymentCDReportRow {
  id: string
  date: string
  supplierId: string
  supplierName: string
  invoiceId: string
  invoiceNo: string
  itemId: string
  itemName: string
  category?: string
  qty: number
  activeUnit: string
  purchaseAmount: number
  paymentCD: number
  closeCD: number
  schemeCD: number
  totalCD: number
  netLandingCostSaved: number
  avgCDPerUnit: number
}

// Payment CD Summary Stats
export interface PaymentCDSummaryStats {
  purchaseAmount: number
  paymentCDEarned: number
  invoiceCloseCD: number
  schemeCD: number
  totalCDEarned: number
  avgCDPerUnit: number
  netLandingCostSaved: number
  totalQty: number
}

// Item Profit Analysis Row
export interface ItemProfitAnalysisRow {
  id: string
  saleDate: string
  salesInvoiceId: string
  salesInvoiceNo: string
  customerId: string
  customerName: string
  itemId: string
  itemName: string
  category?: string
  soldQty: number
  activeUnit: string
  sellingRate: number
  fifoCost: number
  profitPerUnit: number
  totalProfit: number
  allocations: SaleAllocation[]
}


