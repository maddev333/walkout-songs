#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 || $# -gt 4 ]]; then
  echo "Usage: $0 <youtube_url> <start_seconds> <end_seconds> [output_name]"
  exit 1
fi

URL="$1"
START="$2"
END="$3"
OUTBASE="${4:-clip}"

if ! [[ "$START" =~ ^[0-9]+([.][0-9]+)?$ && "$END" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
  echo "Error: start_seconds and end_seconds must be numbers."
  exit 1
fi

awk_check=$(awk -v s="$START" -v e="$END" 'BEGIN { if (e <= s) print 1; else print 0 }')
if [[ "$awk_check" == "1" ]]; then
  echo "Error: end_seconds must be greater than start_seconds."
  exit 1
fi

if ! command -v yt-dlp >/dev/null 2>&1; then
  echo "Error: yt-dlp is not installed."
  echo "Install: https://github.com/yt-dlp/yt-dlp"
  exit 1
fi



TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

RAWFILE="$TMPDIR/source.%(ext)s"
FINALFILE="${OUTBASE}.mp3"

echo "Downloading audio..."
yt-dlp -f ba -x --audio-format mp3 -o "$RAWFILE" "$URL"

DOWNLOADED=$(find "$TMPDIR" -maxdepth 1 -type f | head -n 1)
if [[ -z "$DOWNLOADED" ]]; then
  echo "Error: download failed."
  exit 1
fi

echo "Trimming from $START to $END seconds..."
ffmpeg -y -i "$DOWNLOADED" -ss "$START" -to "$END" -vn -c:a libmp3lame -q:a 2 "$FINALFILE" >/dev/null 2>&1

echo "Saved: $FINALFILE"
