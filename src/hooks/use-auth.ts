"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { logout as authLogout, checkAuthStatus } from "@/lib/auth";

export function useAuth() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    checkAuthStatus().then((authenticated) => {
      setIsLoggedIn(authenticated);
      setIsLoading(false);
    });
  }, []);

  const logout = useCallback(async () => {
    await authLogout();
    setIsLoggedIn(false);
    router.push("/login");
  }, [router]);

  const checkAuth = useCallback(async () => {
    const authenticated = await checkAuthStatus();
    setIsLoggedIn(authenticated);
    return authenticated;
  }, []);

  return {
    isLoggedIn,
    isLoading,
    logout,
    checkAuth,
  };
}
