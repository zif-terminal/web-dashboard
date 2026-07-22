// ─────────────────────────────────────────────────────────────────────────────
// #202 — Hyperliquid reduce-only TP/SL "set-and-rest" order client.
//
// The user's OWN browser EOA signs a Hyperliquid L1 order action in-browser (via
// the @nktkas/hyperliquid ExchangeClient, which does the msgpack/keccak/EIP-712
// phantom-agent signing on chainId 1337). NOTHING key-shaped is ever stored.
//
// SAFETY MODEL:
//  - Every order placed here is `r:true` (reduceOnly) — it can only ever shrink an
//    existing position, never open or flip one. This is the native on-exchange
//    guard: even a bug can't create new exposure.
//  - `isMarket:true` trigger + `p:"0"` = a market-execute trigger (a real stop /
//    take-profit that rests on the book until its trigger price is crossed).
//  - The whole surface is gated behind VITE_ENABLE_HL_ORDERS (default OFF) so it
//    is invisible/inert in prod until an operator flips it on.
//
// The pure `buildTriggerOrderParams` / `buildCancelParams` builders produce the
// exact action shapes the SDK methods consume, WITHOUT any network or signing, so
// they can be unit-tested deterministically. `placeTrigger` / `cancel` wrap the
// live SDK call and are exercised only against a real wallet (operator-gated).
// ─────────────────────────────────────────────────────────────────────────────

import type { ExchangeClient } from '@nktkas/hyperliquid';
import type { Side } from '../types';

/** True iff the dark-launch flag is explicitly enabled. Default OFF. */
export function hlOrdersEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_HL_ORDERS === 'true';
}

export type Tpsl = 'tp' | 'sl';

export interface PlaceTriggerArgs {
  /** HL asset index (position in the `meta.universe` array). */
  assetIndex: number;
  /**
   * Order side: `true` = buy, `false` = sell. To CLOSE a LONG you SELL (false);
   * to close a SHORT you BUY (true). See `closingSide()`.
   */
  isBuy: boolean;
  /** Order size in base-coin units, as a string (exchange precision). */
  size: string;
  /** Trigger price as a string. */
  triggerPx: string;
  /** 'tp' = take-profit, 'sl' = stop-loss. */
  tpsl: Tpsl;
}

export interface CancelArgs {
  assetIndex: number;
  /** Exchange order id (oid) of the resting order to cancel. */
  oid: number;
}

// The SDK method arguments are the action content WITHOUT the `type` discriminator
// (the client injects it). We mirror those shapes here as the builder outputs.
export interface TriggerOrderParams {
  orders: Array<{
    a: number;
    b: boolean;
    p: string;
    s: string;
    r: boolean;
    t: { trigger: { isMarket: boolean; triggerPx: string; tpsl: Tpsl } };
  }>;
  grouping: 'na';
}

export interface CancelParams {
  cancels: Array<{ a: number; o: number }>;
}

/**
 * The side that CLOSES a position of the given direction. A reduce-only order
 * must be on the opposite side of the open position:
 *   LONG  → sell (isBuy=false)
 *   SHORT → buy  (isBuy=true)
 *
 * Accepts the full `Side` union for call-site convenience; only perps ever reach
 * HL order placement, so the #213 'LIABILITY' cash side never arrives here and is
 * treated like a LONG-close (isBuy=false) purely to satisfy the type.
 */
export function closingSide(positionSide: Side): boolean {
  return positionSide === 'SHORT';
}

/**
 * Pure builder for a reduce-only trigger (TP/SL) order action.
 * Always r:true, isMarket:true, p:"0" (market-execute trigger), grouping:"na".
 * No network, no signing — safe to unit-test.
 */
