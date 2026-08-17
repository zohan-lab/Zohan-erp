import { describe, expect, it } from 'vitest'
import {
  calculateExpectedAnnualDiscounts,
  calculateExpectedDiscounts,
  calculatePaymentAllocations,
  calculateBookingConsumedMT,
  calculateBookingConsumption,
  getBookingNormalizedMT,
  formatCurrency,
  calculateInvoiceTaxBreakdown,
  calculateInvoiceTotals,
  calculateInvoiceListTotals,
  calculateExpenseTaxBreakdown,
  calculateNoteTaxBreakdown,
  calculateExpenseTotals,
  calculateRateWithGst,
  calculateBasicRateFromInclusive,
  isInterStateTransaction
} from './calculations'
import { convertItemQuantity, getInvoiceQtyForUnit, isUnitCompatible } from './unit-conversion-service'
import { Payment, PurchaseInvoice, Supplier, AdditionalCharge, SupplierDebitNote } from './types'

function invoice(overrides: Partial<PurchaseInvoice>): PurchaseInvoice {
  const amount = overrides.invoiceAmount ?? 1000
  return {
    id: 'inv-1',
    supplierId: 'sup-1',
    invoiceNo: 'PI-001',
    invoiceDate: '2026-04-01',
    invoiceAmount: amount,
    totalAmount: amount,
    taxableAmount: Math.round(amount / 1.18 * 100) / 100,
    cgstAmount: Math.round(amount / 1.18 * 0.09 * 100) / 100,
    sgstAmount: Math.round(amount / 1.18 * 0.09 * 100) / 100,
    fy: 'FY2026-27',
    createdAt: new Date('2026-04-01T08:00:00Z').getTime(),
    items: [
      {
        itemId: 'item-1',
        enteredQuantity: 10,
        enteredUnit: 'MT',
        baseQuantity: 10000,
        rate: amount / 10,
        basicRate: Math.round(amount / 10 / 1.18 * 100) / 100,
        amount: amount,
        taxableAmount: Math.round(amount / 1.18 * 100) / 100
      }
    ],
    ...overrides
  }
}

function payment(overrides: Partial<Payment>): Payment {
  return {
    id: 'pay-1',
    supplierId: 'sup-1',
    paymentDate: '2026-04-02',
    amount: 1000,
    isAdvance: false,
    fy: 'FY2026-27',
    createdAt: new Date('2026-04-02T08:00:00Z').getTime(),
    ...overrides
  }
}

describe('calculatePaymentAllocations', () => {
  it('allocates supplier payments FIFO across older invoices first', () => {
    const invoices = [
      invoice({ id: 'inv-old', invoiceDate: '2026-04-01', invoiceAmount: 700 }),
      invoice({ id: 'inv-new', invoiceDate: '2026-04-03', invoiceAmount: 500 })
    ]
    const payments = [payment({ id: 'pay-main', paymentDate: '2026-04-04', amount: 900 })]

    const { allocations } = calculatePaymentAllocations(payments, invoices)

    expect(allocations).toEqual([
      expect.objectContaining({ paymentId: 'pay-main', invoiceId: 'inv-old', allocatedAmount: 700 }),
      expect.objectContaining({ paymentId: 'pay-main', invoiceId: 'inv-new', allocatedAmount: 200 })
    ])
  })

  it('uses same-day createdAt timestamps to keep invoice/payment order stable', () => {
    const sameDay = '2026-04-01'
    const invoices = [
      invoice({
        id: 'inv-same-day',
        invoiceDate: sameDay,
        invoiceAmount: 500,
        createdAt: new Date('2026-04-01T09:00:00Z').getTime()
      })
    ]
    const payments = [
      payment({
        id: 'pay-before-invoice',
        paymentDate: sameDay,
        amount: 500,
        createdAt: new Date('2026-04-01T08:00:00Z').getTime()
      })
    ]

    const { allocations, paymentAdvanceInfo } = calculatePaymentAllocations(payments, invoices)

    expect(allocations).toHaveLength(1)
    expect(allocations[0]).toEqual(expect.objectContaining({
      paymentId: 'pay-before-invoice',
      invoiceId: 'inv-same-day',
      allocatedAmount: 500
    }))
    expect(paymentAdvanceInfo.get('pay-before-invoice')?.advanceAmount).toBe(500)
  })

  it('tracks the advance portion when payment exceeds current outstanding', () => {
    const invoices = [invoice({ id: 'inv-small', invoiceAmount: 300 })]
    const payments = [payment({ id: 'pay-large', amount: 1000 })]

    const { paymentAdvanceInfo } = calculatePaymentAllocations(payments, invoices)

    expect(paymentAdvanceInfo.get('pay-large')).toEqual(expect.objectContaining({
      allocatedAmount: 300,
      advanceAmount: 700,
      outstandingAtPaymentTime: 300
    }))
  })
})

