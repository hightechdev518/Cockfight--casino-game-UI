# Table Switching Feature

The app now supports easy switching between 6 tables. Users can switch tables by clicking on table cards in the Game Summary view.

## How It Works

### 1. View All Tables
- Click the toggle button in the roadmap section (bottom right) to open **Game Summary**
- This shows all 6 available tables with their current status

### 2. Switch Tables
- Click on any table card to switch to that table
- The active table is highlighted with a gold border and indicator dot (●)
- The URL parameter `tableid` is automatically updated
- Game history is cleared when switching tables
- All components refresh automatically with the new table data

### 3. Table Information Displayed
Each table card shows:
- **Table Name** - The table identifier
- **Round Number** - Current round
- **Status** - Betting/Fighting
- **Players** - Number of players/online count

## Visual Indicators

- **Active Table**: Gold border, highlighted background, indicator dot (●)
- **Hover Effect**: Cards lift slightly and border brightens on hover
- **Clickable**: Cursor changes to pointer on hover

## Implementation Details

### Store Method
```typescript
switchTable(tableId: string)
```
- Updates `tableId` in the store
- Clears game history
- Resets round/countdown data

### URL Parameter Update
When switching tables, the URL is updated:
```
?tableid=CF01  →  ?tableid=CF02
```

### Auto-Refresh
When `tableId` changes:
- GameHistory component fetches new history
- LiveVideo component fetches new video URL
- BettingInterface updates for the new table
- All API calls use the new `tableId`

## Usage Example

1. **Open Game Summary**:
   - Click the toggle button (Lobby icon) in the roadmap section

2. **Select a Table**:
   - Click on any table card (e.g., "CF01", "CF02", etc.)

3. **View New Table**:
   - Game Summary closes automatically
   - All components refresh with the new table data
   - URL updates to reflect the new table

## Table IDs

The app supports 6 tables. Common table IDs include:
- `CF01` - Standard table
- `CF02` - 24HR table
- `CF03` - Additional table
- `CF04` - Additional table
- `CF05` - Additional table
- `CF06` - Additional table

(Actual table IDs depend on your backend configuration)

## Code Reference

- **Store**: `src/store/gameStore.ts` - `switchTable()` method
- **Component**: `src/components/GameHistory/GameSummary.tsx` - Table cards with click handlers
- **Styles**: `src/components/GameHistory/GameSummary.css` - Active table styling
- **URL Utils**: `src/utils/urlParams.ts` - `setUrlParam()` for URL updates

