import http from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import mongoose from "mongoose";
import { Server } from "socket.io";
import { Project } from "./models/Project.js";
import { TestRun } from "./models/TestRun.js";
import { startK6Run, setSocketServer, getActiveRunSnapshots, hasActiveRun } from "./services/k6Runner.js";
import { resolveScript } from "./utils/k6Script.js";

dotenv.config();

const port = Number(process.env.PORT ?? 4000);
const mongoUri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB ?? "loadpulse";
const clientOrigin = process.env.CLIENT_ORIGIN?.trim() || "*";

if (!mongoUri) {
  throw new Error("MONGODB_URI is required. Add it to your .env file.");
}

const parseCorsOrigins = (originValue) => {
  if (originValue === "*") {
    return true;
  }

  return originValue
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const toObjectIdString = (value) => String(value ?? "");
const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const emptyDashboard = () => ({
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
  statusCounts: {
    ok2xx: 0,
    client4xx: 0,
    server5xx: 0,
    other: 0,
  },
  activeRunCount: 0,
  runningTests: [],
});

const toStatusData = (statusCounts) => {
  const counts = {
    ok2xx: Number(statusCounts?.ok2xx ?? 0),
    client4xx: Number(statusCounts?.client4xx ?? 0),
    server5xx: Number(statusCounts?.server5xx ?? 0),
    other: Number(statusCounts?.other ?? 0),
  };
  const total = counts.ok2xx + counts.client4xx + counts.server5xx + counts.other;
  const pct = (value) => (total > 0 ? Number(((value / total) * 100).toFixed(2)) : 0);

  return [
    { name: "200 OK", value: pct(counts.ok2xx), color: "#3B82F6" },
    { name: "4xx Client", value: pct(counts.client4xx), color: "#8B5CF6" },
    { name: "5xx Server", value: pct(counts.server5xx), color: "#F43F5E" },
  ];
};

const toHistoryItem = (run) => ({
  id: run._id.toString(),
  projectId: toObjectIdString(run.projectId),
  projectName: run.projectName,
  projectBaseUrl: run.projectBaseUrl,
  name: run.name,
  targetUrl: run.targetUrl,
  status: run.status,
  type: run.type,
  region: run.region,
  vus: run.vus,
  duration: run.duration,
  createdAt: run.createdAt,
  startedAt: run.startedAt,
  endedAt: run.endedAt,
  avgLatencyMs: run.finalMetrics?.avgLatencyMs ?? run.liveMetrics?.avgLatencyMs ?? null,
  errorRatePct: run.finalMetrics?.errorRatePct ?? run.liveMetrics?.errorRatePct ?? null,
  totalRequests: run.finalMetrics?.totalRequests ?? run.liveMetrics?.totalRequests ?? null,
});

const toRunningTestSummary = (snapshot) => ({
  id: snapshot.currentRun.id,
  name: snapshot.currentRun.name,
  status: snapshot.currentRun.status,
  totalRequests: snapshot.kpis.totalRequests,
  avgResponseTimeMs: snapshot.kpis.avgResponseTimeMs,
  errorRatePct: snapshot.kpis.errorRatePct,
  throughputRps: snapshot.kpis.throughputRps,
  updatedAt: snapshot.updatedAt ?? new Date().toISOString(),
});

const toCompiledProjectKpis = (runs, fallbackKpis) => {
  if (!runs.length) {
    return fallbackKpis;
  }

  let totalRequests = 0;
  let weightedLatencySum = 0;
  let weightedErrorSum = 0;
  let throughputSum = 0;
  let throughputSamples = 0;

  for (const run of runs) {
    const finalMetrics = run.finalMetrics ?? {};
    const liveMetrics = run.liveMetrics ?? {};

    const requests = Number(finalMetrics.totalRequests ?? liveMetrics.totalRequests ?? 0);
    const avgLatency = Number(finalMetrics.avgLatencyMs ?? liveMetrics.avgLatencyMs ?? 0);
    const errorRate = Number(finalMetrics.errorRatePct ?? liveMetrics.errorRatePct ?? 0);
    const throughput = Number(finalMetrics.throughputRps ?? liveMetrics.throughputRps ?? 0);

    const weight = Math.max(1, requests);
    totalRequests += requests;
    weightedLatencySum += avgLatency * weight;
    weightedErrorSum += errorRate * weight;

    if (Number.isFinite(throughput) && throughput >= 0) {
      throughputSum += throughput;
      throughputSamples += 1;
    }
  }

  const denominator = Math.max(1, totalRequests || runs.length);
  return {
    totalRequests,
    avgResponseTimeMs: Number((weightedLatencySum / denominator).toFixed(2)),
    errorRatePct: Number((weightedErrorSum / denominator).toFixed(2)),
    throughputRps: Number((throughputSamples > 0 ? throughputSum / throughputSamples : 0).toFixed(2)),
  };
};

const toDashboardResponseFromRun = (run) => {
  if (!run) {
    return emptyDashboard();
  }

  const liveMetrics = run.liveMetrics ?? {};
  const finalMetrics = run.finalMetrics ?? {};
  const statusCounts = finalMetrics.statusCodes ?? liveMetrics.statusCodes ?? {
    ok2xx: 0,
    client4xx: 0,
    server5xx: 0,
    other: 0,
  };

  return {
    source: "latest",
    currentRun: {
      id: run._id.toString(),
      name: run.name,
      status: run.status,
    },
    kpis: {
      totalRequests: finalMetrics.totalRequests ?? liveMetrics.totalRequests ?? 0,
      avgResponseTimeMs: finalMetrics.avgLatencyMs ?? liveMetrics.avgLatencyMs ?? 0,
      errorRatePct: finalMetrics.errorRatePct ?? liveMetrics.errorRatePct ?? 0,
      throughputRps: finalMetrics.throughputRps ?? liveMetrics.throughputRps ?? 0,
    },
    responseTimeData: (liveMetrics.responseTimeSeries ?? []).map((point) => ({
      time: point.time,
      ms: point.value,
    })),
    rpsData: (liveMetrics.rpsSeries ?? []).map((point) => ({
      time: point.time,
      rps: point.value,
    })),
    statusData: toStatusData(statusCounts),
    statusCounts,
    activeRunCount: run.status === "running" ? 1 : 0,
    runningTests:
      run.status === "running"
        ? [
            {
              id: run._id.toString(),
              name: run.name,
              status: run.status,
              totalRequests: liveMetrics.totalRequests ?? 0,
              avgResponseTimeMs: liveMetrics.avgLatencyMs ?? 0,
              errorRatePct: liveMetrics.errorRatePct ?? 0,
              throughputRps: liveMetrics.throughputRps ?? 0,
              updatedAt: liveMetrics.lastUpdatedAt ?? run.updatedAt ?? new Date().toISOString(),
            },
          ]
        : [],
  };
};

const combineLiveSnapshots = (snapshots) => {
  if (snapshots.length === 0) {
    return emptyDashboard();
  }

  const responseByTime = new Map();
  const rpsByTime = new Map();
  const statusCounts = {
    ok2xx: 0,
    client4xx: 0,
    server5xx: 0,
    other: 0,
  };

  let totalRequests = 0;
  let weightedLatencySum = 0;
  let weightedErrorSum = 0;
  let throughputRps = 0;

  for (const snapshot of snapshots) {
    const reqCount = Number(snapshot?.kpis?.totalRequests ?? 0);
    const avgLatency = Number(snapshot?.kpis?.avgResponseTimeMs ?? 0);
    const errorRate = Number(snapshot?.kpis?.errorRatePct ?? 0);
    const runRps = Number(snapshot?.kpis?.throughputRps ?? 0);

    totalRequests += reqCount;
    weightedLatencySum += avgLatency * Math.max(1, reqCount);
    weightedErrorSum += errorRate * Math.max(1, reqCount);
    throughputRps += runRps;

    const counts = snapshot?.statusCounts ?? {};
    statusCounts.ok2xx += Number(counts.ok2xx ?? 0);
    statusCounts.client4xx += Number(counts.client4xx ?? 0);
    statusCounts.server5xx += Number(counts.server5xx ?? 0);
    statusCounts.other += Number(counts.other ?? 0);

    for (const point of snapshot?.responseTimeData ?? []) {
      if (!responseByTime.has(point.time)) {
        responseByTime.set(point.time, { sum: 0, count: 0 });
      }
      const current = responseByTime.get(point.time);
      current.sum += Number(point.ms ?? 0);
      current.count += 1;
    }

    for (const point of snapshot?.rpsData ?? []) {
      if (!rpsByTime.has(point.time)) {
        rpsByTime.set(point.time, 0);
      }
      rpsByTime.set(point.time, rpsByTime.get(point.time) + Number(point.rps ?? 0));
    }
  }

  const sortedResponse = [...responseByTime.entries()]
    .map(([time, value]) => ({
      time,
      ms: value.count > 0 ? Number((value.sum / value.count).toFixed(2)) : 0,
    }))
    .sort((a, b) => a.time.localeCompare(b.time));

  const sortedRps = [...rpsByTime.entries()]
    .map(([time, value]) => ({ time, rps: Number(value.toFixed(2)) }))
    .sort((a, b) => a.time.localeCompare(b.time));

  const denominator = Math.max(1, totalRequests);
  const avgResponseTimeMs = Number((weightedLatencySum / denominator).toFixed(2));
  const errorRatePct = Number((weightedErrorSum / denominator).toFixed(2));

  return {
    source: "live",
    currentRun:
      snapshots.length === 1
        ? snapshots[0].currentRun
        : {
            id: "multiple",
            name: `${snapshots.length} tests running`,
            status: "running",
          },
    kpis: {
      totalRequests,
      avgResponseTimeMs,
      errorRatePct,
      throughputRps: Number(throughputRps.toFixed(2)),
    },
    responseTimeData: sortedResponse,
    rpsData: sortedRps,
    statusData: toStatusData(statusCounts),
    statusCounts,
    activeRunCount: snapshots.length,
    runningTests: snapshots.map(toRunningTestSummary),
    updatedAt: new Date().toISOString(),
  };
};

const validateProjectPayload = (payload) => {
  const name = String(payload?.name ?? "").trim();
  const baseUrl = String(payload?.baseUrl ?? "").trim();
  const description = String(payload?.description ?? "").trim();

  if (!name || name.length < 3) {
    return { error: "Project name must be at least 3 characters." };
  }
  if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
    return { error: "Project URL must be a valid http/https URL." };
  }

  return {
    value: { name, baseUrl, description },
  };
};