export function buildTriggerOrderParams(args: PlaceTriggerArgs): TriggerOrderParams {
  const { assetIndex, isBuy, size, triggerPx, tpsl } = args;
  if (!Number.isInteger(assetIndex) || assetIndex < 0) {
    throw new Error(`invalid assetIndex: ${assetIndex}`);
  }
  return {
    orders: [
      {
        a: assetIndex,
        b: isBuy,
        p: '0', // market trigger — price is "0"
        s: size,
        r: true, // reduce-only: the native safety guard
        t: { trigger: { isMarket: true, triggerPx, tpsl } },
      },
    ],
    grouping: 'na',
  };
}

/** Pure builder for a cancel action. No network, no signing. */
export function buildCancelParams(args: CancelArgs): CancelParams {
  const { assetIndex, oid } = args;
  if (!Number.isInteger(assetIndex) || assetIndex < 0) {
    throw new Error(`invalid assetIndex: ${assetIndex}`);
  }
  if (!Number.isInteger(oid) || oid < 0) {
    throw new Error(`invalid oid: ${oid}`);
  }
  return { cancels: [{ a: assetIndex, o: oid }] };
}

/** Result of a successful place: the resting order id (or a fill), plus raw. */
export interface PlaceResult {
  oid: number | null;
  resting: boolean;
  filled: boolean;
  raw: unknown;
}

/**
 * Extract the oid / status from an ExchangeClient.order() success response.
 * Throws if the exchange returned a per-order error string.
 */
export function parseOrderResult(resp: unknown): PlaceResult {
  const status = (resp as any)?.response?.data?.statuses?.[0];
  if (status && typeof status.error === 'string') {
    throw new Error(status.error);
  }
  if (status?.resting) {
    return { oid: status.resting.oid ?? null, resting: true, filled: false, raw: resp };
  }
  if (status?.filled) {
    return { oid: status.filled.oid ?? null, resting: false, filled: true, raw: resp };
  }
  return { oid: null, resting: false, filled: false, raw: resp };
}

/**
 * Place a reduce-only trigger order via a signed L1 action. The `client` is an
 * @nktkas/hyperliquid ExchangeClient bound to the user's window.ethereum wallet.
 * Returns the resulting resting-order id. LIVE — only called behind the flag,
 * after the match-guard, on explicit user confirm.
 */
export async function placeTrigger(
  client: ExchangeClient,
  args: PlaceTriggerArgs,
): Promise<PlaceResult> {
  const params = buildTriggerOrderParams(args);
  const resp = await client.order(params);
  return parseOrderResult(resp);
}

/** Cancel a resting reduce-only order via a signed L1 action. LIVE. */
export async function cancel(client: ExchangeClient, args: CancelArgs): Promise<unknown> {
  const params = buildCancelParams(args);
  return client.cancel(params);
}

// ── Formatting helpers (HL wire format) ──────────────────────────────────────
// HL perp prices allow at most 5 SIGNIFICANT figures (and ≤6 decimal places);
// integer prices are exempt from the sig-fig cap. This is a BEST-EFFORT format
// for the MVP — exact per-asset tick/lot rounding (needs `szDecimals` from meta)
// is a follow-up the live place/cancel round-trip will validate. Returns a plain
// decimal string (no exponent, no trailing zeros).
export function formatPx(price: number): string {
  if (!Number.isFinite(price) || price <= 0) throw new Error(`invalid price: ${price}`);
  let s: string;
  if (price >= 100000 || Number.isInteger(price)) {
    s = Math.round(price).toString();
  } else {
    s = price.toPrecision(5);
  }
  // Strip any exponent / trailing zeros, clamp to 6 decimals.
  let n = Number(s);
  const fixed = n.toFixed(6);
  return fixed.replace(/\.?0+$/, '');
}

/** Format a size (base-coin units) to a plain positive decimal string. */
export function formatSize(size: number): string {
  const a = Math.abs(size);
  if (!Number.isFinite(a) || a <= 0) throw new Error(`invalid size: ${size}`);
  return a.toFixed(8).replace(/\.?0+$/, '');
}
