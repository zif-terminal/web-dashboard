"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Check, Loader2 } from "lucide-react";

interface AddWalletDialogProps {
  onSuccess?: () => void;
}

type DetectionStatus = "idle" | "detecting" | "done" | "error";

function detectChain(address: string): string | null {
  // Solana addresses are base58 encoded, 32-44 characters
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
    return "solana";
  }
  // Ethereum addresses start with 0x and are 42 characters
  if (/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return "ethereum";
  }
  return null;
}

export function AddWalletDialog({ onSuccess }: AddWalletDialogProps) {
  const [open, setOpen] = useState(false);
  const [walletInput, setWalletInput] = useState("");
  const [status, setStatus] = useState<DetectionStatus>("idle");
  const [chain, setChain] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setWalletInput("");
      setStatus("idle");
      setChain(null);
      setErrorMessage(null);
    }
  }, [open]);

  // Detect chain when wallet input changes
  useEffect(() => {
    if (walletInput.length >= 32) {
      setStatus("detecting");
      const detectedChain = detectChain(walletInput.trim());
      if (detectedChain) {
        setChain(detectedChain);
        setStatus("done");
        setErrorMessage(null);
      } else {
        setStatus("error");
        setErrorMessage("Unable to detect chain. Please enter a valid Solana or Ethereum address.");
      }
    } else {
      setStatus("idle");
      setChain(null);
    }
  }, [walletInput]);

  const handleAddWallet = async () => {
    if (!chain || !walletInput.trim()) {
      toast.error("Please enter a valid wallet address");
      return;
    }

    setIsAdding(true);

    try {
      await api.createWallet({
        address: walletInput.trim(),
        chain,
      });

      toast.success("Wallet added successfully! Account detection will begin shortly.");
      setOpen(false);
      onSuccess?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to add wallet"
      );
    } finally {
      setIsAdding(false);
    }
  };

  const getChainDisplayName = (chainName: string): string => {
    switch (chainName) {
      case "solana":
        return "Solana";
      case "ethereum":
        return "Ethereum";
      default:
        return chainName;
    }
  };

  const truncateWallet = (wallet: string): string => {
    if (wallet.length <= 16) return wallet;
    return `${wallet.slice(0, 8)}...${wallet.slice(-6)}`;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add Wallet</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Wallet</DialogTitle>
          <DialogDescription>
            Enter your wallet address. We will automatically detect the chain and find your accounts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Wallet input */}
          <div>
            <Input
              placeholder="Paste your wallet address"
              value={walletInput}
              onChange={(e) => setWalletInput(e.target.value)}
              disabled={isAdding}
            />
          </div>

          {/* Detection status */}
          {status === "detecting" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Detecting chain...</span>
            </div>
          )}

          {status === "error" && (
            <div className="p-3 rounded-lg border border-destructive/50 bg-destructive/10">
              <p className="text-sm text-destructive">
                {errorMessage || "Invalid wallet address"}
              </p>
            </div>
          )}

          {status === "done" && chain && (
            <div className="p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Wallet</span>
                <span className="text-sm font-mono">
                  {truncateWallet(walletInput)}
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-sm text-muted-foreground">Chain</span>
                <div className="flex items-center gap-1">
                  <Check className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium">
                    {getChainDisplayName(chain)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Info message */}
          {status === "done" && chain && (
            <div className="text-sm text-muted-foreground">
              After adding this wallet, our system will automatically detect protocols
              you have used and create accounts for them. This may include:
              {chain === "solana" && (
                <ul className="mt-2 list-disc list-inside">
                  <li>Drift Protocol (perps, funding, subaccounts)</li>
                </ul>
              )}
              {chain === "ethereum" && (
                <ul className="mt-2 list-disc list-inside">
                  <li>Hyperliquid (perps, subaccounts, vaults)</li>
                  <li>Lighter (requires auth token - set up separately)</li>
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        {status === "done" && chain && (
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <LoadingButton
              size="sm"
              onClick={handleAddWallet}
              loading={isAdding}
            >
              Add Wallet
            </LoadingButton>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
