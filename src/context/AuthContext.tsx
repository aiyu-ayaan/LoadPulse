import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  fetchCurrentUser,
  getAuthToken,
  setAuthToken,
  setupAdminAccount,
  signIn,
  verifyTwoFactorSignIn,
  type AuthUser,
} from "../lib/api";
import { AuthContext, type AuthContextValue } from "./auth-context";

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshCurrentUser = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setUser(null);
      return;
    }

    try {
      const response = await fetchCurrentUser();
      setUser(response.user);
    } catch {
      setAuthToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const boot = async () => {
      await refreshCurrentUser();
      setIsLoading(false);
    };

    void boot();
  }, [refreshCurrentUser]);

  const signInWithPassword = useCallback(async (username: string, password: string) => {
    const session = await signIn({ username, password });
    if ("requiresTwoFactor" in session && session.requiresTwoFactor) {
      return session;
    }

    if ("token" in session) {
      setAuthToken(session.token);
      setUser(session.user);
    }
    return session;
  }, []);

  const completeTwoFactorSignIn = useCallback(async (pendingToken: string, code: string) => {
    const session = await verifyTwoFactorSignIn({ pendingToken, code });
    setAuthToken(session.token);
    setUser(session.user);
  }, []);

  const initializeAdminAccount = useCallback(async (username: string, email: string, password: string) => {
    const session = await setupAdminAccount({ username, email, password });
    setAuthToken(session.token);
    setUser(session.user);
  }, []);

  const replaceCurrentUser = useCallback((nextUser: AuthUser) => {
    setUser(nextUser);
  }, []);

  const signOut = useCallback(() => {
    setAuthToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isLoading,
      signInWithPassword,
      completeTwoFactorSignIn,
      initializeAdminAccount,
      refreshCurrentUser,
      replaceCurrentUser,
      signOut,
    }),
    [user, isLoading, signInWithPassword, completeTwoFactorSignIn, initializeAdminAccount, refreshCurrentUser, replaceCurrentUser, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
