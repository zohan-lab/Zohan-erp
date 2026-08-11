# Steel Trading ERP - Source-Driven Enterprise Financial Platform

> **Production Version**: 2026 Baseline  
> **Tech Stack**: React 19, TypeScript, Vite, Tailwind CSS, Firebase Auth, Cloud Firestore  

A high-precision, finance-grade Enterprise Resource Planning system for steel trading, processing, and multi-business commercial operations. Features real-time FIFO payment allocations, native multi-unit inventory conversion, discount wallet engine, cash & bank book accounting, and strict security controls.

---

## 🚀 Key Architectural Pillars

- **Continuous Master Partitions**: Multi-tenant data structure stored under `data_${companyId}_master` locally and `tenants/{companyId}/partitions/master_data` in Cloud Firestore, eliminating cross-year database sharding.
- **Native Multi-Unit Inventory Engine**: Universal multi-unit support (KG, MT, PCS, BND, MTR) with item conversion factors. Line items track `enteredQuantity`, `enteredUnit`, `baseQuantity`, `enteredRate`, `baseRate`, and `baseAmount` (legacy single-unit `quantityMT` fields are completely purged).
- **Source-Driven Realtime Engine**: Raw transaction records are persisted immutably. Ledgers, outstanding balances, FIFO payment allocations, and discount calculations are computed live via optimized React `useMemo` hooks.
- **Security & Failsafe Controls**: Role-Based Access Control (`master_admin` vs `agent`) backed by a permanent master admin failsafe for `sksahil299399@gmail.com` and append-only audit trail logging.
- **Persistent Multi-Year Operations**: Unconstrained cross-year data storage with an `All Time` default period date filter.

---

## 📖 Documentation Index

- 📄 **[Product Requirements Document (PRD)](./PRD.md)** - Full functional requirements, UX standards, and product roadmap.
- 🏗️ **[Technical Architecture](./ARCHITECTURE.md)** - Detailed system architecture, data models, FIFO algorithms, and unit conversion formulas.
- 🔒 **[Security Architecture & Policy](./SECURITY.md)** - Security controls, master admin failsafe, RBAC permissions, and Firestore rules.
- 📋 **[Feature Catalog & Specifications](./FEATURE_LIST.md)** - Comprehensive index of all 15 core module suites and UI components.
- 🏢 **[Multi-Tenant Implementation Guide](./MULTI_TENANT_IMPLEMENTATION_GUIDE.md)** - Multi-tenant storage partitioning and company switching guide.

---

## 🎯 Quick Start Guide

### Prerequisites
- **Node.js**: v18.x or higher
- **npm**: v9.x or higher

### Local Development Setup

1. **Clone & Install Dependencies**:
   ```bash
   npm install
   ```

2. **Environment Configuration**:
   Copy `.env.example` to `.env.local` and configure your Firebase credentials (optional for offline local mode):
   ```bash
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_APP_ID=your_app_id
   VITE_ENABLE_FIREBASE_AUTH=true
   VITE_ENABLE_REMOTE_STORAGE=true
   ```

3. **Launch Local Dev Server**:
   ```bash
   npm run dev
   ```

4. **Run Verification Commands**:
   ```bash
   # Type check codebase
   npx tsc --noEmit

   # Execute test suite
   npx vitest run

   # Create production build
   npm run build
   ```

---

## 🔧 Technology Stack

| Layer | Technology |
|-------|------------|
| **Core Framework** | React 19, TypeScript, Vite |
| **Styling & UI** | Tailwind CSS, shadcn/ui, Phosphor Icons |
| **State & Calculation** | React Hooks, `useMemo` Reactive Engine |
| **Database & Auth** | Firebase Authentication, Cloud Firestore, LocalStorage Fallback |
| **Reporting & Export** | jsPDF, jspdf-autotable, SheetJS (xlsx) |
| **Testing** | Vitest, Testing Library |

---

## 📄 License

MIT License - SK TRADERS ERP Platform.
