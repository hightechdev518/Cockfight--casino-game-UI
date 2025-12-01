import { useCallback, useMemo, useState, useRef, useEffect } from 'react'
import { useGameStore, BetType } from '../../store/gameStore'
import SelectedChipDisplay from '../Chips/SelectedChipDisplay'
import FlyingChip from '../Chips/FlyingChip'
import SuccessOverlay from '../Controls/SuccessOverlay'
import Controls from '../Controls/Controls'
import AccountInfo from '../AccountInfo/AccountInfo'
import './BettingInterface.css'

/**
 * Betting odds configuration for each bet type
 */
const BET_ODDS: Readonly<Record<BetType, number>> = {
  dragon: 1.0,
  tiger: 1.0,
  tie: 8.0,
  dragonRed: 0.9,
  dragonBlack: 0.9,
  tigerRed: 0.9,
  tigerBlack: 0.9,
  dragonOdd: 0.75,
  dragonEven: 1.05,
  tigerOdd: 0.75,
  tigerEven: 1.05
} as const

/**
 * BettingInterface component provides the main betting interface for Dragon Tiger game
 * 
 * @returns JSX element
 */
const BettingInterface: React.FC = () => {
  const { selectedChip, addBet, clearBets } = useGameStore()
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
  const successTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        window.clearTimeout(successTimerRef.current)
      }
    }
  }, [])

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
   * Confirms and submits all pending bets
   */
  const handleConfirmBets = useCallback(() => {
    pendingBets.forEach((amount, betType) => {
      if (amount > 0) {
        addBet({
          id: `${betType}-${Date.now()}-${Math.random()}`,
          type: betType,
          amount,
          odds: BET_ODDS[betType],
          timestamp: Date.now()
        })
      }
    })
    setPendingBets(new Map())
    // Reset the active bet type after confirming
    setActiveBetType(null)
    // Show success overlay briefly
    setShowSuccess(true)
    if (successTimerRef.current) {
      window.clearTimeout(successTimerRef.current)
    }
    successTimerRef.current = window.setTimeout(() => {
      setShowSuccess(false)
      successTimerRef.current = null
    }, 3000)
  }, [pendingBets, addBet])

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

  /**
   * Calculates percentage of total bets for a specific bet type
   * @param betType - Type of bet
   * @returns Percentage (0-100)
   */
  const getBetPercentage = useCallback((betType: BetType): number => {
    const amount = getBetAmount(betType)
    if (totalBetAmount === 0) return 0
    return Math.round((amount / totalBetAmount) * 100)
  }, [getBetAmount, totalBetAmount])

  return (
    <div className="betting-interface">
      <div className="betting-area">        

        {/* Main Bets - Top row: Meron and Wala side by side */}
        <div className="main-bets-top flex-1">
          <button 
            ref={(el) => el && (betButtonRefs.current.dragon = el)}
            className={`bet-button main-bet dragon ${activeBetType !== null && activeBetType !== 'dragon' ? 'disabled' : ''}`}
            onClick={() => handleBetClick('dragon')}
            disabled={activeBetType !== null && activeBetType !== 'dragon'}
          >
            <span className="bet-label-large">Meron</span>
            <span className="bet-odds">1:1</span>
            <div className="bet-stats">
              <span className="bet-percentage">{getBetPercentage('dragon')}</span>
              <span className="bet-amount-display">${getBetAmount('dragon')}</span>
            </div>
          </button>
          <button 
            ref={(el) => el && (betButtonRefs.current.tiger = el)}
            className={`bet-button main-bet tiger ${activeBetType !== null && activeBetType !== 'tiger' ? 'disabled' : ''}`}
            onClick={() => handleBetClick('tiger')}
            disabled={activeBetType !== null && activeBetType !== 'tiger'}
          >
            <span className="bet-label-large">Wala</span>
            <span className="bet-odds">1:1</span>
            <div className="bet-stats">
              <span className="bet-percentage">{getBetPercentage('tiger')}</span>
              <span className="bet-amount-display">${getBetAmount('tiger')}</span>
            </div>
          </button>
        </div>

        {/* Bottom row: Draw centered */}
        <div className="main-bets-bottom flex-1">
          <button 
            ref={(el) => el && (betButtonRefs.current.tie = el)}
            className={`bet-button main-bet tie ${activeBetType !== null && activeBetType !== 'tie' ? 'disabled' : ''}`}
            onClick={() => handleBetClick('tie')}
            disabled={activeBetType !== null && activeBetType !== 'tie'}
          >
            <span className="bet-label-large">Draw</span>
            <span className="bet-odds">1:8</span>
            <div className="bet-stats">
              <span className="bet-percentage">{getBetPercentage('tie')}</span>
              <span className="bet-amount-display">${getBetAmount('tie')}</span>
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

