import { Item, ExpenseCategory } from './types'
import { getMetadata } from './storage-utils'

export const DEFAULT_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  {
    id: 'exp-cat-freight',
    name: 'Freight & Transportation (Inward)',
    costLinkingType: 'invoice_landed',
    linkType: 'invoice',
    isGstApplicable: true,
    defaultSacCode: '9965',
    defaultGstRate: 5,
    isRcmDefault: true,
    itcClassification: 'Input Services'
  },
  {
    id: 'exp-cat-loading',
    name: 'Loading & Unloading Charges',
    costLinkingType: 'invoice_landed',
    linkType: 'invoice',
    isGstApplicable: true,
    defaultSacCode: '9967',
    defaultGstRate: 18,
    isRcmDefault: false,
    itcClassification: 'Input Services'
  },
  {
    id: 'exp-cat-rent',
    name: 'Office & Godown Rent',
    costLinkingType: 'net_profit',
    linkType: 'netprofit',
    isGstApplicable: true,
    defaultSacCode: '9972',
    defaultGstRate: 18,
    isRcmDefault: false,
    itcClassification: 'Input Services'
  },
  {
    id: 'exp-cat-repairs',
    name: 'Repairs & Machinery Maintenance',
    costLinkingType: 'net_profit',
    linkType: 'netprofit',
    isGstApplicable: true,
    defaultSacCode: '9987',
    defaultGstRate: 18,
    isRcmDefault: false,
    itcClassification: 'Input Services'
  },
  {
    id: 'exp-cat-legal',
    name: 'Legal & Professional Charges',
    costLinkingType: 'net_profit',
    linkType: 'netprofit',
    isGstApplicable: true,
    defaultSacCode: '9983',
    defaultGstRate: 18,
    isRcmDefault: false,
    itcClassification: 'Input Services'
  },
  {
    id: 'exp-cat-electricity',
    name: 'Electricity & Utilities',
    costLinkingType: 'net_profit',
    linkType: 'netprofit',
    isGstApplicable: false,
    defaultSacCode: '9969',
    defaultGstRate: 0,
    isRcmDefault: false,
    itcClassification: 'Ineligible'
  },
  {
    id: 'exp-cat-tea',
    name: 'Tea, Snacks & Staff Welfare',
    costLinkingType: 'net_profit',
    linkType: 'netprofit',
    isGstApplicable: false,
    defaultGstRate: 0,
    isRcmDefault: false,
    itcClassification: 'Ineligible'
  },
  {
    id: 'exp-cat-petty',
    name: 'General Petty Cash Expenses',
    costLinkingType: 'net_profit',
    linkType: 'netprofit',
    isGstApplicable: false,
    defaultGstRate: 0,
    isRcmDefault: false,
    itcClassification: 'Ineligible'
  }
]

export const DEFAULT_CATEGORIES: string[] = [
  'PIPE',
  'TMT BARS',
  'STEEL & STRUCTURE',
  'SHEETS & PLATES',
  'BEAMS & CHANNELS',
  'ANGLES & FLATS',
  'FASTENERS & HARDWARE',
  'CEMENT & CONCRETE',
  'GENERAL TRADING'
]

export const DEFAULT_UNITS: { value: string; label: string }[] = [
  { value: 'MT', label: 'Metric Tonne (MT)' },
  { value: 'KG', label: 'Kilogram (KG)' },
  { value: 'PCS', label: 'Pieces (PCS)' },
  { value: 'BOX', label: 'Box (BOX)' },
  { value: 'PKT', label: 'Packet (PKT)' },
  { value: 'BTL', label: 'Bottle (BTL)' },
  { value: 'JAR', label: 'Jar (JAR)' },
  { value: 'TIN', label: 'Tin (TIN)' },
  { value: 'BAG', label: 'Bag (BAG)' },
  { value: 'CARTON', label: 'Carton (CARTON)' },
  { value: 'MTR', label: 'Meter (MTR)' },
  { value: 'FT', label: 'Feet (FT)' },
  { value: 'SET', label: 'Set (SET)' },
  { value: 'QTL', label: 'Quintal (QTL)' },
  { value: 'BUNDLE', label: 'Bundle (BUNDLE)' },
  { value: 'NOS', label: 'Numbers (NOS)' }
]

function getActiveCompanyId(): string {
  try {
    const meta = getMetadata()
    if (meta && meta.activeCompanyId) {
      return meta.activeCompanyId
    }
    if (meta && meta.businesses && meta.businesses.length > 0) {
      return meta.businesses[0].id
    }
    return 'default'
  } catch (e) {
    return 'default'
  }
}

function getCategoryStorageKey(companyId?: string): string {
  const cid = companyId || getActiveCompanyId()
  return `custom_item_categories_${cid}`
}

