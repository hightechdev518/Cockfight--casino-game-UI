import React, { useEffect } from 'react'
import { useI18n } from '../../i18n/LanguageContext'
import './SuccessOverlay.css'

interface SuccessOverlayProps {
  show: boolean
  onClose?: () => void
  message?: string
  duration?: number
}

const SuccessOverlay: React.FC<SuccessOverlayProps> = ({
  show,
  onClose,
  message,
  duration = 1600
}) => {
  const { t } = useI18n()
  const displayMessage = message || t('bet.success.message')
  useEffect(() => {
    if (!show) return
    const timer = setTimeout(() => {
      onClose && onClose()
    }, duration)
    return () => clearTimeout(timer)
  }, [show, onClose, duration])

  if (!show) return null

  return (
    <div className="success-overlay" role="status" aria-live="polite">
      <div className="success-card">
        <div className="success-sparkles" aria-hidden />
        <div className="success-text">{displayMessage}</div>
      </div>
    </div>
  )
}

export default SuccessOverlay
