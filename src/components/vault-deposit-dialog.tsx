"use client";

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
import { Loader2, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { VaultListing } from "@/lib/queries";
import {
  prepareVaultDeposit,
  signVaultDeposit,
  submitVaultDeposit,
  verifyVaultEquity,
  DepositResult,
} from "@/lib/hyperliquid-signing";

// ---------------------------------------------------------------------------
// Step machine
// ---------------------------------------------------------------------------

type Step =
  | "input"        // User enters amount + address
  | "preparing"    // Fetching EIP-712 typed data from vault_manager
  | "signing"      // Waiting for MetaMask signature
  | "submitting"   // Submitting to Hyperliquid via vault_manager
  | "verifying"    // Polling vault equity
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

  const stepOrder: Step[] = ["input", "preparing", "signing", "submitting", "verifying", "done", "error"];
  const currentIdx = stepOrder.indexOf(step);

  return (
    <div className="flex items-center gap-1 text-xs">
      {steps.map((s, i) => {
        const sIdx = stepOrder.indexOf(s.id);
        const done = currentIdx > sIdx;
        const active = currentIdx === sIdx;
        return (
          <div key={s.id} className="flex items-center gap-1">
            {i > 0 && <div className={`h-px w-6 ${done ? "bg-primary" : "bg-muted-foreground/30"}`} />}
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

interface VaultDepositDialogProps {
  vault: VaultListing;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VaultDepositDialog({
  vault,
  open,
  onClose,
  onSuccess,
}: VaultDepositDialogProps) {
  const [amount, setAmount] = useState("");
  const [userAddress, setUserAddress] = useState("");
  const [step, setStep] = useState<Step>("input");
  const [errorMsg, setErrorMsg] = useState("");
  const [depositResult, setDepositResult] = useState<DepositResult | null>(null);
  const [equity, setEquity] = useState<string | null>(null);

  function reset() {
    setAmount("");
    setUserAddress("");
    setStep("input");
    setErrorMsg("");
    setDepositResult(null);
    setEquity(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleDeposit() {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum < 1) {
      toast.error("Minimum deposit is $1");
      return;
    }
    if (!userAddress || !userAddress.startsWith("0x")) {
      toast.error("Please enter a valid Ethereum address");
      return;
    }

    try {
      // Step 1: prepare (get EIP-712 typed data from vault_manager)
      setStep("preparing");
      const prep = await prepareVaultDeposit(
        vault.address,
        Math.floor(amountNum),
        userAddress,
      );

      // Step 2: sign with MetaMask
      setStep("signing");
      let signature = "";
      try {
        signature = await signVaultDeposit(userAddress, prep.typedData);
      } catch (signErr) {
        // User rejected or MetaMask unavailable
        throw new Error(
          signErr instanceof Error && signErr.message.includes("rejected")
            ? "Signature rejected by wallet."
            : `Signing failed: ${signErr instanceof Error ? signErr.message : String(signErr)}`,
        );
      }

      // Step 3: submit to Hyperliquid
      setStep("submitting");
      const result = await submitVaultDeposit(
        vault.address,
        prep.action,
        prep.nonce,
        signature,
        userAddress,
      );
      setDepositResult(result);

      // Step 4: verify equity
      setStep("verifying");
      // Poll up to 3 times with 3-second delays.
      let verified = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        await new Promise((r) => setTimeout(r, 3000));
        try {
          const eq = await verifyVaultEquity(vault.address, userAddress);
          if (eq.verified && parseFloat(eq.equity) > 0) {
            setEquity(eq.equity);
            verified = true;
            break;
          }
        } catch {
          // ignore transient errors during verification
        }
      }

      if (!verified) {
        // Non-fatal: deposit succeeded but equity not yet visible
        setEquity(null);
      }

      setStep("done");
      toast.success("Deposit confirmed!");
      onSuccess();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Deposit failed. Please try again.";
      setErrorMsg(msg);
      setStep("error");
      toast.error(msg);
    }
  }

  const isLoading = ["preparing", "signing", "submitting", "verifying"].includes(step);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Deposit into {vault.name}</DialogTitle>
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
              <Label htmlFor="user-address">Your Ethereum Address</Label>
              <Input
                id="user-address"
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
              <Label htmlFor="deposit-amount">Amount (USD)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  id="deposit-amount"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="1000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-7 font-mono"
                />
              </div>
              <p className="text-xs text-muted-foreground">Minimum $1 USD</p>
            </div>

            <div className="rounded-md border border-amber-500/30 bg-amber-50 dark:bg-amber-900/10 p-3 text-xs text-amber-700 dark:text-amber-400">
              <strong>Note:</strong> Deposits are submitted directly to Hyperliquid.
              You will need to approve the transaction in MetaMask using EIP-712
              signing. Funds are at risk; only deposit what you can afford to lose.
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleDeposit} disabled={!amount || !userAddress}>
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
              {step === "preparing" && "Preparing signing request…"}
              {step === "signing" && "Waiting for MetaMask signature…"}
              {step === "submitting" && "Submitting deposit to Hyperliquid…"}
              {step === "verifying" && "Verifying funds on-chain…"}
            </p>
          </div>
        )}

        {/* Success */}
        {step === "done" && (
          <div className="flex flex-col items-center gap-3 py-4">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
            <div className="text-center">
              <p className="font-semibold">Deposit Confirmed</p>
              {depositResult && (
                <p className="text-xs text-muted-foreground mt-1">
                  ID: {depositResult.depositId}
                </p>
              )}
              {equity ? (
                <p className="text-sm text-green-600 dark:text-green-400 mt-2">
                  Verified equity: ${parseFloat(equity).toFixed(2)}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-2">
                  Equity may take a few minutes to appear on-chain.
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
              <p className="font-semibold">Deposit Failed</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                {errorMsg}
              </p>
            </div>
            <div className="flex gap-2 mt-2">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={() => setStep("input")}>Try Again</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
