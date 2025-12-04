import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar'
import 'react-circular-progressbar/dist/styles.css'
import { useGameStore } from '../../store/gameStore'
import { API_BASE_URL, apiService, sessionManager } from '../../services/apiService'
import './LiveVideo.css'

// Dynamically load HLS.js if available (for Firefox and older browsers)
// Uses CDN fallback since npm package may not be installed
// This prevents Vite from trying to resolve the module at build time
const getHls = async (): Promise<any> => {
  if (typeof window === 'undefined') {
    return null
  }

  // Check if Hls is already loaded globally (from CDN or previous load)
  if ((window as any).Hls && typeof (window as any).Hls.isSupported === 'function') {
    return (window as any).Hls
  }

  // Try to load from CDN (works even if npm package isn't installed)
  try {
    return await new Promise((resolve, reject) => {
      // Check again in case it was loaded between checks
      if ((window as any).Hls && typeof (window as any).Hls.isSupported === 'function') {
        resolve((window as any).Hls)
        return
      }

      // Load from CDN
      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest/dist/hls.min.js'
      script.async = true
      script.onload = () => {
        if ((window as any).Hls && typeof (window as any).Hls.isSupported === 'function') {
          resolve((window as any).Hls)
        } else {
          reject(new Error('HLS.js failed to load from CDN'))
        }
      }
      script.onerror = () => {
        reject(new Error('Failed to load HLS.js from CDN'))
      }
      document.head.appendChild(script)
    })
  } catch (cdnError: any) {
    // CDN not available - use native browser support only
    if (import.meta.env.DEV) {
      console.debug('HLS.js not available from CDN - using native browser HLS support only. Install with: npm install hls.js for better performance.')
    }
    return null
  }
}

/**
 * Stream type detection
 */
type StreamType = 'webrtc' | 'hls' | 'flv' | 'mp4' | 'iframe' | 'unknown'

/**
 * WebRTC Signaling Configuration
 * Based on the production site's implementation
 */
const WEBRTC_CONFIG = {
  // WebRTC signaling server base URL
  SIGNALING_BASE_URL: 'https://pulldev.jhf8888.com/tgglive',
  // Stream ID mapping for tables
  // Pattern: CF01 -> 1012, CF02 -> 1022, CF03 -> 1032, etc.
  // Formula: 10X2 where X is the table number
  STREAM_ID_MAP: {
    'CF01': '1012',
    'CF02': '1022', 
    'CF03': '1032',
    'CF04': '1042',
    'CF05': '1052',
  } as Record<string, string>,
  // ICE servers for WebRTC
  ICE_SERVERS: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
}

/**
 * Get stream ID for a table
 * Uses pattern: CF01 -> 1012, CF02 -> 1022, etc.
 */
const getStreamIdForTable = (tableId: string): string | null => {
  // Check predefined map first
  if (WEBRTC_CONFIG.STREAM_ID_MAP[tableId]) {
    return WEBRTC_CONFIG.STREAM_ID_MAP[tableId]
  }
  
  // Try to extract table number and generate stream ID
  // Pattern: CFxx -> 10X2 where X is table number
  const match = tableId.match(/^CF(\d+)$/i)
  if (match) {
    const tableNum = parseInt(match[1], 10)
    return `10${tableNum}2`
  }
  
  return null
}

/**
 * Generate a unique session ID for WebRTC signaling
 */
const generateWebRTCSessionId = (): string => {
  const randomPart = Math.random().toString(16).substring(2, 34)
  const timestamp = Date.now()
  const randomSuffix = Math.random().toString().substring(2, 18)
  return `${randomPart}.${timestamp}.${randomSuffix}`
}

