import http from "node:http";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import bcrypt from "bcryptjs";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import mongoose from "mongoose";
import { Server } from "socket.io";
import { Project } from "./models/Project.js";
import { TestRun } from "./models/TestRun.js";
import { User } from "./models/User.js";
import { startK6Run, setSocketServer, getActiveRunSnapshots, hasActiveRun } from "./services/k6Runner.js";
import {
  AUTH_TOKEN_MAX_AGE_SECONDS,
  TWO_FACTOR_TOKEN_MAX_AGE_SECONDS,
  canRunProject,
  canViewProject,
  getRunnableProjectIds,
  getViewableProjectIds,
  readBearerToken,
  signAccessToken,
  signTwoFactorToken,
  toPublicUser,
  verifyAccessToken,
} from "./utils/auth.js";
import {
  decryptSecret,
  encryptSecret,
  generateTwoFactorSecret,
  toQrCodeDataUrl,
  verifyTwoFactorCode,
} from "./utils/twoFactor.js";
import { resolveScript } from "./utils/k6Script.js";

dotenv.config();

const port = Number(process.env.PORT ?? 4000);
const mongoUri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB ?? "loadpulse";
const clientOrigin = process.env.CLIENT_ORIGIN?.trim() || "*";
const jwtSecret = process.env.AUTH_JWT_SECRET?.trim() || randomBytes(48).toString("hex");

if (!mongoUri) {
  throw new Error("MONGODB_URI is required. Add it to your .env file.");
}
if (!process.env.AUTH_JWT_SECRET?.trim()) {
  console.warn("[auth] AUTH_JWT_SECRET was not provided. Generated a temporary secret for this runtime.");
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

const normalizeUsername = (value) => String(value ?? "").trim().toLowerCase();
const normalizeEmail = (value) => String(value ?? "").trim().toLowerCase();

const sanitizeProjectPermissions = (permissions) => {
  if (!Array.isArray(permissions)) {
    return [];
  }

  const normalized = [];
  const seen = new Set();

  for (const permission of permissions) {
    const projectId = String(permission?.projectId ?? "").trim();
    if (!projectId || !isValidObjectId(projectId) || seen.has(projectId)) {
      continue;
    }
    seen.add(projectId);

    const canRun = Boolean(permission?.canRun);
    const canView = Boolean(permission?.canView || canRun);

    normalized.push({
      projectId: new mongoose.Types.ObjectId(projectId),
      canView,
      canRun,
    });
  }

  return normalized;
};

const validateCreateUserPayload = (payload) => {
  const username = normalizeUsername(payload?.username);
  const email = normalizeEmail(payload?.email);
  const password = String(payload?.password ?? "");
  const isAdmin = Boolean(payload?.isAdmin);
  const projectPermissions = sanitizeProjectPermissions(payload?.projectPermissions);

  if (!username || username.length < 3) {
    return { error: "Username must be at least 3 characters." };
  }
  if (!/^[a-z0-9._-]+$/i.test(username)) {
    return { error: "Username can only include letters, numbers, dot, underscore, and dash." };
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "A valid email address is required." };
  }
  if (!password || password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (!isAdmin && projectPermissions.length === 0) {
    return { error: "Select at least one project permission, or mark the user as admin." };
  }

  return {
    value: {
      username,
      email,
      password,
      isAdmin,
      projectPermissions: isAdmin ? [] : projectPermissions,
    },
  };
};

const validateSetupAdminPayload = (payload) => {
  const username = normalizeUsername(payload?.username);
  const email = normalizeEmail(payload?.email);
  const password = String(payload?.password ?? "");

  if (!username || username.length < 3) {
    return { error: "Username must be at least 3 characters." };
  }
  if (!/^[a-z0-9._-]+$/i.test(username)) {
    return { error: "Username can only include letters, numbers, dot, underscore, and dash." };
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "A valid email address is required." };
  }
  if (!password || password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  return {
    value: {
      username,
      email,
      password,
    },
  };
};

const validateProfilePayload = (payload) => {
  const username = normalizeUsername(payload?.username);
  const email = normalizeEmail(payload?.email);
  const avatarDataUrl = String(payload?.avatarDataUrl ?? "").trim();

  if (!username || username.length < 3) {
    return { error: "Username must be at least 3 characters." };
  }
  if (!/^[a-z0-9._-]+$/i.test(username)) {
    return { error: "Username can only include letters, numbers, dot, underscore, and dash." };
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "A valid email address is required." };
  }
  if (avatarDataUrl && !/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(avatarDataUrl)) {
    return { error: "Profile photo must be a PNG, JPG, WEBP, or GIF image." };
  }
  if (avatarDataUrl.length > 1_500_000) {
    return { error: "Profile photo is too large. Use a smaller image." };
  }

  return {
    value: {
      username,
      email,
      avatarDataUrl,
    },
  };
};

