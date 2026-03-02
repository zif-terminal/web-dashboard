"use client";

/**
 * C1.1: VaultStrategyDepositDialog
 *
 * Dialog that walks an external user through depositing USDC into a ZIF
 * strategy vault. Uses the usdClassTransfer signing flow (MetaMask EIP-712):
 *
 *   input → preparing → signing → submitting → verifying → done | error
 *
 * Mirrors the design of vault-deposit-dialog.tsx for consistency.
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
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import {
  prepareStrategyDeposit,
  signStrategyDeposit,
  submitStrategyDeposit,
  waitForStrategyDepositVerification,
  type StrategyDepositResult,
} from "@/lib/strategy-vault-signing";

// ---------------------------------------------------------------------------
// Step machine
// ---------------------------------------------------------------------------

type Step =
  | "input"       // User enters amount + wallet address
  | "preparing"   // Fetching EIP-712 typed data from vault_manager
  | "signing"     // Awaiting MetaMask signature
  | "submitting"  // Forwarding signed action to Hyperliquid
  | "verifying"   // Polling for deposit confirmation in DB
  | "done"        // Success
  | "error";      // Terminal error

function StepIndicator({ step }: { step: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: "signing", label: "Sign" },
    { id: "submitting", label: "Submit" },
    { id: "verifying", label: "Verify" },
    { id: "done", label: "Done" },
  ];
  const order: Step[] = [
    "input", "preparing", "signing", "submitting", "verifying", "done", "error",
  ];
  const cur = order.indexOf(step);

  return (
    <div className="flex items-center gap-1 text-xs">
      {steps.map((s, i) => {
        const sIdx = order.indexOf(s.id);
        const done = cur > sIdx;
        const active = cur === sIdx;
        return (
          <div key={s.id} className="flex items-center gap-1">
            {i > 0 && (
              <div className={`h-px w-6 ${done ? "bg-primary" : "bg-muted-foreground/30"}`} />
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

export interface StrategyVaultInfo {
  slug: string;
  name: string;
  asset: string;
}

interface VaultStrategyDepositDialogProps {
  vault: StrategyVaultInfo;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VaultStrategyDepositDialog({
  vault,
  open,
  onClose,
  onSuccess,
}: VaultStrategyDepositDialogProps) {
  const [amount, setAmount] = useState("");
  const [userAddress, setUserAddress] = useState("");
  const [step, setStep] = useState<Step>("input");
  const [errorMsg, setErrorMsg] = useState("");
  const [depositResult, setDepositResult] = useState<StrategyDepositResult | null>(null);

  function reset() {
    setAmount("");
    setUserAddress("");
    setStep("input");
    setErrorMsg("");
    setDepositResult(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleDeposit() {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum < 1) {
      setErrorMsg("Please enter a valid amount (minimum $1).");
      return;
    }
    if (!userAddress.match(/^0x[0-9a-fA-F]{40}$/)) {
      setErrorMsg("Please enter a valid Ethereum address (0x…).");
      return;
    }

    setErrorMsg("");

    try {
      // ── Step 1: Prepare (fetch EIP-712 typed data) ──────────────────────
      setStep("preparing");
      const prepared = await prepareStrategyDeposit(vault.slug, amountNum, userAddress);

      // ── Step 2: Sign with MetaMask ───────────────────────────────────────
      setStep("signing");
      const signature = await signStrategyDeposit(userAddress, prepared.typedData);

      // ── Step 3: Submit to vault_manager → Hyperliquid ───────────────────
      setStep("submitting");
      const result = await submitStrategyDeposit(
        vault.slug,
        prepared.action,
        prepared.nonce,
        signature,
        userAddress,
      );
      setDepositResult(result);

      // ── Step 4: Poll for DB confirmation ────────────────────────────────
      setStep("verifying");
      const verified = await waitForStrategyDepositVerification(vault.slug, userAddress);

      if (verified.verified) {
        setStep("done");
        toast.success(
          `Deposit of $${amountNum.toFixed(2)} USDC confirmed! Deposit ID: ${verified.depositId ?? result.depositId}`,
        );
        onSuccess();
      } else {
        // Submitted to Hyperliquid but not yet reflected in DB — still success.
        setStep("done");
        toast.success(
          `Deposit submitted. Your $${amountNum.toFixed(2)} USDC is being processed.`,
        );
        onSuccess();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Deposit failed.";
      setErrorMsg(msg);
      setStep("error");
      toast.error(msg);
    }
  }

  const isProcessing = ["preparing", "signing", "submitting", "verifying"].includes(step);

  function stepLabel(s: Step): string {
    switch (s) {
      case "preparing":   return "Preparing signing request…";
      case "signing":     return "Waiting for MetaMask signature…";
      case "submitting":  return "Submitting to Hyperliquid…";
      case "verifying":   return "Confirming deposit…";
      default:            return "";
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Deposit into {vault.name}</DialogTitle>
          <DialogDescription>
            Deposit USDC into the {vault.name} strategy vault via Hyperliquid.
            Your funds will be used by the automated trading strategy.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Step indicator */}
          {step !== "input" && step !== "error" && (
            <StepIndicator step={step} />
          )}

          {/* Input form */}
          {(step === "input" || step === "error") && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="deposit-amount">Amount (USDC)</Label>
                <Input
                  id="deposit-amount"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="e.g. 100"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={isProcessing}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="deposit-address">Your Wallet Address</Label>
                <Input
                  id="deposit-address"
                  type="text"
                  placeholder="0x…"
                  value={userAddress}
                  onChange={(e) => setUserAddress(e.target.value)}
                  disabled={isProcessing}
                />
                <p className="text-xs text-muted-foreground">
                  Must match the address you will sign with in MetaMask.
                </p>
              </div>

              {errorMsg && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleClose}
                  disabled={isProcessing}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleDeposit}
                  disabled={isProcessing || !amount || !userAddress}
                >
                  Deposit
                </Button>
              </div>
            </div>
          )}

          {/* Processing state */}
          {isProcessing && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">{stepLabel(step)}</p>
              {step === "signing" && (
                <p className="text-xs text-muted-foreground">
                  Check your MetaMask extension and approve the signature request.
                </p>
              )}
            </div>
          )}

          {/* Success state */}
          {step === "done" && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-500" />
              <div className="space-y-1">
                <p className="font-medium text-green-600 dark:text-green-400">
                  Deposit Confirmed!
                </p>
                <p className="text-sm text-muted-foreground">
                  ${parseFloat(amount).toFixed(2)} USDC has been deposited into{" "}
                  <span className="font-medium">{vault.name}</span>.
                </p>
                {depositResult && (
                  <p className="text-xs text-muted-foreground font-mono">
                    ID: {depositResult.depositId}
                  </p>
                )}
              </div>
              <Button className="mt-2" onClick={handleClose}>
                Close
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
