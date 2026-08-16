import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  sanitizeTallyXmlString,
  decodeXmlFileBuffer,
  parseTallyXmlDate,
  normalizeTallyVoucherType,
  parseTallyXmlVouchers
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

  it('parses real export Transactions.xml (UTF-16LE) correctly without runtime errors', () => {
    const transactionsPath = path.resolve(process.cwd(), 'Transactions.xml')
    if (fs.existsSync(transactionsPath)) {
      const rawBuf = fs.readFileSync(transactionsPath)
      const decoded = decodeXmlFileBuffer(rawBuf)
      expect(decoded.length).toBeGreaterThan(10000)

      const result = parseTallyXmlVouchers(decoded, {
        customers: mockCustomers,
        suppliers: mockSuppliers
      })

      expect(result.success).toBe(true)
      expect(result.summary.totalParsed).toBe(1042)
      expect(result.summary.salesCount).toBe(448)
      expect(result.summary.purchaseCount).toBe(103)
      expect(result.summary.receiptCount).toBe(216)
      expect(result.summary.paymentCount).toBe(213)
      expect(result.summary.skippedCount).toBe(62) // 26 Contra + 36 Journal skipped per standard audit policy
    }
  })
})
