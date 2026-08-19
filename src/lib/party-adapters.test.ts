import { describe, it, expect } from 'vitest'
import {
  normalizeOpeningBalance,
  normalizeParty,
  toParty,
  migrateToUnifiedParties,
  getParties,
  getPartyById
} from './party-adapters'
import { Party } from './types'
import { TenantData } from './storage-utils'

describe('Party Adapters & Migration Engine', () => {
  it('normalizes opening balance correctly', () => {
    const ob1 = normalizeOpeningBalance(1000)
    expect(ob1).toEqual({ openingBalance: 1000, balanceType: 'Debit' })

    const ob2 = normalizeOpeningBalance(-500)
    expect(ob2).toEqual({ openingBalance: 500, balanceType: 'Credit' })

    const ob3 = normalizeOpeningBalance(1500, 'Credit')
    expect(ob3).toEqual({ openingBalance: 1500, balanceType: 'Credit' })
  })

  it('normalizes legacy supplier into a unified Party object', () => {
    const legacySupplier = {
      id: 'sup-1',
      name: 'Rathi Steels Pvt Ltd',
      gstin: '19AAACR1234F1Z5',
      phone: '9876543210',
      address: 'Industrial Area',
      city: 'Kolkata',
      state: 'West Bengal',
      pincode: '700001',
      openingBalance: -25000,
      paymentTerms: '30 Days'
    }

    const party = normalizeParty(legacySupplier)
    expect(party.id).toBe('sup-1')
    expect(party.name).toBe('Rathi Steels Pvt Ltd')
    expect(party.gstin).toBe('19AAACR1234F1Z5')
    expect(party.stateCode).toBe('19')
    expect(party.openingBalance).toBe(25000)
    expect(party.balanceType).toBe('Credit')
  })

  it('migrates legacy customer and supplier collections into a single unified Party registry', () => {
    const tenant: Partial<TenantData> = {
      suppliers: [
        {
          id: 'sup-1',
          name: 'Jindal Steel',
          gstin: '19AAACJ1234F1Z1',
          openingBalance: -50000
        }
      ],
      customers: [
        {
          id: 'cust-1',
          name: 'Apex Constructions',
          gstin: '19AAACA5678F1Z9',
          openingBalance: 75000
        },
        // Same party appearing in both supplier and customer list (Counterparty overlap)
        {
          id: 'cust-2',
          name: 'Jindal Steel',
          gstin: '19AAACJ1234F1Z1',
          openingBalance: 10000
        }
      ]
    }

    const unified = migrateToUnifiedParties(tenant)
    expect(unified.length).toBe(2) // Jindal Steel deduplicated, Apex Constructions added

    const jindal = unified.find(p => p.name === 'Jindal Steel')!
    expect(jindal).toBeDefined()
    // Combined balance: -50000 (Cr) + 10000 (Dr) = -40000 (Cr)
    expect(jindal.openingBalance).toBe(40000)
    expect(jindal.balanceType).toBe('Credit')

    const apex = unified.find(p => p.name === 'Apex Constructions')!
    expect(apex).toBeDefined()
    expect(apex.openingBalance).toBe(75000)
    expect(apex.balanceType).toBe('Debit')
  })

  it('getParties and getPartyById correctly query unified and legacy structures', () => {
    const parties: Party[] = [
      { id: 'p-1', name: 'Tata Steel', openingBalance: 0, balanceType: 'Debit' },
      { id: 'p-2', name: 'SAIL', openingBalance: 10000, balanceType: 'Credit' }
    ]

    const list = getParties({ parties })
    expect(list.length).toBe(2)

    const tata = getPartyById({ parties }, 'p-1')
    expect(tata?.name).toBe('Tata Steel')
  })

  it('normalizes gstRegistrationType to Tally Prime standard (Regular, Unregistered/Consumer, Composition)', () => {
    const regParty = normalizeParty({ id: 'p1', name: 'Reg Buyer', gstin: '19AAACB1234F1Z1', gstRegistrationType: 'Registered' as any })
    expect(regParty.gstRegistrationType).toBe('Regular')

    const compParty = normalizeParty({ id: 'p2', name: 'Comp Buyer', gstin: '19AAACB1234F1Z1', gstRegistrationType: 'Composition' })
    expect(compParty.gstRegistrationType).toBe('Composition')

    const unregParty = normalizeParty({ id: 'p3', name: 'Retail Buyer', gstRegistrationType: 'Consumer' as any })
    expect(unregParty.gstRegistrationType).toBe('Unregistered/Consumer')

    const autoReg = normalizeParty({ id: 'p4', name: 'Auto Buyer', gstin: '19AAACB1234F1Z1' })
    expect(autoReg.gstRegistrationType).toBe('Regular')

    const autoUnreg = normalizeParty({ id: 'p5', name: 'Auto Retail' })
    expect(autoUnreg.gstRegistrationType).toBe('Unregistered/Consumer')
  })
})

