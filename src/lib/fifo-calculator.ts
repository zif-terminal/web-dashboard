/**
 * FIFO cost basis calculator for crypto trading tax reports.
 *
 * Implements First In, First Out (FIFO) lot matching per IRS Publication 550.
 * FIFO determines both the cost basis AND the holding period per closed lot,
 * which is critical for correct short-term vs long-term capital gains
 * classification that weighted-average pricing cannot provide.
 *
 * This module is pure — no API calls, no side effects. All functions are
 * deterministic given the same inputs.
 */

/** A single trade to be matched by the FIFO engine. */
export interface RawTrade {
  /** "buy" = acquiring base asset; "sell" = disposing of base asset */
  side: "buy" | "sell";
  /** Execution price in quote currency */
  price: number;
  /** Quantity in base currency */
  quantity: number;
  /** Total fee for this trade (allocated per-unit across matched lots) */
  fee: number;
  /** Execution timestamp in Unix milliseconds */
  timestamp: number;
  /** Base asset symbol, e.g. "BTC" */
  asset: string;
  /** Quote asset symbol, e.g. "USDT" */
  quoteAsset: string;
  /** Market type */
  marketType: "perp" | "spot" | "swap";
  /** Optional source position ID for traceability */
  positionId?: string;
}

/**
 * A FIFO-matched tax lot representing one entry/exit pair.
 * Maps directly to IRS Form 8949 columns (b)–(h).
 */
export interface TaxLot {
  /** Unique lot identifier within a report */
  id: string;
  asset: string;
  quoteAsset: string;
  marketType: "perp" | "spot" | "swap";
  /** "long" = bought first, sold later; "short" = sold first, covered later */
  lotType: "long" | "short";

  // Entry leg
  /** Unix ms — Date acquired (Form 8949 col b) */
  entryTime: number;
  /** Entry price per unit in quote currency */
  entryPrice: number;
  /** Quantity matched to this lot in base currency */
  quantity: number;
  /** Entry fee allocated to this lot (pro-rated from trade fee) */
  entryFee: number;

  // Exit leg
  /** Unix ms — Date sold/closed (Form 8949 col c) */
  exitTime: number;
  /** Exit price per unit in quote currency */
  exitPrice: number;
  /** Exit fee allocated to this lot (pro-rated from trade fee) */
  exitFee: number;

  // IRS Form 8949 amounts
  /**
   * Column (d): Proceeds
   * Long:  exitPrice × quantity
   * Short: entryPrice × quantity
   */
  proceeds: number;
  /**
   * Column (e): Cost Basis
   * Long:  entryPrice × quantity + entryFee + exitFee
   * Short: exitPrice  × quantity + entryFee + exitFee
   */
  costBasis: number;
  /** Column (h): Gain or Loss = proceeds − costBasis */
  gainOrLoss: number;
  /** true if (exitTime − entryTime) > 365.25 days → long-term rate applies */
  isLongTerm: boolean;

  /** Perpetual funding allocated to this lot pro-rata by quantity */
  fundingAllocated: number;
  /** Source position ID (if available) */
  positionId?: string;
}

/** Internal: an open lot waiting to be matched by a future opposite trade */
interface OpenLot {
  entryTime: number;
  entryPrice: number;
  /** Remaining unmatched quantity */
  remainingQty: number;
  /** Pre-computed entry fee per unit for proportional allocation */
  entryFeePerUnit: number;
  positionId?: string;
}

/** Threshold below which a quantity is treated as zero (floating-point guard) */
const EPSILON = 1e-10;

/** 365.25 days in milliseconds — IRS holding-period boundary */
const ONE_YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

function makeLotId(
  asset: string,
  quoteAsset: string,
  marketType: string,
  index: number
): string {
  return `${asset}-${quoteAsset}-${marketType}-lot-${index}`;
}

