import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { TOKEN_COOKIE_NAME } from "@/lib/cookie-config";

const HASURA_URL = process.env.HASURA_URL || "http://localhost:8080";
const HASURA_ADMIN_SECRET = process.env.HASURA_ADMIN_SECRET || "";
const AUTH_URL = process.env.AUTH_URL || "http://localhost:8081";

/**
 * Verify the JWT token and return the user ID.
 */
async function getUserId(token: string): Promise<string | null> {
  try {
    const resp = await fetch(`${AUTH_URL}/auth/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data["X-Hasura-User-Id"] || null;
  } catch {
    return null;
  }
}

/**
 * Check that the account exists and belongs to the user (via wallet ownership).
 */
async function verifyAccountOwnership(
  accountId: string,
  userId: string
): Promise<boolean> {
  const query = `
    query VerifyAccountOwnership($accountId: uuid!, $userId: String!) {
      exchange_accounts(
        where: {
          id: { _eq: $accountId }
          wallet: { user_id: { _eq: $userId } }
        }
      ) {
        id
      }
    }
  `;

  const resp = await fetch(`${HASURA_URL}/v1/graphql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hasura-Admin-Secret": HASURA_ADMIN_SECRET,
    },
    body: JSON.stringify({ query, variables: { accountId, userId } }),
  });

  const result = await resp.json();
  return (result.data?.exchange_accounts?.length ?? 0) > 0;
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
 * Security: validates JWT, verifies account ownership via wallet->user_id,
 * then uses admin secret for the mutation (user role cannot update
 * account_type_metadata or status).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: accountId } = await params;

  // 1. Auth check
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  const userId = await getUserId(token);
  if (!userId) {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 }
    );
  }

  // 2. Parse body
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

  // 3. Verify account ownership
  const isOwner = await verifyAccountOwnership(accountId, userId);
  if (!isOwner) {
    return NextResponse.json(
      { error: "Account not found or access denied" },
      { status: 404 }
    );
  }

  // 4. Fetch current metadata so we merge rather than overwrite
  const getQuery = `
    query GetAccountMetadata($id: uuid!) {
      exchange_accounts_by_pk(id: $id) {
        account_type_metadata
        status
      }
    }
  `;

  let currentMeta: Record<string, unknown> = {};
  let currentStatus: string | null = null;
  try {
    const getResp = await fetch(`${HASURA_URL}/v1/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hasura-Admin-Secret": HASURA_ADMIN_SECRET,
      },
      body: JSON.stringify({ query: getQuery, variables: { id: accountId } }),
    });
    const getResult = await getResp.json();
    const account = getResult.data?.exchange_accounts_by_pk;
    if (account) {
      currentMeta = account.account_type_metadata || {};
      currentStatus = account.status;
    }
  } catch {
    // If we can't read, proceed with empty metadata
  }

  // Only allow setting API key on needs_token accounts
  if (currentStatus !== "needs_token") {
    return NextResponse.json(
      { error: "Account does not require API key setup" },
      { status: 400 }
    );
  }

  // 5. Update metadata with API key and clear the needs_token blocker.
  // The user manually enables sync_enabled / processing_enabled after this.
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

  let hasuraResponse: Response;
  try {
    hasuraResponse = await fetch(`${HASURA_URL}/v1/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hasura-Admin-Secret": HASURA_ADMIN_SECRET,
      },
      body: JSON.stringify({
        query: mutation,
        variables: { id: accountId, metadata: updatedMeta, status: "disabled" },
      }),
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to connect to database" },
      { status: 502 }
    );
  }

  const result = await hasuraResponse.json();

  if (result.errors) {
    return NextResponse.json(
      { error: "Database error", details: result.errors },
      { status: 500 }
    );
  }

  // 6. Propagate API key to sibling Lighter accounts under the same wallet.
  // Lighter API keys are per-wallet (one key works for all subaccounts),
  // so when a user submits a key for one account, apply it to all siblings
  // that are still in needs_token status.
  try {
    const siblingQuery = `
      query GetSiblingLighterAccounts($accountId: uuid!) {
        exchange_accounts_by_pk(id: $accountId) {
          wallet_id
          exchange
        }
      }
    `;

    const siblingResp = await fetch(`${HASURA_URL}/v1/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hasura-Admin-Secret": HASURA_ADMIN_SECRET,
      },
      body: JSON.stringify({
        query: siblingQuery,
        variables: { accountId },
      }),
    });

    const siblingResult = await siblingResp.json();
    const account = siblingResult.data?.exchange_accounts_by_pk;

    if (account?.exchange === "lighter" && account?.wallet_id) {
      const updateSiblingsQuery = `
        query GetNeedsTokenSiblings($walletId: uuid!, $exchange: String!, $excludeId: uuid!) {
          exchange_accounts(
            where: {
              wallet_id: { _eq: $walletId }
              exchange: { _eq: $exchange }
              id: { _neq: $excludeId }
              status: { _eq: "needs_token" }
            }
          ) {
            id
            account_type_metadata
          }
        }
      `;

      const siblingsResp = await fetch(`${HASURA_URL}/v1/graphql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hasura-Admin-Secret": HASURA_ADMIN_SECRET,
        },
        body: JSON.stringify({
          query: updateSiblingsQuery,
          variables: {
            walletId: account.wallet_id,
            exchange: "lighter",
            excludeId: accountId,
          },
        }),
      });

      const siblingsResult = await siblingsResp.json();
      const siblings = siblingsResult.data?.exchange_accounts || [];

      for (const sibling of siblings) {
        const siblingMeta = { ...(sibling.account_type_metadata || {}), api_key: apiKey };

        await fetch(`${HASURA_URL}/v1/graphql`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Hasura-Admin-Secret": HASURA_ADMIN_SECRET,
          },
          body: JSON.stringify({
            query: mutation,
            variables: { id: sibling.id, metadata: siblingMeta, status: "disabled" },
          }),
        });
      }
    }
  } catch {
    // Sibling update is best-effort; don't fail the primary request
  }

  return NextResponse.json({
    success: true,
    account: result.data?.update_exchange_accounts_by_pk,
  });
}
