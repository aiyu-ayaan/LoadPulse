import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TestRun } from "../models/TestRun.js";

const RUN_OUTPUT_DIR = path.join(os.tmpdir(), "loadpulse-runs");
const MAX_SERIES_POINTS = Number(process.env.MAX_SERIES_POINTS ?? 180);
const MAX_PERCENTILE_SAMPLES = Number(process.env.MAX_PERCENTILE_SAMPLES ?? 5000);

const activeRuns = new Map();
let socketServer = null;

const timeLabelFormatter = new Intl.DateTimeFormat("en-US", {
  hour12: false,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const toTimeLabel = (date) => timeLabelFormatter.format(date);

const round = (value, digits = 2) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  const multiplier = 10 ** digits;
  return Math.round(numeric * multiplier) / multiplier;
};

const percentile = (values, targetPercentile) => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((targetPercentile / 100) * sorted.length) - 1;
  const index = Math.max(0, Math.min(sorted.length - 1, rank));
  return sorted[index];
};

const toStatusPercentages = (statusCodes) => {
  const total =
    statusCodes.ok2xx + statusCodes.client4xx + statusCodes.server5xx + statusCodes.other;

  if (total === 0) {
    return [
      { name: "200 OK", value: 0, color: "#3B82F6" },
      { name: "4xx Client", value: 0, color: "#8B5CF6" },
      { name: "5xx Server", value: 0, color: "#F43F5E" },
    ];
  }

  return [
    { name: "200 OK", value: round((statusCodes.ok2xx / total) * 100), color: "#3B82F6" },
    { name: "4xx Client", value: round((statusCodes.client4xx / total) * 100), color: "#8B5CF6" },
    { name: "5xx Server", value: round((statusCodes.server5xx / total) * 100), color: "#F43F5E" },
  ];
};

const toSeries = (state) => {
  const points = [...state.secondBuckets.values()]
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    .slice(-MAX_SERIES_POINTS);

  return {
    responseTimeData: points.map((point) => ({
      time: toTimeLabel(point.timestamp),
      ms: round(point.durationCount > 0 ? point.durationSum / point.durationCount : 0),
      timestamp: point.timestamp,
    })),
    rpsData: points.map((point) => ({
      time: toTimeLabel(point.timestamp),
      rps: round(point.requests),
      timestamp: point.timestamp,
    })),
  };
};

const toLiveMetrics = (state) => {
  const { responseTimeData, rpsData } = toSeries(state);
  const bucketCount = state.secondBuckets.size || 1;
  const throughputRps = round(state.totalRequests / bucketCount);
  const avgLatencyMs = round(state.durationCount > 0 ? state.durationSum / state.durationCount : 0);
  const errorRatePct = round(
    state.totalRequests > 0 ? (state.failedRequests / state.totalRequests) * 100 : 0,
  );

  return {
    totalRequests: Math.round(state.totalRequests),
    avgLatencyMs,
    errorRatePct,
    throughputRps,
    statusCodes: { ...state.statusCodes },
    responseTimeData,
    rpsData,
    statusData: toStatusPercentages(state.statusCodes),
  };
};

const parseSummaryMetrics = (summary, fallbackMetrics) => {
  const metrics = summary?.metrics ?? {};
  const httpDurationValues = metrics.http_req_duration?.values ?? {};
  const httpReqValues = metrics.http_reqs?.values ?? {};
  const httpFailedValues = metrics.http_req_failed?.values ?? {};
  const checksValues = metrics.checks?.values ?? {};

  return {
    totalRequests: Math.round(httpReqValues.count ?? fallbackMetrics.totalRequests),
    avgLatencyMs: round(httpDurationValues.avg ?? fallbackMetrics.avgLatencyMs),
    p95LatencyMs: round(httpDurationValues["p(95)"] ?? percentile(fallbackMetrics.durationSamples, 95)),
    p99LatencyMs: round(httpDurationValues["p(99)"] ?? percentile(fallbackMetrics.durationSamples, 99)),
    errorRatePct: round((httpFailedValues.rate ?? fallbackMetrics.errorRatePct / 100) * 100),
    throughputRps: round(httpReqValues.rate ?? fallbackMetrics.throughputRps),
    checksPassed: Math.round(checksValues.passes ?? 0),
    checksFailed: Math.round(checksValues.fails ?? 0),
  };
};

