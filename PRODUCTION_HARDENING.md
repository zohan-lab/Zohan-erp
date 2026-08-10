# SK TRADERS Production Hardening Checklist

Use this checklist before using the ERP as a company system of record.

## Required Environment Variables

- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`
- `VITE_ENABLE_FIREBASE_AUTH=true`
- `VITE_ENABLE_REMOTE_STORAGE=true`
- `VITE_DISABLE_LOCAL_CACHE=true` on shared or production devices
- Rotate any secret key or API credential that was ever pasted into chat or logs

## Firebase & Cloud Firestore Security

- Deploy and enforce `firestore.rules` for collection paths:
  - `/users/{userId}`
  - `/tenants/{companyId}/snapshots/{tenantKey}`
  - `/businesses/{businessId}`
  - `/audit_logs/{logId}`
- Confirm no unauthenticated access policies exist for financial collections
- Create Firebase Auth users via Firebase Console or admin SDK script
- Assign initial `master_admin` role in Firestore `/users/{uid}` profile document

## Backups And Cloud Recovery

- Enable automated Google Cloud / Firestore daily snapshot backups
- Export manual JSON backup snapshots before major operational adjustments
- Document who can restore data and require authorization for restores

## Accounting Workflow Tests

- Run before every deployment:

```bash
npm test
npm run build
```

- Manually verify:
  - purchase invoice create/edit/delete
  - supplier payment FIFO allocation
  - sales invoice create/edit/delete
  - customer payment entry
  - cash/bank voucher entry
  - backup export
  - restricted agent view-only permissions
  - concurrent edit conflict reload

## Go/No-Go

Do not go live if any of these are true:

- Any Firestore collection has an unauthenticated read/write policy
- Agent can edit a module marked view-only
- Two-device concurrent edits silently overwrite each other
- `npm test` or `npm run build` fails
