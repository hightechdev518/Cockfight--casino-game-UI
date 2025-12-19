import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { applyLanguageToDocument, getCurrentLanguage, setLanguage, type LanguageCode } from '../utils/language'
import { translate, type TranslationKey } from './translations'

interface LanguageContextValue {
  language: LanguageCode
  setAppLanguage: (code: LanguageCode) => void
  t: (key: TranslationKey) => string
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined)

export const LanguageProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [language, setLanguageState] = useState<LanguageCode>(getCurrentLanguage())

  // Sync <html lang> attribute with current language
  useEffect(() => {
    applyLanguageToDocument(language)
  }, [language])

  // Listen for global languageChanged events (dispatched in setLanguage util)
  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ language: LanguageCode }>
      if (custom.detail?.language) {
        setLanguageState(custom.detail.language)
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('languageChanged', handler as EventListener)
      return () => window.removeEventListener('languageChanged', handler as EventListener)
    }
  }, [])

  const setAppLanguage = useCallback((code: LanguageCode) => {
    setLanguageState(code)
    setLanguage(code)
  }, [])

  const t = useCallback(
    (key: TranslationKey) => {
      return translate(key, language)
    },
    [language],
  )

  return (
    <LanguageContext.Provider value={{ language, setAppLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useI18n = (): LanguageContextValue => {
  const ctx = useContext(LanguageContext)
  if (!ctx) {
    throw new Error('useI18n must be used within a LanguageProvider')
  }
  return ctx
}


