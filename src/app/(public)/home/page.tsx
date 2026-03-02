"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useWatchlist } from "@/hooks/use-watchlist";
import { getPublicGraphQLClient } from "@/lib/graphql-client-public";
import { GET_WALLETS_BY_ADDRESSES, Wallet } from "@/lib/queries";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { truncateAddress } from "@/lib/format";

// ─── Main Page ────────────────────────────────────────────────────────────────

/**
 * A1.7: Public anonymous watchlist page at /home.
 *
 * - Watchlist is stored in browser localStorage only — session-local.
 * - Two separate browser sessions can track the same wallet and will see
 *   identical public data (same Hasura rows, no user-scoped filtering),
 *   but neither session can see or affect the other's watchlist.
 * - No auth token is sent; Hasura assigns the "anonymous" role.
 */
export default function HomePage() {
  const { entries, addresses, addAddress, removeAddress } = useWatchlist();
  const [wallets, setWallets] = useState<Record<string, Wallet>>({});
  const [inputValue, setInputValue] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  // Track the last addresses array reference to skip redundant fetches
  const prevAddressesRef = useRef<string>("");

  // Batch-fetch wallet metadata for all watched addresses whenever the list changes
  useEffect(() => {
    const key = addresses.slice().sort().join(",");
    if (key === prevAddressesRef.current) return;
    prevAddressesRef.current = key;

    if (addresses.length === 0) {
      setWallets({});
      return;
    }

    const client = getPublicGraphQLClient();
    client
      .request<{ wallets: Wallet[] }>(GET_WALLETS_BY_ADDRESSES, { addresses })
      .then((data) => {
        const map: Record<string, Wallet> = {};
        for (const w of data.wallets) {
          map[w.address.toLowerCase()] = w;
        }
        setWallets(map);
      })
      .catch(() => {
        // Non-critical — wallet cards still render and link to /w/[address]
      });
  }, [addresses]);

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      setAddError("Please enter a wallet address.");
      return;
    }
    setAddError(null);
    addAddress(trimmed);
    setInputValue("");
  };

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold">Watchlist</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track public wallet performance. Your watchlist is stored locally in
          this browser — no account required.
        </p>
      </div>

      {/* Add wallet form */}
      <div className="space-y-2 max-w-lg">
        <div className="flex gap-2">
          <Input
            placeholder="Wallet address (0x… or Solana address)"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setAddError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            aria-label="Wallet address"
          />
          <Button onClick={handleAdd}>Add</Button>
        </div>
        {addError && (
          <p className="text-sm text-destructive">{addError}</p>
        )}
      </div>

      {/* Watchlist — empty state */}
      {entries.length === 0 && (
        <div
          data-testid="watchlist-empty"
          className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center text-muted-foreground"
        >
          <p className="text-lg font-medium">No wallets tracked yet</p>
          <p className="text-sm mt-1 max-w-sm">
            Add a wallet address above to start tracking its public performance
            data. Your list is private to this browser.
          </p>
        </div>
      )}

      {/* Watchlist — populated */}
      {entries.length > 0 && (
        <div
          data-testid="watchlist"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {entries.map((entry) => {
            const wallet = wallets[entry.address.toLowerCase()];
            return (
              <Card
                key={entry.address}
                className="hover:border-primary/50 transition-colors"
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-mono break-all">
                    <Link
                      href={`/w/${entry.address}`}
                      className="hover:underline text-primary"
                    >
                      {truncateAddress(entry.address, 8, 6)}
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {wallet ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="capitalize text-xs">
                        {wallet.chain}
                      </Badge>
                      {wallet.label && (
                        <span className="text-xs text-muted-foreground truncate">
                          {wallet.label}
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Not yet tracked — click to add.
                    </p>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <Link
                      href={`/w/${entry.address}`}
                      className="text-xs text-primary hover:underline"
                    >
                      View portfolio →
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => removeAddress(entry.address)}
                    >
                      Remove
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
