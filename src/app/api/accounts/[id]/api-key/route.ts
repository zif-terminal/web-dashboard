import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { TOKEN_COOKIE_NAME } from "@/lib/cookie-config";

const HASURA_URL = process.env.HASURA_URL || "http://localhost:8080";

/**
 * Execute a GraphQL operation against Hasura using the user's JWT.
 * Hasura's auth webhook maps the JWT to the "user" role, so row-level
 * permissions (wallet.user_id = X-Hasura-User-Id) enforce ownership natively.
 */
async function hasuraFetch(
  token: string,
  query: string,
  variables: Record<string, unknown>
): Promise<{ data?: Record<string, unknown>; errors?: Array<{ message: string }> }> {
  const resp = await fetch(`${HASURA_URL}/v1/graphql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  return resp.json();
}

/**
 * POST /api/accounts/[id]/api-key
 *
 * Saves a Lighter API key to the account's account_type_metadata. Two flows:
 *   - Setup (status="needs_token"): transitions status to "disabled". User
 *     must manually enable sync_enabled / processing_enabled afterwards.
 *   - Rotate / edit (status in {active, disabled}): updates the key in place,
 *     flips sync_reset_requested=true and clears last_sync_error so the next
 *     sync cycle picks up the new key cleanly.
 *
 * Body: { api_key: string }
 *
 * Security: all Hasura calls use the user's JWT. Hasura's "user" role
 * permissions filter by wallet.user_id = X-Hasura-User-Id, so accounts
 * that aren't owned by the caller are invisible / unmodifiable. A mutation
 * that matches zero rows (caller doesn't own the account) yields 404.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: accountId } = await params;

  // 1. Auth check — must have a token cookie.
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  // 2. Parse body.
  let body: { api_key?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const apiKey = body.api_key?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "api_key is required" },
      { status: 400 }
    );
  }

  // 3. Fetch current metadata + status. If the caller doesn't own the
  // account, Hasura's row-level permission filter hides it and the
  // by_pk query returns null → we respond 404.
  const getQuery = `
    query GetAccountMetadata($id: uuid!) {
      exchange_accounts_by_pk(id: $id) {
        id
        wallet_id
        exchange_id
        exchange { name }
        account_type_metadata
        status
      }
    }
  `;

  let getResult: Awaited<ReturnType<typeof hasuraFetch>>;
  try {
    getResult = await hasuraFetch(token, getQuery, { id: accountId });
  } catch {
    return NextResponse.json(
      { error: "Failed to connect to database" },
      { status: 502 }
    );
  }

  if (getResult.errors) {
    // Auth failures from Hasura surface here as errors (not 401 on the fetch).
    return NextResponse.json(
      { error: "Database error", details: getResult.errors },
      { status: 500 }
    );
  }

  const account = getResult.data?.exchange_accounts_by_pk as
    | {
        id: string;
        wallet_id: string;
        exchange_id: string;
        exchange: { name: string } | null;
        account_type_metadata: Record<string, unknown> | null;
        status: string | null;
      }
    | null;

  if (!account) {
    // Either the account doesn't exist or the caller doesn't own it.
    // Either way: 404 (don't leak existence to non-owners).
    return NextResponse.json(
      { error: "Account not found or access denied" },
      { status: 404 }
    );
  }

  // Distinguish setup vs. edit/rotate so we can send the right `_set` payload.
  const isSetup = account.status === "needs_token";

  // 4. Update metadata with API key.
  // Setup flow: also flip needs_token → disabled (user re-enables manually).
  // Edit flow: keep current status, request a sync reset and clear last error
  // so the next cycle picks up the new key cleanly.
  const currentMeta = account.account_type_metadata || {};
  const updatedMeta = { ...currentMeta, api_key: apiKey };

  // Build a `_set` object that varies between flows. The mutation accepts
  // `exchange_accounts_set_input` which lets us include only the fields we
  // care about per flow.
  const setupSet = {
    account_type_metadata: updatedMeta,
    status: "disabled",
  };
  const editSet = {
    account_type_metadata: updatedMeta,
    sync_reset_requested: true,
    last_sync_error: null,
  };

  const mutation = `
    mutation SaveApiKey($id: uuid!, $set: exchange_accounts_set_input!) {
      update_exchange_accounts_by_pk(
        pk_columns: { id: $id }
        _set: $set
      ) {
        id
        status
        account_type_metadata
        sync_reset_requested
        last_sync_error
      }
    }
  `;

  let updateResult: Awaited<ReturnType<typeof hasuraFetch>>;
  try {
    updateResult = await hasuraFetch(token, mutation, {
      id: accountId,
      set: isSetup ? setupSet : editSet,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to connect to database" },
      { status: 502 }
    );
  }

  if (updateResult.errors) {
    return NextResponse.json(
      { error: "Database error", details: updateResult.errors },
      { status: 500 }
    );
  }

  const updatedAccount = updateResult.data?.update_exchange_accounts_by_pk as
    | { id: string; status: string; account_type_metadata: Record<string, unknown> }
    | null;

  if (!updatedAccount) {
    // Permission filter matched zero rows on update — caller doesn't own it.
    return NextResponse.json(
      { error: "Account not found or access denied" },
      { status: 404 }
    );
  }

  // 5. Propagate API key to sibling Lighter accounts under the same wallet.
  // Lighter API keys are per-wallet (one key works for all subaccounts),
  // so when a user submits a key for one account, apply it to siblings under
  // the same wallet. This is a single user-authenticated mutation — Hasura's
  // permissions keep it scoped to the caller's own wallet. Best-effort: don't
  // fail the primary request if this errors.
  //   - Setup flow: only touch siblings that are still in needs_token
  //     (matching the original semantics — don't surprise active siblings).
  //   - Edit flow: rotate the key on every sibling so all subaccounts stay in
  //     sync. Active siblings also get sync_reset_requested+clear-last_error.
  try {
    if (account.exchange?.name === "lighter" && account.wallet_id) {
      const siblingFilter = isSetup
        ? `status: { _eq: "needs_token" }`
        : ``;
      const siblingsQuery = `
        query GetSiblings($walletId: uuid!, $exchangeId: uuid!, $excludeId: uuid!) {
          exchange_accounts(
            where: {
              wallet_id: { _eq: $walletId }
              exchange_id: { _eq: $exchangeId }
              id: { _neq: $excludeId }
              ${siblingFilter}
            }
          ) {
            id
            status
            account_type_metadata
          }
        }
      `;

      const siblingsResult = await hasuraFetch(token, siblingsQuery, {
        walletId: account.wallet_id,
        exchangeId: account.exchange_id,
        excludeId: accountId,
      });

      const siblings = (siblingsResult.data?.exchange_accounts as
        | Array<{
            id: string;
            status: string | null;
            account_type_metadata: Record<string, unknown> | null;
          }>
        | undefined) || [];

      for (const sibling of siblings) {
        const siblingMeta = {
          ...(sibling.account_type_metadata || {}),
          api_key: apiKey,
        };
        // For each sibling, decide if it's still in setup or already-active.
        // Setup-flow we already filtered to needs_token. Edit-flow: a sibling
        // could itself still be in needs_token — promote it the same way as
        // the original setup path so it stops blocking sync.
        const siblingIsSetup = sibling.status === "needs_token";
        await hasuraFetch(token, mutation, {
          id: sibling.id,
          set: siblingIsSetup
            ? { account_type_metadata: siblingMeta, status: "disabled" }
            : {
                account_type_metadata: siblingMeta,
                sync_reset_requested: true,
                last_sync_error: null,
              },
        });
      }
    }
  } catch {
    // Sibling update is best-effort; don't fail the primary request.
  }

  return NextResponse.json({
    success: true,
    account: updatedAccount,
  });
}
