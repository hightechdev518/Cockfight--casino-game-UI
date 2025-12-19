import React from 'react'
import './SessionExpiredModal.css'
import { useI18n } from '../../i18n/LanguageContext'

interface SessionExpiredModalProps {
  isOpen: boolean
  onGoToHome: () => void
}

const SessionExpiredModal: React.FC<SessionExpiredModalProps> = ({ isOpen, onGoToHome }) => {
  const { t } = useI18n()
  if (!isOpen) return null

  return (
    <div className="session-expired-overlay">
      <div className="session-expired-modal">
        <div className="session-expired-content">
          <p className="session-expired-message">
            {t('sessionExpired.message')}
          </p>
          <button 
            className="session-expired-button"
            onClick={onGoToHome}
          >
            {t('sessionExpired.goHome')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SessionExpiredModal

