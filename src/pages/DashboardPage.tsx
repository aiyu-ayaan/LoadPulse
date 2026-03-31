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
import {
  Zap,
  Clock,
  AlertCircle,
  BarChart3,
  Download,
  Filter,
  Calendar,
  Activity,
} from "lucide-react";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { fetchDashboardOverview, socketUrl, type DashboardOverview } from "../lib/api";

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
  recentRuns: [],
};

export const DashboardPage = () => {
  const [overview, setOverview] = useState<DashboardOverview>(fallbackOverview);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      const data = await fetchDashboardOverview();
      setOverview(data);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load dashboard data.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    const socket = io(socketUrl, {
      transports: ["websocket", "polling"],
    });

    socket.on("live:init", (payload: { activeRuns?: Array<Omit<DashboardOverview, "recentRuns">> }) => {
      const firstActiveRun = payload?.activeRuns?.[0];
      if (!firstActiveRun) {
        return;
      }

      setOverview((previousState) => ({
        ...previousState,
        ...firstActiveRun,
      }));
      setIsLoading(false);
    });

    socket.on("test:live:update", (snapshot: Omit<DashboardOverview, "recentRuns">) => {
      setOverview((previousState) => ({
        ...previousState,
        ...snapshot,
      }));
      setIsLoading(false);
    });

    socket.on("test:run:completed", () => {
      void loadOverview();
    });

    return () => {
      socket.close();
    };
  }, [loadOverview]);

  const kpis = useMemo(
    () => ({
      totalRequests: compactFormatter.format(overview.kpis.totalRequests),
      avgResponseTime: `${Math.round(overview.kpis.avgResponseTimeMs)}ms`,
      errorRate: `${overview.kpis.errorRatePct.toFixed(2)}%`,
      throughput: compactFormatter.format(overview.kpis.throughputRps),
    }),
    [overview.kpis],
  );

  const isLive = overview.source === "live";

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            <Activity className="h-3.5 w-3.5" />
            {isLive ? "Live Test Running" : "Monitoring"}
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">Performance Overview</h1>
          <p className="text-sm text-muted md:text-base">
            {overview.currentRun
              ? `Current run: ${overview.currentRun.name}`
              : "Run a new k6 test to stream latency, throughput, and reliability metrics here."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 sm:gap-3">
          <button className="glass-panel flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition hover:bg-white/10">
            <Filter className="w-4 h-4" /> Filter
          </button>

          <button className="glass-panel flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition hover:bg-white/10">
            <Calendar className="w-4 h-4" /> Latest Run
          </button>

          <button className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition hover:bg-primary/90 active:scale-[0.98]">
            <Download className="w-4 h-4" /> Export Report
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      )}

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="glass-panel rounded-2xl p-6">
                <LoadingSkeleton className="mb-3 h-4 w-1/2 rounded-lg" />
                <LoadingSkeleton className="mb-4 h-9 w-3/4 rounded-lg" />
                <LoadingSkeleton className="h-2 w-full rounded-full" />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <LoadingSkeleton className="h-[360px] rounded-2xl lg:col-span-2" />
            <LoadingSkeleton className="h-[360px] rounded-2xl" />
            <LoadingSkeleton className="h-[280px] rounded-2xl lg:col-span-3" />
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="Total Requests"
              value={kpis.totalRequests}
              trendUp={true}
              icon={Zap}
              subtitle="Requests captured from the latest run"
            />
            <KpiCard
              title="Avg Response Time"
              value={kpis.avgResponseTime}
              trendUp={true}
              icon={Clock}
              color="text-secondary-purple"
              subtitle="Average latency in milliseconds"
            />
            <KpiCard
              title="Error Rate"
              value={kpis.errorRate}
              trendUp={false}
              icon={AlertCircle}
              color="text-rose-500"
              subtitle="Failed requests percentage"
            />
            <KpiCard
              title="Throughput (RPS)"
              value={kpis.throughput}
              trendUp={true}
              icon={BarChart3}
              color="text-secondary-teal"
              subtitle="Average requests processed per second"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-panel card-hover h-[390px] rounded-2xl p-6 lg:col-span-2"
            >
              <h3 className="mb-1 text-lg font-bold text-white">Response Time over Time</h3>
              <p className="mb-5 text-sm text-muted">Real test latency samples from k6 output.</p>
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

            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="glass-panel card-hover flex h-[390px] flex-col rounded-2xl p-6"
            >
              <h3 className="mb-1 text-lg font-bold text-white">Status Codes Distribution</h3>
              <p className="mb-4 text-sm text-muted">Response class distribution from the selected run.</p>

              <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={overview.statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={88}
                      paddingAngle={4}
                      dataKey="value"
                    >
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

            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass-panel card-hover h-[300px] rounded-2xl p-6 lg:col-span-3"
            >
              <h3 className="mb-1 text-lg font-bold text-white">Requests per Second</h3>
              <p className="mb-5 text-sm text-muted">Live throughput captured while your script is executing.</p>
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
        </>
      )}
    </div>
  );
};
