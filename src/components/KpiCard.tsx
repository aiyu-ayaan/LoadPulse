import type { LucideIcon } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string | number;
  trend?: string;
  trendUp?: boolean;
  icon: LucideIcon;
  color?: string;
  subtitle?: string;
}

export const KpiCard = ({
  title,
  value,
  trend,
  trendUp,
  icon: Icon,
  color = "text-primary",
  subtitle = "Compared with previous period",
}: KpiCardProps) => {
  return (
    <div className="premium-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{title}</p>
          <div className="flex items-end gap-2">
            <h3 className="text-3xl font-bold tracking-tight text-white">{value}</h3>
            {trend ? (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${trendUp ? "bg-emerald-500/15 text-emerald-200" : "bg-rose-500/15 text-rose-200"}`}>
                {trendUp ? "Up" : "Down"} {trend}
              </span>
            ) : null}
          </div>
        </div>
        <div className={`rounded-lg border border-white/10 bg-white/[0.03] p-2.5 ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-400">{subtitle}</p>
    </div>
  );
};
