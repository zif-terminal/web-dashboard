export interface ExchangeColors {
  bg: string;
  text: string;
  darkBg: string;
  darkText: string;
}

const exchangeColors: Record<string, ExchangeColors> = {
  drift: {
    bg: "bg-violet-100",
    text: "text-violet-700",
    darkBg: "dark:bg-violet-900/30",
    darkText: "dark:text-violet-400",
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
    drift:       "#8b5cf6", // violet-500
  };
  return barColors[exchangeName.toLowerCase()] ?? "#6b7280"; // gray-500 default
}
