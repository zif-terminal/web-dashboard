"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Exchange, ExchangeAccountType } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
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

const accountSchema = z.object({
  exchange_id: z.string().min(1, "Exchange is required"),
  account_identifier: z.string().min(1, "Account identifier is required"),
  account_type: z.string().min(1, "Account type is required"),
});

type AccountFormValues = z.infer<typeof accountSchema>;

interface AddAccountDialogProps {
  onSuccess?: () => void;
}

export function AddAccountDialog({ onSuccess }: AddAccountDialogProps) {
  const [open, setOpen] = useState(false);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [accountTypes, setAccountTypes] = useState<ExchangeAccountType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingExchanges, setIsLoadingExchanges] = useState(false);
  const [isLoadingAccountTypes, setIsLoadingAccountTypes] = useState(false);

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      exchange_id: "",
      account_identifier: "",
      account_type: "",
    },
  });

  useEffect(() => {
    if (open) {
      fetchExchanges();
      fetchAccountTypes();
    }
  }, [open]);

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

  const fetchAccountTypes = async () => {
    setIsLoadingAccountTypes(true);
    try {
      const data = await api.getAccountTypes();
      setAccountTypes(data);
    } catch (error) {
      toast.error("Failed to fetch account types");
      console.error(error);
    } finally {
      setIsLoadingAccountTypes(false);
    }
  };

  // Helper to format account type code for display
  const formatAccountTypeLabel = (code: string): string => {
    return code
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  function getErrorMessage(error: unknown): string {
    if (error && typeof error === "object" && "response" in error) {
      const response = error as {
        response?: { errors?: { extensions?: { code?: string } }[] };
      };
      const code = response.response?.errors?.[0]?.extensions?.code;

      if (code === "constraint-violation") {
        return "This account already exists for this exchange";
      }
    }
    return "Failed to add account";
  }

  async function onSubmit(data: AccountFormValues) {
    setIsLoading(true);
    try {
      await api.createAccount({
        exchange_id: data.exchange_id,
        account_identifier: data.account_identifier,
        account_type: data.account_type,
        account_type_metadata: {},
      });
      toast.success("Account added successfully");
      form.reset();
      setOpen(false);
      onSuccess?.();
    } catch (error) {
      toast.error(getErrorMessage(error));
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add Account</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Exchange Account</DialogTitle>
          <DialogDescription>
            Connect a new exchange account to track your positions and trades.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
              name="account_identifier"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account Identifier</FormLabel>
                  <FormControl>
                    <Input placeholder="0x..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="account_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account Type</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select account type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {isLoadingAccountTypes ? (
                        <div className="flex items-center justify-center py-2">
                          <Spinner size="sm" />
                        </div>
                      ) : (
                        accountTypes.map((type) => (
                          <SelectItem key={type.code} value={type.code}>
                            {formatAccountTypeLabel(type.code)}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
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
              <LoadingButton type="submit" loading={isLoading}>
                Add Account
              </LoadingButton>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