const createState = (runId, runName, projectId, workingDir, filePaths) => ({
  runId,
  runName,
  projectId,
  workingDir,
  filePaths,
  process: null,
  fileOffset: 0,
  pendingLine: "",
  stdoutTail: [],
  stderrTail: [],
  secondBuckets: new Map(),
  totalRequests: 0,
  failedRequests: 0,
  durationSum: 0,
  durationCount: 0,
  durationSamples: [],
  statusCodes: {
    ok2xx: 0,
    client4xx: 0,
    server5xx: 0,
    other: 0,
  },
  metricsPollTimer: null,
  publishTimer: null,
  latestSnapshot: null,
  finalized: false,
});

const classifyStatusCode = (statusCode) => {
  if (!Number.isFinite(statusCode)) {
    return "other";
  }

  // Treat redirects as successful traffic for dashboard distribution.
  if (statusCode >= 200 && statusCode < 400) {
    return "ok2xx";
  }
  if (statusCode >= 400 && statusCode < 500) {
    return "client4xx";
  }
  if (statusCode >= 500 && statusCode < 600) {
    return "server5xx";
  }
  return "other";
};

const ensureBucket = (state, timestamp) => {
  const bucketKey = Math.floor(timestamp.getTime() / 1000);
  if (!state.secondBuckets.has(bucketKey)) {
    state.secondBuckets.set(bucketKey, {
      timestamp: new Date(bucketKey * 1000),
      requests: 0,
      durationSum: 0,
      durationCount: 0,
    });
  }

  return state.secondBuckets.get(bucketKey);
};

const consumePoint = (state, point) => {
  if (point?.type !== "Point" || !point.data) {
    return;
  }

  const timestamp = point.data.time ? new Date(point.data.time) : new Date();
  const bucket = ensureBucket(state, timestamp);
  const metric = point.metric;
  const value = Number(point.data.value ?? 0);
  const tags = point.data.tags ?? {};

  if (!Number.isFinite(value)) {
    return;
  }

  if (metric === "http_reqs") {
    state.totalRequests += value;
    bucket.requests += value;

    const statusCode = Number.parseInt(tags.status, 10);
    const statusBucket = classifyStatusCode(statusCode);
    state.statusCodes[statusBucket] += value;
    return;
  }

  if (metric === "http_req_duration") {
    state.durationSum += value;
    state.durationCount += 1;
    bucket.durationSum += value;
    bucket.durationCount += 1;
    state.durationSamples.push(value);
    if (state.durationSamples.length > MAX_PERCENTILE_SAMPLES) {
      state.durationSamples.shift();
    }
    return;
  }

  if (metric === "http_req_failed") {
    state.failedRequests += value;
  }
};

const readAppendedMetrics = async (state) => {
  const { metricsPath } = state.filePaths;

  let stats;
  try {
    stats = await fs.promises.stat(metricsPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  if (stats.size <= state.fileOffset) {
    return;
  }

  const readStream = fs.createReadStream(metricsPath, {
    encoding: "utf8",
    start: state.fileOffset,
    end: stats.size - 1,
  });

  let chunkBuffer = "";
  for await (const chunk of readStream) {
    chunkBuffer += chunk;
  }

  state.fileOffset = stats.size;
  const payload = `${state.pendingLine}${chunkBuffer}`;
  const lines = payload.split(/\r?\n/);
  state.pendingLine = lines.pop() ?? "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      const parsed = JSON.parse(trimmed);
      consumePoint(state, parsed);
    } catch {
      // Ignore malformed partial lines from transient writes.
    }
  }
};

