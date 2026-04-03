import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlarmClock,
  Copy,
  FolderKanban,
  Globe,
  KeyRound,
  Link2,
  Play,
  RefreshCcw,
  Save,
  SquarePen,
  Trash2,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { ScriptEditor } from "../components/ScriptEditor";
import { useProjects } from "../context/useProjects";
import {
  createProjectIntegration,
  deleteProjectIntegration,
  fetchProjectIntegrationToken,
  fetchProjectIntegrations,
  regenerateProjectIntegrationToken,
  revokeProjectIntegrationToken,
  triggerProjectIntegration,
  updateProjectIntegration,
  type ProjectIntegration,
  type ProjectIntegrationTokenMeta,
} from "../lib/api";
import { useNotifications } from "../context/useNotifications";
import { buildProjectTestPath } from "../lib/project-routes";

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

const toDateLabel = (value: string | null) => {
  if (!value) {
    return "Never";
  }
  return new Date(value).toLocaleString();
};

const toStatusBadge = (status: string) => {
  if (status === "success") {
    return "bg-emerald-500/15 text-emerald-300";
  }
  if (status === "failed") {
    return "bg-rose-500/15 text-rose-300";
  }
  if (status === "stopped") {
    return "bg-amber-500/15 text-amber-300";
  }
  if (status === "queued" || status === "running") {
    return "bg-primary/15 text-primary";
  }
  return "bg-white/10 text-slate-300";
};

