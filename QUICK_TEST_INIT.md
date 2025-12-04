# Quick Test: URL Parameter Initialization

## 🚀 Quick Start

### 1. Start Dev Server
```bash
npm run dev
```

### 2. Test with URL Parameters

#### Option A: With Auto-Login (Development)
```
http://localhost:5173/?language=en-us&tableid=CF02
```
- No `sess_id` needed - will auto-login with demo credentials
- Uses `CF02` (24HR table)

#### Option B: With Session ID
```
http://localhost:5173/?sess_id=YOUR_SESSION_ID&language=en-us&tableid=CF01
```
- Requires valid `sess_id` from login
- Uses `CF01` table

### 3. Get Session ID for Testing

**In Browser Console:**
```javascript
// Login and get session ID
const response = await fetch('https://apih5.ho8.net/loginuidpid.php', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    operatorId: 'TSTAG',
    username: 'demo05',
    password: 'qqqq1111',
    language: 'en-us',
    uniqueid: `test-${Date.now()}`
  })
})
const data = await response.json()
const sessId = new URL(data.lobby_url).searchParams.get('sess_id')
console.log('Session ID:', sessId)

// Copy the session ID and use it in URL:
// http://localhost:5173/?sess_id=PASTE_SESSION_ID&language=en-us&tableid=CF02
```

## ✅ What to Check

### URL Parameters
- [ ] `sess_id` is read from URL
- [ ] `language` is read from URL and stored
- [ ] `tableid` is read from URL (defaults to `CF02`)

### Auto-Login (Dev Only)
- [ ] If no `sess_id`, auto-login runs
- [ ] Session ID is extracted from `lobby_url`
- [ ] Session is stored correctly

### Initialization
- [ ] Game store initialized with correct `tableId`
- [ ] Balance fetched from API (if session exists)
- [ ] Lobby info fetched (if session exists)
- [ ] Round/table data updated

### Console Logs (Dev Mode)
- [ ] "Session ID from URL: ..." (if sess_id in URL)
- [ ] "Auto-login successful, session ID: ..." (if auto-login)
- [ ] No errors during initialization

## 🧪 Test Scenarios

### Scenario 1: All Parameters Provided
```
http://localhost:5173/?sess_id=abc123&language=en-us&tableid=CF01
```
**Expected:**
- Uses provided session ID
- Uses CF01 table
- Language set to en-us

### Scenario 2: Only Table ID
```
http://localhost:5173/?tableid=CF02
```
**Expected:**
- Auto-login runs (dev mode)
- Uses CF02 table
- Language defaults to en-us

### Scenario 3: No Parameters
```
http://localhost:5173/
```
**Expected:**
- Auto-login runs (dev mode)
- Uses CF02 (default table)
- Language defaults to en-us

## 🔍 Debugging

### Check URL Parameters
```javascript
// In browser console
import { getInitParams } from './utils/urlParams'
console.log('URL params:', getInitParams())
```

### Check Session
```javascript
import { sessionManager } from './services/apiService'
console.log('Session ID:', sessionManager.getSessionId())
```

### Check Store State
```javascript
import { useGameStore } from './store/gameStore'
console.log('Store state:', useGameStore.getState())
```

### Check Language
```javascript
console.log('Language:', localStorage.getItem('app_language'))
```

## 📝 Notes

- **Production:** All 3 parameters (`sess_id`, `language`, `tableid`) must be in URL
- **Development:** Auto-login works if `sess_id` is missing
- **Default Table:** `CF02` (24HR) if not specified
- **Default Language:** `en-us` if not specified

## 🎯 Quick Commands

```javascript
// Get current URL params
new URLSearchParams(window.location.search).get('sess_id')
new URLSearchParams(window.location.search).get('language')
new URLSearchParams(window.location.search).get('tableid')

// Set URL params (for testing)
const url = new URL(window.location.href)
url.searchParams.set('sess_id', 'test123')
url.searchParams.set('language', 'en-us')
url.searchParams.set('tableid', 'CF02')
window.history.replaceState({}, '', url.toString())
// Then reload page
```

For detailed information, see `INITIALIZATION.md`

