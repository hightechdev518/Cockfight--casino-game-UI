import { useCallback, useMemo, useEffect, useState, useRef } from 'react'
import { apiService, sessionManager } from '../../services/apiService'
import { useGameStore } from '../../store/gameStore'
import { setUrlParam } from '../../utils/urlParams'
import { shouldThrottle, completeThrottle } from '../../utils/apiThrottle'
import './GameSummary.css'

interface GameSummaryProps {
  onClose?: () => void
}

interface TableInfo {
  id: string
  name: string
  round: number
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
      
      // Determine status based on API data
      let status = 'Betting'
      if (table.status) {
        status = table.status
      } else if (table.round_status) {
        status = table.round_status
      } else if (table.roundstatus === 1) {
        status = 'Betting'
      } else if (table.roundstatus === 2) {
        status = 'Fighting'
      } else if (table.roundstatus === 4) {
        status = 'Settled'
      } else if (table.state) {
        status = table.state
      } else if (table.countdown !== undefined && table.countdown > 0) {
        status = 'Betting'
      } else if (table.countdown === 0 || table.is_fighting) {
        status = 'Fighting'
      }
      
      // Get open count or player count
      const openCount = table.open_count || table.player_count || table.online_count || table.count || 0
      
      // Check if table is in maintenance
      // Based on backend logic: table is live when enable === true AND tablestatus === 1
      // Maintenance should be detected conservatively - only if explicitly indicated
      const enable = table.enable
      const tablestatus = table.tablestatus
      
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
      
      // Conservative maintenance detection based on actual API response:
      // A table is in maintenance ONLY if:
      // 1. enable is explicitly false (not undefined/null/true)
      // 2. OR there's an explicit maintenance/maintain flag set to true
      // 
      // Note: We do NOT check tablestatus !== 1 because:
      // - tablestatus might not exist in API response for all tables
      // - tablestatus might have values other than 1 that don't mean maintenance
      // - According to WebSocket logic: table is "live" when enable && tablestatus === 1
      //   but that doesn't mean other tablestatus values indicate maintenance
      const isMaintenance = 
        enable === false ||  // Explicitly disabled (strict equality check)
        table.maintenance === true ||  // Explicit maintenance flag
        table.maintain === true  // Explicit maintain flag
      
      if (import.meta.env.DEV) {
        console.log(`📊 [Table ${mappedTableId}] Maintenance Result:`, {
          enable,
          enableIsFalse: enable === false,
          maintenance: table.maintenance,
          maintain: table.maintain,
          isMaintenance,
          willBeDisabled: isMaintenance
        })
      }

      tablesList.push({
        id: mappedTableId,
        name: tableName,
        round: typeof round === 'number' ? round : parseInt(String(round)) || 0,
        status: isMaintenance ? 'Maintenance' : status,
        openCount: typeof openCount === 'number' ? openCount : parseInt(String(openCount)) || 0,
        tableId: mappedTableId, // Use mapped table ID (CF01, CF02, etc.)
        roundId: roundId,
        isMaintenance: isMaintenance
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
  const fetchTables = useCallback(async () => {
    // Throttle API calls - don't fetch more than once every 10 seconds
    const now = Date.now()
    if (now - lastFetchTimeRef.current < 10000) return
    
    lastFetchTimeRef.current = now

    try {
      // Try authenticated endpoint first
      let lobbyData: any
      
      if (sessionManager.getSessionId()) {
        try {
          // Use throttling utility to prevent duplicate calls
          const throttleKey = 'lobbyinfo_gamesummary'
          if (!shouldThrottle(throttleKey, 10000)) {
            if (import.meta.env.DEV) {
              console.debug('⏸️ Throttled GameSummary lobbyinfo call')
            }
            return
          }
          
          lobbyData = await apiService.getLobbyInfo()
          completeThrottle(throttleKey)
        } catch (error) {
          // If authenticated fails, we can't get table info
          // Failed to fetch lobby info
          setTables([])
          return
        }
      } else {
        // No session, can't fetch lobby info
        setTables([])
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
    }
  }, [parseLobbyInfo])

  /**
   * Sets up periodic table fetching
   */
  useEffect(() => {
    // Initial fetch
    fetchTables()
    
    // Poll every 15 seconds for updates (reduced frequency to prevent server overload)
    const interval = setInterval(() => {
      fetchTables()
    }, 15000)

    return () => {
      clearInterval(interval)
    }
  }, [fetchTables])

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
   * Handles table selection/switching
   * Uses table IDs: CF01, CF02, CF03, CF04, CF05, CF06
   * Triggers full re-initialization with new table data
   */
  const handleTableClick = useCallback((selectedTable: TableInfo) => {
    if (!selectedTable.tableId) return
    
    // Don't allow switching to tables in maintenance
    if (selectedTable.isMaintenance) {
      if (import.meta.env.DEV) {
        console.log('⚠️ Cannot switch to table in maintenance:', selectedTable.name)
      }
      return
    }
    
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
        <h2 className="text-white text-lg font-bold">Rooms</h2>
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
          const isDisabled = game.isMaintenance
          return (
            <div 
              key={game.id} 
              className={`game-card ${isActiveTable ? 'active-table' : ''} ${isDisabled ? 'disabled-table' : ''}`}
              onClick={() => !isDisabled && handleTableClick(game)}
              style={{ cursor: isDisabled ? 'not-allowed' : 'pointer' }}
              title={isDisabled ? `${game.name} is in maintenance` : `Click to switch to ${game.name}`}
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
                <div className="game-detail">
                  <span className="detail-label text-gray-400 text-xs">Round</span>
                  <span className={`detail-value text-sm font-semibold`}>
                    {game.round}
                  </span>
                </div>

                {/* Status */}
                <div className="game-detail">
                  <span className="detail-label text-gray-400 text-xs">Status</span>
                  <span className={`detail-value text-sm font-semibold px-2 py-1 rounded ${getStatusBgColor(game.status)}`}>
                    {game.status}
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
