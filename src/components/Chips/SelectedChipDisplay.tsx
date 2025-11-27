import { useMemo } from 'react'
import { useGameStore } from '../../store/gameStore'
import './SelectedChipDisplay.css'

/**
 * SelectedChipDisplay component shows a large display of the currently selected chip
 * This is used in the controls bar to show the active chip value
 */
const SelectedChipDisplay: React.FC = () => {
  const { selectedChip } = useGameStore()

  /**
   * Gets the CSS color class for a chip based on its value
   */
  const getChipColor = useMemo(() => {
    if (selectedChip >= 50000) return 'chip-orange'
    if (selectedChip >= 10000) return 'chip-teal'
    if (selectedChip >= 5000) return 'chip-gold'
    if (selectedChip >= 1000) return 'chip-blue'
    if (selectedChip >= 500) return 'chip-magenta'
    // For chip value 20 (special styling to match image)
    return 'chip-selected-display'
  }, [selectedChip])

  return (
    <div className={`selected-chip-large ${getChipColor}`}>
      <div className="selected-chip-inner">
        <span className="selected-chip-value">{selectedChip}</span>
      </div>
    </div>
  )
}

export default SelectedChipDisplay

