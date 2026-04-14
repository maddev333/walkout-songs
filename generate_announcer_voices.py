"""
Generate sports announcer voices for players using Qwen3-TTS.

This script uses the Qwen3-TTS CustomVoice model to generate professional
sports announcer-style voice announcements for each player in the roster.
The generated audio files are saved to the 'announcers' folder.

Usage:
    python generate_announcer_voices.py

Requirements:
    pip install torch soundfile qwen-tts
"""

import json
import os
import torch
import soundfile as sf
from qwen_tts import Qwen3TTSModel


def load_players(filepath: str = "players.json") -> list:
    """Load players from JSON file."""
    with open(filepath, 'r') as f:
        data = json.load(f)
    return data.get("players", [])


def ensure_directory(directory: str):
    """Ensure output directory exists."""
    os.makedirs(directory, exist_ok=True)


def generate_announcer_text(player: dict) -> str:
    """
    Generate Baseball announcer-style text for a player.
    
    Creates an exciting professional stadium announcer, announcement format like:
    "Number [X], [Player Name]!"
    """
    name = player.get("name", "Player")
    number = player.get("number", "0")
    
    # Sports announcer style announcement
    return f"Now batting, Number {number}, {name}!"

'''
def generate_announcer_voice(
    tts_model: Qwen3TTSModel,
    text: str,
    speaker: str = "Ryan",
    instruct: str = "Energetic Baseball announcer voice, professional stadium announcer style. Needs to sound like a walkout announcer."
) -> tuple:
    """
    Generate announcer voice using Qwen3-TTS CustomVoice model.
    
    Args:
        tts_model: The Qwen3TTSModel instance
        text: Text to synthesize
        speaker: Voice speaker (Ryan is a dynamic male voice with strong rhythmic drive)
        instruct: Voice style instruction
    
    Returns:
        Tuple of (waveform, sample_rate)
    """
    wavs, sr = tts_model.generate_custom_voice(
        text=text,
        language="English",
        speaker=speaker,
        instruct=instruct,
        max_new_tokens=2048
    )
    return wavs, sr
'''
def generate_announcer_voice(
    tts_model: Qwen3TTSModel,
    text: str,
    speaker: str = "Ryan",
    instruct: str = (
        "Live ballpark batter walkout announcer with classic stadium ambiance. "
        "Deep, resonant baritone voice with professional PA system quality. "
        "Dramatic pause before player number, then enthusiastic delivery. "
        "Emphasize the player number with strong rhythmic drive, player name with warm enthusiasm. "
        "Background crowd murmur audible but not overpowering. "
        "Broadcast radio quality clarity with stadium reverb. "
        "Speed: Moderate pace (110-120 BPM) with deliberate pronunciation."
    ),
    temperature: float = 0.8,
    length_penalty: float = 1.1,
    max_new_tokens: int = 4096,
) -> tuple:
    """
    Generate announcer voice using Qwen3-TTS CustomVoice model.
    
    Args:
        tts_model: The Qwen3TTSModel instance
        text: Text to synthesize
        speaker: Voice speaker (Ryan is a dynamic male voice with strong rhythmic drive)
        instruct: Voice style instruction for authentic baseball announcer sound
        temperature: Controls randomness (0.7-0.9 recommended for natural inflection)
        length_penalty: Controls audio duration (1.0-1.2 recommended)
        max_new_tokens: Maximum new tokens for generation
    
    Returns:
        Tuple of (waveform, sample_rate)
    """
    wavs, sr = tts_model.generate_custom_voice(
        text=text,
        language="English",
        speaker=speaker,
        instruct=instruct,
        temperature=temperature,
        length_penalty=length_penalty,
        max_new_tokens=max_new_tokens,
    )
    return wavs, sr

def main():
    # Configuration
    MODEL_PATH = "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"
    OUTPUT_DIR = "announcers"
    DEVICE = "cuda:0" if torch.cuda.is_available() else "cpu"
    
    print(f"Using device: {DEVICE}")
    print(f"Loading Qwen3-TTS model: {MODEL_PATH}")
    
    # Initialize the TTS model
    tts = Qwen3TTSModel.from_pretrained(
        MODEL_PATH,
        device_map=DEVICE,
        dtype=torch.bfloat16 if DEVICE.startswith("cuda") else torch.float32,
        attn_implementation="flash_attention_2" if DEVICE.startswith("cuda") else None,
    )
    
    # Ensure output directory exists
    ensure_directory(OUTPUT_DIR)
    
    # Load players
    players = load_players()
    print(f"Loaded {len(players)} players")
    
    # Generate announcer voices for each player
    for player in players:
        player_name = player.get("name", "Unknown")
        player_number = player.get("number", "0")
        player_id = player.get("id", 0)
        
        print(f"\nGenerating announcer voice for: {player_name} (#{player_number})")
        
        # Generate announcement text
        announcement_text = generate_announcer_text(player)
        print(f"  Text: '{announcement_text}'")
        
        try:
            # Generate voice with enhanced baseball announcer settings
            wavs, sr = generate_announcer_voice(
                tts, 
                announcement_text,
                speaker="Ryan",
                temperature=0.8,
                length_penalty=1.1
            )
            
            # Save to file
            output_filename = f"player_{player_number}.mp3"
            output_path = os.path.join(OUTPUT_DIR, output_filename)
            
            # Save as WAV first (soundfile limitation), then could convert to MP3 if needed
            wav_path = output_path.replace(".mp3", ".wav")
            sf.write(wav_path, wavs[0], sr)
            print(f"  Saved: {wav_path}")
            
            # Update player with announcer file path if not already set
            if "announcerFile" not in player:
                player["announcerFile"] = output_path
            
        except Exception as e:
            print(f"  Error generating voice for {player_name}: {e}")
            continue
    
    print("\n" + "="*50)
    print("Announcer voice generation complete!")
    print(f"Generated files are in the '{OUTPUT_DIR}' folder")
    print("="*50)


if __name__ == "__main__":
    main()
