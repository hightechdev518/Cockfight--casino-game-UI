import { BetType } from '../store/gameStore'

/**
 * Maps frontend bet types to backend bet type codes and zones
 */
export interface BackendBetMapping {
  type: '21001' | '21002' | '21003' // Meron, Wala, Draw
  zone: string // M, W, D or derived X@YZ
}

/**
 * Bet type mapping configuration
 */
const BET_TYPE_MAP: Record<BetType, BackendBetMapping> = {
  meron: { type: '21001', zone: 'M' },
  wala: { type: '21002', zone: 'W' },
  draw: { type: '21003', zone: 'D' },
  meronRed: { type: '21001', zone: 'MR' },
  meronBlack: { type: '21001', zone: 'MB' },
  walaRed: { type: '21002', zone: 'WR' },
  walaBlack: { type: '21002', zone: 'WB' },
  meronOdd: { type: '21001', zone: 'MO' },
  meronEven: { type: '21001', zone: 'ME' },
  walaOdd: { type: '21002', zone: 'WO' },
  walaEven: { type: '21002', zone: 'WE' },
}

/**
 * Converts frontend bet type to backend bet type and zone
 */
export const mapBetTypeToBackend = (betType: BetType): BackendBetMapping => {
  return BET_TYPE_MAP[betType] || BET_TYPE_MAP.meron
}

/**
 * Gets the display name for a bet type
 */
export const getBetTypeDisplayName = (betType: BetType): string => {
  const names: Record<BetType, string> = {
    meron: 'Meron',
    wala: 'Wala',
    draw: 'Draw',
    meronRed: 'Meron Red',
    meronBlack: 'Meron Black',
    walaRed: 'Wala Red',
    walaBlack: 'Wala Black',
    meronOdd: 'Meron Odd',
    meronEven: 'Meron Even',
    walaOdd: 'Wala Odd',
    walaEven: 'Wala Even',
  }
  return names[betType] || betType
}

/**
 * Maps backend bet format to frontend BetType
 * @param w_bettype - Backend bet type code (21001, 21002, 21003)
 * @param w_betzone - Backend bet zone (M, W, D, MR, MB, WR, WB, MO, ME, WO, WE)
 * @returns BetType or null if cannot map
 */
export const mapBackendToBetType = (w_bettype: string | number, w_betzone: string): BetType | null => {
  const bettype = typeof w_bettype === 'string' ? parseInt(w_bettype, 10) : w_bettype
  const zone = (w_betzone || '').toUpperCase()
  
  // Map by bet type code and zone
  if (bettype === 21001) { // Meron
    if (zone === 'M' || zone === '') return 'meron'
    if (zone === 'MR' || zone === 'RED') return 'meronRed'
    if (zone === 'MB' || zone === 'BLACK') return 'meronBlack'
    if (zone === 'MO' || zone === 'ODD') return 'meronOdd'
    if (zone === 'ME' || zone === 'EVEN') return 'meronEven'
    return 'meron' // Default to meron if zone unknown
  }
  
  if (bettype === 21002) { // Wala
    if (zone === 'W' || zone === '') return 'wala'
    if (zone === 'WR' || zone === 'RED') return 'walaRed'
    if (zone === 'WB' || zone === 'BLACK') return 'walaBlack'
    if (zone === 'WO' || zone === 'ODD') return 'walaOdd'
    if (zone === 'WE' || zone === 'EVEN') return 'walaEven'
    return 'wala' // Default to wala if zone unknown
  }
  
  if (bettype === 21003) { // Draw
    if (zone === 'D' || zone === '' || zone === 'DRAW') return 'draw'
    return 'draw' // Default to draw
  }
  
  return null
}

