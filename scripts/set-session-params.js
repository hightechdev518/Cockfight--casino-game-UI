/**
 * Browser console script to set session parameters
 * 
 * Usage: Copy and paste this into the browser console, or run:
 * 
 * setSessionParams({
 *   sess_id: 'ed1c6e34-4410-4784-927c-efd738f3149e',
 *   uniqueid: 'mwVQsXyvWZ',
 *   lang: 'en-us'
 * })
 */

function setSessionParams({ sess_id, uniqueid, lang }) {
  // Import the utility function if available, otherwise use manual approach
  if (window.setInitParams) {
    window.setInitParams({ sess_id, uniqueid, lang })
    console.log('✅ Parameters set via setInitParams')
    console.log('🔄 App will re-initialize automatically (no page reload needed)')
  } else {
    // Fallback: manual approach (will trigger re-initialization via event)
    const url = new URL(window.location.href)
    
    if (sess_id) {
      url.searchParams.set('sess_id', sess_id)
      // Also store in localStorage for session manager
      localStorage.setItem('mrlive_session_s_uqid', sess_id)
      console.log('✅ Set sess_id:', sess_id)
    }
    
    if (lang) {
      url.searchParams.set('lang', lang)
      localStorage.setItem('app_language', lang)
      console.log('✅ Set lang:', lang)
    }
    
    if (uniqueid) {
      // Store uniqueid in localStorage and optionally in URL
      localStorage.setItem('last_uniqueid', uniqueid)
      url.searchParams.set('uniqueid', uniqueid)
      console.log('✅ Stored uniqueid:', uniqueid, '(Note: This is usually auto-generated per API call)')
    }
    
    window.history.replaceState({}, '', url.toString())
    
    // Dispatch custom event to trigger re-initialization
    window.dispatchEvent(new CustomEvent('initparamchange', {
      detail: { 
        param: 'manual_update',
        newValue: 'updated',
        allParams: Object.fromEntries(url.searchParams)
      }
    }))
    
    console.log('✅ URL updated:', url.toString())
    console.log('🔄 App will re-initialize automatically (no page reload needed)')
  }
}

// Set the provided values
setSessionParams({
  sess_id: 'ed1c6e34-4410-4784-927c-efd738f3149e',
  uniqueid: 'mwVQsXyvWZ',
  lang: 'en-us'
})

