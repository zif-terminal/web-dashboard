import { Component, type ReactNode, type ErrorInfo } from 'react';
import { pushError } from '../lib/errorBus';

// ── React error boundary (zif #204) ──────────────────────────────────────────
// A render exception anywhere in the tree used to unmount the whole app → BLANK
// WHITE SCREEN ("text just disappears"). This boundary catches it and shows a
// tasteful fallback panel with a reload button, and logs + surfaces the error to
// the global error bus. Wrapped around the app root in main.tsx.

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : String(error);
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // Log for diagnostics (component stack is invaluable for a render crash).
    // eslint-disable-next-line no-console
    console.error('[error-boundary] render crash', error, info?.componentStack);
    // Also surface via the toast bus so it's visible even before/after reload.
    const message = error instanceof Error ? error.message : String(error);
    pushError(message || 'A rendering error occurred', 'render');
  }

  handleReload = () => {
    // Full reload is the safest recovery for a corrupted render tree.
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: '#0e1114',
          fontFamily: "'Space Grotesk', system-ui, sans-serif",
          color: '#e7ebee',
        }}
      >
        <div
          style={{
            maxWidth: 440,
            width: '100%',
            background: '#161b20',
            border: '1px solid #2a3040',
            borderLeft: '3px solid #f87171',
            borderRadius: 12,
            padding: '28px 26px',
            boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '.06em',
              color: '#f87171',
              border: '1px solid #4a2a2c',
              borderRadius: 5,
              padding: '3px 9px',
              display: 'inline-block',
              marginBottom: 14,
            }}
          >
            SOMETHING WENT WRONG
          </div>
          <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 8, letterSpacing: '-.01em' }}>
            The dashboard hit an unexpected error
          </div>
          <div style={{ fontSize: 13.5, color: '#a9b2bb', lineHeight: 1.55, marginBottom: 20 }}>
            The view stopped rendering instead of showing you a blank page. Reloading usually
            clears it. If it keeps happening, the details below help us fix it.
          </div>
          {this.state.message && (
            <div
              style={{
                fontSize: 12,
                fontFamily: "'JetBrains Mono', monospace",
                color: '#e2c7c7',
                background: '#0e1114',
                border: '1px solid #2c2226',
                borderRadius: 8,
                padding: '10px 12px',
                marginBottom: 20,
                wordBreak: 'break-word',
                maxHeight: 120,
                overflow: 'auto',
              }}
            >
              {this.state.message}
            </div>
          )}
          <button
            onClick={this.handleReload}
            style={{
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              background: '#8aa2ff',
              color: '#0e1114',
              border: 'none',
              borderRadius: 10,
              padding: '11px 22px',
            }}
          >
            Reload dashboard
          </button>
        </div>
      </div>
    );
  }
}
