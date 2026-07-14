import { useEffect, useRef } from 'react';
import {
  createChart, ColorType, CrosshairMode,
  type IChartApi, type ISeriesApi, type MouseEventParams, type Time,
} from 'lightweight-charts';
import { t } from '../ui/theme';
import { k } from '../lib/format';
import { PNL_COMPONENTS, type BucketRow } from '../lib/pnlDaily';

/**
 * Bar-per-bucket PnL chart (#250 Analytics rebuild) — the app's EXISTING
 * lightweight-charts dependency (no new chart library added). One green/red
 * histogram bar per bucket (day/week/month/year, whatever the caller passes in
 * already bucketed — see lib/pnlDaily.ts), with a hover tooltip breaking that
 * bucket's total down by component. Data updates are a pure re-slice from the
 * ONE fetched row set — this component never fetches.
 */
export const PnlChart: React.FC<{ rows: BucketRow[]; height?: number }> = ({ rows, height = 240 }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  // Kept in a ref (not state) so the crosshair handler set up once in the mount
  // effect always reads the LATEST rows without re-subscribing.
  const rowsRef = useRef<BucketRow[]>(rows);
  rowsRef.current = rows;

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
      timeScale: { borderColor: t.border, timeVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: t.border, labelBackgroundColor: t.panel }, horzLine: { visible: false, labelVisible: false } },
      handleScroll: false,
      handleScale: false,
    });
    const series = chart.addHistogramSeries({
      priceFormat: { type: 'custom', minMove: 0.01, formatter: (v: number) => k(v) },
      base: 0,
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

  // ── data updates: pure re-slice, no refetch ──
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    series.setData(
      rows.map((r) => ({
        time: r.bucketStart as Time,
        value: r.totals.totalPnl,
        color: r.totals.totalPnl >= 0 ? t.green : t.red,
      })),
    );
    chartRef.current?.timeScale().fitContent();
  }, [rows]);

  return (
    <div style={{ position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%' }} />
      {rows.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, color: t.mut2 }}>
          No PnL activity in this range
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