describe('annual discount calculations', () => {
  it('calculates annual expected discount from supplier target rate and achieved MT', () => {
    const suppliers: Supplier[] = [
      {
        id: 'sup-1',
        name: 'Supplier One',
        paymentCDRules: [],
        invoiceCloseCDRules: [],
        annualTarget: { targetMT: 100, ratePerMT: 25 }
      }
    ]
    const invoices = [
      invoice({ id: 'inv-a', items: [{ itemId: 'item-1', enteredQuantity: 40, enteredUnit: 'MT', baseQuantity: 40000, rate: 100, amount: 4000 }] }),
      invoice({ id: 'inv-b', items: [{ itemId: 'item-1', enteredQuantity: 10, enteredUnit: 'MT', baseQuantity: 10000, rate: 100, amount: 1000 }] })
    ]

    const result = calculateExpectedAnnualDiscounts(invoices, suppliers)

    expect(result).toEqual([
      expect.objectContaining({
        supplierId: 'sup-1',
        achievedMT: 50,
        expectedAmount: 1250
      })
    ])
  })
})

describe('formatCurrency', () => {
  it('formats Indian currency values consistently', () => {
    expect(formatCurrency(123456.78)).toContain('1,23,456.78')
  })
})

describe('unit conversion and scheme discount calculation', () => {
  it('converts item quantity from entered unit (BUNDLE) to scheme target unit (BTL) using conversion factor', () => {
    const item = {
      id: 'item-whisky',
      name: 'Whisky 750ml',
      unit: 'BTL',
      alternativeUnit: 'BUNDLE',
      conversionFactor: 25
    }

    // 25 Bundles entered -> should convert to 625 Bottles (25 * 25)
    const qtyInBtl = convertItemQuantity(item, 25, 'BUNDLE', 'BTL')
    expect(qtyInBtl).toBe(625)

    // Invoice with 25 Bundles
    const inv = {
      items: [
        { itemId: 'item-whisky', enteredQuantity: 25, enteredUnit: 'BUNDLE', baseQuantity: 625 }
      ]
    }
    const itemMap = new Map([['item-whisky', item]])
    const invoiceQtyInBtl = getInvoiceQtyForUnit(inv, 'BTL', itemMap)
    expect(invoiceQtyInBtl).toBe(625)
  })

  it('calculates expected fixed scheme discount using converted unit quantity', () => {
    const supplier: Supplier = {
      id: 'sup-whisky',
      name: 'Whisky Supplier',
      paymentCDRules: [],
      invoiceCloseCDRules: []
    }
    const item = {
      id: 'item-whisky',
      name: 'Whisky 750ml',
      unit: 'BTL',
      alternativeUnit: 'BUNDLE',
      conversionFactor: 25
    }
    const fixedScheme = {
      id: 'scheme-1',
      supplierId: 'sup-whisky',
      schemeName: 'Bottle Scheme',
      ratePerMT: 10, // ₹10 per BTL
      unit: 'BTL',
      fromDate: '2026-01-01',
      toDate: '2026-12-31'
    }
    const inv: PurchaseInvoice = {
      id: 'inv-whisky-1',
      supplierId: 'sup-whisky',
      invoiceNo: 'PI-W1',
      invoiceDate: '2026-04-05',
      invoiceAmount: 10000,
      fy: 'FY2026-27',
      items: [
        { itemId: 'item-whisky', enteredQuantity: 25, enteredUnit: 'BUNDLE', rate: 400, amount: 10000, baseQuantity: 625 }
      ]
    }

    const discounts = calculateExpectedDiscounts(
      [inv],
      [],
      [],
      new Map(),
      [supplier],
      [fixedScheme],
      [],
      [item]
    )

    expect(discounts).toHaveLength(1)
    expect(discounts[0].eligibleQuantityMT).toBe(625) // 625 BTL
    expect(discounts[0].expectedAmount).toBe(6250) // 625 * 10 = ₹6,250
  })

  it('enforces strict zero eligibility on complete unit mismatch', () => {
    const item = {
      id: 'item-screws',
      name: 'Fastener Screws',
      unit: 'PCS',
      alternativeUnit: 'BOX',
      conversionFactor: 100
    }

    // Incompatible target unit 'BTL' for Screws (PCS/BOX)
    expect(isUnitCompatible(item, 'BOX', 'BTL')).toBe(false)
    expect(convertItemQuantity(item, 50, 'BOX', 'BTL')).toBe(0)

    // Compatible target units 'BOX' and 'PCS'
    expect(isUnitCompatible(item, 'BOX', 'BOX')).toBe(true)
    expect(convertItemQuantity(item, 50, 'BOX', 'BOX')).toBe(50)

    expect(isUnitCompatible(item, 'BOX', 'PCS')).toBe(true)
    expect(convertItemQuantity(item, 50, 'BOX', 'PCS')).toBe(5000)

    // Invoice with Screws (BOX/PCS) checked against a Bottle Scheme (BTL)
    const supplier: Supplier = {
      id: 'sup-screws',
      name: 'Hardware Supplier',
      paymentCDRules: [],
      invoiceCloseCDRules: []
    }
    const bottleScheme = {
      id: 'scheme-bottle',
      supplierId: 'sup-screws',
      schemeName: 'Bottle Promo',
      ratePerMT: 5,
      unit: 'BTL',
      fromDate: '2026-01-01',
      toDate: '2026-12-31'
    }
    const inv: PurchaseInvoice = {
      id: 'inv-screws-1',
      supplierId: 'sup-screws',
      invoiceNo: 'PI-S1',
      invoiceDate: '2026-04-05',
      invoiceAmount: 5000,
      fy: 'FY2026-27',
      items: [
        { itemId: 'item-screws', enteredQuantity: 50, enteredUnit: 'BOX', rate: 100, amount: 5000, baseQuantity: 100 }
      ]
    }

    const discounts = calculateExpectedDiscounts(
      [inv],
      [],
      [],
      new Map(),
      [supplier],
      [bottleScheme],
      [],
      [item]
    )

    // Strictly 0 discounts generated for incompatible unit
    expect(discounts).toHaveLength(0)
  })

  it('splits a 20 MT invoice between 15 MT booking and current scheme leaving exact 5.00 MT remainder', () => {
    const supplier: Supplier = {
      id: 'sup-steel',
      name: 'Steel Supplier',
      paymentCDRules: [],
      invoiceCloseCDRules: []
    }
    const item = {
      id: 'item-steel',
      name: 'Steel Rods',
      unit: 'MT',
      conversionFactor: 1
    }
    const currentScheme = {
      id: 'scheme-current',
      supplierId: 'sup-steel',
      schemeName: 'Current Active Scheme',
      ratePerMT: 2000, // ₹2,000 per MT
      unit: 'MT',
      fromDate: '2026-01-01',
      toDate: '2026-12-31'
    }
    const booking = {
      id: 'booking-1',
      supplierId: 'sup-steel',
      orderDate: '2026-03-15',
      consumeStartDate: '2026-03-15',
      bookedMT: 15,
      rateMode: 'manual' as const,
      manualRate: 1500,
      status: 'active' as const,
      fy: 'FY2026-27'
    }
    const inv: PurchaseInvoice = {
      id: 'inv-20mt',
      supplierId: 'sup-steel',
      invoiceNo: 'INV-20',
      invoiceDate: '2026-04-10',
      invoiceAmount: 1000000,
      fy: 'FY2026-27',
      items: [
        { itemId: 'item-steel', enteredQuantity: 20, enteredUnit: 'MT', rate: 50000, amount: 1000000, baseQuantity: 20000 }
      ]
    }

    const discounts = calculateExpectedDiscounts(
      [inv],
      [],
      [],
      new Map(),
      [supplier],
      [currentScheme],
      [booking],
      [item]
    )

    // Booking discount (15 MT) + Current Scheme discount (5 MT)
    expect(discounts).toHaveLength(2)

    const bookingDiscount = discounts.find(d => d.mtBookingId === 'booking-1')
    expect(bookingDiscount).toBeDefined()
    expect(bookingDiscount?.eligibleQuantityMT).toBe(15)
    expect(bookingDiscount?.expectedAmount).toBe(22500) // 15 * 1500

    const currentSchemeDiscount = discounts.find(d => d.id === `fixedScheme-${inv.id}-${currentScheme.id}`)
    expect(currentSchemeDiscount).toBeDefined()
    expect(currentSchemeDiscount?.eligibleQuantityMT).toBe(5) // EXACT 5.00 MT remainder
    expect(currentSchemeDiscount?.expectedAmount).toBe(10000) // EXACT 5 * 2000 = ₹10,000
  })

  it('normalizes MT booking entered in KG (15,000 KG) to 15.00 MT when consuming invoice', () => {
    const supplier: Supplier = {
      id: 'sup-kg-booking',
      name: 'KG Supplier',
      paymentCDRules: [],
      invoiceCloseCDRules: []
    }
    const item = {
      id: 'item-kg',
      name: 'Raw Material',
      unit: 'KG',
      conversionFactor: 1000
    }
    const booking = {
      id: 'booking-kg-1',
      supplierId: 'sup-kg-booking',
      orderDate: '2026-03-15',
      consumeStartDate: '2026-03-15',
      bookedMT: 15000, // 15,000 KG
      unit: 'KG',
      rateMode: 'manual' as const,
      manualRate: 1.5, // ₹1.5 per KG
      status: 'active' as const,
      fy: 'FY2026-27'
    }
    const inv: PurchaseInvoice = {
      id: 'inv-20mt-kg',
      supplierId: 'sup-kg-booking',
      invoiceNo: 'INV-20-KG',
      invoiceDate: '2026-04-10',
      invoiceAmount: 1000000,
      fy: 'FY2026-27',
      items: [
        { itemId: 'item-kg', enteredQuantity: 20000, enteredUnit: 'KG', rate: 50, amount: 1000000, baseQuantity: 20000 }
      ]
    }

    const normalizedMT = getBookingNormalizedMT(booking, item)
    expect(normalizedMT).toBe(15) // 15,000 KG converted to 15 MT

    const consumedMT = calculateBookingConsumedMT(booking.id, booking.supplierId, booking.consumeStartDate, booking.bookedMT, [inv], booking.unit)
    expect(consumedMT).toBe(15)

    const discounts = calculateExpectedDiscounts(
      [inv],
      [],
      [],
      new Map(),
      [supplier],
      [],
      [booking],
      [item]
    )

    expect(discounts).toHaveLength(1)
    expect(discounts[0].eligibleQuantityMT).toBe(15)
  })

  it('prevents phantom consumption when invoice items have incompatible units', () => {
    const supplier: Supplier = {
      id: 'sup-mixed',
      name: 'Mixed Unit Supplier',
      paymentCDRules: [],
      invoiceCloseCDRules: []
    }
    const itemSteel = {
      id: 'item-steel-1',
      name: 'Steel Rods',
      unit: 'MT',
      conversionFactor: 1
    }
    const boxBooking = {
      id: 'booking-box-1',
      supplierId: 'sup-mixed',
      orderDate: '2026-03-15',
      consumeStartDate: '2026-03-15',
      bookedMT: 500, // 500 BOX
      unit: 'BOX',
      rateMode: 'manual' as const,
      manualRate: 10,
      status: 'active' as const,
      fy: 'FY2026-27'
    }
    // Purchase invoice contains ONLY Steel Rods (MT), 0 BOX items
    const inv: PurchaseInvoice = {
      id: 'inv-steel-only',
      supplierId: 'sup-mixed',
      invoiceNo: 'INV-MT-1',
      invoiceDate: '2026-04-10',
      invoiceAmount: 2500000,
      fy: 'FY2026-27',
      items: [
        { itemId: 'item-steel-1', enteredQuantity: 50, enteredUnit: 'MT', rate: 50000, amount: 2500000, baseQuantity: 50000 }
      ]
    }

    // BOX Booking must NOT consume MT invoice items (0 phantom consumption)
    const consumption = calculateBookingConsumption(boxBooking, [inv], [itemSteel])
    expect(consumption.consumedInBookingUnit).toBe(0)
    expect(consumption.consumedMT).toBe(0)
    expect(consumption.remainingInBookingUnit).toBe(500)
    expect(consumption.status).toBe('Active')

    const discounts = calculateExpectedDiscounts(
      [inv],
      [],
      [],
      new Map(),
      [supplier],
      [],
      [boxBooking],
      [itemSteel]
    )

    // No booking discount generated for incompatible unit invoice
    expect(discounts).toHaveLength(0)
  })

  it('enforces monotonic quantity exhaustion: fully exhausted invoice yields 0 active scheme discount', () => {
    const supplier: Supplier = {
      id: 'sup-exhaustion',
      name: 'Exhaustion Supplier',
      paymentCDRules: [],
      invoiceCloseCDRules: []
    }
    const item = {
      id: 'item-rod',
      name: 'Steel Rod',
      unit: 'MT',
      conversionFactor: 1
    }
    const booking = {
      id: 'booking-exhaust-1',
      supplierId: 'sup-exhaustion',
      orderDate: '2026-03-15',
      consumeStartDate: '2026-03-15',
      bookedMT: 20, // 20 MT Booking
      unit: 'MT',
      rateMode: 'manual' as const,
      manualRate: 1500,
      status: 'active' as const,
      fy: 'FY2026-27'
    }
    const currentActiveScheme = {
      id: 'scheme-active-1',
      supplierId: 'sup-exhaustion',
      schemeName: 'April Active Scheme',
      ratePerMT: 2000,
      unit: 'MT',
      fromDate: '2026-04-01',
      toDate: '2026-04-30'
    }
    // Purchase invoice is 15 MT (smaller than booking's 20 MT)
    const inv: PurchaseInvoice = {
      id: 'inv-15mt',
      supplierId: 'sup-exhaustion',
      invoiceNo: 'INV-15MT',
      invoiceDate: '2026-04-10',
      invoiceAmount: 750000,
      fy: 'FY2026-27',
      items: [
        { itemId: 'item-rod', enteredQuantity: 15, enteredUnit: 'MT', rate: 50000, amount: 750000, baseQuantity: 15000 }
      ]
    }

    const discounts = calculateExpectedDiscounts(
      [inv],
      [],
      [],
      new Map(),
      [supplier],
      [currentActiveScheme],
      [booking],
      [item]
    )

    // ONLY 1 discount generated (the 15 MT booking discount). Active scheme gets ZERO because invoice was fully exhausted!
    expect(discounts).toHaveLength(1)
    expect(discounts[0].mtBookingId).toBe('booking-exhaust-1')
    expect(discounts[0].eligibleQuantityMT).toBe(15)
    expect(discounts[0].expectedAmount).toBe(22500) // 15 * 1500

    const activeSchemeDiscount = discounts.find(d => d.schemeId === 'scheme-active-1')
    expect(activeSchemeDiscount).toBeUndefined()
  })
})

