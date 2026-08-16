export interface IndianState {
  code: string
  name: string
  type: 'state' | 'ut'
}

/**
 * Official Master List of all 36 Indian States and Union Territories with 2-digit GST Codes
 */
export const INDIAN_STATES: IndianState[] = [
  { code: '01', name: 'Jammu and Kashmir', type: 'ut' },
  { code: '02', name: 'Himachal Pradesh', type: 'state' },
  { code: '03', name: 'Punjab', type: 'state' },
  { code: '04', name: 'Chandigarh', type: 'ut' },
  { code: '05', name: 'Uttarakhand', type: 'state' },
  { code: '06', name: 'Haryana', type: 'state' },
  { code: '07', name: 'Delhi', type: 'ut' },
  { code: '08', name: 'Rajasthan', type: 'state' },
  { code: '09', name: 'Uttar Pradesh', type: 'state' },
  { code: '10', name: 'Bihar', type: 'state' },
  { code: '11', name: 'Sikkim', type: 'state' },
  { code: '12', name: 'Arunachal Pradesh', type: 'state' },
  { code: '13', name: 'Nagaland', type: 'state' },
  { code: '14', name: 'Manipur', type: 'state' },
  { code: '15', name: 'Mizoram', type: 'state' },
  { code: '16', name: 'Tripura', type: 'state' },
  { code: '17', name: 'Meghalaya', type: 'state' },
  { code: '18', name: 'Assam', type: 'state' },
  { code: '19', name: 'West Bengal', type: 'state' },
  { code: '20', name: 'Jharkhand', type: 'state' },
  { code: '21', name: 'Odisha', type: 'state' },
  { code: '22', name: 'Chhattisgarh', type: 'state' },
  { code: '23', name: 'Madhya Pradesh', type: 'state' },
  { code: '24', name: 'Gujarat', type: 'state' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu', type: 'ut' },
  { code: '27', name: 'Maharashtra', type: 'state' },
  { code: '29', name: 'Karnataka', type: 'state' },
  { code: '30', name: 'Goa', type: 'state' },
  { code: '31', name: 'Lakshadweep', type: 'ut' },
  { code: '32', name: 'Kerala', type: 'state' },
  { code: '33', name: 'Tamil Nadu', type: 'state' },
  { code: '34', name: 'Puducherry', type: 'ut' },
  { code: '35', name: 'Andaman and Nicobar Islands', type: 'ut' },
  { code: '36', name: 'Telangana', type: 'state' },
  { code: '37', name: 'Andhra Pradesh', type: 'state' },
  { code: '38', name: 'Ladakh', type: 'ut' },
  { code: '97', name: 'Other Territory', type: 'ut' }
]

export const DEFAULT_COMPANY_STATE: IndianState = {
  code: '19',
  name: 'West Bengal',
  type: 'state'
}

/**
 * Normalizes input string to look up state
 */
function cleanString(str?: string): string {
  return (str || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Gets IndianState by 2-digit code (e.g. '19', '09', '10')
 */
export function getStateByCode(code?: string): IndianState | undefined {
  if (!code) return undefined
  const padded = code.trim().padStart(2, '0')
  return INDIAN_STATES.find(s => s.code === padded)
}

/**
 * Gets IndianState by state name (case-insensitive fuzzy match)
 */
export function getStateByName(name?: string): IndianState | undefined {
  if (!name) return undefined
  const cleaned = cleanString(name)
  if (!cleaned) return undefined

  // Direct code match
  if (/^\d{1,2}$/.test(name.trim())) {
    return getStateByCode(name)
  }

  // Common abbreviation aliases
  if (cleaned === 'wb' || cleaned === 'westbengal') return getStateByCode('19')
  if (cleaned === 'mh' || cleaned === 'maharashtra') return getStateByCode('27')
  if (cleaned === 'dl' || cleaned === 'delhi' || cleaned === 'nctofdelhi') return getStateByCode('07')
  if (cleaned === 'or' || cleaned === 'od' || cleaned === 'odisha' || cleaned === 'orissa') return getStateByCode('21')
  if (cleaned === 'jh' || cleaned === 'jharkhand') return getStateByCode('20')
  if (cleaned === 'br' || cleaned === 'bihar') return getStateByCode('10')
  if (cleaned === 'up' || cleaned === 'uttarpradesh') return getStateByCode('09')
  if (cleaned === 'uk' || cleaned === 'uttarakhand' || cleaned === 'uttaranchal') return getStateByCode('05')
  if (cleaned === 'tn' || cleaned === 'tamilnadu') return getStateByCode('33')
  if (cleaned === 'ka' || cleaned === 'karnataka') return getStateByCode('29')
  if (cleaned === 'kl' || cleaned === 'kerala') return getStateByCode('32')
  if (cleaned === 'gj' || cleaned === 'gujarat') return getStateByCode('24')
  if (cleaned === 'rj' || cleaned === 'rajasthan') return getStateByCode('08')
  if (cleaned === 'mp' || cleaned === 'madhyapradesh') return getStateByCode('23')
  if (cleaned === 'pb' || cleaned === 'punjab') return getStateByCode('03')
  if (cleaned === 'hr' || cleaned === 'haryana') return getStateByCode('06')
  if (cleaned === 'ts' || cleaned === 'tg' || cleaned === 'telangana') return getStateByCode('36')
  if (cleaned === 'ap' || cleaned === 'andhrapradesh') return getStateByCode('37')
  if (cleaned === 'as' || cleaned === 'assam') return getStateByCode('18')

  return INDIAN_STATES.find(s => cleanString(s.name) === cleaned) ||
         INDIAN_STATES.find(s => cleanString(s.name).includes(cleaned) || cleaned.includes(cleanString(s.name)))
}

/**
 * Extracts 2-digit state code from GSTIN and returns the corresponding IndianState
 * Example: '19AAAAA0000A1Z5' -> State '19' (West Bengal)
 */
export function getStateFromGstin(gstin?: string): IndianState | undefined {
  if (!gstin) return undefined
  const trimmed = gstin.trim().toUpperCase()
  if (trimmed.length >= 2) {
    const code = trimmed.substring(0, 2)
    if (/^\d{2}$/.test(code)) {
      return getStateByCode(code)
    }
  }
  return undefined
}

/**
 * Formats state into '[Code] State Name' display format (e.g. '[19] West Bengal')
 */
export function formatStateWithCode(stateOrCode?: string): string {
  if (!stateOrCode) return `[${DEFAULT_COMPANY_STATE.code}] ${DEFAULT_COMPANY_STATE.name}`
  const found = getStateByCode(stateOrCode) || getStateByName(stateOrCode)
  if (found) {
    return `[${found.code}] ${found.name}`
  }
  return stateOrCode
}

/**
 * Resolves 2-digit GST state code string (e.g. '19') from code, name, or GSTIN
 */
export function getStateCode(stateOrCodeOrGstin?: string): string {
  if (!stateOrCodeOrGstin) return DEFAULT_COMPANY_STATE.code
  const found = getStateFromGstin(stateOrCodeOrGstin) ||
                getStateByCode(stateOrCodeOrGstin) ||
                getStateByName(stateOrCodeOrGstin)
  return found?.code || DEFAULT_COMPANY_STATE.code
}

/**
 * Resolves state name string (e.g. 'West Bengal')
 */
export function getStateName(stateOrCodeOrGstin?: string): string {
  if (!stateOrCodeOrGstin) return DEFAULT_COMPANY_STATE.name
  const found = getStateFromGstin(stateOrCodeOrGstin) ||
                getStateByCode(stateOrCodeOrGstin) ||
                getStateByName(stateOrCodeOrGstin)
  return found?.name || DEFAULT_COMPANY_STATE.name
}
