import { useEffect, useState } from "react";
import { Play, Code2, Settings2, Globe, Clock, Users, ChevronDown, FolderKanban, Trash2, Plus, Sliders } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { runTest } from "../lib/api";
import { useProjects } from "../context/useProjects";
import { EmptyState } from "../components/EmptyState";
import { HelperNote } from "../components/HelperNote";
import { useNotifications } from "../context/useNotifications";
import { ScriptEditor } from "../components/ScriptEditor";
import { buildProjectTestPath } from "../lib/project-routes";

const buildTemplateScript = (
  url: string,
  mode: "basic" | "stages",
  vus: number,
  duration: string,
  stages: Array<{ duration: string; target: number }>,
  insecureSkip: boolean,
  thresholds: Array<{ metric: string; condition: string }>
) => {
  let optionsStr = "";
  
  if (insecureSkip) {
    optionsStr += `  insecureSkipTLSVerify: true,\n`;
  }

  if (mode === "stages") {
    const stagesStr = stages.map((s) => `    { duration: '${s.duration}', target: ${s.target} }`).join(",\n");
    optionsStr += `  stages: [\n${stagesStr}\n  ],\n`;
  } else {
    optionsStr += `  vus: ${vus},\n  duration: '${duration}',\n`;
  }

  if (thresholds.length > 0) {
    const thresholdsStr = thresholds.map((t) => `    '${t.metric}': ['${t.condition}']`).join(",\n");
    optionsStr += `  thresholds: {\n${thresholdsStr}\n  },\n`;
  }

  return `import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
${optionsStr.trimEnd()}
};

export default function () {
  const res = http.get('${url}');
  check(res, {
    'status was 200': (r) => r.status === 200,
  });
  sleep(1);
}`;
};

