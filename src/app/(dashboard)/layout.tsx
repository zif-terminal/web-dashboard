"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useGlobalTags } from "@/contexts/filters-context";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { TagFilter } from "@/components/tag-filter";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Accounts", href: "/accounts" },
  { name: "Trades", href: "/trades" },
  { name: "Positions", href: "/positions" },
  { name: "Funding", href: "/funding" },
  { name: "Deposits", href: "/deposits" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { logout } = useAuth();
  const { globalTags, availableTags, isLoadingTags, setGlobalTags } = useGlobalTags();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-8">
              <Link href="/accounts" className="text-xl font-bold">
                Zif Dashboard
              </Link>
              <nav className="flex items-center gap-4">
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
            <div className="flex items-center gap-2">
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
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
