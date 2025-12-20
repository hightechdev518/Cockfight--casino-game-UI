import React, { useState, useEffect } from 'react'
import { useGameStore } from '../../store/gameStore'
import './Chips.css'

const CHIP_VALUES = [1,5,10, 20, 50, 100, 200, 500, 1000, 5000, 10000,50000]

const getChipSVG = (value: number) => `./${value}.svg`

const Chips: React.FC = () => {
  const { selectedChip, setSelectedChip, roundStatus, countdown } = useGameStore()
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

  /**
   * Checks if betting time is active
   * @returns true if betting is allowed, false otherwise
   */
  const isBettingTime = (): boolean => {
    // Betting is allowed when roundStatus === 1 (betting open) AND countdown > 0
    // If values are undefined, we should be conservative and disable betting
    if (roundStatus === undefined || countdown === undefined) {
      return false
    }
    return roundStatus === 1 && countdown > 0
  }

  const handleToggle = () => {
    // Only allow toggle during betting time
    if (!isBettingTime()) {
      return
    }
    setExpanded((prev) => !prev)
  }

  const handleSelect = (value: number) => {
    // Only allow selection during betting time
    if (!isBettingTime()) {
      return
    }
    setSelectedChip(value)
    if (!isDesktop) {
      setExpanded(false) // collapse after selection on mobile only
    }
  }

  // In desktop mode, always show all chips horizontally + Arena button
  if (isDesktop) {
    const isBettingActive = isBettingTime()
    return (
      <div className="chips-container chips-desktop-horizontal">
        <div className="chips-grid chips-grid-desktop">
          {CHIP_VALUES.map((value) => {
            const isSelected = selectedChip === value
            return (
              <button
                key={value}
                className={`chip ${isSelected ? 'selected' : ''} ${!isBettingActive ? 'disabled' : ''}`}
                onClick={() => handleSelect(value)}
                aria-label={`Select chip ${value}${!isBettingActive ? ' (betting not available)' : ''}`}
                aria-disabled={!isBettingActive}
                disabled={!isBettingActive}
                type="button"
                title={!isBettingActive ? 'Betting is not available at this time' : undefined}
              >
                <div className="chip-inner">
                  <img
                    src={getChipSVG(value)}
                    alt={`Chip ${value}`}
                    className="chip-image"
                    onError={(e) => {
                      // Retry loading the image once on error
                      const img = e.currentTarget
                      const originalSrc = img.src
                      setTimeout(() => {
                        img.src = ''
                        img.src = originalSrc
                      }, 100)
                    }}
                    loading="eager"
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
  const isBettingActive = isBettingTime()
  return (
    <div className="chips-container">
      {!expanded ? (
        // Only show selected chip
        <button
          className={`chip selected ${!isBettingActive ? 'disabled' : ''}`}
          onClick={handleToggle}
          aria-label={`Selected chip ${selectedChip || 10}${!isBettingActive ? ' (betting not available)' : ''}`}
          aria-disabled={!isBettingActive}
          disabled={!isBettingActive}
          type="button"
          title={!isBettingActive ? 'Betting is not available at this time' : undefined}
        >
          <div className="chip-inner">
            <img
              src={getChipSVG(selectedChip || 10)}
              alt={`Chip ${selectedChip || 10}`}
              className="chip-image w-[56px] h-[40px]"
              onError={(e) => {
                // Retry loading the image once on error
                const img = e.currentTarget
                const originalSrc = img.src
                setTimeout(() => {
                  img.src = ''
                  img.src = originalSrc
                }, 100)
              }}
              loading="eager"
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
                className={`chip ${isSelected ? 'selected' : ''} ${!isBettingActive ? 'disabled' : ''}`}
                onClick={() => handleSelect(value)}
                aria-label={`Select chip ${value}${!isBettingActive ? ' (betting not available)' : ''}`}
                aria-disabled={!isBettingActive}
                disabled={!isBettingActive}
                type="button"
                title={!isBettingActive ? 'Betting is not available at this time' : undefined}
              >
                <div className="chip-inner">
                  <img
                    src={getChipSVG(value)}
                    alt={`Chip ${value}`}
                    className="chip-image w-[56px] h-[40px]"
                    onError={(e) => {
                      // Retry loading the image once on error
                      const img = e.currentTarget
                      const originalSrc = img.src
                      setTimeout(() => {
                        img.src = ''
                        img.src = originalSrc
                      }, 100)
                    }}
                    loading="eager"
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
