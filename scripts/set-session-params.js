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
    // uniqueid is typically auto-generated per API call, but we can store it
    // for reference or use in specific scenarios
    localStorage.setItem('last_uniqueid', uniqueid)
    console.log('✅ Stored uniqueid:', uniqueid, '(Note: This is usually auto-generated per API call)')
  }
  
  window.history.replaceState({}, '', url.toString())
  console.log('✅ URL updated:', url.toString())
  console.log('🔄 Reload the page to apply changes')
}

// Set the provided values
setSessionParams({
  sess_id: 'ed1c6e34-4410-4784-927c-efd738f3149e',
  uniqueid: 'mwVQsXyvWZ',
  lang: 'en-us'
})

