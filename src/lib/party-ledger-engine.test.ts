import { describe, it, expect } from 'vitest'
import { calculatePartyLedger } from './party-ledger-engine'
import { Party } from './types'

describe('360° Unified Party Ledger Engine', () => {
  const testParty: Party = {
    id: 'party-100',
    name: 'National Builders Corp',
    gstin: '19AAACN1234F1Z8',
    openingBalance: 10000,
    balanceType: 'Debit' // Opening Dr ₹10,000
  }

  it('calculates full chronological running balance across all 8 transaction types', () => {
    const ledger = calculatePartyLedger({
      party: testParty,
      salesInvoices: [
        {
          id: 's-1',
          customerId: 'party-100',
          invoiceNo: 'SI-001',
          invoiceDate: '2026-04-05',
          invoiceAmount: 50000,
          totalAmount: 50000,
          fy: '2026-27'
        }
      ],
      invoices: [
        {
          id: 'p-1',
          supplierId: 'party-100',
          invoiceNo: 'PI-001',
          invoiceDate: '2026-04-10',
          invoiceAmount: 20000,
          totalAmount: 20000,
          fy: '2026-27'
        }
      ],
      customerPayments: [
        {
          id: 'cp-1',
          customerId: 'party-100',
          paymentDate: '2026-04-15',
          amount: 15000,
          fy: '2026-27'
        }
      ],
      payments: [
        {
          id: 'sp-1',
          supplierId: 'party-100',
          paymentDate: '2026-04-20',
          amount: 5000,
          fy: '2026-27'
        }
      ],
      creditNotes: [
        {
          id: 'cn-1',
          partyId: 'party-100',
          noteNo: 'CN-001',
          date: '2026-04-22',
          amount: 2000,
          totalAmount: 2000,
          fy: '2026-27'
        }
      ],
      debitNotes: [
        {
          id: 'dn-1',
          partyId: 'party-100',
          noteNo: 'DN-001',
          date: '2026-04-25',
          amount: 1000,
          totalAmount: 1000,
          fy: '2026-27'
        }
      ],
      salesReturns: [
        {
          id: 'sr-1',
          partyId: 'party-100',
          customerId: 'party-100',
          returnNo: 'SR-001',
          returnDate: '2026-04-27',
          amount: 3000,
          totalAmount: 3000,
          fy: '2026-27'
        }
      ],
      purchaseReturns: [
        {
          id: 'pr-1',
          partyId: 'party-100',
          supplierId: 'party-100',
          returnNo: 'PR-001',
          returnDate: '2026-04-28',
          amount: 4000,
          totalAmount: 4000,
          fy: '2026-27'
        }
      ]
    })

    // Opening Balance = Dr 10,000
    // + Sale (Dr 50,000) -> Running Dr 60,000
    // - Purchase (Cr 20,000) -> Running Dr 40,000
    // - Payment In (Cr 15,000) -> Running Dr 25,000
    // + Payment Out (Dr 5,000) -> Running Dr 30,000
    // - Credit Note (Cr 2,000) -> Running Dr 28,000
    // + Debit Note (Dr 1,000) -> Running Dr 29,000
    // - Sales Return (Cr 3,000) -> Running Dr 26,000
    // + Purchase Return (Dr 4,000) -> Running Dr 30,000

    expect(ledger.openingBalance).toBe(10000)
    expect(ledger.openingBalanceType).toBe('Dr')

    expect(ledger.closingBalance).toBe(30000)
    expect(ledger.closingBalanceType).toBe('Dr')

    expect(ledger.totalDebit).toBe(70000) // 10000 (Op) + 50000 + 5000 + 1000 + 4000
    expect(ledger.totalCredit).toBe(40000) // 20000 + 15000 + 2000 + 3000

    // 1 Opening Row + 8 Transaction Rows = 9 Rows
    expect(ledger.rows.length).toBe(9)
  })
})