const validatePasswordChangePayload = (payload) => {
  const currentPassword = String(payload?.currentPassword ?? "");
  const newPassword = String(payload?.newPassword ?? "");

  if (!currentPassword) {
    return { error: "Current password is required." };
  }
  if (!newPassword || newPassword.length < 8) {
    return { error: "New password must be at least 8 characters." };
  }

  return {
    value: {
      currentPassword,
      newPassword,
    },
  };
};

const validateAccessUpdatePayload = (payload) => {
  const isAdmin = Boolean(payload?.isAdmin);
  const projectPermissions = sanitizeProjectPermissions(payload?.projectPermissions);

  if (!isAdmin && projectPermissions.length === 0) {
    return { error: "Select at least one project permission, or make the user an admin." };
  }

  return {
    value: {
      isAdmin,
      projectPermissions: isAdmin ? [] : projectPermissions,
    },
  };
};

const authenticateRequest = async (req, res, next) => {
  const token = readBearerToken(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ error: "Authorization token is required." });
  }

  let payload;
  try {
    payload = verifyAccessToken(token, jwtSecret);
  } catch {
    return res.status(401).json({ error: "Invalid or expired authorization token." });
  }

  const userId = String(payload?.sub ?? "").trim();
  if (!isValidObjectId(userId)) {
    return res.status(401).json({ error: "Invalid authorization token payload." });
  }

  const user = await User.findById(userId).lean();
  if (!user) {
    return res.status(401).json({ error: "User account no longer exists." });
  }

  req.authUser = toPublicUser(user);
  return next();
};

