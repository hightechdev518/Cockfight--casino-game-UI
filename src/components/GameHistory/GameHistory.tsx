import { useCallback, useMemo, useEffect, useRef, useState } from 'react'
import { useGameStore, GameHistory as GameHistoryType } from '../../store/gameStore'
import { apiService, sessionManager } from '../../services/apiService'
import BettingSummaryBar from './BettingSummaryBar'
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
  useEffect(() => {
    if (!tableId) return
    
    // Initial fetch on mount
    fetchHistory()
  }, [tableId, fetchHistory])

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
   * Generates Bead Road pattern from history
   * Rules (Bead Road / 大路):
   * - Red ring = Meron win
   * - Blue ring = Wala win  
   * - Green ring = Draw
   * - Same consecutive result = stack vertically (same column)
   * - Different result (Meron/Wala) = new column (horizontal)
   * - Draw result = continue vertically in same column (does NOT create new column)
   * - When column is full (6 rows), continue in next column
   * - Oldest results appear on the right, newest on the left
   * - History should be processed from oldest to newest (left to right)
   */
  const generateBeadRoad = useMemo((): BeadRoadItem[] => {
    if (history.length === 0) return []

    const beadRoad: BeadRoadItem[] = []
    let currentCol = 0
    let currentRow = 0
    let lastResult: 'meron' | 'wala' | 'draw' | null = null

    // Process history from oldest to newest (left to right in display)
    // History array is already in chronological order (oldest first)
    history.forEach((item) => {
      const result = item.result

      if (lastResult === null) {
        // First result - start at column 0, row 0
        currentCol = 0
        currentRow = 0
      } else if (result === 'draw') {
        // Draw result - continue vertically in same column (do NOT create new column)
        currentRow++
        
        // If column is full (6 rows), move to next column
        if (currentRow >= GRID_CONFIG.ROWS) {
          currentCol++
          currentRow = 0
        }
      } else if (result === lastResult) {
        // Same result as previous (and not draw) - stack vertically (same column)
        currentRow++
        
        // If column is full (6 rows), move to next column
        if (currentRow >= GRID_CONFIG.ROWS) {
          currentCol++
          currentRow = 0
        }
      } else {
        // Different result (Meron/Wala) - new column (move right)
        // Only create new column if it's a different Meron/Wala result
        // (Draw already handled above)
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

    // Reverse so newest appears on the left (for display)
    return beadRoad.reverse()
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
   * Auto-scroll to show newest results (leftmost columns after reversal)
   */
  useEffect(() => {
    if (roadmapContainerRef.current && generateBeadRoad.length > 0) {
      // Scroll to the left to show newest results (they're now on the left)
      roadmapContainerRef.current.scrollLeft = 0
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
              <img src="/home.svg" alt="Home" className="info-icon" />
              <span className="lobby-text">Lobby</span>
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
          {/* Render bead road items - show first 72 results max (6 rows x 12 cols) - newest on left */}
          {generateBeadRoad.slice(0, 72).map((item, index) => (
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

