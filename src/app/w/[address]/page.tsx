"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getPublicGraphQLClient } from "@/lib/graphql-client-public";
import { getGraphQLClient } from "@/lib/graphql-client";
import {
  GET_WALLET_BY_ADDRESS,
  GET_WALLET_BY_ADDRESS_AUTH,
  GET_TRADES_DYNAMIC,
  GET_POSITIONS_DYNAMIC,
  GET_FUNDING_PAYMENTS_DYNAMIC,
  GET_DEPOSITS_DYNAMIC,
  GET_LATEST_ACCOUNT_SNAPSHOTS,
  GET_LATEST_ACCOUNT_SNAPSHOTS_AUTH,
  GET_EXCHANGES,
  CREATE_WALLET,
  Wallet,
  ExchangeAccount,
  Exchange,
  Trade,
  Position,
  FundingPayment,
  Deposit,
  AccountSnapshot,
  SnapshotOrder,
} from "@/lib/queries";
import {
  formatNumber,
  formatTimestamp,
  formatRelativeTime,
  truncateAddress,
} from "@/lib/format";
import { useWatchlist } from "@/hooks/use-watchlist";
import { useAuth } from "@/hooks/use-auth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WalletWithAccounts extends Wallet {
  exchange_accounts: ExchangeAccount[];
}

/**
 * Shape of each element in account_snapshots.positions_json.
 * Mirrors portfolio_monitor/types.go Position struct.
 */
interface SnapshotPosition {
  symbol: string;
  size: number;
  side: "long" | "short";
  entry_price: number;
  mark_price: number;
  liquidation_price?: number;
  unrealized_pnl: number;
  leverage?: number;
  type?: string;
}

/**
 * Shape of each element in account_snapshots.balances_json.
 * Mirrors portfolio_monitor/types.go SpotBalance struct.
 */
interface SnapshotBalance {
  token: string;
  balance: number;
  hold?: number;
  available?: number;
  value_usd?: number;
  oracle_price?: number;
}

// Enriched with exchange_name for display in flat tables
type PositionWithExchange = SnapshotPosition & { exchange_name: string };
type BalanceWithExchange = SnapshotBalance & { exchange_name: string };
// A2.3: Open orders enriched with exchange_name (admin-only data)
type OrderWithExchange = SnapshotOrder & { exchange_name: string };

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const POLL_INTERVAL_MS = 5000;
const DETECTING_TIMEOUT_MS = 120_000;
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildWalletAddressFilter(address: string) {
  return { exchange_account: { wallet: { address: { _ilike: address } } } };
}

