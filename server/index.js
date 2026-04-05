import http from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import bcrypt from "bcryptjs";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { Server } from "socket.io";
import cron from "node-cron";
import { Project } from "./models/Project.js";
import { TestRun } from "./models/TestRun.js";
import { User } from "./models/User.js";
import { Integration } from "./models/Integration.js";
import { ProjectIntegrationToken } from "./models/ProjectIntegrationToken.js";
import { AIIntegration } from "./models/AIIntegration.js";
import { AIModel } from "./models/AIModel.js";
import { AISetting } from "./models/AISetting.js";
import { AIHistoryEvent } from "./models/AIHistoryEvent.js";
import { startK6Run, setSocketServer, getActiveRunSnapshots, hasActiveRun, stopActiveRun } from "./services/k6Runner.js";
import { getSchedulerJobCount, initIntegrationScheduler, scheduleIntegration, unscheduleIntegration } from "./services/integrationScheduler.js";
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
import {
  deleteCacheByPrefix,
  getCacheHealth,
  getCachedJson,
  initCache,
  setCachedJson,
} from "./utils/cache.js";

dotenv.config();

const port = Number(process.env.BACKEND_PORT ?? process.env.PORT ?? 4000);
const frontendPort = Number(process.env.FRONTEND_PORT ?? 5173);
const mongoUri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB ?? "loadpulse";
const clientOrigin = process.env.CLIENT_ORIGIN?.trim() || `http://localhost:${frontendPort}`;
const jwtSecret = process.env.AUTH_JWT_SECRET?.trim() || randomBytes(48).toString("hex");
const githubClientId = process.env.GITHUB_CLIENT_ID?.trim() || "";
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET?.trim() || "";
const githubCallbackUrl = process.env.GITHUB_CALLBACK_URL?.trim() || "";
const githubEnabled = Boolean(githubClientId && githubClientSecret && githubCallbackUrl);
const packageJsonPath = path.resolve(process.cwd(), "package.json");

let packageMetadata = {
  name: "loadpulse",
  version: "0.0.0",
  dependencies: {},
  devDependencies: {},
};
try {
  if (fs.existsSync(packageJsonPath)) {
    packageMetadata = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  }
} catch (error) {
  console.warn("[metadata] Unable to read package.json for admin about page:", String(error?.message ?? error));
}

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

const resolvePrimaryClientOrigin = (originValue) => {
  if (!originValue || originValue === "*") {
    return "http://localhost:5173";
  }

  return (
    originValue
      .split(",")
      .map((item) => item.trim())
      .find(Boolean) ?? "http://localhost:5173"
  );
};

const toObjectIdString = (value) => String(value ?? "");
const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);
const clientAppOrigin = resolvePrimaryClientOrigin(clientOrigin);
const AUTH_COOKIE_NAME = "loadpulse_auth";
const authCookieSecure = clientAppOrigin.startsWith("https://");
const authCookieBaseOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: authCookieSecure,
  path: "/",
};
const CACHE_KEY_PREFIX = "loadpulse:api:v1";
const CACHE_TTL_SECONDS = Object.freeze({
  projects: 20,
  usersSearch: 20,
  projectAccess: 20,
  testsHistory: 15,
  testDetail: 15,
  dashboard: 10,
  adminUsers: 20,
  adminAi: 20,
  integrations: 20,
  projectToken: 20,
});
const PROJECT_TOKEN_PREFIX = "lpt_";
const AI_PROVIDERS = Object.freeze(["google", "groq", "openrouter", "ollama"]);
const PROVIDERS_REQUIRING_API_KEY = new Set(["google", "groq", "openrouter"]);
const PROVIDER_DEFAULT_BASE_URL = Object.freeze({
  google: "https://generativelanguage.googleapis.com",
  groq: "https://api.groq.com",
  openrouter: "https://openrouter.ai",
  ollama: "http://localhost:11434",
});
const FALLBACK_PROVIDER_MODELS = Object.freeze({
  google: [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
  ],
  groq: [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "deepseek-r1-distill-llama-70b",
    "mixtral-8x7b-32768",
  ],
  openrouter: [
    "openai/gpt-4.1-mini",
    "anthropic/claude-3.7-sonnet",
    "google/gemini-2.0-flash-001",
    "meta-llama/llama-3.3-70b-instruct",
  ],
  ollama: [
    "llama3.2",
    "mistral",
    "qwen2.5",
    "phi4",
  ],
});

const toStableObject = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => toStableObject(entry));
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = toStableObject(value[key]);
        return acc;
      }, {});
  }
  return value;
};

const buildCacheKey = (scope, authUser, payload = {}) => {
  const digest = createHash("sha1")
    .update(
      JSON.stringify(
        toStableObject({
          userId: authUser?.id ?? "anonymous",
          payload,
        }),
      ),
    )
    .digest("hex");

  return `${CACHE_KEY_PREFIX}:${scope}:${digest}`;
};

const invalidateApiCache = async () => {
  await deleteCacheByPrefix(CACHE_KEY_PREFIX);
};

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
  hasAiSummary: Boolean(run?.aiSummary?.text),
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

const validateIntegrationPayload = (payload, project) => {
  const testValidation = validateTestPayload(payload, project);
  if (testValidation.error) {
    return testValidation;
  }

  const triggerType = String(payload?.triggerType ?? "cron").trim().toLowerCase();
  const cronExpression = String(payload?.cronExpression ?? "").trim();
  const timezone = String(payload?.timezone ?? "UTC").trim() || "UTC";
  const isEnabled = payload?.isEnabled === undefined ? true : Boolean(payload?.isEnabled);
  if (!["cron", "api"].includes(triggerType)) {
    return { error: "Trigger type must be either cron or api." };
  }
  if (triggerType === "cron" && (!cronExpression || !cron.validate(cronExpression))) {
    return { error: "A valid cron expression is required for cron integrations." };
  }

  return {
    value: {
      ...testValidation.value,
      triggerType,
      cronExpression: triggerType === "cron" ? cronExpression : "",
      timezone,
      isEnabled,
      allowApiTrigger: triggerType === "api",
    },
  };
};

const toIntegrationResponse = (integration) => ({
  id: toObjectIdString(integration?._id),
  projectId: toObjectIdString(integration?.projectId),
  name: integration?.name ?? "",
  targetUrl: integration?.targetUrl ?? "",
  type: integration?.type ?? "Load",
  region: integration?.region ?? "us-east-1",
  vus: Number(integration?.vus ?? 1),
  duration: integration?.duration ?? "30s",
  script: integration?.script ?? "",
  triggerType: integration?.triggerType ?? "cron",
  cronExpression: integration?.cronExpression ?? "",
  timezone: integration?.timezone ?? "UTC",
  isEnabled: Boolean(integration?.isEnabled),
  allowApiTrigger: Boolean(integration?.allowApiTrigger),
  lastTriggeredAt: integration?.lastTriggeredAt ?? null,
  lastRunId: toObjectIdString(integration?.lastRunId) || null,
  lastRunStatus: integration?.lastRunStatus ?? "",
  lastTriggerSource: integration?.lastTriggerSource ?? "",
  lastError: integration?.lastError ?? "",
  createdAt: integration?.createdAt ?? null,
  updatedAt: integration?.updatedAt ?? null,
  hookPath: `/api/integrations/hooks/${toObjectIdString(integration?._id)}`,
});

const toProjectIntegrationTokenMeta = (tokenDoc) => ({
  hasToken: Boolean(tokenDoc),
  preview: tokenDoc?.tokenPreview ?? "",
  updatedAt: tokenDoc?.updatedAt ?? null,
  lastUsedAt: tokenDoc?.lastUsedAt ?? null,
});

const hashProjectToken = (token) => createHash("sha256").update(String(token ?? "")).digest("hex");

const generateProjectToken = () => `${PROJECT_TOKEN_PREFIX}${randomBytes(24).toString("hex")}`;

const readProjectTokenFromRequest = (req) =>
  readBearerToken(req.headers.authorization ?? req.headers["x-project-token"] ?? req.query?.token ?? req.body?.token);

const normalizeAiProvider = (value) => String(value ?? "").trim().toLowerCase();

const normalizeBaseUrl = (value) => String(value ?? "").trim().replace(/\/+$/, "");

const isValidHttpUrl = (value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const toSecretPreview = (secret) => {
  const raw = String(secret ?? "");
  if (!raw) {
    return "";
  }
  if (raw.length <= 4) {
    return "*".repeat(raw.length);
  }
  const head = raw.slice(0, Math.min(4, raw.length));
  const tail = raw.slice(-Math.min(4, raw.length));
  return `${head}...${tail}`;
};

const resolveAiIntegrationBaseUrl = (provider, baseUrl) => {
  const normalizedProvider = normalizeAiProvider(provider);
  const fallback = PROVIDER_DEFAULT_BASE_URL[normalizedProvider] ?? "";
  const normalized = normalizeBaseUrl(baseUrl);
  return normalized || fallback;
};

const sanitizeModelList = (models) => {
  const seen = new Set();
  const rows = [];
  for (const entry of models ?? []) {
    const id = String(entry ?? "").trim();
    if (!id) {
      continue;
    }
    const key = id.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    rows.push(id);
  }
  return rows.sort((a, b) => a.localeCompare(b));
};

const fetchJsonWithTimeout = async (url, init = {}, timeoutMs = 9000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    const raw = await response.text();
    let parsed;
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch {
      parsed = {};
    }
    if (!response.ok) {
      const message = String(parsed?.error?.message ?? parsed?.error ?? raw ?? "").trim();
      throw new Error(message || `Request failed with status ${response.status}`);
    }
    return parsed;
  } finally {
    clearTimeout(timeout);
  }
};

