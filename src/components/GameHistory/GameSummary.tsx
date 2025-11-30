import { useCallback, useMemo } from 'react'
import { useGameStore } from '../../store/gameStore'
import './GameSummary.css'

interface GameSummaryProps {
  onClose?: () => void
}

/**
 * GameSummary component displays recent game results in a card/summary format
 * Shows 6 game cards with name, round number, status, and open count
 */
const GameSummary: React.FC<GameSummaryProps> = ({ onClose }) => {
  const { gameHistory, currentRound } = useGameStore()

  /**
   * Generates sample game data for display
   */
  const generateSampleGames = useCallback(() => {
    const games = [
      { id: 1, name: 'Table 1', round: 8745, status: 'Betting', openCount: 120 },
      { id: 2, name: 'Table 2', round: 8744, status: 'Betting', openCount: 120},
      { id: 3, name: 'Table 3', round: 8743, status: 'Fighting', openCount: 120},
      { id: 4, name: 'Table 4', round: 8742, status: 'Fighting', openCount: 120 },
      { id: 5, name: 'Table 5', round: 8741, status: 'Betting', openCount: 120 },
      { id: 6, name: 'Table 6', round: 8740, status: 'Betting', openCount: 120}
    ]
    return games
  }, [])

  /**
   * Gets the latest games to display (6 games)
   */
  const gameSummaries = useMemo(() => {
    if (gameHistory.length > 0) {
      // Convert game history to game summaries
      return gameHistory.slice(0, 6).map((game, index) => ({
        id: index + 1,
        name: game.result === 'dragon' ? 'Dragon' : game.result === 'tiger' ? 'Tiger' : 'Tie',
        round: game.round,
        status: game.result === 'dragon' ? 'Dragon Win' : game.result === 'tiger' ? 'Tiger Win' : 'Draw',
        openCount: Math.floor(Math.random() * 20) + 1
      }))
    }
    return generateSampleGames()
  }, [gameHistory, generateSampleGames])

  /**
   * Gets status color based on result
   */
  const getStatusColor = useCallback((status: string): string => {
    if (status.includes('Dragon')) return 'text-red-500'
    if (status.includes('Tiger')) return 'text-yellow-400'
    if (status.includes('Draw')) return 'text-green-500'
    return 'text-gray-400'
  }, [])

  /**
   * Gets background color for status
   */
  const getStatusBgColor = useCallback((status: string): string => {
    if (status.includes('Betting')) return 'betting-text-color'
    if (status.includes('Fighting')) return 'fighting-text-color'
    return 'bg-gray-900/30'
  }, [])

  return (
    <div className="game-summary-container">
      {/* Header */}
      <div className="game-summary-header">
        <h2 className="text-white text-lg font-bold">Rooms</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="close-button text-gray-400 hover:text-white transition"
            aria-label="Close Summary"
          >
            ✕
          </button>
        )}
      </div>

      {/* Games Grid - 6 cards */}
      <div className="games-grid">
        {gameSummaries.map((game) => (
          <div key={game.id} className="game-card">
            <div className="game-card-body">
              {/* Round Number */}
              <div className="game-detail">
                <span className="detail-value text-white text-sm font-semibold">{game.name}</span>
              </div>

              {/* Status */}
              <div className="game-detail">
                <span className={`detail-value text-sm font-semibold`}>
                  {game.round}
                </span>
              </div>

              {/* Open Count */}
              <div className="game-detail">
                <span className={`detail-value text-sm font-semibold px-2 py-1 rounded ${getStatusBgColor(game.status)}`}>
                  {game.status}
                </span>
              </div>

              {/* Open Count */}
              <div className="game-detail">
                <span className={`detail-value text-sm font-semibold px-2 py-1 rounded`}>
                  {game.openCount}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default GameSummary
