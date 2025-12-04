# Real-Time Communication Report

## Overview
This report analyzes the real-time communication implementation for live video streaming and game state updates.

---

## Current Implementation Status

### ✅ WebSocket Implementation (Game State Updates)

**Location**: `src/hooks/useWebSocket.ts`

**Status**: ✅ **Implemented and Active**

**WebSocket URL**: 
- Environment variable: `VITE_WS_URL`
- Default fallback: `ws://localhost:8000/ws`

**Connected Message Types**:
1. ✅ `game_result` - Game round results (meron/wala/draw)
2. ✅ `game_status` - Game state updates (countdown, round changes)
3. ✅ `bet_confirmation` - Bet confirmation with balance updates
4. ✅ `account_update` - Account balance updates

**Features**:
- ✅ Automatic reconnection (max 3 attempts)
- ✅ Connection status tracking (`connected`, `disconnected`, `connecting`)
- ✅ Error handling with graceful fallbacks
- ✅ Message parsing and type handling

**Usage**:
- `App.tsx` (line 150): Connects on component mount
- Updates game store: `addGameHistory`, `updateGameStatus`, `setAccountBalance`

---

### ⚠️ Video URL Updates (HTTP Polling)

**Location**: `src/components/LiveVideo/LiveVideo.tsx`

**Status**: ⚠️ **HTTP Polling (Not Real-Time)**

**Current Implementation**:
- Polls `lobbyinfo.php` API every **10 seconds**
- Throttled to prevent excessive requests (5-second minimum between calls)
- Falls back to constructed URLs if API doesn't provide video URL

**Video URL Sources** (in priority order):
1. API response: `data.video_url`, `data.stream_url`, `data.live_url`
2. Table-specific data: `data[tableId].video_url`
3. Constructed from round: `https://vfile.dk77.bet/${round}.mp4`
4. Constructed HLS stream: `https://vfile.dk77.bet/${tableId}/live.m3u8`
5. Local fallback: `/videos/example.mp4`

**Limitations**:
- ⚠️ **Not real-time**: 10-second delay for video URL updates
- ⚠️ **Polling overhead**: Unnecessary API calls when nothing changes
- ⚠️ **No WebSocket integration**: Video URL changes not pushed in real-time

---

### ⚠️ Round/Table Updates (HTTP Polling)

**Location**: `src/App.tsx`, `src/components/GameHistory/GameHistory.tsx`

**Status**: ⚠️ **HTTP Polling (Not Real-Time)**

**Current Implementation**:
- `lobbyinfo.php`: Polled on table switch (line 173)
- `history.php`: Polled every **5 seconds** (GameHistory.tsx line 242)
- `balance.php`: Polled every **5 seconds** (AccountInfo.tsx line 53)

**Limitations**:
- ⚠️ **Polling delays**: 5-10 second delays for updates
- ⚠️ **Multiple polling intervals**: Different components poll independently
- ⚠️ **No WebSocket integration**: Round/table changes not pushed in real-time

---

## Backend WebSocket Reference

**From `backend_README.md` (line 111)**:
> `lobbyinfo.php` responds with `data` mirroring the `tableround` WebSocket payload, cached under `allTableRound` (TTL 3 seconds).

**Implication**: 
- Backend has a WebSocket system that broadcasts `tableround` messages
- `lobbyinfo.php` is a REST fallback that mirrors WebSocket data
- Frontend is currently using REST fallback instead of WebSocket

---

## Missing Real-Time Features

### ❌ Video URL Updates via WebSocket
- **Current**: HTTP polling every 10 seconds
- **Ideal**: WebSocket push when video URL changes
- **Impact**: Up to 10-second delay for video URL updates

### ❌ Round/Table Updates via WebSocket
- **Current**: HTTP polling every 5 seconds
- **Ideal**: WebSocket push for round changes, countdown updates, table status
- **Impact**: Up to 5-second delay for game state updates

### ❌ Real-Time Odds Updates
- **Current**: Fetched on round change via `odds.php`
- **Ideal**: WebSocket push when odds change
- **Impact**: May show stale odds if they change mid-round

### ❌ Live Bet Statistics
- **Current**: Not displayed
- **Ideal**: Real-time bet statistics (total bets per side, odds changes)
- **Impact**: Users can't see live betting activity

---

## Recommendations

### High Priority

#### 1. Integrate WebSocket for Round/Table Updates
**Action**: Extend `useWebSocket.ts` to handle `tableround` messages

**Expected WebSocket Message Format** (based on backend README):
```typescript
{
  type: 'tableround',
  payload: {
    tableId: string,
    roundId: string,
    r_no: number,
    countdown: number,
    status: 'betting' | 'fighting' | 'settled',
    video_url?: string,
    // ... other table/round data
  }
}
```

**Implementation**:
```typescript
case 'tableround':
  // Update round ID, countdown, status
  updateGameStatus({
    roundId: data.payload.roundId,
    currentRound: data.payload.r_no,
    countdown: data.payload.countdown,
    // ... other updates
  })
  // Update video URL if provided
  if (data.payload.video_url) {
    setLiveVideoUrl(data.payload.video_url)
  }
  break
```

**Benefits**:
- ✅ Real-time round updates (no 5-second delay)
- ✅ Real-time countdown updates
- ✅ Real-time video URL updates
- ✅ Reduced API polling overhead

#### 2. Integrate WebSocket for Video URL Updates
**Action**: Listen for video URL changes in WebSocket messages

**Implementation**: Add video URL update handler in `LiveVideo.tsx`:
```typescript
useEffect(() => {
  // Subscribe to WebSocket updates for video URL
  const unsubscribe = useWebSocket().onMessage((data) => {
    if (data.type === 'tableround' && data.payload.video_url) {
      setLiveVideoUrl(data.payload.video_url)
    }
  })
  return unsubscribe
}, [])
```

