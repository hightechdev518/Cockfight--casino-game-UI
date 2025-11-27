import { useCallback, useMemo, useState } from 'react'
import { useGameStore, BetType } from '../../store/gameStore'
import SelectedChipDisplay from '../Chips/SelectedChipDisplay'
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

  /**
   * Handles bet button click
   * @param betType - Type of bet to place
   */
  const handleBetClick = useCallback((betType: BetType) => {
    if (selectedChip <= 0) return

    setPendingBets((prevBets) => {
      const currentAmount = prevBets.get(betType) || 0
      const newAmount = currentAmount + selectedChip
      return new Map(prevBets).set(betType, newAmount)
    })
  }, [selectedChip])

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
  }, [pendingBets, addBet])

  /**
   * Clears all pending bets
   */
  const handleClearBets = useCallback(() => {
    setPendingBets(new Map())
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

        {/* Main Bets - 3 large areas */}
        <div className="main-bets flex-1">
          <button 
            className="bet-button main-bet dragon"
            onClick={() => handleBetClick('dragon')}
          >
            <span className="bet-label-large">Meron</span>
            <span className="bet-odds">1:1</span>
            <div className="bet-stats">
              <span className="bet-percentage">{getBetPercentage('dragon')}</span>
              <span className="bet-amount-display">${getBetAmount('dragon')}</span>
            </div>
          </button>
          <button 
            className="bet-button main-bet tie"
            onClick={() => handleBetClick('tie')}
          >
            <span className="bet-label-large">Draw</span>
            <span className="bet-odds">1:8</span>
            <div className="bet-stats">
              <span className="bet-percentage">{getBetPercentage('tie')}</span>
              <span className="bet-amount-display">${getBetAmount('tie')}</span>
            </div>
          </button>
          <button 
            className="bet-button main-bet tiger"
            onClick={() => handleBetClick('tiger')}
          >
            <span className="bet-label-large">Wala</span>
            <span className="bet-odds">1:1</span>
            <div className="bet-stats">
              <span className="bet-percentage">{getBetPercentage('tiger')}</span>
              <span className="bet-amount-display">${getBetAmount('tiger')}</span>
            </div>
          </button>
        </div>

        {/* Bottom Row - Side bets (8 buttons on mobile, 2 on desktop) */}

      </div>

      {/* Bottom Control Bar - Two rows: Top (dark gray) and Bottom (black) */}
      <div className="bottom-control-bar flex-shrink-0">
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
                  return newBets
                })
              }
            }}
            chipSlot={<SelectedChipDisplay />}
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

