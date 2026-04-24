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
 * Saves a Lighter API key to the account's account_type_metadata and
 * transitions status from "needs_token" to "disabled". The user must
 * manually enable sync_enabled / processing_enabled from the dashboard
 * after confirming setup worked.
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

  // Only allow setting API key on needs_token accounts.
  if (account.status !== "needs_token") {
    return NextResponse.json(
      { error: "Account does not require API key setup" },
      { status: 400 }
    );
  }

  // 4. Update metadata with API key and clear the needs_token blocker.
  // The user manually enables sync_enabled / processing_enabled after this.
  const currentMeta = account.account_type_metadata || {};
  const updatedMeta = { ...currentMeta, api_key: apiKey };

  const mutation = `
    mutation SaveApiKey($id: uuid!, $metadata: jsonb!, $status: String!) {
      update_exchange_accounts_by_pk(
        pk_columns: { id: $id }
        _set: { account_type_metadata: $metadata, status: $status }
      ) {
        id
        status
        account_type_metadata
      }
    }
  `;

  let updateResult: Awaited<ReturnType<typeof hasuraFetch>>;
  try {
    updateResult = await hasuraFetch(token, mutation, {
      id: accountId,
      metadata: updatedMeta,
      status: "disabled",
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
  // so when a user submits a key for one account, apply it to all siblings
  // that are still in needs_token status. This is a single user-authenticated
  // mutation — Hasura's permissions keep it scoped to the caller's own
  // wallet. Best-effort: don't fail the primary request if this errors.
  try {
    if (account.exchange?.name === "lighter" && account.wallet_id) {
      const siblingsQuery = `
        query GetNeedsTokenSiblings($walletId: uuid!, $exchangeId: uuid!, $excludeId: uuid!) {
          exchange_accounts(
            where: {
              wallet_id: { _eq: $walletId }
              exchange_id: { _eq: $exchangeId }
              id: { _neq: $excludeId }
              status: { _eq: "needs_token" }
            }
          ) {
            id
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
        | Array<{ id: string; account_type_metadata: Record<string, unknown> | null }>
        | undefined) || [];

      for (const sibling of siblings) {
        const siblingMeta = {
          ...(sibling.account_type_metadata || {}),
          api_key: apiKey,
        };
        await hasuraFetch(token, mutation, {
          id: sibling.id,
          metadata: siblingMeta,
          status: "disabled",
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
