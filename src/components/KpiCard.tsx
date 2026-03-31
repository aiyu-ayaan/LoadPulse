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
      whileHover={{ y: -8, scale: 1.01 }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      className="premium-card group p-6"
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted/80">{title}</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-3xl font-bold tracking-tight text-white">{value}</h3>
            {trend && (
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${trendUp ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}`}>
                {trendUp ? '↑' : '↓'} {trend}
              </span>
            )}
          </div>
        </div>
        <div className={`rounded-2xl border border-white/5 bg-white/5 p-3 ${color} transition-all duration-300 group-hover:scale-110 group-hover:bg-primary/20 group-hover:text-primary group-hover:shadow-[0_0_20px_hsla(217,91%,60%,0.3)]`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>

      <p className="mt-3 text-[11px] font-medium text-muted/60">{subtitle}</p>

      <div className="mt-5 relative h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: trendUp ? '74%' : '42%' }}
          transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
          className={`h-full rounded-full bg-gradient-to-r ${trendUp ? 'from-primary via-secondary-teal to-secondary-teal' : 'from-error via-secondary-purple to-primary'} relative`}
        >
          <div className="absolute inset-0 bg-[length:40px_40px] bg-linear-to-r from-transparent via-white/10 to-transparent opacity-30 animate-shimmer" />
        </motion.div>
      </div>

      {/* Decorative background glow */}
      <div className={`absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/5 blur-[80px] transition-opacity opacity-0 group-hover:opacity-100`} />
    </motion.div>
  );
};
