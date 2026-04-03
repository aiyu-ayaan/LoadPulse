import { useEffect, useMemo, useState } from "react";
import { fetchAdminAbout, type AdminAboutResponse } from "../../lib/api";

export const AdminAboutPage = () => {
  const [about, setAbout] = useState<AdminAboutResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDevDependencies, setShowDevDependencies] = useState(false);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetchAdminAbout();
        setAbout(response.data);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Unable to load about details.");
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, []);

  const dependencyRows = useMemo(() => {
    const rows = about?.acknowledgements ?? [];
    return rows.filter((entry) => (showDevDependencies ? true : entry.type === "runtime"));
  }, [about?.acknowledgements, showDevDependencies]);

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}

      <div className="rounded-xl border border-white/10 bg-[#171819] px-4 py-4">
        {isLoading ? (
          <p className="text-sm text-slate-400">Loading about info...</p>
        ) : (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-white">{about?.name ?? "LoadPulse"}</h2>
            <div className="grid gap-2 text-sm text-slate-300 md:grid-cols-2">
              <p>
                Version: <span className="font-semibold text-slate-100">{about?.version ?? "unknown"}</span>
              </p>
              <p>
                Runtime: <span className="font-semibold text-slate-100">{about?.runtime ?? "unknown"}</span>
              </p>
              <p>
                Node.js: <span className="font-semibold text-slate-100">{about?.nodeVersion ?? "unknown"}</span>
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-white/10 bg-[#171819]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Acknowledgements</h3>
            <p className="text-xs text-slate-400">Libraries used in this project.</p>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={showDevDependencies}
              onChange={(event) => setShowDevDependencies(event.target.checked)}
            />
            Show dev dependencies
          </label>
        </div>

        <div className="max-h-[500px] overflow-auto">
          <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr] border-b border-white/10 px-4 py-2 text-xs uppercase tracking-[0.12em] text-slate-500">
            <p>Library</p>
            <p>Version</p>
            <p>Type</p>
          </div>

          {isLoading ? (
            <div className="px-4 py-5 text-sm text-slate-400">Loading acknowledgements...</div>
          ) : dependencyRows.length === 0 ? (
            <div className="px-4 py-5 text-sm text-slate-400">No dependency data available.</div>
          ) : (
            dependencyRows.map((entry) => (
              <div key={`${entry.type}:${entry.name}`} className="grid grid-cols-[1.4fr_0.8fr_0.8fr] border-b border-white/10 px-4 py-2.5 text-sm text-slate-200">
                <p className="font-medium text-white">{entry.name}</p>
                <p>{entry.version}</p>
                <p className="capitalize text-slate-400">{entry.type}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
