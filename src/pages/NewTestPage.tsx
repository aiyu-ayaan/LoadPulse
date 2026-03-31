import { useEffect, useState } from "react";
import { Play, Code2, Settings2, Globe, Clock, Users, ChevronDown, Save, Terminal, FolderKanban } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { runTest } from "../lib/api";
import { useProjects } from "../context/useProjects";
import { EmptyState } from "../components/EmptyState";
import { useAuth } from "../context/useAuth";

const buildTemplateScript = (url: string, vus: number, duration: string) => `import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  vus: ${vus},
  duration: '${duration}',
};

export default function () {
  const res = http.get('${url}');
  check(res, {
    'status was 200': (r) => r.status === 200,
  });
  sleep(1);
}`;

export const NewTestPage = () => {
  const navigate = useNavigate();
  const { selectedProject } = useProjects();
  const { user } = useAuth();

  const [name, setName] = useState("Homepage Experience Check");
  const [targetUrl, setTargetUrl] = useState(selectedProject?.baseUrl ?? "https://");
  const [vus, setVus] = useState(20);
  const [duration, setDuration] = useState("30s");
  const [type, setType] = useState("Load");
  const [region] = useState("us-east-1");
  const [script, setScript] = useState(buildTemplateScript(selectedProject?.baseUrl ?? "https://", 20, "30s"));
  const [isScriptDirty, setIsScriptDirty] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const canRunCurrentProject = Boolean(
    selectedProject &&
      (user?.isAdmin || user?.projectPermissions.some((permission) => permission.projectId === selectedProject.id && permission.canRun)),
  );

  useEffect(() => {
    if (!selectedProject) {
      return;
    }
    setTargetUrl(selectedProject.baseUrl);
    if (!isScriptDirty) {
      setScript(buildTemplateScript(selectedProject.baseUrl, vus, duration));
    }
  }, [selectedProject, isScriptDirty, vus, duration]);

  useEffect(() => {
    if (!isScriptDirty) {
      setScript(buildTemplateScript(targetUrl, vus, duration));
    }
  }, [targetUrl, vus, duration, isScriptDirty]);

  const handleRunTest = async () => {
    if (!selectedProject) {
      setError("Please create or select a project first.");
      return;
    }
    if (!canRunCurrentProject) {
      setError("Your account can view this project but cannot run tests for it.");
      return;
    }

    setIsRunning(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const run = await runTest({
        projectId: selectedProject.id,
        name,
        targetUrl,
        vus,
        duration,
        script: isScriptDirty ? script : "",
        type,
        region,
      });
      setSuccessMessage("Test started. Opening test details...");
      navigate(`/tests/${run.id}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to run test.");
    } finally {
      setIsRunning(false);
    }
  };

  if (!selectedProject) {
    return (
      <EmptyState
        icon={FolderKanban}
        title="No Project Selected"
        description="Create a project with your website URL first, then you can run tests."
        actionText="Go To Projects"
        onAction={() => navigate("/projects")}
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-white">Run New Test</h1>
          <p className="text-sm text-muted md:text-base">
            Project: <span className="font-semibold text-white">{selectedProject.name}</span> • {selectedProject.baseUrl}
          </p>
        </div>

        <div className="flex gap-3">
          <button className="glass-panel flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors hover:bg-white/10">
            <Save className="h-4 w-4" /> Save Draft
          </button>
          <button className="glass-panel flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors hover:bg-white/10">
            <Terminal className="h-4 w-4" /> CLI Instructions
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      )}
      {successMessage && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {successMessage}
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <div className="glass-panel space-y-5 rounded-2xl p-6">
            <div className="mb-2 flex items-center gap-2 border-b border-white/10 pb-4">
              <Settings2 className="h-5 w-5 text-primary" />
              <h3 className="font-bold">Test Setup</h3>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted">Test Name</label>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 px-4 text-sm text-slate-100 outline-none transition-colors focus:border-primary/50"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted">Website URL</label>
              <div className="relative">
                <Globe className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  value={targetUrl}
                  onChange={(event) => setTargetUrl(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-10 pr-4 text-sm text-slate-100 outline-none transition-colors focus:border-primary/50"
                />
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Load Profile</p>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted">Virtual Users</label>
                  <div className="relative">
                    <Users className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                    <input
                      type="number"
                      value={vus}
                      onChange={(event) => setVus(Math.max(1, Number(event.target.value) || 1))}
                      className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-10 pr-4 text-sm text-slate-100 outline-none focus:border-primary/50"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted">Duration</label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                    <input
                      type="text"
                      value={duration}
                      onChange={(event) => setDuration(event.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-10 pr-4 text-sm text-slate-100 outline-none focus:border-primary/50"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">Test Style</label>
                <div className="relative">
                  <select
                    value={type}
                    onChange={(event) => setType(event.target.value)}
                    className="w-full appearance-none rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 pr-10 text-sm text-slate-300 transition hover:bg-white/[0.04]"
                  >
                    <option className="bg-slate-900" value="Load">
                      Load
                    </option>
                    <option className="bg-slate-900" value="Stress">
                      Stress
                    </option>
                    <option className="bg-slate-900" value="Spike">
                      Spike
                    </option>
                    <option className="bg-slate-900" value="Smoke">
                      Smoke
                    </option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-slate-400" />
                </div>
              </div>
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={isRunning || !canRunCurrentProject}
            onClick={() => void handleRunTest()}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl border py-4 font-bold transition-all shadow-[0_0_32px_rgba(59,130,246,0.45)] ${
              isRunning || !canRunCurrentProject
                ? "cursor-not-allowed border-transparent bg-slate-700 text-slate-200"
                : "animate-pulse-glow border-primary/40 bg-primary text-white hover:bg-primary/90"
            }`}
          >
            {isRunning ? (
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Starting...
              </div>
            ) : !canRunCurrentProject ? (
              "Permission Required To Run"
            ) : (
              <>
                <Play className="h-5 w-5 fill-current" />
                Start Test
              </>
            )}
          </motion.button>
        </div>

        <div className="lg:col-span-2">
          <div className="glass-panel flex h-full min-h-[520px] flex-col overflow-hidden rounded-2xl">
            <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.04] px-6 py-4">
              <div className="flex items-center gap-2">
                <Code2 className="h-5 w-5 text-secondary-purple" />
                <h3 className="font-bold">Advanced k6 Script (Optional)</h3>
              </div>
              <div className="flex gap-2">
                <div className="h-3 w-3 rounded-full bg-rose-500/50" />
                <div className="h-3 w-3 rounded-full bg-amber-500/50" />
                <div className="h-3 w-3 rounded-full bg-emerald-500/50" />
              </div>
            </div>

            <div className="relative flex-1 bg-black/45">
              <textarea
                value={script}
                onChange={(event) => {
                  setScript(event.target.value);
                  setIsScriptDirty(true);
                }}
                className="absolute inset-0 h-full w-full resize-none border-none bg-transparent p-6 font-mono text-sm leading-6 text-slate-300 outline-none"
                spellCheck={false}
              />
              <div className="absolute left-1 top-6 h-[calc(100%-48px)] w-px bg-white/5" />
            </div>

            <div className="flex items-center justify-between border-t border-white/10 bg-white/[0.04] px-6 py-3 text-xs text-slate-500">
              <span>Template script auto-updates until you edit manually.</span>
              <div className="flex gap-4">
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Script Ready
                </span>
                <span>{selectedProject.name}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

