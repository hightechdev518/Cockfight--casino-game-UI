import { useEffect, useRef } from 'react'
import { useGameStore, GameHistory } from '../store/gameStore'
import { sessionManager, apiService } from '../services/apiService'
import { shouldThrottle, completeThrottle } from '../utils/apiThrottle'

// Production WebSocket URLs
// WebSocket 1: Public/Game State (Broadcast) - table rounds, game status, results
// Port 2087: Public broadcast channel (no authentication needed)
const WS_PUBLIC_URL = 'wss://wss.ho8.net:2087/'

// WebSocket 2: User/Account (Private) - balance, bet confirmations, account updates, round cancellations
// Port 2096: User-specific channel (requires session authentication)
const WS_USER_URL = 'wss://wss.ho8.net:2096/'

export const useWebSocket = () => {
  // WebSocket 1: Public/Game State (Port 2087)
  const wsPublicRef = useRef<WebSocket | null>(null)
  const reconnectPublicTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectPublicAttemptsRef = useRef(0)
  
  // WebSocket 2: User/Account (Port 2096)
  const wsUserRef = useRef<WebSocket | null>(null)
  const reconnectUserTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectUserAttemptsRef = useRef(0)
  const userHeloIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  
  const { updateGameStatus, setConnectionStatus, addGameHistory, setAccountBalance } = useGameStore()

  /**
   * Fetches updated balance from API after game result
   * This ensures balance reflects wins/losses from settled bets according to server rules
   * Also fetches wagers for the settled round to verify which bets won/lost
   */
  const fetchBalanceAfterResult = async (roundId?: string) => {
    // Throttle balance fetch to prevent duplicate calls
    const balanceKey = `balance_websocket_result_${roundId || 'unknown'}`
    if (!shouldThrottle(balanceKey, 2000)) {
      if (import.meta.env.DEV) {
        console.debug('⏸️ Throttled balance fetch after WebSocket result')
      }
      return
    }
    
    try {
      // Always fetch balance from API - server calculates wins/losses based on odds
      const balance = await apiService.getBalance()
      completeThrottle(balanceKey)
      setAccountBalance(balance)
      
      if (import.meta.env.DEV) {
        console.log('💰 Balance updated after game result (settlement):', balance)
      }
      
      // Optionally fetch wagers for the settled round to see which bets won/lost
      // This helps verify that balance changes match the server's calculations
      if (roundId && import.meta.env.DEV) {
        try {
          const wagersResponse = await apiService.getWagersByRound(roundId)
          if (wagersResponse && wagersResponse.data) {
            const settledBets = wagersResponse.data.settle || []
            const unsettledBets = wagersResponse.data.unsettle || []
            
            if (settledBets.length > 0) {
              console.log('📊 Settled bets for round:', {
                roundId,
                settledCount: settledBets.length,
                bets: settledBets.map((bet: any) => ({
                  w_no: bet.w_no,
                  w_bet: bet.w_bet,
                  w_win: bet.w_win,
                  w_status: bet.w_status,
                  w_bettype: bet.w_bettype,
                  w_betzone: bet.w_betzone
                }))
              })
            }
            
            if (import.meta.env.DEV) {
              console.log('📊 Wagers for round:', {
                roundId,
                settled: settledBets.length,
                unsettled: unsettledBets.length
              })
            }
          }
        } catch (wagerError) {
          // Silently fail - this is just for verification/logging
          if (import.meta.env.DEV) {
            console.debug('Could not fetch wagers for verification:', wagerError)
          }
        }
      }
    } catch (error) {
      // Silently fail - balance polling will catch up
      if (import.meta.env.DEV) {
        console.debug('Balance fetch after result failed:', error)
      }
    }
  }

  /**
   * Connect to WebSocket 1: Public/Game State (Broadcast)
   * Handles: table rounds, game status, countdown, results
   */
  const connectPublic = () => {
    if (wsPublicRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    if (typeof WebSocket === 'undefined') {
      return
    }

    // Limit reconnection attempts
    if (reconnectPublicAttemptsRef.current > 5) {
      return
    }

    try {
      reconnectPublicAttemptsRef.current++
      setConnectionStatus('connecting')
      
      // Get URL (Port 2087 for public/game state)
      const wsUrl = import.meta.env.VITE_WS_PUBLIC_URL || WS_PUBLIC_URL
      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        reconnectPublicAttemptsRef.current = 0
        setConnectionStatus('connected')
        
        if (import.meta.env.DEV) {
          console.log('✅ WebSocket 1 (Public/Game State) connected:', wsUrl)
        }
        
        // Public WebSocket doesn't need authentication - it broadcasts to all users
        // No auth message needed
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
                // Normalize tableId to uppercase (CF01, CF02, etc.) to match server format
                const normalizedTableId = itemTableId ? itemTableId.toUpperCase() : itemTableId
                const updateStatus: any = {
                  tableId: normalizedTableId, // Use server's tableId (CF01, CF02, etc.) from WebSocket signal
                  roundId: tableData.trid?.toString() || tableData.r_id?.toString(),
                  currentRound: parseInt(tableData.r_info?.cf_roundno || tableData.r_no || '0', 10),
                  isLive: tableData.enable && tableData.tablestatus === 1
                }
                
                // Log tableId update from server signal
                if (import.meta.env.DEV && normalizedTableId) {
                  const currentTableId = useGameStore.getState().tableId
                  if (normalizedTableId !== currentTableId?.toUpperCase()) {
                    console.log('🔄 WebSocket: Updating tableId from server signal:', {
                      old: currentTableId,
                      new: normalizedTableId,
                      source: 'WebSocket array data'
                    })
                  }
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
                    const history = {
                      round: roundNumber,
                      result: mappedResult,
                      timestamp: Date.now()
                    }
                    addGameHistory(history)
                    
                    // Dispatch event to notify that a NEW result was received from server
                    // This ensures win message only shows for new results, not on page refresh
                    if (typeof window !== 'undefined') {
                      if (import.meta.env.DEV) {
                        console.log('📢 Dispatching new_game_result_from_server event (WebSocket array):', {
                          result: history.result,
                          round: history.round
                        })
                      }
                      window.dispatchEvent(new CustomEvent('new_game_result_from_server', {
                        detail: {
                          result: history.result,
                          round: history.round
                        }
                      }))
                    }
                    
                    // Reset totalBet and bets when game result comes (before new round starts)
                    const { clearBets } = useGameStore.getState()
                    clearBets()
                    
                    if (import.meta.env.DEV) {
                      console.log('🔄 Game result from WebSocket array, resetting totalBet and bets before new round')
                    }
                    
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
          
          // Handle timestamp-only heartbeat messages: {"ts":"2025-12-08T09:08:13.791Z"}
          // These are just heartbeats, ignore them (no data property)
          if (data.ts && !data.type && !data.data && Object.keys(data).length === 1) {
            if (import.meta.env.DEV) {
              console.debug('📡 WebSocket 1: Heartbeat received:', data.ts)
            }
            return // Just a heartbeat, no action needed
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
                    // Normalize tableId to uppercase (CF01, CF02, etc.) to match server format
                    const normalizedTableId = itemTableId ? itemTableId.toUpperCase() : itemTableId
                    const updateStatus: any = {
                      tableId: normalizedTableId, // Use server's tableId (CF01, CF02, etc.) from WebSocket signal
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
                        const history = {
                          round: roundNumber,
                          result: mappedResult,
                          meronCard: tableData.meronCard || tableData.m_card,
                          walaCard: tableData.walaCard || tableData.w_card,
                          timestamp: Date.now()
                        }
                        addGameHistory(history)
                        
                        // Dispatch event to notify that a NEW result was received from server
                        // This ensures win message only shows for new results, not on page refresh
                        if (typeof window !== 'undefined') {
                          if (import.meta.env.DEV) {
                            console.log('📢 Dispatching new_game_result_from_server event (lobby format):', {
                              result: history.result,
                              round: history.round
                            })
                          }
                          window.dispatchEvent(new CustomEvent('new_game_result_from_server', {
                            detail: {
                              result: history.result,
                              round: history.round,
                              meronCard: history.meronCard,
                              walaCard: history.walaCard
                            }
                          }))
                        }
                        
                        // Reset totalBet and bets when game result comes (before new round starts)
                        const { clearBets } = useGameStore.getState()
                        clearBets()
                        
                        if (import.meta.env.DEV) {
                          console.log('🔄 Game result from lobby format, resetting totalBet and bets before new round')
                        }
                        
                        // Start betting countdown timer (20 seconds) after game result
                        updateGameStatus({
                          countdown: 20,
                          roundStatus: 1 // Set to betting open
                        })
                        
                        // Fetch updated balance from API after game result (settlement)
                        // This ensures balance reflects wins/losses from settled bets according to server rules
                        if (isSettled) {
                          const settledRoundId = updateStatus.roundId || tableData.trid?.toString() || tableData.r_id?.toString()
                          fetchBalanceAfterResult(settledRoundId)
                        }
                        
                        if (import.meta.env.DEV) {
                          console.log('✅ Game result from lobby format, starting 20-second betting timer:', {
                            round: roundNumber,
                            result: mappedResult,
                            status: tableData.status,
                            roundstatus: tableData.roundstatus,
                            isSettled
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
                
                // Dispatch event to notify that a NEW result was received from server
                // This ensures win message only shows for new results, not on page refresh
                if (typeof window !== 'undefined') {
                  if (import.meta.env.DEV) {
                    console.log('📢 Dispatching new_game_result_from_server event (game_result):', {
                      result: history.result,
                      round: history.round
                    })
                  }
                  window.dispatchEvent(new CustomEvent('new_game_result_from_server', {
                    detail: {
                      result: history.result,
                      round: history.round,
                      meronCard: history.meronCard,
                      walaCard: history.walaCard
                    }
                  }))
                }
                
                // Reset totalBet and bets when game result comes (before new round starts)
                const { clearBets } = useGameStore.getState()
                clearBets()
                
                if (import.meta.env.DEV) {
                  console.log('🔄 Game result received in WebSocket, resetting totalBet and bets before new round')
                }
                
                // Start betting countdown timer (20 seconds) after game result
                updateGameStatus({
                  countdown: 20,
                  roundStatus: 1 // Set to betting open (status 1)
                })
                
                // Fetch updated balance from API after game result (settlement)
                // This ensures balance reflects wins/losses from settled bets according to server rules
                const settledRoundId = data.payload?.roundId || data.payload?.r_id || data.payload?.trid
                fetchBalanceAfterResult(settledRoundId?.toString())
                
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
              
              // Normalize tableId from server signal (CF01, CF02, etc.)
              if (data.payload?.tableId || data.payload?.tableid || data.payload?.t_id) {
                const serverTableId = data.payload.tableId || data.payload.tableid || data.payload.t_id
                tableroundUpdate.tableId = serverTableId ? serverTableId.toUpperCase() : serverTableId
                if (import.meta.env.DEV) {
                  console.log('🔄 WebSocket tableround: Using tableId from server signal:', tableroundUpdate.tableId)
                }
              }
              
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
                  // Fetch updated balance from API after game result (settlement)
                  // This ensures balance reflects wins/losses from settled bets according to server rules
                  if (isSettled) {
                    const settledRoundId = tableroundUpdate.roundId || data.payload?.r_id?.toString() || data.payload?.trid?.toString()
                    fetchBalanceAfterResult(settledRoundId)
                  }
                  
                  const history: GameHistory = {
                    round: roundNumber,
                    result: mappedResult,
                    meronCard: data.payload.meronCard || data.payload.m_card,
                    walaCard: data.payload.walaCard || data.payload.w_card
                  }
                  addGameHistory(history)
                  
                  // Dispatch event to notify that a NEW result was received from server
                  // This ensures win message only shows for new results, not on page refresh
                  if (typeof window !== 'undefined') {
                    if (import.meta.env.DEV) {
                      console.log('📢 Dispatching new_game_result_from_server event (tableround):', {
                        result: history.result,
                        round: history.round
                      })
                    }
                    window.dispatchEvent(new CustomEvent('new_game_result_from_server', {
                      detail: {
                        result: history.result,
                        round: history.round,
                        meronCard: history.meronCard,
                        walaCard: history.walaCard
                      }
                    }))
                  }
                  
                  // Reset totalBet and bets when game result comes (before new round starts)
                  const { clearBets } = useGameStore.getState()
                  clearBets()
                  
                  if (import.meta.env.DEV) {
                    console.log('🔄 Game result extracted from tableround, resetting totalBet and bets before new round')
                  }
                  
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
        
        if (import.meta.env.DEV) {
          console.log('⚠️ WebSocket 1 (Public) closed, attempting reconnect...')
        }
        
        // Reconnect with exponential backoff
        if (reconnectPublicAttemptsRef.current <= 5) {
          const delay = Math.min(5000 * reconnectPublicAttemptsRef.current, 30000)
          reconnectPublicTimeoutRef.current = setTimeout(() => {
            if (wsPublicRef.current?.readyState !== WebSocket.OPEN) {
              connectPublic()
            }
          }, delay)
        }
      }

      wsPublicRef.current = ws
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('❌ Failed to connect WebSocket 1 (Public):', error)
      }
      setConnectionStatus('disconnected')
    }
  }

  /**
   * Connect to WebSocket 2: User/Account (Private)
   * Handles: balance updates, bet confirmations, account events, round cancellations
   */
  const connectUser = () => {
    if (wsUserRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    if (typeof WebSocket === 'undefined') {
      return
    }

    // Limit reconnection attempts
    if (reconnectUserAttemptsRef.current > 5) {
      return
    }

    const sessId = sessionManager.getSessionId()
    if (!sessId) {
      // Can't connect user WebSocket without session - will retry when session is available
      if (import.meta.env.DEV) {
        console.warn('⚠️ Cannot connect WebSocket 2 (User) - no session ID. Will retry when session is available.')
        console.log('💡 To connect user WebSocket, ensure session ID is set via URL parameter or login.')
      }
      // Don't increment attempts counter since we'll retry when session is available
      reconnectUserAttemptsRef.current = Math.max(0, reconnectUserAttemptsRef.current - 1)
      return
    }
    
    if (import.meta.env.DEV) {
      console.log('🔌 Attempting to connect WebSocket 2 (User/Account) to:', WS_USER_URL)
    }

    try {
      reconnectUserAttemptsRef.current++
      
      // Get URL (Port 2096 for user/account)
      const wsUrl = import.meta.env.VITE_WS_USER_URL || WS_USER_URL
      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        reconnectUserAttemptsRef.current = 0
        
        if (import.meta.env.DEV) {
          console.log('✅ WebSocket 2 (User/Account) connected:', wsUrl)
        }
        
        // Send authentication with session ID (required for user WebSocket)
        ws.send(JSON.stringify({
          sess_id: sessId
        }))
        
        // Start heartbeat (send empty string every 7 seconds per original site)
        userHeloIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('') // Send empty string as heartbeat (per original site)
            if (import.meta.env.DEV) {
              console.debug('📡 WebSocket 2: Sent heartbeat')
            }
          } else if (ws.readyState === WebSocket.CLOSED) {
            // Connection closed, reload page (as per original site behavior)
            if (import.meta.env.DEV) {
              console.warn('⚠️ WebSocket 2 closed, should reload page...')
            }
            // location.reload() // Uncomment if you want auto-reload on disconnect
          }
        }, 7000) // Every 7 seconds per original site
      }

      ws.onmessage = (event) => {
        try {
          // Handle plain text HELO response (if any)
          if (typeof event.data === 'string' && event.data.trim() === 'HELO') {
            if (import.meta.env.DEV) {
              console.debug('📡 WebSocket 2: Received HELO heartbeat response')
            }
            return
          }
          
          // Handle JSON messages
          const data = JSON.parse(event.data)
          
          if (import.meta.env.DEV) {
            console.log('📡 WebSocket 2 (User) message received:', data)
          }
          
          // Handle odds updates (PRIMARY METHOD - real-time odds)
          // Format: { "CF01": { "21001:M": { "o_opentype": "M", "o_odds": "0.92" }, ... }, "act": "settle", ... }
          const { tableId: currentTableId } = useGameStore.getState()
          if (currentTableId && data[currentTableId]) {
            const oddsData = data[currentTableId]
            if (typeof oddsData === 'object' && !Array.isArray(oddsData)) {
              // Emit odds update event for BettingInterface to handle
              window.dispatchEvent(new CustomEvent('odds_update', {
                detail: { tableId: currentTableId, odds: oddsData }
              }))
              
              if (import.meta.env.DEV) {
                console.log('📊 WebSocket 2: Real-time odds update received:', {
                  tableId: currentTableId,
                  oddsKeys: Object.keys(oddsData),
                  odds: oddsData
                })
              }
            }
          }
          
          // Handle settlement notifications
          if (data.act === 'settle') {
            if (import.meta.env.DEV) {
              console.log('🎉 Round settled:', {
                roundId: data.r_id,
                result: data.r_drawresult,
                win: data.win
              })
            }
            // Emit settlement event
            window.dispatchEvent(new CustomEvent('round_settled', {
              detail: {
                roundId: data.r_id,
                result: data.r_drawresult,
                win: data.win
              }
            }))
          }
          
          // Handle user-specific events
          switch (data.act) {
            case 'cancel':
              // Round cancellation: {"act":"cancel","r_id":1267470,"tableid":"CF05","reason":"NO FIGHT"}
              if (import.meta.env.DEV) {
                console.log('⚠️ Round cancelled:', {
                  roundId: data.r_id,
                  tableId: data.tableid,
                  reason: data.reason
                })
              }
              
              // Update game status to reflect cancellation
              const { tableId: currentTableIdCancel } = useGameStore.getState()
              if (data.tableid && data.tableid.toUpperCase() === currentTableIdCancel?.toUpperCase()) {
                // Clear bets if this is the current table
                const { clearBets } = useGameStore.getState()
                clearBets()
                
                // Optionally show notification to user about cancellation
                if (import.meta.env.DEV) {
                  console.log('🔄 Cleared bets due to round cancellation:', data.reason)
                }
              }
              break
              
            case 'bet_confirmation':
            case 'bet_confirm':
              // Bet confirmation with balance update
              if (data.balance !== undefined) {
                setAccountBalance(data.balance)
                if (import.meta.env.DEV) {
                  console.log('💰 Balance updated from bet confirmation:', data.balance)
                }
              }
              break
              
            case 'account_update':
            case 'balance_update':
              // Account/balance update
              if (data.balance !== undefined) {
                setAccountBalance(data.balance)
                if (import.meta.env.DEV) {
                  console.log('💰 Balance updated from account update:', data.balance)
                }
              }
              break
              
            default:
              // Handle other user events if needed
              if (import.meta.env.DEV && data.act && data.act !== 'settle') {
                console.log('📡 WebSocket 2: Unknown user event:', data.act, data)
              }
              break
          }
          
          // Also handle direct balance updates (not in act format)
          if (data.balance !== undefined && !data.act) {
            setAccountBalance(data.balance)
            if (import.meta.env.DEV) {
              console.log('💰 Balance updated from WebSocket 2:', data.balance)
            }
          }
        } catch (error) {
          // Might be plain text or other format
          if (import.meta.env.DEV) {
            console.debug('WebSocket 2: Could not parse message as JSON:', event.data)
          }
        }
      }

      ws.onerror = (error) => {
        if (import.meta.env.DEV) {
          console.error('❌ WebSocket 2 (User) error:', error)
        }
      }

      ws.onclose = () => {
        if (import.meta.env.DEV) {
          console.log('⚠️ WebSocket 2 (User) closed, attempting reconnect...')
        }
        
        // Clear HELO interval
        if (userHeloIntervalRef.current) {
          clearInterval(userHeloIntervalRef.current)
          userHeloIntervalRef.current = null
        }
        
        // Reconnect with exponential backoff
        if (reconnectUserAttemptsRef.current <= 5) {
          const delay = Math.min(5000 * reconnectUserAttemptsRef.current, 30000)
          reconnectUserTimeoutRef.current = setTimeout(() => {
            if (wsUserRef.current?.readyState !== WebSocket.OPEN) {
              connectUser()
            }
          }, delay)
        }
      }

      wsUserRef.current = ws
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('❌ Failed to connect WebSocket 2 (User):', error)
      }
    }
  }

  /**
   * Connect both WebSockets
   */
  const connect = () => {
    connectPublic()
    connectUser()
  }

  const disconnect = () => {
    // Disconnect Public WebSocket
    if (reconnectPublicTimeoutRef.current) {
      clearTimeout(reconnectPublicTimeoutRef.current)
      reconnectPublicTimeoutRef.current = null
    }
    reconnectPublicAttemptsRef.current = 0
    
    if (wsPublicRef.current) {
      wsPublicRef.current.close()
      wsPublicRef.current = null
    }
    
    // Disconnect User WebSocket
    if (reconnectUserTimeoutRef.current) {
      clearTimeout(reconnectUserTimeoutRef.current)
      reconnectUserTimeoutRef.current = null
    }
    if (userHeloIntervalRef.current) {
      clearInterval(userHeloIntervalRef.current)
      userHeloIntervalRef.current = null
    }
    reconnectUserAttemptsRef.current = 0
    
    if (wsUserRef.current) {
      wsUserRef.current.close()
      wsUserRef.current = null
    }
    
    setConnectionStatus('disconnected')
  }

  const sendMessage = (message: any, target: 'public' | 'user' = 'public') => {
    if (target === 'public') {
      if (wsPublicRef.current?.readyState === WebSocket.OPEN) {
        wsPublicRef.current.send(JSON.stringify(message))
      }
    } else {
      if (wsUserRef.current?.readyState === WebSocket.OPEN) {
        wsUserRef.current.send(JSON.stringify(message))
      }
    }
  }

  // Listen for session availability and connect user WebSocket when session is ready
  useEffect(() => {
    const checkAndConnectUser = () => {
      const sessId = sessionManager.getSessionId()
      if (sessId && wsUserRef.current?.readyState !== WebSocket.OPEN) {
        // Session is available but user WebSocket not connected - connect it
        if (import.meta.env.DEV) {
          console.log('📡 Session available, connecting user WebSocket...')
        }
        connectUser()
      }
    }
    
    // Check immediately
    checkAndConnectUser()
    
    // Also check periodically (in case session is set later)
    const interval = setInterval(checkAndConnectUser, 2000)
    
    return () => {
      clearInterval(interval)
      disconnect()
    }
  }, [])

  return { connect, disconnect, sendMessage }
}