const listProviderModelsFromRemote = async (integrationDoc) => {
  const provider = normalizeAiProvider(integrationDoc?.provider);
  const baseUrl = resolveAiIntegrationBaseUrl(provider, integrationDoc?.baseUrl);
  const apiKey = decryptSecret(integrationDoc?.apiKeyEncrypted, jwtSecret);

  if (PROVIDERS_REQUIRING_API_KEY.has(provider) && !apiKey) {
    throw new Error(`An API key is required for ${provider} integrations.`);
  }

  if (provider === "google") {
    const url = new URL("/v1beta/models", baseUrl);
    url.searchParams.set("key", apiKey);
    const payload = await fetchJsonWithTimeout(url.toString());
    return sanitizeModelList(
      (payload?.models ?? [])
        .filter((model) => {
          const methods = Array.isArray(model?.supportedGenerationMethods) ? model.supportedGenerationMethods : [];
          return methods.length === 0 || methods.includes("generateContent");
        })
        .map((model) => String(model?.name ?? "").replace(/^models\//, "")),
    );
  }

  if (provider === "groq") {
    const url = new URL("/openai/v1/models", baseUrl);
    const payload = await fetchJsonWithTimeout(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    return sanitizeModelList((payload?.data ?? []).map((model) => model?.id));
  }

  if (provider === "openrouter") {
    const url = new URL("/api/v1/models", baseUrl);
    const headers = {};
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    const payload = await fetchJsonWithTimeout(url.toString(), { headers });
    return sanitizeModelList((payload?.data ?? []).map((model) => model?.id));
  }

  if (provider === "ollama") {
    const url = new URL("/api/tags", baseUrl);
    const payload = await fetchJsonWithTimeout(url.toString());
    return sanitizeModelList((payload?.models ?? []).map((model) => model?.name));
  }

  throw new Error("Unsupported provider.");
};

const listProviderModels = async (integrationDoc) => {
  const provider = normalizeAiProvider(integrationDoc?.provider);
  try {
    const remoteModels = await listProviderModelsFromRemote(integrationDoc);
    if (remoteModels.length > 0) {
      return { models: remoteModels, source: "remote", warning: "" };
    }
    return {
      models: sanitizeModelList(FALLBACK_PROVIDER_MODELS[provider] ?? []),
      source: "fallback",
      warning: "No models were returned by provider. Showing fallback models.",
    };
  } catch (error) {
    return {
      models: sanitizeModelList(FALLBACK_PROVIDER_MODELS[provider] ?? []),
      source: "fallback",
      warning: String(error?.message ?? error ?? "Unable to fetch models from provider."),
    };
  }
};

const toAIIntegrationResponse = (integrationDoc, modelCount = 0) => ({
  id: integrationDoc._id.toString(),
  name: integrationDoc.name,
  provider: normalizeAiProvider(integrationDoc.provider),
  baseUrl: resolveAiIntegrationBaseUrl(integrationDoc.provider, integrationDoc.baseUrl),
  isEnabled: integrationDoc.isEnabled !== false,
  hasApiKey: Boolean(integrationDoc.apiKeyEncrypted),
  apiKeyPreview: integrationDoc.apiKeyPreview ?? "",
  modelCount: Number(modelCount ?? 0),
  lastValidatedAt: integrationDoc.lastValidatedAt ?? null,
  lastError: integrationDoc.lastError ?? "",
  createdAt: integrationDoc.createdAt,
  updatedAt: integrationDoc.updatedAt,
});

const toAIModelResponse = (modelDoc, integrationDoc = null) => ({
  id: modelDoc._id.toString(),
  name: modelDoc.name,
  integrationId: toObjectIdString(modelDoc.integrationId),
  integrationName: integrationDoc?.name ?? "",
  provider: normalizeAiProvider(modelDoc.provider),
  providerModelId: modelDoc.providerModelId,
  priority: Number(modelDoc.priority ?? 1),
  isEnabled: modelDoc.isEnabled !== false,
  lastUsedAt: modelDoc.lastUsedAt ?? null,
  lastError: modelDoc.lastError ?? "",
  createdAt: modelDoc.createdAt,
  updatedAt: modelDoc.updatedAt,
});

const normalizeAiModelPriorities = async () => {
  const ordered = await AIModel.find({}).sort({ priority: 1, createdAt: 1 });
  const operations = [];
  for (let index = 0; index < ordered.length; index += 1) {
    const nextPriority = index + 1;
    if (Number(ordered[index].priority) !== nextPriority) {
      operations.push({
        updateOne: {
          filter: { _id: ordered[index]._id },
          update: { $set: { priority: nextPriority } },
        },
      });
      ordered[index].priority = nextPriority;
    }
  }

  if (operations.length > 0) {
    await AIModel.bulkWrite(operations);
  }

  return ordered;
};

const validateAiIntegrationCreatePayload = (payload) => {
  const name = String(payload?.name ?? "").trim();
  const provider = normalizeAiProvider(payload?.provider);
  const apiKey = String(payload?.apiKey ?? "").trim();
  const baseUrl = normalizeBaseUrl(payload?.baseUrl);
  const isEnabled = payload?.isEnabled === undefined ? true : Boolean(payload?.isEnabled);

  if (!name || name.length < 2) {
    return { error: "Integration name must be at least 2 characters." };
  }
  if (!AI_PROVIDERS.includes(provider)) {
    return { error: "Provider must be one of: google, groq, openrouter, ollama." };
  }
  if (PROVIDERS_REQUIRING_API_KEY.has(provider) && !apiKey) {
    return { error: `API key is required for ${provider}.` };
  }

  const resolvedBaseUrl = resolveAiIntegrationBaseUrl(provider, baseUrl);
  if (resolvedBaseUrl && !isValidHttpUrl(resolvedBaseUrl)) {
    return { error: "Base URL must be a valid http/https URL." };
  }

  return {
    value: {
      name,
      provider,
      apiKey,
      baseUrl: resolvedBaseUrl,
      isEnabled,
    },
  };
};

const validateAiModelCreatePayload = (payload) => {
  const name = String(payload?.name ?? "").trim();
  const integrationId = String(payload?.integrationId ?? "").trim();
  const providerModelId = String(payload?.providerModelId ?? "").trim();
  const priorityRaw = Number(payload?.priority);
  const isEnabled = payload?.isEnabled === undefined ? true : Boolean(payload?.isEnabled);

  if (!name || name.length < 2) {
    return { error: "AI model name must be at least 2 characters." };
  }
  if (!isValidObjectId(integrationId)) {
    return { error: "A valid integrationId is required." };
  }
  if (!providerModelId) {
    return { error: "A provider model id is required." };
  }

  return {
    value: {
      name,
      integrationId,
      providerModelId,
      priority: Number.isFinite(priorityRaw) && priorityRaw > 0 ? Math.floor(priorityRaw) : null,
      isEnabled,
    },
  };
};

const TERMINAL_TEST_STATUSES = new Set(["success", "failed", "stopped"]);
const AI_SETTINGS_KEY = "default";

const parseAiContentToText = (value) => {
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object" && typeof item.text === "string") {
          return item.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
};

const normalizeAiSummaryMarkdown = (value) => {
  let text = String(value ?? "").trim();
  if (!text) {
    return "";
  }

  text = text
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .replace(/<analysis\b[^>]*>[\s\S]*?<\/analysis>/gi, "")
    .trim();

  const fencedMarkdown = text.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMarkdown?.[1]) {
    text = fencedMarkdown[1].trim();
  }

  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const truncateText = (value, maxLength = 12000) => {
  const text = String(value ?? "");
  if (!text) {
    return "";
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 24))}\n...[truncated]`;
};

const estimateTokensFromText = (text) => {
  const chars = String(text ?? "").length;
  return chars > 0 ? Math.max(1, Math.round(chars / 4)) : 0;
};

const toAiUsage = (usageLike = {}, fallbackText = "") => {
  const promptTokens = Number(usageLike?.promptTokens ?? usageLike?.prompt_tokens ?? usageLike?.prompt_eval_count ?? 0);
  const completionTokens = Number(usageLike?.completionTokens ?? usageLike?.completion_tokens ?? usageLike?.eval_count ?? 0);
  const totalTokensRaw = Number(usageLike?.totalTokens ?? usageLike?.total_tokens ?? usageLike?.totalTokenCount ?? 0);
  const estimated = estimateTokensFromText(fallbackText);

  const normalizedPrompt = Number.isFinite(promptTokens) && promptTokens > 0 ? Math.floor(promptTokens) : 0;
  const normalizedCompletion = Number.isFinite(completionTokens) && completionTokens > 0 ? Math.floor(completionTokens) : 0;
  const normalizedTotal =
    Number.isFinite(totalTokensRaw) && totalTokensRaw > 0
      ? Math.floor(totalTokensRaw)
      : normalizedPrompt + normalizedCompletion > 0
        ? normalizedPrompt + normalizedCompletion
        : estimated;

  return {
    promptTokens: normalizedPrompt,
    completionTokens: normalizedCompletion,
    totalTokens: normalizedTotal,
  };
};

const getAiSettings = async () => {
  const existing = await AISetting.findOne({ key: AI_SETTINGS_KEY });
  if (existing) {
    return existing;
  }

  const created = await AISetting.create({
    key: AI_SETTINGS_KEY,
    autoGenerateTestSummary: false,
  });
  return created;
};

const toAiSettingsResponse = (setting) => ({
  autoGenerateTestSummary: Boolean(setting?.autoGenerateTestSummary),
  updatedAt: setting?.updatedAt ?? null,
});

const validateAiSettingsPayload = (payload) => {
  const hasAutoGenerate = Object.prototype.hasOwnProperty.call(payload ?? {}, "autoGenerateTestSummary");
  if (!hasAutoGenerate) {
    return { error: "autoGenerateTestSummary is required." };
  }

  return {
    value: {
      autoGenerateTestSummary: Boolean(payload?.autoGenerateTestSummary),
    },
  };
};

const toObjectIdOrNull = (value) => {
  const normalized = String(value ?? "").trim();
  if (!normalized || !isValidObjectId(normalized)) {
    return null;
  }
  return new mongoose.Types.ObjectId(normalized);
};

const writeAiHistoryEvent = async (payload) => {
  try {
    await AIHistoryEvent.create({
      contextType: String(payload?.contextType ?? "other"),
      contextAction: String(payload?.contextAction ?? "").trim(),
      projectId: toObjectIdOrNull(payload?.projectId),
      runId: toObjectIdOrNull(payload?.runId),
      actorUserId: toObjectIdOrNull(payload?.actorUserId),
      actorUsername: String(payload?.actorUsername ?? "").trim(),
      actorEmail: String(payload?.actorEmail ?? "").trim().toLowerCase(),
      provider: String(payload?.provider ?? "").trim().toLowerCase(),
      integrationId: toObjectIdOrNull(payload?.integrationId),
      integrationName: String(payload?.integrationName ?? "").trim(),
      modelId: toObjectIdOrNull(payload?.modelId),
      modelName: String(payload?.modelName ?? "").trim(),
      providerModelId: String(payload?.providerModelId ?? "").trim(),
      status: String(payload?.status ?? "failed") === "success" ? "success" : "failed",
      error: truncateText(payload?.error, 2000),
      promptSystem: truncateText(payload?.promptSystem, 20000),
      promptUser: truncateText(payload?.promptUser, 40000),
      responsePreview: truncateText(payload?.responsePreview, 16000),
      promptChars: Math.max(0, Number(payload?.promptChars ?? 0) || 0),
      responseChars: Math.max(0, Number(payload?.responseChars ?? 0) || 0),
      promptTokens: Math.max(0, Number(payload?.promptTokens ?? 0) || 0),
      completionTokens: Math.max(0, Number(payload?.completionTokens ?? 0) || 0),
      totalTokens: Math.max(0, Number(payload?.totalTokens ?? 0) || 0),
    });
  } catch (historyError) {
    console.warn("[ai-history] Unable to write AI history event:", String(historyError?.message ?? historyError));
  }
};

const extractJsonObjectFromText = (text) => {
  const raw = String(text ?? "").trim();
  if (!raw) {
    throw new Error("AI returned an empty response.");
  }

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return JSON.parse(fencedMatch[1]);
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
  }

  return JSON.parse(raw);
};

const toAiRunMetricsContext = (run) => {
  const finalMetrics = run?.finalMetrics ?? null;
  const liveMetrics = run?.liveMetrics ?? null;
  const metrics = finalMetrics ?? liveMetrics ?? {};
  const statusCodes = metrics?.statusCodes ?? {
    ok2xx: 0,
    client4xx: 0,
    server5xx: 0,
    other: 0,
  };

  return {
    runId: toObjectIdString(run?._id),
    name: run?.name ?? "",
    status: run?.status ?? "",
    type: run?.type ?? "",
    targetUrl: run?.targetUrl ?? "",
    vus: Number(run?.vus ?? 0),
    duration: run?.duration ?? "",
    startedAt: run?.startedAt ?? null,
    endedAt: run?.endedAt ?? null,
    totals: {
      totalRequests: Number(metrics?.totalRequests ?? 0),
      throughputRps: Number(metrics?.throughputRps ?? 0),
      errorRatePct: Number(metrics?.errorRatePct ?? 0),
    },
    latencyMs: {
      avg: Number(metrics?.avgLatencyMs ?? 0),
      p95: Number(metrics?.p95LatencyMs ?? 0),
      p99: Number(metrics?.p99LatencyMs ?? 0),
    },
    checks: {
      passed: Number(finalMetrics?.checksPassed ?? 0),
      failed: Number(finalMetrics?.checksFailed ?? 0),
    },
    statusCodes: {
      ok2xx: Number(statusCodes?.ok2xx ?? 0),
      client4xx: Number(statusCodes?.client4xx ?? 0),
      server5xx: Number(statusCodes?.server5xx ?? 0),
      other: Number(statusCodes?.other ?? 0),
    },
    errorMessage: run?.errorMessage ?? "",
  };
};

const loadEnabledAiExecutionChain = async () => {
  const models = await AIModel.find({ isEnabled: true }).sort({ priority: 1, createdAt: 1 });
  if (models.length === 0) {
    return [];
  }

  const integrationIds = [...new Set(models.map((model) => toObjectIdString(model.integrationId)).filter(Boolean))];
  const integrations = await AIIntegration.find({ _id: { $in: integrationIds }, isEnabled: true });
  const integrationById = new Map(integrations.map((integration) => [integration._id.toString(), integration]));

  return models
    .map((model) => ({
      model,
      integration: integrationById.get(toObjectIdString(model.integrationId)) ?? null,
    }))
    .filter((entry) => Boolean(entry.integration));
};

const runSingleAiModelCompletion = async (entry, payload) => {
  const provider = normalizeAiProvider(entry?.model?.provider);
  const integration = entry.integration;
  const modelId = String(entry?.model?.providerModelId ?? "").trim();
  if (!modelId) {
    throw new Error("Provider model id is missing.");
  }

  const baseUrl = resolveAiIntegrationBaseUrl(provider, integration?.baseUrl);
  if (!baseUrl || !isValidHttpUrl(baseUrl)) {
    throw new Error("Integration base URL is invalid.");
  }

  const apiKey = decryptSecret(integration?.apiKeyEncrypted, jwtSecret);
  if (PROVIDERS_REQUIRING_API_KEY.has(provider) && !apiKey) {
    throw new Error(`API key is missing for ${provider}.`);
  }

  const systemPrompt = String(payload?.systemPrompt ?? "").trim();
  const userPrompt = String(payload?.userPrompt ?? "").trim();
  const maxTokens = Math.max(128, Math.min(1800, Number(payload?.maxTokens ?? 700) || 700));
  const temperature = Math.max(0, Math.min(1.2, Number(payload?.temperature ?? 0.25)));

  if (provider === "google") {
    const url = new URL(`/v1beta/models/${encodeURIComponent(modelId)}:generateContent`, baseUrl);
    url.searchParams.set("key", apiKey);
    const response = await fetchJsonWithTimeout(
      url.toString(),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
          },
          contents: [
            {
              role: "user",
              parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
            },
          ],
        }),
      },
      15000,
    );
    const text = parseAiContentToText(response?.candidates?.[0]?.content?.parts ?? []);
    if (!text) {
      throw new Error("Google returned an empty response.");
    }
    return {
      text,
      usage: toAiUsage(
        {
          promptTokens: response?.usageMetadata?.promptTokenCount,
          completionTokens: response?.usageMetadata?.candidatesTokenCount,
          totalTokens: response?.usageMetadata?.totalTokenCount,
        },
        text,
      ),
    };
  }

  if (provider === "groq") {
    const url = new URL("/openai/v1/chat/completions", baseUrl);
    const response = await fetchJsonWithTimeout(
      url.toString(),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelId,
          temperature,
          max_tokens: maxTokens,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      },
      15000,
    );
    const text = parseAiContentToText(response?.choices?.[0]?.message?.content);
    if (!text) {
      throw new Error("Groq returned an empty response.");
    }
    return {
      text,
      usage: toAiUsage(response?.usage ?? {}, text),
    };
  }

  if (provider === "openrouter") {
    const url = new URL("/api/v1/chat/completions", baseUrl);
    const response = await fetchJsonWithTimeout(
      url.toString(),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelId,
          temperature,
          max_tokens: maxTokens,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      },
      15000,
    );
    const text = parseAiContentToText(response?.choices?.[0]?.message?.content);
    if (!text) {
      throw new Error("OpenRouter returned an empty response.");
    }
    return {
      text,
      usage: toAiUsage(response?.usage ?? {}, text),
    };
  }

  if (provider === "ollama") {
    const url = new URL("/api/chat", baseUrl);
    const response = await fetchJsonWithTimeout(
      url.toString(),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelId,
          stream: false,
          options: {
            temperature,
            num_predict: maxTokens,
          },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      },
      20000,
    );
    const text = parseAiContentToText(response?.message?.content ?? response?.response);
    if (!text) {
      throw new Error("Ollama returned an empty response.");
    }
    return {
      text,
      usage: toAiUsage(
        {
          promptTokens: response?.prompt_eval_count,
          completionTokens: response?.eval_count,
        },
        text,
      ),
    };
  }

  throw new Error(`Unsupported AI provider: ${provider}`);
};

const executeAiWithFallback = async (payload, options = {}) => {
  const chain = await loadEnabledAiExecutionChain();
  if (chain.length === 0) {
    throw new Error("No enabled AI models are configured. Add AI integration and models in Admin > AI.");
  }

  const failures = [];
  for (const entry of chain) {
    const provider = normalizeAiProvider(entry.model.provider);
    try {
      const completion = await runSingleAiModelCompletion(entry, payload);
      const text = String(completion?.text ?? "").trim();
      const usage = toAiUsage(completion?.usage ?? {}, text);
      await Promise.all([
        AIModel.updateOne(
          { _id: entry.model._id },
          {
            $set: {
              lastUsedAt: new Date(),
              lastError: "",
            },
          },
        ),
        AIIntegration.updateOne(
          { _id: entry.integration._id },
          {
            $set: {
              lastValidatedAt: new Date(),
              lastError: "",
            },
          },
        ),
      ]);

      await writeAiHistoryEvent({
        contextType: options?.contextType ?? "other",
        contextAction: options?.contextAction ?? "",
        projectId: options?.projectId ?? "",
        runId: options?.runId ?? "",
        actorUserId: options?.actor?.id ?? "",
        actorUsername: options?.actor?.username ?? "",
        actorEmail: options?.actor?.email ?? "",
        provider,
        integrationId: entry.integration?._id,
        integrationName: entry.integration?.name ?? "",
        modelId: entry.model?._id,
        modelName: entry.model?.name ?? "",
        providerModelId: entry.model?.providerModelId ?? "",
        status: "success",
        error: "",
        promptSystem: payload?.systemPrompt ?? "",
        promptUser: payload?.userPrompt ?? "",
        responsePreview: text,
        promptChars: String(payload?.systemPrompt ?? "").length + String(payload?.userPrompt ?? "").length,
        responseChars: text.length,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
      });

      return {
        text,
        usage,
        model: entry.model,
        integration: entry.integration,
      };
    } catch (error) {
      const message = String(error?.message ?? error ?? "AI provider request failed.");
      failures.push(`${entry.model.name} (${provider}): ${message}`);

      await Promise.all([
        AIModel.updateOne(
          { _id: entry.model._id },
          {
            $set: {
              lastError: message,
            },
          },
        ),
        AIIntegration.updateOne(
          { _id: entry.integration._id },
          {
            $set: {
              lastValidatedAt: new Date(),
              lastError: message,
            },
          },
        ),
      ]);

      await writeAiHistoryEvent({
        contextType: options?.contextType ?? "other",
        contextAction: options?.contextAction ?? "",
        projectId: options?.projectId ?? "",
        runId: options?.runId ?? "",
        actorUserId: options?.actor?.id ?? "",
        actorUsername: options?.actor?.username ?? "",
        actorEmail: options?.actor?.email ?? "",
        provider,
        integrationId: entry.integration?._id,
        integrationName: entry.integration?.name ?? "",
        modelId: entry.model?._id,
        modelName: entry.model?.name ?? "",
        providerModelId: entry.model?.providerModelId ?? "",
        status: "failed",
        error: message,
        promptSystem: payload?.systemPrompt ?? "",
        promptUser: payload?.userPrompt ?? "",
        responsePreview: "",
        promptChars: String(payload?.systemPrompt ?? "").length + String(payload?.userPrompt ?? "").length,
        responseChars: 0,
        promptTokens: estimateTokensFromText(`${payload?.systemPrompt ?? ""}\n${payload?.userPrompt ?? ""}`),
        completionTokens: 0,
        totalTokens: estimateTokensFromText(`${payload?.systemPrompt ?? ""}\n${payload?.userPrompt ?? ""}`),
      });
    }
  }

  const summary = failures.slice(0, 4).join(" | ");
  throw new Error(summary || "All AI models failed.");
};

const generateRunAiSummary = async (runDoc, options = {}) => {
  const run = typeof runDoc?.toObject === "function" ? runDoc.toObject() : runDoc;
  if (!run) {
    throw new Error("Test run not found.");
  }
  if (!TERMINAL_TEST_STATUSES.has(String(run.status ?? ""))) {
    throw new Error("AI summary can only be generated after the test run finishes.");
  }
  if (!options.force && run?.aiSummary?.text) {
    return {
      cached: true,
      summary: run.aiSummary,
    };
  }

  const runContext = toAiRunMetricsContext(run);
  const aiResponse = await executeAiWithFallback({
    temperature: 0.2,
    maxTokens: 800,
    systemPrompt:
      "You are a senior performance testing analyst. Respond in concise, practical GitHub-flavored Markdown only.",
    userPrompt: `Analyze this single load-test result and return ONLY Markdown.

Output rules:
- Return Markdown only. Do not return JSON, XML, HTML, or prose outside the report.
- Do not wrap the whole response in triple backticks.
- Keep recommendations specific to the metrics provided.
- Keep the report concise and non-generic.

Required sections (use these exact headings):
## Summary
## Key Findings
## Risk Level
Include one label: Low, Medium, or High, with a short reason.
## Optimization Suggestions
Provide 3 to 6 concrete optimization suggestions, prioritized.
## Recommended Actions
Provide up to 5 immediate actions.
## Next Test Plan
Provide up to 3 follow-up test ideas.

Run data:
${JSON.stringify(runContext, null, 2)}`,
  }, {
    contextType: "test-summary",
    contextAction: options?.force ? "regenerate" : "generate",
    projectId: toObjectIdString(run?.projectId),
    runId: toObjectIdString(run?._id),
    actor: options?.actor ?? null,
  });

  const summaryText = normalizeAiSummaryMarkdown(aiResponse.text);
  if (!summaryText) {
    throw new Error("AI returned an empty summary.");
  }

  const summaryRecord = {
    text: summaryText,
    generatedAt: new Date(),
    modelId: aiResponse.model._id,
    modelName: aiResponse.model.name,
    provider: normalizeAiProvider(aiResponse.model.provider),
    providerModelId: aiResponse.model.providerModelId,
    integrationName: aiResponse.integration.name,
  };

  await TestRun.updateOne(
    { _id: run._id },
    {
      $set: {
        aiSummary: summaryRecord,
      },
    },
  );
  await invalidateApiCache();

  return {
    cached: false,
    summary: summaryRecord,
  };
};

const validateAiTestConfigPayload = (payload) => {
  const goal = String(payload?.goal ?? "").trim();
  const targetUrl = String(payload?.targetUrl ?? "").trim();
  const type = String(payload?.type ?? "Load").trim();

  if (!goal || goal.length < 6) {
    return { error: "Goal must be at least 6 characters." };
  }
  if (targetUrl && !/^https?:\/\//i.test(targetUrl)) {
    return { error: "Target URL must be a valid http/https URL." };
  }

  return {
    value: {
      goal,
      targetUrl,
      type,
    },
  };
};

const sanitizeGeneratedTestConfig = (rawConfig, fallback = {}) => {
  const durationValue = String(rawConfig?.duration ?? fallback?.duration ?? "30s").trim().toLowerCase();
  const validDuration = /^\d+[smh]$/.test(durationValue) ? durationValue : "30s";
  const vusRaw = Number(rawConfig?.vus ?? fallback?.vus ?? 20);
  const vus = Number.isFinite(vusRaw) ? Math.max(1, Math.min(100000, Math.floor(vusRaw))) : 20;
  const targetUrl = String(rawConfig?.targetUrl ?? fallback?.targetUrl ?? "").trim();
  const safeTargetUrl = /^https?:\/\//i.test(targetUrl) ? targetUrl : String(fallback?.targetUrl ?? "").trim();

  return {
    name: String(rawConfig?.name ?? fallback?.name ?? "AI Generated Test").trim() || "AI Generated Test",
    targetUrl: safeTargetUrl,
    type: String(rawConfig?.type ?? fallback?.type ?? "Load").trim() || "Load",
    vus,
    duration: validDuration,
    script: String(rawConfig?.script ?? "").trim(),
    notes: String(rawConfig?.notes ?? "").trim(),
  };
};

const normalizeUsername = (value) => String(value ?? "").trim().toLowerCase();
const normalizeEmail = (value) => String(value ?? "").trim().toLowerCase();
const toPlainObject = (value) => (typeof value?.toObject === "function" ? value.toObject() : value);
const escapeRegex = (value) => String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeAuthTarget = (value) => (String(value ?? "").toLowerCase() === "admin" ? "admin" : "user");

const buildGithubStateToken = (target = "user") =>
  jwt.sign(
    {
      purpose: "github-oauth",
      target: normalizeAuthTarget(target),
    },
    jwtSecret,
    { expiresIn: "10m" },
  );

const resolveClientAuthRedirect = (params = {}, target = "user") => {
  const authPath = normalizeAuthTarget(target) === "admin" ? "/admin/signin" : "/signin";
  const url = new URL(authPath, clientAppOrigin);
  const hash = new URLSearchParams(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && String(value) !== "")
      .map(([key, value]) => [key, String(value)]),
  );
  url.hash = hash.toString();
  return url.toString();
};

const sanitizeUsernameCandidate = (value) => {
  const sanitized = normalizeUsername(value).replace(/[^a-z0-9._-]/g, "").slice(0, 80);
  if (sanitized.length >= 3) {
    return sanitized;
  }

  const fallbackSuffix = randomBytes(3).toString("hex");
  return `user-${fallbackSuffix}`.slice(0, 80);
};

const ensureUniqueUsername = async (...candidates) => {
  const firstValid = candidates.map(sanitizeUsernameCandidate).find(Boolean) ?? sanitizeUsernameCandidate("user");
  let attempt = firstValid;
  let counter = 1;

  while (await User.exists({ username: attempt })) {
    const suffix = `${counter}`;
    const base = firstValid.slice(0, Math.max(3, 80 - suffix.length - 1));
    attempt = `${base}-${suffix}`;
    counter += 1;
  }

  return attempt;
};

const getUserIdentity = (userLike) => ({
  id: toObjectIdString(userLike?._id ?? userLike?.id).trim(),
  email: normalizeEmail(userLike?.email),
  username: normalizeUsername(userLike?.username),
  isAdmin: Boolean(userLike?.isAdmin),
});

const resolveProjectAccess = (project, userLike) => {
  const identity = getUserIdentity(userLike);
  const ownerId = toObjectIdString(project?.ownerUserId);
  const isOwner = Boolean(identity.id && ownerId === identity.id);
  if (isOwner) {
    return {
      canView: true,
      canRun: true,
      canManage: true,
      isOwner: true,
    };
  }

  let canView = false;
  let canRun = false;

  for (const entry of project?.accessList ?? []) {
    const entryUserId = toObjectIdString(entry?.userId);
    const entryEmail = normalizeEmail(entry?.email);
    const matchesIdentity =
      (identity.id && entryUserId === identity.id) || (identity.email && entryEmail === identity.email);

    if (!matchesIdentity) {
      continue;
    }

    canRun = canRun || Boolean(entry?.canRun);
    canView = canView || Boolean(entry?.canView || entry?.canRun);
  }

  return {
    canView,
    canRun,
    canManage: false,
    isOwner: false,
  };
};

const buildProjectAccessQuery = (userLike, { requireRun = false } = {}) => {
  const identity = getUserIdentity(userLike);
  if (!identity.id && !identity.email) {
    return { _id: { $in: [] } };
  }

  const identityMatches = [];
  if (identity.id && isValidObjectId(identity.id)) {
    identityMatches.push({ userId: new mongoose.Types.ObjectId(identity.id) });
  }
  if (identity.email) {
    identityMatches.push({ email: identity.email });
  }

  const ownerConditions = identity.id && isValidObjectId(identity.id) ? [{ ownerUserId: new mongoose.Types.ObjectId(identity.id) }] : [];
  const permissionClause = requireRun ? { canRun: true } : { $or: [{ canView: true }, { canRun: true }] };

  return {
    $or: [
      ...ownerConditions,
      {
        accessList: {
          $elemMatch: {
            $and: [{ $or: identityMatches }, permissionClause],
          },
        },
      },
    ],
  };
};

const syncUserProjectIdentity = async (userLike) => {
  const identity = getUserIdentity(userLike);
  if (!identity.id || !isValidObjectId(identity.id)) {
    return;
  }

  const objectId = new mongoose.Types.ObjectId(identity.id);
  const work = [
    Project.updateMany(
      { ownerUserId: objectId },
      {
        $set: {
          ownerEmail: identity.email,
          ownerUsername: identity.username,
        },
      },
    ),
    Project.updateMany(
      { "accessList.userId": objectId },
      {
        $set: {
          "accessList.$[entry].email": identity.email,
          "accessList.$[entry].username": identity.username,
        },
      },
      {
        arrayFilters: [{ "entry.userId": objectId }],
      },
    ),
  ];

  if (identity.email) {
    work.push(
      Project.updateMany(
        { "accessList.email": identity.email },
        {
          $set: {
            "accessList.$[entry].userId": objectId,
            "accessList.$[entry].username": identity.username,
          },
        },
        {
          arrayFilters: [{ "entry.email": identity.email }],
        },
      ),
    );
  }

  await Promise.all(work);
};

const buildSessionUser = async (userDoc) => {
  const plainUser = toPlainObject(userDoc);
  await syncUserProjectIdentity(plainUser);

  const projects = await Project.find(buildProjectAccessQuery(plainUser))
    .select({ _id: 1, ownerUserId: 1, accessList: 1 })
    .lean();

  const projectPermissions = projects
    .map((project) => {
      const access = resolveProjectAccess(project, plainUser);
      return {
        projectId: project._id.toString(),
        canView: access.canView,
        canRun: access.canRun,
      };
    })
    .filter((permission) => permission.canView || permission.canRun);

  return toPublicUser({
    ...plainUser,
    projectPermissions,
  });
};

const toProjectResponse = (project, stats, userLike) => {
  const access = resolveProjectAccess(project, userLike);

  return {
    id: project._id.toString(),
    name: project.name,
    baseUrl: project.baseUrl,
    description: project.description ?? "",
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    owner: {
      username: project.ownerUsername,
      email: project.ownerEmail,
    },
    access: {
      canView: access.canView,
      canRun: access.canRun,
      canManage: access.canManage,
      isOwner: access.isOwner,
      sharedMemberCount: Array.isArray(project.accessList) ? project.accessList.length : 0,
    },
    stats: stats ?? {
      totalRuns: 0,
      activeRuns: 0,
      successfulRuns: 0,
      successRatePct: 0,
      lastRunAt: null,
      lastRunStatus: null,
      lastRunName: null,
    },
  };
};

const toSharedMemberResponse = (project, entry, linkedUser) => ({
  key: normalizeEmail(entry?.email),
  email: normalizeEmail(entry?.email),
  username: linkedUser?.username ?? entry?.username ?? "",
  avatarDataUrl: linkedUser?.avatarDataUrl ?? "",
  githubLinked: Boolean(linkedUser?.githubId),
  hasAccount: Boolean(linkedUser),
  canView: Boolean(entry?.canView || entry?.canRun),
  canRun: Boolean(entry?.canRun),
  isOwner: false,
  joinedVia: linkedUser?.githubId ? "github" : linkedUser ? "local" : "pending",
});

const ensureProjectManageAccess = async (projectId, authUser) => {
  const project = await Project.findById(projectId);
  if (!project) {
    return { error: { status: 404, message: "Project not found." } };
  }

  const access = resolveProjectAccess(project, authUser);
  if (!access.canManage) {
    return { error: { status: 403, message: "Only the project owner can manage sharing for this project." } };
  }

  return { project, access };
};

const ensureProjectViewAccess = async (projectId, authUser) => {
  const project = await Project.findById(projectId);
  if (!project) {
    return { error: { status: 404, message: "Project not found." } };
  }

  const access = resolveProjectAccess(project, authUser);
  if (!access.canView) {
    return { error: { status: 403, message: "You do not have permission to view this project." } };
  }

  return { project, access };
};

const ensureProjectRunAccess = async (projectId, authUser) => {
  const project = await Project.findById(projectId);
  if (!project) {
    return { error: { status: 404, message: "Project not found." } };
  }

  const access = resolveProjectAccess(project, authUser);
  if (!access.canRun) {
    return { error: { status: 403, message: "You do not have permission to run tests for this project." } };
  }

  return { project, access };
};

const createTestRunFromTemplate = async (template) => {
  const testRun = await TestRun.create({
    projectId: template.projectId,
    projectName: template.projectName,
    projectBaseUrl: template.projectBaseUrl,
    name: template.name,
    targetUrl: template.targetUrl,
    type: template.type,
    region: template.region,
    duration: template.duration,
    vus: template.vus,
    script: template.script,
  });

  await invalidateApiCache();

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
    await invalidateApiCache();
  });

  return testRun;
};

const triggerIntegrationRun = async (integrationId, triggerMeta = {}) => {
  const integration = await Integration.findById(integrationId);
  if (!integration) {
    return { error: { status: 404, message: "Integration not found." } };
  }
  if (!integration.isEnabled) {
    return { error: { status: 409, message: "Integration is disabled." } };
  }

  const project = await Project.findById(integration.projectId).lean();
  if (!project) {
    integration.lastError = "Project not found for this integration.";
    integration.lastRunStatus = "failed";
    await integration.save();
    return { error: { status: 404, message: "Project not found for this integration." } };
  }

  try {
    const testRun = await createTestRunFromTemplate({
      projectId: integration.projectId,
      projectName: project.name,
      projectBaseUrl: project.baseUrl,
      name: integration.name,
      targetUrl: integration.targetUrl,
      type: integration.type,
      region: integration.region,
      duration: integration.duration,
      vus: integration.vus,
      script: integration.script,
    });

    integration.lastTriggeredAt = new Date();
    integration.lastRunId = testRun._id;
    integration.lastRunStatus = "queued";
    integration.lastTriggerSource = String(triggerMeta?.source ?? "manual");
    integration.lastError = "";
    await integration.save();
    await invalidateApiCache();

    return {
      run: testRun,
      integration,
    };
  } catch (error) {
    integration.lastTriggeredAt = new Date();
    integration.lastRunStatus = "failed";
    integration.lastTriggerSource = String(triggerMeta?.source ?? "manual");
    integration.lastError = String(error?.message ?? error ?? "Unable to queue integration run.");
    await integration.save();
    await invalidateApiCache();

    return {
      error: {
        status: 500,
        message: integration.lastError,
      },
    };
  }
};

const validateSignUpPayload = (payload) => {
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

const validateAdminCreateUserPayload = (payload) => {
  const base = validateSignUpPayload(payload);
  if (base.error) {
    return base;
  }

  return {
    value: {
      ...base.value,
      isAdmin: Boolean(payload?.isAdmin),
      isActive: payload?.isActive === undefined ? true : Boolean(payload?.isActive),
    },
  };
};

const validateProjectSharePayload = (payload) => {
  const email = normalizeEmail(payload?.email);
  const canRun = Boolean(payload?.canRun);
  const canView = Boolean(payload?.canView || canRun);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "A valid email address is required." };
  }
  if (!canView && !canRun) {
    return { error: "Choose at least view access before sharing a project." };
  }

  return {
    value: {
      email,
      canView,
      canRun,
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

const parseCookieHeader = (headerValue) => {
  const raw = String(headerValue ?? "");
  if (!raw) {
    return {};
  }

  const cookies = {};
  for (const part of raw.split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (!key) {
      continue;
    }
    cookies[key] = decodeURIComponent(value);
  }
  return cookies;
};

const readAuthCookieToken = (req) => {
  const cookies = parseCookieHeader(req.headers.cookie);
  return readBearerToken(cookies[AUTH_COOKIE_NAME]);
};

const setSessionCookie = (res, token) => {
  res.cookie(AUTH_COOKIE_NAME, token, {
    ...authCookieBaseOptions,
    maxAge: AUTH_TOKEN_MAX_AGE_SECONDS * 1000,
  });
};

const clearSessionCookie = (res) => {
  res.clearCookie(AUTH_COOKIE_NAME, authCookieBaseOptions);
};

const authenticateRequest = async (req, res, next) => {
  const token = readBearerToken(req.headers.authorization) ?? readAuthCookieToken(req);
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
  if (user.isActive === false) {
    return res.status(403).json({ error: "This account is deactivated. Contact your administrator." });
  }

  req.authUser = await buildSessionUser(user);
  return next();
};

const requireAdmin = (req, res, next) => {
  if (!req.authUser?.isAdmin) {
    return res.status(403).json({ error: "Admin access required." });
  }
  return next();
};

const toAdminUserResponse = (userDoc) => ({
  id: userDoc._id.toString(),
  username: userDoc.username,
  email: userDoc.email,
  isAdmin: Boolean(userDoc.isAdmin),
  isOwner: Boolean(userDoc.isOwner),
  isActive: userDoc.isActive !== false,
  githubLinked: Boolean(userDoc.githubId),
  hasPassword: Boolean(userDoc.passwordHash),
  createdAt: userDoc.createdAt,
  updatedAt: userDoc.updatedAt,
});

const ensureLegacyOwnerAndAdmin = async () => {
  const totalUsers = await User.countDocuments({});
  if (totalUsers === 0) {
    return;
  }

  let ownerUser = await User.findOne({ isOwner: true }).sort({ createdAt: 1 });
  if (!ownerUser) {
    ownerUser = await User.findOne({}).sort({ createdAt: 1 });
    if (ownerUser) {
      ownerUser.isOwner = true;
      await ownerUser.save();
      console.log(`[migration] Marked ${ownerUser.username} as owner.`);
    }
  }

  const adminExists = await User.exists({ isAdmin: true });
  if (!adminExists) {
    const fallbackAdmin = ownerUser ?? (await User.findOne({}).sort({ createdAt: 1 }));
    if (fallbackAdmin) {
      fallbackAdmin.isAdmin = true;
      fallbackAdmin.isActive = fallbackAdmin.isActive !== false;
      await fallbackAdmin.save();
      console.log(`[migration] Marked ${fallbackAdmin.username} as admin.`);
    }
  }
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
await initCache();
await ensureLegacyOwnerAndAdmin();
await markOrphanedRuns();
await initIntegrationScheduler({
  integrations: await Integration.find({ isEnabled: true, triggerType: "cron" }).lean(),
  onTrigger: async (integrationId, meta) => {
    await triggerIntegrationRun(integrationId, meta);
  },
});

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

  socket.data.authUser = await buildSessionUser(user);
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
    redis: getCacheHealth(),
    integrationJobs: getSchedulerJobCount(),
    activeRuns: getActiveRunSnapshots().length,
    now: new Date().toISOString(),
  });
});

const createSessionResponse = async (user) => ({
  token: signAccessToken(user, jwtSecret),
  expiresIn: AUTH_TOKEN_MAX_AGE_SECONDS,
  user: await buildSessionUser(user),
});

const sendSessionResponse = async (res, user, status = 200) => {
  const session = await createSessionResponse(user);
  setSessionCookie(res, session.token);
  return res.status(status).json(session);
};

const fetchGithubJson = async (url, init = {}, defaultErrorMessage) => {
  const response = await fetch(url, init);
  const raw = await response.text();

  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = data?.error_description || data?.message || defaultErrorMessage;
    throw new Error(message);
  }

  return data;
};

const redirectWithAuthError = (res, message, target = "user") =>
  res.redirect(resolveClientAuthRedirect({ error: message }, target));

app.get("/api/auth/options", async (_req, res) => {
  const [userExists, adminExists] = await Promise.all([User.exists({}), User.exists({ isAdmin: true })]);
  return res.json({
    localEnabled: true,
    githubEnabled,
    hasUsers: Boolean(userExists),
    hasAdmins: Boolean(adminExists),
  });
});

app.get("/api/auth/setup-status", async (_req, res) => {
  const userExists = await User.exists({});
  return res.json({
    needsSetup: !userExists,
    githubEnabled,
  });
});

app.post("/api/auth/signup", async (req, res) => {
  const { value, error } = validateSignUpPayload(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const duplicateAccount = await User.findOne({
    $or: [{ username: value.username }, { email: value.email }],
  }).lean();
  if (duplicateAccount) {
    return res.status(409).json({ error: "Username or email is already in use." });
  }

  const [userCount, adminCount, ownerCount] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ isAdmin: true }),
    User.countDocuments({ isOwner: true }),
  ]);
  const passwordHash = await bcrypt.hash(value.password, 12);
  const user = await User.create({
    username: value.username,
    email: value.email,
    passwordHash,
    isAdmin: userCount === 0 || adminCount === 0,
    isOwner: userCount === 0 || ownerCount === 0,
    isActive: true,
  });

  await invalidateApiCache();
  return sendSessionResponse(res, user, 201);
});

app.post("/api/auth/setup-admin", async (req, res) => {
  const { value, error } = validateSignUpPayload(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const duplicateAccount = await User.findOne({
    $or: [{ username: value.username }, { email: value.email }],
  }).lean();
  if (duplicateAccount) {
    return res.status(409).json({ error: "Username or email is already in use." });
  }

  const existingAdmin = await User.exists({ isAdmin: true });
  if (existingAdmin) {
    return res.status(409).json({ error: "An admin account already exists. Sign in with an existing admin." });
  }

  const passwordHash = await bcrypt.hash(value.password, 12);
  const user = await User.create({
    username: value.username,
    email: value.email,
    passwordHash,
    isAdmin: true,
    isOwner: true,
    isActive: true,
  });

  await invalidateApiCache();
  return sendSessionResponse(res, user, 201);
});

app.post("/api/auth/signin", async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const password = String(req.body?.password ?? "");

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  const user = await User.findOne({ username });
  if (!user) {
    return res.status(401).json({ error: "Invalid username or password." });
  }
  if (user.isActive === false) {
    return res.status(403).json({ error: "This account is deactivated. Contact your administrator." });
  }
  if (!user.passwordHash) {
    return res.status(401).json({ error: "This account does not have a password yet. Use GitHub sign-in instead." });
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

  return sendSessionResponse(res, user);
});

app.get("/api/auth/github/start", async (_req, res) => {
  if (!githubEnabled) {
    return res.status(404).json({ error: "GitHub sign-in is not configured." });
  }

  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", githubClientId);
  authorizeUrl.searchParams.set("redirect_uri", githubCallbackUrl);
  authorizeUrl.searchParams.set("scope", "read:user user:email");
  authorizeUrl.searchParams.set("state", buildGithubStateToken());

  return res.redirect(authorizeUrl.toString());
});

app.get("/api/auth/github/start-admin", async (_req, res) => {
  if (!githubEnabled) {
    return res.status(404).json({ error: "GitHub sign-in is not configured." });
  }

  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", githubClientId);
  authorizeUrl.searchParams.set("redirect_uri", githubCallbackUrl);
  authorizeUrl.searchParams.set("scope", "read:user user:email");
  authorizeUrl.searchParams.set("state", buildGithubStateToken("admin"));

  return res.redirect(authorizeUrl.toString());
});

app.get("/api/auth/github/callback", async (req, res) => {
  if (!githubEnabled) {
    return redirectWithAuthError(res, "GitHub sign-in is not configured for this environment.");
  }

  const code = String(req.query.code ?? "").trim();
  const state = String(req.query.state ?? "").trim();
  if (!code || !state) {
    return redirectWithAuthError(res, "GitHub sign-in could not be completed.");
  }

  let authTarget = "user";
  try {
    const payload = jwt.verify(state, jwtSecret);
    if (payload?.purpose !== "github-oauth") {
      return redirectWithAuthError(res, "GitHub sign-in session is invalid.");
    }
    authTarget = normalizeAuthTarget(payload?.target);
  } catch {
    return redirectWithAuthError(res, "GitHub sign-in session expired. Try again.");
  }

  try {
    const tokenPayload = await fetchGithubJson(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "LoadPulse",
        },
        body: JSON.stringify({
          client_id: githubClientId,
          client_secret: githubClientSecret,
          code,
          redirect_uri: githubCallbackUrl,
        }),
      },
      "Unable to exchange the GitHub authorization code.",
    );

    const githubAccessToken = String(tokenPayload?.access_token ?? "").trim();
    if (!githubAccessToken) {
      return redirectWithAuthError(res, "GitHub did not return an access token.");
    }

    const [profile, emailRows] = await Promise.all([
      fetchGithubJson(
        "https://api.github.com/user",
        {
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${githubAccessToken}`,
            "User-Agent": "LoadPulse",
          },
        },
        "Unable to load the GitHub profile.",
      ),
      fetchGithubJson(
        "https://api.github.com/user/emails",
        {
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${githubAccessToken}`,
            "User-Agent": "LoadPulse",
          },
        },
        "Unable to read GitHub email addresses.",
      ),
    ]);

    const githubId = String(profile?.id ?? "").trim();
    const githubUsername = normalizeUsername(profile?.login);
    const avatarUrl = String(profile?.avatar_url ?? "").trim();
    const emailList = Array.isArray(emailRows) ? emailRows : [];
    const primaryEmailRow =
      emailList.find((entry) => entry?.primary && entry?.verified && entry?.email) ??
      emailList.find((entry) => entry?.verified && entry?.email) ??
      emailList.find((entry) => entry?.email);
    const email = normalizeEmail(primaryEmailRow?.email ?? profile?.email);

    if (!githubId || !email) {
      return redirectWithAuthError(res, "A verified email is required on your GitHub account.", authTarget);
    }

    let user = await User.findOne({ githubId });
    let userChanged = false;
    if (!user) {
      user = await User.findOne({ email });
    }

    if (!user) {
      const [userCount, adminCount, ownerCount] = await Promise.all([
        User.countDocuments({}),
        User.countDocuments({ isAdmin: true }),
        User.countDocuments({ isOwner: true }),
      ]);
      const username = await ensureUniqueUsername(githubUsername, email.split("@")[0], profile?.name);
      user = await User.create({
        username,
        email,
        githubId,
        githubUsername,
        avatarDataUrl: avatarUrl,
        isAdmin: userCount === 0 || adminCount === 0,
        isOwner: userCount === 0 || ownerCount === 0,
        isActive: true,
      });
      userChanged = true;
    } else {
      user.githubId = githubId;
      user.githubUsername = githubUsername || user.githubUsername;
      if (!user.avatarDataUrl && avatarUrl) {
        user.avatarDataUrl = avatarUrl;
      }

      if (user.email !== email) {
        const conflictingUser = await User.findOne({ _id: { $ne: user._id }, email }).lean();
        if (!conflictingUser) {
          user.email = email;
        }
      }

      await user.save();
      userChanged = true;
    }

    if (user.isActive === false) {
      return redirectWithAuthError(res, "This account is deactivated. Contact your administrator.", authTarget);
    }

    await syncUserProjectIdentity(user);
    if (userChanged) {
      await invalidateApiCache();
    }

    if (user.twoFactorEnabled) {
      const pendingToken = signTwoFactorToken(user, jwtSecret);
      return res.redirect(
        resolveClientAuthRedirect({
          requiresTwoFactor: "1",
          pendingToken,
          username: user.username,
          email: user.email,
        }, authTarget),
      );
    }

    const session = await createSessionResponse(user);
    setSessionCookie(res, session.token);
    return res.redirect(
      resolveClientAuthRedirect({
        token: session.token,
      }, authTarget),
    );
  } catch (error) {
    return redirectWithAuthError(res, String(error?.message ?? error ?? "GitHub sign-in failed."), authTarget);
  }
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
  if (user.isActive === false) {
    return res.status(403).json({ error: "This account is deactivated. Contact your administrator." });
  }

  const secret = decryptSecret(user.twoFactorSecretEncrypted, jwtSecret);
  const isValidCode = verifyTwoFactorCode(secret, code);
  if (!isValidCode) {
    return res.status(401).json({ error: "Invalid verification code." });
  }

  return sendSessionResponse(res, user);
});

app.post("/api/auth/signout", async (_req, res) => {
  clearSessionCookie(res);
  return res.status(204).end();
});

app.post("/api/integrations/hooks/:id", async (req, res) => {
  const integrationId = String(req.params.id ?? "").trim();
  if (!isValidObjectId(integrationId)) {
    return res.status(400).json({ error: "Invalid integration id." });
  }

  const token = readProjectTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ error: "Missing project integration token." });
  }

  const integration = await Integration.findById(integrationId).lean();
  if (!integration) {
    return res.status(404).json({ error: "Integration not found." });
  }
  if (String(integration.triggerType ?? "cron") !== "api") {
    return res.status(403).json({ error: "This integration is cron-based and cannot be triggered via API hook." });
  }
  if (!integration.allowApiTrigger) {
    return res.status(403).json({ error: "API trigger is disabled for this integration." });
  }

  const tokenRecord = await ProjectIntegrationToken.findOne({ projectId: integration.projectId });
  if (!tokenRecord) {
    return res.status(401).json({ error: "Project integration token is not configured." });
  }
  if (tokenRecord.tokenHash !== hashProjectToken(token)) {
    return res.status(401).json({ error: "Invalid project integration token." });
  }

  tokenRecord.lastUsedAt = new Date();
  await tokenRecord.save();

  const triggerResult = await triggerIntegrationRun(integrationId, {
    source: "api",
    reason: "Triggered via integration hook",
  });
  if (triggerResult.error) {
    return res.status(triggerResult.error.status).json({ error: triggerResult.error.message });
  }

  return res.status(202).json({
    success: true,
    runId: triggerResult.run._id.toString(),
    status: "queued",
    message: "Integration hook accepted. Test queued.",
  });
});

app.use("/api", (req, res, next) => {
  if (
    req.path === "/health" ||
    req.path === "/auth/options" ||
    req.path === "/auth/signup" ||
    req.path === "/auth/signin" ||
    req.path === "/auth/github/start" ||
    req.path === "/auth/github/start-admin" ||
    req.path === "/auth/github/callback" ||
    req.path === "/auth/verify-2fa" ||
    req.path === "/auth/signout" ||
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

app.get("/api/ai/settings", async (_req, res) => {
  const settings = await getAiSettings();
  return res.json({
    data: toAiSettingsResponse(settings),
  });
});

app.get("/api/admin/users", requireAdmin, async (req, res) => {
  const cacheKey = buildCacheKey("admin-users", req.authUser);
  const cached = await getCachedJson(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  const users = await User.find({})
    .sort({ createdAt: -1 })
    .lean();

  const payload = {
    data: users.map(toAdminUserResponse),
  };

  await setCachedJson(cacheKey, payload, CACHE_TTL_SECONDS.adminUsers);
  return res.json(payload);
});

app.get("/api/admin/about", requireAdmin, async (_req, res) => {
  const dependencies = Object.entries(packageMetadata.dependencies ?? {})
    .map(([name, version]) => ({ name, version, type: "runtime" }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const devDependencies = Object.entries(packageMetadata.devDependencies ?? {})
    .map(([name, version]) => ({ name, version, type: "development" }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return res.json({
    data: {
      name: packageMetadata.name ?? "loadpulse",
      version: packageMetadata.version ?? "0.0.0",
      nodeVersion: process.version,
      runtime: "Node.js + Express + React + MongoDB + k6",
      acknowledgements: [...dependencies, ...devDependencies],
    },
  });
});

app.post("/api/admin/users", requireAdmin, async (req, res) => {
  const { value, error } = validateAdminCreateUserPayload(req.body);
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
    isAdmin: value.isAdmin,
    isActive: value.isActive,
  });

  await invalidateApiCache();
  return res.status(201).json({
    data: toAdminUserResponse(user),
  });
});

app.patch("/api/admin/users/:id/status", requireAdmin, async (req, res) => {
  const userId = String(req.params.id ?? "").trim();
  if (!isValidObjectId(userId)) {
    return res.status(400).json({ error: "Invalid user id." });
  }

  const isActive = req.body?.isActive;
  if (typeof isActive !== "boolean") {
    return res.status(400).json({ error: "isActive must be true or false." });
  }

  const targetUser = await User.findById(userId);
  if (!targetUser) {
    return res.status(404).json({ error: "User not found." });
  }

  if (!isActive) {
    if (targetUser.isOwner) {
      return res.status(409).json({ error: "Owner account cannot be deactivated." });
    }
    if (targetUser._id.toString() === req.authUser.id) {
      return res.status(409).json({ error: "You cannot deactivate your own account." });
    }
    if (targetUser.isAdmin) {
      const otherActiveAdminCount = await User.countDocuments({
        _id: { $ne: targetUser._id },
        isAdmin: true,
        isActive: true,
      });
      if (otherActiveAdminCount === 0) {
        return res.status(409).json({ error: "At least one active admin account is required." });
      }
    }
  }

  targetUser.isActive = isActive;
  await targetUser.save();
  await invalidateApiCache();

  return res.json({
    data: toAdminUserResponse(targetUser),
  });
});

app.patch("/api/admin/users/:id/admin", requireAdmin, async (req, res) => {
  const userId = String(req.params.id ?? "").trim();
  if (!isValidObjectId(userId)) {
    return res.status(400).json({ error: "Invalid user id." });
  }

  const isAdmin = req.body?.isAdmin;
  if (typeof isAdmin !== "boolean") {
    return res.status(400).json({ error: "isAdmin must be true or false." });
  }

  const targetUser = await User.findById(userId);
  if (!targetUser) {
    return res.status(404).json({ error: "User not found." });
  }

  if (!isAdmin && targetUser.isAdmin) {
    if (targetUser.isOwner) {
      return res.status(409).json({ error: "Owner account must remain admin." });
    }
    const otherActiveAdminCount = await User.countDocuments({
      _id: { $ne: targetUser._id },
      isAdmin: true,
      isActive: true,
    });
    if (otherActiveAdminCount === 0) {
      return res.status(409).json({ error: "At least one active admin account is required." });
    }
  }

  targetUser.isAdmin = isAdmin;
  await targetUser.save();
  await invalidateApiCache();

  return res.json({
    data: toAdminUserResponse(targetUser),
  });
});

app.get("/api/admin/ai/overview", requireAdmin, async (req, res) => {
  const cacheKey = buildCacheKey("admin-ai-overview", req.authUser);
  const cached = await getCachedJson(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  await normalizeAiModelPriorities();

  const [integrations, models, counts, settings] = await Promise.all([
    AIIntegration.find({}).sort({ createdAt: -1 }).lean(),
    AIModel.find({}).sort({ priority: 1, createdAt: 1 }).lean(),
    AIModel.aggregate([{ $group: { _id: "$integrationId", count: { $sum: 1 } } }]),
    getAiSettings(),
  ]);

  const countByIntegrationId = new Map(counts.map((row) => [toObjectIdString(row?._id), Number(row?.count ?? 0)]));
  const integrationById = new Map(integrations.map((integration) => [integration._id.toString(), integration]));

  const payload = {
    data: {
      settings: toAiSettingsResponse(settings),
      integrations: integrations.map((integration) =>
        toAIIntegrationResponse(integration, countByIntegrationId.get(integration._id.toString()) ?? 0),
      ),
      models: models.map((model) =>
        toAIModelResponse(model, integrationById.get(toObjectIdString(model.integrationId)) ?? null),
      ),
    },
  };

  await setCachedJson(cacheKey, payload, CACHE_TTL_SECONDS.adminAi);
  return res.json(payload);
});

app.get("/api/admin/ai/integrations", requireAdmin, async (req, res) => {
  const cacheKey = buildCacheKey("admin-ai-integrations", req.authUser);
  const cached = await getCachedJson(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  const [integrations, counts] = await Promise.all([
    AIIntegration.find({}).sort({ createdAt: -1 }).lean(),
    AIModel.aggregate([{ $group: { _id: "$integrationId", count: { $sum: 1 } } }]),
  ]);
  const countByIntegrationId = new Map(counts.map((row) => [toObjectIdString(row?._id), Number(row?.count ?? 0)]));
  const payload = {
    data: integrations.map((integration) =>
      toAIIntegrationResponse(integration, countByIntegrationId.get(integration._id.toString()) ?? 0),
    ),
  };

  await setCachedJson(cacheKey, payload, CACHE_TTL_SECONDS.adminAi);
  return res.json(payload);
});

app.post("/api/admin/ai/integrations", requireAdmin, async (req, res) => {
  const { value, error } = validateAiIntegrationCreatePayload(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const integration = await AIIntegration.create({
    name: value.name,
    provider: value.provider,
    apiKeyEncrypted: value.apiKey ? encryptSecret(value.apiKey, jwtSecret) : "",
    apiKeyPreview: value.apiKey ? toSecretPreview(value.apiKey) : "",
    baseUrl: value.baseUrl,
    isEnabled: value.isEnabled,
    createdByUserId: new mongoose.Types.ObjectId(req.authUser.id),
  });

  await invalidateApiCache();
  return res.status(201).json({
    data: toAIIntegrationResponse(integration, 0),
  });
});

app.patch("/api/admin/ai/integrations/:id", requireAdmin, async (req, res) => {
  const integrationId = String(req.params.id ?? "").trim();
  if (!isValidObjectId(integrationId)) {
    return res.status(400).json({ error: "Invalid integration id." });
  }

  const integration = await AIIntegration.findById(integrationId);
  if (!integration) {
    return res.status(404).json({ error: "AI integration not found." });
  }

  const hasName = Object.prototype.hasOwnProperty.call(req.body ?? {}, "name");
  const hasProvider = Object.prototype.hasOwnProperty.call(req.body ?? {}, "provider");
  const hasApiKey = Object.prototype.hasOwnProperty.call(req.body ?? {}, "apiKey");
  const hasBaseUrl = Object.prototype.hasOwnProperty.call(req.body ?? {}, "baseUrl");
  const hasIsEnabled = Object.prototype.hasOwnProperty.call(req.body ?? {}, "isEnabled");

  if (!hasName && !hasProvider && !hasApiKey && !hasBaseUrl && !hasIsEnabled) {
    return res.status(400).json({ error: "No updates were provided." });
  }

  const nextName = hasName ? String(req.body?.name ?? "").trim() : integration.name;
  if (!nextName || nextName.length < 2) {
    return res.status(400).json({ error: "Integration name must be at least 2 characters." });
  }

  const nextProvider = hasProvider ? normalizeAiProvider(req.body?.provider) : normalizeAiProvider(integration.provider);
  if (!AI_PROVIDERS.includes(nextProvider)) {
    return res.status(400).json({ error: "Provider must be one of: google, groq, openrouter, ollama." });
  }

  const nextApiKeyRaw = hasApiKey ? String(req.body?.apiKey ?? "").trim() : null;
  const hasAnyApiKey = hasApiKey ? Boolean(nextApiKeyRaw) : Boolean(integration.apiKeyEncrypted);
  if (PROVIDERS_REQUIRING_API_KEY.has(nextProvider) && !hasAnyApiKey) {
    return res.status(400).json({ error: `API key is required for ${nextProvider}.` });
  }

  const inputBaseUrl = hasBaseUrl ? normalizeBaseUrl(req.body?.baseUrl) : integration.baseUrl;
  const nextBaseUrl = resolveAiIntegrationBaseUrl(nextProvider, inputBaseUrl);
  if (nextBaseUrl && !isValidHttpUrl(nextBaseUrl)) {
    return res.status(400).json({ error: "Base URL must be a valid http/https URL." });
  }

  integration.name = nextName;
  integration.provider = nextProvider;
  integration.baseUrl = nextBaseUrl;
  if (hasIsEnabled) {
    integration.isEnabled = Boolean(req.body?.isEnabled);
  }
  if (hasApiKey) {
    integration.apiKeyEncrypted = nextApiKeyRaw ? encryptSecret(nextApiKeyRaw, jwtSecret) : "";
    integration.apiKeyPreview = nextApiKeyRaw ? toSecretPreview(nextApiKeyRaw) : "";
  }
  await integration.save();

  if (hasProvider) {
    await AIModel.updateMany(
      { integrationId: integration._id },
      {
        $set: { provider: nextProvider },
      },
    );
  }

  const modelCount = await AIModel.countDocuments({ integrationId: integration._id });
  await invalidateApiCache();
  return res.json({
    data: toAIIntegrationResponse(integration, modelCount),
  });
});

app.delete("/api/admin/ai/integrations/:id", requireAdmin, async (req, res) => {
  const integrationId = String(req.params.id ?? "").trim();
  if (!isValidObjectId(integrationId)) {
    return res.status(400).json({ error: "Invalid integration id." });
  }

  const modelCount = await AIModel.countDocuments({ integrationId });
  if (modelCount > 0) {
    return res.status(409).json({ error: "Delete linked AI models first before removing this integration." });
  }

  const deleted = await AIIntegration.findByIdAndDelete(integrationId);
  if (!deleted) {
    return res.status(404).json({ error: "AI integration not found." });
  }

  await invalidateApiCache();
  return res.json({ success: true });
});

app.get("/api/admin/ai/integrations/:id/models-catalog", requireAdmin, async (req, res) => {
  const integrationId = String(req.params.id ?? "").trim();
  if (!isValidObjectId(integrationId)) {
    return res.status(400).json({ error: "Invalid integration id." });
  }

  const integration = await AIIntegration.findById(integrationId);
  if (!integration) {
    return res.status(404).json({ error: "AI integration not found." });
  }

  const providerModels = await listProviderModels(integration);
  integration.lastValidatedAt = new Date();
  integration.lastError = providerModels.warning || "";
  await integration.save();

  await invalidateApiCache();
  return res.json({
    data: {
      provider: normalizeAiProvider(integration.provider),
      models: providerModels.models.map((id) => ({ id, label: id })),
      source: providerModels.source,
      warning: providerModels.warning,
    },
  });
});

app.get("/api/admin/ai/models", requireAdmin, async (req, res) => {
  const cacheKey = buildCacheKey("admin-ai-models", req.authUser);
  const cached = await getCachedJson(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  await normalizeAiModelPriorities();

  const models = await AIModel.find({}).sort({ priority: 1, createdAt: 1 }).lean();
  const integrationIds = [...new Set(models.map((model) => toObjectIdString(model.integrationId)).filter(Boolean))];
  const integrations = await AIIntegration.find({ _id: { $in: integrationIds } }).lean();
  const integrationById = new Map(integrations.map((integration) => [integration._id.toString(), integration]));

  const payload = {
    data: models.map((model) => toAIModelResponse(model, integrationById.get(toObjectIdString(model.integrationId)) ?? null)),
  };

  await setCachedJson(cacheKey, payload, CACHE_TTL_SECONDS.adminAi);
  return res.json(payload);
});

app.get("/api/admin/ai/settings", requireAdmin, async (_req, res) => {
  const settings = await getAiSettings();
  return res.json({
    data: toAiSettingsResponse(settings),
  });
});

app.patch("/api/admin/ai/settings", requireAdmin, async (req, res) => {
  const { value, error } = validateAiSettingsPayload(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const settings = await AISetting.findOneAndUpdate(
    { key: AI_SETTINGS_KEY },
    {
      $set: {
        autoGenerateTestSummary: value.autoGenerateTestSummary,
        updatedByUserId: new mongoose.Types.ObjectId(req.authUser.id),
      },
      $setOnInsert: {
        createdByUserId: new mongoose.Types.ObjectId(req.authUser.id),
      },
    },
    { new: true, upsert: true },
  );

  await invalidateApiCache();
  return res.json({
    data: toAiSettingsResponse(settings),
  });
});

app.get("/api/admin/ai/history", requireAdmin, async (req, res) => {
  const search = String(req.query.search ?? "").trim();
  const provider = String(req.query.provider ?? "").trim().toLowerCase();
  const status = String(req.query.status ?? "").trim().toLowerCase();
  const contextType = String(req.query.contextType ?? "").trim().toLowerCase();
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const limit = Math.min(100, Math.max(10, Number(req.query.limit ?? 40) || 40));

  const filter = {};
  if (provider) {
    filter.provider = provider;
  }
  if (status && ["success", "failed"].includes(status)) {
    filter.status = status;
  }
  if (contextType && ["test-summary", "test-config", "other"].includes(contextType)) {
    filter.contextType = contextType;
  }
  if (search) {
    const safe = escapeRegex(search);
    filter.$or = [
      { actorUsername: { $regex: safe, $options: "i" } },
      { actorEmail: { $regex: safe, $options: "i" } },
      { promptUser: { $regex: safe, $options: "i" } },
      { modelName: { $regex: safe, $options: "i" } },
      { providerModelId: { $regex: safe, $options: "i" } },
      { integrationName: { $regex: safe, $options: "i" } },
    ];
  }

  const skip = (page - 1) * limit;

  const [rows, total] = await Promise.all([
    AIHistoryEvent.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AIHistoryEvent.countDocuments(filter),
  ]);

  return res.json({
    data: rows.map((row) => ({
      id: toObjectIdString(row?._id),
      createdAt: row?.createdAt ?? null,
      contextType: row?.contextType ?? "other",
      contextAction: row?.contextAction ?? "",
      projectId: toObjectIdString(row?.projectId) || null,
      runId: toObjectIdString(row?.runId) || null,
      actor: {
        userId: toObjectIdString(row?.actorUserId) || null,
        username: row?.actorUsername ?? "",
        email: row?.actorEmail ?? "",
      },
      provider: row?.provider ?? "",
      integrationId: toObjectIdString(row?.integrationId) || null,
      integrationName: row?.integrationName ?? "",
      modelId: toObjectIdString(row?.modelId) || null,
      modelName: row?.modelName ?? "",
      providerModelId: row?.providerModelId ?? "",
      status: row?.status ?? "failed",
      error: row?.error ?? "",
      promptSystem: row?.promptSystem ?? "",
      promptUser: row?.promptUser ?? "",
      responsePreview: row?.responsePreview ?? "",
      usage: {
        promptTokens: Number(row?.promptTokens ?? 0),
        completionTokens: Number(row?.completionTokens ?? 0),
        totalTokens: Number(row?.totalTokens ?? 0),
        promptChars: Number(row?.promptChars ?? 0),
        responseChars: Number(row?.responseChars ?? 0),
      },
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

app.post("/api/admin/ai/models", requireAdmin, async (req, res) => {
  const { value, error } = validateAiModelCreatePayload(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const integration = await AIIntegration.findById(value.integrationId);
  if (!integration) {
    return res.status(404).json({ error: "AI integration not found." });
  }

  const existingCount = await AIModel.countDocuments({});
  const targetPriority = Math.max(1, Math.min(value.priority ?? existingCount + 1, existingCount + 1));

  if (targetPriority <= existingCount) {
    await AIModel.updateMany(
      { priority: { $gte: targetPriority } },
      {
        $inc: { priority: 1 },
      },
    );
  }

  const model = await AIModel.create({
    name: value.name,
    integrationId: integration._id,
    provider: normalizeAiProvider(integration.provider),
    providerModelId: value.providerModelId,
    priority: targetPriority,
    isEnabled: value.isEnabled,
    createdByUserId: new mongoose.Types.ObjectId(req.authUser.id),
  });

  await invalidateApiCache();
  return res.status(201).json({
    data: toAIModelResponse(model, integration),
  });
});

app.post("/api/admin/ai/models/reorder", requireAdmin, async (req, res) => {
  const modelIds = Array.isArray(req.body?.modelIds) ? req.body.modelIds.map((entry) => String(entry ?? "").trim()) : [];
  if (!modelIds.length) {
    return res.status(400).json({ error: "modelIds must contain at least one model id." });
  }
  if (!modelIds.every((id) => isValidObjectId(id))) {
    return res.status(400).json({ error: "modelIds contains an invalid id." });
  }
  if (new Set(modelIds).size !== modelIds.length) {
    return res.status(400).json({ error: "modelIds must not contain duplicates." });
  }

  const totalModelCount = await AIModel.countDocuments({});
  if (totalModelCount !== modelIds.length) {
    return res.status(400).json({ error: "Provide all model ids in the new priority order." });
  }

  const models = await AIModel.find({ _id: { $in: modelIds } }).lean();
  if (models.length !== modelIds.length) {
    return res.status(400).json({ error: "One or more model ids were not found." });
  }

  await AIModel.bulkWrite(
    modelIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { priority: index + 1 } },
      },
    })),
  );

  await invalidateApiCache();
  return res.json({ success: true });
});

app.patch("/api/admin/ai/models/:id", requireAdmin, async (req, res) => {
  const modelId = String(req.params.id ?? "").trim();
  if (!isValidObjectId(modelId)) {
    return res.status(400).json({ error: "Invalid AI model id." });
  }

  const model = await AIModel.findById(modelId);
  if (!model) {
    return res.status(404).json({ error: "AI model not found." });
  }

  const hasName = Object.prototype.hasOwnProperty.call(req.body ?? {}, "name");
  const hasIntegrationId = Object.prototype.hasOwnProperty.call(req.body ?? {}, "integrationId");
  const hasProviderModelId = Object.prototype.hasOwnProperty.call(req.body ?? {}, "providerModelId");
  const hasPriority = Object.prototype.hasOwnProperty.call(req.body ?? {}, "priority");
  const hasIsEnabled = Object.prototype.hasOwnProperty.call(req.body ?? {}, "isEnabled");

  if (!hasName && !hasIntegrationId && !hasProviderModelId && !hasPriority && !hasIsEnabled) {
    return res.status(400).json({ error: "No updates were provided." });
  }

  if (hasName) {
    const nextName = String(req.body?.name ?? "").trim();
    if (!nextName || nextName.length < 2) {
      return res.status(400).json({ error: "AI model name must be at least 2 characters." });
    }
    model.name = nextName;
  }

  let integration = null;
  if (hasIntegrationId) {
    const integrationId = String(req.body?.integrationId ?? "").trim();
    if (!isValidObjectId(integrationId)) {
      return res.status(400).json({ error: "A valid integrationId is required." });
    }
    integration = await AIIntegration.findById(integrationId);
    if (!integration) {
      return res.status(404).json({ error: "AI integration not found." });
    }
    model.integrationId = integration._id;
    model.provider = normalizeAiProvider(integration.provider);
  }

  if (hasProviderModelId) {
    const nextProviderModelId = String(req.body?.providerModelId ?? "").trim();
    if (!nextProviderModelId) {
      return res.status(400).json({ error: "A provider model id is required." });
    }
    model.providerModelId = nextProviderModelId;
  }

  if (hasIsEnabled) {
    model.isEnabled = Boolean(req.body?.isEnabled);
  }

  if (hasPriority) {
    const requestedPriority = Number(req.body?.priority);
    if (!Number.isFinite(requestedPriority) || requestedPriority <= 0) {
      return res.status(400).json({ error: "priority must be a positive number." });
    }

    const currentPriority = Number(model.priority ?? 1);
    const maxPriority = Math.max(1, await AIModel.countDocuments({}));
    const targetPriority = Math.max(1, Math.min(Math.floor(requestedPriority), maxPriority));

    if (targetPriority < currentPriority) {
      await AIModel.updateMany(
        {
          _id: { $ne: model._id },
          priority: { $gte: targetPriority, $lt: currentPriority },
        },
        { $inc: { priority: 1 } },
      );
      model.priority = targetPriority;
    } else if (targetPriority > currentPriority) {
      await AIModel.updateMany(
        {
          _id: { $ne: model._id },
          priority: { $gt: currentPriority, $lte: targetPriority },
        },
        { $inc: { priority: -1 } },
      );
      model.priority = targetPriority;
    }
  }

  await model.save();
  await normalizeAiModelPriorities();

  const responseIntegration =
    integration ?? (await AIIntegration.findById(toObjectIdString(model.integrationId)).lean()) ?? null;

  await invalidateApiCache();
  return res.json({
    data: toAIModelResponse(model, responseIntegration),
  });
});

app.delete("/api/admin/ai/models/:id", requireAdmin, async (req, res) => {
  const modelId = String(req.params.id ?? "").trim();
  if (!isValidObjectId(modelId)) {
    return res.status(400).json({ error: "Invalid AI model id." });
  }

  const deleted = await AIModel.findByIdAndDelete(modelId);
  if (!deleted) {
    return res.status(404).json({ error: "AI model not found." });
  }

  await AIModel.updateMany(
    { priority: { $gt: Number(deleted.priority ?? 1) } },
    { $inc: { priority: -1 } },
  );

  await normalizeAiModelPriorities();
  await invalidateApiCache();
  return res.json({ success: true });
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
  );

  await syncUserProjectIdentity(user);
  await invalidateApiCache();

  return res.json({
    user: await buildSessionUser(user),
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
  if (!user.passwordHash) {
    return res.status(400).json({ error: "This account currently signs in with GitHub only." });
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
    user: await buildSessionUser(user),
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
    user: await buildSessionUser(user),
    message: "2-step authentication has been disabled.",
  });
});

app.get("/api/projects", async (req, res) => {
  const cacheKey = buildCacheKey("projects", req.authUser);
  const cached = await getCachedJson(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  const allowedProjectIds = getViewableProjectIds(req.authUser);
  const projectFilter = allowedProjectIds === null ? {} : { _id: { $in: allowedProjectIds } };
  const [projects, statsMap] = await Promise.all([
    Project.find(projectFilter).sort({ createdAt: -1 }).lean(),
    getProjectStatsMap(allowedProjectIds),
  ]);

  const payload = {
    data: projects.map((project) => toProjectResponse(project, statsMap.get(project._id.toString()), req.authUser)),
  };

  await setCachedJson(cacheKey, payload, CACHE_TTL_SECONDS.projects);
  return res.json(payload);
});

app.post("/api/projects", async (req, res) => {
  const { value, error } = validateProjectPayload(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const project = await Project.create({
    ...value,
    ownerUserId: new mongoose.Types.ObjectId(req.authUser.id),
    ownerEmail: req.authUser.email,
    ownerUsername: req.authUser.username,
    accessList: [],
  });
  await invalidateApiCache();
  return res.status(201).json({
    data: toProjectResponse(project, undefined, req.authUser),
  });
});

app.delete("/api/projects/:id", async (req, res) => {
  const projectId = String(req.params.id ?? "").trim();
  if (!isValidObjectId(projectId)) {
    return res.status(400).json({ error: "Invalid project id." });
  }

  const { project, error } = await ensureProjectManageAccess(projectId, req.authUser);
  if (error) {
    return res.status(error.status).json({ error: error.message });
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
  const integrations = await Integration.find({ projectId }).select({ _id: 1 }).lean();
  await Integration.deleteMany({ projectId });
  await ProjectIntegrationToken.deleteOne({ projectId });
  await Project.deleteOne({ _id: projectId });
  for (const integration of integrations) {
    unscheduleIntegration(integration._id.toString());
  }
  await invalidateApiCache();

  return res.json({
    success: true,
    deletedRuns: deletedRuns.deletedCount ?? 0,
  });
});

app.get("/api/users/search", async (req, res) => {
  const query = normalizeUsername(req.query.q);
  if (query.length < 2) {
    return res.json({ data: [] });
  }

  const cacheKey = buildCacheKey("users-search", req.authUser, { q: query });
  const cached = await getCachedJson(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  const matcher = new RegExp(`^${escapeRegex(query)}`);
  const users = await User.find({
    $or: [
      { username: { $regex: matcher } },
      { email: { $regex: matcher } },
      { githubUsername: { $regex: matcher } },
    ],
  })
    .select({ username: 1, email: 1, avatarDataUrl: 1, githubId: 1, githubUsername: 1 })
    .limit(8)
    .lean();

  const payload = {
    data: users.map((user) => ({
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      avatarDataUrl: user.avatarDataUrl ?? "",
      githubLinked: Boolean(user.githubId),
    })),
  };

  await setCachedJson(cacheKey, payload, CACHE_TTL_SECONDS.usersSearch);
  return res.json(payload);
});

app.get("/api/projects/:id/access", async (req, res) => {
  const projectId = String(req.params.id ?? "").trim();
  if (!isValidObjectId(projectId)) {
    return res.status(400).json({ error: "Invalid project id." });
  }

  const accessResult = await ensureProjectManageAccess(projectId, req.authUser);
  if (accessResult.error) {
    return res.status(accessResult.error.status).json({ error: accessResult.error.message });
  }

  const cacheKey = buildCacheKey("project-access", req.authUser, { projectId });
  const cached = await getCachedJson(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  const project = accessResult.project.toObject();
  const sharedEmails = [...new Set((project.accessList ?? []).map((entry) => normalizeEmail(entry.email)).filter(Boolean))];
  const linkedUsers = sharedEmails.length
    ? await User.find({ email: { $in: sharedEmails } })
      .select({ username: 1, email: 1, avatarDataUrl: 1, githubId: 1 })
      .lean()
    : [];
  const usersByEmail = new Map(linkedUsers.map((user) => [normalizeEmail(user.email), user]));

  const payload = {
    data: {
      projectId,
      owner: {
        email: project.ownerEmail,
        username: project.ownerUsername,
        avatarDataUrl: req.authUser.id === toObjectIdString(project.ownerUserId) ? req.authUser.avatarDataUrl : "",
        githubLinked: req.authUser.id === toObjectIdString(project.ownerUserId) ? req.authUser.githubLinked : false,
        canView: true,
        canRun: true,
        isOwner: true,
      },
      members: (project.accessList ?? []).map((entry) =>
        toSharedMemberResponse(project, entry, usersByEmail.get(normalizeEmail(entry.email))),
      ),
    },
  };

  await setCachedJson(cacheKey, payload, CACHE_TTL_SECONDS.projectAccess);
  return res.json(payload);
});

app.post("/api/projects/:id/access", async (req, res) => {
  const projectId = String(req.params.id ?? "").trim();
  if (!isValidObjectId(projectId)) {
    return res.status(400).json({ error: "Invalid project id." });
  }

  const { value, error } = validateProjectSharePayload(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const accessResult = await ensureProjectManageAccess(projectId, req.authUser);
  if (accessResult.error) {
    return res.status(accessResult.error.status).json({ error: accessResult.error.message });
  }

  const project = accessResult.project;
  if (value.email === normalizeEmail(project.ownerEmail)) {
    return res.status(409).json({ error: "The project owner already has full access." });
  }

  const linkedUser = await User.findOne({ email: value.email }).lean();
  const nextEntry = {
    email: value.email,
    username: linkedUser?.username ?? "",
    userId: linkedUser?._id ?? null,
    canView: value.canView,
    canRun: value.canRun,
  };

  const existingIndex = (project.accessList ?? []).findIndex((entry) => normalizeEmail(entry.email) === value.email);
  if (existingIndex >= 0) {
    project.accessList.set(existingIndex, nextEntry);
  } else {
    project.accessList.push(nextEntry);
  }

  project.markModified("accessList");
  await project.save();
  await invalidateApiCache();

  const persistedEntry = (project.accessList ?? []).find((entry) => normalizeEmail(entry.email) === value.email) ?? nextEntry;

  return res.status(existingIndex >= 0 ? 200 : 201).json({
    data: toSharedMemberResponse(project, persistedEntry, linkedUser),
  });
});

app.delete("/api/projects/:id/access", async (req, res) => {
  const projectId = String(req.params.id ?? "").trim();
  const email = normalizeEmail(req.query.email);
  if (!isValidObjectId(projectId)) {
    return res.status(400).json({ error: "Invalid project id." });
  }
  if (!email) {
    return res.status(400).json({ error: "A valid email is required." });
  }

  const accessResult = await ensureProjectManageAccess(projectId, req.authUser);
  if (accessResult.error) {
    return res.status(accessResult.error.status).json({ error: accessResult.error.message });
  }

  const project = accessResult.project;
  const originalLength = project.accessList.length;
  project.accessList = project.accessList.filter((entry) => normalizeEmail(entry.email) !== email);
  if (project.accessList.length === originalLength) {
    return res.status(404).json({ error: "That shared access entry was not found." });
  }

  await project.save();
  await invalidateApiCache();

  return res.json({
    success: true,
  });
});

app.get("/api/projects/:id/integrations", async (req, res) => {
  const projectId = String(req.params.id ?? "").trim();
  if (!isValidObjectId(projectId)) {
    return res.status(400).json({ error: "Invalid project id." });
  }

  const viewResult = await ensureProjectViewAccess(projectId, req.authUser);
  if (viewResult.error) {
    return res.status(viewResult.error.status).json({ error: viewResult.error.message });
  }

  const cacheKey = buildCacheKey("project-integrations", req.authUser, { projectId });
  const cached = await getCachedJson(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  const rows = await Integration.find({ projectId }).sort({ createdAt: -1 }).lean();
  const payload = {
    data: rows.map(toIntegrationResponse),
  };

  await setCachedJson(cacheKey, payload, CACHE_TTL_SECONDS.integrations);
  return res.json(payload);
});

app.post("/api/projects/:id/integrations", async (req, res) => {
  const projectId = String(req.params.id ?? "").trim();
  if (!isValidObjectId(projectId)) {
    return res.status(400).json({ error: "Invalid project id." });
  }

  const runResult = await ensureProjectRunAccess(projectId, req.authUser);
  if (runResult.error) {
    return res.status(runResult.error.status).json({ error: runResult.error.message });
  }

  const { value, error } = validateIntegrationPayload(req.body, runResult.project);
  if (error) {
    return res.status(400).json({ error });
  }

  const integration = await Integration.create({
    projectId,
    name: value.name,
    targetUrl: value.targetUrl,
    type: value.type,
    region: value.region,
    vus: value.vus,
    duration: value.duration,
    script: value.script,
    triggerType: value.triggerType,
    cronExpression: value.cronExpression,
    timezone: value.timezone,
    isEnabled: value.isEnabled,
    allowApiTrigger: value.allowApiTrigger,
    createdByUserId: new mongoose.Types.ObjectId(req.authUser.id),
  });

  scheduleIntegration(integration.toObject());
  await invalidateApiCache();

  return res.status(201).json({
    data: toIntegrationResponse(integration),
  });
});

app.patch("/api/projects/:projectId/integrations/:integrationId", async (req, res) => {
  const projectId = String(req.params.projectId ?? "").trim();
  const integrationId = String(req.params.integrationId ?? "").trim();
  if (!isValidObjectId(projectId) || !isValidObjectId(integrationId)) {
    return res.status(400).json({ error: "Invalid project or integration id." });
  }

  const runResult = await ensureProjectRunAccess(projectId, req.authUser);
  if (runResult.error) {
    return res.status(runResult.error.status).json({ error: runResult.error.message });
  }

  const existing = await Integration.findOne({ _id: integrationId, projectId });
  if (!existing) {
    return res.status(404).json({ error: "Integration not found." });
  }

  const { value, error } = validateIntegrationPayload(req.body, runResult.project);
  if (error) {
    return res.status(400).json({ error });
  }

  existing.name = value.name;
  existing.targetUrl = value.targetUrl;
  existing.type = value.type;
  existing.region = value.region;
  existing.vus = value.vus;
  existing.duration = value.duration;
  existing.script = value.script;
  existing.triggerType = value.triggerType;
  existing.cronExpression = value.cronExpression;
  existing.timezone = value.timezone;
  existing.isEnabled = value.isEnabled;
  existing.allowApiTrigger = value.allowApiTrigger;
  await existing.save();

  scheduleIntegration(existing.toObject());
  await invalidateApiCache();

  return res.json({
    data: toIntegrationResponse(existing),
  });
});

app.delete("/api/projects/:projectId/integrations/:integrationId", async (req, res) => {
  const projectId = String(req.params.projectId ?? "").trim();
  const integrationId = String(req.params.integrationId ?? "").trim();
  if (!isValidObjectId(projectId) || !isValidObjectId(integrationId)) {
    return res.status(400).json({ error: "Invalid project or integration id." });
  }

  const runResult = await ensureProjectRunAccess(projectId, req.authUser);
  if (runResult.error) {
    return res.status(runResult.error.status).json({ error: runResult.error.message });
  }

  const deleted = await Integration.findOneAndDelete({ _id: integrationId, projectId });
  if (!deleted) {
    return res.status(404).json({ error: "Integration not found." });
  }

  unscheduleIntegration(integrationId);
  await invalidateApiCache();

  return res.json({
    success: true,
  });
});

app.post("/api/projects/:projectId/integrations/:integrationId/trigger", async (req, res) => {
  const projectId = String(req.params.projectId ?? "").trim();
  const integrationId = String(req.params.integrationId ?? "").trim();
  if (!isValidObjectId(projectId) || !isValidObjectId(integrationId)) {
    return res.status(400).json({ error: "Invalid project or integration id." });
  }
  if (!canRunProject(req.authUser, projectId)) {
    return res.status(403).json({ error: "You do not have permission to run this integration." });
  }

  const integration = await Integration.findOne({ _id: integrationId, projectId }).lean();
  if (!integration) {
    return res.status(404).json({ error: "Integration not found." });
  }

  const triggerResult = await triggerIntegrationRun(integrationId, {
    source: "manual",
    reason: `Triggered by ${req.authUser.username}`,
  });
  if (triggerResult.error) {
    return res.status(triggerResult.error.status).json({ error: triggerResult.error.message });
  }

  return res.status(202).json({
    success: true,
    runId: triggerResult.run._id.toString(),
    status: "queued",
    message: "Integration triggered. Test queued.",
  });
});

app.get("/api/projects/:id/integration-token", async (req, res) => {
  const projectId = String(req.params.id ?? "").trim();
  if (!isValidObjectId(projectId)) {
    return res.status(400).json({ error: "Invalid project id." });
  }

  const accessResult = await ensureProjectManageAccess(projectId, req.authUser);
  if (accessResult.error) {
    return res.status(accessResult.error.status).json({ error: accessResult.error.message });
  }

  const cacheKey = buildCacheKey("project-integration-token", req.authUser, { projectId });
  const cached = await getCachedJson(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  const tokenRecord = await ProjectIntegrationToken.findOne({ projectId }).lean();
  const payload = {
    data: toProjectIntegrationTokenMeta(tokenRecord),
  };
  await setCachedJson(cacheKey, payload, CACHE_TTL_SECONDS.projectToken);
  return res.json(payload);
});

app.post("/api/projects/:id/integration-token/regenerate", async (req, res) => {
  const projectId = String(req.params.id ?? "").trim();
  if (!isValidObjectId(projectId)) {
    return res.status(400).json({ error: "Invalid project id." });
  }

  const accessResult = await ensureProjectManageAccess(projectId, req.authUser);
  if (accessResult.error) {
    return res.status(accessResult.error.status).json({ error: accessResult.error.message });
  }

  const token = generateProjectToken();
  const tokenPreview = `${token.slice(0, 8)}...${token.slice(-6)}`;
  const tokenHash = hashProjectToken(token);

  const tokenRecord = await ProjectIntegrationToken.findOneAndUpdate(
    { projectId },
    {
      $set: {
        tokenHash,
        tokenPreview,
        createdByUserId: new mongoose.Types.ObjectId(req.authUser.id),
        lastUsedAt: null,
      },
    },
    { new: true, upsert: true },
  );

  await invalidateApiCache();

  return res.status(201).json({
    data: {
      token,
      ...toProjectIntegrationTokenMeta(tokenRecord),
    },
  });
});

app.delete("/api/projects/:id/integration-token", async (req, res) => {
  const projectId = String(req.params.id ?? "").trim();
  if (!isValidObjectId(projectId)) {
    return res.status(400).json({ error: "Invalid project id." });
  }

  const accessResult = await ensureProjectManageAccess(projectId, req.authUser);
  if (accessResult.error) {
    return res.status(accessResult.error.status).json({ error: accessResult.error.message });
  }

  await ProjectIntegrationToken.deleteOne({ projectId });
  await invalidateApiCache();

  return res.json({ success: true });
});

app.post("/api/projects/:id/ai/test-config", async (req, res) => {
  const projectId = String(req.params.id ?? "").trim();
  if (!isValidObjectId(projectId)) {
    return res.status(400).json({ error: "Invalid project id." });
  }

  const runResult = await ensureProjectRunAccess(projectId, req.authUser);
  if (runResult.error) {
    return res.status(runResult.error.status).json({ error: runResult.error.message });
  }

  const { value, error } = validateAiTestConfigPayload(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const project = runResult.project;
  const seedTargetUrl = value.targetUrl || project.baseUrl;

  let aiResponse;
  try {
    aiResponse = await executeAiWithFallback({
      temperature: 0.35,
      maxTokens: 1400,
      systemPrompt:
        "You are an expert k6 load-testing engineer. Return only valid JSON with practical defaults.",
      userPrompt: `Generate a single test configuration JSON for LoadPulse.
Required JSON shape:
{
  "name": "string",
  "targetUrl": "https://...",
  "type": "Load|Stress|Spike|Smoke",
  "vus": number,
  "duration": "e.g. 30s, 5m, 1h",
  "script": "full k6 javascript script",
  "notes": "short reason for this config"
}

Requirements:
- Keep script production-safe and runnable by k6.
- Include checks for status and latency threshold.
- Use targetUrl exactly as provided unless invalid.
- Output JSON only, no markdown.

Project:
${JSON.stringify(
        {
          projectId: toObjectIdString(project._id),
          projectName: project.name,
          projectBaseUrl: project.baseUrl,
        },
        null,
        2,
      )}

User intent:
${JSON.stringify(
        {
          goal: value.goal,
          targetUrl: seedTargetUrl,
          typeHint: value.type || "Load",
        },
        null,
        2,
      )}`,
    }, {
      contextType: "test-config",
      contextAction: "generate",
      projectId: toObjectIdString(project._id),
      runId: "",
      actor: req.authUser,
    });
  } catch (aiError) {
    return res.status(502).json({ error: String(aiError?.message ?? aiError ?? "Unable to generate test config.") });
  }

  let parsed;
  try {
    parsed = extractJsonObjectFromText(aiResponse.text);
  } catch {
    return res.status(502).json({ error: "AI returned invalid JSON for test config." });
  }

  const config = sanitizeGeneratedTestConfig(parsed, {
    name: `${value.type} Test (${value.goal.slice(0, 40)})`,
    targetUrl: seedTargetUrl,
    type: value.type,
    vus: 20,
    duration: "30s",
  });

  return res.json({
    data: {
      ...config,
      ai: {
        modelId: toObjectIdString(aiResponse.model?._id),
        modelName: aiResponse.model?.name ?? "",
        provider: normalizeAiProvider(aiResponse.model?.provider),
        providerModelId: aiResponse.model?.providerModelId ?? "",
        integrationName: aiResponse.integration?.name ?? "",
      },
    },
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

  const testRun = await createTestRunFromTemplate(value);

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
    const safeSearch = escapeRegex(search);
    filter.$or = [
      { name: { $regex: safeSearch, $options: "i" } },
      { targetUrl: { $regex: safeSearch, $options: "i" } },
      { type: { $regex: safeSearch, $options: "i" } },
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

  const cacheKey = buildCacheKey("tests-history", req.authUser, {
    search,
    status,
    projectId,
    limit,
  });
  const hasAnyVisibleLiveRuns = getActiveRunSnapshots(projectId || undefined).some((snapshot) =>
    canViewProject(req.authUser, snapshot.projectId),
  );
  if (!hasAnyVisibleLiveRuns) {
    const cached = await getCachedJson(cacheKey);
    if (cached) {
      return res.json(cached);
    }
  }

  const runs = await TestRun.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  const total = await TestRun.countDocuments(filter);
  const payload = {
    data: runs.map(toHistoryItem),
    total,
  };

  if (!hasAnyVisibleLiveRuns) {
    await setCachedJson(cacheKey, payload, CACHE_TTL_SECONDS.testsHistory);
  }

  return res.json(payload);
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
  await invalidateApiCache();
  res.json({
    deletedCount: result.deletedCount ?? 0,
    message: "Completed test history cleared.",
  });
});

app.post("/api/tests/:id/stop", async (req, res) => {
  const runId = String(req.params.id ?? "").trim();
  if (!isValidObjectId(runId)) {
    return res.status(400).json({ error: "Invalid test run id." });
  }

  const run = await TestRun.findById(runId).select({ projectId: 1, status: 1 }).lean();
  if (!run) {
    return res.status(404).json({ error: "Test run not found." });
  }
  if (!canRunProject(req.authUser, run.projectId)) {
    return res.status(403).json({ error: "You do not have permission to stop this test run." });
  }

  if (!["queued", "running"].includes(String(run.status ?? ""))) {
    return res.status(409).json({ error: "Only queued or running tests can be stopped." });
  }

  const stopResponse = await stopActiveRun(runId, {
    reason: `Stopped by ${req.authUser.username}`,
  });

  if (!stopResponse.success) {
    if (!hasActiveRun(runId)) {
      await TestRun.updateOne(
        { _id: runId, status: { $in: ["queued", "running"] } },
        {
          $set: {
            status: "stopped",
            endedAt: new Date(),
            errorMessage: `Stopped by ${req.authUser.username}`,
          },
        },
      );
      await invalidateApiCache();
      return res.json({
        success: true,
        status: "stopped",
        message: "Run marked as stopped.",
      });
    }

    return res.status(409).json({ error: stopResponse.message });
  }

  await invalidateApiCache();
  return res.json({
    success: true,
    status: "stopping",
    message: stopResponse.message,
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

  await invalidateApiCache();

  return res.json({ success: true });
});

app.get("/api/tests/:id/ai-summary", async (req, res) => {
  const runId = String(req.params.id ?? "").trim();
  if (!isValidObjectId(runId)) {
    return res.status(400).json({ error: "Invalid test run id." });
  }

  const run = await TestRun.findById(runId);
  if (!run) {
    return res.status(404).json({ error: "Test run not found." });
  }
  if (!canViewProject(req.authUser, run.projectId)) {
    return res.status(403).json({ error: "You do not have permission to view this test run." });
  }
  if (!TERMINAL_TEST_STATUSES.has(String(run.status ?? ""))) {
    return res.status(409).json({ error: "AI summary is available after the run finishes." });
  }

  return res.json({
    data: run.aiSummary ?? null,
  });
});

app.post("/api/tests/:id/ai-summary/generate", async (req, res) => {
  const runId = String(req.params.id ?? "").trim();
  if (!isValidObjectId(runId)) {
    return res.status(400).json({ error: "Invalid test run id." });
  }

  const run = await TestRun.findById(runId);
  if (!run) {
    return res.status(404).json({ error: "Test run not found." });
  }
  if (!canViewProject(req.authUser, run.projectId)) {
    return res.status(403).json({ error: "You do not have permission to view this test run." });
  }
  if (!TERMINAL_TEST_STATUSES.has(String(run.status ?? ""))) {
    return res.status(409).json({ error: "AI summary is available after the run finishes." });
  }

  try {
    const result = await generateRunAiSummary(run, { force: false, actor: req.authUser });
    return res.json({
      data: {
        ...result.summary,
        cached: result.cached,
      },
    });
  } catch (requestError) {
    return res.status(502).json({ error: String(requestError?.message ?? requestError ?? "Unable to generate AI summary.") });
  }
});

app.post("/api/tests/:id/ai-summary/regenerate", async (req, res) => {
  const runId = String(req.params.id ?? "").trim();
  if (!isValidObjectId(runId)) {
    return res.status(400).json({ error: "Invalid test run id." });
  }

  const run = await TestRun.findById(runId);
  if (!run) {
    return res.status(404).json({ error: "Test run not found." });
  }
  if (!canViewProject(req.authUser, run.projectId)) {
    return res.status(403).json({ error: "You do not have permission to view this test run." });
  }
  if (!TERMINAL_TEST_STATUSES.has(String(run.status ?? ""))) {
    return res.status(409).json({ error: "AI summary is available after the run finishes." });
  }

  try {
    const result = await generateRunAiSummary(run, { force: true, actor: req.authUser });
    return res.json({
      data: {
        ...result.summary,
        cached: result.cached,
      },
    });
  } catch (requestError) {
    return res.status(502).json({ error: String(requestError?.message ?? requestError ?? "Unable to regenerate AI summary.") });
  }
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

  const cacheKey = buildCacheKey("test-detail", req.authUser, { runId });
  if (!["running", "queued"].includes(String(run.status ?? ""))) {
    const cached = await getCachedJson(cacheKey);
    if (cached) {
      return res.json(cached);
    }
  }

  const payload = {
    data: {
      ...toHistoryItem(run),
      finalMetrics: run.finalMetrics ?? null,
      liveMetrics: run.liveMetrics ?? null,
      errorMessage: run.errorMessage ?? null,
      script: run.script,
      aiSummary: run.aiSummary ?? null,
    },
  };

  if (!["running", "queued"].includes(String(run.status ?? ""))) {
    await setCachedJson(cacheKey, payload, CACHE_TTL_SECONDS.testDetail);
  }

  return res.json(payload);
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

  const cacheKey = buildCacheKey("dashboard-overview", req.authUser, { projectId: hasProjectFilter ? projectId : "" });

  const queryFilter = hasProjectFilter ? { projectId } : allowedProjectIds === null ? {} : { projectId: { $in: allowedProjectIds } };

  let liveSnapshots = getActiveRunSnapshots(hasProjectFilter ? projectId : undefined);
  if (!hasProjectFilter && allowedProjectIds !== null) {
    liveSnapshots = liveSnapshots.filter((snapshot) => canViewProject(req.authUser, snapshot.projectId));
  }

  if (liveSnapshots.length === 0) {
    const cached = await getCachedJson(cacheKey);
    if (cached) {
      return res.json(cached);
    }
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
  const payload = {
    ...latestPayload,
    kpis: compiledKpis,
    recentRuns: recentRuns.map(toHistoryItem),
  };

  await setCachedJson(cacheKey, payload, CACHE_TTL_SECONDS.dashboard);
  return res.json(payload);
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
