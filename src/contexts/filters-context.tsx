"use client";

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { normalizeTags } from "@/lib/utils";

interface FiltersState {
  globalTags: string[];
  availableTags: string[];
  isLoadingTags: boolean;
  setGlobalTags: (tags: string[]) => void;
  refreshTags: () => void;
}

const FiltersContext = createContext<FiltersState | undefined>(undefined);

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [globalTags, setGlobalTagsState] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem("zif_selected_tags");
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [isLoadingTags, setIsLoadingTags] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const pathname = usePathname();

  const fetchTags = useCallback(async () => {
    // Don't fetch on login page or if already fetching
    if (pathname === "/login") return;

    setIsLoadingTags(true);
    try {
      // Fetch tags from accounts only
      const accounts = await api.getAccounts();
      const tagSet = new Set<string>();
      accounts.forEach((account) => {
        normalizeTags(account.tags).forEach((tag) => tagSet.add(tag));
      });
      setAvailableTags(Array.from(tagSet).sort());
      setHasFetched(true);
    } catch (error) {
      // Silently fail - user might not be authenticated yet
      console.error("Failed to fetch tags:", error);
    } finally {
      setIsLoadingTags(false);
    }
  }, [pathname]);

  // Fetch tags when navigating away from login page
  useEffect(() => {
    if (pathname !== "/login" && !hasFetched) {
      fetchTags();
    }
  }, [pathname, hasFetched, fetchTags]);

  const setGlobalTags = useCallback((tags: string[]) => {
    setGlobalTagsState(tags);
    try { localStorage.setItem("zif_selected_tags", JSON.stringify(tags)); } catch {}
  }, []);

  const refreshTags = useCallback(() => {
    setHasFetched(false);
  }, []);

  return (
    <FiltersContext.Provider
      value={{
        globalTags,
        availableTags,
        isLoadingTags,
        setGlobalTags,
        refreshTags,
      }}
    >
      {children}
    </FiltersContext.Provider>
  );
}

export function useFilters() {
  const context = useContext(FiltersContext);
  if (context === undefined) {
    throw new Error("useFilters must be used within a FiltersProvider");
  }
  return context;
}

export function useGlobalTags() {
  const { globalTags, availableTags, isLoadingTags, setGlobalTags, refreshTags } = useFilters();
  return { globalTags, availableTags, isLoadingTags, setGlobalTags, refreshTags };
}
