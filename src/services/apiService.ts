import axios from 'axios'

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

    // Add headers to match original site's request format
    const response = await formClient.post<PlayerInfoResponse>('/playerinfo.php', formData.toString(), {
      headers: {
        'Origin': 'https://game.ho8.net',
        'Referer': 'https://game.ho8.net/',
      },
    })
    
    // Check for B232 session expired error
    if (response.data.code === 'B232') {
      if (import.meta.env.DEV) {
        console.error('❌ Session expired (B232) from playerinfo.php:', response.data)
      }
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

    if (import.meta.env.DEV) {
      console.log('💰 Fetching balance from API:', {
        endpoint: '/balance.php',
        sess_id: sessId.substring(0, 8) + '...' // Log partial session ID for security
      })
    }

    const response = await formClient.post<any>('/balance.php', formData.toString())
    
    if (import.meta.env.DEV) {
      console.log('💰 Balance API raw response:', {
        code: response.data?.code,
        msg: response.data?.msg,
        balance: response.data?.balance,
        balanceType: typeof response.data?.balance,
        fullResponse: response.data
      })
    }
    
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
      if (balanceValue === -1 && import.meta.env.DEV) {
        console.warn('⚠️ Balance API returned -1 (not yet queried from operator)')
      }
      return balanceValue
    }
    
    // If success code but no valid balance, log and throw
    if (isSuccess) {
      if (import.meta.env.DEV) {
        console.error('❌ Balance API returned success but invalid balance:', {
          code: response.data.code,
          msg: response.data.msg,
          balance: response.data.balance,
          fullResponse: response.data
        })
      }
      throw new Error(`Balance API returned success but invalid balance: ${response.data.balance}`)
    }
    
    // Error response
    const errorMsg = response.data.msg || response.data.code || 'Failed to get balance'
    if (import.meta.env.DEV) {
      console.error('❌ Balance API error:', {
        code: response.data.code,
        msg: errorMsg,
        fullResponse: response.data
      })
    }
    throw new Error(errorMsg)
  },

  /**
   * Get odds for a specific round
   * Method: POST (per original site)
   * URL: /odds.php
   * Content-Type: application/x-www-form-urlencoded
   * Fields: sess_id, r_no, uniqueid
   * r_no format: YYMMDD + roundId (e.g., "2512091267712" = 251209 + 1267712)
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

    if (import.meta.env.DEV) {
      console.log('📊 Fetching odds from API (POST):', {
        endpoint: '/odds.php',
        r_no: r_no,
        r_no_length: r_no.toString().length,
        r_no_type: typeof r_no,
        sess_id: sessId.substring(0, 8) + '...', // Log partial session ID for security
        payload: `sess_id=${sessId}&r_no=${r_no}&uniqueid=${generateUniqueId()}`
      })
    }

    // Use POST request with form data (matches original site exactly)
    const response = await formClient.post<OddsResponse>('/odds.php', formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://game.ho8.net',
        'Referer': 'https://game.ho8.net/',
      },
    })

    if (import.meta.env.DEV) {
      console.log('📊 Odds API response:', {
        code: response.data?.code,
        msg: response.data?.msg,
        hasData: !!response.data?.data,
        dataType: typeof response.data?.data,
        dataKeys: response.data?.data && typeof response.data.data === 'object' && !Array.isArray(response.data.data) ? Object.keys(response.data.data) : [],
        dataSample: response.data?.data && typeof response.data.data === 'object' ? Object.keys(response.data.data).slice(0, 3) : null,
        fullResponse: response.data
      })
    }

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

    // Log the bet request data being sent to server
    if (import.meta.env.DEV) {
      console.log('📤 Sending bet to server:', {
        endpoint: '/bet_cflive.php',
        data: {
          sess_id: sessId,
          t_id: request.t_id,
          r_id: request.r_id,
          type: request.type,
          zone: request.zone,
          amount: request.amount,
          odds: request.odds,
          uniqueid: uniqueId,
          cuid: request.cuid,
          anyodds: 'Y' // Always set to Y to accept server odds automatically
        },
        formData: formData.toString()
      })
    }

    // Use bet_cflive.php endpoint (cockfight betting handler per server rules)
    // Add headers to match original site's request format
    const response = await formClient.post<BetResponse>('/bet_cflive.php', formData.toString(), {
      headers: {
        'Origin': 'https://game.ho8.net',
        'Referer': 'https://game.ho8.net/',
      },
    })
    
    // Log the server response
    if (import.meta.env.DEV) {
      console.log('📥 Server response:', {
        code: response.data.code,
        msg: response.data.msg,
        balance: response.data.balance,
        unsettle: response.data.unsettle,
        allbets: response.data.allbets,
        fullResponse: response.data
      })
    }
    
    if (response.data.code !== 'B100') {
      const errorMsg = ERROR_CODES[response.data.code] || response.data.msg || 'Betting failed'
      if (import.meta.env.DEV) {
        console.error('❌ Betting failed:', {
          code: response.data.code,
          error: errorMsg,
          fullResponse: response.data
        })
      }
      throw new Error(`${response.data.code}: ${errorMsg}`)
    }

    if (import.meta.env.DEV) {
      console.log('✅ Bet successfully placed:', {
        amount: request.amount,
        type: request.type,
        zone: request.zone,
        odds: request.odds,
        newBalance: response.data.balance,
        wagerNumbers: response.data.unsettle?.map(b => b.w_no) || []
      })
    }

    return response.data
  },

  /**
   * Get wager detail by wager number
   */
  getWagerDetail: async (wagerNo: string): Promise<WagerDetailResponse> => {
    const response = await jsonClient.get<WagerDetailResponse>('/wagerdetail.php', {
      params: { no: wagerNo },
      headers: {
        Referer: 'https://game.ho8.net',
      },
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

    if (import.meta.env.DEV) {
      console.log('📋 Calling wager_rid.php:', {
        r_id,
        sess_id: sessId.substring(0, 8) + '...'
      })
    }

    // Add headers to match original site's request format
    const response = await formClient.post<BetHistoryResponse>('/wager_rid.php', formData.toString(), {
      headers: {
        'Origin': 'https://game.ho8.net',
        'Referer': 'https://game.ho8.net/',
      },
    })
    
    if (import.meta.env.DEV) {
      console.log('📋 wager_rid.php response:', {
        code: response.data.code,
        unsettleCount: response.data.unsettle?.length || 0,
        settleCount: response.data.settle?.length || 0,
        hasData: !!response.data.data
      })
    }
    
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
      if (import.meta.env.DEV) {
        console.error('❌ Session expired (B232) from lobbyinfo.php:', response.data)
      }
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

