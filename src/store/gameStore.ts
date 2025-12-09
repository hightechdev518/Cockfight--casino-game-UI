import { create } from 'zustand'

// localStorage keys for persistence
const STORAGE_KEY_BALANCE = 'game_balance'
const STORAGE_KEY_BETS = 'game_bets'
const STORAGE_KEY_TOTAL_BET = 'game_total_bet'
const STORAGE_KEY_ROUND_ID = 'game_round_id' // Track which round the persisted data belongs to
const STORAGE_KEY_TABLE_ID = 'game_table_id' // Persist tableId across reloads

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
  lastRoundBets: Bet[] // Store bets from the last settled round for rebet functionality
  sessionExpired: boolean // Session expired flag (B232 error)
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
  saveLastRoundBets: (bets: Bet[]) => void
  getLastRoundBets: () => Bet[]
  setSessionExpired: (expired: boolean) => void
}

// Load persisted data on initialization (if available)
// This ensures bets persist across page refreshes
const getInitialState = (): GameState => {
  // Try to load persisted data immediately on page load
  // Check if there's a stored roundId first
  const storedRoundId = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_ROUND_ID) : null
  const persisted = storedRoundId ? loadPersistedData(storedRoundId) : { balance: null, bets: [], totalBet: 0 }
  
  // Get tableId from URL first, then localStorage, then default
  let initialTableId = 'CF02' // Default to CF02 (matching App.tsx default)
  if (typeof window !== 'undefined') {
    // Check URL parameter first (highest priority)
    const urlParams = new URLSearchParams(window.location.search)
    const urlTableId = urlParams.get('tableid')
    if (urlTableId) {
      initialTableId = urlTableId.toUpperCase()
    } else {
      // Fallback to localStorage if URL doesn't have tableid
      const storedTableId = localStorage.getItem(STORAGE_KEY_TABLE_ID)
      if (storedTableId) {
        initialTableId = storedTableId.toUpperCase()
        // Also update URL to match localStorage
        urlParams.set('tableid', initialTableId)
        window.history.replaceState({}, '', `${window.location.pathname}?${urlParams.toString()}`)
      }
    }
  }
  
  if (import.meta.env.DEV && (persisted.bets.length > 0 || persisted.totalBet > 0)) {
    console.log('📦 Loading persisted data on store initialization:', {
      roundId: storedRoundId,
      bets: persisted.bets.length,
      totalBet: persisted.totalBet,
      balance: persisted.balance
    })
  }
  
  if (import.meta.env.DEV) {
    console.log('📦 Initializing tableId:', initialTableId, {
      fromUrl: typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tableid') : null,
      fromStorage: typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_TABLE_ID) : null
    })
  }
  
  return {
    isLive: true,
    gameId: '', // Will be set from API (playerinfo.php gidlist)
    tableId: initialTableId, // From URL or localStorage, default to CF02
    bets: persisted.bets || [],
    selectedChip: 20,
    totalBet: persisted.totalBet || 0,
    accountBalance: persisted.balance !== null ? persisted.balance : 0, // Will be fetched from API
    autoSubmit: false,
    gameHistory: [],
    connectionStatus: 'disconnected',
    currentRound: undefined, // Will be set from API/WebSocket (lobbyinfo.php or WebSocket)
    countdown: undefined, // Timer only shows after game result, set by WebSocket/API
    showGameSummary: false,
    bettingError: null,
    roundId: storedRoundId || undefined, // Restore roundId if available, otherwise from API/WebSocket
    lastRoundBets: [], // Store bets from last settled round for rebet
    sessionExpired: false // Session expired flag
  }
}

