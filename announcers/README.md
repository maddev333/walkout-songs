# Custom Announcer Audio Files

Place your custom announcer audio files in this folder.

## File Naming Convention

### Option 1: Automatic Naming (Recommended)
Name your files using the player's jersey number:
```
player_5.mp3    # For player #5 (Gregory)
player_10.mp3   # For player #10 (Calvin)
player_7.mp3    # For player #7 (Jacob)
```

### Option 2: Custom Path in players.json
You can also specify a custom path in the `players.json` file by adding an `announcerFile` field:
```json
{
  "id": 1,
  "name": "Gregory",
  "number": "5",
  "song": "Girls Like You",
  "audioFile": "audio/girls-like-you---maroon-5.mp3",
  "announcerFile": "announcers/gregory-announcement.mp3"
}
```

## Audio Format
- **Format**: MP3 (recommended)
- **Quality**: Any quality works, but 128kbps or higher is recommended
- **Content**: Record announcements like "Number 5, Gregory!" or any custom message

## How It Works
1. Enable the "Enable Announcer" toggle in the Announcer Settings
2. Select a player
3. If an announcer file exists for that player, it will play first
4. After the announcement finishes, the player's walkout song will play automatically
5. If no announcer file exists, the song will play directly

## Volume Control
Use the volume slider in the Announcer Settings to adjust the announcer audio volume independently.
