#!/usr/bin/env bash
# verify_b3_3.sh — B3.3 Funding-Aware Exit Toggle Integration Verification
# Tests that enable_funding_aware_exit is correctly persisted in the
# simulation_runs.config JSONB column via Hasura.
#
# Usage:
#   ./verify_b3_3.sh
#   HASURA_URL=http://custom:8080/v1/graphql HASURA_ADMIN_SECRET=mysecret ./verify_b3_3.sh
set -euo pipefail

HASURA_URL="${HASURA_URL:-http://localhost:8080/v1/graphql}"
HASURA_SECRET="${HASURA_ADMIN_SECRET:-$(grep HASURA_ADMIN_SECRET /home/ubuntu/.claude-bot/.env 2>/dev/null | cut -d= -f2 || echo "")}"

echo "=== B3.3 Funding-Aware Exit Toggle Verification ==="
echo "Hasura: $HASURA_URL"
echo ""

PASS=0
FAIL=0

gql() {
  curl -s "$HASURA_URL" \
    -H "X-Hasura-Admin-Secret: $HASURA_SECRET" \
    -H "Content-Type: application/json" \
    -d "$1"
}

assert_eq() {
  local label="$1" got="$2" want="$3"
  if [ "$got" = "$want" ]; then
    echo "✓ $label"
    PASS=$((PASS + 1))
  else
    echo "✗ $label — expected '$want', got '$got'"
    FAIL=$((FAIL + 1))
  fi
}

# ─── Test 1: enable_funding_aware_exit=false is persisted ────────────────────
RUN1=$(uuidgen)
R1=$(gql "{\"query\":\"mutation { insert_simulation_runs_one(object: { id: \\\"$RUN1\\\", asset: \\\"TEST\\\", config: {enable_funding_aware_exit: false}, starting_balance: 10000 }) { id config } }\"}")
V1=$(echo "$R1" | jq '.data.insert_simulation_runs_one.config.enable_funding_aware_exit')
assert_eq "enable_funding_aware_exit=false persisted" "$V1" "false"

# ─── Test 2: enable_funding_aware_exit=true is persisted ─────────────────────
RUN2=$(uuidgen)
R2=$(gql "{\"query\":\"mutation { insert_simulation_runs_one(object: { id: \\\"$RUN2\\\", asset: \\\"TEST\\\", config: {enable_funding_aware_exit: true}, starting_balance: 10000 }) { id config } }\"}")
V2=$(echo "$R2" | jq '.data.insert_simulation_runs_one.config.enable_funding_aware_exit')
assert_eq "enable_funding_aware_exit=true persisted" "$V2" "true"

# ─── Test 3: field absent when not supplied (nil = enabled) ──────────────────
RUN3=$(uuidgen)
R3=$(gql "{\"query\":\"mutation { insert_simulation_runs_one(object: { id: \\\"$RUN3\\\", asset: \\\"TEST\\\", config: {spread_threshold_bps: 5}, starting_balance: 10000 }) { id config } }\"}")
V3=$(echo "$R3" | jq '.data.insert_simulation_runs_one.config.enable_funding_aware_exit')
assert_eq "field absent when not set (nil = enabled by Go runner)" "$V3" "null"

# ─── Test 4: co-exists with other risk params ────────────────────────────────
RUN4=$(uuidgen)
R4=$(gql "{\"query\":\"mutation { insert_simulation_runs_one(object: { id: \\\"$RUN4\\\", asset: \\\"TEST\\\", config: {enable_funding_aware_exit: false, max_position_notional_usd: 5000, spread_threshold_bps: 3}, starting_balance: 10000 }) { id config } }\"}")
V4_FAE=$(echo "$R4" | jq '.data.insert_simulation_runs_one.config.enable_funding_aware_exit')
V4_MPN=$(echo "$R4" | jq '.data.insert_simulation_runs_one.config.max_position_notional_usd')
V4_SPR=$(echo "$R4" | jq '.data.insert_simulation_runs_one.config.spread_threshold_bps')
assert_eq "enable_funding_aware_exit=false with other risk params" "$V4_FAE" "false"
assert_eq "max_position_notional_usd preserved alongside toggle" "$V4_MPN" "5000"
assert_eq "spread_threshold_bps preserved alongside toggle" "$V4_SPR" "3"

# ─── Cleanup ─────────────────────────────────────────────────────────────────
gql "{\"query\":\"mutation { d1: delete_simulation_runs_by_pk(id: \\\"$RUN1\\\") { id } d2: delete_simulation_runs_by_pk(id: \\\"$RUN2\\\") { id } d3: delete_simulation_runs_by_pk(id: \\\"$RUN3\\\") { id } d4: delete_simulation_runs_by_pk(id: \\\"$RUN4\\\") { id } }\"}" >/dev/null 2>&1 || true

echo ""
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -eq 0 ]; then
  echo "✓ B3.3 PASSED"
  exit 0
else
  echo "✗ B3.3 FAILED"
  exit 1
fi
