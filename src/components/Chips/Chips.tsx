import React, { useState } from 'react'
import { useGameStore } from '../../store/gameStore'
import './Chips.css'

/**
 * Available chip denominations
 */
const CHIP_VALUES = [10, 20, 50, 100, 200, 500, 1000, 5000, 10000,50000] as const

/**
 * Gets chip SVG path from public folder
 */
const getChipSVG = (value: number) => `/${value}.svg`

const Chips: React.FC = () => {
  const { selectedChip, setSelectedChip } = useGameStore()
  const [expanded, setExpanded] = useState(false)

  const handleChipSelect = (value: number) => {
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
            return (
              <button
                key={value}
                className={`chip ${isSelected ? 'selected' : ''}`}
                onClick={() => handleChipSelect(value)}
                aria-label={`Select chip ${value}`}
                aria-pressed={isSelected}
                type="button"
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