const validateTestPayload = (payload, project) => {
  const name = String(payload?.name ?? "").trim();
  const targetUrl = String(payload?.targetUrl ?? project.baseUrl).trim();
  const type = String(payload?.type ?? "Load").trim();
  const region = String(payload?.region ?? "us-east-1").trim();
  const duration = String(payload?.duration ?? "").trim();
  const vusRaw = Number(payload?.vus);
  const vus = Number.isFinite(vusRaw) ? Math.floor(vusRaw) : Number.NaN;

  if (!name || name.length < 3) {
    return { error: "Test name must be at least 3 characters." };
  }
  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    return { error: "Target URL must be a valid http/https URL." };
  }
  if (!duration || !/^\d+[smh]$/i.test(duration)) {
    return { error: "Duration must look like 30s, 5m, or 1h." };
  }
  if (!Number.isFinite(vus) || vus <= 0) {
    return { error: "VUs must be a positive number." };
  }

  return {
    value: {
      projectId: project._id,
      projectName: project.name,
      projectBaseUrl: project.baseUrl,
      name,
      targetUrl,
      type,
      region,
      duration: duration.toLowerCase(),
      vus,
      script: resolveScript({
        script: payload?.script,
        targetUrl,
        duration: duration.toLowerCase(),
        vus,
      }),
    },
  };
};

