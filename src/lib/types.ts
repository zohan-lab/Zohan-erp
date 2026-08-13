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
  category?: string
  purchasePrice?: number
  salesPrice?: number
  gstRate?: number
  itemCode?: string
}

export interface Supplier {
  id: string
  name: string
  phone?: string
  email?: string
  address?: string
  state?: string
  pincode?: string
  city?: string
  shippingSameAsBilling?: boolean
  shippingAddress?: string
  shippingState?: string
  shippingPincode?: string
  shippingCity?: string
  gstin?: string
  paymentCDRules: PaymentCDRule[]
  invoiceCloseCDRules: InvoiceCloseCDRule[]
  advanceCDPercentage?: number
  cdRuleVersions?: SupplierCDRuleVersion[]
  cdRuleChangeLog?: CDRuleChangeLog[]
  annualTarget?: AnnualTarget
  openingBalance?: number
  balanceType?: 'Credit' | 'Debit'
}

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

export interface Customer {
  id: string
  name: string
  email?: string
  phone?: string
  address?: string
  state?: string
  pincode?: string
  city?: string
  shippingSameAsBilling?: boolean
  shippingAddress?: string
  shippingState?: string
  shippingPincode?: string
  shippingCity?: string
  gstin?: string
  openingBalance?: number
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
  itemNameSnapshot?: string
  itemUnitSnapshot?: string
}

export interface PurchaseInvoice {
  id: string
  supplierId: string
  invoiceNo: string
  invoiceDate: string
  orderDate?: string
  items?: InvoiceItem[]
  invoiceAmount: number
  additionalCost?: number
  additionalCostBasicRate?: number
  additionalCostRemarks?: string
  roundOffAdjustment?: number

  fy: string
  createdAt?: number
  history?: EditHistoryLog[]
}

export interface Payment {
  id: string
  supplierId: string
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
  invoiceNo: string
  invoiceDate: string
  items?: InvoiceItem[]
  invoiceAmount: number
  additionalCost?: number
  additionalCostBasicRate?: number
  additionalCostRemarks?: string
  roundOffAdjustment?: number

  fy: string
  history?: EditHistoryLog[]
}

export interface CustomerPayment {
  id: string
  customerId: string
  paymentDate: string
  amount: number
  notes?: string
  counterId: string
  counterName: string
  fy: string
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

export interface ExpenseType {
  id: string
  name: string
  description?: string
  linkType: 'invoice' | 'netprofit'
}

export interface ExpenseEntry {
  id: string
  supplierId?: string
  expenseTypeId: string
  expenseDate: string
  amount: number
  linkedInvoiceId?: string
  originalInvoiceNumber?: string
  paymentMode?: string
  counterId?: string
  counterName?: string
  expenseWithGst?: boolean
  notes?: string
  fy: string
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

export interface CustomerCreditNote {
  id: string
  customerId: string
  date: string
  amount: number
  invoiceRef?: string
  remarks?: string
  fy: string
  createdAt?: number
  isAutoGenerated?: boolean
  sourceType?: 'sales_return' | 'manual'
  sourceId?: string
  history?: EditHistoryLog[]
}

export interface SupplierDebitNote {
  id: string
  supplierId: string
  date: string
  amount: number
  invoiceRef?: string
  remarks?: string
  fy: string
  createdAt?: number
  isAutoGenerated?: boolean
  sourceType?: 'purchase_return' | 'manual'
  sourceId?: string
  history?: EditHistoryLog[]
}

export interface SalesReturn {
  id: string
  customerId: string
  returnNo?: string
  returnDate: string
  amount: number
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
  returnNo?: string
  returnDate: string
  amount: number
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


