import { useEffect, useState } from 'react';
import {
  Search,
  ExternalLink,
  Trash2,
  Play,
  AlertCircle,
  CheckCircle2,
  Clock,
  History
} from 'lucide-react';
import { motion } from 'framer-motion';
import { EmptyState } from '../components/EmptyState';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { useNavigate } from 'react-router-dom';

const initialHistoryData = [
  { id: 1, name: 'Core API Smoke Test', date: 'Mar 31, 2026 14:20', status: 'Success', latency: '142ms', vus: 50, type: 'Stress' },
  { id: 2, name: 'Checkout Flow Latency', date: 'Mar 30, 2026 09:15', status: 'Failed', latency: '482ms', vus: 200, type: 'Load' },
  { id: 3, name: 'Homepage Initial Load', date: 'Mar 29, 2026 18:45', status: 'Success', latency: '98ms', vus: 10, type: 'Smoke' },
  { id: 4, name: 'Database Spike Test', date: 'Mar 28, 2026 12:30', status: 'Running', latency: 'N/A', vus: 500, type: 'Spike' },
  { id: 5, name: 'Auth Service Bench', date: 'Mar 27, 2026 22:10', status: 'Success', latency: '125ms', vus: 100, type: 'Load' },
];

export const TestHistoryPage = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(initialHistoryData);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoading(false), 850);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-8 pb-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-white tracking-tight">Test History</h1>
          <p className="text-sm text-muted md:text-base">Review recent load tests, compare latency, and inspect status outcomes.</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search history..."
              className="h-10 w-[220px] rounded-xl border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm text-slate-100 outline-none transition focus:border-primary/50"
            />
          </div>

          <button className="glass-panel px-3 py-2 text-xs font-semibold rounded-xl text-slate-300 transition hover:bg-white/10" onClick={() => setData([])}>
            Clear List
          </button>

          <button
            onClick={() => navigate('/new-test')}
            className="bg-primary text-white flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all"
          >
            <Play className="w-4 h-4" /> Start New
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="glass-panel rounded-2xl p-6 space-y-4">
          <LoadingSkeleton className="h-8 w-52 rounded-lg" />
          {Array.from({ length: 5 }).map((_, index) => (
            <LoadingSkeleton key={index} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyState
          icon={History}
          title="No test history found"
          description="You haven't run any performance tests yet. Start by creating a new test to see your results here."
          actionText="Create Your First Test"
          onAction={() => navigate('/new-test')}
        />
      ) : (
        <div className="glass-panel overflow-hidden rounded-2xl border border-white/10">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/5 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                  <th className="px-6 py-4">Test Run Name</th>
                  <th className="px-6 py-4">Date & Time</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Avg Latency</th>
                  <th className="px-6 py-4">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-white/5">
                {data.map((test, index) => (
                  <motion.tr
                    key={test.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="group hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-white group-hover:text-primary transition-colors cursor-pointer">
                          {test.name}
                        </span>
                        <span className="text-xs text-slate-500">{test.type} • {test.vus} VUs</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-400">{test.date}</td>
                    <td className="px-6 py-4">
                      {test.status === 'Success' && (
                        <div className="flex items-center gap-2 text-emerald-500">
                          <CheckCircle2 className="w-4 h-4" /> Success
                        </div>
                      )}
                      {test.status === 'Failed' && (
                        <div className="flex items-center gap-2 text-rose-500">
                          <AlertCircle className="w-4 h-4" /> Failed
                        </div>
                      )}
                      {test.status === 'Running' && (
                        <div className="flex items-center gap-2 text-primary animate-pulse">
                          <Clock className="w-4 h-4" /> Running...
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-300">{test.latency}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="h-9 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200 hover:border-primary/40 hover:text-primary transition-colors flex items-center gap-2">
                          <ExternalLink className="w-3.5 h-3.5" /> View
                        </button>
                        <button className="h-9 w-9 rounded-lg border border-white/10 bg-white/[0.04] text-slate-400 hover:border-rose-500/40 hover:text-rose-500 transition-colors grid place-content-center">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white/5 px-6 py-4 flex items-center justify-between text-xs text-slate-500">
            <span>Showing {data.length} of 142 test runs</span>
            <div className="flex gap-2">
              <button className="glass px-3 py-1 rounded-md hover:text-white disabled:opacity-50" disabled>Previous</button>
              <button className="glass px-3 py-1 rounded-md hover:text-white">Next</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
