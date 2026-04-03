import { useEffect, useMemo, useState } from "react";
import {
  AlarmClock,
  Copy,
  FolderKanban,
  Globe,
  Link2,
  Play,
  PlusCircle,
  RefreshCcw,
  Save,
  SquarePen,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { ScriptEditor } from "../components/ScriptEditor";
import { useNotifications } from "../context/useNotifications";
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
import { buildProjectTestPath } from "../lib/project-routes";

type TriggerType = "cron" | "api";
type SchedulePreset = "5m" | "15m" | "30m" | "hourly" | "daily" | "weekly" | "custom";

const WEEK_DAYS = [
  { label: "Sunday", value: "SUN" },
  { label: "Monday", value: "MON" },
  { label: "Tuesday", value: "TUE" },
  { label: "Wednesday", value: "WED" },
  { label: "Thursday", value: "THU" },
  { label: "Friday", value: "FRI" },
  { label: "Saturday", value: "SAT" },
] as const;

const DAY_NUMBER_TO_NAME: Record<string, string> = {
  "0": "SUN",
  "1": "MON",
  "2": "TUE",
  "3": "WED",
  "4": "THU",
  "5": "FRI",
  "6": "SAT",
};

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

const formatDateTime = (value: string | null) => (value ? new Date(value).toLocaleString() : "Never");

const parseTime = (value: string) => {
  const [rawHour = "9", rawMinute = "0"] = value.split(":");
  const hour = Math.min(23, Math.max(0, Number(rawHour) || 0));
  const minute = Math.min(59, Math.max(0, Number(rawMinute) || 0));

  return {
    hour,
    minute,
    normalized: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
};

const buildCronExpression = (preset: SchedulePreset, time: string, weekDay: string, customCron: string) => {
  if (preset === "5m") return "*/5 * * * *";
  if (preset === "15m") return "*/15 * * * *";
  if (preset === "30m") return "*/30 * * * *";
  if (preset === "hourly") return "0 * * * *";

  const parsed = parseTime(time);

  if (preset === "daily") {
    return `${parsed.minute} ${parsed.hour} * * *`;
  }

  if (preset === "weekly") {
    return `${parsed.minute} ${parsed.hour} * * ${weekDay}`;
  }

  return customCron.trim();
};

const getPresetFromCron = (expression: string) => {
  const cron = expression.trim();

  if (cron === "*/5 * * * *") return { preset: "5m" as SchedulePreset, time: "09:00", weekDay: "MON" };
  if (cron === "*/15 * * * *") return { preset: "15m" as SchedulePreset, time: "09:00", weekDay: "MON" };
  if (cron === "*/30 * * * *") return { preset: "30m" as SchedulePreset, time: "09:00", weekDay: "MON" };
  if (cron === "0 * * * *") return { preset: "hourly" as SchedulePreset, time: "09:00", weekDay: "MON" };

  const dailyMatch = cron.match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/);
  if (dailyMatch) {
    return {
      preset: "daily" as SchedulePreset,
      time: `${String(Number(dailyMatch[2])).padStart(2, "0")}:${String(Number(dailyMatch[1])).padStart(2, "0")}`,
      weekDay: "MON",
    };
  }

  const weeklyMatch = cron.match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+([A-Za-z]{3}|[0-6])$/);
  if (weeklyMatch) {
    const rawDay = weeklyMatch[3].toUpperCase();
    return {
      preset: "weekly" as SchedulePreset,
      time: `${String(Number(weeklyMatch[2])).padStart(2, "0")}:${String(Number(weeklyMatch[1])).padStart(2, "0")}`,
      weekDay: DAY_NUMBER_TO_NAME[rawDay] ?? rawDay,
    };
  }

  return { preset: "custom" as SchedulePreset, time: "09:00", weekDay: "MON" };
};

const getStatusBadgeClass = (status: string) => {
  switch (status) {
    case "success":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    case "failed":
      return "border-rose-500/30 bg-rose-500/10 text-rose-200";
    case "running":
      return "border-primary/30 bg-primary/10 text-primary";
    case "stopped":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    default:
      return "border-white/10 bg-white/[0.04] text-slate-300";
  }
};

