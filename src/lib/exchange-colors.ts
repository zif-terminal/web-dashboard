export interface ExchangeColors {
  bg: string;
  text: string;
  darkBg: string;
  darkText: string;
}

const exchangeColors: Record<string, ExchangeColors> = {
  drift: {
    bg: "bg-green-100",
    text: "text-green-700",
    darkBg: "dark:bg-green-900/30",
    darkText: "dark:text-green-400",
  },
  hyperliquid: {
    bg: "bg-cyan-100",
    text: "text-cyan-700",
    darkBg: "dark:bg-cyan-900/30",
    darkText: "dark:text-cyan-400",
  },
  lighter: {
    bg: "bg-amber-100",
    text: "text-amber-700",
    darkBg: "dark:bg-amber-900/30",
    darkText: "dark:text-amber-400",
  },
  variational: {
    bg: "bg-orange-100",
    text: "text-orange-700",
    darkBg: "dark:bg-orange-900/30",
    darkText: "dark:text-orange-400",
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
 * Returns a CSS hex color for use in the exchange distribution bar.
 */
export function getExchangeBarColor(exchangeName: string): string {
  const barColors: Record<string, string> = {
    drift:        "#22c55e", // green-500
    hyperliquid:  "#06b6d4", // cyan-500
    lighter:      "#f59e0b", // amber-500
    variational:  "#f97316", // orange-500
  };
  return barColors[exchangeName.toLowerCase()] ?? "#6b7280"; // gray-500 default
}
