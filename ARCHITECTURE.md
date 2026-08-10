# SK TRADERS - Architecture Documentation

## Source-Driven Financial Management System

### Core Principle: Source-Driven Reports

This application follows a **strict source-driven architecture** where all reports and calculations are computed in real-time from source data, and source data is **never automatically modified** after save, restore, or refresh operations.

---

## Data Architecture

### 1. Source Data (Persisted via Cloud Firestore `master_data`)

Source data is the **single source of truth** and is stored exactly as entered by the user:

- **Suppliers** - Basic supplier information and CD rules
- **Customers** - Customer information
- **Items** - Product/material catalog
- **Purchase Invoices** - Including:
  - `invoiceDate` - For FIFO, payments, ageing, reports
  - `orderDate` - For Fixed Scheme eligibility ONLY
  - `items[]` - Line items with quantities and rates
  - `additionalCost` - Transport/other costs
  - `roundOffAdjustment` - Paisa rounding
- **Sales Invoices** - Customer sales records
- **Payments** - Supplier payments with `doNotApplyCD` flag
- **Customer Payments** - Customer payment records
- **Received Discounts** - CD actually received from suppliers
- **Expense Types** - Expense categories
- **Expense Entries** - Actual expenses incurred
- **Fixed Schemes** - Discount scheme definitions with `dateCalculationBasis`

### 2. Computed Data (Live Calculation via `useMemo`)

Computed data is **calculated on every render** from source data:

- **Payment Allocations** - FIFO-based allocation of payments to invoices
- **Expected Discounts** - CD earned but not yet received
  - Payment CD
  - Invoice Close CD
  - Fixed Scheme CD
  - Annual Discount
- **Pending Discounts** - Expected minus Received
- **All Reports** - Dashboard, Ledgers, Inventory, etc.
- **Month-wise Aggregations** - Filtered calculations by month

---

## Data Integrity Rules

### ✅ DO - Source Data

1. **Store exactly what user enters**
   - All dates (`orderDate`, `invoiceDate`, `paymentDate`) preserved as entered
   - All numeric values preserved with exact precision
   - No automatic formatting, trimming, or transformation

2. **Preserve data through operations**
   - **Save** - Store exactly what user entered
   - **Edit** - Update only fields user changed
   - **Restore** - Load backup data without transformation
   - **Refresh** - Reload from storage without recalculation

3. **User edits are the ONLY way to modify source data**
   - No background processes modify source data
   - No automatic date synchronization
   - No automatic recalculation of stored amounts

### ❌ DON'T - Source Data

1. **Never auto-modify after save**
   ```typescript
   // ❌ WRONG - Auto-changing orderDate
   if (!invoice.orderDate) {
     invoice.orderDate = invoice.invoiceDate
   }
   
   // ✅ CORRECT - Preserve as-is
   orderDate: orderDate !== undefined ? orderDate : editingInvoice.orderDate
   ```

2. **Never recalculate stored values**
   ```typescript
   // ❌ WRONG - Recalculating invoice amount on load
   invoice.invoiceAmount = recalculateTotal(invoice.items)
   
   // ✅ CORRECT - Use stored value
   invoice.invoiceAmount // Use as-is from storage
   ```

3. **Never sync dates automatically**
   ```typescript
   // ❌ WRONG - Auto-syncing dates
   if (invoice.invoiceDate !== invoice.orderDate) {
     invoice.orderDate = invoice.invoiceDate
   }
   
   // ✅ CORRECT - Keep independent
   // Both dates serve different purposes
   ```

---

## Calculation Rules

### Date Usage by Feature

| Feature | Date Used | Purpose |
|---------|-----------|---------|
| **FIFO Allocation** | `invoiceDate` | Chronological payment allocation |
| **Payment Ageing** | `invoiceDate` | Outstanding calculation |
| **Fixed Scheme CD** | `orderDate` OR `invoiceDate` | Per scheme's `dateCalculationBasis` |
| **Payment CD** | `paymentDate` | When payment is made |
| **Invoice Close CD** | Invoice close date (FIFO) | When invoice fully paid |
| **Annual Discount** | `orderDate` | MT aggregation for target |
| **Reports (General)** | `invoiceDate` | Display and filtering |

### Fixed Scheme Date Basis

Each Fixed Scheme has a `dateCalculationBasis` field:

```typescript
type DateCalculationBasis = 'orderDate' | 'invoiceDate'
```

- **Order Date basis** - Uses `invoice.orderDate` for scheme eligibility
- **Invoice Date basis** - Uses `invoice.invoiceDate` for scheme eligibility

This allows schemes like "Early Bird" to use order date while others use invoice date.

