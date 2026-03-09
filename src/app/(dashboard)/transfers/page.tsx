"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api, DataFilters } from "@/lib/api";
import { Transfer, ExchangeAccount } from "@/lib/queries";
import { TransfersTable } from "@/components/transfers-table";
import { SyncButton } from "@/components/sync-button";
import { PageHeader } from "@/components/page-header";
import { FilterBar } from "@/components/filter-bar";
import { AccountFilter } from "@/components/account-filter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateRangeFilter, DateRangeValue, getTimestampsFromDateRange } from "@/components/date-range-filter";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useApi } from "@/hooks/use-api";
import { useFilters } from "@/contexts/filters-context";

const PAGE_SIZE = 100;

type TransferTypeFilter = "all" | "deposits" | "interest";

export default function TransfersPage() {
  const { withErrorReporting } = useApi();
  const { globalTags } = useFilters();

  const [transferType, setTransferType] = useState<TransferTypeFilter>("all");
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [dateRange, setDateRange] = useState<DateRangeValue>({ preset: "all" });
  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");

  const pageRef = useRef(page);
  const dateRangeRef = useRef(dateRange);
  const globalTagsRef = useRef(globalTags);
  const transferTypeRef = useRef(transferType);
  const selectedAccountIdRef = useRef(selectedAccountId);

  useEffect(() => {
    pageRef.current = page;
    dateRangeRef.current = dateRange;
    globalTagsRef.current = globalTags;
    transferTypeRef.current = transferType;
    selectedAccountIdRef.current = selectedAccountId;
  }, [page, dateRange, globalTags, transferType, selectedAccountId]);

  useEffect(() => {
    api.getAccounts().then(setAccounts).catch(console.error);
  }, []);

  const handleAccountChange = useCallback((id: string) => {
    setSelectedAccountId(id);
    setPage(0);
  }, []);

  const buildFilters = useCallback(
    (dateRangeValue: DateRangeValue, tags: string[], accountId: string): DataFilters => {
      const { since, until } = getTimestampsFromDateRange(dateRangeValue);
      return {
        since, until,
        tags: tags.length > 0 ? tags : undefined,
        accountId: accountId === "all" ? undefined : accountId,
      };
    },
    []
  );

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    const filters = buildFilters(dateRangeRef.current, globalTagsRef.current, selectedAccountIdRef.current);
    const offset = pageRef.current * PAGE_SIZE;

    try {
      const data = await withErrorReporting(() => api.getTransfers(PAGE_SIZE, offset, filters));
      // Client-side filter by transfer type if needed
      const type = transferTypeRef.current;
      if (type === "deposits") {
        const filtered = data.transfers.filter((t) => t.type === "deposit" || t.type === "withdraw");
        setTransfers(filtered);
        setTotalCount(data.totalCount); // Note: server count may differ from client filter; for precise counts, server-side filtering would be needed
      } else if (type === "interest") {
        const filtered = data.transfers.filter((t) => t.type === "interest");
        setTransfers(filtered);
        setTotalCount(data.totalCount);
      } else {
        setTransfers(data.transfers);
        setTotalCount(data.totalCount);
      }
    } catch (error) {
      console.error("Failed to fetch transfers:", error);
    } finally {
      setIsLoading(false);
    }
  }, [withErrorReporting, buildFilters]);

  const { lastRefreshTime, refresh } = useAutoRefresh(fetchData, { interval: 30000 });

  useEffect(() => { refresh(); }, []);
  useEffect(() => { setPage(0); refresh(); }, [transferType, dateRange, globalTags, selectedAccountId]);
  useEffect(() => { refresh(); }, [page]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transfers"
        description="View deposits, withdrawals, interest, and other transfers across your accounts"
        action={
          <SyncButton
            lastRefreshTime={lastRefreshTime}
            onRefresh={refresh}
            isLoading={isLoading}
          />
        }
      />

      <Card>
        <CardHeader className="space-y-3 px-3 md:px-6">
          <CardTitle className="text-base md:text-lg">
            {selectedAccountId === "all" ? "All Transfers" : "Filtered Transfers"}
          </CardTitle>
          <FilterBar
            compact={
              <>
                <AccountFilter
                  accounts={accounts}
                  selectedAccountId={selectedAccountId}
                  onAccountChange={handleAccountChange}
                />
                <Select value={transferType} onValueChange={(v) => setTransferType(v as TransferTypeFilter)}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="deposits">Deposits &amp; Withdrawals</SelectItem>
                    <SelectItem value="interest">Interest</SelectItem>
                  </SelectContent>
                </Select>
              </>
            }
          >
            <DateRangeFilter value={dateRange} onChange={(r) => { setDateRange(r); setPage(0); }} />
          </FilterBar>
        </CardHeader>
        <CardContent className="px-2 md:px-6">
          <TransfersTable
            rows={transfers}
            totalCount={totalCount}
            page={page}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>
    </div>
  );
}
