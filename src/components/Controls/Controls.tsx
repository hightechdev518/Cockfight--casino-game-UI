import { useCallback, useState, useEffect } from 'react'
import { useGameStore } from '../../store/gameStore'
import { useI18n } from '../../i18n/LanguageContext'
import AccountInfo from '../AccountInfo/AccountInfo'
import './Controls.css'

/**
 * Props for the Controls component
 */
interface ControlsProps {
  /** Callback when confirm button is clicked */
  onConfirm: () => void
  /** Callback when clear button is clicked */
  onClear: () => void
  /** Callback when double button is clicked */
  onDouble: () => void
  /** Callback when undo button is clicked */
  onUndo?: () => void
  /** Callback when rebet button is clicked */
  onRebet?: () => void
  /** Chip slot to insert between confirm and clear */
  chipSlot?: React.ReactNode
  /** Total pending bets amount (for enable/disable state) */
  pendingBetAmount?: number
  /** Whether bets are currently being submitted */
  isSubmitting?: boolean
  /** Round status: 1 = betting open, 2 = fighting/betting closed, 4 = settled */
  roundStatus?: number
  /** Countdown timer for betting period */
  countdown?: number
  /** Number of confirmed bets (bets that have been submitted) */
  confirmedBetsCount?: number
  /** Whether betting is currently closed */
  isBettingClosed?: boolean
}

/**
 * Controls component provides action buttons for betting operations
 * 
 * @param props - Component props
 * @returns JSX element
 */
