import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar'
import 'react-circular-progressbar/dist/styles.css'
import { useGameStore } from '../../store/gameStore'
import BettingHistoryModal from '../BettingHistory/BettingHistoryModal'
import SettingsModal from '../Settings/SettingsModal'
import VePlayerComponent from '../VePlayerComponent/VePlayerComponent'
import { useI18n } from '../../i18n/LanguageContext'
import './LiveVideo.css'

// Silence all console output in src/ (requested cleanup)
const console: Pick<Console, 'log' | 'warn' | 'error' | 'debug'> = {
  log: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

/**
 * LiveVideo component now uses VePlayer exclusively for video streaming
 * All video streaming is handled by VePlayer with RTM, FLV, and HLS fallback
 */


/**
 * Props for the LiveVideo component
 */
interface LiveVideoProps {
  /** URL of the video to display */
  videoUrl?: string
  /** Whether the video should autoplay */
  autoPlay?: boolean
}

/**
 * Constants for the countdown progress bar
 */
const COUNTDOWN_CONFIG = {
  MAX_VALUE: 20, // Betting countdown starts at 20 seconds
  PROGRESS_COLOR: '#00ff88',
  TRAIL_COLOR: 'rgba(0, 0, 0, 0.3)',
  TEXT_SIZE: '3.5rem',
  STROKE_WIDTH: 8,
} as const

/**
 * LiveVideo component displays a live video feed with overlay controls and countdown timer
 * 
 * @param props - Component props
 * @returns JSX element
 */
const LiveVideo: React.FC<LiveVideoProps> = () => {
  const { countdown, tableId: storeTableId, roundStatus, accountBalance, isLive } = useGameStore()
  const { t } = useI18n()
  const [stopBetCountdown, setStopBetCountdown] = useState<number | null>(null)
  const stopBetTimerRef = useRef<number | null>(null)
  const prevRoundStatusRef = useRef<number | undefined>(undefined)
  // Use tableId from store
  const tableId = storeTableId
  const [winMessage, setWinMessage] = useState<{ text: string; type: 'meron' | 'wala' | 'draw'; winAmount?: number; status?: 'WIN' | 'LOSE' | 'DRAW' } | null>(null)
  const winMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const balanceBeforeSettlementRef = useRef<number | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false)
  const controlsRowRef = useRef<HTMLDivElement | null>(null)
  const [isMuted, setIsMuted] = useState<boolean>(true) // Start muted by default
  const [isBettingHistoryOpen, setIsBettingHistoryOpen] = useState<boolean>(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false)

  /**
   * Toggle mute/unmute for video
   */
  const toggleMute = useCallback(() => {
    setIsMuted(prev => !prev)
    // Note: VePlayer handles its own audio, this is just for UI state
    // If you need to control VePlayer audio, you'll need to access the player instance
  }, [])

  /**
   * Handle fullscreen toggle
   */
  const handleFullscreen = useCallback(() => {
    const container = document.querySelector('.live-video-container') as HTMLElement
    if (!container) return

    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(err => {
        console.log('Error attempting to enable fullscreen:', err)
      })
    } else {
      document.exitFullscreen().catch(err => {
        console.log('Error attempting to exit fullscreen:', err)
      })
    }
  }, [])

  /**
   * Closes menu when clicking outside
   */
  useEffect(() => {
    if (!isMenuOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        controlsRowRef.current &&
        !controlsRowRef.current.contains(target)
      ) {
        setIsMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isMenuOpen])


  /**
   * Calculates progress percentage for countdown
   */
  const progressPercentage = useMemo(() => {
    if (countdown === undefined || countdown <= 0) return 0
    return (countdown / COUNTDOWN_CONFIG.MAX_VALUE) * 100
  }, [countdown])

  /**
   * Determines the countdown state color based on remaining time
   */
  const countdownState = useMemo(() => {
    if (countdown === undefined || countdown < 0) return 'hidden'
    if (countdown > 15) return 'green'
    if (countdown > 5) return 'yellow'
    return 'red'
  }, [countdown])

  /**
   * Determines if countdown badge should be visible
   * Timer only shows when countdown > 0 AND roundStatus === 1 (betting period)
   * Timer disappears when countdown reaches 0 or when fighting starts (roundStatus === 2)
   */
  const isCountdownVisible = useMemo(() => {
    return countdown !== undefined && countdown > 0 && roundStatus === 1
  }, [countdown, roundStatus])
  
  /**
   * Countdown timer interval - decrements countdown every second
   * Only runs when countdown > 0 AND roundStatus === 1 (betting period)
   * Timer stops when roundStatus === 2 (fighting)
   */
  useEffect(() => {
    const { roundStatus: currentRoundStatus } = useGameStore.getState()
    
    // Timer only counts down during betting period (roundStatus === 1)
    // When fighting (roundStatus === 2), timer stops
    if (countdown === undefined || countdown <= 0 || currentRoundStatus !== 1) {
      // Clear countdown when it reaches 0, is undefined, or fighting starts
      if (countdown === 0) {
        const { updateGameStatus } = useGameStore.getState()
        // Don't set roundStatus here - let WebSocket be the source of truth
        // WebSocket will send roundstatus: 2 when betting actually closes
        updateGameStatus({
          countdown: undefined // Hide timer only
        })
        if (import.meta.env.DEV) {
          console.log('⏰ Countdown finished, hiding timer. WebSocket will update roundStatus.')
        }
      }
      return
    }
    
    // Decrement countdown every second, but only during betting period
    const interval = setInterval(() => {
      const { countdown: currentCountdown, roundStatus: storeRoundStatus, updateGameStatus } = useGameStore.getState()
      
      // Stop counting if fighting started (roundStatus !== 1)
      if (storeRoundStatus !== 1) {
        if (import.meta.env.DEV) {
          console.log('⏰ Timer stopped - fighting started (roundStatus !== 1)')
        }
        return
      }
      
      if (currentCountdown !== undefined && currentCountdown > 0) {
        const newCountdown = currentCountdown - 1
        updateGameStatus({ countdown: newCountdown })
        
        if (newCountdown === 0) {
          // Countdown finished - hide timer
          // Don't set roundStatus here - let WebSocket be the source of truth
          // WebSocket will send roundstatus: 2 when betting actually closes
          updateGameStatus({
            countdown: undefined // Hide timer only
          })
          if (import.meta.env.DEV) {
            console.log('⏰ Countdown finished, hiding timer. WebSocket will update roundStatus.')
          }
        }
      }
    }, 1000)
    
    return () => clearInterval(interval)
  }, [countdown])

  /**
   * Clear countdown when fighting starts (roundStatus === 2)
   * This ensures timer is hidden immediately when fighting begins
   * Also start the stopBet countdown (3->2->1->0) when betting stops
   */
  useEffect(() => {
    const previousRoundStatus = prevRoundStatusRef.current
    
    // Detect when betting stops (roundStatus changes from 1 to 2)
    if (roundStatus === 2 && previousRoundStatus === 1) {
      // Clear betting countdown
      if (countdown !== undefined) {
        const { updateGameStatus } = useGameStore.getState()
        updateGameStatus({ countdown: undefined })
        if (import.meta.env.DEV) {
          console.log('⛔ Fighting started (roundStatus === 2), clearing countdown timer from LiveVideo')
        }
      }
      
      // Start stopBet countdown (3->2->1->0)
      setStopBetCountdown(3)
      if (import.meta.env.DEV) {
        console.log('⏱️ Betting stopped, starting stopBet countdown: 3')
      }
    }
    
    // Capture balance before settlement (when roundStatus becomes 4)
    if (roundStatus === 4 && previousRoundStatus !== 4) {
      balanceBeforeSettlementRef.current = accountBalance
      if (import.meta.env.DEV) {
        console.log('💰 Captured balance before settlement:', accountBalance, 'roundStatus:', roundStatus)
      }
    }
    
    // Update previous roundStatus
    prevRoundStatusRef.current = roundStatus
  }, [roundStatus, countdown, accountBalance])

  /**
   * Handle stopBet countdown (3->2->1->0)
   * Runs when betting stops (roundStatus === 2)
   */
  useEffect(() => {
    if (stopBetCountdown === null || stopBetCountdown < 0) {
      // Clear any existing timer
      if (stopBetTimerRef.current) {
        clearInterval(stopBetTimerRef.current)
        stopBetTimerRef.current = null
      }
      return
    }

    // If countdown reaches 0, clear it
    if (stopBetCountdown === 0) {
      if (import.meta.env.DEV) {
        console.log('⏱️ StopBet countdown finished')
      }
      // Clear after a brief moment to show "0"
      const timeout = setTimeout(() => {
        setStopBetCountdown(null)
      }, 500)
      return () => clearTimeout(timeout)
    }

    // Start countdown timer
    stopBetTimerRef.current = window.setInterval(() => {
      setStopBetCountdown((prev) => {
        if (prev === null || prev <= 0) {
          return null
        }
        const next = prev - 1
        if (import.meta.env.DEV && next >= 0) {
          console.log('⏱️ StopBet countdown:', next)
        }
        return next
      })
    }, 1000) as unknown as number

    return () => {
      if (stopBetTimerRef.current) {
        clearInterval(stopBetTimerRef.current)
        stopBetTimerRef.current = null
      }
    }
  }, [stopBetCountdown])

  /**
   * Builds styles for the circular progress bar
   * Text color is set via CSS to match the path color (green/yellow/red)
   */
  const progressStyles = useMemo(() => buildStyles({
    // pathColor: set via CSS based on countdownState
    // textColor: set via CSS to match path color
    trailColor: COUNTDOWN_CONFIG.TRAIL_COLOR,
    textSize: COUNTDOWN_CONFIG.TEXT_SIZE,
    pathTransition: 'stroke-dashoffset 0.5s linear',
  }), [])

  /**
   * Listen for NEW game results from server (via WebSocket)
   * Only shows win message when server sends a new result, NOT on page refresh
   * This ensures win message only displays for real-time results from server
   */
  // Track shown rounds to prevent duplicate popups
  const shownRoundsRef = useRef<Record<string, boolean>>({})

  useEffect(() => {
    const handleSettlement = (event: CustomEvent) => {
      if (import.meta.env.DEV) {
        console.log('📨 LiveVideo: Received round_settled event:', event.detail)
      }
      
      const { roundId, result: r_drawresult, win } = event.detail
      
      if (!r_drawresult || roundId === undefined) {
        if (import.meta.env.DEV) {
          console.warn('⚠️ LiveVideo: Settlement event missing required fields:', event.detail)
        }
        return
      }

      // Prevent duplicate popups for the same round
      if (shownRoundsRef.current[roundId]) {
        if (import.meta.env.DEV) {
          console.log('ℹ️ LiveVideo: Settlement already shown for round:', roundId)
        }
        return
      }
      shownRoundsRef.current[roundId] = true

      // Clear any existing timeout
      if (winMessageTimeoutRef.current) {
        clearTimeout(winMessageTimeoutRef.current)
      }

      // Map r_drawresult ("M", "W", "D") to our format ("meron", "wala", "draw")
      let resultType: 'meron' | 'wala' | 'draw' = 'meron'
      let resultText = ''
      
      const drawresultUpper = String(r_drawresult).toUpperCase().trim()
      if (drawresultUpper === 'M' || drawresultUpper === 'MERON') {
        resultType = 'meron'
        resultText = t('bet.result.meronWin')
      } else if (drawresultUpper === 'W' || drawresultUpper === 'WALA') {
        resultType = 'wala'
        resultText = t('bet.result.walaWin')
      } else if (drawresultUpper === 'D' || drawresultUpper === 'DRAW') {
        resultType = 'draw'
        resultText = t('bet.result.draw')
      } else {
        if (import.meta.env.DEV) {
          console.warn('⚠️ LiveVideo: Unknown result type:', r_drawresult)
        }
        return
      }

      // Parse win amount (can be string or number)
      const winAmount = typeof win === 'string' ? parseFloat(win) : (typeof win === 'number' ? win : 0)

      // Determine status based on win amount
      let status: 'WIN' | 'LOSE' | 'DRAW' = 'LOSE'
      let displayAmount = 0

      if (winAmount > 0) {
        // WIN - User won money
        status = 'WIN'
        displayAmount = winAmount
      } else if (winAmount === 0 && resultType === 'draw') {
        // DRAW - Bet returned (usually when Draw wins)
        status = 'DRAW'
        displayAmount = 0
      } else {
        // LOSE - User lost bet
        status = 'LOSE'
        displayAmount = -Math.abs(winAmount) // Negative for loss
      }

      // Set win message immediately
      setWinMessage({
        text: resultText,
        type: resultType,
        winAmount: displayAmount,
        status: status
      })

      if (import.meta.env.DEV) {
        console.log('🎉 LiveVideo: Showing settlement message:', {
          roundId,
          result: r_drawresult,
          resultType,
          winAmount,
          status,
          displayAmount
        })
      }

      // Hide message after 5 seconds
      winMessageTimeoutRef.current = setTimeout(() => {
        setWinMessage(null)
        winMessageTimeoutRef.current = null
      }, 5000)
    }

    // Listen for settlement events from WebSocket
    if (import.meta.env.DEV) {
      console.log('👂 LiveVideo: Setting up event listener for round_settled')
    }
    window.addEventListener('round_settled', handleSettlement as EventListener)

    return () => {
      if (import.meta.env.DEV) {
        console.log('🧹 LiveVideo: Cleaning up event listener for round_settled')
      }
      window.removeEventListener('round_settled', handleSettlement as EventListener)
      if (winMessageTimeoutRef.current) {
        clearTimeout(winMessageTimeoutRef.current)
      }
    }
  }, [])

  return (
    <div className="live-video-container">
      {/* Top Left: Close Button */}
      <div className="video-overlay-top-left">
        <button 
          className="close-button"
          onClick={() => window.history.back()}
          aria-label="Close"
          title="Close"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Left Side: Table Info */}
  

      {/* Top Right: Controls */}
      <div className="video-overlay-top-right">
        <div className="video-controls-overlay">
          <div ref={controlsRowRef} className="video-controls-row">
            {/* Control Buttons - Show when menu is open */}
            {isMenuOpen && (
              <>
                <button 
                  className="control-icon" 
                  aria-label={isMuted ? 'Unmute' : 'Mute'} 
                  title={isMuted ? 'Unmute' : 'Mute'}
                  onClick={toggleMute}
                >
                  {isMuted ? (
                    // Muted icon (speaker with X)
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                      <line x1="23" y1="9" x2="17" y2="15"/>
                      <line x1="17" y1="9" x2="23" y2="15"/>
                    </svg>
                  ) : (
                    // Unmuted icon (speaker with sound waves)
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
                    </svg>
                  )}
                </button>
                <button 
                  className="control-icon" 
                  aria-label="Documents" 
                  title="Betting History"
                  onClick={() => setIsBettingHistoryOpen(true)}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
                  </svg>
                </button>
                <button 
                  className="control-icon" 
                  aria-label="Settings" 
                  title="Settings"
                  onClick={() => {
                    setIsSettingsOpen(true)
                    setIsMenuOpen(false)
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.06a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09c0 .69.4 1.3 1 1.58.36.17.78.18 1.16.03.39-.16.84-.07 1.15.24l.06.06a2 2 0 1 1 2.83 2.83l-.06.06c-.31.31-.4.76-.24 1.15.15.38.14.8-.03 1.16-.28.6-.89 1-1.58 1H21a2 2 0 1 1 0 4h-.09c-.69 0-1.3.4-1.51 1Z" />
                  </svg>
                </button>
                <button 
                  className="control-icon" 
                  aria-label="Fullscreen" 
                  title="Fullscreen" 
                  onClick={handleFullscreen}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                  </svg>
                </button>
              </>
            )}
            
            {/* Menu Button - Always visible */}
            <button 
              className="control-icon menu-button" 
              aria-label="Menu" 
              title="Menu"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
      </div>


      {/* Countdown Badge - Betting Period - HIDDEN */}
      {false && isCountdownVisible && (
        <div className={`countdown-badge ${countdownState}`} role="timer" aria-live="polite" aria-label={`Countdown: ${countdown}`}>
          <CircularProgressbar
            value={progressPercentage}
            text={`${countdown}`}
            strokeWidth={COUNTDOWN_CONFIG.STROKE_WIDTH}
            styles={progressStyles}
          />
        </div>
      )}

      {/* StopBet Countdown Badge - Shows 3->2->1->0 when betting stops */}
      {stopBetCountdown !== null && stopBetCountdown >= 0 && (
        <div className="countdown-badge stopbet-countdown red" role="timer" aria-live="polite" aria-label={`StopBet Countdown: ${stopBetCountdown}`}>
          <CircularProgressbar
            value={((4 - stopBetCountdown) / 4) * 100}
            text={`${stopBetCountdown}`}
            strokeWidth={COUNTDOWN_CONFIG.STROKE_WIDTH}
            styles={progressStyles}
          />
        </div>
      )}


      {/* Win Message Overlay */}
      {winMessage && (
        <div className={`win-message-overlay ${winMessage.type}`}>
          <div className="win-message-content">
            <div className="win-message-text">{winMessage.text}</div>
            {winMessage.status && (
              <div className={`win-message-amount ${winMessage.status.toLowerCase()}`}>
                {winMessage.status === 'WIN' && winMessage.winAmount !== undefined && winMessage.winAmount > 0 && (
                  <>{t('bet.result.youWon')} +{winMessage.winAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>
                )}
                {winMessage.status === 'LOSE' && winMessage.winAmount !== undefined && winMessage.winAmount < 0 && (
                  <>{t('bet.result.youLost')} -{Math.abs(winMessage.winAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>
                )}
                {winMessage.status === 'DRAW' && (
                  <>{t('bet.result.drawReturned')}</>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      
      <div className="video-wrapper">
        {/* Show waiting image ONLY when table is in maintenance (isLive === false) */}
        {/* When table is live (including fighting), always show video player (even if still loading) */}
        {isLive === false && (
          <div className="video-maintenance-overlay">
            <img 
              src="./waiting.png" 
              alt="Waiting for live video" 
              className="waiting-image"
            />
          </div>
        )}
        
        {/* VePlayer Component - Show when table is live */}
        {/* Video player will show loading spinner if still connecting, but no poster overlay */}
        {/* When fighting (roundStatus === 2), isLive should be true, so video will show */}
        {isLive !== false && (
          <VePlayerComponent 
            tableId={tableId}
            enabled={true}
            containerId={`veplayer-container-${tableId || 'default'}`}
          />
        )}
      </div>

      {/* Betting History Modal */}
      <BettingHistoryModal 
        isOpen={isBettingHistoryOpen}
        onClose={() => setIsBettingHistoryOpen(false)}
      />

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  )
}

export default LiveVideo
