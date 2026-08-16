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
  isInterStateTransaction
} from './calculations'
import { convertItemQuantity, getInvoiceQtyForUnit, isUnitCompatible } from './unit-conversion-service'
import { Payment, PurchaseInvoice, Supplier } from './types'

function invoice(overrides: Partial<PurchaseInvoice>): PurchaseInvoice {
  return {
    id: 'inv-1',
    supplierId: 'sup-1',
    invoiceNo: 'PI-001',
    invoiceDate: '2026-04-01',
    invoiceAmount: 1000,
    fy: 'FY2026-27',
    createdAt: new Date('2026-04-01T08:00:00Z').getTime(),
    items: [
      { itemId: 'item-1', enteredQuantity: 10, enteredUnit: 'MT', baseQuantity: 10000, rate: 100, amount: 1000 }
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
})