/**
 * Compute FIFO or LIFO matched tax lots from an array of raw trades.
 *
 * Algorithm:
 * - Trades are grouped by (asset, quoteAsset, marketType).
 * - Within each group, trades are sorted by timestamp ascending.
 * - Two queues are maintained per group: `longQueue` (open buys) and
 *   `shortQueue` (open sells).
 * - A buy trade: closes shorts from shortQueue first; if shortQueue is
 *   empty, opens a new long in longQueue.
 * - A sell trade: closes longs from longQueue first; if longQueue is
 *   empty, opens a new short in shortQueue.
 * - FIFO: selects the oldest lot first (front of queue).
 * - LIFO: selects the newest lot first (back of queue).
 * - Position flips: when a closing trade exceeds the queue, the excess
 *   opens a new position on the opposite side.
 * - Fees are allocated proportionally: entryFeePerUnit = tradeFee / tradeQty,
 *   then entryFee = entryFeePerUnit × matchedQty.
 * - Funding is distributed across closed lots pro-rata by quantity.
 *
 * @param trades     Raw trades in any order — sorted internally per symbol.
 * @param fundingMap Optional map from "ASSET/QUOTE/MARKETTYPE" → net funding USD.
 * @param method     "fifo" (default) or "lifo" — which lot is selected first.
 * @returns          Array of closed tax lots ready for Form 8949 reporting.
 */
