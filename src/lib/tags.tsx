// Shared identity-tag primitives (exchange / wallet / account chips).
//
// Extracted from Positions.tsx (#166) so the Activity feed rows render the EXACT
// same exchange→wallet→account chips as the position cards — one source of truth
// keeps them visually identical. Positions.tsx and Activity.tsx both import from
// here.
import React from 'react';
import { t, exchMeta } from '../ui/theme';
import { shortAddr } from './format';

// ── Chip palette ─────────────────────────────────────────────────────────────
// Exchange chip is colored PER VENUE via exchMeta (Hyperliquid=teal, Lighter=
// violet, Drift=pink, Variational=blue). Neutral fallback for unknown venues.
export function exchChipStyle(exch: string): { fg: string; bd: string; bg: string } {
  const m = exchMeta[exch];
  if (!m) return { fg: t.mut, bd: t.border, bg: 'transparent' };
  return { fg: m.color, bd: m.bd, bg: `${m.color}14` };
}
// Wallet chip: ONE warm-bronze accent, clear of every exchange tint and of the
// green/red side + SPOT/PERP badges.
export const WALLET_CHIP = { fg: '#d3a574', bd: '#4a3a26', bg: 'rgba(211,165,116,0.10)' } as const;
// Account chip: muted cool-slate — the exchange sub-account label.
export const ACCOUNT_CHIP = { fg: '#8faab8', bd: '#2c3d4a', bg: 'rgba(143,170,184,0.08)' } as const;
// Market chip (funding/settle/fill market, e.g. HYPE-PERP): neutral, subdued —
// it's descriptive metadata, not an identity classifier, so it stays quiet.
export const MARKET_CHIP = { fg: '#9aa4ae', bd: '#2a323a', bg: 'rgba(154,164,174,0.06)' } as const;

// Minimal identity shape shared by Position and ActivityEvent.
export interface Taggable {
  exch: string;
  wallet: string;       // account label (exchange_accounts.label)
  walletLabel: string;  // per-user wallet name (user_wallets.label); '' if unset
}

/**
 * Wallet-chip text: prefer the real per-user WALLET label (user_wallets.label);
 * fall back to the account label / shortened raw address. '' → chip omitted.
 */
export function walletLabelOf(p: Taggable): string {
  const wl = p.walletLabel?.trim() ?? '';
  if (wl && wl !== '—') return wl;
  const w = p.wallet?.trim() ?? '';
  if (!w || w === '—') return '';
  return shortAddr(w);
}

/**
 * Account-chip text: the exchange sub-account label — only when it ADDS info the
 * wallet chip doesn't already show (omit when there's no distinct wallet label,
 * or when they're identical).
 */
export function accountLabelOf(p: Taggable): string {
  const w = p.wallet?.trim() ?? '';
  if (!w || w === '—') return '';
  const wl = p.walletLabel?.trim() ?? '';
  if (!wl || wl === '—') return '';
  if (wl === w) return '';
  return w;
}

/** Colored bordered chip — same size/shape as the position-card chips. */
export const ColorChip: React.FC<{ fg: string; bd: string; bg: string; children: React.ReactNode }> = ({ fg, bd, bg, children }) => (
  <span style={{ fontSize: 10.5, fontWeight: 600, color: fg, border: `1px solid ${bd}`, background: bg, borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' }}>
    {children}
  </span>
);

/**
 * The exchange→wallet→account chip cluster, rendered identically for position
 * cards and activity rows. Wallet/account chips are omitted when they'd be empty
 * or duplicative (same rules as the position card).
 */
export const IdentityTags: React.FC<{ p: Taggable }> = ({ p }) => {
  const wl = walletLabelOf(p);
  const acc = accountLabelOf(p);
  return (
    <>
      {p.exch && <ColorChip {...exchChipStyle(p.exch)}>{p.exch}</ColorChip>}
      {wl && <ColorChip {...WALLET_CHIP}>{wl}</ColorChip>}
      {acc && <ColorChip {...ACCOUNT_CHIP}>{acc}</ColorChip>}
    </>
  );
};
