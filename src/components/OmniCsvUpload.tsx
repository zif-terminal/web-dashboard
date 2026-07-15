import { useRef, useState } from 'react';
import { useStore } from '../store/store';
import { dataSource } from '../store/useLiveData';
import { parseOmniCSV } from '../lib/omniCsvParser';
import { Card } from '../ui/primitives';
import { t } from '../ui/theme';
import type { Wallet, Account } from '../types';

/**
 * OmniCsvUpload — browser-side OMNI / Variational CSV uploader (zif #199).
 *
 * Ported from:
 *   web-dashboard/src/components/data-upload-dialog.tsx
 *   web-dashboard/src/components/omni-csv-upload.tsx
 *   web-dashboard/src/app/api/import/omni/route.ts
 *
 * Architecture change: no backend route. CSV is parsed in-browser via
 * omniCsvParser.ts, then inserted via Apollo (user JWT, RLS-gated) using the
 * INSERT_OMNI_RAW_EVENTS mutation with on_conflict upsert/dedup.
 */

// Exchanges whose accounts support manual CSV upload (no sync API).
const MANUAL_UPLOAD_EXCHANGES = new Set(['Variational']);

interface UploadSummary {
  csv_type: string;
  batch_id: string;
  total_rows: number;
  inserted: number;
  duplicates: number;
  parse_errors: string[];
}

// ─── inline icons ───────────────────────────────────────────────────────────
const sv = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};
const UploadIcon = () => (
  <svg {...sv}>
    <polyline points="16 16 12 12 8 16" />
    <line x1="12" y1="12" x2="12" y2="21" />
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
  </svg>
);

// ─── component ──────────────────────────────────────────────────────────────

