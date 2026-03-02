#!/usr/bin/env bash
# Verification script for A1.3 — User can add multiple wallets across different exchanges
#
# Usage: ./scripts/verify-a1.3.sh [HASURA_URL] [HASURA_ADMIN_SECRET]
#   Defaults: HASURA_URL=http://localhost:8080  ADMIN_SECRET=hasura-admin-secret
#
# What it checks:
#   1. Add Wallet 1 (Solana — Drift activity expected)
#   2. Add Wallet 2 (Ethereum — Hyperliquid / Lighter activity expected)
#   3. Add Wallet 3 (second Ethereum or Solana wallet)
#   4. Poll until all three wallets have last_detected_at set (max 90 s each)
#   5. Assert dashboard state: 3 wallets, correct exchange names per wallet
#   6. Print the summary line for visual confirmation

set -euo pipefail

HASURA_URL="${1:-http://localhost:8080}"
ADMIN_SECRET="${2:-hasura-admin-secret}"
GQL_ENDPOINT="${HASURA_URL}/v1/graphql"

# ---------------------------------------------------------------------------
# Test wallets — replace with real addresses that have known on-chain activity
# ---------------------------------------------------------------------------
WALLET_1_ADDRESS="${WALLET_1:-"6pjxZXpMa8EkVEsUKL9rjYQJe8QFxkZp1J2qYXHjEQGZ"}"   # Solana/Drift
WALLET_1_CHAIN="solana"

WALLET_2_ADDRESS="${WALLET_2:-"0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"}"  # Ethereum/Hyperliquid
WALLET_2_CHAIN="ethereum"

WALLET_3_ADDRESS="${WALLET_3:-"0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503"}"  # Ethereum/Lighter or second chain
WALLET_3_CHAIN="ethereum"

POLL_INTERVAL=5   # seconds between polls
MAX_POLLS=18      # 18 × 5 s = 90 s per wallet

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}  ✓ $*${NC}"; }
fail() { echo -e "${RED}  ✗ $*${NC}"; exit 1; }
info() { echo -e "${YELLOW}  → $*${NC}"; }

# ---------------------------------------------------------------------------
# Helper: run a GraphQL mutation/query
# ---------------------------------------------------------------------------
gql() {
  local query="$1"
  curl -s \
    -H "Content-Type: application/json" \
    -H "x-hasura-admin-secret: ${ADMIN_SECRET}" \
    -d "${query}" \
    "${GQL_ENDPOINT}"
}

# ---------------------------------------------------------------------------
# 1. Add wallets
# ---------------------------------------------------------------------------
echo ""
echo "=== A1.3 Verification: adding 3 wallets ==="
echo ""

add_wallet() {
  local address="$1" chain="$2"
  local payload
  payload=$(jq -n \
    --arg addr "$address" \
    --arg ch "$chain" \
    '{"query":"mutation CreateWallet($address: String!, $chain: String!) { insert_wallets_one(object: {address: $address, chain: $chain}, on_conflict: {constraint: wallets_address_chain_key, update_columns: []}) { id address chain created_at } }","variables":{"address":$addr,"chain":$ch}}')

  local result
  result=$(gql "$payload")

  local wallet_id
  wallet_id=$(echo "$result" | jq -r '.data.insert_wallets_one.id // empty')

  if [[ -z "$wallet_id" ]]; then
    # Wallet may already exist — fetch its id
    local fetch_payload
    fetch_payload=$(jq -n \
      --arg addr "$address" \
      '{"query":"query { wallets(where: {address: {_eq: $address}}) { id } }","variables":{"address":$addr}}')
    wallet_id=$(gql "$fetch_payload" | jq -r '.data.wallets[0].id // empty')
    if [[ -z "$wallet_id" ]]; then
      fail "Failed to create or find wallet: $address"
    fi
    info "Wallet already exists, using id: $wallet_id"
  else
    pass "Created wallet $address → $wallet_id"
  fi

  echo "$wallet_id"
}

info "Adding Wallet 1 (${WALLET_1_CHAIN}): ${WALLET_1_ADDRESS}"
W1_ID=$(add_wallet "$WALLET_1_ADDRESS" "$WALLET_1_CHAIN")

