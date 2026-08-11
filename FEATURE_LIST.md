# Steel Trading ERP - Feature Catalog & Specification

> **Document Status**: Production Baseline (2026 Edition)  
> **Source Mapping**: Complete index of components in `src/components/` and services in `src/lib/`  

---

## 1. Core Module Index

```
├── 1. Business & Tenant Administration
├── 2. Purchase Management & Purchase Returns
├── 3. Sales Management & Sales Returns
├── 4. Item Catalog & Multi-Unit Engine
├── 5. Cash & Bank Book Management Subsystem
├── 6. Supplier Payments & FIFO Allocation
├── 7. Customer Payments & Ledger Accounting
├── 8. Supplier Ledgers & CD Terms
├── 9. Discount Wallet & Scheme Engine
├── 10. Risk Management, Expiry Alerts & Profit Realization
├── 11. Expense Management
├── 12. Master Dashboard & Key Performance Indicators
├── 13. Security Controls, RBAC & Audit Logging
├── 14. Dynamic Date Filtering & Multi-Year Reporting
└── 15. Export & Document Generation Engine
```

---

## 2. Exhaustive Feature Specifications

### 1. Business & Tenant Administration
- **Multi-Company Management** (`AppHeader.tsx`, `add-business-dialog.tsx`): Create, select, switch, and edit business entities.
- **Unified Master Partition Storage** (`storage-utils.ts`, `business-sync.ts`): Stores continuous multi-year operational data under `data_${companyId}_master` locally and `tenants/{companyId}/partitions/master_data` in Cloud Firestore.
- **Backup & Cloud Sync** (`backup-utils.ts`, `business-sync.ts`): Instant JSON backup exporting, atomic data restoration, and background Firestore synchronization.

### 2. Purchase Management & Purchase Returns
- **Purchase Invoice Entry** (`invoices-page.tsx`, `purchase-invoice-details-page.tsx`): Enter purchase invoices with supplier selection, invoice date, order date, and additional transport costs.
- **Multi-Unit Item Lines**: Line item entry recording `enteredQuantity`, `enteredUnit`, `baseQuantity`, `enteredRate`, `baseRate`, and `baseAmount`.
- **Automatic Round-Off Adjustment**: Calculates and balances fractional paisa round-offs automatically.
- **Purchase Returns** (`purchase-return-page.tsx`): Create purchase return vouchers linked with supplier debit notes (`supplier-debit-note-page.tsx`).

### 3. Sales Management & Sales Returns
- **Sales Invoice Entry** (`sales-invoices-page.tsx`, `invoice-preview-dialog.tsx`): Record sales transactions with multi-unit line items, GST rate calculations, party address formatting, and printable preview popups.
- **Sales Returns** (`sales-return-page.tsx`): Record customer sales return vouchers linked with customer credit notes (`customer-credit-note-page.tsx`).

### 4. Item Catalog & Multi-Unit Engine
- **Item Master Management** (`items-page.tsx`, `item-editor-dialog.tsx`): Register product items with primary unit (KG, MT, PCS, BND, MTR) and alternate units.
- **Centralized Unit Conversion Service** (`unit-conversion-service.ts`): Normalizes entered quantities and rates into base units using item-specific conversion factors.

### 5. Cash & Bank Book Management Subsystem
- **Counter Master Registration** (`cash-bank-counters-master.tsx`): Define Cash Chests, Bank Accounts, and UPI payment channels.
- **Voucher Entry Management** (`cash-bank-voucher-entry.tsx`, `cash-bank-management.tsx`): Record cash/bank receipts and payment vouchers with counter selection and payment modes.
- **Cash & Bank Book Statements** (`cash-bank-book-report.tsx`): Generate daily and monthly running balance statements per counter.

### 6. Supplier Payments & FIFO Allocation Engine
- **Supplier Payment Entry** (`payments-page.tsx`, `payment-details-page.tsx`): Record monetary payments to suppliers.
- **FIFO Chronological Engine** (`fifo-engine.ts`): Automatically allocates supplier payments chronologically against unpaid purchase invoices sorted by `invoiceDate`.
- **Advance Payment Detection**: Automatically detects unallocated payment surpluses and holds them as advances for auto-allocation against future purchase invoices.

