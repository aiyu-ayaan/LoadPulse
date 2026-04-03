export interface ProjectStats {
  totalRuns: number;
  activeRuns: number;
  successfulRuns: number;
  successRatePct: number;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunName: string | null;
}

export interface ProjectAccessSummary {
  canView: boolean;
  canRun: boolean;
  canManage: boolean;
  isOwner: boolean;
  sharedMemberCount: number;
}

export interface Project {
  id: string;
  name: string;
  baseUrl: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  owner: {
    username: string;
    email: string;
  };
  access: ProjectAccessSummary;
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
  avatarDataUrl: string;
  githubLinked: boolean;
  githubUsername: string;
  hasPassword: boolean;
  isAdmin: boolean;
  isOwner: boolean;
  isActive: boolean;
  twoFactorEnabled: boolean;
  projectPermissions: ProjectPermission[];
}

export interface SignInPayload {
  username: string;
  password: string;
}

export interface SignUpPayload {
  username: string;
  email: string;
  password: string;
}

export interface AuthSessionResponse {
  token: string;
  expiresIn: number;
  user: AuthUser;
}

export interface TwoFactorChallengeResponse {
  requiresTwoFactor: true;
  pendingToken: string;
  expiresIn: number;
  user: {
    username: string;
    email: string;
  };
}

export type SignInResponse = AuthSessionResponse | TwoFactorChallengeResponse;

export interface AuthOptionsResponse {
  localEnabled: boolean;
  githubEnabled: boolean;
  hasUsers: boolean;
  hasAdmins: boolean;
}

export interface SetupStatusResponse {
  needsSetup: boolean;
  githubEnabled: boolean;
}

export interface UpdateProfilePayload {
  username: string;
  email: string;
  avatarDataUrl: string;
}

export interface TwoFactorSetupResponse {
  qrCodeDataUrl: string;
  manualKey: string;
}

export interface UserSearchResult {
  id: string;
  username: string;
  email: string;
  avatarDataUrl: string;
  githubLinked: boolean;
}

export interface ProjectAccessMember {
  key: string;
  email: string;
  username: string;
  avatarDataUrl: string;
  githubLinked: boolean;
  hasAccount: boolean;
  canView: boolean;
  canRun: boolean;
  isOwner: boolean;
  joinedVia: "github" | "local" | "pending";
}

export interface ProjectAccessResponse {
  projectId: string;
  owner: ProjectAccessMember;
  members: ProjectAccessMember[];
}

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  isAdmin: boolean;
  isOwner: boolean;
  isActive: boolean;
  githubLinked: boolean;
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
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

