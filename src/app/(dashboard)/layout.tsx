"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useGlobalTags } from "@/contexts/filters-context";
import { useDenomination } from "@/contexts/denomination-context";
import { useAccountFilter } from "@/contexts/account-filter-context";
import { useDateRange } from "@/contexts/date-range-context";
import { DateRangeFilter } from "@/components/date-range-filter";
import { ExchangeAccount, EventDateRange } from "@/lib/queries";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { TagFilter } from "@/components/tag-filter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/dashboard" },
  { name: "Positions", href: "/positions" },
  { name: "Activity", href: "/activity" },
  { name: "Accounts", href: "/accounts" },
];

function accountDisplayName(acct: ExchangeAccount): string {
  const exchange = acct.exchange?.display_name || "Unknown";
  if (acct.label) return `${acct.label} (${exchange})`;
  if (acct.wallet?.label) return `${acct.wallet.label} - ${acct.account_identifier.slice(0, 6)}... (${exchange})`;
  return `${acct.account_identifier.slice(0, 8)}... (${exchange})`;
}

function computeYearOptions(range: EventDateRange | null): number[] {
  if (!range || range.earliest === null || range.latest === null) return [];
  const startYear = new Date(range.earliest).getFullYear();
  const endYear = new Date(range.latest).getFullYear();
  const years: number[] = [];
  for (let y = startYear; y <= endYear; y++) years.push(y);
  return years;
}

function AccountSelector() {
  const { accounts, selectedAccountIds, setSelectedAccountIds } = useAccountFilter();

  const label =
    selectedAccountIds.length === 0
      ? "All Accounts"
      : selectedAccountIds.length === 1
        ? (() => {
            const acct = accounts.find((a) => a.id === selectedAccountIds[0]);
            if (!acct) return "1 account";
            return accountDisplayName(acct);
          })()
        : `${selectedAccountIds.length} accounts`;

  const toggleAccount = (id: string) => {
    if (selectedAccountIds.includes(id)) {
      setSelectedAccountIds(selectedAccountIds.filter((a) => a !== id));
    } else {
      setSelectedAccountIds([...selectedAccountIds, id]);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="max-w-[200px] truncate">
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[260px]">
        <DropdownMenuCheckboxItem
          checked={selectedAccountIds.length === 0}
          onCheckedChange={() => setSelectedAccountIds([])}
        >
          All Accounts
        </DropdownMenuCheckboxItem>
        {accounts.map((acct) => (
          <DropdownMenuCheckboxItem
            key={acct.id}
            checked={selectedAccountIds.includes(acct.id)}
            onCheckedChange={() => toggleAccount(acct.id)}
          >
            <span className="truncate">
              {accountDisplayName(acct)}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { logout } = useAuth();
  const { globalTags, availableTags, isLoadingTags, setGlobalTags } =
    useGlobalTags();
  const { denomination, supportedDenominations, setDenomination } = useDenomination();
  const { dateRange, setDateRange } = useDateRange();
  const { selectedAccountIds } = useAccountFilter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [yearOptions, setYearOptions] = useState<number[]>([]);
  const [isLoadingYears, setIsLoadingYears] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const filters = selectedAccountIds.length > 0 ? { accountIds: selectedAccountIds } : undefined;
    const promise = api.getEventDateRange(filters);
    promise
      .then((range) => {
        if (!cancelled) {
          setYearOptions(computeYearOptions(range));
        }
      })
      .catch(() => {
        if (!cancelled) setYearOptions([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingYears(false);
      });
    return () => { cancelled = true; };
  }, [selectedAccountIds]);

  // Reset loading state when the fetch dependency changes
  const [prevAccountIds, setPrevAccountIds] = useState(selectedAccountIds);
  if (prevAccountIds !== selectedAccountIds) {
    setPrevAccountIds(selectedAccountIds);
    setIsLoadingYears(true);
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4">
          <div className="flex h-14 items-center justify-between md:h-16">
            {/* Logo + desktop nav */}
            <div className="flex items-center gap-8">
              <Link href="/dashboard" className="text-lg font-bold md:text-xl">
                Zif
              </Link>
              <nav className="hidden items-center gap-4 md:flex">
                {navigation.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "text-sm font-medium transition-colors hover:text-primary",
                      (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href))
                        ? "text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {item.name}
                  </Link>
                ))}
              </nav>
            </div>

            {/* Desktop actions */}
            <div className="hidden items-center gap-2 md:flex">
              {supportedDenominations.length > 0 && (
                <Select value={denomination} onValueChange={setDenomination}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {supportedDenominations.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <ThemeToggle />
              <Button variant="outline" onClick={logout}>
                Logout
              </Button>
            </div>

            {/* Mobile hamburger */}
            <div className="flex items-center gap-2 md:hidden">
              <ThemeToggle />
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="border-t md:hidden">
            <div className="container mx-auto space-y-1 px-4 py-3">
              {navigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href))
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  {item.name}
                </Link>
              ))}
              <div className="flex items-center gap-2 px-3 pt-2">
                {supportedDenominations.length > 0 && (
                  <Select value={denomination} onValueChange={setDenomination}>
                    <SelectTrigger className="w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {supportedDenominations.map((d) => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="px-3 pt-2">
                <Button variant="outline" onClick={logout} className="w-full">
                  Logout
                </Button>
              </div>
            </div>
          </div>
        )}
        {/* Global filters bar */}
        <div className="border-t bg-muted/30">
          <div className="container mx-auto px-4 py-2 flex flex-wrap items-center gap-2 justify-between">
            <DateRangeFilter value={dateRange} onChange={setDateRange} yearOptions={yearOptions} isLoadingYears={isLoadingYears} />
            <div className="flex items-center gap-2">
              <AccountSelector />
              <TagFilter
                availableTags={availableTags}
                selectedTags={globalTags}
                onSelectionChange={setGlobalTags}
                isLoading={isLoadingTags}
              />
            </div>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-4 md:py-8">{children}</main>
    </div>
  );
}
