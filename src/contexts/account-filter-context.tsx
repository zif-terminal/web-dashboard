"use client";

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { ExchangeAccount } from "@/lib/queries";

interface AccountFilterState {
  accounts: ExchangeAccount[];
  selectedAccountIds: string[];
  isLoadingAccounts: boolean;
  setSelectedAccountIds: (ids: string[]) => void;
  refreshAccounts: () => void;
}

const AccountFilterContext = createContext<AccountFilterState | undefined>(undefined);

export function AccountFilterProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);
  const [selectedAccountIds, setSelectedAccountIdsState] = useState<string[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const pathname = usePathname();

  const fetchAccounts = useCallback(async () => {
    if (pathname === "/login" || pathname === "/signup") return;
    setIsLoadingAccounts(true);
    try {
      const data = await api.getAccounts();
      setAccounts(data);
      setHasFetched(true);
    } catch (error) {
      console.error("Failed to fetch accounts:", error);
    } finally {
      setIsLoadingAccounts(false);
    }
  }, [pathname]);

  useEffect(() => {
    if (pathname !== "/login" && pathname !== "/signup" && !hasFetched) {
      fetchAccounts();
    }
  }, [pathname, hasFetched, fetchAccounts]);

  const setSelectedAccountIds = useCallback((ids: string[]) => {
    setSelectedAccountIdsState(ids);
  }, []);

  const refreshAccounts = useCallback(() => {
    setHasFetched(false);
  }, []);

  return (
    <AccountFilterContext.Provider
      value={{
        accounts,
        selectedAccountIds,
        isLoadingAccounts,
        setSelectedAccountIds,
        refreshAccounts,
      }}
    >
      {children}
    </AccountFilterContext.Provider>
  );
}

export function useAccountFilter() {
  const context = useContext(AccountFilterContext);
  if (context === undefined) {
    throw new Error("useAccountFilter must be used within an AccountFilterProvider");
  }
  return context;
}
