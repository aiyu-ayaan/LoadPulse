import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  fetchCurrentUser,
  setAuthToken,
  signOutSession,
  signIn,
  signUp,
  type AuthUser,
  verifyTwoFactorSignIn,
} from "../lib/api";
import { AuthContext, type AuthContextValue } from "./auth-context";

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshCurrentUser = useCallback(async () => {
    const response = await fetchCurrentUser();
    setUser(response.user);
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        await refreshCurrentUser();
      } catch {
        setAuthToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    void bootstrap();
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

  const signUpWithPassword = useCallback(async (username: string, email: string, password: string) => {
    const session = await signUp({ username, email, password });
    setAuthToken(session.token);
    setUser(session.user);
  }, []);

  const completeTwoFactorSignIn = useCallback(async (pendingToken: string, code: string) => {
    const session = await verifyTwoFactorSignIn({ pendingToken, code });
    setAuthToken(session.token);
    setUser(session.user);
  }, []);

  const hydrateSessionFromToken = useCallback(async (token: string) => {
    setAuthToken(token);
    try {
      await refreshCurrentUser();
    } catch (error) {
      setAuthToken(null);
      setUser(null);
      throw error;
    }
  }, [refreshCurrentUser]);

  const replaceCurrentUser = useCallback((nextUser: AuthUser) => {
    setUser(nextUser);
  }, []);

  const signOut = useCallback(() => {
    void signOutSession().catch(() => {
      // Ignore sign-out request errors and clear local session anyway.
    });
    setAuthToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isLoading,
      signInWithPassword,
      signUpWithPassword,
      completeTwoFactorSignIn,
      hydrateSessionFromToken,
      refreshCurrentUser,
      replaceCurrentUser,
      signOut,
    }),
    [user, isLoading, signInWithPassword, signUpWithPassword, completeTwoFactorSignIn, hydrateSessionFromToken, refreshCurrentUser, replaceCurrentUser, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
