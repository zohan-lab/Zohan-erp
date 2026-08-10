import { Item } from './types'

/**
 * CENTRALIZED UNIT CONVERSION SERVICE
 * ====================================
 * Single source of truth for all unit conversion logic across the ERP.
 * Enforces Strict Base Unit Normalization Architecture.
 * 
 * Rules:
 * 1. Primary (Base) Unit is the single source of truth.
 * 2. Database stores quantities and rates in the Primary Unit only.
 * 3. Base Quantity = Entered Quantity * Conversion Factor (for alternate units).
 * 4. Base Rate = Entered Rate / Conversion Factor (for alternate units).
 * 5. Base Amount = Base Quantity * Base Rate.
 */

export interface NormalizedLineItem {
  enteredQuantity: number
  enteredUnit: string
  enteredRate: number
  baseQuantity: number
  baseRate: number
  baseAmount: number
  primaryUnit: string
  conversionFactor: number
}

/**
 * Resolves conversion factor for an item and a target unit relative to item.unit (Primary Unit).
 */
export function getItemConversionFactor(item?: Item | null, targetUnit?: string): number {
  if (!item) return 1
  const primaryUnit = (item.unit || 'KG').toUpperCase()
  const currentTarget = (targetUnit || primaryUnit).toUpperCase()

  if (primaryUnit === currentTarget) return 1

  const altUnit = (item.alternativeUnit || '').toUpperCase()

  // Standard MT <-> KG handling with fallback
  if ((primaryUnit === 'KG' && (currentTarget === 'MT' || altUnit === 'MT')) ||
      (primaryUnit === 'MT' && (currentTarget === 'KG' || altUnit === 'KG'))) {
    if (item.conversionFactor && item.conversionFactor > 1) {
      return item.conversionFactor
    }
    return 1000
  }

  if (item.conversionFactor && item.conversionFactor > 0) {
    return item.conversionFactor
  }

  return 1
}

/**
 * Normalizes entered quantity into Primary (Base) Unit Quantity.
 */
export function toBaseQuantity(item?: Item | null, quantity: number = 0, unit?: string): number {
  if (!quantity || quantity <= 0) return 0
  if (!item) return quantity

  const primaryUnit = (item.unit || 'KG').toUpperCase()
  const enteredUnit = (unit || primaryUnit).toUpperCase()

  if (primaryUnit === enteredUnit) return quantity

  const factor = getItemConversionFactor(item, enteredUnit)
  return quantity * factor
}

/**
 * Normalizes entered rate into Primary (Base) Unit Rate.
 * Formula: Base Rate = Entered Rate / Conversion Factor
 */
export function toBaseRate(item?: Item | null, rate: number = 0, unit?: string): number {
  if (!rate || rate <= 0) return 0
  if (!item) return rate

  const primaryUnit = (item.unit || 'KG').toUpperCase()
  const enteredUnit = (unit || primaryUnit).toUpperCase()

  if (primaryUnit === enteredUnit) return rate

  const factor = getItemConversionFactor(item, enteredUnit)
  return factor > 0 ? rate / factor : rate
}

/**
 * Computes Base Amount from Base Quantity and Base Rate.
 */
export function toBaseAmount(baseQuantity: number, baseRate: number): number {
  return (baseQuantity || 0) * (baseRate || 0)
}

/**
 * Converts Base Quantity back to an Alternate/Display Unit for UI presentation.
 */
export function fromBaseQuantity(item?: Item | null, baseQuantity: number = 0, targetUnit?: string): number {
  if (!baseQuantity || baseQuantity <= 0) return 0
  if (!item) return baseQuantity

  const primaryUnit = (item.unit || 'KG').toUpperCase()
  const displayUnit = (targetUnit || primaryUnit).toUpperCase()

  if (primaryUnit === displayUnit) return baseQuantity

  const factor = getItemConversionFactor(item, displayUnit)
  return factor > 0 ? baseQuantity / factor : baseQuantity
}

/**
 * Converts Base Rate back to an Alternate/Display Unit Rate for UI presentation.
 */
export function fromBaseRate(item?: Item | null, baseRate: number = 0, targetUnit?: string): number {
  if (!baseRate || baseRate <= 0) return 0
  if (!item) return baseRate

  const primaryUnit = (item.unit || 'KG').toUpperCase()
  const displayUnit = (targetUnit || primaryUnit).toUpperCase()

  if (primaryUnit === displayUnit) return baseRate

  const factor = getItemConversionFactor(item, displayUnit)
  return baseRate * factor
}

/**
 * Fully normalizes an invoice line item input into Base Quantity, Base Rate, and Base Amount.
 */
export function normalizeLineItem(
  itemDef: Item | undefined | null,
  enteredQuantity: number,
  enteredUnit: string,
  enteredRate: number
): NormalizedLineItem {
  const primaryUnit = itemDef?.unit || 'KG'
  const baseQuantity = toBaseQuantity(itemDef, enteredQuantity, enteredUnit)
  const baseRate = toBaseRate(itemDef, enteredRate, enteredUnit)
  const baseAmount = toBaseAmount(baseQuantity, baseRate)
  const conversionFactor = getItemConversionFactor(itemDef, enteredUnit)

  return {
    enteredQuantity,
    enteredUnit,
    enteredRate,
    baseQuantity,
    baseRate,
    baseAmount,
    primaryUnit,
    conversionFactor
  }
}

/**
 * Helper to identify container (larger) vs piece (smaller) units.
 */
function isPieceUnit(unit?: string): boolean {
  if (!unit) return false
  const u = unit.toUpperCase()
  return u === 'BTL' || u === 'PCS' || u === 'NOS' || u === 'UNIT' || u === 'ITEM' || u === 'KG' || u === 'GM'
}