describe('calculateInvoiceTaxBreakdown & isInterStateTransaction', () => {
  it('correctly classifies intra-state and inter-state transactions', () => {
    // Intra-state (West Bengal / WB / empty)
    expect(isInterStateTransaction('West Bengal', 'West Bengal')).toBe(false)
    expect(isInterStateTransaction('WB', 'West Bengal')).toBe(false)
    expect(isInterStateTransaction('19', 'West Bengal')).toBe(false)
    expect(isInterStateTransaction(undefined, 'West Bengal')).toBe(false)
    expect(isInterStateTransaction('', 'West Bengal')).toBe(false)

    // Inter-state (other states)
    expect(isInterStateTransaction('Maharashtra', 'West Bengal')).toBe(true)
    expect(isInterStateTransaction('Odisha', 'West Bengal')).toBe(true)
    expect(isInterStateTransaction('Jharkhand', 'West Bengal')).toBe(true)
    expect(isInterStateTransaction('Delhi', 'West Bengal')).toBe(true)
    expect(isInterStateTransaction('27', '19')).toBe(true)
    expect(isInterStateTransaction('10', '19')).toBe(true)
    expect(isInterStateTransaction('19AAAAA0000A1Z5', '19')).toBe(false)
    expect(isInterStateTransaction('27AAAAA0000A1Z5', '19')).toBe(true)
  })

  it('calculates intra-state tax split as CGST (9%) + SGST (9%), IGST = 0', () => {
    // 10 MT @ ₹50,000 basic = ₹500,000 taxable
    const result = calculateInvoiceTaxBreakdown({
      items: [
        {
          itemId: 'item-1',
          enteredQuantity: 10,
          basicRate: 50000,
          amount: 590000
        }
      ],
      partyState: 'West Bengal',
      companyState: 'West Bengal'
    })

    expect(result.isInterState).toBe(false)
    expect(result.taxableAmount).toBe(500000)
    expect(result.cgstRate).toBe(9)
    expect(result.cgstAmount).toBe(45000) // 500,000 * 9%
    expect(result.sgstRate).toBe(9)
    expect(result.sgstAmount).toBe(45000) // 500,000 * 9%
    expect(result.igstRate).toBe(0)
    expect(result.igstAmount).toBe(0)
    expect(result.totalTaxAmount).toBe(90000)
    expect(result.totalAmount).toBe(590000)
  })

  it('calculates inter-state tax split as IGST (18%), CGST = 0, SGST = 0', () => {
    // 10 MT @ ₹50,000 basic = ₹500,000 taxable
    const result = calculateInvoiceTaxBreakdown({
      items: [
        {
          itemId: 'item-1',
          enteredQuantity: 10,
          basicRate: 50000,
          amount: 590000
        }
      ],
      partyState: 'Odisha',
      companyState: 'West Bengal'
    })

    expect(result.isInterState).toBe(true)
    expect(result.taxableAmount).toBe(500000)
    expect(result.cgstRate).toBe(0)
    expect(result.cgstAmount).toBe(0)
    expect(result.sgstRate).toBe(0)
    expect(result.sgstAmount).toBe(0)
    expect(result.igstRate).toBe(18)
    expect(result.igstAmount).toBe(90000) // 500,000 * 18%
    expect(result.totalTaxAmount).toBe(90000)
    expect(result.totalAmount).toBe(590000)
  })

  it('calculates row-level mixed GST rates (5% + 18% + 0% Exempted) on same invoice', () => {
    const result = calculateInvoiceTaxBreakdown({
      items: [
        {
          itemId: 'item-5pct',
          enteredQuantity: 10,
          basicRate: 1000, // Taxable: 10,000 @ 5% -> CGST: 250 (2.5%), SGST: 250 (2.5%)
          gstRate: 5
        },
        {
          itemId: 'item-18pct',
          enteredQuantity: 5,
          basicRate: 2000, // Taxable: 10,000 @ 18% -> CGST: 900 (9%), SGST: 900 (9%)
          gstRate: 18
        },
        {
          itemId: 'item-exempt',
          enteredQuantity: 2,
          basicRate: 5000, // Taxable: 10,000 @ 0% -> CGST: 0, SGST: 0
          gstRate: 0
        }
      ],
      partyState: '19', // Intra-state WB
      companyState: '19'
    })

    expect(result.isInterState).toBe(false)
    expect(result.taxableAmount).toBe(30000) // 10k + 10k + 10k
    expect(result.cgstAmount).toBe(1150) // 250 + 900 + 0
    expect(result.sgstAmount).toBe(1150) // 250 + 900 + 0
    expect(result.igstAmount).toBe(0)
    expect(result.totalTaxAmount).toBe(2300)
    expect(result.totalAmount).toBe(32300)
    expect(result.lineBreakdowns.length).toBe(3)
    expect(result.lineBreakdowns[0].cgstAmount).toBe(250)
    expect(result.lineBreakdowns[1].cgstAmount).toBe(900)
    expect(result.lineBreakdowns[2].cgstAmount).toBe(0)
  })

  it('deducts discounts and accounts for additional cost basic rate with proper rounding', () => {
    // Taxable = (10 * 10,000) - 5,000 discount + 2,500 additional cost basic = ₹97,500
    const result = calculateInvoiceTaxBreakdown({
      items: [
        {
          itemId: 'item-1',
          enteredQuantity: 10,
          basicRate: 10000
        }
      ],
      discountsAmount: 5000,
      additionalCostBasicRate: 2500,
      partyState: 'WB'
    })

    expect(result.taxableAmount).toBe(97500)
    expect(result.cgstRate).toBe(9)
    expect(result.cgstAmount).toBe(8775) // 97,500 * 9%
    expect(result.sgstRate).toBe(9)
    expect(result.sgstAmount).toBe(8775)
    expect(result.totalTaxAmount).toBe(17550)
    expect(result.totalAmount).toBe(115050) // 97,500 + 17,550
  })

  it('strictly calculates 0% GST (zero tax) for items with gstRate = 0 (Exempted)', () => {
    const result = calculateInvoiceTaxBreakdown({
      items: [
        {
          itemId: 'item-exempt-1',
          enteredQuantity: 5,
          basicRate: 2000,
          gstRate: 0 // Explicitly 0% exempt
        }
      ],
      partyState: '19', // Intra-state West Bengal
      companyState: '19'
    })

    expect(result.taxableAmount).toBe(10000)
    expect(result.cgstRate).toBe(0)
    expect(result.cgstAmount).toBe(0)
    expect(result.sgstRate).toBe(0)
    expect(result.sgstAmount).toBe(0)
    expect(result.igstAmount).toBe(0)
    expect(result.totalTaxAmount).toBe(0)
    expect(result.totalAmount).toBe(10000)
    expect(result.lineBreakdowns[0].gstRate).toBe(0)
    expect(result.lineBreakdowns[0].cgstAmount).toBe(0)
    expect(result.lineBreakdowns[0].sgstAmount).toBe(0)
  })
})

