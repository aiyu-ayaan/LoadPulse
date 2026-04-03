import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { KeyRound, Lock, Mail, ShieldCheck, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { fetchAuthOptions, fetchCurrentUser, getGitHubAdminAuthStartUrl } from "../lib/api";

type AuthMode = "signin" | "signup";

const GitHubLogo = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
    <path d="M12 .5C5.648.5.5 5.648.5 12a11.5 11.5 0 0 0 7.862 10.918c.575.106.787-.25.787-.556 0-.275-.012-1.188-.018-2.156-3.2.694-3.877-1.356-3.877-1.356-.525-1.337-1.281-1.694-1.281-1.694-1.05-.718.081-.706.081-.706 1.162.081 1.775 1.194 1.775 1.194 1.031 1.768 2.706 1.256 3.362.962.106-.75.406-1.256.737-1.544-2.556-.287-5.243-1.281-5.243-5.706 0-1.262.45-2.293 1.188-3.1-.119-.288-.513-1.45.112-3.024 0 0 .969-.31 3.175 1.181a10.97 10.97 0 0 1 5.775 0c2.206-1.49 3.175-1.18 3.175-1.18.625 1.573.231 2.735.112 3.023.738.807 1.188 1.838 1.188 3.1 0 4.438-2.693 5.413-5.256 5.694.419.362.794 1.075.794 2.168 0 1.568-.012 2.831-.012 3.218 0 .306.206.669.794.556A11.502 11.502 0 0 0 23.5 12C23.5 5.648 18.352.5 12 .5Z" />
  </svg>
);

