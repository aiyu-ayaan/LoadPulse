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
import { useProjects } from '../context/useProjects';

const detailedLatencyData = Array.from({ length: 24 }, (_, i) => ({
  time: `${i}:00`,
  p50: Math.floor(Math.random() * 50) + 100,
  p95: Math.floor(Math.random() * 80) + 180,
  p99: Math.floor(Math.random() * 120) + 250,
}));

const cpuBars = Array.from({ length: 40 }, () => ({
  height: Math.random() * 100,
  opacity: 0.2 + Math.random() * 0.8,
}));

const bandwidthBars = Array.from({ length: 40 }, () => ({
  height: Math.random() * 100,
  opacity: 0.2 + Math.random() * 0.8,
}));

export const ReportsPage = () => {
  const { selectedProject } = useProjects();

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
              <span>{selectedProject?.name}</span>
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
          <div className="premium-card p-8 h-[450px]">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">Latency Percentiles (p50, p95, p99)</h3>
                <p className="text-xs font-medium text-muted/60 mt-1 uppercase tracking-wider">Historical Comparison (24h)</p>
              </div>
              <div className="flex gap-4">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted">
                  <div className="w-2.5 h-2.5 rounded-full bg-primary" /> p50
                </div>
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted">
                  <div className="w-2.5 h-2.5 rounded-full bg-secondary-purple" /> p95
                </div>
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted">
                  <div className="w-2.5 h-2.5 rounded-full bg-secondary-teal" /> p99
                </div>
              </div>
            </div>

            <ResponsiveContainer width="100%" height="80%">
              <AreaChart data={detailedLatencyData}>
                <defs>
                  <linearGradient id="colorP50" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsla(210, 40%, 98%, 0.05)" vertical={false} />
                <XAxis dataKey="time" stroke="hsla(210, 40%, 98%, 0.4)" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                <YAxis stroke="hsla(210, 40%, 98%, 0.4)" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} unit="ms" />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="glass-panel border-white/10 px-3 py-2 rounded-xl shadow-2xl">
                          <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1">{payload[0].payload.time}</p>
                          <div className="space-y-1">
                            {payload.map((entry, idx) => (
                              <p key={idx} className="text-xs font-bold text-white flex items-center justify-between gap-4">
                                <span style={{ color: entry.color }}>{entry.name}:</span>
                                <span>{entry.value}ms</span>
                              </p>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area type="monotone" dataKey="p99" stroke="hsl(171, 77%, 48%)" fill="transparent" strokeWidth={2} />
                <Area type="monotone" dataKey="p95" stroke="hsl(258, 89%, 66%)" fill="transparent" strokeWidth={2} />
                <Area type="monotone" dataKey="p50" stroke="hsl(217, 91%, 60%)" fill="url(#colorP50)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="premium-card p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Cpu className="w-5 h-5 text-secondary-purple" />
                  <h3 className="font-bold text-white">CPU Utilization</h3>
                </div>
                <span className="text-[10px] font-black text-secondary-purple bg-secondary-purple/10 px-2 py-1 rounded-md uppercase tracking-wider">82% Peak</span>
              </div>
              <div className="h-32 bg-white/[0.02] rounded-2xl flex items-end gap-1.5 p-4 border border-white/[0.01]">
                {cpuBars.map((bar, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-secondary-purple hover:bg-secondary-purple/80 transition-all rounded-t-sm"
                    style={{ height: `${bar.height}%`, opacity: bar.opacity }}
                  />
                ))}
              </div>
            </div>
            <div className="premium-card p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Network className="w-5 h-5 text-secondary-teal" />
                  <h3 className="font-bold text-white">Bandwidth</h3>
                </div>
                <span className="text-[10px] font-black text-secondary-teal bg-secondary-teal/10 px-2 py-1 rounded-md uppercase tracking-wider">4.2 Gbps</span>
              </div>
              <div className="h-32 bg-white/[0.02] rounded-2xl flex items-end gap-1.5 p-4 border border-white/[0.01]">
                {bandwidthBars.map((bar, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-secondary-teal hover:bg-secondary-teal/80 transition-all rounded-t-sm"
                    style={{ height: `${bar.height}%`, opacity: bar.opacity }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="premium-card p-6 border-l-4 border-l-success">
            <h4 className="text-[10px] font-black text-muted/60 mb-4 flex items-center gap-2 uppercase tracking-widest">
              <TrendingDown className="w-3.5 h-3.5 text-success" /> Score
            </h4>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-white tracking-tighter">+24.5%</span>
              <span className="text-[10px] text-success font-black uppercase tracking-wider pb-1">vs Last Week</span>
            </div>
            <p className="text-xs text-muted/80 mt-4 leading-relaxed font-medium">
              Performance has stabilized significantly after the v2.4 server-side caching deployment. Latency spikes are down 40%.
            </p>
          </div>

          <div className="premium-card p-6">
            <h4 className="text-[10px] font-black text-muted/60 mb-6 flex items-center gap-2 uppercase tracking-widest">
              <Activity className="w-3.5 h-3.5 text-primary" /> Anomalies
            </h4>
            <div className="space-y-3">
              {[
                { time: '14:22', msg: 'Spike in p99 Latency detected.', type: 'Warning' },
                { time: '12:05', msg: 'Unusual traffic from US-West.', type: 'Info' },
                { time: '09:40', msg: 'Auth token validation retry rate increased.', type: 'Alert' },
              ].map((item, i) => (
                <div key={i} className="flex gap-3 group cursor-pointer hover:bg-white/5 p-2.5 rounded-xl transition-all border border-transparent hover:border-white/5">
                  <div className="text-[9px] font-black text-muted/40 mt-1 uppercase tracking-tighter">{item.time}</div>
                  <div className="text-xs text-muted/80 font-medium group-hover:text-white transition-colors">{item.msg}</div>
                </div>
              ))}
            </div>
            <button className="w-full mt-6 py-2.5 text-xs font-black text-primary flex items-center justify-center gap-1 hover:underline transition-all uppercase tracking-widest">
              View Full Logs <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <motion.div
            whileHover={{ y: -8 }}
            className="rounded-3xl p-8 bg-gradient-to-br from-primary via-secondary-purple to-secondary-teal text-white relative overflow-hidden group cursor-pointer shadow-2xl shadow-primary/20"
          >
            <h3 className="text-2xl font-black mb-2 tracking-tight">Automate this report</h3>
            <p className="text-sm font-medium opacity-80 mb-6 leading-relaxed">Schedule performance runs and get PDF reports in Slack.</p>
            <button className="bg-white/20 backdrop-blur-xl px-5 py-3 rounded-2xl text-[10px] font-black flex items-center gap-2 hover:bg-white/30 transition-all uppercase tracking-widest">
              Set Schedule <ExternalLink className="w-3 h-3" />
            </button>
            <div className="absolute -bottom-6 -right-6 opacity-10 group-hover:opacity-20 transition-opacity">
              <Activity size={140} />
            </div>
          </motion.div>
        </div>
      </div>

    </div>
  );
};
