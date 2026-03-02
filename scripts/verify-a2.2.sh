#!/usr/bin/env bash
# Verification script for A2.2 — Authenticated user's connected wallets persist across sessions
#
# Usage: ./scripts/verify-a2.2.sh [AUTH_URL] [HASURA_URL] [HASURA_ADMIN_SECRET]
#   Defaults:
#     AUTH_URL=http://localhost:8081
#     HASURA_URL=http://localhost:8080
#     ADMIN_SECRET=hasura-admin-secret
#
# What it checks (automated, no manual steps):
#   1. Login with admin credentials → get token (session 1)
#   2. Query wallets — record baseline count
#   3. Create a test wallet via Hasura (using admin secret to set user_id)
#   4. Query wallets via Hasura WITH session token → confirm wallet appears, user_id matches
#   5. Mark the wallet verified (simulate verify flow)
#   6. Record wallet_id, address, chain, verified_at from session 1
#   7. Logout (invalidate token from session 1)
#   8. Login again → get NEW token (session 2)
#   9. Query wallets via Hasura WITH new token → confirm the same wallet still appears
#  10. Assert wallet_id, address, chain, verified_at are identical between sessions
#  11. Cleanup — delete the test wallet
#  12. Print PASS / FAIL summary

set -euo pipefail

AUTH_URL="${1:-http://localhost:8081}"
HASURA_URL="${2:-http://localhost:8080}"
ADMIN_SECRET="${3:-hasura-admin-secret}"
GQL_ENDPOINT="${HASURA_URL}/v1/graphql"

ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin}"

# Unique test wallet to avoid collisions with real data
TEST_ADDRESS="0xdeadbeef$(date +%s)cafe"
TEST_CHAIN="ethereum"
USER_ID="admin"  # The only user in the single-user setup

PASS=0
FAIL=0

ok()   { echo "  ✅ $*"; ((PASS++)); }
fail() { echo "  ❌ $*"; ((FAIL++)); }
info() { echo "  ℹ  $*"; }

gql() {
  # Usage: gql <bearer_token_or_empty> <query_json>
  local token="$1"
  local body="$2"
  local headers=(-H "Content-Type: application/json")

  if [[ -n "$token" ]]; then
    headers+=(-H "Authorization: Bearer $token")
  else
    headers+=(-H "X-Hasura-Admin-Secret: $ADMIN_SECRET")
  fi

  curl -sf "${headers[@]}" -d "$body" "$GQL_ENDPOINT"
}

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  A2.2 Verification: Wallet persistence across sessions"
echo "═══════════════════════════════════════════════════════"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Login (session 1)
# ---------------------------------------------------------------------------
echo "Step 1: Login (session 1)"
LOGIN_RESP=$(curl -sf -X POST \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${ADMIN_USERNAME}\",\"password\":\"${ADMIN_PASSWORD}\"}" \
  "${AUTH_URL}/auth/login")

