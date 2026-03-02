/**
 * Tests for TXF generation and validation (Criterion A8.3 — TurboTax import).
 *
 * All 16 acceptance-criteria tests from the implementation plan are covered here.
 * The test suite also writes a sample TXF fixture to
 *   src/lib/__tests__/fixtures/sample-tax-report.txf
 * which can be manually imported into TurboTax for human verification.
 *
 * Timezone note: vitest.config.ts sets TZ=UTC so date formatting is deterministic.
 */

import { vi, describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ── Mock @/lib/api so tax-report.ts can be imported in Node test environment ──
vi.mock("@/lib/api", () => ({
  api: {},
}));

import {
  generateTxf,
  validateTxf,
  generateForm8949Csv,
  FORM_8949_REFS,
} from "@/lib/tax-report";
import type { TaxReportData } from "@/lib/tax-report";

// ── Sample positions ──────────────────────────────────────────────────────────

// Timestamps (UTC, so formatDate produces predictable MM/DD/YYYY strings)
const BTC_START = Date.UTC(2025, 0, 15); // 2025-01-15  (Jan = month 0)
const BTC_END = Date.UTC(2025, 5, 30); //  2025-06-30  → 166 days  → SHORT-TERM
const ETH_START = Date.UTC(2024, 0, 1); //  2024-01-01
const ETH_END = Date.UTC(2025, 1, 15); //   2025-02-15  → ~411 days → LONG-TERM
const SOL_START = Date.UTC(2025, 2, 10); // 2025-03-10
const SOL_END = Date.UTC(2025, 8, 20); //   2025-09-20  → ~194 days → SHORT-TERM

// A minimal Position shape that satisfies what generateTxf / generateForm8949Csv read.
type MockPosition = {
  id: string;
  exchange_account_id: string;
  base_asset: string;
  quote_asset: string;
  side: "long" | "short";
  market_type: "perp" | "spot" | "swap";
  start_time: number;
  end_time: number;
  entry_avg_price: string;
  exit_avg_price: string;
  total_quantity: string;
  total_fees: string;
  realized_pnl: string;
  total_funding: string;
};

// Position 1 — BTC/USD perp, LONG, short-term
// costBasis = 42500 × 1 = 42500.00  |  proceeds = 51000 × 1 = 51000.00
const btcPos: MockPosition = {
  id: "pos-btc",
  exchange_account_id: "acc-1",
  base_asset: "BTC",
  quote_asset: "USD",
  side: "long",
  market_type: "perp",
  start_time: BTC_START,
  end_time: BTC_END,
  entry_avg_price: "42500.00",
  exit_avg_price: "51000.00",
  total_quantity: "1.0",
  total_fees: "85.00",
  realized_pnl: "8415.00",
  total_funding: "-85.00",
};

// Position 2 — ETH/USD perp, SHORT, long-term
// costBasis = exit × qty = 2600 × 5 = 13000.00  |  proceeds = entry × qty = 2200 × 5 = 11000.00
const ethPos: MockPosition = {
  id: "pos-eth",
  exchange_account_id: "acc-1",
  base_asset: "ETH",
  quote_asset: "USD",
  side: "short",
  market_type: "perp",
  start_time: ETH_START,
  end_time: ETH_END,
  entry_avg_price: "2200.00",
  exit_avg_price: "2600.00",
  total_quantity: "5.0",
  total_fees: "50.00",
  realized_pnl: "-2050.00",
  total_funding: "50.00",
};

// Position 3 — SOL/USD spot, LONG, short-term
// costBasis = 120 × 50 = 6000.00  |  proceeds = 155 × 50 = 7750.00
const solPos: MockPosition = {
  id: "pos-sol",
  exchange_account_id: "acc-1",
  base_asset: "SOL",
  quote_asset: "USD",
  side: "long",
  market_type: "spot",
  start_time: SOL_START,
  end_time: SOL_END,
  entry_avg_price: "120.00",
  exit_avg_price: "155.00",
  total_quantity: "50.0",
  total_fees: "25.00",
  realized_pnl: "1725.00",
  total_funding: "0.00",
};

const mockData: TaxReportData = {
  year: 2025,
  // Cast to satisfy the full Position type — our shape is structurally compatible
  positions: [btcPos, ethPos, solPos] as unknown as TaxReportData["positions"],
  fundingPayments: [],
  summary: {
    totalRealizedPnL: 8090.0,
    totalFees: 160.0,
    totalFunding: -35.0,
    netTaxableIncome: 8090.0,
    shortTermGains: 10140.0,
    longTermGains: -2050.0,
    positionCount: 3,
    fundingPaymentCount: 0,
  },
};

const emptyData: TaxReportData = {
  year: 2025,
  positions: [],
  fundingPayments: [],
  summary: {
    totalRealizedPnL: 0,
    totalFees: 0,
    totalFunding: 0,
    netTaxableIncome: 0,
    shortTermGains: 0,
    longTermGains: 0,
    positionCount: 0,
    fundingPaymentCount: 0,
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse TXF body into an array of field maps keyed by line prefix. */
function parseTxfRecords(
  txf: string
): Array<{
  ref: number;
  description: string;
  dateAcquired: string;
  dateSold: string;
  costBasis: string;
  proceeds: string;
}> {
  const lines = txf
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.length > 0);

  // Skip header block: V042, A..., D..., ^
  const bodyLines = lines.slice(4);
  const records = [];

  let i = 0;
  while (i < bodyLines.length) {
    if (bodyLines[i] !== "TD") {
      i++;
      continue;
    }
    const record: string[] = [];
    while (i < bodyLines.length && bodyLines[i] !== "^") {
      record.push(bodyLines[i]);
      i++;
    }
    i++; // consume "^"

    const refLine = record.find((l) => l.startsWith("N"));
    const pLine = record.find((l) => l.startsWith("P"));
    const dLines = record.filter((l) => l.startsWith("D")).map((l) => l.slice(1));
    const dollarLines = record
      .filter((l) => l.startsWith("$"))
      .map((l) => l.slice(1));

    records.push({
      ref: refLine ? parseInt(refLine.slice(1), 10) : -1,
      description: pLine ? pLine.slice(1) : "",
      dateAcquired: dLines[0] ?? "",
      dateSold: dLines[1] ?? "",
      costBasis: dollarLines[0] ?? "",
      proceeds: dollarLines[1] ?? "",
    });
  }
  return records;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("generateTxf", () => {
  let txf: string;

  beforeAll(() => {
    txf = generateTxf(mockData, "B");
  });

  // 1. Header has V042 on first line
  it("1. header has V042 on first line", () => {
    const firstLine = txf.split("\r\n")[0];
    expect(firstLine).toBe("V042");
  });

  // 2. Header contains a date in MM/DD/YYYY format
  it("2. header date is MM/DD/YYYY format", () => {
    const lines = txf.split("\r\n");
    const dateLine = lines.find((l) => l.startsWith("D") && !l.startsWith("TD"));
    expect(dateLine).toBeDefined();
    const dateVal = dateLine!.slice(1);
    expect(dateVal).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  // 3. Header uses CRLF line endings
  it("3. header block uses CRLF line endings", () => {
    // The raw string must contain \r\n — split on \r\n gives clean lines
    expect(txf).toContain("\r\n");
    // Splitting on CRLF then LF should give the same result (no extra \r)
    const crlfLines = txf.split("\r\n");
    expect(crlfLines[0]).toBe("V042");
    expect(crlfLines[1]).toMatch(/^AZif Terminal/);
  });

  // 4. Empty positions array → valid TXF with just header
  it("4. empty positions array produces valid TXF with just a header", () => {
    const empty = generateTxf(emptyData, "B");
    const lines = empty
      .replace(/\r\n/g, "\n")
      .split("\n")
      .filter((l) => l.length > 0);
    expect(lines[0]).toBe("V042");
    expect(lines[1]).toMatch(/^A/);
    expect(lines[2]).toMatch(/^D/);
    expect(lines[3]).toBe("^");
    // No further lines
    expect(lines.length).toBe(4);
    const result = validateTxf(empty);
    expect(result.valid).toBe(true);
  });

  // 5. Short-term LONG BTC position → ref 323 (Box B, not reported)
  it("5. short-term long BTC position uses ref 323 (Box B)", () => {
    const records = parseTxfRecords(txf);
    const btc = records.find((r) => r.description.includes("BTC"));
    expect(btc).toBeDefined();
    expect(btc!.ref).toBe(FORM_8949_REFS["B"]); // 323
  });

  // 6. Long-term SHORT ETH position → ref 712 (Box E, not reported)
  it("6. long-term short ETH position uses ref 712 (Box E)", () => {
    const records = parseTxfRecords(txf);
    const eth = records.find((r) => r.description.includes("ETH"));
    expect(eth).toBeDefined();
    expect(eth!.ref).toBe(FORM_8949_REFS["E"]); // 712
  });

  // 7. LONG position: costBasis = entry × qty, proceeds = exit × qty
  it("7. LONG position: costBasis = entry × qty, proceeds = exit × qty", () => {
    const records = parseTxfRecords(txf);
    const btc = records.find((r) => r.description.includes("BTC"))!;
    // entry = 42500, qty = 1  → costBasis = 42500.00
    expect(btc.costBasis).toBe("42500.00");
    // exit  = 51000, qty = 1  → proceeds  = 51000.00
    expect(btc.proceeds).toBe("51000.00");
  });

  // 8. SHORT position: costBasis = exit × qty, proceeds = entry × qty
  it("8. SHORT position: costBasis = exit × qty, proceeds = entry × qty", () => {
    const records = parseTxfRecords(txf);
    const eth = records.find((r) => r.description.includes("ETH"))!;
    // exit  = 2600, qty = 5  → costBasis = 13000.00
    expect(eth.costBasis).toBe("13000.00");
    // entry = 2200, qty = 5  → proceeds  = 11000.00
    expect(eth.proceeds).toBe("11000.00");
  });

  // 9. Date format → MM/DD/YYYY
  it("9. all dates in records are MM/DD/YYYY format", () => {
    const DATE_RE = /^\d{2}\/\d{2}\/\d{4}$/;
    const records = parseTxfRecords(txf);
    expect(records.length).toBeGreaterThan(0);
    for (const rec of records) {
      expect(rec.dateAcquired).toMatch(DATE_RE);
      expect(rec.dateSold).toMatch(DATE_RE);
    }
  });

  // 10. Dollar format → $XXXX.XX with no commas
  it("10. dollar amounts are $XXXX.XX format with no commas", () => {
    const AMOUNT_RE = /^\$\d+\.\d{2}$/;
    // Extract raw $ lines from TXF
    const lines = txf
      .replace(/\r\n/g, "\n")
      .split("\n")
      .filter((l) => l.startsWith("$"));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).toMatch(AMOUNT_RE);
      // No commas
      expect(line).not.toContain(",");
    }
  });

  // 11. Each record ends with ^
  it("11. every transaction record is terminated with ^", () => {
    // 1 header "^" + 3 position records = 4 total "^" occurrences
    const caretCount = (txf.match(/\^/g) ?? []).length;
    expect(caretCount).toBe(1 + mockData.positions.length);
    // Also verify: every "^" is on its own CRLF-terminated line
    const crlfLines = txf.split("\r\n");
    const caretLines = crlfLines.filter((l) => l === "^");
    expect(caretLines.length).toBe(1 + mockData.positions.length);
  });

  // 12. CRLF line endings everywhere
  it("12. all lines use CRLF line endings", () => {
    // Every occurrence of \n should be preceded by \r
    const lfWithoutCr = txf.replace(/\r\n/g, "").includes("\n");
    expect(lfWithoutCr).toBe(false);
  });
});

// ── validateTxf tests ─────────────────────────────────────────────────────────

describe("validateTxf", () => {
  // 13. validateTxf passes on well-formed output
  it("13. validateTxf() returns valid:true on output from generateTxf()", () => {
    const txf = generateTxf(mockData, "B");
    const result = validateTxf(txf);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("13b. validateTxf() also passes for all six boxes", () => {
    const boxes = ["A", "B", "C", "D", "E", "F"] as const;
    for (const box of boxes) {
      const txf = generateTxf(mockData, box);
      const result = validateTxf(txf);
      expect(result.valid).toBe(true);
    }
  });

  // 14. validateTxf catches malformed header (missing V042)
  it("14. validateTxf() catches malformed header (missing V042)", () => {
    const bad = "BADHEADER\r\nAZif Terminal\r\nD03/02/2026\r\n^\r\n";
    const result = validateTxf(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("V042"))).toBe(true);
  });

  // 15. validateTxf catches missing $ line
  it("15. validateTxf() catches missing $ (dollar amount) line", () => {
    // Build a valid TXF then surgically remove one $ line from the first record
    const good = generateTxf(mockData, "B");
    // Remove the first $ line
    const bad = good.replace(/^\$.*\r\n/m, "");
    const result = validateTxf(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("dollar"))).toBe(true);
  });
});

// ── End-to-end field validation ────────────────────────────────────────────────

describe("end-to-end TXF validation", () => {
  it("parses every block: correct field counts, valid refs, valid dates, 2-decimal dollars", () => {
    const txf = generateTxf(mockData, "B");
    const VALID_REFS = new Set([321, 323, 711, 712, 713, 714]);
    const DATE_RE = /^\d{2}\/\d{2}\/\d{4}$/;

    const records = parseTxfRecords(txf);

    // Number of records equals number of positions
    expect(records.length).toBe(mockData.positions.length);

    for (const rec of records) {
      // Valid reference number
      expect(VALID_REFS.has(rec.ref)).toBe(true);

      // Valid dates
      expect(rec.dateAcquired).toMatch(DATE_RE);
      expect(rec.dateSold).toMatch(DATE_RE);

      // Dollar amounts: exactly 2 decimal places, no commas
      const checkAmount = (v: string) => {
        expect(v).toMatch(/^\d+\.\d{2}$/); // 2 decimal places ($ stripped by parseTxfRecords)
        expect(v).not.toContain(",");
      };
      checkAmount(rec.costBasis);
      checkAmount(rec.proceeds);
    }
  });
});

// ── Round-trip consistency ────────────────────────────────────────────────────

describe("round-trip consistency", () => {
  // 16. generateForm8949Csv and generateTxf agree on proceeds and dates
  it("16. generateForm8949Csv and generateTxf produce identical proceeds and dates for each position", () => {
    const csv = generateForm8949Csv(mockData);
    const txf = generateTxf(mockData, "B");

    // generateForm8949Csv has a Part I / Part II structure with two column-header
    // rows ("Description,…"). Extract only data rows by excluding section labels
    // ("Part I…", "Part II…"), column headers, and blank lines.
    const DATE_RE = /^\d{2}\/\d{2}\/\d{4}$/;
    const csvDataRows = csv
      .split("\n")
      .filter((l) => {
        if (!l.trim()) return false;
        if (l.startsWith("Part ")) return false;
        if (l.startsWith("Description,")) return false;
        return true;
      })
      .map((l) => l.split(","));
    // CSV columns: Description(0), Date Acquired(1), Date Sold(2),
    //              Proceeds(3), Cost Basis(4) …

    const txfRecords = parseTxfRecords(txf);

    // Same total position count in both outputs
    expect(csvDataRows.length).toBe(mockData.positions.length);
    expect(txfRecords.length).toBe(mockData.positions.length);

    // Index CSV rows by (dateAcquired + dateSold) — each position has a unique date pair
    const csvByDates = new Map<string, string[]>();
    for (const row of csvDataRows) {
      const dateAcquired = row[1];
      const dateSold = row[2];
      if (DATE_RE.test(dateAcquired) && DATE_RE.test(dateSold)) {
        csvByDates.set(`${dateAcquired}|${dateSold}`, row);
      }
    }

    // For each TXF record find the matching CSV row and verify proceeds & dates.
    // Note: cost basis intentionally differs — generateForm8949Csv adds fees to
    // cost basis (reduces taxable gain on column h) while generateTxf reports the
    // raw basis without fees (TXF column-g adjustments not used here).
    for (const rec of txfRecords) {
      const key = `${rec.dateAcquired}|${rec.dateSold}`;
      const csvRow = csvByDates.get(key);
      expect(csvRow).toBeDefined(); // every TXF record must have a matching CSV row

      if (csvRow) {
        // Dates match exactly
        expect(csvRow[1]).toBe(rec.dateAcquired);
        expect(csvRow[2]).toBe(rec.dateSold);

        // Proceeds formula is the same in both functions
        const csvProceeds = parseFloat(csvRow[3]);
        const txfProceeds = parseFloat(rec.proceeds);
        expect(csvProceeds).toBeCloseTo(txfProceeds, 2);
      }
    }
  });
});

// ── Fixture file ──────────────────────────────────────────────────────────────

describe("fixture file", () => {
  it("writes sample TXF to fixtures/sample-tax-report.txf for manual TurboTax import", () => {
    const txf = generateTxf(mockData, "B");
    const fixtureDir = path.resolve(__dirname, "fixtures");
    const fixturePath = path.join(fixtureDir, "sample-tax-report.txf");

    fs.mkdirSync(fixtureDir, { recursive: true });
    fs.writeFileSync(fixturePath, txf, "utf-8");

    // Verify written content is identical
    const written = fs.readFileSync(fixturePath, "utf-8");
    expect(written).toBe(txf);

    // validateTxf must pass on the written file
    const result = validateTxf(written);
    expect(result.valid).toBe(true);
  });
});
