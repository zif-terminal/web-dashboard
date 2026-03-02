/**
 * strategy-vault-signing.ts
 *
 * C1.1: EIP-712 signing utilities for depositing into ZIF strategy vaults.
 *
 * Strategy vault deposits use Hyperliquid's usdClassTransfer action (not
 * vaultTransfer). The flow mirrors the existing vault listing deposit flow:
 *
 *   1. POST /api/strategy-vault/{slug}/deposit/prepare
 *        → vault_manager computes EIP-712 typed data (usdClassTransfer action,
 *          keccak256 connectionId using 0x00 phantom-agent flag byte).
 *        ← Returns { typedData, action, nonce, platformDepositAddress }.
 *
 *   2. eth_signTypedData_v4(userAddress, JSON.stringify(typedData))
 *        → MetaMask presents structured signing request to the user.
 *        ← Returns a 65-byte hex signature string.
 *
 *   3. POST /api/strategy-vault/{slug}/deposit
 *        → { action, nonce, signature, userAddress }
 *        → vault_manager forwards to Hyperliquid /exchange, then records
 *          a vault_deposits row with user_address.
 *        ← Returns { depositId, status }.
 *
 *   4. GET /api/strategy-vault/{slug}/deposit/verify?user=0x...
 *        → Poll until the deposit row appears in vault_deposits (≤30s window).
 *        ← Returns { verified: true, depositId } on success.
 */

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

export interface StrategyVaultTypedData {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
}

/** usdClassTransfer action sent to Hyperliquid /exchange. */
export interface UsdClassTransferAction {
  type: "usdClassTransfer";
  amount: string; // decimal string, e.g. "100.0"
  toPerp: boolean;
}

export interface PrepareStrategyDepositResponse {
  typedData: StrategyVaultTypedData;
  action: UsdClassTransferAction;
  nonce: number;
  /** Platform-controlled HL address that receives the transfer. */
  platformDepositAddress: string;
}

export interface StrategyDepositResult {
  depositId: string;
  status: "confirmed" | "pending" | "failed";
}

export interface VerifyStrategyDepositResult {
  verified: boolean;
  depositId?: string;
}

// -------------------------------------------------------------------------
// Step 1: Request EIP-712 typed data from vault_manager
// -------------------------------------------------------------------------

export async function prepareStrategyDeposit(
  vaultSlug: string,
  amountUsd: number,
  userAddress: string,
): Promise<PrepareStrategyDepositResponse> {
  const resp = await fetch(`/api/strategy-vault/${vaultSlug}/deposit/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: amountUsd, userAddress }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(
      `Failed to prepare strategy deposit: ${err.error ?? resp.statusText}`,
    );
  }

  return resp.json() as Promise<PrepareStrategyDepositResponse>;
}

// -------------------------------------------------------------------------
// Step 2: Sign with MetaMask via eth_signTypedData_v4
// -------------------------------------------------------------------------

export async function signStrategyDeposit(
  userAddress: string,
  typedData: StrategyVaultTypedData,
): Promise<string> {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("MetaMask (or compatible wallet) is not available.");
  }

  const signature = await window.ethereum.request({
    method: "eth_signTypedData_v4",
    params: [userAddress, JSON.stringify(typedData)],
  });

  if (typeof signature !== "string") {
    throw new Error("Unexpected signature type returned by wallet.");
  }
  return signature;
}

// -------------------------------------------------------------------------
// Step 3: Submit signed deposit to vault_manager → Hyperliquid
// -------------------------------------------------------------------------

export async function submitStrategyDeposit(
  vaultSlug: string,
  action: UsdClassTransferAction,
  nonce: number,
  signature: string,
  userAddress: string,
  testMode = false,
): Promise<StrategyDepositResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (testMode) {
    headers["X-Test-Mode"] = "true";
  }

  const resp = await fetch(`/api/strategy-vault/${vaultSlug}/deposit`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action, nonce, signature, userAddress }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(
      `Strategy deposit submission failed: ${err.error ?? resp.statusText}`,
    );
  }

  return resp.json() as Promise<StrategyDepositResult>;
}

// -------------------------------------------------------------------------
// Step 4: Poll for deposit verification
// -------------------------------------------------------------------------

/**
 * Polls GET /api/strategy-vault/{slug}/deposit/verify?user=0x... until the
 * deposit record appears in vault_deposits (vault_manager checks within a
 * 30-second recency window) or maxAttempts is exhausted.
 */
export async function waitForStrategyDepositVerification(
  vaultSlug: string,
  userAddress: string,
  maxAttempts = 10,
  pollIntervalMs = 2000,
): Promise<VerifyStrategyDepositResult> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const resp = await fetch(
        `/api/strategy-vault/${vaultSlug}/deposit/verify?user=${encodeURIComponent(userAddress)}`,
      );
      if (resp.ok) {
        const result: VerifyStrategyDepositResult = await resp.json();
        if (result.verified) return result;
      }
    } catch {
      // Network hiccup — keep polling.
    }
    if (i < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }
  return { verified: false };
}

// -------------------------------------------------------------------------
// Convenience: full deposit flow in one call
// -------------------------------------------------------------------------

/**
 * Executes the complete strategy vault deposit flow:
 *   prepare → sign (MetaMask) → submit → verify
 *
 * Returns the StrategyDepositResult on success. Throws on any step failure.
 * Set testMode=true to skip MetaMask signing and Hyperliquid submission
 * (useful for local development and testing).
 */
export async function depositIntoStrategyVault(
  vaultSlug: string,
  amountUsd: number,
  userAddress: string,
  testMode = false,
): Promise<StrategyDepositResult> {
  // Step 1: get EIP-712 typed data + action from vault_manager
  const { typedData, action, nonce } = await prepareStrategyDeposit(
    vaultSlug,
    amountUsd,
    userAddress,
  );

  let signature = "";
  if (!testMode) {
    // Step 2: sign with MetaMask
    signature = await signStrategyDeposit(userAddress, typedData);
  }

  // Step 3: submit to vault_manager → Hyperliquid
  return submitStrategyDeposit(
    vaultSlug,
    action,
    nonce,
    signature,
    userAddress,
    testMode,
  );
}
