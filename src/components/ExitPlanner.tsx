import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { useMutations } from '../store/useMutations';
import { priceBounds } from '../lib/series';
import { pnlAt, ladderSummary } from '../lib/pnl';
import { px, kc, k, col, pricePrecision } from '../lib/format';
import { t } from '../ui/theme';
import { useIsMobile } from '../lib/useIsMobile';
import type { Position, OrderLevel, RestingOrder } from '../types';

const LABELW = 148;
type Hit =
  | { type: 'remove'; id: string; x: number; y: number; w: number; h: number }
  | { type: 'node'; id: string; kind: 'tp' | 'sl'; x: number; y: number; r: number }
  | { type: 'line'; id: string; y: number; x0: number; x1: number }
  | { type: 'test'; y: number; x0: number; x1: number };

interface OverlayRefs {
  host: HTMLDivElement;
  overlay: HTMLCanvasElement;
  ro?: ResizeObserver;
}

export function ExitPlanner({ p }: { p: Position }) {
  const elRef = useRef<HTMLDivElement>(null);
  const refs = useRef<OverlayRefs | null>(null);
  const hitsRef = useRef<Hit[]>([]);
  const dragRef = useRef<Hit | null>(null);
  const drawRef = useRef<() => void>();

  // Latest values for the (long-lived) pointer handlers — avoids stale closures.
  const live = useRef<{ p: Position; levels: OrderLevel[]; test: number }>({ p, levels: [], test: p.mark });

  const levels = useStore((s) => s.levels.filter((l) => l.positionId === p.id));
  const orders = useStore((s) => s.orders.filter((o) => o.positionId === p.id));
  const test = useStore((s) => s.testPrice[p.id] ?? p.mark);
  const setTestPrice = useStore((s) => s.setTestPrice);
  const m = useMutations();
  const [open, setOpen] = useState(false);

  live.current = { p, levels, test };

  // ── mount canvas once (re-runs when open→true so the canvas div is in the DOM) ──
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;';
    const overlay = document.createElement('canvas');
    overlay.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;cursor:crosshair;touch-action:none;z-index:2;';
    el.appendChild(host);
    el.appendChild(overlay);

    refs.current = { host, overlay };

    // ── price ↔ pixel helpers (recomputed each draw call) ──
    function makeScale(h: number) {
      const bounds = priceBounds(live.current.p);
      const mn = bounds.mn, mx = bounds.mx;
      const priceToY = (v: number): number | null => {
        if (mx === mn) return h / 2;
        return h - ((v - mn) / (mx - mn)) * h;
      };
      const yToPrice = (y: number): number => mn + ((h - y) / h) * (mx - mn);
      const clamp = (v: number): number => {
        const pad = (mx - mn) * 0.012;
        return Math.max(mn + pad, Math.min(mx - pad, v));
      };
      return { mn, mx, priceToY, yToPrice, clamp };
    }

    // ── pointer interaction ──
    const xy = (e: PointerEvent) => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

    const down = (e: PointerEvent) => {
      const { x, y } = xy(e); const h = hitTest(x, y);
      if (!h) return; e.preventDefault();
      if (h.type === 'remove') { m.removeLevel(h.id); return; }
      dragRef.current = h;
      try { overlay.setPointerCapture(e.pointerId); } catch { /* noop */ }
    };

    const move = (e: PointerEvent) => {
      const d = dragRef.current; const { x, y } = xy(e);
      if (!d) {
        const h = hitTest(x, y);
        overlay.style.cursor = h ? (h.type === 'remove' ? 'pointer' : h.type === 'node' ? 'move' : 'ns-resize') : 'crosshair';
        return;
      }
      e.preventDefault();
      const cssH = overlay.clientHeight;
      const { clamp, yToPrice } = makeScale(cssH);
      const price = clamp(yToPrice(y));
      const plotW = overlay.clientWidth - LABELW;
      const { p: lp, levels: ll } = live.current;
      if (d.type === 'test') { setTestPrice(lp.id, price); return; }
      if (d.type === 'node') {
        const size = Math.max(5, Math.min(100, Math.round((x / plotW) * 100 / 5) * 5));
        const lv = ll.find((l) => l.id === d.id); if (lv) m.setLevel(d.id, price, size);
        return;
      }
      if (d.type === 'line') { const lv = ll.find((l) => l.id === d.id); if (lv) m.setLevel(d.id, price, lv.size); }
    };

    const up = () => { dragRef.current = null; };
    overlay.addEventListener('pointerdown', down);
    overlay.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);

    const ro = new ResizeObserver(() => { draw(); });
    ro.observe(el);
    refs.current.ro = ro;

    function hitTest(x: number, y: number): Hit | null {
      const hs = hitsRef.current;
      for (const h of hs) if (h.type === 'remove' && x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h;
      for (const h of hs) if (h.type === 'node') { const dx = x - h.x, dy = y - h.y; if (dx * dx + dy * dy <= h.r * h.r) return h; }
      for (const h of hs) if (h.type === 'test' && Math.abs(y - h.y) <= 8 && x >= h.x0 && x <= h.x1) return h;
      for (const h of hs) if (h.type === 'line' && Math.abs(y - h.y) <= 6 && x >= h.x0 && x <= h.x1) return h;
      return null;
    }

    drawRef.current = draw;
    function draw() { if (refs.current) drawOverlay(refs.current, live.current, useStore.getState(), hitsRef); }
    draw();

    return () => {
      ro.disconnect();
      window.removeEventListener('pointerup', up);
      refs.current = null;
      el.innerHTML = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // redraw whenever the bound data changes
  useEffect(() => { drawRef.current?.(); }, [levels, orders, test, p.mark, p.unreal]);

  // Summary prefers the user-set ladder (order_levels); when empty for this kind
  // it falls back to the ACTUAL venue resting orders (the real TP/SL on-exchange).
  const summary = exitSummary(p, levels.filter((l) => l.kind === 'tp'), orders, 'Take profit');
  const slSummary = exitSummary(p, levels.filter((l) => l.kind === 'sl'), orders, 'Stop loss');
  const isMobile = useIsMobile();

  return (
    <div style={{ background: t.panel2, border: `1px solid ${t.border2}`, borderRadius: 14, overflow: 'hidden' }}>
      {/* ── Collapsed header — always visible, 44px touch target ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', padding: '11px 14px', background: 'none', border: 'none',
          cursor: 'pointer', minHeight: 44, gap: 10,
        }}
      >
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', flexWrap: 'wrap', gap: isMobile ? 2 : 14, textAlign: 'left' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: t.mut2, letterSpacing: '.03em' }}>Plan your exit</span>
          <span style={{ fontSize: 12, color: t.mut }}>
            If all TPs fill <b style={{ color: t.green }}>{k(summary.total)}</b> · {summary.cov}% covered
          </span>
          <span style={{ fontSize: 12, color: t.mut }}>
            Stops cap at <b style={{ color: t.red }}>{k(slSummary.total)}</b> · {slSummary.cov}% covered
          </span>
        </div>
        <span style={{ fontSize: 14, color: t.mut2, flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s ease' }}>▾</span>
      </button>

      {/* ── Expanded body ── */}
      {open && (
        <div style={{ padding: '0 14px 12px', borderTop: `1px solid ${t.border2}` }}>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 11, marginTop: 12 }}>
            <span style={{ fontSize: 12, color: t.mut, lineHeight: 1.4, maxWidth: isMobile ? '100%' : 440 }}>
              Drag the <b style={{ color: t.green }}>green</b> &amp; <b style={{ color: t.red }}>red</b> handles up/down to price each exit, sideways to size it. Running P/L, stops &amp; liquidation update live.
            </span>
            <div style={{ display: 'flex', gap: 7 }}>
              <button onClick={() => m.addLevel(p.id, 'tp', p.mark * 1.05, 25)} style={btn(t.green, '#1f4a3a')}>+ Take-profit</button>
              <button onClick={() => m.addLevel(p.id, 'sl', p.mark * 0.95, 100)} style={btn(t.red, '#4a2a2c')}>+ Stop-loss</button>
            </div>
          </div>
          <div ref={elRef} style={{ position: 'relative', width: '100%', height: isMobile ? 280 : 440, touchAction: 'none' }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 10, paddingTop: 9, borderTop: `1px solid ${t.border2}`, fontSize: 12 }}>
            <span style={{ color: t.mut }}>If all TPs fill <b style={{ color: t.green }}>{k(summary.total)}</b> · {summary.cov}% covered</span>
            <span style={{ color: t.mut }}>Stops cap at <b style={{ color: t.red }}>{k(slSummary.total)}</b> · {slSummary.cov}% covered</span>
          </div>
        </div>
      )}
    </div>
  );
}

