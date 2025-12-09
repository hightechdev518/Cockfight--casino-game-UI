import { useState, useEffect, useCallback } from 'react'
import { apiService } from '../../services/apiService'
import { mapBackendToBetType, getBetTypeDisplayName } from '../../utils/betMapping'
import { sessionManager } from '../../services/apiService'
import './BettingHistoryModal.css'

interface BetRecord {
  w_no: string // BetID
  w_t_id: string // Arena (table ID)
  w_bettype: string | number // Bet type code
  w_betzone: string // Bet zone
  w_bet: string | number // Valid Bet amount
  w_win: string | number | null // Win amount (null if lost)
  w_status: number // Status: 0 = unsettled, other = settled
  w_betdate: string // Bet time
  [key: string]: any
}

interface MatchRecord {
  tableid: string // Arena (table ID)
  trid: number | string // Round number
  drawresult?: string // Result as JSON string like "\"M\""
  result1?: string // Result as M/W/D
  status?: number // Status: 4 = settled
  opendate?: string // Open date/time
  r_opendate?: string // Alternative field for open date
  [key: string]: any
}

interface BettingHistoryModalProps {
  isOpen: boolean
  onClose: () => void
}

type TabType = 'bet' | 'game'

// Common table IDs
const TABLE_IDS = ['CF01', 'CF02', 'CF03', 'CF04', 'CF05', 'CF06']

