import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { KpiCard } from "../components/KpiCard";
import { Users, Timer, AlertCircle, BarChart3, Activity, Radar, CheckCircle2, ListChecks, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { EmptyState } from "../components/EmptyState";
import { useNavigate } from "react-router-dom";
import { fetchDashboardOverview, socketUrl, type DashboardOverview } from "../lib/api";
import { useProjects } from "../context/useProjects";

const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});

const fallbackOverview: DashboardOverview = {
  source: "empty",
  currentRun: null,
  kpis: {
    totalRequests: 0,
    avgResponseTimeMs: 0,
    errorRatePct: 0,
    throughputRps: 0,
  },
  responseTimeData: [],
  rpsData: [],
  statusData: [
    { name: "200 OK", value: 0, color: "#3B82F6" },
    { name: "4xx Client", value: 0, color: "#8B5CF6" },
    { name: "5xx Server", value: 0, color: "#F43F5E" },
  ],
  activeRunCount: 0,
  runningTests: [],
  recentRuns: [],
};

type LiveSnapshot = Omit<DashboardOverview, "recentRuns"> & { projectId: string };

const getHealthMessage = (overview: DashboardOverview) => {
  const latency = overview.kpis.avgResponseTimeMs;
  const errorRate = overview.kpis.errorRatePct;

  if (errorRate > 3 || latency > 2500) {
    return {
      title: "Needs Attention",
      description: "Visitors may notice slow pages or errors. Consider reducing load or checking server resources.",
      tone: "text-rose-300",
    };
  }
  if (errorRate > 1 || latency > 1200) {
    return {
      title: "Moderate Pressure",
      description: "Your site is working, but response speed is getting higher than ideal under load.",
      tone: "text-amber-300",
    };
  }
  return {
    title: "Healthy",
    description: "Performance looks stable for this project in the current test window.",
    tone: "text-emerald-300",
  };
};

