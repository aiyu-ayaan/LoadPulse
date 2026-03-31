import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  FolderKanban,
  LayoutDashboard,
  PlusCircle,
  History,
  BarChart3,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Bell,
  Activity,
  Menu,
  X,
  LogOut,
  ChevronDown,
  Check,
  CheckCheck,
  Trash2,
  ExternalLink,
  Info,
  CircleAlert,
  CheckCircle2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useProjects } from "../context/useProjects";
import { useAuth } from "../context/useAuth";
import { UserAvatar } from "../components/UserAvatar";
import { useNotifications } from "../context/useNotifications";

const menuItems = [
  { icon: FolderKanban, label: "Projects", path: "/projects" },
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: PlusCircle, label: "New Test", path: "/new-test" },
  { icon: History, label: "Test History", path: "/history" },
  { icon: BarChart3, label: "Reports", path: "/reports" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

export const DashboardLayout = () => {
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const location = useLocation();
  const { projects, selectedProject, selectedProjectId, selectProject } = useProjects();
  const { user, signOut } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead, removeNotification, clearNotifications } = useNotifications();
  const projectMenuRef = useRef<HTMLDivElement | null>(null);
  const notificationMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!projectMenuRef.current?.contains(event.target as Node)) {
        setIsProjectMenuOpen(false);
      }
      if (!notificationMenuRef.current?.contains(event.target as Node)) {
        setIsNotificationOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setIsNotificationOpen(false);
      setIsProjectMenuOpen(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname]);

  const notificationIcon = (type: "info" | "success" | "warning" | "error") => {
    if (type === "success") {
      return <CheckCircle2 className="h-4 w-4 text-emerald-300" />;
    }
    if (type === "error") {
      return <CircleAlert className="h-4 w-4 text-rose-300" />;
    }
    if (type === "warning") {
      return <CircleAlert className="h-4 w-4 text-amber-300" />;
    }
    return <Info className="h-4 w-4 text-primary" />;
  };

  return (
    <div className="relative min-h-screen overflow-hidden text-foreground">
      <AnimatePresence>
        {isMobileSidebarOpen && (
          <motion.button
            key="sidebar-backdrop"
            aria-label="Close sidebar"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileSidebarOpen(false)}
            className="fixed inset-0 z-30 bg-slate-950/65 backdrop-blur-sm lg:hidden"
          />
        )}
      </AnimatePresence>

      <aside
        className={`glass-panel fixed inset-y-3 left-3 z-40 flex w-[272px] flex-col overflow-hidden rounded-2xl transition-transform duration-300 lg:translate-x-0 ${
          isMobileSidebarOpen ? "translate-x-0" : "-translate-x-[115%]"
        } ${isCollapsed ? "lg:w-[92px]" : "lg:w-[272px]"}`}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-secondary-purple to-secondary-teal animate-logo-pulse">
            <Activity className="h-5 w-5 text-white" />
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-secondary-teal shadow-[0_0_12px_rgba(20,184,166,0.9)]" />
          </div>

          {!isCollapsed ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-bold leading-none tracking-tight">LoadPulse</p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">k6 powered</p>
            </div>
          ) : (
            <span className="sr-only">LoadPulse</span>
          )}

          <button
            aria-label="Close sidebar"
            onClick={() => setIsMobileSidebarOpen(false)}
            className="grid h-8 w-8 place-content-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X size={16} />
          </button>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto px-3 py-5">
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setIsMobileSidebarOpen(false)}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-2xl px-3 py-3 transition-all duration-200 ${
                  isActive ? "neon-border bg-primary/20 text-primary" : "text-slate-400 hover:bg-white/[0.07] hover:text-white"
                }`
              }
            >
              <item.icon className="h-5 w-5 min-w-[20px]" />
              {!isCollapsed ? <span className="font-medium">{item.label}</span> : <span className="sr-only">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {!isCollapsed && (
          <div className="mx-3 mb-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Selected Project</p>
            <p className="mt-2 text-sm font-semibold">{selectedProject?.name ?? "No project selected"}</p>
            <p className="mt-2 truncate text-xs text-muted">{selectedProject?.baseUrl ?? "Create a project to begin testing"}</p>
          </div>
        )}
      </aside>

      <div className={`flex min-h-screen flex-col transition-[margin] duration-300 ${isCollapsed ? "lg:ml-[92px]" : "lg:ml-[272px]"}`}>
        <header className="glass-panel sticky top-0 z-20 mx-3 mt-3 flex h-[74px] items-center justify-between rounded-2xl px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              aria-label="Open sidebar"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="grid h-10 w-10 place-content-center rounded-xl text-slate-300 transition hover:bg-white/10 hover:text-white lg:hidden"
            >
              <Menu size={18} />
            </button>

            <button
              aria-label="Toggle sidebar"
              onClick={() => setIsCollapsed((prev) => !prev)}
              className="hidden h-10 w-10 place-content-center rounded-xl text-slate-300 transition hover:bg-white/10 hover:text-white lg:grid"
            >
              {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>

            <div className="hidden md:block">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">LoadPulse Console</p>
              <h2 className="text-lg font-semibold tracking-tight">Project Performance Workspace</h2>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <div className="relative hidden md:block" ref={projectMenuRef}>
              <button
                type="button"
                onClick={() => setIsProjectMenuOpen((previous) => !previous)}
                className="flex h-11 min-w-[220px] items-center justify-between rounded-2xl border border-white/[0.12] bg-white/5 px-4 text-left text-sm text-slate-100 transition hover:bg-white/[0.08] focus:border-primary/60 focus:outline-none"
              >
                <span className="truncate">{selectedProject?.name ?? "Create a project first"}</span>
                <ChevronDown
                  className={`ml-3 h-4 w-4 shrink-0 text-slate-400 transition-transform ${isProjectMenuOpen ? "rotate-180" : ""}`}
                />
              </button>

              {isProjectMenuOpen && (
                <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 min-w-[260px] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-[0_24px_48px_rgba(2,6,23,0.55)] backdrop-blur-xl">
                  {projects.length === 0 ? (
                    <div className="rounded-xl px-3 py-3 text-sm text-slate-400">Create a project first</div>
                  ) : (
                    projects.map((project) => {
                      const isSelected = project.id === selectedProjectId;

                      return (
                        <button
                          key={project.id}
                          type="button"
                          onClick={() => {
                            selectProject(project.id);
                            setIsProjectMenuOpen(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm transition ${
                            isSelected ? "bg-primary/20 text-white" : "text-slate-200 hover:bg-white/[0.06]"
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium">{project.name}</p>
                            <p className="truncate text-xs text-slate-400">{project.baseUrl}</p>
                          </div>
                          {isSelected && <Check className="ml-3 h-4 w-4 shrink-0 text-primary" />}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search tests and reports..."
                className="h-11 w-[260px] rounded-2xl border border-white/[0.12] bg-white/5 py-2 pl-10 pr-4 text-sm text-slate-100 outline-none transition focus:border-primary/60"
              />
            </div>

            <div className="relative" ref={notificationMenuRef}>
              <button
                type="button"
                onClick={() => setIsNotificationOpen((previous) => !previous)}
                className="relative grid h-10 w-10 place-content-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
                aria-label="Notifications"
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-[0_0_10px_rgba(59,130,246,0.8)]">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {isNotificationOpen && (
                <div className="absolute right-0 top-[calc(100%+0.75rem)] z-40 w-[360px] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 shadow-[0_24px_48px_rgba(2,6,23,0.55)] backdrop-blur-xl">
                  <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Notifications</p>
                      <p className="text-xs text-slate-400">
                        {unreadCount > 0 ? `${unreadCount} unread update${unreadCount === 1 ? "" : "s"}` : "All caught up"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={markAllAsRead}
                        disabled={notifications.length === 0 || unreadCount === 0}
                        className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:bg-white/[0.06] disabled:opacity-40"
                      >
                        <span className="inline-flex items-center gap-1">
                          <CheckCheck className="h-3.5 w-3.5" /> Read all
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={clearNotifications}
                        disabled={notifications.length === 0}
                        className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:bg-white/[0.06] disabled:opacity-40"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {notifications.length === 0 ? (
                    <div className="px-4 py-10 text-center">
                      <p className="text-sm font-medium text-white">No notifications yet</p>
                      <p className="mt-1 text-xs text-slate-400">Queued, running, and completed tests will appear here.</p>
                    </div>
                  ) : (
                    <div className="max-h-[420px] overflow-y-auto p-2">
                      {notifications.map((notification) => (
                        <div
                          key={notification.id}
                          className={`group rounded-xl border px-3 py-3 transition ${
                            notification.read
                              ? "border-transparent bg-transparent hover:bg-white/[0.04]"
                              : "border-primary/20 bg-primary/10 hover:bg-primary/15"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5">{notificationIcon(notification.type)}</div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-white">{notification.title}</p>
                                  <p className="mt-1 text-xs leading-5 text-slate-300">{notification.message}</p>
                                </div>
                                {!notification.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                              </div>
                              <div className="mt-3 flex items-center justify-between gap-3">
                                <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                                  {new Date(notification.timestamp).toLocaleString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </p>
                                <div className="flex items-center gap-2">
                                  {notification.link && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const link = notification.link;
                                        if (!link) {
                                          return;
                                        }
                                        markAsRead(notification.id);
                                        setIsNotificationOpen(false);
                                        void navigate(link);
                                      }}
                                      className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:bg-white/[0.06]"
                                    >
                                      <span className="inline-flex items-center gap-1">
                                        <ExternalLink className="h-3.5 w-3.5" /> Open
                                      </span>
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => removeNotification(notification.id)}
                                    className="rounded-lg border border-white/10 px-2 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:bg-white/[0.06]"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="h-8 w-px bg-white/10" />

            <div className="flex items-center gap-2 md:gap-3">
              <UserAvatar username={user?.username ?? "User"} avatarDataUrl={user?.avatarDataUrl} size="sm" />
              <div className="hidden sm:block">
                <p className="text-sm font-semibold">{user?.username ?? "User"}</p>
                <p className="text-xs text-muted">{user?.githubLinked ? "GitHub Connected" : "Workspace Member"}</p>
              </div>
              <button
                onClick={signOut}
                className="grid h-9 w-9 place-content-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-3 pb-3 pt-4 md:px-4 md:pt-5 lg:px-6 lg:pt-6 xl:px-8 xl:pt-7">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.22 }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};