describe('calculateExpenseTaxBreakdown', () => {
  it('correctly calculates intra-state tax inclusive expense (CGST + SGST)', () => {
    // ₹11,800 inclusive of 18% GST -> Taxable ₹10,000, CGST ₹900 (9%), SGST ₹900 (9%)
    const result = calculateExpenseTaxBreakdown({
      amount: 11800,
      hasGst: true,
      isTaxInclusive: true,
      gstRate: 18,
      supplierStateCode: '19', // Intra-state WB
      companyStateCode: '19'
    })

    expect(result.isInterState).toBe(false)
    expect(result.taxableAmount).toBe(10000)
    expect(result.cgstRate).toBe(9)
    expect(result.cgstAmount).toBe(900)
    expect(result.sgstRate).toBe(9)
    expect(result.sgstAmount).toBe(900)
    expect(result.igstAmount).toBe(0)
    expect(result.totalTaxAmount).toBe(1800)
    expect(result.totalExpenseAmount).toBe(11800)
  })

  it('correctly calculates inter-state tax exclusive expense (IGST 18%)', () => {
    // ₹50,000 exclusive of 18% GST -> Taxable ₹50,000, IGST ₹9,000, Gross ₹59,000
    const result = calculateExpenseTaxBreakdown({
      amount: 50000,
      hasGst: true,
      isTaxInclusive: false,
      gstRate: 18,
      supplierStateCode: '27', // Maharashtra (Inter-state)
      companyStateCode: '19'
    })

    expect(result.isInterState).toBe(true)
    expect(result.taxableAmount).toBe(50000)
    expect(result.igstRate).toBe(18)
    expect(result.igstAmount).toBe(9000)
    expect(result.cgstAmount).toBe(0)
    expect(result.sgstAmount).toBe(0)
    expect(result.totalTaxAmount).toBe(9000)
    expect(result.totalExpenseAmount).toBe(59000)
  })

  it('returns flat amount with 0 tax when hasGst is false', () => {
    const result = calculateExpenseTaxBreakdown({
      amount: 4500,
      hasGst: false,
      isTaxInclusive: true,
      gstRate: 18,
      supplierStateCode: '19',
      companyStateCode: '19'
    })

    expect(result.taxableAmount).toBe(4500)
    expect(result.totalTaxAmount).toBe(0)
    expect(result.cgstAmount).toBe(0)
    expect(result.sgstAmount).toBe(0)
    expect(result.igstAmount).toBe(0)
    expect(result.totalExpenseAmount).toBe(4500)
  })
})