**Benefits**:
- ✅ Instant video URL updates (no 10-second delay)
- ✅ Reduced API calls
- ✅ Better user experience

### Medium Priority

#### 3. Integrate WebSocket for Odds Updates
**Action**: Listen for odds changes in WebSocket messages

**Expected Message Format**:
```typescript
{
  type: 'odds_update',
  payload: {
    r_id: string,
    odds: Array<{
      o_bettype: string,
      o_opentype: string,
      o_odds: number,
      // ...
    }>
  }
}
```

**Benefits**:
- ✅ Real-time odds updates
- ✅ No stale odds display
- ✅ Better betting experience

#### 4. Reduce HTTP Polling Frequency
**Action**: Use WebSocket as primary, HTTP polling as fallback

**Strategy**:
- If WebSocket connected: Poll every 30-60 seconds (fallback only)
- If WebSocket disconnected: Poll every 5 seconds (primary)

**Benefits**:
- ✅ Reduced server load
- ✅ Better performance
- ✅ Lower bandwidth usage

### Low Priority

#### 5. Add Real-Time Bet Statistics
**Action**: Display live betting statistics from WebSocket

**Expected Message Format**:
```typescript
{
  type: 'bet_stats',
  payload: {
    r_id: string,
    meron_total: number,
    wala_total: number,
    draw_total: number,
    meron_bets: number,
    wala_bets: number,
    draw_bets: number
  }
}
```

**Benefits**:
- ✅ Live betting activity display
- ✅ Better user engagement
- ✅ Social proof for betting

---

## Integration Checklist

### WebSocket Integration Tasks

- [ ] **Identify Backend WebSocket Endpoint**
  - [ ] Confirm WebSocket URL (may differ from REST API base URL)
  - [ ] Test WebSocket connection
  - [ ] Document message formats

- [ ] **Extend WebSocket Handler**
  - [ ] Add `tableround` message handler
  - [ ] Add `odds_update` message handler (if available)
  - [ ] Add `bet_stats` message handler (if available)
  - [ ] Add `video_url_update` message handler (if available)

- [ ] **Update Components**
  - [ ] `LiveVideo.tsx`: Subscribe to video URL updates
  - [ ] `BettingInterface.tsx`: Subscribe to odds updates
  - [ ] `GameHistory.tsx`: Subscribe to round updates
  - [ ] `App.tsx`: Subscribe to table/round updates

- [ ] **Implement Fallback Strategy**
  - [ ] Keep HTTP polling as fallback when WebSocket disconnected
  - [ ] Reduce polling frequency when WebSocket connected
  - [ ] Show connection status indicator

- [ ] **Testing**
  - [ ] Test WebSocket connection/disconnection
  - [ ] Test message handling
  - [ ] Test fallback to HTTP polling
  - [ ] Test video URL updates
  - [ ] Test round/table updates

---

## Current vs Ideal Architecture

### Current Architecture (HTTP Polling)
```
Frontend Components
    ↓ (poll every 5-10s)
REST API (lobbyinfo.php, history.php, balance.php)
    ↓
Backend Server
    ↓ (cached data, 3s TTL)
Redis/Database
```

**Issues**:
- ⚠️ Polling delays (5-10 seconds)
- ⚠️ Unnecessary API calls
- ⚠️ Server load from polling
- ⚠️ Stale data between polls

### Ideal Architecture (WebSocket + HTTP Fallback)
```
Frontend Components
    ↓ (subscribe)
WebSocket Connection
    ↓ (push updates)
Backend WebSocket Server
    ↓ (real-time events)
Redis/Database
    ↑ (fallback if WS disconnected)
REST API (poll every 30-60s)
```

**Benefits**:
- ✅ Real-time updates (instant)
- ✅ Reduced API calls
- ✅ Lower server load
- ✅ Always fresh data
- ✅ Better user experience

---

## Conclusion

### Current Status Summary

| Feature | Status | Method | Update Frequency |
|---------|--------|--------|------------------|
| Game Results | ✅ Real-Time | WebSocket | Instant |
| Game Status | ✅ Real-Time | WebSocket | Instant |
| Account Balance | ✅ Real-Time | WebSocket | Instant |
| Bet Confirmations | ✅ Real-Time | WebSocket | Instant |
| Video URL | ⚠️ Polling | HTTP | Every 10s |
| Round Updates | ⚠️ Polling | HTTP | Every 5s |
| Table Status | ⚠️ Polling | HTTP | Every 5s |
| Odds Updates | ⚠️ On-Demand | HTTP | On round change |
| Bet Statistics | ❌ Not Available | - | - |

### Overall Assessment

**Real-Time Communication**: ⚠️ **PARTIALLY INTEGRATED**

**Strengths**:
- ✅ WebSocket infrastructure exists and works
- ✅ Core game state updates are real-time
- ✅ Proper fallback handling

**Weaknesses**:
- ⚠️ Video URL updates use HTTP polling (10s delay)
- ⚠️ Round/table updates use HTTP polling (5s delay)
- ⚠️ No WebSocket integration for video/round updates
- ⚠️ Backend WebSocket (`tableround`) not utilized

### Priority Actions

1. **HIGH**: Integrate `tableround` WebSocket messages for real-time round/table updates
2. **HIGH**: Use WebSocket for video URL updates instead of polling
3. **MEDIUM**: Integrate odds updates via WebSocket (if available)
4. **LOW**: Add real-time bet statistics display

The foundation is solid, but there's significant room for improvement by utilizing the backend's WebSocket infrastructure for video and round updates.