export const IntegrationsPage = () => {
  const navigate = useNavigate();
  const { selectedProject } = useProjects();
  const { addNotification } = useNotifications();

  const [items, setItems] = useState<ProjectIntegration[]>([]);
  const [tokenMeta, setTokenMeta] = useState<ProjectIntegrationTokenMeta>({
    hasToken: false,
    preview: "",
    updatedAt: null,
    lastUsedAt: null,
  });
  const [plainToken, setPlainToken] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTokenLoading, setIsTokenLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingIntegrationId, setEditingIntegrationId] = useState<string | null>(null);

  const [name, setName] = useState("Nightly Homepage Check");
  const [targetUrl, setTargetUrl] = useState(selectedProject?.baseUrl ?? "https://");
  const [type, setType] = useState("Load");
  const [region, setRegion] = useState("us-east-1");
  const [vus, setVus] = useState(20);
  const [duration, setDuration] = useState("30s");
  const [cronExpression, setCronExpression] = useState("*/15 * * * *");
  const [timezone, setTimezone] = useState("UTC");
  const [isEnabled, setIsEnabled] = useState(true);
  const [allowApiTrigger, setAllowApiTrigger] = useState(true);
  const [script, setScript] = useState(buildTemplateScript(selectedProject?.baseUrl ?? "https://", 20, "30s"));
  const [isScriptDirty, setIsScriptDirty] = useState(false);

  const canRunCurrentProject = Boolean(selectedProject?.access.canRun);
  const canManageCurrentProject = Boolean(selectedProject?.access.canManage);

  const resetForm = useCallback(
    (projectBaseUrl: string) => {
      setEditingIntegrationId(null);
      setName("Nightly Homepage Check");
      setTargetUrl(projectBaseUrl);
      setType("Load");
      setRegion("us-east-1");
      setVus(20);
      setDuration("30s");
      setCronExpression("*/15 * * * *");
      setTimezone("UTC");
      setIsEnabled(true);
      setAllowApiTrigger(true);
      setScript(buildTemplateScript(projectBaseUrl, 20, "30s"));
      setIsScriptDirty(false);
    },
    [],
  );

  const loadIntegrations = useCallback(async () => {
    if (!selectedProject) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const [integrationsResponse, tokenResponse] = await Promise.all([
        fetchProjectIntegrations(selectedProject.id),
        fetchProjectIntegrationToken(selectedProject.id),
      ]);
      setItems(integrationsResponse.data);
      setTokenMeta(tokenResponse.data);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load integrations.");
    } finally {
      setIsLoading(false);
    }
  }, [selectedProject]);

  useEffect(() => {
    if (!selectedProject) {
      setIsLoading(false);
      return;
    }
    resetForm(selectedProject.baseUrl);
    void loadIntegrations();
  }, [selectedProject, resetForm, loadIntegrations]);

  useEffect(() => {
    if (!selectedProject || isScriptDirty) {
      return;
    }
    setScript(buildTemplateScript(targetUrl || selectedProject.baseUrl, vus, duration));
  }, [duration, isScriptDirty, selectedProject, targetUrl, vus]);

  const tokenHookBaseUrl = useMemo(() => window.location.origin, []);

  const handleSaveIntegration = async () => {
    if (!selectedProject) {
      return;
    }
    if (!canRunCurrentProject) {
      setError("You do not have permission to create project integrations.");
      return;
    }

    setIsSaving(true);
    setError(null);
    const payload = {
      name,
      targetUrl,
      type,
      region,
      vus,
      duration,
      script: isScriptDirty ? script : "",
      cronExpression,
      timezone,
      isEnabled,
      allowApiTrigger,
    };

    try {
      if (editingIntegrationId) {
        await updateProjectIntegration(selectedProject.id, editingIntegrationId, payload);
      } else {
        await createProjectIntegration(selectedProject.id, payload);
      }

      await loadIntegrations();
      resetForm(selectedProject.baseUrl);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to save integration.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (item: ProjectIntegration) => {
    setEditingIntegrationId(item.id);
    setName(item.name);
    setTargetUrl(item.targetUrl);
    setType(item.type);
    setRegion(item.region);
    setVus(item.vus);
    setDuration(item.duration);
    setCronExpression(item.cronExpression);
    setTimezone(item.timezone);
    setIsEnabled(item.isEnabled);
    setAllowApiTrigger(item.allowApiTrigger);
    setScript(item.script);
    setIsScriptDirty(true);
    setPlainToken("");
  };

  const handleDelete = async (integrationId: string) => {
    if (!selectedProject) {
      return;
    }
    try {
      await deleteProjectIntegration(selectedProject.id, integrationId);
      await loadIntegrations();
      if (editingIntegrationId === integrationId) {
        resetForm(selectedProject.baseUrl);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to delete integration.");
    }
  };

  const handleTriggerNow = async (item: ProjectIntegration) => {
    if (!selectedProject) {
      return;
    }
    try {
      const response = await triggerProjectIntegration(selectedProject.id, item.id);
      addNotification({
        id: `integration-run-queued:${response.runId}`,
        type: "info",
        title: "Integration trigger queued",
        message: `${item.name} queued a test run for ${selectedProject.name}.`,
        projectId: selectedProject.id,
        runId: response.runId,
        link: buildProjectTestPath(selectedProject.id, response.runId),
      });
      await loadIntegrations();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to trigger integration.");
    }
  };

  const handleToggleEnabled = async (item: ProjectIntegration) => {
    if (!selectedProject) {
      return;
    }
    try {
      await updateProjectIntegration(selectedProject.id, item.id, {
        name: item.name,
        targetUrl: item.targetUrl,
        type: item.type,
        region: item.region,
        vus: item.vus,
        duration: item.duration,
        script: item.script,
        cronExpression: item.cronExpression,
        timezone: item.timezone,
        isEnabled: !item.isEnabled,
        allowApiTrigger: item.allowApiTrigger,
      });
      await loadIntegrations();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update integration status.");
    }
  };

  const handleGenerateToken = async () => {
    if (!selectedProject || !canManageCurrentProject) {
      setError("Only project owners can generate project integration tokens.");
      return;
    }

    try {
      setIsTokenLoading(true);
      const response = await regenerateProjectIntegrationToken(selectedProject.id);
      setTokenMeta(response.data);
      setPlainToken(response.data.token);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to generate project token.");
    } finally {
      setIsTokenLoading(false);
    }
  };

  const handleRevokeToken = async () => {
    if (!selectedProject || !canManageCurrentProject) {
      setError("Only project owners can revoke project integration tokens.");
      return;
    }

    try {
      setIsTokenLoading(true);
      await revokeProjectIntegrationToken(selectedProject.id);
      setTokenMeta({
        hasToken: false,
        preview: "",
        updatedAt: null,
        lastUsedAt: null,
      });
      setPlainToken("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to revoke token.");
    } finally {
      setIsTokenLoading(false);
    }
  };

  if (!selectedProject) {
    return (
      <EmptyState
        icon={FolderKanban}
        title="No Project Selected"
        description="Pick a project first. Integrations are configured per project."
        actionText="Go To Projects"
        onAction={() => navigate("/projects")}
      />
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold text-white">Project Integrations</h1>
        <p className="text-sm text-slate-400">
          Project: <span className="font-semibold text-white">{selectedProject.name}</span> • Build scheduled triggers and API-triggered runs.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      )}

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Project Trigger Token</h2>
            <p className="text-xs text-slate-400">Use this token to trigger integrations via external API.</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!canManageCurrentProject || isTokenLoading}
              onClick={() => void handleGenerateToken()}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              {tokenMeta.hasToken ? "Regenerate Token" : "Generate Token"}
            </button>
            <button
              type="button"
              disabled={!tokenMeta.hasToken || !canManageCurrentProject || isTokenLoading}
              onClick={() => void handleRevokeToken()}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Revoke
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Token</p>
            <p className="mt-2 text-sm font-semibold text-white">{tokenMeta.hasToken ? tokenMeta.preview : "Not generated"}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Updated</p>
            <p className="mt-2 text-sm font-semibold text-white">{toDateLabel(tokenMeta.updatedAt)}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Last Used</p>
            <p className="mt-2 text-sm font-semibold text-white">{toDateLabel(tokenMeta.lastUsedAt)}</p>
          </div>
        </div>

        {plainToken && (
          <div className="mt-4 space-y-2 rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-3">
            <p className="text-xs font-semibold text-emerald-200">Copy this token now. It is shown only once.</p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 overflow-auto rounded-md border border-emerald-500/25 bg-black/30 px-3 py-2 text-xs text-emerald-100">
                {plainToken}
              </code>
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(plainToken)}
                className="inline-flex items-center gap-1 rounded-md border border-emerald-500/35 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20"
              >
                <Copy className="h-3.5 w-3.5" /> Copy
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1.15fr]">
        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div>
            <h2 className="text-lg font-semibold text-white">{editingIntegrationId ? "Edit Trigger" : "Create Trigger"}</h2>
            <p className="text-xs text-slate-400">Use test-style configuration + cron schedule.</p>
          </div>

          <div className="grid gap-3">
            <label className="space-y-1">
              <span className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Trigger Name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary/60"
              />
            </label>

            <label className="space-y-1">
              <span className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Website URL</span>
              <div className="relative">
                <Globe className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  value={targetUrl}
                  onChange={(event) => setTargetUrl(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/20 py-2 pl-9 pr-3 text-sm text-slate-100 outline-none focus:border-primary/60"
                />
              </div>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Virtual Users</span>
                <div className="relative">
                  <Users className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <input
                    type="number"
                    min={1}
                    value={vus}
                    onChange={(event) => setVus(Math.max(1, Number(event.target.value) || 1))}
                    className="w-full rounded-xl border border-white/10 bg-black/20 py-2 pl-9 pr-3 text-sm text-slate-100 outline-none focus:border-primary/60"
                  />
                </div>
              </label>

              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Duration</span>
                <input
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary/60"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Test Type</span>
                <select
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary/60"
                >
                  <option value="Load">Load</option>
                  <option value="Stress">Stress</option>
                  <option value="Spike">Spike</option>
                  <option value="Smoke">Smoke</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Region</span>
                <input
                  value={region}
                  onChange={(event) => setRegion(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary/60"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Cron Expression</span>
                <div className="relative">
                  <AlarmClock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <input
                    value={cronExpression}
                    onChange={(event) => setCronExpression(event.target.value)}
                    placeholder="*/15 * * * *"
                    className="w-full rounded-xl border border-white/10 bg-black/20 py-2 pl-9 pr-3 text-sm text-slate-100 outline-none focus:border-primary/60"
                  />
                </div>
              </label>

              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Timezone</span>
                <input
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary/60"
                />
              </label>
            </div>

            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-200">
              <input type="checkbox" checked={isEnabled} onChange={(event) => setIsEnabled(event.target.checked)} />
              Enable cron schedule
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-200">
              <input type="checkbox" checked={allowApiTrigger} onChange={(event) => setAllowApiTrigger(event.target.checked)} />
              Allow API trigger endpoint
            </label>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#050816]">
            <div className="border-b border-white/10 px-4 py-2 text-sm font-semibold text-slate-200">k6 Script</div>
            <ScriptEditor
              value={script}
              onChange={(nextValue) => {
                setScript(nextValue);
                setIsScriptDirty(true);
              }}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleSaveIntegration()}
              disabled={!canRunCurrentProject || isSaving}
              className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {editingIntegrationId ? <Save className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
              {isSaving ? "Saving..." : editingIntegrationId ? "Save Changes" : "Create Trigger"}
            </button>
            {editingIntegrationId && (
              <button
                type="button"
                onClick={() => resetForm(selectedProject.baseUrl)}
                className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-200 hover:bg-white/[0.08]"
              >
                Cancel Edit
              </button>
            )}
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Configured Triggers</h2>
              <p className="text-xs text-slate-400">Cron and API-triggered project test automation.</p>
            </div>
            <button
              type="button"
              onClick={() => void loadIntegrations()}
              className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/[0.08]"
            >
              Refresh
            </button>
          </div>

          {isLoading ? (
            <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-slate-300">Loading integrations...</div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-slate-300">
              No integrations yet. Create your first scheduled trigger.
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-white">{item.name}</p>
                      <p className="text-xs text-slate-400">{item.targetUrl}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${toStatusBadge(item.lastRunStatus)}`}>
                      {item.lastRunStatus || "idle"}
                    </span>
                  </div>

                  <div className="grid gap-2 text-xs text-slate-300 md:grid-cols-2">
                    <p>
                      <span className="text-slate-500">Cron:</span> <code>{item.cronExpression}</code>
                    </p>
                    <p>
                      <span className="text-slate-500">Timezone:</span> {item.timezone}
                    </p>
                    <p>
                      <span className="text-slate-500">Load:</span> {item.vus} VUs • {item.duration}
                    </p>
                    <p>
                      <span className="text-slate-500">Last Trigger:</span> {toDateLabel(item.lastTriggeredAt)}
                    </p>
                    <p className="md:col-span-2">
                      <span className="text-slate-500">Hook:</span> {tokenHookBaseUrl}
                      <code>{item.hookPath}</code>
                    </p>
                  </div>

                  {item.lastError && <p className="text-xs text-rose-300">{item.lastError}</p>}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!canRunCurrentProject}
                      onClick={() => void handleTriggerNow(item)}
                      className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/20 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/30 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Play className="h-3.5 w-3.5" /> Trigger Now
                    </button>
                    <button
                      type="button"
                      disabled={!canRunCurrentProject}
                      onClick={() => void handleToggleEnabled(item)}
                      className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {item.isEnabled ? "Disable Schedule" : "Enable Schedule"}
                    </button>
                    <button
                      type="button"
                      disabled={!canRunCurrentProject}
                      onClick={() => handleEdit(item)}
                      className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <SquarePen className="h-3.5 w-3.5" /> Edit
                    </button>
                    <button
                      type="button"
                      disabled={!canRunCurrentProject}
                      onClick={() => void handleDelete(item.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-rose-500/35 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                    {item.lastRunId && (
                      <button
                        type="button"
                        onClick={() => navigate(buildProjectTestPath(selectedProject.id, item.lastRunId!))}
                        className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/[0.08]"
                      >
                        <KeyRound className="h-3.5 w-3.5" /> Open Last Run
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
