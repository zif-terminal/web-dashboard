"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";

interface DenominationState {
  denomination: string;
  supportedDenominations: string[];
  isLoading: boolean;
  setDenomination: (d: string) => void;
}

const DenominationContext = createContext<DenominationState | undefined>(undefined);

function getInitialDenomination(): string {
  if (typeof window === "undefined") return "USDC";
  return localStorage.getItem("zif_denomination") || "USDC";
}

export function DenominationProvider({ children }: { children: ReactNode }) {
  const [denomination, setDenominationState] = useState<string>(getInitialDenomination);
  const [supportedDenominations, setSupportedDenominations] = useState<string[]>([]);
  const loadingRef = useRef(false);
  const [isLoading, setIsLoading] = useState(false);
  const pathname = usePathname();

  const setDenomination = useCallback((d: string) => {
    setDenominationState(d);
    localStorage.setItem("zif_denomination", d);
  }, []);

  useEffect(() => {
    if (pathname === "/login") return;
    let cancelled = false;
    loadingRef.current = true;
    api.getSupportedDenominations()
      .then((data) => { if (!cancelled) setSupportedDenominations(data); })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) {
          loadingRef.current = false;
          setIsLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [pathname]);

  return (
    <DenominationContext.Provider value={{ denomination, supportedDenominations, isLoading, setDenomination }}>
      {children}
    </DenominationContext.Provider>
  );
}

export function useDenomination() {
  const context = useContext(DenominationContext);
  if (!context) throw new Error("useDenomination must be used within DenominationProvider");
  return context;
}
