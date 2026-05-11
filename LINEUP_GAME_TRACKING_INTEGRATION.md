# Lineup Integration with Game Tracking

## Overview

This document explains how the lineup system from the **Lineup View** (⚾ tab) integrates with the **Game View** (🏆 tab) for game tracking and scoring.

---

## How the Lineup Flows into Game Tracking

### Data Flow

```
┌─────────────────────────┐
│  Lineup View (⚾)       │  ← User positions players in 5-inning lineup
│  - Position players     │
│  - Auto-arrange         │
│  - Lock innings         │
└──────────┬──────────────┘
           │
           ├─→ playerLineup (global) - stores full 5-inning lineup
           │
           └─→ playerAvailability - tracks which players are available
                       │
                       ▼
        ┌──────────────────────────────┐
        │  When Starting New Game       │
        │  ("🆕 New Game" button)     │
        └──────────────┬───────────────┘
                       │
         ┌─────────────┴──────────────┐
         │  Game Initialization        │
         │  (startNewGame function)    │
         └──────────────┬──────────────┘
                        │
        ┌───────────────┴────────────────────┐
        │  Priority for Batting Order:       │
        │  1. Lineup View (playerLineup)     │
        │  2. Batting Order View (battingOrder)
        │  3. All available players          │
        └──────────────┬─────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────────┐
        │  gameState.currentBattingOrder    │  ← Game view uses this
        │  - Filtered by player availability
        │  - Ordered from selected source   │
        └──────────────┬─────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────────┐
        │  Game View (🏆 Game Scorer)      │
        │  - Current batting order display  │
        │  - Tracks stats                   │
        │  - Records plays                  │
        └──────────────────────────────────┘
```

---

## Priority Logic

When you click **"🆕 New Game"**, the batting order is determined in this order:

### 1. **Lineup View (Primary)**
If you've set up a lineup in the Lineup View:
- Players positioned in the **1st inning** are pulled from `playerLineup`
- Only players with non-"Bench" positions are included
- This is the **preferred source** - it's most specific to your team

**Example:**
```
Lineup View (1st inning):
  1B: Gregory (#3)
  SS: Jake (#6)
  LF: Calvin (#10)
  ...and 6 more field players
  
Result: Game uses [3, 6, 10, ...] for batting order
```

### 2. **Batting Order View (Secondary)**
If no lineup is set but you saved a custom batting order:
- Players from the Batting Order View are used
- Must have been saved with "💾 Save Order" button
- Respects availability toggles

### 3. **All Available Players (Default)**
If neither lineup nor batting order is set:
- All players marked as "Available" are used
- Ordered by player ID

---

## Filtering by Availability

After selecting the source, the batting order is **filtered by player availability**:

```javascript
gameState.currentBattingOrder = gameState.currentBattingOrder.filter(id => playerAvailability[id]);
```

**Result:** Only players marked as ✓ Available participate in the game.

---

## Current Batting Order Display

### What You'll See

Once you start a game, the **Current Batting Order** appears below the game header:

```
📋 Current Batting Order:
[1. #3 Gregory] [2. #6 Jake] [3. #10 Calvin] [4. #2 Kirk] ...
```

- **Dark blue badge** = Current batter
- **Light blue badge** = Next batters
- **Order** = Exact sequence players will bat

---

## Workflow: From Lineup to Game

### Recommended Workflow

1. **Set Up Lineup** (Optional but Recommended)
   - Go to **⚾ Lineup** tab
   - Click "⚡ Auto Arrange" OR manually position players
   - Lock finished innings if you want to preserve them
   - Players in 1st inning will be used for game

2. **Or Use Batting Order** (Alternative)
   - Go to **📋 Batting Order** tab
   - Drag players to reorder
   - Toggle "Available" checkbox for each player
   - Click "💾 Save Order"

3. **Start Game**
   - Go to **🏆 Game Scorer** tab
   - Set "🏠 Our Team" (Home or Visitor)
   - Enter opponent info (optional)
   - Click "🆕 New Game"
   - **Current Batting Order** displays showing who will bat

4. **Play Game**
   - Record pitches, hits, outs
   - Stats automatically track by player
   - When a player bats, they're from the order you set

---

## Troubleshooting

### "Why is my lineup not showing in the game?"

**Possible Causes:**

1. **Lineup View not configured**
   - No players assigned in Lineup View
   - Fix: Go to ⚾ Lineup tab and set up positions

2. **Players marked as unavailable**
   - Check the "👁️ Show Unavailable Players" toggle
   - Verify players are checked as "Available" in Batting Order View
   - Fix: Toggle availability to ✓

3. **Batting Order View was modified**
   - If you manually reordered players in Batting Order View, save it
   - Fix: Click "💾 Save Order" in Batting Order View

4. **Cache issue**
   - Browser stored old game state
   - Fix: Start a fresh game with "🆕 New Game" button

### "Why are players in different order than I set?"

**Possible Cause:** Unavailable players were filtered out
- **Expected behavior:** Only available players bat
- **Check:** Verify "Available" checkboxes in Batting Order View

### "How do I change the batting order mid-game?"

**Current limitation:** Batting order is locked once game starts
- **Workaround:** Use "↩️ Undo" to go back, or end game and start new game
- **Substitutions:** Use substitution feature to swap players in/out

---

## Lineup View Features and Game Impact

| Feature | Impact on Game |
|---------|----------------|
| **Auto Arrange** | Sets initial field positions (not used in game directly) |
| **Lock Innings** | Preserves positions for reference (doesn't lock game order) |
| **Position Assignment** | Determines who pitches (if applicable) |
| **Player Lineup Matrix** | Primary source for game batting order |

---

## Data Structure Reference

### playerLineup (app.js)
```javascript
playerLineup = {
  1: { positions: ['1B', '1B', '1B', '1B', '1B'] },  // Gregory at 1B all innings
  6: { positions: ['SS', 'Bench', 'SS', 'SS', 'SS'] }, // Jake at SS except 2nd inning
  ...
}
```

### battingOrder (app.js)
```javascript
battingOrder = [3, 6, 10, 2, 4, 8, 5, 7, 9];  // Ordered player IDs
```

### gameState.currentBattingOrder (game_tracking.js)
```javascript
gameState.currentBattingOrder = [3, 6, 10, 2, 4, 8, 5, 7, 9];  // Used during game
gameState.currentBatterIndex = 0;  // Index of current batter (0 = Gregory)
```

---

## Notes

- **Lineup View is the source of truth** for team setup
- **Availability toggles apply to both views**
- **Changes made mid-game require a new game to take effect**
- **Pitcher assignment** comes from Lineup View ("Pitcher" position in 1st inning)

