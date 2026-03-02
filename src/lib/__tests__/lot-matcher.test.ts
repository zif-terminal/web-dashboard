/**
 * Integration tests for the FIFO/LIFO lot-matching engine (A8.5).
 *
 * 6 test cases covering:
 *   1. Basic FIFO/LIFO divergence — same data, different gain/loss
 *   2. Partial lot consumption — sell only part of a lot
 *   3. Multi-lot sell — disposal spans multiple lots
 *   4. Short positions — opening and covering a short
 *   5. Position flip — sell more than held, opening a short for the excess
 *   6. Single-lot parity — FIFO and LIFO agree when only one lot exists
 */

import { describe, it, expect } from "vitest";
import { matchLots, type MatchedDisposal } from "@/lib/lot-matcher";
import type { Trade, Deposit } from "@/lib/queries";

// ─── Test helpers ─────────────────────────────────────────────────────────────

/** Build a minimal Trade object for testing (all optional fields omitted). */
function makeTrade(
  side: "buy" | "sell",
  price: number,
  quantity: number,
  timestampMs: number,
  options: Partial<Pick<Trade, "base_asset" | "quote_asset" | "market_type" | "fee">> = {}
): Trade {
  return {
    id: `t-${Math.random().toString(36).slice(2)}`,
    base_asset: options.base_asset ?? "ETH",
    quote_asset: options.quote_asset ?? "USDC",
    side,
    price: String(price),
    quantity: String(quantity),
    timestamp: new Date(timestampMs).toISOString(),
    fee: String(options.fee ?? 0),
    order_id: "ord-test",
    trade_id: "trd-test",
    exchange_account_id: "acc-test",
    market_type: options.market_type ?? "spot",
  };
}

const DEPOSITS: Deposit[] = []; // no deposits needed for basic tests

/** Total realized PnL across all disposals. */
function totalPnL(disposals: MatchedDisposal[]): number {
  return disposals.reduce((s, d) => s + parseFloat(d.realized_pnl), 0);
}

// ─── Test timestamps ───────────────────────────────────────────────────────────

const T1 = Date.UTC(2026, 0, 10);   // Jan 10 2026 — oldest
const T2 = Date.UTC(2026, 0, 20);   // Jan 20 2026
const T3 = Date.UTC(2026, 1, 5);    // Feb 5  2026
const T4 = Date.UTC(2026, 1, 15);   // Feb 15 2026 — newest

// ─── Test 1: Basic FIFO/LIFO divergence ──────────────────────────────────────

describe("Test 1: basic FIFO/LIFO divergence", () => {
  /**
   * Setup:
   *   Buy lot A: 10 ETH @ $100 (T1, oldest)
   *   Buy lot B: 10 ETH @ $200 (T2)
   *   Sell    : 10 ETH @ $300 (T3)
   *
   * FIFO: closes lot A (basis $100) → gain = (300-100)×10 = $2,000
   * LIFO: closes lot B (basis $200) → gain = (300-200)×10 = $1,000
   */
  const trades = [
    makeTrade("buy",  100, 10, T1),
    makeTrade("buy",  200, 10, T2),
    makeTrade("sell", 300, 10, T3),
  ];

  it("FIFO produces higher gain when oldest lot has lowest basis", () => {
    const fifo = matchLots(trades, DEPOSITS, "fifo");
    expect(fifo).toHaveLength(1);
    const gain = parseFloat(fifo[0].realized_pnl);
    // FIFO closes lot A: (300-100)×10 = 2000
    expect(gain).toBeCloseTo(2000, 4);
    expect(fifo[0].entry_avg_price).toBe("100"); // lot A price
  });

  it("LIFO produces lower gain when newest lot has higher basis", () => {
    const lifo = matchLots(trades, DEPOSITS, "lifo");
    expect(lifo).toHaveLength(1);
    const gain = parseFloat(lifo[0].realized_pnl);
    // LIFO closes lot B: (300-200)×10 = 1000
    expect(gain).toBeCloseTo(1000, 4);
    expect(lifo[0].entry_avg_price).toBe("200"); // lot B price
  });

  it("FIFO and LIFO produce different gain/loss values", () => {
    const fifo = matchLots(trades, DEPOSITS, "fifo");
    const lifo = matchLots(trades, DEPOSITS, "lifo");
    expect(totalPnL(fifo)).not.toBeCloseTo(totalPnL(lifo), 2);
  });
});

