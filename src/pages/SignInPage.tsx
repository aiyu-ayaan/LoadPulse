import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, Lock, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { fetchSetupStatus } from "../lib/api";

export const SignInPage = () => {
  const navigate = useNavigate();
  const { signInWithPassword, completeTwoFactorSignIn, initializeAdminAccount } = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [pendingToken, setPendingToken] = useState("");
  const [challengeIdentity, setChallengeIdentity] = useState<{ username: string; email: string } | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [isCheckingSetup, setIsCheckingSetup] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSetupState = async () => {
      try {
        const response = await fetchSetupStatus();
        setNeedsSetup(response.needsSetup);
      } catch {
        setNeedsSetup(false);
      } finally {
        setIsCheckingSetup(false);
      }
    };

    void loadSetupState();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (pendingToken) {
        await completeTwoFactorSignIn(pendingToken, twoFactorCode);
        navigate("/projects", { replace: true });
        return;
      }

      if (needsSetup) {
        if (!email.trim()) {
          setError("Email is required.");
          setIsSubmitting(false);
          return;
        }
        if (password !== confirmPassword) {
          setError("Passwords do not match.");
          setIsSubmitting(false);
          return;
        }
        await initializeAdminAccount(username, email, password);
        navigate("/projects", { replace: true });
      } else {
        const session = await signInWithPassword(username, password);
        if ("requiresTwoFactor" in session && session.requiresTwoFactor) {
          setPendingToken(session.pendingToken);
          setChallengeIdentity(session.user);
          setTwoFactorCode("");
          return;
        }
        navigate("/projects", { replace: true });
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isTwoFactorStep = Boolean(pendingToken);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-10">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute left-1/2 top-[-120px] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute bottom-[-120px] right-[-120px] h-[360px] w-[360px] rounded-full bg-secondary-purple/20 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/85 p-8 shadow-2xl backdrop-blur-xl">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">LoadPulse Access</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-white">
            {isTwoFactorStep ? "Enter Verification Code" : needsSetup ? "Create Admin Account" : "Sign in to continue"}
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            {isTwoFactorStep
              ? `Open your authenticator app for ${challengeIdentity?.username ?? "this account"} and enter the 6-digit code.`
              : needsSetup
                ? "First launch detected. Create the first admin account to finish setup."
                : "Use your team credentials to access projects and run tests."}
          </p>
        </div>

        {isCheckingSetup && <div className="mb-4 text-center text-sm text-slate-400">Checking first-run setup...</div>}

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
          {isTwoFactorStep ? (
            <label className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Authenticator Code</span>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                <input
                  value={twoFactorCode}
                  onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D+/g, "").slice(0, 6))}
                  placeholder="123456"
                  inputMode="numeric"
                  className="h-11 w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-10 pr-4 text-sm text-slate-100 outline-none transition-colors focus:border-primary/60"
                />
              </div>
            </label>
          ) : (
            <>
              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Username</span>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                  <input
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="Enter username"
                    className="h-11 w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-10 pr-4 text-sm text-slate-100 outline-none transition-colors focus:border-primary/60"
                  />
                </div>
              </label>

              {needsSetup && (
                <label className="block space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Email</span>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="admin@example.com"
                      className="h-11 w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-10 pr-4 text-sm text-slate-100 outline-none transition-colors focus:border-primary/60"
                    />
                  </div>
                </label>
              )}

              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Password</span>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter password"
                    className="h-11 w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-10 pr-4 text-sm text-slate-100 outline-none transition-colors focus:border-primary/60"
                  />
                </div>
              </label>

              {needsSetup && (
                <label className="block space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Confirm Password</span>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="Re-enter password"
                      className="h-11 w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-10 pr-4 text-sm text-slate-100 outline-none transition-colors focus:border-primary/60"
                    />
                  </div>
                </label>
              )}
            </>
          )}

          {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}

          <button
            type="submit"
            disabled={isSubmitting || isCheckingSetup}
            className="mt-2 flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-65"
          >
            {isSubmitting
              ? isTwoFactorStep
                ? "Verifying..."
                : needsSetup
                  ? "Creating account..."
                  : "Signing in..."
              : isTwoFactorStep
                ? "Verify And Continue"
                : needsSetup
                  ? "Create Admin Account"
                  : "Sign In"}
          </button>

          {isTwoFactorStep && (
            <button
              type="button"
              onClick={() => {
                setPendingToken("");
                setChallengeIdentity(null);
                setTwoFactorCode("");
                setError(null);
              }}
              className="w-full text-sm text-slate-400 transition hover:text-white"
            >
              Use a different account
            </button>
          )}
        </form>
      </div>
    </div>
  );
};
