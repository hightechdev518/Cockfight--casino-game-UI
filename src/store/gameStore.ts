import { create } from 'zustand'

export type BetType = 'dragon' | 'tiger' | 'tie' | 'dragonRed' | 'dragonBlack' | 'tigerRed' | 'tigerBlack' | 'dragonOdd' | 'dragonEven' | 'tigerOdd' | 'tigerEven'

export interface Bet {
  id: string
  type: BetType
  amount: number
  odds: number
  timestamp: number
}

export interface GameHistory {
  round: number
  result: 'dragon' | 'tiger' | 'tie'
  dragonCard?: { suit: 'red' | 'black', value: number }
  tigerCard?: { suit: 'red' | 'black', value: number }
}

export interface GameState {
  isLive: boolean
  gameId: string
  tableId: string
  bets: Bet[]
  selectedChip: number
  totalBet: number
  accountBalance: number
  autoSubmit: boolean
  gameHistory: GameHistory[]
  connectionStatus: 'connected' | 'disconnected' | 'connecting'
  currentRound?: number
  countdown?: number
}

interface GameStore extends GameState {
  initializeGame: (data: Partial<GameState>) => void
  updateGameStatus: (status: Partial<GameState>) => void
  addBet: (bet: Bet) => void
  removeBet: (betId: string) => void
  setSelectedChip: (amount: number) => void
  setTotalBet: (amount: number) => void
  clearBets: () => void
  toggleAutoSubmit: () => void
  doubleBets: () => void
  addGameHistory: (history: GameHistory) => void
  setConnectionStatus: (status: GameState['connectionStatus']) => void
  setAccountBalance: (balance: number) => void
}

const initialState: GameState = {
  isLive: true,
  gameId: 'CBXE08251119097',
  tableId: 'E08',
  bets: [],
  selectedChip: 20,
  totalBet: 0,
  accountBalance: 101000.00,
  autoSubmit: false,
  gameHistory: [],
  connectionStatus: 'disconnected',
  currentRound: 40,
  countdown: 10
}

export const useGameStore = create<GameStore>((set) => ({
  ...initialState,
  
  initializeGame: (data) => set((state) => ({ ...state, ...data })),
  
  updateGameStatus: (status) => set((state) => ({ ...state, ...status })),
  
  addBet: (bet) => set((state) => ({
    bets: [...state.bets, bet],
    totalBet: state.totalBet + bet.amount
  })),
  
  removeBet: (betId) => set((state) => ({
    bets: state.bets.filter(b => b.id !== betId),
    totalBet: state.bets.filter(b => b.id !== betId).reduce((sum, b) => sum + b.amount, 0)
  })),
  
  setSelectedChip: (amount) => set({ selectedChip: amount }),
  
  setTotalBet: (amount) => set({ totalBet: amount }),
  
  clearBets: () => set({ bets: [], totalBet: 0 }),
  
  toggleAutoSubmit: () => set((state) => ({ autoSubmit: !state.autoSubmit })),
  
  doubleBets: () => set((state) => ({
    bets: state.bets.map(bet => ({ ...bet, amount: bet.amount * 2 })),
    totalBet: state.totalBet * 2
  })),
  
  addGameHistory: (history) => set((state) => ({
    gameHistory: [...state.gameHistory, history]
  })),
  
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  
  setAccountBalance: (balance) => set({ accountBalance: balance })
}))
