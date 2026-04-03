import type { LucideIcon } from "lucide-react";
import { Plus } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
}

export const EmptyState = ({ icon: Icon, title, description, actionText, onAction }: EmptyStateProps) => {
  return (
    <div className="glass-panel flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 p-10 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-slate-400">
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="text-xl font-bold text-white">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-slate-400">{description}</p>
      {actionText ? (
        <button
          onClick={onAction}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> {actionText}
        </button>
      ) : null}
    </div>
  );
};
