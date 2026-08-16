import {
  SalesInvoice,
  PurchaseInvoice,
  CustomerCreditNote,
  SupplierDebitNote,
  Payment,
  CustomerPayment,
  ExpenseEntry,
  Customer,
  Supplier,
  Item,
  ExpenseType,
  InvoiceItem
} from './types'
import { Counter } from './cash-bank-types'
import { roundCurrency } from './calculations'

export interface TallyXmlLedgerLeg {
  ledgerName: string
  amount: number
  drCr: 'Dr' | 'Cr'
  isDeemedPositive: boolean
}

export interface TallyXmlInventoryItem {
  itemName: string
  quantity: number
  unit?: string
  rate: number
  amount: number
}

export interface TallyParsedXmlVoucher {
  id: string
  voucherNumber: string
  voucherDate: string // YYYY-MM-DD
  displayDate: string // DD-MM-YYYY
  rawVoucherType: string
  normalizedType: 'sales' | 'purchase' | 'receipt' | 'payment' | 'expense' | 'contra' | 'credit_note' | 'debit_note' | 'skipped'
  partyName: string
  partyGstin?: string
  narration?: string
  legs: TallyXmlLedgerLeg[]
  inventory: TallyXmlInventoryItem[]
  drTotal: number
  crTotal: number
  totalAmount: number
  isBalanced: boolean
  imbalanceDifference: number
  matchedEntityId?: string
  matchedEntityType?: 'customer' | 'supplier' | 'expense' | 'counter' | 'unmapped'
  contraDetails?: {
    fromCounterName: string
    toCounterName: string
    fromCounterId?: string
    toCounterId?: string
    amount: number
  }
  expenseDetails?: {
    categoryId?: string
    categoryName: string
    amount: number
    paymentAccountId?: string
    paymentAccountName?: string
  }
  skipReason?: string
}

export interface TallyXmlImportResult {
  success: boolean
  vouchers: TallyParsedXmlVoucher[]
  summary: {
    totalParsed: number
    salesCount: number
    purchaseCount: number
    receiptCount: number
    paymentCount: number
    expenseCount: number
    contraCount: number
    creditNoteCount: number
    debitNoteCount: number
    skippedCount: number
    matchedCount: number
    unmappedCount: number
  }
  errors: string[]
  warnings: string[]
}

/**
 * Safely decodes raw file buffer supporting UTF-16LE (with or without BOM), UTF-16BE, and UTF-8.
 */
export function decodeXmlFileBuffer(buffer: ArrayBuffer | Uint8Array): string {
  const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  if (uint8.length >= 2 && uint8[0] === 0xFF && uint8[1] === 0xFE) {
    return new TextDecoder('utf-16le').decode(uint8)
  }
  if (uint8.length >= 2 && uint8[0] === 0xFE && uint8[1] === 0xFF) {
    return new TextDecoder('utf-16be').decode(uint8)
  }
  if (uint8.length >= 4 && uint8[1] === 0x00 && uint8[3] === 0x00) {
    return new TextDecoder('utf-16le').decode(uint8)
  }
  return new TextDecoder('utf-8').decode(uint8)
}

/**
 * Sanitizes XML text by removing invalid ASCII control characters and numeric character references.
 */
