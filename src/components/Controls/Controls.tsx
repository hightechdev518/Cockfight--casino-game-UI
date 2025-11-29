import { useCallback } from 'react'
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
  /** Chip slot to insert between confirm and clear */
  chipSlot?: React.ReactNode
  /** Total pending bets amount (for enable/disable state) */
  pendingBetAmount?: number
}

/**
 * Controls component provides action buttons for betting operations
 * 
 * @param props - Component props
 * @returns JSX element
 */
const Controls: React.FC<ControlsProps> = ({ onConfirm, onClear, onDouble, onUndo, chipSlot, pendingBetAmount = 0 }) => {
  /**
   * Handles refresh button click
   */
  const handleRefresh = useCallback(() => {
    // Refresh logic will be implemented when backend is available
  }, [])

  /**
   * Handles lobby button click
   */
  const handleLobby = useCallback(() => {
    // Lobby navigation will be implemented when routing is set up
  }, [])

  /**
   * Handles undo button click
   */
  const handleUndo = useCallback(() => {
    if (onUndo) {
      onUndo()
    }
  }, [onUndo])


  /**
   * Checks if confirm button should be disabled
   */
  const isConfirmDisabled = pendingBetAmount === 0

  /**
   * Current timestamp formatted
   */

  return (
    <div className="controls-inline" style={{ flex: '0 0 auto' }}>
      {/* Left side buttons */}
      <div className="controls-left-group">
        <button 
          className="control-btn-circle undo" 
          onClick={handleUndo}
          aria-label="Undo last bet"
          type="button"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7v6h6"/>
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
          </svg>
        </button>
        <button 
          className="control-btn-circle refresh" 
          onClick={handleRefresh}
          aria-label="Refresh"
          type="button"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
          </svg>
        </button>
      </div>

      {/* Middle buttons */}
      <div className="controls-center-group" style={{paddingLeft:'11px'}}>
        <button 
          className="control-btn-circle confirm" 
          onClick={onConfirm} 
          disabled={isConfirmDisabled}
          aria-label="Confirm bets"
          aria-disabled={isConfirmDisabled}
          type="button"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        </button>
        {/* Chip slot - inserted between confirm and clear */}
        {chipSlot}
        <button 
          className="control-btn-circle clear" 
          onClick={onClear}
          aria-label="Clear all bets"
          type="button"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <button 
          className="control-btn-circle double" 
          onClick={onDouble}
          aria-label="Double all bets"
          type="button"
        >
          <span className="double-text">X2</span>
        </button>
      </div>

      {/* Right side - Timestamp and Menu */}
      <div className="controls-right-group" style={{paddingLeft:"10px"}}>
        <button 
          className="control-btn-circle menu"
          onClick={handleLobby}
          aria-label="Menu"
          type="button"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

export default Controls

