"use client";

/**
 * C1.5: VaultWithdrawDialog
 *
 * Full withdrawal dialog with step machine:
 *   input → preparing → signing → submitting → verifying → done | error
 *
 * The server-side (vault_manager) enforces:
 *   - Cooldown check (HTTP 409 if within lockup window)
 *   - Equity check  (HTTP 400 if amount exceeds current equity)
 */

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, AlertCircle, ExternalLink, ArrowDownLeft } from "lucide-react";
import { VaultListing, VaultListingWithdrawal } from "@/lib/queries";
import { api } from "@/lib/api";
import {
  prepareVaultWithdraw,
  signVaultWithdraw,
  submitVaultWithdraw,
  verifyVaultWithdrawal,
  WithdrawResult,
} from "@/lib/hyperliquid-signing";

// ---------------------------------------------------------------------------
// Step machine
// ---------------------------------------------------------------------------

type Step =
  | "input"        // User enters amount + address
  | "preparing"    // Fetching EIP-712 typed data + server checks
  | "signing"      // Waiting for MetaMask signature
  | "submitting"   // Submitting to Hyperliquid via vault_manager
  | "verifying"    // Polling vault equity to confirm withdrawal
  | "done"         // Success
  | "error";       // Terminal error

interface StepIndicatorProps {
  step: Step;
}

