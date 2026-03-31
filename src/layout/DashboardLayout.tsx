import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  PlusCircle,
  History,
  BarChart3,
  Settings,
  Puzzle,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Bell,
  User,
  Activity,
  Menu,
  X,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/', end: true },
  { icon: PlusCircle, label: 'New Test', path: '/new-test' },
  { icon: History, label: 'Test History', path: '/history' },
  { icon: BarChart3, label: 'Reports', path: '/reports' },
  { icon: Puzzle, label: 'Integrations', path: '/integrations' },
  { icon: Settings, label: 'Settings', path: '/settings' },
];

export const DashboardLayout = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [location.pathname]);

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
        className={`glass-panel fixed inset-y-3 left-3 z-40 flex w-[272px] flex-col overflow-hidden rounded-2xl transition-transform duration-300 lg:translate-x-0 ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-[115%]'
          } ${isCollapsed ? 'lg:w-[92px]' : 'lg:w-[272px]'}`}
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
              end={item.end}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-2xl px-3 py-3 transition-all duration-200 ${isActive
                  ? 'neon-border bg-primary/20 text-primary'
                  : 'text-slate-400 hover:bg-white/[0.07] hover:text-white'
                }`
              }
            >
              <item.icon className="h-5 w-5 min-w-[20px]" />
              {!isCollapsed ? (
                <span className="font-medium">
                  {item.label}
                </span>
              ) : (
                <span className="sr-only">{item.label}</span>
              )}
            </NavLink>
          ))}
        </nav>

        {!isCollapsed && (
          <div className="mx-3 mb-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Live Cluster</p>
            <p className="mt-2 text-sm font-semibold">us-east-1</p>
            <p className="mt-2 text-xs text-muted">17 tests running across 4 regions</p>
          </div>
        )}
      </aside>

      <div className={`flex min-h-screen flex-col transition-[margin] duration-300 ${isCollapsed ? 'lg:ml-[92px]' : 'lg:ml-[272px]'}`}>
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
              <h2 className="text-lg font-semibold tracking-tight">Performance Workspace</h2>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search tests, reports, traces..."
                className="h-11 w-[290px] rounded-2xl border border-white/[0.12] bg-white/5 py-2 pl-10 pr-4 text-sm text-slate-100 outline-none transition focus:border-primary/60"
              />
            </div>

            <button className="relative grid h-10 w-10 place-content-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white">
              <Bell size={20} />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary shadow-[0_0_10px_rgba(59,130,246,0.8)]" />
            </button>

            <button className="hidden h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-slate-200 transition hover:bg-white/10 md:flex">
              <Sparkles className="h-4 w-4 text-secondary-teal" />
              AI Insights
            </button>

            <div className="h-8 w-px bg-white/10" />

            <div className="flex items-center gap-2 md:gap-3">
              <div className="grid h-9 w-9 place-content-center rounded-xl bg-gradient-to-br from-primary via-secondary-purple to-secondary-teal">
                <User size={20} className="text-white" />
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-semibold">Dev Engineer</p>
                <p className="text-xs text-muted">Pro Plan</p>
              </div>
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
