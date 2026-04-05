import { useEffect, useMemo, useState } from "react";
import { Plus, Shield, UserCheck, UserX, Users } from "lucide-react";
import {
  createAdminUser,
  fetchAdminUsers,
  setAdminUserAiUnlimited,
  setAdminUserRole,
  setAdminUserStatus,
  type AdminUser,
} from "../../lib/api";

export const AdminAccountsPage = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [workingUserId, setWorkingUserId] = useState<string | null>(null);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    isAdmin: false,
    isActive: true,
  });

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
        setError(requestError instanceof Error ? requestError.message : "Unable to load accounts.");
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, []);

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return users;
    }
    return users.filter((member) => member.username.includes(keyword) || member.email.includes(keyword));
  }, [users, search]);

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
      setShowCreatePanel(false);
      setSuccess(`User "${response.data.username}" created.`);
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
      setSuccess(`${response.data.username} is now ${response.data.isActive ? "active" : "deactivated"}.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update status.");
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
      setSuccess(`${response.data.username} is now ${response.data.isAdmin ? "admin" : "user"}.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update admin role.");
    } finally {
      setWorkingUserId(null);
    }
  };

  const handleToggleAiUnlimited = async (target: AdminUser) => {
    setWorkingUserId(target.id);
    setError(null);
    setSuccess(null);
    try {
      const response = await setAdminUserAiUnlimited(target.id, !target.aiUnlimited);
      replaceUser(response.data);
      setSuccess(`${response.data.username} AI access is now ${response.data.aiUnlimited ? "unlimited" : "quota-based"}.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update AI access.");
    } finally {
      setWorkingUserId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search email or username"
            className="h-9 min-w-[240px] rounded-lg border border-white/10 bg-[#121314] px-3 text-sm text-slate-200 outline-none transition focus:border-primary/60"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refreshUsers()}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-slate-200 transition hover:bg-white/10"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowCreatePanel((value) => !value)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Add User
          </button>
        </div>
      </div>

      {(error || success) && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            error ? "border-rose-500/30 bg-rose-500/10 text-rose-200" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
          }`}
        >
          {error || success}
        </div>
      )}

      {showCreatePanel && (
        <div className="rounded-xl border border-white/10 bg-[#171819] p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-100">Create account</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <input
              value={form.username}
              onChange={(event) => setForm((previous) => ({ ...previous, username: event.target.value.toLowerCase() }))}
              placeholder="username"
              className="rounded-lg border border-white/10 bg-[#121314] px-3 py-2 text-sm text-slate-200 outline-none"
            />
            <input
              value={form.email}
              onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value.toLowerCase() }))}
              placeholder="email"
              className="rounded-lg border border-white/10 bg-[#121314] px-3 py-2 text-sm text-slate-200 outline-none"
            />
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm((previous) => ({ ...previous, password: event.target.value }))}
              placeholder="password"
              className="rounded-lg border border-white/10 bg-[#121314] px-3 py-2 text-sm text-slate-200 outline-none"
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-300">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.isAdmin}
                onChange={(event) => setForm((previous) => ({ ...previous, isAdmin: event.target.checked }))}
              />
              Admin
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm((previous) => ({ ...previous, isActive: event.target.checked }))}
              />
              Active
            </label>
            <button
              type="button"
              onClick={() => void handleCreateUser()}
              disabled={isCreating}
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:bg-primary/90 disabled:opacity-60"
            >
              {isCreating ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#171819]">
        <div className="grid grid-cols-[1.5fr_1.5fr_1fr_1fr] border-b border-white/10 px-4 py-2 text-xs uppercase tracking-[0.12em] text-slate-500">
          <p>Name</p>
          <p>User Detail</p>
          <p>Status</p>
          <p className="text-right">Actions</p>
        </div>

        {isLoading ? (
          <div className="px-4 py-6 text-sm text-slate-400">Loading accounts...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-400">No users found.</div>
        ) : (
          filteredUsers.map((member) => {
            const isWorking = workingUserId === member.id;
            const canToggleAdmin = !member.isOwner && !isWorking;
            const canToggleStatus = !member.isOwner && !isWorking;
            return (
              <div
                key={member.id}
                className="grid grid-cols-1 gap-3 border-b border-white/10 px-4 py-3 text-sm text-slate-200 md:grid-cols-[1.5fr_1.5fr_1fr_1fr]"
              >
                <div>
                  <p className="font-semibold text-white">{member.username}</p>
                  <p className="text-slate-400">{member.email}</p>
                </div>
                <div className="space-y-1 text-slate-300">
                  <p>{member.id}</p>
                  <div className="flex flex-wrap gap-1 text-xs">
                    {member.isAdmin && <span className="rounded bg-primary/20 px-2 py-0.5 text-primary">Admin</span>}
                    {member.isOwner && <span className="rounded bg-amber-500/20 px-2 py-0.5 text-amber-200">Owner</span>}
                    {member.githubLinked && <span className="rounded bg-violet-500/20 px-2 py-0.5 text-violet-200">GitHub</span>}
                    {member.aiUnlimited && <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-cyan-200">Unlimited AI</span>}
                    {!member.hasPassword && <span className="rounded bg-slate-700/70 px-2 py-0.5 text-slate-200">OAuth only</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  {member.isActive ? (
                    <span className="rounded bg-emerald-500/20 px-2 py-1 text-emerald-200">Active</span>
                  ) : (
                    <span className="rounded bg-rose-500/20 px-2 py-1 text-rose-200">Deactivated</span>
                  )}
                </div>
                <div className="flex items-start justify-end gap-2">
                  <button
                    type="button"
                    disabled={!canToggleStatus}
                    onClick={() => void handleToggleStatus(member)}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs transition hover:bg-white/10 disabled:opacity-45"
                    title={member.isOwner ? "Owner account cannot be deactivated." : ""}
                  >
                    {member.isActive ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                    {member.isActive ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    type="button"
                    disabled={!canToggleAdmin}
                    onClick={() => void handleToggleAdmin(member)}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs transition hover:bg-white/10 disabled:opacity-45"
                    title={member.isOwner ? "Owner account must remain admin." : ""}
                  >
                    {member.isAdmin ? <Users className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}
                    {member.isAdmin ? "Remove admin" : "Set admin"}
                  </button>
                  <button
                    type="button"
                    disabled={isWorking}
                    onClick={() => void handleToggleAiUnlimited(member)}
                    className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1.5 text-xs text-cyan-200 transition hover:bg-cyan-500/20 disabled:opacity-45"
                  >
                    {member.aiUnlimited ? "Unlimited AI: ON" : "Unlimited AI: OFF"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
