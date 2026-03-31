import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  Camera,
  Mail,
  RefreshCcw,
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserCog,
  UserPlus,
  Users,
} from "lucide-react";
import {
  changePassword,
  disableTwoFactor,
  enableTwoFactor,
  fetchProjectAccess,
  removeProjectAccess,
  searchUsers,
  setupTwoFactor,
  shareProjectAccess,
  updateProfile,
  type ProjectAccessMember,
  type UserSearchResult,
} from "../lib/api";
import { UserAvatar } from "../components/UserAvatar";
import { useAuth } from "../context/useAuth";
import { useProjects } from "../context/useProjects";

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

type TabKey = "profile" | "security" | "access";

type MemberRowProps = {
  member: ProjectAccessMember;
  busy: boolean;
  onSave: (canView: boolean, canRun: boolean) => void;
  onRemove: () => void;
};

const ProjectMemberRow = ({ member, busy, onSave, onRemove }: MemberRowProps) => {
  const [canView, setCanView] = useState(member.canView);
  const [canRun, setCanRun] = useState(member.canRun);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center gap-3">
        <UserAvatar username={member.username || member.email} avatarDataUrl={member.avatarDataUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{member.username || member.email}</p>
          <p className="truncate text-xs text-slate-400">{member.email}</p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-slate-500">
            {member.joinedVia === "pending"
              ? "Pending account"
              : member.joinedVia === "github"
                ? "GitHub account"
                : "Local account"}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr,auto] md:items-center">
        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-300">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={canView}
              onChange={(event) => setCanView(event.target.checked || canRun)}
              className="h-4 w-4"
            />
            View
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={canRun}
              onChange={(event) => {
                setCanRun(event.target.checked);
                if (event.target.checked) {
                  setCanView(true);
                }
              }}
              className="h-4 w-4"
            />
            Run
          </label>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy || (!canView && !canRun)}
            onClick={() => onSave(canView || canRun, canRun)}
            className="rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
          >
            {busy ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onRemove}
            className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-60"
          >
            <span className="inline-flex items-center gap-2">
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export const SettingsPage = () => {
  const { user, replaceCurrentUser } = useAuth();
  const { selectedProject, refreshProjects } = useProjects();

  const [activeTab, setActiveTab] = useState<TabKey>("profile");

  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [username, setUsername] = useState(user?.username ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [avatarDataUrl, setAvatarDataUrl] = useState(user?.avatarDataUrl ?? "");

  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
  const [twoFactorMessage, setTwoFactorMessage] = useState<string | null>(null);
  const [twoFactorBusy, setTwoFactorBusy] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [pendingSetup, setPendingSetup] = useState<{ qrCodeDataUrl: string; manualKey: string } | null>(null);

  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessMessage, setAccessMessage] = useState<string | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [owner, setOwner] = useState<ProjectAccessMember | null>(null);
  const [members, setMembers] = useState<ProjectAccessMember[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [inviteCanView, setInviteCanView] = useState(true);
  const [inviteCanRun, setInviteCanRun] = useState(false);
  const [sharingEmail, setSharingEmail] = useState<string | null>(null);
  const [memberActionEmail, setMemberActionEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }
    setUsername(user.username);
    setEmail(user.email);
    setAvatarDataUrl(user.avatarDataUrl);
  }, [user]);

  const loadProjectAccess = useCallback(async () => {
    if (!selectedProject?.access.canManage) {
      setOwner(null);
      setMembers([]);
      return;
    }

    setAccessLoading(true);
    try {
      const response = await fetchProjectAccess(selectedProject.id);
      setOwner(response.data.owner);
      setMembers(response.data.members);
      setAccessError(null);
    } catch (requestError) {
      setAccessError(requestError instanceof Error ? requestError.message : "Unable to load project access.");
    } finally {
      setAccessLoading(false);
    }
  }, [selectedProject]);

  useEffect(() => {
    if (activeTab === "access") {
      void loadProjectAccess();
    }
  }, [activeTab, loadProjectAccess]);

  useEffect(() => {
    if (activeTab !== "access") {
      return;
    }
    if (!selectedProject?.access.canManage || searchTerm.trim().length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      setSearchLoading(true);
      void searchUsers(searchTerm.trim())
        .then((response) => setSearchResults(response.data))
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false));
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [activeTab, searchTerm, selectedProject]);

  const inviteEmail = useMemo(() => {
    const trimmed = searchTerm.trim().toLowerCase();
    return isEmail(trimmed) ? trimmed : "";
  }, [searchTerm]);

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setAvatarDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };
  const handleSaveProfile = async () => {
    setProfileSaving(true);
    setProfileError(null);
    setProfileMessage(null);

    try {
      const response = await updateProfile({ username, email, avatarDataUrl });
      replaceCurrentUser(response.user);
      await refreshProjects();
      setProfileMessage("Profile updated successfully.");
    } catch (requestError) {
      setProfileError(requestError instanceof Error ? requestError.message : "Unable to update profile.");
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    setPasswordSaving(true);
    setPasswordError(null);
    setPasswordMessage(null);

    try {
      const response = await changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setPasswordMessage(response.message);
    } catch (requestError) {
      setPasswordError(requestError instanceof Error ? requestError.message : "Unable to update password.");
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleStartTwoFactorSetup = async () => {
    setTwoFactorBusy(true);
    setTwoFactorError(null);
    setTwoFactorMessage(null);

    try {
      setPendingSetup(await setupTwoFactor());
    } catch (requestError) {
      setTwoFactorError(requestError instanceof Error ? requestError.message : "Unable to start 2-step setup.");
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const handleEnableTwoFactor = async () => {
    setTwoFactorBusy(true);
    setTwoFactorError(null);
    setTwoFactorMessage(null);

    try {
      const response = await enableTwoFactor(twoFactorCode);
      replaceCurrentUser(response.user);
      setPendingSetup(null);
      setTwoFactorCode("");
      setTwoFactorMessage(response.message);
    } catch (requestError) {
      setTwoFactorError(
        requestError instanceof Error ? requestError.message : "Unable to enable 2-step authentication.",
      );
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const handleDisableTwoFactor = async () => {
    setTwoFactorBusy(true);
    setTwoFactorError(null);
    setTwoFactorMessage(null);

    try {
      const response = await disableTwoFactor(twoFactorCode);
      replaceCurrentUser(response.user);
      setPendingSetup(null);
      setTwoFactorCode("");
      setTwoFactorMessage(response.message);
    } catch (requestError) {
      setTwoFactorError(
        requestError instanceof Error ? requestError.message : "Unable to disable 2-step authentication.",
      );
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const handleShare = async (targetEmail: string) => {
    if (!selectedProject) {
      return;
    }

    setSharingEmail(targetEmail);
    setAccessError(null);
    setAccessMessage(null);

    try {
      await shareProjectAccess(selectedProject.id, {
        email: targetEmail,
        canView: inviteCanView || inviteCanRun,
        canRun: inviteCanRun,
      });
      setSearchTerm("");
      setSearchResults([]);
      setInviteCanView(true);
      setInviteCanRun(false);
      setAccessMessage(`Access updated for ${targetEmail}.`);
      await Promise.all([loadProjectAccess(), refreshProjects()]);
    } catch (requestError) {
      setAccessError(requestError instanceof Error ? requestError.message : "Unable to share the project.");
    } finally {
      setSharingEmail(null);
    }
  };

  const handleUpdateMember = async (member: ProjectAccessMember, canView: boolean, canRun: boolean) => {
    if (!selectedProject) {
      return;
    }

    setMemberActionEmail(member.email);
    setAccessError(null);
    setAccessMessage(null);

    try {
      await shareProjectAccess(selectedProject.id, {
        email: member.email,
        canView: canView || canRun,
        canRun,
      });
      setAccessMessage(`Access updated for ${member.email}.`);
      await Promise.all([loadProjectAccess(), refreshProjects()]);
    } catch (requestError) {
      setAccessError(requestError instanceof Error ? requestError.message : "Unable to update member access.");
    } finally {
      setMemberActionEmail(null);
    }
  };

  const handleRemoveMember = async (member: ProjectAccessMember) => {
    if (!selectedProject) {
      return;
    }

    setMemberActionEmail(member.email);
    setAccessError(null);
    setAccessMessage(null);

    try {
      await removeProjectAccess(selectedProject.id, member.email);
      setAccessMessage(`${member.email} was removed from this project.`);
      await Promise.all([loadProjectAccess(), refreshProjects()]);
    } catch (requestError) {
      setAccessError(requestError instanceof Error ? requestError.message : "Unable to remove project access.");
    } finally {
      setMemberActionEmail(null);
    }
  };

  if (!user) {
    return null;
  }

  const tabs = [
    { key: "profile" as const, label: "User Settings", icon: UserCog },
    { key: "security" as const, label: "Security", icon: ShieldCheck },
    { key: "access" as const, label: "Access Management", icon: Users },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-12">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-white">Settings</h1>
        <p className="text-sm text-slate-400 md:text-base">
          Manage your profile, secure your account, and share the currently selected project with the right people.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[300px,1fr]">
        <aside className="glass-panel rounded-3xl border border-white/10 p-6">
          <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <UserAvatar username={user.username} avatarDataUrl={user.avatarDataUrl} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-white">{user.username}</p>
              <p className="truncate text-sm text-slate-400">{user.email}</p>
              <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-primary">
                {user.githubLinked ? "GitHub linked" : "Password account"}
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition ${
                    activeTab === tab.key
                      ? "border border-primary/30 bg-primary/15 text-white"
                      : "border border-transparent text-slate-300 hover:bg-white/[0.05]"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-sm font-medium">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="space-y-6">
          {activeTab === "profile" && (
            <section className="glass-panel rounded-3xl border border-white/10 p-6">
              <div className="mb-6">
                <h2 className="text-xl font-bold text-white">User Settings</h2>
                <p className="mt-1 text-sm text-slate-400">Update how your account appears across projects and reports.</p>
              </div>

              {(profileError || profileMessage) && (
                <div
                  className={`mb-4 rounded-2xl px-4 py-3 text-sm ${
                    profileError
                      ? "border border-rose-500/30 bg-rose-500/10 text-rose-200"
                      : "border border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                  }`}
                >
                  {profileError || profileMessage}
                </div>
              )}

              <div className="grid gap-6 lg:grid-cols-[220px,1fr]">
                <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="flex justify-center">
                    <UserAvatar username={username || user.username} avatarDataUrl={avatarDataUrl} size="lg" />
                  </div>
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/[0.04]">
                    <Camera className="h-4 w-4" />
                    Upload Photo
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={handleAvatarChange}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setAvatarDataUrl("")}
                    className="w-full rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-white/[0.05]"
                  >
                    Use Initials Instead
                  </button>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Username</label>
                    <input
                      value={username}
                      onChange={(event) => setUsername(event.target.value.toLowerCase())}
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-primary/60"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                      <input
                        value={email}
                        onChange={(event) => setEmail(event.target.value.toLowerCase())}
                        className="w-full rounded-2xl border border-white/10 bg-black/20 py-3 pl-11 pr-4 text-sm text-slate-100 outline-none transition focus:border-primary/60"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={profileSaving}
                    onClick={() => void handleSaveProfile()}
                    className="rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
                  >
                    {profileSaving ? "Saving..." : "Save Profile"}
                  </button>
                </div>
              </div>
            </section>
          )}

          {activeTab === "security" && (
            <section className="glass-panel rounded-3xl border border-white/10 p-6">
              <div className="mb-6">
                <h2 className="text-xl font-bold text-white">Sign-in Security</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Manage your password, GitHub login, and authenticator protection.
                </p>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <h3 className="text-base font-semibold text-white">Password</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    {user.hasPassword
                      ? "Change the password you use for local sign-in."
                      : "This account currently signs in through GitHub. Local password sign-in is not enabled yet."}
                  </p>

                  {user.hasPassword ? (
                    <div className="mt-5 space-y-4">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Current Password
                        </label>
                        <input
                          type="password"
                          value={currentPassword}
                          onChange={(event) => setCurrentPassword(event.target.value)}
                          className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-primary/60"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          New Password
                        </label>
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(event) => setNewPassword(event.target.value)}
                          className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-primary/60"
                        />
                      </div>

                      {(passwordError || passwordMessage) && (
                        <div
                          className={`rounded-2xl px-4 py-3 text-sm ${
                            passwordError
                              ? "border border-rose-500/30 bg-rose-500/10 text-rose-200"
                              : "border border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                          }`}
                        >
                          {passwordError || passwordMessage}
                        </div>
                      )}

                      <button
                        type="button"
                        disabled={passwordSaving}
                        onClick={() => void handlePasswordChange()}
                        className="rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
                      >
                        {passwordSaving ? "Updating..." : "Update Password"}
                      </button>
                    </div>
                  ) : (
                    <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">
                      GitHub login is linked{user.githubUsername ? ` as @${user.githubUsername}` : ""}.
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-white">2-Step Authentication</h3>
                      <p className="mt-1 text-sm text-slate-400">
                        Protect sign-in with a code from any authenticator app.
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                        user.twoFactorEnabled ? "bg-emerald-500/15 text-emerald-200" : "bg-white/10 text-slate-300"
                      }`}
                    >
                      {user.twoFactorEnabled ? "Enabled" : "Off"}
                    </span>
                  </div>

                  {(twoFactorError || twoFactorMessage) && (
                    <div
                      className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
                        twoFactorError
                          ? "border border-rose-500/30 bg-rose-500/10 text-rose-200"
                          : "border border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                      }`}
                    >
                      {twoFactorError || twoFactorMessage}
                    </div>
                  )}

                  <div className="mt-5 space-y-4">
                    {!pendingSetup && !user.twoFactorEnabled && (
                      <button
                        type="button"
                        disabled={twoFactorBusy}
                        onClick={() => void handleStartTwoFactorSetup()}
                        className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
                      >
                        <Smartphone className="h-4 w-4" />
                        {twoFactorBusy ? "Preparing..." : "Set Up Authenticator"}
                      </button>
                    )}

                    {pendingSetup && (
                      <div className="space-y-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                        <img
                          src={pendingSetup.qrCodeDataUrl}
                          alt="Authenticator QR code"
                          className="mx-auto h-48 w-48 rounded-2xl bg-white p-3"
                        />
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                            Manual Key
                          </p>
                          <p className="mt-2 break-all rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-sm text-slate-200">
                            {pendingSetup.manualKey}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                            Verification Code
                          </label>
                          <input
                            inputMode="numeric"
                            value={twoFactorCode}
                            onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm tracking-[0.28em] text-slate-100 outline-none transition focus:border-primary/60"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={twoFactorBusy}
                          onClick={() => void handleEnableTwoFactor()}
                          className="rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
                        >
                          {twoFactorBusy ? "Verifying..." : "Enable 2-Step Authentication"}
                        </button>
                      </div>
                    )}

                    {user.twoFactorEnabled && !pendingSetup && (
                      <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                        <p className="text-sm text-slate-300">
                          Enter a fresh authenticator code to disable 2-step authentication.
                        </p>
                        <input
                          inputMode="numeric"
                          value={twoFactorCode}
                          onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                          className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm tracking-[0.28em] text-slate-100 outline-none transition focus:border-primary/60"
                        />
                        <button
                          type="button"
                          disabled={twoFactorBusy}
                          onClick={() => void handleDisableTwoFactor()}
                          className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-5 py-3 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-60"
                        >
                          {twoFactorBusy ? "Disabling..." : "Disable 2-Step Authentication"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}
          {activeTab === "access" && (
            <section className="glass-panel rounded-3xl border border-white/10 p-6">
              <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Access Management</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Share the selected project with teammates by email. If they sign in later with the same email, their access will appear automatically.
                  </p>
                </div>
                {selectedProject && (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
                    <p className="font-semibold text-white">{selectedProject.name}</p>
                    <p className="mt-1 text-xs text-slate-400">{selectedProject.baseUrl}</p>
                  </div>
                )}
              </div>

              {(accessError || accessMessage) && (
                <div
                  className={`mb-4 rounded-2xl px-4 py-3 text-sm ${
                    accessError
                      ? "border border-rose-500/30 bg-rose-500/10 text-rose-200"
                      : "border border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                  }`}
                >
                  {accessError || accessMessage}
                </div>
              )}

              {!selectedProject ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-slate-300">
                  Select a project first, then come back here to manage who can view it or run tests for it.
                </div>
              ) : !selectedProject.access.canManage ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-slate-300">
                  Only the project owner can manage sharing for this project.
                </div>
              ) : (
                <div className="grid gap-8 xl:grid-cols-[360px,1fr]">
                  <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                    <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
                      <UserPlus className="h-4 w-4 text-primary" />
                      Share Project
                    </h3>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Search by username or email
                        </label>
                        <div className="relative">
                          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                          <input
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            placeholder="Search teammates or type an email"
                            className="w-full rounded-2xl border border-white/10 bg-black/20 py-3 pl-11 pr-4 text-sm text-slate-100 outline-none transition focus:border-primary/60"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={inviteCanView}
                            onChange={(event) => setInviteCanView(event.target.checked || inviteCanRun)}
                            className="h-4 w-4"
                          />
                          View dashboard & history
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={inviteCanRun}
                            onChange={(event) => {
                              setInviteCanRun(event.target.checked);
                              if (event.target.checked) {
                                setInviteCanView(true);
                              }
                            }}
                            className="h-4 w-4"
                          />
                          Run tests
                        </label>
                      </div>

                      <div className="space-y-3">
                        {searchLoading && <p className="text-sm text-slate-400">Searching existing users...</p>}

                        {!searchLoading &&
                          searchResults.map((result) => (
                            <div key={result.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                              <div className="flex items-center gap-3">
                                <UserAvatar username={result.username} avatarDataUrl={result.avatarDataUrl} size="sm" />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold text-white">{result.username}</p>
                                  <p className="truncate text-xs text-slate-400">{result.email}</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                disabled={sharingEmail === result.email || (!inviteCanView && !inviteCanRun)}
                                onClick={() => void handleShare(result.email)}
                                className="mt-4 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
                              >
                                {sharingEmail === result.email ? "Sharing..." : "Add To Project"}
                              </button>
                            </div>
                          ))}

                        {inviteEmail && !searchResults.some((result) => result.email.toLowerCase() === inviteEmail) && (
                          <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-4">
                            <p className="text-sm text-slate-300">
                              No existing user matched <span className="font-semibold text-white">{inviteEmail}</span> yet.
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              We will save access by email now, and the person will get it automatically after they create an account or sign in with GitHub using the same email.
                            </p>
                            <button
                              type="button"
                              disabled={sharingEmail === inviteEmail || (!inviteCanView && !inviteCanRun)}
                              onClick={() => void handleShare(inviteEmail)}
                              className="mt-4 w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.08] disabled:opacity-60"
                            >
                              {sharingEmail === inviteEmail ? "Saving..." : "Share By Email"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
                        <Users className="h-4 w-4 text-primary" />
                        People With Access
                      </h3>
                      <button
                        type="button"
                        onClick={() => void loadProjectAccess()}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.05]"
                      >
                        <RefreshCcw className="h-3.5 w-3.5" /> Refresh
                      </button>
                    </div>

                    {accessLoading ? (
                      <p className="text-sm text-slate-400">Loading current access...</p>
                    ) : (
                      <div className="space-y-4">
                        {owner && (
                          <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Project Owner</p>
                            <div className="mt-3 flex items-center gap-3">
                              <UserAvatar username={owner.username || owner.email} avatarDataUrl={owner.avatarDataUrl} size="sm" />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-white">{owner.username || owner.email}</p>
                                <p className="truncate text-xs text-slate-400">{owner.email}</p>
                              </div>
                            </div>
                          </div>
                        )}

                        {members.length === 0 ? (
                          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-slate-300">
                            This project is not shared yet. Add a teammate by username or email on the left.
                          </div>
                        ) : (
                          members.map((member) => (
                            <ProjectMemberRow
                              key={`${member.key}-${member.canView ? "view" : "hide"}-${member.canRun ? "run" : "norun"}`}
                              member={member}
                              busy={memberActionEmail === member.email}
                              onSave={(canView, canRun) => void handleUpdateMember(member, canView, canRun)}
                              onRemove={() => void handleRemoveMember(member)}
                            />
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
