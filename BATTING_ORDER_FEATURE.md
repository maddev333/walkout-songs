# Batting Order Feature Guide

## Overview
This feature allows you to easily arrange and manage the batting order for players, with the ability to mark players as unavailable when they can't make it to a game.

## Features

### 1. **View Toggle**
- Switch between "Songs View" (grid of player buttons) and "Batting Order" (list view)
- Located at the top of the page

### 2. **Batting Order Management**
- **Drag and Drop**: Click and drag players to reorder them in the batting order
- **Arrow Buttons**: Use ▲ (up) and ▼ (down) arrows to move players one position at a time
- **Position Numbers**: Each player shows their batting position (1, 2, 3, etc.)

### 3. **Player Availability**
- **Toggle Availability**: Each player has an "Available" checkbox
  - ✓ Checked = Player is available (green)
  - ✗ Unchecked = Player is unavailable (greyed out with strikethrough)
- **Show/Hide Unavailable**: Toggle to show or hide unavailable players in the list
- **Automatic Updates**: Unavailable players are automatically greyed out in the Songs View and cannot be selected

### 4. **Save & Reset**
- **Save Order** (💾): Saves current batting order and availability to browser storage
- **Reset Order** (🔄): Resets to default order and makes all players available

### 5. **Persistent Storage**
- Batting order and player availability are automatically saved to your browser
- Settings persist across sessions - no need to reconfigure every time

## How to Use

### Setting Up a Batting Order:
1. Click the **"📋 Batting Order"** button
2. Arrange players by:
   - Dragging them to the desired position, OR
   - Using the up/down arrow buttons
3. Click **"💾 Save Order"** to save your arrangement

### Managing Player Availability:
1. In the Batting Order view, find the player who can't make it
2. Uncheck their **"Available"** checkbox
3. The player will be:
   - Greyed out in the batting order list
   - Greyed out and disabled in the Songs View
   - Automatically skipped during play
4. Click **"💾 Save Order"** to save availability changes

### During a Game:
1. Use the **"🎵 Songs View"** to quickly select available players
2. Unavailable players are automatically disabled and cannot be clicked
3. The announcer will only announce available players

### Tips:
- Use the "Show Unavailable Players" toggle to temporarily hide unavailable players from the list
- Click on any player in the batting order to play their song
- The batting order affects the display order in both views
- All settings are saved automatically when you click the Save button

## Technical Details
- Data is stored in browser's localStorage
- No server required - everything works locally
- Compatible with all modern browsers
- Mobile-friendly interface with touch support