export const IntegrationsPage = () => {
  const navigate = useNavigate();
  const { selectedProject } = useProjects();
  const { addNotification } = useNotifications();

  const [integrations, setIntegrations] = useState<ProjectIntegration[]>([]);
  const [tokenMeta, setTokenMeta] = useState<ProjectIntegrationTokenMeta>({
    hasToken: false,
    preview: "",
    updatedAt: null,
    lastUsedAt: null,
  });
  const [newPlainToken, setNewPlainToken] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTokenLoading, setIsTokenLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingIntegrationId, setEditingIntegrationId] = useState<string | null>(null);
  const [triggerType, setTriggerType] = useState<TriggerType>("cron");
  const [name, setName] = useState("Scheduled Homepage Check");
  const [targetUrl, setTargetUrl] = useState(selectedProject?.baseUrl ?? "https://");
  const [type, setType] = useState("Load");
  const [region, setRegion] = useState("us-east-1");
  const [vus, setVus] = useState(20);
  const [duration, setDuration] = useState("30s");
  const [schedulePreset, setSchedulePreset] = useState<SchedulePreset>("15m");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [scheduleDay, setScheduleDay] = useState("MON");
  const [customCron, setCustomCron] = useState("*/15 * * * *");
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [isEnabled, setIsEnabled] = useState(true);
  const [script, setScript] = useState(buildTemplateScript(selectedProject?.baseUrl ?? "https://", 20, "30s"));
  const [isScriptDirty, setIsScriptDirty] = useState(false);

  const canRun = Boolean(selectedProject?.access.canRun);
  const canManage = Boolean(selectedProject?.access.canManage);

  const timezones = useMemo(() => {
    if (typeof Intl.supportedValuesOf === "function") {
      return Intl.supportedValuesOf("timeZone");
    }

    return ["UTC", "Asia/Kolkata", "America/New_York", "Europe/London"];
  }, []);

  const finalCron = useMemo(
    () => buildCronExpression(schedulePreset, scheduleTime, scheduleDay, customCron),
    [schedulePreset, scheduleTime, scheduleDay, customCron],
  );

  const resetForm = (nextTriggerType: TriggerType = "cron") => {
    const nextUrl = selectedProject?.baseUrl ?? "https://";

    setEditingIntegrationId(null);
    setTriggerType(nextTriggerType);
    setName(nextTriggerType === "cron" ? "Scheduled Homepage Check" : "API Hook Homepage Check");
    setTargetUrl(nextUrl);
    setType("Load");
    setRegion("us-east-1");
    setVus(20);
    setDuration("30s");
    setSchedulePreset("15m");
    setScheduleTime("09:00");
    setScheduleDay("MON");
    setCustomCron("*/15 * * * *");
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    setIsEnabled(true);
    setScript(buildTemplateScript(nextUrl, 20, "30s"));
    setIsScriptDirty(false);
  };

  const loadData = async () => {
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

      setIntegrations(integrationsResponse.data);
      setTokenMeta(tokenResponse.data);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load integrations.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedProject) {
      setIntegrations([]);
      setIsLoading(false);
      return;
    }

    resetForm();
    void loadData();
  }, [selectedProject]);

  useEffect(() => {
    if (!selectedProject || isScriptDirty) {
      return;
    }

    setScript(buildTemplateScript(targetUrl || selectedProject.baseUrl, vus, duration));
  }, [selectedProject, targetUrl, vus, duration, isScriptDirty]);

  const openCreateDialog = (nextTriggerType: TriggerType) => {
    resetForm(nextTriggerType);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    resetForm();
  };

  const handleSave = async () => {
    if (!selectedProject || !canRun) {
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
      triggerType,
      cronExpression: triggerType === "cron" ? finalCron : "",
      timezone,
      isEnabled,
    };

    try {
      if (editingIntegrationId) {
        await updateProjectIntegration(selectedProject.id, editingIntegrationId, payload);
      } else {
        await createProjectIntegration(selectedProject.id, payload);
      }

      await loadData();
      closeDialog();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to save integration.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (integration: ProjectIntegration) => {
    const presetState = getPresetFromCron(integration.cronExpression);

    setEditingIntegrationId(integration.id);
    setTriggerType(integration.triggerType);
    setName(integration.name);
    setTargetUrl(integration.targetUrl);
    setType(integration.type);
    setRegion(integration.region);
    setVus(integration.vus);
    setDuration(integration.duration);
    setSchedulePreset(integration.triggerType === "cron" ? presetState.preset : "15m");
    setScheduleTime(presetState.time);
    setScheduleDay(presetState.weekDay);
    setCustomCron(integration.cronExpression || "*/15 * * * *");
    setTimezone(integration.timezone || "UTC");
    setIsEnabled(integration.isEnabled);
    setScript(integration.script);
    setIsScriptDirty(true);
    setIsDialogOpen(true);
  };

  const handleDelete = async (integrationId: string) => {
    if (!selectedProject) {
      return;
    }

    try {
      await deleteProjectIntegration(selectedProject.id, integrationId);
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to delete integration.");
    }
  };

  const handleRunNow = async (integration: ProjectIntegration) => {
    if (!selectedProject) {
      return;
    }

    try {
      const response = await triggerProjectIntegration(selectedProject.id, integration.id);

      addNotification({
        id: `integration:${response.runId}`,
        type: "info",
        title: "Integration trigger queued",
        message: `${integration.name} queued a test for ${selectedProject.name}.`,
        projectId: selectedProject.id,
        runId: response.runId,
        link: buildProjectTestPath(selectedProject.id, response.runId),
      });

      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to trigger integration.");
    }
  };

  const handleToggle = async (integration: ProjectIntegration) => {
    if (!selectedProject) {
      return;
    }

    try {
      await updateProjectIntegration(selectedProject.id, integration.id, {
        name: integration.name,
        targetUrl: integration.targetUrl,
        type: integration.type,
        region: integration.region,
        vus: integration.vus,
        duration: integration.duration,
        script: integration.script,
        triggerType: integration.triggerType,
        cronExpression: integration.cronExpression,
        timezone: integration.timezone,
        isEnabled: !integration.isEnabled,
      });

      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update integration status.");
    }
  };

  const handleGenerateToken = async () => {
    if (!selectedProject || !canManage) {
      return;
    }

    try {
      setIsTokenLoading(true);
      const response = await regenerateProjectIntegrationToken(selectedProject.id);
      setTokenMeta(response.data);
      setNewPlainToken(response.data.token);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to generate project token.");
    } finally {
      setIsTokenLoading(false);
    }
  };

  const handleRevokeToken = async () => {
    if (!selectedProject || !canManage) {
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
      setNewPlainToken("");
      setError(null);
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
        description="Pick a project first. Integrations are stored per project, so each site can have its own hooks and schedules."
        actionText="Go To Projects"
        onAction={() => navigate("/projects")}
      />
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-white">Integrations</h1>
        <p className="text-sm text-slate-400">
          Project: <span className="font-semibold text-white">{selectedProject.name}</span>
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      )}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-white">Create Integration Job</h2>
              <p className="text-sm text-slate-400">
                Choose how this project should start tests automatically.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                disabled={!canRun}
                onClick={() => openCreateDialog("cron")}
                className="inline-flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/15 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <AlarmClock className="h-4 w-4" />
                Schedule Job
              </button>
              <button
                disabled={!canRun}
                onClick={() => openCreateDialog("api")}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Link2 className="h-4 w-4" />
                API Hook Job
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Schedule Job</p>
              <p className="mt-2 text-sm text-slate-300">
                Runs automatically on a selected timetable like every 15 minutes, every day, or every week.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">API Hook Job</p>
              <p className="mt-2 text-sm text-slate-300">
                Waits for an external app, CI pipeline, or webhook call to trigger the test on demand.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-white">Project Trigger Token</h2>
              <p className="text-sm text-slate-400">Use this token when calling project API hook integrations.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                disabled={!canManage || isTokenLoading}
                onClick={() => void handleGenerateToken()}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCcw className="h-3.5 w-3.5" />
                {tokenMeta.hasToken ? "Regenerate" : "Generate"}
              </button>
              <button
                disabled={!tokenMeta.hasToken || !canManage || isTokenLoading}
                onClick={() => void handleRevokeToken()}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Revoke
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-2 text-sm text-slate-300">
            <p>Token preview: {tokenMeta.hasToken ? tokenMeta.preview : "Not generated"}</p>
            <p>Updated: {formatDateTime(tokenMeta.updatedAt)}</p>
            <p>Last used: {formatDateTime(tokenMeta.lastUsedAt)}</p>
          </div>

          {newPlainToken && (
            <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-200">New token</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 overflow-auto rounded-xl bg-black/25 px-3 py-2 text-xs text-emerald-50">
                  {newPlainToken}
                </code>
                <button
                  onClick={() => {
                    if (navigator.clipboard) {
                      void navigator.clipboard.writeText(newPlainToken);
                    }
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-400/30 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-400/10"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-white">Configured Jobs</h2>
            <p className="text-sm text-slate-400">
              API hooks and schedules for this project are listed here.
            </p>
          </div>
          <button
            onClick={() => void loadData()}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08]"
          >
            Refresh
          </button>
        </div>

        {isLoading ? (
          <div className="mt-4 text-sm text-slate-300">Loading integrations...</div>
        ) : integrations.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-black/15 px-4 py-8 text-center text-sm text-slate-400">
            No integrations created yet.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {integrations.map((integration) => (
              <div key={integration.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-white">{integration.name}</h3>
                      <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                        {integration.triggerType === "cron" ? "Schedule" : "API Hook"}
                      </span>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${getStatusBadgeClass(integration.lastRunStatus || "idle")}`}
                      >
                        {integration.lastRunStatus || "idle"}
                      </span>
                    </div>

                    <p className="text-sm text-slate-300">{integration.targetUrl}</p>

                    <div className="space-y-1 text-xs text-slate-400">
                      {integration.triggerType === "cron" ? (
                        <p>
                          Schedule: {integration.cronExpression} ({integration.timezone})
                        </p>
                      ) : (
                        <p>Hook URL: {window.location.origin}{integration.hookPath}</p>
                      )}
                      <p>
                        Last trigger: {integration.lastTriggeredAt ? new Date(integration.lastTriggeredAt).toLocaleString() : "Never"}
                      </p>
                      {integration.lastError ? <p className="text-rose-300">Last error: {integration.lastError}</p> : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      disabled={!canRun}
                      onClick={() => void handleRunNow(integration)}
                      className="inline-flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/15 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Trigger Now
                    </button>
                    <button
                      disabled={!canRun}
                      onClick={() => void handleToggle(integration)}
                      className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {integration.isEnabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      disabled={!canRun}
                      onClick={() => handleEdit(integration)}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <SquarePen className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button
                      disabled={!canRun}
                      onClick={() => void handleDelete(integration.id)}
                      className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                    {integration.lastRunId && (
                      <button
                        onClick={() => navigate(buildProjectTestPath(selectedProject.id, integration.lastRunId!))}
                        className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08]"
                      >
                        Open Last Run
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {isDialogOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 px-4 py-6">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-3xl border border-white/10 bg-[#171819] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {editingIntegrationId ? "Edit integration" : "New integration"}
                </p>
                <h2 className="text-2xl font-bold text-white">
                  {triggerType === "cron" ? "Schedule Job" : "API Hook Job"}
                </h2>
                <p className="text-sm text-slate-400">
                  {triggerType === "cron"
                    ? "Create a beginner-friendly schedule first, and only use custom cron if you need advanced timing."
                    : "Create a job that waits for an external API call or webhook trigger."}
                </p>
              </div>

              <button
                onClick={closeDialog}
                className="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_1fr]">
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Job Name</span>
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-100 outline-none transition-colors focus:border-primary/50"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Website URL</span>
                    <div className="relative">
                      <Globe className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                      <input
                        value={targetUrl}
                        onChange={(event) => setTargetUrl(event.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-black/20 py-3 pl-10 pr-4 text-sm text-slate-100 outline-none transition-colors focus:border-primary/50"
                      />
                    </div>
                  </label>

                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Test Type</span>
                    <select
                      value={type}
                      onChange={(event) => setType(event.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-100 outline-none transition-colors focus:border-primary/50"
                    >
                      <option className="bg-slate-900 text-slate-100" value="Load">
                        Load
                      </option>
                      <option className="bg-slate-900 text-slate-100" value="Stress">
                        Stress
                      </option>
                      <option className="bg-slate-900 text-slate-100" value="Spike">
                        Spike
                      </option>
                      <option className="bg-slate-900 text-slate-100" value="Smoke">
                        Smoke
                      </option>
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Region</span>
                    <input
                      value={region}
                      onChange={(event) => setRegion(event.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-100 outline-none transition-colors focus:border-primary/50"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Virtual Users</span>
                    <div className="relative">
                      <Users className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                      <input
                        type="number"
                        min={1}
                        value={vus}
                        onChange={(event) => setVus(Math.max(1, Number(event.target.value) || 1))}
                        className="w-full rounded-2xl border border-white/10 bg-black/20 py-3 pl-10 pr-4 text-sm text-slate-100 outline-none transition-colors focus:border-primary/50"
                      />
                    </div>
                  </label>

                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Duration</span>
                    <input
                      value={duration}
                      onChange={(event) => setDuration(event.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-100 outline-none transition-colors focus:border-primary/50"
                    />
                  </label>
                </div>

                {triggerType === "cron" ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold text-white">Schedule Setup</h3>
                      <p className="text-sm text-slate-400">
                        Pick a friendly schedule first. Use advanced cron only when you really need custom timing.
                      </p>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="space-y-2 md:col-span-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">When should it run?</span>
                        <select
                          value={schedulePreset}
                          onChange={(event) => setSchedulePreset(event.target.value as SchedulePreset)}
                          className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-slate-100 outline-none transition-colors focus:border-primary/50"
                        >
                          <option className="bg-slate-900 text-slate-100" value="5m">
                            Every 5 minutes
                          </option>
                          <option className="bg-slate-900 text-slate-100" value="15m">
                            Every 15 minutes
                          </option>
                          <option className="bg-slate-900 text-slate-100" value="30m">
                            Every 30 minutes
                          </option>
                          <option className="bg-slate-900 text-slate-100" value="hourly">
                            Every hour
                          </option>
                          <option className="bg-slate-900 text-slate-100" value="daily">
                            Every day at a time
                          </option>
                          <option className="bg-slate-900 text-slate-100" value="weekly">
                            Every week on a day and time
                          </option>
                          <option className="bg-slate-900 text-slate-100" value="custom">
                            Advanced custom cron
                          </option>
                        </select>
                      </label>

                      {(schedulePreset === "daily" || schedulePreset === "weekly") && (
                        <label className="space-y-2">
                          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Time</span>
                          <input
                            type="time"
                            value={parseTime(scheduleTime).normalized}
                            onChange={(event) => setScheduleTime(event.target.value)}
                            className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-slate-100 outline-none transition-colors focus:border-primary/50"
                          />
                        </label>
                      )}

                      {schedulePreset === "weekly" && (
                        <label className="space-y-2">
                          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Day</span>
                          <select
                            value={scheduleDay}
                            onChange={(event) => setScheduleDay(event.target.value)}
                            className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-slate-100 outline-none transition-colors focus:border-primary/50"
                          >
                            {WEEK_DAYS.map((day) => (
                              <option key={day.value} className="bg-slate-900 text-slate-100" value={day.value}>
                                {day.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      <label className="space-y-2 md:col-span-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Timezone</span>
                        <select
                          value={timezone}
                          onChange={(event) => setTimezone(event.target.value)}
                          className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-slate-100 outline-none transition-colors focus:border-primary/50"
                        >
                          {timezones.map((zone) => (
                            <option key={zone} className="bg-slate-900 text-slate-100" value={zone}>
                              {zone}
                            </option>
                          ))}
                        </select>
                      </label>

                      {schedulePreset === "custom" && (
                        <label className="space-y-2 md:col-span-2">
                          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Custom cron expression</span>
                          <div className="relative">
                            <AlarmClock className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                            <input
                              value={customCron}
                              onChange={(event) => setCustomCron(event.target.value)}
                              className="w-full rounded-2xl border border-white/10 bg-black/25 py-3 pl-10 pr-4 text-sm text-slate-100 outline-none transition-colors focus:border-primary/50"
                            />
                          </div>
                        </label>
                      )}
                    </div>

                    <div className="mt-4 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
                      Final cron expression: <code>{finalCron || "(invalid)"}</code>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4 text-sm text-primary">
                    This job will not run on a timer. It waits for an API call or webhook using the project token.
                  </div>
                )}

                <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={(event) => setIsEnabled(event.target.checked)}
                    className="h-4 w-4 rounded border-white/20 bg-transparent"
                  />
                  Enable this integration after saving
                </label>
              </div>

              <div className="space-y-4">
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#050816]">
                  <div className="border-b border-white/10 bg-white/[0.03] px-4 py-3">
                    <p className="text-sm font-semibold text-white">k6 Script</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Auto-generated from the fields above until you edit it manually.
                    </p>
                  </div>
                  <div className="relative h-[360px]">
                    <ScriptEditor
                      value={script}
                      onChange={(value) => {
                        setScript(value);
                        setIsScriptDirty(true);
                      }}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    disabled={!canRun || isSaving}
                    onClick={() => void handleSave()}
                    className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {editingIntegrationId ? <Save className="h-4 w-4" /> : <PlusCircle className="h-4 w-4" />}
                    {isSaving ? "Saving..." : editingIntegrationId ? "Save Changes" : "Create Job"}
                  </button>
                  <button
                    onClick={closeDialog}
                    className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
