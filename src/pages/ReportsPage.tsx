import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { FileText, Download, Share2, ExternalLink, ChevronRight, TrendingDown, Activity, Cpu, Network, Radar } from "lucide-react";
import { useProjects } from "../context/useProjects";
import { EmptyState } from "../components/EmptyState";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { fetchTestHistory, fetchTestRun, getAuthToken, socketUrl, type TestRunDetail } from "../lib/api";
import { io } from "socket.io-client";

type PercentilePoint = {
  time: string;
  p50: number;
  p95: number;
  p99: number;
};

type BarPoint = {
  height: number;
  opacity: number;
};

type AnomalyItem = {
  time: string;
  msg: string;
  type: "Info" | "Warning" | "Alert";
};

const BAR_COUNT = 40;

const toLocalTimeLabel = (iso: string | null | undefined) => {
  if (!iso) {
    return "N/A";
  }
  const date = new Date(iso);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

const toRounded = (value: number, digits = 2) => {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
};

const createBarsFromSeries = (values: number[], count: number): BarPoint[] => {
  if (values.length === 0) {
    return Array.from({ length: count }, () => ({ height: 8, opacity: 0.25 }));
  }

  const maxValue = Math.max(...values, 1);
  return Array.from({ length: count }, (_, index) => {
    const ratio = count > 1 ? index / (count - 1) : 0;
    const sourceIndex = Math.min(values.length - 1, Math.max(0, Math.floor(ratio * (values.length - 1))));
    const sourceValue = values[sourceIndex];
    const normalized = (sourceValue / maxValue) * 100;

    return {
      height: Math.max(6, normalized),
      opacity: toRounded(Math.min(1, 0.22 + normalized / 130), 2),
    };
  });
};

const buildPercentilePoint = (run: TestRunDetail, index: number): PercentilePoint => {
  const avg = run.finalMetrics?.avgLatencyMs ?? run.liveMetrics?.avgLatencyMs ?? 0;
  const p95 = run.finalMetrics?.p95LatencyMs ?? avg * 1.35;
  const p99 = run.finalMetrics?.p99LatencyMs ?? avg * 1.65;
  return {
    time: `R${index + 1}`,
    p50: toRounded(avg),
    p95: toRounded(p95),
    p99: toRounded(p99),
  };
};

const buildAnomalies = (latestRun: TestRunDetail | null, runningCount: number): AnomalyItem[] => {
  const anomalies: AnomalyItem[] = [];
  if (!latestRun) {
    return anomalies;
  }

  const avg = latestRun.finalMetrics?.avgLatencyMs ?? latestRun.liveMetrics?.avgLatencyMs ?? 0;
  const p99 = latestRun.finalMetrics?.p99LatencyMs ?? avg * 1.65;
  const errorRate = latestRun.finalMetrics?.errorRatePct ?? latestRun.liveMetrics?.errorRatePct ?? 0;

  if (p99 > 3000) {
    anomalies.push({
      time: toLocalTimeLabel(latestRun.endedAt ?? latestRun.createdAt),
      msg: `p99 latency is high (${Math.round(p99)}ms).`,
      type: "Warning",
    });
  }

  if (errorRate > 1) {
    anomalies.push({
      time: toLocalTimeLabel(latestRun.endedAt ?? latestRun.createdAt),
      msg: `Error rate increased to ${errorRate.toFixed(2)}%.`,
      type: "Alert",
    });
  }

  if (runningCount > 0) {
    anomalies.push({
      time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
      msg: `${runningCount} test(s) still running for this project.`,
      type: "Info",
    });
  }

  if (anomalies.length === 0) {
    anomalies.push({
      time: toLocalTimeLabel(latestRun.endedAt ?? latestRun.createdAt),
      msg: "No major anomalies detected in the latest report window.",
      type: "Info",
    });
  }

  return anomalies;
};

export const ReportsPage = () => {
  const { selectedProject } = useProjects();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [latestRun, setLatestRun] = useState<TestRunDetail | null>(null);
  const [previousRun, setPreviousRun] = useState<TestRunDetail | null>(null);
  const [percentiles, setPercentiles] = useState<PercentilePoint[]>([]);
  const [cpuBars, setCpuBars] = useState<BarPoint[]>(Array.from({ length: BAR_COUNT }, () => ({ height: 8, opacity: 0.25 })));
  const [bandwidthBars, setBandwidthBars] = useState<BarPoint[]>(Array.from({ length: BAR_COUNT }, () => ({ height: 8, opacity: 0.25 })));
  const [runningCount, setRunningCount] = useState(0);
  const pollingRef = useRef<number | null>(null);

  const loadReport = useCallback(async () => {
    if (!selectedProject) {
      setIsLoading(false);
      return;
    }

    try {
      const historyResponse = await fetchTestHistory(selectedProject.id, "");
      const sortedRuns = historyResponse.data;
      const topRuns = sortedRuns.slice(0, 12);
      const topRunIds = topRuns.map((run) => run.id);
      const runDetailsRaw = await Promise.all(
        topRunIds.map(async (id) => {
          try {
            const response = await fetchTestRun(id);
            return response.data;
          } catch {
            return null;
          }
        }),
      );

      const runDetails = runDetailsRaw.filter((run): run is TestRunDetail => Boolean(run));
      const latest = runDetails[0] ?? null;
      const previous = runDetails[1] ?? null;
      const running = sortedRuns.filter((run) => run.status === "running" || run.status === "queued").length;

      setLatestRun(latest);
      setPreviousRun(previous);
      setRunningCount(running);

      const percentileData = runDetails
        .slice(0, 10)
        .map((run, index) => buildPercentilePoint(run, index))
        .reverse();
      setPercentiles(percentileData);

      const latencySeries = (latest?.liveMetrics?.responseTimeSeries ?? []).map((item) => item.value);
      const rpsSeries = (latest?.liveMetrics?.rpsSeries ?? []).map((item) => item.value);
      setCpuBars(createBarsFromSeries(latencySeries, BAR_COUNT));
      setBandwidthBars(createBarsFromSeries(rpsSeries, BAR_COUNT));

      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load report data.");
    } finally {
      setIsLoading(false);
    }
  }, [selectedProject]);

  useEffect(() => {
    setIsLoading(true);
    void loadReport();
  }, [loadReport]);

  useEffect(() => {
    if (!selectedProject) {
      return;
    }
    const token = getAuthToken();
    if (!token) {
      return;
    }

    pollingRef.current = window.setInterval(() => {
      void loadReport();
    }, 5000);

    const socket = io(socketUrl, {
      transports: ["websocket", "polling"],
      auth: {
        token: `Bearer ${token}`,
      },
    });
    socket.on("test:run:completed", (eventPayload: { projectId?: string }) => {
      if (!eventPayload?.projectId || eventPayload.projectId === selectedProject.id) {
        void loadReport();
      }
    });

    return () => {
      if (pollingRef.current !== null) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      socket.close();
    };
  }, [loadReport, selectedProject]);

  const improvementScore = useMemo(() => {
    if (!latestRun || !previousRun) {
      return 0;
    }

    const latestAvg = latestRun.finalMetrics?.avgLatencyMs ?? latestRun.liveMetrics?.avgLatencyMs ?? 0;
    const previousAvg = previousRun.finalMetrics?.avgLatencyMs ?? previousRun.liveMetrics?.avgLatencyMs ?? 0;

    if (previousAvg <= 0) {
      return 0;
    }
    return toRounded(((previousAvg - latestAvg) / previousAvg) * 100, 1);
  }, [latestRun, previousRun]);

  const anomalies = useMemo(() => buildAnomalies(latestRun, runningCount), [latestRun, runningCount]);

  const statusLabel = useMemo(() => {
    if (!latestRun) {
      return { text: "No Run Yet", color: "text-slate-400" };
    }
    if (latestRun.status === "success") {
      return { text: "Verified Stable", color: "text-emerald-500" };
    }
    if (latestRun.status === "running" || latestRun.status === "queued") {
      return { text: "Live In Progress", color: "text-primary" };
    }
    return { text: "Needs Review", color: "text-rose-400" };
  }, [latestRun]);

  if (!selectedProject) {
    return (
      <EmptyState
        icon={Radar}
        title="Create a project first"
        description="Reports are generated from real tests inside a project."
      />
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6 pb-12">
        <LoadingSkeleton className="h-24 rounded-2xl" />
        <LoadingSkeleton className="h-[420px] rounded-2xl" />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <LoadingSkeleton className="h-[220px] rounded-2xl" />
          <LoadingSkeleton className="h-[220px] rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl glass flex items-center justify-center text-primary neon-border">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Full Analytical Report</h1>
            <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
              <span>{selectedProject.name}</span>
              <div className="w-1 h-1 rounded-full bg-slate-700" />
              <span>{latestRun ? new Date(latestRun.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "No date"}</span>
              <div className="w-1 h-1 rounded-full bg-slate-700" />
              <span className={`${statusLabel.color} font-medium`}>{statusLabel.text}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <button className="glass px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-white/5 transition-colors flex items-center gap-2">
            <Share2 className="w-4 h-4" /> Share
          </button>
          <button className="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-primary/20">
            <Download className="w-4 h-4" /> Download PDF Report
          </button>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

      {!latestRun ? (
        <EmptyState
          icon={FileText}
          title="No report data yet"
          description="Run at least one test to generate a live report for this project."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3 space-y-6">
            <div className="premium-card p-8 h-[450px]">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-xl font-bold text-white tracking-tight">Latency Percentiles (p50, p95, p99)</h3>
                  <p className="text-xs font-medium text-muted/60 mt-1 uppercase tracking-wider">Real Runs Comparison (latest 10)</p>
                </div>
                <div className="flex gap-4">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted">
                    <div className="w-2.5 h-2.5 rounded-full bg-primary" /> p50
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted">
                    <div className="w-2.5 h-2.5 rounded-full bg-secondary-purple" /> p95
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted">
                    <div className="w-2.5 h-2.5 rounded-full bg-secondary-teal" /> p99
                  </div>
                </div>
              </div>

              <ResponsiveContainer width="100%" height="80%">
                <AreaChart data={percentiles}>
                  <defs>
                    <linearGradient id="colorP50" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsla(210, 40%, 98%, 0.05)" vertical={false} />
                  <XAxis dataKey="time" stroke="hsla(210, 40%, 98%, 0.4)" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                  <YAxis stroke="hsla(210, 40%, 98%, 0.4)" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} unit="ms" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0a1020", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "12px" }}
                    itemStyle={{ color: "#e8f0ff", fontSize: "12px" }}
                  />
                  <Area type="monotone" dataKey="p99" stroke="hsl(171, 77%, 48%)" fill="transparent" strokeWidth={2} />
                  <Area type="monotone" dataKey="p95" stroke="hsl(258, 89%, 66%)" fill="transparent" strokeWidth={2} />
                  <Area type="monotone" dataKey="p50" stroke="hsl(217, 91%, 60%)" fill="url(#colorP50)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="premium-card p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <Cpu className="w-5 h-5 text-secondary-purple" />
                    <h3 className="font-bold text-white">Latency Intensity</h3>
                  </div>
                  <span className="text-[10px] font-black text-secondary-purple bg-secondary-purple/10 px-2 py-1 rounded-md uppercase tracking-wider">
                    {Math.round(latestRun.finalMetrics?.p99LatencyMs ?? latestRun.liveMetrics?.avgLatencyMs ?? 0)}ms peak
                  </span>
                </div>
                <div className="h-32 bg-white/[0.02] rounded-2xl flex items-end gap-1.5 p-4 border border-white/[0.01]">
                  {cpuBars.map((bar, index) => (
                    <div key={index} className="flex-1 bg-secondary-purple hover:bg-secondary-purple/80 transition-all rounded-t-sm" style={{ height: `${bar.height}%`, opacity: bar.opacity }} />
                  ))}
                </div>
              </div>

              <div className="premium-card p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <Network className="w-5 h-5 text-secondary-teal" />
                    <h3 className="font-bold text-white">Bandwidth / Throughput</h3>
                  </div>
                  <span className="text-[10px] font-black text-secondary-teal bg-secondary-teal/10 px-2 py-1 rounded-md uppercase tracking-wider">
                    {(latestRun.finalMetrics?.throughputRps ?? latestRun.liveMetrics?.throughputRps ?? 0).toFixed(2)} rps
                  </span>
                </div>
                <div className="h-32 bg-white/[0.02] rounded-2xl flex items-end gap-1.5 p-4 border border-white/[0.01]">
                  {bandwidthBars.map((bar, index) => (
                    <div key={index} className="flex-1 bg-secondary-teal hover:bg-secondary-teal/80 transition-all rounded-t-sm" style={{ height: `${bar.height}%`, opacity: bar.opacity }} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="premium-card p-6 border-l-4 border-l-success">
              <h4 className="text-[10px] font-black text-muted/60 mb-4 flex items-center gap-2 uppercase tracking-widest">
                <TrendingDown className="w-3.5 h-3.5 text-success" /> Score
              </h4>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black text-white tracking-tighter">{improvementScore >= 0 ? "+" : ""}{improvementScore}%</span>
                <span className="text-[10px] text-success font-black uppercase tracking-wider pb-1">vs Previous Run</span>
              </div>
              <p className="text-xs text-muted/80 mt-4 leading-relaxed font-medium">
                {improvementScore >= 0
                  ? "Average latency improved compared to the previous run."
                  : "Average latency regressed compared to the previous run."}
              </p>
            </div>

            <div className="premium-card p-6">
              <h4 className="text-[10px] font-black text-muted/60 mb-6 flex items-center gap-2 uppercase tracking-widest">
                <Activity className="w-3.5 h-3.5 text-primary" /> Anomalies
              </h4>
              <div className="space-y-3">
                {anomalies.map((item, index) => (
                  <div key={`${item.time}-${index}`} className="flex gap-3 p-2.5 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="text-[9px] font-black text-muted/40 mt-1 uppercase tracking-tighter">{item.time}</div>
                    <div className="text-xs text-muted/80 font-medium">{item.msg}</div>
                  </div>
                ))}
              </div>
              <button className="w-full mt-6 py-2.5 text-xs font-black text-primary flex items-center justify-center gap-1 hover:underline transition-all uppercase tracking-widest">
                View Full Logs <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            <div className="premium-card p-6">
              <h3 className="text-lg font-bold text-white">Automate this report</h3>
              <p className="mt-2 text-sm text-slate-400">Schedule performance runs and get PDF reports in Slack.</p>
              <button className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08]">
                Set Schedule <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
