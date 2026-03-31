import { createContext } from "react";
import type { AuthUser, SignInResponse } from "../lib/api";

export interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signInWithPassword: (username: string, password: string) => Promise<SignInResponse>;
  signUpWithPassword: (username: string, email: string, password: string) => Promise<void>;
  completeTwoFactorSignIn: (pendingToken: string, code: string) => Promise<void>;
  hydrateSessionFromToken: (token: string) => Promise<void>;
  refreshCurrentUser: () => Promise<void>;
  replaceCurrentUser: (user: AuthUser) => void;
  signOut: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
