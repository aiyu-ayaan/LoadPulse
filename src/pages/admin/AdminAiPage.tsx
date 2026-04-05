import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  ArrowDown,
  ArrowUp,
  Brain,
  Check,
  Plus,
  RefreshCcw,
  Shield,
  Trash2,
  Unplug,
} from "lucide-react";
import {
  createAdminAiIntegration,
  createAdminAiModel,
  deleteAdminAiIntegration,
  deleteAdminAiModel,
  fetchAdminAiIntegrationModelCatalog,
  fetchAdminAiOverview,
  reorderAdminAiModels,
  updateAdminAiSettings,
  updateAdminAiIntegration,
  updateAdminAiModel,
  type AICreditResetInterval,
  type AIProvider,
  type AdminAIIntegration,
  type AdminAIModel,
  type AdminAISettings,
} from "../../lib/api";

const providerOptions: Array<{ value: AIProvider; label: string; needsKey: boolean; baseUrlHint: string }> = [
  { value: "google", label: "Google", needsKey: true, baseUrlHint: "https://generativelanguage.googleapis.com" },
  { value: "groq", label: "Groq", needsKey: true, baseUrlHint: "https://api.groq.com" },
  { value: "openrouter", label: "OpenRouter", needsKey: true, baseUrlHint: "https://openrouter.ai" },
  { value: "ollama", label: "Ollama (Local/Self-hosted)", needsKey: false, baseUrlHint: "http://localhost:11434" },
];

const providerLabel = (provider: AIProvider) => providerOptions.find((item) => item.value === provider)?.label ?? provider;

const formatDateTime = (value: string | null) => (value ? new Date(value).toLocaleString() : "-");

