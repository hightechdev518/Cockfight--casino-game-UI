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
import { setLanguage, isValidLanguageCode, type LanguageCode } from './utils/language'
import './App.css'

// Silence all console output in src/ (requested cleanup)
const console: Pick<Console, 'log' | 'warn' | 'error' | 'debug'> = {
  log: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

function App() {
  const { initializeGame, showGameSummary, setGameSummary, tableId, connectionStatus, sessionExpired, setSessionExpired } = useGameStore()
  const { connect, disconnect } = useWebSocket()
  const [scoreboardVisible, setScoreboardVisible] = useState(false)
  
  // Refs to track initialization state
  const isInitializingRef = useRef<boolean>(true)
  const initializationCompleteRef = useRef<boolean>(false)
  const sessionSetTimeRef = useRef<number>(0) // Track when session was set
  const gracePeriodRef = useRef<number>(5000) // 5 second grace period after login

  // Listen for session set events to track when session is established
  useEffect(() => {
    const handleSessionSet = (event: any) => {
      // Only start grace period if this is a new session (not just a refresh)
      // Check if session ID actually changed
      const currentSession = sessionManager.getSessionId()
      const previousSession = localStorage.getItem('previous_session_id')
      
      if (currentSession && currentSession !== previousSession) {
        sessionSetTimeRef.current = event.detail?.timestamp || Date.now()
        localStorage.setItem('previous_session_id', currentSession)
        if (import.meta.env.DEV) {
          console.log('✅ New session set event received, starting grace period')
        }
      } else if (import.meta.env.DEV) {
        console.log('✅ Session set event received but session unchanged (refresh)')
      }
    }

    window.addEventListener('session_set', handleSessionSet as EventListener)
    
    return () => {
      window.removeEventListener('session_set', handleSessionSet as EventListener)
    }
  }, [])

  // Listen for session expired events (B232 error)
  useEffect(() => {
    const handleSessionExpired = (event: any) => {
      // Check if we're within grace period after session was set
      const timeSinceSessionSet = Date.now() - sessionSetTimeRef.current
      const isWithinGracePeriod = timeSinceSessionSet < gracePeriodRef.current
      
      if (isWithinGracePeriod) {
      if (import.meta.env.DEV) {
          console.warn('⚠️ B232 error received but ignoring (within grace period after login):', {
            timeSinceSessionSet,
            gracePeriod: gracePeriodRef.current,
            detail: event.detail
          })
        }
        return // Ignore B232 errors during grace period
      }
      
      if (import.meta.env.DEV) {
        console.error('❌ Session expired event received (after grace period):', {
          timeSinceSessionSet,
          detail: event.detail
        })
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

  // Extract initialization logic into a reusable function
  const initializeApp = async () => {
    // Get initialization parameters from URL
    const { sess_id, language, tableid, uniqueid } = getInitParams()
    
    // Store language preference if provided and trigger language change event
    // This ensures UI updates immediately without requiring page refresh
    if (language && isValidLanguageCode(language)) {
      setLanguage(language as LanguageCode)
    }
    
    // Store uniqueid if provided (from URL or localStorage)
    if (uniqueid) {
      localStorage.setItem('last_uniqueid', uniqueid)
    }

    // Initialize with URL parameters or defaults
    const init = async () => {
      try {
        let sessionId = sess_id
        
        // If sess_id is in URL, use it
        if (sessionId) {
          const existingSession = sessionManager.getSessionId()
          const isNewSession = existingSession !== sessionId
          sessionManager.setSessionId(sessionId)
          // Track when session was set for grace period (only for new sessions)
          if (isNewSession) {
            sessionSetTimeRef.current = Date.now()
            if (import.meta.env.DEV) {
              console.log('✅ New session ID set from URL, starting grace period')
            }
          } else if (import.meta.env.DEV) {
            console.log('✅ Session ID from URL matches existing session')
          }
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
                  let foundOddsRNo: string | number | null = null
                  const lobbyMap: Record<string, any> = {}
                  
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
                      
                      // Build global lobby map for all tables
                      if (serverTableId) {
                        lobbyMap[serverTableId] = item
                      }
                      
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
                        // Extract odds r_no from lobbyinfo "no" (per-table)
                        if (item.no !== undefined && item.no !== null) {
                          foundOddsRNo = item.no
                          if (import.meta.env.DEV) {
                            console.log('✅ Found odds r_no (no) in array item:', foundOddsRNo)
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

                        // Store raw tablestatus from API when available so UI can show full table status
                        if (item.tablestatus !== undefined && updateData.roundStatus === undefined) {
                          // Only set if WebSocket hasn't already provided a tableStatus/roundStatus snapshot
                          ;(updateData as any).tableStatus = item.tablestatus
                        }
                        break
                      }
                    }
                  } else {
                    // Fallback: Check if data is an object with table-specific keys
                    if (tableId && data[tableId]) {
                      const tableData = data[tableId]
                      foundRoundId = tableData.trid || tableData.r_id || tableData.roundId
                      foundOddsRNo = tableData.no ?? tableData.r_no ?? foundOddsRNo
                      if (tableData.r_info && tableData.r_info.cf_roundno) {
                        foundCurrentRound = tableData.r_info.cf_roundno
                      }
                    }
                    
                    // Attempt to build global lobby map from object data
                    if (typeof data === 'object' && data !== null) {
                      Object.keys(data).forEach((k) => {
                        const v = (data as any)[k]
                        if (v && typeof v === 'object') {
                          const possibleTableId = (v.tableid || v.tableId || v.t_id || k)
                          const normalized = possibleTableId ? String(possibleTableId).toUpperCase() : null
                          if (normalized && normalized.startsWith('CF')) {
                            lobbyMap[normalized] = v
                          }
                        }
                      })
                    }
                    
                    // Fallback: Check root level
                    if (!foundRoundId) {
                      foundRoundId = data.trid || data.roundId || data.r_id
                    }
                    if (!foundOddsRNo) {
                      foundOddsRNo = data.no ?? data.r_no ?? null
                    }
                    if (!foundCurrentRound) {
                      foundCurrentRound = data.currentRound || data.r_no
                    }
                  }

                  // Store lobbyinfo global map if we have one
                  if (Object.keys(lobbyMap).length > 0) {
                    updateData.lobbyInfoByTableId = lobbyMap
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

                  // Ensure selected table has r_no in global map; odds.php must use it (no fallback)
                  if (foundOddsRNo !== null && foundOddsRNo !== undefined && tableId) {
                    const key = tableId.toUpperCase()
                    updateData.lobbyInfoByTableId = {
                      ...(updateData.lobbyInfoByTableId || useGameStore.getState().lobbyInfoByTableId || {}),
                      [key]: {
                        ...(useGameStore.getState().lobbyInfoByTableId?.[key] || {}),
                        no: foundOddsRNo,
                      },
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
                      console.log('📊 Attempting to fetch roundId from odds API using r_no (from lobbyinfo no):', foundOddsRNo)
                    }
                    try {
                      if (!foundOddsRNo) {
                        throw new Error('Missing lobbyinfo no (r_no) - no fallback')
                      }
                      const oddsResponse = await apiService.getOdds(foundOddsRNo.toString())
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

    await init().catch((error) => {
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
  }

  // Initial mount initialization
  useEffect(() => {
    initializeApp()
    
    return () => {
      try {
        disconnect()
      } catch (error) {
        // Ignore disconnect errors
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Listen for URL parameter changes and re-initialize when they change
  useEffect(() => {
    const handleInitParamChange = async (event: any) => {
      const { param, newValue, allParams } = event.detail || {}
      
      if (import.meta.env.DEV) {
        console.log('🔄 URL parameter changed, re-initializing:', { param, newValue, allParams })
      }
      
      // Disconnect WebSocket before re-initializing
      try {
        disconnect()
      } catch (error) {
        // Ignore disconnect errors
      }
      
      // Reset initialization flags to allow re-initialization
      isInitializingRef.current = true
      initializationCompleteRef.current = false
      
      // Re-initialize the app with new parameters
      try {
        await initializeApp()
        isInitializingRef.current = false
        initializationCompleteRef.current = true
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('❌ Re-initialization failed:', error)
        }
        isInitializingRef.current = false
        initializationCompleteRef.current = true
      }
    }

    const handlePopState = async () => {
      // Browser back/forward navigation - URL changed
      if (import.meta.env.DEV) {
        console.log('🔄 Browser navigation detected, re-initializing')
      }
      
      // Disconnect WebSocket before re-initializing
      try {
        disconnect()
      } catch (error) {
        // Ignore disconnect errors
      }
      
      // Reset initialization flags
      isInitializingRef.current = true
      initializationCompleteRef.current = false
      
      // Re-initialize the app
      try {
        await initializeApp()
        isInitializingRef.current = false
        initializationCompleteRef.current = true
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('❌ Re-initialization failed:', error)
        }
        isInitializingRef.current = false
        initializationCompleteRef.current = true
      }
    }

    // Listen for custom initparamchange events (from setUrlParam/setInitParams)
    window.addEventListener('initparamchange', handleInitParamChange)
    // Listen for browser back/forward navigation
    window.addEventListener('popstate', handlePopState)
    
    return () => {
      window.removeEventListener('initparamchange', handleInitParamChange)
      window.removeEventListener('popstate', handlePopState)
    }
  }, [disconnect])

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
        if (sessionManager.getSessionId()) {
          // IMPORTANT: odds.php requires r_no; we source it from lobbyinfo.php per-table "no"
          // Keep this call lightweight and throttled; WebSocket remains the source of truth for realtime state.
          const lobbyInfoKey = `lobbyinfo_tablechange_${tableId}`
          if (shouldThrottle(lobbyInfoKey, 2000)) {
            try {
              const lobbyInfo = await apiService.getLobbyInfo()
              completeThrottle(lobbyInfoKey)
              if (lobbyInfo && lobbyInfo.code === 'B100' && lobbyInfo.data) {
                const data: any = lobbyInfo.data
                let foundOddsRNo: string | number | null = null
                let foundRoundId: string | number | null = null
                let foundCurrentRound: string | number | null = null

                if (Array.isArray(data)) {
                  const currentTableIdUpper = tableId ? tableId.toUpperCase() : null
                  for (const item of data) {
                    const itemTableId = item.tableid || item.tableId || item.t_id
                    const serverTableId = itemTableId ? itemTableId.toUpperCase() : null
                    if (serverTableId && currentTableIdUpper && serverTableId === currentTableIdUpper) {
                      if (item.no !== undefined && item.no !== null) foundOddsRNo = item.no
                      if (item.trid) foundRoundId = item.trid
                      if (item.r_info?.cf_roundno) foundCurrentRound = item.r_info.cf_roundno
                      break
                    }
                  }
                } else if (typeof data === 'object' && data !== null) {
                  const tableData = (tableId && data[tableId]) ? data[tableId] : null
                  if (tableData) {
                    foundOddsRNo = tableData.no ?? tableData.r_no ?? null
                    foundRoundId = tableData.trid || tableData.r_id || tableData.roundId || null
                    foundCurrentRound = tableData.r_info?.cf_roundno || tableData.currentRound || tableData.r_no || null
                  } else {
                    foundOddsRNo = data.no ?? data.r_no ?? null
                    foundRoundId = data.trid || data.roundId || data.r_id || null
                    foundCurrentRound = data.currentRound || data.r_no || null
                  }
                }

                const updateData: any = {}
                // Update global lobbyinfo cache (per-table) so other modules can read r_no etc.
                if (foundOddsRNo !== null && foundOddsRNo !== undefined) {
                  const key = tableId.toUpperCase()
                  updateData.lobbyInfoByTableId = {
                    ...(useGameStore.getState().lobbyInfoByTableId || {}),
                    [key]: {
                      ...(useGameStore.getState().lobbyInfoByTableId?.[key] || {}),
                      no: foundOddsRNo,
                    },
                  }
                }
                if (foundRoundId) updateData.roundId = foundRoundId.toString()
                if (foundCurrentRound) updateData.currentRound = typeof foundCurrentRound === 'number' ? foundCurrentRound : parseInt(foundCurrentRound.toString(), 10)
                if (Object.keys(updateData).length > 0) initializeGame(updateData)
              }
            } catch {
              completeThrottle(lobbyInfoKey)
            }
          }

          // Still trigger video URL refresh when table switches
          if (typeof window !== 'undefined') {
            if (import.meta.env.DEV) {
              console.log('📺 Dispatching video_url_refresh event for table:', tableId)
            }
            window.dispatchEvent(new CustomEvent('video_url_refresh', {
              detail: { tableId }
            }))
          }
          return
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
      // Poll every 10 seconds until roundId is found (reduced frequency)
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
      }, 10000) // Increased from 5s to 10s
      
      return () => clearInterval(pollInterval)
    }
  }, [tableId, initializeGame])

  // Session keep-alive: Fetch playerinfo or lobbyinfo every 30 seconds to keep session alive
  useEffect(() => {
    if (!sessionManager.getSessionId()) return // Don't poll without session
    
    const keepSessionAlive = async () => {
      // Don't poll during initial loading to prevent duplicate calls
      if (isInitializingRef.current || !initializationCompleteRef.current) {
        return
      }
      
      try {
        // Use playerinfo to keep session alive (lighter than lobbyinfo)
        const sessionKeepAliveKey = 'session_keepalive'
        if (shouldThrottle(sessionKeepAliveKey, 30000)) {
          if (import.meta.env.DEV) {
            console.log('💓 Session keep-alive: Fetching playerinfo to keep session alive')
          }
          
          try {
            await apiService.getPlayerInfo()
            completeThrottle(sessionKeepAliveKey)
            if (import.meta.env.DEV) {
              console.log('✅ Session keep-alive: playerinfo fetched successfully')
            }
          } catch (error) {
            completeThrottle(sessionKeepAliveKey)
            if (import.meta.env.DEV) {
              console.warn('⚠️ Session keep-alive: playerinfo fetch failed, will retry in 30s:', error)
            }
          }
        }
      } catch (error) {
        // Silently fail - will retry on next interval
        if (import.meta.env.DEV) {
          console.debug('Session keep-alive error:', error)
        }
      }
    }
    
    // Start keep-alive after initialization completes
    const startKeepAlive = () => {
      if (initializationCompleteRef.current) {
        keepSessionAlive() // Initial call
        return setInterval(keepSessionAlive, 30000) // Every 30 seconds
      } else {
        // Wait a bit and try again
        setTimeout(() => {
          startKeepAlive()
        }, 2000)
        return null
      }
    }
    
    const keepAliveInterval = startKeepAlive()
    
    return () => {
      if (keepAliveInterval) clearInterval(keepAliveInterval)
    }
  }, [])
  
  // Set up periodic polling for game state updates (ONLY when WebSocket is disconnected)
  // When WebSocket is connected, it provides real-time updates, so no polling needed
  useEffect(() => {
    if (!tableId) return
    if (!sessionManager.getSessionId()) return // Don't poll without session
    if (connectionStatus === 'connected') {
      // WebSocket is connected - no polling needed, WebSocket provides real-time updates
      if (import.meta.env.DEV) {
        console.log('✅ WebSocket connected - skipping periodic polling (using real-time updates)')
      }
      return
    }
    
    // Only poll when WebSocket is disconnected (as fallback)
    // Poll less frequently to reduce server load
    const pollInterval = 60000 // 60s when WebSocket disconnected (reduced frequency)
    
    const pollGameState = async () => {
      // Don't poll during initial loading to prevent duplicate calls
      if (isInitializingRef.current || !initializationCompleteRef.current) {
        if (import.meta.env.DEV) {
          console.log('⏸️ Skipping poll during initialization')
        }
        return
      }
      
      // Skip if WebSocket reconnected
      if (useGameStore.getState().connectionStatus === 'connected') {
        if (import.meta.env.DEV) {
          console.log('✅ WebSocket reconnected - stopping polling')
        }
        return
      }
      
      try {
        // Lobbyinfo is only called once during initialization - removed from polling to reduce API calls
        // WebSocket will provide real-time updates instead
        if (import.meta.env.DEV) {
          console.log('⏸️ Skipping lobbyinfo poll - using WebSocket for updates (lobbyinfo only called once during init)')
        }
        
        // Throttle balance calls - minimum 60 seconds between calls (reduced frequency)
        // Only poll balance when WebSocket is disconnected (WebSocket provides balance updates when connected)
        const balanceKey = 'balance_poll'
        if (!shouldThrottle(balanceKey, 60000)) { // Increased from 30s to 60s
          if (import.meta.env.DEV) {
            console.debug('⏸️ Throttled balance poll')
          }
        } else {
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