export const NewTestPage = () => {
  const navigate = useNavigate();
  const { selectedProject } = useProjects();
  const { addNotification } = useNotifications();

  const [name, setName] = useState("Load Test (20 VUs for 30s)");
  const [isNameDirty, setIsNameDirty] = useState(false);
  const [targetUrl, setTargetUrl] = useState(selectedProject?.baseUrl ?? "https://");
  const [vus, setVus] = useState(20);
  const [duration, setDuration] = useState("30s");
  const [mode, setMode] = useState<"basic" | "stages">("basic");
  const [stages, setStages] = useState([
    { duration: "1m", target: 20 },
    { duration: "2m", target: 20 },
    { duration: "1m", target: 0 },
  ]);
  const [insecureSkipTLSVerify, setInsecureSkipTLSVerify] = useState(false);
  const [thresholds, setThresholds] = useState<Array<{ metric: string; condition: string }>>([]);
  const [type, setType] = useState("Load");
  const [region] = useState("us-east-1");
  const [script, setScript] = useState(
    buildTemplateScript(selectedProject?.baseUrl ?? "https://", "basic", 20, "30s", [], false, [])
  );
  const [isScriptDirty, setIsScriptDirty] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const canRunCurrentProject = Boolean(selectedProject?.access.canRun);

  useEffect(() => {
    if (!selectedProject) {
      return;
    }
    setTargetUrl(selectedProject.baseUrl);
    if (!isScriptDirty) {
      setScript(buildTemplateScript(selectedProject.baseUrl, mode, vus, duration, stages, insecureSkipTLSVerify, thresholds));
    }
  }, [selectedProject, isScriptDirty, mode, vus, duration, stages, insecureSkipTLSVerify, thresholds]);

  useEffect(() => {
    if (!isScriptDirty) {
      setScript(buildTemplateScript(targetUrl, mode, vus, duration, stages, insecureSkipTLSVerify, thresholds));
    }
  }, [targetUrl, mode, vus, duration, stages, insecureSkipTLSVerify, thresholds, isScriptDirty]);

  useEffect(() => {
    if (!isNameDirty) {
      if (mode === "stages") {
        setName(`${type} Test (Stages)`);
      } else {
        setName(`${type} Test (${vus} VUs for ${duration})`);
      }
    }
  }, [type, vus, duration, mode, isNameDirty]);

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
        vus: mode === "stages" ? Math.max(1, ...stages.map((s) => s.target)) : vus,
        duration: mode === "stages" ? "1m" : duration,
        script: isScriptDirty || mode === "stages" ? script : "",
        type,
        region,
      });
      addNotification({
        id: `run-queued:${run.id}`,
        type: "info",
        title: "Test queued",
        message: `${name} was queued for ${selectedProject.name}. We'll notify you when it starts and finishes.`,
        projectId: selectedProject.id,
        runId: run.id,
        link: buildProjectTestPath(selectedProject.id, run.id),
      });
      setSuccessMessage("Test started. Opening test details...");
      navigate(buildProjectTestPath(selectedProject.id, run.id));
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
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      )}
      {successMessage && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {successMessage}
        </div>
      )}

      <HelperNote title="Plain language guide">
        Virtual users are pretend visitors we send to your site at the same time. Duration is how long the test runs.
        Load checks normal traffic, Stress pushes harder, Spike sends a sudden burst, and Smoke is a quick health check.
      </HelperNote>

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
                onChange={(event) => {
                  setName(event.target.value);
                  setIsNameDirty(true);
                }}
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
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Visitor Simulation</p>
                <div className="flex space-x-1 rounded-lg bg-black/40 p-1">
                  <button
                    onClick={() => setMode("basic")}
                    className={`rounded-md px-3 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                      mode === "basic" ? "bg-primary text-white" : "text-muted hover:text-white"
                    }`}
                  >
                    Basic
                  </button>
                  <button
                    onClick={() => setMode("stages")}
                    className={`rounded-md px-3 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                      mode === "stages" ? "bg-primary text-white" : "text-muted hover:text-white"
                    }`}
                  >
                    Stages
                  </button>
                </div>
              </div>

              {mode === "basic" ? (
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
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    {stages.map((stage, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="flex-1 space-y-1">
                          <label className="block text-[9px] font-semibold uppercase tracking-wider text-muted">Target VUs</label>
                          <input
                            type="number"
                            value={stage.target}
                            onChange={(e) => {
                              const newStages = [...stages];
                              newStages[i].target = Math.max(0, Number(e.target.value) || 0);
                              setStages(newStages);
                            }}
                            className="w-full rounded-lg border border-white/10 bg-black/20 py-2 px-3 text-sm text-slate-100 outline-none focus:border-primary/50"
                          />
                        </div>
                        <div className="flex-1 space-y-1">
                          <label className="block text-[9px] font-semibold uppercase tracking-wider text-muted">Duration</label>
                          <input
                            type="text"
                            value={stage.duration}
                            onChange={(e) => {
                              const newStages = [...stages];
                              newStages[i].duration = e.target.value;
                              setStages(newStages);
                            }}
                            className="w-full rounded-lg border border-white/10 bg-black/20 py-2 px-3 text-sm text-slate-100 outline-none focus:border-primary/50"
                          />
                        </div>
                        <button
                          onClick={() => {
                            const newStages = [...stages];
                            newStages.splice(i, 1);
                            setStages(newStages);
                          }}
                          className="mt-4 rounded-lg p-2 text-rose-500 hover:bg-rose-500/10 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setStages([...stages, { duration: "1m", target: 20 }])}
                    className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                  >
                    <Plus className="h-3 w-3" /> Add Stage
                  </button>
                </div>
              )}

              <div className="space-y-2 pt-2 border-t border-white/10">
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

          <div className="glass-panel space-y-5 rounded-2xl p-6">
            <div className="mb-2 flex items-center gap-2 border-b border-white/10 pb-4">
              <Sliders className="h-5 w-5 text-primary" />
              <h3 className="font-bold">Advanced Settings</h3>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="space-y-1 pr-4">
                  <p className="text-sm font-medium text-slate-200">Bypass TLS Verification</p>
                  <p className="text-xs text-slate-500">Ignore SSL/TLS certificate errors (useful for dev/staging)</p>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input type="checkbox" checked={insecureSkipTLSVerify} onChange={(e) => setInsecureSkipTLSVerify(e.target.checked)} className="peer sr-only" />
                  <div className="peer h-6 w-11 rounded-full bg-white/10 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none"></div>
                </label>
              </div>

              <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-200">Pass/Fail Thresholds</p>
                  <p className="text-xs text-slate-500">Define criteria for test success (e.g., error rate &lt; 1%)</p>
                </div>
                
                <div className="space-y-2 mt-3">
                  {thresholds.map((threshold, i) => (
                    <div key={i} className="flex flex-col gap-2 rounded-lg bg-black/30 p-2 sm:flex-row sm:items-center">
                      <div className="flex-1">
                        <input
                          type="text"
                          placeholder="Metric (e.g. http_req_duration)"
                          value={threshold.metric}
                          onChange={(e) => {
                            const nt = [...thresholds];
                            nt[i].metric = e.target.value;
                            setThresholds(nt);
                          }}
                          className="w-full rounded-md border border-white/10 bg-transparent px-2 py-1 text-xs text-slate-100 outline-none focus:border-primary/50"
                        />
                      </div>
                      <div className="flex-1">
                        <input
                          type="text"
                          placeholder="Condition (e.g. p(95)<500)"
                          value={threshold.condition}
                          onChange={(e) => {
                            const nt = [...thresholds];
                            nt[i].condition = e.target.value;
                            setThresholds(nt);
                          }}
                          className="w-full rounded-md border border-white/10 bg-transparent px-2 py-1 text-xs text-slate-100 outline-none focus:border-primary/50"
                        />
                      </div>
                      <button
                        onClick={() => {
                          const nt = [...thresholds];
                          nt.splice(i, 1);
                          setThresholds(nt);
                        }}
                        className="rounded-md p-1.5 text-rose-500 hover:bg-rose-500/10 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setThresholds([...thresholds, { metric: "http_req_duration", condition: "p(95)<500" }])}
                    className="flex items-center gap-1 mt-2 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                  >
                    <Plus className="h-3 w-3" /> Add Threshold
                  </button>
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
                <h3 className="font-bold">Advanced Script (Optional)</h3>
              </div>
              <div className="flex gap-2">
                <div className="h-3 w-3 rounded-full bg-rose-500/50" />
                <div className="h-3 w-3 rounded-full bg-amber-500/50" />
                <div className="h-3 w-3 rounded-full bg-emerald-500/50" />
              </div>
            </div>

            <div className="relative flex-1 bg-[#050816]">
              <div className="absolute inset-x-0 top-0 h-10 bg-[linear-gradient(180deg,rgba(15,23,42,0.55),rgba(15,23,42,0))] pointer-events-none" />
              <ScriptEditor
                value={script}
                onChange={(nextValue) => {
                  setScript(nextValue);
                  setIsScriptDirty(true);
                }}
              />
            </div>

            <div className="flex items-center justify-between border-t border-white/10 bg-white/[0.04] px-6 py-3 text-xs text-slate-500">
              <span>You can ignore this unless you want a custom developer script.</span>
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