function isContainerUnit(unit?: string): boolean {
  if (!unit) return false
  const u = unit.toUpperCase()
  return u === 'BUNDLE' || u === 'BOX' || u === 'PKT' || u === 'CARTON' || u === 'BAG' || u === 'MT' || u === 'QTL' || u === 'PALLET' || u === 'CONTAINER'
}

/**
 * Evaluates whether a source unit can be converted to a target unit for a given item definition.
 * Enforces strict unit compatibility validation across fixed schemes and discount engines.
 */
export function isUnitCompatible(
  item: Item | null | undefined,
  fromUnit?: string,
  toUnit?: string
): boolean {
  if (!toUnit || toUnit.trim() === '' || toUnit.toUpperCase() === 'ALL' || toUnit.toUpperCase() === 'ANY') {
    return true
  }

  const srcUnit = (fromUnit || item?.unit || '').toUpperCase()
  const tgtUnit = toUnit.toUpperCase()

  if (!srcUnit) return false
  if (srcUnit === tgtUnit) return true

  // Standard MT <-> KG compatibility
  if ((srcUnit === 'MT' || srcUnit === 'KG') && (tgtUnit === 'MT' || tgtUnit === 'KG')) {
    return true
  }

  if (item) {
    const primUnit = (item.unit || '').toUpperCase()
    const altUnit = (item.alternativeUnit || '').toUpperCase()

    // Check if target matches primary or alternate unit of item
    const targetMatches = (tgtUnit === primUnit) || (altUnit !== '' && altUnit !== 'NONE' && tgtUnit === altUnit)
    const sourceMatches = (srcUnit === primUnit) || (altUnit !== '' && altUnit !== 'NONE' && srcUnit === altUnit) ||
      ((srcUnit === 'MT' || srcUnit === 'KG') && (primUnit === 'MT' || primUnit === 'KG' || altUnit === 'MT' || altUnit === 'KG'))

    if (targetMatches && sourceMatches) {
      return true
    }
  }

  return false
}

/**
 * Converts quantity of an item from a source unit to a target unit using item's conversion factor.
 * Returns 0 if units are incompatible.
 */
export function convertItemQuantity(
  item: Item | null | undefined,
  quantity: number = 0,
  fromUnit?: string,
  toUnit?: string
): number {
  if (!quantity || quantity <= 0) return 0

  // STRICT UNIT COMPATIBILITY CHECK: Zero eligibility on complete unit mismatch
  if (!isUnitCompatible(item, fromUnit, toUnit)) {
    return 0
  }

  const srcUnit = (fromUnit || item?.unit || 'KG').toUpperCase()
  const tgtUnit = (toUnit || item?.unit || 'KG').toUpperCase()

  if (srcUnit === tgtUnit) return quantity

  // Standard MT <-> KG handling
  if (srcUnit === 'MT' && tgtUnit === 'KG') {
    const factor = (item?.conversionFactor && item.conversionFactor > 1) ? item.conversionFactor : 1000
    return quantity * factor
  }
  if (srcUnit === 'KG' && tgtUnit === 'MT') {
    const factor = (item?.conversionFactor && item.conversionFactor > 1) ? item.conversionFactor : 1000
    return factor > 0 ? quantity / factor : quantity
  }

  if (!item) return quantity

  const primUnit = (item.unit || 'KG').toUpperCase()
  const altUnit = (item.alternativeUnit || '').toUpperCase()
  const factor = item.conversionFactor && item.conversionFactor > 0 ? item.conversionFactor : 1

  if (factor === 1 && srcUnit !== tgtUnit) {
    return quantity
  }

  if ((srcUnit === primUnit && tgtUnit === altUnit) || (srcUnit === altUnit && tgtUnit === primUnit)) {
    if (isContainerUnit(primUnit) && isPieceUnit(altUnit)) {
      if (srcUnit === primUnit && tgtUnit === altUnit) return quantity * factor
      if (srcUnit === altUnit && tgtUnit === primUnit) return factor > 0 ? quantity / factor : quantity
    } else {
      if (srcUnit === altUnit && tgtUnit === primUnit) return quantity * factor
      if (srcUnit === primUnit && tgtUnit === altUnit) return factor > 0 ? quantity / factor : quantity
    }
  }

  const baseQty = toBaseQuantity(item, quantity, srcUnit)
  return fromBaseQuantity(item, baseQty, tgtUnit)
}

/**
 * Calculates total quantity of a Purchase Invoice converted into the target unit (e.g. 'MT' or 'KG' or 'BTL' or 'PCS').
 * Uses Base Quantity normalization as single source of truth so purchases in KG, MT, BAG, BOX earn correct scheme discounts.
 * Incompatible line items return 0 quantity for that target unit.
 */
export function getInvoiceQtyForUnit(
  inv: { items?: any[] },
  targetUnit: string = 'MT',
  itemMap?: Map<string, Item> | Item[]
): number {
  const target = (targetUnit || 'MT').toUpperCase()
  const map = itemMap instanceof Map
    ? itemMap
    : (Array.isArray(itemMap) ? new Map(itemMap.map(i => [i.id, i])) : undefined)

  if (inv.items && Array.isArray(inv.items) && inv.items.length > 0) {
    let totalQty = 0
    inv.items.forEach(invItem => {
      const itemDef = map?.get(invItem.itemId)
      const primaryUnit = (itemDef?.unit || 'KG').toUpperCase()
      const enteredUnit = (invItem.enteredUnit || primaryUnit).toUpperCase()
      const rawQty = invItem.enteredQuantity || invItem.baseQuantity || 0

      totalQty += convertItemQuantity(itemDef, rawQty, enteredUnit, target)
    })
    return totalQty
  }

  return 0
}
