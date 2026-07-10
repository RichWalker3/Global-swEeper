#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOKS_DIR="$ROOT/.git/hooks"
SOURCE="$ROOT/scripts/git-hooks/pre-push"

mkdir -p "$HOOKS_DIR"
cp "$SOURCE" "$HOOKS_DIR/pre-push"
chmod +x "$HOOKS_DIR/pre-push"

echo "Installed pre-push hook -> $HOOKS_DIR/pre-push"
echo "It runs: npm run ci"
