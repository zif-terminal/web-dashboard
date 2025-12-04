"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Trade } from "@/lib/queries";
import { TradesTable } from "@/components/trades-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

const PAGE_SIZE = 100;

// Demo data for UI preview when no trades exist
const DEMO_TRADES: Trade[] = [
  {
    id: "demo-1",
    base_asset: "ETH",
    quote_asset: "USDC",
    side: "buy",
    price: "3245.50",
    quantity: "2.5",
    timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    fee: "0.00125",
    order_id: "ord-abc123def456",
    trade_id: "trd-001",
    exchange_account_id: "demo-account-1",
    created_at: new Date().toISOString(),
    exchange_account: {
      id: "demo-account-1",
      account_identifier: "0x1234...abcd",
      account_type: "main",
      exchange_id: "hyperliquid",
      exchange: { id: "hyperliquid", name: "hyperliquid", display_name: "Hyperliquid" },
    },
  },
  {
    id: "demo-2",
    base_asset: "BTC",
    quote_asset: "USDC",
    side: "sell",
    price: "97250.00",
    quantity: "0.15",
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    fee: "0.000075",
    order_id: "ord-xyz789ghi012",
    trade_id: "trd-002",
    exchange_account_id: "demo-account-1",
    created_at: new Date().toISOString(),
    exchange_account: {
      id: "demo-account-1",
      account_identifier: "0x1234...abcd",
      account_type: "main",
      exchange_id: "hyperliquid",
      exchange: { id: "hyperliquid", name: "hyperliquid", display_name: "Hyperliquid" },
    },
  },
  {
    id: "demo-3",
    base_asset: "SOL",
    quote_asset: "USDC",
    side: "buy",
    price: "185.25",
    quantity: "50",
    timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    fee: "0.025",
    order_id: "ord-mno345pqr678",
    trade_id: "trd-003",
    exchange_account_id: "demo-account-2",
    created_at: new Date().toISOString(),
    exchange_account: {
      id: "demo-account-2",
      account_identifier: "HN4x...7Kpq",
      account_type: "main",
      exchange_id: "drift",
      exchange: { id: "drift", name: "drift", display_name: "Drift" },
    },
  },
  {
    id: "demo-4",
    base_asset: "ARB",
    quote_asset: "USDC",
    side: "buy",
    price: "1.05",
    quantity: "1000",
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    fee: "0.525",
    order_id: "ord-stu901vwx234",
    trade_id: "trd-004",
    exchange_account_id: "demo-account-3",
    created_at: new Date().toISOString(),
    exchange_account: {
      id: "demo-account-3",
      account_identifier: "0x5678...efgh",
      account_type: "main",
      exchange_id: "lighter",
      exchange: { id: "lighter", name: "lighter", display_name: "Lighter" },
    },
  },
  {
    id: "demo-5",
    base_asset: "ETH",
    quote_asset: "USDC",
    side: "sell",
    price: "3260.75",
    quantity: "1.25",
    timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    fee: "0.000625",
    order_id: "ord-yza567bcd890",
    trade_id: "trd-005",
    exchange_account_id: "demo-account-1",
    created_at: new Date().toISOString(),
    exchange_account: {
      id: "demo-account-1",
      account_identifier: "0x1234...abcd",
      account_type: "main",
      exchange_id: "hyperliquid",
      exchange: { id: "hyperliquid", name: "hyperliquid", display_name: "Hyperliquid" },
    },
  },
];

export default function TradesPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [usingDemo, setUsingDemo] = useState(false);

  const fetchTrades = async (pageNum: number) => {
    setIsLoading(true);
    try {
      const data = await api.getTrades(PAGE_SIZE, pageNum * PAGE_SIZE);
      if (data.trades.length === 0 && pageNum === 0) {
        // No trades in DB, show demo data
        setTrades(DEMO_TRADES);
        setTotalCount(DEMO_TRADES.length);
        setUsingDemo(true);
      } else {
        setTrades(data.trades);
        setTotalCount(data.totalCount);
        setUsingDemo(false);
      }
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
      {usingDemo && (
        <Alert>
          <AlertDescription>
            Showing demo data. Real trades will appear here once they are recorded.
          </AlertDescription>
        </Alert>
      )}
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
