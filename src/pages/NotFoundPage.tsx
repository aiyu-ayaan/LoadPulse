import { Compass, Home } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const NotFoundPage = () => {
  const navigate = useNavigate();

  return (
    <div className="glass-panel mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center rounded-2xl border border-white/10 p-8 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-primary">
        <Compass className="h-7 w-7" />
      </div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">404</p>
      <h1 className="mt-2 text-3xl font-bold text-white">Page Not Found</h1>
      <p className="mt-2 max-w-md text-sm text-slate-400">
        The route you opened does not exist. Choose a project first, then continue to dashboard, tests, reports, or settings.
      </p>
      <button
        type="button"
        onClick={() => navigate("/projects")}
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90"
      >
        <Home className="h-4 w-4" />
        Go To Projects
      </button>
    </div>
  );
};
