#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="/Users/richard.walker/Desktop/mcp-servers-master/.env"
PAGE_ID="6965461070"
BASE_URL="https://global-e.atlassian.net"
PAGE_JSON="$ROOT/logs/confluence/toybox-dna-page.json"
PAYLOAD_JSON="$ROOT/logs/confluence/toybox-update.json"

source "$ENV_FILE"

mkdir -p "$ROOT/logs/confluence"

curl -s -u "$ATLASSIAN_EMAIL:$ATLASSIAN_KEY" \
  "$BASE_URL/wiki/rest/api/content/$PAGE_ID?expand=body.storage,version,title" \
  > "$PAGE_JSON"

python3 "$ROOT/scripts/build_toybox_confluence_update.py"

curl -s -u "$ATLASSIAN_EMAIL:$ATLASSIAN_KEY" \
  -H "Content-Type: application/json" \
  -X PUT \
  --data @"$PAYLOAD_JSON" \
  "$BASE_URL/wiki/rest/api/content/$PAGE_ID"
