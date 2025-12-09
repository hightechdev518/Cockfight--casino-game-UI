import { useCallback, useMemo, useState, useRef, useEffect } from 'react'
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
  const { 
    selectedChip, 
    addBet, 
    clearBets, 
    tableId, 
    roundId, 
    currentRound,
    roundStatus,
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

  // Removed restriction: Users can now bet on multiple sides in the same round
  // All bets are properly communicated with the server via API calls

  /**
   * Constructs r_no format for odds API
   * Format: YYMMDD + roundId (e.g., "2512091267712" = 251209 + 1267712)
   * Uses UTC date to match server timezone
   * If roundId already has date prefix, use it as-is
   */
  const constructRNo = useCallback((roundId: string | undefined): string | null => {
    if (!roundId) return null
    
    // If roundId is already in full format (13+ digits), use it as-is
    if (roundId.length >= 13) {
      return roundId
    }
    
    // Otherwise, construct it: YYMMDD + roundId
    // Use UTC+8 timezone to match server timezone (Asia/Shanghai)
    // Server uses UTC+8, so we need to get the date in that timezone
    const now = new Date()
    // Get UTC time in milliseconds
    const utcTime = now.getTime()
    // Add 8 hours (8 * 60 * 60 * 1000 ms) to convert to UTC+8
    const utc8Time = new Date(utcTime + (8 * 60 * 60 * 1000))
    // Extract date components from UTC+8 time
    const year = utc8Time.getUTCFullYear().toString().slice(-2) // Last 2 digits of year
    const month = (utc8Time.getUTCMonth() + 1).toString().padStart(2, '0') // 01-12
    const day = utc8Time.getUTCDate().toString().padStart(2, '0') // 01-31
    const datePrefix = `${year}${month}${day}` // YYMMDD format
    
    if (import.meta.env.DEV) {
      console.log('📅 Constructing r_no (UTC+8):', {
        localDate: now.toLocaleString(),
        utc8Date: utc8Time.toISOString(),
        datePrefix,
        roundId,
        r_no: `${datePrefix}${roundId}`
      })
    }
    
    return `${datePrefix}${roundId}`
  }, [])

  /**
   * Fetches odds from API for the current round
   * Note: Odds API uses r_no format: YYMMDD + roundId (e.g., "2512091267712")
   * Format: POST /odds.php with form data: sess_id, r_no, uniqueid
   */
  const fetchOdds = useCallback(async () => {
    // Throttle odds fetching - only fetch once per roundId
    const oddsKey = `odds_${roundId}_${tableId}`
    if (!shouldThrottle(oddsKey, 5000)) {
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

    // Construct r_no: YYMMDD + roundId format (e.g., "2512091267712")
    const r_no = constructRNo(roundId)
    
    if (!r_no) {
      if (import.meta.env.DEV) {
        console.error('❌ Cannot fetch odds: No roundId available to construct r_no', { 
          currentRound, 
          roundId,
          tableId,
          'NOTE': 'r_no requires roundId (trid) to construct YYMMDD + roundId format'
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
  }, [roundId, constructRNo, tableId])

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
  const prevOddsRoundIdRef = useRef<string | undefined>(undefined)
  
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('🔍 Odds fetch effect triggered:', {
        roundId,
        prevRoundId: prevOddsRoundIdRef.current,
        hasRoundId: !!roundId,
        roundIdChanged: roundId !== undefined && roundId !== prevOddsRoundIdRef.current,
        isInitialMount: prevOddsRoundIdRef.current === undefined
      })
    }
    
    // Only fetch if roundId actually changed (needed for r_no construction)
    if (roundId !== undefined && roundId !== prevOddsRoundIdRef.current) {
      if (import.meta.env.DEV) {
        console.log('🔄 RoundId changed, fetching odds:', {
          roundId,
          prevRoundId: prevOddsRoundIdRef.current
        })
      }
      fetchOdds()
      prevOddsRoundIdRef.current = roundId
    } else if (roundId !== undefined && prevOddsRoundIdRef.current === undefined) {
      // Initial fetch on mount if we have roundId
      if (import.meta.env.DEV) {
        console.log('🔄 Initial odds fetch on mount (roundId available):', roundId)
      }
      fetchOdds()
      prevOddsRoundIdRef.current = roundId
    } else if (!roundId) {
      if (import.meta.env.DEV) {
        console.warn('⚠️ Cannot fetch odds: roundId is not available yet', {
          roundId,
          currentRound,
          tableId
        })
      }
    }
  }, [roundId, fetchOdds, constructRNo, currentRound, tableId])

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

  // Odds are fetched once when roundId changes (handled by the useEffect above)
  // WebSocket 2 provides real-time odds updates, so no periodic polling needed

  /**
   * Fetches all wagers for the current round from server using wager_rid.php
   * This syncs bets from server to ensure UI matches server state
   */
  const fetchWagersForRound = useCallback(async (r_id: string | undefined) => {
    if (!r_id) {
      if (import.meta.env.DEV) {
        console.warn('⚠️ Cannot fetch wagers: r_id (roundId) is not available')
      }
      return
    }

    try {
      if (import.meta.env.DEV) {
        console.log('📋 Fetching wagers for round:', r_id)
      }

      const wagersResponse = await apiService.getWagersByRound(r_id)
      
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
  useEffect(() => {
    // Only fetch wagers during betting period (roundStatus === 1)
    if (roundStatus !== 1 || !roundId) return

    // Initial fetch when betting starts
    if (import.meta.env.DEV) {
      console.log('🔄 Betting period started (roundStatus === 1), fetching wagers')
    }
    fetchWagersForRound(roundId)

    // Poll every 10 seconds to keep bets in sync (similar to original site)
    const intervalId = setInterval(() => {
      if (import.meta.env.DEV) {
        console.log('🔄 Periodic wager sync (every 10s)')
      }
      fetchWagersForRound(roundId)
    }, 10000) // Refresh every 10 seconds

    return () => {
      clearInterval(intervalId)
    }
  }, [roundStatus, roundId, fetchWagersForRound])

  // Fetch balance when round is settled (roundStatus becomes 4)
  useEffect(() => {
    const handleRoundSettled = async (event: CustomEvent) => {
      const settledRoundId = event.detail?.roundId
      if (import.meta.env.DEV) {
        console.log('💰 Round settled event received, fetching balance:', settledRoundId)
      }
      
      // Throttle balance fetch to prevent duplicate calls
      const balanceKey = `balance_settled_event_${settledRoundId}`
      if (!shouldThrottle(balanceKey, 2000)) {
        if (import.meta.env.DEV) {
          console.debug('⏸️ Throttled balance fetch from settlement event')
        }
        return
      }
      
      // Fetch balance after a short delay to ensure server has processed settlement
      setTimeout(async () => {
        try {
          const balance = await apiService.getBalance()
          completeThrottle(balanceKey)
          setAccountBalance(balance)
          if (import.meta.env.DEV) {
            console.log('💰 Balance updated after round settlement:', balance)
          }
        } catch (error) {
          if (import.meta.env.DEV) {
            console.error('❌ Failed to fetch balance after settlement:', error)
          }
        }
      }, 500) // Small delay to ensure server has processed settlement
    }

    window.addEventListener('round_settled', handleRoundSettled as unknown as EventListener)
    return () => {
      window.removeEventListener('round_settled', handleRoundSettled as unknown as EventListener)
    }
  }, [setAccountBalance])

  // Also watch roundStatus directly and fetch balance when it becomes 4
  // Use ref to track previous status to avoid multiple fetches
  const prevRoundStatusRef2 = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (roundStatus === 4 && prevRoundStatusRef2.current !== 4) {
      // Throttle balance fetch to prevent multiple simultaneous calls
      const balanceKey = `balance_settlement_${roundId}`
      if (!shouldThrottle(balanceKey, 2000)) {
        if (import.meta.env.DEV) {
          console.debug('⏸️ Throttled balance fetch after settlement')
        }
        return
      }
      
      // Fetch balance when round is settled (only once per settlement)
      const fetchSettledBalance = async () => {
        // Retry logic: try multiple times with increasing delays
        // Settlement might take a moment to process on server
        const maxRetries = 3
        const delays = [1000, 2000, 3000] // 1s, 2s, 3s
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            await new Promise(resolve => setTimeout(resolve, delays[attempt]))
            const balance = await apiService.getBalance()
            completeThrottle(balanceKey)
            setAccountBalance(balance)
            if (import.meta.env.DEV) {
              console.log(`💰 Balance updated after round settlement (attempt ${attempt + 1}/${maxRetries}):`, balance)
            }
            return // Success, exit retry loop
          } catch (error) {
            if (import.meta.env.DEV) {
              console.warn(`⚠️ Balance fetch attempt ${attempt + 1}/${maxRetries} failed:`, error)
            }
            // If last attempt, log error
            if (attempt === maxRetries - 1) {
              if (import.meta.env.DEV) {
                console.error('❌ Failed to fetch balance after settlement after all retries:', error)
              }
            }
          }
        }
      }
      fetchSettledBalance()
    }
    prevRoundStatusRef2.current = roundStatus
  }, [roundStatus, setAccountBalance])

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
      
      // Clear odds map to force fresh fetch for new table
      setOddsMap(new Map())
      
      if (import.meta.env.DEV) {
        console.log('🔄 Table changed, resetting betting state. Previous:', prevTableIdRef.current, 'New:', tableId)
      }
    }
    prevTableIdRef.current = tableId
  }, [tableId, clearBets, setBettingError])

  // Try to fetch roundId if missing
  useEffect(() => {
    if (!roundId && tableId) {
      const fetchRoundId = async () => {
        // Try multiple sources
        try {
          // Method 1: Try odds API if we have roundId and session
          // Note: odds API requires r_no format (YYMMDD + roundId), not just roundId
          const storeState = getGameStore.getState()
          const currentRoundId = storeState.roundId
          if (currentRoundId && sessionManager.getSessionId()) {
            try {
              // Construct r_no: YYMMDD + roundId format
              const r_no = constructRNo(currentRoundId)
              if (!r_no) {
                throw new Error('Cannot construct r_no')
              }
              const oddsResponse = await apiService.getOdds(r_no)
              if (oddsResponse && oddsResponse.code === 'B100' && oddsResponse.data) {
                // Odds API doesn't return r_id, so we can't use it to fetch roundId
                // This method is mainly for getting odds, not roundId
                if (import.meta.env.DEV) {
                  console.log('✅ Fetched odds from API (BettingInterface)')
                }
                // Don't return - continue to try other methods for roundId
              }
            } catch (error) {
              // Odds API failed, try next method
            }
          }
          
          // Method 2: Try public history (no session required)
          try {
            const publicHistory = await apiService.getPublicHistory(tableId)
            if (publicHistory && publicHistory.data) {
              const historyData = publicHistory.data
              if (historyData.drawresult && historyData.drawresult[tableId]) {
                const drawResults = historyData.drawresult[tableId]
                if (Array.isArray(drawResults) && drawResults.length > 0) {
                  const latestRound = drawResults[0] as any // Type assertion for r_id which may exist in API response
                  if (latestRound.r_id) {
                    const { setRoundId } = getGameStore.getState()
                    setRoundId(latestRound.r_id.toString())
                    if (import.meta.env.DEV) {
                      console.log('✅ Fetched roundId from public history (BettingInterface):', latestRound.r_id)
                    }
                    return
                  } else if (latestRound.r_no) {
                    // Use round number as fallback
                    const { setRoundId } = getGameStore.getState()
                    setRoundId(latestRound.r_no.toString())
                    if (import.meta.env.DEV) {
                      console.log('✅ Using round number as roundId from public history (BettingInterface):', latestRound.r_no)
                    }
                    return
                  }
                }
              }
            }
          } catch (error) {
            if (import.meta.env.DEV) {
              console.warn('⚠️ Could not fetch roundId from public history (BettingInterface):', error)
            }
          }
        } catch (error) {
          if (import.meta.env.DEV) {
            console.warn('⚠️ Could not fetch roundId (BettingInterface):', error)
          }
        }
      }
      
      fetchRoundId()
    }
  }, [roundId, currentRound, tableId, constructRNo])

  /**
   * Validates bet amount against bet limits from API
   * @param amount - Bet amount to validate
   * @returns Error message if invalid, null if valid
   */
  const validateBetAmount = useCallback((amount: number): string | null => {
    if (betLimitMin !== undefined && amount < betLimitMin) {
      return `Minimum bet amount is ${betLimitMin.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`
    }
    if (betLimitMax !== undefined && amount > betLimitMax) {
      return `Maximum bet amount is ${betLimitMax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`
    }
    return null
  }, [betLimitMin, betLimitMax])

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
      setBettingError('Betting is closed. Please wait for the next betting period.')
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
      let statusMessage = 'Betting is not available'
      if (currentRoundStatus === 2) {
        statusMessage = 'Betting is closed. The round is in progress.'
      } else if (currentRoundStatus === 4) {
        statusMessage = 'This round has been settled. Please wait for the next round.'
      } else {
        statusMessage = 'Round/session is not open for betting. Please wait for the next betting period.'
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

    setPendingBets((prevBets) => {
      const currentAmount = prevBets.get(betType) || 0
      const newAmount = currentAmount + selectedChip
      
      // Only validate maximum limit when adding chips - allow below minimum
      // Minimum validation will happen when confirming the bet
      if (betLimitMax !== undefined && newAmount > betLimitMax) {
        setBettingError(`Maximum bet amount is ${betLimitMax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`)
        return prevBets // Don't update if it would exceed maximum limit
      }
      
      return new Map(prevBets).set(betType, newAmount)
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
      }, [selectedChip, activeBetType, countdown, roundStatus, setBettingError, validateBetAmount])

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
      setBettingError('Table ID is missing. Please refresh the page.')
      return
    }
    if (!effectiveRoundId) {
      setBettingError('Round ID is missing. Please wait for round data to load or refresh the page.')
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
      setBettingError('Betting is closed. Please wait for the next betting period.')
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
      let statusMessage = 'Betting is not available'
      if (currentRoundStatus === 2) {
        statusMessage = 'Betting is closed. The round is in progress.'
      } else if (currentRoundStatus === 4) {
        statusMessage = 'This round has been settled. Please wait for the next round.'
      } else {
        statusMessage = 'Round/session is not open for betting. Please wait for the next betting period.'
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

    // Validate all pending bets against bet limits before submission
    for (const [betType, amount] of pendingBets.entries()) {
      if (amount <= 0) continue
      
      const amountError = validateBetAmount(amount)
      if (amountError) {
        setBettingError(`${getBetTypeDisplayName(betType)}: ${amountError}`)
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
          // Use roundId to construct r_no (YYMMDD + roundId format)
          if (retryCount > 0 && effectiveRoundId) {
            // Throttle this fetch to prevent excessive calls during retry
            const retryOddsKey = `odds_retry_${effectiveRoundId}_${betType}`
            if (!shouldThrottle(retryOddsKey, 1000)) {
              if (import.meta.env.DEV) {
                console.debug('⏸️ Throttled odds fetch during retry')
              }
            } else {
              try {
                const r_no = constructRNo(effectiveRoundId)
                if (!r_no) {
                  throw new Error('Cannot construct r_no for odds fetch')
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

          // Always fetch balance from API after bet confirmation
          // This ensures balance is accurate and reflects server-side calculations
          // Add a small delay to allow server to process the bet and update balance
          try {
            // Wait 300ms before fetching balance to ensure server has processed the bet
            await new Promise(resolve => setTimeout(resolve, 300))
            
            const updatedBalance = await apiService.getBalance()
            setAccountBalance(updatedBalance)
            if (import.meta.env.DEV) {
              console.log('💰 Balance updated from API after bet confirmation:', updatedBalance)
            }
          } catch (error) {
            // Fallback to response.balance if API fetch fails
            if (import.meta.env.DEV) {
              console.warn('⚠️ Failed to fetch balance from API after bet:', {
                error: error instanceof Error ? error.message : error,
                errorDetails: error,
                responseBalance: response.balance,
                responseCode: response.code,
                responseMsg: response.msg
              })
            }
            
            if (response.balance !== undefined && response.balance !== null) {
              // Handle string or number balance from response
              const balanceValue = typeof response.balance === 'string' 
                ? parseFloat(response.balance) 
                : response.balance
              
              if (!isNaN(balanceValue) && isFinite(balanceValue)) {
                setAccountBalance(balanceValue)
                if (import.meta.env.DEV) {
                  console.log('✅ Using response.balance as fallback:', balanceValue)
                }
              } else {
                if (import.meta.env.DEV) {
                  console.error('❌ Response balance is invalid:', response.balance)
                }
              }
            } else {
              if (import.meta.env.DEV) {
                console.error('❌ No balance available in response or API')
              }
            }
          }

          // Note: We'll sync all bets from server after all bets are submitted
          // The response contains allbets/unsettle with ALL bets for the round
          // This ensures we show all bets the user has placed, including bets on multiple sides

          return response
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to place bet'
          
          // Parse error code and show user-friendly message
          let userFriendlyMessage = errorMessage
          if (errorMessage.includes('B212')) {
            userFriendlyMessage = 'Round/session is not open for betting. Please wait for the next betting period.'
          } else if (errorMessage.includes('B211')) {
            userFriendlyMessage = 'Game/table is not open for betting.'
          } else if (errorMessage.includes('B232')) {
            userFriendlyMessage = 'Session expired. Please refresh the page.'
          } else if (errorMessage.includes('B201')) {
            userFriendlyMessage = 'Insufficient balance.'
          } else if (errorMessage.includes('B250')) {
            userFriendlyMessage = 'Odds have changed. The bet was retried automatically but still failed. Please try again.'
          }
          
          setBettingError(`${getBetTypeDisplayName(betType)}: ${userFriendlyMessage}`)
          throw error
        }
      })

      // Wait for all bets to be submitted and collect responses
      const responses = await Promise.all(betPromises.filter(p => p !== null))
      
      // After successful bet submission, fetch all wagers from server using wager_rid.php
      // This ensures we have the complete and accurate list of bets for the round
      if (responses.length > 0 && roundId) {
        // Small delay to ensure server has processed the bets
        setTimeout(() => {
          fetchWagersForRound(roundId)
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
    } finally {
      setIsSubmitting(false)
    }
  }, [pendingBets, tableId, roundId, isSubmitting, addBet, setAccountBalance, setBettingError, getOddsForBetType, validateBetAmount, constructRNo, fetchWagersForRound])


  /**
   * Clears all pending bets
   * Can only clear bets during betting period (roundStatus === 1)
   * Disabled when fighting (roundStatus === 2) or submitting
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
    
    setPendingBets(new Map())
    // Reset the active bet type after clearing
    setActiveBetType(null)
    clearBets()
  }, [clearBets, isSubmitting, roundStatus])

  /**
   * Rebet function: Places the same bets as the last round
   * Only places bets, does not confirm them - player needs to press confirm
   */
  const handleRebet = useCallback(() => {
    const lastBets = getLastRoundBets()
    if (lastBets.length === 0) {
      setBettingError('No previous bets to rebet.')
      return
    }
    
    // Check if betting is allowed
    const storeState = getGameStore.getState()
    const currentRoundStatus = roundStatus !== undefined ? roundStatus : storeState.roundStatus
    const currentCountdown = countdown !== undefined ? countdown : storeState.countdown
    
    if (currentCountdown !== undefined && currentCountdown <= 0) {
      setBettingError('Betting is closed. Please wait for the next betting period.')
      return
    }
    
    if (currentRoundStatus !== undefined && currentRoundStatus !== 1) {
      setBettingError('Betting is not available. Please wait for the next betting period.')
      return
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
  }, [getLastRoundBets, roundStatus, countdown, setBettingError])

  /**
   * Doubles all pending bet amounts
   * Can only double bets during betting period (roundStatus === 1)
   * Disabled when fighting (roundStatus === 2) or submitting
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
    
    setPendingBets((prevBets) => {
      const doubled = new Map<BetType, number>()
      prevBets.forEach((amount, betType) => {
        doubled.set(betType, amount * 2)
      })
      return doubled
    })
  }, [isSubmitting, roundStatus])

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
   * Betting is closed when:
   * - roundStatus is not 1 (betting period)
   * - countdown is 0 or negative
   * - countdown is undefined (not betting time)
   */
  const isBettingClosed = useMemo(() => {
    const storeState = getGameStore.getState()
    const currentRoundStatus = roundStatus !== undefined ? roundStatus : storeState.roundStatus
    const currentCountdown = countdown !== undefined ? countdown : storeState.countdown
    
    // Betting is closed if roundStatus is not 1
    if (currentRoundStatus !== undefined && currentRoundStatus !== 1) {
      return true
    }
    
    // Betting is closed if countdown is 0 or negative
    if (currentCountdown !== undefined && currentCountdown <= 0) {
      return true
    }
    
    // Betting is closed if both are undefined (not initialized yet)
    if (currentRoundStatus === undefined && currentCountdown === undefined) {
      return true
    }
    
    return false
  }, [roundStatus, countdown])

  return (
    <div className="betting-interface">
      <div className={`betting-area ${isBettingClosed ? 'betting-disabled' : ''}`}>        

        {/* Main Bets - Top row: Meron and Wala side by side */}
        <div className="main-bets-top flex-1">
          <button 
            ref={(el) => el && (betButtonRefs.current.meron = el)}
            className={`bet-button main-bet meron ${(activeBetType !== null && activeBetType !== 'meron') ? 'disabled' : ''} ${shakingBetType === 'meron' ? 'shake' : ''}`}
            onClick={() => handleBetClick('meron')}
            disabled={(activeBetType !== null && activeBetType !== 'meron')}
          >
            <span className="bet-label-large">Meron</span>
            <span className="bet-odds">{getOddsForBetType('meron')}</span>
            <div className="bet-stats">
              {getPendingBetAmount('meron') > 0 && (
                <span className="bet-amount-display pending">{getPendingBetAmount('meron').toFixed(2)}</span>
              )}
              {getConfirmedBetAmount('meron') > 0 && (
                <span className="bet-amount-display confirmed">{getConfirmedBetAmount('meron').toFixed(2)}</span>
              )}
              {getPendingBetAmount('meron') === 0 && getConfirmedBetAmount('meron') === 0 && (
                <span className="bet-amount-display">0.00</span>
              )}
            </div>
          </button>
          <button 
            ref={(el) => el && (betButtonRefs.current.wala = el)}
            className={`bet-button main-bet wala ${(activeBetType !== null && activeBetType !== 'wala') ? 'disabled' : ''} ${shakingBetType === 'wala' ? 'shake' : ''}`}
            onClick={() => handleBetClick('wala')}
            disabled={(activeBetType !== null && activeBetType !== 'wala')}
          >
            <span className="bet-label-large">Wala</span>
            <span className="bet-odds">{getOddsForBetType('wala')}</span>
            <div className="bet-stats">
              {getPendingBetAmount('wala') > 0 && (
                <span className="bet-amount-display pending">{getPendingBetAmount('wala').toFixed(2)}</span>
              )}
              {getConfirmedBetAmount('wala') > 0 && (
                <span className="bet-amount-display confirmed">{getConfirmedBetAmount('wala').toFixed(2)}</span>
              )}
              {getPendingBetAmount('wala') === 0 && getConfirmedBetAmount('wala') === 0 && (
                <span className="bet-amount-display">0.00</span>
              )}
            </div>
          </button>
        </div>

        {/* Bottom row: Draw centered */}
        <div className="main-bets-bottom flex-1">
          <button 
            ref={(el) => el && (betButtonRefs.current.draw = el)}
            className={`bet-button main-bet draw ${(activeBetType !== null && activeBetType !== 'draw') ? 'disabled' : ''}`}
            onClick={() => handleBetClick('draw')}
            disabled={(activeBetType !== null && activeBetType !== 'draw')}
          >
            <span className="bet-label-large">Draw</span>
            <span className="bet-odds">{getOddsForBetType('draw')}</span>
            <div className="bet-stats">
              {getPendingBetAmount('draw') > 0 && (
                <span className="bet-amount-display pending">{getPendingBetAmount('draw').toFixed(2)}</span>
              )}
              {getConfirmedBetAmount('draw') > 0 && (
                <span className="bet-amount-display confirmed">{getConfirmedBetAmount('draw').toFixed(2)}</span>
              )}
              {getPendingBetAmount('draw') === 0 && getConfirmedBetAmount('draw') === 0 && (
                <span className="bet-amount-display">0.00</span>
              )}
            </div>
          </button>
        </div>

        {/* Bottom Row - Side bets (8 buttons on mobile, 2 on desktop) */}

      </div>

      {/* Flying Chips Container */}
      {flyingChips.map((chip) => (
        <FlyingChip
          key={chip.id}
          chipValue={chip.chipValue}
          startX={chip.startX}
          startY={chip.startY}
          endX={chip.endX}
          endY={chip.endY}
          onAnimationComplete={() => handleFlyingChipComplete(chip.id)}
        />
      ))}

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
                setPendingBets(prev => {
                  const newBets = new Map(prev)
                  newBets.delete(lastBet[0])
                  // If no more bets, reset the active bet type
                  if (newBets.size === 0) {
                    setActiveBetType(null)
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