// ─── Test 2: Partial lot consumption ─────────────────────────────────────────

describe("Test 2: partial lot consumption", () => {
  /**
   * Setup:
   *   Buy  : 10 ETH @ $100 (T1)
   *   Sell :  4 ETH @ $150 (T2) — only partially consumes lot
   *
   * FIFO and LIFO agree (single lot): gain = (150-100)×4 = $200
   * Remaining lot must hold 6 ETH (untouched).
   */
  const trades = [
    makeTrade("buy",  100, 10, T1),
    makeTrade("sell", 150,  4, T2),
  ];

  it("only the sold quantity is realised", () => {
    for (const method of ["fifo", "lifo"] as const) {
      const disposals = matchLots(trades, DEPOSITS, method);
      expect(disposals).toHaveLength(1);
      expect(parseFloat(disposals[0].total_quantity)).toBeCloseTo(4, 8);
      expect(parseFloat(disposals[0].realized_pnl)).toBeCloseTo(200, 4);
    }
  });

  it("disposal records the correct buy and sell prices", () => {
    const [d] = matchLots(trades, DEPOSITS, "fifo");
    expect(d.entry_avg_price).toBe("100");
    expect(d.exit_avg_price).toBe("150");
    expect(d.side).toBe("long");
  });
});

// ─── Test 3: Multi-lot sell ───────────────────────────────────────────────────

describe("Test 3: multi-lot sell (disposal spans multiple lots)", () => {
  /**
   * Setup:
   *   Buy lot A: 5 ETH @ $100 (T1)
   *   Buy lot B: 5 ETH @ $200 (T2)
   *   Sell     : 8 ETH @ $300 (T3)  ← spans both lots
   *
   * FIFO: close 5 from A ($100), then 3 from B ($200)
   *   gain = (300-100)×5 + (300-200)×3 = 1000 + 300 = $1,300
   *
   * LIFO: close 5 from B ($200), then 3 from A ($100)
   *   gain = (300-200)×5 + (300-100)×3 = 500 + 600 = $1,100
   */
  const trades = [
    makeTrade("buy",  100, 5, T1),
    makeTrade("buy",  200, 5, T2),
    makeTrade("sell", 300, 8, T3),
  ];

  it("FIFO: produces 2 disposals matching lots A then B", () => {
    const fifo = matchLots(trades, DEPOSITS, "fifo");
    expect(fifo).toHaveLength(2);
    // First disposal: from lot A (price 100)
    expect(fifo[0].entry_avg_price).toBe("100");
    expect(parseFloat(fifo[0].total_quantity)).toBeCloseTo(5, 8);
    // Second disposal: from lot B (price 200)
    expect(fifo[1].entry_avg_price).toBe("200");
    expect(parseFloat(fifo[1].total_quantity)).toBeCloseTo(3, 8);
    expect(totalPnL(fifo)).toBeCloseTo(1300, 4);
  });

  it("LIFO: produces 2 disposals matching lots B then A", () => {
    const lifo = matchLots(trades, DEPOSITS, "lifo");
    expect(lifo).toHaveLength(2);
    // First disposal: from lot B (price 200)
    expect(lifo[0].entry_avg_price).toBe("200");
    expect(parseFloat(lifo[0].total_quantity)).toBeCloseTo(5, 8);
    // Second disposal: from lot A (price 100)
    expect(lifo[1].entry_avg_price).toBe("100");
    expect(parseFloat(lifo[1].total_quantity)).toBeCloseTo(3, 8);
    expect(totalPnL(lifo)).toBeCloseTo(1100, 4);
  });

  it("total disposed quantity equals 8 for both methods", () => {
    for (const method of ["fifo", "lifo"] as const) {
      const ds = matchLots(trades, DEPOSITS, method);
      const totalQty = ds.reduce((s, d) => s + parseFloat(d.total_quantity), 0);
      expect(totalQty).toBeCloseTo(8, 8);
    }
  });
});

