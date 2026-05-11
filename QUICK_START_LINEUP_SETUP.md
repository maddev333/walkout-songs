# Quick Start: Lineup Setup for Game Tracking

## 5-Minute Setup Guide

### Step 1: Open Lineup View (⚾)
```
Click the "⚾ Lineup" button at the top
```

### Step 2: Position Your Players
**Option A: Auto-Arrange (Easiest)**
```
Click "⚡ Auto Arrange" button
→ Automatically assigns 9 players to field positions
→ Remaining players go to bench
```

**Option B: Manual Positioning (Recommended for specific setup)**
```
Click on an empty cell or player name
→ Choose a position from the modal
→ Player is assigned to that inning position
```

### Step 3: Save Your Lineup
The lineup is automatically saved to browser storage as you make changes.

### Step 4: Start a Game (🏆 Game Scorer)
```
1. Click "🏆 Game Scorer" button
2. Select your team: 🏠 Home or ✈️ Visitor
3. (Optional) Enter opponent info
4. Click "🆕 New Game"
5. See "📋 Current Batting Order" display with your players!
```

---

## Visual Example

### What You'll See

**After clicking "🆕 New Game":**

```
╔════════════════════════════════════════╗
║  🏆 Game Scorer                        ║
║  [🆕 New Game] [↩️ Undo] [⏭ End] [🏁 End]
╚════════════════════════════════════════╝

📋 Current Batting Order:
[1. #3 Gregory] [2. #6 Jake] [3. #10 Calvin] [4. #2 Kirk]
[5. #4 Nicolas] [6. #8 Ian] [7. #5 ?] [8. #1 ?] [9. #11 ?]
    ↑ CURRENT BATTER (highlighted in dark blue)

🏠 Our Team:  [🏠 Home] [✈️ Visitor]
⚾ Opponent:   [Team name] P: [#X Name]
🏃 Run Rule:   Auto-swap at 4 runs

[SCOREBOARD showing inning-by-inning scores]
[DIAMOND with base runners]
[BATTER INFO with current batter and song]
[GAME CONTROLS for recording plays]
```

---

## What Each Number Means

```
📋 Current Batting Order:
[1. #3 Gregory]

 ↓   ↓  ↓
 |   |  └─ Player name
 |   └──── Jersey number
 └──────── Batting order position (who bats first, second, etc.)
```

---

## Key Features

### 🔵 Current Batter (Dark Blue)
Shows which player is currently batting
```
[1. #3 Gregory]  ← CURRENT
[2. #6 Jake]
[3. #10 Calvin]
```

### 🔵 Next Batters (Light Blue)
Shows who's coming up next in order

### 🔄 Updates Automatically
When you get an out and advance to the next batter:
```
Before:  [1. #3 Gregory] [2. #6 Jake] [3. #10 Calvin]
                  ↑ CURRENT
                  
After:   [1. #3 Gregory] [2. #6 Jake] [3. #10 Calvin]
                             ↑ CURRENT
```

---

## Troubleshooting

### Q: I don't see the batting order display
**A**: Make sure you've clicked "🆕 New Game" - it only shows during active games

### Q: The wrong players are showing
**A**: Check the Lineup View:
1. Go to ⚾ Lineup
2. Verify players are positioned for the 1st inning
3. Mark unavailable players in 📋 Batting Order
4. Start a new game

### Q: I want to change the order mid-game
**A**: 
- Use ↩️ Undo to go back
- Or end game and start fresh
- Use substitutions to swap players in/out

### Q: Why is a player missing?
**A**: They might be marked as unavailable
1. Check 📋 Batting Order view
2. Verify the player is checked ✓ Available
3. Start a new game

---

## Order of Players

The game uses this priority:

1. **Lineup View (1st Inning)** ← FIRST CHOICE
   - Players you positioned in the 1st inning column
   - Most specific to your setup

2. **Batting Order View** ← SECOND CHOICE
   - If no lineup set
   - Order you manually created

3. **All Available Players** ← DEFAULT
   - If neither above is set
   - Everyone marked as "Available"

All sources are filtered by **availability** - players marked unavailable don't bat.

---

## Pro Tips

💡 **Tip 1: Use Auto-Arrange**
- Click "⚡ Auto Arrange" for quick setup
- Saves time and ensures all 9 field positions filled

💡 **Tip 2: Lock Played Innings**
- After an inning is complete, lock it
- Prevents auto-arrange from changing your setup

💡 **Tip 3: Check Availability**
- Mark injured/absent players as unavailable
- They won't appear in the batting order

💡 **Tip 4: Save Before Game**
- The lineup auto-saves, but you can also manually save
- Ensures your setup is preserved

💡 **Tip 5: Use Substitutions in Game**
- Swap players during the game
- Keeps batting order correct

---

## What Happens During Game

### Your Lineup Becomes:
```
Lineup View (1st Inning)
        ↓
Game Starting Order
        ↓
Players bat in that order
        ↓
Stats tracked per player
        ↓
Game Summary shows who played
```

### Stats Are Tracked For:
- ✅ Every at-bat
- ✅ Hits, walks, strikeouts
- ✅ Runs scored
- ✅ RBIs
- ✅ Everything visible after game ends

---

## Next Steps

1. **Go to Lineup View** → Set up your team
2. **Go to Game Scorer** → Click "🆕 New Game"
3. **See your team** → Check "📋 Current Batting Order"
4. **Start playing** → Record pitches and plays
5. **Track stats** → See performance in Stats tab

**Questions?** Check `LINEUP_GAME_TRACKING_INTEGRATION.md` for detailed documentation.

