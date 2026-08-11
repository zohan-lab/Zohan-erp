# Steel Trading ERP - Technical Architecture Document

> **Document Status**: Production Baseline (2026 Edition)  
> **Codebase Target**: React 19 + TypeScript + Vite + Firebase Cloud Firestore  

---

## 1. Core Architecture Philosophy: Source-Driven Realtime Engine

The application adheres to a **Strict Source-Driven Architecture**. Operational data consists exclusively of raw transaction records entered by users. Reports, ledger balances, FIFO payment allocations, discount entitlements, and statement metrics are **never saved as static pre-aggregated values** in the database. Instead, they are calculated live in real-time on every render using optimized React `useMemo` computation hooks.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PERSISTED SOURCE DATA                           │
│  (Invoices, Payments, Expenses, Vouchers, Items, Parties, Schemes)     │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     REACTIVE CALCULATION ENGINE                        │
│   (useMemo hooks: calculations.ts, fifo-engine.ts, report-calc.ts)     │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        LIVE COMPUTED OUTPUTS                           │
│ (FIFO Allocations, Outstanding Balances, CD Entitlements, Ledgers)     │
└────────────────────────────────────────────────────────────────────────┘
```

### Key Rules of Source Integrity
1. **Preserve Raw Inputs**: Dates (`orderDate`, `invoiceDate`, `paymentDate`), numeric quantities, and unit rates are saved exactly as entered by the user.
2. **Zero Modification on Restore**: Loading backups or refreshing data performs pure deserialization without mutating or "fixing" stored dates or amounts.
3. **User Action Priority**: Only an explicit edit operation by an authorized user can modify source records. No background routine or calculated hook writes back to source data.

---

## 2. Multi-Tenant Partitioning Architecture

### 2.1 Unified Master Partition (`data_${companyId}_master`)
Legacy architectures partitioned data into financial-year-specific keys (`data_company_FY2024-25`). The 2026 production architecture unifies all business data into a single continuous master partition per tenant:

- **Local Storage Partition Key**: `data_${companyId}_master` (managed via `src/lib/storage-utils.ts`)
- **Cloud Firestore Path**: `tenants/{companyId}/partitions/master_data` (managed via `src/lib/business-sync.ts`)

```typescript
// Unified Partition Key Resolver
export function getTenantKey(companyId: string, _fy?: string): string {
  return `data_${companyId}_master`
}
```

### 2.2 Schema Collection Definitions
Each master tenant partition contains 19 core entity collections:

| Collection Entity | Type Definition | Description |
|-------------------|-----------------|-------------|
| `suppliers` | `Supplier[]` | Supplier directory and default CD terms |
| `customers` | `Customer[]` | Customer directory and credit limits |
| `items` | `Item[]` | Item catalog with primary/alternate units and conversion factors |
| `invoices` | `PurchaseInvoice[]` | Purchase invoices with line-item array and additional costs |
| `payments` | `Payment[]` | Supplier monetary cash/bank payments |
| `receivedDiscounts` | `ReceivedDiscount[]` | Supplier discount receipt entries |
| `salesInvoices` | `SalesInvoice[]` | Sales invoices with customer tax items |
| `customerPayments` | `CustomerPayment[]` | Customer monetary payment receipts |
| `expenseTypes` | `ExpenseType[]` | Expense category definitions |
| `expenseEntries` | `ExpenseEntry[]` | Operational expense transaction records |
| `fixedSchemes` | `FixedScheme[]` | Date-range promotion discount rules |
| `mtBookings` | `MTBooking[]` | Standalone volume rate lock bookings |
| `discountLedgerEntries`| `DiscountLedgerEntry[]`| Historical discount ledger overrides/adjustments |
| `cashBankCounters` | `CashBankCounter[]` | Cash chests and bank account counters |
| `cashBankTransactions`| `CashBankTransaction[]`| Cash/Bank voucher entries (Receipts/Payments) |
| `creditNotes` | `CreditNote[]` | Customer credit notes for sales returns/adjustments |
| `debitNotes` | `DebitNote[]` | Supplier debit notes for purchase returns/adjustments |
| `salesReturns` | `SalesReturn[]` | Sales return line-item vouchers |
| `purchaseReturns` | `PurchaseReturn[]` | Purchase return line-item vouchers |

---

## 3. Unit Conversion & Multi-Unit Normalization Service

The legacy single-unit `quantityMT` metric has been purged. Multi-unit operations are governed by `src/lib/unit-conversion-service.ts`:

### 3.1 Primary (Base) Unit Architecture
Each catalog item defines a **Primary Unit** (e.g. `KG`, `MT`, `PCS`, `BND`, `MTR`) and optional `alternativeUnit` with `conversionFactor`.

### 3.2 Normalization Formulas
For any transaction line item, the entered values are converted into normalized primary base units before calculating base amounts:

$$\text{Base Quantity} = \text{Entered Quantity} \times \text{Conversion Factor}$$

$$\text{Base Rate} = \frac{\text{Entered Rate}}{\text{Conversion Factor}}$$

$$\text{Base Amount} = \text{Base Quantity} \times \text{Base Rate} = \text{Entered Quantity} \times \text{Entered Rate}$$

```typescript
// Core Normalization Functions (src/lib/unit-conversion-service.ts)
export function toBaseQuantity(item?: Item | null, quantity: number = 0, unit?: string): number
export function toBaseRate(item?: Item | null, rate: number = 0, unit?: string): number
export function toBaseAmount(baseQuantity: number, baseRate: number): number
```

---

## 4. FIFO Engine & Discount Allocation Architecture

The FIFO calculation engine (`src/lib/fifo-engine.ts`) handles payment-to-invoice matching and discount computations:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FIFO ALLOCATION FLOW                            │
│                                                                        │
│  Purchase Invoices (Sorted chronologically by invoiceDate)             │
│  ├── Invoice #101 (Jan 05) - ₹100,000 [Unpaid: ₹40,000]               │
│  └── Invoice #102 (Jan 12) - ₹150,000 [Unpaid: ₹150,000]              │
│                                                                        │
│  Supplier Payments                                                     │
│  └── Payment #P1 (Jan 15) - ₹100,000                                   │
│      ├── Allocates ₹40,000 to Invoice #101 ──► Fully Paid!             │
│      └── Allocates ₹60,000 to Invoice #102 ──► Remaining: ₹90,000     │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Payment Allocation Rules
1. **Invoice Date Order**: Invoices are sorted by `invoiceDate` ascending.
2. **Sequential FIFO Consumption**: Payments settle the oldest unpaid invoice balance first.
3. **Automatic Advance Detection**: Any unallocated payment amount exceeding total outstanding purchase invoices is categorized as an **Advance Payment** and auto-allocated to future invoices as they are created.

### 4.2 Discount Entitlement Classification
- **Payment CD**: Calculated based on payment date vs invoice date difference against payment CD slab rules.
- **Invoice Close CD**: Earned when an invoice reaches fully settled status within specified cutoff days.
- **Fixed Scheme CD**: Evaluated based on invoice line item date (using `orderDate` or `invoiceDate` as configured per scheme).
- **Annual Target Rebate**: Calculated on cumulative volume achieved against annual slab targets.

---

## 5. Cloud Integration & Security Architecture

### 5.1 Hybrid Storage Model
- **Local First**: Local storage (`localStorage`) provides zero-latency offline access.
- **Cloud Sync**: When `VITE_ENABLE_REMOTE_STORAGE=true`, changes synchronize asynchronously with Cloud Firestore (`src/lib/business-sync.ts`).
- **Conflict Prevention**: Optimistic concurrency control via `revision` counters and `deviceId` echo filtering prevents race conditions during multi-device edits.

### 5.2 Firestore Security Rules Hierarchy
Cloud Firestore rules (`firestore.rules`) enforce strict tenant and role isolation:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Master Admin Helper Check
    function isMasterAdmin() {
      return userExists() && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'master_admin';
    }
    // Tenant Partition Rules
    match /tenants/{companyId}/partitions/{partitionId} {
      allow read, write: if isActiveUser();
    }
    // Audit Log Append-Only Rules
    match /audit_logs/{logId} {
      allow create: if isAuthenticated();
      allow read: if isMasterAdmin();
      allow update, delete: if false;
    }
  }
}
```

---

## 6. Dynamic Date Filtering Architecture

The period date filter component (`src/components/period-date-filter.tsx`) isolates reporting views without altering database keys:

```typescript
export type PeriodType = 'all' | 'current_month' | 'previous_month' | 'current_fy' | 'previous_fy' | 'custom'
```

- **Default State**: `periodType: 'all'` (`All Time (All Transactions)`).
- **Behavior**: Filters master transaction collections dynamically in `useMemo` hooks using transaction date fields (`invoiceDate`, `paymentDate`, `voucherDate`).
