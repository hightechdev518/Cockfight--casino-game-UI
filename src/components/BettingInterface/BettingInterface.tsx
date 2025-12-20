import { useCallback, useMemo, useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useGameStore, useGameStore as getGameStore, BetType, Bet } from '../../store/gameStore'
import SelectedChipDisplay from '../Chips/SelectedChipDisplay'
import FlyingChip from '../Chips/FlyingChip'
import SuccessOverlay from '../Controls/SuccessOverlay'
import Controls from '../Controls/Controls'
import AccountInfo from '../AccountInfo/AccountInfo'
import { apiService, sessionManager } from '../../services/apiService'
import { mapBetTypeToBackend, getBetTypeDisplayName, mapBackendToBetType } from '../../utils/betMapping'
import { shouldThrottle, completeThrottle } from '../../utils/apiThrottle'
import './BettingInterface.css'
import { useI18n } from '../../i18n/LanguageContext'

// Silence all console output in src/ (requested cleanup)
const console: Pick<Console, 'log' | 'warn' | 'error' | 'debug'> = {
  log: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

/**
 * Default betting odds (fallback if API odds not available)
 */
const DEFAULT_BET_ODDS: Readonly<Record<BetType, number>> = {
  meron: 1.0,
  wala: 1.0,
  draw: 8.0,
  meronRed: 0.9,
  meronBlack: 0.9,
  walaRed: 0.9,
  walaBlack: 0.9,
  meronOdd: 0.75,
  meronEven: 1.05,
  walaOdd: 0.75,
  walaEven: 1.05
} as const

/**
 * BettingInterface component provides the main betting interface for meron wala game
 * 
 * @returns JSX element
 */
const BettingInterface: React.FC = () => {
  const { t } = useI18n()
  // CRITICAL: Subscribe to roundStatus and isLive separately to ensure reactivity
  // This ensures the component re-renders when these values change
  const roundStatus = useGameStore((state) => state.roundStatus)
  const isLive = useGameStore((state) => state.isLive)
  const { 
    selectedChip, 
    addBet, 
    clearBets, 
    tableId, 
    roundId, 
    lobbyInfoByTableId,
    currentRound,
    countdown,
    setAccountBalance, 
    setBettingError,
    bettingError,
    bets, // Confirmed bets that have been submitted
    betLimitMin, // Minimum bet limit from API
    betLimitMax, // Maximum bet limit from API
    getLastRoundBets
  } = useGameStore()
  const [pendingBets, setPendingBets] = useState<Map<BetType, number>>(new Map())
  // Track which bet type is currently active (locked in) - only one panel can be bet at a time
  const [activeBetType, setActiveBetType] = useState<BetType | null>(null)
  // Track original balance before pending bets (for cancel functionality)
  const [originalBalanceBeforePending, setOriginalBalanceBeforePending] = useState<number | null>(null)
  const [flyingChips, setFlyingChips] = useState<Array<{
    id: string
    chipValue: number
    startX: number
    startY: number
    endX: number
    endY: number
  }>>([])
  const betButtonRefs = useRef<Partial<Record<BetType, HTMLButtonElement>>>({})
  const [showSuccess, setShowSuccess] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [oddsMap, setOddsMap] = useState<Map<string, number>>(new Map()) // Map zone -> odds
  const successTimerRef = useRef<number | null>(null)
  const [shakingBetType, setShakingBetType] = useState<BetType | null>(null)
  const [errorFading, setErrorFading] = useState(false)
  const errorTimerRef = useRef<number | null>(null)

  // Display-only formatting for bet amounts in the betting area (no decimals).
  // We truncate (not round) to avoid showing a larger amount than actually wagered.
  const betAmountFormatter = useMemo(() => {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
  }, [])

  const formatBetAmountNoDecimals = useCallback((amount: number): string => {
    const safe = Number.isFinite(amount) ? amount : 0
    return betAmountFormatter.format(Math.trunc(safe))
  }, [betAmountFormatter])

  // Removed restriction: Users can now bet on multiple sides in the same round
  // All bets are properly communicated with the server via API calls

  // r_no for odds.php must come from lobbyinfo.php per-table field "no"
  const oddsRNo = useMemo(() => {
    const tableData = (tableId && lobbyInfoByTableId) ? lobbyInfoByTableId[tableId] : undefined
    const no = tableData?.no
    if (no === undefined || no === null) return undefined
    return String(no)
  }, [lobbyInfoByTableId, tableId])

  /**
   * Fetches odds from API for the current round
   * Note: Odds API uses r_no format: YYMMDD + roundId (e.g., "2512091267712")
   * Format: POST /odds.php with form data: sess_id, r_no, uniqueid
   * @param force - If true, bypass throttle and force fetch
   */
  const fetchOdds = useCallback(async (force: boolean = false) => {
    // Throttle odds fetching - only fetch once per roundId (increased interval to reduce API calls)
    const oddsKey = `odds_${oddsRNo}_${tableId}`
    if (!force && !shouldThrottle(oddsKey, 30000)) { // Increased from 5s to 30s
      if (import.meta.env.DEV) {
        console.debug('⏸️ Throttled odds fetch - already fetched recently for this round')
      }
      return
    }
    
    if (import.meta.env.DEV) {
      console.log('🚀 fetchOdds called:', {
        roundId,
        currentRound,
        tableId,
        hasSession: !!sessionManager.getSessionId()
      })
    }
    
    // Check if we have session
    const sessId = sessionManager.getSessionId()
    if (!sessId) {
      if (import.meta.env.DEV) {
        console.error('❌ Cannot fetch odds: No session ID')
      }
      return
    }

    // r_no MUST come from lobbyinfo.php per-table "no" (no fallback)
    const r_no = oddsRNo
    
    if (!r_no) {
      if (import.meta.env.DEV) {
        console.error('❌ Cannot fetch odds: Missing r_no from lobbyinfo (no fallback)', { 
          currentRound, 
          roundId,
          oddsRNo,
          tableId,
          'NOTE': 'r_no must be lobbyinfo.php per-table field "no"'
        })
      }
      return
    }
    
    if (import.meta.env.DEV) {
      const now = new Date()
      const year = now.getFullYear().toString().slice(-2)
      const month = (now.getMonth() + 1).toString().padStart(2, '0')
      const day = now.getDate().toString().padStart(2, '0')
      const datePrefix = `${year}${month}${day}`
      
      console.log('📊 Fetching odds with r_no:', {
        r_no,
        r_no_length: r_no.length,
        constructed_from: {
          roundId,
          roundId_length: roundId?.length,
          currentRound,
          datePrefix,
          datePrefix_length: datePrefix.length,
          calculation: `${datePrefix} + ${roundId} = ${r_no}`
        },
        'NOTE': 'If B233 error, check if roundId or date format is correct'
      })
    }
    
    try {
      if (import.meta.env.DEV) {
        console.log('📊 Fetching odds from API for round:', r_no)
      }

      const oddsResponse = await apiService.getOdds(r_no)
      
      if (import.meta.env.DEV) {
        console.log('📊 Odds API response:', {
          code: oddsResponse?.code,
          hasData: !!oddsResponse?.data,
          dataLength: Array.isArray(oddsResponse?.data) ? oddsResponse.data.length : 0,
          fullResponse: oddsResponse
        })
      }

      if (oddsResponse && oddsResponse.code === 'B100' && oddsResponse.data) {
        const newOddsMap = new Map<string, number>()
        
        // Parse odds from API response
        // Response format is an object with keys like "21001:M", "21002:W", "21003:D"
        // Each value contains: {o_bettype, o_opentype, o_odds, o_notes, o_bl_ratio, o_bl_group}
        const oddsData = oddsResponse.data
        
        // Handle both object format (keys like "21001:M") and array format
        if (typeof oddsData === 'object' && !Array.isArray(oddsData)) {
          // Object format: iterate over keys
          Object.keys(oddsData).forEach((key: string) => {
            const odd: any = oddsData[key]
            const zone = (odd?.o_opentype || odd?.zone || '').toUpperCase()
            const oddsValue = typeof odd?.o_odds === 'number' ? odd.o_odds : 
                            typeof odd?.o_odds === 'string' ? parseFloat(odd.o_odds) :
                            typeof odd?.odds === 'number' ? odd.odds :
                            typeof odd?.odds === 'string' ? parseFloat(odd.odds) : null
            
            if (zone && oddsValue !== null && !isNaN(oddsValue) && isFinite(oddsValue)) {
              newOddsMap.set(zone, oddsValue)
              if (import.meta.env.DEV) {
                console.log(`✅ Mapped odds: ${zone} = ${oddsValue} (from key: ${key})`)
              }
            } else {
              if (import.meta.env.DEV) {
                console.warn('⚠️ Invalid odds entry:', { key, zone, o_odds: odd?.o_odds, fullOdd: odd })
              }
            }
          })
        } else if (Array.isArray(oddsData)) {
          // Array format: iterate over array
          oddsData.forEach((odd: any) => {
            const zone = (odd.o_opentype || odd.zone || '').toUpperCase()
            const oddsValue = typeof odd.o_odds === 'number' ? odd.o_odds : 
                            typeof odd.o_odds === 'string' ? parseFloat(odd.o_odds) :
                            typeof odd.odds === 'number' ? odd.odds :
                            typeof odd.odds === 'string' ? parseFloat(odd.odds) : null
            
            if (zone && oddsValue !== null && !isNaN(oddsValue) && isFinite(oddsValue)) {
              newOddsMap.set(zone, oddsValue)
              if (import.meta.env.DEV) {
                console.log(`✅ Mapped odds: ${zone} = ${oddsValue}`)
              }
            } else {
              if (import.meta.env.DEV) {
                console.warn('⚠️ Invalid odds entry:', { zone, o_odds: odd.o_odds, fullOdd: odd })
              }
            }
          })
        }
        
        if (newOddsMap.size > 0) {
          setOddsMap(newOddsMap)
          completeThrottle(oddsKey)
          if (import.meta.env.DEV) {
            console.log('✅ Odds updated successfully:', Array.from(newOddsMap.entries()))
          }
        } else {
          completeThrottle(oddsKey)
          if (import.meta.env.DEV) {
            console.warn('⚠️ No valid odds found in API response, using defaults')
          }
        }
      } else {
        completeThrottle(oddsKey)
        if (import.meta.env.DEV) {
          console.warn('⚠️ Odds API returned non-success code:', {
            code: oddsResponse?.code,
            msg: oddsResponse?.msg,
            hasData: !!oddsResponse?.data
          })
        }
      }
    } catch (error) {
      completeThrottle(oddsKey)
      // Log error but continue with default odds
      if (import.meta.env.DEV) {
        console.error('❌ Failed to fetch odds from API:', error)
        console.warn('⚠️ Using default odds as fallback')
      }
    }
  }, [roundId, oddsRNo, currentRound, tableId])

  /**
   * Gets odds for a bet type, using API odds if available, otherwise defaults
   */
  const getOddsForBetType = useCallback((betType: BetType): number => {
    const backendMapping = mapBetTypeToBackend(betType)
    const zone = backendMapping.zone.toUpperCase()
    
    // Try to get odds from API first (check both uppercase and original case)
    if (oddsMap.has(zone)) {
      const apiOdds = oddsMap.get(zone)!
      if (import.meta.env.DEV && oddsMap.size > 0) {
        // Only log once per render cycle to avoid spam
        const logKey = `odds-${betType}-${zone}`
        if (!(window as any)[logKey]) {
          (window as any)[logKey] = true
          setTimeout(() => delete (window as any)[logKey], 1000)
          console.log(`📊 Using API odds for ${betType} (${zone}):`, apiOdds)
        }
      }
      return apiOdds
    }
    
    // Fallback to default odds
    if (import.meta.env.DEV && oddsMap.size === 0) {
      // Only log if we have no odds at all (first render)
      const logKey = `default-odds-${betType}`
      if (!(window as any)[logKey]) {
        (window as any)[logKey] = true
        setTimeout(() => delete (window as any)[logKey], 2000)
        console.warn(`⚠️ Using default odds for ${betType} (${zone}):`, DEFAULT_BET_ODDS[betType], '- API odds not available')
      }
    }
    return DEFAULT_BET_ODDS[betType]
  }, [oddsMap])

  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        window.clearTimeout(successTimerRef.current)
      }
      if (errorTimerRef.current) {
        window.clearTimeout(errorTimerRef.current)
      }
    }
  }, [])

  // Auto-dismiss error after 3000ms with fade-out
  useEffect(() => {
    if (bettingError) {
      // Reset fade state when new error appears
      setErrorFading(false)
      
      // Clear any existing timer
      if (errorTimerRef.current) {
        window.clearTimeout(errorTimerRef.current)
      }
      
      // Start fade-out after 3000ms
      errorTimerRef.current = window.setTimeout(() => {
        setErrorFading(true)
        
        // Clear error after fade animation completes (500ms)
        errorTimerRef.current = window.setTimeout(() => {
          setBettingError(null)
          setErrorFading(false)
          errorTimerRef.current = null
        }, 500) as unknown as number
      }, 3000) as unknown as number
    } else {
      // Clear timer if error is manually cleared
      if (errorTimerRef.current) {
        window.clearTimeout(errorTimerRef.current)
        errorTimerRef.current = null
      }
      setErrorFading(false)
    }
    
    return () => {
      if (errorTimerRef.current) {
        window.clearTimeout(errorTimerRef.current)
        errorTimerRef.current = null
      }
    }
  }, [bettingError, setBettingError])

  // Fetch odds when roundId changes (needed to construct r_no)
  // Track previous roundId to avoid duplicate fetches
  const prevOddsKeyRef = useRef<string | undefined>(undefined)
  const prevOddsRoundIdRef = useRef<string | undefined>(undefined)
  const hasFetchedInitialOddsRef = useRef<boolean>(false)
  const oddsRetryTimeoutRef = useRef<number | null>(null)
  const oddsRetryCountRef = useRef<number>(0)
  
  useEffect(() => {
    // Clear any pending retry
    if (oddsRetryTimeoutRef.current) {
      clearTimeout(oddsRetryTimeoutRef.current)
      oddsRetryTimeoutRef.current = null
    }
    
    if (import.meta.env.DEV) {
      const effectiveOddsKey = oddsRNo
      console.log('🔍 Odds fetch effect triggered:', {
        effectiveOddsKey,
        roundId,
        oddsRNo,
        prevOddsKey: prevOddsKeyRef.current,
        prevRoundId: prevOddsRoundIdRef.current,
        hasRoundId: !!roundId,
        roundIdChanged: roundId !== undefined && roundId !== prevOddsRoundIdRef.current,
        hasFetchedInitial: hasFetchedInitialOddsRef.current
      })
    }
    
    // Only fetch if effective odds key changed (r_no from lobbyinfo "no"; no fallback)
    const effectiveOddsKey = oddsRNo
    if (effectiveOddsKey !== undefined && effectiveOddsKey !== prevOddsKeyRef.current) {
      if (import.meta.env.DEV) {
        console.log('🔄 Odds key changed, fetching odds:', {
          effectiveOddsKey,
          roundId,
          oddsRNo,
          prevOddsKey: prevOddsKeyRef.current
        })
      }
      fetchOdds()
      prevOddsKeyRef.current = effectiveOddsKey
      prevOddsRoundIdRef.current = roundId
      hasFetchedInitialOddsRef.current = true
    } else if (effectiveOddsKey !== undefined && !hasFetchedInitialOddsRef.current) {
      // Initial fetch on mount if we have an odds key (even if it was already set before mount)
      // Check if we have a session - if yes, wait a bit and fetch with authenticated endpoint
      const sessionId = sessionManager.getSessionId()
      if (sessionId) {
        // If we have session on initial mount, wait a bit to ensure everything is initialized
        // Then fetch with authenticated endpoint
        setTimeout(() => {
          if (import.meta.env.DEV) {
            console.log('🔄 Initial mount with session, fetching odds with authenticated endpoint:', {
              effectiveOddsKey,
              roundId,
              oddsRNo,
              hasSession: !!sessionId
            })
          }
          fetchOdds(true) // Force fetch to get authenticated data
          prevOddsKeyRef.current = effectiveOddsKey
          prevOddsRoundIdRef.current = roundId
          hasFetchedInitialOddsRef.current = true
        }, 500)
      } else {
        if (import.meta.env.DEV) {
          console.log('🔄 Initial odds fetch on mount (odds key available):', { effectiveOddsKey, roundId, oddsRNo })
        }
        fetchOdds()
        prevOddsKeyRef.current = effectiveOddsKey
        prevOddsRoundIdRef.current = roundId
        hasFetchedInitialOddsRef.current = true
      }
    } else if (!effectiveOddsKey && !hasFetchedInitialOddsRef.current) {
      // Odds key not available yet, but we haven't fetched - set up retry
      if (import.meta.env.DEV) {
        console.log('⏳ Odds key not available yet, will retry:', {
          effectiveOddsKey,
          oddsRNo,
          currentRound,
          tableId
        })
      }
      // Retry with multiple attempts in case roundId is set asynchronously
      oddsRetryCountRef.current = 0
      const maxRetries = 10
      const retryInterval = 500 // 500ms intervals
      
      const retryCheck = () => {
        const store = useGameStore.getState()
        const currentOddsKey = store.lobbyInfoByTableId?.[store.tableId]?.no
        if (currentOddsKey && !hasFetchedInitialOddsRef.current) {
          if (import.meta.env.DEV) {
            console.log('🔄 Retry: Odds key now available, fetching odds:', currentOddsKey)
          }
          fetchOdds()
          prevOddsKeyRef.current = currentOddsKey
          prevOddsRoundIdRef.current = store.roundId
          hasFetchedInitialOddsRef.current = true
          oddsRetryCountRef.current = 0 // Reset retry count on success
        } else if (oddsRetryCountRef.current < maxRetries) {
          oddsRetryCountRef.current++
          oddsRetryTimeoutRef.current = window.setTimeout(retryCheck, retryInterval)
        } else {
          if (import.meta.env.DEV) {
            console.warn('⚠️ Max retries reached, odds key still not available')
          }
          oddsRetryCountRef.current = 0 // Reset for next attempt
        }
      }
      
      oddsRetryTimeoutRef.current = window.setTimeout(retryCheck, retryInterval)
    }
    
    return () => {
      if (oddsRetryTimeoutRef.current) {
        clearTimeout(oddsRetryTimeoutRef.current)
        oddsRetryTimeoutRef.current = null
      }
    }
  }, [roundId, oddsRNo, fetchOdds, currentRound, tableId])

  // Listen for session changes to trigger odds fetch when login completes
  useEffect(() => {
    const handleSessionSet = () => {
      // When session is set (after login), always fetch odds to get real API data
      if (import.meta.env.DEV) {
        console.log('🔄 Session set event received, fetching odds with authenticated endpoint')
      }
      
      // Wait a bit for initialization to complete, then fetch if session is available
      const checkAndFetch = (attempt: number = 0) => {
        const maxAttempts = 30 // 3 seconds total (30 * 100ms) - increased for better reliability
        const sessionId = sessionManager.getSessionId()
        const currentRoundId = useGameStore.getState().roundId
        const currentTableId = useGameStore.getState().tableId
        
        if (sessionId && (currentRoundId || currentTableId)) {
          // Session available and we have either roundId or tableId - force fetch to bypass throttle
          if (import.meta.env.DEV) {
            console.log('🔄 Session available after login, fetching odds:', { roundId: currentRoundId, tableId: currentTableId })
          }
          fetchOdds(true) // Force fetch after login to bypass throttle and get authenticated data
          hasFetchedInitialOddsRef.current = true
          if (currentRoundId) {
            prevOddsRoundIdRef.current = currentRoundId
          }
        } else if (attempt < maxAttempts) {
          // Retry after a short delay
          setTimeout(() => checkAndFetch(attempt + 1), 100)
        } else {
          if (import.meta.env.DEV) {
            console.warn('⚠️ Session set but roundId/tableId not available after max attempts', {
              hasSession: !!sessionId,
              roundId: currentRoundId,
              tableId: currentTableId
            })
          }
        }
      }
      
      // Start checking after a short delay to allow initialization to complete
      setTimeout(() => checkAndFetch(), 300)
    }

    const handleInitParamChange = (event: any) => {
      // When URL params change (including session login), fetch odds
      const { changedParams } = event.detail || {}
      if (changedParams?.sess_id) {
        if (import.meta.env.DEV) {
          console.log('🔄 Session ID changed via URL, fetching odds with authenticated endpoint')
        }
        
        // Use same retry logic as session_set
        const checkAndFetch = (attempt: number = 0) => {
          const maxAttempts = 30 // 3 seconds total - increased for better reliability
          const sessionId = sessionManager.getSessionId()
          const currentRoundId = useGameStore.getState().roundId
          const currentTableId = useGameStore.getState().tableId
          
          if (sessionId && (currentRoundId || currentTableId)) {
            if (import.meta.env.DEV) {
              console.log('🔄 Session available after initparamchange, fetching odds:', { roundId: currentRoundId, tableId: currentTableId })
            }
            fetchOdds(true) // Force fetch after session change to bypass throttle
            hasFetchedInitialOddsRef.current = true
            if (currentRoundId) {
              prevOddsRoundIdRef.current = currentRoundId
            }
          } else if (attempt < maxAttempts) {
            setTimeout(() => checkAndFetch(attempt + 1), 100)
          }
        }
        
        setTimeout(() => checkAndFetch(), 300) // Slightly longer delay for initparamchange
      }
    }

    window.addEventListener('session_set', handleSessionSet)
    window.addEventListener('initparamchange', handleInitParamChange as EventListener)
    
    return () => {
      window.removeEventListener('session_set', handleSessionSet)
      window.removeEventListener('initparamchange', handleInitParamChange as EventListener)
    }
  }, [fetchOdds])

  // Listen for real-time odds updates from WebSocket 2 (PRIMARY METHOD)
  useEffect(() => {
    const handleOddsUpdate = (event: CustomEvent) => {
      const { tableId: updateTableId, odds } = event.detail
      
      // Only process if it's for the current table
      if (updateTableId && updateTableId.toUpperCase() === tableId?.toUpperCase()) {
        const newOddsMap = new Map<string, number>()
        
        // Parse odds from WebSocket format
        // Format: { "21001:M": { "o_opentype": "M", "o_odds": "0.92" }, ... }
        Object.values(odds).forEach((odd: any) => {
          const zone = (odd.o_opentype || odd.zone || '').toUpperCase()
          const oddsValue = typeof odd.o_odds === 'number' ? odd.o_odds : 
                          typeof odd.o_odds === 'string' ? parseFloat(odd.o_odds) : null
          
          if (zone && oddsValue !== null && !isNaN(oddsValue) && isFinite(oddsValue)) {
            newOddsMap.set(zone, oddsValue)
            if (import.meta.env.DEV) {
              console.log(`✅ WebSocket odds update: ${zone} = ${oddsValue}`)
            }
          }
        })
        
        if (newOddsMap.size > 0) {
          setOddsMap(newOddsMap)
          if (import.meta.env.DEV) {
            console.log('✅ Odds updated from WebSocket:', Array.from(newOddsMap.entries()))
          }
        }
      }
    }

    window.addEventListener('odds_update', handleOddsUpdate as EventListener)
    return () => {
      window.removeEventListener('odds_update', handleOddsUpdate as EventListener)
    }
  }, [tableId])

  // Listen for totalbet odds updates from WebSocket 2 (odds_M / odds_W)
  // This updates ONLY M/W odds in-place (keeps other zones intact).
  useEffect(() => {
    const handleTotalBetOddsUpdate = (event: CustomEvent) => {
      const { tableId: updateTableId, roundId: updateRoundId, odds_M, odds_W } = event.detail || {}

      const current = useGameStore.getState()
      const currentTableId = current.tableId
      const currentRoundId = current.roundId
      const currentRoundNo = current.currentRound

      const isSameTable = !!(updateTableId && currentTableId && String(updateTableId).toUpperCase() === String(currentTableId).toUpperCase())
      const isSameRound =
        (updateRoundId !== undefined && currentRoundId !== undefined && String(updateRoundId) === String(currentRoundId)) ||
        (updateRoundId !== undefined && currentRoundNo !== undefined && String(updateRoundId) === String(currentRoundNo)) ||
        (updateRoundId === undefined) // fallback: if sender didn't include roundId, rely on ws-side filtering

      if (!isSameTable || !isSameRound) return

      setOddsMap((prev) => {
        const next = new Map(prev)
        if (typeof odds_M === 'number' && Number.isFinite(odds_M)) next.set('M', odds_M)
        if (typeof odds_W === 'number' && Number.isFinite(odds_W)) next.set('W', odds_W)
        return next
      })
    }

    window.addEventListener('totalbet_odds_update', handleTotalBetOddsUpdate as EventListener)
    return () => {
      window.removeEventListener('totalbet_odds_update', handleTotalBetOddsUpdate as EventListener)
    }
  }, [])

  // Odds are fetched once when roundId changes (handled by the useEffect above)
  // WebSocket 2 provides real-time odds updates, so no periodic polling needed

  /**
   * Fetches all wagers for the current round from server using wager_rid.php
   * This syncs bets from server to ensure UI matches server state
   */
  const fetchWagersForRound = useCallback(async (r_id: string | undefined, force: boolean = false) => {
    if (!r_id) {
      if (import.meta.env.DEV) {
        console.warn('⚠️ Cannot fetch wagers: r_id (roundId) is not available')
      }
      return
    }

    // Throttle wager calls to prevent excessive requests
    const wagerKey = `wager_${r_id}`
    // NOTE: After placing a bet we may force a sync to reflect server state immediately.
    // Force mode bypasses the 5s interval but still respects the "pending" (in-flight) protection.
    const minInterval = force ? 0 : 5000
    if (!shouldThrottle(wagerKey, minInterval)) {
      if (import.meta.env.DEV) {
        console.debug('⏸️ Throttled wager fetch for round:', r_id)
      }
      return
    }

    try {
      if (import.meta.env.DEV) {
        console.log('📋 Fetching wagers for round:', r_id)
      }

      const wagersResponse = await apiService.getWagersByRound(r_id)
      completeThrottle(wagerKey)
      
      // wager_rid.php returns {code, msg, ts, unsettle, settle} at root level
      // Check both root level and nested data for compatibility
      if (wagersResponse && wagersResponse.code === 'B100') {
        const allActiveBets = wagersResponse.unsettle || wagersResponse.data?.unsettle || []
        
        if (allActiveBets.length > 0) {
          // Map backend bet format to our bet format and sync with store
          const syncedBets: Array<{ id: string; type: BetType; amount: number; odds: number; timestamp: number }> = []
          
          allActiveBets.forEach((wager: any) => {
            // Map backend bet type/zone to our BetType
            // Backend format: w_bettype (21001=Meron, 21002=Wala, 21003=Draw), w_betzone (M, W, D, or derived)
            const betType = mapBackendToBetType(wager.w_bettype, wager.w_betzone)
            if (betType) {
              const betAmount = typeof wager.w_bet === 'string' ? parseFloat(wager.w_bet) : wager.w_bet || 0
              const betOdds = typeof wager.w_bet_odds === 'string' ? parseFloat(wager.w_bet_odds) : (wager.w_bet_odds || getOddsForBetType(betType))
              
              syncedBets.push({
                id: wager.w_no || `${betType}-${Date.now()}-${Math.random()}`,
                type: betType,
                amount: betAmount,
                odds: betOdds,
                timestamp: wager.w_betdate ? new Date(wager.w_betdate).getTime() : Date.now()
              })
            }
          })
          
          // Sync all bets with store (replace existing bets with server data)
          const { clearBets: clearStoreBets } = useGameStore.getState()
          clearStoreBets() // Clear existing bets first
          
          syncedBets.forEach(bet => {
            addBet(bet)
          })
          
          if (import.meta.env.DEV) {
            console.log('🔄 Synced all bets from wager_rid.php:', {
              roundId: r_id,
              totalBets: syncedBets.length,
              bets: syncedBets.map(b => ({ type: b.type, amount: b.amount }))
            })
          }
        } else {
          // No active bets for this round - clear local bets
          const { clearBets: clearStoreBets } = useGameStore.getState()
          clearStoreBets()
          
          if (import.meta.env.DEV) {
            console.log('📋 No active bets found for round:', r_id)
          }
        }
      } else {
        if (import.meta.env.DEV) {
          console.warn('⚠️ wager_rid.php returned non-success code:', {
            code: wagersResponse?.code,
            msg: wagersResponse?.msg
          })
        }
      }
    } catch (error) {
      completeThrottle(wagerKey)
      // Log error but don't break the UI
      if (import.meta.env.DEV) {
        console.error('❌ Failed to fetch wagers from wager_rid.php:', error)
      }
    }
  }, [addBet, getOddsForBetType])

  // Fetch wagers when roundId changes (new round started)
  const prevWagerRoundIdRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (roundId !== undefined && roundId !== prevWagerRoundIdRef.current) {
      if (import.meta.env.DEV) {
        console.log('🔄 RoundId changed, fetching wagers for new round:', {
          roundId,
          prevRoundId: prevWagerRoundIdRef.current
        })
      }
      fetchWagersForRound(roundId)
      prevWagerRoundIdRef.current = roundId
    }
  }, [roundId, fetchWagersForRound])

  // Periodically fetch wagers during betting period to keep bets in sync with server
  // Reduced frequency to minimize server calls
  useEffect(() => {
    // Only fetch wagers during betting period (roundStatus === 1)
    if (roundStatus !== 1 || !roundId) return

    // Initial fetch when betting starts
    if (import.meta.env.DEV) {
      console.log('🔄 Betting period started (roundStatus === 1), fetching wagers')
    }
    fetchWagersForRound(roundId)

    // Poll every 120 seconds to keep bets in sync (further reduced frequency to minimize server calls)
    const intervalId = setInterval(() => {
      if (import.meta.env.DEV) {
        console.log('🔄 Periodic wager sync (every 120s)')
      }
      fetchWagersForRound(roundId)
    }, 120000) // Refresh every 120 seconds (reduced from 60s)

    return () => {
      clearInterval(intervalId)
    }
  }, [roundStatus, roundId, fetchWagersForRound])

  // Fetch balance when round is settled (roundStatus becomes 4)
  // Consolidated to single handler to avoid duplicate calls
  const prevRoundStatusRef2 = useRef<number | undefined>(undefined)
  useEffect(() => {
    // Only fetch balance when roundStatus transitions to 4 (settled)
    if (roundStatus === 4 && prevRoundStatusRef2.current !== 4) {
      // Throttle balance fetch to prevent multiple simultaneous calls
      const balanceKey = `balance_settlement_${roundId}`
      if (!shouldThrottle(balanceKey, 3000)) {
        if (import.meta.env.DEV) {
          console.debug('⏸️ Throttled balance fetch after settlement')
        }
        return
      }
      
      // Fetch balance when round is settled (only once per settlement)
      // Only fetch if WebSocket is disconnected (WebSocket provides balance updates when connected)
      const connectionStatus = useGameStore.getState().connectionStatus
      if (connectionStatus !== 'connected') {
        const fetchSettledBalance = async () => {
          // Wait a moment for server to process settlement
          await new Promise(resolve => setTimeout(resolve, 1500))
          
          try {
            const balance = await apiService.getBalance()
            completeThrottle(balanceKey)
            setAccountBalance(balance)
            if (import.meta.env.DEV) {
              console.log('💰 Balance updated after round settlement:', balance)
            }
          } catch (error) {
            completeThrottle(balanceKey)
            if (import.meta.env.DEV) {
              console.error('❌ Failed to fetch balance after settlement:', error)
            }
          }
        }
        fetchSettledBalance()
      } else {
        completeThrottle(balanceKey)
        if (import.meta.env.DEV) {
          console.log('💰 Balance will be updated via WebSocket after settlement (connected)')
        }
      }
    }
    prevRoundStatusRef2.current = roundStatus
  }, [roundStatus, roundId, setAccountBalance])

  // Track previous roundStatus and currentRound to detect transitions
  const prevRoundStatusRef = useRef<number | undefined>(undefined)
  const prevCurrentRoundRef = useRef<number | undefined>(undefined)
  
  // Reset activeBetType, pendingBets, and clear bets when new round starts OR when game result comes
  useEffect(() => {
    const storeState = getGameStore.getState()
    const currentRoundStatus = roundStatus !== undefined ? roundStatus : storeState.roundStatus
    const previousRoundStatus = prevRoundStatusRef.current
    const previousCurrentRound = prevCurrentRoundRef.current
    const currentRoundValue = currentRound !== undefined ? currentRound : storeState.currentRound
    
    // Detect game result: roundStatus becomes 4 (settled)
    const gameResultReceived = currentRoundStatus === 4 && previousRoundStatus !== undefined && previousRoundStatus !== 4
    
    // Note: Last round's bets are now saved in the store's updateGameStatus function
    // before clearing them, so we don't need to save them here anymore
    
    // Detect new round: either roundStatus transitions to 1 from non-1, or currentRound changes
    const roundStatusTransitioned = currentRoundStatus === 1 && previousRoundStatus !== undefined && previousRoundStatus !== 1
    const currentRoundChanged = currentRoundValue !== undefined && previousCurrentRound !== undefined && currentRoundValue !== previousCurrentRound
    
    // Reset when game result comes (roundStatus becomes 4) OR when new round starts
    if (gameResultReceived || roundStatusTransitioned || currentRoundChanged) {
      // Clear confirmed bets from store (this clears bets array and totalBet)
      clearBets()
      // Clear pending bets
      setPendingBets(new Map())
      // Reset active bet type
      setActiveBetType(null)
      // Clear betting error
      setBettingError(null)
      // Reset original balance tracking
      setOriginalBalanceBeforePending(null)
      
      if (import.meta.env.DEV) {
        console.log('🔄 Betting state reset:', {
          reason: gameResultReceived ? 'game result received (roundStatus 4)' : 
                  roundStatusTransitioned ? 'roundStatus transition to 1' : 
                  'currentRound changed',
          previousRoundStatus,
          currentRoundStatus,
          previousCurrentRound,
          currentRoundValue,
          roundId,
          currentRound
        })
      }
    }
    
    // Update refs for next comparison
    prevRoundStatusRef.current = currentRoundStatus
    prevCurrentRoundRef.current = currentRoundValue
  }, [roundStatus, roundId, currentRound, clearBets, setBettingError])
  
  // Also reset when roundId changes (backup check)
  const prevRoundIdRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (roundId && prevRoundIdRef.current && roundId !== prevRoundIdRef.current) {
      // Clear confirmed bets from store
      clearBets()
      // Clear pending bets
      setPendingBets(new Map())
      // Reset active bet type
      setActiveBetType(null)
      // Reset original balance tracking
      setOriginalBalanceBeforePending(null)
      
      if (import.meta.env.DEV) {
        console.log('🔄 RoundId changed, clearing all bets. Previous:', prevRoundIdRef.current, 'New:', roundId)
      }
    }
    prevRoundIdRef.current = roundId
  }, [roundId, clearBets])

  // CRITICAL: Reset betting state when tableId changes
  // This ensures betting area properly updates when switching tables
  const prevTableIdRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (tableId && prevTableIdRef.current && tableId !== prevTableIdRef.current) {
      // Clear all betting state when table changes
      clearBets()
      setPendingBets(new Map())
      setActiveBetType(null)
      setBettingError(null)
      // Reset original balance tracking
      setOriginalBalanceBeforePending(null)
      
      // Clear odds map to force fresh fetch for new table
      setOddsMap(new Map())
      
      // Reset odds fetch ref so odds are refetched for new table
      hasFetchedInitialOddsRef.current = false
      prevOddsKeyRef.current = undefined
      prevOddsRoundIdRef.current = undefined
      
      if (import.meta.env.DEV) {
        console.log('🔄 Table changed, resetting betting state. Previous:', prevTableIdRef.current, 'New:', tableId)
      }
    }
    
    // If tableId is available but we haven't fetched odds yet, trigger fetch
    if (tableId && !hasFetchedInitialOddsRef.current && oddsRNo) {
      if (import.meta.env.DEV) {
        console.log('🔄 TableId available with roundId, triggering odds fetch')
      }
      fetchOdds()
      hasFetchedInitialOddsRef.current = true
      prevOddsKeyRef.current = oddsRNo
      prevOddsRoundIdRef.current = roundId
    }
    
    prevTableIdRef.current = tableId
  }, [tableId, clearBets, setBettingError, roundId, oddsRNo, fetchOdds])

  // Try to fetch roundId if missing (public history only; odds.php requires lobbyinfo r_no with no fallback)
  useEffect(() => {
    if (!roundId && tableId) {
      const fetchRoundId = async () => {
        try {
          const publicHistory = await apiService.getPublicHistory(tableId)
          if (publicHistory && publicHistory.data) {
            const historyData = publicHistory.data
            if (historyData.drawresult && historyData.drawresult[tableId]) {
              const drawResults = historyData.drawresult[tableId]
              if (Array.isArray(drawResults) && drawResults.length > 0) {
                const latestRound = drawResults[0] as any
                if (latestRound.r_id) {
                  const { setRoundId } = getGameStore.getState()
                  setRoundId(latestRound.r_id.toString())
                  if (import.meta.env.DEV) {
                    console.log('✅ Fetched roundId from public history (BettingInterface):', latestRound.r_id)
                  }
                }
              }
            }
          }
        } catch (error) {
          if (import.meta.env.DEV) {
            console.warn('⚠️ Could not fetch roundId from public history (BettingInterface):', error)
          }
        }
      }
      fetchRoundId()
    }
  }, [roundId, tableId])

  /**
   * Validates bet amount against bet limits from API
   * @param amount - Bet amount to validate
   * @returns Error message if invalid, null if valid
   */
  const validateBetAmount = useCallback((amount: number): string | null => {
    // Calculate total of all confirmed bets
    const totalConfirmedBets = bets.reduce((sum, bet) => sum + bet.amount, 0)
    const totalWithNewBet = totalConfirmedBets + amount
    
    // Chips 1 and 5 are always allowed in all cases, all the time
    const isChip1Or5 = selectedChip === 1 || selectedChip === 5
    
    // Minimum limit check: check total confirmed bets + new bet, not individual bet amount
    // If total confirmed bets already meet minimum, allow any additional bets
    // For chips 1 and 5, always allow regardless of minimum
    if (!isChip1Or5 && betLimitMin !== undefined) {
      // If total confirmed bets already meet minimum, allow any additional bet
      if (totalConfirmedBets < betLimitMin) {
        // Total doesn't meet minimum yet, check if adding this bet would meet it
        if (totalWithNewBet < betLimitMin) {
      return t('error.minimumBetAmount').replace('{amount}', formatBetAmountNoDecimals(betLimitMin))
    }
      }
      // If totalConfirmedBets >= betLimitMin, allow any additional bet
    }
    
    // Maximum limit check: still applies to individual bet amount
    if (betLimitMax !== undefined && amount > betLimitMax) {
      return t('error.maximumBetAmount').replace('{amount}', formatBetAmountNoDecimals(betLimitMax))
    }
    return null
  }, [betLimitMin, betLimitMax, selectedChip, bets, formatBetAmountNoDecimals, t])

  /**
   * Handles bet button click
   * @param betType - Type of bet to place
   */
  const handleBetClick = useCallback((betType: BetType) => {
    // Users can now bet on multiple sides in the same round
    // All bets are communicated with the server properly
    
    if (selectedChip <= 0) {
      if (import.meta.env.DEV) {
        console.warn('⚠️ Betting blocked - selectedChip is 0 or negative:', selectedChip)
      }
      return
    }

    // Don't validate individual chip value here - allow users to select any chip
    // Validation will happen when confirming the bet (checking total amount)
    
    // Check if betting is allowed - must have countdown > 0 (betting period active)
    // Use countdown from hook (reactive) or get fresh from store
    const storeState = getGameStore.getState()
    const currentCountdown = countdown !== undefined ? countdown : storeState.countdown
    const currentRoundStatus = roundStatus !== undefined ? roundStatus : storeState.roundStatus
    
    if (import.meta.env.DEV) {
      console.log('🎲 Betting attempt:', {
        betType,
        selectedChip,
        countdownFromHook: countdown,
        countdownFromStore: storeState.countdown,
        currentCountdown,
        roundStatusFromHook: roundStatus,
        roundStatusFromStore: storeState.roundStatus,
        currentRoundStatus
      })
    }
    
    // Check if we have required data for betting
    // If countdown/roundStatus are undefined, it might be because API calls failed (e.g., invalid session)
    // In that case, we should still allow the bet attempt - the backend will reject it with a proper error
    
    // Only block betting if we have explicit negative signals (countdown === 0 or roundStatus !== 1)
    // If values are undefined, allow betting to proceed (backend will validate)
    if (currentCountdown !== undefined && currentCountdown <= 0) {
      setBettingError(t('error.bettingClosed'))
      if (import.meta.env.DEV) {
        console.warn('⚠️ Betting blocked - countdown is 0 or negative:', {
          currentCountdown,
          storeCountdown: storeState.countdown,
          hookCountdown: countdown,
          roundStatus: currentRoundStatus
        })
      }
      return
    }
    
    // Only block if roundStatus is explicitly set and not 1
    // If undefined, allow betting (might be due to API failure, backend will validate)
    if (currentRoundStatus !== undefined && currentRoundStatus !== 1) {
      let statusMessage = t('error.bettingNotAvailable')
      if (currentRoundStatus === 2) {
        statusMessage = t('error.bettingClosedInProgress')
      } else if (currentRoundStatus === 4) {
        statusMessage = t('error.roundSettled')
      } else {
        statusMessage = t('error.roundNotOpen')
      }
      setBettingError(statusMessage)
      if (import.meta.env.DEV) {
        console.warn('⚠️ Betting blocked - roundStatus not 1:', {
          countdown: currentCountdown,
          roundStatus: currentRoundStatus,
          'Note': 'Backend requires roundStatus === 1 to accept bets'
        })
      }
      return
    }
    
    // If countdown/roundStatus are undefined, log a warning but allow betting
    // The backend will validate and return proper error if session is invalid
    if (import.meta.env.DEV && (currentCountdown === undefined || currentRoundStatus === undefined)) {
      const currentRoundId = roundId || storeState.roundId
      console.warn('⚠️ Betting with undefined countdown/roundStatus - backend will validate:', {
        countdown: currentCountdown,
        roundStatus: currentRoundStatus,
        roundId: currentRoundId,
        tableId: tableId,
        'Note': 'This might indicate API failure (e.g., invalid session). Betting will proceed but may fail.'
      })
    }
    
    // If there's an active bet type and it's different from this one, block the bet
    if (activeBetType !== null && activeBetType !== betType) return

    // Set this as the active bet type if not already set
    if (activeBetType === null) {
      setActiveBetType(betType)
    }

    // Get current balance BEFORE updating pending bets to avoid race conditions
    // Reuse storeState that was already declared above
    const currentBalance = storeState.accountBalance
    const currentPendingBets = pendingBets
    const currentAmount = currentPendingBets.get(betType) || 0
    const newAmount = currentAmount + selectedChip
    
    // Only validate maximum limit when adding chips - allow below minimum
    // Minimum validation will happen when confirming the bet
    if (betLimitMax !== undefined && newAmount > betLimitMax) {
      setBettingError(t('error.maximumBetAmount').replace('{amount}', formatBetAmountNoDecimals(betLimitMax)))
      return
    }
    
    // Check if balance is sufficient before allowing bet
    const newBalance = currentBalance - selectedChip
    if (newBalance < 0) {
      setBettingError(t('error.insufficientBalance'))
      return
    }
    
    // Store original balance before first pending bet (for cancel functionality)
    if (currentPendingBets.size === 0 && originalBalanceBeforePending === null) {
      setOriginalBalanceBeforePending(currentBalance)
    }
    
    // Deduct balance optimistically on client side when placing bet
    // Only deduct the new chip amount being added
    setAccountBalance(newBalance)
    
    // Update pending bets
    setPendingBets((prevBets) => {
      const prevAmount = prevBets.get(betType) || 0
      const updatedAmount = prevAmount + selectedChip
      return new Map(prevBets).set(betType, updatedAmount)
    })

    // Trigger flying chip animation
    const chipButton = betButtonRefs.current[betType]
    if (chipButton) {
      const chipElement = document.querySelector('.chips-container button.selected') as HTMLElement
      if (chipElement) {
        const startRect = chipElement.getBoundingClientRect()
        const endRect = chipButton.getBoundingClientRect()

        // Calculate center positions
        const startX = startRect.left + startRect.width / 2
        const startY = startRect.top + startRect.height / 2
        const endX = endRect.left + endRect.width / 2
        const endY = endRect.top + endRect.height / 2

        const newFlyingChip = {
          id: `${betType}-${Date.now()}-${Math.random()}`,
          chipValue: selectedChip,
          startX: startX - 20, // 40px chip, so center is -20
          startY: startY - 20,
          endX: endX - 20,
          endY: endY - 20
        }

        setFlyingChips((prev) => [...prev, newFlyingChip])
      }
    }
      }, [selectedChip, activeBetType, countdown, roundStatus, setBettingError, validateBetAmount, t])

  /**
   * Confirms and submits all pending bets to the backend API
   */
  const handleConfirmBets = useCallback(async () => {
    if (pendingBets.size === 0) return
    if (isSubmitting) return // Prevent double submission
    
    // Get fresh data from store (might have been updated)
    const storeState = getGameStore.getState()
    const currentRoundId = storeState.roundId
    const currentRoundStatus = storeState.roundStatus
    const currentCountdown = storeState.countdown
    const effectiveRoundId = roundId || currentRoundId
    
    // Validate required fields
    if (!tableId) {
      setBettingError(t('error.tableIdMissing'))
      return
    }
    if (!effectiveRoundId) {
      setBettingError(t('error.roundIdMissing'))
      if (import.meta.env.DEV) {
        console.warn('⚠️ RoundId still missing when trying to place bet. Current store state:', {
          roundId: storeState.roundId,
          roundIdFromProps: roundId,
          currentRoundId: currentRoundId,
          effectiveRoundId: effectiveRoundId,
          currentRound: storeState.currentRound,
          tableId: storeState.tableId,
          roundStatus: storeState.roundStatus
        })
        console.warn('⚠️ This means WebSocket or API did not set roundId. Check WebSocket logs above.')
      }
      return
    }
    
    // Check if we have required data for betting
    // If countdown/roundStatus are undefined, it might be because API calls failed (e.g., invalid session)
    // In that case, we should still allow the bet attempt - the backend will reject it with a proper error
    
    // Only block betting if we have explicit negative signals (countdown === 0 or roundStatus !== 1)
    // If values are undefined, allow betting to proceed (backend will validate)
    if (currentCountdown !== undefined && currentCountdown <= 0) {
      setBettingError(t('error.bettingClosed'))
      if (import.meta.env.DEV) {
        console.warn('⚠️ Betting blocked - countdown is 0 or negative:', {
          currentCountdown,
          storeCountdown: storeState.countdown,
          roundStatus: currentRoundStatus
        })
      }
      return
    }
    
    // Only block if roundStatus is explicitly set and not 1
    // If undefined, allow betting (might be due to API failure, backend will validate)
    if (currentRoundStatus !== undefined && currentRoundStatus !== 1) {
      let statusMessage = t('error.bettingNotAvailable')
      if (currentRoundStatus === 2) {
        statusMessage = t('error.bettingClosedInProgress')
      } else if (currentRoundStatus === 4) {
        statusMessage = t('error.roundSettled')
      } else {
        statusMessage = t('error.roundNotOpen')
      }
      setBettingError(statusMessage)
      if (import.meta.env.DEV) {
        console.warn('⚠️ Betting blocked - roundStatus not 1:', {
          countdown: currentCountdown,
          roundStatus: currentRoundStatus,
          'Note': 'Backend requires roundStatus === 1 to accept bets'
        })
      }
      return
    }
    
    // If countdown/roundStatus are undefined, log a warning but allow betting
    // The backend will validate and return proper error if session is invalid
    if (import.meta.env.DEV && (currentCountdown === undefined || currentRoundStatus === undefined)) {
      console.warn('⚠️ Betting with undefined countdown/roundStatus - backend will validate:', {
        countdown: currentCountdown,
        roundStatus: currentRoundStatus,
        roundId: effectiveRoundId,
        tableId: tableId,
        'Note': 'This might indicate API failure (e.g., invalid session). Betting will proceed but may fail.'
      })
    }

    setIsSubmitting(true)
    setBettingError(null)

    // Calculate total of all pending bets
    let totalPendingBets = 0
    pendingBets.forEach((amount) => {
      if (amount > 0) {
        totalPendingBets += amount
      }
    })

    // Validate total of all bets (confirmed + pending) against bet limits
    // This ensures minimum limit is checked against total, not individual bets
    const totalConfirmedBets = bets.reduce((sum, bet) => sum + bet.amount, 0)
    const totalAllBets = totalConfirmedBets + totalPendingBets
    
    // Check if any pending bet is exactly 1 or 5 (single chip bets with chips 1 or 5)
    // Chips 1 and 5 are always allowed in all cases, all the time
    let hasChip1Or5Bet = false
    for (const amount of pendingBets.values()) {
      if (amount === 1 || amount === 5) {
        hasChip1Or5Bet = true
        break
      }
    }
    // Also check if currently selected chip is 1 or 5
    const isChip1Or5Selected = selectedChip === 1 || selectedChip === 5
    const hasChip1Or5 = hasChip1Or5Bet || isChip1Or5Selected
    
    // Minimum limit check: SIMPLIFIED LOGIC
    // 1. If total confirmed bets already meet minimum, ALWAYS allow any additional bets (no restrictions)
    // 2. If total (confirmed + pending) meets minimum, allow it
    // 3. If using chips 1 or 5, always allow (regardless of minimum)
    if (betLimitMin !== undefined && totalAllBets > 0) {
      if (import.meta.env.DEV) {
        console.log('🔍 Bet validation check:', {
          totalConfirmedBets,
          totalPendingBets,
          totalAllBets,
          betLimitMin,
          hasChip1Or5,
          selectedChip,
          pendingBets: Array.from(pendingBets.entries())
        })
      }
      
      // If total confirmed already meets minimum, allow ANY additional bets
      if (totalConfirmedBets >= betLimitMin) {
        if (import.meta.env.DEV) {
          console.log('✅ Allowing confirmation: Total confirmed bets already meet minimum')
        }
        // Already met minimum, allow all additional bets - no validation needed
        // Do nothing, allow confirmation to proceed
      }
      // If total confirmed doesn't meet minimum yet, check if total will meet it
      else if (totalAllBets >= betLimitMin) {
        if (import.meta.env.DEV) {
          console.log('✅ Allowing confirmation: Total (confirmed + pending) meets minimum')
        }
        // Total will meet minimum, allow it
        // Do nothing, allow confirmation to proceed
      }
      // If using chips 1 or 5, always allow
      else if (hasChip1Or5) {
        if (import.meta.env.DEV) {
          console.log('✅ Allowing confirmation: Using chips 1 or 5')
        }
        // Chips 1 and 5 are always allowed
        // Do nothing, allow confirmation to proceed
      }
      // Otherwise, block it
      else {
        if (import.meta.env.DEV) {
          console.log('❌ Blocking confirmation: Minimum not met and not using chips 1/5')
        }
        setBettingError(t('error.minimumBetAmount').replace('{amount}', formatBetAmountNoDecimals(betLimitMin)))
        setIsSubmitting(false)
        return
      }
    }
    
    // Validate individual bet amounts against maximum limit
    for (const [betType, amount] of pendingBets.entries()) {
      if (amount <= 0) continue
      
      // Maximum limit check: still applies to individual bet amount
      if (betLimitMax !== undefined && amount > betLimitMax) {
        const betTypeName = getBetTypeDisplayName(betType)
        setBettingError(t('error.betTypeMaximumBetAmount').replace('{betType}', betTypeName).replace('{amount}', formatBetAmountNoDecimals(betLimitMax)))
        setIsSubmitting(false)
        return
      }
    }

    try {
      // Don't fetch odds before betting - use cached odds from initial fetch
      // WebSocket provides real-time updates, and we already have odds from roundId change

      // Submit each bet to the backend
      const betPromises = Array.from(pendingBets.entries()).map(async ([betType, amount]) => {
        if (amount <= 0) return null

        const backendMapping = mapBetTypeToBackend(betType)
        let currentOdds = getOddsForBetType(betType)

        // Validate required fields - use effectiveRoundId
        if (!effectiveRoundId) {
          throw new Error('Round ID is required for betting')
        }

        // Retry function with fresh odds fetch on B250 error
        const placeBetWithRetry = async (retryCount = 0): Promise<any> => {
          const betAmount = Math.abs(amount) // Ensure positive amount
          
          // Fetch fresh odds before retry (only when retrying due to B250 error)
          // Prefer lobbyinfo.php per-table "no" as r_no; fallback to legacy construction
          if (retryCount > 0 && effectiveRoundId) {
            // Throttle this fetch to prevent excessive calls during retry
            const retryOddsKey = `odds_retry_${oddsRNo}_${betType}`
            if (!shouldThrottle(retryOddsKey, 1000)) {
              if (import.meta.env.DEV) {
                console.debug('⏸️ Throttled odds fetch during retry')
              }
            } else {
              try {
                const r_no = oddsRNo
                if (!r_no) {
                  throw new Error('Missing r_no from lobbyinfo (no fallback)')
                }
                const freshOddsResponse = await apiService.getOdds(r_no)
                completeThrottle(retryOddsKey)
                if (freshOddsResponse && freshOddsResponse.code === 'B100' && freshOddsResponse.data) {
                  // Handle both object format (keys like "21001:M") and array format
                  const oddsData = freshOddsResponse.data
                  if (typeof oddsData === 'object' && !Array.isArray(oddsData)) {
                    // Object format: find the odds for this zone
                    Object.values(oddsData).forEach((odd: any) => {
                      const zone = (odd.o_opentype || odd.zone || '').toUpperCase()
                      if (zone === backendMapping.zone.toUpperCase()) {
                        const oddsValue = typeof odd.o_odds === 'number' ? odd.o_odds : 
                                        typeof odd.o_odds === 'string' ? parseFloat(odd.o_odds) : null
                        if (oddsValue !== null && !isNaN(oddsValue)) {
                          currentOdds = oddsValue
                          if (import.meta.env.DEV) {
                            console.log(`🔄 Updated odds for ${betType} (retry ${retryCount}):`, currentOdds)
                          }
                        }
                      }
                    })
                  } else if (Array.isArray(oddsData)) {
                    // Array format
                    oddsData.forEach((odd: any) => {
                      const zone = (odd.o_opentype || odd.zone || '').toUpperCase()
                      if (zone === backendMapping.zone.toUpperCase()) {
                        const oddsValue = typeof odd.o_odds === 'number' ? odd.o_odds : 
                                        typeof odd.o_odds === 'string' ? parseFloat(odd.o_odds) : null
                        if (oddsValue !== null && !isNaN(oddsValue)) {
                          currentOdds = oddsValue
                          if (import.meta.env.DEV) {
                            console.log(`🔄 Updated odds for ${betType} (retry ${retryCount}):`, currentOdds)
                          }
                        }
                      }
                    })
                  }
                }
              } catch (error) {
                completeThrottle(retryOddsKey)
                // Continue with current odds if fetch fails
              }
            }
          }
          
          if (import.meta.env.DEV) {
            console.log('🎲 Preparing to place bet:', {
              betType,
              amount: betAmount,
              odds: currentOdds,
              tableId,
              roundId: effectiveRoundId,
              backendType: backendMapping.type,
              backendZone: backendMapping.zone,
              retryCount
            })
          }
          
          try {
            const response = await apiService.placeBet({
              t_id: tableId,
              r_id: effectiveRoundId,
              type: backendMapping.type,
              zone: backendMapping.zone,
              amount: betAmount,
              odds: currentOdds,
              cuid: `${betType}-${Date.now()}-${Math.random()}`,
              anyodds: 'Y' // Accept server odds automatically to prevent B250 errors
            })
            
            return response
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to place bet'
            
            // Retry once with fresh odds if B250 error (odds changed)
            if (errorMessage.includes('B250') && retryCount === 0) {
              if (import.meta.env.DEV) {
                console.log(`🔄 B250 error detected, retrying with fresh odds for ${betType}`)
              }
              return placeBetWithRetry(retryCount + 1)
            }
            
            throw error
          }
        }

        try {
          const betAmount = Math.abs(amount) // Ensure positive amount
          const response = await placeBetWithRetry()
          
          if (import.meta.env.DEV) {
            console.log('✅ Bet placed successfully:', {
              betType,
              amount: betAmount,
              responseCode: response.code,
              wagerNumbers: response.unsettle?.map((b: any) => b.w_no) || []
            })
          }

          // Don't update balance here - we'll update it once after all bets are confirmed
          // This prevents double deduction and ensures we use the final server balance
          return response
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to place bet'
          
          // Parse error code and show user-friendly message
          let userFriendlyMessage = errorMessage
          if (errorMessage.includes('B212')) {
            userFriendlyMessage = t('error.roundNotOpen')
          } else if (errorMessage.includes('B211')) {
            userFriendlyMessage = t('error.gameTableNotOpen')
          } else if (errorMessage.includes('B232')) {
            userFriendlyMessage = t('error.sessionExpired')
          } else if (errorMessage.includes('B201')) {
            userFriendlyMessage = t('error.insufficientBalance')
          } else if (errorMessage.includes('B250')) {
            userFriendlyMessage = t('error.oddsChanged')
          } else if (errorMessage.includes('B216')) {
            // B216: Amount outside bet-limit range
            // Backend validates each bet individually, not the total
            // If total confirmed bets already meet minimum, explain the limitation
            const totalConfirmed = bets.reduce((sum, bet) => sum + bet.amount, 0)
            const isChip1Or5Amount = amount === 1 || amount === 5
            if (totalConfirmed >= (betLimitMin || 0) && isChip1Or5Amount) {
              // User has met minimum but backend rejects individual small bets
              const minStr = betLimitMin !== undefined ? formatBetAmountNoDecimals(betLimitMin) : 'minimum'
              const totalStr = formatBetAmountNoDecimals(totalConfirmed)
              userFriendlyMessage = t('error.backendMinimumRequirement').replace('{min}', minStr).replace('{total}', totalStr)
            } else {
              const minStr = betLimitMin !== undefined ? formatBetAmountNoDecimals(betLimitMin) : 'required'
              userFriendlyMessage = t('error.amountOutsideRange').replace('{amount}', minStr)
            }
          }
          
          const betTypeName = getBetTypeDisplayName(betType)
          setBettingError(`${betTypeName}: ${userFriendlyMessage}`)
          throw error
        }
      })

      // Wait for all bets to be submitted and collect responses
      const responses = await Promise.all(betPromises.filter(p => p !== null))
      
      // Update balance ONCE after all bets are confirmed
      // Replace optimistic balance with real server balance from API
      if (responses.length > 0) {
        const lastResponse = responses[responses.length - 1]
        const connectionStatus = useGameStore.getState().connectionStatus
        const shouldFetchBalance = connectionStatus !== 'connected' // Only fetch if WebSocket not connected
        
        // Try to get balance from the last response first
        if (lastResponse.balance !== undefined && lastResponse.balance !== null) {
          const balanceValue = typeof lastResponse.balance === 'string' 
            ? parseFloat(lastResponse.balance) 
            : lastResponse.balance
          
          if (!isNaN(balanceValue) && isFinite(balanceValue)) {
            setAccountBalance(balanceValue)
            // Clear original balance tracking since bets are now confirmed
            setOriginalBalanceBeforePending(null)
            if (import.meta.env.DEV) {
              console.log('💰 Balance updated from bet response (replaced optimistic balance):', balanceValue)
            }
          } else if (shouldFetchBalance) {
            // Response balance invalid, fetch from API only if WebSocket disconnected
            try {
              await new Promise(resolve => setTimeout(resolve, 300))
              const updatedBalance = await apiService.getBalance()
              setAccountBalance(updatedBalance)
              // Clear original balance tracking since bets are now confirmed
              setOriginalBalanceBeforePending(null)
              if (import.meta.env.DEV) {
                console.log('💰 Balance updated from API after bet confirmation (replaced optimistic balance):', updatedBalance)
              }
            } catch (error) {
              if (import.meta.env.DEV) {
                console.warn('⚠️ Failed to fetch balance from API after bet:', error)
              }
            }
          }
        } else if (shouldFetchBalance) {
          // No balance in response, fetch from API only if WebSocket disconnected
          try {
            await new Promise(resolve => setTimeout(resolve, 300))
            const updatedBalance = await apiService.getBalance()
            setAccountBalance(updatedBalance)
            // Clear original balance tracking since bets are now confirmed
            setOriginalBalanceBeforePending(null)
            if (import.meta.env.DEV) {
              console.log('💰 Balance updated from API after bet confirmation (replaced optimistic balance):', updatedBalance)
            }
          } catch (error) {
            if (import.meta.env.DEV) {
              console.warn('⚠️ Failed to fetch balance from API after bet:', error)
            }
          }
        } else {
          // WebSocket connected - balance will be updated via WebSocket
          // Clear original balance tracking since bets are now confirmed
          setOriginalBalanceBeforePending(null)
          if (import.meta.env.DEV) {
            console.log('💰 Balance will be updated via WebSocket (connected) - optimistic balance cleared')
          }
        }
      }
      
      // After successful bet submission, fetch all wagers from server using wager_rid.php
      // This ensures we have the complete and accurate list of bets for the round
      if (responses.length > 0 && effectiveRoundId) {
        // Small delay to ensure server has processed the bets
        setTimeout(() => {
          fetchWagersForRound(effectiveRoundId, true)
        }, 300)
      }

      // Trigger shake animation for meron or wala bets
      const meronOrWalaBets = Array.from(pendingBets.keys()).filter(bt => bt === 'meron' || bt === 'wala')
      if (meronOrWalaBets.length > 0) {
        const betTypeToShake = meronOrWalaBets[0]
        setShakingBetType(betTypeToShake)
        
        // Remove shake class after animation completes
        setTimeout(() => {
          setShakingBetType(null)
        }, 500)
      }

      // Clear pending bets on success (allowing user to place more bets on other sides)
      setPendingBets(new Map())
      setActiveBetType(null)
      // Clear original balance tracking since bets are now confirmed
      setOriginalBalanceBeforePending(null)
      
      // Show success overlay
      setShowSuccess(true)
      if (successTimerRef.current) {
        window.clearTimeout(successTimerRef.current)
      }
      successTimerRef.current = window.setTimeout(() => {
        setShowSuccess(false)
        successTimerRef.current = null
      }, 3000)
    } catch (error) {
      // Error already set in catch block above
      // Restore original balance if bet confirmation failed
      if (originalBalanceBeforePending !== null) {
        setAccountBalance(originalBalanceBeforePending)
        setOriginalBalanceBeforePending(null)
        if (import.meta.env.DEV) {
          console.log('💰 Balance restored after bet confirmation failed')
        }
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [pendingBets, tableId, roundId, oddsRNo, isSubmitting, addBet, setAccountBalance, setBettingError, getOddsForBetType, validateBetAmount, fetchWagersForRound, t, bets, betLimitMin, formatBetAmountNoDecimals, originalBalanceBeforePending])


  /**
   * Clears all pending bets (NOT confirmed bets)
   * Can only clear bets during betting period (roundStatus === 1)
   * Disabled when fighting (roundStatus === 2) or submitting
   * Restores original balance when cancelling pending bets
   */
  const handleClearBets = useCallback(() => {
    // Prevent clearing if bets are being submitted (confirmed)
    if (isSubmitting) {
      return
    }
    
    // Check if betting is allowed (roundStatus === 1)
    const storeState = getGameStore.getState()
    const currentRoundStatus = roundStatus !== undefined ? roundStatus : storeState.roundStatus
    if (currentRoundStatus !== undefined && currentRoundStatus !== 1) {
      return
    }
    
    // Calculate total pending bets amount to restore balance correctly
    let totalPendingAmount = 0
    pendingBets.forEach((amount) => {
      totalPendingAmount += amount
    })
    
    // Restore balance by adding back the total pending bets amount
    // This restores the optimistic deductions made when placing pending bets
    if (totalPendingAmount > 0) {
      const currentBalance = storeState.accountBalance
      const restoredBalance = currentBalance + totalPendingAmount
      setAccountBalance(restoredBalance)
    }
    
    // Clear original balance tracking since we're canceling all pending bets
    if (originalBalanceBeforePending !== null) {
      setOriginalBalanceBeforePending(null)
    }
    
    // Only clear pending bets, NOT confirmed bets
    setPendingBets(new Map())
    // Reset the active bet type after clearing
    setActiveBetType(null)
    // DO NOT call clearBets() - that would clear confirmed bets too!
  }, [isSubmitting, roundStatus, originalBalanceBeforePending, setAccountBalance, pendingBets])

  /**
   * Rebet function: Places the same bets as the last round
   * Only places bets, does not confirm them - player needs to press confirm
   */
  const handleRebet = useCallback(() => {
    const lastBets = getLastRoundBets()
    if (lastBets.length === 0) {
      setBettingError(t('error.noPreviousBets'))
      return
    }
    
    // Check if betting is allowed
    const storeState = getGameStore.getState()
    const currentRoundStatus = roundStatus !== undefined ? roundStatus : storeState.roundStatus
    const currentCountdown = countdown !== undefined ? countdown : storeState.countdown
    
    if (currentCountdown !== undefined && currentCountdown <= 0) {
      setBettingError(t('error.bettingClosed'))
      return
    }
    
    if (currentRoundStatus !== undefined && currentRoundStatus !== 1) {
      setBettingError(t('error.bettingNotAvailable'))
      return
    }
    
    // Calculate total rebet amount
    let totalRebetAmount = 0
    lastBets.forEach((bet: Bet) => {
      totalRebetAmount += bet.amount
    })
    
    // Check if balance is sufficient before allowing rebet
    if (totalRebetAmount > 0) {
      const currentBalance = storeState.accountBalance
      const newBalance = currentBalance - totalRebetAmount
      if (newBalance < 0) {
        setBettingError(t('error.insufficientBalance'))
        return
      }
      
      // Store original balance before rebet if not already stored
      if (originalBalanceBeforePending === null) {
        setOriginalBalanceBeforePending(currentBalance)
      }
      
      // Deduct balance optimistically on client side
      setAccountBalance(newBalance)
    }
    
    // Add all last round bets to pending bets
    const newPendingBets = new Map<BetType, number>()
    lastBets.forEach((bet: Bet) => {
      const currentAmount = newPendingBets.get(bet.type) || 0
      newPendingBets.set(bet.type, currentAmount + bet.amount)
    })
    
    setPendingBets(newPendingBets)
    
    // Set active bet type to the first bet type if there's only one type
    const betTypes = Array.from(newPendingBets.keys())
    if (betTypes.length === 1) {
      setActiveBetType(betTypes[0])
    }
    
    if (import.meta.env.DEV) {
      console.log('🔄 Rebet placed:', {
        bets: lastBets.map((b: Bet) => ({ type: b.type, amount: b.amount })),
        pendingBets: Array.from(newPendingBets.entries())
      })
    }
  }, [getLastRoundBets, roundStatus, countdown, setBettingError, t, originalBalanceBeforePending, setAccountBalance])

  /**
   * Doubles all pending bet amounts
   * Can only double bets during betting period (roundStatus === 1)
   * Disabled when fighting (roundStatus === 2) or submitting
   * Deducts balance optimistically on client side (same as normal bets)
   */
  const handleDoubleBets = useCallback(() => {
    // Prevent doubling if bets are being submitted (confirmed)
    if (isSubmitting) {
      return
    }
    
    // Check if betting is allowed (roundStatus === 1)
    const storeState = getGameStore.getState()
    const currentRoundStatus = roundStatus !== undefined ? roundStatus : storeState.roundStatus
    if (currentRoundStatus !== undefined && currentRoundStatus !== 1) {
      return
    }
    
    // Calculate total additional amount to deduct (doubling means adding the same amount)
    let totalAdditionalAmount = 0
    pendingBets.forEach((amount) => {
      totalAdditionalAmount += amount // Doubling means adding the same amount again
    })
    
    // Check if balance is sufficient before allowing double
    if (totalAdditionalAmount > 0) {
      const currentBalance = storeState.accountBalance
      const newBalance = currentBalance - totalAdditionalAmount
      if (newBalance < 0) {
        setBettingError(t('error.insufficientBalance'))
        return
      }
      
      // Store original balance before doubling if not already stored
      if (originalBalanceBeforePending === null) {
        setOriginalBalanceBeforePending(currentBalance)
      }
      
      // Deduct additional amount optimistically on client side
      setAccountBalance(newBalance)
    }
    
    // Update pending bets to double the amounts
    setPendingBets((prevBets) => {
      const doubled = new Map<BetType, number>()
      prevBets.forEach((amount, betType) => {
        doubled.set(betType, amount * 2)
      })
      return doubled
    })
  }, [isSubmitting, roundStatus, pendingBets, originalBalanceBeforePending, setAccountBalance])

  /**
   * Gets the confirmed bet amount for a specific bet type from confirmed bets
   */
  const getConfirmedBetAmount = useCallback((betType: BetType): number => {
    return bets
      .filter(bet => bet.type === betType)
      .reduce((sum, bet) => sum + bet.amount, 0)
  }, [bets])

  /**
   * Gets the pending bet amount for a specific bet type from pending bets
   */
  const getPendingBetAmount = useCallback((betType: BetType): number => {
    return pendingBets.get(betType) || 0
  }, [pendingBets])


  /**
   * Removes a flying chip from the animation queue
   * @param chipId - ID of the flying chip to remove
   */
  const handleFlyingChipComplete = useCallback((chipId: string) => {
    setFlyingChips((prev) => prev.filter((chip) => chip.id !== chipId))
  }, [])

  /**
   * Calculates total amount of all pending bets
   * @returns Total bet amount
   */
  const totalBetAmount = useMemo(() => {
    let total = 0
    pendingBets.forEach((amount) => {
      total += amount
    })
    return total
  }, [pendingBets])

  /**
   * Determines if betting is currently closed/disabled
   * Betting is ONLY allowed when roundStatus === 1 (Betting status) AND table is live (not in maintenance)
   * Betting is closed for ALL other statuses: Fighting (2), Settled (4), Waiting (0), Maintenance, etc.
   */
  const isBettingClosed = useMemo(() => {
    if (import.meta.env.DEV) {
      console.log('🔍 isBettingClosed check:', {
        roundStatus,
        isLive,
        'Note': roundStatus === 1 && isLive !== false ? '✅ Should be OPEN' : '🚫 Should be CLOSED'
      })
    }
    
    // CRITICAL: Check if table is in maintenance first
    // If table is not live (isLive === false), betting is disabled regardless of roundStatus
    if (isLive === false) {
      if (import.meta.env.DEV) {
        console.log('🚫 Betting disabled - table is in maintenance (isLive === false)')
      }
      return true // Table is in maintenance - disable betting
    }
    
    // CRITICAL: Betting is ONLY allowed when roundStatus === 1 (Betting)
    // All other statuses (2=Fighting, 4=Settled, 0=Waiting, undefined=not initialized) disable betting
    if (roundStatus !== undefined) {
      // Only allow betting when roundStatus is exactly 1
      // Any other value (2, 4, 0, etc.) means betting is closed
      const closed = roundStatus !== 1
      if (import.meta.env.DEV) {
        console.log('🔍 Betting status:', {
          roundStatus,
          isClosed: closed,
          'Note': roundStatus === 1 ? '✅ Betting OPEN' : '🚫 Betting CLOSED'
        })
      }
      return closed
    }
    
    // If roundStatus is undefined, betting is closed (safe default - table not initialized or in maintenance)
    if (import.meta.env.DEV) {
      console.log('🚫 Betting disabled - roundStatus is undefined (not initialized)')
    }
    return true
  }, [roundStatus, isLive])

  return (
    <div className="betting-interface">
      <div className={`betting-area ${isBettingClosed ? 'betting-disabled' : ''}`}>        

        {/* Main Bets - Top row: Meron and Wala side by side */}
        <div className="main-bets-top flex-1">
          <button 
            ref={(el) => el && (betButtonRefs.current.meron = el)}
            className={`bet-button main-bet meron ${(activeBetType !== null && activeBetType !== 'meron') ? 'disabled' : ''} ${shakingBetType === 'meron' ? 'shake' : ''} ${isBettingClosed ? 'disabled' : ''}`}
            onClick={() => handleBetClick('meron')}
            disabled={isBettingClosed || (activeBetType !== null && activeBetType !== 'meron')}
          >
            <span className="bet-label-large">{t('bet.label.meron')}</span>
            <span className="bet-odds">{getOddsForBetType('meron')}</span>
            <div className="bet-stats">
              {getPendingBetAmount('meron') > 0 && (
                <span className="bet-amount-display pending">{formatBetAmountNoDecimals(getPendingBetAmount('meron'))}</span>
              )}
              {getConfirmedBetAmount('meron') > 0 && (
                <span className="bet-amount-display confirmed">{formatBetAmountNoDecimals(getConfirmedBetAmount('meron'))}</span>
              )}
              {getPendingBetAmount('meron') === 0 && getConfirmedBetAmount('meron') === 0 && (
                <span className="bet-amount-display">{formatBetAmountNoDecimals(0)}</span>
              )}
            </div>
          </button>
          <button 
            ref={(el) => el && (betButtonRefs.current.wala = el)}
            className={`bet-button main-bet wala ${(activeBetType !== null && activeBetType !== 'wala') ? 'disabled' : ''} ${shakingBetType === 'wala' ? 'shake' : ''} ${isBettingClosed ? 'disabled' : ''}`}
            onClick={() => handleBetClick('wala')}
            disabled={isBettingClosed || (activeBetType !== null && activeBetType !== 'wala')}
          >
            <span className="bet-label-large">{t('bet.label.wala')}</span>
            <span className="bet-odds">{getOddsForBetType('wala')}</span>
            <div className="bet-stats">
              {getPendingBetAmount('wala') > 0 && (
                <span className="bet-amount-display pending">{formatBetAmountNoDecimals(getPendingBetAmount('wala'))}</span>
              )}
              {getConfirmedBetAmount('wala') > 0 && (
                <span className="bet-amount-display confirmed">{formatBetAmountNoDecimals(getConfirmedBetAmount('wala'))}</span>
              )}
              {getPendingBetAmount('wala') === 0 && getConfirmedBetAmount('wala') === 0 && (
                <span className="bet-amount-display">{formatBetAmountNoDecimals(0)}</span>
              )}
            </div>
          </button>
        </div>

        {/* Bottom row: Draw centered */}
        <div className="main-bets-bottom flex-1">
          <button 
            ref={(el) => el && (betButtonRefs.current.draw = el)}
            className={`bet-button main-bet draw ${(activeBetType !== null && activeBetType !== 'draw') ? 'disabled' : ''} ${isBettingClosed ? 'disabled' : ''}`}
            onClick={() => handleBetClick('draw')}
            disabled={isBettingClosed || (activeBetType !== null && activeBetType !== 'draw')}
          >
            <span className="bet-label-large">{t('bet.label.draw')}</span>
            <span className="bet-odds">{getOddsForBetType('draw')}</span>
            <div className="bet-stats">
              {getPendingBetAmount('draw') > 0 && (
                <span className="bet-amount-display pending">{formatBetAmountNoDecimals(getPendingBetAmount('draw'))}</span>
              )}
              {getConfirmedBetAmount('draw') > 0 && (
                <span className="bet-amount-display confirmed">{formatBetAmountNoDecimals(getConfirmedBetAmount('draw'))}</span>
              )}
              {getPendingBetAmount('draw') === 0 && getConfirmedBetAmount('draw') === 0 && (
                <span className="bet-amount-display">{formatBetAmountNoDecimals(0)}</span>
              )}
            </div>
          </button>
        </div>

        {/* Bottom Row - Side bets (8 buttons on mobile, 2 on desktop) */}

      </div>

      {/* Flying Chips Container - Use portal to render at body level so they're visible even when betting panel is hidden in PC mode */}
      {typeof document !== 'undefined' && createPortal(
        flyingChips.map((chip) => (
          <FlyingChip
            key={chip.id}
            chipValue={chip.chipValue}
            startX={chip.startX}
            startY={chip.startY}
            endX={chip.endX}
            endY={chip.endY}
            onAnimationComplete={() => handleFlyingChipComplete(chip.id)}
          />
        )),
        document.body
      )}

      {/* Success overlay (appears on confirm) */}
      <SuccessOverlay show={showSuccess} onClose={() => setShowSuccess(false)} />

      {/* Error display */}
      {bettingError && (
        <div 
          className={`betting-error ${errorFading ? 'fade-out' : 'fade-in'}`}
          style={{
            position: 'fixed',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#dc2626',
            color: 'white',
            padding: '12px 24px',
            borderRadius: '8px',
            zIndex: 10000,
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
            maxWidth: '90%',
            textAlign: 'center',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'opacity 0.5s ease-out, transform 0.5s ease-out'
          }}
        >
          {bettingError}
          <button
            onClick={() => {
              setErrorFading(true)
              setTimeout(() => {
                setBettingError(null)
                setErrorFading(false)
              }, 500)
            }}
            style={{
              marginLeft: '12px',
              background: 'none',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              fontSize: '18px',
              fontWeight: 'bold'
            }}
            aria-label="Close error"
          >
            ×
          </button>
        </div>
      )}

      {/* Bottom Control Bar - Two rows: Top (dark gray) and Bottom (black) */}
      <div className="bottom-control-bar flex-shrink-0" style={{overflow:"visible"}}>
        {/* Top Row: Dark Gray - Controls with Timestamp */}
        <div className="control-bar-top">
          <Controls 
            onConfirm={handleConfirmBets}
            onClear={handleClearBets}
            onDouble={handleDoubleBets}
            onRebet={handleRebet}
            onUndo={() => {
              // Prevent undo if bets are being submitted (confirmed) or fighting
              if (isSubmitting) {
                return
              }
              
              // Check if betting is allowed (roundStatus === 1)
              const storeState = getGameStore.getState()
              const currentRoundStatus = roundStatus !== undefined ? roundStatus : storeState.roundStatus
              if (currentRoundStatus !== undefined && currentRoundStatus !== 1) {
                return
              }
              
              // Remove last bet
              const lastBet = Array.from(pendingBets.entries()).pop()
              if (lastBet) {
                const [betType, amount] = lastBet
                setPendingBets(prev => {
                  const newBets = new Map(prev)
                  newBets.delete(betType)
                  
                  // Restore balance for the removed bet
                  const storeState = getGameStore.getState()
                  const currentBalance = storeState.accountBalance
                  const restoredBalance = currentBalance + amount
                  setAccountBalance(restoredBalance)
                  
                  // If no more bets, reset the active bet type and restore original balance
                  if (newBets.size === 0) {
                    setActiveBetType(null)
                    // Restore to original balance if all pending bets are removed
                    if (originalBalanceBeforePending !== null) {
                      setAccountBalance(originalBalanceBeforePending)
                      setOriginalBalanceBeforePending(null)
                    }
                  }
                  
                  return newBets
                })
              }
            }}
            chipSlot={<SelectedChipDisplay />}
            pendingBetAmount={totalBetAmount}
            isSubmitting={isSubmitting}
            confirmedBetsCount={bets.length}
            isBettingClosed={isBettingClosed}
          />
        </div>
        
        {/* Bottom Row: Black - Account Info */}
        <div className="control-bar-bottom">
          <AccountInfo />
        </div>
      </div>
    </div>
  )
}

export default BettingInterface

