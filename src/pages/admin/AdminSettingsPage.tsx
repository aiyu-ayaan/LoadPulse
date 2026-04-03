import { useEffect, useMemo, useState } from "react";
import { fetchAdminUsers, fetchAuthOptions } from "../../lib/api";

export const AdminSettingsPage = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [githubEnabled, setGithubEnabled] = useState(false);
  const [userCount, setUserCount] = useState(0);
  const [activeAdminCount, setActiveAdminCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [optionsResponse, usersResponse] = await Promise.all([fetchAuthOptions(), fetchAdminUsers()]);
        setGithubEnabled(optionsResponse.githubEnabled);
        setUserCount(usersResponse.data.length);
        setActiveAdminCount(usersResponse.data.filter((user) => user.isAdmin && user.isActive).length);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Unable to load admin settings.");
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, []);

  const statusRows = useMemo(
    () => [
      { label: "Session persistence", value: "Enabled (secure cookie + token fallback)" },
      { label: "Local username/password", value: "Enabled" },
      { label: "GitHub sign-in", value: githubEnabled ? "Enabled" : "Disabled" },
      { label: "Total accounts", value: String(userCount) },
      { label: "Active admin accounts", value: String(activeAdminCount) },
      { label: "Owner protections", value: "Owner remains active and admin" },
    ],
    [activeAdminCount, githubEnabled, userCount],
  );

  if (isLoading) {
    return <div className="rounded-xl border border-white/10 bg-[#171819] px-4 py-5 text-sm text-slate-400">Loading settings...</div>;
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}

      <div className="rounded-xl border border-white/10 bg-[#171819]">
        <div className="border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold text-white">Admin Settings</h2>
          <p className="text-xs text-slate-400">Current system-level configuration and safety rules.</p>
        </div>
        <div className="divide-y divide-white/10">
          {statusRows.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-4 px-4 py-3">
              <p className="text-sm text-slate-300">{item.label}</p>
              <p className="text-sm font-medium text-slate-100">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        This settings page currently shows live admin configuration status. If you want, next we can add editable system-level flags here.
      </div>
    </div>
  );
};
