#!/usr/bin/env bash
# Build the zif-app Vite bundle for production.
# Outputs to dist.new (not dist) so the caller can atomic-swap without downtime.
# Usage:
#   OUT_DIR=dist.new bash build-prod.sh
#   OUT_DIR=dist.verify bash build-prod.sh   # smoke-test build
#
# After a successful build, the MAIN session does:
#   rsync -a --delete dist.new/ dist/
#   rm -rf dist.new
#   docker restart zif-app-web   # (or the clobber-free swap helper)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${OUT_DIR:-dist.new}"

cd "$SCRIPT_DIR"

echo "▶ Building zif-app (production) → ${OUT_DIR}/"
npx --yes vite build \
  --mode production \
  --outDir "$OUT_DIR" \
  --emptyOutDir

echo "▶ Verifying wss endpoint in bundle..."
JS_FILE=$(ls "${OUT_DIR}/assets/index-"*.js 2>/dev/null | head -1)
if [ -z "$JS_FILE" ]; then
  echo "✗ No index-*.js found in ${OUT_DIR}/assets/" >&2
  exit 1
fi
if grep -q 'wss://zif-prod.tail5171c8.ts.net/v1/graphql' "$JS_FILE"; then
  echo "✓ wss://zif-prod.tail5171c8.ts.net/v1/graphql — confirmed in bundle"
else
  echo "✗ wss endpoint NOT found in bundle — build may have wrong env" >&2
  exit 1
fi

echo "✓ Build complete: ${OUT_DIR}/"