const requireAdmin = (req, res, next) => {
  if (!req.authUser?.isAdmin) {
    return res.status(403).json({ error: "Admin access is required for this action." });
  }
  return next();
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

const getProjectStatsMap = async (projectIds = null) => {
  const hasProjectFilter = Array.isArray(projectIds);
  const safeProjectIds = hasProjectFilter
    ? projectIds.filter((projectId) => isValidObjectId(projectId)).map((projectId) => new mongoose.Types.ObjectId(projectId))
    : [];
  const matchStage = hasProjectFilter
    ? {
        $match: {
          projectId: { $in: safeProjectIds },
        },
      }
    : null;

  const [runStats, latestRuns] = await Promise.all([
    TestRun.aggregate([
      ...(matchStage ? [matchStage] : []),
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
      ...(matchStage ? [matchStage] : []),
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
io.use(async (socket, next) => {
  const socketToken = readBearerToken(
    socket.handshake?.auth?.token ?? socket.handshake?.headers?.authorization ?? socket.handshake?.query?.token,
  );
  if (!socketToken) {
    return next(new Error("Missing auth token"));
  }

  let payload;
  try {
    payload = verifyAccessToken(socketToken, jwtSecret);
  } catch {
    return next(new Error("Invalid auth token"));
  }

  const userId = String(payload?.sub ?? "").trim();
  if (!isValidObjectId(userId)) {
    return next(new Error("Invalid auth token"));
  }

  const user = await User.findById(userId).lean();
  if (!user) {
    return next(new Error("User not found"));
  }

  socket.data.authUser = toPublicUser(user);
  return next();
});

const emitToAuthorizedSockets = (eventName, payload) => {
  const projectId = payload?.projectId ? String(payload.projectId) : null;

  for (const socket of io.sockets.sockets.values()) {
    const user = socket.data?.authUser;
    if (!user) {
      continue;
    }
    if (!projectId || canViewProject(user, projectId)) {
      socket.emit(eventName, payload);
    }
  }
};

setSocketServer({
  emit: emitToAuthorizedSockets,
});

app.use(
  cors({
    origin: parseCorsOrigins(clientOrigin),
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));

app.use((req, _res, next) => {
  req.authUser = null;
  next();
});

app.get("/api/health", async (_req, res) => {
  const mongoState = mongoose.connection.readyState === 1 ? "up" : "down";
  res.json({
    status: "ok",
    mongo: mongoState,
    activeRuns: getActiveRunSnapshots().length,
    now: new Date().toISOString(),
  });
});

app.get("/api/auth/setup-status", async (_req, res) => {
  const adminExists = await User.exists({ isAdmin: true });
  return res.json({
    needsSetup: !adminExists,
  });
});

app.post("/api/auth/setup-admin", async (req, res) => {
  const adminExists = await User.exists({ isAdmin: true });
  if (adminExists) {
    return res.status(409).json({ error: "Initial setup is already complete." });
  }

  const { value, error } = validateSetupAdminPayload(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const duplicateAccount = await User.findOne({
    $or: [{ username: value.username }, { email: value.email }],
  }).lean();
  if (duplicateAccount) {
    return res.status(409).json({ error: "Username or email is already in use." });
  }

  const passwordHash = await bcrypt.hash(value.password, 12);
  const user = await User.create({
    username: value.username,
    email: value.email,
    passwordHash,
    isAdmin: true,
    projectPermissions: [],
  });

  const token = signAccessToken(user, jwtSecret);
  return res.status(201).json({
    token,
    expiresIn: AUTH_TOKEN_MAX_AGE_SECONDS,
    user: toPublicUser(user),
  });
});

app.post("/api/auth/signin", async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const password = String(req.body?.password ?? "");

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  const adminExists = await User.exists({ isAdmin: true });
  if (!adminExists) {
    return res.status(409).json({ error: "No admin account exists yet. Complete initial setup first." });
  }

  const user = await User.findOne({ username });
  if (!user) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  if (user.twoFactorEnabled) {
    const pendingToken = signTwoFactorToken(user, jwtSecret);
    return res.json({
      requiresTwoFactor: true,
      pendingToken,
      expiresIn: TWO_FACTOR_TOKEN_MAX_AGE_SECONDS,
      user: {
        username: user.username,
        email: user.email,
      },
    });
  }

  const token = signAccessToken(user, jwtSecret);
  return res.json({
    token,
    expiresIn: AUTH_TOKEN_MAX_AGE_SECONDS,
    user: toPublicUser(user),
  });
});

app.post("/api/auth/verify-2fa", async (req, res) => {
  const pendingToken = readBearerToken(req.body?.pendingToken);
  const code = String(req.body?.code ?? "").trim();

  if (!pendingToken || !code) {
    return res.status(400).json({ error: "Pending token and verification code are required." });
  }

  let payload;
  try {
    payload = verifyAccessToken(pendingToken, jwtSecret);
  } catch {
    return res.status(401).json({ error: "The 2-step verification session is invalid or expired." });
  }

  if (payload?.purpose !== "two-factor") {
    return res.status(401).json({ error: "Invalid 2-step verification token." });
  }

  const userId = String(payload?.sub ?? "").trim();
  if (!isValidObjectId(userId)) {
    return res.status(401).json({ error: "Invalid 2-step verification token." });
  }

  const user = await User.findById(userId);
  if (!user || !user.twoFactorEnabled || !user.twoFactorSecretEncrypted) {
    return res.status(401).json({ error: "2-step verification is not available for this account." });
  }

  const secret = decryptSecret(user.twoFactorSecretEncrypted, jwtSecret);
  const isValidCode = verifyTwoFactorCode(secret, code);
  if (!isValidCode) {
    return res.status(401).json({ error: "Invalid verification code." });
  }

  const token = signAccessToken(user, jwtSecret);
  return res.json({
    token,
    expiresIn: AUTH_TOKEN_MAX_AGE_SECONDS,
    user: toPublicUser(user),
  });
});

app.use("/api", (req, res, next) => {
  if (
    req.path === "/health" ||
    req.path === "/auth/signin" ||
    req.path === "/auth/verify-2fa" ||
    req.path === "/auth/setup-status" ||
    req.path === "/auth/setup-admin"
  ) {
    return next();
  }
  return authenticateRequest(req, res, next);
});

app.get("/api/auth/me", async (req, res) => {
  return res.json({
    user: req.authUser,
  });
});

app.patch("/api/auth/profile", async (req, res) => {
  const { value, error } = validateProfilePayload(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const duplicateUser = await User.findOne({
    _id: { $ne: req.authUser.id },
    $or: [{ username: value.username }, { email: value.email }],
  }).lean();
  if (duplicateUser) {
    return res.status(409).json({ error: "Username or email is already in use." });
  }

  const user = await User.findByIdAndUpdate(
    req.authUser.id,
    {
      $set: {
        username: value.username,
        email: value.email,
        avatarDataUrl: value.avatarDataUrl,
      },
    },
    { new: true },
  ).lean();

  return res.json({
    user: toPublicUser(user),
  });
});

app.post("/api/auth/change-password", async (req, res) => {
  const { value, error } = validatePasswordChangePayload(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const user = await User.findById(req.authUser.id);
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  const isPasswordValid = await bcrypt.compare(value.currentPassword, user.passwordHash);
  if (!isPasswordValid) {
    return res.status(401).json({ error: "Current password is incorrect." });
  }

  user.passwordHash = await bcrypt.hash(value.newPassword, 12);
  await user.save();

  return res.json({
    success: true,
    message: "Password updated successfully.",
  });
});

app.post("/api/auth/2fa/setup", async (req, res) => {
  const user = await User.findById(req.authUser.id);
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  const secret = generateTwoFactorSecret(user.username);
  user.pendingTwoFactorSecretEncrypted = encryptSecret(secret.base32, jwtSecret);
  await user.save();

  return res.json({
    qrCodeDataUrl: await toQrCodeDataUrl(secret.otpauth_url),
    manualKey: secret.base32,
  });
});

app.post("/api/auth/2fa/enable", async (req, res) => {
  const code = String(req.body?.code ?? "").trim();
  if (!code) {
    return res.status(400).json({ error: "Verification code is required." });
  }

  const user = await User.findById(req.authUser.id);
  if (!user || !user.pendingTwoFactorSecretEncrypted) {
    return res.status(400).json({ error: "Start 2-step setup first." });
  }

  const pendingSecret = decryptSecret(user.pendingTwoFactorSecretEncrypted, jwtSecret);
  const isValidCode = verifyTwoFactorCode(pendingSecret, code);
  if (!isValidCode) {
    return res.status(401).json({ error: "Invalid verification code." });
  }

  user.twoFactorSecretEncrypted = user.pendingTwoFactorSecretEncrypted;
  user.pendingTwoFactorSecretEncrypted = "";
  user.twoFactorEnabled = true;
  await user.save();

  return res.json({
    user: toPublicUser(user),
    message: "2-step authentication is now enabled.",
  });
});

app.post("/api/auth/2fa/disable", async (req, res) => {
  const code = String(req.body?.code ?? "").trim();
  if (!code) {
    return res.status(400).json({ error: "Verification code is required." });
  }

  const user = await User.findById(req.authUser.id);
  if (!user || !user.twoFactorEnabled || !user.twoFactorSecretEncrypted) {
    return res.status(400).json({ error: "2-step authentication is not enabled." });
  }

  const activeSecret = decryptSecret(user.twoFactorSecretEncrypted, jwtSecret);
  const isValidCode = verifyTwoFactorCode(activeSecret, code);
  if (!isValidCode) {
    return res.status(401).json({ error: "Invalid verification code." });
  }

  user.twoFactorEnabled = false;
  user.twoFactorSecretEncrypted = "";
  user.pendingTwoFactorSecretEncrypted = "";
  await user.save();

  return res.json({
    user: toPublicUser(user),
    message: "2-step authentication has been disabled.",
  });
});

app.get("/api/projects", async (req, res) => {
  const allowedProjectIds = getViewableProjectIds(req.authUser);
  const projectFilter = allowedProjectIds === null ? {} : { _id: { $in: allowedProjectIds } };
  const [projects, statsMap] = await Promise.all([
    Project.find(projectFilter).sort({ createdAt: -1 }).lean(),
    getProjectStatsMap(allowedProjectIds),
  ]);

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

app.post("/api/projects", requireAdmin, async (req, res) => {
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

app.delete("/api/projects/:id", requireAdmin, async (req, res) => {
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
  await User.updateMany({}, { $pull: { projectPermissions: { projectId: new mongoose.Types.ObjectId(projectId) } } });

  return res.json({
    success: true,
    deletedRuns: deletedRuns.deletedCount ?? 0,
  });
});

app.get("/api/users", requireAdmin, async (_req, res) => {
  const users = await User.find().sort({ createdAt: -1 }).lean();
  return res.json({
    data: users.map(toPublicUser),
  });
});

app.post("/api/users", requireAdmin, async (req, res) => {
  const { value, error } = validateCreateUserPayload(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  if (!value.isAdmin) {
    const projectIds = value.projectPermissions.map((permission) => permission.projectId);
    const existingCount = await Project.countDocuments({ _id: { $in: projectIds } });
    if (existingCount !== projectIds.length) {
      return res.status(400).json({ error: "One or more project permissions are invalid." });
    }
  }

  const existingUser = await User.findOne({
    $or: [{ username: value.username }, { email: value.email }],
  });
  if (existingUser) {
    return res.status(409).json({ error: "A user with that username or email already exists." });
  }

  const passwordHash = await bcrypt.hash(value.password, 12);
  const user = await User.create({
    username: value.username,
    email: value.email,
    passwordHash,
    isAdmin: value.isAdmin,
    projectPermissions: value.projectPermissions,
  });

  return res.status(201).json({
    data: toPublicUser(user),
  });
});

app.patch("/api/users/:id/access", requireAdmin, async (req, res) => {
  const userId = String(req.params.id ?? "").trim();
  if (!isValidObjectId(userId)) {
    return res.status(400).json({ error: "Invalid user id." });
  }

  const { value, error } = validateAccessUpdatePayload(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  if (!value.isAdmin) {
    if (user.isAdmin) {
      const adminCount = await User.countDocuments({ isAdmin: true });
      if (adminCount <= 1) {
        return res.status(409).json({ error: "At least one admin user must remain." });
      }
    }

    const projectIds = value.projectPermissions.map((permission) => permission.projectId);
    const existingCount = await Project.countDocuments({ _id: { $in: projectIds } });
    if (existingCount !== projectIds.length) {
      return res.status(400).json({ error: "One or more project permissions are invalid." });
    }
  }

  user.isAdmin = value.isAdmin;
  user.projectPermissions = value.projectPermissions;
  await user.save();

  return res.json({
    data: toPublicUser(user),
  });
});

app.post("/api/tests/run", async (req, res) => {
  const projectId = String(req.body?.projectId ?? "").trim();
  if (!isValidObjectId(projectId)) {
    return res.status(400).json({ error: "A valid projectId is required." });
  }
  if (!canRunProject(req.authUser, projectId)) {
    return res.status(403).json({ error: "You do not have permission to run tests for this project." });
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
  const allowedProjectIds = getViewableProjectIds(req.authUser);
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
    if (!canViewProject(req.authUser, projectId)) {
      return res.status(403).json({ error: "You do not have permission to view this project's history." });
    }
    filter.projectId = projectId;
  } else if (allowedProjectIds !== null) {
    filter.projectId = { $in: allowedProjectIds };
  }

  const runs = await TestRun.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  const total = await TestRun.countDocuments(filter);
  res.json({
    data: runs.map(toHistoryItem),
    total,
  });
});

app.delete("/api/tests/history", async (req, res) => {
  const allowedProjectIds = getRunnableProjectIds(req.authUser);
  const projectId = String(req.query.projectId ?? "").trim();
  const filter = { status: { $nin: ["running", "queued"] } };

  if (projectId) {
    if (!isValidObjectId(projectId)) {
      return res.status(400).json({ error: "Invalid projectId." });
    }
    if (!canRunProject(req.authUser, projectId)) {
      return res.status(403).json({ error: "You do not have permission to remove runs for this project." });
    }
    filter.projectId = projectId;
  } else if (allowedProjectIds !== null) {
    filter.projectId = { $in: allowedProjectIds };
  }

  const result = await TestRun.deleteMany(filter);
  res.json({
    deletedCount: result.deletedCount ?? 0,
    message: "Completed test history cleared.",
  });
});

app.delete("/api/tests/:id", async (req, res) => {
  const runId = String(req.params.id ?? "").trim();
  if (!isValidObjectId(runId)) {
    return res.status(400).json({ error: "Invalid test run id." });
  }
  if (hasActiveRun(runId)) {
    return res.status(409).json({
      error: "Cannot delete a running test.",
    });
  }

  const run = await TestRun.findById(runId).select({ projectId: 1 }).lean();
  if (!run) {
    return res.status(404).json({ error: "Test run not found." });
  }
  if (!canRunProject(req.authUser, run.projectId)) {
    return res.status(403).json({ error: "You do not have permission to delete this test run." });
  }

  const result = await TestRun.deleteOne({ _id: runId });
  if (!result.deletedCount) {
    return res.status(404).json({ error: "Test run not found." });
  }

  return res.json({ success: true });
});

app.get("/api/tests/:id", async (req, res) => {
  const runId = String(req.params.id ?? "").trim();
  if (!isValidObjectId(runId)) {
    return res.status(400).json({ error: "Invalid test run id." });
  }

  const run = await TestRun.findById(runId).lean();
  if (!run) {
    return res.status(404).json({ error: "Test run not found." });
  }
  if (!canViewProject(req.authUser, run.projectId)) {
    return res.status(403).json({ error: "You do not have permission to view this test run." });
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
  const allowedProjectIds = getViewableProjectIds(req.authUser);
  const projectId = String(req.query.projectId ?? "").trim();
  const hasProjectFilter = Boolean(projectId);
  if (hasProjectFilter && !isValidObjectId(projectId)) {
    return res.status(400).json({ error: "Invalid projectId." });
  }
  if (hasProjectFilter && !canViewProject(req.authUser, projectId)) {
    return res.status(403).json({ error: "You do not have permission to view this project dashboard." });
  }

  const queryFilter = hasProjectFilter ? { projectId } : allowedProjectIds === null ? {} : { projectId: { $in: allowedProjectIds } };

  let liveSnapshots = getActiveRunSnapshots(hasProjectFilter ? projectId : undefined);
  if (!hasProjectFilter && allowedProjectIds !== null) {
    liveSnapshots = liveSnapshots.filter((snapshot) => canViewProject(req.authUser, snapshot.projectId));
  }

  const [recentRuns, allRunsForStats] = await Promise.all([
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
  const authUser = socket.data?.authUser;
  const visibleActiveRuns = getActiveRunSnapshots().filter((snapshot) => canViewProject(authUser, snapshot.projectId));

  socket.emit("live:init", {
    activeRuns: visibleActiveRuns,
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