const markOrphanedRuns = async () => {
  await TestRun.updateMany(
    {
      status: { $in: ["queued", "running"] },
      endedAt: null,
    },
    {
      $set: {
        status: "failed",
        endedAt: new Date(),
        errorMessage: "Run interrupted because backend restarted before completion.",
      },
    },
  );
};

const getProjectStatsMap = async () => {
  const [runStats, latestRuns] = await Promise.all([
    TestRun.aggregate([
      {
        $group: {
          _id: "$projectId",
          totalRuns: { $sum: 1 },
          activeRuns: {
            $sum: {
              $cond: [{ $in: ["$status", ["running", "queued"]] }, 1, 0],
            },
          },
          successfulRuns: {
            $sum: {
              $cond: [{ $eq: ["$status", "success"] }, 1, 0],
            },
          },
        },
      },
    ]),
    TestRun.aggregate([
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$projectId",
          lastRunAt: { $first: "$createdAt" },
          lastRunStatus: { $first: "$status" },
          lastRunName: { $first: "$name" },
        },
      },
    ]),
  ]);

  const statsMap = new Map();
  for (const stat of runStats) {
    statsMap.set(toObjectIdString(stat._id), {
      totalRuns: stat.totalRuns ?? 0,
      activeRuns: stat.activeRuns ?? 0,
      successfulRuns: stat.successfulRuns ?? 0,
      successRatePct:
        (stat.totalRuns ?? 0) > 0 ? Number((((stat.successfulRuns ?? 0) / stat.totalRuns) * 100).toFixed(1)) : 0,
    });
  }

  for (const latest of latestRuns) {
    const key = toObjectIdString(latest._id);
    const current = statsMap.get(key) ?? {
      totalRuns: 0,
      activeRuns: 0,
      successfulRuns: 0,
      successRatePct: 0,
    };
    statsMap.set(key, {
      ...current,
      lastRunAt: latest.lastRunAt ?? null,
      lastRunStatus: latest.lastRunStatus ?? null,
      lastRunName: latest.lastRunName ?? null,
    });
  }

  return statsMap;
};

