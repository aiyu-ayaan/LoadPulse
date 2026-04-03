import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  FolderKanban,
  LayoutDashboard,
  PlusCircle,
  History,
  BarChart3,
  Settings,
  Bell,
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
import { useProjects } from "../context/useProjects";
import { useAuth } from "../context/useAuth";
import { UserAvatar } from "../components/UserAvatar";
import { useNotifications } from "../context/useNotifications";
import {
  buildProjectSectionPath,
  getPathForProjectSwitch,
  getTitleFromPathname,
  type ProjectSection,
} from "../lib/project-routes";

const projectMenuItems: Array<{ icon: typeof LayoutDashboard; label: string; section: ProjectSection }> = [
  { icon: LayoutDashboard, label: "Dashboard", section: "dashboard" },
  { icon: PlusCircle, label: "New Test", section: "new-test" },
  { icon: History, label: "Test History", section: "history" },
  { icon: BarChart3, label: "Reports", section: "reports" },
  { icon: Settings, label: "Settings", section: "settings" },
];

export const DashboardLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

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
      setIsMobileSidebarOpen(false);
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
    <div className="min-h-screen bg-[#0f1011] text-slate-100">
      {isMobileSidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setIsMobileSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
        />
      )}

      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[240px_1fr]">
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-[240px] border-r border-white/10 bg-[#171819] p-4 transition-transform duration-200 lg:static lg:translate-x-0 ${
            isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-content-center rounded-md border border-white/15 bg-white/5">
                <LayoutDashboard className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">LoadPulse</p>
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Workspace</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(false)}
              className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <nav className="space-y-1.5">
            <NavLink
              to="/projects"
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition ${
                  isActive ? "bg-white/12 text-white" : "text-slate-300 hover:bg-white/6 hover:text-white"
                }`
              }
            >
              <FolderKanban className="h-4 w-4" />
              Projects
            </NavLink>

            {selectedProjectId &&
              projectMenuItems.map((item) => (
                <NavLink
                  key={item.section}
                  to={buildProjectSectionPath(selectedProjectId, item.section)}
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

          <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Selected Project</p>
            <p className="mt-2 truncate text-sm font-semibold text-white">{selectedProject?.name ?? "No project selected"}</p>
            <p className="mt-1 truncate text-xs text-slate-400">{selectedProject?.baseUrl ?? "Choose one from Projects."}</p>
          </div>
        </aside>

        <section className="px-3 py-3 md:px-4 lg:px-6">
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#171819] px-4 py-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen(true)}
                className="rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white lg:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-4 w-4" />
              </button>
              <p className="text-sm font-medium text-slate-300">LoadPulse</p>
              <span className="text-slate-600">/</span>
              <h1 className="text-base font-semibold text-white md:text-lg">{getTitleFromPathname(location.pathname)}</h1>
            </div>

            <div className="flex items-center gap-2 md:gap-3">
              <div className="relative" ref={projectMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsProjectMenuOpen((previous) => !previous)}
                  className="flex min-w-[140px] max-w-[170px] items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-white/[0.08] md:min-w-[220px] md:max-w-none"
                >
                  <span className="truncate">{selectedProject?.name ?? "Select project"}</span>
                  <ChevronDown
                    className={`ml-3 h-4 w-4 shrink-0 text-slate-400 transition-transform ${isProjectMenuOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {isProjectMenuOpen && (
                  <div className="absolute right-0 top-[calc(100%+0.4rem)] z-30 min-w-[240px] overflow-hidden rounded-xl border border-white/10 bg-[#171819] p-2 shadow-[0_14px_30px_rgba(2,6,23,0.3)]">
                    {projects.length === 0 ? (
                      <div className="rounded-lg px-3 py-2 text-sm text-slate-400">Create a project first</div>
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
                              void navigate(getPathForProjectSwitch(location.pathname, project.id));
                            }}
                            className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition ${
                              isSelected ? "bg-primary/20 text-white" : "text-slate-200 hover:bg-white/[0.08]"
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

              <div className="relative" ref={notificationMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsNotificationOpen((previous) => !previous)}
                  className="relative grid h-9 w-9 place-content-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-300 transition hover:bg-white/10 hover:text-white"
                  aria-label="Notifications"
                >
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 min-w-[16px] rounded-full bg-primary px-1 py-[1px] text-[10px] font-bold leading-none text-white">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>

                {isNotificationOpen && (
                  <div className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-[min(92vw,360px)] overflow-hidden rounded-xl border border-white/10 bg-[#171819] shadow-[0_14px_30px_rgba(2,6,23,0.35)]">
                    <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-white">Notifications</p>
                        <p className="text-xs text-slate-400">
                          {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={markAllAsRead}
                          disabled={notifications.length === 0 || unreadCount === 0}
                          className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/10 disabled:opacity-40"
                        >
                          <span className="inline-flex items-center gap-1">
                            <CheckCheck className="h-3 w-3" /> Read all
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={clearNotifications}
                          disabled={notifications.length === 0}
                          className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/10 disabled:opacity-40"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    {notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center">
                        <p className="text-sm text-slate-300">No notifications yet.</p>
                      </div>
                    ) : (
                      <div className="max-h-[380px] space-y-2 overflow-y-auto p-2">
                        {notifications.map((notification) => (
                          <div
                            key={notification.id}
                            className={`rounded-lg border px-3 py-3 ${
                              notification.read
                                ? "border-white/5 bg-white/[0.02]"
                                : "border-primary/30 bg-primary/10"
                            }`}
                          >
                            <div className="flex items-start gap-2.5">
                              <div className="mt-0.5">{notificationIcon(notification.type)}</div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-sm font-semibold text-white">{notification.title}</p>
                                  {!notification.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                                </div>
                                <p className="mt-1 text-xs leading-5 text-slate-300">{notification.message}</p>
                                <div className="mt-3 flex items-center justify-between gap-2">
                                  <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">
                                    {new Date(notification.timestamp).toLocaleString("en-US", {
                                      month: "short",
                                      day: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </p>
                                  <div className="flex items-center gap-1.5">
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
                                        className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10"
                                      >
                                        <span className="inline-flex items-center gap-1">
                                          <ExternalLink className="h-3 w-3" /> Open
                                        </span>
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => removeNotification(notification.id)}
                                      className="rounded-md border border-white/10 px-1.5 py-1 text-slate-300 hover:bg-white/10"
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

              <div className="hidden h-8 w-px bg-white/10 sm:block" />

              <div className="flex items-center gap-2">
                <UserAvatar username={user?.username ?? "User"} avatarDataUrl={user?.avatarDataUrl} size="sm" />
                <div className="hidden md:block">
                  <p className="text-sm font-semibold text-white">{user?.username ?? "User"}</p>
                  <p className="text-xs text-slate-400">{user?.githubLinked ? "GitHub linked" : "Workspace member"}</p>
                </div>
                <button
                  onClick={signOut}
                  className="grid h-9 w-9 place-content-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-300 transition hover:bg-white/10 hover:text-white"
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          </header>

          <main className="pb-4">
            <Outlet />
          </main>
        </section>
      </div>
    </div>
  );
};
