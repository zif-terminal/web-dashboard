"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getToken, logout as authLogout, isAuthenticated } from "@/lib/auth";
// B4.1: Dispose the shared WS client on logout so stale tokens are not reused.
import { disposeSubscriptionClient } from "@/lib/graphql-subscription-client";

export function useAuth() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- required for initial auth check
    setIsLoggedIn(isAuthenticated());
    setIsLoading(false);
  }, []);

  const logout = useCallback(async () => {
    // B4.1: Close the WebSocket connection before clearing the auth token so
    // the subscription client doesn't try to reconnect with an expired token.
    disposeSubscriptionClient();
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
