import { createContext } from "react";
import type { AuthUser, SignInResponse } from "../lib/api";

export interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signInWithPassword: (username: string, password: string) => Promise<SignInResponse>;
  completeTwoFactorSignIn: (pendingToken: string, code: string) => Promise<void>;
  initializeAdminAccount: (username: string, email: string, password: string) => Promise<void>;
  refreshCurrentUser: () => Promise<void>;
  replaceCurrentUser: (user: AuthUser) => void;
  signOut: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
