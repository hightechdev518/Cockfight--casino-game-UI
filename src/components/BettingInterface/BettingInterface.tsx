import { useCallback, useMemo, useState, useRef, useEffect } from 'react'
import { useGameStore, BetType } from '../../store/gameStore'
import SelectedChipDisplay from '../Chips/SelectedChipDisplay'
import FlyingChip from '../Chips/FlyingChip'
import SuccessOverlay from '../Controls/SuccessOverlay'
import Controls from '../Controls/Controls'
import AccountInfo from '../AccountInfo/AccountInfo'
import { apiService } from '../../services/apiService'
import { mapBetTypeToBackend } from '../../utils/betMapping'
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
    setAccountBalance, 
    setBettingError,
    bettingError
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

  /**
   * Fetches odds from API for the current round
   * Note: Odds API uses r_no (round number) and resolves it to r_id internally
   */
  const fetchOdds = useCallback(async () => {
    if (!roundId && !currentRound) return
    
    try {
      // Use r_no (round number) for odds API, fallback to roundId if currentRound not available
      const r_no = currentRound?.toString() || roundId || ''
      if (!r_no) return
      
      const oddsResponse = await apiService.getOdds(r_no)
      if (oddsResponse && oddsResponse.code === 'B100' && oddsResponse.data) {
        const newOddsMap = new Map<string, number>()
        
        // Parse odds from API response
        // Format: {o_bettype, o_opentype, o_odds, o_notes, o_bl_ratio, o_bl_group}
        const oddsList = Array.isArray(oddsResponse.data) ? oddsResponse.data : []
        oddsList.forEach((odd: any) => {
          const zone = odd.o_opentype || odd.zone || ''
          const oddsValue = odd.o_odds || odd.odds
          if (zone && typeof oddsValue === 'number') {
            newOddsMap.set(zone, oddsValue)
          }
        })
        
        setOddsMap(newOddsMap)
      }
    } catch (error) {
      // Silently fail - will use default odds
      // Failed to fetch odds - using defaults
    }
  }, [roundId, currentRound])

  /**
   * Gets odds for a bet type, using API odds if available, otherwise defaults
   */
  const getOddsForBetType = useCallback((betType: BetType): number => {
    const backendMapping = mapBetTypeToBackend(betType)
    const zone = backendMapping.zone
    
    // Try to get odds from API first
    if (oddsMap.has(zone)) {
      return oddsMap.get(zone)!
    }
    
    // Fallback to default odds
    return DEFAULT_BET_ODDS[betType]
  }, [oddsMap])

  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        window.clearTimeout(successTimerRef.current)
      }
    }
  }, [])

  // Fetch odds when round changes
  useEffect(() => {
    fetchOdds()
  }, [fetchOdds])

  /**
   * Handles bet button click
   * @param betType - Type of bet to place
   */
  const handleBetClick = useCallback((betType: BetType) => {
    if (selectedChip <= 0) return
    
    // If there's an active bet type and it's different from this one, block the bet
    if (activeBetType !== null && activeBetType !== betType) return

    // Set this as the active bet type if not already set
    if (activeBetType === null) {
      setActiveBetType(betType)
    }

    setPendingBets((prevBets) => {
      const currentAmount = prevBets.get(betType) || 0
      const newAmount = currentAmount + selectedChip
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
  }, [selectedChip, activeBetType])

  /**
   * Confirms and submits all pending bets to the backend API
   */
  const handleConfirmBets = useCallback(async () => {
    if (pendingBets.size === 0) return
    if (isSubmitting) return // Prevent double submission
    
    // Validate required fields
    if (!tableId) {
      setBettingError('Table ID is missing. Please refresh the page.')
      return
    }
    if (!roundId) {
      setBettingError('Round ID is missing. Please wait for round data to load or refresh the page.')
      // Round ID missing - cannot place bet
      return
    }

    setIsSubmitting(true)
    setBettingError(null)

    try {
      // Submit each bet to the backend
      const betPromises = Array.from(pendingBets.entries()).map(async ([betType, amount]) => {
        if (amount <= 0) return null

        const backendMapping = mapBetTypeToBackend(betType)
        const odds = getOddsForBetType(betType)

        // Validate required fields
        if (!roundId) {
          throw new Error('Round ID is required for betting')
        }

        try {
          const response = await apiService.placeBet({
            t_id: tableId,
            r_id: roundId,
            type: backendMapping.type,
            zone: backendMapping.zone,
            amount: Math.abs(amount), // Ensure positive amount
            odds: odds,
            cuid: `${betType}-${Date.now()}-${Math.random()}`,
            anyodds: 'N' // Use exact odds, don't accept server odds automatically
          })

          // Update balance if provided
          if (response.balance !== undefined) {
            setAccountBalance(response.balance)
          }

          // Handle allbets response if provided (all active wagers for the round)
          if (response.allbets && Array.isArray(response.allbets)) {
            // You could update UI to show all active bets for the round
            // Bets placed successfully
          }

          // Add bet to local store for UI
          // Use w_no from response if available, otherwise generate ID
          const betId = response.allbets && response.allbets.length > 0 
            ? response.allbets[response.allbets.length - 1].w_no 
            : `${betType}-${Date.now()}-${Math.random()}`
          
          addBet({
            id: betId,
            type: betType,
            amount,
            odds: odds,
            timestamp: Date.now()
          })

          return response
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to place bet'
          setBettingError(`${getBetTypeDisplayName(betType)}: ${errorMessage}`)
          throw error
        }
      })

      // Wait for all bets to be submitted
      await Promise.all(betPromises.filter(p => p !== null))

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

      // Clear pending bets on success
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
  }, [pendingBets, tableId, roundId, isSubmitting, addBet, setAccountBalance, setBettingError, getOddsForBetType])

  /**
   * Gets display name for bet type
   */
  const getBetTypeDisplayName = useCallback((betType: BetType): string => {
    const names: Record<BetType, string> = {
      meron: 'Meron',
      wala: 'Wala',
      draw: 'Draw',
      meronRed: 'Meron Red',
      meronBlack: 'Meron Black',
      walaRed: 'Wala Red',
      walaBlack: 'Wala Black',
      meronOdd: 'Meron Odd',
      meronEven: 'Meron Even',
      walaOdd: 'Wala Odd',
      walaEven: 'Wala Even',
    }
    return names[betType] || betType
  }, [])

  /**
   * Clears all pending bets
   */
  const handleClearBets = useCallback(() => {
    setPendingBets(new Map())
    // Reset the active bet type after clearing
    setActiveBetType(null)
    clearBets()
  }, [clearBets])

  /**
   * Doubles all pending bet amounts
   */
  const handleDoubleBets = useCallback(() => {
    setPendingBets((prevBets) => {
      const doubled = new Map<BetType, number>()
      prevBets.forEach((amount, betType) => {
        doubled.set(betType, amount * 2)
      })
      return doubled
    })
  }, [])

  /**
   * Gets the bet amount for a specific bet type
   * @param betType - Type of bet
   * @returns Bet amount
   */
  const getBetAmount = useCallback((betType: BetType): number => {
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

  return (
    <div className="betting-interface">
      <div className="betting-area">        

        {/* Main Bets - Top row: Meron and Wala side by side */}
        <div className="main-bets-top flex-1">
          <button 
            ref={(el) => el && (betButtonRefs.current.meron = el)}
            className={`bet-button main-bet meron ${activeBetType !== null && activeBetType !== 'meron' ? 'disabled' : ''} ${shakingBetType === 'meron' ? 'shake' : ''}`}
            onClick={() => handleBetClick('meron')}
            disabled={activeBetType !== null && activeBetType !== 'meron'}
          >
            <span className="bet-label-large">Meron</span>
            <span className="bet-odds">{getOddsForBetType('meron')}</span>
            <div className="bet-stats">
              <span className="bet-amount-display">${getBetAmount('meron')}</span>
            </div>
          </button>
          <button 
            ref={(el) => el && (betButtonRefs.current.wala = el)}
            className={`bet-button main-bet wala ${activeBetType !== null && activeBetType !== 'wala' ? 'disabled' : ''} ${shakingBetType === 'wala' ? 'shake' : ''}`}
            onClick={() => handleBetClick('wala')}
            disabled={activeBetType !== null && activeBetType !== 'wala'}
          >
            <span className="bet-label-large">Wala</span>
            <span className="bet-odds">{getOddsForBetType('wala')}</span>
            <div className="bet-stats">
              <span className="bet-amount-display">${getBetAmount('wala')}</span>
            </div>
          </button>
        </div>

        {/* Bottom row: Draw centered */}
        <div className="main-bets-bottom flex-1">
          <button 
            ref={(el) => el && (betButtonRefs.current.draw = el)}
            className={`bet-button main-bet draw ${activeBetType !== null && activeBetType !== 'draw' ? 'disabled' : ''}`}
            onClick={() => handleBetClick('draw')}
            disabled={activeBetType !== null && activeBetType !== 'draw'}
          >
            <span className="bet-label-large">Draw</span>
            <span className="bet-odds">{getOddsForBetType('draw')}</span>
            <div className="bet-stats">
              <span className="bet-amount-display">${getBetAmount('draw')}</span>
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
        <div className="betting-error" style={{
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
          fontWeight: '500'
        }}>
          {bettingError}
          <button
            onClick={() => setBettingError(null)}
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
            onUndo={() => {
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

