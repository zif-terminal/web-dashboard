"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  discoverAccounts,
  DiscoverableAccount,
  getWalletInputPlaceholder,
  getWalletInputHelp,
} from "@/lib/api/exchanges";
import { Exchange } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Step 1: Select exchange and enter wallet
const walletSchema = z.object({
  exchange_id: z.string().min(1, "Exchange is required"),
  wallet_address: z.string().min(1, "Wallet address is required"),
});

type WalletFormValues = z.infer<typeof walletSchema>;

interface AddAccountDialogProps {
  onSuccess?: () => void;
}

type DialogStep = "wallet" | "select-accounts" | "adding";

export function AddAccountDialog({ onSuccess }: AddAccountDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<DialogStep>("wallet");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [isLoadingExchanges, setIsLoadingExchanges] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isAddingAccounts, setIsAddingAccounts] = useState(false);
  const [discoveredAccounts, setDiscoveredAccounts] = useState<
    DiscoverableAccount[]
  >([]);
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(
    new Set()
  );
  const [selectedExchange, setSelectedExchange] = useState<Exchange | null>(
    null
  );

  const form = useForm<WalletFormValues>({
    resolver: zodResolver(walletSchema),
    defaultValues: {
      exchange_id: "",
      wallet_address: "",
    },
  });

  const watchExchangeId = form.watch("exchange_id");

  useEffect(() => {
    if (open) {
      fetchExchanges();
    }
  }, [open]);

  // Update selected exchange when exchange_id changes
  useEffect(() => {
    const exchange = exchanges.find((e) => e.id === watchExchangeId);
    setSelectedExchange(exchange || null);
  }, [watchExchangeId, exchanges]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setStep("wallet");
      setDiscoveredAccounts([]);
      setSelectedAccounts(new Set());
      setSelectedExchange(null);
      form.reset();
    }
  }, [open, form]);

  const fetchExchanges = async () => {
    setIsLoadingExchanges(true);
    try {
      const data = await api.getExchanges();
      setExchanges(data);
    } catch (error) {
      toast.error("Failed to fetch exchanges");
      console.error(error);
    } finally {
      setIsLoadingExchanges(false);
    }
  };

  const handleDiscoverAccounts = async (data: WalletFormValues) => {
    setIsDiscovering(true);
    try {
      const exchange = exchanges.find((e) => e.id === data.exchange_id);
      if (!exchange) {
        throw new Error("Exchange not found");
      }

      const accounts = await discoverAccounts(
        exchange.name,
        data.wallet_address
      );

      if (accounts.length === 0) {
        toast.error("No accounts found for this wallet address");
        return;
      }

      setDiscoveredAccounts(accounts);
      // Pre-select all accounts by default
      setSelectedAccounts(new Set(accounts.map((a) => a.account_identifier)));
      setStep("select-accounts");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to discover accounts"
      );
      console.error(error);
    } finally {
      setIsDiscovering(false);
    }
  };

  const toggleAccountSelection = (accountIdentifier: string) => {
    const newSelected = new Set(selectedAccounts);
    if (newSelected.has(accountIdentifier)) {
      newSelected.delete(accountIdentifier);
    } else {
      newSelected.add(accountIdentifier);
    }
    setSelectedAccounts(newSelected);
  };

  const handleAddSelectedAccounts = async () => {
    if (selectedAccounts.size === 0) {
      toast.error("Please select at least one account");
      return;
    }

    setStep("adding");
    setIsAddingAccounts(true);

    const accountsToAdd = discoveredAccounts.filter((a) =>
      selectedAccounts.has(a.account_identifier)
    );

    let successCount = 0;
    let errorCount = 0;

    for (const account of accountsToAdd) {
      try {
        await api.createAccount({
          exchange_id: form.getValues("exchange_id"),
          account_identifier: account.account_identifier,
          account_type: account.account_type,
          account_type_metadata: account.metadata,
        });
        successCount++;
      } catch (error) {
        errorCount++;
        console.error(
          `Failed to add account ${account.account_identifier}:`,
          error
        );
      }
    }

    setIsAddingAccounts(false);

    if (successCount > 0) {
      toast.success(
        `Successfully added ${successCount} account${successCount > 1 ? "s" : ""}`
      );
      setOpen(false);
      onSuccess?.();
    }

    if (errorCount > 0) {
      toast.error(
        `Failed to add ${errorCount} account${errorCount > 1 ? "s" : ""} (may already exist)`
      );
    }
  };

  const getAccountTypeBadgeVariant = (
    type: string
  ): "default" | "secondary" | "outline" => {
    switch (type) {
      case "main":
        return "default";
      case "sub_account":
        return "secondary";
      case "vault":
        return "outline";
      default:
        return "default";
    }
  };

  const formatAccountType = (type: string): string => {
    switch (type) {
      case "main":
        return "Main";
      case "sub_account":
        return "Subaccount";
      case "vault":
        return "Vault";
      default:
        return type;
    }
  };

  const truncateIdentifier = (id: string): string => {
    if (id.length <= 16) return id;
    return `${id.slice(0, 8)}...${id.slice(-6)}`;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add Account</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        {step === "wallet" && (
          <>
            <DialogHeader>
              <DialogTitle>Add Exchange Account</DialogTitle>
              <DialogDescription>
                Enter your wallet address to discover accounts to sync.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(handleDiscoverAccounts)}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="exchange_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Exchange</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select an exchange" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {isLoadingExchanges ? (
                            <div className="flex items-center justify-center py-2">
                              <Spinner size="sm" />
                            </div>
                          ) : (
                            exchanges.map((exchange) => (
                              <SelectItem key={exchange.id} value={exchange.id}>
                                {exchange.display_name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="wallet_address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Wallet Address</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={
                            selectedExchange
                              ? getWalletInputPlaceholder(selectedExchange.name)
                              : "Select an exchange first"
                          }
                          {...field}
                        />
                      </FormControl>
                      {selectedExchange && (
                        <FormDescription>
                          {getWalletInputHelp(selectedExchange.name)}
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </Button>
                  <LoadingButton type="submit" loading={isDiscovering}>
                    Discover Accounts
                  </LoadingButton>
                </div>
              </form>
            </Form>
          </>
        )}

        {step === "select-accounts" && (
          <>
            <DialogHeader>
              <DialogTitle>Select Accounts to Sync</DialogTitle>
              <DialogDescription>
                {discoveredAccounts.length} account
                {discoveredAccounts.length !== 1 ? "s" : ""} found. Select which
                ones to add.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {discoveredAccounts.map((account) => (
                <div
                  key={account.account_identifier}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedAccounts.has(account.account_identifier)
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                  onClick={() =>
                    toggleAccountSelection(account.account_identifier)
                  }
                >
                  <input
                    type="checkbox"
                    checked={selectedAccounts.has(account.account_identifier)}
                    onChange={() =>
                      toggleAccountSelection(account.account_identifier)
                    }
                    className="h-4 w-4 rounded border-gray-300"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">
                        {account.name}
                      </span>
                      <Badge
                        variant={getAccountTypeBadgeVariant(
                          account.account_type
                        )}
                      >
                        {formatAccountType(account.account_type)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground font-mono truncate">
                      {truncateIdentifier(account.account_identifier)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setStep("wallet")}
              >
                Back
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddSelectedAccounts}
                  disabled={selectedAccounts.size === 0}
                >
                  Add {selectedAccounts.size} Account
                  {selectedAccounts.size !== 1 ? "s" : ""}
                </Button>
              </div>
            </div>
          </>
        )}

        {step === "adding" && (
          <>
            <DialogHeader>
              <DialogTitle>Adding Accounts</DialogTitle>
              <DialogDescription>
                Please wait while we add your selected accounts...
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-center py-8">
              <Spinner size="lg" />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
