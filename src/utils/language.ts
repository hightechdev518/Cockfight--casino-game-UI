/**
 * Language management utilities
 */

export type LanguageCode = 
  | 'en-us'      // English
  | 'zh-tw'      // Traditional Chinese
  | 'zh-cn'      // Simplified Chinese
  | 'vi-vn'      // Vietnamese
  | 'ja-jp'      // Japanese
  | 'ko-kr'      // Korean
  | 'th-th'      // Thai
  | 'id-id'      // Indonesian

export interface Language {
  code: LanguageCode
  name: string
  nativeName: string
  flag: string
}

export const LANGUAGES: Language[] = [
  {
    code: 'en-us',
    name: 'English',
    nativeName: 'English',
    flag: '🇬🇧'
  },
  {
    code: 'zh-tw',
    name: 'Traditional Chinese',
    nativeName: '繁體中文',
    flag: '🇹🇼'
  },
  {
    code: 'zh-cn',
    name: 'Simplified Chinese',
    nativeName: '简体中文',
    flag: '🇨🇳'
  },
  {
    code: 'vi-vn',
    name: 'Vietnamese',
    nativeName: 'Tiếng Việt',
    flag: '🇻🇳'
  },
  {
    code: 'ja-jp',
    name: 'Japanese',
    nativeName: '日本語',
    flag: '🇯🇵'
  },
  {
    code: 'ko-kr',
    name: 'Korean',
    nativeName: '한국어',
    flag: '🇰🇷'
  },
  {
    code: 'th-th',
    name: 'Thai',
    nativeName: 'ไทย',
    flag: '🇹🇭'
  },
  {
    code: 'id-id',
    name: 'Indonesian',
    nativeName: 'Bahasa Indonesia',
    flag: '🇮🇩'
  }
]

/**
 * Apply language metadata to the document (html lang attribute)
 */
export const applyLanguageToDocument = (languageCode: LanguageCode) => {
  if (typeof document === 'undefined') return
  document.documentElement.lang = languageCode
  document.documentElement.setAttribute('data-language', languageCode)
}

/**
 * Get current language from localStorage or URL
 */
export const getCurrentLanguage = (): LanguageCode => {
  if (typeof window === 'undefined') return 'en-us'
  
  // Check localStorage first
  const stored = localStorage.getItem('app_language')
  if (stored && isValidLanguageCode(stored)) {
    return stored as LanguageCode
  }
  
  // Check URL parameters
  const urlParams = new URLSearchParams(window.location.search)
  const urlLang = urlParams.get('language') || urlParams.get('lang')
  if (urlLang && isValidLanguageCode(urlLang)) {
    return urlLang as LanguageCode
  }
  
  // Default to English
  return 'en-us'
}

/**
 * Set language preference
 */
export const setLanguage = (languageCode: LanguageCode): void => {
  if (typeof window === 'undefined') return
  
  // Store in localStorage
  localStorage.setItem('app_language', languageCode)
  applyLanguageToDocument(languageCode)
  
  // Update URL parameter
  const url = new URL(window.location.href)
  url.searchParams.set('language', languageCode)
  url.searchParams.set('lang', languageCode) // Also set 'lang' for compatibility
  window.history.replaceState({}, '', url.toString())
  
  // Dispatch custom event for language change
  window.dispatchEvent(new CustomEvent('languageChanged', { 
    detail: { language: languageCode } 
  }))
}

/**
 * Get language object by code
 */
export const getLanguage = (code: LanguageCode): Language | undefined => {
  return LANGUAGES.find(lang => lang.code === code)
}

/**
 * Check if a language code is valid
 */
export const isValidLanguageCode = (code: string): boolean => {
  return LANGUAGES.some(lang => lang.code === code)
}

/**
 * Get language name by code
 */
export const getLanguageName = (code: LanguageCode): string => {
  const lang = getLanguage(code)
  return lang ? lang.name : 'English'
}

/**
 * Get native language name by code
 */
export const getNativeLanguageName = (code: LanguageCode): string => {
  const lang = getLanguage(code)
  return lang ? lang.nativeName : 'English'
}

