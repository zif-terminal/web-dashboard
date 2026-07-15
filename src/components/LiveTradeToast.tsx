import { useLiveTradeToasts } from '../hooks/useLiveTradeToasts';
import type { TradeToast } from '../hooks/useLiveTradeToasts';
import { col } from '../lib/format';

// ── Accent palette per act ───────────────────────────────────────────────────
const ACT_META: Record<string, { label: string; color: string; border: string }> = {
  CLOSE:   { label: 'CLOSED',     color: '#34d399', border: '#1f4a3a' },
  FILL:    { label: 'ENTERED',    color: '#8aa2ff', border: '#2c3550' },
  LIQ:    { label: 'LIQUIDATED', color: '#f87171', border: '#4a2a2c' },
  HACK:   { label: 'HACK',       color: '#fca5a5', border: '#7f1d1d' },
};
const DEFAULT_META = { label: 'TRADE', color: '#8aa2ff', border: '#2c3550' };

// Split the raw `text` into a main line and an optional sub-line.
// Convention in mat_activity_stream: the text is already a human-readable
// sentence, e.g. "Entered 2,423 WTI-PERP long @ $71.95 / 30 fills · fees -$13".
// We split on the first " / " to get a cleaner two-line toast.
function splitText(text: string): [string, string | null] {
  const idx = text.indexOf(' / ');
  if (idx === -1) return [text, null];
  return [text.slice(0, idx), text.slice(idx + 3)];
}

// ── Single toast card ────────────────────────────────────────────────────────
function ToastCard({ toast, onDismiss }: { toast: TradeToast; onDismiss: (id: string) => void }) {
  const meta = ACT_META[toast.act] ?? DEFAULT_META;
  const [main, sub] = splitText(toast.text);
  const hasPnl = toast.pnl !== 0;

  return (
    <div
      style={{
        background: '#1a1f26',
        border: `1px solid #2a3040`,
        borderLeft: `3px solid ${meta.color}`,
        borderRadius: 8,
        padding: '10px 12px',
        minWidth: 280,
        maxWidth: 360,
        boxShadow: '0 4px 20px rgba(0,0,0,0.45)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        // Enter animation — slide in from the right
        animation: 'zif-toast-in 0.2s ease-out',
      }}
    >
      {/* Header row: type chip + close button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '.06em',
            color: meta.color,
            border: `1px solid ${meta.border}`,
            borderRadius: 4,
            padding: '2px 7px',
          }}
        >
          {meta.label}
        </span>
        <button
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#5a6472',
            fontSize: 14,
            lineHeight: 1,
            padding: '0 2px',
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>

      {/* Main line */}
      <div style={{ fontSize: 13, color: '#cdd4da', lineHeight: 1.4 }}>
        {main}
      </div>

      {/* Sub line + PnL */}
      {(sub || hasPnl) && (
        <div style={{ fontSize: 12, color: '#8b95a0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {sub && <span>{sub}</span>}
          {hasPnl && (
            <span style={{ color: col(toast.pnl), fontWeight: 600 }}>
              {toast.pnl > 0 ? `+$${toast.pnl.toFixed(0)}` : `-$${Math.abs(toast.pnl).toFixed(0)}`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Container: fixed bottom-right, stacked ───────────────────────────────────
export function LiveTradeToastContainer() {
  const [toasts, dismiss] = useLiveTradeToasts();

  if (toasts.length === 0) return null;

  return (
    <>
      {/* Keyframe injection — inline style tag, avoids any CSS file dependency */}
      <style>{`
        @keyframes zif-toast-in {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
          bottom: 24,
          right: 20,
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column-reverse',
          gap: 8,
          pointerEvents: 'auto',
        }}
        aria-live="polite"
        aria-label="Live trade notifications"
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </>
  );
}
