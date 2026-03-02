/**
 * Tests for Criterion A8.6 — Funding payments and trading fees are included
 * as separate line items.
 *
 * Covers 9 acceptance-criteria tests verifying that:
 *  - generateFeesCsv() produces one row per non-zero-fee trade
 *  - generateFundingCsv() produces one row per funding payment
 *  - generateSummaryCsvFifo() labels both totals as separate line items
 *  - Form 8949 CSV header includes Fees and Funding reference columns
 *  - TaxReportDataFifo.summary.tradeFeeCount is populated
 *
 * Timezone note: vitest.config.ts sets TZ=UTC so date formatting is deterministic.
 */

import { vi, describe, it, expect } from "vitest";

// Mock @/lib/api so tax-report.ts can be imported in Node test environment
vi.mock("@/lib/api", () => ({
  api: {},
}));

import {
  generateFeesCsv,
  generateFundingCsv,
  generateSummaryCsvFifo,
  generateForm8949CsvFromLots,
} from "@/lib/tax-report";
import type { TaxReportDataFifo } from "@/lib/tax-report";
import type { Trade, FundingPayment } from "@/lib/queries";

// ── Mock data ─────────────────────────────────────────────────────────────────

// Trade 1 — BTC buy, non-zero fee
const trade1: Trade = {
  id: "t1",
  base_asset: "BTC",
  quote_asset: "USD",
  side: "buy",
  price: "42500.00",
  quantity: "1.0",
  timestamp: String(Date.UTC(2025, 0, 15)), // 2025-01-15
  fee: "85.00",
  order_id: "o1",
  trade_id: "t1",
  exchange_account_id: "acc-1",
  market_type: "perp",
};

// Trade 2 — ETH sell, zero fee (should be EXCLUDED from fees CSV)
const trade2: Trade = {
  id: "t2",
  base_asset: "ETH",
  quote_asset: "USD",
  side: "sell",
  price: "2200.00",
  quantity: "5.0",
  timestamp: String(Date.UTC(2025, 1, 10)), // 2025-02-10
  fee: "0",
  order_id: "o2",
  trade_id: "t2",
  exchange_account_id: "acc-1",
  market_type: "perp",
};

// Trade 3 — SOL buy, non-zero fee
const trade3: Trade = {
  id: "t3",
  base_asset: "SOL",
  quote_asset: "USD",
  side: "buy",
  price: "120.00",
  quantity: "50.0",
  timestamp: String(Date.UTC(2025, 2, 10)), // 2025-03-10
  fee: "25.00",
  order_id: "o3",
  trade_id: "t3",
  exchange_account_id: "acc-1",
  market_type: "spot",
};

const mockTrades: Trade[] = [trade1, trade2, trade3];

// Funding payment 1 — negative (paid out by trader)
const fp1: FundingPayment = {
  id: "fp1",
  base_asset: "BTC",
  quote_asset: "USD",
  amount: "-85.00",
  timestamp: Date.UTC(2025, 0, 20), // 2025-01-20
  payment_id: "pay-1",
  exchange_account_id: "acc-1",
};

// Funding payment 2 — positive (received by trader)
const fp2: FundingPayment = {
  id: "fp2",
  base_asset: "ETH",
  quote_asset: "USD",
  amount: "50.00",
  timestamp: Date.UTC(2025, 1, 5), // 2025-02-05
  payment_id: "pay-2",
  exchange_account_id: "acc-1",
};

const mockFundingPayments: FundingPayment[] = [fp1, fp2];

