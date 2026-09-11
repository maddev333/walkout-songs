# Announcer Voices

This folder contains generated sports announcer voice files for player walkout announcements.

## Voice Generation

The announcer voices are generated using **Qwen3-TTS** (Qwen3-TTS-12Hz-1.7B-CustomVoice model), which provides professional-quality text-to-speech with voice style control.

### How to Generate Announcer Voices

1. **Install Dependencies:**
   ```bash
   pip install torch soundfile qwen-tts
   ```

2. **Run the Generator Script:**
   ```bash
   python generate_announcer_voices.py
   ```

3. **Generated Files:**
   - Audio files are saved as `{PlayerName}.wav` (e.g., `Aiden.wav`, `Marcus.wav`)
   - Each file contains an exciting sports announcer-style announcement: "Batting for the Base Hunters! Number [N], [Player Name]!" (the jersey number is spoken, e.g. "Number eighteen"). Players without a number fall back to the name-only announcement.

### Voice Characteristics

- **Speaker:** Ryan (dynamic male voice with strong rhythmic drive)
- **Style:** Energetic sports announcer, excited and enthusiastic, professional stadium announcer style
- **Language:** English
- **Format:** WAV (can be converted to MP3 if needed)

### Converting WAV to MP3 (Optional)

If you want MP3 files instead of WAV:

```bash
# Using ffmpeg
ffmpeg -i Aiden.wav -codec:a libmp3lame -qscale:a 2 Aiden.mp3
```

Or batch convert all:
```bash
for %f in (*.wav) do ffmpeg -i "%f" -codec:a libmp3lame -qscale:a 2 "%~nf.mp3"
```

## File Naming Convention

- `{PlayerName}.wav` or `{PlayerName}.mp3`
- Where `{PlayerName}` is the player's name in Title case (no jersey number)

## Integration with Walkout Songs App

The announcer voices are automatically used by the walkout songs app when the "Enable Announcer" toggle is turned on. The app will:

1. Play the announcer voice first (announcing the player)
2. Automatically play the player's walkout song after the announcement completes
