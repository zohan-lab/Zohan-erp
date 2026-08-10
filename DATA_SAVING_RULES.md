# SK TRADERS ERP - Data Saving & Persistence Rules

## Single Source of Truth Architecture

All operational business data (invoices, payments, items, customers, suppliers, expenses, counters, transactions, schemes, and MT bookings) is persisted under a single continuous, non-sharded cloud database document:

- **Firestore Document Path**: `tenants/{companyId}/partitions/master_data`
- **Local Storage Cache Key**: `data_{companyId}_master`

---

## Operational Data Integrity Rules

1. **Continuous Master Partition**
   - Financial Year (FY) database sharding is completely eliminated.
   - Financial Year and Month filters operate strictly as client-side dynamic reporting parameters in report views and calculation hooks. They do not alter or select database paths.

2. **Removal of Advance Payment Addon from Payment Entries**
   - The Payment dialog (`payments-page.tsx`) handles pure monetary supplier payments without any embedded "Advance Payment / MT Booking" switch toggle or booking month price inputs.
   - The standalone **MT Booking Master** module (`mt-bookings-page.tsx`) remains the sole interface for creating and managing volume rate lock bookings.
   - Payment entries record cash/bank outflows without generating inline MT booking records.

3. **Source-Driven Realtime Sync**
   - Raw user transactions are persisted directly to the master partition document.
   - Reports, balances, FIFO allocations, and pending discounts are computed live in real-time via `useMemo` hooks.
   - Optimistic concurrency control (`revision` counter) and device echo suppression (`deviceId`) prevent data loss during multi-device operation.
