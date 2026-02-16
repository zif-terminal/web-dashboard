"use client";

import { OpenPosition } from "@/lib/queries";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExchangeBadge } from "@/components/exchange-badge";
import { getDisplayName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface OpenPositionsTableProps {
  positions: OpenPosition[];
  showAccount?: boolean;
  isLoading?: boolean;
}

function formatNumber(value: number, decimals: number = 4): string {
  if (isNaN(value)) return "0";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function formatPrice(value: number, decimals: number = 2): string {
  if (isNaN(value) || value === 0) return "-";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  });
}

function OpenPositionsTableSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Asset</TableHead>
          <TableHead>Side</TableHead>
          <TableHead className="text-right">Size</TableHead>
          <TableHead className="text-right">Entry</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, i) => (
          <TableRow key={i}>
            <TableCell>
              <div className="space-y-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            </TableCell>
            <TableCell><Skeleton className="h-4 w-16" /></TableCell>
            <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
            <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// Perp positions table
function PerpPositionsSection({
  positions,
}: {
  positions: OpenPosition[];
}) {
  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-4 text-center">
        <p className="text-muted-foreground text-sm">No open perp positions</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Pair</TableHead>
          <TableHead>Side</TableHead>
          <TableHead className="text-right">Size</TableHead>
          <TableHead className="text-right">Entry Price</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {positions.map((position, index) => (
          <TableRow key={`${position.base_asset}-${position.quote_asset}-${position.exchange_account_id}-${index}`}>
            <TableCell className="py-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "w-1 h-6 rounded-full flex-shrink-0",
                      position.side === "long" ? "bg-green-500" : "bg-red-500"
                    )}
                  />
                  <span className="font-medium">
                    {position.base_asset}-{position.quote_asset}
                  </span>
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded uppercase bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                    PERP
                  </span>
                </div>
                <div className="flex items-center gap-1.5 ml-3">
                  <ExchangeBadge
                    exchangeName={position.exchange_account?.exchange?.display_name || "Unknown"}
                    className="text-[10px] px-1.5 py-0"
                  />
                  <span className="text-xs text-muted-foreground">
                    {position.exchange_account?.label || getDisplayName(
                      null,
                      position.exchange_account?.account_identifier || position.exchange_account_id || "",
                      8,
                      4
                    )}
                  </span>
                  {position.exchange_account?.tags && position.exchange_account.tags.length > 0 && (
                    <div className="flex gap-1">
                      {position.exchange_account.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </TableCell>
            <TableCell className="py-3">
              <span
                className={cn(
                  "font-medium",
                  position.side === "long" ? "text-green-600" : "text-red-600"
                )}
              >
                {position.side.toUpperCase()}
              </span>
            </TableCell>
            <TableCell className="py-3 text-right font-mono">
              {formatNumber(position.net_quantity)}
            </TableCell>
            <TableCell className="py-3 text-right font-mono">
              ${formatPrice(position.avg_entry_price)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// Spot positions table - shows asset and native quote
function SpotPositionsSection({
  positions,
}: {
  positions: OpenPosition[];
}) {
  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-4 text-center">
        <p className="text-muted-foreground text-sm">No spot holdings</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Asset</TableHead>
          <TableHead>Side</TableHead>
          <TableHead className="text-right">Balance</TableHead>
          <TableHead className="text-right">Avg Cost</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {positions.map((position, index) => {
          // Determine quote display
          const nativeQuote = position.native_quote_asset || position.quote_asset;
          const isUsdQuote = nativeQuote === "USDC" || nativeQuote === "USDT" || nativeQuote === "USD";
          const priceDisplay = position.avg_entry_price > 0
            ? isUsdQuote
              ? `$${formatPrice(position.avg_entry_price)}`
              : `${formatPrice(position.avg_entry_price, 4)} ${nativeQuote}`
            : "-";

          return (
            <TableRow key={`${position.base_asset}-${position.exchange_account_id}-${index}`}>
              <TableCell className="py-3">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "w-1 h-6 rounded-full flex-shrink-0",
                        position.side === "long" ? "bg-green-500" : "bg-red-500"
                      )}
                    />
                    <span className="font-medium">{position.base_asset}</span>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded uppercase bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      SPOT
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 ml-3">
                    <ExchangeBadge
                      exchangeName={position.exchange_account?.exchange?.display_name || "Unknown"}
                      className="text-[10px] px-1.5 py-0"
                    />
                    <span className="text-xs text-muted-foreground">
                      {position.exchange_account?.label || getDisplayName(
                        null,
                        position.exchange_account?.account_identifier || position.exchange_account_id || "",
                        8,
                        4
                      )}
                    </span>
                    {position.exchange_account?.tags && position.exchange_account.tags.length > 0 && (
                      <div className="flex gap-1">
                        {position.exchange_account.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell className="py-3">
                <span
                  className={cn(
                    "font-medium",
                    position.side === "long" ? "text-green-600" : "text-red-600"
                  )}
                >
                  {position.side.toUpperCase()}
                </span>
              </TableCell>
              <TableCell className="py-3 text-right font-mono">
                <span className={cn(
                  position.side === "short" && "text-red-600"
                )}>
                  {position.side === "short" ? "-" : ""}
                  {formatNumber(position.net_quantity)}
                </span>
              </TableCell>
              <TableCell className="py-3 text-right font-mono text-muted-foreground">
                {priceDisplay}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function OpenPositionsTable({
  positions,
  showAccount = false,
  isLoading = false,
}: OpenPositionsTableProps) {
  if (isLoading && positions.length === 0) {
    return <OpenPositionsTableSkeleton rows={3} />;
  }

  // Separate perp and spot positions
  const perpPositions = positions.filter(p => p.market_type === "perp");
  const spotPositions = positions.filter(p => p.market_type !== "perp");

  const hasPositions = positions.length > 0;

  return (
    <div className="space-y-6">
      {/* Perp Positions */}
      {(perpPositions.length > 0 || spotPositions.length === 0) && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-500"></span>
            Perpetual Positions
            {perpPositions.length > 0 && (
              <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                {perpPositions.length}
              </span>
            )}
          </h3>
          <PerpPositionsSection positions={perpPositions} />
        </div>
      )}

      {/* Spot Holdings */}
      {(spotPositions.length > 0 || perpPositions.length === 0) && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            Spot Holdings
            {spotPositions.length > 0 && (
              <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                {spotPositions.length}
              </span>
            )}
          </h3>
          <SpotPositionsSection positions={spotPositions} />
        </div>
      )}

      {!hasPositions && !isLoading && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-muted-foreground">No open positions</p>
        </div>
      )}
    </div>
  );
}
