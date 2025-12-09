/**
 * Utility functions for handling URL parameters
 */

/**
 * Get URL parameter value
 */
export const getUrlParam = (name: string): string | null => {
  if (typeof window === 'undefined') return null
  const urlParams = new URLSearchParams(window.location.search)
  return urlParams.get(name)
}

/**
 * Get all URL parameters as an object
 */
export const getAllUrlParams = (): Record<string, string> => {
  if (typeof window === 'undefined') return {}
  const urlParams = new URLSearchParams(window.location.search)
  const params: Record<string, string> = {}
  urlParams.forEach((value, key) => {
    params[key] = value
  })
  return params
}

/**
 * Get initialization parameters from URL
 * Expected: sess_id, language (or lang), tableid
 */
export const getInitParams = (): {
  sess_id: string | null
  language: string | null
  tableid: string | null
} => {
  // Support both 'language' and 'lang' parameters
  const language = getUrlParam('language') || getUrlParam('lang')
  return {
    sess_id: getUrlParam('sess_id'),
    language: language,
    tableid: getUrlParam('tableid'),
  }
}

/**
 * Set URL parameter without reloading page
 */
export const setUrlParam = (name: string, value: string): void => {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.set(name, value)
  window.history.replaceState({}, '', url.toString())
}

/**
 * Remove URL parameter without reloading page
 */
export const removeUrlParam = (name: string): void => {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.delete(name)
  window.history.replaceState({}, '', url.toString())
}

/**
 * Set initialization parameters (sess_id, lang/language, tableid)
 */
export const setInitParams = (params: {
  sess_id?: string
  lang?: string
  language?: string
  tableid?: string
}): void => {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  
  if (params.sess_id) {
    url.searchParams.set('sess_id', params.sess_id)
  }
  if (params.lang) {
    url.searchParams.set('lang', params.lang)
  }
  if (params.language) {
    url.searchParams.set('language', params.language)
  }
  if (params.tableid) {
    url.searchParams.set('tableid', params.tableid)
  }
  
  window.history.replaceState({}, '', url.toString())
}

