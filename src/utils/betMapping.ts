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