function getUnitStorageKey(companyId?: string): string {
  const cid = companyId || getActiveCompanyId()
  return `custom_item_units_${cid}`
}

function getDeletedCategoryKey(companyId?: string): string {
  const cid = companyId || getActiveCompanyId()
  return `deleted_item_categories_${cid}`
}

function getDeletedUnitKey(companyId?: string): string {
  const cid = companyId || getActiveCompanyId()
  return `deleted_item_units_${cid}`
}

export function getCustomCategories(companyId?: string): string[] {
  let categories = [...DEFAULT_CATEGORIES]
  try {
    const key = getCategoryStorageKey(companyId)
    const delKey = getDeletedCategoryKey(companyId)
    const saved = localStorage.getItem(key)
    const deletedRaw = localStorage.getItem(delKey)
    const deletedSet = new Set<string>(deletedRaw ? JSON.parse(deletedRaw) : [])

    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) {
        const customCats = parsed.map(c => String(c).trim()).filter(Boolean)
        categories = Array.from(new Set([...categories, ...customCats]))
      }
    }
    categories = categories.filter(c => c && !deletedSet.has(c.toUpperCase()))
  } catch (e) {
    console.error('Failed to load categories', e)
  }
  return categories
}

export function saveCustomCategory(category: string, companyId?: string): string[] {
  const clean = category.trim()
  if (!clean) return getCustomCategories(companyId)

  const key = getCategoryStorageKey(companyId)
  const delKey = getDeletedCategoryKey(companyId)
  let storedCustom: string[] = []
  try {
    const saved = localStorage.getItem(key)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) storedCustom = parsed
    }
    const deletedRaw = localStorage.getItem(delKey)
    if (deletedRaw) {
      const deletedList: string[] = JSON.parse(deletedRaw)
      const updatedDeleted = deletedList.filter(c => c !== clean.toUpperCase())
      localStorage.setItem(delKey, JSON.stringify(updatedDeleted))
    }
  } catch (e) {}

  if (!storedCustom.includes(clean)) {
    const updated = [...storedCustom, clean]
    localStorage.setItem(key, JSON.stringify(updated))
  }
  window.dispatchEvent(new Event('custom-categories-updated'))
  return getCustomCategories(companyId)
}

export function updateCustomCategory(oldName: string, newName: string, companyId?: string): string[] {
  const clean = newName.trim()
  if (!clean || clean === oldName) return getCustomCategories(companyId)

  const key = getCategoryStorageKey(companyId)
  const delKey = getDeletedCategoryKey(companyId)
  let storedCustom: string[] = []
  try {
    const saved = localStorage.getItem(key)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) storedCustom = parsed
    }
    const deletedRaw = localStorage.getItem(delKey)
    if (deletedRaw) {
      const deletedList: string[] = JSON.parse(deletedRaw)
      const updatedDeleted = deletedList.filter(c => c !== clean.toUpperCase())
      localStorage.setItem(delKey, JSON.stringify(updatedDeleted))
    }
  } catch (e) {}

  const updated = storedCustom.map(cat => cat === oldName ? clean : cat)
  localStorage.setItem(key, JSON.stringify(updated))
  window.dispatchEvent(new Event('custom-categories-updated'))
  return getCustomCategories(companyId)
}

export function deleteCustomCategory(name: string, companyId?: string): string[] {
  const clean = name.trim()
  const key = getCategoryStorageKey(companyId)
  const delKey = getDeletedCategoryKey(companyId)

  let storedCustom: string[] = []
  try {
    const saved = localStorage.getItem(key)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) storedCustom = parsed
    }
    const updatedCustom = storedCustom.filter(cat => cat.toUpperCase() !== clean.toUpperCase())
    localStorage.setItem(key, JSON.stringify(updatedCustom))

    const deletedRaw = localStorage.getItem(delKey)
    const deletedList: string[] = deletedRaw ? JSON.parse(deletedRaw) : []
    if (!deletedList.includes(clean.toUpperCase())) {
      deletedList.push(clean.toUpperCase())
      localStorage.setItem(delKey, JSON.stringify(deletedList))
    }

    window.dispatchEvent(new Event('custom-categories-updated'))
  } catch (e) {}

  return getCustomCategories(companyId)
}

export function getCustomUnits(companyId?: string): { value: string; label: string }[] {
  let units = [...DEFAULT_UNITS]
  try {
    const key = getUnitStorageKey(companyId)
    const delKey = getDeletedUnitKey(companyId)
    const saved = localStorage.getItem(key)
    const deletedRaw = localStorage.getItem(delKey)
    const deletedSet = new Set<string>(deletedRaw ? JSON.parse(deletedRaw) : [])

    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) {
        const customUnitsList: { value: string; label: string }[] = parsed
        for (const u of customUnitsList) {
          if (u && u.value && !units.some(existing => existing.value === u.value)) {
            units.push(u)
          }
        }
      }
    }
    units = units.filter(u => u && u.value && !deletedSet.has(u.value.toUpperCase()))
  } catch (e) {
    console.error('Failed to load units', e)
  }
  return units
}

