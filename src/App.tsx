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
            const defaultSessionId = 'df17e312-1dca-40aa-8e42-27974b9d1ead'
            sessionManager.setSessionId(defaultSessionId)
            sessionId = defaultSessionId
          }
        }

        // Use tableid from URL or default
        const tableId = tableid || 'CF02' // Default to CF02 (24HR)
        
        if (import.meta.env.DEV) {
          console.log('🎮 Initializing game with tableId:', tableId, 'from URL tableid:', tableid)
        }
        
        // CRITICAL: Initialize game with tableId from URL FIRST (synchronously)
        // This must happen before any components try to read tableId from store
        initializeGame({
          tableId: tableId,
          isLive: true,
          accountBalance: 0, // Will be fetched from API
          currentRound: 40,
          countdown: undefined // Timer only shows after game result
        })
        
        // Verify the tableId was set correctly
        if (import.meta.env.DEV) {
          // Use a small timeout to check after state update
          setTimeout(() => {
            const currentTableId = useGameStore.getState().tableId
            if (currentTableId !== tableId) {
              console.warn('⚠️ TableId mismatch! Expected:', tableId, 'Got:', currentTableId)
              // Force update if mismatch
              initializeGame({ tableId: tableId })
            } else {
              console.log('✅ TableId correctly set to:', currentTableId)
            }
          }, 100)
        }

        // Try to get player info and lobby info if session exists
        if (sessionId || sessionManager.getSessionId()) {
          try {
            // Get player info for balance
            const playerInfo = await apiService.getPlayerInfo()
            if (playerInfo && playerInfo.code === 'B100') {
              // Original site structure: balance is at root level, not in data
              // Support both formats for backward compatibility
              const balance = typeof playerInfo.balance === 'string' 
                ? parseFloat(playerInfo.balance) 
                : playerInfo.balance || playerInfo.data?.balance || 0
              
              initializeGame({
                accountBalance: balance,
              })
              
              if (import.meta.env.DEV) {
                console.log('✅ PlayerInfo loaded:', {
                  username: playerInfo.username,
                  balance: balance,
                  currency: playerInfo.currency,
                  betlimit: playerInfo.betlimit
                })
              }
            }

            // Get lobby info for round/table data
            const lobbyInfo = await apiService.getLobbyInfo()
            if (import.meta.env.DEV) {
              console.log('📋 LobbyInfo response:', lobbyInfo)
            }
            
            if (lobbyInfo && lobbyInfo.code === 'B100' && lobbyInfo.data) {
              const updateData: Partial<Parameters<typeof initializeGame>[0]> = {}
              
              if (typeof lobbyInfo.data === 'object') {
                const data = lobbyInfo.data as any
                
                if (import.meta.env.DEV) {
                  console.log('📋 LobbyInfo data structure:', data)
                  console.log('📋 Looking for roundId in data for table:', tableId)
                }
                
                // Only update tableId from API if it's not already set from URL
                // This ensures URL parameter takes precedence
                if (!tableid && (data.tableId || data.t_id)) {
                  updateData.tableId = data.tableId || data.t_id
                }
                
                // Try to get roundId from various sources
                // Based on original site structure: data is an array, each item has tableid and trid
                let foundRoundId: string | number | null = null
                let foundCurrentRound: string | number | null = null
                
                // Check if data is an array (original site format)
                if (Array.isArray(data)) {
                  if (import.meta.env.DEV) {
                    console.log('📋 LobbyInfo data is an array, searching for table:', tableId)
                  }
                  // Search for matching table in array
                  for (const item of data) {
                    const itemTableId = item.tableid || item.tableId || item.t_id
                    if (itemTableId === tableId || itemTableId === tableId.toUpperCase() || itemTableId === tableId.toLowerCase()) {
                      // Found matching table - extract roundId (trid) and currentRound (r_info.cf_roundno)
                      if (item.trid) {
                        foundRoundId = item.trid
                        if (import.meta.env.DEV) {
                          console.log('✅ Found roundId (trid) in array item:', foundRoundId)
                        }
                      }
                      // Extract currentRound from r_info.cf_roundno
                      if (item.r_info && item.r_info.cf_roundno) {
                        foundCurrentRound = item.r_info.cf_roundno
                        if (import.meta.env.DEV) {
                          console.log('✅ Found currentRound (cf_roundno) in array item:', foundCurrentRound)
                        }
                      }
                      // Don't update countdown from API - it's managed by game result logic
                      // The API countdown (600) is for the full round, not the betting period
                      // Betting countdown (20) is set when game result is received
                      // Check roundstatus to determine if betting is allowed
                      // roundstatus: 1 = betting open, 2 = betting closed/fighting, 4 = settled
                      // NOTE: WebSocket is the source of truth for roundStatus - only set from API if not already set by WebSocket
                      const currentRoundStatus = useGameStore.getState().roundStatus
                      if (item.roundstatus !== undefined && currentRoundStatus === undefined) {
                        // Only set from API if WebSocket hasn't set it yet
                        updateData.roundStatus = item.roundstatus
                        if (import.meta.env.DEV) {
                          console.log('📋 Round status from API (WebSocket not set yet):', item.roundstatus, item.roundstatus === 1 ? '(Betting Open)' : item.roundstatus === 2 ? '(Betting Closed/Fighting)' : '(Settled)')
                        }
                      } else if (import.meta.env.DEV && item.roundstatus !== undefined) {
                        console.log('📋 Round status from API ignored (WebSocket is source of truth):', item.roundstatus, 'Current WebSocket status:', currentRoundStatus)
                      }
                      break
                    }
                  }
                } else {
                  // Fallback: Check if data is an object with table-specific keys
                  if (tableId && data[tableId]) {
                    const tableData = data[tableId]
                    foundRoundId = tableData.trid || tableData.r_id || tableData.roundId
                    if (tableData.r_info && tableData.r_info.cf_roundno) {
                      foundCurrentRound = tableData.r_info.cf_roundno
                    }
                  }
                  
                  // Fallback: Check root level
                  if (!foundRoundId) {
                    foundRoundId = data.trid || data.roundId || data.r_id
                  }
                  if (!foundCurrentRound) {
                    foundCurrentRound = data.currentRound || data.r_no
                  }
                }
                
                if (foundRoundId) {
                  updateData.roundId = foundRoundId.toString()
                  if (import.meta.env.DEV) {
                    console.log('✅ Setting roundId:', updateData.roundId)
                  }
                  // Set roundId immediately (don't wait for other data)
                  initializeGame({ roundId: foundRoundId.toString() })
                } else {
                  if (import.meta.env.DEV) {
                    console.warn('⚠️ No roundId (trid) found in lobbyinfo response for table:', tableId)
                    console.log('📋 Available data keys:', Object.keys(data))
                    if (Array.isArray(data)) {
                      console.log('📋 Array items:', data.map((item: any) => ({ 
                        tableid: item.tableid, 
                        trid: item.trid,
                        has_r_info: !!item.r_info 
                      })))
                    }
                  }
                }
                
                if (foundCurrentRound) {
                  updateData.currentRound = typeof foundCurrentRound === 'number' ? foundCurrentRound : parseInt(foundCurrentRound.toString(), 10)
                  if (import.meta.env.DEV) {
                    console.log('✅ Setting currentRound:', updateData.currentRound)
                  }
                }
                
                if (Object.keys(updateData).length > 0) {
                  initializeGame(updateData)
                  if (import.meta.env.DEV) {
                    console.log('✅ Updated game state with:', updateData)
                  }
                }
                
                // If we have currentRound but no roundId, try to fetch roundId from odds API
                if (updateData.currentRound && !updateData.roundId) {
                  if (import.meta.env.DEV) {
                    console.log('📊 Attempting to fetch roundId from odds API using r_no:', updateData.currentRound)
                  }
                  try {
                    const oddsResponse = await apiService.getOdds(updateData.currentRound.toString())
                    if (import.meta.env.DEV) {
                      console.log('📊 Odds API response:', oddsResponse)
                    }
                    if (oddsResponse && oddsResponse.code === 'B100' && oddsResponse.data) {
                      // Odds API might return r_id in the response
                      const oddsData = oddsResponse.data
                      if (Array.isArray(oddsData) && oddsData.length > 0) {
                        const firstOdd = oddsData[0] as any
                        if (firstOdd.r_id) {
                          initializeGame({ roundId: firstOdd.r_id.toString() })
                          if (import.meta.env.DEV) {
                            console.log('✅ Fetched roundId from odds API:', firstOdd.r_id)
                          }
                        } else {
                          if (import.meta.env.DEV) {
                            console.warn('⚠️ Odds API response does not contain r_id:', firstOdd)
                          }
                        }
                      }
                    }
                  } catch (error) {
                    if (import.meta.env.DEV) {
                      console.warn('⚠️ Could not fetch roundId from odds API:', error)
                    }
                  }
                }
              }
            } else if (lobbyInfo && (lobbyInfo.code === 'B232' || lobbyInfo.code === 'B230')) {
              // Session expired or invalid - show error but don't block the app
              if (import.meta.env.DEV) {
                console.error('❌ Invalid lobbyinfo response:', lobbyInfo)
                console.error('⚠️ Session ID is invalid or expired. Please provide a valid session ID in the URL parameter: ?sess_id=YOUR_VALID_SESSION_ID')
              }
              // Don't throw error - allow app to continue, but betting will fail with proper error message
              // Session ID doesn't exist - try to get roundId from public history
              if (import.meta.env.DEV) {
                console.warn('⚠️ Session ID invalid, trying to fetch roundId from public history')
              }
              
              try {
                // Try to get roundId from public history (latest round)
                const publicHistory = await apiService.getPublicHistory(tableId)
                if (publicHistory && publicHistory.data) {
                  const historyData = publicHistory.data
                  // Try to extract latest round info
                  if (historyData.drawresult && historyData.drawresult[tableId]) {
                    const drawResults = historyData.drawresult[tableId]
                    if (Array.isArray(drawResults) && drawResults.length > 0) {
                      // Get the latest round
                      const latestRound = drawResults[0]
                      if (latestRound.r_id) {
                        initializeGame({ roundId: latestRound.r_id.toString() })
                        if (import.meta.env.DEV) {
                          console.log('✅ Fetched roundId from public history:', latestRound.r_id)
                        }
                      } else if (latestRound.r_no) {
                        // We have round number, try to use it as roundId (some APIs accept r_no)
                        initializeGame({ 
                          roundId: latestRound.r_no.toString(),
                          currentRound: typeof latestRound.r_no === 'number' ? latestRound.r_no : parseInt(latestRound.r_no, 10)
                        })
                        if (import.meta.env.DEV) {
                          console.log('✅ Using round number as roundId from public history:', latestRound.r_no)
                        }
                      }
                    }
                  }
                }
              } catch (error) {
                if (import.meta.env.DEV) {
                  console.warn('⚠️ Could not fetch roundId from public history:', error)
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
          countdown: undefined // Timer only shows after game result
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
        countdown: undefined // Timer only shows after game result
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
          if (import.meta.env.DEV) {
            console.log('📋 Refresh: LobbyInfo response:', lobbyInfo)
          }
          if (lobbyInfo && lobbyInfo.code === 'B100' && lobbyInfo.data) {
            const updateData: Partial<Parameters<typeof initializeGame>[0]> = {}
            
            if (typeof lobbyInfo.data === 'object') {
              const data = lobbyInfo.data as any
              
              // Check if data is an array (original site format: array of table objects)
              if (Array.isArray(data)) {
                if (import.meta.env.DEV) {
                  console.log('📋 Refresh: LobbyInfo data is an array, searching for table:', tableId)
                }
                // Search for matching table in array
                for (const item of data) {
                  const itemTableId = item.tableid || item.tableId || item.t_id
                  if (itemTableId === tableId || itemTableId === tableId.toUpperCase() || itemTableId === tableId.toLowerCase()) {
                    // Found matching table - extract trid as roundId
                    if (item.trid) {
                      updateData.roundId = item.trid.toString()
                      if (import.meta.env.DEV) {
                        console.log('✅ Refresh: Found roundId (trid) in array item:', updateData.roundId)
                      }
                    }
                    // Extract currentRound from r_info.cf_roundno
                    if (item.r_info && item.r_info.cf_roundno) {
                      updateData.currentRound = parseInt(item.r_info.cf_roundno, 10)
                      if (import.meta.env.DEV) {
                        console.log('✅ Refresh: Found currentRound (cf_roundno) in array item:', updateData.currentRound)
                      }
                    }
                    // Don't update countdown from API - it's managed by game result logic
                    // The API countdown (600) is for the full round, not the betting period
                    // Betting countdown (20) is set when game result is received
                    // Check roundstatus to determine if betting is allowed
                    // NOTE: WebSocket is the source of truth for roundStatus - only set from API if not already set by WebSocket
                    const currentRoundStatus = useGameStore.getState().roundStatus
                    if (item.roundstatus !== undefined && currentRoundStatus === undefined) {
                      // Only set from API if WebSocket hasn't set it yet
                      updateData.roundStatus = item.roundstatus
                      if (import.meta.env.DEV) {
                        console.log('📋 Refresh: Round status from API (WebSocket not set yet):', item.roundstatus, item.roundstatus === 1 ? '(Betting Open)' : item.roundstatus === 2 ? '(Betting Closed/Fighting)' : '(Settled)')
                      }
                    } else if (import.meta.env.DEV && item.roundstatus !== undefined) {
                      console.log('📋 Refresh: Round status from API ignored (WebSocket is source of truth):', item.roundstatus, 'Current WebSocket status:', currentRoundStatus)
                    }
                    break
                  }
                }
              } else {
                // Check if there's table-specific data
                if (data[tableId]) {
                  const tableData = data[tableId]
                  if (tableData.trid || tableData.r_id || tableData.roundId) {
                    updateData.roundId = (tableData.trid || tableData.r_id || tableData.roundId).toString()
                    if (import.meta.env.DEV) {
                      console.log('✅ Refresh: Found roundId in table-specific data:', updateData.roundId)
                    }
                  }
                  if (tableData.r_no || tableData.rno) {
                    const r_no = tableData.r_no || tableData.rno
                    updateData.currentRound = typeof r_no === 'number' ? r_no : parseInt(r_no, 10)
                  }
                  // Don't update countdown from API - it's managed by game result logic
                  // The API countdown (600) is for the full round, not the betting period
                  // Betting countdown (20) is set when game result is received
                } else {
                  // Fallback to general data
                  if (data.trid || data.roundId || data.r_id) {
                    updateData.roundId = (data.trid || data.roundId || data.r_id).toString()
                    if (import.meta.env.DEV) {
                      console.log('✅ Refresh: Found roundId in root data:', updateData.roundId)
                    }
                  }
                  if (data.currentRound || data.r_no || data.rno) {
                    const r_no = data.currentRound || data.r_no || data.rno
                    updateData.currentRound = typeof r_no === 'number' ? r_no : parseInt(r_no, 10)
                  }
                  // Don't update countdown from API - it's managed by game result logic
                  // The API countdown (600) is for the full round, not the betting period
                  // Betting countdown (20) is set when game result is received
                }
              }
              
              // If we have currentRound but no roundId, try to fetch roundId from odds API
              if (updateData.currentRound && !updateData.roundId) {
                if (import.meta.env.DEV) {
                  console.log('📊 Refresh: Attempting to fetch roundId from odds API using r_no:', updateData.currentRound)
                }
                try {
                  const oddsResponse = await apiService.getOdds(updateData.currentRound.toString())
                  if (oddsResponse && oddsResponse.code === 'B100' && oddsResponse.data) {
                    const oddsData = oddsResponse.data
                    if (Array.isArray(oddsData) && oddsData.length > 0) {
                      const firstOdd = oddsData[0] as any
                      if (firstOdd.r_id) {
                        updateData.roundId = firstOdd.r_id.toString()
                        if (import.meta.env.DEV) {
                          console.log('✅ Refresh: Fetched roundId from odds API:', firstOdd.r_id)
                        }
                      }
                    }
                  }
                } catch (error) {
                  if (import.meta.env.DEV) {
                    console.warn('⚠️ Refresh: Could not fetch roundId from odds API:', error)
                  }
                }
              }
              
              // If still no roundId, try public history as last resort
              if (!updateData.roundId && tableId) {
                if (import.meta.env.DEV) {
                  console.log('📊 Refresh: Attempting to fetch roundId from public history as last resort')
                }
                try {
                  const publicHistory = await apiService.getPublicHistory(tableId)
                  if (publicHistory && publicHistory.data) {
                    const historyData = publicHistory.data
                    if (historyData.drawresult && historyData.drawresult[tableId]) {
                      const drawResults = historyData.drawresult[tableId]
                      if (Array.isArray(drawResults) && drawResults.length > 0) {
                        const latestRound = drawResults[0]
                        if (latestRound.r_id) {
                          updateData.roundId = latestRound.r_id.toString()
                          if (import.meta.env.DEV) {
                            console.log('✅ Refresh: Fetched roundId from public history:', latestRound.r_id)
                          }
                        }
                      }
                    }
                  }
                } catch (error) {
                  if (import.meta.env.DEV) {
                    console.warn('⚠️ Refresh: Could not fetch roundId from public history:', error)
                  }
                }
              }
              
              // If we have currentRound but no roundId, try to fetch roundId from odds API
              if (updateData.currentRound && !updateData.roundId) {
                try {
                  const oddsResponse = await apiService.getOdds(updateData.currentRound.toString())
                  if (oddsResponse && oddsResponse.code === 'B100' && oddsResponse.data) {
                    const oddsData = oddsResponse.data
                    if (Array.isArray(oddsData) && oddsData.length > 0) {
                      const firstOdd = oddsData[0] as any
                      if (firstOdd.r_id) {
                        updateData.roundId = firstOdd.r_id.toString()
                        if (import.meta.env.DEV) {
                          console.log('✅ Fetched roundId from odds API (refresh):', firstOdd.r_id)
                        }
                      }
                    }
                  }
                } catch (error) {
                  if (import.meta.env.DEV) {
                    console.warn('⚠️ Could not fetch roundId from odds API (refresh):', error)
                  }
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
    
    // Set up periodic polling to fetch roundId if missing
    const { roundId: currentRoundId } = useGameStore.getState()
    if (!currentRoundId) {
      if (import.meta.env.DEV) {
        console.log('🔄 Setting up polling to fetch roundId')
      }
      // Poll every 5 seconds until roundId is found
      const pollInterval = setInterval(() => {
        const { roundId } = useGameStore.getState()
        if (!roundId) {
          if (import.meta.env.DEV) {
            console.log('🔄 Polling: roundId still missing, retrying...')
          }
          refreshTableData()
        } else {
          clearInterval(pollInterval)
          if (import.meta.env.DEV) {
            console.log('✅ RoundId found, stopping polling')
          }
        }
      }, 5000)
      
      return () => clearInterval(pollInterval)
    }
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