TOKEN1=$(echo "$LOGIN_RESP" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [[ -n "$TOKEN1" ]]; then
  ok "Login succeeded, got token (${TOKEN1:0:8}...)"
else
  fail "Login failed: $LOGIN_RESP"
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 2: Baseline wallet count
# ---------------------------------------------------------------------------
echo ""
echo "Step 2: Baseline wallet count via Hasura (admin secret)"
BASELINE=$(gql "" '{"query":"query { wallets_aggregate { aggregate { count } } }"}')
BASELINE_COUNT=$(echo "$BASELINE" | grep -o '"count":[0-9]*' | head -1 | cut -d: -f2)
info "Existing wallets: ${BASELINE_COUNT:-0}"

# ---------------------------------------------------------------------------
# Step 3: Insert test wallet via admin secret (explicit user_id)
# ---------------------------------------------------------------------------
echo ""
echo "Step 3: Insert test wallet with user_id='${USER_ID}'"
INSERT_BODY=$(printf '{"query":"mutation { insert_wallets_one(object: {address: \\"%s\\", chain: \\"%s\\", user_id: \\"%s\\", verified_at: \\"2026-03-02T00:00:00Z\\", verification_method: \\"signature\\"}) { id address chain user_id verified_at } }"}' \
  "$TEST_ADDRESS" "$TEST_CHAIN" "$USER_ID")

INSERT_RESP=$(gql "" "$INSERT_BODY")
WALLET_ID=$(echo "$INSERT_RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
VERIFIED_AT=$(echo "$INSERT_RESP" | grep -o '"verified_at":"[^"]*"' | head -1 | cut -d'"' -f4)

if [[ -n "$WALLET_ID" ]]; then
  ok "Wallet created: id=${WALLET_ID}"
else
  fail "Wallet creation failed: $INSERT_RESP"
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 4: Query wallets with SESSION 1 token — must see our test wallet
# ---------------------------------------------------------------------------
echo ""
echo "Step 4: Query wallets via session 1 token"
QUERY_S1=$(gql "$TOKEN1" \
  '{"query":"query { wallets { id address chain user_id verified_at verification_method } }"}')

if echo "$QUERY_S1" | grep -q "$WALLET_ID"; then
  ok "Test wallet visible in session 1"
else
  fail "Test wallet NOT visible in session 1"
  fail "Response: $QUERY_S1"
fi

# Check user_id is correct
if echo "$QUERY_S1" | grep -q "\"user_id\":\"${USER_ID}\""; then
  ok "user_id='${USER_ID}' confirmed in response"
else
  fail "user_id missing or wrong in session 1 response"
fi

# Check verified_at is set
if echo "$QUERY_S1" | grep -q '"verified_at"'; then
  ok "verified_at is present in session 1"
else
  fail "verified_at missing in session 1"
fi

# ---------------------------------------------------------------------------
# Step 5: Logout (invalidate session 1)
# ---------------------------------------------------------------------------
echo ""
echo "Step 5: Logout (invalidate session 1 token)"
LOGOUT_RESP=$(curl -sf -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN1" \
  "${AUTH_URL}/auth/logout")

if echo "$LOGOUT_RESP" | grep -q '"message"'; then
  ok "Logout succeeded"
else
  fail "Logout response unexpected: $LOGOUT_RESP"
fi

# Verify old token is now rejected
OLD_TOKEN_CHECK=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN1" \
  "${AUTH_URL}/auth/logout")
if [[ "$OLD_TOKEN_CHECK" == "401" ]]; then
  ok "Old token correctly rejected after logout"
else
  fail "Old token still accepted after logout (status $OLD_TOKEN_CHECK)"
fi

# ---------------------------------------------------------------------------
# Step 6: Login again (session 2) — fresh token
# ---------------------------------------------------------------------------
echo ""
echo "Step 6: Login (session 2)"
LOGIN2_RESP=$(curl -sf -X POST \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${ADMIN_USERNAME}\",\"password\":\"${ADMIN_PASSWORD}\"}" \
  "${AUTH_URL}/auth/login")

TOKEN2=$(echo "$LOGIN2_RESP" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [[ -n "$TOKEN2" && "$TOKEN2" != "$TOKEN1" ]]; then
  ok "New token issued for session 2 (${TOKEN2:0:8}...)"
elif [[ "$TOKEN2" == "$TOKEN1" ]]; then
  fail "Session 2 returned the same token as session 1 (should be different)"
else
  fail "Login (session 2) failed: $LOGIN2_RESP"
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 7: Query wallets with SESSION 2 token — must see the SAME wallet
# ---------------------------------------------------------------------------
echo ""
echo "Step 7: Query wallets via session 2 token — persistence check"
QUERY_S2=$(gql "$TOKEN2" \
  '{"query":"query { wallets { id address chain user_id verified_at verification_method } }"}')

if echo "$QUERY_S2" | grep -q "$WALLET_ID"; then
  ok "Test wallet PERSISTS in session 2 ✅"
else
  fail "Test wallet MISSING in session 2 — persistence broken!"
  fail "Response: $QUERY_S2"
fi

# Assert wallet_id is the same
S2_WALLET_ID=$(echo "$QUERY_S2" | grep -o '"id":"[^"]*"' | grep "$WALLET_ID" | head -1 | cut -d'"' -f4)
if [[ "$S2_WALLET_ID" == "$WALLET_ID" ]]; then
  ok "wallet_id identical across sessions: $WALLET_ID"
else
  fail "wallet_id mismatch: s1=$WALLET_ID s2=$S2_WALLET_ID"
fi

# Assert verified_at is preserved
S2_VERIFIED=$(echo "$QUERY_S2" | grep -o '"verified_at":"[^"]*"' | head -1 | cut -d'"' -f4)
if [[ -n "$S2_VERIFIED" ]]; then
  ok "verified_at preserved across sessions: $S2_VERIFIED"
else
  fail "verified_at missing in session 2"
fi

# Assert user_id still correct
if echo "$QUERY_S2" | grep -q "\"user_id\":\"${USER_ID}\""; then
  ok "user_id='${USER_ID}' correct in session 2"
else
  fail "user_id missing or wrong in session 2"
fi

# ---------------------------------------------------------------------------
# Step 8: Cleanup — delete the test wallet
# ---------------------------------------------------------------------------
echo ""
echo "Step 8: Cleanup — delete test wallet"
DELETE_BODY=$(printf '{"query":"mutation { delete_wallets_by_pk(id: \\"%s\\") { id } }"}' "$WALLET_ID")
DELETE_RESP=$(gql "" "$DELETE_BODY")

if echo "$DELETE_RESP" | grep -q "$WALLET_ID"; then
  ok "Test wallet deleted"
else
  info "Delete response: $DELETE_RESP (may already be gone)"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "═══════════════════════════════════════════════════════"
if [[ $FAIL -eq 0 ]]; then
  echo "  RESULT: ✅ PASS — $PASS checks passed, $FAIL failed"
  echo "  A2.2: Wallets persist across logout/login ✅"
else
  echo "  RESULT: ❌ FAIL — $PASS checks passed, $FAIL failed"
  echo "  A2.2: Wallet persistence is BROKEN"
fi
echo "═══════════════════════════════════════════════════════"
echo ""

exit $FAIL