const toSnapshotPayload = (state) => {
  const liveMetrics = toLiveMetrics(state);

  return {
    source: "live",
    projectId: state.projectId,
    currentRun: {
      id: state.runId,
      name: state.runName,
      status: "running",
    },
    kpis: {
      totalRequests: liveMetrics.totalRequests,
      avgResponseTimeMs: liveMetrics.avgLatencyMs,
      errorRatePct: liveMetrics.errorRatePct,
      throughputRps: liveMetrics.throughputRps,
    },
    responseTimeData: liveMetrics.responseTimeData.map((point) => ({
      time: point.time,
      ms: point.ms,
    })),
    rpsData: liveMetrics.rpsData.map((point) => ({
      time: point.time,
      rps: point.rps,
    })),
    statusData: liveMetrics.statusData,
    statusCounts: liveMetrics.statusCodes,
    updatedAt: new Date().toISOString(),
  };
};

const persistLiveSnapshot = async (state) => {
  const liveMetrics = toLiveMetrics(state);

  await TestRun.updateOne(
    { _id: state.runId },
    {
      $set: {
        status: "running",
        "liveMetrics.totalRequests": liveMetrics.totalRequests,
        "liveMetrics.avgLatencyMs": liveMetrics.avgLatencyMs,
        "liveMetrics.errorRatePct": liveMetrics.errorRatePct,
        "liveMetrics.throughputRps": liveMetrics.throughputRps,
        "liveMetrics.statusCodes": liveMetrics.statusCodes,
        "liveMetrics.responseTimeSeries": liveMetrics.responseTimeData.map((point) => ({
          time: point.time,
          value: point.ms,
          timestamp: point.timestamp,
        })),
        "liveMetrics.rpsSeries": liveMetrics.rpsData.map((point) => ({
          time: point.time,
          value: point.rps,
          timestamp: point.timestamp,
        })),
        "liveMetrics.lastUpdatedAt": new Date(),
      },
    },
  );
};

const publishSnapshot = async (state) => {
  const snapshot = toSnapshotPayload(state);
  state.latestSnapshot = snapshot;
  if (socketServer) {
    socketServer.emit("test:live:update", snapshot);
  }

  await persistLiveSnapshot(state);
};

const safeCleanup = async (state) => {
  try {
    await fs.promises.rm(state.workingDir, { recursive: true, force: true });
  } catch {
    // No-op. Cleanup failure should never break the run lifecycle.
  }
};

const finalize = async (state, exitCode) => {
  if (state.finalized) {
    return;
  }
  state.finalized = true;

  if (state.metricsPollTimer) {
    clearInterval(state.metricsPollTimer);
  }
  if (state.publishTimer) {
    clearInterval(state.publishTimer);
  }

  await readAppendedMetrics(state);
  const remainingLine = state.pendingLine.trim();
  if (remainingLine) {
    try {
      consumePoint(state, JSON.parse(remainingLine));
    } catch {
      // Ignore malformed trailing JSON line.
    }
    state.pendingLine = "";
  }

  const liveMetrics = toLiveMetrics(state);
  const fallbackFinalMetrics = {
    ...liveMetrics,
    durationSamples: state.durationSamples,
  };

  let summaryPayload = null;
  try {
    const summaryRaw = await fs.promises.readFile(state.filePaths.summaryPath, "utf8");
    summaryPayload = JSON.parse(summaryRaw);
  } catch {
    // Summary may not exist if k6 crashes early.
  }

  const parsedSummary = parseSummaryMetrics(summaryPayload, fallbackFinalMetrics);
  const isSuccess = exitCode === 0;
  const errorMessage = isSuccess
    ? null
    : state.stderrTail.join("").trim() || `k6 exited with code ${exitCode}`;

  await TestRun.updateOne(
    { _id: state.runId },
    {
      $set: {
        status: isSuccess ? "success" : "failed",
        endedAt: new Date(),
        errorMessage,
        "liveMetrics.totalRequests": liveMetrics.totalRequests,
        "liveMetrics.avgLatencyMs": liveMetrics.avgLatencyMs,
        "liveMetrics.errorRatePct": liveMetrics.errorRatePct,
        "liveMetrics.throughputRps": liveMetrics.throughputRps,
        "liveMetrics.statusCodes": liveMetrics.statusCodes,
        "liveMetrics.responseTimeSeries": liveMetrics.responseTimeData.map((point) => ({
          time: point.time,
          value: point.ms,
          timestamp: point.timestamp,
        })),
        "liveMetrics.rpsSeries": liveMetrics.rpsData.map((point) => ({
          time: point.time,
          value: point.rps,
          timestamp: point.timestamp,
        })),
        "liveMetrics.lastUpdatedAt": new Date(),
        finalMetrics: {
          ...parsedSummary,
          statusCodes: liveMetrics.statusCodes,
        },
      },
    },
  );

  if (socketServer) {
    socketServer.emit("test:run:completed", {
      runId: state.runId,
      projectId: state.projectId,
      status: isSuccess ? "success" : "failed",
      errorMessage,
    });
  }

  activeRuns.delete(state.runId);
  await safeCleanup(state);
};