export function sanitizeTallyXmlString(rawText: string): string {
  if (!rawText) return ''
  return rawText
    .replace(/&#(0?[0-8]|1[1-2]|1[4-9]|2[0-9]|3[0-1]);/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
}

/**
 * Parses raw Tally XML date into normalized ISO date (YYYY-MM-DD) and display date (DD-MM-YYYY).
 * Handles 'YYYYMMDD' (e.g. 20260410), 'YYYY-MM-DD', 'DD-MM-YYYY', and 'DD-MMM-YYYY'.
 */
export function parseTallyXmlDate(dateStr?: string): { iso: string; dmy: string } {
  if (!dateStr) {
    const today = new Date().toISOString().slice(0, 10)
    const [y, m, d] = today.split('-')
    return { iso: today, dmy: `${d}-${m}-${y}` }
  }

  const clean = dateStr.trim()
  
  // Format: YYYYMMDD (e.g. 20260410)
  if (/^\d{8}$/.test(clean)) {
    const y = clean.slice(0, 4)
    const m = clean.slice(4, 6)
    const d = clean.slice(6, 8)
    return { iso: `${y}-${m}-${d}`, dmy: `${d}-${m}-${y}` }
  }

  // Format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const [y, m, d] = clean.split('-')
    return { iso: clean, dmy: `${d}-${m}-${y}` }
  }

  // Format: DD-MM-YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(clean)) {
    const [d, m, y] = clean.split('-')
    return { iso: `${y}-${m}-${d}`, dmy: clean }
  }

  const parsed = new Date(clean)
  if (!isNaN(parsed.getTime())) {
    const iso = parsed.toISOString().slice(0, 10)
    const [y, m, d] = iso.split('-')
    return { iso, dmy: `${d}-${m}-${y}` }
  }

  const iso = clean.slice(0, 10)
  return { iso, dmy: iso }
}

/**
 * Normalizes Tally voucher type string into canonical ERP module types.
 */
export function normalizeTallyVoucherType(vchType: string): TallyParsedXmlVoucher['normalizedType'] {
  const t = (vchType || '').trim().toLowerCase()
  if (t === 'sales' || t.includes('sale') || t.includes('tax invoice') || t.includes('pos invoice')) return 'sales'
  if (t === 'purchase' || t.includes('purchase') || t.includes('raw material') || t.includes('inward')) return 'purchase'
  if (t === 'receipt' || t.includes('receipt') || t.includes('customer receipt')) return 'receipt'
  if (t === 'contra' || t.includes('contra') || t.includes('bank transfer') || t.includes('fund transfer')) return 'contra'
  if (t === 'payment' || t.includes('payment') || t.includes('supplier payment') || t.includes('bank payment') || t.includes('cash payment') || t.includes('expense')) return 'payment'
  if (t === 'credit note' || t.includes('credit note') || t.includes('creditnote')) return 'credit_note'
  if (t === 'debit note' || t.includes('debit note') || t.includes('debitnote')) return 'debit_note'
  return 'skipped'
}

function extractXmlTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const match = xml.match(regex)
  return match ? match[1].trim() : ''
}

function extractAllXmlBlocks(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi')
  const matches: string[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(xml)) !== null) {
    matches.push(match[0])
  }
  return matches
}

interface RawXmlVoucherData {
  rawVoucherType: string
  rawDate: string
  voucherNumber: string
  partyName: string
  partyGstin: string
  narration: string
  rawLedgers: { name: string; amount: number; isDeemedPositive: boolean }[]
  rawInventory: { name: string; qty: number; unit?: string; rate: number; amount: number }[]
}

