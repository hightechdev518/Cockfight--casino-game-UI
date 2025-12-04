import { useCallback, useMemo, useEffect, useRef, useState } from 'react'
import { useGameStore, GameHistory as GameHistoryType } from '../../store/gameStore'
import { apiService, sessionManager } from '../../services/apiService'
import './GameHistory.css'

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
  result: 'meron' | 'wala' | 'draw'
  round: number
  col: number
  row: number
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
  const { gameHistory, autoSubmit, toggleAutoSubmit, currentRound, toggleGameSummary, tableId, setGameHistory } = useGameStore()
  const lastFetchTimeRef = useRef(0)
  const [accuStats, setAccuStats] = useState<{ meronWins: number; walaWins: number; drawWins: number }>({
    meronWins: 0,
    walaWins: 0,
    drawWins: 0
  })
  const [apiRound, setApiRound] = useState<number | null>(null)
  const roadmapContainerRef = useRef<HTMLDivElement>(null)

  /**
   * Parses API response and converts to GameHistory format
   * According to backend README: Returns drawresult:{tableid} plus accu, roadmap, goodroad, and allgr
   */
  const parseApiHistory = useCallback((apiData: any): GameHistoryType[] => {
    if (!apiData) return []
    
    // The API returns: drawresult:{tableid} plus accu, roadmap, goodroad, and allgr
    // Standard response format: { code: "B100", msg: "...", data: { ... } }
    let drawResults: any[] = []
    
    // Handle standard API response format
    if (apiData.data) {
      // Check for drawresult key (most likely structure)
      if (apiData.data.drawresult && Array.isArray(apiData.data.drawresult)) {
        drawResults = apiData.data.drawresult
      } 
      // Check if data itself is an array (drawresult might be the array)
      else if (Array.isArray(apiData.data)) {
        drawResults = apiData.data
      }
      // Check for nested data structure
      else if (apiData.data.data && Array.isArray(apiData.data.data)) {
        drawResults = apiData.data.data
      }
      // Try to find any array in the data object
      else if (typeof apiData.data === 'object') {
        const keys = Object.keys(apiData.data)
        // Look for drawresult key first
        const drawresultKey = keys.find(k => k.toLowerCase().includes('drawresult') || k.toLowerCase().includes('draw'))
        if (drawresultKey && Array.isArray(apiData.data[drawresultKey])) {
          drawResults = apiData.data[drawresultKey]
        }
        // Otherwise, find first array
        else {
          for (const key of keys) {
            if (Array.isArray(apiData.data[key])) {
              drawResults = apiData.data[key]
              break
            }
          }
        }
      }
    }
    // Handle case where response might be direct array (public_history.php might return this)
    else if (Array.isArray(apiData)) {
      drawResults = apiData
    }

    // Convert API format to GameHistory format
    return drawResults.map((item: any, index: number) => {
      // Handle different possible field names for round number
      const round = item.r_no || item.round || item.r_id || item.rno || item.round_no || (index + 1)
      
      // Handle different possible field names for result
      // Backend likely uses: M=meron, W=wala, D=draw or similar codes
      const result = item.result || item.winner || item.win || item.winner_type || item.bet_result || item.outcome || ''
      
      // Map result to our format
      let mappedResult: 'meron' | 'wala' | 'draw' = 'meron'
      if (typeof result === 'string') {
        const resultLower = result.toLowerCase().trim()
        // Check for meron indicators
        if (resultLower === 'm' || resultLower === 'meron' || resultLower === '龍' || 
            resultLower === '21001' || resultLower.includes('meron')) {
          mappedResult = 'meron'
        } 
        // Check for wala indicators
        else if (resultLower === 'w' || resultLower === 'wala' || resultLower === '虎' || 
                 resultLower === '21002' || resultLower.includes('wala')) {
          mappedResult = 'wala'
        } 
        // Check for draw indicators
        else if (resultLower === 'd' || resultLower === 'draw' || resultLower === '和' || 
                 resultLower === '21003' || resultLower.includes('draw')) {
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
  }, [])

  /**
   * Fetches history from API
   */
  const fetchHistory = useCallback(async () => {
    if (!tableId) return
    
    // Throttle API calls - don't fetch more than once every 3 seconds
    const now = Date.now()
    if (now - lastFetchTimeRef.current < 3000) return
    
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
          const parsedHistory = parseApiHistory(historyData)
          if (parsedHistory.length > 0) {
            setGameHistory(parsedHistory)
            // Successfully parsed history
          } else {
            // If parsing returned empty, clear history to show only real data
            setGameHistory([])
            // History parsing returned empty array
          }

          // Extract accu (accumulation) data for statistics
          // According to backend README: Returns accu, roadmap, goodroad, and allgr
          if (historyData.data) {
            const accu = historyData.data.accu
            if (accu && typeof accu === 'object') {
              // Parse accu data - format may vary, handle different structures
              const meronWins = accu.meron || accu.M || accu.meronWins || accu.meron_count || 0
              const walaWins = accu.wala || accu.W || accu.walaWins || accu.wala_count || 0
              const drawWins = accu.draw || accu.D || accu.drawWins || accu.draw_count || 0
              
              setAccuStats({
                meronWins: typeof meronWins === 'number' ? meronWins : parseInt(String(meronWins)) || 0,
                walaWins: typeof walaWins === 'number' ? walaWins : parseInt(String(walaWins)) || 0,
                drawWins: typeof drawWins === 'number' ? drawWins : parseInt(String(drawWins)) || 0
              })
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
   * Sets up periodic history fetching
   */
  useEffect(() => {
    if (!tableId) return
    
    // Initial fetch
    fetchHistory()
    
    // Poll every 5 seconds for updates
    const interval = setInterval(() => {
      fetchHistory()
    }, 5000)

    return () => {
      clearInterval(interval)
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
   * Generates Bead Road pattern from history
   * Rules:
   * - Red ring = Meron win
   * - Blue ring = Wala win  
   * - Green ring = Draw
   * - Same consecutive result = stack vertically (same column)
   * - Different result = new column (horizontal)
   * - When column is full (6 rows), continue in next column
   */
  const generateBeadRoad = useMemo((): BeadRoadItem[] => {
    if (history.length === 0) return []

    const beadRoad: BeadRoadItem[] = []
    let currentCol = 0
    let currentRow = 0
    let lastResult: 'meron' | 'wala' | 'draw' | null = null

    // Process each game result
    history.forEach((item) => {
      const result = item.result

      if (lastResult === null) {
        // First result - start at column 0, row 0
        currentCol = 0
        currentRow = 0
      } else if (result === lastResult) {
        // Same result as previous - stack vertically
        currentRow++
        
        // If column is full (6 rows), move to next column
        if (currentRow >= GRID_CONFIG.ROWS) {
          currentCol++
          currentRow = 0
        }
      } else {
        // Different result - new column
        currentCol++
        currentRow = 0
      }

      beadRoad.push({
        result,
        round: item.round,
        col: currentCol,
        row: currentRow
      })

      lastResult = result
    })

    return beadRoad
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
   * Auto-scroll to show newest results (rightmost columns)
   */
  useEffect(() => {
    if (roadmapContainerRef.current && generateBeadRoad.length > 0) {
      // Scroll to the right to show newest results
      roadmapContainerRef.current.scrollLeft = roadmapContainerRef.current.scrollWidth
    }
  }, [generateBeadRoad])

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
                title={`Round ${item.round}: ${item.result.toUpperCase()}`}
              >
                <div className="bead-ring" />
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
            <button
              onClick={toggleGameSummary}
              className="summary-toggle-btn"
              title="Switch to Game Summary"
            >
              <img src="/Button/Lobby.svg" alt="Info" className="info-icon h-[32px]" />
            </button>
          </div>
        </div>
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
          {/* Render bead road items - show last 72 results max (6 rows x 12 cols) */}
          {generateBeadRoad.slice(-72).map((item, index) => (
            <div
              key={`simple-bead-${index}`}
              className={`bead-item-simple ${getBeadColor(item.result)}`}
              style={{
                gridRow: item.row + 1,
                gridColumn: (item.col % 12) + 1
              }}
              title={`Round ${item.round}: ${item.result.toUpperCase()}`}
            >
              <div className="bead-ring-simple" />
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

