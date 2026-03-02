import { api } from "@/lib/api";
import type { DataFilters } from "@/lib/api";
import type { Position, FundingPayment, Trade } from "@/lib/queries";
import {
  computeFifoLots,
  buildFundingMap,
  type RawTrade,
  type TaxLot,
} from "@/lib/fifo-calculator";

export interface TaxReportData {
  year: number;
  positions: Position[];
  fundingPayments: FundingPayment[];
  summary: {
    totalRealizedPnL: number;
    totalFees: number;
    totalFunding: number;
    netTaxableIncome: number;
    shortTermGains: number;
    longTermGains: number;
    positionCount: number;
    fundingPaymentCount: number;
  };
}

function yearToTimestampRange(year: number): { since: number; until: number } {
  const since = new Date(year, 0, 1).getTime(); // Jan 1 00:00:00
  const until = new Date(year + 1, 0, 1).getTime() - 1; // Dec 31 23:59:59.999
  return { since, until };
}

function isLongTerm(startTime: number, endTime: number): boolean {
  const oneYear = 365.25 * 24 * 60 * 60 * 1000;
  return endTime - startTime > oneYear;
}

function formatDate(timestampMs: number): string {
  const d = new Date(timestampMs);
  return `${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getDate().toString().padStart(2, "0")}/${d.getFullYear()}`;
}

function formatUSD(value: number): string {
  return value.toFixed(2);
}

