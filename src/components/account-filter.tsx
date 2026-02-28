"use client";

import { ExchangeAccount } from "@/lib/queries";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AccountFilterProps {
  accounts: ExchangeAccount[];
  selectedAccountId: string;
  onAccountChange: (accountId: string) => void;
  className?: string;
}

export function AccountFilter({
  accounts,
  selectedAccountId,
  onAccountChange,
  className = "w-full sm:w-[200px]",
}: AccountFilterProps) {
  return (
    <Select value={selectedAccountId} onValueChange={onAccountChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder="Filter by account" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Accounts</SelectItem>
        {accounts.map((account) => (
          <SelectItem key={account.id} value={account.id}>
            {account.wallet?.label
              ? `${account.wallet.label} - ${account.exchange?.display_name || "Unknown"}`
              : `${account.exchange?.display_name || "Unknown"} - ${account.account_identifier.slice(0, 10)}...`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
