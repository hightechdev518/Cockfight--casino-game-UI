import { useCallback } from 'react'
import { useGameStore } from '../../store/gameStore'
import './Chips.css'

/**
 * Available chip denominations
 */
const CHIP_VALUES: ReadonlyArray<number> = [500, 1000, 5000, 10000, 50000] as const

/**
 * Chips component displays betting chip options
 * 
 * @returns JSX element
 */
const Chips: React.FC = () => {
  const { selectedChip, setSelectedChip } = useGameStore()

  /**
   * Gets the CSS color class for a chip based on its value
   * @param value - Chip value
   * @returns Color class name
   */
  const getChipColor = useCallback((value: number): string => {
    if (value >= 50000) return 'chip-orange' // Orange for 50000
    if (value >= 10000) return 'chip-teal' // Teal/light blue for 10000
    if (value >= 5000) return 'chip-gold' // Golden yellow for 5000
    if (value >= 1000) return 'chip-blue' // Dark blue for 1000
    return 'chip-magenta' // Magenta for 500
  }, [])

  /**
   * Gets the display label for a chip
   * @param value - Chip value
   * @returns Display label
   */
  const getChipLabel = useCallback((value: number): string => {
    return value.toString()
  }, [])

  /**
   * Handles chip selection
   * @param value - Selected chip value
   */
  const handleChipSelect = useCallback((value: number) => {
    setSelectedChip(value)
  }, [setSelectedChip])

  return (
    <div className="chips-container">
      <button className="chip-nav-btn chip-nav-left" aria-label="Previous chips">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 18l-6-6 6-6"/>
        </svg>
      </button>
      <div className="chips-grid">
        {CHIP_VALUES.map((value) => {
          const isSelected = selectedChip === value
          return (
            <button
              key={value}
              className={`chip ${getChipColor(value)} ${isSelected ? 'selected' : ''}`}
              onClick={() => handleChipSelect(value)}
              aria-label={`Select $${value} chip`}
              aria-pressed={isSelected}
              type="button"
            >
              <div className="chip-inner">
                <span className="chip-value">{getChipLabel(value)}</span>
              </div>
              {isSelected && (
                <div className="chip-selected-indicator">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                </div>
              )}
            </button>
          )
        })}
      </div>
      <button className="chip-nav-btn chip-nav-right" aria-label="Next chips">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </button>
    </div>
  )
}

export default Chips
