# Multi-Tenant Architecture Implementation Guide

> **Document Status**: Production Baseline (2026 Edition)  
> **Target Module**: Multi-Tenant Partitioning & Storage Infrastructure (`src/lib/storage-utils.ts`, `src/lib/business-sync.ts`)  

---

## 1. Overview & Architecture Strategy

The SK TRADERS application implements a robust **Multi-Tenant Storage Architecture** designed for high performance, zero data leaks between companies, and seamless offline-to-cloud synchronization.

### Core Partition Principles
1. **Continuous Master Partitioning**: All operational data for a given business is saved into a single continuous master partition key (`data_${companyId}_master` locally, `tenants/{companyId}/partitions/master_data` in Cloud Firestore).
2. **Financial Year Non-Sharding**: Financial year boundaries do not shard or split database collections. Financial year options are generated for reporting context, while period filtering is executed dynamically in real time via client hooks.
3. **Atomic Tenant Deletion**: Deleting a business purges all local keys (`data_${companyId}_master`, `business_details_${companyId}`, `cashbank_${companyId}_*`) and issues batch cloud deletions for `tenants/{companyId}/partitions` and `tenants/{companyId}/snapshots`.

---

## 2. Storage Partition Specifications

### 2.1 Metadata Registry Key (`app_metadata`)
Stores tenant registration, active company ID, and reporting year preference:

```typescript
export interface AppMetadata {
  businesses: BusinessMetadata[]
  activeCompanyId: string
  activeFY?: string
}
```

### 2.2 Tenant Key Resolver
```typescript
// Defined in src/lib/storage-utils.ts
export function getTenantKey(companyId: string, _fy?: string): string {
  return `data_${companyId}_master`
}
```

---

## 3. State Management & Persistence Flow in `App.tsx`

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ACTIVE TENANT SWITCHING                         │
│               User selects company in AppHeader dropdown               │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        DATA RESET PROTOCOL                             │
│   All 19 entity state hooks reset to empty arrays to prevent leaking   │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        PARTITION DESERIALIZATION                       │
│    getTenantData(activeCompanyId) loads data_${companyId}_master      │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   CLOUD SYNC & REVISION CHECKS                         │
│  business-sync.ts fetches remote tenants/{companyId}/partitions/master │
└────────────────────────────────────────────────────────────────────────┘
```

### Data Load Routine
When `activeCompanyId` changes, state variables are reloaded cleanly from the corresponding master partition:

```typescript
useEffect(() => {
  if (!activeCompanyId) return

  const tenantData = getTenantData(activeCompanyId)
  
  setSuppliers(tenantData.suppliers || [])
  setCustomers(tenantData.customers || [])
  setItems(tenantData.items || [])
  setInvoices(tenantData.invoices || [])
  setPayments(tenantData.payments || [])
  setReceivedDiscounts(tenantData.receivedDiscounts || [])
  setSalesInvoices(tenantData.salesInvoices || [])
  setCustomerPayments(tenantData.customerPayments || [])
  setExpenseTypes(tenantData.expenseTypes || [])
  setExpenseEntries(tenantData.expenseEntries || [])
  setFixedSchemes(tenantData.fixedSchemes || [])
  setMTBookings(tenantData.mtBookings || [])
  setCashBankCounters(tenantData.cashBankCounters || [])
  setCashBankTransactions(tenantData.cashBankTransactions || [])
  setCreditNotes(tenantData.creditNotes || [])
  setDebitNotes(tenantData.debitNotes || [])
  setSalesReturns(tenantData.salesReturns || [])
  setPurchaseReturns(tenantData.purchaseReturns || [])
}, [activeCompanyId])
```

---

## 4. Multi-Tenant Business Dialogs

- **Add Business Dialog** (`src/components/add-business-dialog.tsx`): Creates a new business entry, initializes default `master_data` partition, and optionally syncs metadata to Cloud Firestore.
- **Edit/Delete Business Dialog**: Updates business name or triggers `deleteTenantData(companyId)` and `deleteBusinessFromCloud(companyId)` to remove all local and remote tenant assets.
