import { useCallback, useMemo, useEffect, useRef } from 'react'
import { useGameStore } from '../../store/gameStore'
import { apiService } from '../../services/apiService'
import './AccountInfo.css'

/**
 * AccountInfo component displays account balance and total bet information
 * 
 * @returns JSX element
 */
const AccountInfo: React.FC = () => {
  const { accountBalance, gameId, betLimitMin, betLimitMax, setAccountBalance } = useGameStore()
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  /**
   * Fetches balance from API
   */
  const fetchBalance = useCallback(async () => {
    try {
      const balance = await apiService.getBalance()
      setAccountBalance(balance)
    } catch (error) {
      // Silently fail - balance polling shouldn't disrupt the UI
      // Session might not be initialized yet
      if (import.meta.env.DEV) {
        console.debug('Balance fetch failed (expected if not logged in):', error)
      }
    }
  }, [setAccountBalance])

  /**
   * Sets up balance polling
   */
  useEffect(() => {
    // Poll balance every 5 seconds
    pollingIntervalRef.current = setInterval(() => {
      fetchBalance()
    }, 5000)

    // Initial fetch
    fetchBalance()

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
  }, [fetchBalance])

  return (
    <div className="account-info">
      <div className="account-balance-section">
        <span className="account-value balance">${formattedBalance}</span>
     
      </div>
      <div className="game-info-section">
        {gameId && <span className="game-id">{gameId}</span>}
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