await mongoose.connect(mongoUri, { dbName: databaseName });
await markOrphanedRuns();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: parseCorsOrigins(clientOrigin),
  },
});

setSocketServer(io);

app.use(
  cors({
    origin: parseCorsOrigins(clientOrigin),
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", async (_req, res) => {
  const mongoState = mongoose.connection.readyState === 1 ? "up" : "down";
  res.json({
    status: "ok",
    mongo: mongoState,
    activeRuns: getActiveRunSnapshots().length,
    now: new Date().toISOString(),
  });
});

app.get("/api/projects", async (_req, res) => {
  const [projects, statsMap] = await Promise.all([Project.find().sort({ createdAt: -1 }).lean(), getProjectStatsMap()]);
  res.json({
    data: projects.map((project) => ({
      id: project._id.toString(),
      name: project.name,
      baseUrl: project.baseUrl,
      description: project.description ?? "",
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      stats: statsMap.get(project._id.toString()) ?? {
        totalRuns: 0,
        activeRuns: 0,
        successfulRuns: 0,
        successRatePct: 0,
        lastRunAt: null,
        lastRunStatus: null,
        lastRunName: null,
      },
    })),
  });
});

app.post("/api/projects", async (req, res) => {
  const { value, error } = validateProjectPayload(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const project = await Project.create(value);
  return res.status(201).json({
    data: {
      id: project._id.toString(),
      name: project.name,
      baseUrl: project.baseUrl,
      description: project.description ?? "",
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      stats: {
        totalRuns: 0,
        activeRuns: 0,
        successfulRuns: 0,
        successRatePct: 0,
        lastRunAt: null,
        lastRunStatus: null,
        lastRunName: null,
      },
    },
  });
});

app.delete("/api/projects/:id", async (req, res) => {
  const projectId = String(req.params.id ?? "").trim();
  if (!isValidObjectId(projectId)) {
    return res.status(400).json({ error: "Invalid project id." });
  }

  const project = await Project.findById(projectId).lean();
  if (!project) {
    return res.status(404).json({ error: "Project not found." });
  }

  const activeCount = await TestRun.countDocuments({
    projectId,
    status: { $in: ["queued", "running"] },
  });
  if (activeCount > 0) {
    return res.status(409).json({
      error: "Stop or wait for running tests before deleting this project.",
    });
  }

  const deletedRuns = await TestRun.deleteMany({ projectId });
  await Project.deleteOne({ _id: projectId });

  return res.json({
    success: true,
    deletedRuns: deletedRuns.deletedCount ?? 0,
  });
});

app.post("/api/tests/run", async (req, res) => {
  const projectId = String(req.body?.projectId ?? "").trim();
  if (!isValidObjectId(projectId)) {
    return res.status(400).json({ error: "A valid projectId is required." });
  }

  const project = await Project.findById(projectId);
  if (!project) {
    return res.status(404).json({ error: "Project not found." });
  }

  const { value, error } = validateTestPayload(req.body, project);
  if (error) {
    return res.status(400).json({ error });
  }

  const testRun = await TestRun.create(value);

  void startK6Run(testRun).catch(async (runnerError) => {
    await TestRun.updateOne(
      { _id: testRun._id },
      {
        $set: {
          status: "failed",
          endedAt: new Date(),
          errorMessage: String(runnerError?.message ?? runnerError),
        },
      },
    );
  });

  return res.status(202).json({
    id: testRun._id.toString(),
    status: "queued",
    message: "k6 test scheduled.",
  });
});

app.get("/api/tests/history", async (req, res) => {
  const search = String(req.query.search ?? "").trim();
  const status = String(req.query.status ?? "").trim();
  const projectId = String(req.query.projectId ?? "").trim();
  const limit = Math.min(Number(req.query.limit ?? 100) || 100, 250);

  const filter = {};
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { targetUrl: { $regex: search, $options: "i" } },
      { type: { $regex: search, $options: "i" } },
    ];
  }
  if (status) {
    filter.status = status;
  }
  if (projectId) {
    if (!isValidObjectId(projectId)) {
      return res.status(400).json({ error: "Invalid projectId." });
    }
    filter.projectId = projectId;
  }

  const runs = await TestRun.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  const total = await TestRun.countDocuments(filter);
  res.json({
    data: runs.map(toHistoryItem),
    total,
  });
});