export const AdminSignInPage = () => {
  const navigate = useNavigate();
  const { signInWithPassword, signUpWithPassword, completeTwoFactorSignIn, hydrateSessionFromToken, signOut } = useAuth();

  const [mode, setMode] = useState<AuthMode>("signin");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [pendingToken, setPendingToken] = useState("");
  const [challengeIdentity, setChallengeIdentity] = useState<{ username: string; email: string } | null>(null);
  const [githubEnabled, setGithubEnabled] = useState(false);
  const [hasUsers, setHasUsers] = useState(true);
  const [hasAdmins, setHasAdmins] = useState(true);
  const [isCheckingOptions, setIsCheckingOptions] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCreateAdmin = !hasUsers || !hasAdmins;

  const ensureAdminAccess = useCallback(async () => {
    const response = await fetchCurrentUser();
    if (!response.user.isAdmin) {
      signOut();
      throw new Error("Only admin users can access the admin panel.");
    }
  }, [signOut]);

  useEffect(() => {
    const loadAuthOptions = async () => {
      try {
        const response = await fetchAuthOptions();
        setGithubEnabled(response.githubEnabled);
        setHasUsers(response.hasUsers);
        setHasAdmins(response.hasAdmins);
        setMode(response.hasUsers && response.hasAdmins ? "signin" : "signup");
      } catch {
        setGithubEnabled(false);
        setHasUsers(true);
        setHasAdmins(true);
      } finally {
        setIsCheckingOptions(false);
      }
    };

    void loadAuthOptions();
  }, []);

  useEffect(() => {
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    if (!hash) {
      return;
    }

    const params = new URLSearchParams(hash);
    const token = params.get("token");
    const nextError = params.get("error");
    const requiresTwoFactor = params.get("requiresTwoFactor") === "1";
    const nextPendingToken = params.get("pendingToken") ?? "";
    const nextUsername = params.get("username") ?? "";
    const nextEmail = params.get("email") ?? "";

    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);

    if (nextError) {
      setError(nextError);
      return;
    }

    if (requiresTwoFactor && nextPendingToken) {
      setPendingToken(nextPendingToken);
      setChallengeIdentity({ username: nextUsername, email: nextEmail });
      setError(null);
      return;
    }

    if (token) {
      setIsSubmitting(true);
      void hydrateSessionFromToken(token)
        .then(async () => {
          await ensureAdminAccess();
          navigate("/admin", { replace: true });
        })
        .catch((requestError) => {
          setError(requestError instanceof Error ? requestError.message : "Unable to finish sign-in.");
        })
        .finally(() => setIsSubmitting(false));
    }
  }, [ensureAdminAccess, hydrateSessionFromToken, navigate]);

  const title = useMemo(() => {
    if (pendingToken) {
      return "Check your authenticator";
    }
    if (canCreateAdmin && mode === "signup") {
      return "Create admin account";
    }
    return "Admin sign in";
  }, [canCreateAdmin, mode, pendingToken]);

  const subtitle = useMemo(() => {
    if (pendingToken) {
      return "Enter the 6-digit code from your authenticator app to finish signing in.";
    }
    if (canCreateAdmin && mode === "signup") {
      return "First launch detected. The first account is created as administrator automatically.";
    }
    return "Use an admin account to manage users and roles.";
  }, [canCreateAdmin, mode, pendingToken]);

  const handlePasswordAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (pendingToken) {
        await completeTwoFactorSignIn(pendingToken, twoFactorCode);
        await ensureAdminAccess();
        navigate("/admin", { replace: true });
        return;
      }

      if (mode === "signup") {
        if (!canCreateAdmin) {
          throw new Error("Admin account creation is disabled because an admin already exists.");
        }
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match.");
        }
        await signUpWithPassword(username, email, password);
        await ensureAdminAccess();
        navigate("/admin", { replace: true });
        return;
      }

      const session = await signInWithPassword(username, password);
      if ("requiresTwoFactor" in session && session.requiresTwoFactor) {
        setPendingToken(session.pendingToken);
        setChallengeIdentity(session.user);
        setTwoFactorCode("");
        return;
      }

      if ("token" in session && !session.user.isAdmin) {
        signOut();
        throw new Error("Only admin users can access the admin panel.");
      }

      navigate("/admin", { replace: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to continue.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isCheckingOptions) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        <p className="text-sm">Preparing admin access...</p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.2),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.22),transparent_34%),#020617] px-4 py-10 text-slate-100">
      <div className="glass-panel w-full max-w-[500px] rounded-[2rem] border border-white/10 p-8 shadow-[0_24px_80px_rgba(2,6,23,0.55)]">
        <div className="space-y-3 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-300">LoadPulse Admin</p>
          <h1 className="text-4xl font-bold tracking-tight text-white">{title}</h1>
          <p className="text-sm leading-6 text-slate-400">{subtitle}</p>
        </div>

        {!pendingToken && canCreateAdmin && (
          <div className="mt-6 flex rounded-2xl border border-white/10 bg-white/[0.03] p-1">
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError(null);
              }}
              className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                mode === "signin" ? "bg-primary text-white" : "text-slate-300 hover:bg-white/5"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setError(null);
              }}
              className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                mode === "signup" ? "bg-primary text-white" : "text-slate-300 hover:bg-white/5"
              }`}
            >
              Create Admin
            </button>
          </div>
        )}

        {githubEnabled && !pendingToken && (
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => {
              window.location.href = getGitHubAdminAuthStartUrl();
            }}
            className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.08] disabled:opacity-60"
          >
            <GitHubLogo />
            Continue With GitHub
          </button>
        )}

        {githubEnabled && !pendingToken && (
          <div className="my-6 flex items-center gap-4 text-xs uppercase tracking-[0.22em] text-slate-500">
            <div className="h-px flex-1 bg-white/10" />
            <span>or</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>
        )}

        <form className="space-y-4" onSubmit={(event) => void handlePasswordAuth(event)}>
          {!pendingToken && (
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Username</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value.toLowerCase())}
                  placeholder="admin-user"
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/35 py-3 pl-11 pr-4 text-sm text-slate-100 outline-none transition focus:border-primary/60"
                />
              </div>
            </div>
          )}

          {!pendingToken && mode === "signup" && (
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value.toLowerCase())}
                  placeholder="admin@example.com"
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/35 py-3 pl-11 pr-4 text-sm text-slate-100 outline-none transition focus:border-primary/60"
                />
              </div>
            </div>
          )}

          {!pendingToken && (
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={mode === "signup" ? "Create admin password" : "Enter password"}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/35 py-3 pl-11 pr-4 text-sm text-slate-100 outline-none transition focus:border-primary/60"
                />
              </div>
            </div>
          )}

          {!pendingToken && mode === "signup" && (
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Repeat password"
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/35 py-3 pl-11 pr-4 text-sm text-slate-100 outline-none transition focus:border-primary/60"
                />
              </div>
            </div>
          )}

          {pendingToken && (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
                Signing in as <span className="font-semibold text-white">{challengeIdentity?.username}</span>
                {challengeIdentity?.email ? ` (${challengeIdentity.email})` : ""}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Authenticator Code</label>
                <div className="relative">
                  <KeyRound className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    inputMode="numeric"
                    value={twoFactorCode}
                    onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/35 py-3 pl-11 pr-4 text-sm tracking-[0.35em] text-slate-100 outline-none transition focus:border-primary/60"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPendingToken("");
                  setChallengeIdentity(null);
                  setTwoFactorCode("");
                  setError(null);
                }}
                className="w-full rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/5"
              >
                Back To Sign In
              </button>
            </>
          )}

          {error && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
          >
            {isSubmitting
              ? pendingToken
                ? "Verifying..."
                : mode === "signup"
                  ? "Creating admin..."
                  : "Signing in..."
              : pendingToken
                ? "Verify Code"
                : mode === "signup"
                  ? "Create Admin Account"
                  : "Admin Sign In"}
          </button>
        </form>

        <div className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-400">
          <ShieldCheck className="h-4 w-4 text-emerald-300" />
          Admin users can access this panel after sign-in.
        </div>
      </div>
    </div>
  );
};
