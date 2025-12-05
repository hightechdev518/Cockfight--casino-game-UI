import { create } from 'zustand'

// localStorage keys for persistence
const STORAGE_KEY_BALANCE = 'game_balance'
const STORAGE_KEY_BETS = 'game_bets'
const STORAGE_KEY_TOTAL_BET = 'game_total_bet'
const STORAGE_KEY_ROUND_ID = 'game_round_id' // Track which round the persisted data belongs to

export type BetType = 'meron' | 'wala' | 'draw' | 'meronRed' | 'meronBlack' | 'walaRed' | 'walaBlack' | 'meronOdd' | 'meronEven' | 'walaOdd' | 'walaEven'

/**
 * Save balance, bets, and totalBet to localStorage
 * Only save if roundId is provided (data is associated with a specific round)
 */
const savePersistedData = (balance: number, bets: Bet[], totalBet: number, roundId?: string) => {
  try {
    if (roundId) {
      localStorage.setItem(STORAGE_KEY_BALANCE, balance.toString())
      localStorage.setItem(STORAGE_KEY_BETS, JSON.stringify(bets))
      localStorage.setItem(STORAGE_KEY_TOTAL_BET, totalBet.toString())
      localStorage.setItem(STORAGE_KEY_ROUND_ID, roundId)
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Failed to save persisted data:', error)
    }
  }
}

/**
 * Load persisted balance, bets, and totalBet from localStorage
 * Only load if roundId matches (data is for the current round)
 */
export const loadPersistedData = (currentRoundId?: string): {
  balance: number | null
  bets: Bet[]
  totalBet: number
} => {
  try {
    const storedRoundId = localStorage.getItem(STORAGE_KEY_ROUND_ID)
    
    // Only load if roundId matches (same round) or if no roundId is set yet
    if (!currentRoundId || storedRoundId === currentRoundId) {
      const balanceStr = localStorage.getItem(STORAGE_KEY_BALANCE)
      const betsStr = localStorage.getItem(STORAGE_KEY_BETS)
      const totalBetStr = localStorage.getItem(STORAGE_KEY_TOTAL_BET)
      
      const balance = balanceStr ? parseFloat(balanceStr) : null
      const bets = betsStr ? JSON.parse(betsStr) : []
      const totalBet = totalBetStr ? parseFloat(totalBetStr) : 0
      
      return { balance, bets, totalBet }
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Failed to load persisted data:', error)
    }
  }
  
  return { balance: null, bets: [], totalBet: 0 }
}

/**
 * Clear persisted data from localStorage
 */
