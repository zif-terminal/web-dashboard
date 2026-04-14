"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { useGlobalFilters } from "@/hooks/use-global-filters";
import { useDenomination } from "@/contexts/denomination-context";
import { StatCard, StatsGrid } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatSignedNumber, formatNumber, formatCurrency, pnlColor, formatDuration } from "@/lib/format";
import { PnLAggregates, FundingAggregates, TradesAggregates, InterestByAsset } from "@/lib/queries";

export default function AnalyticsPage() {
  const { buildFilters } = useGlobalFilters();
  const { denomination } = useDenomination();

  const [pnl, setPnl] = useState<PnLAggregates | null>(null);
  const [funding, setFunding] = useState<FundingAggregates | null>(null);
  const [trades, setTrades] = useState<TradesAggregates | null>(null);
  const [interest, setInterest] = useState<InterestByAsset[]>([]);
  const [positionStats, setPositionStats] = useState<{ winCount: number; lossCount: number; avgWin: number; avgLoss: number; bestTrade: number; worstTrade: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const filters = buildFilters({ timeField: "end_time" });

    setIsLoading(true);
    try {
      const [pnlData, fundingData, tradesData, interestData, chartPoints] = await Promise.all([
        api.getPnLAggregates(filters),
        api.getFundingAggregates(buildFilters()),
        api.getTradesAggregates(buildFilters()),
        api.getInterestByAsset(buildFilters()),
        api.getPositionsPnLChart(filters, denomination),
      ]);

      setPnl(pnlData);
      setFunding(fundingData);
      setTrades(tradesData);
      setInterest(interestData);

      // Compute win/loss stats from lightweight chart data
      let winCount = 0, lossCount = 0, totalWin = 0, totalLoss = 0, best = 0, worst = 0;
      for (const pos of chartPoints) {
        const val = pos.realized_pnl;
        if (val === 0) continue;
        if (val > 0) { winCount++; totalWin += val; best = Math.max(best, val); }
        else { lossCount++; totalLoss += val; worst = Math.min(worst, val); }
      }
      setPositionStats({
        winCount,
        lossCount,
        avgWin: winCount > 0 ? totalWin / winCount : 0,
        avgLoss: lossCount > 0 ? totalLoss / lossCount : 0,
        bestTrade: best,
        worstTrade: worst,
      });
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
    } finally {
      setIsLoading(false);
    }
  }, [buildFilters, denomination]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const winRate = positionStats
    ? positionStats.winCount + positionStats.lossCount > 0
      ? ((positionStats.winCount / (positionStats.winCount + positionStats.lossCount)) * 100)
      : 0
    : 0;

  const profitFactor = positionStats && positionStats.avgLoss !== 0
    ? Math.abs((positionStats.winCount * positionStats.avgWin) / (positionStats.lossCount * positionStats.avgLoss))
    : 0;

  const totalFunding = parseFloat(funding?.totalAmount || "0");
  const totalPnl = pnl?.total.pnl ?? 0;
  const fundingPctOfPnl = totalPnl !== 0 ? (totalFunding / totalPnl) * 100 : 0;
  // Fees: negative = cost paid, positive = rebate received
  const totalFees = parseFloat(trades?.totalFees || "0");
  const feesPctOfPnl = totalPnl !== 0 ? (Math.abs(totalFees) / Math.abs(totalPnl)) * 100 : 0;

  const totalInterest = interest.reduce((sum, i) => sum + i.netValue, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <h1 className="text-2xl font-bold">Analytics</h1>

      {/* Trading Performance */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Trading Performance</h2>
        <StatsGrid columns={6}>
          <StatCard
            title="Win Rate"
            value={`${winRate.toFixed(1)}%`}
            description={positionStats ? `${positionStats.winCount}W / ${positionStats.lossCount}L` : undefined}
            isLoading={isLoading}
            valueClassName={winRate >= 50 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}
          />
          <StatCard
            title="Avg Win"
            value={positionStats ? formatSignedNumber(positionStats.avgWin.toString()) : "$0"}
            isLoading={isLoading}
            valueClassName="text-green-600 dark:text-green-400"
          />
          <StatCard
            title="Avg Loss"
            value={positionStats ? formatSignedNumber(positionStats.avgLoss.toString()) : "$0"}
            isLoading={isLoading}
            valueClassName="text-red-600 dark:text-red-400"
          />
          <StatCard
            title="Best Trade"
            value={positionStats ? formatSignedNumber(positionStats.bestTrade.toString()) : "$0"}
            isLoading={isLoading}
            valueClassName="text-green-600 dark:text-green-400"
          />
          <StatCard
            title="Worst Trade"
            value={positionStats ? formatSignedNumber(positionStats.worstTrade.toString()) : "$0"}
            isLoading={isLoading}
            valueClassName="text-red-600 dark:text-red-400"
          />
          <StatCard
            title="Profit Factor"
            value={profitFactor > 0 ? profitFactor.toFixed(2) : "-"}
            isLoading={isLoading}
            valueClassName={profitFactor >= 1 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}
          />
        </StatsGrid>
      </div>

      {/* PnL by Market */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">PnL by Market</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : !pnl?.byMarket.length ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No data</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Market</TableHead>
                    <TableHead className="text-xs text-right"># Positions</TableHead>
                    <TableHead className="text-xs text-right">PnL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pnl.byMarket.map((m) => (
                    <TableRow key={m.market}>
                      <TableCell className="py-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium">{m.market}</span>
                          <Badge variant="outline" className="text-[10px] px-1 py-0">{m.market_type.toUpperCase()}</Badge>
                        </div>
                      </TableCell>
                      <TableCell className="py-1.5 text-right text-sm text-muted-foreground">{m.count}</TableCell>
                      <TableCell className="py-1.5 text-right">
                        <span className={cn("text-sm font-mono", pnlColor(m.pnl))}>{formatSignedNumber(m.pnl.toString())}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Cost Analysis */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cost Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm">Realized PnL</span>
                    <span className={cn("text-sm font-mono font-medium", pnlColor(totalPnl))}>
                      {formatSignedNumber(totalPnl.toString())}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <div>
                      <span className="text-sm">Net Funding</span>
                      {totalPnl !== 0 && (
                        <span className="text-xs text-muted-foreground ml-2">
                          ({fundingPctOfPnl >= 0 ? "+" : ""}{fundingPctOfPnl.toFixed(1)}% of PnL)
                        </span>
                      )}
                    </div>
                    <span className={cn("text-sm font-mono", pnlColor(totalFunding))}>
                      {formatSignedNumber(totalFunding.toString())}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <div>
                      <span className="text-sm">Fees / Rebates</span>
                      {totalPnl !== 0 && (
                        <span className="text-xs text-muted-foreground ml-2">
                          ({feesPctOfPnl.toFixed(1)}% of PnL)
                        </span>
                      )}
                    </div>
                    <span className={cn("text-sm font-mono", pnlColor(-totalFees))}>
                      {formatSignedNumber((-totalFees).toString())}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm">Interest Income</span>
                    <span className={cn("text-sm font-mono", pnlColor(totalInterest))}>
                      {formatSignedNumber(totalInterest.toString())}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm">Total Trades</span>
                    <span className="text-sm font-mono">{trades?.count ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm font-medium">Net Result</span>
                    <span className={cn("text-sm font-mono font-bold", pnlColor(totalPnl + totalFunding - totalFees + totalInterest))}>
                      {formatSignedNumber((totalPnl + totalFunding - totalFees + totalInterest).toString())}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Interest Breakdown */}
      {interest.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Interest by Asset</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Asset</TableHead>
                  <TableHead className="text-xs text-right">Earned</TableHead>
                  <TableHead className="text-xs text-right">Paid</TableHead>
                  <TableHead className="text-xs text-right">Net</TableHead>
                  <TableHead className="text-xs text-right">Value (USDC)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {interest.map((i) => (
                  <TableRow key={i.asset}>
                    <TableCell className="py-1.5 text-sm font-medium">{i.asset}</TableCell>
                    <TableCell className="py-1.5 text-right text-sm font-mono text-green-600 dark:text-green-400">{formatNumber(i.earned.toString(), 4)}</TableCell>
                    <TableCell className="py-1.5 text-right text-sm font-mono text-red-600 dark:text-red-400">{formatNumber(i.paid.toString(), 4)}</TableCell>
                    <TableCell className="py-1.5 text-right text-sm font-mono">{formatNumber(i.net.toString(), 4)}</TableCell>
                    <TableCell className="py-1.5 text-right text-sm font-mono">
                      <span className={pnlColor(i.netValue)}>{formatSignedNumber(i.netValue.toString())}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
