# Steel Trading ERP - Product Requirements Document (PRD)

> **Document Status**: Production Baseline (2026 Edition)  
> **Target Platform**: Desktop & Web Multi-Tenant ERP  
> **Primary Maintainer**: Engineering & Product Architecture  

---

## 1. Mission Statement & Core Philosophy

The **Steel Trading ERP** is a high-precision, finance-grade Enterprise Resource Planning system specifically engineered for steel trading, processing, and multi-business commercial operations.

### Core Architectural Principles
1. **Source-Driven Realtime Calculation**: Operational data is stored exclusively as raw source transactions (invoices, payments, expenses, returns, vouchers). All ledgers, outstanding balances, FIFO payment allocations, discount entitlements, and financial statements are calculated live in real-time on-demand via `useMemo` hooks.
2. **Immutable Source Records**: Source data is stored exactly as entered by the user. Background services, data sync routines, or restore functions NEVER auto-modify transaction dates, amounts, or rates.
3. **Continuous Master Data Partitioning**: Data is stored under a unified master partition per business (`data_${companyId}_master` in local storage and `tenants/{companyId}/partitions/master_data` in Cloud Firestore). Financial year boundaries act strictly as dynamic reporting filters, eliminating database sharding and cross-year data silos.

---

## 2. System Evolution & 2026 Production Enhancements

This PRD incorporates major architectural evolution and core upgrades introduced across the system:

### A. Unified Master Partition Architecture
- **Legacy Pattern**: Data was fragmented across financial-year-suffixed partition keys (e.g. `data_sktraders_FY2024-25`).
- **Production Baseline**: Unified continuous master partition per business (`tenants/{companyId}/partitions/master_data`). Dynamic period filtering (`All Time`, `Current FY`, `Previous FY`, `Custom Date Range`) allows unconstrained multi-year queries and seamless lifetime ledger views.

### B. Native Multi-Unit Inventory Engine
- **Legacy Pattern**: Reliance on a single hardcoded `quantityMT` metric.
- **Production Baseline**: Universal multi-unit data schema. Items specify a Primary (Base) Unit (e.g., `KG`, `MT`, `PCS`, `BND`, `MTR`) and optional Alternate Units with custom conversion factors. All transaction line items record:
  - `enteredQuantity` & `enteredUnit`
  - `baseQuantity` (normalized to Primary Unit)
  - `enteredRate`, `baseRate`, and `baseAmount`
  - Legacy `quantityMT` fields are completely purged from all schemas and payloads.

### C. Security & Permanent Master Admin Failsafe
- Permanent master admin rights are hardcoded for `sksahil299399@gmail.com`. Users authenticated with this account automatically receive unrevokable `master_admin` privileges across all tenants.
- RBAC enforces fine-grained permissions for non-admin accounts (`agent` role), restricting counter access, business selection, or edit operations.

### D. Cash & Bank Book Subsystem
- Integrated cash and bank accounting with dedicated counter registration, receipt/payment voucher entries, running balance ledgers, and statement generation.

### E. Discount Wallet & CD Risk Management
- Scheme-level FIFO wallet allocation for Payment Cash Discounts (CD), Invoice Close CD, Fixed Schemes, and Annual Target Rebates.
- Real-time **CD at Risk** monitoring, **CD Expiry Alerts**, and **CD Profit Margin** report generation.

---

## 3. Core Operational Modules

### 3.1 Business & Multi-Tenant Administration
- Support for multiple independent business entities (e.g., SK TRADERS, secondary firms).
- Complete isolation of master entity catalogues, ledgers, and financial records per business ID.
- Cloud Firestore synchronization with optimistic concurrency revision tracking.

### 3.2 Purchase Management & Returns
- Multi-item Purchase Invoice entry with automated round-off adjustments, transport/additional costs, order date vs invoice date separation, and multi-unit conversions.
- Purchase Return records linked with supplier debit notes.

### 3.3 Sales Management & Credit Notes
- Multi-item Sales Invoice entry with real-time tax calculation, party credit checking, and invoice preview generation.
- Customer Sales Return records linked with customer credit notes.

### 3.4 Supplier Payments & FIFO Engine
- Monetary payment entry with automated chronological FIFO allocation against outstanding purchase invoices.
- Standalone **MT Booking Master** module for managing volume rate locks independently from monetary cash transfers.
- Automatic advance payment detection when supplier payments exceed total available invoice obligations.

### 3.5 Cash & Bank Book Management
- Master registration for Cash & Bank Counters (e.g., Main Cash Chest, HDFC Bank, SBI Account).
- Dual-entry Cash/Bank Vouchers (Receipts and Payments).
- Running balance calculation with daily/monthly cash book statements.

### 3.6 Discount Wallet & Scheme Engine
- **Payment CD**: Percentage/per-ton discount based on payment days from invoice date.
- **Invoice Close CD**: Incentive earned upon complete liquidation of invoice balances.
- **Fixed Schemes**: Date-range specific promotional schemes using order date or invoice date basis.
- **Annual Target Rebates**: Volume-tiered annual rebates calculated against total MT achieved.
- **Wallet-Based Allocation**: FIFO adjustment of received discount vouchers against pending scheme balances.

### 3.7 Analytics & Risk Reporting
- **CD at Risk Report**: Real-time identification of impending discount forfeiture based on upcoming payment deadlines.
- **CD Expiry Alerts**: Visual warning indicators for invoices nearing discount cutoff days.
- **CD Profit Reports**: Margin analysis incorporating earned vs received discounts against sales realization.

---

## 4. UI/UX Design System Standards

### 4.1 Typography & Visual Hierarchy
- **Primary Font**: IBM Plex Sans (modern sans-serif optimized for business data clarity).
- **Monospace Font**: JetBrains Mono with tabular numerals (`tnum`) for monetary values, dates, and invoice numbers.
- **Heading Hierarchy**: H1 (20px Semibold, tracking-tight), H2 (16px Semibold), H3 (14px Semibold), Body (13px Regular), Table Cells (12px Medium), Form Labels (11px Semibold).

### 4.2 Color Palette (OKLCH Precision System)
- **Primary**: Deep Blue-Gray `oklch(0.38 0.06 240)`
- **Background**: Tinted Off-White `oklch(0.985 0.002 240)`
- **Card**: Pure White `oklch(1 0 0)`
- **Border**: Soft Gray `oklch(0.90 0.003 240)`
- **Status Colors**: Success `oklch(0.58 0.16 145)`, Warning `oklch(0.72 0.16 75)`, Destructive `oklch(0.55 0.20 25)`.

### 4.3 Density & Spacing System
- Desktop-first layout density. Input height default `h-9` (36px), table button height `h-7`–`h-8` (28–32px).
- Responsive spacing scaling via CSS `clamp()` functions (`spacing-responsive-xs` through `2xl`).

---

## 5. Non-Functional & Operational Requirements

1. **Performance**: All live calculation hooks (`useMemo`) must process up to 10,000 transaction records in <16ms.
2. **Data Persistence**: Primary continuous local storage (`localStorage`) backed up synchronously to Firebase Cloud Firestore when remote mode is enabled.
3. **Build & Code Health**: Mandatory strict TypeScript compliance (`npx tsc --noEmit`), unit test passage (`npx vitest run`), and clean Vite production builds (`npm run build`).
