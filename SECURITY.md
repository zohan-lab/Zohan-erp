# Steel Trading ERP - Security Architecture & Policy

> **Document Status**: Production Baseline (2026 Edition)  
> **Security Domain**: Authentication, Access Control, Data Integrity & Audit  

---

## 1. Security Overview & Access Model

The **Steel Trading ERP** enforces a defense-in-depth security model combining Cloud Firebase Authentication, Role-Based Access Control (RBAC), cryptographically enforced local authentication fallbacks, Cloud Firestore Security Rules, and append-only audit logging.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AUTHENTICATION LAYER                            │
│    Primary: Firebase Auth (JWT)  │  Fallback: Local PBKDF2 Passcode   │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   ROLE-BASED ACCESS CONTROL (RBAC)                      │
│     master_admin (Full Privileges)  │  agent (Granular Permissions)    │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      FIRESTORE SECURITY RULES                          │
│  Active User Enforcement  │  Tenant Isolation  │ Append-Only Logs       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Permanent Master Admin Failsafe

To ensure catastrophic lockout prevention and administrative continuity, the system maintains a hardcoded **Permanent Master Admin Failsafe**:

```typescript
// Defined in src/lib/security-utils.ts and src/lib/firebase-auth.ts
export const MASTER_ADMIN_EMAIL = 'sksahil299399@gmail.com'
```

### Failsafe Guarantees
1. **Unrevokable Privilege Mapping**: Any user authenticated with `sksahil299399@gmail.com` (or matching master admin identifier patterns) is unconditionally granted the `master_admin` role with full system-wide permissions across all business tenants and security controls.
2. **Administrative Override**: Master Admin accounts can create, activate, deactivate, or modify permissions for all sub-accounts (`agent` role).
3. **Firestore Security Rule Parity**: Firestore Security Rules explicitly check `get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'master_admin'` for elevated read/write operations.

---

## 3. Authentication & Credential Storage

### 3.1 Firebase Authentication (Remote Primary)
- Uses Firebase Authentication for email/password identity management.
- User profile data stored securely under Cloud Firestore `/users/{userId}` documents.

### 3.2 Local Passcode Hashing (Offline Fallback)
For offline-first local mode, user account passcodes are hashed using industry-standard cryptography:

- **Algorithm**: `PBKDF2` with `SHA-256`
- **Iterations**: `210,000` iterations (defined in `src/lib/security-utils.ts`)
- **Salt Generation**: Cryptographically random 16-byte hex salt generated via `crypto.getRandomValues()`

---

## 4. Role-Based Access Control (RBAC)

The system supports two primary role tiers (`UserRole`):

### 4.1 Role Hierarchy
1. **`master_admin`**: Full unrestricted access to all modules, financial ledgers, business creation, user management, backup restores, and security configurations.
2. **`agent`**: Operational staff role governed by fine-grained `PermissionMap` settings.

### 4.2 Granular Permissions Matrix
Each `agent` profile specifies individual module access levels:

| Permission Field | Level Options | Applied Module |
|------------------|---------------|----------------|
| `invoices` | `none` \| `view` \| `edit` | Purchase Invoices & Purchases |
| `sales` | `none` \| `view` \| `edit` | Sales Invoices & Sales Management |
| `payments` | `none` \| `view` \| `edit` | Supplier Payments & FIFO Allocations |
| `customerPayments` | `none` \| `view` \| `edit` | Customer Payments & Collections |
| `cashBank` | `none` \| `view` \| `edit` | Cash & Bank Book Management |
| `expenses` | `none` \| `view` \| `edit` | Expense Entries & Categories |
| `discounts` | `none` \| `view` \| `edit` | Discount Wallet & Scheme Master |
| `reports` | `none` \| `view` \| `edit` | Reports & Financial Statements |

### 4.3 Counter & Business Restrictions
- **`allowedCounters`**: Optional list of counter IDs restricting an agent to specific Cash/Bank chests.
- **`allowedBusinesses`**: Optional list of company IDs restricting an agent to authorized businesses.

---

## 5. Cloud Firestore Security Rules

Cloud Firestore security is governed by production security rules (`firestore.rules`):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAuthenticated() { return request.auth != null; }
    function userExists() { return isAuthenticated() && exists(/databases/$(database)/documents/users/$(request.auth.uid)); }
    function isMasterAdmin() { return userExists() && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'master_admin'; }
    function isActiveUser() {
      return isAuthenticated() && (!userExists() || get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isActive == true);
    }

    // User Profiles
    match /users/{userId} {
      allow read: if isAuthenticated() && (request.auth.uid == userId || isMasterAdmin());
      allow create, update: if isAuthenticated() && (request.auth.uid == userId || isMasterAdmin());
      allow delete: if false;
    }

    // Tenant Partitions
    match /tenants/{companyId}/partitions/{partitionId} {
      allow read, write: if isActiveUser();
    }

    // Append-Only Audit Logs
    match /audit_logs/{logId} {
      allow create: if isAuthenticated();
      allow read: if isMasterAdmin();
      allow update, delete: if false;
    }

    // Catch-All Deny
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

---

## 6. Audit Trail & Activity Logging

### 6.1 Client Audit Log (`app_audit_log`)
- Managed via `appendAuditLog()` in `src/lib/security-utils.ts`.
- Stores up to 1,000 recent security events locally (timestamp, action, tenantKey, details).

### 6.2 Cloud Audit Log (`audit_logs`)
- Persisted to Cloud Firestore `/audit_logs` collection.
- Strictly **append-only**: users can create log records; update and deletion operations are denied at the database rule level (`allow update, delete: if false`).

---

## 7. Data Protection & Backup Safety

1. **Restore Key Validation**: Backup restore operations pass through key validation (`isAllowedRestoreKey`) to prevent unauthorized localStorage key overwrites.
2. **Session Storage Isolation**: Active session state (`app_auth_session`, `app_auth_user_id`) is partitioned per tab session to prevent cross-session leaks.
