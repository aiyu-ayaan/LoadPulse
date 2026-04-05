import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { CircleUserRound, Info, ListOrdered, Settings, Shield, ArrowLeft, LogOut, CheckCircle2, Brain, History } from "lucide-react";
import { useAuth } from "../../context/useAuth";

const adminLinks = [
  { to: "/admin/ai", label: "AI", icon: Brain },
  { to: "/admin/ai-history", label: "AI History", icon: History },
  { to: "/admin/accounts", label: "Accounts", icon: CircleUserRound },
  { to: "/admin/queue", label: "Queue", icon: ListOrdered },
  { to: "/admin/settings", label: "Settings", icon: Settings },
  { to: "/admin/about", label: "About", icon: Info },
];

const titleByPath: Record<string, string> = {
  "/admin/ai": "AI",
  "/admin/ai-history": "AI History",
  "/admin/accounts": "Accounts",
  "/admin/queue": "Queue",
  "/admin/settings": "Settings",
  "/admin/about": "About",
};

export const AdminConsoleLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-[#0f1011] text-slate-100">
      <div className="grid min-h-screen grid-cols-1 md:grid-cols-[240px_1fr]">
        <aside className="border-b border-white/10 bg-[#171819] px-4 py-5 md:border-b-0 md:border-r">
          <div className="mb-6 flex items-center gap-2 px-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-white/5">
              <Shield className="h-4 w-4 text-slate-200" />
            </div>
            <p className="text-sm font-semibold tracking-wide text-slate-100">LoadPulse Admin</p>
          </div>

          <nav className="space-y-1.5">
            {adminLinks.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition ${
                    isActive ? "bg-white/12 text-white" : "text-slate-300 hover:bg-white/6 hover:text-white"
                  }`
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Current Session</p>
            <p className="mt-2 text-sm font-semibold text-slate-100">{user?.username}</p>
            <p className="text-xs text-slate-400">{user?.email}</p>
            <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-[11px] text-primary">
              <CheckCircle2 className="h-3 w-3" /> Admin
            </p>
          </div>
        </aside>

        <section className="px-4 py-4 md:px-6 md:py-5">
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#171819] px-4 py-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-slate-300">LoadPulse</p>
              <span className="text-slate-600">/</span>
              <h1 className="text-lg font-semibold text-white">{titleByPath[location.pathname] ?? "Admin"}</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate("/projects")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-slate-200 transition hover:bg-white/10"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to app
              </button>
              <button
                type="button"
                onClick={signOut}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-slate-200 transition hover:bg-white/10"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </header>

          <Outlet />
        </section>
      </div>
    </div>
  );
};
