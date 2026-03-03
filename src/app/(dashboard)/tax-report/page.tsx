"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard, StatsGrid } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchTaxReportDataFifo,
  generateForm8949CsvFromLots,
  generateFundingCsv,
  generateFeesCsv,
  generateSummaryCsvFifo,
  generateTxfFromLots,
  downloadCsv,
  downloadTxf,
  validateFifoData,
  type TaxReportDataFifo,
  type Form8949Box,
  type CostBasisMethod,
} from "@/lib/tax-report";
import { toast } from "sonner";

const currentYear = new Date().getFullYear();
const availableYears = Array.from(
  { length: currentYear - 2024 },
  (_, i) => 2025 + i
);

function formatUSD(value: number): string {
  const sign = value >= 0 ? "" : "-";
  return `${sign}$${Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function TaxReportPage() {
  const [selectedYear, setSelectedYear] = useState(
    availableYears[availableYears.length - 1].toString()
  );
  const [reportData, setReportData] = useState<TaxReportDataFifo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Form 8949 box for TXF export — "B" is the typical choice for crypto
  // exchanges that do NOT file 1099-B with the IRS.
  const [selectedBox, setSelectedBox] = useState<Form8949Box>("B");
  // A8.5: Cost basis method selector (FIFO or LIFO)
  const [costBasisMethod, setCostBasisMethod] = useState<"FIFO" | "LIFO">("FIFO");

  const handleMethodChange = (m: string) => {
    setCostBasisMethod(m as "FIFO" | "LIFO");
    // Clear stale report so user knows they need to regenerate
    setReportData(null);
  };

  const handleGenerate = async () => {
    setIsLoading(true);
    setReportData(null);
    try {
      const data = await fetchTaxReportDataFifo(parseInt(selectedYear), costBasisMethod);
      setReportData(data);

      // Validate lot math before announcing success
      const validationErrors = validateFifoData(data);
      if (validationErrors.length > 0) {
        toast.warning(`${validationErrors.length} lots have data inconsistencies`);
        console.warn(`${costBasisMethod} validation errors:`, validationErrors);
      } else {
        toast.success(
          `Tax report generated for ${selectedYear} — ${data.lots.length} ${costBasisMethod} lots validated`
        );
      }
    } catch (error) {
      console.error("Failed to generate tax report:", error);
      toast.error("Failed to generate tax report");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadPositions = () => {
    if (!reportData) return;
    const csv = generateForm8949CsvFromLots(reportData);
    downloadCsv(csv, `tax-report-positions-${reportData.year}.csv`);
    toast.success("Positions CSV downloaded");
  };

  const handleDownloadFunding = () => {
    if (!reportData) return;
    const csv = generateFundingCsv(reportData);
    downloadCsv(csv, `tax-report-funding-${reportData.year}.csv`);
    toast.success("Funding CSV downloaded");
  };

  const handleDownloadSummary = () => {
    if (!reportData) return;
    const csv = generateSummaryCsvFifo(reportData);
    downloadCsv(csv, `tax-report-summary-${reportData.year}.csv`);
    toast.success("Summary CSV downloaded");
  };

  const handleDownloadFees = () => {
    if (!reportData) return;
    const csv = generateFeesCsv(reportData);
    downloadCsv(csv, `tax-report-fees-${reportData.year}.csv`);
    toast.success("Trading Fees CSV downloaded");
  };

  const handleDownloadAll = () => {
    if (!reportData) return;
    handleDownloadPositions();
    handleDownloadFunding();
    handleDownloadFees();
    handleDownloadSummary();
  };

  const handleDownloadTxf = () => {
    if (!reportData) return;
    const txf = generateTxfFromLots(reportData, selectedBox);
    downloadTxf(txf, `tax-report-${reportData.year}-form8949.txf`);
    toast.success(
      "TXF file downloaded — import into TurboTax via File → Import → From TXF File"
    );
  };

  const s = reportData?.summary;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tax Report"
        description="Generate tax reports for your trading activity"
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base md:text-lg">
            Report Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                Tax Year
              </label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                Form 8949 Box (TXF)
              </label>
              <Select
                value={selectedBox}
                onValueChange={(v) => setSelectedBox(v as Form8949Box)}
              >
                <SelectTrigger className="w-[230px]">
                  <SelectValue placeholder="Select box" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="B">Box B/E — Not Reported (Crypto default)</SelectItem>
                  <SelectItem value="A">Box A/D — Basis Reported (1099-B)</SelectItem>
                  <SelectItem value="C">Box C/F — Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* A8.5: Cost Basis Method selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                Cost Basis Method
              </label>
              <Select value={costBasisMethod} onValueChange={handleMethodChange}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIFO">FIFO — First In, First Out</SelectItem>
                  <SelectItem value="LIFO">LIFO — Last In, First Out</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleGenerate} disabled={isLoading}>
              {isLoading ? "Generating..." : "Generate Report"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {costBasisMethod === "FIFO"
              ? "FIFO: oldest lots are closed first — typically produces lower short-term gains for rising-price assets."
              : "LIFO: newest lots are closed first — typically produces lower gains for assets held longer at lower prices."}
          </p>
        </CardContent>
      </Card>

      {s && reportData && (
        <>
          <StatsGrid columns={4}>
            <StatCard
              title="Total Realized PnL"
              value={formatUSD(s.totalRealizedPnL)}
              valueClassName={
                s.totalRealizedPnL >= 0 ? "text-green-500" : "text-red-500"
              }
            />
            <StatCard
              title="Short-Term Gains"
              value={formatUSD(s.shortTermGains)}
              valueClassName={
                s.shortTermGains >= 0 ? "text-green-500" : "text-red-500"
              }
            />
            <StatCard
              title="Long-Term Gains"
              value={formatUSD(s.longTermGains)}
              valueClassName={
                s.longTermGains >= 0 ? "text-green-500" : "text-red-500"
              }
            />
            <StatCard
              title="Total Fees"
              value={formatUSD(s.totalFees)}
              valueClassName="text-red-500"
            />
          </StatsGrid>

          <StatsGrid columns={3}>
            <StatCard
              title="Total Funding"
              value={formatUSD(s.totalFunding)}
              valueClassName={
                s.totalFunding >= 0 ? "text-green-500" : "text-red-500"
              }
            />
            <StatCard
              title="Closed Lots"
              value={s.lotCount.toLocaleString()}
            />
            <StatCard
              title="Funding Payments"
              value={s.fundingPaymentCount.toLocaleString()}
            />
          </StatsGrid>

          <Card>
            <CardHeader>
              <CardTitle className="text-base md:text-lg">
                Download Reports
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button onClick={handleDownloadTxf} className="sm:order-first">
                  Download TXF (TurboTax)
                </Button>
                <Button variant="outline" onClick={handleDownloadAll}>
                  Download All CSVs
                </Button>
                <Button variant="outline" onClick={handleDownloadPositions}>
                  Positions CSV (Form 8949)
                </Button>
                <Button variant="outline" onClick={handleDownloadFunding}>
                  Funding Payments CSV
                </Button>
                <Button variant="outline" onClick={handleDownloadFees}>
                  Trading Fees CSV
                </Button>
                <Button variant="outline" onClick={handleDownloadSummary}>
                  Summary CSV
                </Button>
              </div>
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                <p>
                  <strong className="text-foreground">TXF file</strong> — Import
                  directly into TurboTax via{" "}
                  <em>File → Import → From TXF File</em>. Covers capital gains
                  (Form 8949 / Schedule D) only. The selected Box (above)
                  determines whether basis was reported to the IRS; most crypto
                  exchanges do not file 1099-B, so{" "}
                  <strong className="text-foreground">Box B/E</strong> is the
                  default.
                </p>
                <p>
                  <strong className="text-foreground">Funding Payments CSV</strong>{" "}
                  — Funding is ordinary income (Schedule 1) and is NOT included
                  in the TXF file. Export it separately and enter it in TurboTax
                  under <em>Less Common Income → Miscellaneous Income</em>.
                </p>
                <p>
                  <strong className="text-foreground">Trading Fees CSV</strong>{" "}
                  — Individual trading fees listed as separate line items. Fees
                  are already included in your Form 8949 cost basis; this export
                  is for reference and record-keeping.
                </p>
                <p>
                  Cost basis is calculated using the{" "}
                  <strong className="text-foreground">
                    {reportData.costBasisMethod === "FIFO"
                      ? "FIFO (First In, First Out)"
                      : "LIFO (Last In, First Out)"}
                  </strong>{" "}
                  method. Each lot is matched to the{" "}
                  {reportData.costBasisMethod === "FIFO" ? "oldest" : "newest"}{" "}
                  available entry, ensuring correct holding-period
                  classification for short-term vs long-term capital gains.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Matched lot preview table */}
          {reportData.lots.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base md:text-lg">
                  {reportData.costBasisMethod} Lots ({reportData.lots.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4">Asset</th>
                      <th className="pb-2 pr-4">Side</th>
                      <th className="pb-2 pr-4">Opened</th>
                      <th className="pb-2 pr-4">Closed</th>
                      <th className="pb-2 pr-4 text-right">Qty</th>
                      <th className="pb-2 pr-4 text-right">Proceeds</th>
                      <th className="pb-2 pr-4 text-right">Cost Basis</th>
                      <th className="pb-2 pr-4 text-right">Gain/Loss</th>
                      <th className="pb-2 pr-4 text-right">Fees</th>
                      <th className="pb-2 pr-4 text-right">Funding</th>
                      <th className="pb-2 text-right">Term</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.lots
                      .sort((a, b) => a.exitTime - b.exitTime)
                      .slice(0, 50)
                      .map((lot) => {
                        const totalFees = lot.entryFee + lot.exitFee;
                        return (
                          <tr key={lot.id} className="border-b last:border-0">
                            <td className="py-2 pr-4 font-medium">
                              {lot.asset}/{lot.quoteAsset}
                            </td>
                            <td className="py-2 pr-4 capitalize">
                              {lot.lotType}
                            </td>
                            <td className="py-2 pr-4 text-muted-foreground">
                              {new Date(lot.entryTime).toLocaleDateString()}
                            </td>
                            <td className="py-2 pr-4 text-muted-foreground">
                              {new Date(lot.exitTime).toLocaleDateString()}
                            </td>
                            <td className="py-2 pr-4 text-right">
                              {lot.quantity.toLocaleString(undefined, {
                                maximumFractionDigits: 6,
                              })}
                            </td>
                            {/* Form 8949 column (d): Proceeds */}
                            <td className="py-2 pr-4 text-right">
                              {formatUSD(lot.proceeds)}
                            </td>
                            {/* Form 8949 column (e): Cost Basis */}
                            <td className="py-2 pr-4 text-right">
                              {formatUSD(lot.costBasis)}
                            </td>
                            {/* Form 8949 column (h): Gain or Loss = (d) − (e) */}
                            <td
                              className={`py-2 pr-4 text-right font-medium ${
                                lot.gainOrLoss >= 0
                                  ? "text-green-500"
                                  : "text-red-500"
                              }`}
                            >
                              {formatUSD(lot.gainOrLoss)}
                            </td>
                            <td className="py-2 pr-4 text-right text-red-500">
                              {formatUSD(totalFees)}
                            </td>
                            <td className="py-2 pr-4 text-right">
                              {formatUSD(lot.fundingAllocated)}
                            </td>
                            <td className="py-2 text-right">
                              {lot.isLongTerm ? "Long" : "Short"}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
                {reportData.lots.length > 50 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Showing first 50 of {reportData.lots.length} lots.
                    Download the CSV for the full list.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Funding Payments preview card (Step 5 — A8.6 separate line items) */}
          {reportData.fundingPayments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base md:text-lg">
                  Funding Payments ({reportData.fundingPayments.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4">Date</th>
                      <th className="pb-2 pr-4">Asset</th>
                      <th className="pb-2 pr-4 text-right">Amount (USD)</th>
                      <th className="pb-2 text-right">Exchange</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...reportData.fundingPayments]
                      .sort((a, b) => a.timestamp - b.timestamp)
                      .slice(0, 50)
                      .map((fp) => (
                        <tr key={fp.id} className="border-b last:border-0">
                          <td className="py-2 pr-4 text-muted-foreground">
                            {new Date(Number(fp.timestamp)).toLocaleDateString()}
                          </td>
                          <td className="py-2 pr-4 font-medium">
                            {fp.base_asset}/{fp.quote_asset}
                          </td>
                          <td
                            className={`py-2 pr-4 text-right font-medium ${
                              parseFloat(fp.amount) >= 0
                                ? "text-green-500"
                                : "text-red-500"
                            }`}
                          >
                            {formatUSD(parseFloat(fp.amount))}
                          </td>
                          <td className="py-2 text-right text-muted-foreground">
                            {fp.exchange_account?.exchange?.display_name ??
                              "Unknown"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {reportData.fundingPayments.length > 50 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Showing first 50 of {reportData.fundingPayments.length}{" "}
                    payments. Download the Funding Payments CSV for the full
                    list.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Trading Fees preview card (Step 6 — A8.6 separate line items) */}
          {(() => {
            const tradesWithFees = reportData.trades.filter(
              (t) => parseFloat(t.fee) !== 0
            );
            if (tradesWithFees.length === 0) return null;
            return (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base md:text-lg">
                    Trading Fees ({tradesWithFees.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4">Date</th>
                        <th className="pb-2 pr-4">Asset</th>
                        <th className="pb-2 pr-4">Side</th>
                        <th className="pb-2 pr-4 text-right">Price</th>
                        <th className="pb-2 pr-4 text-right">Qty</th>
                        <th className="pb-2 pr-4 text-right">Fee (USD)</th>
                        <th className="pb-2 text-right">Exchange</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tradesWithFees
                        .sort((a, b) => {
                          const tsA = Number(a.timestamp);
                          const tsB = Number(b.timestamp);
                          return (
                            (Number.isFinite(tsA)
                              ? tsA
                              : new Date(a.timestamp).getTime()) -
                            (Number.isFinite(tsB)
                              ? tsB
                              : new Date(b.timestamp).getTime())
                          );
                        })
                        .slice(0, 50)
                        .map((t) => (
                          <tr key={t.id} className="border-b last:border-0">
                            <td className="py-2 pr-4 text-muted-foreground">
                              {new Date(
                                Number.isFinite(Number(t.timestamp))
                                  ? Number(t.timestamp)
                                  : t.timestamp
                              ).toLocaleDateString()}
                            </td>
                            <td className="py-2 pr-4 font-medium">
                              {t.base_asset}/{t.quote_asset}
                            </td>
                            <td className="py-2 pr-4 capitalize">{t.side}</td>
                            <td className="py-2 pr-4 text-right">
                              {formatUSD(parseFloat(t.price))}
                            </td>
                            <td className="py-2 pr-4 text-right">
                              {parseFloat(t.quantity).toLocaleString(
                                undefined,
                                { maximumFractionDigits: 6 }
                              )}
                            </td>
                            <td className="py-2 pr-4 text-right text-red-500">
                              {formatUSD(parseFloat(t.fee))}
                            </td>
                            <td className="py-2 text-right text-muted-foreground">
                              {t.exchange_account?.exchange?.display_name ??
                                "Unknown"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {tradesWithFees.length > 50 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Showing first 50 of {tradesWithFees.length} fee
                      transactions. Download the Trading Fees CSV for the full
                      list.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })()}
        </>
      )}
    </div>
  );
}
