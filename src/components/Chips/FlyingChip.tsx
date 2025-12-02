import React, { useEffect } from 'react'
import './FlyingChip.css'

interface FlyingChipProps {
  chipValue: number
  startX: number
  startY: number
  endX: number
  endY: number
  onAnimationComplete: () => void
}

const FlyingChip: React.FC<FlyingChipProps> = ({
  chipValue,
  startX,
  startY,
  endX,
  endY,
  onAnimationComplete
}) => {
  useEffect(() => {
    // Trigger animation immediately
    const timer = setTimeout(() => {
      onAnimationComplete()
    }, 800) // Match the CSS animation duration

    return () => clearTimeout(timer)
  }, [onAnimationComplete])

  const getChipSVG = (value: number) => `/${value}.svg`

  return (
    <div
      className="flying-chip"
      style={{
        '--start-x': `${startX}px`,
        '--start-y': `${startY}px`,
        '--end-x': `${endX}px`,
        '--end-y': `${endY}px`,
      } as React.CSSProperdraws & Record<string, string>}
    >
      <div className="flying-chip-inner animate">
        <img
          src={getChipSVG(chipValue)}
          alt={`Flying chip ${chipValue}`}
          className="flying-chip-image"
        />
      </div>
    </div>
  )
}

export default FlyingChip
