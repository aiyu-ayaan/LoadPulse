import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Mail, RefreshCcw, ShieldCheck, UserPlus, Users } from "lucide-react";
import { createUser, fetchUsers, type AuthUser, type ProjectPermission } from "../lib/api";
import { useAuth } from "../context/useAuth";
import { useProjects } from "../context/useProjects";

type PermissionState = Record<string, { canView: boolean; canRun: boolean }>;

const createPermissionState = (projectIds: string[]): PermissionState =>
  projectIds.reduce<PermissionState>((acc, projectId) => {
    acc[projectId] = { canView: false, canRun: false };
    return acc;
  }, {});

const hasAnyPermission = (state: PermissionState) =>
  Object.values(state).some((permission) => permission.canView || permission.canRun);

export const SettingsPage = () => {
  const { user } = useAuth();
  const { projects } = useProjects();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [permissions, setPermissions] = useState<PermissionState>(() => createPermissionState(projects.map((project) => project.id)));

  useEffect(() => {
    setPermissions((previous) => {
      const next = createPermissionState(projects.map((project) => project.id));
      for (const project of projects) {
        if (previous[project.id]) {
          next[project.id] = previous[project.id];
        }
      }
      return next;
    });
  }, [projects]);

  const loadUsers = useCallback(async () => {
    if (!user?.isAdmin) {
      setIsLoadingUsers(false);
      return;
    }

    try {
      const response = await fetchUsers();
      setUsers(response.data);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load users.");
    } finally {
      setIsLoadingUsers(false);
    }
  }, [user?.isAdmin]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const canSubmit = useMemo(() => {
    if (isAdmin) {
      return username.trim().length >= 3 && email.trim().length > 3 && password.length >= 8;
    }
    return username.trim().length >= 3 && email.trim().length > 3 && password.length >= 8 && hasAnyPermission(permissions);
  }, [email, isAdmin, password.length, permissions, username]);

  const handlePermissionToggle = (projectId: string, field: "canView" | "canRun", checked: boolean) => {
    setPermissions((previous) => {
      const current = previous[projectId] ?? { canView: false, canRun: false };
      if (field === "canRun") {
        return {
          ...previous,
          [projectId]: {
            canRun: checked,
            canView: checked ? true : current.canView,
          },
        };
      }
      return {
        ...previous,
        [projectId]: {
          canView: checked,
          canRun: checked ? current.canRun : false,
        },
      };
    });
  };

  const handleCreateUser = async () => {
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    const projectPermissions: ProjectPermission[] = isAdmin
      ? []
      : Object.entries(permissions)
          .filter(([, permission]) => permission.canView || permission.canRun)
          .map(([projectId, permission]) => ({
            projectId,
            canView: permission.canView || permission.canRun,
            canRun: permission.canRun,
          }));

    try {
      await createUser({
        username,
        email,
        password,
        isAdmin,
        projectPermissions,
      });
      setUsername("");
      setEmail("");
      setPassword("");
      setIsAdmin(false);
      setPermissions(createPermissionState(projects.map((project) => project.id)));
      setSuccess("User created successfully.");
      await loadUsers();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to create user.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user?.isAdmin) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 pb-12">
        <h1 className="text-3xl font-bold tracking-tight text-white">Settings</h1>
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-200">
          Only admin users can manage team members and permissions.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-12">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-white">Team Access Settings</h1>
        <p className="text-sm text-slate-400">Create users, assign project permissions, and control who can run tests.</p>
      </div>

      {(error || success) && (
        <div
          className={`rounded-2xl px-4 py-3 text-sm ${
            error ? "border border-rose-500/30 bg-rose-500/10 text-rose-200" : "border border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
          }`}
        >
          {error ?? success}
        </div>
      )}

      <section className="grid grid-cols-1 gap-8 xl:grid-cols-[380px,1fr]">
        <div className="glass-panel space-y-5 rounded-2xl border border-white/10 p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <UserPlus className="h-5 w-5 text-primary" />
            Add User
          </h2>

          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Username</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value.toLowerCase())}
              placeholder="qa-engineer"
              className="h-11 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-slate-100 outline-none focus:border-primary/60"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Email</span>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="qa@company.com"
                className="h-11 w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-10 pr-4 text-sm text-slate-100 outline-none focus:border-primary/60"
              />
            </div>
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Password</span>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                className="h-11 w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-10 pr-4 text-sm text-slate-100 outline-none focus:border-primary/60"
              />
            </div>
          </label>

          <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <input type="checkbox" checked={isAdmin} onChange={(event) => setIsAdmin(event.target.checked)} className="h-4 w-4" />
            <span className="text-sm text-slate-200">Grant full admin access</span>
          </label>

          <button
            onClick={() => void handleCreateUser()}
            disabled={!canSubmit || isSubmitting}
            className="h-11 w-full rounded-xl bg-primary text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Creating user..." : "Create User"}
          </button>
        </div>

        <div className="space-y-6">
          <div className="glass-panel rounded-2xl border border-white/10 p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-bold text-white">
                <ShieldCheck className="h-5 w-5 text-secondary-teal" />
                Project-Level Permissions
              </h2>
              <p className="text-xs text-slate-400">Run permission automatically includes view permission.</p>
            </div>

            {isAdmin ? (
              <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
                Admin users can access all projects and run all tests.
              </div>
            ) : projects.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">
                Create at least one project before assigning user permissions.
              </div>
            ) : (
              <div className="space-y-3">
                {projects.map((project) => {
                  const permission = permissions[project.id] ?? { canView: false, canRun: false };
                  return (
                    <div key={project.id} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-white">{project.name}</p>
                          <p className="text-xs text-slate-400">{project.baseUrl}</p>
                        </div>
                        <div className="flex items-center gap-5 text-sm text-slate-200">
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={permission.canView}
                              onChange={(event) => handlePermissionToggle(project.id, "canView", event.target.checked)}
                              className="h-4 w-4"
                            />
                            View
                          </label>
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={permission.canRun}
                              onChange={(event) => handlePermissionToggle(project.id, "canRun", event.target.checked)}
                              className="h-4 w-4"
                            />
                            Run Tests
                          </label>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="glass-panel rounded-2xl border border-white/10 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-white">
                <Users className="h-5 w-5 text-primary" />
                Existing Users
              </h2>
              <button
                onClick={() => void loadUsers()}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08]"
              >
                <RefreshCcw className="h-3.5 w-3.5" />
                Refresh
              </button>
            </div>

            {isLoadingUsers ? (
              <p className="text-sm text-slate-400">Loading users...</p>
            ) : users.length === 0 ? (
              <p className="text-sm text-slate-400">No users found.</p>
            ) : (
              <div className="space-y-3">
                {users.map((member) => (
                  <div key={member.id} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                    <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">{member.username}</p>
                        <p className="text-xs text-slate-400">{member.email}</p>
                        <p className="text-xs text-slate-400">{member.isAdmin ? "Admin" : `${member.projectPermissions.length} project assignments`}</p>
                      </div>
                      {!member.isAdmin && (
                        <div className="text-xs text-slate-300">
                          {member.projectPermissions
                            .map((permission) => {
                              const project = projects.find((item) => item.id === permission.projectId);
                              if (!project) {
                                return null;
                              }
                              return `${project.name} (${permission.canRun ? "run" : "view"})`;
                            })
                            .filter(Boolean)
                            .join(", ") || "No active project assignments"}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