const detectStreamType = (url: string): StreamType => {
  if (!url) return 'unknown'
  const lowerUrl = url.toLowerCase()
  
  // WebRTC patterns
  if (lowerUrl.startsWith('webrtc://') || 
      lowerUrl.startsWith('rtc://') ||
      lowerUrl.includes('/webrtc/') ||
      lowerUrl.includes('/rtc/') ||
      lowerUrl.includes('whep') ||
      lowerUrl.includes('whip') ||
      lowerUrl.includes('_sdp.sdp')) {
    return 'webrtc'
  }
  
  // HLS patterns
  if (lowerUrl.includes('.m3u8')) {
    return 'hls'
  }
  
  // FLV patterns (common for Chinese streaming)
  if (lowerUrl.includes('.flv') || lowerUrl.startsWith('ws://') || lowerUrl.startsWith('wss://')) {
    return 'flv'
  }
  
  // iframe embed (for external players)
  if (lowerUrl.includes('iframe') || lowerUrl.includes('embed') || lowerUrl.includes('player.')) {
    return 'iframe'
  }
  
  // MP4 or other video
  if (lowerUrl.includes('.mp4') || lowerUrl.includes('.webm')) {
    return 'mp4'
  }
  
  return 'unknown'
}

/**
 * Extract all possible video URLs from lobbyinfo response
 */
const extractVideoUrls = (data: any, tableId: string): { url: string; type: StreamType }[] => {
  const urls: { url: string; type: StreamType }[] = []
  
  // Common field names for video URLs
  const videoFields = [
    'video_url', 'videoUrl', 'stream_url', 'streamUrl', 'live_url', 'liveUrl',
    'rtc_url', 'rtcUrl', 'webrtc_url', 'webrtcUrl', 'flv_url', 'flvUrl',
    'hls_url', 'hlsUrl', 'm3u8_url', 'm3u8Url', 'player_url', 'playerUrl',
    'iframe_url', 'iframeUrl', 'embed_url', 'embedUrl'
  ]
  
  // Check root level
  for (const field of videoFields) {
    if (data[field] && typeof data[field] === 'string') {
      const type = detectStreamType(data[field])
      urls.push({ url: data[field], type })
    }
  }
  
  // Check table-specific data
  if (tableId && data[tableId]) {
    const tableData = data[tableId]
    for (const field of videoFields) {
      if (tableData[field] && typeof tableData[field] === 'string') {
        const type = detectStreamType(tableData[field])
        urls.push({ url: tableData[field], type })
      }
    }
    
    // Check nested video object
    if (tableData.video && typeof tableData.video === 'object') {
      for (const field of videoFields) {
        if (tableData.video[field] && typeof tableData.video[field] === 'string') {
          const type = detectStreamType(tableData.video[field])
          urls.push({ url: tableData.video[field], type })
        }
      }
    }
  }
  
  // Check streams array
  if (Array.isArray(data.streams)) {
    for (const stream of data.streams) {
      if (stream.url) {
        const type = detectStreamType(stream.url)
        urls.push({ url: stream.url, type })
      }
    }
  }
  
  return urls
}

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

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '')
const LOBBY_INFO_ENDPOINT = `${trimTrailingSlash(API_BASE_URL)}/lobbyinfo.php`

/**
 * LiveVideo component displays a live video feed with overlay controls and countdown timer
 * 
 * @param props - Component props
 * @returns JSX element
 */
