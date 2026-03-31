import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import {
  FileText,
  Download,
  Share2,
  ExternalLink,
  ChevronRight,
  TrendingDown,
  Activity,
  Cpu,
  Network
} from 'lucide-react';
import { motion } from 'framer-motion';

const detailedLatencyData = Array.from({ length: 24 }, (_, i) => ({
  time: `${i}:00`,
  p50: Math.floor(Math.random() * 50) + 100,
  p95: Math.floor(Math.random() * 80) + 180,
  p99: Math.floor(Math.random() * 120) + 250,
}));

export const ReportsPage = () => {
  return (
    <div className="space-y-8 pb-12">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl glass flex items-center justify-center text-primary neon-border">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Full Analytical Report</h1>
            <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
              <span>Run #8421</span>
              <div className="w-1 h-1 rounded-full bg-slate-700" />
              <span>Mar 31, 2026</span>
              <div className="w-1 h-1 rounded-full bg-slate-700" />
              <span className="text-emerald-500 font-medium">Verified Stable</span>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <button className="glass px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-white/5 transition-colors flex items-center gap-2">
            <Share2 className="w-4 h-4" /> Share
          </button>
          <button className="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-primary/20">
            <Download className="w-4 h-4" /> Download PDF Report
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">
          {/* Main Percentile Chart */}
          <div className="glass rounded-2xl p-8 h-[450px]">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-xl font-bold text-white">Latency Percentiles (p50, p95, p99)</h3>
                <p className="text-sm text-slate-400">Comparing latency thresholds across the 24h run duration.</p>
              </div>
              <div className="flex gap-4">
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-full bg-primary" /> <span className="text-slate-400">p50</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-full bg-secondary-purple" /> <span className="text-slate-400">p95</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-full bg-secondary-teal" /> <span className="text-slate-400">p99</span>
                </div>
              </div>
            </div>

            <ResponsiveContainer width="100%" height="80%">
              <AreaChart data={detailedLatencyData}>
                <defs>
                  <linearGradient id="colorP50" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                <XAxis dataKey="time" stroke="#475569" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                <YAxis stroke="#475569" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} unit="ms" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F172A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                  itemStyle={{ fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="p99" stroke="#14B8A6" fill="transparent" strokeWidth={2} />
                <Area type="monotone" dataKey="p95" stroke="#8B5CF6" fill="transparent" strokeWidth={2} />
                <Area type="monotone" dataKey="p50" stroke="#3B82F6" fill="url(#colorP50)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="glass rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Cpu className="w-5 h-5 text-secondary-purple" />
                  <h3 className="font-bold text-white">CPU Utilization</h3>
                </div>
                <span className="text-xs font-bold text-secondary-purple bg-secondary-purple/10 px-2 py-1 rounded-md">82% Peak</span>
              </div>
              <div className="h-32 bg-black/20 rounded-xl flex items-end gap-1 p-3">
                {Array.from({ length: 40 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-secondary-purple hover:bg-secondary-purple/80 transition-colors rounded-t-sm"
                    style={{ height: `${Math.random() * 100}%`, opacity: 0.2 + (Math.random() * 0.8) }}
                  />
                ))}
              </div>
            </div>
            <div className="glass rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Network className="w-5 h-5 text-secondary-teal" />
                  <h3 className="font-bold text-white">Bandwidth Consumption</h3>
                </div>
                <span className="text-xs font-bold text-secondary-teal bg-secondary-teal/10 px-2 py-1 rounded-md">4.2 Gbps</span>
              </div>
              <div className="h-32 bg-black/20 rounded-xl flex items-end gap-1 p-3">
                {Array.from({ length: 40 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-secondary-teal hover:bg-secondary-teal/80 transition-colors rounded-t-sm"
                    style={{ height: `${Math.random() * 100}%`, opacity: 0.2 + (Math.random() * 0.8) }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass rounded-2xl p-6 border-l-4 border-l-emerald-500">
            <h4 className="text-sm font-bold text-slate-400 mb-4 flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-emerald-500" /> Improvement Score
            </h4>
            <div className="flex items-end gap-2">
              <span className="text-4xl font-black text-white">+24.5%</span>
              <span className="text-xs text-emerald-500 font-bold pb-2">vs Last Week</span>
            </div>
            <p className="text-xs text-slate-500 mt-4 leading-relaxed line-clamp-3">
              Performance has stabilized significantly after the v2.4 server-side caching deployment. Latency spikes are down 40%.
            </p>
          </div>

          <div className="glass rounded-2xl p-6">
            <h4 className="text-sm font-bold text-slate-400 mb-6 flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" /> Anomaly Detection
            </h4>
            <div className="space-y-4">
              {[
                { time: '14:22', msg: 'Spike in p99 Latency detected.', type: 'Warning' },
                { time: '12:05', msg: 'Unusual traffic from US-West.', type: 'Info' },
                { time: '09:40', msg: 'Auth token validation retry rate increased.', type: 'Alert' },
              ].map((item, i) => (
                <div key={i} className="flex gap-3 group cursor-pointer hover:bg-white/5 p-2 rounded-xl transition-colors">
                  <div className="text-[10px] font-mono text-slate-600 mt-1">{item.time}</div>
                  <div className="text-xs text-slate-400 group-hover:text-slate-100 transition-colors">{item.msg}</div>
                </div>
              ))}
            </div>
            <button className="w-full mt-6 py-2 text-xs font-bold text-primary flex items-center justify-center gap-1 hover:underline">
              View Full Logs <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <motion.div
            whileHover={{ scale: 1.02 }}
            className="rounded-2xl p-8 bg-gradient-to-br from-primary via-secondary-purple to-secondary-teal text-white relative overflow-hidden group cursor-pointer"
          >
            <h3 className="text-xl font-bold mb-2">Automate this report</h3>
            <p className="text-sm opacity-80 mb-6">Schedule performance runs and get PDF reports in your Slack.</p>
            <button className="bg-white/20 backdrop-blur-md px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-white/30 transition-all">
              Set Schedule <ExternalLink className="w-3 h-3" />
            </button>
            <div className="absolute -bottom-4 -right-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Activity size={120} />
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};
