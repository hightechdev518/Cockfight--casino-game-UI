import { useCallback, useMemo, useEffect, useRef, useState } from 'react'
import { useGameStore, useGameStore as getGameStore, GameHistory as GameHistoryType } from '../../store/gameStore'
import { apiService, sessionManager } from '../../services/apiService'
import BettingSummaryBar from './BettingSummaryBar'
import { useI18n } from '../../i18n/LanguageContext'
import './GameHistory.css'

// Silence all console output in src/ (requested cleanup)
const console: Pick<Console, 'log' | 'warn' | 'error' | 'debug'> = {
  log: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

/**
 * Props for the GameHistory component
 */
interface GameHistoryProps {
  /** Display variant: 'simple' for left panel, 'detailed' for right panel */
  variant?: 'simple' | 'detailed'
}

/**
 * Constants for game history - Bead Road Grid
 */
const GRID_CONFIG = {
  ROWS: 6,           // 6 rows for bead road
  MAX_COLS: 30,      // Maximum columns to display
} as const

/**
 * Bead Road Item - represents a single result in the road
 */
interface BeadRoadItem {
  result: 'meron' | 'wala'
  /** 該格第一個落子回合 */
  round: number
  col: number
  row: number
  /** 和局次數（和局不落新格，只疊加在最後一格） */
  tieCount: number
  /** 和局回合列表（方便 tooltip / debug） */
  tieRounds: number[]
}

/**
 * GameHistory component displays past game results in a bead road format
 * - Red rings for Meron wins
 * - Blue rings for Wala wins
 * - Green rings for Draw
 * - Same consecutive results stack vertically
 * - Different results start a new column
 * 
 * @param props - Component props
 * @returns JSX element
 */
const GameHistory: React.FC<GameHistoryProps> = ({ variant = 'simple' }) => {
  const { gameHistory, autoSubmit, toggleAutoSubmit, currentRound, toggleGameSummary, tableId, setGameHistory, roundStatus, isLive, tableStatus } = useGameStore()
  const { t } = useI18n()
  const lastFetchTimeRef = useRef(0)
  const [accuStats, setAccuStats] = useState<{ meronWins: number; walaWins: number; drawWins: number }>({
    meronWins: 0,
    walaWins: 0,
    drawWins: 0
  })
  const [apiRound, setApiRound] = useState<number | null>(null)
  const [serverRoadmap, setServerRoadmap] = useState<any>(null)
  const roadmapContainerRef = useRef<HTMLDivElement>(null)

  /**
   * Parses API response and converts to GameHistory format
   * Original site structure: { code: "B100", data: [...array of history items...], accu: {...}, roadmap: {...} }
   * Each item: { tableid: "CF01", trid: 1265634, drawresult: "\"M\"", result1: "M", status: 4, ... }
   */
  const parseApiHistory = useCallback((apiData: any, currentTableId?: string): GameHistoryType[] => {
    if (!apiData) return []
    
    // Get current tableId from store if not provided
    const tableIdToUse = currentTableId || tableId
    
    if (import.meta.env.DEV) {
      console.log('📋 Parsing history API response:', { apiData, tableId: tableIdToUse })
    }
    
    let drawResults: any[] = []
    
    // Original site structure: data is a direct array of history items
    if (apiData.data && Array.isArray(apiData.data)) {
      // Filter by tableid to get only current table's results
      if (tableIdToUse) {
        drawResults = apiData.data.filter((item: any) => 
          (item.tableid === tableIdToUse || item.tableId === tableIdToUse || item.t_id === tableIdToUse)
        )
        if (import.meta.env.DEV) {
          console.log('✅ Found', drawResults.length, 'results for table:', tableIdToUse, 'out of', apiData.data.length, 'total items')
        }
      } else {
        // No tableId filter, use all results
        drawResults = apiData.data
        if (import.meta.env.DEV) {
          console.log('✅ Using all results (no tableId filter), count:', drawResults.length)
        }
      }
    }
    // Fallback: Check if data is nested under drawresult
    else if (apiData.data && apiData.data.drawresult) {
      if (typeof apiData.data.drawresult === 'object' && !Array.isArray(apiData.data.drawresult)) {
        // drawresult is an object with table IDs as keys
        if (tableIdToUse && apiData.data.drawresult[tableIdToUse]) {
          drawResults = Array.isArray(apiData.data.drawresult[tableIdToUse]) 
            ? apiData.data.drawresult[tableIdToUse]
            : []
        }
      } else if (Array.isArray(apiData.data.drawresult)) {
        drawResults = apiData.data.drawresult
      }
    }
    // Fallback: Response is direct array
    else if (Array.isArray(apiData)) {
      drawResults = apiData
    }
    
    if (import.meta.env.DEV && drawResults.length === 0) {
      console.warn('⚠️ No draw results found in API response. Available keys:', apiData.data ? Object.keys(apiData.data) : 'no data')
    }

    // Convert API format to GameHistory format
    // Original site format: { tableid: "CF01", trid: 1265634, drawresult: "\"M\"", result1: "M", status: 4, ... }
    return drawResults.map((item: any, index: number) => {
      // Use trid as round number (round ID), or fallback to index
      const round = item.trid || item.r_no || item.round || item.r_id || item.rno || item.round_no || (index + 1)
      
      // Original site uses result1 (clean) or drawresult (JSON string like "\"M\"")
      // Prefer result1 as it's already clean, fallback to parsing drawresult
      let result = item.result1 || item.result || item.winner || item.win || item.winner_type || item.bet_result || item.outcome || ''
      
      // If result is a JSON string like "\"M\"", parse it
      if (typeof result === 'string' && result.startsWith('"') && result.endsWith('"')) {
        try {
          result = JSON.parse(result)
        } catch (e) {
          // If parsing fails, use as-is
        }
      }
      
      // Map result to our format
      let mappedResult: 'meron' | 'wala' | 'draw' = 'meron'
      if (typeof result === 'string') {
        const resultUpper = result.toUpperCase().trim()
        // Original site uses: M=meron, W=wala, D=draw
        if (resultUpper === 'M' || resultUpper === 'MERON' || resultUpper === '龍') {
          mappedResult = 'meron'
        } 
        else if (resultUpper === 'W' || resultUpper === 'WALA' || resultUpper === '虎') {
          mappedResult = 'wala'
        } 
        else if (resultUpper === 'D' || resultUpper === 'DRAW' || resultUpper === '和') {
          mappedResult = 'draw'
        }
      } else if (typeof result === 'number') {
        // Handle numeric codes: 21001=meron, 21002=wala, 21003=draw
        if (result === 21001) mappedResult = 'meron'
        else if (result === 21002) mappedResult = 'wala'
        else if (result === 21003) mappedResult = 'draw'
      }

      return {
        round: typeof round === 'number' ? round : parseInt(String(round)) || (index + 1),
        result: mappedResult,
        meronCard: item.meronCard || item.m_card || item.meron_card,
        walaCard: item.walaCard || item.w_card || item.wala_card
      }
    }).filter((item: GameHistoryType) => item.round > 0) // Filter out invalid entries
  }, [tableId])

  /**
   * Fetches history from API
   * @param force - If true, bypass throttle and force fetch
   */
  const fetchHistory = useCallback(async (force: boolean = false) => {
    if (!tableId) return
    
    // Throttle API calls - don't fetch more than once every 3 seconds (unless forced)
    const now = Date.now()
    if (!force && now - lastFetchTimeRef.current < 3000) return
    
    lastFetchTimeRef.current = now
    
    try {
      let historyData: any
      
      // Try authenticated endpoint first, fallback to public
      if (sessionManager.getSessionId()) {
        try {
          historyData = await apiService.getHistory(tableId)
        } catch (error) {
          // If authenticated fails, try public endpoint
          historyData = await apiService.getPublicHistory(tableId)
        }
      } else {
        // No session, use public endpoint
        historyData = await apiService.getPublicHistory(tableId)
      }

      // Handle response - public_history.php may have issues, so check for data even if code isn't B100
      if (historyData) {
        // For authenticated endpoint, require B100 code
        // For public endpoint, try to parse even if code is not B100 (known issues in backend)
        const isPublicEndpoint = !sessionManager.getSessionId() || 
                                 (historyData.code && historyData.code !== 'B100')
        
        if (historyData.code === 'B100' || (isPublicEndpoint && historyData.data)) {
          const parsedHistory = parseApiHistory(historyData, tableId)
          if (parsedHistory.length > 0) {
            setGameHistory(parsedHistory)
            if (import.meta.env.DEV) {
              console.log('✅ Successfully parsed history, count:', parsedHistory.length)
            }
          } else {
            // If parsing returned empty, clear history to show only real data
            setGameHistory([])
            if (import.meta.env.DEV) {
              console.warn('⚠️ History parsing returned empty array')
            }
          }

          // Extract roadmap data from API (if available)
          // Backend README: /history.php returns roadmap, goodroad, and allgr
          // The roadmap is the server-calculated bead road pattern
          let roadmap = historyData.roadmap || (historyData.data && historyData.data.roadmap)
          let goodroad = historyData.goodroad || (historyData.data && historyData.data.goodroad)
          let allgr = historyData.allgr || (historyData.data && historyData.data.allgr)
          
          // Store server roadmap if available (may be table-specific)
          if (roadmap) {
            // Roadmap might be an object with table IDs as keys, or a direct structure
            if (typeof roadmap === 'object' && !Array.isArray(roadmap)) {
              const tableRoadmap = roadmap[tableId] || roadmap[tableId?.toUpperCase()] || roadmap
              setServerRoadmap(tableRoadmap)
            } else {
              setServerRoadmap(roadmap)
            }
          } else {
            setServerRoadmap(null)
          }
          
          if (import.meta.env.DEV) {
            console.log('📊 Roadmap data from API:', {
              hasRoadmap: !!roadmap,
              hasGoodroad: !!goodroad,
              hasAllgr: !!allgr,
              roadmapType: typeof roadmap,
              roadmapKeys: roadmap && typeof roadmap === 'object' ? Object.keys(roadmap) : null,
              serverRoadmap: serverRoadmap
            })
          }

          // Extract accu (accumulation) data for statistics
          // Original site structure: accu is at root level, format: { "21000@M": 52, "21000@W": 42, "21000@D": 6 }
          // The format is "21000@{M|W|D}" where 21000 might be a game/product ID
          let accu = historyData.accu || (historyData.data && historyData.data.accu)
          
          if (import.meta.env.DEV) {
            console.log('📊 Looking for accu data, tableId:', tableId)
            console.log('📊 Raw accu data:', accu, 'Type:', typeof accu, 'IsArray:', Array.isArray(accu))
          }
          
          if (accu && typeof accu === 'object' && !Array.isArray(accu)) {
            // Original site format: { "21000@M": 52, "21000@W": 42, "21000@D": 6 }
            // Try to find keys matching pattern: "21000@M", "21000@W", "21000@D"
            let meronWins = 0
            let walaWins = 0
            let drawWins = 0
            
            // Try direct field names first (fallback format)
            if (accu.meron !== undefined || accu.M !== undefined) {
              meronWins = accu.meron || accu.M || accu.meronWins || accu.meron_count || 0
              walaWins = accu.wala || accu.W || accu.walaWins || accu.wala_count || 0
              drawWins = accu.draw || accu.D || accu.drawWins || accu.draw_count || 0
            } else {
              // Original site format: search for keys like "21000@M", "21000@W", "21000@D"
              const accuKeys = Object.keys(accu)
              if (import.meta.env.DEV) {
                console.log('📊 All accu keys:', accuKeys)
              }
              
              // Find keys matching pattern: *@M, *@W, *@D
              for (const key of accuKeys) {
                if (key.endsWith('@M') || key.endsWith('@M@NOOPEN')) {
                  meronWins += typeof accu[key] === 'number' ? accu[key] : parseInt(String(accu[key])) || 0
                } else if (key.endsWith('@W') || key.endsWith('@W@NOOPEN')) {
                  walaWins += typeof accu[key] === 'number' ? accu[key] : parseInt(String(accu[key])) || 0
                } else if (key.endsWith('@D') || key.endsWith('@D@NOOPEN')) {
                  drawWins += typeof accu[key] === 'number' ? accu[key] : parseInt(String(accu[key])) || 0
                }
              }
            }
            
            if (import.meta.env.DEV) {
              console.log('📊 Parsed accu stats:', { meronWins, walaWins, drawWins })
            }
            
            setAccuStats({
              meronWins: meronWins,
              walaWins: walaWins,
              drawWins: drawWins
            })
            
            if (import.meta.env.DEV) {
              console.log('✅ Extracted accu stats:', { meronWins, walaWins, drawWins })
            }
          } else {
            if (import.meta.env.DEV) {
              console.warn('⚠️ No accu data found in response. Available root keys:', Object.keys(historyData || {}))
            }
          }

          // Extract current round from API response
          if (historyData.data) {
            const roundData = historyData.data.r_no || historyData.data.round || historyData.data.current_round || historyData.data.r_id
            if (roundData) {
              const roundNum = typeof roundData === 'number' ? roundData : parseInt(String(roundData))
              if (!isNaN(roundNum)) {
                setApiRound(roundNum)
              }
            }
          }
        } else {
          // If API response is not successful, clear history
          setGameHistory([])
          setAccuStats({ meronWins: 0, walaWins: 0, drawWins: 0 })
          setApiRound(null)
          // API response code not B100
        }
      } else {
        setGameHistory([])
      }
    } catch (error) {
      // On error, clear history to ensure only real data is shown
      setGameHistory([])
      // Failed to fetch history
    }
  }, [tableId, parseApiHistory, setGameHistory])

  /**
   * Sets up history fetching
   * Only fetches on initial load and when game result comes
   */
  const hasFetchedInitialHistoryRef = useRef<boolean>(false)
  const prevTableIdRef = useRef<string | undefined>(undefined)
  const historyRetryTimeoutRef = useRef<number | null>(null)
  const historyRetryCountRef = useRef<number>(0)
  
  useEffect(() => {
    // Clear any pending retry
    if (historyRetryTimeoutRef.current) {
      clearTimeout(historyRetryTimeoutRef.current)
      historyRetryTimeoutRef.current = null
    }
    
    if (!tableId) {
      // tableId not available yet, set up retry
      if (!hasFetchedInitialHistoryRef.current) {
        if (import.meta.env.DEV) {
          console.log('⏳ TableId not available yet, will retry history fetch')
        }
        historyRetryCountRef.current = 0
        const maxRetries = 10
        const retryInterval = 500 // 500ms intervals
        
        const retryCheck = () => {
          const currentTableId = getGameStore.getState().tableId
          if (currentTableId && !hasFetchedInitialHistoryRef.current) {
            if (import.meta.env.DEV) {
              console.log('🔄 Retry: TableId now available, fetching history:', currentTableId)
            }
            fetchHistory()
            hasFetchedInitialHistoryRef.current = true
            prevTableIdRef.current = currentTableId
            historyRetryCountRef.current = 0 // Reset retry count on success
          } else if (historyRetryCountRef.current < maxRetries) {
            historyRetryCountRef.current++
            historyRetryTimeoutRef.current = window.setTimeout(retryCheck, retryInterval)
          } else {
            if (import.meta.env.DEV) {
              console.warn('⚠️ Max retries reached, tableId still not available')
            }
            historyRetryCountRef.current = 0 // Reset for next attempt
          }
        }
        
        historyRetryTimeoutRef.current = window.setTimeout(retryCheck, retryInterval)
      }
      return
    }
    
    // Check if tableId changed or if this is initial mount
    const isTableChanged = prevTableIdRef.current !== undefined && prevTableIdRef.current !== tableId
    const isInitialMount = !hasFetchedInitialHistoryRef.current
    
    if (isTableChanged || isInitialMount) {
      // Check if we have a session - if yes, wait a bit and fetch with authenticated endpoint
      const sessionId = sessionManager.getSessionId()
      if (sessionId && isInitialMount) {
        // If we have session on initial mount, wait a bit to ensure everything is initialized
        // Then fetch with authenticated endpoint
        setTimeout(() => {
          if (import.meta.env.DEV) {
            console.log('🔄 Initial mount with session, fetching history with authenticated endpoint:', {
              tableId,
              hasSession: !!sessionId
            })
          }
          fetchHistory(true) // Force fetch to get authenticated data
          hasFetchedInitialHistoryRef.current = true
          prevTableIdRef.current = tableId
        }, 500)
      } else {
        if (import.meta.env.DEV) {
          console.log('🔄 Fetching game history:', {
            tableId,
            isTableChanged,
            isInitialMount,
            prevTableId: prevTableIdRef.current,
            hasSession: !!sessionId
          })
        }
        fetchHistory()
        hasFetchedInitialHistoryRef.current = true
        prevTableIdRef.current = tableId
      }
    }
    
    return () => {
      if (historyRetryTimeoutRef.current) {
        clearTimeout(historyRetryTimeoutRef.current)
        historyRetryTimeoutRef.current = null
      }
    }
  }, [tableId, fetchHistory])

  // Listen for session changes to trigger history fetch when login completes
  useEffect(() => {
    const handleSessionSet = () => {
      // When session is set (after login), always fetch history to get authenticated data
      if (import.meta.env.DEV) {
        console.log('🔄 Session set event received, fetching history with authenticated endpoint')
      }
      
      // Wait a bit for initialization to complete, then fetch if session is available
      const checkAndFetch = (attempt: number = 0) => {
        const maxAttempts = 30 // 3 seconds total (30 * 100ms) - increased for better reliability
        const sessionId = sessionManager.getSessionId()
        const currentTableId = getGameStore.getState().tableId
        
        if (sessionId && currentTableId) {
          // Session available and we have tableId - force fetch to bypass throttle and get authenticated data
          if (import.meta.env.DEV) {
            console.log('🔄 Session available after login, fetching history with authenticated endpoint:', currentTableId)
          }
          // Force fetch to bypass throttle and ensure we get authenticated data
          fetchHistory(true)
          hasFetchedInitialHistoryRef.current = true
          prevTableIdRef.current = currentTableId
        } else if (attempt < maxAttempts) {
          // Retry after a short delay
          setTimeout(() => checkAndFetch(attempt + 1), 100)
        } else {
          if (import.meta.env.DEV) {
            console.warn('⚠️ Session set but tableId not available after max attempts', {
              hasSession: !!sessionId,
              tableId: currentTableId
            })
          }
        }
      }
      
      // Start checking after a short delay to allow initialization to complete
      setTimeout(() => checkAndFetch(), 300)
    }

    const handleInitParamChange = (event: any) => {
      // When URL params change (including session login), fetch history
      const { changedParams } = event.detail || {}
      if (changedParams?.sess_id) {
        if (import.meta.env.DEV) {
          console.log('🔄 Session ID changed via URL, fetching history with authenticated endpoint')
        }
        
        // Use same retry logic as session_set
        const checkAndFetch = (attempt: number = 0) => {
          const maxAttempts = 30 // 3 seconds total - increased for better reliability
          const sessionId = sessionManager.getSessionId()
          const currentTableId = getGameStore.getState().tableId
          
          if (sessionId && currentTableId) {
            if (import.meta.env.DEV) {
              console.log('🔄 Session available after initparamchange, fetching history:', currentTableId)
            }
            fetchHistory(true) // Force fetch after session change
            hasFetchedInitialHistoryRef.current = true
            prevTableIdRef.current = currentTableId
          } else if (attempt < maxAttempts) {
            setTimeout(() => checkAndFetch(attempt + 1), 100)
          }
        }
        
        setTimeout(() => checkAndFetch(), 300) // Slightly longer delay for initparamchange
      }
    }

    window.addEventListener('session_set', handleSessionSet)
    window.addEventListener('initparamchange', handleInitParamChange as EventListener)
    
    return () => {
      window.removeEventListener('session_set', handleSessionSet)
      window.removeEventListener('initparamchange', handleInitParamChange as EventListener)
    }
  }, [fetchHistory])

  // Fetch history when game result comes (round settles)
  useEffect(() => {
    const handleRoundSettled = () => {
      if (tableId) {
        if (import.meta.env.DEV) {
          console.log('📜 Round settled, fetching updated history')
        }
        fetchHistory()
      }
    }

    window.addEventListener('round_settled', handleRoundSettled as EventListener)
    return () => {
      window.removeEventListener('round_settled', handleRoundSettled as EventListener)
    }
  }, [tableId, fetchHistory])


  /**
   * Gets the history data to display
   * Only displays real API data, no fallback to sample data
   */
  const history = useMemo(() => {
    return gameHistory
  }, [gameHistory])


  /**
   * Gets game statistics from API accu data (real backend data)
   * Falls back to calculating from history if accu not available
   */
  const gameStats = useMemo(() => {
    // Use real API accu data if available
    if (accuStats.meronWins > 0 || accuStats.walaWins > 0 || accuStats.drawWins > 0) {
      return accuStats
    }
    
    // Fallback to calculating from history (for backwards compatibility)
    const meronWins = history.filter(h => h.result === 'meron').length
    const walaWins = history.filter(h => h.result === 'wala').length
    const drawWins = history.filter(h => h.result === 'draw').length
    return { meronWins, walaWins, drawWins }
  }, [accuStats, history])

  /**
   * Gets current round number for display from API (real backend data)
   * Falls back to currentRound or history if API round not available
   */
  const displayRound = useMemo(() => {
    // Use API round if available (most accurate)
    if (apiRound !== null) {
      return apiRound
    }
    
    // Fallback to currentRound from store
    if (currentRound) {
      return currentRound
    }
    
    // Last resort: use latest round from history
    if (history.length > 0) {
      return history[history.length - 1].round
    }
    
    return 40 // Default fallback
  }, [apiRound, currentRound, history])

  /**
   * Internal status code derived from tablestatus / roundStatus.
   * Used both for styling and for translated labels.
   */
  const statusCode = useMemo(() => {
    if (isLive === false) return 'maintenance'

    if (typeof tableStatus === 'number') {
      switch (tableStatus) {
        case 0:
          return 'no-fight-now'
        case 1:
          return 'betting'
        case 2:
          return 'fighting'
        case 3:
          return 'settling'
        case 4:
          return 'waiting'
        case 5:
          return 'canceled'
        default:
          break
      }
    }

    if (roundStatus === 1) return 'betting'
    if (roundStatus === 2) return 'fighting'
    if (roundStatus === 4) return 'settling'
    if (roundStatus === 0) return 'waiting'

    return ''
  }, [isLive, tableStatus, roundStatus])

  /**
   * Translated status label for current language.
   */
  const statusText = useMemo(() => {
    switch (statusCode) {
      case 'betting':
        return t('gameSummary.status.betting')
      case 'fighting':
        return t('gameSummary.status.fighting')
      case 'waiting':
      case 'no-fight-now':
        return t('gameSummary.status.waiting')
      case 'settling':
        return t('gameSummary.status.settled')
      case 'maintenance':
        return t('gameSummary.status.maintenance')
      case 'canceled':
        // No dedicated i18n key; treat as settled for now
        return t('gameSummary.status.settled')
      default:
        return ''
    }
  }, [statusCode, t])

  /**
   * Generates road (大路) pattern from history
   * 參考 /scoreplate.html 的規則：
   * - M/W 會落子成一格（紅/藍）
   * - D（和局）不落新格，只在「最後一格」疊加 tie 記號
   * - 同色：優先往下；若不能往下則右轉，並設定 pendingOrigin（右轉起點）
   * - pendingOrigin 存在時：同色「永遠往右」(不再嘗試往下)
   * - 異色：若 pendingOrigin 存在，優先回到 origin 同欄的 origin.r+1 往下找空位；成功後清掉 pendingOrigin
   */
  const generateBeadRoad = useMemo((): BeadRoadItem[] => {
    if (history.length === 0) return []

    type Token = 'M' | 'W' | 'D'
    type Pos = { c: number; r: number }
    type Cell = {
      result: 'meron' | 'wala'
      round: number
      col: number
      row: number
      tieCount: number
      tieRounds: number[]
    }

    const ROWS = GRID_CONFIG.ROWS
    // 需要一個合理上限避免無窮 while；一般來說 cols 不會超過局數太多
    const COLS = Math.max(GRID_CONFIG.MAX_COLS, history.length + 30)

    const keyOf = (c: number, r: number) => `${c}:${r}`
    const grid = new Map<string, Cell>()

    const isEmpty = (c: number, r: number) => c >= 0 && c < COLS && r >= 0 && r < ROWS && !grid.has(keyOf(c, r))
    const findFirstEmptyRowInCol = (c: number, start: number = 0) => {
      if (c < 0 || c >= COLS) return null
      for (let r = start; r < ROWS; r++) {
        if (isEmpty(c, r)) return r
      }
      return null
    }

    let lastVal: Token | null = null
    let lastPos: Pos | null = null
    let pendingOrigin: Pos | null = null

    const placeAt = (c: number, r: number, val: Exclude<Token, 'D'>, round: number): Pos | null => {
      if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null
      const cell: Cell = {
        result: val === 'M' ? 'meron' : 'wala',
        round,
        col: c,
        row: r,
        tieCount: 0,
        tieRounds: [],
      }
      grid.set(keyOf(c, r), cell)
      return { c, r }
    }

    const setLast = (pos: Pos | null, val: Exclude<Token, 'D'>) => {
      if (!pos) return
      lastVal = val
      lastPos = pos
    }

    const markTieOnLast = (round: number) => {
      if (!lastPos) return
      const cell = grid.get(keyOf(lastPos.c, lastPos.r))
      if (!cell) return
      cell.tieCount += 1
      cell.tieRounds.push(round)
    }

    const toToken = (result: GameHistoryType['result']): Token => {
      if (result === 'meron') return 'M'
      if (result === 'wala') return 'W'
      return 'D'
    }

    // 保險：確保用回合數由小到大處理（oldest -> newest）
    const ordered = [...history].sort((a, b) => (a.round ?? 0) - (b.round ?? 0))

    for (const item of ordered) {
      const token = toToken(item.result)

      if (token === 'D') {
        markTieOnLast(item.round)
        continue
      }

      // first non-draw
      if (lastVal === null || lastPos === null) {
        setLast(placeAt(0, 0, token, item.round), token)
        continue
      }
      // 固化本回合用的座標，避免後續收斂/重指派影響
      const lp: Pos = lastPos

      // CASE: same color
      if (token === lastVal) {
        // right-mode: ALWAYS go right, not down
        if (pendingOrigin) {
          let tryC = lp.c + 1
          let placed = false
          while (tryC < COLS) {
            if (isEmpty(tryC, lp.r)) {
              setLast(placeAt(tryC, lp.r, token, item.round), token)
              placed = true
              break
            }
            const fe = findFirstEmptyRowInCol(tryC, 0)
            if (fe !== null) {
              setLast(placeAt(tryC, fe, token, item.round), token)
              placed = true
              break
            }
            tryC++
          }
          if (!placed) {
            setLast(placeAt(COLS - 1, 0, token, item.round), token)
          }
          continue
        }

        // normal: try down else right-turn
        const rBelow = lp.r + 1
        if (rBelow < ROWS && isEmpty(lp.c, rBelow)) {
          setLast(placeAt(lp.c, rBelow, token, item.round), token)
          continue
        }

        // right-turn: set pendingOrigin only if none exists
        if (pendingOrigin === null) pendingOrigin = { c: lp.c, r: lp.r }

        // place rightwards prefer same row
        let placed = false
        let tryC = lp.c + 1
        while (tryC < COLS) {
          if (isEmpty(tryC, lp.r)) {
            setLast(placeAt(tryC, lp.r, token, item.round), token)
            placed = true
            break
          }
          const fe = findFirstEmptyRowInCol(tryC, 0)
          if (fe !== null) {
            setLast(placeAt(tryC, fe, token, item.round), token)
            placed = true
            break
          }
          tryC++
        }
        if (!placed) {
          setLast(placeAt(COLS - 1, 0, token, item.round), token)
        }
        continue
      }

      // CASE: different color
      if (pendingOrigin) {
        const oc = pendingOrigin.c
        const orow = pendingOrigin.r
        let placed = false

        const startR = orow + 1
        if (startR < ROWS) {
          for (let r = startR; r < ROWS; r++) {
            if (isEmpty(oc, r)) {
              setLast(placeAt(oc, r, token, item.round), token)
              placed = true
              break
            }
          }
        } else {
          // origin 下一列超底 -> 回補到 origin.c+1 從 top-first-empty
          let tryC = oc + 1
          while (tryC < COLS) {
            const fe = findFirstEmptyRowInCol(tryC, 0)
            if (fe !== null) {
              setLast(placeAt(tryC, fe, token, item.round), token)
              placed = true
              break
            }
            tryC++
          }
        }

        if (!placed) {
          // 若 origin 欄從 startR..ROWS-1 全滿，則嘗試從 origin.c+1 往右找 top-first-empty
          let tryC = oc + 1
          while (tryC < COLS) {
            const fe = findFirstEmptyRowInCol(tryC, 0)
            if (fe !== null) {
              setLast(placeAt(tryC, fe, token, item.round), token)
              placed = true
              break
            }
            tryC++
          }
        }

        if (!placed) {
          // 最後 fallback：從 lastPos 右邊起找第一個可放
          let newC = lp.c + 1
          while (newC < COLS) {
            const rr = findFirstEmptyRowInCol(newC, 0)
            if (rr !== null) {
              setLast(placeAt(newC, rr, token, item.round), token)
              placed = true
              break
            }
            newC++
          }
          if (!placed) {
            setLast(placeAt(COLS - 1, 0, token, item.round), token)
          }
        }

        // consume pendingOrigin
        pendingOrigin = null
        continue
      }

      // no pending -> normal next-col top-first-empty
      let newC = lp.c + 1
      let placed = false
      while (newC < COLS) {
        const rr = findFirstEmptyRowInCol(newC, 0)
        if (rr !== null) {
          setLast(placeAt(newC, rr, token, item.round), token)
          placed = true
          break
        }
        newC++
      }
      if (!placed) {
        setLast(placeAt(COLS - 1, 0, token, item.round), token)
      }
    }

    // 轉成陣列，固定排序（由左到右、由上到下）方便 render / key 穩定
    return [...grid.values()].sort((a, b) => a.col - b.col || a.row - b.row)
  }, [history])

  /**
   * Calculate the maximum column for grid sizing
   */
  const maxColumn = useMemo(() => {
    if (generateBeadRoad.length === 0) return GRID_CONFIG.MAX_COLS
    return Math.max(
      ...generateBeadRoad.map(item => item.col),
      GRID_CONFIG.MAX_COLS - 1
    ) + 1
  }, [generateBeadRoad])

  /**
   * Auto-scroll to show newest results (rightmost position)
   * Scrolls to rightmost side when entering table or when history updates
   */
  useEffect(() => {
    if (roadmapContainerRef.current && generateBeadRoad.length > 0) {
      // Use setTimeout to ensure DOM is fully rendered before scrolling
      setTimeout(() => {
        if (roadmapContainerRef.current) {
          // Scroll to the rightmost position to show newest results
          const container = roadmapContainerRef.current
          const maxScroll = container.scrollWidth - container.clientWidth
          container.scrollLeft = maxScroll
          
          if (import.meta.env.DEV) {
            console.log('📜 Scrolled roadmap to rightmost position:', {
              scrollLeft: container.scrollLeft,
              maxScroll,
              scrollWidth: container.scrollWidth,
              clientWidth: container.clientWidth
            })
          }
        }
      }, 100)
    }
  }, [generateBeadRoad, tableId])

  /**
   * Get CSS class for result color
   */
  const getBeadColor = (result: 'meron' | 'wala' | 'draw'): string => {
    switch (result) {
      case 'meron': return 'red'
      case 'wala': return 'blue'
      case 'draw': return 'green'
      default: return ''
    }
  }

  if (variant === 'detailed') {
    return (
      <div className="game-history detailed roadmap">
        {/* Main Bead Road Grid */}
        <div className="roadmap-container" ref={roadmapContainerRef}>
          <div 
            className="bead-road-grid"
            style={{
              gridTemplateRows: `repeat(${GRID_CONFIG.ROWS}, 1fr)`,
              gridTemplateColumns: `repeat(${maxColumn}, 24px)`,
            }}
          >
            {/* Render bead road items */}
            {generateBeadRoad.map((item, index) => (
              <div
                key={`bead-${index}`}
                className={`bead-item ${getBeadColor(item.result)}`}
                style={{
                  gridRow: item.row + 1,
                  gridColumn: item.col + 1
                }}
                title={`Round ${item.round}: ${item.result.toUpperCase()}${item.tieCount ? ` + D×${item.tieCount}` : ''}`}
              >
                <div className="bead-ring" />
                {item.tieCount > 0 && <div className="bead-tie-mark" aria-label={`Tie x ${item.tieCount}`} />}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Status Bar */}
        <div className="roadmap-status-bar flex justify-around items-center px-2 py-1">
          <div className="status-left">
            <span className="round-number">#{displayRound}</span>
            <div className="stat-item">
              <span className="stat-dot red" />
              <span className="stat-value">{gameStats.meronWins}</span>
            </div>
            <div className="stat-item">
              <span className="stat-dot blue" />
              <span className="stat-value">{gameStats.walaWins}</span>
            </div>
            <div className="stat-item">
              <span className="stat-dot green" />
              <span className="stat-value">{gameStats.drawWins}</span>
            </div>
          </div>
          <div className="status-right">
            {statusCode && statusText && (
              <div className="status-badge">
                <span className={`status-dot ${statusCode}`} />
                <span className="status-text">{statusText}</span>
              </div>
            )}
            <button
              onClick={toggleGameSummary}
              className="summary-toggle-btn"
              title="Switch to Game Summary"
            >
              <img src="./home.svg" alt="Home" className="info-icon" />
              <span className="lobby-text">{t('gameHistory.arena')}</span>
            </button>
          </div>
        </div>

        {/* Betting Summary Bar - Only in landscape mode */}
        <BettingSummaryBar />
      </div>
    )
  }

  /**
   * Simple variant - displays bead road in a compact grid
   */
  return (
    <div className="game-history simple">
      <div className="history-header-controls">
        <div className="auto-submit-toggle">
          <button 
            className={`toggle-switch ${autoSubmit ? 'on' : 'off'}`}
            onClick={toggleAutoSubmit}
            aria-label="Auto Submit"
          >
            <span className="toggle-slider">
              <span className="toggle-text">{autoSubmit ? 'ON' : 'OFF'}</span>
            </span>
          </button>
          <span className="toggle-label">自動提交</span>
        </div>
      </div>
      
      {/* Bead Road Grid for Simple Variant */}
      <div className="bead-road-simple">
        <div 
          className="bead-road-grid-simple"
          style={{
            gridTemplateRows: `repeat(${GRID_CONFIG.ROWS}, 1fr)`,
            gridTemplateColumns: `repeat(${Math.min(maxColumn, 12)}, 1fr)`,
          }}
        >
          {/* Render bead road items - show first 72 results max (6 rows x 12 cols) - newest on right */}
          {generateBeadRoad.slice(Math.max(0, generateBeadRoad.length - 72)).map((item, index) => (
            <div
              key={`simple-bead-${index}`}
              className={`bead-item-simple ${getBeadColor(item.result)}`}
              style={{
                gridRow: item.row + 1,
                gridColumn: (item.col % 12) + 1
              }}
              title={`Round ${item.round}: ${item.result.toUpperCase()}${item.tieCount ? ` + D×${item.tieCount}` : ''}`}
            >
              <div className="bead-ring-simple" />
              {item.tieCount > 0 && <div className="bead-tie-mark bead-tie-mark--simple" aria-label={`Tie x ${item.tieCount}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* Stats Bar */}
      <div className="simple-stats-bar">
        <div className="stat-item">
          <span className="stat-dot red" />
          <span className="stat-count">{gameStats.meronWins}</span>
        </div>
        <div className="stat-item">
          <span className="stat-dot green" />
          <span className="stat-count">{gameStats.drawWins}</span>
        </div>
        <div className="stat-item">
          <span className="stat-dot blue" />
          <span className="stat-count">{gameStats.walaWins}</span>
        </div>
      </div>
    </div>
  )
}

export default GameHistory

