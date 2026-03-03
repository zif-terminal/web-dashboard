/**
 * FIFO / LIFO lot-matching engine for capital-gains cost basis calculation.
 *
 * `MatchedDisposal` is structurally identical to `Position` so all existing
 * Form 8949 / TXF generation functions work without modification.
 *
 * Algorithm overview
 * ──────────────────
 * • Trades and deposits are merged and sorted chronologically.
 * • Within each (base_asset, exchange_account_id, market_type) group, two
 *   pools are maintained: `longPool` (opened by buys) and `shortPool`
 *   (opened by sells).
 * • A buy trade first exhausts open short lots (covering a short), then adds
 *   the remainder to the long pool.
 * • A sell trade first exhausts open long lots, then adds the remainder to
 *   the short pool (position flip → new short).
 * • Lot selection order: FIFO = oldest first, LIFO = newest first.
 * • Fees are prorated proportionally by matched quantity.
 */

import type { Trade, Deposit, ExchangeAccount } from "@/lib/queries";

// ─── Public types ─────────────────────────────────────────────────────────────

export type CostBasisMethod = "fifo" | "lifo" | "average";

/**
 * A matched disposal record — structurally identical to `Position` so
 * generateForm8949Csv / generateTxf etc. accept it without changes.
 *
 * LONG disposal:  entry = lot buy price,  exit = sale price
 * SHORT disposal: entry = lot sell price (where short was opened),
 *                 exit = buy-back price  (where short was closed)
 *
 * This matches the formula in formatPosition8949Row:
 *   proceeds  = side=long  → exit  × qty
 *             = side=short → entry × qty
 *   costBasis = side=long  → entry × qty + fees
 *             = side=short → exit  × qty + fees
 */
