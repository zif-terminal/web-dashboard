import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/store';
import { dataSource } from '../store/useLiveData';
import { Card, Mono, Chip, Segment } from '../ui/primitives';
import { t } from '../ui/theme';
import { k, col } from '../lib/format';
import { useIsMobile } from '../lib/useIsMobile';
import type { IncomePeriodRow, IncomeGrain, IncomeCategory, IncomeFilter } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Income over time (EPIC #212, Stream C — Jaison need #2).
//
// The avg-cost / WAC trader lens: "income" from activity at a daily / weekly /
// monthly frequency, with each source (realized trading PnL + funding + fees +
// rewards + interest) as its OWN line, per period. Data is the server-pre-bucketed
// `mat_income_periods` rollup (RLS-scoped) — the FE groups the returned rows by
// period_start then category; NO client re-bucketing (the server pre-bucketed).
//
// transfer / hack are NON-INCOME (tax_category non_taxable / casualty_loss): they
// are EXCLUDED from the income NET (follow the tax_category — never sum non-income
// into "income"). transfer flow is shown subtly as a separate, muted column so the
// user can still see deposits/withdrawals moved cash without polluting income.
// ─────────────────────────────────────────────────────────────────────────────

// The five INCOME categories, each its own line/column, in display order.
const INCOME_CATS: { c: IncomeCategory; label: string; short: string }[] = [
  { c: 'realized_trade', label: 'Realized', short: 'Realized' },
  { c: 'funding', label: 'Funding', short: 'Funding' },
  { c: 'fee', label: 'Fees', short: 'Fees' },
  { c: 'reward', label: 'Rewards', short: 'Rewards' },
  { c: 'interest', label: 'Interest', short: 'Interest' },
];
const INCOME_CAT_SET = new Set<IncomeCategory>(INCOME_CATS.map((x) => x.c));

// Grain options + the per-grain default look-back window (# of buckets back from
// the current period). Server buckets are UTC day / ISO-week(Mon) / month starts;
// we compute a period_start _gte bound from the current clock so the window tracks
// real-now (mirrors the Performance #184 anchor approach — no frozen constant).
const GRAINS: { k: IncomeGrain; label: string }[] = [
  { k: 'day', label: 'Daily' },
  { k: 'week', label: 'Weekly' },
  { k: 'month', label: 'Monthly' },
];

// Selectable windows per grain: a small chip set of look-back spans. `buckets` is
// how many periods of the CURRENT grain to include; 'all' pulls everything.
const WINDOWS: Record<IncomeGrain, { k: string; label: string; buckets: number }[]> = {
  day: [
    { k: '7', label: '7D', buckets: 7 },
    { k: '30', label: '30D', buckets: 30 },
    { k: '90', label: '90D', buckets: 90 },
    { k: 'all', label: 'All', buckets: 100000 },
  ],
  week: [
    { k: '8', label: '8W', buckets: 8 },
    { k: '26', label: '26W', buckets: 26 },
    { k: '52', label: '52W', buckets: 52 },
    { k: 'all', label: 'All', buckets: 100000 },
  ],
  month: [
    { k: '6', label: '6M', buckets: 6 },
    { k: '12', label: '12M', buckets: 12 },
    { k: '24', label: '24M', buckets: 24 },
    { k: 'all', label: 'All', buckets: 100000 },
  ],
};

const DAY_MS = 86_400_000;

// Compute the epoch-ms bounds for `grain` covering the last `buckets` periods up to
// and including the current one. Lower bound is the START of the (buckets-1)-back
// period; upper is now (period_start is always <= now). UTC throughout — matches the
// server's date_trunc bucketing.
function incomeBounds(grain: IncomeGrain, buckets: number, now = Date.now()): { sinceMs: number; untilMs: number } {
  const untilMs = now;
  if (buckets >= 100000) return { sinceMs: 0, untilMs };
  const d = new Date(now);
  if (grain === 'day') {
    const curStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    return { sinceMs: curStart - (buckets - 1) * DAY_MS, untilMs };
  }
  if (grain === 'week') {
    const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const dow = (new Date(dayStart).getUTCDay() + 6) % 7; // 0 = Monday (ISO week start)
    const curStart = dayStart - dow * DAY_MS;
    return { sinceMs: curStart - (buckets - 1) * 7 * DAY_MS, untilMs };
  }
  // month
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const sinceDate = new Date(Date.UTC(y, m - (buckets - 1), 1));
  return { sinceMs: sinceDate.getTime(), untilMs };
}

// Format a period_start (epoch-ms UTC bucket start) for its grain.
function fmtPeriod(ms: number, grain: IncomeGrain): string {
  const d = new Date(ms);
  if (grain === 'month') return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  if (grain === 'week') {
    const end = new Date(ms + 6 * DAY_MS);
    const a = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const b = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    return `${a} – ${b}`;
  }
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// One period's folded category breakdown + income NET (income cats only).
interface PeriodAgg {
  periodStart: number;
  byCat: Record<IncomeCategory, number>;
  incomeNet: number;   // Σ over the five income categories only
  transfer: number;    // non-income flow, shown muted (never in incomeNet)
  hack: number;        // extraordinary, shown only when nonzero (never in incomeNet)
  eventCount: number;
}

const zeroCats = (): Record<IncomeCategory, number> => ({
  realized_trade: 0, funding: 0, fee: 0, reward: 0, interest: 0, hack: 0, transfer: 0,
});

// Fold the raw mat_income_periods rows (for ONE grain) into per-period aggregates,
// summing each category across accounts. incomeNet excludes transfer + hack (they
// are non-income per tax_category). Sorted newest-first.
function foldPeriods(rows: IncomePeriodRow[]): PeriodAgg[] {
  const byPeriod = new Map<number, PeriodAgg>();
  for (const r of rows) {
    let p = byPeriod.get(r.periodStart);
    if (!p) {
      p = { periodStart: r.periodStart, byCat: zeroCats(), incomeNet: 0, transfer: 0, hack: 0, eventCount: 0 };
      byPeriod.set(r.periodStart, p);
    }
    p.byCat[r.category] = (p.byCat[r.category] ?? 0) + r.amount;
    p.eventCount += r.eventCount;
    if (INCOME_CAT_SET.has(r.category)) p.incomeNet += r.amount;
    else if (r.category === 'transfer') p.transfer += r.amount;
    else if (r.category === 'hack') p.hack += r.amount;
  }
  return [...byPeriod.values()].sort((a, b) => b.periodStart - a.periodStart);
}

// Distinct non-empty values, sorted (for the filter dropdowns).
function distinct(vals: (string | undefined)[]): string[] {
  return [...new Set(vals.map((v) => (v ?? '').trim()).filter(Boolean))].sort();
}

function FilterSelect({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 11, color: t.mut, letterSpacing: '.03em' }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          fontFamily: t.sans, fontSize: 12.5, color: value ? t.text : t.mut,
          background: t.panel, border: `1px solid ${value ? t.acc : t.border}`,
          borderRadius: 8, padding: '6px 9px', cursor: 'pointer', maxWidth: 180,
        }}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

// Grid: period label | 5 income cols | Net | Transfer (muted). Hack folds into a
// note only when present (rare/inert), so it isn't a permanent column.
const GRID = '1.5fr 1fr 1fr 1fr 1fr 1fr 1.2fr 1.1fr';

const Num: React.FC<{ v: number; bold?: boolean; muted?: boolean }> = ({ v, bold, muted }) => (
  <Mono style={{ fontSize: bold ? 14 : 13, fontWeight: bold ? 600 : 400, textAlign: 'right', color: muted ? t.mut2 : col(v) }}>
    {k(v)}
  </Mono>
);

export function Income() {
  const isMobile = useIsMobile();
  // Authoritative, RLS-scoped account list (ACCOUNTS_SUB) — the filter options come
  // from THIS (#211), not from the loaded income window, so every exchange/wallet/
  // account the user owns is selectable even if it has no income in the window.
  const wallets = useStore((s) => s.wallets);

  const [grain, setGrain] = useState<IncomeGrain>('week');
  // Window chip key, per grain (defaults to the middle span).
  const [winKey, setWinKey] = useState<string>('26');

  const [fExch, setFExch] = useState('');
  const [fWallet, setFWallet] = useState('');
  const [fAccount, setFAccount] = useState('');
  const filter: IncomeFilter = useMemo(
    () => ({ exch: fExch || undefined, wallet: fWallet || undefined, account: fAccount || undefined }),
    [fExch, fWallet, fAccount],
  );
  const filterKey = `${fExch}|${fWallet}|${fAccount}`;
  const filterActive = fExch !== '' || fWallet !== '' || fAccount !== '';

  const winOpts = WINDOWS[grain];
  // Keep the window valid when the grain changes (each grain has its own chip set).
  const activeWin = winOpts.find((w) => w.k === winKey) ?? winOpts[1] ?? winOpts[0];
  const bounds = useMemo(() => incomeBounds(grain, activeWin.buckets), [grain, activeWin.buckets]);

  const [rows, setRows] = useState<IncomePeriodRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch the rollup for the selected grain + window + filter. Guarded so a late
  // response from a superseded selection is dropped (Performance #187/#194 pattern).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    dataSource.fetchIncomePeriods(grain, bounds.sinceMs, bounds.untilMs, filter)
      .then((r) => { if (!cancelled) { setRows(r); setLoading(false); } })
      .catch(() => { if (!cancelled) { setRows([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, [grain, bounds.sinceMs, bounds.untilMs, filterKey]);

  const periods = useMemo(() => foldPeriods(rows), [rows]);

  // Window totals (Σ over every period) — one card per income category + Net income.
  const totals = useMemo(() => {
    const cat = zeroCats();
    let incomeNet = 0, transfer = 0, hack = 0;
    for (const p of periods) {
      for (const c of Object.keys(p.byCat) as IncomeCategory[]) cat[c] += p.byCat[c];
      incomeNet += p.incomeNet; transfer += p.transfer; hack += p.hack;
    }
    return { cat, incomeNet, transfer, hack };
  }, [periods]);

  const anyHack = periods.some((p) => p.hack !== 0);

  // Filter options from the user's FULL account list (#211).
  const exchOpts = useMemo(() => distinct(wallets.flatMap((w) => w.accounts.map((a) => a.exch))), [wallets]);
  const walletOpts = useMemo(() => distinct(wallets.map((w) => w.label)), [wallets]);
  const accountOpts = useMemo(() => distinct(wallets.flatMap((w) => w.accounts.map((a) => a.name))), [wallets]);

  const cards = [
    { label: 'Net income', v: totals.incomeNet, sub: 'realized + funding + fees + rewards + interest', accent: true },
    { label: 'Realized', v: totals.cat.realized_trade, sub: 'trading P/L (avg-cost)' },
    { label: 'Funding', v: totals.cat.funding, sub: 'paid / received' },
    { label: 'Fees', v: totals.cat.fee, sub: 'taker & maker' },
    { label: 'Rewards', v: totals.cat.reward, sub: 'staking & incentives' },
    { label: 'Interest', v: totals.cat.interest, sub: 'lending / borrow' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <h1 style={{ fontSize: 'clamp(24px,5vw,32px)', fontWeight: 600, letterSpacing: '-.02em', margin: 0 }}>Income</h1>
      </div>
      <p style={{ fontSize: 14, color: t.mut, margin: '0 0 18px' }}>
        What your book earned over time — realized trading P/L, funding, fees, rewards and interest, each as its own line, per period. Deposits and withdrawals are shown separately and are not counted as income.
      </p>

      {/* Grain + window selectors. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <Segment options={GRAINS.map((g) => ({ k: g.k, label: g.label }))} value={grain} onChange={(g) => setGrain(g as IncomeGrain)} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center' }}>
          {winOpts.map((w) => <Chip key={w.k} active={activeWin.k === w.k} onClick={() => setWinKey(w.k)}>{w.label}</Chip>)}
        </div>
      </div>

      {/* Filter bar (#211 — sourced from the store's full account list). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 22 }}>
        <FilterSelect label="Exchange" value={fExch} options={exchOpts} onChange={setFExch} />
        <FilterSelect label="Wallet" value={fWallet} options={walletOpts} onChange={setFWallet} />
        <FilterSelect label="Account" value={fAccount} options={accountOpts} onChange={setFAccount} />
        {filterActive && (
          <button
            onClick={() => { setFExch(''); setFWallet(''); setFAccount(''); }}
            style={{ fontFamily: t.sans, fontSize: 12, color: t.mut, background: 'transparent', border: `1px solid ${t.border}`, borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Summary cards — window totals per income category + Net income. */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(auto-fit,minmax(148px,1fr))', gap: 12, marginBottom: 30 }}>
        {cards.map((c) => (
          <Card key={c.label} style={{ padding: '16px 17px', background: c.accent ? 'linear-gradient(160deg,#191e29,#15191e)' : t.panel, border: `1px solid ${c.accent ? '#2c3550' : t.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '.05em', color: t.mut }}>{c.label}</div>
            <Mono style={{ fontSize: 24, fontWeight: 600, marginTop: 7, color: col(c.v), display: 'block' }}>{k(c.v)}</Mono>
            <div style={{ fontSize: 12, color: t.mut2, marginTop: 4, lineHeight: 1.35 }}>{c.sub}</div>
          </Card>
        ))}
      </div>

      {/* Per-period breakdown table. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>By {grain === 'day' ? 'day' : grain === 'week' ? 'week' : 'month'}</h2>
        <span style={{ fontSize: 12, color: t.mut2 }}>{periods.length} period{periods.length === 1 ? '' : 's'} · each source its own column</span>
      </div>

      <Card style={{ padding: '4px 6px', overflowX: 'auto', border: 'none', background: 'transparent', borderRadius: 0 }}>
        <div style={{ minWidth: 880 }}>
          <Row header cols={['Period', 'Realized', 'Funding', 'Fees', 'Rewards', 'Interest', 'Net income', 'Transfers']} />
          {loading ? (
            <LoadingRows />
          ) : periods.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              {periods.map((p) => (
                <div key={p.periodStart} style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, padding: 14, borderBottom: '1px solid #161c21', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    <Mono style={{ fontSize: 13, fontWeight: 600 }}>{fmtPeriod(p.periodStart, grain)}</Mono>
                    <Mono style={{ fontSize: 10.5, color: t.mut2 }}>{p.eventCount} evt{p.eventCount === 1 ? '' : 's'}</Mono>
                  </span>
                  <Num v={p.byCat.realized_trade} />
                  <Num v={p.byCat.funding} />
                  <Num v={p.byCat.fee} />
                  <Num v={p.byCat.reward} />
                  <Num v={p.byCat.interest} />
                  <Num v={p.incomeNet} bold />
                  <Num v={p.transfer} muted />
                </div>
              ))}
              {/* Window total row. */}
              <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, padding: 14 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: '.03em', color: t.mut, textTransform: 'uppercase' }}>Total</span>
                <Num v={totals.cat.realized_trade} bold />
                <Num v={totals.cat.funding} bold />
                <Num v={totals.cat.fee} bold />
                <Num v={totals.cat.reward} bold />
                <Num v={totals.cat.interest} bold />
                <Num v={totals.incomeNet} bold />
                <Num v={totals.transfer} bold muted />
              </div>
            </>
          )}
        </div>
      </Card>

      {anyHack && (
        <div style={{ fontSize: 12, color: t.mut2, marginTop: 10 }}>
          Hack / extraordinary events in this window total <Mono style={{ color: col(totals.hack) }}>{k(totals.hack)}</Mono> — shown separately and excluded from income (flagged for tax review).
        </div>
      )}
      <p style={{ fontSize: 11.5, color: t.mut2, marginTop: 14, lineHeight: 1.5 }}>
        Income is the avg-cost (WAC) trader lens — the same figures your exchange shows. Realized trading P/L, funding, fees, rewards and interest are income; transfers (deposits / withdrawals) are cash movements and are not income.
      </p>
    </div>
  );
}

const Row: React.FC<{ header?: boolean; cols: string[] }> = ({ cols }) => (
  <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, padding: '13px 14px 11px', borderBottom: `1px solid ${t.border}` }}>
    {cols.map((c, i) => (
      <span key={i} style={{ fontSize: 10.5, letterSpacing: '.05em', color: t.mut2, textTransform: 'uppercase', textAlign: i === 0 ? 'left' : 'right' }}>{c}</span>
    ))}
  </div>
);

const LoadingRows: React.FC = () => (
  <div>
    <style>{`@keyframes zifIncPulse{0%,100%{opacity:.35}50%{opacity:.7}}`}</style>
    {[0, 1, 2, 3].map((i) => (
      <div key={i} style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, padding: 14, alignItems: 'center', borderBottom: '1px solid #161c21' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ height: 11, width: 120, borderRadius: 4, background: '#222a33', animation: 'zifIncPulse 1.2s ease-in-out infinite' }} />
        </span>
        {Array.from({ length: 7 }).map((_, c) => (
          <span key={c} style={{ height: 11, width: '70%', justifySelf: 'end', borderRadius: 4, background: '#1d242c', animation: 'zifIncPulse 1.2s ease-in-out infinite' }} />
        ))}
      </div>
    ))}
    <div style={{ padding: '16px 14px', textAlign: 'center', fontSize: 12.5, color: t.mut }}>Loading income…</div>
  </div>
);

const EmptyState: React.FC = () => (
  <div style={{ padding: '34px 14px', textAlign: 'center' }}>
    <div style={{ fontSize: 13.5, fontWeight: 600, color: t.mut }}>No income in this window</div>
    <div style={{ fontSize: 12, color: t.mut2, marginTop: 5 }}>Nothing recorded for this grain and range yet. Try a wider window.</div>
  </div>
);