export interface AdminAboutResponse {
  name: string;
  version: string;
  nodeVersion: string;
  runtime: string;
  acknowledgements: Array<{
    name: string;
    version: string;
    type: "runtime" | "development";
  }>;
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

export interface ProjectIntegration {
  id: string;
  projectId: string;
  name: string;
  targetUrl: string;
  type: string;
  region: string;
  vus: number;
  duration: string;
  script: string;
  triggerType: "cron" | "api";
  cronExpression: string;
  timezone: string;
  isEnabled: boolean;
  allowApiTrigger: boolean;
  lastTriggeredAt: string | null;
  lastRunId: string | null;
  lastRunStatus: string;
  lastTriggerSource: string;
  lastError: string;
  hookPath: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectIntegrationTokenMeta {
  hasToken: boolean;
  preview: string;
  updatedAt: string | null;
  lastUsedAt: string | null;
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

export const getGitHubAuthStartUrl = () => `${baseUrl}/api/auth/github/start`;
export const getGitHubAdminAuthStartUrl = () => `${baseUrl}/api/auth/github/start-admin`;

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
    credentials: init?.credentials ?? "include",
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

export const fetchAuthOptions = () => request<AuthOptionsResponse>("/api/auth/options");

export const signIn = (payload: SignInPayload) =>
  request<SignInResponse>("/api/auth/signin", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const signUp = (payload: SignUpPayload) =>
  request<AuthSessionResponse>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const fetchSetupStatus = () => request<SetupStatusResponse>("/api/auth/setup-status");

export const fetchCurrentUser = () => request<{ user: AuthUser }>("/api/auth/me");

export const verifyTwoFactorSignIn = (payload: { pendingToken: string; code: string }) =>
  request<AuthSessionResponse>("/api/auth/verify-2fa", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const signOutSession = () =>
  request<null>("/api/auth/signout", {
    method: "POST",
  });

export const updateProfile = (payload: UpdateProfilePayload) =>
  request<{ user: AuthUser }>("/api/auth/profile", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const changePassword = (payload: { currentPassword: string; newPassword: string }) =>
  request<{ success: boolean; message: string }>("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const setupTwoFactor = () =>
  request<TwoFactorSetupResponse>("/api/auth/2fa/setup", {
    method: "POST",
  });

export const enableTwoFactor = (code: string) =>
  request<{ user: AuthUser; message: string }>("/api/auth/2fa/enable", {
    method: "POST",
    body: JSON.stringify({ code }),
  });

export const disableTwoFactor = (code: string) =>
  request<{ user: AuthUser; message: string }>("/api/auth/2fa/disable", {
    method: "POST",
    body: JSON.stringify({ code }),
  });

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

export const searchUsers = (query: string) =>
  request<{ data: UserSearchResult[] }>(`/api/users/search?q=${encodeURIComponent(query)}`);

export const fetchAdminUsers = () => request<{ data: AdminUser[] }>("/api/admin/users");

export const fetchAdminAbout = () => request<{ data: AdminAboutResponse }>("/api/admin/about");

export const createAdminUser = (payload: { username: string; email: string; password: string; isAdmin?: boolean; isActive?: boolean }) =>
  request<{ data: AdminUser }>("/api/admin/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const setAdminUserStatus = (userId: string, isActive: boolean) =>
  request<{ data: AdminUser }>(`/api/admin/users/${encodeURIComponent(userId)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });

export const setAdminUserRole = (userId: string, isAdmin: boolean) =>
  request<{ data: AdminUser }>(`/api/admin/users/${encodeURIComponent(userId)}/admin`, {
    method: "PATCH",
    body: JSON.stringify({ isAdmin }),
  });

export const fetchProjectAccess = (projectId: string) =>
  request<{ data: ProjectAccessResponse }>(`/api/projects/${encodeURIComponent(projectId)}/access`);

export const shareProjectAccess = (projectId: string, payload: { email: string; canView: boolean; canRun: boolean }) =>
  request<{ data: ProjectAccessMember }>(`/api/projects/${encodeURIComponent(projectId)}/access`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const removeProjectAccess = (projectId: string, email: string) =>
  request<{ success: boolean }>(`/api/projects/${encodeURIComponent(projectId)}/access?email=${encodeURIComponent(email)}`, {
    method: "DELETE",
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

export const fetchAdminTestHistory = (payload: { search?: string; status?: string; limit?: number }) => {
  const query = new URLSearchParams();
  if (payload.search) {
    query.set("search", payload.search);
  }
  if (payload.status) {
    query.set("status", payload.status);
  }
  query.set("limit", String(payload.limit ?? 100));
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

export const stopTestRun = (id: string) =>
  request<{ success: boolean; status: string; message: string }>(`/api/tests/${encodeURIComponent(id)}/stop`, {
    method: "POST",
  });

export const fetchTestRun = (id: string) =>
  request<{ data: TestRunDetail }>(`/api/tests/${encodeURIComponent(id)}`);

export const fetchProjectIntegrations = (projectId: string) =>
  request<{ data: ProjectIntegration[] }>(`/api/projects/${encodeURIComponent(projectId)}/integrations`);

export const createProjectIntegration = (
  projectId: string,
  payload: {
    name: string;
    targetUrl: string;
    type: string;
    region: string;
    vus: number;
    duration: string;
    script: string;
    triggerType?: "cron" | "api";
    cronExpression?: string;
    timezone?: string;
    isEnabled?: boolean;
  },
) =>
  request<{ data: ProjectIntegration }>(`/api/projects/${encodeURIComponent(projectId)}/integrations`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const updateProjectIntegration = (
  projectId: string,
  integrationId: string,
  payload: {
    name: string;
    targetUrl: string;
    type: string;
    region: string;
    vus: number;
    duration: string;
    script: string;
    triggerType?: "cron" | "api";
    cronExpression?: string;
    timezone?: string;
    isEnabled?: boolean;
  },
) =>
  request<{ data: ProjectIntegration }>(
    `/api/projects/${encodeURIComponent(projectId)}/integrations/${encodeURIComponent(integrationId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );

export const deleteProjectIntegration = (projectId: string, integrationId: string) =>
  request<{ success: boolean }>(
    `/api/projects/${encodeURIComponent(projectId)}/integrations/${encodeURIComponent(integrationId)}`,
    {
      method: "DELETE",
    },
  );

export const triggerProjectIntegration = (projectId: string, integrationId: string) =>
  request<{ success: boolean; runId: string; status: string; message: string }>(
    `/api/projects/${encodeURIComponent(projectId)}/integrations/${encodeURIComponent(integrationId)}/trigger`,
    {
      method: "POST",
    },
  );

export const fetchProjectIntegrationToken = (projectId: string) =>
  request<{ data: ProjectIntegrationTokenMeta }>(`/api/projects/${encodeURIComponent(projectId)}/integration-token`);

export const regenerateProjectIntegrationToken = (projectId: string) =>
  request<{ data: ProjectIntegrationTokenMeta & { token: string } }>(
    `/api/projects/${encodeURIComponent(projectId)}/integration-token/regenerate`,
    {
      method: "POST",
    },
  );

export const revokeProjectIntegrationToken = (projectId: string) =>
  request<{ success: boolean }>(`/api/projects/${encodeURIComponent(projectId)}/integration-token`, {
    method: "DELETE",
  });