export function OmniCsvUpload() {
  const wallets: Wallet[] = useStore((s) => s.wallets);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<UploadSummary | null>(null);
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Flatten wallets → accounts, keep only Variational ones.
  const variationalAccounts: (Account & { walletLabel: string })[] = wallets
    .flatMap((w) =>
      w.accounts
        .filter((a) => MANUAL_UPLOAD_EXCHANGES.has(a.exch))
        .map((a) => ({ ...a, walletLabel: w.label })),
    );

  const openDialog = () => {
    setSelectedAccountId(
      variationalAccounts.length === 1 ? variationalAccounts[0].id : '',
    );
    setError(null);
    setSummary(null);
    setOpen(true);
  };

  const closeDialog = () => {
    setOpen(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFile = async (file: File) => {
    if (!selectedAccountId) {
      setError('Select an account first');
      return;
    }

    setUploading(true);
    setError(null);
    setSummary(null);

    try {
      // 1. Parse CSV in-browser.
      const parsed = await parseOmniCSV(file, selectedAccountId);
      if ('error' in parsed) {
        setError(parsed.error);
        return;
      }

      // 2. Insert via Apollo / Hasura (user JWT, RLS-gated).
      const result = await dataSource.insertOmniRawEvents(parsed.objects);

      if ('error' in result) {
        setError(result.error);
        return;
      }

      const inserted = result.affected_rows;
      const duplicates = parsed.objects.length - inserted;

      setSummary({
        csv_type: parsed.csv_type,
        batch_id: parsed.batch_id,
        total_rows: parsed.total_rows,
        inserted,
        duplicates,
        parse_errors: parsed.parse_errors,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const accountLabel = (a: Account & { walletLabel: string }) =>
    `${a.exch} — ${a.walletLabel || a.name}`;

  return (
    <>
      {/* ── Trigger button ── */}
      <button
        onClick={openDialog}
        style={{
          fontFamily: t.sans,
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          background: 'none',
          color: t.mut,
          border: `1px solid ${t.border}`,
          borderRadius: 9,
          padding: '8px 14px',
        }}
        title="Upload Variational OMNI CSV"
      >
        <UploadIcon />
        Upload OMNI CSV
      </button>

      {/* ── Modal overlay ── */}
      {open && (
        <div
          onClick={closeDialog}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <Card
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(480px,90vw)',
              padding: '26px 24px',
              background: t.panel,
              border: `1px solid ${t.border}`,
              borderRadius: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: t.text }}>
                  Upload OMNI CSV
                </div>
                <div style={{ fontSize: 12.5, color: t.mut, marginTop: 3 }}>
                  Trades, transfers, or funding CSV exports from Variational
                </div>
              </div>
              <button
                onClick={closeDialog}
                style={{
                  fontFamily: t.sans,
                  cursor: 'pointer',
                  background: 'none',
                  color: t.mut,
                  border: 'none',
                  fontSize: 20,
                  lineHeight: 1,
                  padding: '2px 6px',
                }}
              >
                ×
              </button>
            </div>

            {/* No Variational accounts */}
            {variationalAccounts.length === 0 ? (
              <div style={{ fontSize: 13.5, color: t.mut, padding: '6px 0' }}>
                No Variational accounts found. Data for other exchanges syncs
                automatically.
              </div>
            ) : (
              <>
                {/* Account selector */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <label
                    htmlFor="omni-account-select"
                    style={{ fontSize: 12.5, fontWeight: 600, color: t.textDim }}
                  >
                    Account
                  </label>
                  <select
                    id="omni-account-select"
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    style={{
                      fontFamily: t.sans,
                      fontSize: 14,
                      background: t.panel2,
                      color: t.text,
                      border: `1px solid ${t.border}`,
                      borderRadius: 9,
                      padding: '10px 12px',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {variationalAccounts.length > 1 && (
                      <option value="">Select an account…</option>
                    )}
                    {variationalAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {accountLabel(a)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* File picker */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: t.textDim }}>
                    CSV File
                  </div>
                  <div style={{ fontSize: 12, color: t.mut }}>
                    Format is auto-detected (trades, transfers, or funding).
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv"
                    onChange={onFileChange}
                    style={{ display: 'none' }}
                    id="omni-csv-file-input"
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading || !selectedAccountId}
                    style={{
                      fontFamily: t.sans,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor:
                        uploading || !selectedAccountId ? 'not-allowed' : 'pointer',
                      background:
                        uploading || !selectedAccountId ? '#1a2030' : t.acc,
                      color:
                        uploading || !selectedAccountId ? t.mut : '#0e1114',
                      border: 'none',
                      borderRadius: 10,
                      padding: '12px 20px',
                      transition: 'background 0.15s',
                    }}
                  >
                    {uploading ? 'Uploading…' : 'Select CSV File'}
                  </button>
                </div>

                {/* Error */}
                {error && (
                  <div
                    style={{
                      padding: '10px 13px',
                      background: 'rgba(248,113,113,.1)',
                      border: `1px solid rgba(248,113,113,.3)`,
                      borderRadius: 9,
                      fontSize: 13,
                      color: t.red,
                    }}
                  >
                    {error}
                  </div>
                )}

                {/* Result summary */}
                {summary && (
                  <div
                    style={{
                      padding: '12px 14px',
                      background: 'rgba(52,211,153,.07)',
                      border: `1px solid rgba(52,211,153,.2)`,
                      borderRadius: 9,
                      fontSize: 13,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 5,
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600, color: t.textDim }}>
                        Type:
                      </span>{' '}
                      <span style={{ color: t.text }}>{summary.csv_type}</span>
                    </div>
                    <div>
                      <span style={{ fontWeight: 600, color: t.textDim }}>
                        Inserted:
                      </span>{' '}
                      <span style={{ color: t.green, fontWeight: 700 }}>
                        {summary.inserted}
                      </span>
                      <span style={{ color: t.mut }}> / {summary.total_rows}</span>
                    </div>
                    {summary.duplicates > 0 && (
                      <div style={{ color: t.mut }}>
                        <span style={{ fontWeight: 600 }}>
                          Duplicates skipped:
                        </span>{' '}
                        {summary.duplicates}
                      </div>
                    )}
                    {summary.parse_errors.length > 0 && (
                      <div style={{ color: t.amber }}>
                        <span style={{ fontWeight: 600 }}>Parse errors:</span>{' '}
                        {summary.parse_errors.length}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
