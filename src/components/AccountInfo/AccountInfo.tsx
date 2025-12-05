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
  const { accountBalance, gameId, setAccountBalance } = useGameStore()
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
        <span className="game-id">{gameId || 'CBXE08251119097'}</span>
        <svg className="coin-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v12M9 9h6M9 15h6"/>
        </svg>
        <span className="bet-range">20 - 50K</span>
      </div>
    </div>
  )
}

export default AccountInfo

