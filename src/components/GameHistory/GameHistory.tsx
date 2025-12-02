import { useCallback, useMemo } from 'react'
import { useGameStore, GameHistory as GameHistoryType } from '../../store/gameStore'
import './GameHistory.css'

/**
 * Props for the GameHistory component
 */
interface GameHistoryProps {
  /** Display variant: 'simple' for left panel, 'detailed' for right panel */
  variant?: 'simple' | 'detailed'
}

/**
 * Constants for game history
 */
const GRID_CONFIG = {
  SIMPLE_ROWS: 6,
  SIMPLE_COLS: 12,
  DETAILED_COLS: 4,
  DETAILED_ITEMS: 16,
} as const

/**
 * GameHistory component displays past game results in a grid format
 * 
 * @param props - Component props
 * @returns JSX element
 */
const GameHistory: React.FC<GameHistoryProps> = ({ variant = 'simple' }) => {
  const { gameHistory, autoSubmit, toggleAutoSubmit, currentRound, toggleGameSummary } = useGameStore()

  /**
   * Generates sample history data matching the exact image pattern
   * @returns Array of game history items
   */
  const generateSampleHistory = useCallback((): GameHistoryType[] => {
    // Pattern from the image: 6 rows x 12 columns = 72 cells
    // Exact pattern matching the image:
    // Row 1: 5 wala, 2 meron, 1 wala
    // Row 2: 1 meron, 2 wala, 1 meron, 2 wala
    // Row 3: 4 meron, 2 wala
    // Row 4: 2 wala, 2 meron, 1 wala, 2 meron
    // Row 5: 2 wala, 1 meron, 1 wala, 2 meron
    // Row 6: 1 meron, 1 wala, 1 meron, 1 draw, 2 meron
    const pattern = [
      'wala', 'wala', 'wala', 'wala', 'wala', 'meron', 'meron', 'wala',
      'meron', 'wala', 'wala', 'meron', 'wala', 'wala',
      'meron', 'meron', 'meron', 'meron', 'wala', 'wala',
      'wala', 'wala', 'meron', 'meron', 'wala', 'meron', 'meron',
      'wala', 'wala', 'meron', 'wala', 'wala', 'meron', 'meron',
      'meron', 'wala', 'meron', 'draw', 'meron', 'meron'
    ]
    // Generate more items for scrolling (at least 40 items for 4 columns = 10 rows)
    const baseItems = pattern.map((result, i) => ({
      round: i + 1,
      result: result as 'meron' | 'wala' | 'draw'
    }))
    // Add more items to ensure scrolling works
    const additionalItems: GameHistoryType[] = []
    for (let i = baseItems.length; i < 40; i++) {
      const results: ('meron' | 'wala' | 'draw')[] = ['meron', 'wala', 'wala', 'meron', 'wala']
      additionalItems.push({
        round: i + 1,
        result: results[i % results.length]
      })
    }
    return [...baseItems, ...additionalItems]
  }, [])

  /**
   * Gets the history data to display
   */
  const history = useMemo(() => {
    return gameHistory.length > 0 ? gameHistory : generateSampleHistory()
  }, [gameHistory, generateSampleHistory])

  /**
   * Gets the Chinese character for a game result
   * @param result - Game result type
   * @returns Chinese character
   */
  const getResultChar = useCallback((result: string): string => {
    switch (result) {
      case 'meron': return '龍'
      case 'wala': return '虎'
      case 'draw': return '和'
      default: return ''
    }
  }, [])

  /**
   * Gets the CSS color class for a game result
   * @param result - Game result type
   * @returns Color class name
   */
  const getResultColor = useCallback((result: string): string => {
    switch (result) {
      case 'meron': return 'red'
      case 'wala': return 'yellow'
      case 'draw': return 'green'
      default: return 'empty'
    }
  }, [])

  /**
   * Calculates game statistics from history
   */
  const gameStats = useMemo(() => {
    const meronWins = history.filter(h => h.result === 'meron').length
    const walaWins = history.filter(h => h.result === 'wala').length
    const drawWins = history.filter(h => h.result === 'draw').length
    return { meronWins, walaWins, drawWins }
  }, [history])

  /**
   * Gets current round number for display
   */
  const displayRound = useMemo(() => {
    return currentRound || (history.length > 0 ? history[history.length - 1].round : 40)
  }, [currentRound, history])

  /**
   * Generates Big Road pattern from history
   * This creates the roadmap display with outlined circles, solid circles, and diagonal lines
   */
  const generateRoadmap = useMemo(() => {
    const roadmap: Array<{
      type: 'outlined' | 'solid' | 'diagonal'
      color: 'red' | 'yellow' | 'green'
      row: number
      col: number
      hasMark?: boolean // For diagonal line marks on draws
    }> = []

    // Big Road algorithm: columns change when result alternates
    const columns: Array<Array<{ result: 'meron' | 'wala', isdraw: boolean }>> = []
    let currentCol = -1
    let lastResult: 'meron' | 'wala' | null = null

    // Build Big Road columns
    history.forEach((item) => {
      if (item.result === 'draw') {
        // Mark the last item in current column with a diagonal mark
        if (currentCol >= 0 && columns[currentCol].length > 0) {
          const lastItem = roadmap[roadmap.length - 1]
          if (lastItem) {
            lastItem.hasMark = true
          }
        }
        return
      }

      const result = item.result as 'meron' | 'wala'
      
      // New column if result changes or first item
      if (lastResult === null || lastResult !== result) {
        columns.push([{ result, isdraw: false }])
        currentCol = columns.length - 1
      } else {
        // Continue in same column
        columns[currentCol].push({ result, isdraw: false })
      }

      lastResult = result

      // Add outlined circle
      roadmap.push({
        type: 'outlined',
        color: result === 'meron' ? 'red' : 'yellow',
        row: columns[currentCol].length - 1,
        col: currentCol
      })
    })

    // // Generate solid circles for Small Road (derived from Big Road)
    // // Place them in a separate area (right side)
    // const solidStartCol = columns.length + 2
    // history.forEach((item, index) => {
    //   if (item.result !== 'draw' && index > 0 && index % 3 === 0) {
    //     const result = item.result as 'meron' | 'wala'
    //     roadmap.push({
    //       type: 'solid',
    //       color: result === 'meron' ? 'red' : 'yellow',
    //       row: Math.floor(index / 3),
    //       col: solidStartCol + Math.floor(index / 6)
    //     })
    //   }
    // })

    // // Generate diagonal lines for Cockroach Road (another derived road)
    // const diagonalStartCol = solidStartCol + Math.floor(history.length / 6) + 2
    // history.forEach((item, index) => {
    //   if (item.result !== 'draw' && index > 0 && index % 2 === 0) {
    //     const result = item.result as 'meron' | 'wala'
    //     roadmap.push({
    //       type: 'diagonal',
    //       color: result === 'meron' ? 'red' : 'yellow',
    //       row: Math.floor(index / 2) + 3,
    //       col: diagonalStartCol + Math.floor(index / 4)
    //     })
    //   }
    // })

    // Calculate max dimensions for grid
    const maxRow = Math.max(
      ...roadmap.map(item => item.row),
      columns.reduce((max, col) => Math.max(max, col.length), 0) - 1,
      0 // Ensure at least 0
    )
    const maxCol = Math.max(
      ...roadmap.map(item => item.col), 
      columns.length - 1,
      0 // Ensure at least 0
    )

    return { roadmap, maxRow: Math.max(maxRow, 0), maxCol: Math.max(maxCol, 0) }
  }, [history])

  if (variant === 'detailed') {
    return (
      <div className="game-history detailed roadmap">
        {/* Main Roadmap Grid */}
        <div className="roadmap-container">
          <div 
            className="roadmap-grid"
            style={{
              gridTemplateRows: `repeat(${Math.max(5, 1)}, 24px)`,
              gridTemplateColumns: `repeat(${Math.max(30, 1)}, 24px)`,
            }}
          >
            {/* Render roadmap items */}
            {generateRoadmap.roadmap.map((item, index) => {
              if (item.type === 'outlined') {
                return (
                  <div
                    key={`outlined-${index}`}
                    className={`roadmap-item outlined ${item.color}`}
                    style={{
                      gridRow: item.row + 1,
                      gridColumn: item.col + 1
                    }}
                  >
                    {item.hasMark && <div className="diagonal-mark" />}
                  </div>
                )
              } else if (item.type === 'solid') {
                return (
                  <div
                    key={`solid-${index}`}
                    className={`roadmap-item solid ${item.color}`}
                    style={{
                      gridRow: item.row + 1,
                      gridColumn: item.col + 1
                    }}
                  />
                )
              } else if (item.type === 'diagonal') {
                return (
                  <div
                    key={`diagonal-${index}`}
                    className={`roadmap-item diagonal ${item.color}`}
                    style={{
                      gridRow: item.row + 1,
                      gridColumn: item.col + 1
                    }}
                  />
                )
              }
              return null
            })}
          </div>
        </div>

        {/* Bottom Status Bar */}
        <div className="roadmap-status-bar flex justify-around items-center px-2 py-1">
          <div className="status-left">
            <span className="round-number">#{displayRound}</span>
            <div className="stat-item">
              <span className="stat-circle red">M</span>
              <span className="stat-value">{gameStats.meronWins}</span>
            </div>
            <div className="stat-item">
              <span className="stat-circle yellow">W</span>
              <span className="stat-value">{gameStats.walaWins}</span>
            </div>
            <div className="stat-item">
              <span className="stat-circle green">D</span>
              <span className="stat-value">{gameStats.drawWins}</span>
            </div>
          </div>
          <div className="status-right">
            <button
            onClick={toggleGameSummary}
            className="summary-toggle-btn"
            title="Switch to Game Summary"
          >
            <img src="/Button/Lobby.svg" alt="Info" className="info-icon h-[32px]" />
          </button>
          </div>
        </div>
      </div>
    )
  }

  /**
   * Creates grid items for simple variant (6x12 = 72 cells)
   */
  const gridItems = useMemo(() => {
    const totalCells = GRID_CONFIG.SIMPLE_ROWS * GRID_CONFIG.SIMPLE_COLS
    return Array.from({ length: totalCells }, (_, index) => {
      if (index < history.length) {
        const item = history[index]
        return {
          result: item.result,
          round: item.round,
          isEmpty: false
        }
      }
      return { result: '', round: 0, isEmpty: true }
    })
  }, [history])

  return (
    <div className="game-history simple">
      <div className="history-header-controls">
        <div className="auto-submit-toggle">
          <button 
            className={`toggle-switch ${autoSubmit ? 'on' : 'off'}`}
            onClick={toggleAutoSubmit}
            aria-label="Auto Submit"
          >
            <span className="toggle-slider">
              <span className="toggle-text">{autoSubmit ? 'ON' : 'OFF'}</span>
            </span>
          </button>
          <span className="toggle-label">自動提交</span>
        </div>
      </div>
      <div className="history-grid simple-grid">
        {gridItems.map((item, index) => (
          <div
            key={index}
            className={`history-item ${item.isEmpty ? 'empty' : getResultColor(item.result)}`}
            title={item.isEmpty ? '' : `Round ${item.round}: ${item.result}`}
          >
            {!item.isEmpty && getResultChar(item.result)}
          </div>
        ))}
      </div>
    </div>
  )
}

export default GameHistory