const appendTailLog = (bucket, chunk) => {
  bucket.push(chunk.toString());
  if (bucket.length > 20) {
    bucket.shift();
  }
};

export const setSocketServer = (ioServer) => {
  socketServer = ioServer;
};

export const getActiveRunSnapshots = (projectId) =>
  [...activeRuns.values()]
    .map((runState) => runState.latestSnapshot)
    .filter(Boolean)
    .filter((snapshot) => !projectId || snapshot.projectId === projectId);

export const hasActiveRun = (runId) => activeRuns.has(runId);

export const startK6Run = async (testRunDocument) => {
  const runId = testRunDocument._id.toString();
  const runWorkDir = path.join(RUN_OUTPUT_DIR, `${runId}-${randomUUID().slice(0, 6)}`);
  await fs.promises.mkdir(runWorkDir, { recursive: true });

  const scriptPath = path.join(runWorkDir, "test-script.js");
  const metricsPath = path.join(runWorkDir, "metrics.json");
  const summaryPath = path.join(runWorkDir, "summary.json");

  await fs.promises.writeFile(scriptPath, testRunDocument.script, "utf8");

  const state = createState(runId, testRunDocument.name, testRunDocument.projectId.toString(), runWorkDir, {
    scriptPath,
    metricsPath,
    summaryPath,
  });
  activeRuns.set(runId, state);

  await TestRun.updateOne(
    { _id: runId },
    {
      $set: {
        status: "running",
        startedAt: new Date(),
      },
    },
  );

  const childProcess = spawn(
    "k6",
    ["run", "--summary-export", summaryPath, "--out", `json=${metricsPath}`, scriptPath],
    {
      cwd: runWorkDir,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  state.process = childProcess;

  childProcess.stdout.on("data", (chunk) => appendTailLog(state.stdoutTail, chunk));
  childProcess.stderr.on("data", (chunk) => appendTailLog(state.stderrTail, chunk));

  childProcess.on("error", async (error) => {
    appendTailLog(state.stderrTail, Buffer.from(String(error?.message ?? "Unknown k6 error")));
    await finalize(state, 1);
  });

  childProcess.on("close", async (exitCode) => {
    await finalize(state, exitCode ?? 1);
  });

  state.metricsPollTimer = setInterval(async () => {
    try {
      await readAppendedMetrics(state);
    } catch {
      // Failures here should not crash server; finalize handles terminal state.
    }
  }, 1000);

  state.publishTimer = setInterval(async () => {
    try {
      await publishSnapshot(state);
    } catch {
      // Ignore transient persistence/emit failures.
    }
  }, 2000);
};
