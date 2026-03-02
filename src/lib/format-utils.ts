/**
 * B4.3: Shared PnL formatting helpers used by the simulations list page and
 * the sim-runs-table. These mirror the local helpers in simulations/[id]/page.tsx
 * but are extracted here to avoid duplication across multiple consumers.
 */

/**
 * Format a PnL value with an explicit +/- sign and 2 decimal places.
 * @param value  Numeric PnL (may be null/undefined for runs with no positions yet).
 * @param currency  Quote currency label appended after the number (e.g. "USDC").
 * @returns Formatted string such as "+123.45 USDC" or "—" when value is absent.
 */
export function formatPnL(value: number | undefined | null, currency: string): string {
  if (value == null) return "—";
  const n = Number(value);
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

/**
 * Format a number as a USD dollar amount (e.g. "$1,234.56" or "-$12.30").
 * @param value    Numeric value; null/undefined → "—".
 * @param decimals Number of decimal places (default: 2).
 */
export function formatUSD(value: number | undefined | null, decimals = 2): string {
  if (value == null) return "—";
  const n = Number(value);
  if (isNaN(n)) return "—";
  const prefix = n < 0 ? "-$" : "$";
  return `${prefix}${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/**
 * Return a Tailwind text-colour class for a PnL value.
 * @returns "text-green-500" for non-negative, "text-red-500" for negative, "" for null.
 */
export function pnlClass(value: number | undefined | null): string {
  if (value == null) return "";
  return Number(value) >= 0 ? "text-green-500" : "text-red-500";
}
