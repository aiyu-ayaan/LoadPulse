import { createContext } from "react";
import type { AuthUser } from "../lib/api";

export interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signInWithPassword: (username: string, password: string) => Promise<void>;
  initializeAdminAccount: (username: string, email: string, password: string) => Promise<void>;
  signOut: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
