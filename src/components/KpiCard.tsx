import type { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';

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
  color = 'text-primary',
  subtitle = 'Compared with previous period',
}: KpiCardProps) => {
  return (
    <motion.div
      whileHover={{ y: -6 }}
      transition={{ type: 'spring', stiffness: 220, damping: 18 }}
      className="glass-panel card-hover group relative overflow-hidden rounded-2xl p-6"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted">{title}</span>
        <div className={`rounded-xl border border-white/10 bg-white/5 p-2.5 ${color} transition-colors group-hover:border-primary/40 group-hover:bg-primary/10 group-hover:text-primary`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>

      <div className="mt-2 flex items-end gap-3">
        <h3 className="text-3xl font-bold tracking-tight text-white">{value}</h3>
        {trend && (
          <span className={`pb-1 text-xs font-semibold ${trendUp ? 'text-secondary-teal' : 'text-rose-400'}`}>
            {trendUp ? '+' : '-'} {trend}
          </span>
        )}
      </div>

      <p className="mt-2 text-xs text-muted">{subtitle}</p>

      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${trendUp ? 'from-secondary-teal via-primary to-secondary-purple' : 'from-rose-500 via-secondary-purple to-primary'} transition-[width] duration-500`}
          style={{ width: trendUp ? '74%' : '42%' }}
        />
      </div>

      <div className="absolute left-0 top-0 h-[2px] w-full bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
    </motion.div>
  );
};
