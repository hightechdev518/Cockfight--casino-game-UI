# Game Results Reception - Summary

## Overview
Game results are received from **2 main sources**:

---

## 1. ✅ WebSocket (Real-Time) - PRIMARY SOURCE

**Location**: `src/hooks/useWebSocket.ts`

**WebSocket URL**: 
- `wss://wss.ho8.net:2087/` (primary)
- `wss://wss.ho8.net:2096/` (fallback)

**Connection**: 
- Auto-connects on app mount (`App.tsx` line 312)
- Auto-reconnects on disconnect (max 5 attempts)

### Message Types That Contain Game Results:

#### A. `game_result` Message (Lines 94-103)
```typescript
case 'game_result':
  if (data.payload) {
    const history: GameHistory = {
      round: data.payload.round || 0,
      result: data.payload.result,  // 'meron' | 'wala' | 'draw'
      meronCard: data.payload.meronCard,
      walaCard: data.payload.walaCard
    }
    addGameHistory(history)  // Adds to game store
  }
  break
```

**Status**: ✅ **IMPLEMENTED** - Receives real-time game results via WebSocket

**When Received**: When a round finishes and result is determined

---

#### B. `tableround` Message (Lines 118-140)
```typescript
case 'tableround':
  // Updates round status, countdown, roundId
  updateGameStatus(tableroundUpdate)
  // May contain drawresult in payload
  break
```

**Status**: ✅ **IMPLEMENTED** - Receives round updates (may contain results)

**When Received**: Periodically during betting phase and when round status changes

---

#### C. Production Server Format (Lines 69-89)
```typescript
// Format: { ts: "2025-12-04T08:40:51.241Z", data?: [...], ... }
if (data.ts && !data.type) {
  // data.data is array of table round info
  // May contain drawresult or result information
  data.data.forEach((tableData: any) => {
    updateGameStatus({
      tableId: tableData.tableid,
      roundId: tableData.trid,
      currentRound: tableData.r_info?.cf_roundno,
      // May contain drawresult field
    })
  })
}
```

**Status**: ✅ **IMPLEMENTED** - Handles production server's WebSocket format

**When Received**: Real-time updates from production server

---

## 2. ⚠️ HTTP API Polling (Fallback) - SECONDARY SOURCE

**Location**: `src/components/GameHistory/GameHistory.tsx`

**API Endpoints**:
- `/history.php` (authenticated, requires session)
- `/public_history.php` (public, no session required)

**Polling Frequency**: Every **5 seconds**

**Code Location**: Lines 200-236

```typescript
const fetchHistory = useCallback(async () => {
  // Throttle: don't fetch more than once every 3 seconds
  if (now - lastFetchTimeRef.current < 3000) return
  
  // Try authenticated endpoint first, fallback to public
  if (sessionManager.getSessionId()) {
    historyData = await apiService.getHistory(tableId)
  } else {
    historyData = await apiService.getPublicHistory(tableId)
  }
  
  // Parse response and update game history
  const parsedHistory = parseApiHistory(historyData, tableId)
  setGameHistory(parsedHistory)
}, [tableId, parseApiHistory, setGameHistory])
```

**Response Format** (from original site):
```json
{
  "code": "B100",
  "data": [
    {
      "tableid": "CF01",
      "trid": 1265634,
      "drawresult": "\"M\"",
      "result1": "M",
      "status": 4
    },
    ...
  ],
  "accu": {
    "21000@M": 52,
    "21000@W": 42,
    "21000@D": 6
  }
}
```

**Status**: ✅ **IMPLEMENTED** - Fetches historical results via API polling

**When Received**: 
- On component mount
- Every 5 seconds (polling)
- When tableId changes

---

## 3. ❌ Missing: WebSocket Result Extraction

**Issue**: The WebSocket `tableround` message may contain `drawresult` field, but it's not being extracted.

**Current Code** (useWebSocket.ts line 118-140):
```typescript
case 'tableround':
  // Only updates roundId, currentRound, countdown
  // Does NOT extract drawresult if present
  updateGameStatus(tableroundUpdate)
  break
```

**What's Missing**: 
- Check if `data.payload.drawresult` exists
- Extract result and add to game history
- Handle `result1` field if present

---

## Summary Table

| Source | Method | Frequency | Status | Location |
|--------|--------|-----------|--------|----------|
| **WebSocket `game_result`** | Real-time push | Instant | ✅ Working | `useWebSocket.ts:94` |
| **WebSocket `tableround`** | Real-time push | Instant | ⚠️ Partial (no result extraction) | `useWebSocket.ts:118` |
| **WebSocket production format** | Real-time push | Instant | ✅ Working | `useWebSocket.ts:69` |
| **HTTP `/history.php`** | Polling | Every 5s | ✅ Working | `GameHistory.tsx:200` |
| **HTTP `/public_history.php`** | Polling | Every 5s | ✅ Working | `GameHistory.tsx:200` |

---

## Recommendations

### 1. Extract Results from `tableround` Messages
Add result extraction to `tableround` handler:

```typescript
case 'tableround':
  // ... existing code ...
  
  // Extract drawresult if present
  if (data.payload?.drawresult || data.payload?.result1) {
    const result = data.payload.result1 || data.payload.drawresult
    // Parse result (M/W/D)
    let mappedResult: 'meron' | 'wala' | 'draw' = 'meron'
    if (result === 'M' || result === 'meron') mappedResult = 'meron'
    else if (result === 'W' || result === 'wala') mappedResult = 'wala'
    else if (result === 'D' || result === 'draw') mappedResult = 'draw'
    
    // Add to history if we have round info
    if (data.payload.trid || data.payload.roundId) {
      addGameHistory({
        round: parseInt(data.payload.r_info?.cf_roundno || data.payload.r_no || '0', 10),
        result: mappedResult
      })
    }
  }
  break
```

### 2. Check Production WebSocket Format
The production server format (line 69) may also contain `drawresult` in the table data. Check if `tableData.drawresult` exists and extract it.

---

## Current Flow

```
Game Result Determined
    ↓
Backend Server
    ↓
[WebSocket] → Frontend (useWebSocket.ts) → addGameHistory() → Game Store
    ↓
[HTTP API] → Frontend (GameHistory.tsx) → setGameHistory() → Game Store
    ↓
Game Store → UI Components (GameHistory, LiveVideo)
```

---

## Conclusion

**Primary Source**: WebSocket `game_result` messages (real-time)  
**Secondary Source**: HTTP API polling every 5 seconds (fallback/history)  
**Missing**: Result extraction from `tableround` WebSocket messages

The app currently receives game results from both WebSocket and HTTP polling, but may be missing results from `tableround` messages if they contain `drawresult` field.

