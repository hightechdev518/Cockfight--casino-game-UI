import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar'
import 'react-circular-progressbar/dist/styles.css'
import { useGameStore } from '../../store/gameStore'
import { apiService, sessionManager } from '../../services/apiService'
import flvjs from 'flv.js'
import BettingHistoryModal from '../BettingHistory/BettingHistoryModal'
import SettingsModal from '../Settings/SettingsModal'
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
  // Pattern: CF01 -> 1012, CF02 -> 1021, CF03 -> 1031, etc.
  // Based on user specification: CF01=1012, CF02=1021, CF03=1031, CF04=1041, CF05=1051, CF06=1061, CF07=1071
  STREAM_ID_MAP: {
    'CF01': '1012',
    'CF02': '1021',
    'CF03': '1031',
    'CF04': '1041',
    'CF05': '1051',
    'CF06': '1061',
    'CF07': '1071',
  } as Record<string, string>,
  // ICE servers for WebRTC
  ICE_SERVERS: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
}

/**
 * Get stream ID for a table
 * Uses pattern: CF01 -> 1012, CF02 -> 1021, CF03 -> 1031, etc.
 */
const getStreamIdForTable = (tableId: string): string | null => {
  // Check predefined map first (most reliable)
  if (WEBRTC_CONFIG.STREAM_ID_MAP[tableId]) {
    return WEBRTC_CONFIG.STREAM_ID_MAP[tableId]
  }
  
  // Fallback: Try to extract table number and generate stream ID
  // Pattern: CF01 -> 1012, CF02 -> 1021, CF03 -> 1031, etc.
  // Formula: CF0X -> 10X1 (for X >= 2), CF01 -> 1012 (special case)
  const match = tableId.match(/^CF0?(\d+)$/i)
  if (match) {
    const tableNum = parseInt(match[1], 10)
    if (tableNum === 1) {
      return '1012' // Special case: CF01 = 1012
    } else if (tableNum >= 2 && tableNum <= 7) {
      return `10${tableNum}1` // CF02=1021, CF03=1031, etc.
    }
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
  // Note: WebSocket URLs might be FLV over WebSocket, but we'll handle them separately
  if (lowerUrl.includes('.flv')) {
    return 'flv'
  }
  
  // WebSocket URLs for FLV streaming
  if (lowerUrl.startsWith('ws://') || lowerUrl.startsWith('wss://')) {
    return 'flv' // Treat WebSocket as FLV stream
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
    'iframe_url', 'iframeUrl', 'embed_url', 'embedUrl', 'url', 'src'
  ]
  
  // Debug logging in development
  if (import.meta.env.DEV) {
    console.log('📺 Extracting video URLs from API response:', { data, tableId, isArray: Array.isArray(data) })
  }
  
  // Check if data is an array (original site format: array of table objects)
  if (Array.isArray(data)) {
    // Search for matching table in array
    for (const item of data) {
      const itemTableId = item.tableid || item.tableId || item.t_id
      if (itemTableId === tableId || itemTableId === tableId.toUpperCase() || itemTableId === tableId.toLowerCase()) {
        // Found matching table - check for video URLs in this item
        for (const field of videoFields) {
          if (item[field] && typeof item[field] === 'string') {
            const type = detectStreamType(item[field])
            urls.push({ url: item[field], type })
            if (import.meta.env.DEV) {
              console.log(`📺 Found video URL in array item: ${field} = ${item[field]} (type: ${type})`)
            }
          }
        }
        
        // Check nested video object in array item
        if (item.video && typeof item.video === 'object') {
          for (const field of videoFields) {
            if (item.video[field] && typeof item.video[field] === 'string') {
              const type = detectStreamType(item.video[field])
              urls.push({ url: item.video[field], type })
              if (import.meta.env.DEV) {
                console.log(`📺 Found nested video URL in array item: video.${field} = ${item.video[field]} (type: ${type})`)
              }
            }
          }
        }
        break
      }
    }
  } else {
    // Check root level (object format)
    for (const field of videoFields) {
      if (data[field] && typeof data[field] === 'string') {
        const type = detectStreamType(data[field])
        urls.push({ url: data[field], type })
        if (import.meta.env.DEV) {
          console.log(`📺 Found root level video URL: ${field} = ${data[field]} (type: ${type})`)
        }
      }
    }
    
    // Check table-specific data
    if (tableId && data[tableId]) {
      const tableData = data[tableId]
      for (const field of videoFields) {
        if (tableData[field] && typeof tableData[field] === 'string') {
          const type = detectStreamType(tableData[field])
          urls.push({ url: tableData[field], type })
          if (import.meta.env.DEV) {
            console.log(`📺 Found table-specific video URL: ${tableId}.${field} = ${tableData[field]} (type: ${type})`)
          }
        }
      }
      
      // Check nested video object
      if (tableData.video && typeof tableData.video === 'object') {
        for (const field of videoFields) {
          if (tableData.video[field] && typeof tableData.video[field] === 'string') {
            const type = detectStreamType(tableData.video[field])
            urls.push({ url: tableData.video[field], type })
            if (import.meta.env.DEV) {
              console.log(`📺 Found nested video URL: ${tableId}.video.${field} = ${tableData.video[field]} (type: ${type})`)
            }
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
          if (import.meta.env.DEV) {
            console.log(`📺 Found stream array URL: ${stream.url} (type: ${type})`)
          }
        }
      }
    }
  }
  
  // Check all data keys for potential video URLs (more aggressive search)
  if (urls.length === 0) {
    const checkValue = (value: any, path: string = '') => {
      if (typeof value === 'string' && value.length > 10) {
        // Check if it looks like a URL
        if (value.startsWith('http://') || value.startsWith('https://') || 
            value.startsWith('ws://') || value.startsWith('wss://') ||
            value.startsWith('rtmp://') || value.startsWith('rtsp://')) {
          const type = detectStreamType(value)
          if (type !== 'unknown') {
            urls.push({ url: value, type })
            if (import.meta.env.DEV) {
              console.log(`📺 Found potential video URL at ${path}: ${value} (type: ${type})`)
            }
          }
        }
      } else if (typeof value === 'object' && value !== null) {
        Object.keys(value).forEach(key => {
          checkValue(value[key], path ? `${path}.${key}` : key)
        })
      }
    }
    
    // Only do deep search if no URLs found
    checkValue(data, 'root')
  }
  
  if (import.meta.env.DEV) {
    console.log(`📺 Total video URLs found: ${urls.length}`, urls)
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
const LiveVideo: React.FC<LiveVideoProps> = ({ 
  videoUrl: propVideoUrl,
  autoPlay = true 
}) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<any>(null) // HLS.js instance
  const flvRef = useRef<any>(null) // FLV.js instance
  const pcRef = useRef<RTCPeerConnection | null>(null) // WebRTC peer connection
  const [isPlaying, setIsPlaying] = useState<boolean>(autoPlay)
  const [videoError, setVideoError] = useState<boolean>(false)
  const [liveVideoUrl, setLiveVideoUrl] = useState<string>('')
  const [streamType, setStreamType] = useState<StreamType>('unknown')
  const [iframeUrl, setIframeUrl] = useState<string>('')
  const { countdown, tableId: storeTableId, roundStatus, accountBalance } = useGameStore()
  const [stopBetCountdown, setStopBetCountdown] = useState<number | null>(null)
  const stopBetTimerRef = useRef<number | null>(null)
  const prevRoundStatusRef = useRef<number | undefined>(undefined)
  // Use tableId from store, but log if it seems wrong
  const tableId = storeTableId
  const lastFetchTimeRef = useRef(0)
  const [winMessage, setWinMessage] = useState<{ text: string; type: 'meron' | 'wala' | 'draw'; winAmount?: number; status?: 'WIN' | 'LOSE' | 'DRAW' } | null>(null)
  const winMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const balanceBeforeSettlementRef = useRef<number | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false)
  const controlsRowRef = useRef<HTMLDivElement | null>(null)
  const [isMuted, setIsMuted] = useState<boolean>(true) // Start muted by default
  const [isBettingHistoryOpen, setIsBettingHistoryOpen] = useState<boolean>(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false)
  const [isVideoLoading, setIsVideoLoading] = useState<boolean>(true) // Track video loading state
  const [useVePlayer, setUseVePlayer] = useState<boolean>(false) // Track if using VePlayer
  const vePlayerRef = useRef<any>(null) // VePlayer instance
  const vePlayerContainerRef = useRef<HTMLDivElement>(null) // Container for VePlayer
  const roomPlayersRef = useRef<Record<string, any>>({}) // Store VePlayer instances per table

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
   * Cleanup WebRTC peer connection
   */
  const cleanupWebRTC = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
  }, [])

  /**
   * Cleanup FLV.js player
   */
  const cleanupFLV = useCallback(() => {
    if (flvRef.current) {
      flvRef.current.destroy()
      flvRef.current = null
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
          video.muted = isMuted
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
        console.error('📺 WebRTC connection failed:', error)
        console.log('📺 Will attempt to fetch alternative video sources from API')
      }
      // Don't set error immediately - will try alternative sources
      cleanupWebRTC()
      // Note: fetchVideoUrl will be called again by the polling mechanism
    }
  }, [cleanupWebRTC, tableId, isMuted])

  /**
   * Loads VePlayer library dynamically
   * 
   * NOTE: VePlayer must be included as a script tag in index.html
   * Example: <script src="path/to/veplayer.min.js"></script>
   * Or load from CDN: <script src="https://cdn.example.com/veplayer.min.js"></script>
   * 
   * VePlayer should be available globally as window.VePlayer
   */
  const loadVePlayer = useCallback(async (): Promise<any> => {
    if (typeof window === 'undefined') {
      return null
    }

    // Check if VePlayer is already loaded
    if ((window as any).VePlayer && typeof (window as any).VePlayer.createLivePlayer === 'function') {
      return (window as any).VePlayer
    }

    // Try to load from CDN or script tag
    try {
      return await new Promise((resolve, reject) => {
        // Check again in case it was loaded between checks
        if ((window as any).VePlayer && typeof (window as any).VePlayer.createLivePlayer === 'function') {
          resolve((window as any).VePlayer)
          return
        }

        // Try to find existing script tag
        const existingScript = document.querySelector('script[src*="veplayer" i]')
        if (existingScript) {
          // Wait for it to load
          existingScript.addEventListener('load', () => {
            if ((window as any).VePlayer) {
              resolve((window as any).VePlayer)
            } else {
              reject(new Error('VePlayer failed to load'))
            }
          })
          return
        }

        // VePlayer not found - user needs to include script tag in index.html
        if (import.meta.env.DEV) {
          console.warn('📺 VePlayer not found. Please include VePlayer script in index.html.')
          console.warn('📺 Example: <script src="path/to/veplayer.min.js"></script>')
        }
        reject(new Error('VePlayer not available - include script tag in index.html'))
      })
    } catch (error) {
      if (import.meta.env.DEV) {
        console.debug('VePlayer not available:', error)
      }
      return null
    }
  }, [])

  /**
   * Initializes VePlayer for the current table
   */
  const initializeVePlayer = useCallback(async (tableId: string, playUrl: string) => {
    if (!tableId || !playUrl) return

    try {
      const VePlayer = await loadVePlayer()
      if (!VePlayer) {
        if (import.meta.env.DEV) {
          console.warn('📺 VePlayer not available, falling back to standard video player')
        }
        setUseVePlayer(false)
        return
      }

      // Clean up existing player for this table
      if (roomPlayersRef.current[tableId]) {
        try {
          roomPlayersRef.current[tableId].destroy()
        } catch (e) {
          // Ignore cleanup errors
        }
        delete roomPlayersRef.current[tableId]
      }

      // Get or create container
      const containerId = `veplayer-container-${tableId}`
      let container = document.getElementById(containerId)
      
      if (!container && vePlayerContainerRef.current) {
        // Use the ref container
        container = vePlayerContainerRef.current
        container.id = containerId
      }

      if (!container) {
        if (import.meta.env.DEV) {
          console.error('📺 VePlayer container not found')
        }
        return
      }

      // Clear container
      container.innerHTML = ''

      // Create VePlayer instance
      const player = VePlayer.createLivePlayer({
        id: containerId,
        poster: './assets1/img/maintainarena.png', // Use arena image as poster
        url: playUrl,
        infoPanel: {
          visible: false,
        },
        videoFillMode: 'fillHeight',
        closeVideoClick: true,
        codec: 'h264',
        autoplay: { muted: true },
        ignores: ['autoplayPlugin', 'controls'],
        playsinline: true,
        fluid: true,
        logger: {
          appId: '861950',
        },
        mobile: {
          gradient: 'none',
        }
      })

      // Store player instance
      roomPlayersRef.current[tableId] = player
      vePlayerRef.current = player
      setUseVePlayer(true)
      setIsVideoLoading(true) // Show loading image initially
      setVideoError(false)

      // Handle player ready event
      if (player.on) {
        player.on('ready', () => {
          setIsVideoLoading(false) // Hide loading image when video is ready
          if (import.meta.env.DEV) {
            console.log('📺 VePlayer ready for table:', tableId)
          }
        })

        player.on('play', () => {
          setIsVideoLoading(false) // Hide loading image when video starts playing
        })

        // Handle error event with auto-retry
        player.on('error', (e: any) => {
          console.warn(`VePlayer error for ${tableId}:`, e)
          
          // Auto retry after 2000ms
          if (roomPlayersRef.current[tableId]) {
            try {
              roomPlayersRef.current[tableId].destroy()
            } catch (destroyError) {
              // Ignore destroy errors
            }
            delete roomPlayersRef.current[tableId]
          }

          // Set error state temporarily
          setVideoError(true)
          setIsVideoLoading(true) // Show loading image during retry

          setTimeout(() => {
            // Retry initialization
            initializeVePlayer(tableId, playUrl).catch((retryError) => {
              if (import.meta.env.DEV) {
                console.error('📺 VePlayer retry failed:', retryError)
              }
              setUseVePlayer(false) // Fall back to standard player
            })
          }, 2000)
        })
      }

      if (import.meta.env.DEV) {
        console.log('📺 VePlayer initialized for table:', tableId, 'URL:', playUrl)
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('📺 Failed to initialize VePlayer:', error)
      }
      setUseVePlayer(false)
    }
  }, [loadVePlayer])

  /**
   * Fetches live video URL from API and initializes WebRTC stream
   * Called when tableId changes or video_url_refresh event is dispatched
   */
  const fetchVideoUrl = useCallback(async () => {
    // Get fresh tableId from store to avoid stale closures
    const currentTableId = useGameStore.getState().tableId
    
    if (!currentTableId) {
      if (import.meta.env.DEV) {
        console.warn('📺 No tableId available for video fetch')
      }
      return
    }

    // Throttle API calls - don't fetch more than once every 5 seconds
    const now = Date.now()
    if (now - lastFetchTimeRef.current < 5000) return
    
    lastFetchTimeRef.current = now

    if (import.meta.env.DEV) {
      console.log('📺 Fetching video URL for table:', currentTableId)
      if (currentTableId === 'E08') {
        console.warn('⚠️ Using default tableId E08 - this might be wrong! Check URL parameter.')
      }
    }
    
    // Use currentTableId for all operations
    const tableId = currentTableId

    try {
      // Try to get video URL from lobbyinfo first (preferred method)
      if (sessionManager.getSessionId()) {
        try {
          const lobbyInfo = await apiService.getLobbyInfo()
          
          if (lobbyInfo && lobbyInfo.code === 'B100' && lobbyInfo.data) {
            const data = lobbyInfo.data
            
            // Extract all possible video URLs
            const videoUrls = extractVideoUrls(data, tableId)
            
            // If any video URL found, use it
            if (videoUrls.length > 0) {
              // Priority: HLS > FLV > iframe > MP4 > WebRTC (WebRTC last since it requires auth)
              const priorityOrder: StreamType[] = ['hls', 'flv', 'iframe', 'mp4', 'webrtc']
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
                if (import.meta.env.DEV) {
                  console.log('📺 Selected video URL from API:', selectedUrl.url, 'Type:', selectedUrl.type)
                }
                setLiveVideoUrl(selectedUrl.url)
                setStreamType(selectedUrl.type)
                setIsVideoLoading(true) // Show loading image when URL changes
                
                // Try VePlayer first if available (for HLS, FLV, MP4 streams)
                if (tableId && (selectedUrl.type === 'hls' || selectedUrl.type === 'flv' || selectedUrl.type === 'mp4')) {
                  try {
                    await initializeVePlayer(tableId, selectedUrl.url)
                    // Check if VePlayer was successfully initialized
                    if (roomPlayersRef.current[tableId]) {
                      setVideoError(false)
                      return // VePlayer is handling the stream
                    }
                  } catch (error) {
                    if (import.meta.env.DEV) {
                      console.warn('📺 VePlayer initialization failed, falling back to standard player:', error)
                    }
                  }
                }
                
                if (selectedUrl.type === 'iframe') {
                  setIframeUrl(selectedUrl.url)
                } else {
                  setIframeUrl('')
                }
                
                // If WebRTC, connect to it
                if (selectedUrl.type === 'webrtc') {
                  connectWebRTC(selectedUrl.url)
                }
                
                setVideoError(false)
                return
              }
            } else {
              if (import.meta.env.DEV) {
                console.log('📺 No video URLs found in lobbyinfo response for table:', tableId, '- this is normal, will use constructed FLV URL')
              }
            }
          } else {
            if (import.meta.env.DEV) {
              console.warn('📺 Invalid lobbyinfo response:', lobbyInfo)
            }
          }
        } catch (error) {
          // Failed to fetch video URL from lobbyinfo - will try fallbacks
          if (import.meta.env.DEV) {
            console.error('📺 Failed to fetch video URL from lobbyinfo:', error)
          }
        }
      } else {
        if (import.meta.env.DEV) {
          console.warn('📺 No session ID available for video fetch')
        }
      }

      // Fallback 1: Try FLV URL (same format as original site)
      // Only try FLV if we have a valid session
      const streamId = getStreamIdForTable(tableId)
      const sessId = sessionManager.getSessionId()
      
      if (streamId && sessId) {
        const webrtcSessionId = generateWebRTCSessionId()
        // Construct FLV URL exactly like original site
        const flvUrl = `${WEBRTC_CONFIG.SIGNALING_BASE_URL}/${streamId}.flv?sessId=${sessId}&_session_id=${webrtcSessionId}`
        
        if (import.meta.env.DEV) {
          console.log('📺 Attempting FLV stream (original site format) for table:', tableId, 'streamId:', streamId)
          console.log('📺 FLV URL:', flvUrl)
        }
        
        setLiveVideoUrl(flvUrl)
        setStreamType('flv')
        setVideoError(false)
        // Note: If FLV fails with 404, error handler will trigger fallback
        return
      } else if (import.meta.env.DEV) {
        console.log('📺 Skipping FLV - missing session or streamId:', { streamId, hasSession: !!sessId })
      }

      // Fallback 2: Try WebRTC with table mapping
      if (streamId && sessionManager.getSessionId()) {
        if (import.meta.env.DEV) {
          console.log('📺 Attempting WebRTC fallback for table:', tableId, 'streamId:', streamId)
        }
        setStreamType('webrtc')
        setVideoError(false)
        connectWebRTC(streamId)
        return
      }

      // Fallback 3: Try constructed HLS URL
      const constructedHlsUrl = `https://vfile.dk77.bet/${tableId}/live.m3u8`
      if (import.meta.env.DEV) {
        console.log('📺 Trying constructed HLS URL:', constructedHlsUrl)
      }
      setLiveVideoUrl(constructedHlsUrl)
      setStreamType('hls')
      setVideoError(false)
      return

    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('📺 Error fetching video URL:', error)
      }
      // Don't set error immediately - try fallback first
      const streamId = getStreamIdForTable(tableId)
      if (streamId && sessionManager.getSessionId()) {
        setStreamType('webrtc')
        connectWebRTC(streamId)
      } else {
        setVideoError(true)
      }
    }
  }, [tableId, connectWebRTC, initializeVePlayer])

  /**
   * Sets up periodic video URL fetching
   * Note: Polling frequency reduced when WebSocket is connected (handled by WebSocket)
   * Waits for session to be available before fetching
   */
  useEffect(() => {
    let retryCount = 0
    const maxRetries = 5
    
    const tryFetchVideoUrl = () => {
      // Check if session is available (or if we've retried enough times)
      const hasSession = sessionManager.getSessionId()
      
      if (hasSession || retryCount >= maxRetries) {
        if (import.meta.env.DEV) {
          console.log('📺 Fetching video URL (session available or max retries reached)', {
            hasSession,
            retryCount,
            tableId
          })
        }
        fetchVideoUrl()
      } else {
        retryCount++
        if (import.meta.env.DEV) {
          console.log(`📺 Waiting for session before fetching video URL (retry ${retryCount}/${maxRetries})`)
        }
        // Retry after a delay
        setTimeout(tryFetchVideoUrl, 1000)
      }
    }
    
    // Initial fetch attempt
    tryFetchVideoUrl()
    
    // Poll every 30 seconds for video URL updates (reduced frequency)
    // WebSocket will provide instant updates when available
    const interval = setInterval(() => {
      fetchVideoUrl()
    }, 30000)
    
    // Listen for video_url_refresh event (triggered when table switches)
    const handleVideoRefresh = (event: CustomEvent) => {
      const newTableId = event.detail?.tableId
      if (newTableId && newTableId === tableId) {
        if (import.meta.env.DEV) {
          console.log('📺 Video refresh event received for table:', newTableId)
        }
        fetchVideoUrl()
      }
    }
    
    window.addEventListener('video_url_refresh', handleVideoRefresh as EventListener)

    return () => {
      clearInterval(interval)
      window.removeEventListener('video_url_refresh', handleVideoRefresh as EventListener)
    }
  }, [fetchVideoUrl, tableId])

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
   * Handles video error events (native Event for addEventListener)
   */
  const handleVideoErrorNative = useCallback(() => {
    const video = videoRef.current
    if (video && import.meta.env.DEV) {
      console.error('📺 Video error:', {
        error: video.error,
        networkState: video.networkState,
        readyState: video.readyState,
        src: video.src,
        currentSrc: video.currentSrc
      })
    }
    // Don't immediately set error - give it a chance to recover
    // Only set error if video is definitely not working
    if (video && video.error && video.error.code !== 0) {
      setVideoError(true)
      // Retry fetching video URL after a delay
      setTimeout(() => {
        fetchVideoUrl()
      }, 3000)
    }
  }, [fetchVideoUrl])

  /**
   * Handles video error events (React SyntheticEvent for onError prop)
   */
  const handleVideoError = useCallback((_event: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    handleVideoErrorNative()
  }, [handleVideoErrorNative])

  /**
   * Handles video load success
   */
  const handleVideoLoaded = useCallback(() => {
    setVideoError(false)
    setIsVideoLoading(false) // Video has loaded, hide loading image
    const video = videoRef.current
    if (video) {
      video.muted = isMuted
      video.play().catch(() => {
        // Autoplay might be blocked - user can click to play
      })
    }
  }, [isMuted])

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
    
    // Don't load if URL is empty or if we're in error state (waiting for fallback)
    if (!videoUrl || videoError) {
      if (import.meta.env.DEV && videoError) {
        console.log('📺 Skipping video load - waiting for fallback URL')
      }
      return
    }

    // Clean up previous instances
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
    cleanupFLV()
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
      // FLV streams need flv.js library
      (async () => {
        try {
          // Clean up previous FLV instance
          cleanupFLV()
          
          if (flvjs.isSupported()) {
            const flvPlayer = flvjs.createPlayer({
              type: 'flv',
              url: videoUrl,
              isLive: true,
              hasAudio: true,
              hasVideo: true
            }, {
              enableWorker: false,
              enableStashBuffer: true, // Enable stash buffer to reduce frame drops
              stashInitialSize: 128,
              autoCleanupSourceBuffer: true,
              autoCleanupMaxBackwardDuration: 3,
              autoCleanupMinBackwardDuration: 2,
              statisticsInfoReportInterval: 1000,
              // Additional buffer settings to reduce audio frame drops
              lazyLoad: false,
              lazyLoadMaxDuration: 3 * 60,
              lazyLoadRecoverDuration: 30,
              deferLoadAfterSourceOpen: false
            })
            
            flvPlayer.attachMediaElement(video)
            flvPlayer.load()
            
            flvPlayer.on(flvjs.Events.ERROR, (errorType: string, errorDetail: string, errorInfo: string) => {
              if (import.meta.env.DEV) {
                console.error('FLV.js error:', errorType, errorDetail, errorInfo)
              }
              
              // Handle network errors (404, connection failed, etc.)
              if (errorType === flvjs.ErrorTypes.NETWORK_ERROR) {
                try {
                  flvPlayer.unload()
                  flvPlayer.detachMediaElement()
                  flvPlayer.destroy()
                  flvRef.current = null
                  
                  if (import.meta.env.DEV) {
                    console.warn('📺 FLV stream failed (404 or network error), trying fallback sources')
                  }
                  
                  // Try fallback sources immediately (don't wait)
                  const currentTableId = useGameStore.getState().tableId
                  const currentSession = sessionManager.getSessionId()
                  
                  if (import.meta.env.DEV) {
                    console.log('📺 FLV failed, attempting fallback immediately:', {
                      tableId: currentTableId,
                      hasSession: !!currentSession
                    })
                  }
                  
                  if (currentTableId) {
                    // Try WebRTC as fallback (requires session)
                    const streamId = getStreamIdForTable(currentTableId)
                    if (streamId && currentSession) {
                      if (import.meta.env.DEV) {
                        console.log('📺 Trying WebRTC fallback after FLV failure')
                      }
                      setStreamType('webrtc')
                      setVideoError(false)
                      connectWebRTC(streamId)
                    } else if (currentSession) {
                      // Session available but no streamId - retry fetch after delay
                      if (import.meta.env.DEV) {
                        console.log('📺 Session available but no streamId, will retry fetch')
                      }
                      setTimeout(() => {
                        fetchVideoUrl()
                      }, 2000)
                    } else {
                      // No session yet - try HLS as fallback (doesn't require session)
                      const hlsUrl = `https://vfile.dk77.bet/${currentTableId}/live.m3u8`
                      if (import.meta.env.DEV) {
                        console.log('📺 No session available, trying HLS fallback:', hlsUrl)
                      }
                      setLiveVideoUrl(hlsUrl)
                      setStreamType('hls')
                      setVideoError(false)
                    }
                  }
                } catch (e) {
                  if (import.meta.env.DEV) {
                    console.error('FLV recovery failed:', e)
                  }
                }
                setVideoError(true)
              } else if (errorType === flvjs.ErrorTypes.MEDIA_ERROR) {
                // Try to recover from media errors
                try {
                  flvPlayer.unload()
                  flvPlayer.load()
                } catch (e) {
                  if (import.meta.env.DEV) {
                    console.error('FLV media error recovery failed:', e)
                  }
                  setVideoError(true)
                }
              }
            })
            
            flvRef.current = flvPlayer
            
            if (autoPlay) {
              video.play().catch(() => {
                // Autoplay may be blocked
              })
            }
          } else {
            // FLV.js not supported - try iframe fallback
            console.warn('FLV.js not supported in this browser')
            setVideoError(true)
          }
        } catch (error) {
          console.error('FLV.js initialization failed:', error)
          setVideoError(true)
        }
      })()
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
      cleanupFLV()
    }
  }, [videoUrl, streamType, iframeUrl, autoPlay, cleanupFLV, isMuted])

  /**
   * Cleanup WebRTC, FLV, and VePlayer on unmount
   */
  useEffect(() => {
    return () => {
      cleanupWebRTC()
      cleanupFLV()
      
      // Cleanup VePlayer instances
      Object.values(roomPlayersRef.current).forEach((player) => {
        try {
          if (player && typeof player.destroy === 'function') {
            player.destroy()
          }
        } catch (e) {
          // Ignore cleanup errors
        }
      })
      roomPlayersRef.current = {}
      vePlayerRef.current = null
    }
  }, [cleanupWebRTC, cleanupFLV])

  /**
   * Cleanup VePlayer and reset loading state when table changes
   */
  useEffect(() => {
    // Reset loading state when table changes
    setIsVideoLoading(true)
    setUseVePlayer(false)
    
    return () => {
      // Cleanup VePlayer for previous table
      const currentTableId = useGameStore.getState().tableId
      if (currentTableId && roomPlayersRef.current[currentTableId]) {
        try {
          roomPlayersRef.current[currentTableId].destroy()
        } catch (e) {
          // Ignore cleanup errors
        }
        delete roomPlayersRef.current[currentTableId]
      }
    }
  }, [tableId])

  /**
   * Sets up video event listeners and autoplay
   */
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    video.addEventListener('error', handleVideoErrorNative)
    video.addEventListener('loadeddata', handleVideoLoaded)
    video.addEventListener('play', handleVideoPlay)
    video.addEventListener('pause', handleVideoPause)

    return () => {
      video.removeEventListener('error', handleVideoErrorNative)
      video.removeEventListener('loadeddata', handleVideoLoaded)
      video.removeEventListener('play', handleVideoPlay)
      video.removeEventListener('pause', handleVideoPause)
    }
  }, [handleVideoErrorNative, handleVideoLoaded, handleVideoPlay, handleVideoPause])

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
   * Toggles video mute/unmute state
   */
  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    const newMutedState = !isMuted
    video.muted = newMutedState
    setIsMuted(newMutedState)
  }, [isMuted])

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
        resultText = 'Meron Win'
      } else if (drawresultUpper === 'W' || drawresultUpper === 'WALA') {
        resultType = 'wala'
        resultText = 'Wala Win'
      } else if (drawresultUpper === 'D' || drawresultUpper === 'DRAW') {
        resultType = 'draw'
        resultText = 'Draw'
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
                  aria-label="Settings" 
                  title="Settings"
                  onClick={() => setIsSettingsOpen(true)}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M12 1v6m0 6v6m9-9h-6m-6 0H3m15.364 6.364l-4.243-4.243m-4.242 0L5.636 18.364m12.728-12.728l-4.243 4.243m-4.242 0L5.636 5.636"/>
                  </svg>
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


      {/* Countdown Badge - Betting Period */}
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
                  <>You Won! +{winMessage.winAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>
                )}
                {winMessage.status === 'LOSE' && winMessage.winAmount !== undefined && winMessage.winAmount < 0 && (
                  <>You Lost -{Math.abs(winMessage.winAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>
                )}
                {winMessage.status === 'DRAW' && (
                  <>Draw - Bet Returned</>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      
      <div className="video-wrapper">
        {/* Loading Image - Show while video is loading */}
        {isVideoLoading && (
          <div className="video-loading-poster">
            {/* Optional loading spinner overlay */}
            <div className="loading-spinner" />
          </div>
        )}

        {/* VePlayer Container */}
        {useVePlayer && (
          <div 
            ref={vePlayerContainerRef}
            id={`veplayer-container-${tableId}`}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              zIndex: 1
            }}
          />
        )}

        {/* Iframe embed for external players */}
        {!useVePlayer && streamType === 'iframe' && iframeUrl && (
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
        {!useVePlayer && streamType !== 'iframe' && (
          <video
            ref={videoRef}
            className="live-video"
            playsInline
            muted={isMuted}
            autoPlay={autoPlay}
            controls={false}
            preload="auto"
            loop={false}
            onError={handleVideoError}
            onLoadedData={handleVideoLoaded}
            style={{ 
              display: (videoError && !liveVideoUrl && !iframeUrl) ? 'none' : 'block',
              opacity: isVideoLoading ? 0 : 1,
              transition: 'opacity 0.3s ease-in-out'
            }}
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