describe('calculateNoteTaxBreakdown', () => {
  it('correctly calculates intra-state inclusive Credit Note tax split (CGST 9% + SGST 9%)', () => {
    // ₹11,800 inclusive -> Taxable ₹10,000, CGST ₹900, SGST ₹900, Total ₹11,800
    const result = calculateNoteTaxBreakdown({
      amount: 11800,
      isTaxInclusive: true,
      gstRate: 18,
      partyStateCode: '19', // Intra-state WB
      companyStateCode: '19'
    })

    expect(result.isInterState).toBe(false)
    expect(result.taxableAmount).toBe(10000)
    expect(result.cgstRate).toBe(9)
    expect(result.cgstAmount).toBe(900)
    expect(result.sgstRate).toBe(9)
    expect(result.sgstAmount).toBe(900)
    expect(result.igstAmount).toBe(0)
    expect(result.totalTaxAmount).toBe(1800)
    expect(result.totalAmount).toBe(11800)
  })

  it('correctly calculates inter-state exclusive Debit Note tax split (IGST 18%)', () => {
    // ₹20,000 exclusive + 18% IGST -> Taxable ₹20,000, IGST ₹3,600, Total ₹23,600
    const result = calculateNoteTaxBreakdown({
      amount: 20000,
      isTaxInclusive: false,
      gstRate: 18,
      partyStateCode: '07', // Delhi (Inter-state)
      companyStateCode: '19'
    })

    expect(result.isInterState).toBe(true)
    expect(result.taxableAmount).toBe(20000)
    expect(result.igstRate).toBe(18)
    expect(result.igstAmount).toBe(3600)
    expect(result.cgstAmount).toBe(0)
    expect(result.sgstAmount).toBe(0)
    expect(result.totalTaxAmount).toBe(3600)
    expect(result.totalAmount).toBe(23600)
  })

  it('correctly handles 0% Exempt Credit/Debit Note', () => {
    const result = calculateNoteTaxBreakdown({
      amount: 5000,
      isTaxInclusive: true,
      gstRate: 0,
      partyStateCode: '19',
      companyStateCode: '19'
    })

    expect(result.taxableAmount).toBe(5000)
    expect(result.totalTaxAmount).toBe(0)
    expect(result.cgstAmount).toBe(0)
    expect(result.sgstAmount).toBe(0)
    expect(result.igstAmount).toBe(0)
    expect(result.totalAmount).toBe(5000)
  })
})

