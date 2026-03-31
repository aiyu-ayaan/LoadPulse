import { useEffect, useState } from "react";
import { Search, ExternalLink, Trash2, Play, AlertCircle, CheckCircle2, Clock, History, FolderKanban } from "lucide-react";
import { motion } from "framer-motion";
import { EmptyState } from "../components/EmptyState";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { useNavigate } from "react-router-dom";
import { clearHistory, deleteTestRun, fetchTestHistory, type TestHistoryItem } from "../lib/api";
import { useProjects } from "../context/useProjects";

const formatDateTime = (value: string | null) => {
  if (!value) {
    return "N/A";
  }
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const toLatencyLabel = (latency: number | null) => {
  if (latency === null) {
    return "N/A";
  }
  return `${Math.round(latency)}ms`;
};

export const TestHistoryPage = () => {
  const navigate = useNavigate();
  const { selectedProject } = useProjects();
  const [data, setData] = useState<TestHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedProject) {
      setIsLoading(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetchTestHistory(selectedProject.id, query);
        setData(response.data);
        setError(null);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Unable to fetch test history.");
      } finally {
        setIsLoading(false);
      }
    }, 280);

    return () => window.clearTimeout(timer);
  }, [query, selectedProject]);

  const handleDeleteAll = async () => {
    if (!selectedProject) {
      return;
    }
    try {
      await clearHistory(selectedProject.id);
      const response = await fetchTestHistory(selectedProject.id, query);
      setData(response.data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to clear history.");
    }
  };

  const handleDeleteOne = async (id: string) => {
    try {
      await deleteTestRun(id);
      setData((previousData) => previousData.filter((item) => item.id !== id));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to delete test run.");
    }
  };

  if (!selectedProject) {
    return (
      <EmptyState
        icon={FolderKanban}
        title="Select a project first"
        description="Each project has its own test history. Choose a project from the top bar."
        actionText="Go To Projects"
        onAction={() => navigate("/projects")}
      />
    );
  }

  return (
    <div className="space-y-8 pb-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-white tracking-tight">Test History</h1>
          <p className="text-sm text-muted md:text-base">
            Project: <span className="font-semibold text-white">{selectedProject.name}</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tests..."
              className="h-10 w-[220px] rounded-xl border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm text-slate-100 outline-none transition focus:border-primary/50"
            />
          </div>

          <button className="glass-panel px-3 py-2 text-xs font-semibold rounded-xl text-slate-300 transition hover:bg-white/10" onClick={() => void handleDeleteAll()}>
            Clear List
          </button>

          <button
            onClick={() => navigate("/new-test")}
            className="bg-primary text-white flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all"
          >
            <Play className="w-4 h-4" /> Start New
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      )}

      {isLoading ? (
        <div className="glass-panel rounded-2xl p-6 space-y-4">
          <LoadingSkeleton className="h-8 w-52 rounded-lg" />
          {Array.from({ length: 5 }).map((_, index) => (
            <LoadingSkeleton key={index} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyState
          icon={History}
          title="No tests yet"
          description="Run your first performance test from the New Test page."
          actionText="Run Your First Test"
          onAction={() => navigate("/new-test")}
        />
      ) : (
        <div className="glass-panel overflow-hidden rounded-2xl border border-white/10">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/5 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                  <th className="px-6 py-4">Test Name</th>
                  <th className="px-6 py-4">Date & Time</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Avg Wait</th>
                  <th className="px-6 py-4">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-white/5">
                {data.map((test, index) => (
                  <motion.tr
                    key={test.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="group hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-white group-hover:text-primary transition-colors">{test.name}</span>
                        <span className="text-xs text-slate-500">
                          {test.type} • {test.vus} virtual users
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-400">{formatDateTime(test.createdAt)}</td>
                    <td className="px-6 py-4">
                      {test.status === "success" && (
                        <div className="flex items-center gap-2 text-emerald-500">
                          <CheckCircle2 className="w-4 h-4" /> Success
                        </div>
                      )}
                      {test.status === "failed" && (
                        <div className="flex items-center gap-2 text-rose-500">
                          <AlertCircle className="w-4 h-4" /> Failed
                        </div>
                      )}
                      {(test.status === "running" || test.status === "queued") && (
                        <div className="flex items-center gap-2 text-primary animate-pulse">
                          <Clock className="w-4 h-4" /> Running...
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-300">{toLatencyLabel(test.avgLatencyMs)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => navigate(`/tests/${test.id}`)}
                          className="h-9 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200 hover:border-primary/40 hover:text-primary transition-colors flex items-center gap-2"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> View
                        </button>
                        <button
                          onClick={() => void handleDeleteOne(test.id)}
                          className="h-9 w-9 rounded-lg border border-white/10 bg-white/[0.04] text-slate-400 hover:border-rose-500/40 hover:text-rose-500 transition-colors grid place-content-center"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white/5 px-6 py-4 flex items-center justify-between text-xs text-slate-500">
            <span>Showing {data.length} test runs for {selectedProject.name}</span>
            <div className="flex gap-2">
              <button className="glass px-3 py-1 rounded-md hover:text-white disabled:opacity-50" disabled>
                Previous
              </button>
              <button className="glass px-3 py-1 rounded-md hover:text-white">Next</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

