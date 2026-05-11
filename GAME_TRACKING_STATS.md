# Little League AA Game Scoring – Feature Specification

## 1. Game State Tracking

### Inning Management
- Current inning (1–6 typical for AA)
- Top / Bottom
- Outs (0–3)

### Score Tracking
- Runs per inning
- Total score

---

## 2. At-Bat Flow

Each at-bat should be quick to record with minimal taps.

### 2.1 Inputs

**Batter Selection**
- Select current batter

**Pitch Result Buttons**
- Ball
- Strike
- Foul

**Outcome Buttons**
- Single
- Double
- Triple
- Home Run
- Walk
- Strikeout
- Ground Out
- Fly Out
- Error

### Auto Logic
- Count tracking (balls/strikes)
- Outs increment automatically
- Base runner advancement (semi-manual or assisted)

---

## 3. Base Runner Tracking

### Visuals
- Diamond UI showing bases

### Runner Positions
- 1st base
- 2nd base
- 3rd base

### Manual Overrides
- Advance runner
- Score run
- Remove runner (out)

---

## 4. Player Stats

### Batting Stats
- At-bats (AB)
- Hits (H)
- Batting Average (AVG) = H/AB
- Singles (1B)
- Doubles (2B)
- Triples (3B)
- Home Runs (HR)
- Runs (R)
- RBIs
- Walks (BB)
- Strikeouts (K)

### Pitching Stats
- Pitches thrown (P)
- Strikes (S)
- Balls (B)
- Walks (BB)
- Strikeouts (K)
- Hits allowed (H)
- Runs allowed (R)
- Innings pitched (IP)

### Fielding (Optional)
- Errors
- Putouts

---

## 5. Recent Fixes & Improvements

### Stats Tracking Fixes
- **Fixed incorrect runs counting**: Batter runs now only increment when player actually scores (not on every hit)
- **Added runner runs tracking**: Individual runs stats now properly credit players who score from other batters' hits
- **Enhanced pitching stats**: Added hits allowed and runs allowed tracking for both team and opponent pitchers
- **Added batting average**: AVG column shows H/AB with proper formatting (.300, .000, etc.)
- **Added innings pitched**: IP column for pitcher workload tracking

### Stats Display
- Batting table: Player | AB | H | AVG | 1B | 2B | 3B | HR | R | RBI | BB | K
- Pitching table: Player | P | S | B | BB | K | H | R | IP

---

## 6. Game Log
- Swap players in/out of lineup
- Track batting order

---

## 6. Game Log

### Timeline of Events
- Example: "Top 2nd: #12 singled, runner advanced to 3rd"

### Features
- Editable log
- Undo last play

---

## 7. Undo / Edit
- Undo last action (critical feature)
- Edit past play (advanced)

---

## 8. Game Summary

### Outputs
- Final score
- Box score
- Player stats

### Export Options
- PDF
- CSV
- JSON