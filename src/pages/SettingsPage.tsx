import { useCallback, useEffect, useState } from "react";
import { Camera, KeyRound, Mail, RefreshCcw, ShieldCheck, Smartphone, UserCog, UserPlus, Users } from "lucide-react";
import {
  changePassword,
  createUser,
  disableTwoFactor,
  enableTwoFactor,
  fetchUsers,
  setupTwoFactor,
  updateProfile,
  updateUserAccess,
  type AuthUser,
  type ProjectPermission,
} from "../lib/api";
import { UserAvatar } from "../components/UserAvatar";
import { useAuth } from "../context/useAuth";
import { useProjects } from "../context/useProjects";

type TabKey = "profile" | "security" | "access";
type PermissionState = Record<string, { canView: boolean; canRun: boolean }>;
type TwoFactorSetupState = {
  qrCodeDataUrl: string;
  manualKey: string;
};

const createPermissionState = (projectIds: string[]): PermissionState =>
  projectIds.reduce<PermissionState>((acc, projectId) => {
    acc[projectId] = { canView: false, canRun: false };
    return acc;
  }, {});

const permissionStateFromUser = (member: AuthUser, projectIds: string[]) => {
  const state = createPermissionState(projectIds);
  for (const permission of member.projectPermissions) {
    if (!state[permission.projectId]) {
      continue;
    }
    state[permission.projectId] = {
      canView: permission.canView,
      canRun: permission.canRun,
    };
  }
  return state;
};

const hasAnyPermission = (state: PermissionState) =>
  Object.values(state).some((permission) => permission.canView || permission.canRun);

const toPermissionArray = (state: PermissionState): ProjectPermission[] =>
  Object.entries(state)
    .filter(([, permission]) => permission.canView || permission.canRun)
    .map(([projectId, permission]) => ({
      projectId,
      canView: permission.canView || permission.canRun,
      canRun: permission.canRun,
    }));

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Unable to read selected image."));
    reader.readAsDataURL(file);
  });

