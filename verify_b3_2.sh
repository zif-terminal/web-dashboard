#!/bin/bash
# B3.2: Verify risk parameters are saved and returned correctly
# Creates a simulation run via Hasura with risk params, reads it back, checks config JSONB

set -euo pipefail

HASURA_URL="${HASURA_URL:-http://localhost:8080/v1/graphql}"
HASURA_SECRET="${HASURA_ADMIN_SECRET:-$(grep HASURA_ADMIN_SECRET /home/ubuntu/.claude-bot/.env 2>/dev/null | cut -d= -f2 || echo "")}"

if [ -z "$HASURA_SECRET" ]; then
  echo "ERROR: HASURA_ADMIN_SECRET not set and not found in .env"
  exit 1
fi

# Check required tools
for cmd in curl jq uuidgen; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: '$cmd' is required but not installed"
    exit 1
  fi
done

echo "=== B3.2 Risk Parameter Verification ==="
echo "Hasura URL: $HASURA_URL"
echo ""

# Insert a run with all 3 B3.2 risk parameters
RUN_ID=$(uuidgen)
echo "Creating simulation run: $RUN_ID"

RESPONSE=$(curl -s "$HASURA_URL" \
  -H "X-Hasura-Admin-Secret: $HASURA_SECRET" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"mutation { insert_simulation_runs_one(object: { id: \\\"$RUN_ID\\\", asset: \\\"TEST\\\", config: {max_position_notional_usd: 5000, spread_threshold_bps: 5, max_total_exposure_usd: 20000}, starting_balance: 10000, quote_currency: \\\"USDC\\\" }) { id config } }\"}")

# Check for GraphQL errors
ERRORS=$(echo "$RESPONSE" | jq -r '.errors // empty')
if [ -n "$ERRORS" ]; then
  echo "GraphQL error during insert:"
  echo "$ERRORS"
  exit 1
fi

# Read it back and verify
CONFIG=$(echo "$RESPONSE" | jq -r '.data.insert_simulation_runs_one.config')

if [ -z "$CONFIG" ] || [ "$CONFIG" = "null" ]; then
  echo "ERROR: config field is null or missing in response"
  echo "Full response: $RESPONSE"
  exit 1
fi

echo "Config returned: $CONFIG"
echo ""

MAX_POS=$(echo "$CONFIG" | jq '.max_position_notional_usd')
SPREAD=$(echo "$CONFIG"   | jq '.spread_threshold_bps')
MAX_EXP=$(echo "$CONFIG"  | jq '.max_total_exposure_usd')

PASS=true

[ "$MAX_POS" = "5000" ] \
  && echo "✓ max_position_notional_usd = 5000" \
  || { echo "✗ max_position_notional_usd = $MAX_POS (expected 5000)"; PASS=false; }

[ "$SPREAD" = "5" ] \
  && echo "✓ spread_threshold_bps = 5" \
  || { echo "✗ spread_threshold_bps = $SPREAD (expected 5)"; PASS=false; }

[ "$MAX_EXP" = "20000" ] \
  && echo "✓ max_total_exposure_usd = 20000" \
  || { echo "✗ max_total_exposure_usd = $MAX_EXP (expected 20000)"; PASS=false; }

# Cleanup — always attempt, ignore errors
echo ""
echo "Cleaning up test run..."
CLEANUP=$(curl -s "$HASURA_URL" \
  -H "X-Hasura-Admin-Secret: $HASURA_SECRET" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"mutation { delete_simulation_runs_by_pk(id: \\\"$RUN_ID\\\") { id } }\"}" 2>/dev/null || echo "{}")
DELETED_ID=$(echo "$CLEANUP" | jq -r '.data.delete_simulation_runs_by_pk.id // empty')
if [ -n "$DELETED_ID" ]; then
  echo "✓ Cleanup complete (deleted $DELETED_ID)"
else
  echo "⚠ Cleanup may have failed — manually delete run $RUN_ID if needed"
fi

echo ""
if $PASS; then
  echo "✓ B3.2 PASSED — all risk parameters saved and returned correctly"
else
  echo "✗ B3.2 FAILED — one or more risk parameters did not match"
  exit 1
fi
