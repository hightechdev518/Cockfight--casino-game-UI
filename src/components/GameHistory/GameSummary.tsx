import { useCallback, useMemo, useEffect, useState, useRef } from 'react'
import { apiService, sessionManager } from '../../services/apiService'
import { useGameStore } from '../../store/gameStore'
import { setUrlParam } from '../../utils/urlParams'
import { shouldThrottle, completeThrottle } from '../../utils/apiThrottle'
import { useI18n } from '../../i18n/LanguageContext'
import './GameSummary.css'

// Silence all console output in src/ (requested cleanup)
const console: Pick<Console, 'log' | 'warn' | 'error' | 'debug'> = {
  log: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

interface GameSummaryProps {
  onClose?: () => void
}

interface TableInfo {
  id: string
  name: string
  round: number
  roundIdentifier?: string // Format: roundId[roundNumber from server (e.g., "1268197[118")
  status: string
  openCount?: number
  tableId?: string
  roundId?: string
  isMaintenance?: boolean
}

/**
 * GameSummary component displays real table/room information from API
 * Shows table cards with name, round number, status, and open count
 */
const GameSummary: React.FC<GameSummaryProps> = ({ onClose }) => {
  const [tables, setTables] = useState<TableInfo[]>([])
  const lastFetchTimeRef = useRef(0)
  const { tableId, switchTable, setGameSummary } = useGameStore()
  const { t } = useI18n()

  /**
   * Parses lobby info API response to extract table information
   */
  const parseLobbyInfo = useCallback((apiData: any): TableInfo[] => {
    if (!apiData || !apiData.data) return []
    
    const tablesList: TableInfo[] = []
    
    // Handle different possible response structures
    let tablesData: any[] = []
    
    if (Array.isArray(apiData.data)) {
      tablesData = apiData.data
    } else if (apiData.data.tables && Array.isArray(apiData.data.tables)) {
      tablesData = apiData.data.tables
    } else if (apiData.data.allTableRound && Array.isArray(apiData.data.allTableRound)) {
      tablesData = apiData.data.allTableRound
    } else if (typeof apiData.data === 'object') {
      // Try to find array of tables in the data object
      const keys = Object.keys(apiData.data)
      for (const key of keys) {
        if (Array.isArray(apiData.data[key])) {
          tablesData = apiData.data[key]
          break
        } else if (typeof apiData.data[key] === 'object' && apiData.data[key] !== null) {
          // Handle nested object structure (e.g., tableId -> table data)
          const nestedKeys = Object.keys(apiData.data[key])
          if (nestedKeys.length > 0) {
            // Convert object to array
            tablesData = Object.entries(apiData.data[key]).map(([id, data]: [string, any]) => ({
              ...data,
              tableId: id
            }))
            break
          }
        }
      }
    }

    // Convert API format to TableInfo format
    // Map table numbers to table IDs: 1 → CF01, 2 → CF02, etc.
    const tableIdMap: Record<number, string> = {
      1: 'CF01',
      2: 'CF02',
      3: 'CF03',
      4: 'CF04',
      5: 'CF05',
      6: 'CF06'
    }
    
    tablesData.forEach((table: any, index: number) => {
      // Get table number from API (tableid like "CF01" or index)
      const apiTableId = table.tableid || table.tableId || table.t_id || table.table_id || table.id
      
      // Determine table number (1-6)
      let tableNumber = index + 1
      
      // Try to extract table number from tableId (e.g., "CF01" → 1)
      if (apiTableId) {
        const match = apiTableId.match(/CF0?(\d+)/i) || apiTableId.match(/(\d+)/)
        if (match) {
          const num = parseInt(match[1], 10)
          if (num >= 1 && num <= 6) {
            tableNumber = num
          }
        }
      }
      
      // Map to correct table ID (CF01, CF02, etc.)
      const mappedTableId = tableIdMap[tableNumber] || `CF0${tableNumber}`
      
      // Display name as "CF01", "CF02", etc.
      const tableName = mappedTableId
      
      const round = table.r_no || table.round || table.r_id || table.round_no || table.r_info?.cf_roundno || 0
      const roundId = table.r_id || table.round_id || table.roundId || table.trid
      
      // Get tablestatus and enable from server API - USE REAL API FIELD (same as WebSocket)
      const enable = table.enable
      const tablestatus = table.tablestatus
      
      // Determine status based on API data - USE tablestatus from server (like WebSocket does)
      // Priority: table.status > table.state > tablestatus (from server) > roundstatus
      let status = 'Betting' // Default fallback
      
      // Priority 1: Use table.status from server (direct status string)
      if (table.status) {
        status = String(table.status).trim()
        // Normalize common status values
        const statusLower = status.toLowerCase()
        if (statusLower === 'betting' || statusLower === 'open') {
          status = 'Betting'
        } else if (statusLower === 'inprogress' || statusLower === 'in progress' || statusLower === 'fighting') {
          status = 'Fighting'
        } else if (statusLower === 'waiting' || statusLower === 'wait') {
          status = 'Waiting'
        } else if (statusLower === 'settled' || statusLower === 'closed') {
          status = 'Settled'
        } else if (statusLower === 'maintenance' || statusLower === 'maintain') {
          status = 'Maintenance'
        } else {
          // Capitalize first letter of each word
          status = status.split(' ').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
          ).join(' ')
        }
      }
      // Priority 2: Use table.state from server
      else if (table.state) {
        status = String(table.state).trim()
        const statusLower = status.toLowerCase()
        if (statusLower === 'betting' || statusLower === 'open') {
          status = 'Betting'
        } else if (statusLower === 'inprogress' || statusLower === 'in progress' || statusLower === 'fighting') {
          status = 'Fighting'
        } else if (statusLower === 'waiting' || statusLower === 'wait') {
          status = 'Waiting'
        } else if (statusLower === 'settled' || statusLower === 'closed') {
          status = 'Settled'
        } else if (statusLower === 'maintenance' || statusLower === 'maintain') {
          status = 'Maintenance'
        } else {
          status = status.split(' ').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
          ).join(' ')
        }
      }
      // Priority 3: Use tablestatus from server API (REAL API FIELD - same logic as WebSocket)
      // WebSocket uses: isLive = tableData.enable && tableData.tablestatus === 1
      // tablestatus === 1 means table is live/operational
      // tablestatus === 4 means table is waiting (not maintenance)
      // tablestatus !== 1 and !== 4 means table is not live (maintenance or disabled)
      else if (tablestatus !== undefined) {
        // Special case: tablestatus === 4 means waiting, not maintenance
        if (tablestatus === 4) {
          status = 'Waiting'
        } else {
          // Check if table is live (same logic as WebSocket)
          const isLive = enable !== false && tablestatus === 1
          if (isLive) {
            // Table is live and enabled - use round status to determine current game state
            if (table.roundstatus === 1) {
              status = 'Betting'
            } else if (table.roundstatus === 2) {
              status = 'Fighting'
            } else if (table.roundstatus === 4) {
              status = 'Settled'
            } else if (table.roundstatus === 0 || table.roundstatus === undefined) {
              // Table is live but no active round yet - waiting for next round
              status = 'Waiting'
            } else {
              // Table is live but round status unknown (could be 3, 5, etc.) - default to waiting
              status = 'Waiting'
            }
          } else {
            // tablestatus !== 1 and !== 4 OR enable === false means table is not live (maintenance or disabled)
            status = 'Maintenance'
          }
        }
      }
      // Fallback: Use round status only if table status is not available
      else if (table.roundstatus !== undefined) {
        if (table.roundstatus === 1) {
          status = 'Betting'
        } else if (table.roundstatus === 2) {
          status = 'Fighting'
        } else if (table.roundstatus === 4) {
          status = 'Settled'
        } else if (table.roundstatus === 0) {
          status = 'Waiting'
        } else {
          // Unknown roundstatus value (3, 5, etc.) - treat as waiting
          status = 'Waiting'
        }
      }
      // Last resort: Use countdown or other indicators
      else if (table.countdown !== undefined && table.countdown > 0) {
        status = 'Betting'
      } else if (table.countdown === 0 || table.is_fighting) {
        status = 'Fighting'
      }
      
      // Get open count or player count
      const openCount = table.open_count || table.player_count || table.online_count || table.count || 0
      
      // Check if table is in maintenance
      // Based on backend logic: table is live when enable === true AND tablestatus === 1 (same as WebSocket)
      // Maintenance should be detected conservatively - only if explicitly indicated
      
      // Log ALL table data for debugging to verify API response structure
      if (import.meta.env.DEV) {
        console.log(`📊 [Table ${mappedTableId}] Full API Response:`, JSON.stringify(table, null, 2))
        console.log(`📊 [Table ${mappedTableId}] Key Fields:`, {
          tableid: apiTableId,
          enable: enable,
          enableType: typeof enable,
          tablestatus: tablestatus,
          tablestatusType: typeof tablestatus,
          maintenance: table.maintenance,
          maintain: table.maintain,
          roundstatus: table.roundstatus,
          status: table.status,
          allKeys: Object.keys(table)
        })
      }
      
      // Check maintenance status
      // IMPORTANT: If roundstatus indicates an active game (1=betting, 2=fighting, 4=settled),
      // the table is NOT in maintenance even if enable is false (could be temporary state)
      // Also: tablestatus === 4 means waiting, not maintenance
      // Maintenance should ONLY be shown if:
      // 1. enable is explicitly false AND there's no active round status, OR
      // 2. Explicit maintenance/maintain flags are set
      // 3. tablestatus is NOT 1 and NOT 4 (excluding waiting status from maintenance)
      const hasActiveRoundStatus = table.roundstatus === 1 || table.roundstatus === 2 || table.roundstatus === 4
      
      const isMaintenance = 
        (enable === false && !hasActiveRoundStatus) ||  // Disabled AND no active round
        (tablestatus !== undefined && tablestatus !== 1 && tablestatus !== 4 && !hasActiveRoundStatus) ||  // tablestatus !== 1 and !== 4 (waiting excluded)
        table.maintenance === true ||  // Explicit maintenance flag
        table.maintain === true  // Explicit maintain flag
      
      if (import.meta.env.DEV) {
        console.log(`📊 [Table ${mappedTableId}] Status Check:`, {
          enable,
          tablestatus,
          roundstatus: table.roundstatus,
          hasActiveRoundStatus,
          maintenance: table.maintenance,
          maintain: table.maintain,
          isMaintenance,
          calculatedStatus: status
        })
      }

      // If roundstatus indicates fighting (2), always show Fighting, don't let maintenance override
      if (table.roundstatus === 2 && status !== 'Fighting') {
        status = 'Fighting'
      }
      
      // Only override with Maintenance if truly in maintenance (not during active game)
      const finalStatus = isMaintenance && !hasActiveRoundStatus ? 'Maintenance' : status

      // Format: roundId[roundNumber] from server (e.g., "1268197[118")
      const roundIdentifier = roundId && round 
        ? `${roundId}[${round}`
        : roundId 
        ? String(roundId)
        : round 
        ? `[${round}`
        : ''

      tablesList.push({
        id: mappedTableId,
        name: tableName,
        round: typeof round === 'number' ? round : parseInt(String(round)) || 0,
        roundIdentifier: roundIdentifier, // Format: roundId[roundNumber from server
        status: finalStatus,
        openCount: typeof openCount === 'number' ? openCount : parseInt(String(openCount)) || 0,
        tableId: mappedTableId, // Use mapped table ID (CF01, CF02, etc.)
        roundId: roundId,
        isMaintenance: isMaintenance && !hasActiveRoundStatus
      })
    })

    // Sort by table number to ensure correct order (CF01, CF02, CF03, CF04, CF05, CF06)
    tablesList.sort((a, b) => {
      const aNum = parseInt(a.tableId?.replace('CF0', '') || '0', 10)
      const bNum = parseInt(b.tableId?.replace('CF0', '') || '0', 10)
      return aNum - bNum
    })

    return tablesList.slice(0, 6) // Limit to 6 tables
  }, [])

  /**
   * Fetches table/room information from API
   */
  const fetchTables = useCallback(async (force = false) => {
    // Throttle API calls - don't fetch more than once every 20 seconds (increased from 10s)
    // But allow force fetch when component becomes visible
    const now = Date.now()
    if (!force && now - lastFetchTimeRef.current < 20000) {
      if (import.meta.env.DEV) {
        console.debug('⏸️ Throttled GameSummary fetchTables call')
      }
      return
    }
    
    lastFetchTimeRef.current = now

    try {
      // Try authenticated endpoint first
      let lobbyData: any
      
      if (sessionManager.getSessionId()) {
        try {
          // Use throttling utility to prevent duplicate calls
          // But allow force fetch to bypass throttling when component becomes visible
          const throttleKey = 'lobbyinfo_gamesummary'
          if (!force && !shouldThrottle(throttleKey, 20000)) {
            if (import.meta.env.DEV) {
              console.debug('⏸️ Throttled GameSummary lobbyinfo call')
            }
            return
          }
          
          // If force fetch, clear any existing throttle to ensure fresh fetch
          if (force) {
            completeThrottle(throttleKey)
          }
          
          lobbyData = await apiService.getLobbyInfo()
          if (!force) {
            completeThrottle(throttleKey)
          }
        } catch (error) {
          // If authenticated fails, we can't get table info
          // Failed to fetch lobby info
          setTables([])
          if (import.meta.env.DEV) {
            console.error('❌ Failed to fetch lobby info:', error)
          }
          return
        }
      } else {
        // No session, can't fetch lobby info
        setTables([])
        if (import.meta.env.DEV) {
          console.warn('⚠️ No session available for GameSummary')
        }
        return
      }

      if (lobbyData && lobbyData.code === 'B100') {
        // Log raw API response for debugging (only in dev mode)
        if (import.meta.env.DEV) {
          console.log('📋 Raw LobbyInfo API response:', JSON.stringify(lobbyData, null, 2))
        }
        const parsedTables = parseLobbyInfo(lobbyData)
        if (parsedTables.length > 0) {
          setTables(parsedTables)
        } else {
          setTables([])
          // No tables found in lobby info
        }
      } else {
        setTables([])
      }
    } catch (error) {
      setTables([])
      // Failed to fetch tables
      if (import.meta.env.DEV) {
        console.error('❌ Failed to fetch tables in GameSummary:', error)
      }
    }
  }, [parseLobbyInfo])

  /**
   * Sets up periodic table fetching
   * Always force fetch when component mounts (becomes visible) to ensure tables are loaded
   */
  useEffect(() => {
    // Always force fetch when component mounts/becomes visible
    // This ensures tables are always loaded when Game Summary opens, regardless of throttling
    if (import.meta.env.DEV) {
      console.log('🔄 GameSummary: Component mounted, fetching tables (force)')
    }
    fetchTables(true) // Force fetch on mount
    
    // Poll every 60 seconds for updates (reduced frequency to minimize server calls)
    const interval = setInterval(() => {
      fetchTables() // Regular fetch (will be throttled)
    }, 60000) // Increased from 30s to 60s

    return () => {
      clearInterval(interval)
    }
  }, [fetchTables]) // Only depend on fetchTables, not tables.length

  /**
   * Gets the tables to display
   */
  const gameSummaries = useMemo(() => {
    return tables
  }, [tables])

  /**
   * Gets background color for status
   */
  const getStatusBgColor = useCallback((status: string): string => {
    if (status.includes('Betting')) return 'betting-text-color'
    if (status.includes('Fighting')) return 'fighting-text-color'
    if (status.includes('Maintenance')) return 'maintenance-text-color'
    return 'bg-gray-900/30'
  }, [])

  /**
   * Translates status value to current language
   */
  const translateStatus = useCallback((status: string): string => {
    const statusLower = status.toLowerCase()
    if (statusLower.includes('betting')) return t('gameSummary.status.betting')
    if (statusLower.includes('fighting')) return t('gameSummary.status.fighting')
    if (statusLower.includes('waiting')) return t('gameSummary.status.waiting')
    if (statusLower.includes('settled')) return t('gameSummary.status.settled')
    if (statusLower.includes('maintenance')) return t('gameSummary.status.maintenance')
    return status // Fallback to original if unknown
  }, [t])

  /**
   * Handles table selection/switching
   * Uses table IDs: CF01, CF02, CF03, CF04, CF05, CF06
   * Triggers full re-initialization with new table data
   */
  const handleTableClick = useCallback((selectedTable: TableInfo) => {
    if (!selectedTable.tableId) return
    
    // Ensure we're using the correct table ID (CF01, CF02, etc.)
    const targetTableId = selectedTable.tableId
    
    if (import.meta.env.DEV) {
      console.log('🔄 Switching to table:', selectedTable.name, '→', targetTableId)
    }
    
    // Normalize tableId to uppercase
    const normalizedTableId = targetTableId.toUpperCase()
    
    // Switch table in store (this clears game data and saves to localStorage)
    // This will trigger the useEffect in App.tsx that refreshes table data
    switchTable(normalizedTableId)
    
    // Update URL parameter (this persists across reloads)
    setUrlParam('tableid', normalizedTableId)
    
    // Close game summary view
    setGameSummary(false)
  }, [switchTable, setGameSummary])

  return (
    <div className="game-summary-container">
      {/* Header */}
      <div className="game-summary-header">
        <h2 className="text-white text-lg font-bold">{t('gameSummary.title')}</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="close-button text-gray-400 hover:text-white transition"
            aria-label="Close Summary"
          >
            ✕
          </button>
        )}
      </div>

      {/* Games Grid - 6 cards */}
      <div className="games-grid">
        {gameSummaries.map((game) => {
          const isActiveTable = game.tableId === tableId
          return (
            <div 
              key={game.id} 
              className={`game-card ${isActiveTable ? 'active-table' : ''}`}
              onClick={() => handleTableClick(game)}
              style={{ cursor: 'pointer' }}
              title={`Click to switch to ${game.name}`}
            >
              <div className="game-card-body">
                {/* Table Name */}
                <div className="game-detail">
                  <span className="detail-value text-white text-sm font-semibold">
                    {game.name}
                    {isActiveTable && <span className="ml-2 text-xs text-yellow-400">●</span>}
                  </span>
                </div>

                {/* Round Number */}
                {game.round > 0 && (
                  <div className="game-detail">
                    <span className="detail-value text-sm font-semibold text-white">
                      {game.round}
                    </span>
                  </div>
                )}

                {/* Status */}
                <div className="game-detail">
                  <span className="detail-label text-gray-400 text-xs">{t('gameSummary.status.label')}</span>
                  <span className={`detail-value text-sm font-semibold px-2 py-1 rounded ${getStatusBgColor(game.status)}`}>
                    {translateStatus(game.status)}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default GameSummary