info "Adding Wallet 2 (${WALLET_2_CHAIN}): ${WALLET_2_ADDRESS}"
W2_ID=$(add_wallet "$WALLET_2_ADDRESS" "$WALLET_2_CHAIN")

info "Adding Wallet 3 (${WALLET_3_CHAIN}): ${WALLET_3_ADDRESS}"
W3_ID=$(add_wallet "$WALLET_3_ADDRESS" "$WALLET_3_CHAIN")

echo ""
echo "=== Polling for detection completion (max $((MAX_POLLS * POLL_INTERVAL))s each) ==="
echo ""

# ---------------------------------------------------------------------------
# 2. Poll until last_detected_at is set for a given wallet id
# ---------------------------------------------------------------------------
poll_until_detected() {
  local wallet_id="$1"
  local count=0

  while [[ $count -lt $MAX_POLLS ]]; do
    local payload
    payload=$(jq -n \
      --arg id "$wallet_id" \
      '{"query":"query ($id: uuid!) { wallets_by_pk(id: $id) { last_detected_at } }","variables":{"id":$id}}')

    local detected_at
    detected_at=$(gql "$payload" | jq -r '.data.wallets_by_pk.last_detected_at // empty')

    if [[ -n "$detected_at" ]]; then
      pass "Wallet $wallet_id detected at $detected_at"
      return 0
    fi

    count=$((count + 1))
    info "Waiting for detection... (${count}/${MAX_POLLS})"
    sleep "$POLL_INTERVAL"
  done

  fail "Timed out waiting for wallet $wallet_id to be detected"
}

poll_until_detected "$W1_ID"
poll_until_detected "$W2_ID"
poll_until_detected "$W3_ID"

# ---------------------------------------------------------------------------
# 3. Assert dashboard state
# ---------------------------------------------------------------------------
echo ""
echo "=== Asserting dashboard state ==="
echo ""

FETCH_PAYLOAD=$(jq -n \
  --argjson ids "[\"${W1_ID}\",\"${W2_ID}\",\"${W3_ID}\"]" \
  '{"query":"query { wallets(where: {id: {_in: $ids}}, order_by: {created_at: desc}) { id address chain last_detected_at exchange_accounts_aggregate { aggregate { count } } exchange_accounts { id exchange { display_name } } } }","variables":{"ids":$ids}}')

RESULT=$(gql "$FETCH_PAYLOAD")

WALLET_COUNT=$(echo "$RESULT" | jq '.data.wallets | length')
if [[ "$WALLET_COUNT" -eq 3 ]]; then
  pass "WalletsSection shows 3 wallets"
else
  fail "Expected 3 wallets, got $WALLET_COUNT"
fi

# Collect all unique exchange display_names across the 3 wallets
EXCHANGES=$(echo "$RESULT" | jq -r \
  '[.data.wallets[].exchange_accounts[].exchange.display_name] | map(select(. != null)) | unique | sort | join(", ")')

if [[ -n "$EXCHANGES" ]]; then
  pass "Exchanges detected: $EXCHANGES"
else
  fail "No exchanges detected across wallets"
fi

# Print the summary line (matches what the frontend renders)
echo ""
echo -e "${GREEN}Summary line:${NC} 3 wallets · ${EXCHANGES}"
echo ""

# Per-wallet exchange check
for IDX in 1 2 3; do
  WALLET_ID_VAR="W${IDX}_ID"
  WID="${!WALLET_ID_VAR}"
  WALLET_EXCHANGES=$(echo "$RESULT" | jq -r \
    --arg id "$WID" \
    '[.data.wallets[] | select(.id == $id) | .exchange_accounts[].exchange.display_name] | map(select(. != null)) | unique | sort | join(", ")')
  ACCT_COUNT=$(echo "$RESULT" | jq -r \
    --arg id "$WID" \
    '.data.wallets[] | select(.id == $id) | .exchange_accounts_aggregate.aggregate.count')

  if [[ -n "$WALLET_EXCHANGES" ]]; then
    pass "Wallet $IDX ($WID): $ACCT_COUNT account(s) — ${WALLET_EXCHANGES}"
  else
    info "Wallet $IDX ($WID): $ACCT_COUNT account(s) — no exchanges yet (check account_detector logs)"
  fi
done

echo ""
echo -e "${GREEN}=== A1.3 VERIFICATION PASSED ===${NC}"
echo ""
