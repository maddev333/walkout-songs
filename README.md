# Little League Walkout Songs

A simple static web app to manage and play walkout songs for little league baseball games.

## Features
- Select players by name and number
- Play, pause, and stop pre-selected walkout songs
- Auto-play when selecting a player
- Responsive design for desktop and mobile

## Setup Instructions

1. **Place Audio Files**: Put your MP3 audio files in the `audio/` folder

2. **Configure Players**: Edit `players.json` to add your players and their songs:

```json
{
  "players": [
    {
      "id": 1,
      "name": "Player Name",
      "number": "5",
      "song": "Song Title",
      "audioFile": "audio/song-name.mp3"
    }
  ]
}
```

3. **Run the App**: 
   - Simply open `index.html` in a web browser, OR
   - Use any static web server:
     ```bash
     # Using Python
     python -m http.server 8000
     
     # Using Node.js (serve package)
     npx serve
     
     # Using PHP
     php -S localhost:8000
     ```

4. **Access**: Open your browser and navigate to `http://localhost:8000` (or just open the HTML file directly)

## File Structure
```
walkout-songs/
├── index.html          # Main HTML file
├── styles.css          # Styling
├── app.js              # JavaScript functionality
├── players.json        # Player-song mappings
├── audio/              # Audio files folder
│   ├── song1.mp3
│   ├── song2.mp3
│   └── ...
└── README.md           # This file
```

## Customization
- Edit `styles.css` to change colors and styling
- Add/remove players in `players.json`
- Replace audio files in the `audio/` folder

## Notes
- Audio files should be in MP3 format for best compatibility
- Each player needs a unique ID
- The app will auto-play when a player is selected
