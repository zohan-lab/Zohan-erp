# Steel Trading ERP - Source-Driven Financial Management

A comprehensive ERP system for steel trading businesses with FIFO allocation, discount management, and real-time financial tracking.

## 🚀 Key Features

- **FIFO Allocation System** - Chronological payment-to-invoice allocation that recalculates automatically
- **Advance Payment Handling** - Automatic detection and allocation of advance payments to future invoices
- **Discount Management** - Track Payment CD, Invoice Close CD, and Fixed Schemes
- **Annual Discount Management** - Volume-based rebate tracking
- **Multi-Item Invoices** - Support for line-item entry with automatic calculations
- **Source-Driven Architecture** - All reports calculated live from source data
- **PDF Export** - Professional discount reports and pending statements

## 📖 Documentation

- **[PRD](./PRD.md)** - Full product requirements and feature specifications
- **[Architecture](./ARCHITECTURE.md)** - Technical architecture documentation

## 🎯 Quick Start

1. Navigate to **Suppliers** tab and add your suppliers with optional discount rules
2. Navigate to **Items** tab and add your steel products
3. Navigate to **Invoices** tab and enter purchase invoices with line items
4. Navigate to **Payments** tab and record payments (FIFO auto-allocates)
5. Check **Discount Wallet** for expected vs received discounts
6. Check **Annual Discount** for volume-based rebates

## 💡 Key Concepts

### Source-Driven
- Only raw transactions are stored (invoices, payments, received discounts)
- All reports, balances, and allocations calculated live
- Deleting source data instantly updates everything

### Automatic Advance Detection
- No manual checkbox for advance payments
- System detects advances when payment > available invoices
- Auto-allocate to future invoices when added

### Discount Types
1. **Payment CD** - Percentage on payment amount based on payment days
2. **Invoice Close CD** - Per unit based on invoice close days
3. **Fixed Scheme** - Per unit for date-range based schemes
4. **Annual Target** - Per unit based on achieved volume

## 🔧 Technical Stack

- React 19 + TypeScript
- Tailwind CSS + shadcn/ui components
- Firebase Auth & Cloud Firestore for persistent tenant master data
- PDF generation with jsPDF
- Date-based calculations with date-fns

## 📄 License

MIT License - SK TRADERS ERP System.