function StepIndicator({ step }: StepIndicatorProps) {
  const steps: { id: Step; label: string }[] = [
    { id: "signing", label: "Sign" },
    { id: "submitting", label: "Submit" },
    { id: "verifying", label: "Verify" },
    { id: "done", label: "Done" },
  ];

  const stepOrder: Step[] = [
    "input", "preparing", "signing", "submitting", "verifying", "done", "error",
  ];
  const currentIdx = stepOrder.indexOf(step);

  return (
    <div className="flex items-center gap-1 text-xs">
      {steps.map((s, i) => {
        const sIdx = stepOrder.indexOf(s.id);
        const done = currentIdx > sIdx;
        const active = currentIdx === sIdx;
        return (
          <div key={s.id} className="flex items-center gap-1">
            {i > 0 && (
              <div
                className={`h-px w-6 ${done ? "bg-primary" : "bg-muted-foreground/30"}`}
              />
            )}
            <div
              className={`rounded-full px-2 py-0.5 font-medium transition-colors ${
                done
                  ? "bg-primary/20 text-primary"
                  : active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {s.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface VaultWithdrawDialogProps {
  vault: VaultListing;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VaultWithdrawDialog({
  vault,
  open,
  onClose,
  onSuccess,
}: VaultWithdrawDialogProps) {
  const [amount, setAmount] = useState("");
  const [userAddress, setUserAddress] = useState("");
  const [step, setStep] = useState<Step>("input");
  const [errorMsg, setErrorMsg] = useState("");
  const [withdrawResult, setWithdrawResult] = useState<WithdrawResult | null>(null);
  const [finalEquity, setFinalEquity] = useState<string | null>(null);
  // C1.5: recent withdrawals shown on the success step
  const [recentWithdrawals, setRecentWithdrawals] = useState<VaultListingWithdrawal[]>([]);

  function reset() {
    setAmount("");
    setUserAddress("");
    setStep("input");
    setErrorMsg("");
    setWithdrawResult(null);
    setFinalEquity(null);
    setRecentWithdrawals([]);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleWithdraw() {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum < 1) {
      toast.error("Minimum withdrawal is $1");
      return;
    }
    if (!userAddress || !userAddress.startsWith("0x")) {
      toast.error("Please enter a valid Ethereum address");
      return;
    }

    try {
      // Step 1: prepare — server checks cooldown + equity, returns EIP-712 data
      setStep("preparing");
      const prep = await prepareVaultWithdraw(
        vault.address,
        Math.floor(amountNum),
        userAddress,
      );

      // Step 2: sign with MetaMask
      setStep("signing");
      let signature = "";
      try {
        signature = await signVaultWithdraw(userAddress, prep.typedData);
      } catch (signErr) {
        throw new Error(
          signErr instanceof Error && signErr.message.includes("rejected")
            ? "Signature rejected by wallet."
            : `Signing failed: ${signErr instanceof Error ? signErr.message : String(signErr)}`,
        );
      }

      // Step 3: submit to Hyperliquid
      setStep("submitting");
      const result = await submitVaultWithdraw(
        vault.address,
        prep.action,
        prep.nonce,
        signature,
        userAddress,
      );
      setWithdrawResult(result);

      // Step 4: verify equity decreased (poll up to 3 times with 3s delay)
      setStep("verifying");
      let verified = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        await new Promise((r) => setTimeout(r, 3000));
        try {
          const eq = await verifyVaultWithdrawal(vault.address, userAddress);
          if (eq.verified) {
            setFinalEquity(eq.currentEquity);
            verified = true;
            break;
          }
        } catch {
          // ignore transient errors during verification
        }
      }

      if (!verified) {
        // Non-fatal: withdrawal succeeded but equity not yet updated on-chain
        setFinalEquity(null);
      }

      setStep("done");
      toast.success("Withdrawal confirmed!");

      // C1.5: Fetch recent withdrawal history for this vault (non-blocking)
      api.getVaultWithdrawalHistory(vault.address)
        .then((history) => setRecentWithdrawals(history.slice(0, 5)))
        .catch(() => { /* non-fatal */ });

      onSuccess();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Withdrawal failed. Please try again.";
      setErrorMsg(msg);
      setStep("error");
      toast.error(msg);
    }
  }

  const isLoading = ["preparing", "signing", "submitting", "verifying"].includes(step);

  // Determine if the error is a cooldown error (409) — show special message.
  const isCooldownError =
    step === "error" && errorMsg.toLowerCase().includes("cooldown");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowDownLeft className="h-5 w-5 text-orange-500" />
            Withdraw from {vault.name}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {vault.address.slice(0, 12)}…{vault.address.slice(-8)}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator (shown when in-progress) */}
        {step !== "input" && step !== "error" && step !== "done" && (
          <div className="flex justify-center">
            <StepIndicator step={step} />
          </div>
        )}

        {/* Input form */}
        {step === "input" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3 text-sm">
              <div>
                <div className="text-muted-foreground">TVL</div>
                <div className="font-mono font-medium">
                  ${vault.tvl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">APR</div>
                <div className="font-mono font-medium text-green-600 dark:text-green-400">
                  {vault.apr.toFixed(2)}%
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="withdraw-address">Your Ethereum Address</Label>
              <Input
                id="withdraw-address"
                type="text"
                placeholder="0x..."
                value={userAddress}
                onChange={(e) => setUserAddress(e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Must match the account connected to MetaMask
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="withdraw-amount">Amount (USD)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  id="withdraw-amount"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="100"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-7 font-mono"
                />
              </div>
              <p className="text-xs text-muted-foreground">Minimum $1 USD</p>
            </div>

            <div className="rounded-md border border-amber-500/30 bg-amber-50 dark:bg-amber-900/10 p-3 text-xs text-amber-700 dark:text-amber-400">
              <strong>Note:</strong> Withdrawals are submitted directly to Hyperliquid.
              Funds will be returned to your Hyperliquid account. Subject to any
              cooldown/lockup periods configured by the vault.
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleWithdraw}
                disabled={!amount || !userAddress}
                className="bg-orange-600 hover:bg-orange-700 text-white"
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Loading states */}
        {isLoading && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {step === "preparing" && "Checking cooldown & equity…"}
              {step === "signing" && "Waiting for MetaMask signature…"}
              {step === "submitting" && "Submitting withdrawal to Hyperliquid…"}
              {step === "verifying" && "Verifying withdrawal on-chain…"}
            </p>
          </div>
        )}

        {/* Success */}
        {step === "done" && (
          <div className="flex flex-col items-center gap-3 py-4">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
            <div className="text-center">
              <p className="font-semibold">Withdrawal Confirmed</p>
              {withdrawResult && (
                <p className="text-xs text-muted-foreground mt-1">
                  ID: {withdrawResult.withdrawalId}
                </p>
              )}
              {finalEquity !== null ? (
                <p className="text-sm text-muted-foreground mt-2">
                  Remaining equity: ${parseFloat(finalEquity).toFixed(2)}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-2">
                  Funds will appear in your Hyperliquid account shortly.
                </p>
              )}
            </div>
            <a
              href={`https://app.hyperliquid.xyz/vaults/${vault.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              View on Hyperliquid
              <ExternalLink className="h-3 w-3" />
            </a>

            {/* C1.5: Recent withdrawal history for this vault */}
            {recentWithdrawals.length > 0 && (
              <div className="w-full mt-2">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Recent withdrawals from this vault
                </p>
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Date</th>
                        <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Amount</th>
                        <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {recentWithdrawals.map((w) => (
                        <tr key={w.id}>
                          <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">
                            {new Date(w.created_at).toLocaleString()}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono font-medium whitespace-nowrap">
                            ${parseFloat(String(w.amount_usd)).toFixed(2)}
                          </td>
                          <td className="px-2 py-1.5 capitalize text-muted-foreground">
                            {w.status}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <Button className="mt-2" onClick={handleClose}>
              Done
            </Button>
          </div>
        )}

        {/* Error */}
        {step === "error" && (
          <div className="flex flex-col items-center gap-3 py-4">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <div className="text-center">
              <p className="font-semibold">
                {isCooldownError ? "Withdrawal Locked" : "Withdrawal Failed"}
              </p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                {errorMsg}
              </p>
              {isCooldownError && (
                <p className="text-xs text-muted-foreground mt-2">
                  This vault has a withdrawal cooldown period. Please wait until
                  it expires before withdrawing.
                </p>
              )}
            </div>
            <div className="flex gap-2 mt-2">
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
              {!isCooldownError && (
                <Button onClick={() => setStep("input")}>Try Again</Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
