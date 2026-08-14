import { useEffect, useCallback } from 'react'

export type ShortcutAction = 
  | 'settings'
  | 'backup'
  | 'restore'
  | 'dashboard'
  | 'suppliers'
  | 'customers'
  | 'items'
  | 'invoices'
  | 'payments'
  | 'sales-invoices'
  | 'customer-payments'
  | 'expense-entries'
  | 'cd-profit-report'
  | 'customer-aging'
  | 'inventory'
  | 'cd-risk'
  | 'wallet'
  | 'annual'
  | 'supplier-ledger'
  | 'customer-ledger'
  | 'invoice-details'
  | 'payment-details'
  | 'expense-types'
  | 'fixed-schemes'
  | 'mt-bookings'
  | 'cash-bank-master'
  | 'cash-bank-voucher'
  | 'cash-bank-ledger'
  | 'customer-credit-notes'
  | 'customer-debit-notes'
  | 'supplier-debit-notes'
  | 'supplier-credit-notes'
  | 'sales-returns'
  | 'purchase-returns'
  | 'toggle-sidebar'
  | 'help'
  | 'search'

export type ShortcutHandler = (action: ShortcutAction) => void

interface KeyBinding {
  key: string
  ctrlKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  action: ShortcutAction
  description: string
  category: 'Navigation' | 'Actions' | 'Reports' | 'Masters' | 'UI'
}

export const keyBindings: KeyBinding[] = [
  { key: 'k', ctrlKey: true, action: 'help', description: 'Show shortcuts', category: 'UI' },
  { key: 'b', ctrlKey: true, action: 'toggle-sidebar', description: 'Toggle sidebar', category: 'UI' },
  { key: ',', ctrlKey: true, action: 'settings', description: 'Open settings', category: 'Actions' },
  { key: 's', ctrlKey: true, shiftKey: true, action: 'backup', description: 'Backup data', category: 'Actions' },
  { key: 'r', ctrlKey: true, shiftKey: true, action: 'restore', description: 'Restore data', category: 'Actions' },
  
  { key: 'd', ctrlKey: true, action: 'dashboard', description: 'Go to Dashboard', category: 'Navigation' },
  { key: 'i', ctrlKey: true, action: 'invoices', description: 'Purchase Invoices', category: 'Navigation' },
  { key: 'p', ctrlKey: true, action: 'payments', description: 'Supplier Payments', category: 'Navigation' },
  { key: 'e', ctrlKey: true, action: 'expense-entries', description: 'Expense Entries', category: 'Navigation' },
  
  { key: 'g', ctrlKey: true, action: 'supplier-ledger', description: 'Supplier Ledger', category: 'Reports' },
  { key: 'u', ctrlKey: true, action: 'inventory', description: 'Inventory Report', category: 'Reports' },
  { key: 'c', ctrlKey: true, shiftKey: true, action: 'cd-risk', description: 'CD at Risk', category: 'Reports' },
  { key: 'w', ctrlKey: true, shiftKey: true, action: 'wallet', description: 'Discount Wallet', category: 'Reports' },
  
  { key: 'y', ctrlKey: true, action: 'annual', description: 'Annual Discount', category: 'Discount Configuration' },
  
  { key: '1', altKey: true, action: 'suppliers', description: 'Suppliers Master', category: 'Masters' },
  { key: '2', altKey: true, action: 'customers', description: 'Customers Master', category: 'Masters' },
  { key: '3', altKey: true, action: 'items', description: 'Items Master', category: 'Masters' },
  { key: '4', altKey: true, action: 'fixed-schemes', description: 'Fixed Schemes', category: 'Masters' },
  { key: '5', altKey: true, action: 'mt-bookings', description: 'MT Booking Master', category: 'Masters' },
]

export function useKeyboardShortcuts(handler: ShortcutHandler, enabled: boolean = true) {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return

    const activeElement = document.activeElement
    const isInputFocused = 
      activeElement?.tagName === 'INPUT' ||
      activeElement?.tagName === 'TEXTAREA' ||
      activeElement?.tagName === 'SELECT' ||
      (activeElement as HTMLElement)?.isContentEditable

    if (isInputFocused && !event.ctrlKey && !event.metaKey) {
      return
    }

    for (const binding of keyBindings) {
      const keyMatch = binding.key.toLowerCase() === event.key.toLowerCase()
      const ctrlMatch = binding.ctrlKey ? (event.ctrlKey || event.metaKey) : !(event.ctrlKey || event.metaKey)
      const shiftMatch = binding.shiftKey ? event.shiftKey : !event.shiftKey
      const altMatch = binding.altKey ? event.altKey : !event.altKey

      if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
        event.preventDefault()
        handler(binding.action)
        return
      }
    }
  }, [handler, enabled])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}

export function getShortcutLabel(action: ShortcutAction): string {
  const binding = keyBindings.find(b => b.action === action)
  if (!binding) return ''

  const parts: string[] = []
  if (binding.ctrlKey) parts.push('Ctrl')
  if (binding.shiftKey) parts.push('Shift')
  if (binding.altKey) parts.push('Alt')
  parts.push(binding.key.toUpperCase())

  return parts.join('+')
}
