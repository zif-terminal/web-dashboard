import type { Metadata } from "next";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "Zif Terminal",
  description: "Crypto portfolio tracker — track any wallet publicly",
};

/**
 * Minimal public layout for anonymous pages (/home, etc.).
 * No authentication required — uses the anonymous Hasura role.
 * Watchlist data lives in browser localStorage only; the server
 * has no knowledge of which wallets this session is tracking (A1.7).
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4">
          <div className="flex h-14 items-center justify-between md:h-16">
            <Link href="/home" className="text-lg font-bold md:text-xl">
              Zif Terminal
            </Link>
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