function parseVouchersWithDom(doc: Document): RawXmlVoucherData[] {
  const list: RawXmlVoucherData[] = []
  const voucherElements = Array.from(doc.getElementsByTagName('VOUCHER'))

  voucherElements.forEach((vch, idx) => {
    const rawVoucherType = vch.getAttribute('VCHTYPE') || 
      (vch.getElementsByTagName('VOUCHERTYPENAME')[0]?.textContent || '').trim() || 
      (vch.getElementsByTagName('VCHTYPE')[0]?.textContent || '').trim() || 'Journal'

    const rawDate = (vch.getElementsByTagName('DATE')[0]?.textContent || 
      vch.getElementsByTagName('VOUCHERDATE')[0]?.textContent || '').trim()

    const voucherNumber = (vch.getElementsByTagName('VOUCHERNUMBER')[0]?.textContent || 
      vch.getElementsByTagName('REFERENCE')[0]?.textContent || `VCH-${idx + 1}`).trim()

    const partyName = (vch.getElementsByTagName('PARTYLEDGERNAME')[0]?.textContent || 
      vch.getElementsByTagName('PARTYNAME')[0]?.textContent || 
      vch.getElementsByTagName('BASICBUYERNAME')[0]?.textContent || '').trim()

    const partyGstin = (vch.getElementsByTagName('PARTYGSTIN')[0]?.textContent || 
      vch.getElementsByTagName('GSTIN')[0]?.textContent || '').trim()

    const narration = (vch.getElementsByTagName('NARRATION')[0]?.textContent || '').trim()

    const ledgerNodes = [
      ...Array.from(vch.getElementsByTagName('ALLLEDGERENTRIES.LIST')),
      ...Array.from(vch.getElementsByTagName('LEDGERENTRIES.LIST'))
    ]

    const rawLedgers = ledgerNodes.map(entry => {
      const name = (entry.getElementsByTagName('LEDGERNAME')[0]?.textContent || 'General Ledger').trim()
      const amt = parseFloat((entry.getElementsByTagName('AMOUNT')[0]?.textContent || '0').trim()) || 0
      const isDeemedPositiveStr = (entry.getElementsByTagName('ISDEEMEDPOSITIVE')[0]?.textContent || '').trim().toLowerCase()
      const isDeemedPositive = isDeemedPositiveStr === 'yes' || amt < 0
      return { name, amount: amt, isDeemedPositive }
    })

    const invNodes = [
      ...Array.from(vch.getElementsByTagName('ALLINVENTORYENTRIES.LIST')),
      ...Array.from(vch.getElementsByTagName('INVENTORYENTRIES.LIST'))
    ]

    const rawInventory = invNodes.map(invEntry => {
      const name = (invEntry.getElementsByTagName('STOCKITEMNAME')[0]?.textContent || 'Item').trim()
      const rawRate = (invEntry.getElementsByTagName('RATE')[0]?.textContent || '').trim()
      const rate = parseFloat(rawRate.replace(/[^0-9.]/g, '')) || 0
      const rawQty = (invEntry.getElementsByTagName('ACTUALQTY')[0]?.textContent || 
        invEntry.getElementsByTagName('BILLEDQTY')[0]?.textContent || '1').trim()
      const qty = parseFloat(rawQty.replace(/[^0-9.]/g, '')) || 1
      const unit = rawQty.replace(/[0-9.\s]/g, '') || 'KG'
      const amt = parseFloat((invEntry.getElementsByTagName('AMOUNT')[0]?.textContent || '0').trim()) || 0
      return { name, qty, unit, rate, amount: amt }
    })

    list.push({
      rawVoucherType,
      rawDate,
      voucherNumber,
      partyName,
      partyGstin,
      narration,
      rawLedgers,
      rawInventory
    })
  })

  return list
}

