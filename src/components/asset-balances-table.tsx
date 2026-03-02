"use client";

import { useState } from "react";
import { AssetBalance } from "@/lib/queries";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExchangeBadge } from "@/components/exchange-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface AssetBalancesTableProps {
  balances: AssetBalance[];
  isLoading?: boolean;
}

function formatNumber(value: number, decimals: number = 4): string {
  if (isNaN(value)) return "0";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function formatUsd(value: number): string {
  if (isNaN(value) || value === 0) return "$0.00";
  return "$" + value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPrice(value: number): string {
  if (isNaN(value) || value === 0) return "-";
  // Use more decimal places for very small prices
  const decimals = value < 0.01 ? 6 : value < 1 ? 4 : 2;
  return "$" + value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  });
}

function truncateAddress(address: string, start = 6, end = 4): string {
  if (address.length <= start + end + 3) return address;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

function AssetBalancesTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Asset</TableHead>
          <TableHead className="text-right">Total Balance</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right">Value (USD)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-16" /></TableCell>
            <TableCell className="text-right"><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
            <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
            <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ExchangeBreakdownRow({
  exchange,
}: {
  exchange: { exchangeName: string; walletAddress: string; balance: number; valueUsd: number };
}) {
  return (
    <TableRow className="bg-muted/30 hover:bg-muted/50">
      <TableCell className="py-1.5 pl-8">
        <div className="flex items-center gap-2">
          <ExchangeBadge
            exchangeName={exchange.exchangeName}
            className="text-[10px] px-1.5 py-0"
          />
          <span className="text-xs text-muted-foreground font-mono">
            {truncateAddress(exchange.walletAddress)}
          </span>
        </div>
      </TableCell>
      <TableCell className="py-1.5 text-right font-mono text-sm text-muted-foreground">
        {formatNumber(exchange.balance)}
      </TableCell>
      <TableCell className="py-1.5 text-right" />
      <TableCell className="py-1.5 text-right font-mono text-sm text-muted-foreground">
        {exchange.valueUsd > 0 ? formatUsd(exchange.valueUsd) : "-"}
      </TableCell>
    </TableRow>
  );
}

export function AssetBalancesTable({
  balances,
  isLoading = false,
}: AssetBalancesTableProps) {
  const [expandedAsset, setExpandedAsset] = useState<string | null>(null);

  if (isLoading && balances.length === 0) {
    return <AssetBalancesTableSkeleton rows={5} />;
  }

  if (balances.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-muted-foreground">No asset balances found</p>
        <p className="text-xs text-muted-foreground mt-1">
          Balances will appear once the portfolio monitor captures snapshots
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Asset</TableHead>
          <TableHead className="text-right">Total Balance</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right">Value (USD)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {balances.map((asset) => {
          const isExpanded = expandedAsset === asset.token;
          const hasMultipleExchanges = asset.exchanges.length > 1;

          return (
            <AssetRow
              key={asset.token}
              asset={asset}
              isExpanded={isExpanded}
              hasMultipleExchanges={hasMultipleExchanges}
              onToggle={() =>
                setExpandedAsset(isExpanded ? null : asset.token)
              }
            />
          );
        })}
      </TableBody>
    </Table>
  );
}

function AssetRow({
  asset,
  isExpanded,
  hasMultipleExchanges,
  onToggle,
}: {
  asset: AssetBalance;
  isExpanded: boolean;
  hasMultipleExchanges: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <TableRow
        className={cn(
          hasMultipleExchanges && "cursor-pointer hover:bg-muted/50",
          isExpanded && "border-b-0"
        )}
        onClick={hasMultipleExchanges ? onToggle : undefined}
      >
        <TableCell className="py-3">
          <div className="flex items-center gap-2">
            {hasMultipleExchanges && (
              <span className="text-xs text-muted-foreground w-4">
                {isExpanded ? "\u25BC" : "\u25B6"}
              </span>
            )}
            <span className="font-medium">{asset.token}</span>
            {asset.exchanges.length > 1 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {asset.exchanges.length} exchanges
              </span>
            )}
            {asset.exchanges.length === 1 && (
              <ExchangeBadge
                exchangeName={asset.exchanges[0].exchangeName}
                className="text-[10px] px-1.5 py-0"
              />
            )}
          </div>
        </TableCell>
        <TableCell className="py-3 text-right font-mono">
          {formatNumber(asset.totalBalance)}
        </TableCell>
        <TableCell className="py-3 text-right font-mono text-muted-foreground">
          {formatPrice(asset.avgOraclePrice)}
        </TableCell>
        <TableCell className="py-3 text-right font-mono font-medium">
          {formatUsd(asset.totalValueUsd)}
        </TableCell>
      </TableRow>
      {isExpanded &&
        asset.exchanges.map((exchange, idx) => (
          <ExchangeBreakdownRow
            key={`${exchange.exchangeName}-${exchange.walletAddress}-${idx}`}
            exchange={exchange}
          />
        ))}
    </>
  );
}
