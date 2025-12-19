import { useState, useEffect } from 'react'
import { getCurrentLanguage, LANGUAGES, type LanguageCode, getLanguage } from '../../utils/language'
import { useI18n } from '../../i18n/LanguageContext'
import './SettingsModal.css'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

type TabType = 'general' | 'language' | 'sound' | 'video'

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { t, setAppLanguage } = useI18n()
  const [activeTab, setActiveTab] = useState<TabType>('general')
  const [settings, setSettings] = useState({
    showBettingStatistics: true,
    soundEnabled: false,
    liveEnabled: false,
    videoEnabled: true,
    selectedLine: '01',
  })
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>(getCurrentLanguage())
  const [isLanguageDropdownOpen, setIsLanguageDropdownOpen] = useState(false)

  // Update selected language when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedLanguage(getCurrentLanguage())
    }
  }, [isOpen])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isLanguageDropdownOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.settings-language-dropdown-container')) {
        setIsLanguageDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isLanguageDropdownOpen])

  const handleToggle = (key: keyof typeof settings) => {
    setSettings(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }

  const handleLanguageChange = (languageCode: LanguageCode) => {
    setSelectedLanguage(languageCode)
    setAppLanguage(languageCode)
    setIsLanguageDropdownOpen(false)
  }

  if (!isOpen) return null

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="settings-modal-header">
          <h2 className="settings-modal-title">{t('settings.title')}</h2>
          <button 
            className="settings-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="settings-tabs">
          <button
            className={`settings-tab ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            {t('settings.tabs.general')}
          </button>
          <button
            className={`settings-tab ${activeTab === 'language' ? 'active' : ''}`}
            onClick={() => setActiveTab('language')}
          >
            {t('settings.tabs.language')}
          </button>
          <button
            className={`settings-tab ${activeTab === 'sound' ? 'active' : ''}`}
            onClick={() => setActiveTab('sound')}
          >
            {t('settings.tabs.sound')}
          </button>
          <button
            className={`settings-tab ${activeTab === 'video' ? 'active' : ''}`}
            onClick={() => setActiveTab('video')}
          >
            {t('settings.tabs.video')}
          </button>
        </div>

        {/* Content */}
        <div className="settings-content">
          {activeTab === 'general' && (
            <div className="settings-tab-content">
              <div className="settings-option">
                <label className="settings-checkbox-label">
                  <input
                    type="checkbox"
                    checked={settings.showBettingStatistics}
                    onChange={() => handleToggle('showBettingStatistics')}
                    className="settings-checkbox"
                  />
                  <span className="settings-checkbox-custom"></span>
                  <span className="settings-option-text">
                    {t('settings.general.showBettingStatistics')}
                  </span>
                </label>
              </div>
            </div>
          )}

          {activeTab === 'language' && (
            <div className="settings-tab-content">
              <div className="settings-language-section">
                <div className="settings-language-dropdown-container">
                  <button
                    className="settings-language-dropdown"
                    onClick={() => setIsLanguageDropdownOpen(!isLanguageDropdownOpen)}
                    type="button"
                  >
                    <span className="settings-language-flag">
                      {getLanguage(selectedLanguage)?.flag || '🇬🇧'}
                    </span>
                    <span className="settings-language-name">
                      {getLanguage(selectedLanguage)?.nativeName || 'English'}
                    </span>
                    <span className="settings-language-arrow">
                      {isLanguageDropdownOpen ? '▲' : '▼'}
                    </span>
                  </button>
                  {isLanguageDropdownOpen && (
                    <div className="settings-language-dropdown-menu">
                      {LANGUAGES.map((language) => (
                        <button
                          key={language.code}
                          className={`settings-language-option ${selectedLanguage === language.code ? 'selected' : ''}`}
                          onClick={() => handleLanguageChange(language.code)}
                          type="button"
                        >
                          <span className="settings-language-flag">{language.flag}</span>
                          <span className="settings-language-name">{language.nativeName}</span>
                          {selectedLanguage === language.code && (
                            <span className="settings-language-check">✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'sound' && (
            <div className="settings-tab-content">
              {/* Sound Section */}
              <div className="settings-sound-section">
                <label className="settings-sound-label">{t('settings.sound.label')}</label>
                <div className="settings-sound-controls">
                  <label className="settings-toggle-switch">
                    <input
                      type="checkbox"
                      checked={settings.soundEnabled}
                      onChange={() => handleToggle('soundEnabled')}
                      className="settings-toggle-input"
                    />
                    <span className="settings-toggle-slider"></span>
                  </label>
                </div>
              </div>

              {/* Live Section */}
              <div className="settings-sound-section">
                <label className="settings-sound-label">{t('settings.live.label')}</label>
                <div className="settings-sound-controls">
                  <label className="settings-toggle-switch">
                    <input
                      type="checkbox"
                      checked={settings.liveEnabled}
                      onChange={() => handleToggle('liveEnabled')}
                      className="settings-toggle-input"
                    />
                    <span className="settings-toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'video' && (
            <div className="settings-tab-content">
              {/* Video Toggle Section */}
              <div className="settings-sound-section">
                <label className="settings-sound-label">{t('settings.video.label')}</label>
                <div className="settings-sound-controls">
                  <label className="settings-toggle-switch">
                    <input
                      type="checkbox"
                      checked={settings.videoEnabled}
                      onChange={() => handleToggle('videoEnabled')}
                      className="settings-toggle-input"
                    />
                    <span className="settings-toggle-slider"></span>
                  </label>
                </div>
              </div>

              {/* Line Selection Section */}
              <div className="settings-line-section">
                <label className="settings-line-label">{t('settings.video.lineLabel')}</label>
                <div className="settings-line-options">
                  {['01', '02', '03', '04'].map((line) => (
                    <button
                      key={line}
                      className={`settings-line-option ${settings.selectedLine === line ? 'selected' : ''}`}
                      onClick={() => setSettings(prev => ({ ...prev, selectedLine: line }))}
                      type="button"
                    >
                      <span className="settings-line-dot">•</span>
                      <span className="settings-line-number">{line}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SettingsModal