export interface MatchedDisposal {
  id: string;
  exchange_account_id: string;
  base_asset: string;
  quote_asset: string;
  side: "long" | "short";
  market_type: "perp" | "spot" | "swap";
  /** Unix milliseconds — date the lot was acquired */
  start_time: number;
  /** Unix milliseconds — date of disposal */
  end_time: number;
  /** Cost basis price per unit (buy price for long, sell price for short) */
  entry_avg_price: string;
  /** Disposal price per unit (sale price for long, buy-back price for short) */
  exit_avg_price: string;
  total_quantity: string;
  total_fees: string;
  realized_pnl: string;
  /** Always "0" — funding is not applicable to spot lot matching */
  total_funding: string;
  exchange_account?: ExchangeAccount;
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface TaxLot {
  id: string;
  timestamp: number;
  price: number;
  /** Remaining (unfilled) quantity */
  quantity: number;
  /** Original quantity when the lot was first opened (for fee proration) */
  originalQuantity: number;
  /** Total fee paid on the original trade */
  fee: number;
  exchangeAccountId: string;
  exchangeAccount?: ExchangeAccount;
  quoteAsset: string;
  marketType: "perp" | "spot" | "swap";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Stablecoins that should not be treated as capital assets. */
const STABLES = new Set(["USDC", "USDT", "USD", "BUSD", "DAI", "USDB"]);

/** Format a number as a clean decimal string (no trailing zeros, no sci notation). */
function n(v: number): string {
  if (v === 0) return "0";
  // Round to 10 decimal places to absorb floating-point noise, then strip zeros
  return parseFloat(v.toFixed(10)).toString();
}

let _idCounter = 0;
function nextId(): string {
  return `md-${++_idCounter}`;
}

/**
 * Convert a deposit/withdrawal into a synthetic trade so lot matching can
 * account for assets transferred onto/off the exchange.
 *
 * Deposit  → synthetic buy  at user_cost_basis
 * Withdraw → synthetic sell at user_cost_basis (cost-recovery: no gain/loss)
 */
function depositToTrade(deposit: Deposit): Trade {
  return {
    id: `syn-${deposit.id}`,
    base_asset: deposit.asset,
    quote_asset: "USD",
    side: deposit.direction === "deposit" ? "buy" : "sell",
    price: deposit.user_cost_basis,
    quantity: deposit.amount,
    timestamp: new Date(deposit.timestamp).toISOString(),
    fee: "0",
    order_id: deposit.deposit_id,
    trade_id: `syn-${deposit.id}`,
    exchange_account_id: deposit.exchange_account_id,
    market_type: "spot",
    exchange_account: deposit.exchange_account,
  };
}

// ─── Core matching logic ──────────────────────────────────────────────────────

/**
 * Return the pool sorted for the chosen method:
 *   FIFO → oldest first (ascending timestamp)
 *   LIFO → newest first (descending timestamp)
 */
function ordered(pool: TaxLot[], method: "fifo" | "lifo"): TaxLot[] {
  return method === "fifo"
    ? [...pool].sort((a, b) => a.timestamp - b.timestamp)
    : [...pool].sort((a, b) => b.timestamp - a.timestamp);
}

/** Remove fully-consumed lots in-place. */
function purge(pool: TaxLot[]): void {
  for (let i = pool.length - 1; i >= 0; i--) {
    if (pool[i].quantity <= 1e-10) pool.splice(i, 1);
  }
}

/**
 * Match lots for a single (asset, account, market_type) trade group.
 * Trades must already be sorted chronologically (ascending timestamp).
 */
function matchGroup(
  trades: Trade[],
  method: "fifo" | "lifo"
): MatchedDisposal[] {
  const disposals: MatchedDisposal[] = [];
  const longPool: TaxLot[] = [];   // opened by buy trades
  const shortPool: TaxLot[] = [];  // opened by sell trades

  for (const trade of trades) {
    const ts = /^\d+$/.test(trade.timestamp) ? Number(trade.timestamp) : new Date(trade.timestamp).getTime();
    const price = parseFloat(trade.price);
    const qty = parseFloat(trade.quantity);
    const fee = parseFloat(trade.fee) || 0;
    const acc = trade.exchange_account;

    if (trade.side === "buy") {
      // ── Buy trade ────────────────────────────────────────────────────────
      // Step 1: cover open short lots (buying back = closing short)
      let rem = qty;
      for (const lot of ordered(shortPool, method)) {
        if (rem <= 1e-10) break;
        const matched = Math.min(rem, lot.quantity);

        // Fee proration: share of the buy-back fee + share of the lot's open fee
        const buyFeeShare = fee > 0 ? (matched / qty) * fee : 0;
        const lotFeeShare = lot.fee > 0 ? (matched / lot.originalQuantity) * lot.fee : 0;
        const totalFees = buyFeeShare + lotFeeShare;

        // SHORT: opened at lot.price (sell), closed at price (buy-back)
        // proceeds  = entry × qty = lot.price × matched  (what the short earned)
        // costBasis = exit  × qty = price     × matched  (cost to close)
        const proceeds = lot.price * matched;
        const costBasis = price * matched;
        const pnl = proceeds - costBasis - totalFees;

        disposals.push({
          id: nextId(),
          exchange_account_id: trade.exchange_account_id,
          base_asset: trade.base_asset,
          quote_asset: trade.quote_asset,
          side: "short",
          market_type: trade.market_type,
          start_time: lot.timestamp,
          end_time: ts,
          entry_avg_price: n(lot.price),
          exit_avg_price: n(price),
          total_quantity: n(matched),
          total_fees: n(totalFees),
          realized_pnl: n(pnl),
          total_funding: "0",
          exchange_account: acc ?? lot.exchangeAccount,
        });

        lot.quantity -= matched;
        rem -= matched;
      }
      purge(shortPool);

      // Step 2: open a new long lot with any remaining quantity
      if (rem > 1e-10) {
        // Prorate the remaining fee to the remaining quantity
        const remFee = fee > 0 ? (rem / qty) * fee : 0;
        longPool.push({
          id: `ll-${trade.id}`,
          timestamp: ts,
          price,
          quantity: rem,
          originalQuantity: rem,
          fee: remFee,
          exchangeAccountId: trade.exchange_account_id,
          exchangeAccount: acc,
          quoteAsset: trade.quote_asset,
          marketType: trade.market_type,
        });
      }
    } else {
      // ── Sell trade ───────────────────────────────────────────────────────
      // Step 1: close open long lots (selling = disposing a long)
      let rem = qty;
      for (const lot of ordered(longPool, method)) {
        if (rem <= 1e-10) break;
        const matched = Math.min(rem, lot.quantity);

        const sellFeeShare = fee > 0 ? (matched / qty) * fee : 0;
        const lotFeeShare = lot.fee > 0 ? (matched / lot.originalQuantity) * lot.fee : 0;
        const totalFees = sellFeeShare + lotFeeShare;

        // LONG: opened at lot.price (buy), closed at price (sale)
        // proceeds  = exit  × qty = price     × matched
        // costBasis = entry × qty = lot.price × matched
        const proceeds = price * matched;
        const costBasis = lot.price * matched;
        const pnl = proceeds - costBasis - totalFees;

        disposals.push({
          id: nextId(),
          exchange_account_id: trade.exchange_account_id,
          base_asset: trade.base_asset,
          quote_asset: trade.quote_asset,
          side: "long",
          market_type: trade.market_type,
          start_time: lot.timestamp,
          end_time: ts,
          entry_avg_price: n(lot.price),
          exit_avg_price: n(price),
          total_quantity: n(matched),
          total_fees: n(totalFees),
          realized_pnl: n(pnl),
          total_funding: "0",
          exchange_account: acc ?? lot.exchangeAccount,
        });

        lot.quantity -= matched;
        rem -= matched;
      }
      purge(longPool);

      // Step 2: open a new short lot with any remaining quantity (position flip)
      if (rem > 1e-10) {
        const remFee = fee > 0 ? (rem / qty) * fee : 0;
        shortPool.push({
          id: `sl-${trade.id}`,
          timestamp: ts,
          price,
          quantity: rem,
          originalQuantity: rem,
          fee: remFee,
          exchangeAccountId: trade.exchange_account_id,
          exchangeAccount: acc,
          quoteAsset: trade.quote_asset,
          marketType: trade.market_type,
        });
      }
    }
  }

  return disposals;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run FIFO or LIFO lot matching across all trades and deposits.
 *
 * @param trades   All raw trade records up to the desired cutoff date.
 * @param deposits All deposit/withdrawal records up to the cutoff date.
 * @param method   "fifo" | "lifo"
 * @returns        Every matched disposal. Filter by `end_time` to restrict to
 *                 a specific tax year.
 */
export function matchLots(
  trades: Trade[],
  deposits: Deposit[],
  method: "fifo" | "lifo"
): MatchedDisposal[] {
  // Reset id counter so tests get deterministic IDs
  _idCounter = 0;

  // Convert non-stablecoin deposits to synthetic buy/sell trades
  const synth: Trade[] = deposits
    .filter((d) => !STABLES.has(d.asset))
    .map(depositToTrade);

  // Merge and sort all trades chronologically
  const all = [...trades, ...synth].sort(
    (a, b) => (/^\d+$/.test(a.timestamp) ? Number(a.timestamp) : new Date(a.timestamp).getTime()) - (/^\d+$/.test(b.timestamp) ? Number(b.timestamp) : new Date(b.timestamp).getTime())
  );

  // Group by (base_asset, exchange_account_id, market_type)
  const groups = new Map<string, Trade[]>();
  for (const t of all) {
    const key = `${t.base_asset}|${t.exchange_account_id}|${t.market_type}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const result: MatchedDisposal[] = [];
  for (const group of groups.values()) {
    result.push(...matchGroup(group, method));
  }
  return result;
}
