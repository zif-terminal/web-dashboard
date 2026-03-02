/**
 * FIFO Calculator — Unit Tests (A8.4 Verification)
 *
 * These tests trace sequences of buys/sells and verify that FIFO lot ordering
 * is correctly applied. They constitute the automated acceptance criterion for
 * A8.4: "The tax report uses FIFO cost basis method by default."
 *
 * Test coverage:
 *  1.  Basic FIFO ordering (oldest buy price used, not weighted average)
 *  2.  Sell spanning multiple lots (FIFO consumes oldest lot first)
 *  3.  Partial close preserves lot queue (remaining qty stays in queue)
 *  4.  Holding period classification per lot (long-term vs short-term)
 *  5.  Short position FIFO (oldest short entry used first)
 *  6.  Position flip (excess sell opens a short after closing all longs)
 *  7.  FIFO vs weighted average (same trades, different gains)
 *  8.  Fee allocation (proportional per lot based on matched quantity)
 *  9.  Tax year filtering (only lots with exits in target year counted)
 * 10.  Perp funding allocation (distributed pro-rata by lot quantity)
 */

import { describe, it, expect } from "vitest";
import { computeFifoLots, buildFundingMap } from "../fifo-calculator";
import type { RawTrade } from "../fifo-calculator";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Unix ms for a well-known date (UTC, since vitest.config.ts sets TZ=UTC). */
const JAN_1_2025 = new Date("2025-01-01T00:00:00Z").getTime();
const JUL_1_2025 = new Date("2025-07-01T00:00:00Z").getTime();
const FEB_1_2026 = new Date("2026-02-01T00:00:00Z").getTime();

/** Convenience sequential timestamps: t1 < t2 < t3 < t4 (1 day apart). */
const DAY_MS = 86_400_000;
const t1 = JAN_1_2025;
const t2 = JAN_1_2025 + DAY_MS;
const t3 = JAN_1_2025 + 2 * DAY_MS;
const t4 = JAN_1_2025 + 3 * DAY_MS;

function makeTrade(
  side: "buy" | "sell",
  qty: number,
  price: number,
  timestamp: number,
  fee: number = 0,
  asset: string = "BTC",
  quoteAsset: string = "USDT",
  marketType: "perp" | "spot" | "swap" = "perp"
): RawTrade {
  return { side, price, quantity: qty, fee, timestamp, asset, quoteAsset, marketType };
}

// ---------------------------------------------------------------------------
// Test 1: Basic FIFO ordering
// ---------------------------------------------------------------------------

describe("Test 1: Basic FIFO ordering", () => {
  it("uses the oldest buy's price, not the weighted average", () => {
    // Buy 5 @ $100 (oldest), Buy 5 @ $110, Sell 5 @ $120
    // FIFO: entry = $100 (oldest buy)
    // Weighted avg would give entry = ($100*5 + $110*5)/10 = $105
    const lots = computeFifoLots([
      makeTrade("buy", 5, 100, t1),
      makeTrade("buy", 5, 110, t2),
      makeTrade("sell", 5, 120, t3),
    ]);

    expect(lots).toHaveLength(1);
    expect(lots[0].lotType).toBe("long");
    expect(lots[0].entryPrice).toBe(100); // FIFO: oldest buy
    expect(lots[0].quantity).toBe(5);
    expect(lots[0].proceeds).toBeCloseTo(120 * 5);  // 600
    expect(lots[0].costBasis).toBeCloseTo(100 * 5); // 500 (no fees)
    expect(lots[0].gainOrLoss).toBeCloseTo(100);     // (120-100)*5

    // Confirm it is NOT the weighted average entry price
    expect(lots[0].entryPrice).not.toBe(105);
  });
});

// ---------------------------------------------------------------------------
// Test 2: Sell spanning multiple lots
// ---------------------------------------------------------------------------

describe("Test 2: Sell spanning multiple lots", () => {
  it("FIFO consumes oldest lot first; partial from second lot is a separate lot", () => {
    // Buy 5 @ $100, Buy 5 @ $110, Sell 8 @ $120
    // Lot 1: qty=5, entry=$100 (first buy fully consumed)
    // Lot 2: qty=3, entry=$110 (second buy partially consumed)
    const lots = computeFifoLots([
      makeTrade("buy", 5, 100, t1),
      makeTrade("buy", 5, 110, t2),
      makeTrade("sell", 8, 120, t3),
    ]);

    expect(lots).toHaveLength(2);

    // Lot 1: oldest buy fully matched
    expect(lots[0].entryPrice).toBe(100);
    expect(lots[0].quantity).toBe(5);
    expect(lots[0].exitPrice).toBe(120);

    // Lot 2: 3 units from the second buy
    expect(lots[1].entryPrice).toBe(110);
    expect(lots[1].quantity).toBe(3);
    expect(lots[1].exitPrice).toBe(120);
  });
});

