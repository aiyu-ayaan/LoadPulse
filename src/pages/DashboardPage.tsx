import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { KpiCard } from '../components/KpiCard';
import {
  Zap,
  Clock,
  AlertCircle,
  BarChart3,
  Download,
  Filter,
  Calendar,
  Activity
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { LoadingSkeleton } from '../components/LoadingSkeleton';

const responseTimeData = [
  { time: '00:00', ms: 145 }, { time: '02:00', ms: 132 }, { time: '04:00', ms: 158 },
  { time: '06:00', ms: 142 }, { time: '08:00', ms: 195 }, { time: '10:00', ms: 210 },
  { time: '12:00', ms: 185 }, { time: '14:00', ms: 172 }, { time: '16:00', ms: 165 },
];

const rpsData = [
  { time: 'Mon', rps: 840 }, { time: 'Tue', rps: 920 }, { time: 'Wed', rps: 1100 },
  { time: 'Thu', rps: 980 }, { time: 'Fri', rps: 1250 }, { time: 'Sat', rps: 760 },
  { time: 'Sun', rps: 680 },
];

const statusData = [
  { name: '200 OK', value: 85, color: '#3B82F6' },
  { name: '4xx Client', value: 10, color: '#8B5CF6' },
  { name: '5xx Server', value: 5, color: '#F43F5E' },
];

export const DashboardPage = () => {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            <Activity className="h-3.5 w-3.5" />
            Live Monitoring
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">Performance Overview</h1>
          <p className="text-sm text-muted md:text-base">Real-time latency, throughput, and reliability insights from your latest k6 runs.</p>
        </div>

        <div className="flex flex-wrap gap-2 sm:gap-3">
          <button className="glass-panel flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition hover:bg-white/10">
            <Filter className="w-4 h-4" /> Filter
          </button>

          <button className="glass-panel flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition hover:bg-white/10">
            <Calendar className="w-4 h-4" /> Last 24 Hours
          </button>

          <button className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition hover:bg-primary/90 active:scale-[0.98]">
            <Download className="w-4 h-4" /> Export Report
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="glass-panel rounded-2xl p-6">
                <LoadingSkeleton className="mb-3 h-4 w-1/2 rounded-lg" />
                <LoadingSkeleton className="mb-4 h-9 w-3/4 rounded-lg" />
                <LoadingSkeleton className="h-2 w-full rounded-full" />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <LoadingSkeleton className="h-[360px] rounded-2xl lg:col-span-2" />
            <LoadingSkeleton className="h-[360px] rounded-2xl" />
            <LoadingSkeleton className="h-[280px] rounded-2xl lg:col-span-3" />
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard title="Total Requests" value="1.28M" trend="11.2%" trendUp={true} icon={Zap} subtitle="Requests served in the selected window" />
            <KpiCard title="Avg Response Time" value="162ms" trend="8.2%" trendUp={false} icon={Clock} color="text-secondary-purple" subtitle="Median latency across endpoints" />
            <KpiCard title="Error Rate" value="0.04%" trend="0.01%" trendUp={true} icon={AlertCircle} color="text-rose-500" subtitle="4xx + 5xx over total requests" />
            <KpiCard title="Throughput (RPS)" value="1.54k" trend="4.3%" trendUp={true} icon={BarChart3} color="text-secondary-teal" subtitle="Average requests processed per second" />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-panel card-hover h-[390px] rounded-2xl p-6 lg:col-span-2"
            >
              <h3 className="mb-1 text-lg font-bold text-white">Response Time over Time</h3>
              <p className="mb-5 text-sm text-muted">Monitors latency trend as traffic scales through the run.</p>
              <ResponsiveContainer width="100%" height="84%">
                <AreaChart data={responseTimeData}>
                  <defs>
                    <linearGradient id="colorMs" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.34} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="time" stroke="#8aa0c3" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} dy={8} />
                  <YAxis stroke="#8aa0c3" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0a1020', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px' }}
                    itemStyle={{ color: '#e8f0ff', fontSize: '12px' }}
                  />
                  <Area type="monotone" dataKey="ms" stroke="#3B82F6" fillOpacity={1} fill="url(#colorMs)" strokeWidth={2.8} />
                </AreaChart>
              </ResponsiveContainer>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="glass-panel card-hover flex h-[390px] flex-col rounded-2xl p-6"
            >
              <h3 className="mb-1 text-lg font-bold text-white">Status Codes Distribution</h3>
              <p className="mb-4 text-sm text-muted">Healthy share of successful responses with low error bands.</p>

              <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={88}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0a1020', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px' }}
                      itemStyle={{ color: '#e8f0ff', fontSize: '12px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-2 space-y-2.5">
                {statusData.map((s) => (
                  <div key={s.name} className="flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="text-xs font-medium text-slate-300">{s.name}</span>
                    </div>
                    <span className="text-sm font-bold text-slate-100">{s.value}%</span>
                  </div>
                ))}
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass-panel card-hover h-[300px] rounded-2xl p-6 lg:col-span-3"
            >
              <h3 className="mb-1 text-lg font-bold text-white">Requests per Second</h3>
              <p className="mb-5 text-sm text-muted">Traffic profile across the week, highlighting sustained throughput.</p>
              <ResponsiveContainer width="100%" height="78%">
                <BarChart data={rpsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="time" stroke="#8aa0c3" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                  <YAxis stroke="#8aa0c3" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    contentStyle={{ backgroundColor: '#0a1020', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px' }}
                    itemStyle={{ color: '#e8f0ff', fontSize: '12px' }}
                  />
                  <Bar dataKey="rps" fill="#8B5CF6" radius={[8, 8, 0, 0]} barSize={34} />
                </BarChart>
              </ResponsiveContainer>
            </motion.section>
          </div>
        </>
      )}
    </div>
  );
};
