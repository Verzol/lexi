"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  auth as authApi,
  refresh,
  setAccessToken,
  type UserOut,
} from "@/lib/api/client";

type AuthState = {
  user: UserOut | null;
  /** True until the initial silent-refresh has settled, so we don't flash the login screen. */
  loading: boolean;
  login: (email: string, password: string) => Promise<UserOut>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserOut | null>(null);
  const [loading, setLoading] = useState(true);

  // On a fresh page load the in-memory access token is gone, but the httpOnly
  // refresh cookie may still be valid — so try to restore the session silently.
  useEffect(() => {
    let cancelled = false;
    refresh()
      .then((res) => {
        if (!cancelled) setUser(res?.user ?? null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    setAccessToken(res.access_token);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (ctx === null) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