const btn = (color: string, bd: string): React.CSSProperties => ({
  fontFamily: t.sans, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'none',
  color, border: `1px solid ${bd}`, borderRadius: 8, padding: '6px 11px',
});

/**
 * Collapsed-summary math for one exit kind ("Take profit" | "Stop loss").
 *
 * Two possible sources for the exits:
 *  - the USER-set ladder (`order_levels`): size is a PERCENT of the position, so
 *    ladderSummary already yields { total, cov }.
 *  - the ACTUAL venue resting orders (`resting_orders`): size is in COIN UNITS, so
 *    P/L = qty × (price − entry) for LONG, qty × (entry − price) for SHORT, and
 *    coverage % = Σ qty / |position units|.
 *
 * The user ladder is preferred when present (it's what the user is actively
 * planning); otherwise we fall back to the real on-exchange orders so the summary
 * reflects reality instead of showing +$0 · 0% covered.
 */
function exitSummary(
  p: Position,
  levels: OrderLevel[],
  orders: RestingOrder[],
  action: 'Take profit' | 'Stop loss',
): { total: number; cov: number } {
  // Prefer the user-set ladder when it has entries for this kind.
  if (levels.length > 0) {
    const s = ladderSummary(p, levels);
    return { total: s.total, cov: s.cov };
  }

  // Fall back to the real venue resting orders of this action.
  const sign = p.side === 'LONG' ? 1 : -1;
  const matching = orders.filter((o) => o.action === action);
  const total = matching.reduce((s, o) => s + sign * o.size * (o.price - p.entry), 0);
  const size = Math.abs(p.units);
  const qty = matching.reduce((s, o) => s + o.size, 0);
  const cov = size > 0 ? Math.round((qty / size) * 100) : 0;
  return { total, cov };
}