export async function fetchTaxReportData(year: number): Promise<TaxReportData> {
  const { since, until } = yearToTimestampRange(year);

  const filters: DataFilters = { since, until, timeField: "end_time" };

  // Fetch all positions closed in the tax year (paginate to get all)
  const allPositions: Position[] = [];
  let offset = 0;
  const pageSize = 500;
  while (true) {
    const result = await api.getPositions(pageSize, offset, filters);
    allPositions.push(...result.positions);
    if (allPositions.length >= result.totalCount || result.positions.length < pageSize) break;
    offset += pageSize;
  }

  // Fetch all funding payments in the tax year
  const fundingFilters: DataFilters = { since, until };
  const allFunding: FundingPayment[] = [];
  offset = 0;
  while (true) {
    const result = await api.getFundingPayments(pageSize, offset, fundingFilters);
    allFunding.push(...result.fundingPayments);
    if (allFunding.length >= result.totalCount || result.fundingPayments.length < pageSize) break;
    offset += pageSize;
  }

  // Calculate summary
  let totalRealizedPnL = 0;
  let totalFees = 0;
  let totalFunding = 0;
  let shortTermGains = 0;
  let longTermGains = 0;

  for (const pos of allPositions) {
    const pnl = parseFloat(pos.realized_pnl);
    const fees = parseFloat(pos.total_fees);
    const funding = parseFloat(pos.total_funding);
    totalRealizedPnL += pnl;
    totalFees += fees;
    totalFunding += funding;

    // For perps, holding period is position duration
    const gain = pnl;
    if (isLongTerm(pos.start_time, pos.end_time)) {
      longTermGains += gain;
    } else {
      shortTermGains += gain;
    }
  }

  // Funding payments not already included in positions are additional income
  // Note: position.total_funding already includes funding allocated to that position,
  // so we report funding separately for reference but don't double-count in net income
  let standaloneFunding = 0;
  for (const fp of allFunding) {
    standaloneFunding += parseFloat(fp.amount);
  }

  return {
    year,
    positions: allPositions,
    fundingPayments: allFunding,
    summary: {
      totalRealizedPnL,
      totalFees,
      totalFunding,
      netTaxableIncome: totalRealizedPnL, // PnL already includes fees and funding
      shortTermGains,
      longTermGains,
      positionCount: allPositions.length,
      fundingPaymentCount: allFunding.length,
    },
  };
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Formats a single position as a Form 8949 CSV row. */
function formatPosition8949Row(pos: Position): string {
  const quantity = parseFloat(pos.total_quantity);
  const entryPrice = parseFloat(pos.entry_avg_price);
  const exitPrice = parseFloat(pos.exit_avg_price);
  const fees = parseFloat(pos.total_fees);
  const funding = parseFloat(pos.total_funding);
  const exchangeName = pos.exchange_account?.exchange?.display_name || "Unknown";

  // Column (d): Proceeds — gross sale proceeds (no fee deduction here)
  const proceeds = pos.side === "long" ? exitPrice * quantity : entryPrice * quantity;
  // Column (e): Cost basis — gross purchase cost + fees (fees reduce gain)
  const costBasis =
    (pos.side === "long" ? entryPrice * quantity : exitPrice * quantity) + fees;
  // Column (f): Code — blank (no adjustment codes apply by default)
  const code = "";
  // Column (g): Adjustment — $0.00 (no wash-sale or other adjustments)
  const adjustment = 0;
  // Column (h): Gain or loss = (d) − (e) + (g)
  const gainOrLoss = proceeds - costBasis + adjustment;

  // Column (a): Description — "{qty} {asset} ({market_type} {side})"
  const description = `${quantity} ${pos.base_asset} (${pos.market_type} ${pos.side})`;

  return [
    escapeCsv(description),
    formatDate(pos.start_time),  // Column (b): Date acquired
    formatDate(pos.end_time),    // Column (c): Date sold
    formatUSD(proceeds),         // Column (d)
    formatUSD(costBasis),        // Column (e)
    code,                        // Column (f)
    formatUSD(adjustment),       // Column (g)
    formatUSD(gainOrLoss),       // Column (h)
    // Extra metadata (not part of 8949, for reference)
    formatUSD(fees),
    formatUSD(funding),
    isLongTerm(pos.start_time, pos.end_time) ? "Long" : "Short",
    escapeCsv(exchangeName),
    pos.market_type,
    pos.side,
    quantity.toString(),
  ].join(",");
}

export function generateForm8949Csv(data: TaxReportData): string {
  const lines: string[] = [];

  const header = [
    "Description",
    "Date Acquired",
    "Date Sold",
    "Proceeds",
    "Cost Basis",
    "Code",
    "Adjustment",
    "Gain or Loss",
    // Reference columns (not part of IRS form)
    "Fees",
    "Funding",
    "Term",
    "Exchange",
    "Market Type",
    "Side",
    "Quantity",
  ].join(",");

  // Split into Part I (short-term, ≤365 days) and Part II (long-term, >365 days)
  const sorted = [...data.positions].sort((a, b) => a.end_time - b.end_time);
  const shortTerm = sorted.filter((p) => !isLongTerm(p.start_time, p.end_time));
  const longTerm = sorted.filter((p) => isLongTerm(p.start_time, p.end_time));

  // Part I — Short-Term Capital Gains and Losses (Box C: transactions not reported on 1099-B)
  lines.push("Part I - Short-Term Capital Gains and Losses (Form 8949 Part I Box C)");
  lines.push(header);
  for (const pos of shortTerm) {
    lines.push(formatPosition8949Row(pos));
  }

  lines.push("");

  // Part II — Long-Term Capital Gains and Losses (Box F: transactions not reported on 1099-B)
  lines.push("Part II - Long-Term Capital Gains and Losses (Form 8949 Part II Box F)");
  lines.push(header);
  for (const pos of longTerm) {
    lines.push(formatPosition8949Row(pos));
  }

  return lines.join("\n");
}

export function generateFundingCsv(data: { fundingPayments: FundingPayment[] }): string {
  const lines: string[] = [];

  lines.push(
    ["Date", "Asset", "Quote Asset", "Amount (USD)", "Exchange", "Payment ID"].join(",")
  );

  const sorted = [...data.fundingPayments].sort(
    (a, b) => a.timestamp - b.timestamp
  );

  for (const fp of sorted) {
    const exchangeName = fp.exchange_account?.exchange?.display_name || "Unknown";
    lines.push(
      [
        formatDate(fp.timestamp),
        fp.base_asset,
        fp.quote_asset,
        formatUSD(parseFloat(fp.amount)),
        escapeCsv(exchangeName),
        fp.payment_id,
      ].join(",")
    );
  }

  return lines.join("\n");
}

/**
 * Generate a CSV of individual trading fees as separate line items (A8.6).
 *
 * - One row per trade with a non-zero fee.
 * - Sorted by timestamp ascending.
 * - Fees are already included in your Form 8949 cost basis; this export is
 *   for reference and record-keeping.
 */
export function generateFeesCsv(data: { trades: Trade[] }): string {
  const lines: string[] = [];

  lines.push(
    ["Date", "Asset", "Side", "Price", "Qty", "Fee (USD)", "Exchange"].join(",")
  );

  const tradesWithFees = [...data.trades]
    .filter((t) => parseFloat(t.fee) !== 0)
    .sort((a, b) => parseTradeTs(a.timestamp) - parseTradeTs(b.timestamp));

  for (const t of tradesWithFees) {
    const exchangeName =
      t.exchange_account?.exchange?.display_name ?? "Unknown";
    lines.push(
      [
        formatDate(parseTradeTs(t.timestamp)),
        escapeCsv(t.base_asset),
        t.side,
        formatUSD(parseFloat(t.price)),
        t.quantity,
        formatUSD(parseFloat(t.fee)),
        escapeCsv(exchangeName),
      ].join(",")
    );
  }

  return lines.join("\n");
}

export function generateSummaryCsv(data: TaxReportData): string {
  const lines: string[] = [];
  const s = data.summary;

  lines.push(`Tax Report Summary - ${data.year}`);
  lines.push("");
  lines.push("Category,Amount (USD)");
  lines.push(`Total Realized PnL,${formatUSD(s.totalRealizedPnL)}`);
  lines.push(`Short-Term Capital Gains (Form 8949 Part I, Box C),${formatUSD(s.shortTermGains)}`);
  lines.push(`Long-Term Capital Gains (Form 8949 Part II, Box F),${formatUSD(s.longTermGains)}`);
  lines.push(`Funding Payments (Ordinary Income),${formatUSD(s.totalFunding)}`);
  lines.push(`Total Fees,${formatUSD(s.totalFees)}`);
  lines.push("");
  lines.push(`Closed Positions,${s.positionCount}`);
  lines.push(`Funding Payments,${s.fundingPaymentCount}`);

  return lines.join("\n");
}

/**
 * Validates every position's Form 8949 math and returns an array of error strings.
 * A return value of [] means all positions are consistent.
 *
 * Checks:
 *  1. gain/loss == realized_pnl - total_funding  (confirms funding excluded from capital gain)
 *  2. gain/loss == proceeds - cost_basis          (Form 8949 column-h invariant)
 */
export function validateForm8949Data(data: TaxReportData): string[] {
  const errors: string[] = [];

  for (const pos of data.positions) {
    const qty = parseFloat(pos.total_quantity);
    const entry = parseFloat(pos.entry_avg_price);
    const exit = parseFloat(pos.exit_avg_price);
    const fees = parseFloat(pos.total_fees);

    const proceeds = pos.side === "long" ? exit * qty : entry * qty;
    const costBasis = (pos.side === "long" ? entry * qty : exit * qty) + fees;
    const gainOrLoss = proceeds - costBasis;

    // Check 1: gain should equal realized_pnl minus funding (funding is ordinary income, not capital gain)
    const expectedPnl = parseFloat(pos.realized_pnl) - parseFloat(pos.total_funding);
    if (Math.abs(gainOrLoss - expectedPnl) > 0.01) {
      errors.push(
        `Position ${pos.id}: gain/loss ${gainOrLoss.toFixed(2)} != expected ${expectedPnl.toFixed(2)}`
      );
    }

    // Check 2: Form 8949 column-h invariant — gain/loss must equal proceeds - cost_basis
    // (This is always true by construction above, but guards against future refactors)
    if (Math.abs(gainOrLoss - (proceeds - costBasis)) > 0.001) {
      errors.push(
        `Position ${pos.id}: gain/loss != proceeds - cost_basis (Form 8949 column math broken)`
      );
    }
  }

  return errors;
}

export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ─── TXF (TurboTax Import Format v042) ───────────────────────────────────────

/**
 * IRS Form 8949 box identifier.
 * Short-term: A (321), B (323), C (714)
 * Long-term:  D (711), E (712), F (713)
 *
 * For crypto exchanges that do NOT file 1099-B with the IRS, use Box B (short)
 * / Box E (long) — "Basis Not Reported to IRS".
 */
export type Form8949Box = "A" | "B" | "C" | "D" | "E" | "F";

/**
 * TXF v042 reference numbers per Form 8949 box.
 * Short-term: A→321, B→323, C→714
 * Long-term:  D→711, E→712, F→713
 */
export const FORM_8949_REFS: Record<Form8949Box, number> = {
  A: 321, // Short-term, basis reported to IRS
  B: 323, // Short-term, basis NOT reported to IRS
  C: 714, // Short-term, other
  D: 711, // Long-term, basis reported to IRS
  E: 712, // Long-term, basis NOT reported to IRS
  F: 713, // Long-term, other
};

/**
 * Derive the TXF reference number for a position.
 * A↔D, B↔E, C↔F share the same reporting-basis meaning; this function
 * automatically picks the short-term or long-term variant based on holding period.
 */
function getRefNumber(posIsLongTerm: boolean, box: Form8949Box): number {
  // 0 = basis reported, 1 = basis not reported, 2 = other
  const basis =
    box === "A" || box === "D" ? 0 : box === "B" || box === "E" ? 1 : 2;
  return posIsLongTerm
    ? [711, 712, 713][basis] // Box D, E, F
    : [321, 323, 714][basis]; // Box A, B, C
}

/**
 * Generate a TXF v042 string suitable for import into TurboTax.
 *
 * - Capital gains only (Form 8949 / Schedule D).
 * - Funding payments are ordinary income and are NOT included here.
 * - LONG  position: costBasis = entry × qty, proceeds = exit × qty
 * - SHORT position: costBasis = exit  × qty, proceeds = entry × qty
 * - Dollar amounts formatted as $XXXX.XX (no commas, 2 decimal places).
 * - All lines use CRLF line endings per the TXF spec.
 * - Each record ends with a "^" terminator line.
 *
 * @param data  Tax report data (positions + funding payments)
 * @param box   Form 8949 box that describes your reporting basis.
 *              Short-term or long-term is determined automatically per position.
 *              Default: "B" (short-term basis NOT reported to IRS — typical for crypto)
 */
export function generateTxf(data: TaxReportData, box: Form8949Box = "B"): string {
  const CRLF = "\r\n";
  const today = formatDate(Date.now());
  const parts: string[] = [];

  // TXF v042 header block
  parts.push(`V042${CRLF}`);
  parts.push(`AZif Terminal${CRLF}`);
  parts.push(`D${today}${CRLF}`);
  parts.push(`^${CRLF}`);

  // Sort by close date (end_time) ascending
  const sorted = [...data.positions].sort((a, b) => a.end_time - b.end_time);

  for (const pos of sorted) {
    const quantity = parseFloat(pos.total_quantity);
    const entryPrice = parseFloat(pos.entry_avg_price);
    const exitPrice = parseFloat(pos.exit_avg_price);

    // LONG:  costBasis = entry × qty,  proceeds = exit × qty
    // SHORT: costBasis = exit  × qty,  proceeds = entry × qty
    const proceeds =
      pos.side === "long" ? exitPrice * quantity : entryPrice * quantity;
    const costBasis =
      pos.side === "long" ? entryPrice * quantity : exitPrice * quantity;

    const longTerm = isLongTerm(pos.start_time, pos.end_time);
    const refNum = getRefNumber(longTerm, box);
    const description = `${pos.base_asset}/${pos.quote_asset} ${pos.side.toUpperCase()} (${pos.market_type})`;

    parts.push(`TD${CRLF}`);
    parts.push(`N${refNum}${CRLF}`);
    parts.push(`C1${CRLF}`);
    parts.push(`L1${CRLF}`);
    parts.push(`P${description}${CRLF}`);
    parts.push(`D${formatDate(pos.start_time)}${CRLF}`);
    parts.push(`D${formatDate(pos.end_time)}${CRLF}`);
    parts.push(`$${formatUSD(costBasis)}${CRLF}`);
    parts.push(`$${formatUSD(proceeds)}${CRLF}`);
    parts.push(`^${CRLF}`);
  }

  return parts.join("");
}

/**
 * Trigger a client-side download of a TXF file.
 */
export function downloadTxf(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface TxfValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a TXF v042 string.
 *
 * Checks:
 * - Version header ("V042" on line 1)
 * - Application name line (starts with "A")
 * - Date line (starts with "D")
 * - Header terminator ("^")
 * - Per-record: valid reference number, description line, 2 date lines
 *   (MM/DD/YYYY), 2 dollar amount lines ($XXXX.XX, no commas)
 */
export function validateTxf(content: string): TxfValidationResult {
  const errors: string[] = [];

  // Normalise line endings, drop blank lines
  const lines = content
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { valid: false, errors: ["Empty TXF content"] };
  }

  // ── Header validation ─────────────────────────────────────────────────────
  if (lines[0] !== "V042") {
    errors.push(`Line 1: expected "V042", got "${lines[0]}"`);
  }
  if (!lines[1]?.startsWith("A")) {
    errors.push('Line 2: expected application name line starting with "A"');
  }
  if (!lines[2]?.startsWith("D")) {
    errors.push('Line 3: expected date line starting with "D"');
  }
  if (lines[3] !== "^") {
    errors.push('Line 4: expected header terminator "^"');
  }

  // ── Transaction records ───────────────────────────────────────────────────
  const VALID_REFS = new Set([321, 323, 711, 712, 713, 714]);
  const DATE_RE = /^\d{2}\/\d{2}\/\d{4}$/;
  const AMOUNT_RE = /^\$\d+\.\d{2}$/;

  const bodyLines = lines.slice(4);
  let i = 0;
  let recordCount = 0;

  while (i < bodyLines.length) {
    if (bodyLines[i] !== "TD") {
      errors.push(
        `Expected "TD" to begin a record at body offset ${i}, got "${bodyLines[i]}"`
      );
      // Recover: skip to next "^"
      while (i < bodyLines.length && bodyLines[i] !== "^") i++;
      i++;
      continue;
    }

    // Collect all lines in this record (up to but not including "^")
    const record: string[] = [];
    while (i < bodyLines.length && bodyLines[i] !== "^") {
      record.push(bodyLines[i]);
      i++;
    }
    i++; // consume "^"
    recordCount++;

    // Reference number
    const refLine = record.find((l) => l.startsWith("N"));
    if (!refLine) {
      errors.push(`Record ${recordCount}: missing reference number line (N...)`);
    } else {
      const ref = parseInt(refLine.slice(1), 10);
      if (!VALID_REFS.has(ref)) {
        errors.push(
          `Record ${recordCount}: invalid reference number ${ref} (expected one of ${[...VALID_REFS].join(", ")})`
        );
      }
    }

    // Description
    if (!record.find((l) => l.startsWith("P"))) {
      errors.push(`Record ${recordCount}: missing description line (P...)`);
    }

    // Dates (need at least 2)
    const dateLines = record.filter((l) => l.startsWith("D"));
    if (dateLines.length < 2) {
      errors.push(
        `Record ${recordCount}: expected 2 date lines (D...), got ${dateLines.length}`
      );
    } else {
      for (const dl of dateLines) {
        const val = dl.slice(1);
        if (!DATE_RE.test(val)) {
          errors.push(
            `Record ${recordCount}: invalid date format "${val}" (expected MM/DD/YYYY)`
          );
        }
      }
    }

    // Dollar amounts (need at least 2)
    const dollarLines = record.filter((l) => l.startsWith("$"));
    if (dollarLines.length < 2) {
      errors.push(
        `Record ${recordCount}: expected 2 dollar amount lines ($...), got ${dollarLines.length}`
      );
    } else {
      for (const dl of dollarLines) {
        if (!AMOUNT_RE.test(dl)) {
          errors.push(
            `Record ${recordCount}: invalid dollar format "${dl}" (expected $XXXX.XX, no commas)`
          );
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── FIFO Cost Basis — A8.4 ──────────────────────────────────────────────────

/** The cost basis accounting method in use. */
export type CostBasisMethod = "FIFO" | "LIFO" | "weighted-average";

// Re-export FIFO types so callers can import from one place.
export type { TaxLot, RawTrade };

/** Tax report data computed using FIFO lot matching. */
export interface TaxReportDataFifo {
  year: number;
  /** FIFO-matched closed lots for the tax year. */
  lots: TaxLot[];
  /** Funding payments collected during the tax year (ordinary income). */
  fundingPayments: FundingPayment[];
  /** Raw trades fetched for the lookback window (used for fees CSV). */
  trades: Trade[];
  costBasisMethod: "FIFO" | "LIFO";
  summary: {
    totalRealizedPnL: number;
    totalFees: number;
    /** Net funding from the tax year's funding payments (not from lot allocation). */
    totalFunding: number;
    netTaxableIncome: number;
    shortTermGains: number;
    longTermGains: number;
    lotCount: number;
    fundingPaymentCount: number;
    /** Number of trades that have a non-zero fee (A8.6: separate line items). */
    tradeFeeCount: number;
  };
}

/**
 * Parse a trade timestamp that may be a numeric string (Unix ms) or an ISO
 * date string, returning Unix milliseconds.
 */
function parseTradeTs(timestamp: string): number {
  const n = Number(timestamp);
  return Number.isFinite(n) ? n : new Date(timestamp).getTime();
}

/**
 * Fetch all trades and funding payments for a tax year, then compute
 * FIFO or LIFO lot-matched tax data.
 *
 * To handle positions that span year boundaries (e.g. a 2023 buy closed in
 * 2025), trades are fetched from two years before the tax year start.
 * Only lots whose exitTime falls within the target tax year are returned.
 *
 * No backend changes are required — lot matching is computed client-side from
 * the existing raw-trades API.
 *
 * @param year   The tax year (e.g. 2026)
 * @param method "FIFO" (default) or "LIFO" — which lot is consumed first.
 */
export async function fetchTaxReportDataFifo(
  year: number,
  method: "FIFO" | "LIFO" = "FIFO"
): Promise<TaxReportDataFifo> {
  const { since, until } = yearToTimestampRange(year);

  // Two-year lookback covers virtually all crypto positions held across years.
  const TWO_YEARS_MS = 2 * 365.25 * 24 * 60 * 60 * 1000;
  const tradeSince = since - TWO_YEARS_MS;

  const pageSize = 500;
  let offset = 0;

  // Paginate through all trades in the lookback window
  const allTrades: Trade[] = [];
  while (true) {
    const result = await api.getTrades(pageSize, offset, {
      since: tradeSince,
      until,
    });
    allTrades.push(...result.trades);
    if (
      allTrades.length >= result.totalCount ||
      result.trades.length < pageSize
    )
      break;
    offset += pageSize;
  }

  // Fetch funding payments for the tax year only
  const allFunding: FundingPayment[] = [];
  offset = 0;
  while (true) {
    const result = await api.getFundingPayments(pageSize, offset, {
      since,
      until,
    });
    allFunding.push(...result.fundingPayments);
    if (
      allFunding.length >= result.totalCount ||
      result.fundingPayments.length < pageSize
    )
      break;
    offset += pageSize;
  }

  // Convert Trade[] → RawTrade[] for the FIFO engine
  const rawTrades: RawTrade[] = allTrades.map((t) => ({
    side: t.side,
    price: parseFloat(t.price),
    quantity: parseFloat(t.quantity),
    fee: parseFloat(t.fee),
    timestamp: parseTradeTs(t.timestamp),
    asset: t.base_asset,
    quoteAsset: t.quote_asset,
    marketType: t.market_type,
  }));

  // Run FIFO/LIFO matching with funding allocated per symbol
  const fundingMap = buildFundingMap(allFunding);
  const allLots = computeFifoLots(rawTrades, fundingMap, method.toLowerCase() as "fifo" | "lifo");

  // Keep only lots closed within the target tax year
  const taxYearLots = allLots.filter(
    (lot) => lot.exitTime >= since && lot.exitTime <= until
  );

  // Compute summary totals from the filtered lots
  let totalRealizedPnL = 0;
  let totalFees = 0;
  let shortTermGains = 0;
  let longTermGains = 0;

  for (const lot of taxYearLots) {
    totalRealizedPnL += lot.gainOrLoss;
    totalFees += lot.entryFee + lot.exitFee;
    if (lot.isLongTerm) {
      longTermGains += lot.gainOrLoss;
    } else {
      shortTermGains += lot.gainOrLoss;
    }
  }

  // Standalone funding total from raw funding payments (for ordinary income)
  let standaloneFunding = 0;
  for (const fp of allFunding) {
    standaloneFunding += parseFloat(fp.amount);
  }

  // Count trades with a non-zero fee (A8.6: each appears as a separate line item in fees CSV)
  const tradeFeeCount = allTrades.filter((t) => parseFloat(t.fee) !== 0).length;

  return {
    year,
    lots: taxYearLots,
    fundingPayments: allFunding,
    trades: allTrades,
    costBasisMethod: method,
    summary: {
      totalRealizedPnL,
      totalFees,
      totalFunding: standaloneFunding,
      netTaxableIncome: totalRealizedPnL,
      shortTermGains,
      longTermGains,
      lotCount: taxYearLots.length,
      fundingPaymentCount: allFunding.length,
      tradeFeeCount,
    },
  };
}

/** Format a single TaxLot as a Form 8949 CSV row (same columns as position CSV). */
function formatLot8949Row(lot: TaxLot): string {
  const qtyStr = lot.quantity.toLocaleString(undefined, {
    maximumFractionDigits: 8,
    useGrouping: false,
  });
  const description = `${qtyStr} ${lot.asset} (${lot.marketType} ${lot.lotType})`;
  const totalFees = lot.entryFee + lot.exitFee;

  return [
    escapeCsv(description),
    formatDate(lot.entryTime), // Column (b): Date acquired
    formatDate(lot.exitTime), // Column (c): Date sold
    formatUSD(lot.proceeds), // Column (d): Proceeds
    formatUSD(lot.costBasis), // Column (e): Cost Basis
    "", // Column (f): Code
    formatUSD(0), // Column (g): Adjustment
    formatUSD(lot.gainOrLoss), // Column (h): Gain or Loss
    // Reference columns (not part of IRS form)
    formatUSD(totalFees),
    formatUSD(lot.fundingAllocated),
    lot.isLongTerm ? "Long" : "Short",
    "N/A", // Exchange not available at lot level
    lot.marketType,
    lot.lotType,
    qtyStr,
  ].join(",");
}

/** Human-readable label for a cost basis method. */
function methodLabel(method: "FIFO" | "LIFO"): string {
  return method === "FIFO" ? "FIFO (First In, First Out)" : "LIFO (Last In, First Out)";
}

/**
 * Generate a Form 8949 CSV from FIFO/LIFO tax lots.
 *
 * Produces the same column structure as generateForm8949Csv() for tooling
 * compatibility. Adds a comment line noting the cost basis method used.
 */
export function generateForm8949CsvFromLots(data: TaxReportDataFifo): string {
  const lines: string[] = [];

  const header = [
    "Description",
    "Date Acquired",
    "Date Sold",
    "Proceeds",
    "Cost Basis",
    "Code",
    "Adjustment",
    "Gain or Loss",
    // Reference columns
    "Fees",
    "Funding",
    "Term",
    "Exchange",
    "Market Type",
    "Side",
    "Quantity",
  ].join(",");

  lines.push(`# Cost Basis Method: ${methodLabel(data.costBasisMethod)}`);
  lines.push("");

  const sorted = [...data.lots].sort((a, b) => a.exitTime - b.exitTime);
  const shortTerm = sorted.filter((l) => !l.isLongTerm);
  const longTerm = sorted.filter((l) => l.isLongTerm);

  lines.push(
    "Part I - Short-Term Capital Gains and Losses (Form 8949 Part I Box C)"
  );
  lines.push(header);
  for (const lot of shortTerm) {
    lines.push(formatLot8949Row(lot));
  }

  lines.push("");

  lines.push(
    "Part II - Long-Term Capital Gains and Losses (Form 8949 Part II Box F)"
  );
  lines.push(header);
  for (const lot of longTerm) {
    lines.push(formatLot8949Row(lot));
  }

  return lines.join("\n");
}

/**
 * Generate a summary CSV for FIFO/LIFO tax report data.
 * Includes the cost basis method in the report header.
 */
export function generateSummaryCsvFifo(data: TaxReportDataFifo): string {
  const lines: string[] = [];
  const s = data.summary;

  lines.push(`Tax Report Summary - ${data.year}`);
  lines.push(`Cost Basis Method,${methodLabel(data.costBasisMethod)}`);
  lines.push("");
  lines.push("Category,Amount (USD)");
  lines.push(`Total Realized PnL,${formatUSD(s.totalRealizedPnL)}`);
  lines.push(
    `Short-Term Capital Gains (Form 8949 Part I Box C),${formatUSD(s.shortTermGains)}`
  );
  lines.push(
    `Long-Term Capital Gains (Form 8949 Part II Box F),${formatUSD(s.longTermGains)}`
  );
  lines.push(
    `Funding Payments (Ordinary Income),${formatUSD(s.totalFunding)}`
  );
  lines.push(`Total Fees,${formatUSD(s.totalFees)}`);
  lines.push("");
  lines.push(`Closed Lots,${s.lotCount}`);
  lines.push(`Funding Payments,${s.fundingPaymentCount}`);
  lines.push(`Trade Fee Transactions,${s.tradeFeeCount}`);

  return lines.join("\n");
}

/**
 * Generate a TXF v042 string from FIFO/LIFO tax lots for TurboTax import.
 *
 * Identical structure to generateTxf() but operates on TaxLot[] instead
 * of Position[]. The lot description includes the method tag for identification.
 */
export function generateTxfFromLots(
  data: TaxReportDataFifo,
  box: Form8949Box = "B"
): string {
  const CRLF = "\r\n";
  const today = formatDate(Date.now());
  const parts: string[] = [];

  // TXF v042 header block
  parts.push(`V042${CRLF}`);
  parts.push(`AZif Terminal${CRLF}`);
  parts.push(`D${today}${CRLF}`);
  parts.push(`^${CRLF}`);

  const sorted = [...data.lots].sort((a, b) => a.exitTime - b.exitTime);

  for (const lot of sorted) {
    const refNum = getRefNumber(lot.isLongTerm, box);
    const description = `${lot.asset}/${lot.quoteAsset} ${lot.lotType.toUpperCase()} (${lot.marketType}) [${data.costBasisMethod}]`;

    parts.push(`TD${CRLF}`);
    parts.push(`N${refNum}${CRLF}`);
    parts.push(`C1${CRLF}`);
    parts.push(`L1${CRLF}`);
    parts.push(`P${description}${CRLF}`);
    parts.push(`D${formatDate(lot.entryTime)}${CRLF}`);
    parts.push(`D${formatDate(lot.exitTime)}${CRLF}`);
    parts.push(`$${formatUSD(lot.costBasis)}${CRLF}`);
    parts.push(`$${formatUSD(lot.proceeds)}${CRLF}`);
    parts.push(`^${CRLF}`);
  }

  return parts.join("");
}

/**
 * Validate FIFO lot math. Returns an array of error strings; empty = all OK.
 *
 * Checks:
 *  1. gainOrLoss == proceeds − costBasis  (Form 8949 column-h invariant)
 *  2. proceeds >= 0 and costBasis >= 0
 *  3. quantity > 0
 */
export function validateFifoData(data: TaxReportDataFifo): string[] {
  const errors: string[] = [];

  for (const lot of data.lots) {
    // Check 1: column-h invariant
    const expected = lot.proceeds - lot.costBasis;
    if (Math.abs(lot.gainOrLoss - expected) > 0.01) {
      errors.push(
        `Lot ${lot.id}: gainOrLoss ${lot.gainOrLoss.toFixed(2)} ≠ proceeds−costBasis ${expected.toFixed(2)}`
      );
    }

    // Check 2: non-negative amounts
    if (lot.proceeds < -0.001) {
      errors.push(`Lot ${lot.id}: negative proceeds ${lot.proceeds.toFixed(2)}`);
    }
    if (lot.costBasis < -0.001) {
      errors.push(
        `Lot ${lot.id}: negative costBasis ${lot.costBasis.toFixed(2)}`
      );
    }

    // Check 3: positive quantity
    if (lot.quantity <= 0) {
      errors.push(`Lot ${lot.id}: non-positive quantity ${lot.quantity}`);
    }
  }

  return errors;
}