// ---------------------------------------------------------------------------
// Test 3: Partial close preserves lot queue
// ---------------------------------------------------------------------------

describe("Test 3: Partial close preserves lot queue", () => {
  it("two sequential sells each come from the same original buy lot at $100", () => {
    // Buy 10 @ $100, Sell 3 @ $110, Sell 7 @ $120
    // Both sells must use entry=$100 (the only lot in the queue)
    const lots = computeFifoLots([
      makeTrade("buy", 10, 100, t1),
      makeTrade("sell", 3, 110, t2),
      makeTrade("sell", 7, 120, t3),
    ]);

    expect(lots).toHaveLength(2);

    // Lot 1: 3 units from the buy at $100, exited at $110
    expect(lots[0].entryPrice).toBe(100);
    expect(lots[0].quantity).toBe(3);
    expect(lots[0].exitPrice).toBe(110);

    // Lot 2: remaining 7 units from the same buy at $100, exited at $120
    expect(lots[1].entryPrice).toBe(100);
    expect(lots[1].quantity).toBe(7);
    expect(lots[1].exitPrice).toBe(120);
  });
});

// ---------------------------------------------------------------------------
// Test 4: Holding period classification per lot
// ---------------------------------------------------------------------------

describe("Test 4: Holding period classification per lot", () => {
  it("correctly identifies long-term (>365.25d) and short-term lots from the same sell", () => {
    // Buy 5 @ $100 on Jan 1 2025  → held ~396 days to Feb 1 2026 → LONG-TERM
    // Buy 5 @ $100 on Jul 1 2025  → held ~215 days to Feb 1 2026 → SHORT-TERM
    // Sell 10 @ $120 on Feb 1 2026 closes both
    //
    // A weighted-average approach would compute a single average entry date
    // and misclassify one or both lots. FIFO preserves each lot's entry date.
    const lots = computeFifoLots([
      makeTrade("buy", 5, 100, JAN_1_2025),
      makeTrade("buy", 5, 100, JUL_1_2025),
      makeTrade("sell", 10, 120, FEB_1_2026),
    ]);

    expect(lots).toHaveLength(2);

    const jan1Lot = lots.find((l) => l.entryTime === JAN_1_2025);
    const jul1Lot = lots.find((l) => l.entryTime === JUL_1_2025);

    expect(jan1Lot).toBeDefined();
    expect(jul1Lot).toBeDefined();

    // Jan 1 2025 → Feb 1 2026 ≈ 396 days > 365.25 → long-term
    expect(jan1Lot!.isLongTerm).toBe(true);

    // Jul 1 2025 → Feb 1 2026 ≈ 215 days < 365.25 → short-term
    expect(jul1Lot!.isLongTerm).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 5: Short position FIFO
// ---------------------------------------------------------------------------

describe("Test 5: Short position FIFO", () => {
  it("uses the oldest short entry price when covering", () => {
    // Sell 5 @ $120 (first short), Sell 5 @ $110 (second short), Buy 5 @ $100 (cover)
    // FIFO: cover closes the oldest short (entry=$120), gain=(120-100)*5=100
    const lots = computeFifoLots([
      makeTrade("sell", 5, 120, t1),
      makeTrade("sell", 5, 110, t2),
      makeTrade("buy", 5, 100, t3),
    ]);

    expect(lots).toHaveLength(1);
    expect(lots[0].lotType).toBe("short");
    expect(lots[0].entryPrice).toBe(120); // oldest short entry
    expect(lots[0].exitPrice).toBe(100);  // cover price
    expect(lots[0].quantity).toBe(5);

    // Short gain: proceeds = entryPrice*qty = 600, costBasis = exitPrice*qty = 500
    expect(lots[0].proceeds).toBeCloseTo(120 * 5);  // 600
    expect(lots[0].costBasis).toBeCloseTo(100 * 5); // 500
    expect(lots[0].gainOrLoss).toBeCloseTo(100);     // (120-100)*5
  });
});

// ---------------------------------------------------------------------------
// Test 6: Position flip
// ---------------------------------------------------------------------------

describe("Test 6: Position flip", () => {
  it("closes the long portion then opens a short for the excess sell quantity", () => {
    // Buy 5 @ $100, Sell 8 @ $120
    // → Lot 1: long 5 units (entry=$100, exit=$120)
    // → 3 units of excess sell → opens a short position
    const lotsAfterFlip = computeFifoLots([
      makeTrade("buy", 5, 100, t1),
      makeTrade("sell", 8, 120, t2),
    ]);

    // Only the closed long lot appears; the 3-unit short is still open
    expect(lotsAfterFlip).toHaveLength(1);
    expect(lotsAfterFlip[0].lotType).toBe("long");
    expect(lotsAfterFlip[0].quantity).toBe(5);
    expect(lotsAfterFlip[0].entryPrice).toBe(100);
    expect(lotsAfterFlip[0].exitPrice).toBe(120);
    expect(lotsAfterFlip[0].gainOrLoss).toBeCloseTo((120 - 100) * 5); // 100

    // Verify the 3-unit short was opened by adding a cover trade
    const lotsWithCover = computeFifoLots([
      makeTrade("buy", 5, 100, t1),
      makeTrade("sell", 8, 120, t2),
      makeTrade("buy", 3, 105, t3), // cover the 3-unit short at $105
    ]);

    expect(lotsWithCover).toHaveLength(2);

    const longLot = lotsWithCover.find((l) => l.lotType === "long");
    const shortLot = lotsWithCover.find((l) => l.lotType === "short");

    expect(longLot).toBeDefined();
    expect(shortLot).toBeDefined();

    expect(longLot!.quantity).toBe(5);
    expect(longLot!.entryPrice).toBe(100);

    expect(shortLot!.quantity).toBe(3);
    expect(shortLot!.entryPrice).toBe(120); // short entered at the sell price
    expect(shortLot!.exitPrice).toBe(105);  // covered at $105
    // Short gain: (120-105)*3 = 45
    expect(shortLot!.gainOrLoss).toBeCloseTo((120 - 105) * 3);
  });
});

// ---------------------------------------------------------------------------
// Test 7: FIFO vs weighted average
// ---------------------------------------------------------------------------

describe("Test 7: FIFO vs weighted average", () => {
  it("produces $250 gain where weighted average would produce $0", () => {
    // Buy 5 @ $100, Buy 5 @ $200, Sell 5 @ $150
    //
    // FIFO:          entry = $100 (oldest), gain = (150-100)*5 = $250
    // Weighted avg:  entry = ($100*5 + $200*5)/10 = $150, gain = (150-150)*5 = $0
    const lots = computeFifoLots([
      makeTrade("buy", 5, 100, t1),
      makeTrade("buy", 5, 200, t2),
      makeTrade("sell", 5, 150, t3),
    ]);

    expect(lots).toHaveLength(1);

    // FIFO uses the oldest buy price, not the average
    expect(lots[0].entryPrice).toBe(100);
    expect(lots[0].gainOrLoss).toBeCloseTo(250); // (150-100)*5

    // Explicitly confirm it is NOT the weighted-average result ($0)
    expect(lots[0].gainOrLoss).not.toBeCloseTo(0);
  });
});

// ---------------------------------------------------------------------------
// Test 8: Fee allocation
// ---------------------------------------------------------------------------

describe("Test 8: Fee allocation", () => {
  it("allocates entry and exit fees proportionally to the matched lot quantity", () => {
    // Buy 10 @ $100, fee=$2  → entryFeePerUnit = $0.20/unit
    // Sell  5 @ $110, fee=$1 → exitFeePerUnit  = $0.20/unit
    // Lot:  qty=5, entryFee=$1 (half of $2), exitFee=$1 (full $1 for 5 units)
    const lots = computeFifoLots([
      makeTrade("buy", 10, 100, t1, 2),
      makeTrade("sell", 5, 110, t2, 1),
    ]);

    expect(lots).toHaveLength(1);
    expect(lots[0].quantity).toBe(5);

    // Entry fee: $2 / 10 units × 5 matched units = $1
    expect(lots[0].entryFee).toBeCloseTo(1);

    // Exit fee: $1 / 5 units × 5 matched units = $1
    expect(lots[0].exitFee).toBeCloseTo(1);

    // costBasis = 5×$100 + $1 + $1 = $502
    expect(lots[0].costBasis).toBeCloseTo(502);

    // gainOrLoss = proceeds - costBasis = 5×$110 - $502 = $550 - $502 = $48
    expect(lots[0].gainOrLoss).toBeCloseTo(48);
  });

  it("the remaining 5 units in the long queue still carry their pro-rated fee", () => {
    // If we later sell the remaining 5 units, they should also have entryFee=$1
    const lots = computeFifoLots([
      makeTrade("buy", 10, 100, t1, 2),
      makeTrade("sell", 5, 110, t2, 0), // no exit fee for simplicity
      makeTrade("sell", 5, 115, t3, 0),
    ]);

    expect(lots).toHaveLength(2);

    // Both lots come from the same buy and should each have entryFee=$1
    expect(lots[0].entryFee).toBeCloseTo(1);
    expect(lots[1].entryFee).toBeCloseTo(1);
  });
});

// ---------------------------------------------------------------------------
// Test 9: Tax year filtering
// ---------------------------------------------------------------------------

describe("Test 9: Tax year filtering", () => {
  it("only includes lots whose exit falls within the target tax year", () => {
    // Buy 10 units in mid-2024
    // Sell  3 in Sep 2024 → should be EXCLUDED from 2025 tax year
    // Sell  7 in Mar 2025 → should be INCLUDED in 2025 tax year
    const buy2024 = new Date("2024-06-01T00:00:00Z").getTime();
    const sell2024 = new Date("2024-09-01T00:00:00Z").getTime();
    const sell2025 = new Date("2025-03-01T00:00:00Z").getTime();

    const allLots = computeFifoLots([
      makeTrade("buy", 10, 100, buy2024),
      makeTrade("sell", 3, 110, sell2024),
      makeTrade("sell", 7, 120, sell2025),
    ]);

    // All lots before filtering
    expect(allLots).toHaveLength(2);

    // Filter to tax year 2025 (as fetchTaxReportDataFifo does)
    const taxYear = 2025;
    const yearStart = new Date(taxYear, 0, 1).getTime();
    const yearEnd = new Date(taxYear + 1, 0, 1).getTime() - 1;
    const year2025Lots = allLots.filter(
      (l) => l.exitTime >= yearStart && l.exitTime <= yearEnd
    );

    // Only the March 2025 sale is in the 2025 tax year
    expect(year2025Lots).toHaveLength(1);
    expect(year2025Lots[0].quantity).toBe(7);
    expect(year2025Lots[0].exitPrice).toBe(120);

    // FIFO: all lots originate from the 2024 buy at $100
    expect(year2025Lots[0].entryPrice).toBe(100);
    expect(year2025Lots[0].gainOrLoss).toBeCloseTo((120 - 100) * 7); // 140
  });
});

// ---------------------------------------------------------------------------
// Test 10: Perp funding allocation
// ---------------------------------------------------------------------------

describe("Test 10: Perp funding allocation", () => {
  it("distributes funding pro-rata by quantity across FIFO lots", () => {
    // Total funding for BTC/USDT/perp: $100
    // Lot 1: qty=8 → gets 8/10 × $100 = $80
    // Lot 2: qty=2 → gets 2/10 × $100 = $20
    const fundingMap = buildFundingMap([
      { base_asset: "BTC", quote_asset: "USDT", amount: "100" },
    ]);

    const lots = computeFifoLots(
      [
        makeTrade("buy", 8, 100, t1),
        makeTrade("buy", 2, 100, t2),
        makeTrade("sell", 8, 110, t3), // closes the 8-unit lot
        makeTrade("sell", 2, 110, t4), // closes the 2-unit lot
      ],
      fundingMap
    );

    expect(lots).toHaveLength(2);

    const totalQty = lots.reduce((s, l) => s + l.quantity, 0);
    expect(totalQty).toBe(10);

    // Funding is allocated pro-rata
    expect(lots[0].fundingAllocated).toBeCloseTo(
      (lots[0].quantity / totalQty) * 100
    );
    expect(lots[1].fundingAllocated).toBeCloseTo(
      (lots[1].quantity / totalQty) * 100
    );

    // Total allocated funding must equal the input funding amount
    const totalAllocated = lots.reduce((s, l) => s + l.fundingAllocated, 0);
    expect(totalAllocated).toBeCloseTo(100);
  });

  it("leaves fundingAllocated as 0 when no funding map is provided", () => {
    const lots = computeFifoLots([
      makeTrade("buy", 5, 100, t1),
      makeTrade("sell", 5, 110, t2),
    ]);

    expect(lots).toHaveLength(1);
    expect(lots[0].fundingAllocated).toBe(0);
  });

  it("buildFundingMap sums multiple payments for the same symbol", () => {
    const map = buildFundingMap([
      { base_asset: "BTC", quote_asset: "USDT", amount: "40" },
      { base_asset: "BTC", quote_asset: "USDT", amount: "60" },
      { base_asset: "ETH", quote_asset: "USDT", amount: "20" },
    ]);

    expect(map.get("BTC/USDT/perp")).toBeCloseTo(100);
    expect(map.get("ETH/USDT/perp")).toBeCloseTo(20);
  });
});

// ---------------------------------------------------------------------------
// Additional invariant: gainOrLoss === proceeds - costBasis for all lots
// ---------------------------------------------------------------------------

describe("Invariant: gainOrLoss == proceeds - costBasis", () => {
  it("holds for a mixed sequence with fees, shorts, and multiple symbols", () => {
    const trades: RawTrade[] = [
      // BTC long
      makeTrade("buy", 3, 100, t1, 1),
      makeTrade("sell", 3, 120, t2, 0.5),
      // ETH short
      makeTrade("sell", 10, 50, t1, 0, "ETH"),
      makeTrade("buy", 10, 40, t2, 0, "ETH"),
    ];

    const lots = computeFifoLots(trades);

    for (const lot of lots) {
      expect(lot.gainOrLoss).toBeCloseTo(lot.proceeds - lot.costBasis, 8);
    }
  });
});
