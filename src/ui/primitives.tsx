import React from 'react';
import { t } from './theme';

export const Mono: React.FC<React.HTMLAttributes<HTMLSpanElement>> = ({ style, ...p }) => (
  <span {...p} style={{ fontFamily: t.mono, fontVariantNumeric: 'tabular-nums', ...style }} />
);

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ style, ...p }) => (
  <div
    {...p}
    style={{ background: t.panel, border: `1px solid ${t.border}`, borderRadius: 14, ...style }}
  />
);

export const StatCard: React.FC<{ label: string; children: React.ReactNode; sub?: React.ReactNode }> = ({
  label, children, sub,
}) => (
  <Card style={{ padding: '15px 16px' }}>
    <div style={{ fontSize: 11, color: t.mut }}>{label}</div>
    <div style={{ marginTop: 5 }}>{children}</div>
    {sub && <div style={{ fontSize: 12, color: t.mut2, marginTop: 4 }}>{sub}</div>}
  </Card>
);

export const Chip: React.FC<{ active?: boolean; onClick?: () => void; children: React.ReactNode }> = ({
  active, onClick, children,
}) => (
  <button
    onClick={onClick}
    style={{
      fontFamily: t.mono, fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
      border: `1px solid ${active ? t.acc : t.border}`,
      background: active ? t.acc : 'transparent',
      color: active ? '#0e1114' : t.mut,
      padding: '7px 13px', borderRadius: 9,
    }}
  >
    {children}
  </button>
);

export const Segment: React.FC<{
  options: { k: string; label: string }[];
  value: string;
  onChange: (k: string) => void;
}> = ({ options, value, onChange }) => (
  <div style={{ display: 'inline-flex', background: t.panel, border: `1px solid ${t.border}`, borderRadius: 10, padding: 3 }}>
    {options.map((o) => {
      const active = o.k === value;
      return (
        <button
          key={o.k}
          onClick={() => onChange(o.k)}
          style={{
            fontFamily: t.sans, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
            borderRadius: 7, padding: '7px 13px',
            background: active ? t.acc : 'transparent', color: active ? '#0e1114' : t.mut,
          }}
        >
          {o.label}
        </button>
      );
    })}
  </div>
);
