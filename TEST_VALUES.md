# Test Values Reference

This document contains test values for API testing and URL initialization.

## Test Parameters

- **sess_id**: `c525e69f-a3de-4302-ad06-fb3d57ad4ca8`
- **uniqueid**: `xg0Yqxw64`
- **lang**: `en-us`

## Test URL

Use this URL to test the application with the provided session ID:

```
http://localhost:5173/?sess_id=c525e69f-a3de-4302-ad06-fb3d57ad4ca8&language=en-us&tableid=CF02
```

Or with `lang` parameter (also supported):
```
http://localhost:5173/?sess_id=c525e69f-a3de-4302-ad06-fb3d57ad4ca8&lang=en-us&tableid=CF02
```

## API Testing Examples

### 1. Get Player Info

**Endpoint:** `POST https://apih5.ho8.net/playerinfo.php`

**Request (Form-encoded):**
```
sess_id=c525e69f-a3de-4302-ad06-fb3d57ad4ca8&uniqueid=xg0Yqxw64
```

**Request (JSON):**
```json
{
  "sess_id": "c525e69f-a3de-4302-ad06-fb3d57ad4ca8",
  "uniqueid": "xg0Yqxw64"
}
```

### 2. Get Balance

**Endpoint:** `POST https://apih5.ho8.net/balance.php`

**Request (Form-encoded):**
```
sess_id=c525e69f-a3de-4302-ad06-fb3d57ad4ca8
```

### 3. Get Lobby Info

**Endpoint:** `POST https://apih5.ho8.net/lobbyinfo.php`

**Request:**
```
sess_id=c525e69f-a3de-4302-ad06-fb3d57ad4ca8&uniqueid=xg0Yqxw64
```

### 4. Get History

**Endpoint:** `POST https://apih5.ho8.net/history.php`

**Request:**
```
sess_id=c525e69f-a3de-4302-ad06-fb3d57ad4ca8&uniqueid=xg0Yqxw64&tableid=CF02
```

### 5. Get Odds

**Endpoint:** `POST https://apih5.ho8.net/odds.php`

**Request:**
```
sess_id=c525e69f-a3de-4302-ad06-fb3d57ad4ca8&r_no=<ROUND_NUMBER>&uniqueid=xg0Yqxw64
```

### 6. Place Bet

**Endpoint:** `POST https://apih5.ho8.net/bet_cflive.php`

**Request:**
```
sess_id=c525e69f-a3de-4302-ad06-fb3d57ad4ca8&t_id=CF02&r_id=<ROUND_ID>&type=21001&zone=M&amount=100&odds=1.95&uniqueid=xg0Yqxw64&anyodds=Y
```

## cURL Examples

### Get Player Info
```bash
curl -X POST https://apih5.ho8.net/playerinfo.php \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "sess_id=c525e69f-a3de-4302-ad06-fb3d57ad4ca8&uniqueid=xg0Yqxw64"
```

### Get Balance
```bash
curl -X POST https://apih5.ho8.net/balance.php \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "sess_id=c525e69f-a3de-4302-ad06-fb3d57ad4ca8"
```

### Get Lobby Info
```bash
curl -X POST https://apih5.ho8.net/lobbyinfo.php \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "sess_id=c525e69f-a3de-4302-ad06-fb3d57ad4ca8&uniqueid=xg0Yqxw64"
```

## JavaScript Fetch Examples

### Get Player Info
```javascript
const formData = new URLSearchParams()
formData.append('sess_id', 'c525e69f-a3de-4302-ad06-fb3d57ad4ca8')
formData.append('uniqueid', 'xg0Yqxw64')

const response = await fetch('https://apih5.ho8.net/playerinfo.php', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded'
  },
  body: formData.toString()
})

const data = await response.json()
console.log(data)
```

### Get Balance
```javascript
const formData = new URLSearchParams()
formData.append('sess_id', 'c525e69f-a3de-4302-ad06-fb3d57ad4ca8')

const response = await fetch('https://apih5.ho8.net/balance.php', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded'
  },
  body: formData.toString()
})

const data = await response.json()
console.log('Balance:', data.balance)
```

## Important Notes

1. **Session ID Validity**: The `sess_id` may expire. If you receive error code `B232`, the session has expired and you need to login again.

2. **Unique ID**: The `uniqueid` parameter is used for replay protection. Each request should use a unique value. However, for testing the same `uniqueid` can be reused after the cache expires (24 hours for login, 1 hour for betting).

3. **Language**: The `lang` parameter should match supported language codes (e.g., `en-us`, `zh-cn`).

4. **Table ID**: Common table IDs are:
   - `CF01` - Standard table
   - `CF02` - 24HR table (default)

## Error Codes Reference

| Code | Meaning                                   |
|------|-------------------------------------------|
| B100 | Success                                   |
| B232 | `sess_id` not found/expired               |
| B231 | Duplicate `uniqueid`                      |
| B230 | Parameter/format error                    |

See `backend_README.md` for complete error code list.

