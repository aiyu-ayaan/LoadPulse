import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchCurrentUser, getAuthToken, setAuthToken, setupAdminAccount, signIn, type AuthUser } from "../lib/api";
import { AuthContext, type AuthContextValue } from "./auth-context";

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const boot = async () => {
      const token = getAuthToken();
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetchCurrentUser();
        setUser(response.user);
      } catch {
        setAuthToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    void boot();
  }, []);

  const signInWithPassword = useCallback(async (username: string, password: string) => {
    const session = await signIn({ username, password });
    setAuthToken(session.token);
    setUser(session.user);
  }, []);

  const initializeAdminAccount = useCallback(async (username: string, email: string, password: string) => {
    const session = await setupAdminAccount({ username, email, password });
    setAuthToken(session.token);
    setUser(session.user);
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
      initializeAdminAccount,
      signOut,
    }),
    [user, isLoading, signInWithPassword, initializeAdminAccount, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
