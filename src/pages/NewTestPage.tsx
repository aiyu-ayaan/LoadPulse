import { useEffect, useState } from "react";
import { Play, Globe, Clock, Users, ChevronDown, FolderKanban, Trash2, Plus, Sliders, Rocket, Activity, CheckCircle, ShieldAlert, FileText, LockKeyholeOpen, Brain, RefreshCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { generateAiTestConfig, runTest } from "../lib/api";
import { useProjects } from "../context/useProjects";
import { EmptyState } from "../components/EmptyState";
import { useNotifications } from "../context/useNotifications";
import { ScriptEditor } from "../components/ScriptEditor";
import { buildProjectTestPath } from "../lib/project-routes";

const buildTemplateScript = (
  url: string,
  mode: "basic" | "stages",
  vus: number,
  duration: string,
  stages: Array<{ duration: string; target: number | "" }>,
  insecureSkip: boolean,
  thresholds: Array<{ metric: string; condition: string }>
) => {
  let optionsStr = "";
  
  if (insecureSkip) {
    optionsStr += `  insecureSkipTLSVerify: true,\n`;
  }

  if (mode === "stages") {
    const stagesStr = stages.map((s) => `    { duration: '${s.duration}', target: ${Number(s.target) || 0} }`).join(",\n");
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
  const [vus, setVus] = useState<number | "">(20);
  const [duration, setDuration] = useState("30s");
  const [mode, setMode] = useState<"basic" | "stages">("basic");
  const [stages, setStages] = useState<Array<{ duration: string; target: number | "" }>>([
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
  const [aiGoal, setAiGoal] = useState("Generate a safe baseline load test for homepage response time under moderate traffic.");
  const [aiNotes, setAiNotes] = useState("");
  const [isGeneratingWithAi, setIsGeneratingWithAi] = useState(false);
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
      setScript(buildTemplateScript(selectedProject.baseUrl, mode, Number(vus) || 1, duration, stages, insecureSkipTLSVerify, thresholds));
    }
  }, [selectedProject, isScriptDirty, mode, vus, duration, stages, insecureSkipTLSVerify, thresholds]);

  useEffect(() => {
    if (!isScriptDirty) {
      setScript(buildTemplateScript(targetUrl, mode, Number(vus) || 1, duration, stages, insecureSkipTLSVerify, thresholds));
    }
  }, [targetUrl, mode, vus, duration, stages, insecureSkipTLSVerify, thresholds, isScriptDirty]);

  useEffect(() => {
    if (!isNameDirty) {
      if (mode === "stages") {
        setName(`${type} Test (Stages)`);
      } else {
        setName(`${type} Test (${Number(vus) || 1} VUs for ${duration})`);
      }
    }
  }, [type, vus, duration, mode, isNameDirty]);

  const handleGenerateWithAi = async () => {
    if (!selectedProject) {
      setError("Please select a project first.");
      return;
    }
    if (!canRunCurrentProject) {
      setError("Your account can view this project but cannot run tests for it.");
      return;
    }
    if (!aiGoal.trim() || aiGoal.trim().length < 6) {
      setError("Describe your test goal in at least 6 characters.");
      return;
    }

    setIsGeneratingWithAi(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await generateAiTestConfig(selectedProject.id, {
        goal: aiGoal,
        targetUrl,
        type,
      });

      const generated = response.data;
      setName(generated.name);
      setIsNameDirty(true);
      setTargetUrl(generated.targetUrl || targetUrl);
      setType(generated.type || type);
      setMode("basic");
      setVus(generated.vus || 20);
      setDuration(generated.duration || "30s");
      setScript(generated.script || script);
      setIsScriptDirty(true);
      setAiNotes(generated.notes || "");
      setSuccessMessage(`AI generated test config using ${generated.ai.modelName}. Review and launch when ready.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to generate test config with AI.");
    } finally {
      setIsGeneratingWithAi(false);
    }
  };

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
        vus: mode === "stages" ? Math.max(1, ...stages.map((s) => Number(s.target) || 0)) : Number(vus) || 1,
        duration: mode === "stages" ? "1m" : duration,
        script: script,
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
    <div className="mx-auto max-w-6xl space-y-8 pb-32">
      <div className="flex flex-col gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary border border-primary/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
               <Rocket className="h-5 w-5" />
            </span>
            Run New Test
          </h1>
          <p className="text-sm text-slate-400 pl-[52px]">
            Configure and launch high-performance load tests for <span className="font-semibold text-slate-200">{selectedProject.name}</span>
          </p>
        </div>
      </div>

      {error && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</motion.div>
      )}
      {successMessage && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {successMessage}
        </motion.div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Form Configuration */}
        <div className="space-y-6 lg:col-span-12 xl:col-span-5">
          
          {/* Card 1: Identity & Target */}
          <div className="premium-card p-6 space-y-5 relative overflow-hidden">
             <div className="absolute top-0 right-0 p-32 bg-primary/5 blur-[100px] pointer-events-none rounded-full" />
             <div className="mb-2 flex items-center gap-2 border-b border-white/10 pb-4">
               <Globe className="h-5 w-5 text-primary" />
               <h3 className="font-bold text-slate-100">Target Identity</h3>
             </div>

             <div className="space-y-4">
               <div className="space-y-2">
                 <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Website URL</label>
                 <div className="relative">
                   <Globe className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                   <input
                     type="text"
                     value={targetUrl}
                     onChange={(event) => setTargetUrl(event.target.value)}
                     className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-10 pr-4 text-sm text-slate-100 outline-none transition-all placeholder:text-slate-600 focus:bg-black/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
                   />
                 </div>
               </div>
               
               <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2">
                   <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Test Name</label>
                   <input
                     type="text"
                     value={name}
                     onChange={(event) => {
                       setName(event.target.value);
                       setIsNameDirty(true);
                     }}
                     className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 px-4 text-sm text-slate-100 outline-none transition-all placeholder:text-slate-600 focus:bg-black/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
                   />
                 </div>
                 
                 <div className="space-y-2">
                   <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Test Style</label>
                   <div className="relative">
                     <select
                       value={type}
                       onChange={(event) => setType(event.target.value)}
                       className="w-full appearance-none rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 pr-10 text-sm text-slate-300 transition hover:bg-white/[0.04] focus:bg-black/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
                     >
                       <option className="bg-slate-900" value="Load">Load Check</option>
                       <option className="bg-slate-900" value="Stress">Stress Test</option>
                       <option className="bg-slate-900" value="Spike">Spike Test</option>
                       <option className="bg-slate-900" value="Smoke">Smoke Test</option>
                     </select>
                     <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-500" />
                   </div>
                 </div>
               </div>
             </div>
          </div>

          <div className="premium-card p-6 space-y-4">
            <div className="mb-2 flex items-center gap-2 border-b border-white/10 pb-4">
              <Brain className="h-5 w-5 text-primary" />
              <h3 className="font-bold text-slate-100">AI Test Planner</h3>
            </div>

            <label className="space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Goal</span>
              <textarea
                value={aiGoal}
                onChange={(event) => setAiGoal(event.target.value)}
                placeholder="Example: simulate checkout load with moderate traffic and strict latency"
                className="h-24 w-full resize-none rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-slate-100 outline-none transition-all placeholder:text-slate-600 focus:bg-black/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
              />
            </label>

            <button
              type="button"
              disabled={isGeneratingWithAi || !canRunCurrentProject}
              onClick={() => void handleGenerateWithAi()}
              className="inline-flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/15 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCcw className={`h-4 w-4 ${isGeneratingWithAi ? "animate-spin" : ""}`} />
              {isGeneratingWithAi ? "Generating with AI..." : "Generate Config With AI"}
            </button>

            {aiNotes && <p className="text-xs text-slate-400">AI notes: {aiNotes}</p>}
          </div>

          {/* Card 2: Load Profile Builder */}
          <div className="premium-card p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
               <div className="flex items-center gap-2">
                 <Activity className="h-5 w-5 text-secondary-teal" />
                 <h3 className="font-bold text-slate-100">Load Profile</h3>
               </div>
               <div className="relative flex rounded-lg bg-black/40 p-1">
                 <button
                   onClick={() => setMode("basic")}
                   className={`relative rounded-md px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider z-10 transition-colors ${
                     mode === "basic" ? "text-white" : "text-slate-400 hover:text-slate-200"
                   }`}
                 >
                   Basic
                   {mode === "basic" && (
                     <motion.div layoutId="mode-pill" className="absolute inset-0 -z-10 rounded-md bg-white/10 shadow-sm border border-white/5" />
                   )}
                 </button>
                 <button
                   onClick={() => setMode("stages")}
                   className={`relative rounded-md px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider z-10 transition-colors ${
                     mode === "stages" ? "text-white" : "text-slate-400 hover:text-slate-200"
                   }`}
                 >
                   Stages
                   {mode === "stages" && (
                     <motion.div layoutId="mode-pill" className="absolute inset-0 -z-10 rounded-md bg-white/10 shadow-sm border border-white/5" />
                   )}
                 </button>
               </div>
            </div>

            <AnimatePresence mode="popLayout" initial={false}>
              {mode === "basic" ? (
                <motion.div 
                  key="basic"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="grid grid-cols-2 gap-4"
                >
                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Virtual Users</label>
                    <div className="relative">
                      <Users className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                      <input
                        type="number"
                        value={vus}
                        onChange={(event) => {
                          const val = event.target.value;
                          setVus(val === "" ? "" : Math.max(1, parseInt(val, 10) || 1));
                        }}
                        className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-10 pr-4 text-sm text-slate-100 outline-none transition-all focus:bg-black/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Duration</label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                      <input
                        type="text"
                        value={duration}
                        onChange={(event) => setDuration(event.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-10 pr-4 text-sm text-slate-100 outline-none transition-all xl focus:bg-black/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
                      />
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  key="stages"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-3"
                >
                  <div className="space-y-3">
                    <AnimatePresence>
                      {stages.map((stage, i) => (
                        <motion.div 
                          key={`stage-${i}`}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-white/[0.02]"
                        >
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/40 text-[10px] font-bold text-slate-500">
                            {i + 1}
                          </div>
                          <div className="flex-1 space-y-1">
                            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Target VUs</label>
                            <input
                              type="number"
                              value={stage.target}
                              placeholder="0"
                              onChange={(e) => {
                                const newStages = [...stages];
                                const val = e.target.value;
                                newStages[i].target = val === "" ? "" : Math.max(0, parseInt(val, 10));
                                setStages(newStages);
                              }}
                              className="w-full rounded-lg border border-white/10 bg-black/40 py-1.5 px-3 text-sm text-slate-200 outline-none transition-colors focus:border-secondary-teal/50"
                            />
                          </div>
                          <div className="flex-1 space-y-1">
                            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Duration</label>
                            <input
                              type="text"
                              value={stage.duration}
                              placeholder="1m"
                              onChange={(e) => {
                                const newStages = [...stages];
                                newStages[i].duration = e.target.value;
                                setStages(newStages);
                              }}
                              className="w-full rounded-lg border border-white/10 bg-black/40 py-1.5 px-3 text-sm text-slate-200 outline-none transition-colors focus:border-secondary-teal/50"
                            />
                          </div>
                          <div className="flex flex-col items-center justify-center pt-5 pl-1">
                            <button
                              onClick={() => {
                                const newStages = [...stages];
                                newStages.splice(i, 1);
                                setStages(newStages);
                              }}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                  <button
                    onClick={() => setStages([...stages, { duration: "1m", target: 20 }])}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/[0.01] py-3 text-xs font-semibold text-slate-400 hover:border-secondary-teal/40 hover:text-secondary-teal transition-colors"
                  >
                    <Plus className="h-4 w-4" /> Add Stage
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Card 3: Advanced Options */}
          <div className="premium-card p-6 space-y-5">
             <div className="mb-2 flex items-center gap-2 border-b border-white/10 pb-4">
               <Sliders className="h-5 w-5 text-secondary-purple" />
               <h3 className="font-bold text-slate-100">Execution Policies</h3>
             </div>

             <div className="space-y-4">
               {/* Custom iOS Toggle */}
               <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-4 group hover:bg-white/[0.04] transition-colors">
                 <div className="space-y-1 pr-4">
                   <p className="flex items-center gap-1.5 text-sm font-medium text-slate-200">
                     <LockKeyholeOpen className="h-4 w-4 text-slate-400" /> Bypass TLS Verification
                   </p>
                   <p className="text-xs text-slate-500">Ignore SSL/TLS certificate errors (useful for dev/staging)</p>
                 </div>
                 <label className="relative inline-flex cursor-pointer items-center">
                   <input type="checkbox" checked={insecureSkipTLSVerify} onChange={(e) => setInsecureSkipTLSVerify(e.target.checked)} className="peer sr-only" />
                   <div className="peer h-6 w-11 rounded-full bg-slate-800 border border-white/10 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-all after:content-[''] peer-checked:bg-secondary-purple peer-checked:border-secondary-purple peer-checked:after:translate-x-full peer-focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary-purple"></div>
                 </label>
               </div>

               {/* Thresholds Builder */}
               <div className="space-y-3 rounded-xl border border-white/5 bg-white/[0.02] p-4">
                 <div className="space-y-1">
                   <p className="flex items-center gap-1.5 text-sm font-medium text-slate-200">
                     <ShieldAlert className="h-4 w-4 text-slate-400" /> Pass/Fail Thresholds
                   </p>
                   <p className="text-xs text-slate-500">Define criteria for test success automatically</p>
                 </div>
                 
                 <div className="space-y-2 mt-3">
                   <AnimatePresence>
                     {thresholds.map((threshold, i) => (
                       <motion.div 
                          key={`thresh-${i}`}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="flex flex-col gap-2 relative z-0 overflow-hidden sm:flex-row sm:items-center"
                       >
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
                             className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-xs text-slate-200 outline-none focus:border-secondary-purple/50"
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
                             className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-xs text-slate-200 outline-none focus:border-secondary-purple/50"
                           />
                         </div>
                         <button
                           onClick={() => {
                             const nt = [...thresholds];
                             nt.splice(i, 1);
                             setThresholds(nt);
                           }}
                           className="rounded-md p-2 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 transition-colors"
                         >
                           <Trash2 className="h-4 w-4" />
                         </button>
                       </motion.div>
                     ))}
                   </AnimatePresence>
                   <button
                     onClick={() => setThresholds([...thresholds, { metric: "http_req_duration", condition: "p(95)<500" }])}
                     className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 bg-white/[0.01] py-2 mt-2 text-xs font-semibold text-slate-400 hover:border-secondary-purple/40 hover:text-secondary-purple transition-colors"
                   >
                     <Plus className="h-3 w-3" /> Add Tolerance Rule
                   </button>
                 </div>
               </div>
             </div>
          </div>
        </div>

        {/* Right Column: Code viewer */}
        <div className="lg:col-span-12 xl:col-span-7">
          <div className="premium-card flex flex-col h-[600px] xl:h-full min-h-[600px] overflow-hidden sticky top-6 shadow-[0_10px_40px_rgba(0,0,0,0.5)] border-white/15">
            {/* Fake Mac Header */}
            <div className="flex items-center justify-between border-b border-black/50 bg-[#0d1117] px-4 py-3 relative">
              <div className="flex gap-2 relative z-10">
                <div className="h-3 w-3 rounded-full bg-[#ff5f56]" />
                <div className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
                <div className="h-3 w-3 rounded-full bg-[#27c93f]" />
              </div>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                 <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
                    <FileText className="h-3.5 w-3.5" />
                    <span>test-script.js</span>
                 </div>
              </div>
              <div className="flex gap-2 relative z-10">
                 <span className="text-[10px] uppercase font-bold tracking-widest text-[#a8b1c2] bg-white/5 py-1 px-2 rounded-md">Generated</span>
              </div>
            </div>

            <div className="relative flex-1 bg-[#0b0f14]">
              {/* Subtle ambient interior glow */}
              <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_80px_rgba(0,0,0,0.8)] z-10" />
              <ScriptEditor
                value={script}
                onChange={(nextValue) => {
                  setScript(nextValue);
                  setIsScriptDirty(true);
                }}
              />
            </div>

            {/* Code State Footer */}
            <AnimatePresence mode="popLayout" initial={false}>
              {isScriptDirty ? (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center justify-between border-t border-amber-500/20 bg-amber-500/10 px-6 py-3.5 text-xs z-20"
                >
                  <div className="flex items-center gap-3 w-full">
                    <div className="relative flex h-2 w-2">
                       <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
                       <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500"></span>
                    </div>
                    <span className="text-amber-200/90 font-medium tracking-wide">
                      Manual overrides active. GUI changes will no longer auto-sync to code.
                    </span>
                    <button 
                      onClick={() => {
                        setIsScriptDirty(false);
                        const parsedStages = stages.map(s => ({ ...s, target: Number(s.target) || 0 }));
                        setScript(buildTemplateScript(targetUrl, mode, Number(vus) || 1, duration, parsedStages, insecureSkipTLSVerify, thresholds));
                      }} 
                      className="ml-auto rounded-md bg-amber-500/20 px-3 py-1.5 font-bold text-amber-200 hover:bg-amber-500/30 transition-colors"
                    >
                      Reset to Form
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center justify-between border-t border-white/5 bg-[#0d1117] px-6 py-3.5 text-xs text-slate-500 z-20"
                >
                  <span className="tracking-wide">Code automatically mirrors the graphical UI. Edit to detach.</span>
                  <div className="flex gap-4 font-medium">
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <CheckCircle className="h-3.5 w-3.5" /> Synchronized
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Sticky Action Footer */}
      <div className="fixed bottom-6 left-6 right-6 z-40 mx-auto max-w-5xl rounded-2xl border border-white/10 bg-[#0f1011]/90 shadow-[0_30px_60px_rgba(0,0,0,0.5),0_0_40px_rgba(59,130,246,0.15)] backdrop-blur-xl backdrop-saturate-150 md:left-[calc(86px+1.5rem)] lg:left-[calc(250px+1.5rem)] transition-[inset] duration-200">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-6 py-4">
           {/* Brief Summary */}
           <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20">
                 <Rocket className="h-6 w-6" />
              </div>
              <div>
                 <h4 className="text-sm font-bold text-white tracking-wide">{name}</h4>
                 <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xs md:max-w-md">Target: <span className="text-slate-300">{targetUrl}</span></p>
              </div>
           </div>

           {/* Call to Action */}
           <motion.button
             whileHover={{ scale: 1.02 }}
             whileTap={{ scale: 0.98 }}
             disabled={isRunning || !canRunCurrentProject}
             onClick={() => void handleRunTest()}
             className={`flex min-w-[200px] items-center justify-center gap-2 rounded-xl py-3.5 px-6 font-bold shadow-lg transition-all ${
               isRunning || !canRunCurrentProject
                 ? "cursor-not-allowed border border-white/5 bg-slate-800/50 text-slate-400"
                 : "animate-pulse-glow border border-primary/50 bg-gradient-to-b from-primary to-primary/80 text-white hover:from-primary/90 hover:to-primary/70"
             }`}
           >
             {isRunning ? (
               <div className="flex items-center gap-3">
                 <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                 Starting...
               </div>
             ) : !canRunCurrentProject ? (
               "Missing Permissions"
             ) : (
               <>
                 <Play className="h-5 w-5 fill-current" />
                 Launch Test
               </>
             )}
           </motion.button>
        </div>
      </div>

    </div>
  );
};