### 7. Customer Payments & Ledger Accounting
- **Customer Payment Receipts** (`customer-payments-page.tsx`, `payment-details-page.tsx`): Record customer receipts and track unallocated advances.
- **Customer Ledger Statements** (`customer-ledger-page.tsx`, `customers-page.tsx`): Comprehensive debit/credit ledgers, running balance calculation, and customer statement printing.

### 8. Supplier Ledgers & CD Terms
- **Supplier Master** (`suppliers-page.tsx`, `party-editor-dialog.tsx`): Manage supplier contact profiles and standard CD payment terms.
- **Supplier Ledger Statements** (`supplier-ledger-page.tsx`): Track invoice purchases, payments, debit notes, expected discounts, and net payable balances.

### 9. Discount Wallet & Scheme Engine
- **Discount Types**: Track Payment CD, Invoice Close CD, Fixed Schemes, and Annual Target Rebates.
- **Wallet Allocation Engine** (`discount-wallet-page.tsx`): Scheme-level FIFO allocation matching received discount vouchers against accumulated expected discount balances.
- **Fixed Schemes Master** (`fixed-schemes-page.tsx`): Define promotional schemes with `orderDate` or `invoiceDate` calculation basis.
- **Annual Discount Engine** (`annual-discount-page.tsx`): Track cumulative annual MT volume against tiered rebate slabs.
- **Standalone MT Bookings** (`mt-bookings-page.tsx`): Manage volume rate lock bookings independently from monetary payment flows.

### 10. Risk Management, Expiry Alerts & Profit Realization
- **Customer Receivables & Aging Intelligence** (`customer-aging-report-page.tsx`, `customer-aging-engine.ts`): Reactive 30-day bill-wise customer aging engine (`0-30`, `31-60`, `61-90`, `90+` days) with FIFO credit allocation and performance grading (`Best Payer`, `Heavy Lifter`, `Capital Blocker`). Includes bill-wise drilldown modal and PDF/Excel export.
- **CD at Risk Report** (`cd-at-risk-report-page.tsx`): Identify pending discounts approaching payment deadline cutoffs.
- **CD Expiry Alerts** (`cd-expiry-alert.tsx`): Display warning alerts for invoices within critical CD payment windows.
- **CD Profit Margin Reports** (`cd-profit-reports-page.tsx`): Analyze realized vs expected discount margins per supplier and per item.

### 11. Expense Management
- **Expense Categories & Vouchers** (`expense-types-page.tsx`, `expense-entries-page.tsx`): Register operational expense types (rent, freight, electricity, wages) and log expense payment entries.

### 12. Master Dashboard & Key Performance Indicators
- **Realtime Dashboard Analytics** (`master-dashboard-page.tsx`): Summary KPI cards for Total Turnover, Net Profit, Purchase Total, Outstanding Receivables, Outstanding Payables, Inventory Stock, and CD Realization.
- **Animated KPI Counters** (`animated-value.tsx`): Smooth value transitions for numeric dashboard metrics.

### 13. Security Controls, RBAC & Audit Logging
- **User Account Management** (`user-management-page.tsx`): Create user accounts, assign `master_admin` or `agent` roles, and configure allowed counters or businesses.
- **Master Admin Failsafe**: Hardcoded unrevokable master privileges for `sksahil299399@gmail.com`.
- **Append-Only Audit Logging** (`security-utils.ts`, `remote-audit.ts`): Client and Cloud audit log recording sensitive operations.

### 14. Dynamic Date Filtering & Multi-Year Reporting
- **Period Date Filter Component** (`period-date-filter.tsx`): Dynamic period selection (`All Time`, `Current Month`, `Previous Month`, `Current FY`, `Previous FY`, `Custom Date Range`) operating seamlessly across continuous master partitions.

### 15. Export & Document Generation Engine
- **PDF Generation Engine** (`pdf-export.ts`): Export formatted ledgers, invoices, cash book statements, and discount reports to PDF using `jsPDF` and `jspdf-autotable`.
- **Excel Generation Engine** (`excel-export.ts`): Export structured data tables to XLSX spreadsheets using `xlsx`.