app.delete("/api/tests/history", async (req, res) => {
  const projectId = String(req.query.projectId ?? "").trim();
  const filter = { status: { $nin: ["running", "queued"] } };

  if (projectId) {
    if (!isValidObjectId(projectId)) {
      return res.status(400).json({ error: "Invalid projectId." });
    }
    filter.projectId = projectId;
  }

  const result = await TestRun.deleteMany(filter);
  res.json({
    deletedCount: result.deletedCount ?? 0,
    message: "Completed test history cleared.",
  });
});

app.delete("/api/tests/:id", async (req, res) => {
  const runId = req.params.id;
  if (hasActiveRun(runId)) {
    return res.status(409).json({
      error: "Cannot delete a running test.",
    });
  }

  const result = await TestRun.deleteOne({ _id: runId });
  if (!result.deletedCount) {
    return res.status(404).json({ error: "Test run not found." });
  }

  return res.json({ success: true });
});

app.get("/api/tests/:id", async (req, res) => {
  const run = await TestRun.findById(req.params.id).lean();
  if (!run) {
    return res.status(404).json({ error: "Test run not found." });
  }

  return res.json({
    data: {
      ...toHistoryItem(run),
      finalMetrics: run.finalMetrics ?? null,
      liveMetrics: run.liveMetrics ?? null,
      errorMessage: run.errorMessage ?? null,
      script: run.script,
    },
  });
});

app.get("/api/dashboard/overview", async (req, res) => {
  const projectId = String(req.query.projectId ?? "").trim();
  const hasProjectFilter = Boolean(projectId);
  if (hasProjectFilter && !isValidObjectId(projectId)) {
    return res.status(400).json({ error: "Invalid projectId." });
  }

  const queryFilter = hasProjectFilter ? { projectId } : {};
  const [liveSnapshots, recentRuns, allRunsForStats] = await Promise.all([
    Promise.resolve(getActiveRunSnapshots(hasProjectFilter ? projectId : undefined)),
    TestRun.find(queryFilter).sort({ createdAt: -1 }).limit(8).lean(),
    TestRun.find(queryFilter).select({ finalMetrics: 1, liveMetrics: 1 }).lean(),
  ]);

  if (liveSnapshots.length > 0) {
    const livePayload = combineLiveSnapshots(liveSnapshots);
    const compiledKpis = toCompiledProjectKpis(allRunsForStats, livePayload.kpis);
    return res.json({
      ...livePayload,
      kpis: compiledKpis,
      recentRuns: recentRuns.map(toHistoryItem),
    });
  }

  const latestRun = recentRuns[0] ?? null;
  const latestPayload = toDashboardResponseFromRun(latestRun);
  const compiledKpis = toCompiledProjectKpis(allRunsForStats, latestPayload.kpis);
  return res.json({
    ...latestPayload,
    kpis: compiledKpis,
    recentRuns: recentRuns.map(toHistoryItem),
  });
});

io.on("connection", (socket) => {
  socket.emit("live:init", {
    activeRuns: getActiveRunSnapshots(),
  });
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, "../dist");

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) {
      return next();
    }
    return res.sendFile(path.join(distPath, "index.html"));
  });
}

server.listen(port, () => {
  console.log(`LoadPulse API listening on http://localhost:${port}`);
});
