# Game Tracking & Scoring — Implementation Plan

## Overview

This feature adds a full **game scoreboard/scorer** UI to the existing Walkout Songs app. It runs alongside (not inside) the songs, lineup, and batting order views. The scoreboard is a separate tab/page within the app, sharing player data (`players.json`) but adding game-state tracking on top.

---

## Phase 1: Foundation — Game State Model & Data Layer

### 1.1 Core Game State Object
Create a centralized game state store (in-memory, with localStorage persistence):

```javascript
let gameState = {
    gameStarted: false,
    currentInning: 1,
    halfInning: 'top',        // 'top' (visitors) or 'bottom' (home)
    outs: 0,
    battingTeam: 'home',       // which team is batting
    score: {
        home:    { innings: [0,0,0,0,0], total: 0 },
        visitors: { innings: [0,0,0,0,0], total: 0 }
    },
    bases: { first: null, second: null, third: null }, // playerId or null
    currentBattingOrder: [],    // ordered array of player IDs
    currentBatterIndex: 0,      // index into battingOrder
    atBatCount: 0,              // total at-bats this game
    pitcher: null,              // playerId of current pitcher
    fielders: {},               // { position: playerId }
    gameLog: [],                // array of event strings
    substitutions: [],          // { inning, half, playerIn, playerOut }
    startTime: null,
    endTime: null,
    history: []                 // snapshot stack for undo
};
```

### 1.2 Persistence
- Save/load `gameState` to `localStorage` as `walkoutGameState`
- Save history stack for undo
- Clear on "New Game" button press

### 1.3 Undo System
- Push a snapshot of `gameState` onto `history` before every mutative action
- `undo()` pops the last snapshot and restores state
- Limit history to 50 entries to avoid memory issues

### Deliverables
- [ ] `gameState` store module (or global object)
- [ ] `saveGameState()` / `loadGameState()`
- [ ] `pushHistory()` / `undo()` / `redo()`
- [ ] `newGame()` — reset everything with confirmation

---

## Phase 2: Inning & Score Tracking UI

### 2.1 Scoreboard Display
A persistent scoreboard component (top of the page or a dedicated section):

```
┌─────────────────────────────────────────┐
│  VISITORS:  X  │  Innings: [0][0][0]..  │
│  HOME:        Y  │  Innings: [0][0][0]..  │
│  Inning: Top 1st  │  Outs: ●●○            │
└─────────────────────────────────────────┘
```

- Runs per inning (column display for each team)
- Total score (large, prominent)
- Current inning indicator (Top/Bottom, 1st–6th)
- Outs display (dots/balls: ●●○)

### 2.2 Controls
- **Start New Game** button
- **End Inning** / **Next Inning** buttons
- **Top / Bottom** toggle
- **Outs counter** — increment manually or auto from outs
- **Score input** — tap to add runs to specific inning/team

### Deliverables
- [ ] Scoreboard UI component (HTML + CSS)
- [ ] Inning/half/out state management
- [ ] Score update functions (`addRuns(team, inning, count)`)
- [ ] Next inning logic (switches half, increments inning, resets bases/outs)
- [ ] Save to localStorage after each change

---

## Phase 3: At-Bat Flow

### 3.1 Current Batter Display
- Show the current batter's name, number, and song title (links back to existing player data)
- Highlight the batter row in the batting order
- "Next Batter" button to advance

### 3.2 At-Bat Input Buttons (Quick-Tap Interface)
Grouped into two categories for fast data entry:

**Count Buttons:**
| Ball | Strike | Foul |
|------|--------|------|

**Outcome Buttons:**
| Single | Double | Triple | HR | Walk | Strikeout |
|--------|--------|--------|----|-------|-----------|
| Ground Out | Fly Out | Error | | | |

