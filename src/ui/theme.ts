// Design tokens lifted from the prototype. Inline styles keep this dependency-free
// and easy to read; in your repo these map cleanly onto Tailwind theme values or
// CSS custom properties.
export const t = {
  bg: '#0e1114',
  panel: '#161b20',
  panel2: '#0e1114',
  border: '#232a31',
  border2: '#1f262d',
  text: '#e7ebee',
  textDim: '#a9b2bb',
  mut: '#8b95a0',
  mut2: '#7c8791',
  green: '#34d399',
  red: '#f87171',
  amber: '#fbbf24',
  acc: '#8aa2ff',
  mono: "'JetBrains Mono', monospace",
  sans: "'Space Grotesk', system-ui, sans-serif",
} as const;

export const exchMeta: Record<string, { color: string; bd: string; dot: string }> = {
  Hyperliquid: { color: '#2dd4bf', bd: '#1c3f3a', dot: '#2dd4bf' },
  Lighter: { color: '#a78bfa', bd: '#34305a', dot: '#a78bfa' },
  Drift: { color: '#ff6ad5', bd: '#4a2540', dot: '#ff6ad5' },
  Variational: { color: '#60a5fa', bd: '#1e3352', dot: '#60a5fa' },
  Binance: { color: '#f3ba2f', bd: '#4a3f1e', dot: '#f3ba2f' },
};
