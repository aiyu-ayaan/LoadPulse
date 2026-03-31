import { User } from "lucide-react";

export const UserAvatar = ({
  username,
  avatarDataUrl,
  size = "md",
}: {
  username: string;
  avatarDataUrl?: string;
  size?: "sm" | "md" | "lg";
}) => {
  const initial = username.trim().charAt(0).toUpperCase() || "U";
  const sizeClass = size === "sm" ? "h-9 w-9 text-sm" : size === "lg" ? "h-20 w-20 text-2xl" : "h-11 w-11 text-base";

  if (avatarDataUrl) {
    return (
      <img
        src={avatarDataUrl}
        alt={`${username} profile`}
        className={`${sizeClass} rounded-2xl border border-white/10 object-cover`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} grid place-content-center rounded-2xl bg-gradient-to-br from-primary via-secondary-purple to-secondary-teal font-bold text-white`}
      aria-label={`${username} avatar`}
    >
      {initial || <User size={18} />}
    </div>
  );
};
