"use client";

import { useState, useCallback } from "react";
import { Search, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  searchWallet,
  type SearchExchangeResult,
  type DiscoverableAccount,
} from "@/lib/api/exchanges";

type SearchStatus = "idle" | "searching" | "done" | "error";

function detectChainLabel(address: string): string | null {
  if (/^0x[a-fA-F0-9]{40}$/.test(address)) return "Ethereum";
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return "Solana";
  return null;
}

function formatExchangeName(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function AccountCard({ account, exchange }: { account: DiscoverableAccount; exchange: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{account.name}</span>
          <Badge variant="outline" className="text-xs">
            {account.account_type.replace("_", " ")}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground font-mono truncate max-w-[300px] sm:max-w-[500px]">
          {account.account_identifier}
        </p>
      </div>
      <Badge variant="secondary" className="text-xs">
        {formatExchangeName(exchange)}
      </Badge>
    </div>
  );
}

function ExchangeResultSection({ result }: { result: SearchExchangeResult }) {
  const hasAccounts = result.accounts && result.accounts.length > 0;
  const hasError = !!result.error;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{formatExchangeName(result.exchange)}</CardTitle>
          {hasAccounts && (
            <Badge>{result.accounts.length} account{result.accounts.length !== 1 ? "s" : ""}</Badge>
          )}
          {!hasAccounts && !hasError && (
            <Badge variant="secondary">No accounts</Badge>
          )}
          {hasError && !hasAccounts && (
            <Badge variant="destructive">Error</Badge>
          )}
        </div>
        {hasError && (
          <CardDescription className="text-destructive flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {result.error}
          </CardDescription>
        )}
      </CardHeader>
      {hasAccounts && (
        <CardContent>
          <div className="space-y-2">
            {result.accounts.map((account) => (
              <AccountCard
                key={`${result.exchange}-${account.account_identifier}`}
                account={account}
                exchange={result.exchange}
              />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function SearchPage() {
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [results, setResults] = useState<SearchExchangeResult[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchedAddress, setSearchedAddress] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    const trimmed = address.trim();
    if (!trimmed) return;

    const chain = detectChainLabel(trimmed);
    if (!chain) {
      setErrorMessage("Please enter a valid Ethereum (0x...) or Solana address.");
      setStatus("error");
      return;
    }

    setStatus("searching");
    setErrorMessage(null);
    setResults([]);

    try {
      const searchResults = await searchWallet(trimmed);
      setResults(searchResults);
      setSearchedAddress(trimmed);
      setStatus("done");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Search failed");
      setStatus("error");
    }
  }, [address]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const totalAccounts = results.reduce(
    (sum, r) => sum + (r.accounts?.length || 0),
    0
  );

  const chainLabel = address.trim().length >= 32 ? detectChainLabel(address.trim()) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-3xl font-bold">Wallet Search</h1>
        <p className="text-muted-foreground">
          Search for a wallet address across all supported exchanges
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Search by Address</CardTitle>
          <CardDescription>
            Enter an Ethereum or Solana wallet address to discover accounts on Hyperliquid, Drift, and Lighter
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Enter wallet address (0x... or Solana address)"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={status === "searching"}
                  className="pl-9"
                />
              </div>
              <Button
                onClick={handleSearch}
                disabled={status === "searching" || !address.trim()}
              >
                {status === "searching" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Searching...
                  </>
                ) : (
                  "Search"
                )}
              </Button>
            </div>
            {chainLabel && status !== "error" && (
              <p className="text-xs text-muted-foreground px-1">
                Detected chain: {chainLabel}
              </p>
            )}
            {status === "error" && errorMessage && (
              <p className="text-sm text-destructive px-1">{errorMessage}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {status === "done" && searchedAddress && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Results</h2>
            <p className="text-sm text-muted-foreground">
              {totalAccounts} account{totalAccounts !== 1 ? "s" : ""} found across {results.length} exchange{results.length !== 1 ? "s" : ""}
            </p>
          </div>

          {results.map((result) => (
            <ExchangeResultSection key={result.exchange} result={result} />
          ))}
        </div>
      )}
    </div>
  );
}