const BettingHistoryModal: React.FC<BettingHistoryModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabType>('bet')
  
  // Bet History state
  const [bets, setBets] = useState<BetRecord[]>([])
  const [betLoading, setBetLoading] = useState<boolean>(false)
  const [betError, setBetError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    // Default to today in YYYY-MM-DD format (UTC+8)
    const now = new Date()
    const utc8Time = new Date(now.getTime() + (8 * 60 * 60 * 1000))
    return utc8Time.toISOString().split('T')[0]
  })

  // Game History state
  const [matches, setMatches] = useState<MatchRecord[]>([])
  const [gameLoading, setGameLoading] = useState<boolean>(false)
  const [gameError, setGameError] = useState<string | null>(null)
  const [selectedArena, setSelectedArena] = useState<string>('all')
  const [gameDate, setGameDate] = useState<string>(() => {
    // Default to today in YYYY-MM-DD format (UTC+8)
    const now = new Date()
    const utc8Time = new Date(now.getTime() + (8 * 60 * 60 * 1000))
    return utc8Time.toISOString().split('T')[0]
  })

  /**
   * Fetches betting history for the selected date
   */
  const fetchBetHistory = useCallback(async (date: string) => {
    setBetLoading(true)
    setBetError(null)
    
    try {
      const response = await apiService.getBetHistory(date)
      
      if (response.code === 'B100') {
        // Combine unsettle and settle arrays
        const allBets: BetRecord[] = [
          ...(response.unsettle || []),
          ...(response.settle || []),
          ...(response.data?.unsettle || []),
          ...(response.data?.settle || [])
        ]
        
        // Sort by bet date (newest first)
        allBets.sort((a, b) => {
          const dateA = new Date(a.w_betdate || 0).getTime()
          const dateB = new Date(b.w_betdate || 0).getTime()
          return dateB - dateA
        })
        
        setBets(allBets)
        
        if (import.meta.env.DEV) {
          console.log('📋 Betting history loaded:', {
            date,
            totalBets: allBets.length,
            unsettled: response.unsettle?.length || 0,
            settled: response.settle?.length || 0
          })
        }
      } else {
        setBetError(response.msg || 'Failed to load betting history')
        setBets([])
      }
    } catch (err: any) {
      if (import.meta.env.DEV) {
        console.error('❌ Failed to fetch betting history:', err)
      }
      setBetError(err.message || 'Failed to load betting history')
      setBets([])
    } finally {
      setBetLoading(false)
    }
  }, [])

  /**
   * Fetches match history for all tables
   */
  const fetchMatchHistory = useCallback(async (date: string, arena: string) => {
    setGameLoading(true)
    setGameError(null)
    
    try {
      const allMatches: MatchRecord[] = []
      const tablesToFetch = arena === 'all' ? TABLE_IDS : [arena]
      
      // Fetch history for each table
      for (const tableId of tablesToFetch) {
        try {
          let historyData: any
          
          // Try authenticated endpoint first, fallback to public
          if (sessionManager.getSessionId()) {
            historyData = await apiService.getHistory(tableId)
          } else {
            historyData = await apiService.getPublicHistory(tableId)
          }
          
          if (historyData && historyData.code === 'B100') {
            // Parse the response - data can be an array or object
            let matchData: any[] = []
            
            if (Array.isArray(historyData.data)) {
              matchData = historyData.data
            } else if (historyData.data && typeof historyData.data === 'object') {
              // Try to find array in data object
              const keys = Object.keys(historyData.data)
              for (const key of keys) {
                if (Array.isArray(historyData.data[key])) {
                  matchData = historyData.data[key]
                  break
                }
              }
            }
            
            // Filter by date and add to allMatches
            matchData.forEach((item: any) => {
              const matchDate = item.opendate || item.r_opendate || item.date
              if (matchDate) {
                const matchDateStr = new Date(matchDate).toISOString().split('T')[0]
                if (matchDateStr === date) {
                  allMatches.push({
                    ...item,
                    tableid: item.tableid || tableId
                  })
                }
              } else {
                // If no date, include it (might be recent matches)
                allMatches.push({
                  ...item,
                  tableid: item.tableid || tableId
                })
              }
            })
          }
        } catch (err) {
          if (import.meta.env.DEV) {
            console.warn(`Failed to fetch history for ${tableId}:`, err)
          }
        }
      }
      
      // Sort by round number (newest first)
      allMatches.sort((a, b) => {
        const roundA = typeof a.trid === 'number' ? a.trid : parseInt(String(a.trid || '0'))
        const roundB = typeof b.trid === 'number' ? b.trid : parseInt(String(b.trid || '0'))
        return roundB - roundA
      })
      
      setMatches(allMatches)
      
      if (import.meta.env.DEV) {
        console.log('🎮 Match history loaded:', {
          date,
          arena,
          totalMatches: allMatches.length
        })
      }
    } catch (err: any) {
      if (import.meta.env.DEV) {
        console.error('❌ Failed to fetch match history:', err)
      }
      setGameError(err.message || 'Failed to load match history')
      setMatches([])
    } finally {
      setGameLoading(false)
    }
  }, [])

  /**
   * Handles date change for bet history
   */
  const handleBetDateChange = (date: string) => {
    setSelectedDate(date)
    if (activeTab === 'bet') {
      fetchBetHistory(date)
    }
  }

  /**
   * Handles date change for game history
   */
  const handleGameDateChange = (date: string) => {
    setGameDate(date)
    if (activeTab === 'game') {
      fetchMatchHistory(date, selectedArena)
    }
  }

  /**
   * Handles arena change for game history
   */
  const handleArenaChange = (arena: string) => {
    setSelectedArena(arena)
    if (activeTab === 'game') {
      fetchMatchHistory(gameDate, arena)
    }
  }

  /**
   * Fetches history when modal opens or tab/date/arena changes
   */
  useEffect(() => {
    if (isOpen) {
      if (activeTab === 'bet' && selectedDate) {
        fetchBetHistory(selectedDate)
      } else if (activeTab === 'game' && gameDate) {
        fetchMatchHistory(gameDate, selectedArena)
      }
    }
  }, [isOpen, activeTab, selectedDate, gameDate, selectedArena, fetchBetHistory, fetchMatchHistory])

  /**
   * Formats bet option display name
   */
  const getBetOptionDisplay = (betType: string | number, betZone: string): string => {
    const mappedType = mapBackendToBetType(betType, betZone)
    if (mappedType) {
      return getBetTypeDisplayName(mappedType)
    }
    return betZone || String(betType)
  }

  /**
   * Formats win/lose display
   */
  const getWinLoseDisplay = (win: string | number | null, status: number): { text: string; isWin: boolean } => {
    if (status === 0) {
      return { text: 'Pending', isWin: false }
    }
    
    const winAmount = typeof win === 'string' ? parseFloat(win) : (typeof win === 'number' ? win : 0)
    
    if (winAmount > 0) {
      return { text: `Win ${winAmount.toFixed(2)}`, isWin: true }
    } else if (winAmount === 0) {
      return { text: 'Draw - Bet Returned', isWin: false }
    } else {
      return { text: 'Lose', isWin: false }
    }
  }

  /**
   * Formats bet time
   */
  const formatBetTime = (betDate: string): string => {
    if (!betDate) return '-'
    try {
      const date = new Date(betDate)
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      })
    } catch {
      return betDate
    }
  }

  /**
   * Formats open date for match history
   */
  const formatOpenDate = (opendate?: string): string => {
    if (!opendate) return '-'
    try {
      const date = new Date(opendate)
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).replace(',', '')
    } catch {
      return opendate
    }
  }

  /**
   * Gets winner from match record
   */
  const getWinner = (match: MatchRecord): string => {
    let result = match.result1 || match.drawresult || ''
    
    // If result is a JSON string like "\"M\"", parse it
    if (typeof result === 'string' && result.startsWith('"') && result.endsWith('"')) {
      try {
        result = JSON.parse(result)
      } catch {
        // If parsing fails, use as-is
      }
    }
    
    const resultUpper = String(result).toUpperCase().trim()
    if (resultUpper === 'M' || resultUpper === 'MERON') {
      return 'M'
    } else if (resultUpper === 'W' || resultUpper === 'WALA') {
      return 'W'
    } else if (resultUpper === 'D' || resultUpper === 'DRAW') {
      return 'D'
    }
    
    return resultUpper || '-'
  }

  /**
   * Gets replay URL for a match
   */
  const getReplayUrl = (roundId: string | number): string => {
    // Replay URL format: https://vfile.dk77.bet/<round>.mp4
    return `https://vfile.dk77.bet/${roundId}.mp4`
  }

  if (!isOpen) return null

  return (
    <div className="betting-history-modal-overlay" onClick={onClose}>
      <div className="betting-history-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="betting-history-modal-header">
          <h2 className="betting-history-modal-title">
            {activeTab === 'bet' ? 'Betting History' : 'Match History'}
          </h2>
          <button 
            className="betting-history-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="betting-history-tabs">
          <button
            className={`betting-history-tab ${activeTab === 'bet' ? 'active' : ''}`}
            onClick={() => setActiveTab('bet')}
          >
            Bet History
          </button>
          <button
            className={`betting-history-tab ${activeTab === 'game' ? 'active' : ''}`}
            onClick={() => setActiveTab('game')}
          >
            Game History
          </button>
        </div>

        {/* Bet History Tab */}
        {activeTab === 'bet' && (
          <>
            {/* Date Filter */}
            <div className="betting-history-filter">
              <label htmlFor="date-filter" className="filter-label">Date:</label>
              <input
                id="date-filter"
                type="date"
                value={selectedDate}
                onChange={(e) => handleBetDateChange(e.target.value)}
                className="date-filter-input"
                max={(() => {
                  const now = new Date()
                  const utc8Time = new Date(now.getTime() + (8 * 60 * 60 * 1000))
                  return utc8Time.toISOString().split('T')[0]
                })()}
              />
            </div>

            {/* Bet History Content */}
            <div className="betting-history-content">
              {betLoading && (
                <div className="betting-history-loading">
                  <div className="loading-spinner"></div>
                  <p>Loading betting history...</p>
                </div>
              )}

              {betError && (
                <div className="betting-history-error">
                  <p>{betError}</p>
                </div>
              )}

              {!betLoading && !betError && bets.length === 0 && (
                <div className="betting-history-empty">
                  <p>No betting records found for this date.</p>
                </div>
              )}

              {!betLoading && !betError && bets.length > 0 && (
                <div className="betting-history-table-container">
                  <table className="betting-history-table">
                    <thead>
                      <tr>
                        <th>BetID</th>
                        <th>Arena</th>
                        <th>Bet Option</th>
                        <th>Win/Lose</th>
                        <th>Valid Bet</th>
                        <th>Bet Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bets.map((bet) => {
                        const winLose = getWinLoseDisplay(bet.w_win, bet.w_status)
                        const validBet = typeof bet.w_bet === 'string' ? parseFloat(bet.w_bet) : (bet.w_bet || 0)
                        
                        return (
                          <tr key={bet.w_no}>
                            <td>{bet.w_no}</td>
                            <td>{bet.w_t_id || '-'}</td>
                            <td>{getBetOptionDisplay(bet.w_bettype, bet.w_betzone)}</td>
                            <td className={winLose.isWin ? 'win' : winLose.text === 'Lose' ? 'lose' : ''}>
                              {winLose.text}
                            </td>
                            <td>{validBet.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td>{formatBetTime(bet.w_betdate)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* Game History Tab */}
        {activeTab === 'game' && (
          <>
            {/* Filters */}
            <div className="betting-history-filter">
              <label htmlFor="game-date-filter" className="filter-label">Date:</label>
              <input
                id="game-date-filter"
                type="date"
                value={gameDate}
                onChange={(e) => handleGameDateChange(e.target.value)}
                className="date-filter-input"
                max={(() => {
                  const now = new Date()
                  const utc8Time = new Date(now.getTime() + (8 * 60 * 60 * 1000))
                  return utc8Time.toISOString().split('T')[0]
                })()}
              />
            </div>

            {/* Arena Filter */}
            <div className="betting-history-arena-filter">
              <button
                className={`arena-filter-button ${selectedArena === 'all' ? 'active' : ''}`}
                onClick={() => handleArenaChange('all')}
              >
                All Arenas
              </button>
              {TABLE_IDS.map((tableId) => (
                <button
                  key={tableId}
                  className={`arena-filter-button ${selectedArena === tableId ? 'active' : ''}`}
                  onClick={() => handleArenaChange(tableId)}
                >
                  {tableId}
                </button>
              ))}
            </div>

            {/* Game History Content */}
            <div className="betting-history-content">
              {gameLoading && (
                <div className="betting-history-loading">
                  <div className="loading-spinner"></div>
                  <p>Loading match history...</p>
                </div>
              )}

              {gameError && (
                <div className="betting-history-error">
                  <p>{gameError}</p>
                </div>
              )}

              {!gameLoading && !gameError && matches.length === 0 && (
                <div className="betting-history-empty">
                  <p>No match records found for this date and arena.</p>
                </div>
              )}

              {!gameLoading && !gameError && matches.length > 0 && (
                <div className="betting-history-table-container">
                  <table className="betting-history-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Match</th>
                        <th>Round No</th>
                        <th>Open Date</th>
                        <th>Winner</th>
                        <th>Replay</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matches.map((match, index) => {
                        const roundId = match.trid || match.r_id || match.round_no || '-'
                        const openDate = match.opendate || match.r_opendate || match.date
                        const winner = getWinner(match)
                        const replayUrl = getReplayUrl(String(roundId))
                        
                        return (
                          <tr key={`${match.tableid}-${roundId}-${index}`}>
                            <td>{index + 1}</td>
                            <td>{match.tableid || '-'}</td>
                            <td>{roundId}</td>
                            <td>{formatOpenDate(openDate)}</td>
                            <td>{winner}</td>
                            <td>
                              <a
                                href={replayUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="replay-link"
                              >
                                Replay
                              </a>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default BettingHistoryModal