describe('calculateInvoiceTotals & Additional Charges Parity (Benchmark #RV1200012668)', () => {
  it('strictly computes exact statutory math for Benchmark Invoice #RV1200012668 with zero drift', () => {
    // Benchmark Invoice #RV1200012668
    // Item 1: 8MM (9.06 TON @ 58,628.80) = ₹5,31,176.89 (taxable), CGST 9% = ₹47,805.92, SGST 9% = ₹47,805.92
    // Item 2: 12MM (3.00 TON @ 57,188.49) = ₹1,71,565.48 (taxable), CGST 9% = ₹15,440.89, SGST 9% = ₹15,440.89
    // Additional Charge: Freight Charges (SAC 996511) = ₹1,200.00 (taxable) + 18% GST (CGST ₹108.00 + SGST ₹108.00) = ₹1,416.00
    // Taxable Base = ₹5,31,176.89 + ₹1,71,565.48 + ₹1,200.00 = ₹7,03,942.37
    // Total CGST = ₹47,805.92 + ₹15,440.89 + ₹108.00 = ₹63,354.81
    // Total SGST = ₹47,805.92 + ₹15,440.89 + ₹108.00 = ₹63,354.81
    // Round Off = ₹0.01
    // Final Total Amount = ₹8,30,652.00

    const freightCharge: AdditionalCharge = {
      id: 'chg-1',
      remarks: 'Freight Charges',
      sacCode: '996511',
      basicRate: 1200.00,
      taxableAmount: 1200.00,
      taxMode: 'gst',
      gstRate: 18,
      cgstAmount: 108.00,
      sgstAmount: 108.00,
      igstAmount: 0,
      finalAmt: 1416.00
    }

    const testInvoice: PurchaseInvoice = {
      id: 'inv-rv1200012668',
      supplierId: 'sup-captain-steel',
      invoiceNo: 'RV1200012668',
      invoiceDate: '2026-04-10',
      invoiceAmount: 830652.00,
      totalAmount: 830652.00,
      roundOff: 0.01,
      roundOffAdjustment: 0.01,
      additionalCharges: [freightCharge],
      items: [
        {
          itemId: 'item-8mm',
          enteredQuantity: 9.06,
          enteredUnit: 'TON',
          baseQuantity: 9060,
          basicRate: 58628.80,
          rate: 58628.80,
          amount: 531176.89,
          taxableAmount: 531176.89,
          gstRate: 18,
          cgstRate: 9,
          cgstAmount: 47805.92,
          sgstRate: 9,
          sgstAmount: 47805.92,
          igstRate: 0,
          igstAmount: 0
        },
        {
          itemId: 'item-12mm',
          enteredQuantity: 3.00,
          enteredUnit: 'TON',
          baseQuantity: 3000,
          basicRate: 57188.49,
          rate: 57188.49,
          amount: 171565.48,
          taxableAmount: 171565.48,
          gstRate: 18,
          cgstRate: 9,
          cgstAmount: 15440.89,
          sgstRate: 9,
          sgstAmount: 15440.89,
          igstRate: 0,
          igstAmount: 0
        }
      ],
      fy: '2026-2027'
    }

    const totals = calculateInvoiceTotals(testInvoice)

    expect(totals.taxableAmount).toBe(703942.37)
    expect(totals.cgstAmount).toBe(63354.81)
    expect(totals.sgstAmount).toBe(63354.81)
    expect(totals.igstAmount).toBe(0)
    expect(totals.roundOff).toBe(0.01)
    expect(totals.totalAmount).toBe(830652.00)

    // Table List View Totals Parity
    const listTotals = calculateInvoiceListTotals([testInvoice])
    expect(listTotals.totalAmount).toBe(830652.00)
    expect(formatCurrency(totals.totalAmount)).toBe('₹8,30,652.00')
  })

  it('self-heals legacy drifted invoiceAmount (e.g. ₹1,27,909.63) to canonical statutory total (₹8,30,652.00)', () => {
    // Simulating legacy record where invoiceAmount was stored with only the GST tax amount
    const legacyDriftedInvoice: PurchaseInvoice = {
      id: 'pur-legacy-drift',
      supplierId: 'sup-captain',
      invoiceNo: 'RV1200012668',
      invoiceDate: '2025-12-26',
      invoiceAmount: 127909.63, // Corrupted legacy stored amount
      totalAmount: 127909.63,
      additionalCharges: [
        {
          id: 'charge-1',
          remarks: 'Freight Charges',
          sacCode: '996511',
          taxMode: 'gst',
          basicRate: 1200.00,
          taxableAmount: 1200.00,
          gstRate: 18,
          cgstAmount: 108.00,
          sgstAmount: 108.00,
          igstAmount: 0,
          finalAmt: 1416.00
        }
      ],
      items: [
        {
          itemId: 'item-10mm',
          enteredQuantity: 9.06,
          enteredUnit: 'TON',
          baseQuantity: 9060,
          basicRate: 58628.80,
          rate: 69181.98,
          amount: 626788.73,
          taxableAmount: 531176.89,
          gstRate: 18,
          cgstRate: 9,
          cgstAmount: 47805.92,
          sgstRate: 9,
          sgstAmount: 47805.92,
          igstRate: 0,
          igstAmount: 0
        },
        {
          itemId: 'item-12mm',
          enteredQuantity: 3.00,
          enteredUnit: 'TON',
          baseQuantity: 3000,
          basicRate: 57188.49,
          rate: 67482.42,
          amount: 202447.26,
          taxableAmount: 171565.48,
          gstRate: 18,
          cgstRate: 9,
          cgstAmount: 15440.89,
          sgstRate: 9,
          sgstAmount: 15440.89,
          igstRate: 0,
          igstAmount: 0
        }
      ],
      roundOffAdjustment: 0.01,
      fy: '2025-2026'
    }

    const calculated = calculateInvoiceTotals(legacyDriftedInvoice)
    expect(calculated.totalAmount).toBe(830652.00)
    expect(calculated.taxableAmount).toBe(703942.37)
    expect(calculated.cgstAmount).toBe(63354.81)
    expect(calculated.sgstAmount).toBe(63354.81)
    expect(calculated.roundOff).toBe(0.01)

    const listTotals = calculateInvoiceListTotals([legacyDriftedInvoice])
    expect(listTotals.totalAmount).toBe(830652.00)
  })

  it('correctly calculates bidirectional rates (Inclusive <-> Exclusive) with zero drift', () => {
    const exclusiveRate = 58628.80
    const gstRate = 18

    // Exclusive -> Inclusive
    const inclusiveRate = calculateRateWithGst(exclusiveRate, gstRate)
    expect(inclusiveRate).toBe(69181.98)

    // Inclusive -> Exclusive
    const backToExclusive = calculateBasicRateFromInclusive(inclusiveRate, gstRate)
    expect(backToExclusive).toBe(58628.80)
  })

  it('correctly calculates mixed GST rates (5% and 18%) with invoice-level discount proportionally', () => {
    const result = calculateInvoiceTaxBreakdown({
      items: [
        {
          itemId: 'item-5',
          enteredQuantity: 10,
          basicRate: 1000, // ₹10,000 gross taxable at 5%
          gstRate: 5
        },
        {
          itemId: 'item-18',
          enteredQuantity: 10,
          basicRate: 1000, // ₹10,000 gross taxable at 18%
          gstRate: 18
        }
      ],
      discountsAmount: 2000, // Total discount ₹2,000 -> ₹1,000 on Item 1, ₹1,000 on Item 2
      partyState: '19',
      companyState: '19'
    })

    // Total gross was 20,000. Discount is 2,000. Net taxable is 18,000.
    expect(result.taxableAmount).toBe(18000)

    // Line 1: Net Taxable = 9,000 @ 5% -> CGST = 225, SGST = 225
    expect(result.lineBreakdowns[0].taxableAmount).toBe(9000)
    expect(result.lineBreakdowns[0].cgstAmount).toBe(225)
    expect(result.lineBreakdowns[0].sgstAmount).toBe(225)

    // Line 2: Net Taxable = 9,000 @ 18% -> CGST = 810, SGST = 810
    expect(result.lineBreakdowns[1].taxableAmount).toBe(9000)
    expect(result.lineBreakdowns[1].cgstAmount).toBe(810)
    expect(result.lineBreakdowns[1].sgstAmount).toBe(810)

    // Invoice Totals
    expect(result.cgstAmount).toBe(1035)
    expect(result.sgstAmount).toBe(1035)
    expect(result.totalTaxAmount).toBe(2070)
    expect(result.totalAmount).toBe(20070)
  })

  it('allocates payments FIFO accounting for SupplierDebitNotes reducing invoice balances', () => {
    const invoices: PurchaseInvoice[] = [
      {
        id: 'inv-1',
        invoiceNo: 'PUR-001',
        supplierId: 'supp-1',
        invoiceDate: '2026-04-01',
        invoiceAmount: 100000,
        fy: '2026-2027',
        createdAt: 1000
      }
    ]

    const debitNotes: SupplierDebitNote[] = [
      {
        id: 'dn-1',
        noteNo: 'DN-001',
        supplierId: 'supp-1',
        date: '2026-04-02',
        amount: 30000,
        invoiceRef: 'inv-1',
        fy: '2026-2027',
        createdAt: 2000
      }
    ]

    const payments: Payment[] = [
      {
        id: 'pay-1',
        supplierId: 'supp-1',
        paymentDate: '2026-04-03',
        amount: 70000,
        fy: '2026-2027',
        createdAt: 3000
      }
    ]

    const { allocations, paymentAdvanceInfo } = calculatePaymentAllocations(payments, invoices, debitNotes)

    // Original invoice ₹100,000 was reduced to ₹70,000 by Debit Note
    // Payment of ₹70,000 should allocate exactly ₹70,000 to inv-1 with 0 advance
    expect(allocations.length).toBe(1)
    expect(allocations[0].allocatedAmount).toBe(70000)
    expect(paymentAdvanceInfo.get('pay-1')?.advanceAmount).toBe(0)
  })
})
