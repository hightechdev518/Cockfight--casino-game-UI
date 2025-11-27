import { useEffect, useRef } from 'react'
import { useGameStore, GameHistory } from '../store/gameStore'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws'

export const useWebSocket = () => {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const { updateGameStatus, setConnectionStatus, addGameHistory, setAccountBalance } = useGameStore()

  const connect = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    // Don't try to connect if WebSocket is not available
    if (typeof WebSocket === 'undefined') {
      return
    }

    // Limit reconnection attempts to prevent spam
    if (reconnectAttemptsRef.current > 3) {
      return
    }

    try {
      reconnectAttemptsRef.current++
      setConnectionStatus('connecting')
      const ws = new WebSocket(WS_URL)

      ws.onopen = () => {
        // Reset reconnection attempts on successful connection
        reconnectAttemptsRef.current = 0
        // Only log when actually connected (server is available)
        if (import.meta.env.DEV) {
          console.log('WebSocket connected')
        }
        setConnectionStatus('connected')
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          
          // Handle different message types
          switch (data.type) {
            case 'game_result':
              if (data.payload) {
                const history: GameHistory = {
                  round: data.payload.round || 0,
                  result: data.payload.result,
                  dragonCard: data.payload.dragonCard,
                  tigerCard: data.payload.tigerCard
                }
                addGameHistory(history)
              }
              break
            case 'game_status':
              updateGameStatus(data.payload)
              break
            case 'bet_confirmation':
              // Update account balance after bet confirmation
              if (data.payload?.balance !== undefined) {
                setAccountBalance(data.payload.balance)
              }
              break
            case 'account_update':
              if (data.payload?.balance !== undefined) {
                setAccountBalance(data.payload.balance)
              }
              break
            default:
              // Unknown message type - ignore silently
              break
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error)
        }
      }

      ws.onerror = () => {
        // Silently handle errors - server may not be running (expected in dev)
        setConnectionStatus('disconnected')
      }

      ws.onclose = () => {
        // Silently handle disconnection - server may not be running (expected in dev)
        setConnectionStatus('disconnected')
        
        // Only attempt reconnection if we had a successful connection before
        // This prevents spam when server isn't running
        if (reconnectAttemptsRef.current <= 3) {
          reconnectTimeoutRef.current = setTimeout(() => {
            if (wsRef.current?.readyState !== WebSocket.OPEN) {
              connect()
            }
          }, 5000) // Wait 5 seconds before reconnecting
        }
      }

      wsRef.current = ws
    } catch (error) {
      // Silently handle connection errors - server may not be running (expected in dev)
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
