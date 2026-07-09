import React, { useEffect, useState } from 'react';
import { useStore } from '../store/store';
import { IS_MOCK } from '../data/createDataSource';
import { useAuth } from '../data/authStore';
import { t } from '../ui/theme';
import { useIsMobile } from '../lib/useIsMobile';
import type { Tab } from '../types';

// Live feed is considered stale if no positions/portfolio push has landed within
// this window. The header re-checks on a light 5s tick (no per-frame churn).
const STALE_MS = 30_000;

// Icon components for mobile tab bar
const TabIcons: Record<Tab, React.FC<{ size?: number }>> = {
  overview: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="2" y="2" width="7" height="7" />
      <rect x="11" y="2" width="7" height="7" />
      <rect x="2" y="11" width="7" height="7" />
      <rect x="11" y="11" width="7" height="7" />
    </svg>
  ),
  performance: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <polyline points="2,16 6,10 10,12 18,4" />
      <circle cx="18" cy="4" r="1" fill="currentColor" />
    </svg>
  ),
  activity: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <polyline points="2,10 6,10 8,4 12,16 14,10 18,10" />
    </svg>
  ),
  // Income (#212): stacked bars — the period-rollup income view.
  income: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <line x1="2" y1="18" x2="18" y2="18" />
      <rect x="3" y="11" width="3" height="6" />
      <rect x="8.5" y="7" width="3" height="10" />
      <rect x="14" y="3" width="3" height="14" />
    </svg>
  ),
  plan: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M10 2L15 6V14C15 15.1 14.1 16 13 16H7C5.9 16 5 15.1 5 14V6L10 2Z" />
      <line x1="10" y1="9" x2="10" y2="13" />
    </svg>
  ),
  accounts: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="10" cy="6" r="3" />
      <path d="M4 16C4 13.3 6.7 11 10 11C13.3 11 16 13.3 16 16" />
    </svg>
  ),
};

/** True when the most recent live push is older than STALE_MS. */
function useStale(): boolean {
  const lastUpdate = useStore((s) => s.lastUpdate);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);
  // No data yet (lastUpdate 0) is "loading", not stale — don't flag it.
  return lastUpdate > 0 && now - lastUpdate > STALE_MS;
}