export function computeFifoLots(
  trades: RawTrade[],
  fundingMap: Map<string, number> = new Map(),
  method: "fifo" | "lifo" = "fifo"
): TaxLot[] {
  // Group trades by symbol key
  const groups = new Map<string, RawTrade[]>();
  for (const trade of trades) {
    const key = `${trade.asset}/${trade.quoteAsset}/${trade.marketType}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(trade);
  }

  const allLots: TaxLot[] = [];

  for (const [key, groupTrades] of groups) {
    const [asset, quoteAsset, marketType] = key.split("/") as [
      string,
      string,
      "perp" | "spot" | "swap",
    ];
    const symbolFunding = fundingMap.get(key) ?? 0;

    // Sort ascending by timestamp — strict FIFO ordering
    const sorted = [...groupTrades].sort((a, b) => a.timestamp - b.timestamp);

    const closedLots: TaxLot[] = [];
    let lotIndex = 0;

    // longQueue:  open buy lots waiting to be closed by a future sell
    // shortQueue: open sell lots waiting to be closed by a future buy
    const longQueue: OpenLot[] = [];
    const shortQueue: OpenLot[] = [];

    /**
     * Match an exit trade against a queue using FIFO (front) or LIFO (back).
     * Creates a closed TaxLot for each matched quantity slice.
     * Any quantity exceeding the queue is placed into flipQueue as a new opening
     * (position flip: e.g. selling more than held opens a short for the excess).
     *
     * @param queue      The queue to drain (longQueue or shortQueue)
     * @param exitTrade  The closing trade
     * @param lotType    "long" when closing longs; "short" when closing shorts
     * @param flipQueue  Where to place excess quantity (opposite direction)
     */
    const drainQueue = (
      queue: OpenLot[],
      exitTrade: RawTrade,
      lotType: "long" | "short",
      flipQueue: OpenLot[]
    ): void => {
      let toMatch = exitTrade.quantity;
      const exitFeePerUnit =
        exitTrade.quantity > EPSILON ? exitTrade.fee / exitTrade.quantity : 0;

      while (toMatch > EPSILON && queue.length > 0) {
        // FIFO: consume oldest lot (front); LIFO: consume newest lot (back)
        const head = method === "fifo" ? queue[0] : queue[queue.length - 1];
        const matchedQty = Math.min(toMatch, head.remainingQty);

        const entryFee = head.entryFeePerUnit * matchedQty;
        const exitFee = exitFeePerUnit * matchedQty;

        // Proceeds and cost basis depend on direction:
        //   Long:  proceeds = exitPrice × qty;  costBasis = entryPrice × qty + fees
        //   Short: proceeds = entryPrice × qty; costBasis = exitPrice × qty + fees
        let proceeds: number;
        let costBasis: number;
        if (lotType === "long") {
          proceeds = exitTrade.price * matchedQty;
          costBasis = head.entryPrice * matchedQty + entryFee + exitFee;
        } else {
          proceeds = head.entryPrice * matchedQty;
          costBasis = exitTrade.price * matchedQty + entryFee + exitFee;
        }

        const holdingMs = exitTrade.timestamp - head.entryTime;

        closedLots.push({
          id: makeLotId(asset, quoteAsset, marketType, lotIndex++),
          asset,
          quoteAsset,
          marketType,
          lotType,
          entryTime: head.entryTime,
          entryPrice: head.entryPrice,
          quantity: matchedQty,
          entryFee,
          exitTime: exitTrade.timestamp,
          exitPrice: exitTrade.price,
          exitFee,
          proceeds,
          costBasis,
          gainOrLoss: proceeds - costBasis,
          isLongTerm: holdingMs > ONE_YEAR_MS,
          fundingAllocated: 0, // populated after all lots are closed
          positionId: head.positionId,
        });

        head.remainingQty -= matchedQty;
        toMatch -= matchedQty;

        if (head.remainingQty <= EPSILON) {
          // FIFO: remove from front; LIFO: remove from back
          if (method === "fifo") {
            queue.shift();
          } else {
            queue.pop();
          }
        }
      }

      // Position flip: excess quantity opens a new position on the opposite side
      if (toMatch > EPSILON) {
        const flipFeePerUnit =
          exitTrade.quantity > EPSILON ? exitTrade.fee / exitTrade.quantity : 0;
        flipQueue.push({
          entryTime: exitTrade.timestamp,
          entryPrice: exitTrade.price,
          remainingQty: toMatch,
          entryFeePerUnit: flipFeePerUnit,
          positionId: exitTrade.positionId,
        });
      }
    };

    for (const trade of sorted) {
      const feePerUnit =
        trade.quantity > EPSILON ? trade.fee / trade.quantity : 0;

      if (trade.side === "buy") {
        if (shortQueue.length > 0) {
          // Buy closes open shorts first (oldest short first — FIFO)
          drainQueue(shortQueue, trade, "short", longQueue);
        } else {
          // Buy opens a new long lot
          longQueue.push({
            entryTime: trade.timestamp,
            entryPrice: trade.price,
            remainingQty: trade.quantity,
            entryFeePerUnit: feePerUnit,
            positionId: trade.positionId,
          });
        }
      } else {
        // sell
        if (longQueue.length > 0) {
          // Sell closes open longs first (oldest long first — FIFO)
          drainQueue(longQueue, trade, "long", shortQueue);
        } else {
          // Sell opens a new short lot
          shortQueue.push({
            entryTime: trade.timestamp,
            entryPrice: trade.price,
            remainingQty: trade.quantity,
            entryFeePerUnit: feePerUnit,
            positionId: trade.positionId,
          });
        }
      }
    }

    // Distribute perpetual funding pro-rata by quantity across all closed lots
    if (symbolFunding !== 0 && closedLots.length > 0) {
      const totalQty = closedLots.reduce((sum, l) => sum + l.quantity, 0);
      if (totalQty > EPSILON) {
        for (const lot of closedLots) {
          lot.fundingAllocated = (lot.quantity / totalQty) * symbolFunding;
        }
      }
    }

    allLots.push(...closedLots);
  }

  return allLots;
}

/**
 * Build a funding map from an array of funding payment records.
 *
 * Groups by "ASSET/QUOTE/perp" key. Perpetual futures are the primary
 * source of funding payments; spot and swap positions do not have funding.
 *
 * @param payments  Objects with base_asset, quote_asset, and amount fields.
 * @returns         Map keyed by "ASSET/QUOTE/MARKETTYPE" → net funding USD.
 */
export function buildFundingMap(
  payments: Array<{ base_asset: string; quote_asset: string; amount: string }>
): Map<string, number> {
  const map = new Map<string, number>();
  for (const fp of payments) {
    // Funding payments come from perp positions
    const key = `${fp.base_asset}/${fp.quote_asset}/perp`;
    map.set(key, (map.get(key) ?? 0) + parseFloat(fp.amount));
  }
  return map;
}
