import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  sanitizeTallyXmlString,
  decodeXmlFileBuffer,
  parseTallyXmlDate,
  normalizeTallyVoucherType,
  parseTallyXmlVouchers,
  isLikelyCommercialEntity,
  isLikelyIndirectExpenseLedger
} from './tally-xml-parser'
import { Customer, Supplier, Item } from './types'

describe('Native Tally XML Ingestion Engine', () => {
  const mockCustomers: Customer[] = [
    { id: 'c-alpha', name: 'Alpha Traders Ltd', gstin: '19AAACA1234F1Z1', stateCode: '19' },
    { id: 'c-beta', name: 'Beta Industries', gstin: '10BBBCB5678F1Z2', stateCode: '10' }
  ]

  const mockSuppliers: Supplier[] = [
    { id: 's-apex', name: 'Apex Steel Corp', gstin: '19AAACS9999F1Z3', stateCode: '19', paymentCDRules: [], invoiceCloseCDRules: [] },
    { id: 's-national', name: 'National Cement Ltd', gstin: '20CCCCS1111F1Z4', stateCode: '20', paymentCDRules: [], invoiceCloseCDRules: [] }
  ]

  it('sanitizes XML control characters and numeric entity codes', () => {
    const dirtyXml = '<NARRATION>Payment&#03; for bill&#19; #101\x00\x08\x1F</NARRATION>'
    const clean = sanitizeTallyXmlString(dirtyXml)
    expect(clean).toBe('<NARRATION>Payment for bill #101</NARRATION>')
  })

  it('parses Tally YYYYMMDD dates accurately into ISO and DMY', () => {
    const { iso, dmy } = parseTallyXmlDate('20260410')
    expect(iso).toBe('2026-04-10')
    expect(dmy).toBe('10-04-2026')
  })

  it('parses multi-module Tally XML with Sales, Purchase, Payment, Receipt, Notes & skips Journal', () => {
    const sampleXml = `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <BODY>
    <IMPORTDATA>
      <REQUESTDATA>
        <!-- 1. Sales Voucher -->
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Sales" ACTION="Create">
            <DATE>20260410</DATE>
            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
            <VOUCHERNUMBER>INV-101</VOUCHERNUMBER>
            <PARTYLEDGERNAME>Alpha Traders Ltd</PARTYLEDGERNAME>
            <PARTYGSTIN>19AAACA1234F1Z1</PARTYGSTIN>
            <NARRATION>Sales Invoice INV-101</NARRATION>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Alpha Traders Ltd</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-11800.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Sales Account</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>10000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Output CGST</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>900.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Output SGST</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>900.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>

        <!-- 2. Purchase Voucher -->
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Purchase" ACTION="Create">
            <DATE>20260412</DATE>
            <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
            <VOUCHERNUMBER>PUR-201</VOUCHERNUMBER>
            <PARTYLEDGERNAME>Apex Steel Corp</PARTYLEDGERNAME>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Apex Steel Corp</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>59000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Purchase Account</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-50000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Input CGST</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-4500.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Input SGST</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-4500.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>

        <!-- 3. Customer Receipt -->
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Receipt" ACTION="Create">
            <DATE>20260415</DATE>
            <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
            <VOUCHERNUMBER>REC-301</VOUCHERNUMBER>
            <PARTYLEDGERNAME>Alpha Traders Ltd</PARTYLEDGERNAME>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Bank Account</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-11800.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Alpha Traders Ltd</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>11800.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>

        <!-- 4. Supplier Payment -->
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Payment" ACTION="Create">
            <DATE>20260418</DATE>
            <VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>
            <VOUCHERNUMBER>PAY-401</VOUCHERNUMBER>
            <PARTYLEDGERNAME>Apex Steel Corp</PARTYLEDGERNAME>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Apex Steel Corp</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-59000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Bank Account</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>59000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>

        <!-- 5. Internal Journal Voucher (Should be safely skipped) -->
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Journal" ACTION="Create">
            <DATE>20260420</DATE>
            <VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>
            <VOUCHERNUMBER>JRN-501</VOUCHERNUMBER>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Depreciation</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-5000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Plant & Machinery</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>5000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`

    const result = parseTallyXmlVouchers(sampleXml, {
      customers: mockCustomers,
      suppliers: mockSuppliers
    })

    expect(result.success).toBe(true)
    expect(result.summary.totalParsed).toBe(5)
    expect(result.summary.salesCount).toBe(1)
    expect(result.summary.purchaseCount).toBe(1)
    expect(result.summary.receiptCount).toBe(1)
    expect(result.summary.paymentCount).toBe(1)
    expect(result.summary.skippedCount).toBe(1)

    // Check Sales Voucher details
    const salesVch = result.vouchers.find(v => v.normalizedType === 'sales')
    expect(salesVch).toBeDefined()
    expect(salesVch?.voucherNumber).toBe('INV-101')
    expect(salesVch?.partyName).toBe('Alpha Traders Ltd')
    expect(salesVch?.totalAmount).toBe(11800)
    expect(salesVch?.isBalanced).toBe(true)
    expect(salesVch?.matchedEntityType).toBe('customer')
    expect(salesVch?.matchedEntityId).toBe('c-alpha')

    // Check Purchase Voucher details
    const purVch = result.vouchers.find(v => v.normalizedType === 'purchase')
    expect(purVch).toBeDefined()
    expect(purVch?.voucherNumber).toBe('PUR-201')
    expect(purVch?.partyName).toBe('Apex Steel Corp')
    expect(purVch?.totalAmount).toBe(59000)
    expect(purVch?.isBalanced).toBe(true)
    expect(purVch?.matchedEntityType).toBe('supplier')
    expect(purVch?.matchedEntityId).toBe('s-apex')

    // Check Journal Voucher skip reason
    const jrnVch = result.vouchers.find(v => v.normalizedType === 'skipped')
    expect(jrnVch).toBeDefined()
    expect(jrnVch?.skipReason).toContain('Non-billing voucher type')
  })

  it('parses Credit Note and Debit Note vouchers with inventory allocations', () => {
    const notesXml = `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <BODY>
    <IMPORTDATA>
      <REQUESTDATA>
        <TALLYMESSAGE>
          <VOUCHER VCHTYPE="Credit Note" ACTION="Create">
            <DATE>20260501</DATE>
            <VOUCHERTYPENAME>Credit Note</VOUCHERTYPENAME>
            <VOUCHERNUMBER>CN-001</VOUCHERNUMBER>
            <PARTYLEDGERNAME>Beta Industries</PARTYLEDGERNAME>
            <NARRATION>Goods returned by customer</NARRATION>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Sales Return</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-5000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Output IGST</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-900.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Beta Industries</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>5900.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>Steel Rods</STOCKITEMNAME>
              <ACTUALQTY>100 KG</ACTUALQTY>
              <RATE>50</RATE>
              <AMOUNT>5000.00</AMOUNT>
            </ALLINVENTORYENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`

    const result = parseTallyXmlVouchers(notesXml, {
      customers: mockCustomers,
      suppliers: mockSuppliers
    })

    expect(result.success).toBe(true)
    expect(result.summary.creditNoteCount).toBe(1)
    const cn = result.vouchers[0]
    expect(cn.normalizedType).toBe('credit_note')
    expect(cn.partyName).toBe('Beta Industries')
    expect(cn.totalAmount).toBe(5900)
    expect(cn.isBalanced).toBe(true)
    expect(cn.matchedEntityType).toBe('customer')
    expect(cn.matchedEntityId).toBe('c-beta')
    expect(cn.inventory.length).toBe(1)
    expect(cn.inventory[0].itemName).toBe('Steel Rods')
    expect(cn.inventory[0].quantity).toBe(100)
  })

  it('handles empty or malformed XML gracefully', () => {
    const emptyRes = parseTallyXmlVouchers('')
    expect(emptyRes.success).toBe(false)
    expect(emptyRes.errors.length).toBeGreaterThan(0)

    const noVchRes = parseTallyXmlVouchers('<ENVELOPE><HEADER></HEADER></ENVELOPE>')
    expect(noVchRes.vouchers.length).toBe(0)
    expect(noVchRes.warnings.length).toBeGreaterThan(0)
  })

  it('decodes UTF-16LE and UTF-8 buffers accurately with decodeXmlFileBuffer', () => {
    // UTF-16LE buffer with BOM
    const str = '<ENVELOPE><BODY><DATA>Test</DATA></BODY></ENVELOPE>'
    const utf16leBuf = new Uint8Array([
      0xFF, 0xFE, // BOM
      ...Array.from(str).flatMap(c => [c.charCodeAt(0), 0x00])
    ])
    const decodedLe = decodeXmlFileBuffer(utf16leBuf)
    expect(decodedLe).toContain('<DATA>Test</DATA>')

    // Standard UTF-8
    const utf8Buf = new TextEncoder().encode(str)
    const decodedUtf8 = decodeXmlFileBuffer(utf8Buf)
    expect(decodedUtf8).toBe(str)
  })

  it('enforces strict master entity & item matching without automatic master creation', () => {
    const xmlWithUnmappedItem = `<ENVELOPE>
      <BODY>
        <IMPORTDATA>
          <REQUESTDATA>
            <TALLYMESSAGE>
              <VOUCHER VCHTYPE="Sales" DATE="20260415">
                <VOUCHERNUMBER>INV-UNMAPPED</VOUCHERNUMBER>
                <PARTYNAME>Alpha Traders Ltd</PARTYNAME>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Alpha Traders Ltd</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                  <AMOUNT>-5000.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Sales Account</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                  <AMOUNT>5000.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLINVENTORYENTRIES.LIST>
                  <STOCKITEMNAME>Unknown Brand New Item 999</STOCKITEMNAME>
                  <ACTUALQTY>10 PCS</ACTUALQTY>
                  <RATE>500</RATE>
                  <AMOUNT>5000.00</AMOUNT>
                </ALLINVENTORYENTRIES.LIST>
              </VOUCHER>
            </TALLYMESSAGE>
          </REQUESTDATA>
        </IMPORTDATA>
      </BODY>
    </ENVELOPE>`

    const result = parseTallyXmlVouchers(xmlWithUnmappedItem, {
      customers: mockCustomers,
      suppliers: mockSuppliers,
      items: [{ id: 'it-1', name: 'Known Item A', unit: 'PCS' }]
    })

    expect(result.success).toBe(true)
    expect(result.vouchers).toHaveLength(1)
    const vch = result.vouchers[0]
    expect(vch.matchedEntityType).toBe('customer')
    expect(vch.skipReason).toContain('Unmapped Item: Unknown Brand New Item 999')
    expect(result.summary.unmappedCount).toBe(1)
    expect(result.summary.matchedCount).toBe(0)
  })

  it('parses Contra vouchers into Counter Transfers accurately', () => {
    const contraXml = `<ENVELOPE>
      <BODY>
        <IMPORTDATA>
          <REQUESTDATA>
            <TALLYMESSAGE>
              <VOUCHER VCHTYPE="Contra" DATE="20260418">
                <VOUCHERTYPENAME>Contra</VOUCHERTYPENAME>
                <VOUCHERNUMBER>53</VOUCHERNUMBER>
                <NARRATION>Bank to Bank transfer</NARRATION>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>CANARA BANK OD A/C - 125001590160</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                  <AMOUNT>50000.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Indusind Bank (SB)-159635070410</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                  <AMOUNT>-50000.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
              </VOUCHER>
            </TALLYMESSAGE>
          </REQUESTDATA>
        </IMPORTDATA>
      </BODY>
    </ENVELOPE>`

    const result = parseTallyXmlVouchers(contraXml, {
      counters: [
        { id: 'cntr-canara', name: 'CANARA BANK OD A/C - 125001590160', type: 'Bank', openingBalance: 0, currentBalance: 0 },
        { id: 'cntr-indusind', name: 'Indusind Bank (SB)-159635070410', type: 'Bank', openingBalance: 0, currentBalance: 0 }
      ]
    })

    expect(result.success).toBe(true)
    expect(result.summary.contraCount).toBe(1)
    const vch = result.vouchers[0]
    expect(vch.normalizedType).toBe('contra')
    expect(vch.voucherNumber).toBe('53')
    expect(vch.partyName).toBe('CANARA BANK OD A/C - 125001590160 → Indusind Bank (SB)-159635070410')
    expect(vch.totalAmount).toBe(50000)
    expect(vch.isBalanced).toBe(true)
    expect(vch.matchedEntityType).toBe('counter')
    expect(vch.contraDetails?.fromCounterName).toBe('CANARA BANK OD A/C - 125001590160')
    expect(vch.contraDetails?.fromCounterId).toBe('cntr-canara')
    expect(vch.contraDetails?.toCounterName).toBe('Indusind Bank (SB)-159635070410')
    expect(vch.contraDetails?.toCounterId).toBe('cntr-indusind')
    expect(vch.contraDetails?.amount).toBe(50000)
  })

  it('classifies Payment vouchers into Supplier Payments vs Indirect Expenses', () => {
    const paymentXml = `<ENVELOPE>
      <BODY>
        <IMPORTDATA>
          <REQUESTDATA>
            <!-- 1. Supplier Payment -->
            <TALLYMESSAGE>
              <VOUCHER VCHTYPE="Payment" DATE="20260420">
                <VOUCHERNUMBER>PAY-101</VOUCHERNUMBER>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Apex Steel Corp</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                  <AMOUNT>-50000.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>HDFC Bank</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                  <AMOUNT>50000.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
              </VOUCHER>
            </TALLYMESSAGE>

            <!-- 2. Indirect Expense Payment -->
            <TALLYMESSAGE>
              <VOUCHER VCHTYPE="Payment" DATE="20260421">
                <VOUCHERNUMBER>EXP-202</VOUCHERNUMBER>
                <NARRATION>Bank processing fee</NARRATION>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Bank Charges</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                  <AMOUNT>-2469.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>HDFC Bank</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                  <AMOUNT>2469.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
              </VOUCHER>
            </TALLYMESSAGE>
          </REQUESTDATA>
        </IMPORTDATA>
      </BODY>
    </ENVELOPE>`

    const result = parseTallyXmlVouchers(paymentXml, {
      suppliers: mockSuppliers,
      expenseTypes: [
        { id: 'exp-bank-charges', name: 'Bank Charges' }
      ]
    })

    expect(result.success).toBe(true)
    expect(result.summary.paymentCount).toBe(1)
    expect(result.summary.expenseCount).toBe(1)

    const payVch = result.vouchers.find(v => v.voucherNumber === 'PAY-101')!
    expect(payVch.normalizedType).toBe('payment')
    expect(payVch.matchedEntityType).toBe('supplier')
    expect(payVch.matchedEntityId).toBe('s-apex')

    const expVch = result.vouchers.find(v => v.voucherNumber === 'EXP-202')!
    expect(expVch.normalizedType).toBe('expense')
    expect(expVch.matchedEntityType).toBe('expense')
    expect(expVch.matchedEntityId).toBe('exp-bank-charges')
    expect(expVch.expenseDetails?.categoryName).toBe('Bank Charges')
    expect(expVch.expenseDetails?.amount).toBe(2469)
  })

  it('parses real export Transactions.xml (UTF-16LE) correctly with Contra and Expense support', () => {
    const transactionsPath = path.resolve(process.cwd(), 'Transactions.xml')
    if (fs.existsSync(transactionsPath)) {
      const rawBuf = fs.readFileSync(transactionsPath)
      const decoded = decodeXmlFileBuffer(rawBuf)
      expect(decoded.length).toBeGreaterThan(10000)

      const result = parseTallyXmlVouchers(decoded, {
        customers: mockCustomers,
        suppliers: [
          ...mockSuppliers,
          { id: 's-captain', name: 'Captain Steel India Limited', gstin: '', stateCode: '19', paymentCDRules: [], invoiceCloseCDRules: [] },
          { id: 's-shyam', name: 'SHYAM STEEL INDUSTRIES LIMITED', gstin: '', stateCode: '19', paymentCDRules: [], invoiceCloseCDRules: [] },
          { id: 's-srmb', name: 'Srmb Srijan Private Limited', gstin: '', stateCode: '19', paymentCDRules: [], invoiceCloseCDRules: [] },
          { id: 's-steel-mkt', name: 'Steel Marketing Private Limited', gstin: '', stateCode: '19', paymentCDRules: [], invoiceCloseCDRules: [] },
          { id: 's-alankar', name: 'Alankar Tading Co.', gstin: '', stateCode: '19', paymentCDRules: [], invoiceCloseCDRules: [] },
          { id: 's-narveram', name: 'NARVERAM LEASING CO PVT LTD', gstin: '', stateCode: '19', paymentCDRules: [], invoiceCloseCDRules: [] }
        ],
        expenseTypes: [
          { id: 'exp-interest-od', name: 'Interest on OD A/C' },
          { id: 'exp-bank-charges', name: 'Bank Charges' },
          { id: 'exp-drawings', name: 'Drawings' },
          { id: 'exp-insurance', name: 'STOCK INSURANCE' },
          { id: 'exp-interest-car', name: 'Interest on Car Loan' }
        ]
      })

      expect(result.success).toBe(true)
      expect(result.summary.totalParsed).toBe(1042)
      expect(result.summary.salesCount).toBe(448)
      expect(result.summary.purchaseCount).toBe(103)
      expect(result.summary.receiptCount).toBe(216)
      expect(result.summary.contraCount).toBe(26)
      expect(result.summary.skippedCount).toBe(36) // Only the 36 Journal vouchers skipped

      // Check Contra Voucher #53
      const vch53 = result.vouchers.find(v => v.rawVoucherType === 'Contra' && v.voucherNumber === '53')
      expect(vch53).toBeDefined()
      expect(vch53?.normalizedType).toBe('contra')
      expect(vch53?.totalAmount).toBe(50000)
      expect(vch53?.contraDetails?.fromCounterName).toBe('CANARA BANK OD A/C - 125001590160')
      expect(vch53?.contraDetails?.toCounterName).toBe('Indusind Bank (SB)-159635070410')

      // Check Payment Voucher #171 (Bank Charges)
      const vch171 = result.vouchers.find(v => v.rawVoucherType === 'Payment' && v.voucherNumber === '171')
      expect(vch171).toBeDefined()
      expect(vch171?.normalizedType).toBe('expense')
      expect(vch171?.partyName).toBe('Bank Charges')
      expect(vch171?.matchedEntityId).toBe('exp-bank-charges')
      expect(vch171?.totalAmount).toBe(2469)

      // Check Payment Voucher #172 (Captain Steel Supplier Payment)
      const vch172 = result.vouchers.find(v => v.rawVoucherType === 'Payment' && v.voucherNumber === '172')
      expect(vch172).toBeDefined()
      expect(vch172?.normalizedType).toBe('payment')
      expect(vch172?.partyName).toBe('Captain Steel India Limited')
      expect(vch172?.matchedEntityId).toBe('s-captain')
      expect(vch172?.totalAmount).toBe(1600000)

      // Check Candidate Masters extraction from real Transactions.xml
      expect(result.newMasterCandidates).toBeDefined()
      expect(result.newMasterCandidates.customers.length).toBeGreaterThan(0)
      expect(result.newMasterCandidates.counters.length).toBeGreaterThan(0)
      expect(result.summary.newCustomersCount).toBe(result.newMasterCandidates.customers.length)
    }
  })

  it('aggregates candidate masters cleanly for unmapped parties and accounts', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <BODY>
    <IMPORTDATA>
      <REQUESTDATA>
        <TALLYMESSAGE>
          <VOUCHER VCHTYPE="Sales" ACTION="Create">
            <DATE>20260401</DATE>
            <VOUCHERNUMBER>S-01</VOUCHERNUMBER>
            <PARTYLEDGERNAME>Brand New Customer Ltd</PARTYLEDGERNAME>
            <PARTYGSTIN>19ABCDE1234F1Z5</PARTYGSTIN>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Brand New Customer Ltd</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-10000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Sales A/c</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>10000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
          <VOUCHER VCHTYPE="Purchase" ACTION="Create">
            <DATE>20260402</DATE>
            <VOUCHERNUMBER>P-01</VOUCHERNUMBER>
            <PARTYLEDGERNAME>Brand New Supplier LLP</PARTYLEDGERNAME>
            <PARTYGSTIN>19XYZPQ9876R1Z2</PARTYGSTIN>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Purchase A/c</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-25000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Brand New Supplier LLP</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>25000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
          <VOUCHER VCHTYPE="Payment" ACTION="Create">
            <DATE>20260403</DATE>
            <VOUCHERNUMBER>EXP-01</VOUCHERNUMBER>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Office Tea &amp; Refreshments</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-1500.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Cash Counter Main</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>1500.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
          <VOUCHER VCHTYPE="Contra" ACTION="Create">
            <DATE>20260404</DATE>
            <VOUCHERNUMBER>CT-01</VOUCHERNUMBER>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>HDFC Current A/c</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>20000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Axis Bank OD</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-20000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`

    const result = parseTallyXmlVouchers(xml, {
      customers: [],
      suppliers: [],
      expenseTypes: [],
      counters: []
    })

    expect(result.success).toBe(true)
    expect(result.newMasterCandidates.customers).toHaveLength(1)
    expect(result.newMasterCandidates.customers[0].name).toBe('Brand New Customer Ltd')
    expect(result.newMasterCandidates.customers[0].gstin).toBe('19ABCDE1234F1Z5')

    expect(result.newMasterCandidates.suppliers).toHaveLength(1)
    expect(result.newMasterCandidates.suppliers[0].name).toBe('Brand New Supplier LLP')
    expect(result.newMasterCandidates.suppliers[0].gstin).toBe('19XYZPQ9876R1Z2')

    expect(result.newMasterCandidates.expenseCategories).toHaveLength(1)
    expect(result.newMasterCandidates.expenseCategories[0].name).toBe('Office Tea & Refreshments')

    expect(result.newMasterCandidates.counters.length).toBeGreaterThanOrEqual(2)
    const counterNames = result.newMasterCandidates.counters.map(c => c.name)
    expect(counterNames).toContain('HDFC Current A/c')
    expect(counterNames).toContain('Axis Bank OD')
    expect(counterNames).toContain('Cash Counter Main')
  })

  it('accurately distinguishes commercial entities from indirect expenses in Payment vouchers', () => {
    // 1. Check helper functions
    expect(isLikelyCommercialEntity('Captain Steel India Limited')).toBe(true)
    expect(isLikelyCommercialEntity('Apex Infrastructure Traders')).toBe(true)
    expect(isLikelyCommercialEntity('Tata Metaliks Ltd')).toBe(true)
    expect(isLikelyCommercialEntity('Office Rent')).toBe(false)
    expect(isLikelyCommercialEntity('Tea & Refreshment Expenses')).toBe(false)

    expect(isLikelyIndirectExpenseLedger('Office Rent')).toBe(true)
    expect(isLikelyIndirectExpenseLedger('Electricity Charges')).toBe(true)
    expect(isLikelyIndirectExpenseLedger('Bank Charges & Processing Fee')).toBe(true)
    expect(isLikelyIndirectExpenseLedger('Captain Steel India Limited')).toBe(false)
    expect(isLikelyIndirectExpenseLedger('Shree Shyam Enterprises')).toBe(false)

    // 2. Parse XML with commercial payment vs expense payment
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <BODY>
    <IMPORTDATA>
      <REQUESTDATA>
        <TALLYMESSAGE>
          <VOUCHER VCHTYPE="Payment" ACTION="Create">
            <DATE>20260405</DATE>
            <VOUCHERNUMBER>297</VOUCHERNUMBER>
            <NARRATION>Payment against supply of TMT bars</NARRATION>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Captain Steel India Limited</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-500000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>State Bank of India</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>500000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
          <VOUCHER VCHTYPE="Payment" ACTION="Create">
            <DATE>20260406</DATE>
            <VOUCHERNUMBER>298</VOUCHERNUMBER>
            <NARRATION>Office electricity bill</NARRATION>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Electricity Charges</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-12450.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>State Bank of India</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>12450.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`

    const result = parseTallyXmlVouchers(xml, {
      customers: [],
      suppliers: [],
      expenseTypes: [],
      counters: []
    })

    expect(result.success).toBe(true)
    expect(result.vouchers).toHaveLength(2)

    // Voucher 297: Captain Steel -> classified as Supplier Payment
    const vch297 = result.vouchers.find(v => v.voucherNumber === '297')
    expect(vch297).toBeDefined()
    expect(vch297?.normalizedType).toBe('payment')
    expect(vch297?.partyName).toBe('Captain Steel India Limited')
    expect(vch297?.totalAmount).toBe(500000)

    // Candidate supplier generated
    expect(result.newMasterCandidates.suppliers.some(s => s.name === 'Captain Steel India Limited')).toBe(true)

    // Voucher 298: Electricity Charges -> classified as Expense
    const vch298 = result.vouchers.find(v => v.voucherNumber === '298')
    expect(vch298).toBeDefined()
    expect(vch298?.normalizedType).toBe('expense')
    expect(vch298?.partyName).toBe('Electricity Charges')
    expect(vch298?.totalAmount).toBe(12450)

    // Candidate expense category generated
    expect(result.newMasterCandidates.expenseCategories.some(e => e.name === 'Electricity Charges')).toBe(true)
  })

  it('auto-resolves Cash Sales and extracts missing inventory item candidates', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <BODY>
    <IMPORTDATA>
      <REQUESTDATA>
        <TALLYMESSAGE>
          <VOUCHER VCHTYPE="Sales" ACTION="Create">
            <DATE>20260410</DATE>
            <VOUCHERNUMBER>SKT/25-26/83</VOUCHERNUMBER>
            <PARTYLEDGERNAME>Cash</PARTYLEDGERNAME>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Cash</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-4500.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Sales A/c</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>4500.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>GP PIPE 1 INCH</STOCKITEMNAME>
              <BILLEDQTY> 10 PCS</BILLEDQTY>
              <RATE>450.00/PCS</RATE>
              <AMOUNT>-4500.00</AMOUNT>
            </ALLINVENTORYENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`

    const result = parseTallyXmlVouchers(xml, {
      customers: [],
      suppliers: [],
      items: [],
      expenseTypes: [],
      counters: []
    })

    expect(result.success).toBe(true)
    expect(result.vouchers).toHaveLength(1)

    const vch = result.vouchers[0]
    expect(vch.normalizedType).toBe('sales')
    expect(vch.partyName).toBe('Cash Customer')
    expect(vch.matchedEntityType).toBe('customer')
    expect(vch.matchedEntityId).toBe('cust-cash')
    expect(vch.totalAmount).toBe(4500)

    // Inventory items extracted
    expect(vch.inventory).toHaveLength(1)
    expect(vch.inventory[0].itemName).toBe('GP PIPE 1 INCH')
    expect(vch.inventory[0].quantity).toBe(10)
    expect(vch.inventory[0].rate).toBe(450)
    expect(vch.inventory[0].amount).toBe(4500)

    // Item candidate registered
    expect(result.newMasterCandidates.items).toHaveLength(1)
    expect(result.newMasterCandidates.items[0].name).toBe('GP PIPE 1 INCH')
    expect(result.newMasterCandidates.items[0].rate).toBe(450)
  })

  it('correctly parses multi-item Purchase Voucher with Freight charges, statutory taxes, and round off', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <BODY>
    <IMPORTDATA>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Purchase" ACTION="Create">
            <DATE>20260410</DATE>
            <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
            <VOUCHERNUMBER>RV1200012668</VOUCHERNUMBER>
            <PARTYLEDGERNAME>Captain Steel India Limited</PARTYLEDGERNAME>
            <PARTYGSTIN>19AAACC1234F1Z9</PARTYGSTIN>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Captain Steel India Limited</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>830652.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Purchase Account</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-702742.37</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Freight Charges</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-1200.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Input CGST</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-63354.81</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Input SGST</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-63354.81</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Round Off</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-0.01</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>8MM TMT BAR</STOCKITEMNAME>
              <ACTUALQTY>9.06 TON</ACTUALQTY>
              <BILLEDQTY>9.06 TON</BILLEDQTY>
              <RATE>58628.80/TON</RATE>
              <AMOUNT>-531176.89</AMOUNT>
            </ALLINVENTORYENTRIES.LIST>
            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>12MM TMT BAR</STOCKITEMNAME>
              <ACTUALQTY>3.00 TON</ACTUALQTY>
              <BILLEDQTY>3.00 TON</BILLEDQTY>
              <RATE>57188.49/TON</RATE>
              <AMOUNT>-171565.48</AMOUNT>
            </ALLINVENTORYENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`

    const result = parseTallyXmlVouchers(xml, {
      customers: [],
      suppliers: [{ id: 'sup-captain', name: 'Captain Steel India Limited', gstin: '19AAACC1234F1Z9', stateCode: '19', paymentCDRules: [], invoiceCloseCDRules: [] }],
      items: [
        { id: 'item-8mm', name: '8MM TMT BAR', unit: 'TON', purchasePrice: 58628.80, salesPrice: 60000, gstRate: 18, category: 'TMT' },
        { id: 'item-12mm', name: '12MM TMT BAR', unit: 'TON', purchasePrice: 57188.49, salesPrice: 59000, gstRate: 18, category: 'TMT' }
      ],
      expenseTypes: [],
      counters: []
    })

    expect(result.success).toBe(true)
    expect(result.vouchers).toHaveLength(1)

    const vch = result.vouchers[0]
    expect(vch.voucherNumber).toBe('RV1200012668')
    expect(vch.normalizedType).toBe('purchase')
    expect(vch.partyName).toBe('Captain Steel India Limited')
    expect(vch.totalAmount).toBe(830652.00)

    // Check Multi-Item Extraction
    expect(vch.inventory).toHaveLength(2)
    expect(vch.inventory[0].itemName).toBe('8MM TMT BAR')
    expect(vch.inventory[0].quantity).toBe(9.06)
    expect(vch.inventory[0].amount).toBe(531176.89)

    expect(vch.inventory[1].itemName).toBe('12MM TMT BAR')
    expect(vch.inventory[1].quantity).toBe(3.00)
    expect(vch.inventory[1].amount).toBe(171565.48)

    // Check Additional Charges (Freight)
    expect(vch.additionalCharges).toBeDefined()
    expect(vch.additionalCharges).toHaveLength(1)
    expect(vch.additionalCharges![0].ledgerName).toBe('Freight Charges')
    expect(vch.additionalCharges![0].sacCode).toBe('996511')
    expect(vch.additionalCharges![0].taxableAmount).toBe(1200.00)
    expect(vch.additionalCharges![0].cgstAmount).toBe(108.00)
    expect(vch.additionalCharges![0].sgstAmount).toBe(108.00)
    expect(vch.additionalCharges![0].finalAmt).toBe(1416.00)

    // Check Statutory Tax Breakdown & Round Off
    expect(vch.cgstAmount).toBe(63354.81)
    expect(vch.sgstAmount).toBe(63354.81)
    expect(vch.roundOff).toBe(0.01)
    expect(vch.taxableAmount).toBe(703942.37)
  })
})
