"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import { Exchange, Wallet } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Exchanges that support manual upload (no sync API). */
const MANUAL_UPLOAD_EXCHANGES = ["variational"];

interface Props {
  onAccountCreated?: () => void;
}

export function CreateManualAccountDialog({ onAccountCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [wallets, setWallets] = useState<{ id: string; label: string }[]>([]);
  const [selectedExchangeId, setSelectedExchangeId] = useState<string>("");
  const [label, setLabel] = useState("");
  const [selectedWalletId, setSelectedWalletId] = useState<string>("");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Reset form state
    setSelectedExchangeId("");
    setLabel("");
    setSelectedWalletId("");

    // Fetch exchanges (filter to manual-upload types)
    api.getExchanges().then((data) => {
      const manual = data.filter((e) => MANUAL_UPLOAD_EXCHANGES.includes(e.name));
      setExchanges(manual);
      if (manual.length === 1) {
        setSelectedExchangeId(manual[0].id);
      }
    });

    // Fetch wallets for assignment dropdown
    api.getWalletsWithCounts().then((data) => {
      setWallets(
        data.map((w) => ({
          id: w.id,
          label: w.label || `${w.chain}:${w.address.slice(0, 8)}...`,
        }))
      );
    });
  }, [open]);

  const handleCreate = async () => {
    if (!selectedExchangeId) {
      toast.error("Select an exchange");
      return;
    }
    if (!selectedWalletId) {
      toast.error("Select a wallet to link this account to");
      return;
    }

    setIsCreating(true);
    try {
      const accountIdentifier = `manual-${Date.now()}`;
      await api.createAccount({
        exchange_id: selectedExchangeId,
        account_identifier: accountIdentifier,
        account_type: "main",
        wallet_id: selectedWalletId,
        label: label.trim() || undefined,
      });
      toast.success("Account created successfully");
      setOpen(false);
      onAccountCreated?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create account";
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Create Account
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Manual Account</DialogTitle>
          <DialogDescription>
            Create an account for exchanges that use manual CSV upload instead of
            API sync.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Exchange dropdown */}
          <div className="space-y-2">
            <Label htmlFor="create-exchange">Exchange</Label>
            <Select
              value={selectedExchangeId}
              onValueChange={setSelectedExchangeId}
            >
              <SelectTrigger id="create-exchange" className="w-full">
                <SelectValue placeholder="Select an exchange" />
              </SelectTrigger>
              <SelectContent>
                {exchanges.map((ex) => (
                  <SelectItem key={ex.id} value={ex.id}>
                    {ex.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Account label */}
          <div className="space-y-2">
            <Label htmlFor="create-label">Label (optional)</Label>
            <Input
              id="create-label"
              placeholder='e.g. "Main", "Trading"'
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          {/* Wallet assignment */}
          <div className="space-y-2">
            <Label htmlFor="create-wallet">Wallet</Label>
            <p className="text-xs text-muted-foreground">
              Link this account to an existing wallet.
            </p>
            {wallets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No wallets found. Add a wallet first before creating a manual
                account.
              </p>
            ) : (
              <Select
                value={selectedWalletId}
                onValueChange={setSelectedWalletId}
              >
                <SelectTrigger id="create-wallet" className="w-full">
                  <SelectValue placeholder="Select a wallet" />
                </SelectTrigger>
                <SelectContent>
                  {wallets.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Submit */}
          <Button
            onClick={handleCreate}
            disabled={isCreating || !selectedExchangeId || !selectedWalletId}
            className="w-full"
          >
            {isCreating ? "Creating..." : "Create Account"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
