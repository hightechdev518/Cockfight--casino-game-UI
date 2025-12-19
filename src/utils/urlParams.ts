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
 * Expected: sess_id, language (or lang), tableid, uniqueid
 */
export const getInitParams = (): {
  sess_id: string | null
  language: string | null
  tableid: string | null
  uniqueid: string | null
} => {
  // Support both 'language' and 'lang' parameters
  const language = getUrlParam('language') || getUrlParam('lang')
  // uniqueid can be in URL or localStorage
  const uniqueid = getUrlParam('uniqueid') || (typeof window !== 'undefined' ? localStorage.getItem('last_uniqueid') : null)
  return {
    sess_id: getUrlParam('sess_id'),
    language: language,
    tableid: getUrlParam('tableid'),
    uniqueid: uniqueid,
  }
}

/**
 * Set URL parameter without reloading page
 * Dispatches a custom event to notify listeners of URL parameter changes
 */
export const setUrlParam = (name: string, value: string): void => {
  if (typeof window === 'undefined') return
  const oldValue = getUrlParam(name)
  const url = new URL(window.location.href)
  url.searchParams.set(name, value)
  window.history.replaceState({}, '', url.toString())
  
  // Dispatch custom event if value actually changed
  if (oldValue !== value) {
    window.dispatchEvent(new CustomEvent('urlparamchange', {
      detail: { param: name, oldValue, newValue: value }
    }))
    // Also dispatch a more specific event for initialization params
    if (['sess_id', 'lang', 'language', 'tableid', 'uniqueid'].includes(name)) {
      window.dispatchEvent(new CustomEvent('initparamchange', {
        detail: { param: name, oldValue, newValue: value, allParams: getAllUrlParams() }
      }))
    }
  }
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
 * Set initialization parameters (sess_id, lang/language, tableid, uniqueid)
 * Dispatches a custom event to notify listeners of parameter changes
 */
export const setInitParams = (params: {
  sess_id?: string
  lang?: string
  language?: string
  tableid?: string
  uniqueid?: string
}): void => {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  const oldParams = getAllUrlParams()
  let hasChanges = false
  
  if (params.sess_id !== undefined) {
    const oldValue = url.searchParams.get('sess_id')
    if (oldValue !== params.sess_id) {
      url.searchParams.set('sess_id', params.sess_id)
      hasChanges = true
    }
  }
  if (params.lang !== undefined) {
    const oldValue = url.searchParams.get('lang')
    if (oldValue !== params.lang) {
      url.searchParams.set('lang', params.lang)
      hasChanges = true
    }
  }
  if (params.language !== undefined) {
    const oldValue = url.searchParams.get('language')
    if (oldValue !== params.language) {
      url.searchParams.set('language', params.language)
      hasChanges = true
    }
  }
  if (params.tableid !== undefined) {
    const oldValue = url.searchParams.get('tableid')
    if (oldValue !== params.tableid) {
      url.searchParams.set('tableid', params.tableid)
      hasChanges = true
    }
  }
  if (params.uniqueid !== undefined) {
    // uniqueid is typically stored in localStorage, but we can also add it to URL for reference
    // Store in localStorage
    localStorage.setItem('last_uniqueid', params.uniqueid)
  }
  
  if (hasChanges) {
    window.history.replaceState({}, '', url.toString())
    // Dispatch custom event for initialization parameter changes
    window.dispatchEvent(new CustomEvent('initparamchange', {
      detail: { 
        changedParams: params,
        oldParams,
        newParams: getAllUrlParams()
      }
    }))
  }
}

