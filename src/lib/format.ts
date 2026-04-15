export function formatNumber(value: string, decimals: number = 4): string {
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

export function formatSignedNumber(value: string, decimals: number = 2): string {
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  const sign = num >= 0 ? "+" : "";
  return sign + num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatPercentage(value: string, decimals: number = 4): string {
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  const percentage = num * 100;
  const sign = percentage >= 0 ? "+" : "";
  return sign + percentage.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }) + "%";
}

/** Parse a timestamp that may be an ISO string, a unix-ms number, or a unix-ms string. */
export function parseTimestamp(timestamp: string | number): Date {
  const ts = typeof timestamp === "string" && /^\d+$/.test(timestamp) ? Number(timestamp) : timestamp;
  return new Date(ts);
}

export function formatTimestamp(timestamp: string | number): string {
  return parseTimestamp(timestamp).toLocaleString();
}

export function formatRelativeTime(timestamp: string | number | null | undefined): string {
  if (!timestamp) return "Never";

  const date = parseTimestamp(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour !== 1 ? "s" : ""} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay !== 1 ? "s" : ""} ago`;

  return date.toLocaleDateString();
}

export type SyncFreshness = "fresh" | "ok" | "stale" | "very-stale" | "never";

/** Classify how fresh a last_synced_at timestamp is. */
export function getSyncFreshness(timestamp: string | number | null | undefined): SyncFreshness {
  if (!timestamp) return "never";

  const date = parseTimestamp(timestamp);
  const diffMs = Date.now() - date.getTime();
  const diffMin = diffMs / 60_000;

  if (diffMin < 15) return "fresh";
  if (diffMin < 60) return "ok";
  if (diffMin < 360) return "stale";
  return "very-stale";
}

/** Get Tailwind text color class for a sync freshness level. */
export function getSyncFreshnessColor(freshness: SyncFreshness): string {
  switch (freshness) {
    case "fresh": return "text-green-600 dark:text-green-400";
    case "ok": return "text-muted-foreground";
    case "stale": return "text-yellow-600 dark:text-yellow-400";
    case "very-stale": return "text-red-600 dark:text-red-400";
    case "never": return "text-red-600 dark:text-red-400";
  }
}

/** Human-readable label for sync freshness. */
export function getSyncFreshnessLabel(freshness: SyncFreshness): string {
  switch (freshness) {
    case "fresh": return "Fresh";
    case "ok": return "OK";
    case "stale": return "Stale";
    case "very-stale": return "Very stale";
    case "never": return "Never synced";
  }
}

/** Format a currency value with $ sign (no +/- prefix). */
export function formatCurrency(value: string | number, decimals = 2): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "$0.00";
  return `$${Math.abs(num).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/** Format a duration in ms to human-readable. */
export function formatDuration(ms: number): string {
  const hours = ms / (1000 * 60 * 60);
  if (hours < 1) return `${Math.round(ms / (1000 * 60))}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)}d`;
  return `${Math.round(days / 30)}mo`;
}

/** Color class based on value sign. */
export function pnlColor(value: number): string {
  if (value > 0) return "text-green-600 dark:text-green-400";
  if (value < 0) return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}

export function truncateAddress(address: string, startChars = 6, endChars = 4): string {
  if (address.length <= startChars + endChars + 3) return address;
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/** Format a wallet label with chain + truncated address as fallback. E.g. "Solana · 6arBD...7J1H" */
export function formatWalletLabel(wallet: { label?: string | null; address?: string; chain?: string } | null | undefined): string {
  if (wallet?.label && wallet.label.trim().length > 0) return wallet.label.trim();
  const chain = wallet?.chain
    ? wallet.chain.charAt(0).toUpperCase() + wallet.chain.slice(1)
    : "Unknown";
  const address = truncateAddress(wallet?.address || "");
  return `${chain} \u00b7 ${address}`;
}

export function getDisplayName(label: string | null | undefined, address: string, startChars = 6, endChars = 4, walletLabel?: string | null): string {
  if (label && label.trim().length > 0) {
    return label.trim();
  }
  if (walletLabel && walletLabel.trim().length > 0) {
    return walletLabel.trim();
  }
  return truncateAddress(address, startChars, endChars);
}
