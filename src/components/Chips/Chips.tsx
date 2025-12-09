import React, { useState } from 'react'
import { useGameStore } from '../../store/gameStore'
import './Chips.css'

/**
 * Available chip denominations
 */
const CHIP_VALUES = [1, 5, 10, 20, 50, 100, 200, 500, 1000, 5000, 10000, 50000] as const

/**
 * Gets chip SVG path from public folder
 */
const getChipSVG = (value: number) => `/${value}.svg`

const Chips: React.FC = () => {
  const { selectedChip, setSelectedChip, betLimitMin, betLimitMax } = useGameStore()
  const [expanded, setExpanded] = useState(false)

  /**
   * Checks if a chip value is within bet limits
   * @param value - Chip value to check
   * @returns true if chip is valid, false if outside limits
   * Note: We allow chips below minimum bet limit because users can place multiple bets
   * The actual validation happens when placing the bet, not when selecting the chip
   */
  const isChipValid = (value: number): boolean => {
    // Only check maximum limit - allow chips below minimum (user can place multiple bets)
    if (betLimitMax !== undefined && value > betLimitMax) {
      return false
    }
    return true
  }

  const handleChipSelect = (value: number) => {
    // Only allow selection if chip is within bet limits
    if (!isChipValid(value)) {
      return
    }
    setSelectedChip(value)
    setExpanded(false) // collapse back to 1 chip
  }

  const toggleExpand = () => {
    setExpanded((prev) => !prev)
  }

  return (
    <div className="chips-container">

      {/* --- COLLAPSED MODE: Show only selected chip --- */}
      {!expanded && (
        <button
          className="chip selected"
          onClick={toggleExpand}
          aria-label="Show all chips"
          type="button"
        >
          <div className="chip-inner">
            <img
              src={getChipSVG(selectedChip || 10)}
              alt={`Chip ${selectedChip}`}
              className="chip-image"
            />
          </div>
        </button>
      )}

      {/* --- EXPANDED MODE: Show all chips --- */}
      <div className={`chips-grid animated ${expanded ? 'open' : 'closed'}`}>
        {expanded &&
          CHIP_VALUES.map((value) => {
            const isSelected = selectedChip === value
            const isValid = isChipValid(value)
            return (
              <button
                key={value}
                className={`chip ${isSelected ? 'selected' : ''} ${!isValid ? 'disabled' : ''}`}
                onClick={() => handleChipSelect(value)}
                aria-label={`Select chip ${value}${!isValid ? ' (outside bet limit)' : ''}`}
                aria-pressed={isSelected}
                aria-disabled={!isValid}
                disabled={!isValid}
                type="button"
                title={!isValid ? `Chip value ${value} is outside bet limit range${betLimitMin !== undefined && betLimitMax !== undefined ? ` (${betLimitMin} - ${betLimitMax})` : ''}` : undefined}
              >
                <div className="chip-inner">
                  <img
                    src={getChipSVG(value)}
                    alt={`Chip ${value}`}
                    className="chip-image"
                  />
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
    </div>
  )
}

export default Chips