// ── axis tick helper ──
function niceTicks(mn: number, mx: number, maxTicks = 8): number[] {
  const range = mx - mn;
  if (range <= 0) return [mn];
  const rawStep = range / maxTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= rawStep) ?? mag * 10;
  const start = Math.ceil(mn / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= mx + step * 0.001; v += step) ticks.push(parseFloat(v.toPrecision(10)));
  return ticks;
}

// ── overlay renderer — pure canvas, no lightweight-charts ──
function drawOverlay(
  refs: OverlayRefs,
  live: { p: Position; levels: OrderLevel[]; test: number },
  state: ReturnType<typeof useStore.getState>,
  hitsRef: React.MutableRefObject<Hit[]>,
) {
  const { overlay } = refs;
  const cssW = overlay.clientWidth, cssH = overlay.clientHeight;
  if (cssW === 0 || cssH === 0) return;
  const dpr = window.devicePixelRatio || 1;
  if (overlay.width !== Math.round(cssW * dpr) || overlay.height !== Math.round(cssH * dpr)) {
    overlay.width = Math.round(cssW * dpr);
    overlay.height = Math.round(cssH * dpr);
  }
  const ctx = overlay.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const { p } = live;
  const bounds = priceBounds(p);
  const mn = bounds.mn, mx = bounds.mx;

  // Price → Y coordinate (linear scale, no chart library needed)
  const y = (v: number): number | null => {
    if (mx === mn) return cssH / 2;
    const coord = cssH - ((v - mn) / (mx - mn)) * cssH;
    // Return null if outside visible area (with a small tolerance)
    if (coord < -20 || coord > cssH + 20) return null;
    return coord;
  };

  const plotW = cssW - LABELW;
  const lx = plotW + 8; // label x start
  const prec = pricePrecision(p.entry);
  const fmtPrice = (v: number) => '$' + v.toLocaleString('en-US', { minimumFractionDigits: prec, maximumFractionDigits: prec });

  ctx.textBaseline = 'middle';

  // ── background fill ──
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, plotW, cssH);

  // ── price axis background ──
  ctx.fillStyle = '#0a0e13';
  ctx.fillRect(plotW, 0, cssW - plotW, cssH);

  // ── grid lines + axis ticks ──
  const ticks = niceTicks(mn, mx, Math.max(4, Math.floor(cssH / 45)));
  ctx.save();
  ctx.strokeStyle = '#171c21';
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ticks.forEach((v) => {
    const yy = y(v); if (yy == null) return;
    ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(plotW, yy); ctx.stroke();
  });
  ctx.restore();

  // Axis tick labels
  ctx.textAlign = 'left';
  ctx.font = `9px ${t.mono}`;
  ctx.fillStyle = '#3d4850';
  ticks.forEach((v) => {
    const yy = y(v); if (yy == null) return;
    ctx.fillText(fmtPrice(v), lx, yy);
  });

  const tp = live.levels.filter((l) => l.kind === 'tp');
  const sl = live.levels.filter((l) => l.kind === 'sl');
  const orders = state.orders.filter((o) => o.positionId === p.id);
  const test = live.test;
  const hits: Hit[] = [];

  // ── resting exchange orders (dim background lines) ──
  orders.forEach((o) => {
    const yy = y(o.price); if (yy == null) return;
    ctx.save(); ctx.globalAlpha = 0.45; ctx.strokeStyle = o.color; ctx.setLineDash([2, 3]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(plotW, yy); ctx.stroke(); ctx.restore();
  });

  // ── fixed reference lines: ENTRY, LIQ ──
  const tagLine = (v: number, color: string, label: string, dash: number[]) => {
    const yy = y(v); if (yy == null) return;
    ctx.save(); ctx.strokeStyle = color; ctx.setLineDash(dash); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(plotW, yy); ctx.stroke(); ctx.restore();
    ctx.textAlign = 'left'; ctx.font = `600 9px ${t.mono}`; ctx.fillStyle = color; ctx.fillText(label, lx, yy);
  };
  tagLine(p.entry, '#8b95a0', 'ENTRY ' + fmtPrice(p.entry), [4, 3]);
  if (p.liq > 0) tagLine(p.liq, t.amber, 'LIQ ' + fmtPrice(p.liq), [5, 3]);

  // ── draggable exit levels ──
  const drawLevel = (l: OrderLevel, i: number, color: string) => {
    const yy = y(l.price); if (yy == null) return;
    const nodeX = (l.size / 100) * plotW;
    ctx.fillStyle = color + '22'; ctx.fillRect(0, yy - 1.5, Math.max(0, nodeX), 3);
    ctx.strokeStyle = color; ctx.setLineDash([]); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(plotW, yy); ctx.stroke();
    ctx.fillStyle = color; ctx.strokeStyle = '#0e1114'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.rect(nodeX - 6, yy - 6, 12, 12); ctx.fill(); ctx.stroke();
    const pnl = pnlAt(p, l.price) * (l.size / 100);
    ctx.textAlign = 'left';
    ctx.font = `600 9px ${t.mono}`; ctx.fillStyle = color; ctx.fillText((l.kind === 'tp' ? 'TP' : 'SL') + (i + 1), lx, yy);
    ctx.font = `9px ${t.mono}`; ctx.fillStyle = '#8b95a0'; ctx.fillText(l.size + '%', lx + 26, yy);
    ctx.font = `600 9px ${t.mono}`; ctx.fillStyle = col(pnl); ctx.fillText((pnl >= 0 ? '+' : '') + kc(Math.abs(pnl)), lx + 58, yy);
    ctx.fillStyle = '#5b6570'; ctx.font = `13px ${t.mono}`; ctx.textAlign = 'center'; ctx.fillText('×', cssW - 9, yy);
    hits.push({ type: 'remove', id: l.id, x: cssW - 18, y: yy - 11, w: 18, h: 22 });
    hits.push({ type: 'node', id: l.id, kind: l.kind, x: nodeX, y: yy, r: 13 });
    hits.push({ type: 'line', id: l.id, y: yy, x0: 0, x1: plotW });
  };
  sl.forEach((l, i) => drawLevel(l, i, t.red));
  tp.forEach((l, i) => drawLevel(l, i, t.green));

  // ── NOW line (current mark price) ──
  const ynow = y(p.mark);
  if (ynow != null) {
    ctx.strokeStyle = '#e7ebee'; ctx.setLineDash([]); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(0, ynow); ctx.lineTo(plotW, ynow); ctx.stroke();
    ctx.textAlign = 'left'; ctx.font = `600 9px ${t.mono}`; ctx.fillStyle = '#e7ebee'; ctx.fillText('NOW', lx, ynow - 6);
    ctx.fillStyle = col(p.unreal); ctx.fillText((p.unreal >= 0 ? '+' : '') + kc(Math.abs(p.unreal)), lx + 30, ynow - 6);
  }

  // ── TEST line (draggable what-if price) ──
  const yt = y(test);
  if (yt != null) {
    const range = mx - mn;
    const moved = Math.abs(test - p.mark) > range * 0.004;
    if (moved) {
      ctx.save(); ctx.strokeStyle = '#cdd4da'; ctx.setLineDash([2, 3]); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(0, yt); ctx.lineTo(plotW, yt); ctx.stroke(); ctx.restore();
      ctx.fillStyle = '#cdd4da'; ctx.beginPath(); ctx.moveTo(0, yt - 6); ctx.lineTo(8, yt); ctx.lineTo(0, yt + 6); ctx.closePath(); ctx.fill();
      const tpnl = pnlAt(p, test);
      ctx.textAlign = 'left'; ctx.font = `9px ${t.mono}`; ctx.fillStyle = '#9aa3ab'; ctx.fillText('TEST ' + fmtPrice(test), lx, yt);
      ctx.font = `600 9px ${t.mono}`; ctx.fillStyle = col(tpnl); ctx.fillText((tpnl >= 0 ? '+' : '') + kc(Math.abs(tpnl)), lx + 86, yt);
    }
    hits.push({ type: 'test', y: yt, x0: 0, x1: plotW });
  }

  hitsRef.current = hits;
}
