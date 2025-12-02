"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Trade, ExchangeAccount } from "@/lib/queries";
import { TradesTable } from "@/components/trades-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 100;

interface AccountTradesPageProps {
  params: Promise<{ id: string }>;
}

export default function AccountTradesPage({ params }: AccountTradesPageProps) {
  const { id } = use(params);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [account, setAccount] = useState<ExchangeAccount | null>(null);

  const fetchAccount = async () => {
    try {
      const data = await api.getAccountById(id);
      setAccount(data);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchTrades = async (pageNum: number) => {
    setIsLoading(true);
    try {
      const data = await api.getTradesByAccount(id, PAGE_SIZE, pageNum * PAGE_SIZE);
      setTrades(data.trades);
      setTotalCount(data.totalCount);
    } catch (error) {
      toast.error("Failed to fetch trades");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAccount();
  }, [id]);

  useEffect(() => {
    fetchTrades(page);
  }, [id, page]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const accountTitle = account
    ? `${account.exchange?.display_name || "Unknown"} - ${account.account_identifier.slice(0, 10)}...`
    : "Account";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" asChild>
          <Link href={`/accounts/${id}`}>Back</Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Trade History</h1>
          <p className="text-muted-foreground">{accountTitle}</p>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Trades</CardTitle>
        </CardHeader>
        <CardContent>
          <TradesTable
            trades={trades}
            totalCount={totalCount}
            page={page}
            pageSize={PAGE_SIZE}
            onPageChange={handlePageChange}
            showAccount={false}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>
    </div>
  );
}
