import axios from 'axios'
import { getCurrentLanguage } from '../utils/language'

// Configure your API base URL here
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://apih5.ho8.net'

// Session storage keys
const SESSION_STORAGE_KEY = 'mrlive_session_s_uqid'
const OPERATOR_ID_KEY = 'operator_id'
const USERNAME_KEY = 'username'

// Generate unique ID for replay protection
const generateUniqueId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
}

const applyLanguageHeaders = (lang: string) => {
  formClient.defaults.headers.common['Accept-Language'] = lang
  jsonClient.defaults.headers.common['Accept-Language'] = lang
}

// Create axios instance for form-encoded requests (betting endpoint)
const formClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  timeout: 30000, // Longer timeout for betting operations
})

// Create axios instance for JSON requests
const jsonClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
})

// Set initial language headers
applyLanguageHeaders(getCurrentLanguage())

// Update headers when language changes
if (typeof window !== 'undefined') {
  window.addEventListener('languageChanged', (event: any) => {
    const lang = event?.detail?.language
    if (lang) {
      applyLanguageHeaders(lang)
    }
  })
}

// Standard API response format
export interface ApiResponse<T = any> {
  code: string
  msg: string
  ts?: number
  data?: T
  balance?: number
  uniqueid?: string
  [key: string]: any
}

// Login request/response
export interface LoginRequest {
  operatorId: string
  username: string
  password: string
  language?: string
  uniqueid: string
  sign?: string
}

export interface LoginResponse extends ApiResponse {
  code: '0' | string // '0' means success, 700-725 are error codes
  uniqueid: string
  lobby_url?: string
}

// Player info response
// Original site structure: balance, username, currency, betlimit, gid, gidlist are at root level, not in data
export interface PlayerInfoResponse extends Omit<ApiResponse, 'balance'> {
  username?: string
  balance?: string | number // Can be string "507523.2000" or number
  currency?: string
  betlimit?: {
    min?: string
    max?: string
  }
  gid?: Record<string, string>
  gidlist?: Record<string, string>
  // Also support data structure for backward compatibility
  data?: {
    username?: string
    balance?: number
    currency?: string
    min?: number
    max?: number
    gid?: string[]
    gidlist?: Record<string, string>
  }
}

// Balance response
export interface BalanceResponse extends ApiResponse {
  balance: number
}

// Betting request
export interface BetRequest {
  sess_id: string
  t_id: string // Table ID
  r_id: string // Round ID
  type: '21001' | '21002' | '21003' // Meron, Wala, Draw
  zone: string // M, W, D or derived X@YZ
  amount: number
  odds: number | string // Numeric or "XXX" for testing
  uniqueid: string
  cuid?: string // Client tracking token
  anyodds?: 'Y' | 'N' // Y to accept server odds automatically
}

// Betting response (wager_rid.php format)
export interface BetResponse extends ApiResponse {
  balance?: number
  cuid?: string
  unsettle?: Array<{
    w_no: string
    w_t_id: string
    w_r_id: string | number
    w_type: string
    w_bet: string | number
    w_validbet: string | number | null
    w_win: string | number | null
    w_status: number
    w_betdate: string
    w_settledate: string | null
    w_updatedate: string | null
    w_info: string // JSON string
    w_bettype: string | number
    w_betzone: string
    w_bet_odds: string
    w_currency: string
    w_real: boolean
    w_bl_group: string
    w_exrate: string
    [key: string]: any
  }>
  settle?: Array<{
    w_no: string
    [key: string]: any
  }>
  // Legacy support
  allbets?: Array<{
    w_no: string
    w_bet: number
    w_bettype: string
    w_betzone: string
    [key: string]: any
  }>
}

// Odds response
export interface OddsResponse extends ApiResponse {
  data?: Array<{
    o_bettype: string
    o_opentype: string
    o_odds: number
    o_notes?: string
    o_bl_ratio?: number
    o_bl_group?: string
  }>
}

// Wager detail response
export interface WagerDetailResponse extends ApiResponse {
  data?: {
    w_no: string
    w_bet: number
    w_bettype: string
    w_betzone: string
    playback?: string
    [key: string]: any
  }
}

// Bet history response
// Note: wager_rid.php returns {code, msg, ts, unsettle, settle} at root level
// Other history endpoints may nest in data property
export interface BetHistoryResponse extends ApiResponse {
  unsettle?: any[]
  settle?: any[]
  followbet?: any[]
  data?: {
    unsettle?: any[]
    settle?: any[]
    followbet?: any[]
  }
}

