import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Activity,
  ChevronRight,
  Cpu,
  Download,
  ExternalLink,
  FileText,
  Network,
  Radar,
  Share2,
  TrendingDown,
} from "lucide-react";
import { io } from "socket.io-client";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { useProjects } from "../context/useProjects";
import {
  fetchTestHistory,
  fetchTestRun,
  getAuthToken,
  socketUrl,
  type TestHistoryItem,
  type TestRunDetail,
} from "../lib/api";
import { buildProjectSectionPath, buildProjectTestPath } from "../lib/project-routes";

type PercentilePoint = {
  time: string;
  p50: number;
  p95: number;
  p99: number;
  runId: string;
};

type BarPoint = {
  height: number;
  opacity: number;
};

type AnomalyItem = {
  time: string;
  message: string;
  level: "Info" | "Warning" | "Alert";
};

const BAR_COUNT = 40;

const toRounded = (value: number, digits = 2) => {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
};

const toLocalTimeLabel = (iso: string | null | undefined) => {
  if (!iso) {
    return "N/A";
  }

  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

const createBarsFromSeries = (values: number[], count: number): BarPoint[] => {
  if (values.length === 0) {
    return Array.from({ length: count }, () => ({ height: 8, opacity: 0.25 }));
  }

  const maxValue = Math.max(...values, 1);

  return Array.from({ length: count }, (_, index) => {
    const ratio = count > 1 ? index / (count - 1) : 0;
    const sourceIndex = Math.min(values.length - 1, Math.max(0, Math.floor(ratio * (values.length - 1))));
    const normalized = (values[sourceIndex] / maxValue) * 100;

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
    runId: run.id,
  };
};

const buildAnomalies = (run: TestRunDetail | null, runningCount: number): AnomalyItem[] => {
  if (!run) {
    return [];
  }

  const anomalies: AnomalyItem[] = [];
  const avg = run.finalMetrics?.avgLatencyMs ?? run.liveMetrics?.avgLatencyMs ?? 0;
  const p99 = run.finalMetrics?.p99LatencyMs ?? avg * 1.65;
  const errorRate = run.finalMetrics?.errorRatePct ?? run.liveMetrics?.errorRatePct ?? 0;

  if (p99 > 3000) {
    anomalies.push({
      time: toLocalTimeLabel(run.endedAt ?? run.createdAt),
      message: `p99 latency is high at ${Math.round(p99)}ms.`,
      level: "Warning",
    });
  }

  if (errorRate > 1) {
    anomalies.push({
      time: toLocalTimeLabel(run.endedAt ?? run.createdAt),
      message: `Error rate increased to ${errorRate.toFixed(2)}%.`,
      level: "Alert",
    });
  }

  if (runningCount > 0) {
    anomalies.push({
      time: toLocalTimeLabel(new Date().toISOString()),
      message: `${runningCount} test(s) are still active in this project.`,
      level: "Info",
    });
  }

  if (anomalies.length === 0) {
    anomalies.push({
      time: toLocalTimeLabel(run.endedAt ?? run.createdAt),
      message: "No major anomalies detected for the selected run.",
      level: "Info",
    });
  }

  return anomalies;
};

const anomalyTone = (level: AnomalyItem["level"]) => {
  if (level === "Alert") {
    return "border-rose-500/20 bg-rose-500/8 text-rose-200";
  }
  if (level === "Warning") {
    return "border-amber-500/20 bg-amber-500/8 text-amber-200";
  }
  return "border-white/5 bg-white/[0.02] text-slate-300";
};

const runStatusLabel = (run: TestRunDetail | null) => {
  if (!run) {
    return { text: "No Run Yet", color: "text-slate-400" };
  }
  if (run.status === "success") {
    return { text: "Verified Stable", color: "text-emerald-500" };
  }
  if (run.status === "running" || run.status === "queued") {
    return { text: "Live In Progress", color: "text-primary" };
  }
  if (run.status === "stopped") {
    return { text: "Stopped Early", color: "text-amber-400" };
  }
  return { text: "Needs Review", color: "text-rose-400" };
};

const formatMetricDate = (value: string | null) => {
  if (!value) {
    return "N/A";
  }
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const ReportsPage = () => {
  const navigate = useNavigate();
  const { selectedProject } = useProjects();
  const [isLoading, setIsLoading] = useState(true);
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<TestHistoryItem[]>([]);
  const [runs, setRuns] = useState<TestRunDetail[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
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

      const runDetailsRaw = await Promise.all(
        topRuns.map(async (run) => {
          try {
            const response = await fetchTestRun(run.id);
            return response.data;
          } catch {
            return null;
          }
        }),
      );

      const runDetails = runDetailsRaw.filter((run): run is TestRunDetail => Boolean(run));
      const activeRuns = sortedRuns.filter((run) => run.status === "running" || run.status === "queued").length;

      setHistory(topRuns);
      setRuns(runDetails);
      setRunningCount(activeRuns);
      setSelectedRunId((current) => current && runDetails.some((run) => run.id === current) ? current : runDetails[0]?.id ?? null);
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

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? runs[0] ?? null,
    [runs, selectedRunId],
  );

  const previousRun = useMemo(() => {
    if (!selectedRun) {
      return null;
    }
    const currentIndex = runs.findIndex((run) => run.id === selectedRun.id);
    return currentIndex >= 0 ? runs[currentIndex + 1] ?? null : null;
  }, [runs, selectedRun]);

  const percentiles = useMemo(
    () => runs.slice(0, 10).map((run, index) => buildPercentilePoint(run, index)).reverse(),
    [runs],
  );

  const cpuBars = useMemo(() => {
    const values = (selectedRun?.liveMetrics?.responseTimeSeries ?? []).map((item) => item.value);
    return createBarsFromSeries(values, BAR_COUNT);
  }, [selectedRun]);

  const bandwidthBars = useMemo(() => {
    const values = (selectedRun?.liveMetrics?.rpsSeries ?? []).map((item) => item.value);
    return createBarsFromSeries(values, BAR_COUNT);
  }, [selectedRun]);

  const improvementScore = useMemo(() => {
    if (!selectedRun || !previousRun) {
      return 0;
    }

    const currentAvg = selectedRun.finalMetrics?.avgLatencyMs ?? selectedRun.liveMetrics?.avgLatencyMs ?? 0;
    const previousAvg = previousRun.finalMetrics?.avgLatencyMs ?? previousRun.liveMetrics?.avgLatencyMs ?? 0;

    if (previousAvg <= 0) {
      return 0;
    }

    return toRounded(((previousAvg - currentAvg) / previousAvg) * 100, 1);
  }, [previousRun, selectedRun]);

  const anomalies = useMemo(() => buildAnomalies(selectedRun, runningCount), [selectedRun, runningCount]);
  const status = useMemo(() => runStatusLabel(selectedRun), [selectedRun]);

  const shareReport = async () => {
    if (!selectedProject || !selectedRun) {
      return;
    }

    const url = `${window.location.origin}${buildProjectTestPath(selectedProject.id, selectedRun.id)}`;
    const text = `${selectedProject.name} report for "${selectedRun.name}"\nStatus: ${selectedRun.status}\nAvg latency: ${Math.round(
      selectedRun.finalMetrics?.avgLatencyMs ?? selectedRun.liveMetrics?.avgLatencyMs ?? 0,
    )}ms\nError rate: ${(selectedRun.finalMetrics?.errorRatePct ?? selectedRun.liveMetrics?.errorRatePct ?? 0).toFixed(2)}%\n${url}`;

    try {
      setIsSharing(true);
      if (navigator.share) {
        await navigator.share({
          title: `${selectedProject.name} report`,
          text,
          url,
        });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
    } catch (requestError) {
      if (requestError instanceof Error && requestError.name === "AbortError") {
        return;
      }
      setError(requestError instanceof Error ? requestError.message : "Unable to share report.");
    } finally {
      setIsSharing(false);
    }
  };

  const downloadPdfReport = () => {
    if (!selectedProject || !selectedRun) {
      return;
    }

    const latency = Math.round(selectedRun.finalMetrics?.avgLatencyMs ?? selectedRun.liveMetrics?.avgLatencyMs ?? 0);
    const p95 = Math.round(selectedRun.finalMetrics?.p95LatencyMs ?? latency * 1.35);
    const p99 = Math.round(selectedRun.finalMetrics?.p99LatencyMs ?? latency * 1.65);
    const throughput = (selectedRun.finalMetrics?.throughputRps ?? selectedRun.liveMetrics?.throughputRps ?? 0).toFixed(2);
    const errorRate = (selectedRun.finalMetrics?.errorRatePct ?? selectedRun.liveMetrics?.errorRatePct ?? 0).toFixed(2);

    const popup = window.open("", "_blank", "width=1080,height=900");
    if (!popup) {
      setError("Popup blocked. Please allow popups to export the report as PDF.");
      return;
    }

    popup.document.write(`<!DOCTYPE html>
<html>
  <head>
    <title>${selectedProject.name} Report</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 32px; color: #111827; }
      h1, h2 { margin-bottom: 8px; }
      .meta { color: #4b5563; margin-bottom: 24px; }
      .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin: 24px 0; }
      .card { border: 1px solid #d1d5db; border-radius: 14px; padding: 16px; }
      .label { font-size: 12px; text-transform: uppercase; color: #6b7280; margin-bottom: 6px; }
      .value { font-size: 28px; font-weight: 700; }
      ul { padding-left: 18px; }
      code { background: #f3f4f6; padding: 2px 6px; border-radius: 6px; }
    </style>
  </head>
  <body>
    <h1>${selectedProject.name} Performance Report</h1>
    <div class="meta">Selected run: ${selectedRun.name} | Created: ${formatMetricDate(selectedRun.createdAt)} | Status: ${selectedRun.status}</div>
    <p>This printable report shows the currently selected run. Trend comparison in the app uses the latest 10 runs.</p>
    <div class="grid">
      <div class="card"><div class="label">Average latency</div><div class="value">${latency}ms</div></div>
      <div class="card"><div class="label">Error rate</div><div class="value">${errorRate}%</div></div>
      <div class="card"><div class="label">p95 latency</div><div class="value">${p95}ms</div></div>
      <div class="card"><div class="label">p99 latency</div><div class="value">${p99}ms</div></div>
      <div class="card"><div class="label">Throughput</div><div class="value">${throughput} rps</div></div>
      <div class="card"><div class="label">Target</div><div class="value" style="font-size:16px">${selectedRun.targetUrl}</div></div>
    </div>
    <h2>Anomalies</h2>
    <ul>${anomalies.map((item) => `<li><strong>${item.level}</strong> ${item.message}</li>`).join("")}</ul>
    <h2>Run details</h2>
    <p>Test type: <code>${selectedRun.type}</code></p>
    <p>Virtual users: <code>${selectedRun.vus}</code></p>
    <p>Duration: <code>${selectedRun.duration}</code></p>
  </body>
</html>`);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  if (!selectedProject) {
    return <EmptyState icon={Radar} title="Create a project first" description="Reports are generated from real tests inside a project." />;
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

  if (!selectedRun) {
    return <EmptyState icon={FileText} title="No report data yet" description="Run at least one test to generate a live report for this project." />;
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-primary">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Full Analytical Report</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span>{selectedProject.name}</span>
              <div className="h-1 w-1 rounded-full bg-slate-700" />
              <span>{formatMetricDate(selectedRun.createdAt)}</span>
              <div className="h-1 w-1 rounded-full bg-slate-700" />
              <span className={status.color}>{status.text}</span>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              This page shows the <span className="font-semibold text-slate-200">selected run report</span>. The trend chart compares the latest 10 runs for this project.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => void shareReport()}
            className="glass px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-white/5 transition-colors flex items-center gap-2"
          >
            <Share2 className="h-4 w-4" /> {isSharing ? "Sharing..." : "Share"}
          </button>
          <button
            onClick={downloadPdfReport}
            className="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-primary/20"
          >
            <Download className="h-4 w-4" /> Download PDF Report
          </button>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

      <div className="rounded-2xl border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-slate-200">
        Selected run: <span className="font-semibold text-white">{selectedRun.name}</span> | Compared against: {previousRun ? previousRun.name : "no previous run yet"} | Recent run snapshots: {history.length}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="space-y-6 lg:col-span-3">
          <div className="premium-card p-8 h-[450px]">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold tracking-tight text-white">Latency Percentiles (p50, p95, p99)</h3>
                <p className="mt-1 text-xs font-medium uppercase tracking-wider text-muted/60">Latest 10 runs comparison</p>
              </div>
              <div className="flex gap-4">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted"><div className="h-2.5 w-2.5 rounded-full bg-primary" /> p50</div>
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted"><div className="h-2.5 w-2.5 rounded-full bg-secondary-purple" /> p95</div>
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted"><div className="h-2.5 w-2.5 rounded-full bg-secondary-teal" /> p99</div>
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

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="premium-card p-6">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Cpu className="h-5 w-5 text-secondary-purple" />
                  <h3 className="font-bold text-white">Latency Intensity</h3>
                </div>
                <span className="rounded-md bg-secondary-purple/10 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-secondary-purple">
                  {Math.round(selectedRun.finalMetrics?.p99LatencyMs ?? selectedRun.liveMetrics?.avgLatencyMs ?? 0)}ms peak
                </span>
              </div>
              <div className="h-32 rounded-2xl border border-white/[0.01] bg-white/[0.02] p-4 flex items-end gap-1.5">
                {cpuBars.map((bar, index) => (
                  <div key={index} className="flex-1 rounded-t-sm bg-secondary-purple transition-all hover:bg-secondary-purple/80" style={{ height: `${bar.height}%`, opacity: bar.opacity }} />
                ))}
              </div>
            </div>

            <div className="premium-card p-6">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Network className="h-5 w-5 text-secondary-teal" />
                  <h3 className="font-bold text-white">Bandwidth / Throughput</h3>
                </div>
                <span className="rounded-md bg-secondary-teal/10 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-secondary-teal">
                  {(selectedRun.finalMetrics?.throughputRps ?? selectedRun.liveMetrics?.throughputRps ?? 0).toFixed(2)} rps
                </span>
              </div>
              <div className="h-32 rounded-2xl border border-white/[0.01] bg-white/[0.02] p-4 flex items-end gap-1.5">
                {bandwidthBars.map((bar, index) => (
                  <div key={index} className="flex-1 rounded-t-sm bg-secondary-teal transition-all hover:bg-secondary-teal/80" style={{ height: `${bar.height}%`, opacity: bar.opacity }} />
                ))}
              </div>
            </div>
          </div>

          <div className="premium-card p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-white">Recent Report Snapshots</h3>
                <p className="mt-1 text-sm text-slate-400">Choose which run should power the report cards and anomalies.</p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {runs.map((run) => (
                <button
                  key={run.id}
                  onClick={() => setSelectedRunId(run.id)}
                  className={`rounded-2xl border p-4 text-left transition ${selectedRun.id === run.id ? "border-primary/40 bg-primary/10" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]"}`}
                >
                  <p className="text-sm font-semibold text-white">{run.name}</p>
                  <p className="mt-1 text-xs text-slate-400">{formatMetricDate(run.createdAt)}</p>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-300">
                    <span>{Math.round(run.finalMetrics?.avgLatencyMs ?? run.liveMetrics?.avgLatencyMs ?? 0)}ms avg</span>
                    <span>{(run.finalMetrics?.errorRatePct ?? run.liveMetrics?.errorRatePct ?? 0).toFixed(2)}% err</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="premium-card border-l-4 border-l-success p-6">
            <h4 className="mb-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted/60">
              <TrendingDown className="h-3.5 w-3.5 text-success" /> Score
            </h4>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black tracking-tighter text-white">{improvementScore >= 0 ? "+" : ""}{improvementScore}%</span>
              <span className="pb-1 text-[10px] font-black uppercase tracking-wider text-success">vs previous run</span>
            </div>
            <p className="mt-4 text-xs font-medium leading-relaxed text-muted/80">
              {improvementScore >= 0 ? "Average latency improved compared to the previous run." : "Average latency regressed compared to the previous run."}
            </p>
          </div>

          <div className="premium-card p-6">
            <h4 className="mb-6 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted/60">
              <Activity className="h-3.5 w-3.5 text-primary" /> Anomalies
            </h4>
            <div className="space-y-3">
              {anomalies.map((item, index) => (
                <div key={`${item.time}-${index}`} className={`flex gap-3 rounded-xl border p-3 ${anomalyTone(item.level)}`}>
                  <div className="mt-0.5 text-[9px] font-black uppercase tracking-tighter text-slate-500">{item.time}</div>
                  <div className="text-xs font-medium">{item.message}</div>
                </div>
              ))}
            </div>
            <button
              onClick={() => navigate(buildProjectTestPath(selectedProject.id, selectedRun.id))}
              className="mt-6 flex w-full items-center justify-center gap-1 py-2.5 text-xs font-black uppercase tracking-widest text-primary transition-all hover:underline"
            >
              View Full Logs <ChevronRight className="h-3 w-3" />
            </button>
          </div>

          <div className="premium-card p-6">
            <h3 className="text-lg font-bold text-white">Automate this report</h3>
            <p className="mt-2 text-sm text-slate-400">Create schedules or API hooks so this project keeps producing fresh report data.</p>
            <button
              onClick={() => navigate(buildProjectSectionPath(selectedProject.id, "integrations"))}
              className="mt-5 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08]"
            >
              Open Integrations <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
