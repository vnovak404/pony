#!/usr/bin/env bash
set -euo pipefail

# Spokenly -> tmux bridge (clipboard-based)
# - Watches macOS clipboard (pbpaste)
# - When armed, sends new clipboard text into a tmux pane (+ Enter)
#
# Default target pane: %1
# Default hotkey model: create/remove the ARM file to toggle sending

TARGET_PANE="${1:-%1}"
ARM_FILE="${2:-$HOME/.pony_dictate_arm}"
POLL_SEC="${POLL_SEC:-0.2}"

echo "[spokenly_to_tmux] target pane: ${TARGET_PANE}"
echo "[spokenly_to_tmux] arm file:    ${ARM_FILE}"
echo
echo "To START sending dictated text to tmux:"
echo "  touch \"${ARM_FILE}\""
echo "To STOP:"
echo "  rm -f \"${ARM_FILE}\""
echo
echo "Tip: keep Spokenly configured to copy transcripts to clipboard."
echo

LAST=""

while true; do
  if [[ -f "${ARM_FILE}" ]]; then
    # Read clipboard, normalize CRLF -> LF, and trim trailing whitespace.
    TXT="$(pbpaste | tr -d '\r' | sed -E 's/[[:space:]]+$//')"

    # Skip empty or unchanged clipboard.
    if [[ -n "${TXT}" && "${TXT}" != "${LAST}" ]]; then
      LAST="${TXT}"

      # Send to target tmux pane. Use send-keys to avoid GUI focus/clipboard paste.
      tmux send-keys -t "${TARGET_PANE}" -- "${TXT}"
      tmux send-keys -t "${TARGET_PANE}" Enter

      echo "[sent] ${TXT}"
    fi
  fi

  sleep "${POLL_SEC}"
done
