import { useCallback, useMemo } from 'react'
import { useGameStore } from '../../store/gameStore'
import './AccountInfo.css'

/**
 * AccountInfo component displays account balance and total bet information
 * 
 * @returns JSX element
 */
const AccountInfo: React.FC = () => {
  const { accountBalance, gameId } = useGameStore()

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
   * Handles refresh button click
   */

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

