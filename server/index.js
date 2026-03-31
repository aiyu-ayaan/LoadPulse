import http from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import mongoose from "mongoose";
import { Server } from "socket.io";
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

const toHistoryItem = (run) => ({
  id: run._id.toString(),
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

const toDashboardResponseFromRun = (run) => {
  if (!run) {
    return {
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
    };
  }

  const liveMetrics = run.liveMetrics ?? {};
  const finalMetrics = run.finalMetrics ?? {};
  const statusCodes = finalMetrics.statusCodes ?? liveMetrics.statusCodes ?? {
    ok2xx: 0,
    client4xx: 0,
    server5xx: 0,
    other: 0,
  };
  const totalStatuses =
    statusCodes.ok2xx + statusCodes.client4xx + statusCodes.server5xx + (statusCodes.other ?? 0);
  const safePercentage = (value) => (totalStatuses > 0 ? Number(((value / totalStatuses) * 100).toFixed(2)) : 0);

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
    statusData: [
      { name: "200 OK", value: safePercentage(statusCodes.ok2xx), color: "#3B82F6" },
      { name: "4xx Client", value: safePercentage(statusCodes.client4xx), color: "#8B5CF6" },
      { name: "5xx Server", value: safePercentage(statusCodes.server5xx), color: "#F43F5E" },
    ],
  };
};

const validateTestPayload = (payload) => {
  const name = String(payload?.name ?? "").trim();
  const targetUrl = String(payload?.targetUrl ?? "").trim();
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

app.post("/api/tests/run", async (req, res) => {
  const { value, error } = validateTestPayload(req.body);
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

  const runs = await TestRun.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  const total = await TestRun.countDocuments(filter);
  res.json({
    data: runs.map(toHistoryItem),
    total,
  });
});

app.delete("/api/tests/history", async (_req, res) => {
  const result = await TestRun.deleteMany({ status: { $ne: "running" } });
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

app.get("/api/dashboard/overview", async (_req, res) => {
  const liveSnapshots = getActiveRunSnapshots();
  const recentRuns = await TestRun.find().sort({ createdAt: -1 }).limit(8).lean();

  if (liveSnapshots.length > 0) {
    return res.json({
      ...liveSnapshots[0],
      recentRuns: recentRuns.map(toHistoryItem),
    });
  }

  const latestRun = recentRuns[0] ?? null;
  return res.json({
    ...toDashboardResponseFromRun(latestRun),
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
