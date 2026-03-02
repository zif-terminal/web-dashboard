"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Wallet, KeyRound, CheckCircle2, AlertCircle } from "lucide-react";

// ---------------------------------------------------------------------------
// Types for browser wallet providers
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      isMetaMask?: boolean;
    };
    solana?: {
      connect: () => Promise<{ publicKey: { toBase58: () => string } }>;
      signMessage: (
        message: Uint8Array,
        encoding: string,
      ) => Promise<{ signature: Uint8Array }>;
      isPhantom?: boolean;
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(addr: string, start = 8, end = 6): string {
  if (addr.length <= start + end + 3) return addr;
  return `${addr.slice(0, start)}...${addr.slice(-end)}`;
}

function detectChainFromAddress(address: string): string | null {
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return "solana";
  if (/^0x[a-fA-F0-9]{40}$/.test(address)) return "ethereum";
  return null;
}

// Encode Uint8Array as base64
function uint8ToBase64(arr: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < arr.byteLength; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ConnectWalletDialogProps {
  onWalletConnected?: (walletId: string, address: string) => void;
  trigger?: React.ReactNode;
}

type SignStep = "idle" | "connecting" | "connected" | "signing" | "verifying" | "done" | "error";

export function ConnectWalletDialog({ onWalletConnected, trigger }: ConnectWalletDialogProps) {
  const [open, setOpen] = useState(false);

  // Sign-with-wallet tab state
  const [walletAddress, setWalletAddress] = useState("");
  const [walletChain, setWalletChain] = useState<"ethereum" | "solana" | "">("");
  const [signStep, setSignStep] = useState<SignStep>("idle");
  const [signError, setSignError] = useState<string | null>(null);

  // API key tab state
  const [apiAddress, setApiAddress] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiChain, setApiChain] = useState("ethereum");
  const [apiLoading, setApiLoading] = useState(false);

  const resetSignState = () => {
    setWalletAddress("");
    setWalletChain("");
    setSignStep("idle");
    setSignError(null);
  };

  const handleDialogChange = (val: boolean) => {
    setOpen(val);
    if (!val) {
      resetSignState();
      setApiAddress("");
      setApiKey("");
      setApiLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // MetaMask flow
  // ---------------------------------------------------------------------------
  const connectMetaMask = useCallback(async () => {
    if (!window.ethereum) {
      setSignError("MetaMask not detected. Please install the MetaMask extension.");
      setSignStep("error");
      return;
    }
    setSignStep("connecting");
    setSignError(null);
    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      if (!accounts || accounts.length === 0) throw new Error("No accounts returned");
      setWalletAddress(accounts[0].toLowerCase());
      setWalletChain("ethereum");
      setSignStep("connected");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to connect MetaMask";
      setSignError(msg.includes("rejected") ? "Connection rejected by user" : msg);
      setSignStep("error");
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Phantom flow
  // ---------------------------------------------------------------------------
  const connectPhantom = useCallback(async () => {
    if (!window.solana || !window.solana.isPhantom) {
      setSignError("Phantom not detected. Please install the Phantom extension.");
      setSignStep("error");
      return;
    }
    setSignStep("connecting");
    setSignError(null);
    try {
      const { publicKey } = await window.solana.connect();
      setWalletAddress(publicKey.toBase58());
      setWalletChain("solana");
      setSignStep("connected");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to connect Phantom";
      setSignError(msg.includes("rejected") ? "Connection rejected by user" : msg);
      setSignStep("error");
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Sign & Verify
  // ---------------------------------------------------------------------------
  const handleSignAndVerify = useCallback(async () => {
    if (!walletAddress || !walletChain) return;
    setSignStep("signing");
    setSignError(null);

    try {
      // 1. Request challenge from server
      const { nonce, message } = await api.requestWalletChallenge(walletAddress, walletChain);

      // 2. Sign with wallet
      let signature: string;
      if (walletChain === "ethereum") {
        if (!window.ethereum) throw new Error("MetaMask not available");
        // personal_sign returns hex signature
        const sig = (await window.ethereum.request({
          method: "personal_sign",
          params: [message, walletAddress],
        })) as string;
        signature = sig;
      } else {
        // Solana: signMessage returns Uint8Array
        if (!window.solana) throw new Error("Phantom not available");
        const encoded = new TextEncoder().encode(message);
        const { signature: sigBytes } = await window.solana.signMessage(encoded, "utf8");
        signature = uint8ToBase64(sigBytes);
      }

      setSignStep("verifying");

      // 3. Verify with server
      const result = await api.verifyWalletSignature(walletAddress, walletChain, signature, nonce);

      setSignStep("done");
      if (result.message?.includes("already")) {
        toast.info("Wallet already verified — showing in your list");
      } else {
        toast.success("Wallet verified! Ownership confirmed.");
      }
      setTimeout(() => {
        setOpen(false);
        resetSignState();
        onWalletConnected?.(result.wallet_id, result.address);
      }, 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Verification failed";
      setSignError(msg.includes("User rejected") || msg.includes("rejected") ? "Signing rejected by user" : msg);
      setSignStep("error");
    }
  }, [walletAddress, walletChain, onWalletConnected]);

  // ---------------------------------------------------------------------------
  // API Key flow
  // ---------------------------------------------------------------------------
  const handleVerifyAPIKey = useCallback(async () => {
    const addr = apiAddress.trim();
    const key = apiKey.trim();

    if (!addr || !key) {
      toast.error("Please enter both address and API key");
      return;
    }
    const detectedChain = detectChainFromAddress(addr) ?? apiChain;

    setApiLoading(true);
    try {
      const result = await api.verifyWalletAPIKey(addr, detectedChain, key);
      toast.success("API key verified! Wallet connected.");
      setTimeout(() => {
        setOpen(false);
        setApiAddress("");
        setApiKey("");
        setApiLoading(false);
        onWalletConnected?.(result.wallet_id, result.address);
      }, 800);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "API key verification failed";
      toast.error(msg);
      setApiLoading(false);
    }
  }, [apiAddress, apiKey, apiChain, onWalletConnected]);

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const renderSignStatus = () => {
    switch (signStep) {
      case "idle":
        return null;
      case "connecting":
        return (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Connecting to wallet...
          </div>
        );
      case "connected":
        return (
          <div className="rounded-md border border-border bg-muted/50 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Wallet connected
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-xs font-mono bg-background px-2 py-0.5 rounded border">
                {truncate(walletAddress)}
              </code>
              <Badge variant={walletChain === "ethereum" ? "default" : "secondary"} className="text-xs">
                {walletChain === "ethereum" ? "Ethereum" : "Solana"}
              </Badge>
            </div>
          </div>
        );
      case "signing":
        return (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Waiting for signature...
          </div>
        );
      case "verifying":
        return (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Verifying signature...
          </div>
        );
      case "done":
        return (
          <div className="flex items-center gap-2 text-sm text-green-600 font-medium">
            <CheckCircle2 className="h-4 w-4" />
            Wallet verified!
          </div>
        );
      case "error":
        return (
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{signError || "Something went wrong"}</span>
          </div>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <Wallet className="h-4 w-4 mr-2" />
            Connect Wallet
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Wallet</DialogTitle>
          <DialogDescription>
            Prove ownership of a wallet address to add it to your account.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="signature" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signature">
              <Wallet className="h-3.5 w-3.5 mr-1.5" />
              Sign with Wallet
            </TabsTrigger>
            <TabsTrigger value="apikey">
              <KeyRound className="h-3.5 w-3.5 mr-1.5" />
              API Key
            </TabsTrigger>
          </TabsList>

          {/* ----------------------------------------------------------------
              Tab 1: Signature-based (MetaMask / Phantom)
          ---------------------------------------------------------------- */}
          <TabsContent value="signature" className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              Connect your Ethereum (MetaMask) or Solana (Phantom) wallet and sign a one-time
              message to prove ownership.
            </p>

            {/* Wallet connect buttons — only show when no wallet connected yet */}
            {(signStep === "idle" || signStep === "error") && (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={connectMetaMask}
                  className="flex items-center gap-2"
                >
                  {/* MetaMask fox icon (inline SVG) */}
                  <svg width="16" height="16" viewBox="0 0 256 240" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M250 0L144 80.5L163 35.7L250 0Z" fill="#E17726"/>
                    <path d="M6 0L111.2 81.2L93.4 35.7L6 0Z" fill="#E27625"/>
                    <path d="M213.3 173.8L184.4 219.4L244.2 236.4L261.6 174.8L213.3 173.8Z" fill="#E27625"/>
                    <path d="M0 174.8L17.3 236.4L77.1 219.4L48.2 173.8L0 174.8Z" fill="#E27625"/>
                  </svg>
                  Connect MetaMask
                </Button>
                <Button
                  variant="outline"
                  onClick={connectPhantom}
                  className="flex items-center gap-2"
                >
                  {/* Phantom ghost icon */}
                  <svg width="16" height="16" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="128" height="128" rx="64" fill="#AB9FF2"/>
                    <path d="M110.5 64C110.5 40.3 91.2 21 67.5 21C43.4 21 23.9 40.9 24.1 65C24.2 78.4 30.4 90.4 40.1 98.1C41.5 99.2 43.4 98.4 43.4 96.6V91.2C43.4 89.9 44.3 88.7 45.6 88.5C55.9 86.7 62.1 78.5 62.1 69.3C62.1 59.8 55.4 51.4 44.9 49.7C43.2 49.4 41.8 48 41.8 46.3C41.8 44.3 43.4 42.7 45.4 43C60.5 45 72.1 57.4 72.1 72.5C72.1 85.8 63.5 97 51.1 101C49.8 101.4 49 102.7 49.3 104C49.6 105.3 50.9 106.1 52.2 105.9C57 105.1 61.5 103.5 65.5 101.3C80.5 93.5 90.5 77.7 90.5 60C90.5 58.6 90.4 57.3 90.3 56H90.6C93 56 95.4 56.7 97.4 58L97.9 58.3C100.5 60 102.5 62.5 103.4 65.4C104.8 70.2 102.8 75.3 99.3 77.2C97.8 78 97 79.7 97.4 81.3C97.8 82.9 99.2 84 100.8 84C101.1 84 101.4 84 101.7 83.9C108.5 81.9 112.7 75 112.7 67.4C112.7 66.3 112.6 65.2 112.4 64.1C111.8 64 111.1 64 110.5 64Z" fill="white"/>
                  </svg>
                  Connect Phantom
                </Button>
              </div>
            )}

            {/* Status display */}
            {renderSignStatus()}

            {/* Sign & Verify button — show when wallet is connected */}
            {(signStep === "connected" || signStep === "error") && walletAddress && (
              <div className="space-y-2">
                {signStep === "error" && walletAddress && (
                  <p className="text-xs text-muted-foreground">
                    Connected: {truncate(walletAddress)} ({walletChain})
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    onClick={handleSignAndVerify}
                    className="flex-1"
                    disabled={!walletAddress}
                  >
                    Sign & Verify
                  </Button>
                  <Button variant="outline" onClick={resetSignState} size="sm">
                    Reset
                  </Button>
                </div>
              </div>
            )}

            {signStep === "connected" && (
              <p className="text-xs text-muted-foreground">
                Click Sign &amp; Verify — your wallet will prompt you to sign a one-time
                message. No transaction, no gas.
              </p>
            )}
          </TabsContent>

          {/* ----------------------------------------------------------------
              Tab 2: API Key (Lighter exchange)
          ---------------------------------------------------------------- */}
          <TabsContent value="apikey" className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              For Lighter exchange: enter your L1 wallet address and a read-only API token.
              The token is validated against the Lighter API.
            </p>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="api-address">Wallet Address</Label>
                <Input
                  id="api-address"
                  placeholder="0x..."
                  value={apiAddress}
                  onChange={(e) => setApiAddress(e.target.value)}
                  disabled={apiLoading}
                  className="font-mono text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="api-key">API Key / Token</Label>
                <Input
                  id="api-key"
                  placeholder="ro:0:all:1234567890:abcdef..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  disabled={apiLoading}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Read-only API keys start with <code className="text-xs">ro:</code>
                </p>
              </div>

              <Button
                onClick={handleVerifyAPIKey}
                disabled={apiLoading || !apiAddress.trim() || !apiKey.trim()}
                className="w-full"
              >
                {apiLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify & Connect"
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
