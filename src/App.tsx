import { useEffect, useState, useRef } from 'react'
import { useGameStore } from './store/gameStore'
import LiveVideo from './components/LiveVideo/LiveVideo'
import BettingInterface from './components/BettingInterface/BettingInterface'
import GameHistory from './components/GameHistory/GameHistory'
import GameSummary from './components/GameHistory/GameSummary'
import SessionExpiredModal from './components/SessionExpired/SessionExpiredModal'
import { useWebSocket } from './hooks/useWebSocket'
import { apiService, sessionManager } from './services/apiService'
import { getInitParams, setUrlParam } from './utils/urlParams'
import { shouldThrottle, completeThrottle } from './utils/apiThrottle'
import './App.css'

function App() {
  const { initializeGame, showGameSummary, setGameSummary, tableId, connectionStatus, sessionExpired, setSessionExpired } = useGameStore()
  const { connect, disconnect } = useWebSocket()
  const [scoreboardVisible, setScoreboardVisible] = useState(false)
  
  // Refs to track initialization state
  const isInitializingRef = useRef<boolean>(true)
  const initializationCompleteRef = useRef<boolean>(false)

  // Listen for session expired events (B232 error)
  useEffect(() => {
    const handleSessionExpired = () => {
      if (import.meta.env.DEV) {
        console.error('❌ Session expired event received')
      }
      setSessionExpired(true)
    }

    window.addEventListener('session_expired', handleSessionExpired as EventListener)
    
    return () => {
      window.removeEventListener('session_expired', handleSessionExpired as EventListener)
    }
  }, [setSessionExpired])

  // Handle redirect to home
  const handleGoToHome = () => {
    window.location.href = '/'
  }

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

        // Use tableid from URL, localStorage, or default
        // Priority: URL > localStorage > default
        let tableId = tableid
        if (!tableId && typeof window !== 'undefined') {
          const storedTableId = localStorage.getItem('game_table_id')
          if (storedTableId) {
            tableId = storedTableId
            if (import.meta.env.DEV) {
              console.log('📦 Using tableId from localStorage:', tableId)
            }
          }
        }
        tableId = tableId || 'CF02' // Default to CF02 (24HR)
        tableId = tableId.toUpperCase() // Normalize to uppercase
        
        // Ensure URL has tableid parameter for persistence
        if (typeof window !== 'undefined' && !tableid) {
          setUrlParam('tableid', tableId)
        }
        
        if (import.meta.env.DEV) {
          console.log('🎮 Initializing game with tableId:', tableId, 'from URL tableid:', tableid)
        }
        
        // CRITICAL: Initialize game with tableId from URL FIRST (synchronously)
        // This must happen before any components try to read tableId from store
        // All other data (balance, currentRound, gameId, etc.) will come from API
        initializeGame({
          tableId: tableId,
          isLive: true,
          accountBalance: 0, // Will be fetched from API (playerinfo.php)
          currentRound: undefined, // Will be fetched from API/WebSocket (lobbyinfo.php or WebSocket)
          countdown: undefined, // Timer only shows after game result, set by WebSocket
          gameId: '' // Will be fetched from API (playerinfo.php gidlist)
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
            // Throttle initial API calls to prevent duplicate requests
            const playerInfoKey = 'playerinfo_init'
            if (shouldThrottle(playerInfoKey, 2000)) {
              // Get player info for balance, bet limits, and game ID
              const playerInfo = await apiService.getPlayerInfo()
              completeThrottle(playerInfoKey)
              
              if (playerInfo && playerInfo.code === 'B100') {
                // Original site structure: balance is at root level, not in data
                // Support both formats for backward compatibility
                const balance = typeof playerInfo.balance === 'string' 
                  ? parseFloat(playerInfo.balance) 
                  : playerInfo.balance || playerInfo.data?.balance || 0
                
                // Extract bet limits from API
                let betLimitMin: number | undefined
                let betLimitMax: number | undefined
                
                if (playerInfo.betlimit) {
                  // Bet limits are at root level
                  betLimitMin = playerInfo.betlimit.min ? parseFloat(playerInfo.betlimit.min) : undefined
                  betLimitMax = playerInfo.betlimit.max ? parseFloat(playerInfo.betlimit.max) : undefined
                } else if (playerInfo.data?.min !== undefined || playerInfo.data?.max !== undefined) {
                  // Fallback to data structure
                  betLimitMin = playerInfo.data.min
                  betLimitMax = playerInfo.data.max
                }
                
                // Extract gameId from gidlist (table → product mapping)
                // gidlist format: { "CF01": "CBXE08251119097", "CF02": "CBXE08251119098", ... }
                let gameIdFromApi: string | undefined
                if (playerInfo.gidlist && typeof playerInfo.gidlist === 'object') {
                  // Try to get gameId for current table
                  gameIdFromApi = playerInfo.gidlist[tableId] || playerInfo.gidlist[tableId.toUpperCase()] || playerInfo.gidlist[tableId.toLowerCase()]
                  // If not found, get first available gameId
                  if (!gameIdFromApi && Object.keys(playerInfo.gidlist).length > 0) {
                    gameIdFromApi = Object.values(playerInfo.gidlist)[0] as string
                  }
                } else if (playerInfo.data?.gidlist && typeof playerInfo.data.gidlist === 'object') {
                  // Fallback to data structure
                  gameIdFromApi = playerInfo.data.gidlist[tableId] || playerInfo.data.gidlist[tableId.toUpperCase()] || playerInfo.data.gidlist[tableId.toLowerCase()]
                  if (!gameIdFromApi && Object.keys(playerInfo.data.gidlist).length > 0) {
                    gameIdFromApi = Object.values(playerInfo.data.gidlist)[0] as string
                  }
                }
                
                const updateData: Partial<Parameters<typeof initializeGame>[0]> = {
                  accountBalance: balance,
                }
                
                if (betLimitMin !== undefined) {
                  updateData.betLimitMin = betLimitMin
                }
                if (betLimitMax !== undefined) {
                  updateData.betLimitMax = betLimitMax
                }
                if (gameIdFromApi) {
                  updateData.gameId = gameIdFromApi
                }
                
                initializeGame(updateData)
                
                if (import.meta.env.DEV) {
                  console.log('✅ PlayerInfo loaded:', {
                    username: playerInfo.username,
                    balance: balance,
                    currency: playerInfo.currency,
                    betlimit: playerInfo.betlimit,
                    betLimitMin,
                    betLimitMax,
                    gameId: gameIdFromApi,
                    gidlist: playerInfo.gidlist
                  })
                }
              }
            } else {
              if (import.meta.env.DEV) {
                console.log('⏸️ Skipping duplicate playerinfo call during initialization')
              }
            }

            // Throttle lobbyinfo call during initialization
            const lobbyInfoKey = 'lobbyinfo_init'
            if (shouldThrottle(lobbyInfoKey, 2000)) {
              // Get lobby info for round/table data
              const lobbyInfo = await apiService.getLobbyInfo()
              completeThrottle(lobbyInfoKey)
              
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
                      // Use server's tableId (CF01, CF02, etc.) - normalize to uppercase for comparison
                      const serverTableId = itemTableId ? itemTableId.toUpperCase() : null
                      const currentTableIdUpper = tableId ? tableId.toUpperCase() : null
                      
                      if (serverTableId && (serverTableId === currentTableIdUpper || itemTableId === tableId || itemTableId === tableId.toUpperCase() || itemTableId === tableId.toLowerCase())) {
                        // Found matching table - update tableId from server to ensure it matches server format
                        if (serverTableId && serverTableId !== tableId) {
                          updateData.tableId = serverTableId
                          if (import.meta.env.DEV) {
                            console.log('🔄 LobbyInfo: Updating tableId from server:', {
                              old: tableId,
                              new: serverTableId,
                              source: 'lobbyinfo API'
                            })
                          }
                        }
                        
                        // Extract roundId (trid) and currentRound (r_info.cf_roundno)
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
                          
                          // If betting is open (roundStatus === 1), extract countdown from API
                          // This ensures timer appears on initial load if betting is already open
                          if (item.roundstatus === 1) {
                            if (item.countdown !== undefined && item.countdown > 0) {
                              updateData.countdown = item.countdown
                              if (import.meta.env.DEV) {
                                console.log('✅ Initialization: Found countdown from API (betting open):', item.countdown)
                              }
                            } else if (item.bettime !== undefined && item.bettime > 0) {
                              updateData.countdown = item.bettime
                              if (import.meta.env.DEV) {
                                console.log('✅ Initialization: Found bettime from API (betting open):', item.bettime)
                              }
                            }
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
            } else {
              if (import.meta.env.DEV) {
                console.log('⏸️ Skipping duplicate lobbyinfo call during initialization')
              }
            }
          } catch (error) {
            if (import.meta.env.DEV) {
              console.error('❌ Initialization error:', error)
            }
          }
        }
        
        // Mark initialization as complete
        isInitializingRef.current = false
        initializationCompleteRef.current = true
      } catch (error) {
        // Error initializing game - initialize with minimal defaults
        // API data will be fetched when available (WebSocket, retry, etc.)
        if (import.meta.env.DEV) {
          console.error('❌ Error during initialization:', error)
        }
        initializeGame({
          tableId: tableid || 'CF02',
          isLive: true,
          accountBalance: 0, // Will be fetched from API when available
          currentRound: undefined, // Will be fetched from API/WebSocket when available
          countdown: undefined, // Will be set by WebSocket when available
          gameId: '' // Will be fetched from API when available
        })
        
        // Mark initialization as complete even on error
        isInitializingRef.current = false
        initializationCompleteRef.current = true
      }
    }

    init().catch((error) => {
      // Initialize with minimal defaults on error
      // API data will be fetched when available (WebSocket, retry, etc.)
      if (import.meta.env.DEV) {
        console.error('❌ Initialization failed:', error)
      }
      initializeGame({
        tableId: tableid || 'CF02',
        isLive: true,
        accountBalance: 0, // Will be fetched from API when available
        currentRound: undefined, // Will be fetched from API/WebSocket when available
        countdown: undefined, // Will be set by WebSocket when available
        gameId: '' // Will be fetched from API when available
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

  // Refresh data when table changes - CRITICAL: This must run immediately when tableId changes
  const prevTableIdRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!tableId) return
    
    // Only refresh if tableId actually changed
    if (prevTableIdRef.current === tableId) return
    
    if (import.meta.env.DEV) {
      console.log('🔄 Table changed, immediately refreshing data:', {
        previous: prevTableIdRef.current,
        new: tableId
      })
    }
    
    prevTableIdRef.current = tableId

    const refreshTableData = async () => {
      if (import.meta.env.DEV) {
        console.log('🔄 Refreshing data for table:', tableId)
      }
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
                  const normalizedItemTableId = itemTableId ? itemTableId.toUpperCase() : null
                  const normalizedTableId = tableId ? tableId.toUpperCase() : null
                  if (normalizedItemTableId && (normalizedItemTableId === normalizedTableId || 
                      itemTableId === tableId || 
                      itemTableId === tableId.toUpperCase() || 
                      itemTableId === tableId.toLowerCase())) {
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
                    // Check roundstatus to determine if betting is allowed
                    // CRITICAL: When table changes, we MUST update roundStatus from API immediately
                    // WebSocket might still be sending data for the old table, so we override it
                    if (item.roundstatus !== undefined) {
                      // Always update roundStatus when table changes (tableId changed)
                      // This ensures betting area reflects the new table's status immediately
                      updateData.roundStatus = item.roundstatus
                      if (import.meta.env.DEV) {
                        console.log('📋 Refresh: Round status from API for new table:', item.roundstatus, item.roundstatus === 1 ? '(Betting Open)' : item.roundstatus === 2 ? '(Betting Closed/Fighting)' : '(Settled)')
                      }
                      
                      // If betting is open (roundStatus === 1), extract countdown from API
                      // This ensures timer appears immediately when switching tables
                      if (item.roundstatus === 1) {
                        // Check for countdown in various possible field names
                        if (item.countdown !== undefined && item.countdown > 0) {
                          updateData.countdown = item.countdown
                          if (import.meta.env.DEV) {
                            console.log('✅ Refresh: Found countdown from API (betting open):', item.countdown)
                          }
                        } else if (item.bettime !== undefined && item.bettime > 0) {
                          updateData.countdown = item.bettime
                          if (import.meta.env.DEV) {
                            console.log('✅ Refresh: Found bettime from API (betting open):', item.bettime)
                          }
                        }
                      }
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
                  // Extract countdown if betting is open
                  if (tableData.roundstatus === 1) {
                    if (tableData.countdown !== undefined && tableData.countdown > 0) {
                      updateData.countdown = tableData.countdown
                    } else if (tableData.bettime !== undefined && tableData.bettime > 0) {
                      updateData.countdown = tableData.bettime
                    }
                  }
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
                  // Extract countdown if betting is open
                  if (data.roundstatus === 1) {
                    if (data.countdown !== undefined && data.countdown > 0) {
                      updateData.countdown = data.countdown
                    } else if (data.bettime !== undefined && data.bettime > 0) {
                      updateData.countdown = data.bettime
                    }
                  }
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
              
              // Also fetch balance for the new table
              try {
                const balance = await apiService.getBalance()
                updateData.accountBalance = balance
                if (import.meta.env.DEV) {
                  console.log('✅ Refresh: Fetched balance for new table:', balance)
                }
              } catch (error) {
                if (import.meta.env.DEV) {
                  console.warn('⚠️ Refresh: Could not fetch balance:', error)
                }
              }
              
              if (Object.keys(updateData).length > 0) {
                initializeGame(updateData)
                
                // Trigger video URL refresh
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('video_url_refresh', {
                    detail: { tableId }
                  }))
                }
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

  // Set up periodic polling for game state updates (fallback when WebSocket disconnected or as backup)
  useEffect(() => {
    if (!tableId) return
    if (!sessionManager.getSessionId()) return // Don't poll without session
    
    // Poll less frequently to reduce server load
    // Increased intervals to prevent firewall blocking
    // WebSocket is primary source, polling is backup
    const pollInterval = connectionStatus === 'connected' ? 30000 : 20000 // 30s if WS connected, 20s if disconnected
    
    const pollGameState = async () => {
      // Don't poll during initial loading to prevent duplicate calls
      if (isInitializingRef.current || !initializationCompleteRef.current) {
        if (import.meta.env.DEV) {
          console.log('⏸️ Skipping poll during initialization')
        }
        return
      }
      
      try {
        // Throttle lobbyinfo calls - minimum 5 seconds between calls
        const lobbyInfoKey = `lobbyinfo_${tableId}`
        if (!shouldThrottle(lobbyInfoKey, 5000)) {
          if (import.meta.env.DEV) {
            console.debug('⏸️ Throttled lobbyinfo poll')
          }
        } else {
          if (import.meta.env.DEV) {
            console.log('🔄 Polling game state:', {
              connectionStatus,
              tableId,
              interval: pollInterval / 1000 + 's'
            })
          }
          
          // Fetch lobby info for round status, roundId, currentRound
          const lobbyInfo = await apiService.getLobbyInfo()
          completeThrottle(lobbyInfoKey)
        if (lobbyInfo && lobbyInfo.code === 'B100' && lobbyInfo.data) {
          const data = lobbyInfo.data as any
          const updateData: any = {}
          
          // Extract data from array format
          if (Array.isArray(data)) {
            for (const item of data) {
              const itemTableId = item.tableid || item.tableId || item.t_id
              if (itemTableId && (itemTableId.toUpperCase() === tableId.toUpperCase() || 
                  itemTableId === tableId || 
                  itemTableId === tableId.toUpperCase() || 
                  itemTableId === tableId.toLowerCase())) {
                if (item.trid) updateData.roundId = item.trid.toString()
                if (item.r_info?.cf_roundno) {
                  updateData.currentRound = parseInt(item.r_info.cf_roundno, 10)
                }
                // Only update roundStatus if WebSocket hasn't set it (WebSocket is source of truth)
                const currentRoundStatus = useGameStore.getState().roundStatus
                if (item.roundstatus !== undefined && (connectionStatus !== 'connected' || currentRoundStatus === undefined)) {
                  updateData.roundStatus = item.roundstatus
                }
                break
              }
            }
          }
          
          if (Object.keys(updateData).length > 0) {
            initializeGame(updateData)
          }
        }
        }
        
        // Throttle balance calls - minimum 5 seconds between calls
        const balanceKey = 'balance_poll'
        if (!shouldThrottle(balanceKey, 5000)) {
          if (import.meta.env.DEV) {
            console.debug('⏸️ Throttled balance poll')
          }
        } else {
          // Always fetch balance (even if WebSocket connected, as backup)
          try {
            const balance = await apiService.getBalance()
            completeThrottle(balanceKey)
            const { accountBalance: currentBalance } = useGameStore.getState()
            // Only update if balance changed to avoid unnecessary re-renders
            if (balance !== currentBalance) {
              initializeGame({ accountBalance: balance })
            }
          } catch (error) {
            completeThrottle(balanceKey)
            // Silently fail
          }
        }
      } catch (error) {
        // Silently fail - will retry on next interval
        if (import.meta.env.DEV) {
          console.debug('Polling error:', error)
        }
      }
    }
    
    // Start polling after a delay to avoid duplicate calls during initialization
    // Wait for initialization to complete before starting polling
    const startPolling = () => {
      if (initializationCompleteRef.current) {
        pollGameState()
        return setInterval(pollGameState, pollInterval)
      } else {
        // Wait a bit and try again
        setTimeout(() => {
          startPolling()
        }, 2000)
        return null
      }
    }
    
    const interval = startPolling()
    
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [tableId, initializeGame, connectionStatus])

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
      {/* Session Expired Modal - Blocks all UI when session expires */}
      <SessionExpiredModal 
        isOpen={sessionExpired}
        onGoToHome={handleGoToHome}
      />

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
