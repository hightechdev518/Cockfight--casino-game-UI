# Initialization Parameters

The app initializes using URL parameters. In production, all 3 parameters will be sent through URL parameters.

## Required Parameters

1. **sess_id** - Session ID from login
2. **language** - Language code (e.g., `en-us`, `zh-cn`)
3. **tableid** - Table ID (e.g., `CF01`, `CF02`)

## URL Format

```
https://your-domain.com/?sess_id=YOUR_SESSION_ID&language=en-us&tableid=CF02
```

## Table IDs

- **CF01** - Standard table
- **CF02** - 24HR table (default if not specified)

## Getting Session ID

### Production
Session ID will be provided via URL parameter from the backend after login.

### Development/Testing
You can get a session ID by logging in:

**Endpoint:** `https://apih5.ho8.net/loginuidpid.php`

**Method:** POST (JSON)

**Payload:**
```json
{
  "operatorId": "TSTAG",
  "username": "demo05",
  "password": "qqqq1111",
  "language": "en-us",
  "uniqueid": "unique-id-string"
}
```

**Response:**
```json
{
  "code": "0",
  "msg": "成功",
  "uniqueid": "...",
  "lobby_url": "https://game.ho8.net/Lobby.html?sess_id=YOUR_SESSION_ID&lang=en-us"
}
```

Extract `sess_id` from the `lobby_url` query parameter.

## Auto-Login (Development Only)

In development mode, if `sess_id` is not provided in the URL, the app will automatically attempt to login with demo credentials:
- Operator ID: `TSTAG`
- Username: `demo05`
- Password: `qqqq1111`

This is **disabled in production** - you must provide `sess_id` via URL parameter.

## Example URLs

### Production URL
```
https://your-app.com/?sess_id=abc123xyz&language=en-us&tableid=CF02
```

### Development URL (with auto-login)
```
http://localhost:5173/?language=en-us&tableid=CF02
```

### Development URL (with session)
```
http://localhost:5173/?sess_id=abc123xyz&language=en-us&tableid=CF01
```

## Testing

### Test with URL Parameters

1. **Start dev server:**
   ```bash
   npm run dev
   ```

2. **Open browser with URL parameters:**
   ```
   http://localhost:5173/?sess_id=YOUR_SESSION_ID&language=en-us&tableid=CF02
   ```

3. **Or test auto-login (dev only):**
   ```
   http://localhost:5173/?language=en-us&tableid=CF02
   ```

### Get Session ID for Testing

**Using curl:**
```bash
curl -X POST https://apih5.ho8.net/loginuidpid.php \
  -H "Content-Type: application/json" \
  -d '{
    "operatorId": "TSTAG",
    "username": "demo05",
    "password": "qqqq1111",
    "language": "en-us",
    "uniqueid": "test-'$(date +%s)'"
  }'
```

**Using JavaScript (browser console):**
```javascript
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
console.log('Session ID:', new URL(data.lobby_url).searchParams.get('sess_id'))
```

## Implementation Details

### URL Parameter Parsing
- Parameters are read from `window.location.search`
- Stored in session storage/localStorage as needed
- Language preference is stored in localStorage

### Initialization Flow

1. Read URL parameters (`sess_id`, `language`, `tableid`)
2. If `sess_id` exists:
   - Set session ID
   - Fetch player info (balance)
   - Fetch lobby info (round/table data)
3. If `sess_id` doesn't exist (dev only):
   - Auto-login with demo credentials
   - Extract session ID from response
   - Continue with step 2
4. Initialize game store with:
   - Table ID from URL (or default `CF02`)
   - Language from URL
   - Session ID
   - Balance from API (if available)

### Language Storage
- Language is stored in `localStorage` as `app_language`
- Can be accessed throughout the app
- Defaults to `en-us` if not provided

## Code Reference

- URL parameter parsing: `src/utils/urlParams.ts`
- Initialization logic: `src/App.tsx` (useEffect)
- Login API: `src/services/apiService.ts` (`loginJson` method)
- Session management: `src/services/apiService.ts` (`sessionManager`)

