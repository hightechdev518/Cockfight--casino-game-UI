import { useEffect, useState } from 'react'
import { useGameStore } from './store/gameStore'
import LiveVideo from './components/LiveVideo/LiveVideo'
import BettingInterface from './components/BettingInterface/BettingInterface'
import GameHistory from './components/GameHistory/GameHistory'
import GameSummary from './components/GameHistory/GameSummary'
import { useWebSocket } from './hooks/useWebSocket'
import { apiService } from './services/apiService'
import './App.css'

function App() {
  const { initializeGame, showGameSummary, setGameSummary } = useGameStore()
  const { connect, disconnect } = useWebSocket()
  const [scoreboardVisible, setScoreboardVisible] = useState(false)

  useEffect(() => {
    // Initialize with default data
    try {
      initializeGame({
        gameId: 'CBXE08251119097',
        tableId: 'E08',
        isLive: true,
        accountBalance: 101000.00,
        currentRound: 40,
        countdown: 10
      })
    } catch (error) {
      console.error('Error initializing game:', error)
    }

    // Try to fetch real data (non-blocking)
    const init = async () => {
      try {
        const gameData = await apiService.getGameStatus()
        if (gameData) {
          initializeGame(gameData)
        }
      } catch (error) {
        // API not available, using demo data
      }
    }

    init().catch(() => {})
    
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
