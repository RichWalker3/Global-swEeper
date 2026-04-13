#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="/Users/richard.walker/Desktop/mcp-servers-master/.env"
PAGE_ID="7118947455"
BASE_URL="https://global-e.atlassian.net"
PAGE_JSON="$ROOT/logs/confluence/members-only-dna-page.json"
PAYLOAD_JSON="$ROOT/logs/confluence/members-only-update.json"

source "$ENV_FILE"

mkdir -p "$ROOT/logs/confluence"

curl -s -u "$ATLASSIAN_EMAIL:$ATLASSIAN_KEY" \
  "$BASE_URL/wiki/rest/api/content/$PAGE_ID?expand=body.storage,version,title" \
  > "$PAGE_JSON"

python3 "$ROOT/scripts/build_members_only_confluence_update.py"

curl -s -u "$ATLASSIAN_EMAIL:$ATLASSIAN_KEY" \
  -H "Content-Type: application/json" \
  -X PUT \
  --data @"$PAYLOAD_JSON" \
  "$BASE_URL/wiki/rest/api/content/$PAGE_ID"
