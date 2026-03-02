import type { Metadata } from "next";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "Vaults — Zif Terminal",
  description: "Real-time performance of automated arbitrage vaults on Zif Terminal.",
};

/**
 * C1.3: Public vault layout.
 *
 * No authentication required — Hasura "anon" role provides read-only access
 * to vault_performance view. External depositors can monitor their vault's
 * PnL without creating an account.
 */
export default function VaultsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4">
          <div className="flex h-14 items-center justify-between md:h-16">
            <div className="flex items-center gap-4">
              <Link href="/home" className="text-lg font-bold md:text-xl">
                Zif Terminal
              </Link>
              <nav className="hidden sm:flex items-center gap-1 text-sm text-muted-foreground">
                <span>/</span>
                <Link
                  href="/vaults"
                  className="hover:text-primary transition-colors px-2 py-1 rounded"
                >
                  Vaults
                </Link>
              </nav>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Link
                href="/login"
                className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
              >
                Login
              </Link>
            </div>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-4 md:py-8">{children}</main>
    </div>
  );
}