export const DashboardPage = () => {
  const navigate = useNavigate();
  const { selectedProject } = useProjects();
  const [overview, setOverview] = useState<DashboardOverview>(fallbackOverview);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshTimeoutRef = useRef<number | null>(null);

  const loadOverview = useCallback(async () => {
    if (!selectedProject) {
      setIsLoading(false);
      return;
    }

    try {
      const data = await fetchDashboardOverview(selectedProject.id);
      setOverview(data);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load dashboard data.");
    } finally {
      setIsLoading(false);
    }
  }, [selectedProject]);

  useEffect(() => {
    setIsLoading(true);
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (!selectedProject) {
      return;
    }

    const socket = io(socketUrl, {
      transports: ["websocket", "polling"],
    });

    const scheduleRefresh = () => {
      if (refreshTimeoutRef.current !== null) {
        return;
      }
      refreshTimeoutRef.current = window.setTimeout(() => {
        refreshTimeoutRef.current = null;
        void loadOverview();
      }, 300);
    };

    socket.on("live:init", (payload: { activeRuns?: LiveSnapshot[] }) => {
      const projectHasActiveRun = (payload?.activeRuns ?? []).some((item) => item.projectId === selectedProject.id);
      if (!projectHasActiveRun) {
        return;
      }
      scheduleRefresh();
    });

    socket.on("test:live:update", (snapshot: LiveSnapshot) => {
      if (snapshot.projectId !== selectedProject.id) {
        return;
      }
      scheduleRefresh();
    });

    socket.on("test:run:completed", (eventPayload: { projectId?: string }) => {
      if (eventPayload?.projectId && eventPayload.projectId !== selectedProject.id) {
        return;
      }
      scheduleRefresh();
    });

    return () => {
      if (refreshTimeoutRef.current !== null) {
        window.clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
      socket.close();
    };
  }, [loadOverview, selectedProject]);

  const kpis = useMemo(
    () => ({
      totalRequests: compactFormatter.format(overview.kpis.totalRequests),
      avgResponseTime: `${Math.round(overview.kpis.avgResponseTimeMs)}ms`,
      errorRate: `${overview.kpis.errorRatePct.toFixed(2)}%`,
      throughput: compactFormatter.format(overview.kpis.throughputRps),
      activeRuns: overview.activeRunCount,
    }),
    [overview],
  );

  const visibleStatusData = useMemo(() => {
    const filtered = overview.statusData.filter((item) => item.value > 0.01);
    if (filtered.length > 0) {
      return filtered;
    }
    return [{ name: "No Data", value: 100, color: "#334155" }];
  }, [overview.statusData]);

  const successPercentage = useMemo(
    () => overview.statusData.find((item) => item.name === "200 OK")?.value ?? 0,
    [overview.statusData],
  );

  const insight = getHealthMessage(overview);
  const isLive = overview.source === "live";

  if (!selectedProject) {
    return (
      <EmptyState
        icon={Radar}
        title="Create a project first"
        description="Add your website URL in Projects to unlock dashboard insights."
        actionText="Go To Projects"
        onAction={() => navigate("/projects")}
      />
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          <Activity className="h-3.5 w-3.5" />
          {isLive ? "Project Summary + Live Tests" : "Project Summary"}
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">{selectedProject.name} Dashboard</h1>
        <p className="text-sm text-muted md:text-base">
          Easy-to-read performance summary for {selectedProject.baseUrl}
          {overview.currentRun ? ` • ${overview.currentRun.name}` : ""}.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      )}

      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
        <span className={`font-semibold ${insight.tone}`}>{insight.title}:</span> {insight.description}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">Running Tests (Click to View Details)</h2>
        {overview.runningTests.length === 0 ? (
          <div className="glass-panel rounded-2xl border border-white/10 p-4 text-sm text-slate-400">No active tests right now for this project.</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {overview.runningTests.map((test) => (
              <button
                key={test.id}
                onClick={() => navigate(`/tests/${test.id}`)}
                className="glass-panel rounded-2xl border border-primary/30 bg-primary/10 p-4 text-left transition hover:border-primary/50 hover:bg-primary/15"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-white">{test.name}</p>
                    <p className="text-xs text-slate-300">Requests: {test.totalRequests}</p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-primary" />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-200">
                  <div className="rounded-lg bg-white/[0.04] px-2 py-1">Avg: {Math.round(test.avgResponseTimeMs)}ms</div>
                  <div className="rounded-lg bg-white/[0.04] px-2 py-1">Err: {test.errorRatePct.toFixed(2)}%</div>
                  <div className="rounded-lg bg-white/[0.04] px-2 py-1">RPS: {test.throughputRps.toFixed(1)}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="glass-panel rounded-2xl p-6">
                <LoadingSkeleton className="mb-3 h-4 w-1/2 rounded-lg" />
                <LoadingSkeleton className="mb-4 h-9 w-3/4 rounded-lg" />
                <LoadingSkeleton className="h-2 w-full rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
            <KpiCard title="Visitors Served" value={kpis.totalRequests} trendUp={true} icon={Users} subtitle="Total requests handled" />
            <KpiCard
              title="Average Wait Time"
              value={kpis.avgResponseTime}
              trendUp={false}
              icon={Timer}
              color="text-secondary-purple"
              subtitle="Lower is better"
            />
            <KpiCard title="Failed Visits" value={kpis.errorRate} trendUp={false} icon={AlertCircle} color="text-rose-500" subtitle="Error percentage" />
            <KpiCard
              title="Traffic Every Second"
              value={kpis.throughput}
              trendUp={true}
              icon={BarChart3}
              color="text-secondary-teal"
              subtitle="Requests per second"
            />
            <KpiCard title="Live Tests" value={kpis.activeRuns} trendUp={true} icon={Activity} subtitle="Currently running for this project" />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="premium-card h-[390px] p-6 xl:col-span-2"
            >
              <div className="mb-6">
                <h3 className="text-lg font-bold text-white tracking-tight">Wait Time During Test</h3>
                <p className="text-xs font-medium text-muted/60 mt-1 uppercase tracking-wider">Latency Trend (ms)</p>
              </div>
              <ResponsiveContainer width="100%" height="80%">
                <AreaChart data={overview.responseTimeData}>
                  <defs>
                    <linearGradient id="colorMs" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsla(210, 40%, 98%, 0.05)" vertical={false} />
                  <XAxis
                    dataKey="time"
                    stroke="hsla(210, 40%, 98%, 0.4)"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fontWeight: 600 }}
                    dy={10}
                  />
                  <YAxis
                    stroke="hsla(210, 40%, 98%, 0.4)"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fontWeight: 600 }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="glass-panel border-white/10 px-3 py-2 rounded-xl shadow-2xl">
                            <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1">{payload[0].payload.time}</p>
                            <p className="text-sm font-black text-white">{payload[0].value} <span className="text-[10px] text-muted">ms</span></p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="ms"
                    stroke="hsl(217, 91%, 60%)"
                    fillOpacity={1}
                    fill="url(#colorMs)"
                    strokeWidth={3}
                    animationDuration={1500}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="premium-card flex min-h-[390px] flex-col p-6"
            >
              <div className="mb-6">
                <h3 className="text-lg font-bold text-white tracking-tight">Response Quality</h3>
                <p className="text-xs font-medium text-muted/60 mt-1 uppercase tracking-wider">Requests Status Distribution</p>
              </div>

              <div className="relative mx-auto flex items-center justify-center h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    {/* Background Track */}
                    <Pie
                      data={[{ value: 100 }]}
                      cx="50%" cy="50%"
                      innerRadius={68} outerRadius={82}
                      dataKey="value"
                      fill="hsla(210, 40%, 98%, 0.03)"
                      stroke="none"
                      isAnimationActive={false}
                    />
                    <Pie
                      data={visibleStatusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={68}
                      outerRadius={82}
                      paddingAngle={4}
                      dataKey="value"
                      stroke="none"
                      cornerRadius={6}
                    >
                      {visibleStatusData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color}
                          className="hover:opacity-80 transition-opacity outline-none"
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="glass-panel border-white/10 px-3 py-2 rounded-xl shadow-2xl">
                              <p className="text-[10px] font-bold text-muted uppercase tracking-widest">{payload[0].name}</p>
                              <p className="text-sm font-black text-white">{payload[0].value}%</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <motion.span
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.3, type: "spring" }}
                    className="text-4xl font-black text-white tracking-tighter"
                  >
                    {successPercentage.toFixed(0)}%
                  </motion.span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-success/80 neon-glow mt-1">Success</span>
                </div>
              </div>

              <div className="mt-8 space-y-2.5">
                {overview.statusData.map((statusItem, idx) => (
                  <motion.div
                    key={statusItem.name}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + (idx * 0.1) }}
                    className="group/item flex items-center justify-between rounded-2xl bg-white/[0.03] border border-white/[0.02] px-4 py-3 hover:bg-white/[0.06] hover:border-white/10 transition-all cursor-default"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusItem.color }} />
                        <div className="absolute inset-0 rounded-full blur-[4px] opacity-50" style={{ backgroundColor: statusItem.color }} />
                      </div>
                      <span className="text-xs font-semibold text-muted group-hover/item:text-white transition-colors uppercase tracking-wider">{statusItem.name}</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm font-black text-white">{statusItem.value}</span>
                      <span className="text-[10px] font-bold text-muted/40">%</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="premium-card h-[300px] p-6 xl:col-span-3"
            >
              <div className="mb-6">
                <h3 className="text-lg font-bold text-white tracking-tight">Traffic Handled Per Second</h3>
                <p className="text-xs font-medium text-muted/60 mt-1 uppercase tracking-wider">Throughput (RPS)</p>
              </div>
              <ResponsiveContainer width="100%" height="75%">
                <BarChart data={overview.rpsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsla(210, 40%, 98%, 0.05)" vertical={false} />
                  <XAxis
                    dataKey="time"
                    stroke="hsla(210, 40%, 98%, 0.4)"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fontWeight: 600 }}
                  />
                  <YAxis
                    stroke="hsla(210, 40%, 98%, 0.4)"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fontWeight: 600 }}
                  />
                  <Tooltip
                    cursor={{ fill: "hsla(210, 40%, 98%, 0.05)", radius: 8 }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="glass-panel border-white/10 px-3 py-2 rounded-xl shadow-2xl">
                            <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1">{payload[0].payload.time}</p>
                            <p className="text-sm font-black text-white">{payload[0].value} <span className="text-[10px] text-muted">rps</span></p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="rps" fill="hsl(258, 89%, 66%)" radius={[6, 6, 0, 0]} barSize={28} animationDuration={1500} />
                </BarChart>
              </ResponsiveContainer>
            </motion.section>
          </div>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div className="glass-panel rounded-2xl p-6">
              <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-white">
                <ListChecks className="h-5 w-5 text-secondary-teal" />
                What This Means
              </h3>
              <ul className="space-y-3 text-sm text-slate-300">
                <li>
                  <span className="font-semibold text-white">Average wait time:</span> Keep this under 1200ms for a smooth user experience.
                </li>
                <li>
                  <span className="font-semibold text-white">Failed visits:</span> Aim to stay under 1%. Above this, users may see errors.
                </li>
                <li>
                  <span className="font-semibold text-white">Traffic per second:</span> Higher is better only if wait time and failure stay low.
                </li>
              </ul>
            </div>

            <div className="glass-panel rounded-2xl p-6">
              <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-white">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                Dashboard History (Click For Details)
              </h3>
              <div className="space-y-2 text-sm">
                {overview.recentRuns.length === 0 && <p className="text-slate-400">No tests yet for this project.</p>}
                {overview.recentRuns.slice(0, 5).map((run) => (
                  <button
                    key={run.id}
                    onClick={() => navigate(`/tests/${run.id}`)}
                    className="w-full rounded-xl bg-white/[0.04] px-3 py-2 text-left text-slate-300 transition hover:bg-white/[0.08]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{run.name}</p>
                        <p className="text-xs text-slate-400">
                          {run.status.toUpperCase()} • {run.vus} virtual users • {run.duration}
                        </p>
                      </div>
                      <ExternalLink className="h-4 w-4 text-slate-400" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

