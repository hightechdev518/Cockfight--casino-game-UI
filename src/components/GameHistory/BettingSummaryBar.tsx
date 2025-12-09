import { useMemo } from 'react'
import { useGameStore } from '../../store/gameStore'
import './BettingSummaryBar.css'

/**
 * BettingSummaryBar component displays betting summary information
 * Shows balance, table ID, and bet limits
 * Only visible in landscape mode
 */
const BettingSummaryBar: React.FC = () => {
  const { accountBalance, tableId, betLimitMin, betLimitMax } = useGameStore()

  /**
   * Formats currency value with proper locale formatting
   */
  const formatCurrency = useMemo(() => {
    return (value: number): string => {
      return value.toLocaleString('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      })
    }
  }, [])

  /**
   * Formats bet range from min/max limits
   */
  const formattedBetRange = useMemo(() => {
    if (betLimitMin === undefined && betLimitMax === undefined) {
      return '10 - 10K' // Default fallback
    }
    
    const formatBetAmount = (amount: number): string => {
      if (amount >= 1000) {
        const thousands = amount / 1000
        // If it's a whole number, show without decimals
        if (thousands % 1 === 0) {
          return `${thousands}K`
        }
        // Otherwise show one decimal place
        return `${thousands.toFixed(1)}K`
      }
      return amount.toString()
    }
    
    const minStr = betLimitMin !== undefined ? formatBetAmount(betLimitMin) : '10'
    const maxStr = betLimitMax !== undefined ? formatBetAmount(betLimitMax) : '10K'
    
    return `${minStr} - ${maxStr}`
  }, [betLimitMin, betLimitMax])

  /**
   * Formatted account balance
   */
  const formattedBalance = useMemo(() => {
    return formatCurrency(accountBalance)
  }, [accountBalance, formatCurrency])

  return (
    <div className="betting-summary-bar">
      {/* Balance */}
      <div className="summary-item balance">
        <span className="balance-value">{formattedBalance}</span>
      </div>

      {/* Table ID */}
      <div className="summary-item table-id">
        <span className="table-id-value">{tableId || 'CF01'}</span>
      </div>

      {/* Bet Range */}
      <div className="summary-item bet-range">
        <span className="bet-range-value">{formattedBetRange}</span>
      </div>
    </div>
  )
}

export default BettingSummaryBar