// ─── Test 4: Short positions ──────────────────────────────────────────────────

describe("Test 4: short positions", () => {
  /**
   * Setup (no prior long position, so sell opens a short):
   *   Sell  : 3 ETH @ $200 (T1) — opens short at $200
   *   Buy   : 3 ETH @ $150 (T2) — covers short at $150
   *
   * Gain = (200-150)×3 = $150  (short profit: sold high, bought low)
   */
  const trades = [
    makeTrade("sell", 200, 3, T1),  // opens short
    makeTrade("buy",  150, 3, T2),  // covers short
  ];

  it("covering a short produces a gain when price fell", () => {
    for (const method of ["fifo", "lifo"] as const) {
      const ds = matchLots(trades, DEPOSITS, method);
      expect(ds).toHaveLength(1);
      expect(ds[0].side).toBe("short");
      // For short: entry = where sold, exit = where bought back
      expect(ds[0].entry_avg_price).toBe("200");
      expect(ds[0].exit_avg_price).toBe("150");
      expect(parseFloat(ds[0].realized_pnl)).toBeCloseTo(150, 4);
    }
  });

  it("closing a short at a higher price produces a loss", () => {
    const trades2 = [
      makeTrade("sell", 200, 3, T1),  // opens short at $200
      makeTrade("buy",  250, 3, T2),  // covers at $250 — loss
    ];
    const ds = matchLots(trades2, DEPOSITS, "fifo");
    expect(ds[0].side).toBe("short");
    // loss = (200-250)×3 = -$150
    expect(parseFloat(ds[0].realized_pnl)).toBeCloseTo(-150, 4);
  });
});

// ─── Test 5: Position flip ────────────────────────────────────────────────────

describe("Test 5: position flip (sell more than held → excess opens short)", () => {
  /**
   * Setup:
   *   Buy  : 5 ETH @ $100 (T1)   — opens long
   *   Sell : 8 ETH @ $200 (T2)   — closes 5-lot long, then opens 3-unit short
   *   Buy  : 3 ETH @ $180 (T3)   — covers the 3-unit short
   *
   * Expected disposals:
   *   1. Long disposal: 5 ETH @ 100→200, gain = $500
   *   2. Short disposal: 3 ETH @ 200→180, gain = $60
   */
  const trades = [
    makeTrade("buy",  100, 5, T1),
    makeTrade("sell", 200, 8, T2),
    makeTrade("buy",  180, 3, T3),
  ];

  it("produces two disposals: one long close and one short close", () => {
    for (const method of ["fifo", "lifo"] as const) {
      const ds = matchLots(trades, DEPOSITS, method);
      expect(ds).toHaveLength(2);

      const long  = ds.find((d) => d.side === "long");
      const short = ds.find((d) => d.side === "short");

      expect(long).toBeDefined();
      expect(short).toBeDefined();

      // Long: 5 ETH @ 100→200
      expect(parseFloat(long!.total_quantity)).toBeCloseTo(5, 8);
      expect(parseFloat(long!.realized_pnl)).toBeCloseTo(500, 4);

      // Short: 3 ETH @ 200→180
      expect(parseFloat(short!.total_quantity)).toBeCloseTo(3, 8);
      expect(parseFloat(short!.realized_pnl)).toBeCloseTo(60, 4);
    }
  });
});

// ─── Test 6: Single-lot parity (FIFO == LIFO) ─────────────────────────────────

