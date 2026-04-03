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
  CheckCheck,
  Trash2,
  ExternalLink,
  Info,
  CircleAlert,
  CheckCircle2,
  PanelLeftClose,
  PanelLeftOpen,
  ArrowLeft,
  UserCircle2,
} from "lucide-react";
import { useProjects } from "../context/useProjects";
import { useAuth } from "../context/useAuth";
import { UserAvatar } from "../components/UserAvatar";
import { useNotifications } from "../context/useNotifications";
import { buildProjectSectionPath, type ProjectSection } from "../lib/project-routes";

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

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

  const { selectedProject, selectedProjectId, clearSelectedProject } = useProjects();
  const { user, signOut } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead, removeNotification, clearNotifications } = useNotifications();

  const notificationMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
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
      setIsMobileSidebarOpen(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname]);

  useEffect(() => {
    if (location.pathname === "/projects" && selectedProjectId) {
      clearSelectedProject();
    }
  }, [location.pathname, selectedProjectId, clearSelectedProject]);

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

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-white/10 bg-[#171819] p-3 transition-all duration-200 ${
          isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
        } ${isCollapsed ? "w-[86px] lg:translate-x-0" : "w-[250px] lg:translate-x-0"}`}
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="grid h-8 w-8 shrink-0 place-content-center rounded-md border border-white/15 bg-white/5">
              <LayoutDashboard className="h-4 w-4" />
            </div>
            {!isCollapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">LoadPulse</p>
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Workspace</p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsCollapsed((previous) => !previous)}
              className="hidden rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white lg:block"
              aria-label="Toggle sidebar"
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(false)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <nav className="space-y-1.5">
          {!selectedProjectId && (
            <NavLink
              to="/projects"
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition ${
                  isActive ? "bg-white/12 text-white" : "text-slate-300 hover:bg-white/6 hover:text-white"
                }`
              }
            >
              <FolderKanban className="h-4 w-4 shrink-0" />
              {!isCollapsed && "Projects"}
            </NavLink>
          )}

          {selectedProjectId && (
            <button
              type="button"
              onClick={() => navigate("/projects")}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-slate-300 transition hover:bg-white/6 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              {!isCollapsed && "Back To Projects"}
            </button>
          )}

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
                <item.icon className="h-4 w-4 shrink-0" />
                {!isCollapsed && item.label}
              </NavLink>
            ))}
        </nav>

        <div className="mt-auto space-y-3">
          {!isCollapsed && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Selected Project</p>
              <p className="mt-2 truncate text-sm font-semibold text-white">{selectedProject?.name ?? "No project selected"}</p>
              <p className="mt-1 truncate text-xs text-slate-400">{selectedProject?.baseUrl ?? "Choose one from Projects."}</p>
            </div>
          )}

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
            <button
              type="button"
              onClick={() => {
                if (selectedProjectId) {
                  navigate(buildProjectSectionPath(selectedProjectId, "settings"));
                } else {
                  navigate("/projects");
                }
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-slate-200 transition hover:bg-white/10"
            >
              <UserCircle2 className="h-4 w-4 shrink-0" />
              {!isCollapsed && "User"}
            </button>

            <button
              onClick={signOut}
              className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-slate-200 transition hover:bg-white/10"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              {!isCollapsed && "Sign out"}
            </button>

            {!isCollapsed && (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2 py-2">
                <UserAvatar username={user?.username ?? "User"} avatarDataUrl={user?.avatarDataUrl} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-white">{user?.username ?? "User"}</p>
                  <p className="truncate text-[11px] text-slate-400">
                    {user?.githubLinked ? "GitHub linked" : "Workspace member"}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      <button
        type="button"
        onClick={() => setIsMobileSidebarOpen(true)}
        className="fixed left-3 top-3 z-20 rounded-lg border border-white/10 bg-[#171819] p-2 text-slate-300 hover:bg-white/10 hover:text-white lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-4 w-4" />
      </button>

      <div className={`min-h-screen transition-[margin] duration-200 ${isCollapsed ? "lg:ml-[86px]" : "lg:ml-[250px]"}`}>
        <div className="fixed right-3 top-3 z-20" ref={notificationMenuRef}>
          <button
            type="button"
            onClick={() => setIsNotificationOpen((previous) => !previous)}
            className="relative grid h-9 w-9 place-content-center rounded-lg border border-white/10 bg-[#171819] text-slate-300 transition hover:bg-white/10 hover:text-white"
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
                        notification.read ? "border-white/5 bg-white/[0.02]" : "border-primary/30 bg-primary/10"
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

        <main className="px-3 pb-4 pt-14 md:px-4 lg:px-6 lg:pt-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