export function saveCustomUnit(unitCode: string, unitLabel?: string, companyId?: string): { value: string; label: string }[] {
  const code = unitCode.trim().toUpperCase()
  const label = unitLabel?.trim() || code
  if (!code) return getCustomUnits(companyId)

  const key = getUnitStorageKey(companyId)
  const delKey = getDeletedUnitKey(companyId)
  let storedCustom: { value: string; label: string }[] = []
  try {
    const saved = localStorage.getItem(key)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) storedCustom = parsed
    }
    const deletedRaw = localStorage.getItem(delKey)
    if (deletedRaw) {
      const deletedList: string[] = JSON.parse(deletedRaw)
      const updatedDeleted = deletedList.filter(c => c !== code)
      localStorage.setItem(delKey, JSON.stringify(updatedDeleted))
    }
  } catch (e) {}

  if (!storedCustom.some(u => u.value === code)) {
    const newUnit = { value: code, label: `${label} (${code})` }
    const updated = [...storedCustom, newUnit]
    localStorage.setItem(key, JSON.stringify(updated))
  }
  window.dispatchEvent(new Event('custom-units-updated'))
  return getCustomUnits(companyId)
}

export function updateCustomUnit(oldCode: string, newCode: string, newLabel?: string, companyId?: string): { value: string; label: string }[] {
  const code = newCode.trim().toUpperCase()
  const label = newLabel?.trim() || code
  if (!code) return getCustomUnits(companyId)

  const key = getUnitStorageKey(companyId)
  const delKey = getDeletedUnitKey(companyId)
  let storedCustom: { value: string; label: string }[] = []
  try {
    const saved = localStorage.getItem(key)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) storedCustom = parsed
    }
    const deletedRaw = localStorage.getItem(delKey)
    if (deletedRaw) {
      const deletedList: string[] = JSON.parse(deletedRaw)
      const updatedDeleted = deletedList.filter(c => c !== code)
      localStorage.setItem(delKey, JSON.stringify(updatedDeleted))
    }
  } catch (e) {}

  const updated = storedCustom.map(u => u.value === oldCode ? { value: code, label: `${label} (${code})` } : u)
  localStorage.setItem(key, JSON.stringify(updated))
  window.dispatchEvent(new Event('custom-units-updated'))
  return getCustomUnits(companyId)
}

export function deleteCustomUnit(code: string, companyId?: string): { value: string; label: string }[] {
  const targetCode = code.trim().toUpperCase()
  const key = getUnitStorageKey(companyId)
  const delKey = getDeletedUnitKey(companyId)

  let storedCustom: { value: string; label: string }[] = []
  try {
    const saved = localStorage.getItem(key)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) storedCustom = parsed
    }
    const updatedCustom = storedCustom.filter(u => u.value.toUpperCase() !== targetCode)
    localStorage.setItem(key, JSON.stringify(updatedCustom))

    const deletedRaw = localStorage.getItem(delKey)
    const deletedList: string[] = deletedRaw ? JSON.parse(deletedRaw) : []
    if (!deletedList.includes(targetCode)) {
      deletedList.push(targetCode)
      localStorage.setItem(delKey, JSON.stringify(deletedList))
    }

    window.dispatchEvent(new Event('custom-units-updated'))
  } catch (e) {}

  return getCustomUnits(companyId)
}

export function getAvailableUnits(items?: Item[], companyId?: string): { value: string; label: string }[] {
  const customUnits = getCustomUnits(companyId)
  const unitMap = new Map<string, string>()

  customUnits.forEach(u => {
    if (u && u.value) {
      const val = u.value.trim().toUpperCase()
      unitMap.set(val, u.label || val)
    }
  })

  if (items && Array.isArray(items)) {
    items.forEach(i => {
      if (i.unit && i.unit.trim()) {
        const u = i.unit.trim().toUpperCase()
        if (!unitMap.has(u)) unitMap.set(u, u)
      }
      if (i.alternativeUnit && i.alternativeUnit !== 'NONE' && i.alternativeUnit.trim()) {
        const u = i.alternativeUnit.trim().toUpperCase()
        if (!unitMap.has(u)) unitMap.set(u, u)
      }
    })
  }

  if (unitMap.size === 0) {
    unitMap.set('MT', 'Metric Tonne (MT)')
  }

  return Array.from(unitMap.entries()).map(([code, label]) => ({
    value: code,
    label: label
  }))
}
