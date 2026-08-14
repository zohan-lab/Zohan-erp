/** All valid counter/account types */
export type CounterType = 'Cash' | 'Savings' | 'Current' | 'Bank CC / OD' | 'Bank'

/** Returns true for any bank sub-type (Savings, Current, Bank CC/OD, or legacy Bank) */
export function isBankType(type: string | undefined): boolean {
  return type === 'Bank' || type === 'Savings' || type === 'Current' || type === 'Bank CC / OD'
}

import { EditHistoryLog } from './types'

export interface Counter {
  id: string
  name: string
  type: CounterType
  openingBalance: number
  currentBalance: number
  /** ISO date string (YYYY-MM-DD) recording when the opening balance was set (e.g. start of FY) */
  openingBalanceDate?: string
  /** Only for 'Bank CC / OD' accounts: total sanctioned credit/OD limit in ₹ */
  sanctionedLimit?: number
  /** Only for 'Bank CC / OD' accounts: bank's stock/asset margin haircut percentage (0–100) */
  marginPercentage?: number
  /** Full audit edit history log */
  history?: EditHistoryLog[]
}

export interface CashBankTransaction {
  id: string
  date: string
  counterId: string
  counterName: string
  type: 'In' | 'Out' | 'Transfer'
  amount: number
  narration: string
  toCounterId?: string
  toCounterName?: string
}

export interface CashBankData {
  counters: Counter[]
  transactions: CashBankTransaction[]
}

export function isManualCounterTransaction(t: CashBankTransaction): boolean {
  if (!t) return false
  const id = (t.id || '').toLowerCase()
  const narration = (t.narration || '').toLowerCase()

  // External synced module transactions from Payments, Expenses, or Invoices
  if (
    id.startsWith('txn-cp-') ||
    id.startsWith('txn-sp-') ||
    id.startsWith('txn-exp-') ||
    id.startsWith('purchase-invoice-payment-') ||
    id.startsWith('sales-invoice-payment-')
  ) {
    return false
  }

  if (
    narration.includes('customer payment') ||
    narration.includes('supplier payment') ||
    narration.startsWith('expense:')
  ) {
    return false
  }

  return true
}

