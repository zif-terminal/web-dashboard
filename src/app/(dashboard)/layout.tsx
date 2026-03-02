"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useGlobalTags } from "@/contexts/filters-context";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { TagFilter } from "@/components/tag-filter";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Search", href: "/search" },
  { name: "Accounts", href: "/accounts" },
  { name: "Balances", href: "/balances" },
  { name: "Trades", href: "/trades" },
  { name: "Positions", href: "/positions" },
  { name: "Funding", href: "/funding" },
  { name: "Deposits", href: "/deposits" },
  { name: "Vaults", href: "/vaults" },
  { name: "Simulations", href: "/simulations" },
  { name: "Tax Report", href: "/tax-report" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { logout } = useAuth();
  const { globalTags, availableTags, isLoadingTags, setGlobalTags } =
    useGlobalTags();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4">
          <div className="flex h-14 items-center justify-between md:h-16">
            {/* Logo + desktop nav */}
            <div className="flex items-center gap-8">
              <Link href="/accounts" className="text-lg font-bold md:text-xl">
                Zif
              </Link>
              <nav className="hidden items-center gap-4 md:flex">
                {navigation.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "text-sm font-medium transition-colors hover:text-primary",
                      pathname === item.href
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
              <TagFilter
                availableTags={availableTags}
                selectedTags={globalTags}
                onSelectionChange={setGlobalTags}
                isLoading={isLoadingTags}
              />
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
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                ) : (
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                    />
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
                    pathname === item.href
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  {item.name}
                </Link>
              ))}
              <div className="flex items-center gap-2 px-3 pt-2">
                <TagFilter
                  availableTags={availableTags}
                  selectedTags={globalTags}
                  onSelectionChange={setGlobalTags}
                  isLoading={isLoadingTags}
                />
              </div>
              <div className="px-3 pt-2">
                <Button
                  variant="outline"
                  onClick={logout}
                  className="w-full"
                >
                  Logout
                </Button>
              </div>
            </div>
          </div>
        )}
      </header>
      <main className="container mx-auto px-4 py-4 md:py-8">{children}</main>
    </div>
  );
}
