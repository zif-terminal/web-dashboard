"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Trade } from "@/lib/queries";
import { TradesTable } from "@/components/trades-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PAGE_SIZE = 100;

export default function TradesPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTrades = async (pageNum: number) => {
    setIsLoading(true);
    try {
      const data = await api.getTrades(PAGE_SIZE, pageNum * PAGE_SIZE);
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
    fetchTrades(page);
  }, [page]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Trade History</h1>
        <p className="text-muted-foreground">
          View all trades across your exchange accounts
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>All Trades</CardTitle>
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
