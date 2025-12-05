import { useEffect, useRef } from 'react'
import { useGameStore, GameHistory } from '../store/gameStore'
import { sessionManager } from '../services/apiService'

// Production WebSocket URLs - try multiple ports
const WS_URLS = [
  'wss://wss.ho8.net:2087/',
  'wss://wss.ho8.net:2096/',
]

export const useWebSocket = () => {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const currentUrlIndexRef = useRef(0)
  const { updateGameStatus, setConnectionStatus, addGameHistory, setAccountBalance } = useGameStore()

  const connect = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    if (typeof WebSocket === 'undefined') {
      return
    }

    // Limit reconnection attempts
    if (reconnectAttemptsRef.current > 5) {
      return
    }

    try {
      reconnectAttemptsRef.current++
      setConnectionStatus('connecting')
      
      // Get URL to try
      const wsUrl = import.meta.env.VITE_WS_URL || WS_URLS[currentUrlIndexRef.current % WS_URLS.length]
      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0
        setConnectionStatus('connected')
        
        // Send authentication/subscription message with session ID
        const sessId = sessionManager.getSessionId()
        if (sessId) {
          // Try sending auth message - format may vary by server
          ws.send(JSON.stringify({
            type: 'auth',
            sess_id: sessId
          }))
        }
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          
          // Debug: Log WebSocket messages in dev mode to help diagnose betting/timer issues
          if (import.meta.env.DEV) {
            const currentState = useGameStore.getState()
            if (data.roundstatus !== undefined || (Array.isArray(data) && data.some((item: any) => item.roundstatus !== undefined))) {
              console.log('📡 WebSocket message with roundStatus:', {
                messageType: data.type || (Array.isArray(data) ? 'array' : data.ts ? 'lobby' : 'unknown'),
                roundStatus: data.roundstatus || (Array.isArray(data) ? data.map((item: any) => ({ tableid: item.tableid, roundstatus: item.roundstatus, countdown: item.countdown })) : null),
                currentRoundStatus: currentState.roundStatus,
                currentCountdown: currentState.countdown,
                tableId: currentState.tableId
              })
            }
          }
          
          // Handle direct array format FIRST: [{trid, tableid, roundstatus, ...}, ...]
          // This is the format from the original site's WebSocket
          if (Array.isArray(data)) {
            const currentTableId = useGameStore.getState().tableId
            if (import.meta.env.DEV) {
              console.log('📡 WebSocket: Received array data, current tableId:', currentTableId, 'Array length:', data.length)
              console.log('📡 WebSocket: All tables in array:', data.map((t: any) => ({
                tableid: t.tableid || t.tableId || t.t_id,
                trid: t.trid,
                roundstatus: t.roundstatus
              })))
            }
            
            let foundMatch = false
            data.forEach((tableData: any) => {
              const itemTableId = tableData.tableid || tableData.tableId || tableData.t_id
              // Case-insensitive comparison for table matching
              const tableMatches = itemTableId && currentTableId && 
                itemTableId.toUpperCase() === currentTableId.toUpperCase()
              
              if (import.meta.env.DEV) {
                console.log('📡 WebSocket: Checking table:', {
                  itemTableId,
                  currentTableId,
                  tableMatches,
                  hasTrid: !!tableData.trid,
                  roundstatus: tableData.roundstatus
                })
              }
              
              // Only update if this is the current table
              if (tableMatches && tableData.trid) {
                foundMatch = true
                const updateStatus: any = {
                  tableId: itemTableId,
                  roundId: tableData.trid?.toString() || tableData.r_id?.toString(),
                  currentRound: parseInt(tableData.r_info?.cf_roundno || tableData.r_no || '0', 10),
                  isLive: tableData.enable && tableData.tablestatus === 1
                }
                
                // Extract roundStatus if present - this is critical for betting
                // WebSocket is the source of truth for roundStatus - ALWAYS update it (overrides API)
                if (tableData.roundstatus !== undefined) {
                  updateStatus.roundStatus = tableData.roundstatus
                  
                  // When fighting starts (roundStatus === 2), clear countdown timer
                  if (tableData.roundstatus === 2) {
                    updateStatus.countdown = undefined
                    if (import.meta.env.DEV) {
                      console.log('⛔ Fighting started (roundStatus === 2), clearing countdown timer')
                    }
                  }
                  // When betting starts (roundStatus === 1), use server countdown if provided
                  else if (tableData.roundstatus === 1) {
                    // Use countdown from server if available (countdown, bettime, or similar fields)
                    if (tableData.countdown !== undefined && tableData.countdown > 0) {
                      updateStatus.countdown = tableData.countdown
                      if (import.meta.env.DEV) {
                        console.log('✅ Betting period started (roundStatus === 1), using server countdown:', tableData.countdown)
                      }
                    } else if (tableData.bettime !== undefined && tableData.bettime > 0) {
                      updateStatus.countdown = tableData.bettime
                      if (import.meta.env.DEV) {
                        console.log('✅ Betting period started (roundStatus === 1), using server bettime:', tableData.bettime)
                      }
                    }
                    // If no countdown from server but betting is open, check current state
                    else {
                      const currentState = useGameStore.getState()
                      // Only set countdown if it's currently undefined (don't override existing countdown)
                      if (currentState.countdown === undefined) {
                        // Server says betting is open but no countdown - this might be during betting period
                        // Don't set countdown here, let it be managed by game result logic
                        if (import.meta.env.DEV) {
                          console.log('⚠️ Betting period (roundStatus === 1) but no countdown from server. Current countdown:', currentState.countdown)
                        }
                      }
                    }
                  }
                  
                  if (import.meta.env.DEV) {
                    const currentStatus = useGameStore.getState().roundStatus
                    if (currentStatus !== undefined && currentStatus !== tableData.roundstatus) {
                      console.log('🔄 WebSocket: Overriding roundStatus:', {
                        old: currentStatus,
                        new: tableData.roundstatus,
                        'Note': 'WebSocket is source of truth, overriding API value'
                      })
                    }
                  }
                }
                
                // Always update - WebSocket data takes precedence over API
                updateGameStatus(updateStatus)
                
                // Verify roundId was set
                const verifyRoundId = useGameStore.getState().roundId
                
                if (import.meta.env.DEV) {
                  const statusNote = updateStatus.roundStatus === 1 ? '✅ BETTING OPEN' : 
                                   updateStatus.roundStatus === 2 ? '⛔ BETTING CLOSED' : 
                                   '❓ UNKNOWN'
                  console.log('✅ WebSocket: Updated table data from array:', {
                    tableId: itemTableId,
                    roundId: updateStatus.roundId,
                    trid: tableData.trid,
                    'roundId set?': !!updateStatus.roundId,
                    'roundId in store after update?': !!verifyRoundId,
                    'roundId matches?': updateStatus.roundId === verifyRoundId,
                    roundStatus: updateStatus.roundStatus,
                    currentRound: updateStatus.currentRound,
                    'Note': statusNote
                  })
                  
                  if (!verifyRoundId) {
                    console.error('❌ WebSocket: roundId was NOT set in store!', {
                      'updateStatus.roundId': updateStatus.roundId,
                      'store.roundId': verifyRoundId,
                      'tableData.trid': tableData.trid
                    })
                  }
                }
                
                // Extract game result if present (drawresult or result1 field)
                if (tableData.drawresult || tableData.result1) {
                  let result = tableData.result1 || tableData.drawresult
                  
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
                    if (resultUpper === 'M' || resultUpper === 'MERON') {
                      mappedResult = 'meron'
                    } else if (resultUpper === 'W' || resultUpper === 'WALA') {
                      mappedResult = 'wala'
                    } else if (resultUpper === 'D' || resultUpper === 'DRAW') {
                      mappedResult = 'draw'
                    }
                  }
                  
                  // Add to game history and start betting timer
                  const roundNumber = updateStatus.currentRound || parseInt(tableData.r_info?.cf_roundno || '0', 10)
                  if (roundNumber > 0 && mappedResult) {
                    addGameHistory({
                      round: roundNumber,
                      result: mappedResult,
                      timestamp: Date.now()
                    })
                    
                    // Start betting countdown timer (20 seconds) after game result
                    updateGameStatus({
                      countdown: 20,
                      roundStatus: 1 // Set to betting open
                    })
                    
                    if (import.meta.env.DEV) {
                      console.log('✅ Game result from WebSocket array, starting 20-second betting timer:', {
                        round: roundNumber,
                        result: mappedResult
                      })
                    }
                  }
                }
              }
            })
            
            if (import.meta.env.DEV && !foundMatch) {
              console.warn('⚠️ WebSocket: No matching table found! Current tableId:', currentTableId, 'Available tables:', data.map((t: any) => t.tableid || t.tableId || t.t_id))
            }
            
            return // Don't process further
          }
          
          // Handle production server format (lobby data updates)
          // Format: { ts: "2025-12-04T08:40:51.241Z", data?: [...], ... }
          if (data.ts && !data.type) {
            // Emit event for components to handle
            window.dispatchEvent(new CustomEvent('lobby_update', {
              detail: data
            }))
            
            // If data array exists (table round info)
            if (Array.isArray(data.data)) {
              const currentTableId = useGameStore.getState().tableId
              data.data.forEach((tableData: any) => {
                if (tableData.tableid && tableData.trid) {
                  const itemTableId = tableData.tableid
                  // Only process data for current table
                  const tableMatches = itemTableId && currentTableId && 
                    itemTableId.toUpperCase() === currentTableId.toUpperCase()
                  
                  if (tableMatches) {
                    const updateStatus: any = {
                      tableId: itemTableId,
                      roundId: tableData.trid?.toString() || tableData.r_id?.toString(),
                      currentRound: parseInt(tableData.r_info?.cf_roundno || tableData.r_no || '0', 10),
                      // Don't update countdown from WebSocket - it's managed by game result logic
                      // countdown: tableData.countdown,
                      isLive: tableData.enable && tableData.tablestatus === 1
                    }
                    
                    // Extract roundStatus if present
                    if (tableData.roundstatus !== undefined) {
                      updateStatus.roundStatus = tableData.roundstatus
                      
                      // When fighting starts (roundStatus === 2), clear countdown timer
                      if (tableData.roundstatus === 2) {
                        updateStatus.countdown = undefined
                        if (import.meta.env.DEV) {
                          console.log('⛔ Fighting started (roundStatus === 2) in lobby format, clearing countdown timer')
                        }
                      }
                      // When betting starts (roundStatus === 1), use server countdown if provided
                      else if (tableData.roundstatus === 1) {
                        // Use countdown from server if available
                        if (tableData.countdown !== undefined && tableData.countdown > 0) {
                          updateStatus.countdown = tableData.countdown
                          if (import.meta.env.DEV) {
                            console.log('✅ Betting period started (roundStatus === 1) in lobby format, using server countdown:', tableData.countdown)
                          }
                        } else if (tableData.bettime !== undefined && tableData.bettime > 0) {
                          updateStatus.countdown = tableData.bettime
                          if (import.meta.env.DEV) {
                            console.log('✅ Betting period started (roundStatus === 1) in lobby format, using server bettime:', tableData.bettime)
                          }
                        }
                      }
                    }
                    
                    updateGameStatus(updateStatus)
                    
                    // Extract game result if present (drawresult or result1 field)
                    if (tableData.drawresult || tableData.result1) {
                      let result = tableData.result1 || tableData.drawresult
                      
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
                        if (resultUpper === 'M' || resultUpper === 'MERON') {
                          mappedResult = 'meron'
                        } else if (resultUpper === 'W' || resultUpper === 'WALA') {
                          mappedResult = 'wala'
                        } else if (resultUpper === 'D' || resultUpper === 'DRAW') {
                          mappedResult = 'draw'
                        }
                      } else if (typeof result === 'number') {
                        // Handle numeric codes: 21001=meron, 21002=wala, 21003=draw
                        if (result === 21001) mappedResult = 'meron'
                        else if (result === 21002) mappedResult = 'wala'
                        else if (result === 21003) mappedResult = 'draw'
                      }
                      
                      // Add to game history and start betting timer
                      const roundNumber = updateStatus.currentRound || parseInt(tableData.r_info?.cf_roundno || '0', 10)
                      const isSettled = tableData.status === 4 || tableData.roundstatus === 4
                      const hasResult = mappedResult && (mappedResult === 'meron' || mappedResult === 'wala' || mappedResult === 'draw')
                      const hasValidResult = hasResult && (isSettled || (tableData.drawresult || tableData.result1))
                      
                      if (roundNumber > 0 && hasValidResult) {
                        addGameHistory({
                          round: roundNumber,
                          result: mappedResult,
                          meronCard: tableData.meronCard || tableData.m_card,
                          walaCard: tableData.walaCard || tableData.w_card,
                          timestamp: Date.now()
                        })
                        
                        // Start betting countdown timer (20 seconds) after game result
                        updateGameStatus({
                          countdown: 20,
                          roundStatus: 1 // Set to betting open
                        })
                        
                        if (import.meta.env.DEV) {
                          console.log('✅ Game result from lobby format, starting 20-second betting timer:', {
                            round: roundNumber,
                            result: mappedResult,
                            status: tableData.status,
                            roundstatus: tableData.roundstatus
                          })
                        }
                      } else if (import.meta.env.DEV && hasResult) {
                        console.warn('⚠️ Result found in lobby format but not added - conditions not met:', {
                          roundNumber,
                          mappedResult,
                          status: tableData.status,
                          roundstatus: tableData.roundstatus,
                          isSettled,
                          hasDrawresult: !!tableData.drawresult,
                          hasResult1: !!tableData.result1
                        })
                      }
                    }
                  }
                }
              })
            }
          }
          
          // Handle different message types
          switch (data.type) {
            case 'game_result':
              if (data.payload) {
                const history: GameHistory = {
                  round: data.payload.round || 0,
                  result: data.payload.result,
                  meronCard: data.payload.meronCard,
                  walaCard: data.payload.walaCard
                }
                addGameHistory(history)
                
                // Start betting countdown timer (20 seconds) after game result
                updateGameStatus({
                  countdown: 20,
                  roundStatus: 1 // Set to betting open (status 1)
                })
                
                if (import.meta.env.DEV) {
                  console.log('✅ Game result received, starting 20-second betting timer')
                }
              }
              break
            case 'game_status':
              updateGameStatus(data.payload)
              break
            case 'bet_confirmation':
              if (data.payload?.balance !== undefined) {
                setAccountBalance(data.payload.balance)
              }
              break
            case 'account_update':
              if (data.payload?.balance !== undefined) {
                setAccountBalance(data.payload.balance)
              }
              break
            case 'tableround':
              // Update roundId from tableround message
              const tableroundUpdate: any = { ...data.payload }
              // Ensure roundId is properly extracted
              if (data.payload?.roundId || data.payload?.r_id || data.payload?.trid) {
                tableroundUpdate.roundId = (data.payload.roundId || data.payload.r_id || data.payload.trid).toString()
              }
              if (data.payload?.currentRound || data.payload?.r_no) {
                const r_no = data.payload.currentRound || data.payload.r_no || data.payload.r_info?.cf_roundno
                tableroundUpdate.currentRound = typeof r_no === 'number' ? r_no : parseInt(String(r_no), 10)
              }
              
              // Extract roundStatus if present
              if (data.payload?.roundstatus !== undefined) {
                tableroundUpdate.roundStatus = data.payload.roundstatus
                
                // When fighting starts (roundStatus === 2), clear countdown timer
                if (data.payload.roundstatus === 2) {
                  tableroundUpdate.countdown = undefined
                  if (import.meta.env.DEV) {
                    console.log('⛔ Fighting started (roundStatus === 2) in tableround, clearing countdown timer')
                  }
                }
                // When betting starts (roundStatus === 1), use server countdown if provided
                else if (data.payload.roundstatus === 1) {
                  // Use countdown from server if available
                  if (data.payload.countdown !== undefined && data.payload.countdown > 0) {
                    tableroundUpdate.countdown = data.payload.countdown
                    if (import.meta.env.DEV) {
                      console.log('✅ Betting period started (roundStatus === 1) in tableround, using server countdown:', data.payload.countdown)
                    }
                  } else if (data.payload.bettime !== undefined && data.payload.bettime > 0) {
                    tableroundUpdate.countdown = data.payload.bettime
                    if (import.meta.env.DEV) {
                      console.log('✅ Betting period started (roundStatus === 1) in tableround, using server bettime:', data.payload.bettime)
                    }
                  }
                }
              }
              
              // Also check for countdown in payload even if roundStatus not explicitly set
              if (data.payload?.countdown !== undefined && data.payload.countdown > 0) {
                tableroundUpdate.countdown = data.payload.countdown
              } else if (data.payload?.bettime !== undefined && data.payload.bettime > 0) {
                tableroundUpdate.countdown = data.payload.bettime
              }
              
              updateGameStatus(tableroundUpdate)
              
              // Extract game result if present (drawresult or result1 field)
              if (data.payload?.drawresult || data.payload?.result1) {
                let result = data.payload.result1 || data.payload.drawresult
                
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
                  if (resultUpper === 'M' || resultUpper === 'MERON') {
                    mappedResult = 'meron'
                  } else if (resultUpper === 'W' || resultUpper === 'WALA') {
                    mappedResult = 'wala'
                  } else if (resultUpper === 'D' || resultUpper === 'DRAW') {
                    mappedResult = 'draw'
                  }
                } else if (typeof result === 'number') {
                  // Handle numeric codes: 21001=meron, 21002=wala, 21003=draw
                  if (result === 21001) mappedResult = 'meron'
                  else if (result === 21002) mappedResult = 'wala'
                  else if (result === 21003) mappedResult = 'draw'
                }
                
                // Get round number for the result
                const roundNumber = tableroundUpdate.currentRound || 
                                  parseInt(data.payload.r_info?.cf_roundno || data.payload.r_no || '0', 10)
                
                // Only add to history if we have valid round number and result
                // Check if result exists (status 4 = settled, but also accept if drawresult/result1 exists)
                const hasResult = mappedResult && (mappedResult === 'meron' || mappedResult === 'wala' || mappedResult === 'draw')
                const isSettled = data.payload.status === 4 || data.payload.roundstatus === 4
                // Also accept if we have a result even if status isn't 4 (might be transitioning)
                const hasValidResult = hasResult && (isSettled || (data.payload.drawresult || data.payload.result1))
                
                if (roundNumber > 0 && hasValidResult) {
                  const history: GameHistory = {
                    round: roundNumber,
                    result: mappedResult,
                    meronCard: data.payload.meronCard || data.payload.m_card,
                    walaCard: data.payload.walaCard || data.payload.w_card
                  }
                  addGameHistory(history)
                  
                  // Start betting countdown timer (20 seconds) after game result
                  updateGameStatus({
                    countdown: 20,
                    roundStatus: 1 // Set to betting open (status 1)
                  })
                  
                  if (import.meta.env.DEV) {
                    console.log('✅ Extracted result from tableround, starting 20-second betting timer:', { 
                      round: roundNumber, 
                      result: mappedResult,
                      status: data.payload.status,
                      roundstatus: data.payload.roundstatus
                    })
                  }
                } else if (import.meta.env.DEV && hasResult) {
                  console.warn('⚠️ Result found in tableround but not added - conditions not met:', {
                    roundNumber,
                    mappedResult,
                    status: data.payload.status,
                    roundstatus: data.payload.roundstatus,
                    isSettled,
                    hasDrawresult: !!data.payload.drawresult,
                    hasResult1: !!data.payload.result1
                  })
                }
              }
              
              if (data.payload?.video_url || data.payload?.stream_url || data.payload?.live_url) {
                window.dispatchEvent(new CustomEvent('video_url_update', {
                  detail: {
                    video_url: data.payload.video_url || data.payload.stream_url || data.payload.live_url,
                    tableId: data.payload.tableId || data.payload.t_id,
                    roundId: data.payload.roundId || data.payload.r_id
                  }
                }))
              }
              break
            case 'video_url_update':
              if (data.payload?.video_url) {
                window.dispatchEvent(new CustomEvent('video_url_update', {
                  detail: {
                    video_url: data.payload.video_url,
                    tableId: data.payload.tableId,
                    roundId: data.payload.roundId
                  }
                }))
              }
              break
            default:
              // Silently ignore unknown message types
              break
          }
        } catch {
          // Silently ignore parse errors
        }
      }

      ws.onerror = () => {
        setConnectionStatus('disconnected')
      }

      ws.onclose = () => {
        setConnectionStatus('disconnected')
        
        // Try next URL on reconnect
        currentUrlIndexRef.current++
        
        // Reconnect with exponential backoff
        if (reconnectAttemptsRef.current <= 5) {
          const delay = Math.min(5000 * reconnectAttemptsRef.current, 30000)
          reconnectTimeoutRef.current = setTimeout(() => {
            if (wsRef.current?.readyState !== WebSocket.OPEN) {
              connect()
            }
          }, delay)
        }
      }

      wsRef.current = ws
    } catch {
      setConnectionStatus('disconnected')
    }
  }

  const disconnect = () => {
    // Clear any pending reconnection attempts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    reconnectAttemptsRef.current = 0
    
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
  }

  const sendMessage = (message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    }
  }

  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [])

  return { connect, disconnect, sendMessage }
}
