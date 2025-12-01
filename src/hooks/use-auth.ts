"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getToken, logout as authLogout, isAuthenticated } from "@/lib/auth";

export function useAuth() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    setIsLoggedIn(isAuthenticated());
    setIsLoading(false);
  }, []);

  const logout = useCallback(async () => {
    await authLogout();
    setIsLoggedIn(false);
    router.push("/login");
  }, [router]);

  const checkAuth = useCallback(() => {
    const authenticated = isAuthenticated();
    setIsLoggedIn(authenticated);
    return authenticated;
  }, []);

  return {
    isLoggedIn,
    isLoading,
    token: getToken(),
    logout,
    checkAuth,
  };
}
