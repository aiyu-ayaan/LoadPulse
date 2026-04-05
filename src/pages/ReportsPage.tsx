import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Activity,
  Brain,
  ChevronRight,
  Cpu,
  Download,
  ExternalLink,
  FileText,
  Network,
  Radar,
  RefreshCcw,
  Share2,
  TrendingDown,
} from "lucide-react";
import { io } from "socket.io-client";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { HelperNote } from "../components/HelperNote";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { RichTextView } from "../components/RichTextView";
import { useProjects } from "../context/useProjects";
import { useAuth } from "../context/useAuth";
import {
  fetchAiRuntimeSettings,
  fetchTestHistory,
  fetchTestRun,
  generateTestRunAiSummary,
  getAuthToken,
  regenerateTestRunAiSummary,
  socketUrl,
  type TestRunAiSummary,
  type TestHistoryItem,
  type TestRunDetail,
} from "../lib/api";
import { buildProjectSectionPath, buildProjectTestPath } from "../lib/project-routes";
import { renderRichTextToHtml } from "../lib/rich-text";

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

const escapeHtml = (value: string | number | null | undefined) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const ReportsPage = () => {
  const navigate = useNavigate();
  const { selectedProject } = useProjects();
  const { refreshCurrentUser } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<TestHistoryItem[]>([]);
  const [runs, setRuns] = useState<TestRunDetail[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runningCount, setRunningCount] = useState(0);
  const [aiSummariesByRunId, setAiSummariesByRunId] = useState<Record<string, TestRunAiSummary>>({});
  const [aiSummaryError, setAiSummaryError] = useState<string | null>(null);
  const [aiLoadingRunId, setAiLoadingRunId] = useState<string | null>(null);
  const [autoGenerateAiSummary, setAutoGenerateAiSummary] = useState(false);
  const [isPdfExporting, setIsPdfExporting] = useState(false);
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
      setAiSummariesByRunId((previous) => {
        const next = { ...previous };
        for (const run of runDetails) {
          if (run.aiSummary?.text) {
            next[run.id] = run.aiSummary;
          }
        }
        return next;
      });
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
    let isMounted = true;

    const loadAiRuntimeSettings = async () => {
      try {
        const response = await fetchAiRuntimeSettings();
        if (isMounted) {
          setAutoGenerateAiSummary(Boolean(response.data.autoGenerateTestSummary));
        }
      } catch {
        if (isMounted) {
          setAutoGenerateAiSummary(false);
        }
      }
    };

    void loadAiRuntimeSettings();
    return () => {
      isMounted = false;
    };
  }, [selectedProject?.id]);

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
  const selectedRunAiSummary = selectedRun ? aiSummariesByRunId[selectedRun.id] ?? null : null;
  const canGenerateAiSummary = selectedRun ? ["success", "failed", "stopped"].includes(selectedRun.status) : false;
  const syncAiCredits = useCallback(() => {
    void refreshCurrentUser().catch(() => {
      // Ignore refresh failures; generation succeeded.
    });
  }, [refreshCurrentUser]);

  useEffect(() => {
    if (
      !autoGenerateAiSummary ||
      !selectedRun ||
      !canGenerateAiSummary ||
      selectedRunAiSummary ||
      aiLoadingRunId === selectedRun.id
    ) {
      return;
    }

    const loadSummary = async () => {
      setAiLoadingRunId(selectedRun.id);
      setAiSummaryError(null);
      try {
        const response = await generateTestRunAiSummary(selectedRun.id);
        setAiSummariesByRunId((previous) => ({
          ...previous,
          [selectedRun.id]: response.data,
        }));
        syncAiCredits();
      } catch (requestError) {
        setAiSummaryError(requestError instanceof Error ? requestError.message : "Unable to generate AI summary.");
      } finally {
        setAiLoadingRunId((current) => (current === selectedRun.id ? null : current));
      }
    };

    void loadSummary();
  }, [aiLoadingRunId, autoGenerateAiSummary, canGenerateAiSummary, selectedRun, selectedRunAiSummary, syncAiCredits]);

  const runSelectedRunSummary = async () => {
    if (!selectedRun || !canGenerateAiSummary) {
      return;
    }

    const shouldRegenerate = Boolean(selectedRunAiSummary?.text);
    setAiLoadingRunId(selectedRun.id);
    setAiSummaryError(null);
    try {
      const response = shouldRegenerate
        ? await regenerateTestRunAiSummary(selectedRun.id)
        : await generateTestRunAiSummary(selectedRun.id);
      setAiSummariesByRunId((previous) => ({
        ...previous,
        [selectedRun.id]: response.data,
      }));
      syncAiCredits();
    } catch (requestError) {
      setAiSummaryError(requestError instanceof Error ? requestError.message : "Unable to generate AI summary.");
    } finally {
      setAiLoadingRunId((current) => (current === selectedRun.id ? null : current));
    }
  };

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

  const downloadPdfReport = async () => {
    if (!selectedProject || !selectedRun || isPdfExporting) {
      return;
    }

    setIsPdfExporting(true);
    setError(null);

    try {
      const latency = Math.round(selectedRun.finalMetrics?.avgLatencyMs ?? selectedRun.liveMetrics?.avgLatencyMs ?? 0);
      const p95 = Math.round(selectedRun.finalMetrics?.p95LatencyMs ?? latency * 1.35);
      const p99 = Math.round(selectedRun.finalMetrics?.p99LatencyMs ?? latency * 1.65);
      const throughput = (selectedRun.finalMetrics?.throughputRps ?? selectedRun.liveMetrics?.throughputRps ?? 0).toFixed(2);
      const errorRate = (selectedRun.finalMetrics?.errorRatePct ?? selectedRun.liveMetrics?.errorRatePct ?? 0).toFixed(2);

      let summaryForPdf = selectedRunAiSummary;
      if (!summaryForPdf?.text && canGenerateAiSummary) {
        try {
          const response = await generateTestRunAiSummary(selectedRun.id);
          summaryForPdf = response.data;
          setAiSummariesByRunId((previous) => ({
            ...previous,
            [selectedRun.id]: response.data,
          }));
          syncAiCredits();
        } catch {
          setError("Unable to preload AI summary for this PDF. Exported without AI summary.");
        }
      }

      const aiSummaryHtml = summaryForPdf?.text
        ? renderRichTextToHtml(summaryForPdf.text)
        : "<p class=\"summary-empty\">AI summary was not available for this run.</p>";

      const anomalyItems = anomalies
        .map(
          (item) =>
            `<li class=\"anomaly-item\"><span class=\"anomaly-level anomaly-${item.level.toLowerCase()}\">${escapeHtml(item.level)}</span><span>${escapeHtml(item.message)}</span></li>`,
        )
        .join("");

      const statusToneClass =
        selectedRun.status === "success"
          ? "status-success"
          : selectedRun.status === "failed"
            ? "status-failed"
            : selectedRun.status === "stopped"
              ? "status-stopped"
              : "status-running";

      const popup = window.open("", "_blank", "width=1160,height=980");
      if (!popup) {
        setError("Popup blocked. Please allow popups to export the report as PDF.");
        return;
      }

      popup.document.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>LoadPulse Report • ${escapeHtml(selectedProject.name)}</title>
    <style>
      :root {
        --bg: #090f1d;
        --panel: #101a2f;
        --panel-soft: #121f38;
        --line: rgba(148, 163, 184, 0.28);
        --text: #e2e8f0;
        --muted: #94a3b8;
        --blue: #3b82f6;
        --cyan: #22d3ee;
        --teal: #14b8a6;
        --emerald: #10b981;
        --rose: #f43f5e;
        --amber: #f59e0b;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        padding: 0;
        color: var(--text);
        background:
          radial-gradient(circle at top right, rgba(59, 130, 246, 0.28), transparent 40%),
          radial-gradient(circle at 10% 90%, rgba(20, 184, 166, 0.2), transparent 45%),
          var(--bg);
        font-family: "Segoe UI", "Arial", sans-serif;
      }

      body {
        padding: 26px;
      }

      .sheet {
        max-width: 1060px;
        margin: 0 auto;
        border: 1px solid rgba(148, 163, 184, 0.24);
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(15, 23, 42, 0.92), rgba(9, 15, 29, 0.97));
        box-shadow: 0 22px 70px rgba(2, 6, 23, 0.55);
        overflow: hidden;
      }

      .header {
        padding: 22px 24px;
        border-bottom: 1px solid var(--line);
        background: linear-gradient(90deg, rgba(59, 130, 246, 0.14), rgba(34, 211, 238, 0.08));
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
      }

      .brand {
        display: flex;
        gap: 12px;
        align-items: center;
      }

      .brand-mark {
        width: 44px;
        height: 44px;
        border-radius: 12px;
        border: 1px solid rgba(96, 165, 250, 0.45);
        background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(20, 184, 166, 0.22));
        color: #dbeafe;
        display: grid;
        place-content: center;
        font-weight: 800;
        letter-spacing: 0.08em;
      }

      .app-name {
        margin: 0;
        font-size: 12px;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: #cbd5e1;
      }

      .title {
        margin: 4px 0 0;
        font-size: 30px;
        letter-spacing: -0.02em;
      }

      .subtitle {
        margin: 7px 0 0;
        font-size: 12px;
        color: var(--muted);
      }

      .status {
        border-radius: 999px;
        padding: 7px 12px;
        border: 1px solid transparent;
        text-transform: uppercase;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.11em;
      }

      .status-success {
        color: #a7f3d0;
        background: rgba(16, 185, 129, 0.18);
        border-color: rgba(16, 185, 129, 0.4);
      }

      .status-failed {
        color: #fecdd3;
        background: rgba(244, 63, 94, 0.16);
        border-color: rgba(244, 63, 94, 0.4);
      }

      .status-stopped {
        color: #fde68a;
        background: rgba(245, 158, 11, 0.16);
        border-color: rgba(245, 158, 11, 0.4);
      }

      .status-running {
        color: #bfdbfe;
        background: rgba(59, 130, 246, 0.16);
        border-color: rgba(59, 130, 246, 0.4);
      }

      .content {
        padding: 22px 24px 26px;
      }

      .meta-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        margin-bottom: 16px;
      }

      .meta-item {
        border: 1px solid var(--line);
        border-radius: 12px;
        background: rgba(15, 23, 42, 0.55);
        padding: 10px 12px;
      }

      .meta-label {
        margin: 0;
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #93c5fd;
      }

      .meta-value {
        margin: 5px 0 0;
        font-size: 13px;
        color: #f8fafc;
      }

      .metrics-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
        margin-top: 12px;
      }

      .metric-card {
        border-radius: 12px;
        border: 1px solid var(--line);
        background: linear-gradient(180deg, rgba(15, 23, 42, 0.62), rgba(15, 23, 42, 0.42));
        padding: 12px;
      }

      .metric-label {
        color: var(--muted);
        text-transform: uppercase;
        font-size: 11px;
        letter-spacing: 0.07em;
      }

      .metric-value {
        margin-top: 6px;
        font-size: 31px;
        font-weight: 800;
        letter-spacing: -0.02em;
      }

      .section {
        margin-top: 18px;
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 14px;
        background: rgba(15, 23, 42, 0.5);
      }

      .section-title {
        margin: 0 0 9px;
        color: #dbeafe;
        font-size: 17px;
      }

      .section-meta {
        margin: 0 0 11px;
        color: var(--muted);
        font-size: 12px;
      }

      .summary-empty {
        color: var(--muted);
        margin: 0;
      }

      .details-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }

      .detail-box {
        border: 1px dashed rgba(148, 163, 184, 0.34);
        border-radius: 10px;
        padding: 10px;
        background: rgba(2, 6, 23, 0.45);
      }

      .detail-label {
        margin: 0;
        color: var(--muted);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .detail-value {
        margin: 6px 0 0;
        font-size: 16px;
        color: #f8fafc;
      }

      .anomalies {
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: 8px;
      }

      .anomaly-item {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        border-radius: 10px;
        padding: 9px 10px;
        border: 1px solid var(--line);
        background: rgba(15, 23, 42, 0.5);
        font-size: 13px;
      }

      .anomaly-level {
        border-radius: 999px;
        padding: 3px 8px;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.07em;
        text-transform: uppercase;
      }

      .anomaly-alert {
        color: #fecdd3;
        border: 1px solid rgba(244, 63, 94, 0.45);
        background: rgba(244, 63, 94, 0.16);
      }

      .anomaly-warning {
        color: #fde68a;
        border: 1px solid rgba(245, 158, 11, 0.45);
        background: rgba(245, 158, 11, 0.16);
      }

      .anomaly-info {
        color: #bfdbfe;
        border: 1px solid rgba(59, 130, 246, 0.45);
        background: rgba(59, 130, 246, 0.16);
      }

      .ai-rich-content {
        color: #e2e8f0;
        font-size: 13px;
        line-height: 1.6;
      }

      .ai-rich-content h1,
      .ai-rich-content h2,
      .ai-rich-content h3 {
        color: #dbeafe;
        margin: 10px 0 6px;
      }

      .ai-rich-content h1 {
        font-size: 19px;
      }

      .ai-rich-content h2 {
        font-size: 16px;
      }

      .ai-rich-content h3 {
        font-size: 14px;
      }

      .ai-rich-content p,
      .ai-rich-content ul,
      .ai-rich-content ol {
        margin: 6px 0;
      }

      .ai-rich-content ul,
      .ai-rich-content ol {
        padding-left: 18px;
      }

      .ai-rich-content code {
        background: rgba(2, 6, 23, 0.75);
        border: 1px solid rgba(34, 211, 238, 0.25);
        border-radius: 5px;
        padding: 1px 5px;
        color: #bae6fd;
      }

      .ai-rich-content pre {
        background: rgba(2, 6, 23, 0.75);
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 8px;
        padding: 8px;
        overflow-x: auto;
      }

      .footer {
        margin-top: 18px;
        color: var(--muted);
        font-size: 11px;
        text-align: right;
      }

      @media print {
        @page {
          size: A4;
          margin: 10mm;
        }

        html,
        body {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          padding: 0;
        }

        .sheet {
          border-radius: 0;
          box-shadow: none;
        }
      }
    </style>
  </head>
  <body>
    <main class="sheet">
      <header class="header">
        <div class="brand">
          <div class="brand-mark">LP</div>
          <div>
            <p class="app-name">LoadPulse</p>
            <h1 class="title">Performance Report</h1>
            <p class="subtitle">Project report snapshot generated from the selected test run</p>
          </div>
        </div>
        <div class="status ${statusToneClass}">${escapeHtml(selectedRun.status)}</div>
      </header>

      <section class="content">
        <div class="meta-grid">
          <div class="meta-item">
            <p class="meta-label">Project</p>
            <p class="meta-value">${escapeHtml(selectedProject.name)}</p>
          </div>
          <div class="meta-item">
            <p class="meta-label">Selected Run</p>
            <p class="meta-value">${escapeHtml(selectedRun.name)}</p>
          </div>
          <div class="meta-item">
            <p class="meta-label">Created</p>
            <p class="meta-value">${escapeHtml(formatMetricDate(selectedRun.createdAt))}</p>
          </div>
        </div>

        <div class="metrics-grid">
          <div class="metric-card"><div class="metric-label">Average latency</div><div class="metric-value">${latency}ms</div></div>
          <div class="metric-card"><div class="metric-label">Error rate</div><div class="metric-value">${errorRate}%</div></div>
          <div class="metric-card"><div class="metric-label">p95 latency</div><div class="metric-value">${p95}ms</div></div>
          <div class="metric-card"><div class="metric-label">p99 latency</div><div class="metric-value">${p99}ms</div></div>
          <div class="metric-card"><div class="metric-label">Throughput</div><div class="metric-value">${throughput} rps</div></div>
          <div class="metric-card"><div class="metric-label">Target URL</div><div class="metric-value" style="font-size: 18px;">${escapeHtml(selectedRun.targetUrl)}</div></div>
        </div>

        <section class="section">
          <h2 class="section-title">AI Executive Summary</h2>
          ${summaryForPdf ? `<p class=\"section-meta\">Generated via ${escapeHtml(summaryForPdf.modelName)} (${escapeHtml(summaryForPdf.provider)}) • ${escapeHtml(summaryForPdf.integrationName)}</p>` : ""}
          <div class="ai-rich-content">${aiSummaryHtml}</div>
        </section>

        <section class="section">
          <h2 class="section-title">Anomalies</h2>
          <ul class="anomalies">${anomalyItems}</ul>
        </section>

        <section class="section">
          <h2 class="section-title">Run Details</h2>
          <div class="details-grid">
            <div class="detail-box">
              <p class="detail-label">Test Type</p>
              <p class="detail-value">${escapeHtml(selectedRun.type)}</p>
            </div>
            <div class="detail-box">
              <p class="detail-label">Virtual Users</p>
              <p class="detail-value">${escapeHtml(String(selectedRun.vus))}</p>
            </div>
            <div class="detail-box">
              <p class="detail-label">Duration</p>
              <p class="detail-value">${escapeHtml(selectedRun.duration)}</p>
            </div>
            <div class="detail-box">
              <p class="detail-label">Compared Against</p>
              <p class="detail-value">${escapeHtml(previousRun?.name ?? "No previous run")}</p>
            </div>
            <div class="detail-box">
              <p class="detail-label">Recent Snapshots</p>
              <p class="detail-value">${escapeHtml(String(history.length))}</p>
            </div>
            <div class="detail-box">
              <p class="detail-label">Generated At</p>
              <p class="detail-value">${escapeHtml(formatMetricDate(new Date().toISOString()))}</p>
            </div>
          </div>
        </section>

        <div class="footer">LoadPulse • ${escapeHtml(window.location.origin)}</div>
      </section>
    </main>
  </body>
</html>`);
      popup.document.close();
      popup.focus();
      popup.print();
    } finally {
      setIsPdfExporting(false);
    }
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
            onClick={() => void downloadPdfReport()}
            disabled={isPdfExporting}
            className="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-primary/20 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <Download className="h-4 w-4" /> {isPdfExporting ? "Preparing PDF..." : "Download PDF Report"}
          </button>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

      <div className="rounded-2xl border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-slate-200">
        Selected run: <span className="font-semibold text-white">{selectedRun.name}</span> | Compared against: {previousRun ? previousRun.name : "no previous run yet"} | Recent run snapshots: {history.length}
      </div>

      <HelperNote title="How to read this report">
        This report mostly describes the selected run. The big chart compares that run with recent runs. p50 means a typical visitor wait,
        p95 means slower visitors near the end, and p99 shows the very slowest edge cases. Lower times are better.
      </HelperNote>

      <section className="relative overflow-hidden rounded-2xl border border-primary/20 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.2),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.12),transparent_40%),#171819] p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="inline-flex items-center gap-2 text-base font-semibold text-white">
            <Brain className="h-4 w-4 text-primary" /> AI Executive Summary
          </h2>
          {canGenerateAiSummary && (
            <button
              type="button"
              onClick={() => void runSelectedRunSummary()}
              disabled={aiLoadingRunId === selectedRun.id}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              {aiLoadingRunId === selectedRun.id ? "Generating..." : selectedRunAiSummary ? "Regenerate" : "Generate"}
            </button>
          )}
        </div>

        {!canGenerateAiSummary ? (
          <p className="text-sm text-slate-400">Summary becomes available when the selected run is completed.</p>
        ) : aiSummaryError ? (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{aiSummaryError}</p>
        ) : selectedRunAiSummary?.text ? (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">
              Model: {selectedRunAiSummary.modelName} ({selectedRunAiSummary.provider}) • {selectedRunAiSummary.integrationName}
            </p>
            <RichTextView
              content={selectedRunAiSummary.text}
              className="rounded-xl border border-white/10 bg-black/25 p-4"
            />
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            {aiLoadingRunId === selectedRun.id ? "Generating executive summary..." : "No AI summary yet."}
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="space-y-6 lg:col-span-3">
          <div className="premium-card p-8 h-[450px]">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold tracking-tight text-white">Latency Percentiles (p50, p95, p99)</h3>
                <p className="mt-1 text-xs font-medium uppercase tracking-wider text-muted/60">Typical, slow, and very slow visits across the latest 10 runs</p>
              </div>
              <div className="flex gap-4">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted"><div className="h-2.5 w-2.5 rounded-full bg-primary" /> p50 typical</div>
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted"><div className="h-2.5 w-2.5 rounded-full bg-secondary-purple" /> p95 slow</div>
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted"><div className="h-2.5 w-2.5 rounded-full bg-secondary-teal" /> p99 very slow</div>
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
                  <h3 className="font-bold text-white">Slowest Moments</h3>
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
                  <h3 className="font-bold text-white">Traffic Handled Each Second</h3>
                </div>
                <span className="rounded-md bg-secondary-teal/10 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-secondary-teal">
                  {(selectedRun.finalMetrics?.throughputRps ?? selectedRun.liveMetrics?.throughputRps ?? 0).toFixed(2)} per sec
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
                    <span>{Math.round(run.finalMetrics?.avgLatencyMs ?? run.liveMetrics?.avgLatencyMs ?? 0)}ms average wait</span>
                    <span>{(run.finalMetrics?.errorRatePct ?? run.liveMetrics?.errorRatePct ?? 0).toFixed(2)}% failed</span>
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
              <span className="pb-1 text-[10px] font-black uppercase tracking-wider text-success">versus previous run</span>
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