const initialState: GameState = getInitialState()

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
      
      // If roundId is set, try to load persisted data (handles page refresh)
      // This ensures bets persist across page refreshes until round settles or new round starts
      if (newRoundId) {
        const persisted = loadPersistedData(newRoundId)
        const storedRoundId = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_ROUND_ID) : null
        
        // Load persisted data if:
        // 1. roundId matches stored roundId (same round, page was refreshed) AND we have persisted bets
        // 2. OR we have persisted bets/totalBet (user had bets before refresh)
        // 3. OR roundId is being set for the first time and we have persisted data
        const isSameRound = newRoundId === storedRoundId
        const hasPersistedBets = persisted.bets.length > 0 || persisted.totalBet > 0
        const shouldLoadPersisted = (isSameRound && hasPersistedBets) || 
                                   (!previousRoundId && hasPersistedBets) ||
                                   (newRoundId === previousRoundId && hasPersistedBets)
        
        if (shouldLoadPersisted) {
          if (import.meta.env.DEV) {
            console.log('📦 Loading persisted data in initializeGame for round:', newRoundId, {
              previousRoundId,
              storedRoundId,
              isSameRound,
              persisted: { bets: persisted.bets.length, totalBet: persisted.totalBet, balance: persisted.balance }
            })
          }
          const newState = {
            ...state,
            ...data,
            // Preserve persisted bets/totalBet if they exist (page refresh scenario)
            bets: persisted.bets.length > 0 ? persisted.bets : (data.bets ?? state.bets),
            totalBet: persisted.totalBet > 0 ? persisted.totalBet : (data.totalBet ?? state.totalBet),
            // Only override balance if persisted balance exists and no explicit balance provided
            accountBalance: (persisted.balance !== null && !data.accountBalance) ? persisted.balance : (data.accountBalance ?? state.accountBalance)
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
      const previousRoundStatus = state.roundStatus
      const newRoundStatus = status.roundStatus !== undefined ? status.roundStatus : state.roundStatus
      const newState = { ...state, ...status }
      
      // When round is settled (roundStatus becomes 4), fetch balance to reflect wins/losses
      // Also reset totalBet since the round is settled and bets are no longer active
      if (newRoundStatus === 4 && previousRoundStatus !== 4) {
        if (import.meta.env.DEV) {
          console.log('💰 Round settled (status 4), resetting totalBet and fetching balance to reflect wins/losses')
        }
        // Save last round's bets for rebet BEFORE clearing them
        if (state.bets && state.bets.length > 0) {
          newState.lastRoundBets = [...state.bets]
          if (import.meta.env.DEV) {
            console.log('💾 Saved last round bets for rebet in store:', state.bets.map((b: Bet) => ({ type: b.type, amount: b.amount })))
          }
        }
        // Reset totalBet when round is settled (game result comes)
        newState.totalBet = 0
        newState.bets = [] // Also clear bets array since round is settled
        clearPersistedData()
        
        // Trigger balance fetch - this will be handled by the component that watches roundStatus
        // We dispatch an event so components can listen and fetch balance
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('round_settled', {
            detail: {
              roundId: newState.roundId || state.roundId,
              previousRoundStatus,
              newRoundStatus
            }
          }))
        }
      }
      
      // Check if currentRound changed (most reliable indicator of new round)
      const currentRoundChanged = status.currentRound !== undefined && 
                                  state.currentRound !== undefined && 
                                  status.currentRound !== state.currentRound
      
      // Clear bets when new round starts (roundStatus changes from 4/settled to 1/betting open)
      // OR when currentRound changes (new round number)
      // This ensures betting areas are reset for the new round
      if (previousRoundStatus === 4 && newRoundStatus === 1) {
        if (import.meta.env.DEV) {
          console.log('🔄 New round started (status 4 -> 1), clearing bets and total bet')
        }
        newState.bets = []
        newState.totalBet = 0
        clearPersistedData()
      }
      // Also clear bets if currentRound changed (new round number detected)
      else if (currentRoundChanged) {
        if (import.meta.env.DEV) {
          console.log('🔄 New round detected (currentRound changed), clearing bets. Previous:', state.currentRound, 'New:', status.currentRound)
        }
        newState.bets = []
        newState.totalBet = 0
        clearPersistedData()
      }
      // Also clear bets if roundStatus becomes 1 and we have bets from previous round
      // This handles cases where status might not have been 4 before
      else if (newRoundStatus === 1 && state.bets.length > 0) {
        // Check if this is actually a new round by checking if roundId changed
        const roundIdChanged = status.roundId && status.roundId !== state.roundId
        if (roundIdChanged) {
          if (import.meta.env.DEV) {
            console.log('🔄 New round detected (roundId changed), clearing bets')
          }
          newState.bets = []
          newState.totalBet = 0
          clearPersistedData()
        }
      }
      
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
      
      // If roundId is set for the first time OR matches stored roundId, try to load persisted data
      // This handles page refresh scenarios where roundId comes from server
      if (roundId && (!previousRoundId || previousRoundId === roundId)) {
        const persisted = loadPersistedData(roundId)
        // Load persisted data if we have bets/totalBet OR if roundId matches (page refresh)
        const shouldLoadPersisted = persisted.bets.length > 0 || persisted.totalBet > 0 || 
                                   (roundId === previousRoundId && persisted.bets.length > 0)
        
        if (shouldLoadPersisted) {
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
      // Normalize tableId to uppercase
      const normalizedTableId = tableId.toUpperCase()
      
      // Save tableId to localStorage for persistence across reloads
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_TABLE_ID, normalizedTableId)
        if (import.meta.env.DEV) {
          console.log('💾 Saved tableId to localStorage:', normalizedTableId)
        }
      }
      
      // Clear persisted data when switching tables (bets are table-specific)
      clearPersistedData()
      // Clear game history and ALL game state when switching tables
      // This ensures betting area resets properly for the new table
      if (import.meta.env.DEV) {
        console.log('🔄 Switching table - clearing all game state:', {
          from: state.tableId,
          to: normalizedTableId
        })
      }
      return {
        ...state,
        tableId: normalizedTableId,
        gameHistory: [],
        currentRound: undefined,
        roundId: undefined,
        roundStatus: undefined, // CRITICAL: Clear roundStatus so betting area resets
        countdown: undefined,
        bets: [],
        totalBet: 0,
        bettingError: null, // Clear any betting errors
        lastRoundBets: [] // Clear last round bets when switching tables
      }
    })
  },

  saveLastRoundBets: (bets) => set({ lastRoundBets: bets }),

  getLastRoundBets: (): Bet[] => {
    const state = useGameStore.getState()
    return state.lastRoundBets
  },

  setSessionExpired: (expired: boolean) => set({ sessionExpired: expired }),
}))
