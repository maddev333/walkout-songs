"""
Generate sports announcer voices for players using Qwen3-TTS.

This script uses the Qwen3-TTS CustomVoice model to generate professional
sports announcer-style voice announcements for each player in the roster.
The generated audio files are saved to the 'announcers' folder.

Usage:
    # Generate all players (default)
    python generate_announcer_voices.py

    # Generate a single player by name
    python generate_announcer_voices.py --player "Player Name"

    # Generate a single player by number
    python generate_announcer_voices.py --number 7

    # Generate multiple specific players
    python generate_announcer_voices.py --players "Alice, Bob"

Requirements:
    pip install torch soundfile qwen-tts
"""

import argparse
import json
import os
import re
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
    
    # Sports announcer style announcement - build anticipation before the name
    return f"Batting for the Pickels! number {number}... {name.upper()}!"


def find_players(players: list, names: list = None, numbers: list = None) -> list:
    """Find players matching given names or numbers."""
    if names:
        matched = [p for p in players 
                   if any(p.get("name", "").lower() == name.lower() for name in names)]
    elif numbers is not None:
        matched = [p for p in players 
                   if str(p.get("number", "")) == str(numbers)]
    else:
        matched = players
    
    return matched


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
    length_penalty: float = 2.3,
    max_new_tokens: int = 8192,
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


def generate_player_voice(
    tts_model: Qwen3TTSModel,
    player: dict,
    output_dir: str = "announcers"
) -> str:
    """Generate and save voice for a single player. Returns the file path."""
    player_name = player.get("name", "Unknown")
    player_number = player.get("number", "0")
    
    print(f"\nGenerating announcer voice for: {player_name} (#{player_number})")
    
    announcement_text = generate_announcer_text(player)
    print(f"  Text: '{announcement_text}'")
    
    wavs, sr = generate_announcer_voice(
        tts_model, 
        announcement_text,
        speaker="Ryan",
        temperature=0.8,
        length_penalty=2.3
    )
    
    output_filename = f"{player_name}_{player_number}.mp3"
    wav_path = os.path.join(output_dir, output_filename).replace(".mp3", ".wav")
    sf.write(wav_path, wavs[0], sr)
    print(f"  Saved: {wav_path}")
    
    return wav_path


def main():
    # Configuration
    MODEL_PATH = "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"
    OUTPUT_DIR = "announcers"
    DEVICE = "cuda:0" if torch.cuda.is_available() else "cpu"
    
    # Parse command-line arguments
    parser = argparse.ArgumentParser(
        description="Generate sports announcer voices for player walkout announcements."
    )
    parser.add_argument(
        "--player", "-p",
        type=str,
        help="Generate voice for a single player by name (e.g., 'John Smith')"
    )
    parser.add_argument(
        "--players","-P",
        type=str,
        help="Generate voices for multiple players by name, comma-separated (e.g., 'Alice,Bob')"
    )
    parser.add_argument(
        "--number", "-n",
        type=int,
        help="Generate voice for a single player by jersey number"
    )
    parser.add_argument(
        "--players-json",
        type=str,
        default="players.json",
        help="Path to the players JSON file (default: players.json)"
    )
    
    args = parser.parse_args()
    
    print(f"Using device: {DEVICE}")
    print(f"Loading Qwen3-TTS model: {MODEL_PATH}")
    
    # Load players
    players = load_players(args.players_json)
    print(f"Loaded {len(players)} players")
    
    # Filter to target players
    if args.player:
        targets = find_players(players, names=[args.player])
    elif args.players:
        name_list = [n.strip() for n in args.players.split(",")]
        targets = find_players(players, names=name_list)
    elif args.number is not None:
        targets = find_players(players, numbers=args.number)
    else:
        # No filter specified - generate for all players (default behavior)
        targets = players
    
    if not targets:
        print("No matching players found. Generating for all players.")
        targets = players
    
    print(f"Generating voices for {len(targets)} player(s)")
    
    # Initialize the TTS model
    tts = Qwen3TTSModel.from_pretrained(
        MODEL_PATH,
        device_map=DEVICE,
        dtype=torch.bfloat16 if DEVICE.startswith("cuda") else torch.float32,
        attn_implementation="flash_attention_2" if DEVICE.startswith("cuda") else None,
    )
    
    # Ensure output directory exists
    ensure_directory(OUTPUT_DIR)
    
    # Generate announcer voices
    for player in targets:
        try:
            generate_player_voice(tts, player, OUTPUT_DIR)
        except Exception as e:
            print(f"  Error generating voice: {e}")
            continue
    
    # Update players.json with file paths
    updated_json = False
    for player in targets:
        name = player.get("name", "Unknown")
        number = player.get("number", "0")
        key_path = f"{OUTPUT_DIR}/{name}_{number}.mp3".replace(".mp3", ".wav")
        
        if "announcerFile" not in player or player["announcerFile"] != key_path:
            player["announcerFile"] = key_path
            updated_json = True
    
    if updated_json:
        with open(args.players_json, 'w') as f:
            json.dump({"players": players}, f, indent=2)
        print(f"\nUpdated {args.players_json} with announcer file paths")
    
    print("\n" + "="*50)
    print("Announcer voice generation complete!")
    print(f"Generated files are in the '{OUTPUT_DIR}' folder")
    print("="*50)


if __name__ == "__main__":
    main()
