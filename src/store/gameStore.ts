import { create } from 'zustand'

export type BetType = 'meron' | 'wala' | 'draw' | 'meronRed' | 'meronBlack' | 'walaRed' | 'walaBlack' | 'meronOdd' | 'meronEven' | 'walaOdd' | 'walaEven'

export interface Bet {
  id: string
  type: BetType
  amount: number
  odds: number
  timestamp: number
}

export interface GameHistory {
  round: number
  result: 'meron' | 'wala' | 'draw'
  meronCard?: { suit: 'red' | 'black', value: number }
  walaCard?: { suit: 'red' | 'black', value: number }
  timestamp?: number
}

export interface GameState {
  isLive: boolean
  gameId: string
  tableId: string
  roundId?: string // Round ID for betting API
  bets: Bet[]
  selectedChip: number
  totalBet: number
  accountBalance: number
  autoSubmit: boolean
  gameHistory: GameHistory[]
  connectionStatus: 'connected' | 'disconnected' | 'connecting'
  currentRound?: number
  countdown?: number
  roundStatus?: number // Round status: 1 = betting open, 2 = betting closed/fighting, 4 = settled
  showGameSummary: boolean
  bettingError?: string | null // Store betting errors
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
  setGameHistory: (history: GameHistory[]) => void
  setConnectionStatus: (status: GameState['connectionStatus']) => void
  setAccountBalance: (balance: number) => void
  toggleGameSummary: () => void
  setGameSummary: (show: boolean) => void
  setRoundId: (roundId: string) => void
  setBettingError: (error: string | null) => void
  switchTable: (tableId: string) => void
}

const initialState: GameState = {
  isLive: true,
  gameId: 'CBXE08251119097',
  tableId: 'CF01', // Default to CF01 (will be overridden by URL parameter)
  bets: [],
  selectedChip: 20,
  totalBet: 0,
  accountBalance: 101000.00,
  autoSubmit: false,
  gameHistory: [],
  connectionStatus: 'disconnected',
  currentRound: 40,
  countdown: undefined, // Timer only shows after game result
  showGameSummary: false,
  bettingError: null
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

  setGameHistory: (history) => set({ gameHistory: history }),

  setConnectionStatus: (status) => set({ connectionStatus: status }),
  
  setAccountBalance: (balance) => set({ accountBalance: balance }),

  toggleGameSummary: () => set((state) => ({ showGameSummary: !state.showGameSummary })),

  setGameSummary: (show) => set({ showGameSummary: show }),

  setRoundId: (roundId) => set({ roundId }),

  setBettingError: (error) => set({ bettingError: error }),

  switchTable: (tableId: string) => {
    set((state) => {
      // Clear game history when switching tables
      return {
        ...state,
        tableId: tableId,
        gameHistory: [],
        currentRound: undefined,
        roundId: undefined,
        countdown: undefined,
      }
    })
  }
}))
