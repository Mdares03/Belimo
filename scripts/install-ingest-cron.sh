#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNNER="$ROOT_DIR/scripts/run-ingest.mjs"

if [[ ! -x "$RUNNER" ]]; then
  echo "Runner not executable: $RUNNER" >&2
  exit 1
fi

TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT

crontab -l 2>/dev/null | grep -v '/api/cron/ingest' | grep -v 'run-ingest.mjs' > "$TMP_FILE" || true
printf '0 2 * * * %s\n' "$RUNNER" >> "$TMP_FILE"
crontab "$TMP_FILE"

echo "Installed cron entry:"
crontab -l | grep 'run-ingest.mjs'
