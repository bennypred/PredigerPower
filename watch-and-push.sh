#!/usr/bin/env bash
# Watches for file changes and auto-commits + pushes to GitHub.
# Run: bash watch-and-push.sh
# Stop: Ctrl+C

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
DEBOUNCE=5   # seconds to wait after last change before pushing

echo "👀  Watching $REPO_DIR for changes..."
echo "    Push Ctrl+C to stop."
echo ""

last_hash=""
pending=0
last_change=0

while true; do
  # Hash the current git diff (staged+unstaged) and untracked file list
  current_hash=$(git -C "$REPO_DIR" status --porcelain 2>/dev/null | md5)

  if [ "$current_hash" != "$last_hash" ] && [ -n "$current_hash" ]; then
    if [ "$pending" -eq 0 ]; then
      echo "📝  Change detected — waiting ${DEBOUNCE}s for more saves..."
    fi
    pending=1
    last_change=$(date +%s)
    last_hash="$current_hash"
  fi

  if [ "$pending" -eq 1 ]; then
    now=$(date +%s)
    elapsed=$(( now - last_change ))
    if [ "$elapsed" -ge "$DEBOUNCE" ]; then
      pending=0
      timestamp=$(date '+%Y-%m-%d %H:%M:%S')
      echo "🚀  Committing and pushing at $timestamp..."
      git -C "$REPO_DIR" add -A
      git -C "$REPO_DIR" commit -m "Auto-update $timestamp" --quiet
      if git -C "$REPO_DIR" push origin main --quiet; then
        echo "✅  Pushed to GitHub — deploy started."
      else
        echo "❌  Push failed. Check your internet connection or GitHub auth."
      fi
      echo ""
      last_hash=$(git -C "$REPO_DIR" status --porcelain 2>/dev/null | md5)
    fi
  fi

  sleep 2
done