### Month-wise Filtering

When a month filter is applied:

1. **Filter source data first** by the relevant date field
2. **Calculate from filtered data** - no pre-aggregation
3. **Expected Discount** = Sum of CDs earned in selected month
4. **Received Amount** = Allocations against those CDs
5. **Pending** = Expected - Received (live calculation)

Example:
```typescript
// ✅ CORRECT - Filter then calculate
const filteredInvoices = invoices.filter(inv => 
  isInSelectedMonth(inv.orderDate) // or invoiceDate based on context
)
const expectedCD = calculateExpectedDiscounts(filteredInvoices, ...)

// ❌ WRONG - Calculate then filter
const allExpectedCD = calculateExpectedDiscounts(invoices, ...)
const filteredCD = allExpectedCD.filter(cd => isInSelectedMonth(cd.date))
```

---

## Implementation Guidelines

### Form Handling

When editing invoices:

```typescript
const handleSubmit = (e: FormEvent) => {
  const orderDate = formData.get('orderDate') as string
  
  if (editingInvoice) {
    const updated: PurchaseInvoice = {
      ...editingInvoice, // Start with existing data
      invoiceNo: formData.get('invoiceNo'),
      invoiceDate: formData.get('invoiceDate'),
      // Preserve orderDate if not changed
      orderDate: orderDate !== undefined ? orderDate : editingInvoice.orderDate,
      items: invoiceItems,
      // ... other fields
    }
    setInvoices(prev => prev.map(inv => 
      inv.id === editingInvoice.id ? updated : inv
    ))
  }
}
```

### Backup/Restore

```typescript
// Backup - Pure serialization
const backup = {
  version: '1.0',
  timestamp: new Date().toISOString(),
  fy: currentFY,
  data: {
    invoices,  // No transformation
    payments,  // No transformation
    // ... all source data as-is
  }
}

// Restore - Pure deserialization
setInvoicesRaw(backupData.data.invoices)  // Direct assignment
setPaymentsRaw(backupData.data.payments)  // No processing
```

### Report Calculation

```typescript
// ✅ CORRECT - Calculate fresh from source
const expectedDiscounts = useMemo(() => 
  calculateExpectedDiscounts(invoices, payments, suppliers, fixedSchemes),
  [invoices, payments, suppliers, fixedSchemes]
)

// ❌ WRONG - Store calculated values
const [expectedDiscounts, setExpectedDiscounts] = useKV('expected-discounts', [])
```

---

## Common Pitfalls to Avoid

### 1. Auto-Syncing Dates

**Problem**: Automatically changing `orderDate` to match `invoiceDate` on save/restore.

**Solution**: Store both dates independently. They serve different purposes.

### 2. Recalculating on Restore

**Problem**: Recalculating invoice amounts or allocations during data restore.

**Solution**: Restore data exactly as saved. Calculations happen in `useMemo` hooks.

### 3. Storing Computed Values

**Problem**: Saving calculated discounts or allocations to storage.

**Solution**: Only store source data. Compute everything else on-demand.

### 4. Pre-filtering for Performance

**Problem**: Creating month-wise pre-aggregated data to improve performance.

**Solution**: Use `useMemo` to cache calculations. Filter source data, then calculate.

---

## Testing Data Integrity

### Manual Tests

1. **Create Invoice** with specific `orderDate` and `invoiceDate`
2. **Save** and verify both dates are stored correctly
3. **Edit** the invoice without changing dates
4. **Save** and verify dates remain unchanged
5. **Backup** and verify JSON contains exact dates
6. **Clear all data** and verify clean state
7. **Restore** from backup and verify dates match original
8. **Refresh page** and verify dates still match

### Validation Checklist

- [ ] orderDate preserved after save
- [ ] orderDate preserved after edit (when not modified)
- [ ] orderDate preserved after backup/restore
- [ ] orderDate preserved after page refresh
- [ ] Invoice amounts match original after restore
- [ ] All dates use correct format (YYYY-MM-DD)
- [ ] Reports calculate from source data (not stored calculations)
- [ ] Month filters work correctly with both date types

---

## Version History

- **v1.0** - Initial source-driven architecture
- All future changes must maintain source data integrity principle

---

## Questions?

If you need to add a new calculated field:

1. **Is it derived from source data?** → Calculate in `useMemo`, don't store
2. **Does user enter it?** → Add to source data model, store in Firestore snapshot
3. **Does it need to persist?** → Add to backup/restore, store in Firestore snapshot
4. **Should it survive refresh?** → Use Firestore snapshot sync, not temporary `useState`

**Remember**: When in doubt, calculate from source. Storage is for user input only.
