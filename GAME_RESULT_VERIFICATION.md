# Game Result Reception Verification

## Current Implementation Status

### ✅ WebSocket Message Handlers

#### 1. **`game_result` Message** (Lines 247-267)
- **Status**: ✅ **FULLY IMPLEMENTED**
- **Extracts**: `result`, `round`, `meronCard`, `walaCard`
- **Action**: Adds to game history via `addGameHistory()`
- **Timer**: Starts 20-second betting countdown

#### 2. **`tableround` Message** (Lines 281-376)
- **Status**: ✅ **FULLY IMPLEMENTED**
- **Extracts**: `drawresult` or `result1` from payload
- **Parsing**: Handles JSON strings like `"\"M\""` and numeric codes (21001/21002/21003)
- **Mapping**: Converts M/W/D to meron/wala/draw
- **Validation**: Checks for `status === 4` or `roundstatus === 4` (settled)
- **Action**: Adds to game history if valid round number and result
- **Timer**: Starts 20-second betting countdown

#### 3. **Production Server Array Format** (Lines 69-211)
- **Status**: ✅ **FULLY IMPLEMENTED**
- **Format**: `[{tableid, trid, roundstatus, drawresult, result1, ...}, ...]`
- **Extracts**: `drawresult` or `result1` from table data
- **Parsing**: Handles JSON strings and maps M/W/D
- **Action**: Adds to game history and starts betting timer
- **Table Matching**: Only processes data for current table

#### 4. **Production Server Lobby Format** (Lines 213-243)
- **Status**: ⚠️ **PARTIAL** - Missing result extraction
- **Format**: `{ ts: "...", data: [{tableid, trid, ...}, ...] }`
- **Current**: Only updates game status (roundId, currentRound, roundStatus)
- **Missing**: Does NOT extract `drawresult` or `result1` from `data.data` array
- **Issue**: Results in this format are not being captured

### ✅ HTTP API Polling (Fallback)

**Location**: `src/components/GameHistory/GameHistory.tsx`
- **Status**: ✅ **FULLY IMPLEMENTED**
- **Endpoints**: `/history.php` (authenticated) or `/public_history.php` (public)
- **Frequency**: Every 5 seconds (throttled to 3 seconds minimum)
- **Extracts**: Results from API response and updates game history

---

## Issues Found

### ⚠️ Issue 1: Production Lobby Format Missing Result Extraction

**Location**: `src/hooks/useWebSocket.ts` lines 213-243

**Problem**: The production server lobby format handler doesn't extract game results from the `data.data` array.

**Current Code**:
```typescript
if (data.ts && !data.type) {
  if (Array.isArray(data.data)) {
    data.data.forEach((tableData: any) => {
      if (tableData.tableid && tableData.trid) {
        const updateStatus: any = {
          tableId: tableData.tableid,
          roundId: tableData.trid?.toString(),
          currentRound: parseInt(tableData.r_info?.cf_roundno || '0', 10),
          isLive: tableData.enable && tableData.tablestatus === 1
        }
        if (tableData.roundstatus !== undefined) {
          updateStatus.roundStatus = tableData.roundstatus
        }
        updateGameStatus(updateStatus)
        // ❌ MISSING: Result extraction here
      }
    })
  }
}
```

**Fix Needed**: Add result extraction similar to the array format handler (lines 154-202).

---

## Verification Checklist

### WebSocket Connection
- [x] Auto-connects on app mount
- [x] Auto-reconnects on disconnect
- [x] Sends authentication with session ID

### Result Reception
- [x] `game_result` message handler works
- [x] `tableround` message handler extracts results
- [x] Production array format extracts results
- [ ] Production lobby format extracts results (⚠️ MISSING)

### Result Processing
- [x] Parses JSON string results (`"\"M\""`)
- [x] Handles numeric codes (21001/21002/21003)
- [x] Maps M/W/D to meron/wala/draw
- [x] Validates round number before adding
- [x] Checks settlement status

### UI Updates
- [x] Results added to game history store
- [x] Game history component displays results
- [x] Timer starts after result (20 seconds)
- [x] Round status updates correctly

---

## Testing Recommendations

### 1. Monitor WebSocket Messages
Open browser console and check for:
- `✅ Game result received, starting 20-second betting timer`
- `✅ Game result from WebSocket array, starting 20-second betting timer`
- `✅ Extracted result from tableround, starting 20-second betting timer`

### 2. Check Game History Store
```javascript
// In browser console
import { useGameStore } from './store/gameStore'
console.log('Game History:', useGameStore.getState().gameHistory)
```

### 3. Verify Result Format
Check if server sends results in these formats:
- `{ type: 'game_result', payload: { result: 'meron', round: 42 } }`
- `{ type: 'tableround', payload: { drawresult: '"M"', r_no: 42 } }`
- `[{ tableid: 'CF01', drawresult: '"M"', trid: 123 }]`
- `{ ts: "...", data: [{ tableid: 'CF01', drawresult: '"M"' }] }`

---

## Recommended Fix

Add result extraction to the production lobby format handler:

```typescript
if (data.ts && !data.type) {
  if (Array.isArray(data.data)) {
    const currentTableId = useGameStore.getState().tableId
    data.data.forEach((tableData: any) => {
      if (tableData.tableid && tableData.trid) {
        const itemTableId = tableData.tableid
        const tableMatches = itemTableId && currentTableId && 
          itemTableId.toUpperCase() === currentTableId.toUpperCase()
        
        if (tableMatches) {
          const updateStatus: any = {
            tableId: itemTableId,
            roundId: tableData.trid?.toString(),
            currentRound: parseInt(tableData.r_info?.cf_roundno || '0', 10),
            isLive: tableData.enable && tableData.tablestatus === 1
          }
          
          if (tableData.roundstatus !== undefined) {
            updateStatus.roundStatus = tableData.roundstatus
          }
          
          updateGameStatus(updateStatus)
          
          // ✅ ADD: Extract game result if present
          if (tableData.drawresult || tableData.result1) {
            let result = tableData.result1 || tableData.drawresult
            
            // Parse JSON string if needed
            if (typeof result === 'string' && result.startsWith('"') && result.endsWith('"')) {
              try {
                result = JSON.parse(result)
              } catch (e) {}
            }
            
            // Map result
            let mappedResult: 'meron' | 'wala' | 'draw' = 'meron'
            if (typeof result === 'string') {
              const resultUpper = result.toUpperCase().trim()
              if (resultUpper === 'M' || resultUpper === 'MERON') mappedResult = 'meron'
              else if (resultUpper === 'W' || resultUpper === 'WALA') mappedResult = 'wala'
              else if (resultUpper === 'D' || resultUpper === 'DRAW') mappedResult = 'draw'
            }
            
            const roundNumber = updateStatus.currentRound || 
              parseInt(tableData.r_info?.cf_roundno || '0', 10)
            
            if (roundNumber > 0 && mappedResult) {
              addGameHistory({
                round: roundNumber,
                result: mappedResult,
                timestamp: Date.now()
              })
              
              updateGameStatus({
                countdown: 20,
                roundStatus: 1
              })
            }
          }
        }
      }
    })
  }
}
```

---

## Summary

**Overall Status**: ✅ **MOSTLY WORKING** - 3 out of 4 WebSocket handlers extract results correctly

**Missing**: Result extraction from production lobby format (`{ ts: "...", data: [...] }`)

**Impact**: Low - Other handlers should catch most results, but this format may be missed if it's the primary format used by the server.

