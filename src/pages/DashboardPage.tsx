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
import { Users, Timer, AlertCircle, BarChart3, Activity, Radar, CheckCircle2, ListChecks } from "lucide-react";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
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

    socket.on("live:init", (payload: { activeRuns?: LiveSnapshot[] }) => {
      const projectSnapshots = (payload?.activeRuns ?? []).filter((item) => item.projectId === selectedProject.id);
      const first = projectSnapshots[0];
      if (!first) {
        return;
      }

      setOverview((previousState) => ({
        ...previousState,
        ...first,
      }));
      setIsLoading(false);
    });

    socket.on("test:live:update", (snapshot: LiveSnapshot) => {
      if (snapshot.projectId !== selectedProject.id) {
        return;
      }
      setOverview((previousState) => ({
        ...previousState,
        ...snapshot,
      }));
      setIsLoading(false);
    });

    socket.on("test:run:completed", (eventPayload: { projectId?: string }) => {
      if (eventPayload?.projectId && eventPayload.projectId !== selectedProject.id) {
        return;
      }
      void loadOverview();
    });

    return () => {
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
          {isLive ? "Live Test Running" : "Latest Test Summary"}
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
            <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel h-[390px] rounded-2xl p-6 xl:col-span-2">
              <h3 className="mb-1 text-lg font-bold text-white">Wait Time During Test</h3>
              <p className="mb-5 text-sm text-muted">How quickly pages or APIs responded over time.</p>
              <ResponsiveContainer width="100%" height="84%">
                <AreaChart data={overview.responseTimeData}>
                  <defs>
                    <linearGradient id="colorMs" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.34} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="time" stroke="#8aa0c3" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} dy={8} />
                  <YAxis stroke="#8aa0c3" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0a1020", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "12px" }}
                    itemStyle={{ color: "#e8f0ff", fontSize: "12px" }}
                  />
                  <Area type="monotone" dataKey="ms" stroke="#3B82F6" fillOpacity={1} fill="url(#colorMs)" strokeWidth={2.8} />
                </AreaChart>
              </ResponsiveContainer>
            </motion.section>

            <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-panel flex h-[390px] flex-col rounded-2xl p-6">
              <h3 className="mb-1 text-lg font-bold text-white">Response Quality</h3>
              <p className="mb-4 text-sm text-muted">Share of successful vs failed responses.</p>

              <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={overview.statusData} cx="50%" cy="50%" innerRadius={58} outerRadius={88} paddingAngle={4} dataKey="value">
                      {overview.statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0a1020", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "12px" }}
                      itemStyle={{ color: "#e8f0ff", fontSize: "12px" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-2 space-y-2.5">
                {overview.statusData.map((statusItem) => (
                  <div key={statusItem.name} className="flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusItem.color }} />
                      <span className="text-xs font-medium text-slate-300">{statusItem.name}</span>
                    </div>
                    <span className="text-sm font-bold text-slate-100">{statusItem.value}%</span>
                  </div>
                ))}
              </div>
            </motion.section>

            <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-panel h-[300px] rounded-2xl p-6 xl:col-span-3">
              <h3 className="mb-1 text-lg font-bold text-white">Traffic Handled Per Second</h3>
              <p className="mb-5 text-sm text-muted">How much load your system handled each second.</p>
              <ResponsiveContainer width="100%" height="78%">
                <BarChart data={overview.rpsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="time" stroke="#8aa0c3" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                  <YAxis stroke="#8aa0c3" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.05)" }}
                    contentStyle={{ backgroundColor: "#0a1020", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "12px" }}
                    itemStyle={{ color: "#e8f0ff", fontSize: "12px" }}
                  />
                  <Bar dataKey="rps" fill="#8B5CF6" radius={[8, 8, 0, 0]} barSize={34} />
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
                Recent Activity
              </h3>
              <div className="space-y-2 text-sm">
                {overview.recentRuns.length === 0 && <p className="text-slate-400">No tests yet for this project.</p>}
                {overview.recentRuns.slice(0, 5).map((run) => (
                  <div key={run.id} className="rounded-xl bg-white/[0.04] px-3 py-2 text-slate-300">
                    <p className="font-semibold text-white">{run.name}</p>
                    <p className="text-xs text-slate-400">
                      {run.status.toUpperCase()} • {run.vus} virtual users • {run.duration}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