// `short` is the compact label used only in the mobile bottom bar, where the
// tabs must share a ~390px row without wrapping or overflowing.
// #208: the standalone "Positions" tab was removed — the Positions section now
// lives inline at the bottom of Overview.
const TABS: { k: Tab; label: string; short?: string }[] = [
  { k: 'overview', label: 'Overview' },
  { k: 'performance', label: 'Performance', short: 'Perf' },
  { k: 'activity', label: 'Activity', short: 'Actv' },
  // #212 Stream C: the "Income over time" period-rollup view (Jaison need #2).
  { k: 'income', label: 'Income' },
  { k: 'plan', label: 'Risk & plan', short: 'Risk' },
  { k: 'accounts', label: 'Accounts', short: 'Accts' },
];

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const isMobile = useIsMobile();
  const logout = useAuth((s) => s.logout);
  const stale = useStale();

  // Logo + nav tabs + right cluster. Shared between the desktop single-row
  // header and the mobile two-row header.
  const logo = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em' }}>Zif</span>
    </div>
  );

  const rightCluster = (
    <>
      {stale && (
        <span
          style={{
            fontFamily: t.mono, fontSize: 11, fontWeight: 600, color: t.amber,
            border: `1px solid ${t.amber}55`, background: `${t.amber}1a`,
            borderRadius: 7, padding: '4px 9px', whiteSpace: 'nowrap',
          }}
          title="Live data hasn't updated recently — prices may be out of date."
        >
          ⚠ Stale
        </span>
      )}
      {IS_MOCK && (
        <span
          style={{
            fontFamily: t.mono, fontSize: 11, color: t.amber,
            border: `1px solid #4a3f1e`, borderRadius: 7, padding: '4px 9px',
            whiteSpace: 'nowrap',
          }}
          title="Running on the in-memory mock engine. Set VITE_USE_MOCK=false for Hasura."
        >
          ◆ mock data
        </span>
      )}
      {!IS_MOCK && (
        <button
          onClick={logout}
          title="Log out and return to login screen"
          style={{
            fontFamily: t.sans,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            border: `1px solid ${t.border}`,
            borderRadius: 7,
            padding: isMobile ? '8px 11px' : '5px 11px',
            background: 'transparent',
            color: t.mut,
            whiteSpace: 'nowrap',
            lineHeight: 1,
          }}
        >
          Log out
        </button>
      )}
    </>
  );

  const navTabs = (
    <nav
      style={{
        display: 'flex',
        gap: isMobile ? 2 : 4,
        // Prevent line-wrapping so tabs stay in a single scrollable row
        width: isMobile ? 'max-content' : undefined,
        minWidth: isMobile ? '100%' : undefined,
      }}
    >
      {TABS.map((tb) => (
        <button
          key={tb.k}
          onClick={() => setTab(tb.k)}
          style={{
            fontFamily: t.sans,
            fontSize: isMobile ? 13.5 : 14,
            fontWeight: 600,
            cursor: 'pointer',
            border: 'none',
            borderRadius: 9,
            // ≥44 px touch target on mobile
            padding: isMobile ? '12px 13px' : '8px 14px',
            background: tab === tb.k ? '#1b2230' : 'transparent',
            color: tab === tb.k ? t.text : t.mut,
            whiteSpace: 'nowrap',
          }}
        >
          {tb.label}
        </button>
      ))}
    </nav>
  );

  return (
    <div style={{ minHeight: '100dvh', background: t.bg, color: t.text }}>
      <header
        style={{
          // border-bottom stays full-width so the divider spans the viewport;
          // the inner content is centered to the same near-full-width column as <main>.
          borderBottom: `1px solid ${t.border2}`,
          position: 'sticky', top: 0, zIndex: 10,
          background: t.bg,
        }}
      >
        {isMobile ? (
          // Mobile: single top row (logo + right cluster). Nav lives in the
          // fixed bottom tab bar below — standard mobile/PWA pattern.
          <div style={{ maxWidth: 1800, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px 8px' }}>
              {logo}
              <span style={{ flex: 1 }} />
              {rightCluster}
            </div>
          </div>
        ) : (
          // Desktop: single row — logo left, nav left-aligned next to logo, right cluster far right.
          <div
            style={{
              maxWidth: 1800, margin: '0 auto',
              display: 'flex', alignItems: 'center', gap: 16,
              padding: '8px 24px 12px',
            }}
          >
            {logo}
            {navTabs}
            <span style={{ flex: 1 }} />
            {rightCluster}
          </div>
        )}
      </header>

      <main
        style={{
          maxWidth: 1800,
          margin: '0 auto',
          // On mobile, clear the fixed bottom tab bar (~56px) plus the iOS
          // home-indicator safe-area inset so the last content isn't hidden.
          padding: isMobile
            ? '20px 14px calc(76px + env(safe-area-inset-bottom))'
            : '32px 24px 80px',
        }}
      >
        {children}
      </main>

      {isMobile && (
        // Fixed bottom tab bar — mobile/PWA pattern. Clears the iOS home
        // indicator via the safe-area inset.
        <nav
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 20,
            display: 'flex',
            justifyContent: 'space-around',
            alignItems: 'stretch',
            background: t.bg,
            borderTop: `1px solid ${t.border2}`,
            paddingBottom: 'calc(6px + env(safe-area-inset-bottom))',
          }}
        >
          {TABS.map((tb) => {
            const active = tab === tb.k;
            const IconComponent = TabIcons[tb.k];
            return (
              <button
                key={tb.k}
                onClick={() => setTab(tb.k)}
                style={{
                  flex: 1,
                  // Allow the flex child to shrink below its content width so 6
                  // tabs never force horizontal overflow on a narrow phone.
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                  // ≥44px touch target (56px bar height).
                  minHeight: 56,
                  padding: '8px 1px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontFamily: t.sans,
                  fontSize: 10.5,
                  fontWeight: 600,
                  color: active ? t.text : t.mut,
                  whiteSpace: 'nowrap',
                }}
              >
                <IconComponent size={19} />
                <span style={{ lineHeight: 1.1, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {tb.short ?? tb.label}
                </span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
};