### 3.3 Auto Logic
- **Count tracking:** Balls (0–3), Strikes (0–2), Foul handling (foul count ≤ 2 doesn't change strike count)
- **Walk (BB):** Auto-advance runners (forced advances only), then switch batter
- **Strikeout (SO):** Increment outs, switch batter
- **Outs (GO/FO/E):** Increment outs, switch batter
- **Hits (1B/2B/3B/HR):** Semi-automatic runner advancement (see Phase 4)
- **At-bat stats:** Track for each player (AB, H, 2B, 3B, HR, BB, SO)

### Deliverables
- [ ] At-bat button UI (grid layout, color-coded by category)
- [ ] Count display and auto-increment logic
- [ ] Outcome handlers that update base runners, outs, and score
- [ ] Auto-advance runners on walks
- [ ] Batter tracking (current batter highlight)
- [ ] Switch batter on 3 outs

---

## Phase 4: Base Runner Tracking (Diamond UI)

### 4.1 Diamond Visual Component
An SVG/CSS baseball diamond with runner markers:

```
        3rd ●
       /   \
      /     \
   2nd ●     ● 1st
    |         |
    |    ●    |
   1st ●───Home
```

- Each base shows the player's number/name
- Click a runner to:
  - **Advance** to next base
  - **Score** (send home, add run)
  - **Remove** (tagged out)

### 4.2 Semi-Auto Advancement
On hit outcomes:
- **Single:** Runners advance 1 base (auto) + batter to 1st. Manual override for aggressive runners.
- **Double:** Runners advance 2 bases (auto for those scoring), batter to 2nd
- **Triple:** Runners advance 3 bases, batter to 3rd
- **Home Run:** All runners score + batter, clear bases
- Errors: Manual — user decides runner advancement

### Deliverables
- [ ] Diamond UI component (CSS/SVG)
- [ ] Runner position tracking (`bases.first`, `bases.second`, `bases.third`)
- [ ] Click handlers for advance/score/remove
- [ ] Auto-advance on hits (configurable aggression)
- [ ] Run scoring → update team/inning score

---

## Phase 5: Player Stats

### 5.1 Batting Stats (Per Player)
```javascript
{
    atBats: 0, hits: 0, singles: 0, doubles: 0, triples: 0, homeRuns: 0,
    runs: 0, rbis: 0, walks: 0, strikeouts: 0,
    caughtStealing: 0, stolenBases: 0
}
```

- Track automatically during at-bat processing
- Display in a stats table view (per player)
- Team batting summary (AVG, OBP, total runs)

### 5.2 Pitching Stats (Simplified)
```javascript
{
    pitchesThrown: 0, strikes: 0, balls: 0,
    walks: 0, strikeouts: 0, runsAllowed: 0,
    hitsAllowed: 0, earnedRuns: 0
}
```

- Count pitches from Ball/Strike/Foul button presses
- Auto-track on outcomes (BB → walk, SO → strikeout)
- Runs allowed tracked when runs score off current pitcher

### 5.3 Fielding Stats (Optional, Phase 6)
- Errors (auto from Error outcome button)
- Putouts (manual)

### 5.4 Stats Display
- Per-player stat cards in a "Stats" view tab
- Team summary table
- Live-updating during the game

### Deliverables
- [ ] Stats data structures per player
- [ ] Auto-stat tracking on at-bat outcomes
- [ ] Stats view tab (player cards + team table)
- [ ] Pitch count tracking

---

## Phase 6: Game Log & Timeline

### 6.1 Event Log
A scrollable log of every play, formatted like:

```
[Top 1st] Out: #6 fly out to CF
[Top 1st] #12 singled, runner advanced to 3rd
[Top 1st] #3 doubled, #12 scored, #3 out at 3rd (error)
[Bottom 1st] #5 walked
[Bottom 1st] #7 home run (3 RBI)
```

### 6.2 Features
- **Editable:** Tap any log entry to edit (for corrections)
- **Undo:** "Undo Last Play" button (removes last log entry + reverts state)
- **Filter:** Show/hide by inning
- **Scroll to bottom** on new entries

### Deliverables
- [ ] Event log component (scrollable div)
- [ ] Log entry generation function (`addLogEntry(message)`)
- [ ] Editable log entries
- [ ] Undo last play (integrates with undo system)

---

## Phase 7: Substitutions

### 7.1 Swap Interface
- Select player to remove from game
- Select player to insert
- Record substitution in `gameState.substitutions[]`
- Update batting order position if needed

### 7.2 UI
- "Substitutions" tab or section within the game view
- List of available players (not currently in game)
- One-click swap with confirmation

### Deliverables
- [ ] Substitution UI
- [ ] Batting order update on sub
- [ ] Substitution log entries

---

## Phase 8: Game Summary & Export

### 8.1 Final Summary
After the game ends:
- Final score
- Full box score (per-inning run chart)
- Individual player stats table
- Game log recap

### 8.2 Export Options
- **JSON:** Full game state dump (already in memory, just download)
- **CSV:** Player stats table (convert JSON to CSV format)
- **PDF:** Pretty-printed box score + summary (use jsPDF or window.print())

### Deliverables
- [ ] Game summary view (HTML table + chart)
- [ ] Export JSON button
- [ ] Export CSV button
- [ ] Export PDF / Print button

---

## Phase 9: Integration with Existing Features

### 9.1 Player Data Sharing
- Pull batting order from existing `battingOrder` array
- Pull player names/numbers/songs from `players.json`
- Display player songs in the batter display (link to Songs View)

### 9.2 Lineup Integration
- Use the Lineup Matrix positions for fielding positions
- Auto-populate pitcher from the pitcher position assignment
- Display fielding positions during at-bat display

### 9.3 Availability
- Unavailable players cannot be selected as batters or fielders
- Show unavailable indicator in player selectors

### Deliverables
- [ ] Connect game view to existing player data
- [ ] Use batting order as default game batting order
- [ ] Filter unavailable players from game UI
- [ ] Fielding position display from Lineup Matrix

---

## File Structure Changes

### New Files
```
index.html          → add new "🏆 Game" tab button + game view container
styles.css          → add game scoreboard, diamond UI, stats table styles
app.js              → append game tracking modules (or split into separate file)
game_tracking.js    → [NEW] Game state, at-bat logic, base running, stats
game_export.js      → [NEW] Summary generation, CSV/PDF export
```

### Updated Files
- `index.html` — Add game view container and tab button
- `styles.css` — New CSS for scoreboard, diamond, stats, game log
- `app.js` — Wire up game view, integrate with existing player data

---

## Recommended Implementation Order

| Priority | Phase | Effort | Notes |
|----------|-------|--------|-------|
| 1 | 1 — Data Layer | Small | Foundation for everything else |
| 2 | 2 — Inning & Score UI | Small | Core scoreboard, immediately useful |
| 3 | 3 — At-Bat Flow | Medium | Heart of the scorer — quick-tap buttons |
| 4 | 4 — Base Runner UI | Medium | Diamond visualization, semi-auto advances |
| 5 | 6 — Game Log | Small | Easy win, integrates with undo |
| 6 | 5 — Player Stats | Medium | Auto-tracking from at-bat outcomes |
| 7 | 7 — Substitutions | Small | Simple swap UI |
| 8 | 9 — Integration | Medium | Connect to existing player/order data |
| 9 | 8 — Summary & Export | Small-Medium | Nice-to-have finale |

---

## UI/UX Considerations

1. **Mobile-first:** Most scoring will happen on a tablet/phone at the field. Buttons must be large and tappable.
2. **High contrast:** Outdoor sunlight readability — dark theme for scoreboard, bright runner markers.
3. **Minimal taps:** Outcome buttons should be in a grid, grouped logically. One-tap outcomes preferred.
4. **Undo is critical:** Coaches/scorers make mistakes. Every action must be undoable.
5. **No data loss:** Auto-save to localStorage after every action. Survive page refresh.
6. **Visual feedback:** Flash/sound on runs scored. Clear inning transitions.

---

## Technical Notes

- **No server required** — everything client-side with localStorage
- **No new dependencies** — use vanilla JS, CSS, and existing patterns in app.js
- **Responsive design** — grid layout for buttons, works on phones/tablets/desktop
- **State management** — single source of truth (`gameState` object) with snapshot-based undo
- **Event-driven** — each button press triggers a handler that updates state + UI
