import { useEffect, useMemo, useState } from "react";
import { Shield, UserPlus, Users, UserX, UserCheck, KeyRound, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  createAdminUser,
  fetchAdminUsers,
  setAdminUserRole,
  setAdminUserStatus,
  type AdminUser,
} from "../lib/api";
import { useAuth } from "../context/useAuth";

export const AdminPage = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [workingUserId, setWorkingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    isAdmin: false,
    isActive: true,
  });

  const activeAdmins = useMemo(
    () => users.filter((member) => member.isAdmin && member.isActive).length,
    [users],
  );

  const refreshUsers = async () => {
    const response = await fetchAdminUsers();
    setUsers(response.data);
  };

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        await refreshUsers();
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Unable to load admin users.");
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, []);

  const replaceUser = (nextUser: AdminUser) => {
    setUsers((previous) => previous.map((member) => (member.id === nextUser.id ? nextUser : member)));
  };

  const handleCreateUser = async () => {
    setIsCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await createAdminUser({
        username: form.username,
        email: form.email,
        password: form.password,
        isAdmin: form.isAdmin,
        isActive: form.isActive,
      });
      setUsers((previous) => [response.data, ...previous]);
      setForm({
        username: "",
        email: "",
        password: "",
        isAdmin: false,
        isActive: true,
      });
      setSuccess(`User "${response.data.username}" created successfully.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to create user.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleStatus = async (target: AdminUser) => {
    setWorkingUserId(target.id);
    setError(null);
    setSuccess(null);
    try {
      const response = await setAdminUserStatus(target.id, !target.isActive);
      replaceUser(response.data);
      setSuccess(`User "${response.data.username}" is now ${response.data.isActive ? "active" : "deactivated"}.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update user status.");
    } finally {
      setWorkingUserId(null);
    }
  };

  const handleToggleAdmin = async (target: AdminUser) => {
    setWorkingUserId(target.id);
    setError(null);
    setSuccess(null);
    try {
      const response = await setAdminUserRole(target.id, !target.isAdmin);
      replaceUser(response.data);
      setSuccess(
        `User "${response.data.username}" is now ${response.data.isAdmin ? "an admin" : "a regular user"}.`,
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update admin role.");
    } finally {
      setWorkingUserId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        <p className="text-sm">Loading admin workspace...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.15),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.16),transparent_35%),#020617] px-4 py-6 text-slate-100 md:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">Admin Console</p>
            <h1 className="text-2xl font-bold">User Access Control</h1>
            <p className="text-sm text-slate-400">
              Signed in as <span className="font-semibold text-white">{user?.username}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/projects")}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4" /> Back to app
            </button>
            <button
              type="button"
              onClick={signOut}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
            >
              Sign out
            </button>
          </div>
        </div>

        {(error || success) && (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm ${
              error ? "border-rose-500/30 bg-rose-500/10 text-rose-200" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
            }`}
          >
            {error || success}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          <section className="glass-panel space-y-4 rounded-2xl border border-white/10 p-5">
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Add New User</h2>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Username</label>
              <input
                value={form.username}
                onChange={(event) => setForm((previous) => ({ ...previous, username: event.target.value.toLowerCase() }))}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-primary/50"
                placeholder="new-user"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Email</label>
              <input
                value={form.email}
                onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value.toLowerCase() }))}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-primary/50"
                placeholder="user@example.com"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm((previous) => ({ ...previous, password: event.target.value }))}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-primary/50"
                placeholder="Minimum 8 characters"
              />
            </div>

            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={form.isAdmin}
                onChange={(event) => setForm((previous) => ({ ...previous, isAdmin: event.target.checked }))}
              />
              Make this user admin
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm((previous) => ({ ...previous, isActive: event.target.checked }))}
              />
              Account is active
            </label>

            <button
              type="button"
              onClick={() => void handleCreateUser()}
              disabled={isCreating}
              className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
            >
              {isCreating ? "Creating..." : "Create User"}
            </button>
          </section>

          <section className="glass-panel rounded-2xl border border-white/10 p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">All Users</h2>
                <p className="text-sm text-slate-400">{users.length} accounts, {activeAdmins} active admins</p>
              </div>
              <button
                type="button"
                onClick={() => void refreshUsers()}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
              >
                Refresh
              </button>
            </div>

            <div className="space-y-3">
              {users.map((member) => {
                const isWorking = workingUserId === member.id;
                const isCurrentUser = member.id === user?.id;
                return (
                  <div key={member.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-base font-semibold text-white">{member.username}</p>
                        <p className="text-sm text-slate-300">{member.email}</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          <span className={`rounded-full px-2.5 py-1 ${member.isActive ? "bg-emerald-500/20 text-emerald-200" : "bg-rose-500/20 text-rose-200"}`}>
                            {member.isActive ? "Active" : "Deactivated"}
                          </span>
                          <span className={`rounded-full px-2.5 py-1 ${member.isAdmin ? "bg-primary/20 text-primary" : "bg-slate-500/20 text-slate-200"}`}>
                            {member.isAdmin ? "Admin" : "User"}
                          </span>
                          {member.githubLinked && (
                            <span className="rounded-full bg-violet-500/20 px-2.5 py-1 text-violet-200">GitHub linked</span>
                          )}
                          {!member.hasPassword && (
                            <span className="rounded-full bg-amber-500/20 px-2.5 py-1 text-amber-200">No local password</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={isWorking || isCurrentUser}
                          onClick={() => void handleToggleStatus(member)}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
                        >
                          {member.isActive ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                          {member.isActive ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          type="button"
                          disabled={isWorking}
                          onClick={() => void handleToggleAdmin(member)}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
                        >
                          {member.isAdmin ? <Users className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}
                          {member.isAdmin ? "Remove admin" : "Set admin"}
                        </button>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-500">
                      Created: {new Date(member.createdAt).toLocaleString()} | Updated: {new Date(member.updatedAt).toLocaleString()}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-slate-400">
          <p className="inline-flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            Safety rules: deactivated users cannot sign in, and the last active admin account cannot be removed or deactivated.
          </p>
        </div>
      </div>
    </div>
  );
};
