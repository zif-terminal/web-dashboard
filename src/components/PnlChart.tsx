import { useEffect, useRef } from 'react';
import {
  createChart, ColorType, CrosshairMode, isBusinessDay, TickMarkType, LineStyle,
  type IChartApi, type ISeriesApi, type MouseEventParams, type Time,
} from 'lightweight-charts';
import { t } from '../ui/theme';
import { k } from '../lib/format';
import { PNL_COMPONENTS, type BucketRow } from '../lib/pnlDaily';
import type { PnlGranularity } from '../types';

/**
 * Bar-per-bucket PnL chart (#250 Analytics rebuild, scroll/zoom pass #252) — the
 * app's EXISTING lightweight-charts dependency (no new chart library added). One
 * green/red histogram bar per bucket (day/week/month/year, whatever the caller
 * passes in already bucketed — see lib/pnlDaily.ts), with a hover tooltip breaking
 * that bucket's total down by component. Data updates are a pure re-slice from the
 * ONE fetched row set — this component never fetches.
 *
 * #252: at Day granularity over the All range there can be 700+ daily bars. The
 * old code force-fit ALL of them into the chart width on every update (`fitContent()`
 * unconditionally, `handleScroll`/`handleScale` both disabled) — a wall of
 * unreadable slivers with no way to zoom in. Fix: pan/zoom are enabled (bounded —
 * you can't scroll past the data, `fixLeftEdge`/`fixRightEdge` stay true), and each
 * granularity opens on a sane RECENT window instead of cramming everything in; the
 * rest of the history is one scroll away. See DEFAULT_VISIBLE_BARS below.
 */