describe("Test 6: single-lot parity — FIFO and LIFO agree when only one lot exists", () => {
  /**
   * When there is exactly one open lot, FIFO and LIFO must produce identical
   * results regardless of method (there is no ordering ambiguity).
   */
  const trades = [
    makeTrade("buy",  1000, 2, T1),   // single lot: 2 BTC @ $1000
    makeTrade("sell", 1500, 2, T2),   // close all: 2 BTC @ $1500
  ];

  it("FIFO and LIFO produce identical gain/loss for a single lot", () => {
    const fifo = matchLots(trades, DEPOSITS, "fifo");
    const lifo = matchLots(trades, DEPOSITS, "lifo");

    expect(fifo).toHaveLength(1);
    expect(lifo).toHaveLength(1);

    // Both should produce: gain = (1500-1000)×2 = $1,000
    expect(parseFloat(fifo[0].realized_pnl)).toBeCloseTo(1000, 4);
    expect(parseFloat(lifo[0].realized_pnl)).toBeCloseTo(1000, 4);

    // All fields should match
    expect(fifo[0].entry_avg_price).toBe(lifo[0].entry_avg_price);
    expect(fifo[0].exit_avg_price).toBe(lifo[0].exit_avg_price);
    expect(fifo[0].total_quantity).toBe(lifo[0].total_quantity);
  });
});

// ─── Test 7: Fee proration ────────────────────────────────────────────────────

describe("Test 7: fee proration across lots", () => {
  /**
   * Buy 10 ETH with a $10 fee. Sell 6 ETH (of which 4 come from lot A, 2 from
   * lot B in FIFO order). Verify that fees are prorated proportionally.
   */
  const buyFee = 10;   // $10 total entry fee
  const trades = [
    makeTrade("buy",  100, 10, T1, { fee: buyFee }),  // single lot, $10 fee
    makeTrade("sell", 200,  6, T2, { fee: 6 }),        // sell 6 with $6 exit fee
  ];

  it("realized PnL accounts for prorated entry + exit fees", () => {
    const ds = matchLots(trades, DEPOSITS, "fifo");
    expect(ds).toHaveLength(1);
    const d = ds[0];

    const qty = parseFloat(d.total_quantity);          // 6
    const fees = parseFloat(d.total_fees);              // prorated entry fee + exit fee
    const pnl = parseFloat(d.realized_pnl);             // proceeds - basis - fees

    const expectedEntryFee = (6 / 10) * buyFee;         // 6.0
    const expectedExitFee = 6;                           // full exit fee (6 out of 6 qty)
    const expectedFees = expectedEntryFee + expectedExitFee;  // 12
    const expectedPnl = (200 - 100) * qty - expectedFees;     // 600 - 12 = 588

    expect(fees).toBeCloseTo(expectedFees, 4);
    expect(pnl).toBeCloseTo(expectedPnl, 4);
  });
});

// ─── Test 8: Deposits as synthetic buys ──────────────────────────────────────

describe("Test 8: deposits are treated as synthetic buy lots", () => {
  /**
   * Deposit 5 SOL at cost basis $150 (no matching trade).
   * Then sell 5 SOL at $200.
   * Expected: FIFO/LIFO both produce a long disposal with gain = (200-150)×5 = $250.
   */
  const deposits: Deposit[] = [
    {
      id: "dep-1",
      exchange_account_id: "acc-test",
      asset: "SOL",
      direction: "deposit",
      amount: "5",
      user_cost_basis: "150",
      timestamp: T1,
      deposit_id: "dep-001",
    },
  ];
  const trades = [
    makeTrade("sell", 200, 5, T2, { base_asset: "SOL", quote_asset: "USD" }),
  ];

  it("deposit creates an open lot that can be closed by a sale", () => {
    for (const method of ["fifo", "lifo"] as const) {
      const ds = matchLots(trades, deposits, method);
      expect(ds).toHaveLength(1);
      expect(ds[0].side).toBe("long");
      expect(ds[0].base_asset).toBe("SOL");
      // gain = (200-150)×5 = 250
      expect(parseFloat(ds[0].realized_pnl)).toBeCloseTo(250, 4);
    }
  });
});