function parseVouchersWithRegex(xmlContent: string): RawXmlVoucherData[] {
  const list: RawXmlVoucherData[] = []
  const voucherBlocks = extractAllXmlBlocks(xmlContent, 'VOUCHER')

  voucherBlocks.forEach((block, idx) => {
    // Check VCHTYPE attribute or child tags
    const typeMatch = block.match(/VCHTYPE="([^"]+)"/i)
    const rawVoucherType = typeMatch ? typeMatch[1] : (extractXmlTag(block, 'VOUCHERTYPENAME') || extractXmlTag(block, 'VCHTYPE') || 'Journal')
    const rawDate = extractXmlTag(block, 'DATE') || extractXmlTag(block, 'VOUCHERDATE')
    const voucherNumber = extractXmlTag(block, 'VOUCHERNUMBER') || extractXmlTag(block, 'REFERENCE') || `VCH-${idx + 1}`
    const partyName = extractXmlTag(block, 'PARTYLEDGERNAME') || extractXmlTag(block, 'PARTYNAME') || extractXmlTag(block, 'BASICBUYERNAME')
    const partyGstin = extractXmlTag(block, 'PARTYGSTIN') || extractXmlTag(block, 'GSTIN')
    const narration = extractXmlTag(block, 'NARRATION')

    const ledgerBlocks = [
      ...extractAllXmlBlocks(block, 'ALLLEDGERENTRIES.LIST'),
      ...extractAllXmlBlocks(block, 'LEDGERENTRIES.LIST')
    ]

    const rawLedgers = ledgerBlocks.map(lBlock => {
      const name = extractXmlTag(lBlock, 'LEDGERNAME') || 'General Ledger'
      const amt = parseFloat(extractXmlTag(lBlock, 'AMOUNT') || '0') || 0
      const isDeemedPositiveStr = extractXmlTag(lBlock, 'ISDEEMEDPOSITIVE').toLowerCase()
      const isDeemedPositive = isDeemedPositiveStr === 'yes' || amt < 0
      return { name, amount: amt, isDeemedPositive }
    })

    const invBlocks = [
      ...extractAllXmlBlocks(block, 'ALLINVENTORYENTRIES.LIST'),
      ...extractAllXmlBlocks(block, 'INVENTORYENTRIES.LIST')
    ]

    const rawInventory = invBlocks.map(iBlock => {
      const name = extractXmlTag(iBlock, 'STOCKITEMNAME') || 'Item'
      const rawRate = extractXmlTag(iBlock, 'RATE')
      const rate = parseFloat(rawRate.replace(/[^0-9.]/g, '')) || 0
      const rawQty = extractXmlTag(iBlock, 'ACTUALQTY') || extractXmlTag(iBlock, 'BILLEDQTY') || '1'
      const qty = parseFloat(rawQty.replace(/[^0-9.]/g, '')) || 1
      const unit = rawQty.replace(/[0-9.\s]/g, '') || 'KG'
      const amt = parseFloat(extractXmlTag(iBlock, 'AMOUNT') || '0') || 0
      return { name, qty, unit, rate, amount: amt }
    })

    list.push({
      rawVoucherType,
      rawDate,
      voucherNumber,
      partyName,
      partyGstin,
      narration,
      rawLedgers,
      rawInventory
    })
  })

  return list
}

/**
 * Universal Native Tally XML Parser.
 * Ingests Sales, Purchases, Receipts, Payments, Credit Notes, Debit Notes, and skips internal Journals.
 */
