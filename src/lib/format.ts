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
