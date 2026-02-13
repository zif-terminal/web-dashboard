"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Loader2, Search } from "lucide-react";

interface WalletSearchProps {
  onWalletAdded?: (walletId: string) => void;
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

function getChainDisplayName(chainName: string): string {
  switch (chainName) {
    case "solana":
      return "Solana";
    case "ethereum":
      return "Ethereum";
    default:
      return chainName;
  }
}

export function WalletSearch({ onWalletAdded }: WalletSearchProps) {
  const [walletInput, setWalletInput] = useState("");
  const [status, setStatus] = useState<DetectionStatus>("idle");
  const [chain, setChain] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

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
      setErrorMessage(null);
    }
  }, [walletInput]);

  const handleAddWallet = async () => {
    if (!chain || !walletInput.trim()) {
      toast.error("Please enter a valid wallet address");
      return;
    }

    setIsAdding(true);

    try {
      const wallet = await api.createWallet({
        address: walletInput.trim(),
        chain,
      });

      toast.success("Wallet added! Detecting accounts...");
      setWalletInput("");
      setStatus("idle");
      setChain(null);
      onWalletAdded?.(wallet.id);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to add wallet"
      );
    } finally {
      setIsAdding(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && status === "done" && chain) {
      handleAddWallet();
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Enter wallet address..."
            value={walletInput}
            onChange={(e) => setWalletInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isAdding}
            className="pl-9"
          />
        </div>
        <Button
          onClick={handleAddWallet}
          disabled={status !== "done" || !chain || isAdding}
        >
          {isAdding ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Adding...
            </>
          ) : (
            "Add Wallet"
          )}
        </Button>
      </div>

      {/* Detection status indicator */}
      {status === "detecting" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground px-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Detecting chain...</span>
        </div>
      )}

      {status === "error" && (
        <div className="text-sm text-destructive px-1">
          {errorMessage || "Invalid wallet address"}
        </div>
      )}

      {status === "done" && chain && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground px-1">
          <Check className="h-3 w-3 text-green-500" />
          <span>{getChainDisplayName(chain)} detected</span>
        </div>
      )}
    </div>
  );
}
