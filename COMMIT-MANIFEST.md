# web-dashboard (zif-app) — untangle-staging commit manifest

Tracks the source↔deployed mapping for FE bundles staged here for the untangle effort.

| Date (UTC) | Task | Deployed bundle | Summary |
|---|---|---|---|
| 2026-07-10 | #212-analytics | `index-BsSXlHh-.js` | Analytics consolidation: renamed Performance → **Analytics** (key stays `performance`); removed the standalone **Income** tab and folded its period cards + per-period breakdown into Analytics; added a range selector (since-last-checked / 24h / 7d / 30d / 90d / YTD / All / Custom + Day/Week/Month/Year grain); added an **Exit** column (LIQUIDATED — Lighter + Variational only, no fabricated SL/TP/limit) driven by `mat_closed_trades.is_liquidation`; added an **Open (partially realized)** sub-section (mat_open_lifecycle realized) + an unassociated-income note; per-fill WAC PnL now shows on Activity FILL rows (backend view change; FE already rendered `pnl`); added an Overview **"since you last checked"** pulse strip + persisted `zif.lastChecked` marker. Backend (separate, in infra repo): `mat_income_periods` year grain, `mat_activity_stream` FILL LEFT JOIN position_events, `mat_closed_trades.is_liquidation`. QA reallogin + full PASS (Overview Σequity to the cent, 94 open · 955 closed live). |

Prior FE state before this change: `index-BUsu5fHP.js`.
