"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Trade, ExchangeAccount } from "@/lib/queries";
import { TradesTable } from "@/components/trades-table";
import { SyncButton } from "@/components/sync-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PAGE_SIZE = 100;

export default function TradesPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);

  const fetchAccounts = async () => {
    try {
      const data = await api.getAccounts();
      setAccounts(data);
    } catch (error) {
      console.error("Failed to fetch accounts:", error);
    }
  };

  const fetchTrades = useCallback(async (pageNum: number, accountId: string) => {
    setIsLoading(true);
    try {
      const data = accountId === "all"
        ? await api.getTrades(PAGE_SIZE, pageNum * PAGE_SIZE)
        : await api.getTradesByAccount(accountId, PAGE_SIZE, pageNum * PAGE_SIZE);

      setTrades(data.trades);
      setTotalCount(data.totalCount);
      setLastRefreshTime(new Date());
    } catch (error) {
      toast.error("Failed to fetch trades");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    fetchTrades(page, selectedAccountId);
  }, [page, selectedAccountId, fetchTrades]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handleAccountChange = (accountId: string) => {
    setSelectedAccountId(accountId);
    setPage(0);
  };

  const handleRefresh = () => {
    fetchTrades(page, selectedAccountId);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div>
          <h1 className="text-3xl font-bold">Trade History</h1>
          <p className="text-muted-foreground">
            View all trades across your exchange accounts
          </p>
        </div>
        <SyncButton
          lastRefreshTime={lastRefreshTime}
          onRefresh={handleRefresh}
          isLoading={isLoading}
        />
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>
            {selectedAccountId === "all" ? "All Trades" : "Filtered Trades"}
          </CardTitle>
          <Select value={selectedAccountId} onValueChange={handleAccountChange}>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Filter by account" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Accounts</SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.exchange?.display_name || "Unknown"} - {account.account_identifier.slice(0, 10)}...
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <TradesTable
            trades={trades}
            totalCount={totalCount}
            page={page}
            pageSize={PAGE_SIZE}
            onPageChange={handlePageChange}
            showAccount={true}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>
    </div>
  );
}