export const clearPersistedData = () => {
  try {
    localStorage.removeItem(STORAGE_KEY_BALANCE)
    localStorage.removeItem(STORAGE_KEY_BETS)
    localStorage.removeItem(STORAGE_KEY_TOTAL_BET)
    localStorage.removeItem(STORAGE_KEY_ROUND_ID)
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Failed to clear persisted data:', error)
    }
  }
}

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
  betLimitMin?: number // Minimum bet limit from API
  betLimitMax?: number // Maximum bet limit from API
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
  
  initializeGame: (data) => {
    set((state) => {
      const previousRoundId = state.roundId
      const newRoundId = data.roundId || state.roundId
      
      // If roundId changed, clear persisted bets (new round started)
      if (previousRoundId && newRoundId && previousRoundId !== newRoundId) {
        clearPersistedData()
        if (import.meta.env.DEV) {
          console.log('🔄 New round detected in initializeGame, clearing persisted bets. Previous:', previousRoundId, 'New:', newRoundId)
        }
        // Clear bets when round changes
        const newState = { ...state, ...data, bets: [], totalBet: 0 }
        if (newState.roundId) {
          savePersistedData(newState.accountBalance, newState.bets, newState.totalBet, newState.roundId)
        }
        return newState
      }
      
      // If roundId is set for the first time, try to load persisted data
      if (newRoundId && !previousRoundId && !data.bets && !data.totalBet && !data.accountBalance) {
        const persisted = loadPersistedData(newRoundId)
        if (persisted.balance !== null || persisted.bets.length > 0 || persisted.totalBet > 0) {
          if (import.meta.env.DEV) {
            console.log('📦 Loading persisted data in initializeGame for round:', newRoundId, persisted)
          }
          const newState = {
            ...state,
            ...data,
            accountBalance: persisted.balance !== null ? persisted.balance : (data.accountBalance ?? state.accountBalance),
            bets: persisted.bets,
            totalBet: persisted.totalBet
          }
          if (newState.roundId) {
            savePersistedData(newState.accountBalance, newState.bets, newState.totalBet, newState.roundId)
          }
          return newState
        }
      }
      
      const newState = { ...state, ...data }
      // Save to localStorage if roundId is available
      if (newState.roundId) {
        savePersistedData(newState.accountBalance, newState.bets, newState.totalBet, newState.roundId)
      }
      return newState
    })
  },
  
  updateGameStatus: (status) => {
    set((state) => {
      const newState = { ...state, ...status }
      // Save to localStorage if roundId is available
      if (newState.roundId) {
        savePersistedData(newState.accountBalance, newState.bets, newState.totalBet, newState.roundId)
      }
      return newState
    })
  },
  
  addBet: (bet) => set((state) => {
    const newBets = [...state.bets, bet]
    const newTotalBet = state.totalBet + bet.amount
    // Save to localStorage if roundId is available
    if (state.roundId) {
      savePersistedData(state.accountBalance, newBets, newTotalBet, state.roundId)
    }
    return {
      bets: newBets,
      totalBet: newTotalBet
    }
  }),
  
  removeBet: (betId) => set((state) => {
    const newBets = state.bets.filter(b => b.id !== betId)
    const newTotalBet = newBets.reduce((sum, b) => sum + b.amount, 0)
    // Save to localStorage if roundId is available
    if (state.roundId) {
      savePersistedData(state.accountBalance, newBets, newTotalBet, state.roundId)
    }
    return {
      bets: newBets,
      totalBet: newTotalBet
    }
  }),
  
  setSelectedChip: (amount) => set({ selectedChip: amount }),
  
  setTotalBet: (amount) => set((state) => {
    // Save to localStorage if roundId is available
    if (state.roundId) {
      savePersistedData(state.accountBalance, state.bets, amount, state.roundId)
    }
    return { totalBet: amount }
  }),
  
  clearBets: () => set((state) => {
    // Save to localStorage if roundId is available
    if (state.roundId) {
      savePersistedData(state.accountBalance, [], 0, state.roundId)
    }
    return { bets: [], totalBet: 0 }
  }),
  
  toggleAutoSubmit: () => set((state) => ({ autoSubmit: !state.autoSubmit })),
  
  doubleBets: () => set((state) => {
    const newBets = state.bets.map(bet => ({ ...bet, amount: bet.amount * 2 }))
    const newTotalBet = state.totalBet * 2
    // Save to localStorage if roundId is available
    if (state.roundId) {
      savePersistedData(state.accountBalance, newBets, newTotalBet, state.roundId)
    }
    return {
      bets: newBets,
      totalBet: newTotalBet
    }
  }),
  
  addGameHistory: (history) => set((state) => ({
    gameHistory: [...state.gameHistory, history]
  })),

  setGameHistory: (history) => set({ gameHistory: history }),

  setConnectionStatus: (status) => set({ connectionStatus: status }),
  
  setAccountBalance: (balance) => set((state) => {
    // Save to localStorage if roundId is available
    if (state.roundId) {
      savePersistedData(balance, state.bets, state.totalBet, state.roundId)
    }
    return { accountBalance: balance }
  }),

  toggleGameSummary: () => set((state) => ({ showGameSummary: !state.showGameSummary })),

  setGameSummary: (show) => set({ showGameSummary: show }),

  setRoundId: (roundId) => {
    set((state) => {
      const previousRoundId = state.roundId
      
      // If roundId changed, clear persisted bets (new round started)
      if (previousRoundId && previousRoundId !== roundId) {
        clearPersistedData()
        if (import.meta.env.DEV) {
          console.log('🔄 New round detected, clearing persisted bets. Previous:', previousRoundId, 'New:', roundId)
        }
        return {
          ...state,
          roundId: roundId,
          bets: [],
          totalBet: 0
        }
      }
      
      // If roundId is set for the first time, try to load persisted data
      if (roundId && !previousRoundId) {
        const persisted = loadPersistedData(roundId)
        if (persisted.balance !== null || persisted.bets.length > 0 || persisted.totalBet > 0) {
          if (import.meta.env.DEV) {
            console.log('📦 Loading persisted data for round:', roundId, persisted)
          }
          return {
            ...state,
            roundId: roundId,
            accountBalance: persisted.balance !== null ? persisted.balance : state.accountBalance,
            bets: persisted.bets,
            totalBet: persisted.totalBet
          }
        }
      }
      
      return { ...state, roundId: roundId }
    })
  },

  setBettingError: (error) => set({ bettingError: error }),

  switchTable: (tableId: string) => {
    set((state) => {
      // Clear persisted data when switching tables
      clearPersistedData()
      // Clear game history when switching tables
      return {
        ...state,
        tableId: tableId,
        gameHistory: [],
        currentRound: undefined,
        roundId: undefined,
        countdown: undefined,
        bets: [],
        totalBet: 0
      }
    })
  }
}))
