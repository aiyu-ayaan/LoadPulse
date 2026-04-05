import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, RefreshCcw, Search } from "lucide-react";
import { fetchAdminAiHistory, type AdminAIHistoryEvent } from "../../lib/api";

const formatDateTime = (value: string | null) => (value ? new Date(value).toLocaleString() : "-");

const toPreview = (value: string, max = 130) => {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "-";
  }
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max - 1)}…`;
};

export const AdminAiHistoryPage = () => {
  const [rows, setRows] = useState<AdminAIHistoryEvent[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(40);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [provider, setProvider] = useState("");
  const [status, setStatus] = useState<"success" | "failed" | "">("");
  const [contextType, setContextType] = useState<"test-summary" | "test-config" | "other" | "">("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 280);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchAdminAiHistory({
        search,
        provider: provider || undefined,
        status: status || undefined,
        contextType: contextType || undefined,
        page,
        limit,
      });
      setRows(response.data);
      setTotal(response.pagination.total);
      setTotalPages(response.pagination.totalPages);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load AI history.");
    } finally {
      setIsLoading(false);
    }
  }, [contextType, limit, page, provider, search, status]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    setExpandedRowId(null);
  }, [page, limit, provider, status, contextType, search]);

  const pageTokenTotal = useMemo(
    () => rows.reduce((sum, item) => sum + Number(item.usage.totalTokens ?? 0), 0),
    [rows],
  );
  const pagePromptTokenTotal = useMemo(
    () => rows.reduce((sum, item) => sum + Number(item.usage.promptTokens ?? 0), 0),
    [rows],
  );
  const pageCompletionTokenTotal = useMemo(
    () => rows.reduce((sum, item) => sum + Number(item.usage.completionTokens ?? 0), 0),
    [rows],
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-[#171819] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-400">
            Token and prompt history across all users. Server-side pagination keeps this scalable for large datasets.
          </p>
          <button
            type="button"
            onClick={() => void loadHistory()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-slate-200 transition hover:bg-white/10"
          >
            <RefreshCcw className="h-4 w-4" /> Refresh
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="space-y-1.5 xl:col-span-2">
            <span className="text-xs uppercase tracking-[0.12em] text-slate-500">Search</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="User, model, prompt text, integration..."
                className="w-full rounded-lg border border-white/10 bg-[#121314] py-2 pl-9 pr-3 text-sm text-slate-200 outline-none transition focus:border-primary/60"
              />
            </div>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs uppercase tracking-[0.12em] text-slate-500">Provider</span>
            <select
              value={provider}
              onChange={(event) => {
                setProvider(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-white/10 bg-[#121314] px-3 py-2 text-sm text-slate-200 outline-none"
            >
              <option value="">All providers</option>
              <option value="google">Google</option>
              <option value="groq">Groq</option>
              <option value="openrouter">OpenRouter</option>
              <option value="ollama">Ollama</option>
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs uppercase tracking-[0.12em] text-slate-500">Status</span>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as "success" | "failed" | "");
                setPage(1);
              }}
              className="w-full rounded-lg border border-white/10 bg-[#121314] px-3 py-2 text-sm text-slate-200 outline-none"
            >
              <option value="">All statuses</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs uppercase tracking-[0.12em] text-slate-500">Context</span>
            <select
              value={contextType}
              onChange={(event) => {
                setContextType(event.target.value as "test-summary" | "test-config" | "other" | "");
                setPage(1);
              }}
              className="w-full rounded-lg border border-white/10 bg-[#121314] px-3 py-2 text-sm text-slate-200 outline-none"
            >
              <option value="">All contexts</option>
              <option value="test-summary">Test Summary</option>
              <option value="test-config">Test Config</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs uppercase tracking-[0.12em] text-slate-500">Rows per page</span>
            <select
              value={String(limit)}
              onChange={(event) => {
                setLimit(Number(event.target.value));
                setPage(1);
              }}
              className="w-full rounded-lg border border-white/10 bg-[#121314] px-3 py-2 text-sm text-slate-200 outline-none"
            >
              <option value="20">20</option>
              <option value="40">40</option>
              <option value="60">60</option>
              <option value="100">100</option>
            </select>
          </label>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-white/10 bg-[#171819] px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Rows Found</p>
          <p className="mt-1 text-lg font-semibold text-white">{total}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#171819] px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Page Tokens</p>
          <p className="mt-1 text-lg font-semibold text-white">{pageTokenTotal}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#171819] px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Prompt Tokens</p>
          <p className="mt-1 text-lg font-semibold text-white">{pagePromptTokenTotal}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#171819] px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Completion Tokens</p>
          <p className="mt-1 text-lg font-semibold text-white">{pageCompletionTokenTotal}</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>
      )}

      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#171819]">
        <div className="max-h-[65vh] overflow-auto">
          <table className="w-full min-w-[1250px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-[#131415]">
              <tr className="border-b border-white/10 text-xs uppercase tracking-[0.12em] text-slate-500">
                <th className="w-10 px-3 py-3"></th>
                <th className="px-3 py-3">Time</th>
                <th className="px-3 py-3">User</th>
                <th className="px-3 py-3">Context</th>
                <th className="px-3 py-3">Provider / Model</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Token Usage</th>
                <th className="px-3 py-3">Prompt Preview</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                    Loading AI history...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                    No history events found for current filters.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const isExpanded = expandedRowId === row.id;
                  const actorLabel = row.actor.username || row.actor.email || "Unknown";
                  const providerModelLabel = row.providerModelId || row.modelName || "-";

                  return (
                    <Fragment key={row.id}>
                      <tr className="border-b border-white/5 align-top text-slate-200 hover:bg-white/[0.02]">
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => setExpandedRowId((current) => (current === row.id ? null : row.id))}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/[0.02] text-slate-300 transition hover:bg-white/10"
                          >
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-400">{formatDateTime(row.createdAt)}</td>
                        <td className="px-3 py-3">
                          <p className="font-medium text-white">{actorLabel}</p>
                          <p className="text-xs text-slate-500">{row.actor.email || row.actor.userId || "-"}</p>
                        </td>
                        <td className="px-3 py-3">
                          <p className="text-xs uppercase tracking-[0.12em] text-slate-500">{row.contextType}</p>
                          <p className="mt-1 text-xs text-slate-300">{row.contextAction || "-"}</p>
                          <p className="mt-1 text-[11px] text-slate-500">Run: {row.runId || "-"}</p>
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-medium text-white">{row.provider || "-"}</p>
                          <p className="text-xs text-slate-400">{providerModelLabel}</p>
                          <p className="text-xs text-slate-500">{row.integrationName || "-"}</p>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`rounded px-2 py-1 text-xs ${
                              row.status === "success"
                                ? "bg-emerald-500/20 text-emerald-200"
                                : "bg-rose-500/20 text-rose-200"
                            }`}
                          >
                            {row.status}
                          </span>
                          {row.error && <p className="mt-2 max-w-[220px] text-xs text-rose-300">{toPreview(row.error, 90)}</p>}
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-300">
                          <p>Total: {row.usage.totalTokens}</p>
                          <p>Prompt: {row.usage.promptTokens}</p>
                          <p>Completion: {row.usage.completionTokens}</p>
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-300">{toPreview(row.promptUser)}</td>
                      </tr>

                      {isExpanded && (
                        <tr className="border-b border-white/10 bg-black/20">
                          <td colSpan={8} className="px-3 py-3">
                            <div className="grid gap-3 lg:grid-cols-2">
                              <div className="rounded-lg border border-white/10 bg-[#0f1011] p-3">
                                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">System Prompt</p>
                                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-xs text-slate-200">{row.promptSystem || "-"}</pre>
                              </div>
                              <div className="rounded-lg border border-white/10 bg-[#0f1011] p-3">
                                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">User Prompt</p>
                                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-xs text-slate-200">{row.promptUser || "-"}</pre>
                              </div>
                              <div className="rounded-lg border border-white/10 bg-[#0f1011] p-3 lg:col-span-2">
                                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Response Preview</p>
                                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-xs text-slate-200">{row.responsePreview || "-"}</pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-3 py-2 text-xs text-slate-400">
          <p>
            Page {page} of {totalPages} • Showing {rows.length} rows
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="rounded border border-white/10 bg-white/[0.03] px-3 py-1.5 text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              className="rounded border border-white/10 bg-white/[0.03] px-3 py-1.5 text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
