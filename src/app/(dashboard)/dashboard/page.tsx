"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useGlobalFilters } from "@/hooks/use-global-filters";
import { useDenomination } from "@/contexts/denomination-context";
import { getTimestampsFromDateRange, DateRangeFilter, DateRangeValue } from "@/components/date-range-filter";
import { PnLChart, ChartMode, ChartSource } from "@/components/pnl-chart";
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
import { formatSignedNumber, formatNumber, formatTimestamp } from "@/lib/format";
import { PnLAggregates, Position, PositionPnLPoint, TimeSeriesPoint } from "@/lib/queries";

const SOURCE_OPTIONS: { value: ChartSource; label: string }[] = [
  { value: "all", label: "All" },
  { value: "perp", label: "Perp" },
  { value: "spot", label: "Spot" },
  { value: "funding", label: "Funding" },
  { value: "fees", label: "Fees" },
];

export default function DashboardPage() {
  const { buildFilters } = useGlobalFilters();
  const { denomination } = useDenomination();

  const [dateRange, setDateRange] = useState<DateRangeValue>({ preset: "all" });
  const [chartMode, setChartMode] = useState<ChartMode>("cumulative");
  const [chartSource, setChartSource] = useState<ChartSource>("all");
  const [pnl, setPnl] = useState<PnLAggregates | null>(null);
  const [openPositions, setOpenPositions] = useState<Position[]>([]);
  const [chartData, setChartData] = useState<PositionPnLPoint[]>([]);
  const [fundingData, setFundingData] = useState<TimeSeriesPoint[]>([]);
  const [feesData, setFeesData] = useState<TimeSeriesPoint[]>([]);
  const [isLoadingPnl, setIsLoadingPnl] = useState(true);
  const [isLoadingOpen, setIsLoadingOpen] = useState(true);
  const [isLoadingChart, setIsLoadingChart] = useState(true);

  const fetchData = useCallback(async () => {
    const timestamps = getTimestampsFromDateRange(dateRange);
    const filters = buildFilters({ ...timestamps, timeField: "end_time" });
    const baseFilters = buildFilters(timestamps);

    setIsLoadingPnl(true);
    setIsLoadingOpen(true);
    setIsLoadingChart(true);

    try {
      const [pnlData, openData, chartPoints, fundingPoints, feesPoints] = await Promise.all([
        api.getPnLAggregates(filters),
        api.getOpenPositions(buildFilters()),
        api.getPositionsPnLChart(filters, denomination),
        api.getFundingChartData(baseFilters),
        api.getFeesChartData(baseFilters),
      ]);
      setPnl(pnlData);
      setOpenPositions(openData);
      setChartData(chartPoints);
      setFundingData(fundingPoints);
      setFeesData(feesPoints);
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setIsLoadingPnl(false);
      setIsLoadingOpen(false);
      setIsLoadingChart(false);
    }
  }, [buildFilters, dateRange, denomination]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const tradingPnl = pnl?.total.pnl ?? 0;
  const perpPnl = pnl?.perp.pnl ?? 0;
  const spotPnl = pnl?.spot.pnl ?? 0;

  const chartTitle = {
    all: "PnL",
    perp: "Perp PnL",
    spot: "Spot PnL",
    funding: "Funding",
    fees: "Fee Savings",
  }[chartSource];

  return (
    <div className="space-y-6">
      {/* Header with date range */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      {/* PnL Summary */}
      <StatsGrid columns={4}>
        <StatCard
          title="Realized PnL"
          value={formatSignedNumber(tradingPnl.toString())}
          isLoading={isLoadingPnl}
          valueClassName={cn(tradingPnl >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}
        />
        <StatCard
          title="Perp PnL"
          value={formatSignedNumber(perpPnl.toString())}
          isLoading={isLoadingPnl}
          valueClassName={cn(perpPnl >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}
        />
        <StatCard
          title="Spot PnL"
          value={formatSignedNumber(spotPnl.toString())}
          isLoading={isLoadingPnl}
          valueClassName={cn(spotPnl >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}
        />
        <StatCard
          title="Closed Positions"
          value={pnl?.total.count ?? 0}
          isLoading={isLoadingPnl}
        />
      </StatsGrid>

      {/* PnL Chart */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {chartMode === "cumulative" ? `Cumulative ${chartTitle}` : `Daily ${chartTitle}`}
            </CardTitle>
            <div className="flex gap-3">
              {/* Source filter */}
              <div className="flex gap-0.5">
                {SOURCE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setChartSource(opt.value)}
                    className={cn(
                      "px-2 py-1 text-[11px] font-medium rounded-md transition-colors",
                      chartSource === opt.value
                        ? "bg-secondary text-secondary-foreground"
                        : "text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {/* Mode toggle */}
              <div className="flex gap-0.5 border-l pl-3">
                <button
                  onClick={() => setChartMode("cumulative")}
                  className={cn(
                    "px-2 py-1 text-[11px] font-medium rounded-md transition-colors",
                    chartMode === "cumulative"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  Cumulative
                </button>
                <button
                  onClick={() => setChartMode("daily")}
                  className={cn(
                    "px-2 py-1 text-[11px] font-medium rounded-md transition-colors",
                    chartMode === "daily"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  Daily
                </button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingChart ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <PnLChart
              positionData={chartData}
              fundingData={fundingData}
              feesData={feesData}
              mode={chartMode}
              source={chartSource}
            />
          )}
        </CardContent>
      </Card>

      {/* PnL Breakdown + Open Positions side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* PnL by Market */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              PnL by Market
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingPnl ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : !pnl?.byMarket.length ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No data</p>
            ) : (
              <div className="space-y-1 max-h-[400px] overflow-y-auto">
                {pnl.byMarket.map((m) => (
                  <div key={m.market} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{m.market}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {m.market_type.toUpperCase()}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{m.count} pos</span>
                    </div>
                    <span className={cn("text-sm font-mono", m.pnl >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
                      {formatSignedNumber(m.pnl.toString())}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Open Positions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Open Positions ({openPositions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingOpen ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : openPositions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No open positions</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Market</TableHead>
                      <TableHead className="text-xs">Side</TableHead>
                      <TableHead className="text-xs text-right">Size</TableHead>
                      <TableHead className="text-xs text-right">Opened</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {openPositions.map((pos) => (
                      <TableRow key={pos.id}>
                        <TableCell className="py-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium">{pos.market}</span>
                            <Badge variant="outline" className="text-[10px] px-1 py-0">
                              {pos.market_type.toUpperCase()}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="py-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] px-1.5 py-0",
                              pos.side === "long"
                                ? "border-green-500/50 text-green-600 dark:text-green-400"
                                : "border-red-500/50 text-red-600 dark:text-red-400"
                            )}
                          >
                            {pos.side.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2 text-right text-sm font-mono">
                          {formatNumber(pos.quantity, 4)}
                        </TableCell>
                        <TableCell className="py-2 text-right text-xs text-muted-foreground">
                          {formatTimestamp(pos.start_time)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