// Error codes mapping
export const ERROR_CODES: Record<string, string> = {
  B100: 'Success',
  B201: 'Insufficient balance',
  B204: 'Account disabled',
  B210: 'Site/game maintenance or suspended',
  B211: 'Game/table not open',
  B212: 'Round/session not open for betting',
  B215: 'Missing bet-limit profile',
  B216: 'Amount outside bet-limit range',
  B217: 'Round-level bet limit exceeded',
  B230: 'Parameter/format error',
  B231: 'Duplicate uniqueid',
  B232: 'Session not found/expired',
  B240: 'Risk-control balance cap hit',
  B250: 'Odds changed',
  B251: 'Odds not found',
  B260: 'Wallet debit failed',
}

// Session management
export const sessionManager = {
  getSessionId: (): string | null => {
    return localStorage.getItem(SESSION_STORAGE_KEY)
  },

  setSessionId: (sessId: string): void => {
    localStorage.setItem(SESSION_STORAGE_KEY, sessId)
    // Dispatch event to notify that session was set (for grace period tracking)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('session_set', {
        detail: { timestamp: Date.now() }
      }))
    }
  },

  clearSession: (): void => {
    localStorage.removeItem(SESSION_STORAGE_KEY)
    localStorage.removeItem(OPERATOR_ID_KEY)
    localStorage.removeItem(USERNAME_KEY)
  },

  setOperatorInfo: (operatorId: string, username: string): void => {
    localStorage.setItem(OPERATOR_ID_KEY, operatorId)
    localStorage.setItem(USERNAME_KEY, username)
  },

  getOperatorInfo: (): { operatorId: string | null; username: string | null } => {
    return {
      operatorId: localStorage.getItem(OPERATOR_ID_KEY),
      username: localStorage.getItem(USERNAME_KEY),
    }
  },
}

// Response interceptor for error handling
const handleApiError = (error: any): never => {
  if (error.response?.data) {
    const response = error.response.data as ApiResponse
    const errorMsg = ERROR_CODES[response.code] || response.msg || 'Unknown error'
    throw new Error(`${response.code}: ${errorMsg}`)
  }
  if (error.request) {
    throw new Error('Network error: Unable to reach server')
  }
  throw new Error(error.message || 'An unexpected error occurred')
}

formClient.interceptors.response.use(
  (response) => response,
  (error) => handleApiError(error)
)

jsonClient.interceptors.response.use(
  (response) => response,
  (error) => handleApiError(error)
)