const LiveVideo: React.FC<LiveVideoProps> = ({ 
  videoUrl: propVideoUrl,
  autoPlay = true 
}) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<any>(null) // HLS.js instance
  const pcRef = useRef<RTCPeerConnection | null>(null) // WebRTC peer connection
  const [isPlaying, setIsPlaying] = useState<boolean>(autoPlay)
  const [videoError, setVideoError] = useState<boolean>(false)
  const [liveVideoUrl, setLiveVideoUrl] = useState<string>('')
  const [streamType, setStreamType] = useState<StreamType>('unknown')
  const [iframeUrl, setIframeUrl] = useState<string>('')
  const { countdown, totalBet, tableId, roundId, currentRound, gameHistory } = useGameStore()
  const lastFetchTimeRef = useRef(0)
  const [winMessage, setWinMessage] = useState<{ text: string; type: 'meron' | 'wala' } | null>(null)
  const winMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastShownRoundRef = useRef<number | null>(null)

  /**
   * Cleanup WebRTC peer connection
   */
  const cleanupWebRTC = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
  }, [])

  /**
   * Connect to WebRTC stream using the production signaling protocol
   * Endpoint: https://pulldev.jhf8888.com/tgglive/{streamId}_sdp.sdp
   */
  const connectWebRTC = useCallback(async (streamIdOrUrl: string) => {
    const video = videoRef.current
    if (!video) return

    // Get session ID
    const sessId = sessionManager.getSessionId()
    if (!sessId) {
      console.error('📺 WebRTC: No session ID available')
      setVideoError(true)
      return
    }

    // Determine stream ID - either from parameter or from table mapping
    let streamId = streamIdOrUrl
    if (tableId) {
      const mappedStreamId = getStreamIdForTable(tableId)
      if (mappedStreamId) {
        streamId = mappedStreamId
      }
    }

    // Generate WebRTC session ID
    const webrtcSessionId = generateWebRTCSessionId()
    
    // Build signaling URL
    const signalingUrl = `${WEBRTC_CONFIG.SIGNALING_BASE_URL}/${streamId}_sdp.sdp?sessId=${sessId}&_session_id=${webrtcSessionId}`
    
    // Debug logging only in development
    if (import.meta.env.DEV) {
      console.log('📺 WebRTC connecting:', streamId)
    }
    
    try {
      // Clean up existing connection
      cleanupWebRTC()
      
      // Create peer connection
      const pc = new RTCPeerConnection({
        iceServers: WEBRTC_CONFIG.ICE_SERVERS,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      })
      pcRef.current = pc
      
      // Handle incoming tracks
      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          video.srcObject = event.streams[0]
          video.muted = true
          video.play().catch(() => {
            // Autoplay may be blocked - user can click to play
          })
          setVideoError(false)
          setIsPlaying(true)
        }
      }
      
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          setVideoError(false)
          setIsPlaying(true)
        } else if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
          setVideoError(true)
        }
      }

      pc.onconnectionstatechange = () => {
        // Connection state tracking (silent)
      }
      
      // Add transceiver for receiving video and audio
      pc.addTransceiver('video', { direction: 'recvonly' })
      pc.addTransceiver('audio', { direction: 'recvonly' })
      
      // Create offer
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      
      // Wait for ICE gathering to complete (or timeout)
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') {
          resolve()
        } else {
          const checkState = () => {
            if (pc.iceGatheringState === 'complete') {
              pc.removeEventListener('icegatheringstatechange', checkState)
              resolve()
            }
          }
          pc.addEventListener('icegatheringstatechange', checkState)
          // Timeout after 3 seconds
          setTimeout(resolve, 3000)
        }
      })

      // Prepare the payload matching production site format
      const payload = {
        sessionId: webrtcSessionId,
        version: '1.0-html',
        localSdp: {
          type: pc.localDescription?.type,
          sdp: pc.localDescription?.sdp
        }
      }

      // Send offer to signaling server
      const response = await fetch(signalingUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      })
      
      if (!response.ok) {
        throw new Error(`Signaling request failed: ${response.status}`)
      }
      
      const result = await response.json()
      
      if (result.code !== 200 || !result.remoteSdp) {
        throw new Error(`Signaling error: ${result.message || 'No remote SDP'}`)
      }
      
      // Set remote description
      await pc.setRemoteDescription({
        type: result.remoteSdp.type || 'answer',
        sdp: result.remoteSdp.sdp
      })
      
      setLiveVideoUrl(signalingUrl)
      
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('WebRTC connection failed:', error)
      }
      setVideoError(true)
      cleanupWebRTC()
    }
  }, [cleanupWebRTC, tableId])

  /**
   * Fetches live video URL from API and initializes WebRTC stream
   */
  const fetchVideoUrl = useCallback(async () => {
    if (!tableId) return

    // Throttle API calls - don't fetch more than once every 5 seconds
    const now = Date.now()
    if (now - lastFetchTimeRef.current < 5000) return
    
    lastFetchTimeRef.current = now

    try {
      // Try to get video URL from lobbyinfo first
      if (sessionManager.getSessionId()) {
        try {
          const lobbyInfo = await apiService.getLobbyInfo()
          
          if (lobbyInfo && lobbyInfo.code === 'B100' && lobbyInfo.data) {
            const data = lobbyInfo.data
            
            // Extract all possible video URLs
            const videoUrls = extractVideoUrls(data, tableId)
            
            // If any video URL found, use it
            if (videoUrls.length > 0) {
              // Priority: WebRTC > HLS > FLV > iframe > MP4
              const priorityOrder: StreamType[] = ['webrtc', 'hls', 'flv', 'iframe', 'mp4']
              let selectedUrl: { url: string; type: StreamType } | null = null
              
              for (const priority of priorityOrder) {
                const found = videoUrls.find(v => v.type === priority)
                if (found) {
                  selectedUrl = found
                  break
                }
              }
              
              if (!selectedUrl) {
                selectedUrl = videoUrls[0]
              }
              
              if (selectedUrl) {
                setLiveVideoUrl(selectedUrl.url)
                setStreamType(selectedUrl.type)
                
                if (selectedUrl.type === 'iframe') {
                  setIframeUrl(selectedUrl.url)
                } else {
                  setIframeUrl('')
                }
                
                setVideoError(false)
                return
              }
            }
          }
        } catch {
          // Failed to fetch video URL from lobbyinfo - will try WebRTC
        }
      }

      // No video URL in lobbyinfo - use WebRTC with table mapping
      const streamId = getStreamIdForTable(tableId)
      if (streamId && sessionManager.getSessionId()) {
        setStreamType('webrtc')
        setVideoError(false)
        connectWebRTC(streamId)
        return
      }

      // No stream mapping found
      setVideoError(true)
    } catch {
      setVideoError(true)
    }
  }, [tableId, connectWebRTC])

  /**
   * Sets up periodic video URL fetching
   * Note: Polling frequency reduced when WebSocket is connected (handled by WebSocket)
   */
  useEffect(() => {
    // Initial fetch
    fetchVideoUrl()
    
    // Poll every 30 seconds for video URL updates (reduced frequency)
    // WebSocket will provide instant updates when available
    const interval = setInterval(() => {
      fetchVideoUrl()
    }, 30000)

    return () => {
      clearInterval(interval)
    }
  }, [fetchVideoUrl])

  /**
   * Listens for WebSocket video URL updates
   */
  useEffect(() => {
    const handleVideoUrlUpdate = (event: CustomEvent) => {
      const { video_url } = event.detail
      if (video_url && video_url !== liveVideoUrl) {
        setLiveVideoUrl(video_url)
        setVideoError(false)
      }
    }

    window.addEventListener('video_url_update', handleVideoUrlUpdate as EventListener)

    return () => {
      window.removeEventListener('video_url_update', handleVideoUrlUpdate as EventListener)
    }
  }, [liveVideoUrl])

  /**
   * Gets the video URL to use (priority order):
   * 1. Prop URL (if passed to component)
   * 2. API URL (from backend lobbyinfo)
   * 3. Constructed URL (https://vfile.dk77.bet/<round>.mp4 or /<tableId>/live.m3u8)
   * 4. Local fallback (/videos/example.mp4)
   * 
   * Video sources:
   * - Backend API: Fetched from /lobbyinfo.php (video_url, stream_url, live_url fields)
   * - Constructed: Built from round/table info (https://vfile.dk77.bet/)
   * - Local: public/videos/example.mp4 (fallback for development)
   */
  const videoUrl = useMemo(() => {
    if (propVideoUrl) return propVideoUrl
    if (liveVideoUrl) return liveVideoUrl
    return '/videos/example.mp4' // Fallback to local video
  }, [propVideoUrl, liveVideoUrl])

  /**
   * Handles video error events
   */
  const handleVideoError = useCallback(() => {
    setVideoError(true)
    fetchVideoUrl()
  }, [fetchVideoUrl])

  /**
   * Handles video load success
   */
  const handleVideoLoaded = useCallback(() => {
    setVideoError(false)
    const video = videoRef.current
    if (video) {
      video.muted = true
      video.play().catch(() => {
        // Autoplay might be blocked - user can click to play
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
   * Updates video source when URL changes
   * Supports WebRTC, HLS (native and HLS.js), FLV, and MP4
   * Note: WebRTC is handled separately via connectWebRTC
   */
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    
    // Skip if using iframe
    if (streamType === 'iframe' && iframeUrl) {
      return
    }
    
    // WebRTC is handled by connectWebRTC, don't interfere
    if (streamType === 'webrtc') {
      return
    }
    
    if (!videoUrl) return

    // Clean up previous instances
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
    video.srcObject = null

    if (streamType === 'hls' || videoUrl.includes('.m3u8')) {
      // Check if browser supports native HLS (Safari, newer Chrome/Edge)
      if (video.canPlayType('application/vnd.apple.mpegurl') || 
          video.canPlayType('application/x-mpegURL')) {
        video.src = videoUrl
        video.load()
        
        if (autoPlay) {
          video.play().catch(() => {})
        }
      } else {
        // Try to use HLS.js for browsers without native support
        (async () => {
          try {
            const Hls = await getHls()
            if (Hls && typeof Hls.isSupported === 'function' && Hls.isSupported()) {
              const hls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
                backBufferLength: 90,
                maxBufferLength: 30,
                maxMaxBufferLength: 60,
                startLevel: -1,
              })

              hls.loadSource(videoUrl)
              hls.attachMedia(video)

              hls.on(Hls.Events.MANIFEST_PARSED, () => {
                if (autoPlay) {
                  video.play().catch(() => {})
                }
              })

              hls.on(Hls.Events.ERROR, (_event: any, data: any) => {
                if (data.fatal) {
                  switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                      hls.startLoad()
                      break
                    case Hls.ErrorTypes.MEDIA_ERROR:
                      hls.recoverMediaError()
                      break
                    default:
                      hls.destroy()
                      setVideoError(true)
                      break
                  }
                }
              })

              hlsRef.current = hls
            } else {
              video.src = videoUrl
              video.load()
              if (autoPlay) {
                video.play().catch(() => {})
              }
            }
          } catch (error) {
            video.src = videoUrl
            video.load()
            if (autoPlay) {
              video.play().catch(() => {})
            }
          }
        })()
      }
    } else if (streamType === 'flv') {
      // FLV streams need flv.js library - try direct playback
      video.src = videoUrl
      video.load()
      if (autoPlay) {
        video.play().catch(() => {})
      }
    } else {
      // Regular MP4 or other format
      video.src = videoUrl
      video.load()
      
      if (autoPlay) {
        video.play().catch(() => {})
      }
    }

    // Cleanup function
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [videoUrl, streamType, iframeUrl, autoPlay])

  /**
   * Cleanup WebRTC on unmount
   */
  useEffect(() => {
    return () => {
      cleanupWebRTC()
    }
  }, [cleanupWebRTC])

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

    return () => {
      video.removeEventListener('error', handleVideoError)
      video.removeEventListener('loadeddata', handleVideoLoaded)
      video.removeEventListener('play', handleVideoPlay)
      video.removeEventListener('pause', handleVideoPause)
    }
  }, [handleVideoError, handleVideoLoaded, handleVideoPlay, handleVideoPause])

  /**
   * Toggles video play/pause state
   */
  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    if (isPlaying) {
      video.pause()
    } else {
      video.play().catch(() => {})
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
    } catch {
      // Fullscreen not supported or blocked
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
   */
  const isCountdownVisible = useMemo(() => {
    return countdown !== undefined && countdown >= 0
  }, [countdown])

  /**
   * Builds styles for the circular progress bar
   */
  const progressStyles = useMemo(() => buildStyles({
    // pathColor: '#fff',
    textColor: '#fff',
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

  /**
   * Gets the latest game result and shows win message if meron or wala wins
   * Only shows message for new results (not already displayed)
   */
  useEffect(() => {
    if (gameHistory.length === 0) return

    const latestResult = gameHistory[gameHistory.length - 1]
    
    // Check if this is a new result we haven't shown yet
    const isNewResult = lastShownRoundRef.current === null || 
                        lastShownRoundRef.current !== latestResult.round
    
    // Only show message for meron or wala wins (not draw) and if it's a new result
    if ((latestResult.result === 'meron' || latestResult.result === 'wala') && isNewResult) {
      // Mark this round as shown
      lastShownRoundRef.current = latestResult.round
      
      // Clear any existing timeout
      if (winMessageTimeoutRef.current) {
        clearTimeout(winMessageTimeoutRef.current)
      }

      // Set win message
      setWinMessage({
        text: latestResult.result === 'meron' ? 'Meron Win' : 'Wala Win',
        type: latestResult.result
      })

      // Hide message after 5 seconds
      winMessageTimeoutRef.current = setTimeout(() => {
        setWinMessage(null)
        winMessageTimeoutRef.current = null
      }, 5000)
    }

    return () => {
      if (winMessageTimeoutRef.current) {
        clearTimeout(winMessageTimeoutRef.current)
      }
    }
  }, [gameHistory])

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

      {/* API Info Badge */}
      <div className="video-overlay-api" aria-live="polite">
        <div className="api-url-badge">
          <span className="api-url-label">Backend API</span>
          <span className="api-url-value" title={LOBBY_INFO_ENDPOINT}>
            {LOBBY_INFO_ENDPOINT}
          </span>
          <span className="api-stream-type">
            Type: {streamType || 'detecting...'}
          </span>
          <span
            className="api-stream-value"
            title={liveVideoUrl || iframeUrl || 'Stream URL loading...'}
          >
            {liveVideoUrl || iframeUrl ? `Stream: ${liveVideoUrl || iframeUrl}` : 'Waiting for stream URL from API...'}
          </span>
        </div>
      </div>

      {/* Countdown Badge */}
      {isCountdownVisible && (
        <div className={`countdown-badge ${countdownState}`} role="timer" aria-live="polite" aria-label={`Countdown: ${countdown}`}>
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

      {/* Win Message Overlay */}
      {winMessage && (
        <div className={`win-message-overlay ${winMessage.type}`}>
          <div className="win-message-content">
            <div className="win-message-text">{winMessage.text}</div>
          </div>
        </div>
      )}
      
      <div className="video-wrapper">
        {/* Iframe embed for external players */}
        {streamType === 'iframe' && iframeUrl && (
          <iframe
            className="live-video-iframe"
            src={iframeUrl}
            allow="autoplay; fullscreen; encrypted-media"
            allowFullScreen
            style={{ 
              width: '100%', 
              height: '100%', 
              border: 'none',
              position: 'absolute',
              top: 0,
              left: 0,
              zIndex: 1
            }}
          />
        )}
        
        {/* HTML5 Video element for direct playback */}
        {streamType !== 'iframe' && (
          <video
            ref={videoRef}
            className="live-video"
            playsInline
            muted={true}
            autoPlay={autoPlay}
            controls={false}
            preload="auto"
            loop={false}
            onError={handleVideoError}
            onLoadedData={handleVideoLoaded}
            style={{ display: videoError ? 'none' : 'block' }}
          >
            {videoUrl && streamType !== 'webrtc' && (
              <source src={videoUrl} type={videoUrl.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4'} />
            )}
          </video>
        )}
        
        {videoError && streamType !== 'iframe' && (
          <div className="video-placeholder">
            <div className="placeholder-content">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="4" width="20" height="16" rx="2"/>
                <path d="M10 8l6 4-6 4V8z"/>
              </svg>
              <p>Video not available</p>
              <p className="placeholder-hint">Stream type: {streamType || 'unknown'}</p>
              <p className="placeholder-hint">Check console for API response</p>
            </div>
          </div>
        )}
        {!videoError && streamType !== 'iframe' && (
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
