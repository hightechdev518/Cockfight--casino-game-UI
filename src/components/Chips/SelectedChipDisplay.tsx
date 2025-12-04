import React, { useState, useEffect } from 'react'
import { useGameStore } from '../../store/gameStore'
import './Chips.css'

const CHIP_VALUES = [1,5,10, 20, 50, 100, 200, 500, 1000, 5000, 10000,50000]

const getChipSVG = (value: number) => `/${value}.svg`

const Chips: React.FC = () => {
  const { selectedChip, setSelectedChip } = useGameStore()
  const [expanded, setExpanded] = useState(false) // toggle chip grid
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

  const handleToggle = () => setExpanded((prev) => !prev)

  const handleSelect = (value: number) => {
    setSelectedChip(value)
    if (!isDesktop) {
      setExpanded(false) // collapse after selection on mobile only
    }
  }

  // In desktop mode, always show all chips horizontally
  if (isDesktop) {
    return (
      <div className="chips-container chips-desktop-horizontal">
        <div className="chips-grid chips-grid-desktop">
          {CHIP_VALUES.map((value) => {
            const isSelected = selectedChip === value
            return (
              <button
                key={value}
                className={`chip ${isSelected ? 'selected' : ''}`}
                onClick={() => handleSelect(value)}
                aria-label={`Select chip ${value}`}
                type="button"
              >
                <div className="chip-inner">
                  <img
                    src={getChipSVG(value)}
                    alt={`Chip ${value}`}
                    className="chip-image"
                  />
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // Mobile mode - keep existing expand/collapse behavior
  return (
    <div className="chips-container">
      {!expanded ? (
        // Only show selected chip
        <button
          className="chip selected"
          onClick={handleToggle}
          aria-label={`Selected chip ${selectedChip || 10}`}
          type="button"
        >
          <div className="chip-inner">
            <img
              src={getChipSVG(selectedChip || 10)}
              alt={`Chip ${selectedChip || 10}`}
              className="chip-image w-[56px] h-[40px]"
            />
          </div>
        </button>
      ) : (
        // Expanded grid
        <div className="chips-grid">
          {CHIP_VALUES.map((value) => {
            const isSelected = selectedChip === value
            return (
              <button
                key={value}
                className={`chip ${isSelected ? 'selected' : ''}`}
                onClick={() => handleSelect(value)}
                aria-label={`Select chip ${value}`}
                type="button"
              >
                <div className="chip-inner">
                  <img
                    src={getChipSVG(value)}
                    alt={`Chip ${value}`}
                    className="chip-image w-[56px] h-[40px]"
                  />
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default Chips
