import { useEffect, useState } from 'react'
import { useGameStore } from './store/gameStore'
import LiveVideo from './components/LiveVideo/LiveVideo'
import BettingInterface from './components/BettingInterface/BettingInterface'
import GameHistory from './components/GameHistory/GameHistory'
import GameSummary from './components/GameHistory/GameSummary'
import { useWebSocket } from './hooks/useWebSocket'
import { apiService, sessionManager } from './services/apiService'
import { getInitParams } from './utils/urlParams'
import './App.css'

function App() {
  const { initializeGame, showGameSummary, setGameSummary, tableId } = useGameStore()
  const { connect, disconnect } = useWebSocket()
  const [scoreboardVisible, setScoreboardVisible] = useState(false)

  if(scoreboardVisible) {
    
  }

  useEffect(() => {
    // Get initialization parameters from URL
    const { sess_id, language, tableid } = getInitParams()
    
    // Store language preference if provided
    if (language) {
      localStorage.setItem('app_language', language)
    }

    // Initialize with URL parameters or defaults
    const init = async () => {
      try {
        let sessionId = sess_id
        
        // If sess_id is in URL, use it
        if (sessionId) {
          sessionManager.setSessionId(sessionId)
        } else {
          // If no sess_id in URL, use default test session
          // This is for development/testing purposes
          if (import.meta.env.DEV) {
            // Use provided test session credentials
            const defaultSessionId = '0f63728c-ef50-4425-b3bd-eb4ed9f9e8c7'
            sessionManager.setSessionId(defaultSessionId)
            sessionId = defaultSessionId
          }
        }

        // Use tableid from URL or default
        const tableId = tableid || 'CF02' // Default to CF02 (24HR)
        
        // Initialize game with tableId from URL
        initializeGame({
          tableId: tableId,
          isLive: true,
          accountBalance: 0, // Will be fetched from API
          currentRound: 40,
          countdown: 10
        })

        // Try to get player info and lobby info if session exists
        if (sessionId || sessionManager.getSessionId()) {
          try {
            // Get player info for balance
            const playerInfo = await apiService.getPlayerInfo()
            if (playerInfo && playerInfo.code === 'B100' && playerInfo.data) {
              initializeGame({
                accountBalance: playerInfo.data.balance || 0,
              })
            }

            // Get lobby info for round/table data
            const lobbyInfo = await apiService.getLobbyInfo()
            if (lobbyInfo && lobbyInfo.code === 'B100' && lobbyInfo.data) {
              const updateData: Partial<Parameters<typeof initializeGame>[0]> = {}
              
              if (typeof lobbyInfo.data === 'object') {
                const data = lobbyInfo.data as any
                if (data.tableId || data.t_id) {
                  updateData.tableId = data.tableId || data.t_id
                }
                if (data.roundId || data.r_id) {
                  updateData.roundId = data.roundId || data.r_id
                }
                if (data.currentRound || data.r_no) {
                  updateData.currentRound = data.currentRound || data.r_no
                }
                
                if (Object.keys(updateData).length > 0) {
                  initializeGame(updateData)
                }
              }
            }
          } catch {
            // API not available or session expired
          }
        }
      } catch {
        // Error initializing game - use defaults
        // Initialize with defaults even on error
        initializeGame({
          tableId: tableid || 'CF02',
          isLive: true,
          accountBalance: 0,
          currentRound: 40,
          countdown: 10
        })
      }
    }

    init().catch(() => {
      // Initialize with defaults on error
      initializeGame({
        tableId: tableid || 'CF02',
        isLive: true,
        accountBalance: 0,
        currentRound: 40,
        countdown: 10
      })
    })
    
    // Try to connect WebSocket
    try {
      connect()
    } catch (error) {
      // WebSocket not available
    }

    return () => {
      try {
        disconnect()
      } catch (error) {
        // Ignore disconnect errors
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Refresh data when table changes
  useEffect(() => {
    if (!tableId) return

    const refreshTableData = async () => {
      try {
        // Get lobby info for the new table
        if (sessionManager.getSessionId()) {
          const lobbyInfo = await apiService.getLobbyInfo()
          if (lobbyInfo && lobbyInfo.code === 'B100' && lobbyInfo.data) {
            const updateData: Partial<Parameters<typeof initializeGame>[0]> = {}
            
            if (typeof lobbyInfo.data === 'object') {
              const data = lobbyInfo.data as any
              
              // Check if there's table-specific data
              if (data[tableId]) {
                const tableData = data[tableId]
                if (tableData.r_id) updateData.roundId = tableData.r_id
                if (tableData.r_no) updateData.currentRound = tableData.r_no
                if (tableData.countdown !== undefined) updateData.countdown = tableData.countdown
              } else {
                // Fallback to general data
                if (data.roundId || data.r_id) {
                  updateData.roundId = data.roundId || data.r_id
                }
                if (data.currentRound || data.r_no) {
                  updateData.currentRound = data.currentRound || data.r_no
                }
                if (data.countdown !== undefined) {
                  updateData.countdown = data.countdown
                }
              }
              
              if (Object.keys(updateData).length > 0) {
                initializeGame(updateData)
              }
            }
          }
        }
      } catch {
        // Failed to refresh table data
      }
    }

    refreshTableData()
  }, [tableId, initializeGame])

    // In landscape: show scoreboard when user scrolls down, hide when scrolls up
    useEffect(() => {
      if (typeof window === 'undefined') return

      const mq = window.matchMedia('(orientation: landscape)')
      let container = document.querySelector('.app-container') as HTMLElement | null
      let prev = container ? container.scrollTop : 0
      const threshold = 8

      const onScroll = () => {
        if (!mq.matches) return
        if (!container) container = document.querySelector('.app-container') as HTMLElement | null
        const st = container ? container.scrollTop : 0
        if (st - prev > threshold) {
          // scrolling down -> show scoreboard
          setScoreboardVisible(true)
          prev = st
        } else if (prev - st > threshold) {
          // scrolling up -> hide scoreboard
          setScoreboardVisible(false)
          prev = st
        } else {
          prev = st
        }
      }

      container?.addEventListener('scroll', onScroll, { passive: true })

      const mqHandler = (e: MediaQueryListEvent) => {
        if (!e.matches) {
          setScoreboardVisible(false)
        } else {
          container = document.querySelector('.app-container') as HTMLElement | null
          prev = container ? container.scrollTop : 0
        }
      }

      if (mq.addEventListener) mq.addEventListener('change', mqHandler)
      else mq.addListener(mqHandler)

      return () => {
        container?.removeEventListener('scroll', onScroll)
        if (mq.removeEventListener) mq.removeEventListener('change', mqHandler)
        else mq.removeListener(mqHandler)
      }
    }, [])

  return (
    <div className="app-container bg-casino-dark flex flex-col">
      {/* Top Section: Live Video */}
      <div className="video-section relative bg-black overflow-hidden">
        <LiveVideo />
      </div>
      
      {/* Middle Section: Game Statistics/Roadmap (Mobile) */}
      <div className={`roadmap-section-mobile bg-gradient-to-br from-casino-dark to-casino-darker`}>
        {showGameSummary ? (
          <GameSummary onClose={() => setGameSummary(false)} />
        ) : (
          <GameHistory variant="detailed" />
        )}
        </div>
      
      {/* Bottom Section: Betting Interface */}
      <div className="betting-section-wrapper overflow-hidden bg-gradient-to-br from-casino-dark to-casino-darker border-t-2 border-casino-gold/30">
        {/* Mobile: Single column betting */}
        <div className="betting-section-mobile flex flex-col">
          <BettingInterface />
        </div>
      </div>
    </div>
  )
}

export default App
