export interface ProjectStats {
  totalRuns: number;
  activeRuns: number;
  successfulRuns: number;
  successRatePct: number;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunName: string | null;
}

export interface Project {
  id: string;
  name: string;
  baseUrl: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  stats: ProjectStats;
}

export interface ProjectPermission {
  projectId: string;
  canView: boolean;
  canRun: boolean;
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  isAdmin: boolean;
  projectPermissions: ProjectPermission[];
}

export interface SignInPayload {
  username: string;
  password: string;
}

export interface SignInResponse {
  token: string;
  expiresIn: number;
  user: AuthUser;
}

export interface SetupStatusResponse {
  needsSetup: boolean;
}

export interface CreateUserPayload {
  username: string;
  email: string;
  password: string;
  isAdmin: boolean;
  projectPermissions: ProjectPermission[];
}

export interface SetupAdminPayload {
  username: string;
  email: string;
  password: string;
}

export interface DashboardKpis {
  totalRequests: number;
  avgResponseTimeMs: number;
  errorRatePct: number;
  throughputRps: number;
}

export interface RunningTestSummary {
  id: string;
  name: string;
  status: string;
  totalRequests: number;
  avgResponseTimeMs: number;
  errorRatePct: number;
  throughputRps: number;
  updatedAt: string;
}

export interface DashboardOverview {
  source: "live" | "latest" | "empty";
  currentRun: {
    id: string;
    name: string;
    status: string;
  } | null;
  kpis: DashboardKpis;
  responseTimeData: Array<{ time: string; ms: number }>;
  rpsData: Array<{ time: string; rps: number }>;
  statusData: Array<{ name: string; value: number; color: string }>;
  activeRunCount: number;
  runningTests: RunningTestSummary[];
  recentRuns: TestHistoryItem[];
}

export interface TestHistoryItem {
  id: string;
  projectId: string;
  projectName: string;
  projectBaseUrl: string;
  name: string;
  targetUrl: string;
  status: string;
  type: string;
  region: string;
  vus: number;
  duration: string;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  avgLatencyMs: number | null;
  errorRatePct: number | null;
  totalRequests: number | null;
}

interface TestHistoryResponse {
  data: TestHistoryItem[];
  total: number;
}

export interface RunTestPayload {
  projectId: string;
  name: string;
  targetUrl: string;
  type: string;
  region: string;
  vus: number;
  duration: string;
  script: string;
}

export interface TestRunDetail extends TestHistoryItem {
  finalMetrics: {
    totalRequests: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    errorRatePct: number;
    throughputRps: number;
    checksPassed: number;
    checksFailed: number;
    statusCodes: {
      ok2xx: number;
      client4xx: number;
      server5xx: number;
      other: number;
    };
  } | null;
  liveMetrics: {
    totalRequests: number;
    avgLatencyMs: number;
    errorRatePct: number;
    throughputRps: number;
    lastUpdatedAt: string | null;
    statusCodes: {
      ok2xx: number;
      client4xx: number;
      server5xx: number;
      other: number;
    };
    responseTimeSeries: Array<{ time: string; value: number; timestamp: string }>;
    rpsSeries: Array<{ time: string; value: number; timestamp: string }>;
  } | null;
  errorMessage: string | null;
  script: string;
}

const baseUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") ?? "";
const TOKEN_STORAGE_KEY = "loadpulse.auth.token";

const readStoredToken = () => {
  if (typeof window === "undefined") {
    return null;
  }
  const stored = window.localStorage.getItem(TOKEN_STORAGE_KEY);
  return stored && stored.trim() ? stored : null;
};

let authToken: string | null = readStoredToken();

export const socketUrl = baseUrl || window.location.origin;

export const getAuthToken = () => authToken;

export const setAuthToken = (token: string | null) => {
  authToken = token && token.trim() ? token.trim() : null;
  if (typeof window === "undefined") {
    return;
  }
  if (authToken) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, authToken);
  } else {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
};

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const headers = new Headers(init?.headers ?? {});
  const hasBody = init?.body !== undefined && init?.body !== null;
  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (authToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) {
        message = body.error;
      }
    } catch {
      // Ignore parsing errors and keep generic message.
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
};

export const signIn = (payload: SignInPayload) =>
  request<SignInResponse>("/api/auth/signin", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const fetchSetupStatus = () => request<SetupStatusResponse>("/api/auth/setup-status");

export const setupAdminAccount = (payload: SetupAdminPayload) =>
  request<SignInResponse>("/api/auth/setup-admin", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const fetchCurrentUser = () => request<{ user: AuthUser }>("/api/auth/me");

export const fetchProjects = () => request<{ data: Project[] }>("/api/projects");

export const createProject = (payload: { name: string; baseUrl: string; description?: string }) =>
  request<{ data: Project }>("/api/projects", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const deleteProject = (id: string) =>
  request<{ success: boolean; deletedRuns: number }>(`/api/projects/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

export const fetchUsers = () => request<{ data: AuthUser[] }>("/api/users");

export const createUser = (payload: CreateUserPayload) =>
  request<{ data: AuthUser }>("/api/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const fetchDashboardOverview = (projectId: string) =>
  request<DashboardOverview>(`/api/dashboard/overview?projectId=${encodeURIComponent(projectId)}`);

export const runTest = (payload: RunTestPayload) =>
  request<{ id: string; status: string; message: string }>("/api/tests/run", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const fetchTestHistory = (projectId: string, search: string) => {
  const query = new URLSearchParams();
  query.set("projectId", projectId);
  if (search) {
    query.set("search", search);
  }
  return request<TestHistoryResponse>(`/api/tests/history?${query.toString()}`);
};

export const clearHistory = (projectId: string) =>
  request<{ deletedCount: number; message: string }>(`/api/tests/history?projectId=${encodeURIComponent(projectId)}`, {
    method: "DELETE",
  });

export const deleteTestRun = (id: string) =>
  request<{ success: boolean }>(`/api/tests/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

export const fetchTestRun = (id: string) =>
  request<{ data: TestRunDetail }>(`/api/tests/${encodeURIComponent(id)}`);
