import { useState } from "react";
import { Globe, FolderKanban, Play, Activity, CheckCircle2, PlusCircle, Loader2, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useProjects } from "../context/useProjects";
import { EmptyState } from "../components/EmptyState";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useAuth } from "../context/useAuth";

export const ProjectsPage = () => {
  const navigate = useNavigate();
  const { projects, selectedProjectId, selectProject, createAndSelectProject, deleteProjectById, isLoading, error, refreshProjects } = useProjects();
  const { user } = useAuth();

  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<{ id: string; name: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const isAdmin = Boolean(user?.isAdmin);

  const handleCreateProject = async () => {
    if (!isAdmin) {
      setFormError("Only admins can create projects.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const created = await createAndSelectProject({ name, baseUrl, description });
      setName("");
      setBaseUrl(created.baseUrl);
      setDescription("");
      navigate("/dashboard");
    } catch (requestError) {
      setFormError(requestError instanceof Error ? requestError.message : "Unable to create project.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!isAdmin) {
      setFormError("Only admins can delete projects.");
      return;
    }
    if (!projectToDelete) {
      return;
    }
    setFormError(null);
    setDeletingProjectId(projectToDelete.id);
    try {
      await deleteProjectById(projectToDelete.id);
      setProjectToDelete(null);
    } catch (requestError) {
      setFormError(requestError instanceof Error ? requestError.message : "Unable to delete project.");
    } finally {
      setDeletingProjectId(null);
    }
  };

  return (
    <div className="space-y-8 pb-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-white">Projects</h1>
        <p className="text-sm text-muted md:text-base">
          Step 1: Create a project with your website URL. Step 2: Run tests and compare performance for each project.
        </p>
      </div>

      {(error || formError) && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error || formError}
        </div>
      )}

      <section className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="glass-panel rounded-2xl border border-white/10 p-6 lg:col-span-1">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-white">
            <PlusCircle className="h-5 w-5 text-primary" />
            {isAdmin ? "Create Project" : "Project Access"}
          </h2>

          {isAdmin ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted">Project Name</label>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Marketing Website"
                  className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 px-4 text-sm text-slate-100 outline-none transition-colors focus:border-primary/50"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted">Website URL</label>
                <div className="relative">
                  <Globe className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <input
                    value={baseUrl}
                    onChange={(event) => setBaseUrl(event.target.value)}
                    placeholder="https://example.com"
                    className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-10 pr-4 text-sm text-slate-100 outline-none transition-colors focus:border-primary/50"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted">Friendly Note (Optional)</label>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Public site for campaigns and lead forms."
                  className="h-24 w-full resize-none rounded-xl border border-white/10 bg-black/20 py-2.5 px-4 text-sm text-slate-100 outline-none transition-colors focus:border-primary/50"
                />
              </div>

              <button
                disabled={saving}
                onClick={() => void handleCreateProject()}
                className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
              >
                {saving ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </span>
                ) : (
                  "Create Project"
                )}
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
              Your account can use only the projects granted by an admin.
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          {isLoading ? (
            <div className="glass-panel rounded-2xl border border-white/10 p-6 text-sm text-slate-300">Loading projects...</div>
          ) : projects.length === 0 ? (
            isAdmin ? (
              <EmptyState
                icon={FolderKanban}
                title="No projects yet"
                description="Create your first project with a website URL to start performance testing."
              />
            ) : (
              <EmptyState
                icon={FolderKanban}
                title="No project access yet"
                description="Ask an admin to grant you access to one or more projects."
              />
            )
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {projects.map((project) => {
                const permission = user?.projectPermissions.find((entry) => entry.projectId === project.id);
                const canRun = Boolean(user?.isAdmin || permission?.canRun);

                return (
                  <button
                    key={project.id}
                    onClick={() => selectProject(project.id)}
                    className={`glass-panel rounded-2xl border p-5 text-left transition ${
                      selectedProjectId === project.id ? "border-primary/40 bg-primary/10" : "border-white/10 hover:border-primary/30"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg font-bold text-white">{project.name}</h3>
                    {selectedProjectId === project.id && (
                      <span className="rounded-full bg-primary/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
                        Selected
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-slate-400">{project.baseUrl}</p>
                  {project.description && <p className="mt-3 text-sm text-slate-300">{project.description}</p>}

                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl bg-white/[0.04] px-3 py-2">
                      <p className="text-slate-400">Total Tests</p>
                      <p className="text-white">{project.stats.totalRuns}</p>
                    </div>
                    <div className="rounded-xl bg-white/[0.04] px-3 py-2">
                      <p className="text-slate-400">Running Now</p>
                      <p className="text-white">{project.stats.activeRuns}</p>
                    </div>
                    <div className="rounded-xl bg-white/[0.04] px-3 py-2">
                      <p className="text-slate-400">Success Rate</p>
                      <p className="text-white">{project.stats.successRatePct}%</p>
                    </div>
                    <div className="rounded-xl bg-white/[0.04] px-3 py-2">
                      <p className="text-slate-400">Last Status</p>
                      <p className="text-white">{project.stats.lastRunStatus ?? "No tests yet"}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        selectProject(project.id);
                        navigate("/new-test");
                      }}
                      disabled={!canRun}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white"
                    >
                      <Play className="h-3.5 w-3.5" />
                      {canRun ? "Run Test" : "View Only"}
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        selectProject(project.id);
                        navigate("/dashboard");
                      }}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200"
                    >
                      <Activity className="h-3.5 w-3.5" />
                      View Dashboard
                    </button>
                    {isAdmin && (
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          setProjectToDelete({ id: project.id, name: project.name });
                        }}
                        disabled={deletingProjectId === project.id}
                        className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-60"
                      >
                        {deletingProjectId === project.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        Delete
                      </button>
                    )}
                  </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {projects.length > 0 && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            You can run tests for multiple projects at the same time. Each project keeps its own history and dashboard.
          </span>
        </div>
      )}

      <button onClick={() => void refreshProjects()} className="text-xs text-slate-400 hover:text-white">
        Refresh project list
      </button>

      <ConfirmDialog
        isOpen={Boolean(projectToDelete)}
        title={`Delete "${projectToDelete?.name ?? "Project"}"?`}
        description="This will permanently remove the project and all its test history."
        confirmText="Delete Project"
        cancelText="Keep Project"
        isLoading={deletingProjectId !== null}
        onConfirm={() => void handleDeleteProject()}
        onCancel={() => {
          if (deletingProjectId === null) {
            setProjectToDelete(null);
          }
        }}
      />
    </div>
  );
};

