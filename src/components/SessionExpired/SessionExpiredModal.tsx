import React from 'react'
import './SessionExpiredModal.css'

interface SessionExpiredModalProps {
  isOpen: boolean
  onGoToHome: () => void
}

const SessionExpiredModal: React.FC<SessionExpiredModalProps> = ({ isOpen, onGoToHome }) => {
  if (!isOpen) return null

  return (
    <div className="session-expired-overlay">
      <div className="session-expired-modal">
        <div className="session-expired-content">
          <p className="session-expired-message">
            Your login has<br />
            expired or been<br />
            kicked out, please<br />
            log in again
          </p>
          <button 
            className="session-expired-button"
            onClick={onGoToHome}
          >
            Go to Home
          </button>
        </div>
      </div>
    </div>
  )
}

export default SessionExpiredModal

