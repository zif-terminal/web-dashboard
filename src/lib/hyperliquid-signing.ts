/**
 * C1.1: Hyperliquid EIP-712 signing utilities for vault deposits.
 *
 * The signing flow is split across two endpoints to keep complex crypto on the
 * server (vault_manager) and leave only the MetaMask call in the browser:
 *
 *   1.  POST /api/vault/{address}/deposit/prepare
 *         → vault_manager computes the EIP-712 typed data (including the
 *           keccak256 connectionId from msgpack-encoded action).
 *         ← Returns { typedData, action, nonce }.
 *
 *   2.  eth_signTypedData_v4(userAddress, JSON.stringify(typedData))
 *         → MetaMask presents the structured signing request to the user.
 *         ← Returns a 65-byte hex signature string.
 *
 *   3.  POST /api/vault/{address}/deposit
 *         → { action, nonce, signature, userAddress }
 *         → vault_manager forwards to Hyperliquid /exchange.
 *         ← Returns { depositId, status }.
 */

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

export interface VaultDepositTypedData {
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

export interface VaultTransferAction {
  type: "vaultTransfer";
  vaultAddress: string;
  isDeposit: boolean;
  usd: number; // integer USD amount
}

export interface PrepareDepositResponse {
  typedData: VaultDepositTypedData;
  action: VaultTransferAction;
  nonce: number;
}

export interface DepositResult {
  depositId: string;
  status: "confirmed" | "pending" | "failed";
}

// -------------------------------------------------------------------------
// Step 1: Request typed data from vault_manager
// -------------------------------------------------------------------------

export async function prepareVaultDeposit(
  vaultAddress: string,
  amountUsd: number,
  userAddress: string,
): Promise<PrepareDepositResponse> {
  const resp = await fetch(`/api/vault/${vaultAddress}/deposit/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: amountUsd, userAddress }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(
      `Failed to prepare deposit: ${err.error ?? resp.statusText}`,
    );
  }

  return resp.json() as Promise<PrepareDepositResponse>;
}

// -------------------------------------------------------------------------
// Step 2: Sign with MetaMask via eth_signTypedData_v4
// -------------------------------------------------------------------------

export async function signVaultDeposit(
  userAddress: string,
  typedData: VaultDepositTypedData,
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
// Step 3: Submit signed deposit to vault_manager
// -------------------------------------------------------------------------

export async function submitVaultDeposit(
  vaultAddress: string,
  action: VaultTransferAction,
  nonce: number,
  signature: string,
  userAddress: string,
  testMode = false,
): Promise<DepositResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (testMode) {
    headers["X-Test-Mode"] = "true";
  }

  const resp = await fetch(`/api/vault/${vaultAddress}/deposit`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action, nonce, signature, userAddress }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(
      `Deposit submission failed: ${err.error ?? resp.statusText}`,
    );
  }

  return resp.json() as Promise<DepositResult>;
}

// -------------------------------------------------------------------------
// Convenience: full deposit flow in one call
// -------------------------------------------------------------------------

export async function depositIntoVault(
  vaultAddress: string,
  amountUsd: number,
  userAddress: string,
  testMode = false,
): Promise<DepositResult> {
  // Step 1: get EIP-712 typed data from server
  const { typedData, action, nonce } = await prepareVaultDeposit(
    vaultAddress,
    amountUsd,
    userAddress,
  );

  let signature = "";
  if (!testMode) {
    // Step 2: sign with MetaMask
    signature = await signVaultDeposit(userAddress, typedData);
  }

  // Step 3: submit
  return submitVaultDeposit(
    vaultAddress,
    action,
    nonce,
    signature,
    userAddress,
    testMode,
  );
}

// -------------------------------------------------------------------------
// C1.5: Withdrawal flow
// -------------------------------------------------------------------------

export interface PrepareWithdrawResponse {
  typedData: VaultDepositTypedData;
  action: VaultTransferAction;
  nonce: number;
  currentEquity: string; // user's current equity in USD
}

export interface WithdrawResult {
  withdrawalId: string;
  status: "confirmed" | "pending" | "failed";
}

export interface VaultWithdrawalVerifyResult {
  verified: boolean;
  currentEquity: string;
}

/**
 * Step 1: Request withdrawal typed data from vault_manager.
 * The server performs cooldown check and equity validation before responding.
 */
export async function prepareVaultWithdraw(
  vaultAddress: string,
  amountUsd: number,
  userAddress: string,
): Promise<PrepareWithdrawResponse> {
  const resp = await fetch(`/api/vault/${vaultAddress}/withdraw/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: amountUsd, userAddress }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(
      `Failed to prepare withdrawal: ${err.error ?? resp.statusText}`,
    );
  }

  return resp.json() as Promise<PrepareWithdrawResponse>;
}

/**
 * Step 2: Sign withdrawal typed data with MetaMask (same as deposit — reuses eth_signTypedData_v4).
 */
export async function signVaultWithdraw(
  userAddress: string,
  typedData: VaultDepositTypedData,
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

/**
 * Step 3: Submit signed withdrawal to vault_manager.
 * vault_manager forwards to Hyperliquid /exchange with isDeposit=false.
 */
export async function submitVaultWithdraw(
  vaultAddress: string,
  action: VaultTransferAction,
  nonce: number,
  signature: string,
  userAddress: string,
  testMode = false,
): Promise<WithdrawResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (testMode) {
    headers["X-Test-Mode"] = "true";
  }

  const resp = await fetch(`/api/vault/${vaultAddress}/withdraw`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action, nonce, signature, userAddress }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(
      `Withdrawal submission failed: ${err.error ?? resp.statusText}`,
    );
  }

  return resp.json() as Promise<WithdrawResult>;
}

/**
 * Verify equity after withdrawal (poll to confirm funds were removed from vault).
 */
export async function verifyVaultWithdrawal(
  vaultAddress: string,
  userAddress: string,
): Promise<VaultWithdrawalVerifyResult> {
  const resp = await fetch(
    `/api/vault/${vaultAddress}/verify-withdrawal?user=${encodeURIComponent(userAddress)}`,
  );

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(
      `Failed to verify withdrawal: ${err.error ?? resp.statusText}`,
    );
  }

  return resp.json() as Promise<VaultWithdrawalVerifyResult>;
}

/**
 * Convenience: full withdrawal flow in one call.
 */
export async function withdrawFromVault(
  vaultAddress: string,
  amountUsd: number,
  userAddress: string,
  testMode = false,
): Promise<WithdrawResult> {
  // Step 1: get EIP-712 typed data (with cooldown + equity checks on server)
  const { typedData, action, nonce } = await prepareVaultWithdraw(
    vaultAddress,
    amountUsd,
    userAddress,
  );

  let signature = "";
  if (!testMode) {
    // Step 2: sign with MetaMask
    signature = await signVaultWithdraw(userAddress, typedData);
  }

  // Step 3: submit
  return submitVaultWithdraw(
    vaultAddress,
    action,
    nonce,
    signature,
    userAddress,
    testMode,
  );
}

// -------------------------------------------------------------------------
// Verify equity after deposit
// -------------------------------------------------------------------------

export interface VaultEquityResult {
  verified: boolean;
  equity: string;
}

export async function verifyVaultEquity(
  vaultAddress: string,
  userAddress: string,
): Promise<VaultEquityResult> {
  const resp = await fetch(
    `/api/vault/${vaultAddress}/verify?user=${encodeURIComponent(userAddress)}`,
  );

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(
      `Failed to verify equity: ${err.error ?? resp.statusText}`,
    );
  }

  return resp.json() as Promise<VaultEquityResult>;
}
