import { useCallback, useMemo, useEffect, useState, useRef } from 'react'
import { apiService, sessionManager } from '../../services/apiService'
import { useGameStore } from '../../store/gameStore'
import { setUrlParam } from '../../utils/urlParams'
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
    // Map table numbers to table IDs: Table 1 → CF01, Table 2 → CF02, etc.
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
      
      // Display name as "Table 1", "Table 2", etc.
      const tableName = `Table ${tableNumber}`
      
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

      tablesList.push({
        id: mappedTableId,
        name: tableName,
        round: typeof round === 'number' ? round : parseInt(String(round)) || 0,
        status: status,
        openCount: typeof openCount === 'number' ? openCount : parseInt(String(openCount)) || 0,
        tableId: mappedTableId, // Use mapped table ID (CF01, CF02, etc.)
        roundId: roundId
      })
    })

    // Sort by table number to ensure correct order (Table 1, 2, 3, 4, 5, 6)
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
    // Throttle API calls - don't fetch more than once every 3 seconds
    const now = Date.now()
    if (now - lastFetchTimeRef.current < 3000) return
    
    lastFetchTimeRef.current = now

    try {
      // Try authenticated endpoint first
      let lobbyData: any
      
      if (sessionManager.getSessionId()) {
        try {
          lobbyData = await apiService.getLobbyInfo()
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
    
    // Poll every 5 seconds for updates
    const interval = setInterval(() => {
      fetchTables()
    }, 5000)

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
    return 'bg-gray-900/30'
  }, [])

  /**
   * Handles table selection/switching
   * Maps Table 1 → CF01, Table 2 → CF02, etc.
   */
  const handleTableClick = useCallback((selectedTable: TableInfo) => {
    if (!selectedTable.tableId) return
    
    // Ensure we're using the correct table ID (CF01, CF02, etc.)
    const targetTableId = selectedTable.tableId
    
    if (import.meta.env.DEV) {
      console.log('🔄 Switching to table:', selectedTable.name, '→', targetTableId)
    }
    
    // Switch table in store
    switchTable(targetTableId)
    
    // Update URL parameter
    setUrlParam('tableid', targetTableId)
    
    // Close game summary view
    setGameSummary(false)
    
    // Switched to table
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

                {/* Open Count */}
                <div className="game-detail">
                  <span className="detail-label text-gray-400 text-xs">Players</span>
                  <span className={`detail-value text-sm font-semibold`}>
                    {game.openCount}
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
