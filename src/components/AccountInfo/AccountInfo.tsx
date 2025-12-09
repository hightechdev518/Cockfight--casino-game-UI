import { useCallback, useMemo } from 'react'
import { useGameStore } from '../../store/gameStore'
import './AccountInfo.css'

/**
 * AccountInfo component displays account balance and total bet information
 * 
 * @returns JSX element
 */
const AccountInfo: React.FC = () => {
  const { accountBalance, tableId, betLimitMin, betLimitMax } = useGameStore()

  /**
   * Formats currency value with proper locale formatting
   * @param value - Currency value to format
   * @returns Formatted currency string
   */
  const formatCurrency = useCallback((value: number): string => {
    return value.toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    })
  }, [])

  /**
   * Formatted account balance
   */
  const formattedBalance = useMemo(() => formatCurrency(accountBalance), [accountBalance, formatCurrency])

  /**
   * Formats bet range from min/max limits
   * @returns Formatted bet range string (e.g., "20 - 50K")
   */
  const formattedBetRange = useMemo(() => {
    if (betLimitMin === undefined && betLimitMax === undefined) {
      return null // No bet limits available
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
    
    const minStr = betLimitMin !== undefined ? formatBetAmount(betLimitMin) : ''
    const maxStr = betLimitMax !== undefined ? formatBetAmount(betLimitMax) : ''
    
    if (minStr && maxStr) {
      return `${minStr} - ${maxStr}`
    } else if (minStr) {
      return `Min: ${minStr}`
    } else if (maxStr) {
      return `Max: ${maxStr}`
    }
    
    return null
  }, [betLimitMin, betLimitMax])

  // Balance is now only fetched when:
  // 1. Bet is placed (handled in BettingInterface)
  // 2. Game result comes (handled in useWebSocket and BettingInterface)
  // No polling needed - balance updates automatically on these events

  return (
    <div className="account-info">
      <div className="account-balance-section">
        <span className="account-value balance">{formattedBalance}</span>
     
      </div>
      <div className="game-info-section">
        {tableId && <span className="game-id">{tableId}</span>}
        {formattedBetRange && (
          <>
            <svg className="coin-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v12M9 9h6M9 15h6"/>
            </svg>
            <span className="bet-range">{formattedBetRange}</span>
          </>
        )}
      </div>
    </div>
  )
}

export default AccountInfo