const Controls: React.FC<ControlsProps> = ({ onConfirm, onClear, onDouble, onRebet, chipSlot, pendingBetAmount = 0, isSubmitting = false, confirmedBetsCount = 0, isBettingClosed = false }) => {
  const { toggleGameHistory, showGameHistory } = useGameStore()
  const { t } = useI18n()
  const [isDesktop, setIsDesktop] = useState(false)

  // Detect desktop mode
  useEffect(() => {
    const checkDesktop = () => {
      setIsDesktop(window.innerWidth >= 1024)
    }
    
    checkDesktop()
    window.addEventListener('resize', checkDesktop)
    return () => window.removeEventListener('resize', checkDesktop)
  }, [])
  /**
   * Handles rebet button click - places the same bets as last round
   * Disabled if there are confirmed bets or if betting is closed
   */
  const handleRebetClick = useCallback(() => {
    // Don't rebet if there are confirmed bets
    if (confirmedBetsCount > 0) {
      return
    }
    // Don't rebet if betting is closed
    if (isBettingClosed) {
      return
    }
    // Call the rebet handler from parent
    if (onRebet) {
      onRebet()
    }
  }, [confirmedBetsCount, isBettingClosed, onRebet])
  
  /**
   * Check if rebet button should be disabled
   * Disabled when: there are confirmed bets, bets are being submitted, or betting is closed
   */
  const isRebetDisabled = confirmedBetsCount > 0 || isSubmitting || isBettingClosed


  /**
   * Check if betting is currently allowed
   * Betting is allowed only when isBettingClosed is false
   * The parent component (BettingInterface) determines this based on roundStatus and countdown
   */
  const isBettingAllowed = !isBettingClosed

  /**
   * Checks if confirm button should be disabled
   * Disabled when: no pending bets, submitting, or fighting (roundStatus === 2)
   */
  const isConfirmDisabled = pendingBetAmount === 0 || isSubmitting || !isBettingAllowed

  /**
   * Checks if clear button should be disabled
   * Disabled when: no pending bets, submitting, or fighting (roundStatus === 2)
   * Clear can only cancel bets during betting period (roundStatus === 1)
   */
  const isClearDisabled = pendingBetAmount === 0 || isSubmitting || !isBettingAllowed

  /**
   * Checks if double button should be disabled
   * Disabled when: no pending bets, submitting, or fighting (roundStatus === 2)
   * Double can only work during betting period (roundStatus === 1)
   */
  const isDoubleDisabled = pendingBetAmount === 0 || isSubmitting || !isBettingAllowed

  return (
    <div className={`controls-inline ${isBettingClosed ? 'betting-closed' : ''}`} style={{ flex: '0 0 auto' }}>
      {/* Left side buttons */}
      <div className="controls-left-group">
        {/* Mobile / non-desktop: rebet button stays on the left */}
        {!isDesktop && (
          <button 
            className={`control-btn-circle refresh ${isRebetDisabled ? 'disabled' : ''}`}
            onClick={handleRebetClick}
            disabled={isRebetDisabled}
            aria-label="Rebet - Place same bets as last round"
            aria-disabled={isRebetDisabled}
            type="button"
            title="Rebet - Place same bets as last round"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
            </svg>
          </button>
        )}

        {/* PC / desktop: show account info fixed in the left corner of the chips panel */}
        {isDesktop && <AccountInfo />}
      </div>

      {/* Middle buttons + account info */}
      <div className="controls-center-group">
        {/* Mobile: Confirm -> Chip -> Clear */}
        {!isDesktop && (
          <>
            <button 
              className={`control-btn-circle confirm ${pendingBetAmount > 0 && !isSubmitting ? 'has-pending-bet' : ''}`}
              onClick={onConfirm} 
              disabled={isConfirmDisabled}
              aria-label="Confirm bets"
              aria-disabled={isConfirmDisabled}
              type="button"
            >
              {isSubmitting ? (
                <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                  <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              )}
            </button>
            {/* Chip slot - inserted between confirm and clear */}
            {chipSlot}
          </>
        )}
        {/* PC mode: Chip -> Confirm (account info is rendered in the left group) */}
        {isDesktop && (
          <>
            {/* Chip slot - centered group, to the right of the left-corner account info */}
            {chipSlot}
            <button 
              className={`control-btn-circle confirm ${pendingBetAmount > 0 && !isSubmitting ? 'has-pending-bet' : ''}`}
              onClick={onConfirm} 
              disabled={isConfirmDisabled}
              aria-label="Confirm bets"
              aria-disabled={isConfirmDisabled}
              type="button"
            >
              {isSubmitting ? (
                <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                  <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              )}
            </button>
          </>
        )}
        <button 
          className={`control-btn-circle clear ${isClearDisabled ? 'disabled' : ''}`}
          onClick={onClear}
          disabled={isClearDisabled}
          aria-label="Clear all bets"
          aria-disabled={isClearDisabled}
          type="button"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <button 
          className={`control-btn-circle double ${isDoubleDisabled ? 'disabled' : ''}`}
          onClick={onDouble}
          disabled={isDoubleDisabled}
          aria-label="Double all bets"
          aria-disabled={isDoubleDisabled}
          type="button"
        >
          <span className="double-text">X2</span>
        </button>
        {/* PC mode: place rebet button to the right of the double (X2) button */}
        {isDesktop && (
          <button 
            className={`control-btn-circle refresh ${isRebetDisabled ? 'disabled' : ''}`}
            onClick={handleRebetClick}
            disabled={isRebetDisabled}
            aria-label="Rebet - Place same bets as last round"
            aria-disabled={isRebetDisabled}
            type="button"
            title="Rebet - Place same bets as last round"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
            </svg>
          </button>
        )}
      </div>

      {/* Right side: History button (PC mode only) */}
      {isDesktop && (
        <div className="controls-right-group">
          <button
            onClick={toggleGameHistory}
            className="history-button-controls"
            title={showGameHistory ? "Hide Game History" : "Show Game History"}
            type="button"
            aria-label={showGameHistory ? "Hide Game History" : "Show Game History"}
          >
            <svg className="history-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <span className="history-text">{t('gameHistory.history')}</span>
          </button>
        </div>
      )}

    </div>
  )
}

export default Controls

