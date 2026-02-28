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

export function formatTimestamp(timestamp: string | number): string {
  return new Date(timestamp).toLocaleString();
}

export function formatRelativeTime(timestamp: string | number | null | undefined): string {
  if (!timestamp) return "Never";

  const date = new Date(timestamp);
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

export function truncateAddress(address: string, startChars = 6, endChars = 4): string {
  if (address.length <= startChars + endChars + 3) return address;
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
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
