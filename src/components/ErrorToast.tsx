import { useErrorToasts } from '../hooks/useErrorToasts';
import type { AppError } from '../lib/errorBus';

// ── Global error toast (zif #204) ────────────────────────────────────────────
// A sibling to the #201 LiveTradeToast, sharing its card styling but red-accented
// and anchored TOP-RIGHT so it never collides with the bottom-right trade toasts.
// Any failed query / mutation / user-action routes here via the errorBus, so the
// dashboard never fails silently again. Non-modal, dismissible, capped & deduped
// by the bus.

const ACCENT = '#f87171'; // t.red — matches the theme's error tone.
const ACCENT_BORDER = '#4a2a2c';

function ErrorCard({ err, onDismiss }: { err: AppError; onDismiss: (id: string) => void }) {
  return (
    <div
      style={{
        background: '#1a1f26',
        border: '1px solid #2a3040',
        borderLeft: `3px solid ${ACCENT}`,
        borderRadius: 8,
        padding: '10px 12px',
        minWidth: 280,
        maxWidth: 380,
        boxShadow: '0 4px 20px rgba(0,0,0,0.45)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        animation: 'zif-error-in 0.2s ease-out',
      }}
    >
      {/* Header row: type chip + close button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '.06em',
            color: ACCENT,
            border: `1px solid ${ACCENT_BORDER}`,
            borderRadius: 4,
            padding: '2px 7px',
          }}
        >
          {err.source ? `ERROR · ${err.source.toUpperCase()}` : 'ERROR'}
        </span>
        <button
          onClick={() => onDismiss(err.id)}
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

      {/* Message */}
      <div style={{ fontSize: 13, color: '#e2c7c7', lineHeight: 1.4, wordBreak: 'break-word' }}>
        {err.message}
      </div>
    </div>
  );
}

export function ErrorToastContainer() {
  const [errors, dismiss] = useErrorToasts();

  if (errors.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes zif-error-in {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
          top: 20,
          right: 20,
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          pointerEvents: 'auto',
          maxWidth: 'calc(100vw - 40px)',
        }}
        aria-live="assertive"
        aria-label="Error notifications"
      >
        {errors.map((e) => (
          <ErrorCard key={e.id} err={e} onDismiss={dismiss} />
        ))}
      </div>
    </>
  );
}
