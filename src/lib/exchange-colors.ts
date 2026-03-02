export interface ExchangeColors {
  bg: string;
  text: string;
  darkBg: string;
  darkText: string;
}

const exchangeColors: Record<string, ExchangeColors> = {
  hyperliquid: {
    bg: "bg-emerald-100",
    text: "text-emerald-700",
    darkBg: "dark:bg-emerald-900/30",
    darkText: "dark:text-emerald-400",
  },
  lighter: {
    bg: "bg-cyan-100",
    text: "text-cyan-700",
    darkBg: "dark:bg-cyan-900/30",
    darkText: "dark:text-cyan-400",
  },
  drift: {
    bg: "bg-violet-100",
    text: "text-violet-700",
    darkBg: "dark:bg-violet-900/30",
    darkText: "dark:text-violet-400",
  },
  jupiter: {
    bg: "bg-orange-100",
    text: "text-orange-700",
    darkBg: "dark:bg-orange-900/30",
    darkText: "dark:text-orange-400",
  },
  binance: {
    bg: "bg-yellow-100",
    text: "text-yellow-700",
    darkBg: "dark:bg-yellow-900/30",
    darkText: "dark:text-yellow-400",
  },
  dydx: {
    bg: "bg-indigo-100",
    text: "text-indigo-700",
    darkBg: "dark:bg-indigo-900/30",
    darkText: "dark:text-indigo-400",
  },
  gmx: {
    bg: "bg-blue-100",
    text: "text-blue-700",
    darkBg: "dark:bg-blue-900/30",
    darkText: "dark:text-blue-400",
  },
};

const defaultColors: ExchangeColors = {
  bg: "bg-gray-100",
  text: "text-gray-700",
  darkBg: "dark:bg-gray-800",
  darkText: "dark:text-gray-300",
};

export function getExchangeColors(exchangeName: string): ExchangeColors {
  const normalizedName = exchangeName.toLowerCase();
  return exchangeColors[normalizedName] || defaultColors;
}

export function getExchangeColorClasses(exchangeName: string): string {
  const colors = getExchangeColors(exchangeName);
  return `${colors.bg} ${colors.text} ${colors.darkBg} ${colors.darkText}`;
}

/**
 * B4.5: Returns a CSS hex color for use in the exchange distribution bar.
 * Uses the 500-weight variant of each exchange's brand color.
 */
export function getExchangeBarColor(exchangeName: string): string {
  const barColors: Record<string, string> = {
    hyperliquid: "#10b981", // emerald-500
    lighter:     "#06b6d4", // cyan-500
    drift:       "#8b5cf6", // violet-500
    jupiter:     "#f97316", // orange-500
    binance:     "#eab308", // yellow-500
    dydx:        "#6366f1", // indigo-500
    gmx:         "#3b82f6", // blue-500
  };
  return barColors[exchangeName.toLowerCase()] ?? "#6b7280"; // gray-500 default
}