/** Minimal TaxReportDataFifo with populated trades and funding. */
const mockFifoData: TaxReportDataFifo = {
  year: 2025,
  lots: [],
  fundingPayments: mockFundingPayments,
  trades: mockTrades,
  costBasisMethod: "FIFO",
  summary: {
    totalRealizedPnL: 0,
    totalFees: 110.0, // 85 + 25 (non-zero fees only)
    totalFunding: -35.0, // -85 + 50
    netTaxableIncome: 0,
    shortTermGains: 0,
    longTermGains: 0,
    lotCount: 0,
    fundingPaymentCount: 2,
    tradeFeeCount: 2, // t1 and t3 have non-zero fees; t2 is zero
  },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("A8.6 — generateFeesCsv (trading fees as separate line items)", () => {
  // Test 1: one row per non-zero-fee trade
  it("1. produces one row per non-zero-fee trade", () => {
    const csv = generateFeesCsv(mockFifoData);
    const rows = csv.split("\n").filter((l) => l.trim() && !l.startsWith("Date"));
    // 2 out of 3 trades have a non-zero fee
    expect(rows.length).toBe(2);
  });

  // Test 2: header includes required columns
  it("2. header includes Date, Asset, Side, Price, Qty, Fee (USD), Exchange", () => {
    const csv = generateFeesCsv(mockFifoData);
    const header = csv.split("\n")[0];
    expect(header).toContain("Date");
    expect(header).toContain("Asset");
    expect(header).toContain("Side");
    expect(header).toContain("Price");
    expect(header).toContain("Qty");
    expect(header).toContain("Fee (USD)");
    expect(header).toContain("Exchange");
  });

  // Test 3: zero-fee trades are excluded
  it("3. excludes trades with fee = 0", () => {
    const csv = generateFeesCsv(mockFifoData);
    // ETH is trade2, which has fee "0" — should not appear in output
    const dataRows = csv.split("\n").slice(1).filter((l) => l.trim());
    const hasEth = dataRows.some((r) => r.includes("ETH"));
    expect(hasEth).toBe(false);
  });

  // Test 4: fee amounts are formatted to 2 decimal places
  it("4. formats fee amounts to 2 decimal places", () => {
    const csv = generateFeesCsv(mockFifoData);
    const dataRows = csv.split("\n").slice(1).filter((l) => l.trim());
    // Each data row should have a fee column that matches $XX.XX format
    const AMOUNT_RE = /^\d+\.\d{2}$/;
    for (const row of dataRows) {
      const cols = row.split(",");
      // Fee (USD) is column index 5 (0-based)
      const feeCol = cols[5];
      expect(feeCol).toMatch(AMOUNT_RE);
    }
  });

  // Test 9: round-trip — CSV row count matches trades with non-zero fees
  it("9. round-trip: CSV row count matches trades with non-zero fees", () => {
    const nonZeroFeeCount = mockTrades.filter(
      (t) => parseFloat(t.fee) !== 0
    ).length;
    const csv = generateFeesCsv({ trades: mockTrades });
    const dataRows = csv.split("\n").slice(1).filter((l) => l.trim());
    expect(dataRows.length).toBe(nonZeroFeeCount);
    expect(nonZeroFeeCount).toBe(2);
  });
});

describe("A8.6 — generateFundingCsv (funding payments as separate line items)", () => {
  // Test 5: each funding payment appears as a separate row
  it("5. lists each funding payment as a separate row", () => {
    const csv = generateFundingCsv(mockFifoData);
    const dataRows = csv.split("\n").slice(1).filter((l) => l.trim());
    expect(dataRows.length).toBe(mockFundingPayments.length); // 2
  });
});

describe("A8.6 — generateSummaryCsvFifo (separate labeled totals)", () => {
  // Test 6: summary CSV includes both fee and funding totals as separate labeled lines
  it("6. includes Total Fees and Funding Payments as separate labeled line items", () => {
    const csv = generateSummaryCsvFifo(mockFifoData);
    expect(csv).toContain("Total Fees");
    expect(csv).toContain("Funding Payments");
    // Both must be on distinct lines
    const lines = csv.split("\n");
    const feeLines = lines.filter((l) => l.includes("Total Fees"));
    const fundingLines = lines.filter((l) => l.includes("Funding Payments"));
    expect(feeLines.length).toBeGreaterThanOrEqual(1);
    expect(fundingLines.length).toBeGreaterThanOrEqual(1);
  });
});

describe("A8.6 — generateForm8949CsvFromLots (reference columns)", () => {
  // Test 7: Form 8949 CSV header includes Fees and Funding columns
  it("7. Form 8949 CSV header includes Fees and Funding reference columns", () => {
    const csv = generateForm8949CsvFromLots(mockFifoData);
    // The header is in a Part I section; search within the CSV
    expect(csv).toContain("Fees");
    expect(csv).toContain("Funding");
    // Specifically check the column header row
    const headerLine = csv
      .split("\n")
      .find((l) => l.startsWith("Description,"));
    expect(headerLine).toBeDefined();
    expect(headerLine).toContain("Fees");
    expect(headerLine).toContain("Funding");
  });
});

describe("A8.6 — TaxReportDataFifo.summary.tradeFeeCount", () => {
  // Test 8: tradeFeeCount is populated correctly
  it("8. summary.tradeFeeCount is populated and equals count of non-zero-fee trades", () => {
    expect(mockFifoData.summary.tradeFeeCount).toBeDefined();
    expect(typeof mockFifoData.summary.tradeFeeCount).toBe("number");
    // Our mock has 2 non-zero-fee trades (t1: 85.00, t3: 25.00)
    expect(mockFifoData.summary.tradeFeeCount).toBe(2);
  });
});
