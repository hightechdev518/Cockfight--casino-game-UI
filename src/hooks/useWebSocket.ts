import { useEffect, useRef } from 'react'
import { useGameStore, GameHistory } from '../store/gameStore'
import { sessionManager } from '../services/apiService'

// Production WebSocket URLs - try multiple ports
const WS_URLS = [
  'wss://wss.ho8.net:2087/',
  'wss://wss.ho8.net:2096/',
]

// Get WebSocket URL from env or use production default
const getWsUrl = (): string => {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL
  }
  return WS_URLS[0]
}

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
          
          // Handle production server format (lobby data updates)
          // Format: { ts: "2025-12-04T08:40:51.241Z", data?: [...], ... }
          if (data.ts && !data.type) {
            // Emit event for components to handle
            window.dispatchEvent(new CustomEvent('lobby_update', {
              detail: data
            }))
            
            // If data array exists (table round info)
            if (Array.isArray(data.data)) {
              data.data.forEach((tableData: any) => {
                if (tableData.tableid && tableData.trid) {
                  updateGameStatus({
                    tableId: tableData.tableid,
                    roundId: tableData.trid?.toString(),
                    currentRound: parseInt(tableData.r_info?.cf_roundno || '0', 10),
                    countdown: tableData.countdown,
                    isLive: tableData.enable && tableData.tablestatus === 1
                  })
                }
              })
            }
            return
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
              updateGameStatus(data.payload)
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