export function parseTallyXmlVouchers(
  xmlInput: string | ArrayBuffer | Uint8Array,
  context?: {
    customers?: Customer[]
    suppliers?: Supplier[]
    items?: Item[]
    expenseTypes?: ExpenseType[]
    counters?: Counter[]
    companyStateCode?: string
  }
): TallyXmlImportResult {
  const errors: string[] = []
  const warnings: string[] = []
  const vouchers: TallyParsedXmlVoucher[] = []

  const customers = context?.customers || []
  const suppliers = context?.suppliers || []
  const items = context?.items || []
  const expenseTypes = context?.expenseTypes || []
  const counters = context?.counters || []

  const custMap = new Map(customers.map(c => [c.name.trim().toLowerCase(), c]))
  const suppMap = new Map(suppliers.map(s => [s.name.trim().toLowerCase(), s]))
  const itemMap = new Map(items.map(it => [it.name.trim().toLowerCase(), it]))
  const expMap = new Map(expenseTypes.map(e => [e.name.trim().toLowerCase(), e]))
  const counterMap = new Map(counters.map(c => [c.name.trim().toLowerCase(), c]))

  items.forEach(it => {
    if (it.itemCode) itemMap.set(it.itemCode.trim().toLowerCase(), it)
  })

  let xmlContent = ''
  if (typeof xmlInput === 'string') {
    xmlContent = xmlInput
  } else if (xmlInput) {
    xmlContent = decodeXmlFileBuffer(xmlInput)
  }

  if (!xmlContent || !xmlContent.trim()) {
    return {
      success: false,
      vouchers: [],
      summary: {
        totalParsed: 0,
        salesCount: 0,
        purchaseCount: 0,
        receiptCount: 0,
        paymentCount: 0,
        expenseCount: 0,
        contraCount: 0,
        creditNoteCount: 0,
        debitNoteCount: 0,
        skippedCount: 0,
        matchedCount: 0,
        unmappedCount: 0
      },
      errors: ['Uploaded XML file is empty'],
      warnings: []
    }
  }

  const sanitized = sanitizeTallyXmlString(xmlContent)
  let rawVoucherList: RawXmlVoucherData[] = []

  // Try DOMParser if available in browser
  if (typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(sanitized, 'text/xml')
      const parserErrors = doc.getElementsByTagName('parsererror')
      if (!parserErrors || parserErrors.length === 0) {
        rawVoucherList = parseVouchersWithDom(doc)
      }
    } catch {
      // Fall through to regex parser
    }
  }

  // Fallback to pure regex XML extractor if DOMParser produced nothing or was unavailable
  if (rawVoucherList.length === 0) {
    rawVoucherList = parseVouchersWithRegex(sanitized)
  }

  if (rawVoucherList.length === 0) {
    warnings.push('No <VOUCHER> elements found in XML envelope.')
  }

  rawVoucherList.forEach((raw, idx) => {
    let normalizedType = normalizeTallyVoucherType(raw.rawVoucherType)
    const { iso, dmy } = parseTallyXmlDate(raw.rawDate)
    const voucherNumber = raw.voucherNumber || `VCH-${idx + 1}`
    let partyName = raw.partyName

    const legs: TallyXmlLedgerLeg[] = raw.rawLedgers.map(l => {
      const drCr: 'Dr' | 'Cr' = l.isDeemedPositive ? 'Dr' : 'Cr'
      const absAmount = roundCurrency(Math.abs(l.amount))
      return {
        ledgerName: l.name,
        amount: absAmount,
        drCr,
        isDeemedPositive: l.isDeemedPositive
      }
    })

    const inventory: TallyXmlInventoryItem[] = raw.rawInventory.map(inv => {
      const absAmt = roundCurrency(Math.abs(inv.amount))
      return {
        itemName: inv.name,
        quantity: inv.qty,
        unit: inv.unit || 'KG',
        rate: inv.rate || (inv.qty > 0 ? roundCurrency(absAmt / inv.qty) : absAmt),
        amount: absAmt
      }
    })

    const drTotal = roundCurrency(legs.filter(l => l.drCr === 'Dr').reduce((s, l) => s + l.amount, 0))
    const crTotal = roundCurrency(legs.filter(l => l.drCr === 'Cr').reduce((s, l) => s + l.amount, 0))
    const imbalanceDifference = roundCurrency(Math.abs(drTotal - crTotal))
    const isBalanced = imbalanceDifference === 0
    const totalAmount = drTotal || crTotal || (inventory.reduce((s, it) => s + it.amount, 0))

    let matchedEntityType: TallyParsedXmlVoucher['matchedEntityType'] = 'unmapped'
    let matchedEntityId: string | undefined
    let contraDetails: TallyParsedXmlVoucher['contraDetails'] | undefined
    let expenseDetails: TallyParsedXmlVoucher['expenseDetails'] | undefined
    let skipReason: string | undefined

    if (normalizedType === 'contra') {
      // Contra: Transfer between cash/bank counters
      const crLeg = legs.find(l => l.drCr === 'Cr') || legs[0]
      const drLeg = legs.find(l => l.drCr === 'Dr') || legs[1] || legs[0]
      const fromCounterName = crLeg ? crLeg.ledgerName : 'Source Counter'
      const toCounterName = drLeg ? drLeg.ledgerName : 'Destination Counter'
      partyName = `${fromCounterName} → ${toCounterName}`

      const fromCounterId = counterMap.get(fromCounterName.trim().toLowerCase())?.id
      const toCounterId = counterMap.get(toCounterName.trim().toLowerCase())?.id

      contraDetails = {
        fromCounterName,
        toCounterName,
        fromCounterId,
        toCounterId,
        amount: totalAmount
      }

      if (counters.length > 0) {
        if (fromCounterId && toCounterId) {
          matchedEntityType = 'counter'
          matchedEntityId = toCounterId
        } else {
          matchedEntityType = 'unmapped'
          skipReason = `Unmapped Counter: ${!fromCounterId ? fromCounterName : toCounterName}`
        }
      } else {
        matchedEntityType = 'counter'
      }
    } else if (normalizedType === 'payment') {
      // Classify Payment into Supplier Payment vs Indirect Expense Entry
      const drLeg = legs.find(l => l.drCr === 'Dr')
      const crLeg = legs.find(l => l.drCr === 'Cr')
      const drParty = (drLeg?.ledgerName || partyName || '').trim()
      const normDr = drParty.toLowerCase()

      if (suppMap.has(normDr)) {
        normalizedType = 'payment'
        matchedEntityType = 'supplier'
        matchedEntityId = suppMap.get(normDr)?.id
        partyName = drParty
      } else if (expMap.has(normDr)) {
        normalizedType = 'expense'
        matchedEntityType = 'expense'
        matchedEntityId = expMap.get(normDr)?.id
        partyName = drParty
        expenseDetails = {
          categoryId: matchedEntityId,
          categoryName: drParty,
          amount: totalAmount,
          paymentAccountId: crLeg?.ledgerName,
          paymentAccountName: crLeg?.ledgerName
        }
      } else if (custMap.has(normDr)) {
        normalizedType = 'payment'
        matchedEntityType = 'customer'
        matchedEntityId = custMap.get(normDr)?.id
        partyName = drParty
      } else {
        // Dr ledger not found in registered suppliers. Ingest as Expense entry.
        normalizedType = 'expense'
        partyName = drParty
        expenseDetails = {
          categoryName: drParty,
          amount: totalAmount,
          paymentAccountId: crLeg?.ledgerName,
          paymentAccountName: crLeg?.ledgerName
        }
        matchedEntityType = 'unmapped'
        skipReason = `Unmapped Master: ${drParty}`
      }
    } else if (normalizedType === 'receipt') {
      const crLeg = legs.find(l => l.drCr === 'Cr')
      const crParty = (crLeg?.ledgerName || partyName || '').trim()
      const normCr = crParty.toLowerCase()

      if (custMap.has(normCr)) {
        matchedEntityType = 'customer'
        matchedEntityId = custMap.get(normCr)?.id
        partyName = crParty
      } else if (suppMap.has(normCr)) {
        matchedEntityType = 'supplier'
        matchedEntityId = suppMap.get(normCr)?.id
        partyName = crParty
      } else {
        matchedEntityType = 'unmapped'
        partyName = crParty
        skipReason = `Unmapped Master: ${crParty}`
      }
    } else if (normalizedType === 'sales') {
      const drLeg = legs.find(l => l.drCr === 'Dr' && !l.ledgerName.toLowerCase().includes('round off'))
      const pName = (raw.partyName || (drLeg ? drLeg.ledgerName : (partyName || legs[0]?.ledgerName || 'General Account'))).trim()
      partyName = pName
      const normParty = pName.toLowerCase()

      if (custMap.has(normParty)) {
        matchedEntityType = 'customer'
        matchedEntityId = custMap.get(normParty)?.id
      } else if (suppMap.has(normParty)) {
        matchedEntityType = 'supplier'
        matchedEntityId = suppMap.get(normParty)?.id
      } else {
        matchedEntityType = 'unmapped'
        skipReason = `Unmapped Master: ${pName}`
      }
    } else if (normalizedType === 'credit_note') {
      const crLeg = legs.find(l => l.drCr === 'Cr' && !l.ledgerName.toLowerCase().includes('round off'))
      const pName = (raw.partyName || (crLeg ? crLeg.ledgerName : (partyName || legs[0]?.ledgerName || 'General Account'))).trim()
      partyName = pName
      const normParty = pName.toLowerCase()

      if (custMap.has(normParty)) {
        matchedEntityType = 'customer'
        matchedEntityId = custMap.get(normParty)?.id
      } else if (suppMap.has(normParty)) {
        matchedEntityType = 'supplier'
        matchedEntityId = suppMap.get(normParty)?.id
      } else {
        matchedEntityType = 'unmapped'
        skipReason = `Unmapped Master: ${pName}`
      }
    } else if (normalizedType === 'purchase') {
      const crLeg = legs.find(l => l.drCr === 'Cr' && !l.ledgerName.toLowerCase().includes('round off'))
      const pName = (raw.partyName || (crLeg ? crLeg.ledgerName : (partyName || legs[0]?.ledgerName || 'General Account'))).trim()
      partyName = pName
      const normParty = pName.toLowerCase()

      if (suppMap.has(normParty)) {
        matchedEntityType = 'supplier'
        matchedEntityId = suppMap.get(normParty)?.id
      } else if (custMap.has(normParty)) {
        matchedEntityType = 'customer'
        matchedEntityId = custMap.get(normParty)?.id
      } else {
        matchedEntityType = 'unmapped'
        skipReason = `Unmapped Master: ${pName}`
      }
    } else if (normalizedType === 'debit_note') {
      const drLeg = legs.find(l => l.drCr === 'Dr' && !l.ledgerName.toLowerCase().includes('round off'))
      const pName = (raw.partyName || (drLeg ? drLeg.ledgerName : (partyName || legs[0]?.ledgerName || 'General Account'))).trim()
      partyName = pName
      const normParty = pName.toLowerCase()

      if (suppMap.has(normParty)) {
        matchedEntityType = 'supplier'
        matchedEntityId = suppMap.get(normParty)?.id
      } else if (custMap.has(normParty)) {
        matchedEntityType = 'customer'
        matchedEntityId = custMap.get(normParty)?.id
      } else {
        matchedEntityType = 'unmapped'
        skipReason = `Unmapped Master: ${pName}`
      }
    } else if (normalizedType === 'skipped') {
      skipReason = `Non-billing voucher type (${raw.rawVoucherType}) skipped per standard ERP audit policy`
    }

    // Check inventory items matching
    if (inventory.length > 0) {
      const unmappedItems = inventory.filter(inv => !itemMap.has(inv.itemName.trim().toLowerCase()))
      if (unmappedItems.length > 0 && !skipReason) {
        skipReason = `Unmapped Item: ${unmappedItems.map(i => i.itemName).join(', ')}`
      }
    }

    vouchers.push({
      id: `xml-vch-${idx + 1}`,
      voucherNumber,
      voucherDate: iso,
      displayDate: dmy,
      rawVoucherType: raw.rawVoucherType,
      normalizedType,
      partyName: partyName || 'General Ledger',
      partyGstin: raw.partyGstin,
      narration: raw.narration,
      legs,
      inventory,
      drTotal,
      crTotal,
      totalAmount,
      isBalanced,
      imbalanceDifference,
      matchedEntityId,
      matchedEntityType,
      contraDetails,
      expenseDetails,
      skipReason
    })
  })

  // Summary counts
  const salesCount = vouchers.filter(v => v.normalizedType === 'sales').length
  const purchaseCount = vouchers.filter(v => v.normalizedType === 'purchase').length
  const receiptCount = vouchers.filter(v => v.normalizedType === 'receipt').length
  const paymentCount = vouchers.filter(v => v.normalizedType === 'payment').length
  const expenseCount = vouchers.filter(v => v.normalizedType === 'expense').length
  const contraCount = vouchers.filter(v => v.normalizedType === 'contra').length
  const creditNoteCount = vouchers.filter(v => v.normalizedType === 'credit_note').length
  const debitNoteCount = vouchers.filter(v => v.normalizedType === 'debit_note').length
  const skippedCount = vouchers.filter(v => v.normalizedType === 'skipped').length
  const matchedCount = vouchers.filter(v => v.matchedEntityType !== 'unmapped' && v.normalizedType !== 'skipped' && (!v.skipReason || !v.skipReason.startsWith('Unmapped Item'))).length
  const unmappedCount = vouchers.filter(v => (v.matchedEntityType === 'unmapped' || Boolean(v.skipReason && v.skipReason.startsWith('Unmapped Item'))) && v.normalizedType !== 'skipped').length

  return {
    success: vouchers.length > 0 && errors.length === 0,
    vouchers,
    summary: {
      totalParsed: vouchers.length,
      salesCount,
      purchaseCount,
      receiptCount,
      paymentCount,
      expenseCount,
      contraCount,
      creditNoteCount,
      debitNoteCount,
      skippedCount,
      matchedCount,
      unmappedCount
    },
    errors,
    warnings
  }
}