function formatPnL(value: string): { text: string; positive: boolean } {
  const n = parseFloat(value);
  const positive = n >= 0;
  return {
    text: (positive ? "+" : "") + formatNumber(value, 2) + " USD",
    positive,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{title}</CardTitle>
        {description && (
          <CardDescription>{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function AccountRow({ account }: { account: ExchangeAccount }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <div className="flex items-center gap-2">
        <Badge variant="outline">
          {account.exchange?.display_name ?? account.exchange_id}
        </Badge>
        <span className="text-sm font-mono text-muted-foreground">
          {truncateAddress(account.account_identifier, 8, 6)}
        </span>
        <Badge variant="secondary" className="text-xs capitalize">
          {account.account_type}
        </Badge>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {account.status && (
          <Badge
            variant={account.status === "active" ? "default" : "secondary"}
            className="text-xs"
          >
            {account.status}
          </Badge>
        )}
        {account.last_synced_at && (
          <span className="text-xs hidden md:inline">
            Synced {formatTimestamp(account.last_synced_at)}
          </span>
        )}
      </div>
    </div>
  );
}

/** A1.5: Row for a single open position from account_snapshots.positions_json */
function OpenPositionRow({
  position,
  exchange,
}: {
  position: SnapshotPosition;
  exchange: string;
}) {
  const isLong = position.side === "long";
  const pnlPositive = position.unrealized_pnl >= 0;
  return (
    <tr className="border-b last:border-0 hover:bg-muted/30">
      <td className="py-2 pr-3 text-sm text-muted-foreground">{exchange}</td>
      <td className="py-2 pr-3 text-sm font-medium">{position.symbol}</td>
      <td className="py-2 pr-3 text-sm">
        <Badge
          variant={isLong ? "default" : "destructive"}
          className="text-xs"
        >
          {position.side}
        </Badge>
      </td>
      <td className="py-2 pr-3 text-sm font-mono text-right">
        {formatNumber(String(position.size), 4)}
      </td>
      <td className="py-2 pr-3 text-sm font-mono text-right">
        {formatNumber(String(position.entry_price), 4)}
      </td>
      <td className="py-2 pr-3 text-sm font-mono text-right">
        {formatNumber(String(position.mark_price), 4)}
      </td>
      <td
        className={`py-2 pr-3 text-sm font-mono text-right font-medium ${
          pnlPositive
            ? "text-green-600 dark:text-green-400"
            : "text-red-600 dark:text-red-400"
        }`}
      >
        {(pnlPositive ? "+" : "") +
          formatNumber(String(position.unrealized_pnl), 2)}
      </td>
      <td className="py-2 text-sm font-mono text-right text-muted-foreground">
        {position.liquidation_price
          ? formatNumber(String(position.liquidation_price), 4)
          : "—"}
      </td>
    </tr>
  );
}

/** A1.5: Row for a single token balance from account_snapshots.balances_json */
function BalanceRow({
  balance,
  exchange,
}: {
  balance: SnapshotBalance;
  exchange: string;
}) {
  return (
    <tr className="border-b last:border-0 hover:bg-muted/30">
      <td className="py-2 pr-3 text-sm text-muted-foreground">{exchange}</td>
      <td className="py-2 pr-3 text-sm font-medium">{balance.token}</td>
      <td className="py-2 pr-3 text-sm font-mono text-right">
        {formatNumber(String(balance.balance), 6)}
      </td>
      <td className="py-2 text-sm font-mono text-right text-muted-foreground">
        {balance.value_usd != null && balance.value_usd > 0
          ? "$" + formatNumber(String(balance.value_usd), 2)
          : "—"}
      </td>
    </tr>
  );
}

function TradeRow({ trade }: { trade: Trade }) {
  const isBuy = trade.side === "buy";
  return (
    <tr className="border-b last:border-0 hover:bg-muted/30">
      <td className="py-2 pr-3 text-sm font-medium">
        {trade.base_asset}/{trade.quote_asset}
      </td>
      <td className="py-2 pr-3 text-sm">
        <Badge
          variant={isBuy ? "default" : "destructive"}
          className="text-xs capitalize"
        >
          {trade.side}
        </Badge>
      </td>
      <td className="py-2 pr-3 text-sm font-mono text-right">
        {formatNumber(trade.price, 4)}
      </td>
      <td className="py-2 pr-3 text-sm font-mono text-right">
        {formatNumber(trade.quantity, 6)}
      </td>
      <td className="py-2 pr-3 text-sm text-muted-foreground hidden md:table-cell">
        {trade.market_type}
      </td>
      <td className="py-2 text-xs text-muted-foreground text-right">
        {formatTimestamp(trade.timestamp)}
      </td>
    </tr>
  );
}

function PositionRow({ position }: { position: Position }) {
  const pnl = formatPnL(position.realized_pnl);
  return (
    <tr className="border-b last:border-0 hover:bg-muted/30">
      <td className="py-2 pr-3 text-sm font-medium">
        {position.base_asset}/{position.quote_asset}
      </td>
      <td className="py-2 pr-3 text-sm capitalize">
        <Badge
          variant={position.side === "long" ? "default" : "destructive"}
          className="text-xs"
        >
          {position.side}
        </Badge>
      </td>
      <td className="py-2 pr-3 text-sm font-mono text-right">
        {formatNumber(position.entry_avg_price, 4)}
      </td>
      <td className="py-2 pr-3 text-sm font-mono text-right">
        {formatNumber(position.exit_avg_price, 4)}
      </td>
      <td
        className={`py-2 pr-3 text-sm font-mono text-right font-medium ${
          pnl.positive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
        }`}
      >
        {pnl.text}
      </td>
      <td className="py-2 text-xs text-muted-foreground text-right hidden md:table-cell">
        {formatTimestamp(position.end_time)}
      </td>
    </tr>
  );
}

function FundingRow({ payment }: { payment: FundingPayment }) {
  const amount = parseFloat(payment.amount);
  const positive = amount >= 0;
  return (
    <tr className="border-b last:border-0 hover:bg-muted/30">
      <td className="py-2 pr-3 text-sm font-medium">
        {payment.base_asset}/{payment.quote_asset}
      </td>
      <td
        className={`py-2 pr-3 text-sm font-mono text-right font-medium ${
          positive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
        }`}
      >
        {(positive ? "+" : "") + formatNumber(payment.amount, 4)}
      </td>
      <td className="py-2 text-xs text-muted-foreground text-right">
        {formatTimestamp(payment.timestamp)}
      </td>
    </tr>
  );
}

function DepositRow({ deposit }: { deposit: Deposit }) {
  const isDeposit = deposit.direction === "deposit";
  return (
    <tr className="border-b last:border-0 hover:bg-muted/30">
      <td className="py-2 pr-3 text-sm font-medium">{deposit.asset}</td>
      <td className="py-2 pr-3 text-sm">
        <Badge
          variant={isDeposit ? "default" : "secondary"}
          className="text-xs capitalize"
        >
          {deposit.direction}
        </Badge>
      </td>
      <td
        className={`py-2 pr-3 text-sm font-mono text-right ${
          isDeposit ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
        }`}
      >
        {isDeposit ? "+" : "-"}
        {formatNumber(deposit.amount, 6)}
      </td>
      <td className="py-2 text-xs text-muted-foreground text-right">
        {formatTimestamp(deposit.timestamp)}
      </td>
    </tr>
  );
}

function Pagination({
  offset,
  totalCount,
  pageSize,
  onPrev,
  onNext,
}: {
  offset: number;
  totalCount: number;
  pageSize: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const page = Math.floor(offset / pageSize) + 1;
  const totalPages = Math.ceil(totalCount / pageSize);
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-3">
      <span className="text-xs text-muted-foreground">
        Page {page} of {totalPages} ({totalCount} total)
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onPrev}
          disabled={offset === 0}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onNext}
          disabled={offset + pageSize >= totalCount}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

// ─── Main Page Component ──────────────────────────────────────────────────────

export default function PublicWalletPage() {
  const params = useParams<{ address: string }>();
  const address = decodeURIComponent(params.address ?? "");

  // A1.7: localStorage watchlist — session-local, no server awareness
  const { addAddress: addToWatchlist, isTracked } = useWatchlist();

  // A1.6: Auth state — used to conditionally show the gated-exchange banner
  const { isLoggedIn } = useAuth();

  // A2.3: Owner detection — in this platform all authenticated users are mapped
  // to the admin role by the auth webhook, so isLoggedIn == full ownership /
  // admin access. Anonymous viewers share the same URL but see only public data.
  const isOwner = isLoggedIn;

  // A1.6: True when at least one exchange requires an API key (e.g. Lighter).
  // Drives the "some data requires authentication" banner shown to anonymous users.
  const [hasApiKeyExchanges, setHasApiKeyExchanges] = useState(false);

  // Wallet state
  const [wallet, setWallet] = useState<WalletWithAccounts | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [creating, setCreating] = useState(false);

  // A1.5: Snapshot state — live positions + balances from portfolio_monitor
  const [snapshots, setSnapshots] = useState<AccountSnapshot[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);

  // Trade history state
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tradesTotal, setTradesTotal] = useState(0);
  const [tradesOffset, setTradesOffset] = useState(0);
  const [tradesLoading, setTradesLoading] = useState(false);

  // Closed positions (PnL journal) state
  const [positions, setPositions] = useState<Position[]>([]);
  const [positionsTotal, setPositionsTotal] = useState(0);
  const [positionsOffset, setPositionsOffset] = useState(0);
  const [positionsLoading, setPositionsLoading] = useState(false);

  // Funding state
  const [funding, setFunding] = useState<FundingPayment[]>([]);
  const [fundingTotal, setFundingTotal] = useState(0);
  const [fundingOffset, setFundingOffset] = useState(0);
  const [fundingLoading, setFundingLoading] = useState(false);

  // Deposits state
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [depositsTotal, setDepositsTotal] = useState(0);
  const [depositsOffset, setDepositsOffset] = useState(0);
  const [depositsLoading, setDepositsLoading] = useState(false);

  // ── Fetch wallet ────────────────────────────────────────────────────────────
  const fetchWallet = useCallback(async () => {
    if (!address) return;
    try {
      // A2.3: Use the authenticated client when logged in so the admin role is
      // applied. Wallet schema has no admin-only columns, but using the auth
      // client keeps the request consistent with authenticated snapshot fetches.
      const client = isOwner ? getGraphQLClient() : getPublicGraphQLClient();
      const query = isOwner ? GET_WALLET_BY_ADDRESS_AUTH : GET_WALLET_BY_ADDRESS;
      const data = await client.request<{ wallets: WalletWithAccounts[] }>(
        query,
        { address }
      );
      if (data.wallets.length === 0) {
        setNotFound(true);
        setWallet(null);
      } else {
        setWallet(data.wallets[0]);
        setNotFound(false);
      }
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : "Failed to load wallet");
    } finally {
      setWalletLoading(false);
    }
  }, [address, isOwner]);

  // Initial fetch + polling while detecting
  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  useEffect(() => {
    if (!detecting) return;
    const interval = setInterval(async () => {
      await fetchWallet();
      // Stop polling once accounts appear
      if (wallet && wallet.exchange_accounts.length > 0) {
        setDetecting(false);
      }
    }, POLL_INTERVAL_MS);

    // Safety timeout
    const timeout = setTimeout(() => setDetecting(false), DETECTING_TIMEOUT_MS);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [detecting, wallet, fetchWallet]);

  // Stop detecting once accounts are present
  useEffect(() => {
    if (detecting && wallet && wallet.exchange_accounts.length > 0) {
      setDetecting(false);
    }
  }, [detecting, wallet]);

  // ── A1.5 / A2.3: Fetch account snapshots ────────────────────────────────────
  const fetchSnapshots = useCallback(async () => {
    if (!address) return;
    setSnapshotsLoading(true);
    try {
      // A2.3: When authenticated (owner), use the admin client + auth query to
      // fetch ALL exchanges (including API-key-gated ones like Lighter) and
      // include orders_json. Anonymous viewers use the public query which is
      // filtered to non-API-key-gated exchanges and excludes orders_json.
      const client = isOwner ? getGraphQLClient() : getPublicGraphQLClient();
      const query = isOwner
        ? GET_LATEST_ACCOUNT_SNAPSHOTS_AUTH
        : GET_LATEST_ACCOUNT_SNAPSHOTS;
      const data = await client.request<{
        account_snapshots: AccountSnapshot[];
      }>(query, { address });
      setSnapshots(data.account_snapshots);
    } catch {
      // non-critical — page still shows trade history without snapshots
    } finally {
      setSnapshotsLoading(false);
    }
  }, [address, isOwner]);

  // ── Fetch trades ────────────────────────────────────────────────────────────
  const fetchTrades = useCallback(async () => {
    if (!address || !wallet) return;
    setTradesLoading(true);
    try {
      const client = getPublicGraphQLClient();
      const where = buildWalletAddressFilter(address);
      const data = await client.request<{
        trades: Trade[];
        trades_aggregate: { aggregate: { count: number } };
      }>(GET_TRADES_DYNAMIC, { limit: PAGE_SIZE, offset: tradesOffset, where });
      setTrades(data.trades);
      setTradesTotal(data.trades_aggregate.aggregate.count);
    } catch {
      // non-critical, silently fail
    } finally {
      setTradesLoading(false);
    }
  }, [address, wallet, tradesOffset]);

  // ── Fetch positions (closed PnL journal) ────────────────────────────────────
  const fetchPositions = useCallback(async () => {
    if (!address || !wallet) return;
    setPositionsLoading(true);
    try {
      const client = getPublicGraphQLClient();
      const where = buildWalletAddressFilter(address);
      const data = await client.request<{
        positions: Position[];
        positions_aggregate: { aggregate: { count: number } };
      }>(GET_POSITIONS_DYNAMIC, { limit: PAGE_SIZE, offset: positionsOffset, where });
      setPositions(data.positions);
      setPositionsTotal(data.positions_aggregate.aggregate.count);
    } catch {
      // non-critical
    } finally {
      setPositionsLoading(false);
    }
  }, [address, wallet, positionsOffset]);

  // ── Fetch funding ───────────────────────────────────────────────────────────
  const fetchFunding = useCallback(async () => {
    if (!address || !wallet) return;
    setFundingLoading(true);
    try {
      const client = getPublicGraphQLClient();
      const where = buildWalletAddressFilter(address);
      const data = await client.request<{
        funding_payments: FundingPayment[];
        funding_payments_aggregate: { aggregate: { count: number } };
      }>(GET_FUNDING_PAYMENTS_DYNAMIC, { limit: PAGE_SIZE, offset: fundingOffset, where });
      setFunding(data.funding_payments);
      setFundingTotal(data.funding_payments_aggregate.aggregate.count);
    } catch {
      // non-critical
    } finally {
      setFundingLoading(false);
    }
  }, [address, wallet, fundingOffset]);

  // ── Fetch deposits ──────────────────────────────────────────────────────────
  const fetchDeposits = useCallback(async () => {
    if (!address || !wallet) return;
    setDepositsLoading(true);
    try {
      const client = getPublicGraphQLClient();
      const where = buildWalletAddressFilter(address);
      const data = await client.request<{
        deposits: Deposit[];
        deposits_aggregate: { aggregate: { count: number } };
      }>(GET_DEPOSITS_DYNAMIC, { limit: PAGE_SIZE, offset: depositsOffset, where });
      setDeposits(data.deposits);
      setDepositsTotal(data.deposits_aggregate.aggregate.count);
    } catch {
      // non-critical
    } finally {
      setDepositsLoading(false);
    }
  }, [address, wallet, depositsOffset]);

  // ── A1.6: Check for API-key-gated exchanges ─────────────────────────────────
  // Fetch the exchanges list once on mount. The anonymous role has read access
  // to requires_api_key, so this works without authentication. If any exchange
  // requires an API key and the user is not logged in, we show an info banner.
  useEffect(() => {
    const checkApiKeyExchanges = async () => {
      try {
        const client = getPublicGraphQLClient();
        const data = await client.request<{ exchanges: Exchange[] }>(GET_EXCHANGES);
        const hasGated = data.exchanges.some((e) => e.requires_api_key);
        setHasApiKeyExchanges(hasGated);
      } catch {
        // Non-critical — banner is suppressed if the query fails
      }
    };
    checkApiKeyExchanges();
  }, []);

  // Trigger all data fetches when wallet loads
  useEffect(() => {
    if (wallet) {
      // Snapshots are keyed by wallet_address — no exchange accounts required
      fetchSnapshots();
      if (wallet.exchange_accounts.length > 0) {
        fetchTrades();
        fetchPositions();
        fetchFunding();
        fetchDeposits();
      }
    }
  }, [wallet, fetchSnapshots, fetchTrades, fetchPositions, fetchFunding, fetchDeposits]);

  // Pagination triggers
  useEffect(() => { if (wallet) fetchTrades(); }, [tradesOffset, fetchTrades, wallet]);
  useEffect(() => { if (wallet) fetchPositions(); }, [positionsOffset, fetchPositions, wallet]);
  useEffect(() => { if (wallet) fetchFunding(); }, [fundingOffset, fetchFunding, wallet]);
  useEffect(() => { if (wallet) fetchDeposits(); }, [depositsOffset, fetchDeposits, wallet]);

  // ── Create wallet handler ───────────────────────────────────────────────────
  const handleStartTracking = async () => {
    setCreating(true);
    setWalletError(null);
    try {
      const client = getPublicGraphQLClient();
      await client.request<{ insert_wallets_one: { id: string } }>(
        CREATE_WALLET,
        { address, chain: "solana" } // default chain; account_detector will correct it
      );
      // A1.7: Add to local watchlist so the /home page shows this wallet.
      // This is purely client-side — no user identity is stored server-side.
      addToWatchlist(address);
      setDetecting(true);
      await fetchWallet();
    } catch (err) {
      setWalletError(
        err instanceof Error ? err.message : "Failed to start tracking"
      );
    } finally {
      setCreating(false);
    }
  };

  // ── A1.5: Derived snapshot data ──────────────────────────────────────────────

  /** Sum of account_value across all snapshots = total portfolio value. */
  const totalAccountValue = snapshots.reduce(
    (sum, s) => sum + parseFloat(s.account_value || "0"),
    0
  );

  /** Most-recently-updated snapshot (used for "last updated" timestamp). */
  const latestSnapshot =
    snapshots.length > 0
      ? snapshots.reduce((latest, s) =>
          new Date(s.created_at) > new Date(latest.created_at) ? s : latest
        )
      : null;

  /** True if the newest snapshot is older than 24 hours. */
  const isStale =
    latestSnapshot !== null &&
    Date.now() - new Date(latestSnapshot.created_at).getTime() > STALE_THRESHOLD_MS;

  /** Flat list of all open positions across all snapshots, annotated with exchange_name. */
  const allPositions: PositionWithExchange[] = snapshots.flatMap((s) =>
    ((s.positions_json as SnapshotPosition[] | null) ?? []).map((p) => ({
      ...p,
      exchange_name: s.exchange_name,
    }))
  );

  /**
   * Flat list of non-zero balances across all snapshots.
   * Filter threshold 0.000001 removes dust amounts that round to zero at 6dp.
   */
  const allBalances: BalanceWithExchange[] = snapshots.flatMap((s) =>
    ((s.balances_json as SnapshotBalance[] | null) ?? [])
      .filter((b) => Math.abs(b.balance) >= 0.000001)
      .map((b) => ({ ...b, exchange_name: s.exchange_name }))
  );

  /**
   * A2.3: Flat list of all open orders across all snapshots.
   * Populated from orders_json which is only returned by the admin-role query;
   * always empty for anonymous viewers (orders_json is absent / null).
   */
  const allOrders: OrderWithExchange[] = isOwner
    ? snapshots.flatMap((s) =>
        ((s.orders_json as SnapshotOrder[] | null) ?? []).map((o) => ({
          ...o,
          exchange_name: s.exchange_name,
        }))
      )
    : [];

  /** Snapshots where portfolio_monitor reported a fetch error for that exchange. */
  const snapshotErrors = snapshots.filter((s) => !!s.error);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!address) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        No wallet address provided.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* A2.3: Owner vs public view indicator */}
      {isOwner ? (
        <Alert data-testid="owner-alert">
          <AlertDescription className="text-sm">
            You are viewing your own wallet — full portfolio data is visible.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert data-testid="public-alert">
          <AlertDescription className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm">
              Viewing public data for this wallet.{" "}
              <Link href="/login" className="font-medium underline hover:no-underline">
                Login
              </Link>{" "}
              for full access including editing, tagging, and multi-wallet views.
            </span>
          </AlertDescription>
        </Alert>
      )}

      {/* A1.6: API-key-gated exchange banner — shown to unauthenticated users when
           at least one exchange (e.g. Lighter) requires an API key to access data.
           The banner informs users that part of the portfolio may be hidden and
           invites them to log in to see the full picture. */}
      {hasApiKeyExchanges && !isOwner && (
        <Alert data-testid="api-key-exchange-banner">
          <AlertDescription className="text-sm text-muted-foreground">
            Some exchange data requires authentication to view.{" "}
            <Link href="/login" className="font-medium underline hover:no-underline">
              Log in
            </Link>{" "}
            to see positions and balances for all connected exchanges.
          </AlertDescription>
        </Alert>
      )}

      {/* Page header */}
      <div>
        <h1
          data-testid="wallet-address"
          className="text-xl md:text-2xl font-bold font-mono break-all"
        >
          {address}
        </h1>
        {wallet && (
          <p className="text-sm text-muted-foreground mt-1">
            Chain: <span className="capitalize font-medium">{wallet.chain}</span>
            {wallet.label && (
              <> · <span className="font-medium">{wallet.label}</span></>
            )}
          </p>
        )}
        {/* A2.3: Visual indicator that this is the authenticated owner's view */}
        {isOwner && (
          <Badge data-testid="owner-badge" variant="default" className="mt-2">
            Your Wallet
          </Badge>
        )}
      </div>

      {/* A1.5: Portfolio summary bar — only rendered when snapshot data exists */}
      {!walletLoading && wallet && snapshots.length > 0 && (
        <div className="rounded-lg border bg-card p-4 flex flex-wrap gap-6 items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              Total Account Value
            </p>
            <p className="text-2xl font-bold font-mono">
              ${formatNumber(String(totalAccountValue), 2)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isStale ? (
              <Badge
                variant="secondary"
                className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800"
              >
                Data may be stale — last updated{" "}
                {formatRelativeTime(latestSnapshot?.created_at)}
              </Badge>
            ) : latestSnapshot ? (
              <p className="text-sm text-muted-foreground">
                Last updated: {formatRelativeTime(latestSnapshot.created_at)}
              </p>
            ) : null}
          </div>
        </div>
      )}

      {/* Error */}
      {walletError && (
        <Alert variant="destructive">
          <AlertDescription>{walletError}</AlertDescription>
        </Alert>
      )}

      {/* Loading */}
      {walletLoading && (
        <div className="text-center py-12 text-muted-foreground">
          Loading wallet data…
        </div>
      )}

      {/* Not found — invite to start tracking */}
      {!walletLoading && notFound && (
        <SectionCard
          title="Wallet Not Tracked"
          description="This wallet is not yet in the system. Start tracking it to see portfolio data."
        >
          <div className="flex flex-col items-start gap-4">
            <p className="text-sm text-muted-foreground">
              Clicking "Start Tracking" will add this wallet and automatically
              detect all associated exchange accounts. Data will load within a
              few minutes.
            </p>
            <Button onClick={handleStartTracking} disabled={creating}>
              {creating ? "Adding wallet…" : "Start Tracking"}
            </Button>
          </div>
        </SectionCard>
      )}

      {/* Wallet found — detecting accounts */}
      {!walletLoading && wallet && wallet.exchange_accounts.length === 0 && (
        <SectionCard title="Detecting Accounts">
          <div className="flex items-center gap-3">
            <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
            <p className="text-sm text-muted-foreground">
              {detecting
                ? "Detecting exchange accounts… this may take a moment."
                : "No exchange accounts found yet. Account detection may still be in progress."}
            </p>
          </div>
        </SectionCard>
      )}

      {/* Wallet found with accounts */}
      {!walletLoading && wallet && wallet.exchange_accounts.length > 0 && (
        <>
          {/* Exchange Accounts */}
          <SectionCard
            title="Exchange Accounts"
            description={`${wallet.exchange_accounts.length} account${wallet.exchange_accounts.length !== 1 ? "s" : ""} detected`}
          >
            <div data-testid="exchange-accounts-list" className="divide-y">
              {wallet.exchange_accounts.map((account) => (
                <AccountRow key={account.id} account={account} />
              ))}
            </div>
            {/* A1.7: Let users add this wallet to their local watchlist */}
            {!isTracked(address) && (
              <div className="mt-3 pt-3 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addToWatchlist(address)}
                >
                  + Add to Watchlist
                </Button>
              </div>
            )}
          </SectionCard>

          {/* A1.5: Info banner — wallet exists but no snapshots yet (first sync pending) */}
          {!snapshotsLoading && snapshots.length === 0 && (
            <Alert>
              <AlertDescription className="text-sm">
                Live portfolio data will appear after the next portfolio sync cycle.
              </AlertDescription>
            </Alert>
          )}

          {/* A1.5: Open Positions — from account_snapshots.positions_json */}
          <SectionCard
            title="Open Positions"
            description={
              latestSnapshot
                ? `Last updated ${formatRelativeTime(latestSnapshot.created_at)}`
                : undefined
            }
          >
            {snapshotsLoading ? (
              <div className="text-center py-4 text-muted-foreground text-sm">
                Loading…
              </div>
            ) : snapshots.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Portfolio data not yet available — snapshots update periodically.
              </p>
            ) : allPositions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open positions.</p>
            ) : (
              <div className="overflow-x-auto">
                <table
                  data-testid="open-positions-table"
                  className="w-full text-sm"
                >
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="pb-2 text-left font-medium">Exchange</th>
                      <th className="pb-2 text-left font-medium">Market</th>
                      <th className="pb-2 text-left font-medium">Side</th>
                      <th className="pb-2 text-right font-medium">Size</th>
                      <th className="pb-2 text-right font-medium">Entry Price</th>
                      <th className="pb-2 text-right font-medium">Mark Price</th>
                      <th className="pb-2 text-right font-medium">
                        Unrealized PnL
                      </th>
                      <th className="pb-2 text-right font-medium">Liq. Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allPositions.map((p, i) => (
                      <OpenPositionRow
                        key={`${p.exchange_name}-${p.symbol}-${i}`}
                        position={p}
                        exchange={p.exchange_name}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {/* A1.5: Per-exchange error warnings */}
            {snapshotErrors.map((s) => (
              <p
                key={s.id}
                className="mt-2 text-xs text-amber-600 dark:text-amber-400"
              >
                ⚠ Unable to fetch {s.exchange_name} data
              </p>
            ))}
          </SectionCard>

          {/* A1.5: Balances — from account_snapshots.balances_json */}
          <SectionCard title="Balances">
            {snapshotsLoading ? (
              <div className="text-center py-4 text-muted-foreground text-sm">
                Loading…
              </div>
            ) : snapshots.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Portfolio data not yet available — snapshots update periodically.
              </p>
            ) : allBalances.length === 0 ? (
              <p className="text-sm text-muted-foreground">No balances found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table data-testid="balances-table" className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="pb-2 text-left font-medium">Exchange</th>
                      <th className="pb-2 text-left font-medium">Token</th>
                      <th className="pb-2 text-right font-medium">Balance</th>
                      <th className="pb-2 text-right font-medium">USD Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allBalances.map((b, i) => (
                      <BalanceRow
                        key={`${b.exchange_name}-${b.token}-${i}`}
                        balance={b}
                        exchange={b.exchange_name}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {/* A2.3: Open Orders — from account_snapshots.orders_json (owner-only) */}
          {isOwner && allOrders.length > 0 && (
            <SectionCard
              title="Open Orders"
              description={`${allOrders.length} open order${allOrders.length !== 1 ? "s" : ""}`}
            >
              <div className="overflow-x-auto">
                <table data-testid="open-orders-table" className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="pb-2 text-left font-medium">Exchange</th>
                      <th className="pb-2 text-left font-medium">Market</th>
                      <th className="pb-2 text-left font-medium">Side</th>
                      <th className="pb-2 text-right font-medium">Price</th>
                      <th className="pb-2 text-right font-medium">Size</th>
                      <th className="pb-2 text-left font-medium">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allOrders.map((o, i) => (
                      <tr
                        key={`${o.exchange_name}-${o.symbol}-${i}`}
                        className="border-b last:border-0 hover:bg-muted/30"
                      >
                        <td className="py-2 pr-3 text-sm text-muted-foreground">
                          {o.exchange_name}
                        </td>
                        <td className="py-2 pr-3 text-sm font-medium">{o.symbol}</td>
                        <td className="py-2 pr-3 text-sm">
                          <Badge
                            variant={o.side === "buy" ? "default" : "destructive"}
                            className="text-xs capitalize"
                          >
                            {o.side}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3 text-sm font-mono text-right">
                          {formatNumber(String(o.price), 4)}
                        </td>
                        <td className="py-2 pr-3 text-sm font-mono text-right">
                          {formatNumber(String(o.size), 4)}
                        </td>
                        <td className="py-2 text-sm text-muted-foreground capitalize">
                          {o.order_type}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {/* Position Journal (closed positions / PnL history) */}
          <SectionCard
            title="Position Journal"
            description={`${positionsTotal} closed position${positionsTotal !== 1 ? "s" : ""}`}
          >
            {positionsLoading ? (
              <div className="text-center py-4 text-muted-foreground text-sm">Loading…</div>
            ) : positions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No closed positions found.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table data-testid="positions-table" className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="pb-2 text-left font-medium">Market</th>
                        <th className="pb-2 text-left font-medium">Side</th>
                        <th className="pb-2 text-right font-medium">Entry</th>
                        <th className="pb-2 text-right font-medium">Exit</th>
                        <th className="pb-2 text-right font-medium">PnL</th>
                        <th className="pb-2 text-right font-medium hidden md:table-cell">Closed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((p) => (
                        <PositionRow key={p.id} position={p} />
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  offset={positionsOffset}
                  totalCount={positionsTotal}
                  pageSize={PAGE_SIZE}
                  onPrev={() => setPositionsOffset((o) => Math.max(0, o - PAGE_SIZE))}
                  onNext={() => setPositionsOffset((o) => o + PAGE_SIZE)}
                />
              </>
            )}
          </SectionCard>

          {/* Trade History */}
          <SectionCard
            title="Trade History"
            description={`${tradesTotal} trade${tradesTotal !== 1 ? "s" : ""}`}
          >
            {tradesLoading ? (
              <div className="text-center py-4 text-muted-foreground text-sm">Loading…</div>
            ) : trades.length === 0 ? (
              <p className="text-sm text-muted-foreground">No trades found.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table data-testid="trades-table" className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="pb-2 text-left font-medium">Pair</th>
                        <th className="pb-2 text-left font-medium">Side</th>
                        <th className="pb-2 text-right font-medium">Price</th>
                        <th className="pb-2 text-right font-medium">Qty</th>
                        <th className="pb-2 text-left font-medium hidden md:table-cell">Type</th>
                        <th className="pb-2 text-right font-medium">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.map((t) => (
                        <TradeRow key={t.id} trade={t} />
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  offset={tradesOffset}
                  totalCount={tradesTotal}
                  pageSize={PAGE_SIZE}
                  onPrev={() => setTradesOffset((o) => Math.max(0, o - PAGE_SIZE))}
                  onNext={() => setTradesOffset((o) => o + PAGE_SIZE)}
                />
              </>
            )}
          </SectionCard>

          {/* Funding Payments */}
          {fundingTotal > 0 && (
            <SectionCard
              title="Funding Payments"
              description={`${fundingTotal} payment${fundingTotal !== 1 ? "s" : ""}`}
            >
              {fundingLoading ? (
                <div className="text-center py-4 text-muted-foreground text-sm">Loading…</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table data-testid="funding-table" className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="pb-2 text-left font-medium">Market</th>
                          <th className="pb-2 text-right font-medium">Amount</th>
                          <th className="pb-2 text-right font-medium">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {funding.map((f) => (
                          <FundingRow key={f.id} payment={f} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination
                    offset={fundingOffset}
                    totalCount={fundingTotal}
                    pageSize={PAGE_SIZE}
                    onPrev={() => setFundingOffset((o) => Math.max(0, o - PAGE_SIZE))}
                    onNext={() => setFundingOffset((o) => o + PAGE_SIZE)}
                  />
                </>
              )}
            </SectionCard>
          )}

          {/* Deposits & Withdrawals */}
          {depositsTotal > 0 && (
            <SectionCard
              title="Deposits & Withdrawals"
              description={`${depositsTotal} record${depositsTotal !== 1 ? "s" : ""}`}
            >
              {depositsLoading ? (
                <div className="text-center py-4 text-muted-foreground text-sm">Loading…</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="pb-2 text-left font-medium">Asset</th>
                          <th className="pb-2 text-left font-medium">Type</th>
                          <th className="pb-2 text-right font-medium">Amount</th>
                          <th className="pb-2 text-right font-medium">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deposits.map((d) => (
                          <DepositRow key={d.id} deposit={d} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination
                    offset={depositsOffset}
                    totalCount={depositsTotal}
                    pageSize={PAGE_SIZE}
                    onPrev={() => setDepositsOffset((o) => Math.max(0, o - PAGE_SIZE))}
                    onNext={() => setDepositsOffset((o) => o + PAGE_SIZE)}
                  />
                </>
              )}
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}
