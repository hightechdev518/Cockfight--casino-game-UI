import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar'
import 'react-circular-progressbar/dist/styles.css'
import { useGameStore } from '../../store/gameStore'
import './LiveVideo.css'

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
  MAX_VALUE: 16,
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
const LiveVideo: React.FC<LiveVideoProps> = ({ 
  videoUrl = '/videos/example.mp4',
  autoPlay = true 
}) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState<boolean>(autoPlay)
  const [videoError, setVideoError] = useState<boolean>(false)
  const { countdown, totalBet } = useGameStore()

  /**
   * Handles video error events
   */
  const handleVideoError = useCallback(() => {
    setVideoError(true)
    // Only warn once in dev mode
    if (import.meta.env.DEV && !videoError) {
      console.info('Video file not found. Add a video to public/videos/live-casino.mp4 or use the test video generator.')
    }
  }, [videoError])

  /**
   * Handles video load success
   */
  const handleVideoLoaded = useCallback(() => {
    setVideoError(false)
    const video = videoRef.current
    if (video) {
      // Ensure video is muted for autoplay (browser requirement)
      video.muted = true
      // Try to play immediately
      video.play().catch((error: Error) => {
        // Autoplay might be blocked, but video will still be ready
        if (import.meta.env.DEV) {
          console.info('Video autoplay:', error.message)
        }
      })
    }
  }, [])

  /**
   * Handles video play events
   */
  const handleVideoPlay = useCallback(() => {
    setIsPlaying(true)
  }, [])

  /**
   * Handles video pause events
   */
  const handleVideoPause = useCallback(() => {
    setIsPlaying(false)
  }, [])

  /**
   * Sets up video event listeners and autoplay
   */
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    video.addEventListener('error', handleVideoError)
    video.addEventListener('loadeddata', handleVideoLoaded)
    video.addEventListener('play', handleVideoPlay)
    video.addEventListener('pause', handleVideoPause)

    // Try to load the video
    video.load()

    return () => {
      video.removeEventListener('error', handleVideoError)
      video.removeEventListener('loadeddata', handleVideoLoaded)
      video.removeEventListener('play', handleVideoPlay)
      video.removeEventListener('pause', handleVideoPause)
    }
  }, [autoPlay, handleVideoError, handleVideoLoaded, handleVideoPlay, handleVideoPause])

  /**
   * Toggles video play/pause state
   */
  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    if (isPlaying) {
      video.pause()
    } else {
      video.play().catch((error: Error) => {
        console.error('Failed to play video:', error)
      })
    }
  }, [isPlaying])

  /**
   * Handles fullscreen toggle
   */
  const handleFullscreen = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    try {
      if (document.fullscreenElement) {
        document.exitFullscreen()
      } else {
        video.requestFullscreen()
      }
    } catch (error: unknown) {
      console.error('Fullscreen toggle failed:', error)
    }
  }, [])

  /**
   * Calculates progress percentage for countdown
   */
  const progressPercentage = useMemo(() => {
    if (countdown === undefined) return 0
    return (countdown / COUNTDOWN_CONFIG.MAX_VALUE) * 100
  }, [countdown])

  /**
   * Builds styles for the circular progress bar
   */
  const progressStyles = useMemo(() => buildStyles({
    pathColor: COUNTDOWN_CONFIG.PROGRESS_COLOR,
    textColor: COUNTDOWN_CONFIG.PROGRESS_COLOR,
    trailColor: COUNTDOWN_CONFIG.TRAIL_COLOR,
    textSize: COUNTDOWN_CONFIG.TEXT_SIZE,
    pathTransition: 'stroke-dashoffset 0.5s linear',
  }), [])

  /**
   * Formats the current date and time
   */
  const formattedTime = useMemo(() => {
    return new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'Asia/Shanghai'
    })
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
          <div className="video-controls-row">
            <button className="control-icon" aria-label="Chat" title="Chat">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                <circle cx="9" cy="10" r="1" fill="currentColor"/>
                <circle cx="15" cy="10" r="1" fill="currentColor"/>
                <circle cx="12" cy="10" r="1" fill="currentColor"/>
              </svg>
            </button>
            <button className="control-icon" aria-label="Video" title="Video Settings">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="5" width="20" height="14" rx="2" ry="2"/>
                <path d="M2 8h20M2 12h20M2 16h20"/>
              </svg>
            </button>
            <button className="control-icon" aria-label="Sound" title="Sound">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
              </svg>
            </button>
            <button className="control-icon" aria-label="Settings" title="Settings">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v6m0 6v6m9-9h-6m-6 0H3m15.364 6.364l-4.243-4.243m-4.242 0L5.636 18.364m12.728-12.728l-4.243 4.243m-4.242 0L5.636 5.636"/>
              </svg>
            </button>
            <button className="control-icon" aria-label="Documents" title="Documents">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
              </svg>
            </button>
            <button className="control-icon" aria-label="Help" title="Help">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
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
          </div>
          <div className="video-time">{formattedTime} (UTC+8)</div>
        </div>
      </div>

      {/* Countdown Badge */}
      {countdown !== undefined && (
        <div className="countdown-badge" role="timer" aria-live="polite" aria-label={`Countdown: ${countdown}`}>
          <CircularProgressbar
            value={progressPercentage}
            text={`${countdown}`}
            strokeWidth={COUNTDOWN_CONFIG.STROKE_WIDTH}
            styles={progressStyles}
          />
        </div>
      )}

      {/* Total Bet Display */}
      <div className="total-bet-display">
        <span>Total bet <span className="total-bet-display-value">${totalBet.toFixed(2)}</span></span>
      </div>
      
      <div className="video-wrapper">
            <video
              ref={videoRef}
              className="live-video"
              src={videoUrl}
              playsInline
              muted={true}
              autoPlay={true}
              controls={false}
              preload="auto"
              loop={true}
              onError={handleVideoError}
              onLoadedData={handleVideoLoaded}
              style={{ display: videoError ? 'none' : 'block' }}
            />
        {videoError && (
          <div className="video-placeholder">
            <div className="placeholder-content">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="4" width="20" height="16" rx="2"/>
                <path d="M10 8l6 4-6 4V8z"/>
              </svg>
              <p>Video not available</p>
              <p className="placeholder-hint">Add video to: public/videos/live-casino.mp4</p>
            </div>
          </div>
        )}
        {!videoError && (
          <div className={`video-overlay-center ${isPlaying ? 'playing' : ''}`}>
            <button 
              className="play-button"
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                </svg>
              ) : (
                <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default LiveVideo