export const apiService = {
  /**
   * Login player via account/password (form-encoded)
   */
  login: async (request: LoginRequest): Promise<LoginResponse> => {
    const formData = new URLSearchParams()
    formData.append('operatorId', request.operatorId)
    formData.append('username', request.username)
    formData.append('password', request.password)
    if (request.language) formData.append('language', request.language)
    formData.append('uniqueid', request.uniqueid)
    if (request.sign) formData.append('sign', request.sign)

    const response = await formClient.post<LoginResponse>('/loginuidpid.php', formData.toString())
    
    // Extract sess_id from lobby_url if available
    if (response.data.lobby_url) {
      const urlParams = new URLSearchParams(response.data.lobby_url.split('?')[1])
      const sessId = urlParams.get('sess_id')
      if (sessId) {
        sessionManager.setSessionId(sessId)
        sessionManager.setOperatorInfo(request.operatorId, request.username)
      }
    }

    return response.data
  },

  /**
   * Login player via account/password (JSON)
   */
  loginJson: async (request: LoginRequest): Promise<LoginResponse> => {
    const payload = {
      operatorId: request.operatorId,
      username: request.username,
      password: request.password,
      language: request.language || 'en-us',
      uniqueid: request.uniqueid,
      ...(request.sign && { sign: request.sign }),
    }

    const response = await jsonClient.post<LoginResponse>('/loginuidpid.php', payload)
    
    // Extract sess_id from lobby_url if available
    if (response.data.lobby_url) {
      const urlParams = new URLSearchParams(response.data.lobby_url.split('?')[1])
      const sessId = urlParams.get('sess_id')
      if (sessId) {
        sessionManager.setSessionId(sessId)
        sessionManager.setOperatorInfo(request.operatorId, request.username)
      }
    }

    return response.data
  },

  /**
   * Get player info (balance, bet limits, etc.)
   */
  getPlayerInfo: async (): Promise<PlayerInfoResponse> => {
    const sessId = sessionManager.getSessionId()
    if (!sessId) {
      throw new Error('No active session. Please login first.')
    }

    const formData = new URLSearchParams()
    formData.append('sess_id', sessId)
    formData.append('uniqueid', generateUniqueId())

    // Note: Origin and Referer headers are automatically set by the browser and cannot be manually set
    const response = await formClient.post<PlayerInfoResponse>('/playerinfo.php', formData.toString())
    
    // Check for B232 session expired error
    if (response.data.code === 'B232') {
      // Dispatch event to trigger session expired modal
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('session_expired', {
          detail: { code: response.data.code, msg: response.data.msg }
        }))
      }
    }
    
    return response.data
  },

  /**
   * Get current balance (lightweight poll)
   */
  getBalance: async (): Promise<number> => {
    const sessId = sessionManager.getSessionId()
    if (!sessId) {
      throw new Error('No active session. Please login first.')
    }

    const formData = new URLSearchParams()
    formData.append('sess_id', sessId)

    const response = await formClient.post<any>('/balance.php', formData.toString())
    
    // Handle balance - can be string or number according to API
    let balanceValue: number | null = null
    
    if (response.data.balance !== undefined && response.data.balance !== null) {
      // Balance can be string "510979.2000" or number
      if (typeof response.data.balance === 'string') {
        balanceValue = parseFloat(response.data.balance)
      } else if (typeof response.data.balance === 'number') {
        balanceValue = response.data.balance
      }
    }
    
    // Check for success - code can be 'B100' or success message
    const isSuccess = response.data.code === 'B100' || 
                     response.data.code === '0' ||
                     response.data.msg === '成功' ||
                     (response.data.code && String(response.data.code).toUpperCase() === 'B100')
    
    // If we have a valid balance value, return it
    if (balanceValue !== null && !isNaN(balanceValue) && isFinite(balanceValue)) {
      // Note: -1 means balance not yet queried from operator (per README)
      // We still return it, but log a warning
      return balanceValue
    }
    
    // If success code but no valid balance, log and throw
    if (isSuccess) {
      throw new Error(`Balance API returned success but invalid balance: ${response.data.balance}`)
    }
    
    // Error response
    const errorMsg = response.data.msg || response.data.code || 'Failed to get balance'
    throw new Error(errorMsg)
  },

  /**
   * Get odds for a specific round
   * Method: POST (per original site)
   * URL: /odds.php
   * Content-Type: application/x-www-form-urlencoded
   * Fields: sess_id, r_no, uniqueid
   * r_no: Prefer using lobbyinfo.php per-table field "no". Fallback may be YYMMDD + roundId (e.g., "2512091267712" = 251209 + 1267712)
   * Returns: Object with keys like "21001:M", "21002:W", "21003:D"
   */
  getOdds: async (r_no: string | number): Promise<OddsResponse> => {
    const sessId = sessionManager.getSessionId()
    if (!sessId) {
      throw new Error('No active session. Please login first.')
    }

    // Use POST request with form data (per original site)
    const formData = new URLSearchParams()
    formData.append('sess_id', sessId)
    formData.append('r_no', r_no.toString())
    formData.append('uniqueid', generateUniqueId())

    // Use POST request with form data (matches original site exactly)
    // Note: Origin and Referer headers are automatically set by the browser and cannot be manually set
    const response = await formClient.post<OddsResponse>('/odds.php', formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })

    return response.data
  },

  /**
   * Place a bet (cockfight betting handler)
   */
  placeBet: async (request: Omit<BetRequest, 'sess_id' | 'uniqueid'> & { cuid?: string; anyodds?: 'Y' | 'N' }): Promise<BetResponse> => {
    const sessId = sessionManager.getSessionId()
    if (!sessId) {
      throw new Error('No active session. Please login first.')
    }

    const formData = new URLSearchParams()
    formData.append('sess_id', sessId)
    formData.append('t_id', request.t_id)
    formData.append('r_id', request.r_id)
    formData.append('type', request.type)
    formData.append('zone', request.zone)
    formData.append('amount', request.amount.toString())
    formData.append('odds', request.odds.toString())
    const uniqueId = generateUniqueId()
    formData.append('uniqueid', uniqueId)
    if (request.cuid) formData.append('cuid', request.cuid)
    // Always set anyodds to 'Y' to accept server odds automatically
    formData.append('anyodds', 'Y')

    // Use bet_cflive.php endpoint (cockfight betting handler per server rules)
    // Note: Origin and Referer headers are automatically set by the browser and cannot be manually set
    const response = await formClient.post<BetResponse>('/bet_cflive.php', formData.toString())
    
    if (response.data.code !== 'B100') {
      const errorMsg = ERROR_CODES[response.data.code] || response.data.msg || 'Betting failed'
      throw new Error(`${response.data.code}: ${errorMsg}`)
    }

    return response.data
  },

  /**
   * Get wager detail by wager number
   */
  getWagerDetail: async (wagerNo: string): Promise<WagerDetailResponse> => {
    // Note: Referer header is automatically set by the browser and cannot be manually set
    const response = await jsonClient.get<WagerDetailResponse>('/wagerdetail.php', {
      params: { no: wagerNo },
    })
    return response.data
  },

  /**
   * Get bets for a specific round
   * Returns {code, msg, ts, unsettle: [], settle: []} at root level
   */
  getWagersByRound: async (r_id: string): Promise<BetHistoryResponse> => {
    const sessId = sessionManager.getSessionId()
    if (!sessId) {
      throw new Error('No active session. Please login first.')
    }

    const formData = new URLSearchParams()
    formData.append('sess_id', sessId)
    formData.append('uniqueid', generateUniqueId())
    formData.append('r_id', r_id)

    // Note: Origin and Referer headers are automatically set by the browser and cannot be manually set
    const response = await formClient.post<BetHistoryResponse>('/wager_rid.php', formData.toString())
    
    return response.data
  },

  /**
   * Get bet history for a specific date
   */
  getBetHistory: async (date?: string): Promise<BetHistoryResponse> => {
    const sessId = sessionManager.getSessionId()
    if (!sessId) {
      throw new Error('No active session. Please login first.')
    }

    const formData = new URLSearchParams()
    formData.append('sess_id', sessId)
    formData.append('uniqueid', generateUniqueId())
    if (date) formData.append('date', date)

    const response = await formClient.post<BetHistoryResponse>('/bethistory.php', formData.toString())
    return response.data
  },

  /**
   * Get bet history for a date range
   */
  getBetHistoryRange: async (startDate: string, endDate: string): Promise<BetHistoryResponse> => {
    const sessId = sessionManager.getSessionId()
    if (!sessId) {
      throw new Error('No active session. Please login first.')
    }

    const formData = new URLSearchParams()
    formData.append('sess_id', sessId)
    formData.append('uniqueid', generateUniqueId())
    formData.append('startdate', startDate)
    formData.append('enddate', endDate)

    const response = await formClient.post<BetHistoryResponse>('/bethistory2.php', formData.toString())
    return response.data
  },

  /**
   * Get lobby info (table/round snapshot)
   */
  getLobbyInfo: async (): Promise<ApiResponse> => {
    const sessId = sessionManager.getSessionId()
    if (!sessId) {
      throw new Error('No active session. Please login first.')
    }

    const formData = new URLSearchParams()
    formData.append('sess_id', sessId)
    formData.append('uniqueid', generateUniqueId())

    const response = await formClient.post<ApiResponse>('/lobbyinfo.php', formData.toString())
    
    // Check for B232 session expired error
    if (response.data.code === 'B232') {
      // Dispatch event to trigger session expired modal
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('session_expired', {
          detail: { code: response.data.code, msg: response.data.msg }
        }))
      }
    }
    
    return response.data
  },

  /**
   * Get authenticated draw history with roadmaps
   */
  getHistory: async (tableid: string): Promise<ApiResponse> => {
    const sessId = sessionManager.getSessionId()
    if (!sessId) {
      throw new Error('No active session. Please login first.')
    }

    const formData = new URLSearchParams()
    formData.append('sess_id', sessId)
    formData.append('uniqueid', generateUniqueId())
    formData.append('tableid', tableid)

    const response = await formClient.post<ApiResponse>('/history.php', formData.toString())
    return response.data
  },

  /**
   * Get public history (no authentication required)
   */
  getPublicHistory: async (tableid: string): Promise<ApiResponse> => {
    const response = await jsonClient.get<ApiResponse>('/public_history.php', {
      params: { tableid, uniqueid: generateUniqueId() },
    })
    return response.data
  },
}

