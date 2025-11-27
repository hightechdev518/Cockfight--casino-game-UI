import axios from 'axios'

// Configure your API base URL here
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
})

// Request interceptor for adding auth tokens if needed
apiClient.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token = localStorage.getItem('authToken')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Silently handle network errors - server may not be running (expected in dev)
    // Only log actual API errors (4xx, 5xx) when server is available
    if (error.response) {
      // Server responded with error status
      if (import.meta.env.DEV) {
        console.warn('API Error:', error.response.status, error.response.data)
      }
    }
    // Don't log network errors (connection refused, etc.) - expected when server isn't running
    return Promise.reject(error)
  }
)

export interface BetRequest {
  gameId: string
  betType: 'team1' | 'team2' | 'draw'
  amount: number
}

export interface BetResponse {
  success: boolean
  betId: string
  message?: string
}

export interface ScoreResponse {
  team1: string
  team2: string
  score1: number
  score2: number
  period: string
  timeRemaining?: string
}

export interface GameStatusResponse {
  isLive: boolean
  gameId: string
  gameType?: string
}

export const apiService = {
  // Place a bet
  placeBet: async (betData: BetRequest): Promise<BetResponse> => {
    const response = await apiClient.post<BetResponse>('/bets', betData)
    return response.data
  },

  // Get current scores
  getScores: async (gameId?: string): Promise<ScoreResponse> => {
    const url = gameId ? `/scores/${gameId}` : '/scores'
    const response = await apiClient.get<ScoreResponse>(url)
    return response.data
  },

  // Get game status
  getGameStatus: async (gameId?: string): Promise<GameStatusResponse> => {
    const url = gameId ? `/game/status/${gameId}` : '/game/status'
    const response = await apiClient.get<GameStatusResponse>(url)
    return response.data
  },

  // Get betting history
  getBetHistory: async (): Promise<any[]> => {
    const response = await apiClient.get('/bets/history')
    return response.data
  },

  // Get available odds
  getOdds: async (gameId?: string): Promise<any> => {
    const url = gameId ? `/odds/${gameId}` : '/odds'
    const response = await apiClient.get(url)
    return response.data
  },
}

