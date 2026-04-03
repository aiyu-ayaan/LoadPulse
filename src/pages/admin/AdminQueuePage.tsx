import { useEffect, useState } from "react";
import { fetchAdminTestHistory, type TestHistoryItem } from "../../lib/api";

const statusOptions = ["all", "queued", "running", "success", "failed", "stopped"] as const;

export const AdminQueuePage = () => {
  const [items, setItems] = useState<TestHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof statusOptions)[number]>("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetchAdminTestHistory({
          search,
          status: status === "all" ? undefined : status,
          limit: 120,
        });
        setItems(response.data);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Unable to load queue.");
      } finally {
        setIsLoading(false);
      }
    };

    const timer = window.setTimeout(() => {
      void load();
    }, 180);

    return () => window.clearTimeout(timer);
  }, [search, status]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search test name or URL"
          className="h-9 min-w-[250px] rounded-lg border border-white/10 bg-[#121314] px-3 text-sm text-slate-200 outline-none transition focus:border-primary/60"
        />
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as (typeof statusOptions)[number])}
          className="h-9 rounded-lg border border-white/10 bg-[#121314] px-3 text-sm text-slate-200 outline-none transition focus:border-primary/60"
        >
          {statusOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}

      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#171819]">
        <div className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr_1fr] border-b border-white/10 px-4 py-2 text-xs uppercase tracking-[0.12em] text-slate-500">
          <p>Test</p>
          <p>Project</p>
          <p>Status</p>
          <p>Load</p>
          <p>Created</p>
        </div>

        {isLoading ? (
          <div className="px-4 py-6 text-sm text-slate-400">Loading queue...</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-400">No test runs found.</div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-1 gap-2 border-b border-white/10 px-4 py-3 text-sm text-slate-200 md:grid-cols-[1.2fr_1fr_0.8fr_0.8fr_1fr]"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">{item.name}</p>
                <p className="truncate text-xs text-slate-400">{item.targetUrl}</p>
              </div>
              <div className="truncate text-slate-300">{item.projectName}</div>
              <div>
                <span
                  className={`rounded px-2 py-1 text-xs ${
                    item.status === "success"
                      ? "bg-emerald-500/20 text-emerald-200"
                      : item.status === "failed"
                        ? "bg-rose-500/20 text-rose-200"
                        : item.status === "stopped"
                          ? "bg-amber-500/20 text-amber-200"
                        : "bg-primary/20 text-primary"
                  }`}
                >
                  {item.status}
                </span>
              </div>
              <div className="text-slate-300">
                {item.vus} VUs • {item.duration}
              </div>
              <div className="text-slate-400">{new Date(item.createdAt).toLocaleString()}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