export const SettingsPage = () => {
  const { user, replaceCurrentUser } = useAuth();
  const { projects } = useProjects();
  const [activeTab, setActiveTab] = useState<TabKey>("profile");

  const [profileUsername, setProfileUsername] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileAvatarDataUrl, setProfileAvatarDataUrl] = useState("");
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [securityMessage, setSecurityMessage] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [twoFactorSetupState, setTwoFactorSetupState] = useState<TwoFactorSetupState | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [isGeneratingTwoFactor, setIsGeneratingTwoFactor] = useState(false);
  const [isTogglingTwoFactor, setIsTogglingTwoFactor] = useState(false);

  const [users, setUsers] = useState<AuthUser[]>([]);
  const [accessDrafts, setAccessDrafts] = useState<Record<string, { isAdmin: boolean; permissions: PermissionState }>>({});
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessMessage, setAccessMessage] = useState<string | null>(null);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [savingAccessUserId, setSavingAccessUserId] = useState<string | null>(null);
  const [creatingUser, setCreatingUser] = useState(false);

  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [newPermissions, setNewPermissions] = useState<PermissionState>(() => createPermissionState(projects.map((project) => project.id)));

  useEffect(() => {
    if (!user) {
      return;
    }
    setProfileUsername(user.username);
    setProfileEmail(user.email);
    setProfileAvatarDataUrl(user.avatarDataUrl ?? "");
  }, [user]);

  useEffect(() => {
    setNewPermissions((previous) => {
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
      return;
    }
    setIsLoadingUsers(true);
    try {
      const response = await fetchUsers();
      setUsers(response.data);
      setAccessDrafts(
        response.data.reduce<Record<string, { isAdmin: boolean; permissions: PermissionState }>>((acc, member) => {
          acc[member.id] = {
            isAdmin: member.isAdmin,
            permissions: permissionStateFromUser(member, projects.map((project) => project.id)),
          };
          return acc;
        }, {}),
      );
      setAccessError(null);
    } catch (requestError) {
      setAccessError(requestError instanceof Error ? requestError.message : "Unable to load users.");
    } finally {
      setIsLoadingUsers(false);
    }
  }, [projects, user?.isAdmin]);

  useEffect(() => {
    if (user?.isAdmin) {
      void loadUsers();
    }
  }, [loadUsers, user?.isAdmin]);

  const updatePermissionState = (
    state: PermissionState,
    projectId: string,
    field: "canView" | "canRun",
    checked: boolean,
  ): PermissionState => {
    const current = state[projectId] ?? { canView: false, canRun: false };
    if (field === "canRun") {
      return {
        ...state,
        [projectId]: {
          canRun: checked,
          canView: checked ? true : current.canView,
        },
      };
    }

    return {
      ...state,
      [projectId]: {
        canView: checked,
        canRun: checked ? current.canRun : false,
      },
    };
  };

  const handleProfileSave = async () => {
    setProfileError(null);
    setProfileMessage(null);
    setIsSavingProfile(true);

    try {
      const response = await updateProfile({
        username: profileUsername,
        email: profileEmail,
        avatarDataUrl: profileAvatarDataUrl,
      });
      replaceCurrentUser(response.user);
      setProfileMessage("Profile updated successfully.");
    } catch (requestError) {
      setProfileError(requestError instanceof Error ? requestError.message : "Unable to save profile.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleAvatarPicked = async (file: File | null) => {
    if (!file) {
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setProfileAvatarDataUrl(dataUrl);
    } catch (requestError) {
      setProfileError(requestError instanceof Error ? requestError.message : "Unable to load image.");
    }
  };

  const handleChangePassword = async () => {
    setSecurityError(null);
    setSecurityMessage(null);
    setIsChangingPassword(true);

    try {
      const response = await changePassword({
        currentPassword,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setSecurityMessage(response.message);
    } catch (requestError) {
      setSecurityError(requestError instanceof Error ? requestError.message : "Unable to change password.");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleStartTwoFactor = async () => {
    setSecurityError(null);
    setSecurityMessage(null);
    setIsGeneratingTwoFactor(true);

    try {
      const response = await setupTwoFactor();
      setTwoFactorSetupState(response);
      setTwoFactorCode("");
    } catch (requestError) {
      setSecurityError(requestError instanceof Error ? requestError.message : "Unable to start 2-step setup.");
    } finally {
      setIsGeneratingTwoFactor(false);
    }
  };

  const handleEnableTwoFactor = async () => {
    setSecurityError(null);
    setSecurityMessage(null);
    setIsTogglingTwoFactor(true);

    try {
      const response = await enableTwoFactor(twoFactorCode);
      replaceCurrentUser(response.user);
      setTwoFactorSetupState(null);
      setTwoFactorCode("");
      setSecurityMessage(response.message);
    } catch (requestError) {
      setSecurityError(requestError instanceof Error ? requestError.message : "Unable to enable 2-step authentication.");
    } finally {
      setIsTogglingTwoFactor(false);
    }
  };

  const handleDisableTwoFactor = async () => {
    setSecurityError(null);
    setSecurityMessage(null);
    setIsTogglingTwoFactor(true);

    try {
      const response = await disableTwoFactor(twoFactorCode);
      replaceCurrentUser(response.user);
      setTwoFactorCode("");
      setTwoFactorSetupState(null);
      setSecurityMessage(response.message);
    } catch (requestError) {
      setSecurityError(requestError instanceof Error ? requestError.message : "Unable to disable 2-step authentication.");
    } finally {
      setIsTogglingTwoFactor(false);
    }
  };

  const handleCreateUser = async () => {
    setAccessError(null);
    setAccessMessage(null);
    setCreatingUser(true);

    try {
      await createUser({
        username: newUsername,
        email: newEmail,
        password: newUserPassword,
        isAdmin: newIsAdmin,
        projectPermissions: newIsAdmin ? [] : toPermissionArray(newPermissions),
      });
      setNewUsername("");
      setNewEmail("");
      setNewUserPassword("");
      setNewIsAdmin(false);
      setNewPermissions(createPermissionState(projects.map((project) => project.id)));
      setAccessMessage("User created successfully.");
      await loadUsers();
    } catch (requestError) {
      setAccessError(requestError instanceof Error ? requestError.message : "Unable to create user.");
    } finally {
      setCreatingUser(false);
    }
  };

  const handleSaveUserAccess = async (memberId: string) => {
    const draft = accessDrafts[memberId];
    if (!draft) {
      return;
    }

    setAccessError(null);
    setAccessMessage(null);
    setSavingAccessUserId(memberId);

    try {
      await updateUserAccess(memberId, {
        isAdmin: draft.isAdmin,
        projectPermissions: draft.isAdmin ? [] : toPermissionArray(draft.permissions),
      });
      setAccessMessage("User access updated.");
      await loadUsers();
    } catch (requestError) {
      setAccessError(requestError instanceof Error ? requestError.message : "Unable to update access.");
    } finally {
      setSavingAccessUserId(null);
    }
  };

  if (!user) {
    return null;
  }

  const tabs = [
    { key: "profile" as const, label: "User Settings", icon: UserCog },
    { key: "security" as const, label: "Security", icon: ShieldCheck },
    ...(user.isAdmin ? [{ key: "access" as const, label: "Access Management", icon: Users }] : []),
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-12">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-white">Settings</h1>
        <p className="text-sm text-slate-400">Manage your profile, security, and team access from one place.</p>
      </div>

      <section className="grid grid-cols-1 gap-8 xl:grid-cols-[260px,1fr]">
        <aside className="glass-panel rounded-3xl border border-white/10 p-4">
          <div className="mb-5 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <UserAvatar username={user.username} avatarDataUrl={user.avatarDataUrl} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{user.username}</p>
              <p className="truncate text-xs text-slate-400">{user.email}</p>
              <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-primary">{user.isAdmin ? "Admin" : "Member"}</p>
            </div>
          </div>

          <div className="space-y-2">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                  activeTab === tab.key ? "bg-primary/15 text-primary border border-primary/25" : "text-slate-400 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </aside>

        <div className="space-y-6">
          {activeTab === "profile" && (
            <section className="glass-panel rounded-3xl border border-white/10 p-6">
              <div className="mb-6">
                <h2 className="text-xl font-bold text-white">User Settings</h2>
                <p className="mt-1 text-sm text-slate-400">Update your username, email, and profile photo.</p>
              </div>

              {(profileError || profileMessage) && (
                <div
                  className={`mb-5 rounded-2xl px-4 py-3 text-sm ${
                    profileError ? "border border-rose-500/30 bg-rose-500/10 text-rose-200" : "border border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                  }`}
                >
                  {profileError ?? profileMessage}
                </div>
              )}

              <div className="grid grid-cols-1 gap-8 lg:grid-cols-[220px,1fr]">
                <div className="space-y-4">
                  <div className="flex flex-col items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                    <UserAvatar username={profileUsername || user.username} avatarDataUrl={profileAvatarDataUrl} size="lg" />
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-slate-200 transition hover:bg-white/[0.09]">
                      <Camera className="h-4 w-4" />
                      Upload Photo
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="hidden"
                        onChange={(event) => void handleAvatarPicked(event.target.files?.[0] ?? null)}
                      />
                    </label>
                    <button
                      onClick={() => setProfileAvatarDataUrl("")}
                      className="text-xs text-slate-400 transition hover:text-white"
                    >
                      Remove photo
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Username</span>
                    <input
                      value={profileUsername}
                      onChange={(event) => setProfileUsername(event.target.value.toLowerCase())}
                      className="h-11 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-slate-100 outline-none focus:border-primary/60"
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Email</span>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                      <input
                        type="email"
                        value={profileEmail}
                        onChange={(event) => setProfileEmail(event.target.value)}
                        className="h-11 w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-10 pr-4 text-sm text-slate-100 outline-none focus:border-primary/60"
                      />
                    </div>
                  </label>

                  <div className="md:col-span-2">
                    <button
                      onClick={() => void handleProfileSave()}
                      disabled={isSavingProfile}
                      className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
                    >
                      {isSavingProfile ? "Saving profile..." : "Save Profile"}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}
          {activeTab === "security" && (
            <section className="space-y-6">
              <div className="glass-panel rounded-3xl border border-white/10 p-6">
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-white">Security</h2>
                  <p className="mt-1 text-sm text-slate-400">Change your password and protect login with an authenticator app.</p>
                </div>

                {(securityError || securityMessage) && (
                  <div
                    className={`mb-5 rounded-2xl px-4 py-3 text-sm ${
                      securityError ? "border border-rose-500/30 bg-rose-500/10 text-rose-200" : "border border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                    }`}
                  >
                    {securityError ?? securityMessage}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
                  <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                    <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
                      <KeyRound className="h-4 w-4 text-primary" />
                      Change Password
                    </h3>
                    <div className="space-y-4">
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={(event) => setCurrentPassword(event.target.value)}
                        placeholder="Current password"
                        className="h-11 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-slate-100 outline-none focus:border-primary/60"
                      />
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        placeholder="New password"
                        className="h-11 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-slate-100 outline-none focus:border-primary/60"
                      />
                      <button
                        onClick={() => void handleChangePassword()}
                        disabled={isChangingPassword}
                        className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
                      >
                        {isChangingPassword ? "Updating password..." : "Update Password"}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                    <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
                      <Smartphone className="h-4 w-4 text-secondary-teal" />
                      Two-Step Authentication
                    </h3>
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-300">
                        {user.twoFactorEnabled
                          ? "2-step authentication is active. You will be asked for an authenticator code during login."
                          : "Add an authenticator app for an extra verification screen during login."}
                      </div>

                      {!user.twoFactorEnabled && !twoFactorSetupState && (
                        <button
                          onClick={() => void handleStartTwoFactor()}
                          disabled={isGeneratingTwoFactor}
                          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
                        >
                          {isGeneratingTwoFactor ? "Generating QR..." : "Set Up Authenticator"}
                        </button>
                      )}

                      {!user.twoFactorEnabled && twoFactorSetupState && (
                        <div className="space-y-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                          <img src={twoFactorSetupState.qrCodeDataUrl} alt="Authenticator QR code" className="h-44 w-44 rounded-2xl bg-white p-2" />
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Manual Key</p>
                            <p className="mt-2 break-all rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-sm text-slate-200">
                              {twoFactorSetupState.manualKey}
                            </p>
                          </div>
                          <input
                            value={twoFactorCode}
                            onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D+/g, "").slice(0, 6))}
                            placeholder="Enter 6-digit code"
                            inputMode="numeric"
                            className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 text-sm text-slate-100 outline-none focus:border-primary/60"
                          />
                          <div className="flex flex-wrap gap-3">
                            <button
                              onClick={() => void handleEnableTwoFactor()}
                              disabled={isTogglingTwoFactor}
                              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
                            >
                              {isTogglingTwoFactor ? "Verifying..." : "Enable 2-Step Authentication"}
                            </button>
                            <button
                              onClick={() => {
                                setTwoFactorSetupState(null);
                                setTwoFactorCode("");
                              }}
                              className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08]"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {user.twoFactorEnabled && (
                        <div className="space-y-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                          <input
                            value={twoFactorCode}
                            onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D+/g, "").slice(0, 6))}
                            placeholder="Enter current authenticator code"
                            inputMode="numeric"
                            className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 text-sm text-slate-100 outline-none focus:border-primary/60"
                          />
                          <button
                            onClick={() => void handleDisableTwoFactor()}
                            disabled={isTogglingTwoFactor}
                            className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-5 py-2.5 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-60"
                          >
                            {isTogglingTwoFactor ? "Disabling..." : "Disable 2-Step Authentication"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}
          {activeTab === "access" && user.isAdmin && (
            <section className="space-y-6">
              {(accessError || accessMessage) && (
                <div
                  className={`rounded-2xl px-4 py-3 text-sm ${
                    accessError ? "border border-rose-500/30 bg-rose-500/10 text-rose-200" : "border border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                  }`}
                >
                  {accessError ?? accessMessage}
                </div>
              )}

              <div className="glass-panel rounded-3xl border border-white/10 p-6">
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-white">Access Management</h2>
                  <p className="mt-1 text-sm text-slate-400">Create users, share projects, and update permissions later from here.</p>
                </div>

                <div className="grid grid-cols-1 gap-8 xl:grid-cols-[360px,1fr]">
                  <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                    <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
                      <UserPlus className="h-4 w-4 text-primary" />
                      Add User
                    </h3>

                    <div className="space-y-4">
                      <input
                        value={newUsername}
                        onChange={(event) => setNewUsername(event.target.value.toLowerCase())}
                        placeholder="username"
                        className="h-11 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-slate-100 outline-none focus:border-primary/60"
                      />
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(event) => setNewEmail(event.target.value)}
                        placeholder="email"
                        className="h-11 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-slate-100 outline-none focus:border-primary/60"
                      />
                      <input
                        type="password"
                        value={newUserPassword}
                        onChange={(event) => setNewUserPassword(event.target.value)}
                        placeholder="password"
                        className="h-11 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-slate-100 outline-none focus:border-primary/60"
                      />
                      <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                        <input type="checkbox" checked={newIsAdmin} onChange={(event) => setNewIsAdmin(event.target.checked)} className="h-4 w-4" />
                        <span className="text-sm text-slate-200">Make this user an admin</span>
                      </label>

                      {!newIsAdmin && (
                        <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                          {projects.map((project) => {
                            const permission = newPermissions[project.id] ?? { canView: false, canRun: false };
                            return (
                              <div key={project.id} className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3">
                                <div>
                                  <p className="text-sm font-semibold text-white">{project.name}</p>
                                  <p className="text-xs text-slate-400">{project.baseUrl}</p>
                                </div>
                                <div className="flex gap-5 text-sm text-slate-200">
                                  <label className="inline-flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={permission.canView}
                                      onChange={(event) => {
                                        setNewPermissions((previous) =>
                                          updatePermissionState(previous, project.id, "canView", event.target.checked),
                                        );
                                      }}
                                      className="h-4 w-4"
                                    />
                                    View
                                  </label>
                                  <label className="inline-flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={permission.canRun}
                                      onChange={(event) => {
                                        setNewPermissions((previous) =>
                                          updatePermissionState(previous, project.id, "canRun", event.target.checked),
                                        );
                                      }}
                                      className="h-4 w-4"
                                    />
                                    Run
                                  </label>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <button
                        onClick={() => void handleCreateUser()}
                        disabled={creatingUser || (!newIsAdmin && !hasAnyPermission(newPermissions))}
                        className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
                      >
                        {creatingUser ? "Creating user..." : "Create User"}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
                        <Users className="h-4 w-4 text-secondary-teal" />
                        Existing Users
                      </h3>
                      <button
                        onClick={() => void loadUsers()}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08]"
                      >
                        <RefreshCcw className="h-3.5 w-3.5" />
                        Refresh
                      </button>
                    </div>

                    {isLoadingUsers ? (
                      <p className="text-sm text-slate-400">Loading users...</p>
                    ) : users.length === 0 ? (
                      <p className="text-sm text-slate-400">No users yet.</p>
                    ) : (
                      <div className="space-y-4">
                        {users.map((member) => {
                          const draft = accessDrafts[member.id] ?? {
                            isAdmin: member.isAdmin,
                            permissions: createPermissionState(projects.map((project) => project.id)),
                          };

                          return (
                            <div key={member.id} className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
                              <div className="mb-4 flex items-center gap-3">
                                <UserAvatar username={member.username} avatarDataUrl={member.avatarDataUrl} size="sm" />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-white">{member.username}</p>
                                  <p className="truncate text-xs text-slate-400">{member.email}</p>
                                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                                    {member.twoFactorEnabled ? "2FA enabled" : "2FA off"}
                                  </p>
                                </div>
                              </div>

                              <label className="mb-4 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                                <input
                                  type="checkbox"
                                  checked={draft.isAdmin}
                                  onChange={(event) => {
                                    setAccessDrafts((previous) => ({
                                      ...previous,
                                      [member.id]: {
                                        ...draft,
                                        isAdmin: event.target.checked,
                                      },
                                    }));
                                  }}
                                  className="h-4 w-4"
                                />
                                <span className="text-sm text-slate-200">Admin access</span>
                              </label>

                              {!draft.isAdmin && (
                                <div className="space-y-3">
                                  {projects.map((project) => {
                                    const permission = draft.permissions[project.id] ?? { canView: false, canRun: false };
                                    return (
                                      <div key={project.id} className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3">
                                        <div>
                                          <p className="text-sm font-semibold text-white">{project.name}</p>
                                          <p className="text-xs text-slate-400">{project.baseUrl}</p>
                                        </div>
                                        <div className="flex gap-5 text-sm text-slate-200">
                                          <label className="inline-flex items-center gap-2">
                                            <input
                                              type="checkbox"
                                              checked={permission.canView}
                                              onChange={(event) => {
                                                setAccessDrafts((previous) => ({
                                                  ...previous,
                                                  [member.id]: {
                                                    ...draft,
                                                    permissions: updatePermissionState(draft.permissions, project.id, "canView", event.target.checked),
                                                  },
                                                }));
                                              }}
                                              className="h-4 w-4"
                                            />
                                            View
                                          </label>
                                          <label className="inline-flex items-center gap-2">
                                            <input
                                              type="checkbox"
                                              checked={permission.canRun}
                                              onChange={(event) => {
                                                setAccessDrafts((previous) => ({
                                                  ...previous,
                                                  [member.id]: {
                                                    ...draft,
                                                    permissions: updatePermissionState(draft.permissions, project.id, "canRun", event.target.checked),
                                                  },
                                                }));
                                              }}
                                              className="h-4 w-4"
                                            />
                                            Run
                                          </label>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              <div className="mt-4">
                                <button
                                  onClick={() => void handleSaveUserAccess(member.id)}
                                  disabled={savingAccessUserId === member.id || (!draft.isAdmin && !hasAnyPermission(draft.permissions))}
                                  className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
                                >
                                  {savingAccessUserId === member.id ? "Saving..." : "Save Access"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </section>
    </div>
  );
};
