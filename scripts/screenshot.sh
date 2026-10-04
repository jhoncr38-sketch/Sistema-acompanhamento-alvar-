#!/usr/bin/env bash
# Captura de tela headless para comparar com a referência. Uso: scripts/screenshot.sh <url> <saida.png> [largura] [altura]
URL=${1:-http://localhost:5173/}
OUT=${2:-screenshot.png}
W=${3:-1536}
H=${4:-1024}
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
PROFILE="${TMPDIR:-/tmp}/alvaras-shot-profile"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$PROFILE" \
  --window-size="$W,$((H + 96))" --virtual-time-budget=8000 --screenshot="$OUT" "$URL" >/dev/null 2>&1
