export interface DashboardKpis {
  totalRequests: number;
  avgResponseTimeMs: number;
  errorRatePct: number;
  throughputRps: number;
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
  recentRuns: TestHistoryItem[];
}

export interface TestHistoryItem {
  id: string;
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
  name: string;
  targetUrl: string;
  type: string;
  region: string;
  vus: number;
  duration: string;
  script: string;
}

const baseUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") ?? "";

export const socketUrl = baseUrl || window.location.origin;

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
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

  return (await response.json()) as T;
};

export const fetchDashboardOverview = () => request<DashboardOverview>("/api/dashboard/overview");

export const runTest = (payload: RunTestPayload) =>
  request<{ id: string; status: string; message: string }>("/api/tests/run", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const fetchTestHistory = (search: string) => {
  const query = search ? `?search=${encodeURIComponent(search)}` : "";
  return request<TestHistoryResponse>(`/api/tests/history${query}`);
};

export const clearHistory = () =>
  request<{ deletedCount: number; message: string }>("/api/tests/history", {
    method: "DELETE",
  });

export const deleteTestRun = (id: string) =>
  request<{ success: boolean }>(`/api/tests/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