// Default visible window, in buckets, per granularity — shows the most recent N,
// the rest reachable by scrolling back. `undefined` = fitContent (Year: only a
// handful of bars exist total, so there's nothing to hide behind a scroll).
const DEFAULT_VISIBLE_BARS: Record<PnlGranularity, number | undefined> = {
  day: 90,
  week: 52,
  month: 24,
  year: undefined,
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Per-granularity tick label formatter. lightweight-charts' own tick-mark
 *  thinning/weighting decides WHICH ticks get drawn (it already keeps them from
 *  overlapping); this only changes what each one says, so a Day view reads dates
 *  and a Year view reads bare years instead of the library's generic default.
 *
 *  IMPORTANT: the library calls this with the tick's `originalTime` — the exact
 *  value we handed to `series.setData` (see below), which is our own
 *  'YYYY-MM-DD' STRING, not a parsed {@link BusinessDay} object. `isBusinessDay`
 *  only recognizes the object form, so checking it here always failed and blanked
 *  every tick label. Parse the string directly instead. */
function tickFormatter(gran: PnlGranularity) {
  return (time: Time, tickMarkType: TickMarkType): string => {
    let year: number, month: number, day: number;
    if (typeof time === 'string') {
      const [y, m, d] = time.split('-').map(Number);
      year = y; month = m; day = d;
    } else if (isBusinessDay(time)) {
      ({ year, month, day } = time);
    } else {
      return '';
    }
    if (gran === 'year') return String(year);
    if (gran === 'month') return tickMarkType === TickMarkType.Year ? String(year) : MONTHS[month - 1];
    // day / week: a short date, falling back to the bare year at a year boundary
    // (matches the standard candlestick-chart convention — avoids "Jan 1 2026"
    // cramming every tick when the year alone already gives that context).
    if (tickMarkType === TickMarkType.Year) return String(year);
    return `${MONTHS[month - 1]} ${day}`;
  };
}

export const PnlChart: React.FC<{ rows: BucketRow[]; gran: PnlGranularity; height?: number }> = ({ rows, gran, height = 240 }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  // Kept in a ref (not state) so the crosshair handler set up once in the mount
  // effect always reads the LATEST rows without re-subscribing.
  const rowsRef = useRef<BucketRow[]>(rows);
  rowsRef.current = rows;

  const windowSize = DEFAULT_VISIBLE_BARS[gran];
  const clipped = windowSize !== undefined && rows.length > windowSize;

  // ── mount once: chart + tooltip + resize handling ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      width: el.clientWidth,
      height,
      // Explicit locale — lightweight-charts otherwise reads navigator.language,
      // which can be empty in some embedded/headless contexts and throws
      // "Incorrect locale information provided" from its internal
      // Intl.DateTimeFormat call.
      localization: { locale: 'en-US' },
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: t.mut, fontFamily: t.sans, fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: t.border2 } },
      rightPriceScale: { borderColor: t.border },
      timeScale: {
        borderColor: t.border,
        timeVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
        rightOffset: 3,
        barSpacing: 10,
        minBarSpacing: 3, // floor on zoom-out so bars never degrade into hairlines
      },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: t.border, labelBackgroundColor: t.panel }, horzLine: { visible: false, labelVisible: false } },
      handleScroll: true,
      handleScale: true,
    });
    const series = chart.addHistogramSeries({
      priceFormat: { type: 'custom', minMove: 0.01, formatter: (v: number) => k(v) },
      base: 0,
    });
    // A visible zero baseline — PnL crosses zero constantly and the eye needs an
    // axis to read gains vs losses against, not just bar color.
    series.createPriceLine({
      price: 0,
      color: t.border,
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: false,
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const handleMove = (param: MouseEventParams<Time>) => {
      const tooltip = tooltipRef.current;
      if (!tooltip) return;
      if (!param.time || !param.point) { tooltip.style.display = 'none'; return; }
      const row = rowsRef.current.find((r) => r.bucketStart === param.time);
      if (!row) { tooltip.style.display = 'none'; return; }
      const parts = PNL_COMPONENTS
        .map((c) => ({ label: c.label, v: row.totals[c.k] }))
        .filter((p) => Math.abs(p.v) >= 0.5);
      tooltip.innerHTML = `
        <div style="font-weight:600;margin-bottom:5px;color:${t.text}">${row.label}</div>
        ${parts.map((p) => `
          <div style="display:flex;justify-content:space-between;gap:14px;color:${p.v >= 0 ? t.green : t.red}">
            <span style="color:${t.mut}">${p.label}</span><span>${k(p.v)}</span>
          </div>`).join('')}
        <div style="display:flex;justify-content:space-between;gap:14px;margin-top:4px;padding-top:4px;border-top:1px solid ${t.border2};font-weight:600;color:${row.totals.totalPnl >= 0 ? t.green : t.red}">
          <span style="color:${t.mut}">Total</span><span>${k(row.totals.totalPnl)}</span>
        </div>`;
      tooltip.style.display = 'block';
      // Keep the tooltip inside the chart's horizontal bounds.
      const width = el.clientWidth;
      const tw = tooltip.offsetWidth || 160;
      let left = param.point.x + 14;
      if (left + tw > width) left = param.point.x - tw - 14;
      tooltip.style.left = `${Math.max(0, left)}px`;
      tooltip.style.top = '6px';
    };
    chart.subscribeCrosshairMove(handleMove);

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.unsubscribeCrosshairMove(handleMove);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  // Granularity-specific tick labels — re-applied whenever the caller switches
  // day/week/month/year (a new chart isn't remounted for that, only `rows` changes).
  useEffect(() => {
    chartRef.current?.applyOptions({ timeScale: { tickMarkFormatter: tickFormatter(gran) } });
  }, [gran]);

  // ── data updates: pure re-slice, no refetch ──
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;
    series.setData(
      rows.map((r) => ({
        time: r.bucketStart as Time,
        value: r.totals.totalPnl,
        color: r.totals.totalPnl >= 0 ? t.green : t.red,
      })),
    );
    // Default to the most recent `windowSize` buckets rather than cramming the
    // whole range in — the rest of the history is reachable by scrolling back.
    // Falls back to fitContent whenever there's nothing to hide (Year granularity,
    // or any range whose bucket count is already under the window).
    const n = rows.length;
    if (windowSize === undefined || n <= windowSize) {
      chart.timeScale().fitContent();
    } else {
      chart.timeScale().setVisibleLogicalRange({ from: n - windowSize - 0.5, to: n - 0.5 });
    }
  }, [rows, windowSize]);

  return (
    <div style={{ position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%' }} />
      {rows.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, color: t.mut2 }}>
          No PnL activity in this range
        </div>
      )}
      {clipped && (
        // Top-LEFT, clear of the right-hand price scale (which the top-right
        // corner sits underneath) — the affordance was colliding with the
        // "+$X.XK" axis label there. The hover tooltip (z-index 5 below) still
        // wins any transient overlap since it only appears mid-hover.
        <div style={{ position: 'absolute', top: 8, left: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => chartRef.current?.timeScale().fitContent()}
            style={{
              fontFamily: t.sans, fontSize: 10.5, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${t.border}`, background: t.panel, color: t.mut,
              padding: '3px 9px', borderRadius: 7, lineHeight: 1.4,
            }}
          >
            Fit all
          </button>
          <span style={{ fontSize: 10, color: t.mut2, fontFamily: t.sans, pointerEvents: 'none' }}>← scroll for history</span>
        </div>
      )}
      <div
        ref={tooltipRef}
        style={{
          position: 'absolute', display: 'none', pointerEvents: 'none', zIndex: 5,
          background: t.panel, border: `1px solid ${t.border}`, borderRadius: 8,
          padding: '8px 10px', fontFamily: t.mono, fontSize: 11.5, fontVariantNumeric: 'tabular-nums',
          minWidth: 150, boxShadow: '0 6px 18px rgba(0,0,0,.35)',
        }}
      />
    </div>
  );
};
