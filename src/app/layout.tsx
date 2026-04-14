import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { ErrorProvider } from "@/contexts/error-context";
import { FiltersProvider } from "@/contexts/filters-context";
import { DenominationProvider } from "@/contexts/denomination-context";
import { AccountFilterProvider } from "@/contexts/account-filter-context";
import { DateRangeProvider } from "@/contexts/date-range-context";
import { LocalModeBanner } from "@/components/local-mode-banner";
import { ErrorBanner } from "@/components/error-banner";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Zif Dashboard",
  description: "Cryptocurrency exchange account management dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ErrorProvider>
            <FiltersProvider>
              <DenominationProvider>
                <AccountFilterProvider>
                  <DateRangeProvider>
                  <LocalModeBanner />
                  <ErrorBanner />
                  {children}
                  <Toaster />
                  </DateRangeProvider>
                </AccountFilterProvider>
              </DenominationProvider>
            </FiltersProvider>
          </ErrorProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