export const AdminAiPage = () => {
  const [integrations, setIntegrations] = useState<AdminAIIntegration[]>([]);
  const [models, setModels] = useState<AdminAIModel[]>([]);
  const [settings, setSettings] = useState<AdminAISettings>({
    autoGenerateTestSummary: false,
    maxPromptsPerPeriod: 50,
    promptCreditResetInterval: "day",
    updatedAt: null,
  });
  const [settingsForm, setSettingsForm] = useState<{
    autoGenerateTestSummary: boolean;
    maxPromptsPerPeriod: string;
    promptCreditResetInterval: AICreditResetInterval;
  }>({
    autoGenerateTestSummary: false,
    maxPromptsPerPeriod: "50",
    promptCreditResetInterval: "day",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [isSettingsSaving, setIsSettingsSaving] = useState(false);
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [showIntegrationForm, setShowIntegrationForm] = useState(false);
  const [showModelForm, setShowModelForm] = useState(false);

  const [integrationForm, setIntegrationForm] = useState({
    name: "",
    provider: "google" as AIProvider,
    apiKey: "",
    baseUrl: "",
    isEnabled: true,
  });

  const [modelForm, setModelForm] = useState({
    name: "",
    integrationId: "",
    providerModelId: "",
    customModelId: "",
    priority: "",
    isEnabled: true,
  });

  const [catalogModels, setCatalogModels] = useState<Array<{ id: string; label: string }>>([]);
  const [catalogWarning, setCatalogWarning] = useState("");

  const orderedModels = useMemo(
    () => [...models].sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt)),
    [models],
  );

  const selectedProviderConfig = useMemo(
    () => providerOptions.find((item) => item.value === integrationForm.provider) ?? providerOptions[0],
    [integrationForm.provider],
  );

  const selectedModelIntegration = useMemo(
    () => integrations.find((item) => item.id === modelForm.integrationId) ?? null,
    [integrations, modelForm.integrationId],
  );

  const loadOverview = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchAdminAiOverview();
      setSettings(response.data.settings);
      setIntegrations(response.data.integrations);
      setModels(response.data.models);

      setModelForm((previous) =>
        previous.integrationId || response.data.integrations.length === 0
          ? previous
          : {
            ...previous,
            integrationId: response.data.integrations[0].id,
          },
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load AI settings.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    setSettingsForm({
      autoGenerateTestSummary: settings.autoGenerateTestSummary,
      maxPromptsPerPeriod: String(settings.maxPromptsPerPeriod),
      promptCreditResetInterval: settings.promptCreditResetInterval,
    });
  }, [settings]);

  useEffect(() => {
    if (!modelForm.integrationId || !showModelForm) {
      setCatalogModels([]);
      setCatalogWarning("");
      return;
    }

    const loadCatalog = async () => {
      setIsCatalogLoading(true);
      setCatalogWarning("");
      try {
        const response = await fetchAdminAiIntegrationModelCatalog(modelForm.integrationId);
        setCatalogModels(response.data.models);
        setCatalogWarning(response.data.warning || "");
        setModelForm((previous) => ({
          ...previous,
          providerModelId: previous.providerModelId || response.data.models[0]?.id || "",
        }));
      } catch (requestError) {
        setCatalogModels([]);
        setCatalogWarning(requestError instanceof Error ? requestError.message : "Unable to load provider models.");
      } finally {
        setIsCatalogLoading(false);
      }
    };

    void loadCatalog();
  }, [modelForm.integrationId, showModelForm]);

  const handleCreateIntegration = async () => {
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await createAdminAiIntegration({
        name: integrationForm.name,
        provider: integrationForm.provider,
        apiKey: integrationForm.apiKey.trim() || undefined,
        baseUrl: integrationForm.baseUrl.trim() || undefined,
        isEnabled: integrationForm.isEnabled,
      });
      setIntegrationForm({
        name: "",
        provider: "google",
        apiKey: "",
        baseUrl: "",
        isEnabled: true,
      });
      setShowIntegrationForm(false);
      setSuccess("AI integration created.");
      await loadOverview();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to create AI integration.");
    } finally {
      setIsWorking(false);
    }
  };

  const handleSaveRuntimeSettings = async () => {
    const maxPrompts = Number(settingsForm.maxPromptsPerPeriod);
    if (!Number.isFinite(maxPrompts) || maxPrompts <= 0) {
      setError("Max prompts per period must be a positive number.");
      return;
    }

    setIsSettingsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await updateAdminAiSettings({
        autoGenerateTestSummary: settingsForm.autoGenerateTestSummary,
        maxPromptsPerPeriod: Math.floor(maxPrompts),
        promptCreditResetInterval: settingsForm.promptCreditResetInterval,
      });
      setSettings(response.data);
      setSuccess("Runtime AI settings updated.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update AI settings.");
    } finally {
      setIsSettingsSaving(false);
    }
  };

  const handleToggleIntegration = async (target: AdminAIIntegration) => {
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await updateAdminAiIntegration(target.id, { isEnabled: !target.isEnabled });
      setSuccess(`${target.name} is now ${target.isEnabled ? "disabled" : "enabled"}.`);
      await loadOverview();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update AI integration.");
    } finally {
      setIsWorking(false);
    }
  };

  const handleDeleteIntegration = async (target: AdminAIIntegration) => {
    if (!window.confirm(`Delete integration "${target.name}"?`)) {
      return;
    }

    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await deleteAdminAiIntegration(target.id);
      setSuccess("AI integration deleted.");
      await loadOverview();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to delete AI integration.");
    } finally {
      setIsWorking(false);
    }
  };

  const handleCreateModel = async () => {
    const providerModelId = modelForm.customModelId.trim() || modelForm.providerModelId;

    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await createAdminAiModel({
        name: modelForm.name,
        integrationId: modelForm.integrationId,
        providerModelId,
        priority: modelForm.priority.trim() ? Number(modelForm.priority) : undefined,
        isEnabled: modelForm.isEnabled,
      });
      setModelForm((previous) => ({
        ...previous,
        name: "",
        providerModelId: "",
        customModelId: "",
        priority: "",
        isEnabled: true,
      }));
      setShowModelForm(false);
      setSuccess("AI model created.");
      await loadOverview();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to create AI model.");
    } finally {
      setIsWorking(false);
    }
  };

  const handleToggleModel = async (target: AdminAIModel) => {
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await updateAdminAiModel(target.id, { isEnabled: !target.isEnabled });
      setSuccess(`${target.name} is now ${target.isEnabled ? "disabled" : "enabled"}.`);
      await loadOverview();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update AI model.");
    } finally {
      setIsWorking(false);
    }
  };

  const handleDeleteModel = async (target: AdminAIModel) => {
    if (!window.confirm(`Delete AI model "${target.name}"?`)) {
      return;
    }

    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await deleteAdminAiModel(target.id);
      setSuccess("AI model deleted.");
      await loadOverview();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to delete AI model.");
    } finally {
      setIsWorking(false);
    }
  };

  const handleMoveModel = async (targetId: string, direction: -1 | 1) => {
    const current = orderedModels;
    const index = current.findIndex((item) => item.id === targetId);
    const swapIndex = index + direction;

    if (index < 0 || swapIndex < 0 || swapIndex >= current.length) {
      return;
    }

    const reordered = [...current];
    [reordered[index], reordered[swapIndex]] = [reordered[swapIndex], reordered[index]];

    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await reorderAdminAiModels(reordered.map((item) => item.id));
      setSuccess("AI model priority updated.");
      await loadOverview();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to reorder AI models.");
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-slate-400">
          Configure providers and model fallback chain for AI execution.
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setShowIntegrationForm((value) => !value);
              if (showModelForm) {
                setShowModelForm(false);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Add AI Integration
          </button>
          <button
            type="button"
            disabled={integrations.length === 0}
            onClick={() => {
              setShowModelForm((value) => !value);
              if (showIntegrationForm) {
                setShowIntegrationForm(false);
              }
              if (integrations.length > 0 && !modelForm.integrationId) {
                setModelForm((previous) => ({
                  ...previous,
                  integrationId: integrations[0].id,
                }));
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Brain className="h-4 w-4" /> Add AI Model
          </button>
          <button
            type="button"
            onClick={() => void loadOverview()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-slate-200 transition hover:bg-white/10"
          >
            <RefreshCcw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-primary/25 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.2),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.12),transparent_38%),#171819] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-white">
              <Bot className="h-4 w-4 text-primary" /> Runtime AI Settings
            </p>
            <p className="mt-1 text-xs text-slate-300">
              Control summary automation and per-user AI prompt credits.
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              Last updated: {formatDateTime(settings.updatedAt)}
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="space-y-1.5">
                <span className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Auto-Generate Summary</span>
                <select
                  value={settingsForm.autoGenerateTestSummary ? "on" : "off"}
                  onChange={(event) =>
                    setSettingsForm((previous) => ({
                      ...previous,
                      autoGenerateTestSummary: event.target.value === "on",
                    }))
                  }
                  className="w-full rounded-lg border border-white/10 bg-[#121314] px-3 py-2 text-sm text-slate-200 outline-none"
                >
                  <option value="off">OFF</option>
                  <option value="on">ON</option>
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Max Prompts Per User</span>
                <input
                  type="number"
                  min={1}
                  max={100000}
                  value={settingsForm.maxPromptsPerPeriod}
                  onChange={(event) =>
                    setSettingsForm((previous) => ({
                      ...previous,
                      maxPromptsPerPeriod: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-white/10 bg-[#121314] px-3 py-2 text-sm text-slate-200 outline-none"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Credit Reset Window</span>
                <select
                  value={settingsForm.promptCreditResetInterval}
                  onChange={(event) =>
                    setSettingsForm((previous) => ({
                      ...previous,
                      promptCreditResetInterval: event.target.value as AICreditResetInterval,
                    }))
                  }
                  className="w-full rounded-lg border border-white/10 bg-[#121314] px-3 py-2 text-sm text-slate-200 outline-none"
                >
                  <option value="day">1 day</option>
                  <option value="week">1 week</option>
                  <option value="month">1 month</option>
                </select>
              </label>
            </div>
          </div>

          <button
            type="button"
            disabled={isSettingsSaving}
            onClick={() => void handleSaveRuntimeSettings()}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-60"
          >
            {isSettingsSaving ? "Saving..." : "Save Runtime Settings"}
          </button>
        </div>
      </div>

      {integrations.length === 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Add an AI integration first, then create one or more AI models using that integration.
        </div>
      )}

      {(error || success) && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${error ? "border-rose-500/30 bg-rose-500/10 text-rose-200" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
            }`}
        >
          {error || success}
        </div>
      )}

      {showIntegrationForm && (
        <div className="rounded-xl border border-white/10 bg-[#171819] p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-100">Create AI Integration</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs uppercase tracking-[0.12em] text-slate-500">Integration Name</span>
              <input
                value={integrationForm.name}
                onChange={(event) => setIntegrationForm((previous) => ({ ...previous, name: event.target.value }))}
                placeholder="Primary Groq"
                className="w-full rounded-lg border border-white/10 bg-[#121314] px-3 py-2 text-sm text-slate-200 outline-none"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-xs uppercase tracking-[0.12em] text-slate-500">Provider</span>
              <select
                value={integrationForm.provider}
                onChange={(event) => setIntegrationForm((previous) => ({ ...previous, provider: event.target.value as AIProvider }))}
                className="w-full rounded-lg border border-white/10 bg-[#121314] px-3 py-2 text-sm text-slate-200 outline-none"
              >
                {providerOptions.map((provider) => (
                  <option key={provider.value} value={provider.value}>
                    {provider.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs uppercase tracking-[0.12em] text-slate-500">
                API Key {selectedProviderConfig.needsKey ? "(Required)" : "(Optional)"}
              </span>
              <input
                type="password"
                value={integrationForm.apiKey}
                onChange={(event) => setIntegrationForm((previous) => ({ ...previous, apiKey: event.target.value }))}
                placeholder={selectedProviderConfig.needsKey ? "Paste API key" : "Leave empty if not needed"}
                className="w-full rounded-lg border border-white/10 bg-[#121314] px-3 py-2 text-sm text-slate-200 outline-none"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-xs uppercase tracking-[0.12em] text-slate-500">Base URL (Optional)</span>
              <input
                value={integrationForm.baseUrl}
                onChange={(event) => setIntegrationForm((previous) => ({ ...previous, baseUrl: event.target.value }))}
                placeholder={selectedProviderConfig.baseUrlHint}
                className="w-full rounded-lg border border-white/10 bg-[#121314] px-3 py-2 text-sm text-slate-200 outline-none"
              />
            </label>
          </div>

          <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={integrationForm.isEnabled}
              onChange={(event) => setIntegrationForm((previous) => ({ ...previous, isEnabled: event.target.checked }))}
            />
            Enable integration immediately
          </label>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isWorking}
              onClick={() => void handleCreateIntegration()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition hover:bg-primary/90 disabled:opacity-60"
            >
              <Shield className="h-4 w-4" /> {isWorking ? "Saving..." : "Save Integration"}
            </button>
            <button
              type="button"
              onClick={() => setShowIntegrationForm(false)}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showModelForm && (
        <div className="rounded-xl border border-white/10 bg-[#171819] p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-100">Create AI Model</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs uppercase tracking-[0.12em] text-slate-500">Model Name</span>
              <input
                value={modelForm.name}
                onChange={(event) => setModelForm((previous) => ({ ...previous, name: event.target.value }))}
                placeholder="Groq Fast Fallback"
                className="w-full rounded-lg border border-white/10 bg-[#121314] px-3 py-2 text-sm text-slate-200 outline-none"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-xs uppercase tracking-[0.12em] text-slate-500">Provider Integration</span>
              <select
                value={modelForm.integrationId}
                onChange={(event) =>
                  setModelForm((previous) => ({
                    ...previous,
                    integrationId: event.target.value,
                    providerModelId: "",
                    customModelId: "",
                  }))
                }
                className="w-full rounded-lg border border-white/10 bg-[#121314] px-3 py-2 text-sm text-slate-200 outline-none"
              >
                <option value="">Select integration</option>
                {integrations.map((integration) => (
                  <option key={integration.id} value={integration.id}>
                    {integration.name} ({providerLabel(integration.provider)})
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs uppercase tracking-[0.12em] text-slate-500">Available Provider Model IDs</span>
              <select
                value={modelForm.providerModelId}
                onChange={(event) => setModelForm((previous) => ({ ...previous, providerModelId: event.target.value }))}
                disabled={!modelForm.integrationId || isCatalogLoading}
                className="w-full rounded-lg border border-white/10 bg-[#121314] px-3 py-2 text-sm text-slate-200 outline-none disabled:opacity-50"
              >
                <option value="">{isCatalogLoading ? "Loading models..." : "Select provider model"}</option>
                {catalogModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs uppercase tracking-[0.12em] text-slate-500">Custom Model ID (Optional)</span>
              <input
                value={modelForm.customModelId}
                onChange={(event) => setModelForm((previous) => ({ ...previous, customModelId: event.target.value }))}
                placeholder="Use if model not in list"
                className="w-full rounded-lg border border-white/10 bg-[#121314] px-3 py-2 text-sm text-slate-200 outline-none"
              />
            </label>

            <label className="space-y-1.5 md:col-span-2">
              <span className="text-xs uppercase tracking-[0.12em] text-slate-500">Initial Priority (Optional)</span>
              <input
                type="number"
                min={1}
                value={modelForm.priority}
                onChange={(event) => setModelForm((previous) => ({ ...previous, priority: event.target.value }))}
                placeholder={`Default: ${models.length + 1}`}
                className="w-full rounded-lg border border-white/10 bg-[#121314] px-3 py-2 text-sm text-slate-200 outline-none"
              />
            </label>
          </div>

          <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={modelForm.isEnabled}
              onChange={(event) => setModelForm((previous) => ({ ...previous, isEnabled: event.target.checked }))}
            />
            Enable model immediately
          </label>

          {selectedModelIntegration && (
            <p className="mt-3 text-xs text-slate-500">
              Provider: {providerLabel(selectedModelIntegration.provider)}
            </p>
          )}

          {catalogWarning && (
            <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              {catalogWarning}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isWorking}
              onClick={() => void handleCreateModel()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition hover:bg-primary/90 disabled:opacity-60"
            >
              <Brain className="h-4 w-4" /> {isWorking ? "Saving..." : "Save Model"}
            </button>
            <button
              type="button"
              onClick={() => setShowModelForm(false)}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <section className="overflow-hidden rounded-xl border border-white/10 bg-[#171819]">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">AI Integrations</h2>
            <p className="text-xs text-slate-500">All configured providers and secure keys</p>
          </div>

          {isLoading ? (
            <div className="px-4 py-6 text-sm text-slate-400">Loading integrations...</div>
          ) : integrations.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-400">No AI integrations configured.</div>
          ) : (
            <div className="divide-y divide-white/10">
              {integrations.map((integration) => (
                <div key={integration.id} className="space-y-3 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-white">{integration.name}</p>
                      <p className="text-xs text-slate-400">{providerLabel(integration.provider)}</p>
                    </div>
                    <span
                      className={`rounded px-2 py-1 text-xs ${integration.isEnabled ? "bg-emerald-500/20 text-emerald-200" : "bg-slate-600/40 text-slate-200"
                        }`}
                    >
                      {integration.isEnabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>

                  <div className="grid gap-1 text-xs text-slate-400">
                    <p>Base URL: {integration.baseUrl}</p>
                    <p>Key: {integration.hasApiKey ? integration.apiKeyPreview : "Not set"}</p>
                    <p>Models linked: {integration.modelCount}</p>
                    <p>Last validated: {formatDateTime(integration.lastValidatedAt)}</p>
                    {integration.lastError && <p className="text-amber-300">Last warning: {integration.lastError}</p>}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={isWorking}
                      onClick={() => void handleToggleIntegration(integration)}
                      className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
                    >
                      {integration.isEnabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      disabled={isWorking}
                      onClick={() => void handleDeleteIntegration(integration)}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-xl border border-white/10 bg-[#171819]">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">AI Models (Priority Fallback)</h2>
            <p className="text-xs text-slate-500">Priority 1 runs first, then fallback to next model if it fails.</p>
          </div>

          {isLoading ? (
            <div className="px-4 py-6 text-sm text-slate-400">Loading AI models...</div>
          ) : orderedModels.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-400">No AI models configured.</div>
          ) : (
            <div className="divide-y divide-white/10">
              {orderedModels.map((model, index) => (
                <div key={model.id} className="space-y-3 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-white">
                        #{model.priority} {model.name}
                      </p>
                      <p className="text-xs text-slate-400">
                        {model.integrationName} • {model.providerModelId}
                      </p>
                    </div>
                    <span
                      className={`rounded px-2 py-1 text-xs ${model.isEnabled ? "bg-emerald-500/20 text-emerald-200" : "bg-slate-600/40 text-slate-200"
                        }`}
                    >
                      {model.isEnabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>

                  {model.lastError && <p className="text-xs text-amber-300">Last warning: {model.lastError}</p>}

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={isWorking || index === 0}
                      onClick={() => void handleMoveModel(model.id, -1)}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
                    >
                      <ArrowUp className="h-3.5 w-3.5" /> Up
                    </button>
                    <button
                      type="button"
                      disabled={isWorking || index === orderedModels.length - 1}
                      onClick={() => void handleMoveModel(model.id, 1)}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
                    >
                      <ArrowDown className="h-3.5 w-3.5" /> Down
                    </button>
                    <button
                      type="button"
                      disabled={isWorking}
                      onClick={() => void handleToggleModel(model)}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
                    >
                      {model.isEnabled ? <Unplug className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                      {model.isEnabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      disabled={isWorking}
                      onClick={() => void handleDeleteModel(model)}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
