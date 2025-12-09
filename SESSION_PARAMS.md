# Session Parameters

## Provided Values

- **sess_id**: `ed1c6e34-4410-4784-927c-efd738f3149e`
- **uniqueid**: `mwVQsXyvWZ`
- **lang**: `en-us`

## Usage

### Option 1: Direct URL (Recommended)

Open your game with these URL parameters:

```
http://localhost:5173/?sess_id=ed1c6e34-4410-4784-927c-efd738f3149e&lang=en-us
```

Or for production:
```
https://your-domain.com/?sess_id=ed1c6e34-4410-4784-927c-efd738f3149e&lang=en-us
```

### Option 2: Browser Console Script

Open the browser console (F12) and run:

```javascript
// Set URL parameters
const url = new URL(window.location.href);
url.searchParams.set('sess_id', 'ed1c6e34-4410-4784-927c-efd738f3149e');
url.searchParams.set('lang', 'en-us');
window.history.replaceState({}, '', url.toString());

// Store in localStorage
localStorage.setItem('mrlive_session_s_uqid', 'ed1c6e34-4410-4784-927c-efd738f3149e');
localStorage.setItem('app_language', 'en-us');

// Reload page
window.location.reload();
```

### Option 3: Use Helper HTML Page

Open `scripts/set-session.html` in your browser and click the button to automatically set parameters and redirect.

### Option 4: Use Browser Console Script File

Run the script from `scripts/set-session-params.js` in the browser console.

## Notes

- **sess_id**: Required for API authentication. Stored in localStorage as `mrlive_session_s_uqid`.
- **lang**: Language preference. Stored in localStorage as `app_language`. Supports both `lang` and `language` URL parameters.
- **uniqueid**: Typically auto-generated per API call for replay protection. The provided value is stored in localStorage as `last_uniqueid` for reference, but each API call will generate a new uniqueid automatically.

## Testing

After setting the parameters, the app should:
1. Read `sess_id` from URL and store it
2. Read `lang` from URL and store it
3. Use the session ID for all API calls
4. Use the language preference for UI display

