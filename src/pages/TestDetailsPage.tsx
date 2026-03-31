import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, AlertCircle, Activity, Zap, Clock, ShieldAlert } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, BarChart, Bar } from "recharts";
import { KpiCard } from "../components/KpiCard";
import { fetchTestRun, type TestRunDetail } from "../lib/api";

const toStatusData = (detail: TestRunDetail | null) => {
  const counts = detail?.finalMetrics?.statusCodes ?? detail?.liveMetrics?.statusCodes;
  if (!counts) {
    return [
      { name: "200 OK", value: 0, color: "#3B82F6" },
      { name: "4xx Client", value: 0, color: "#8B5CF6" },
      { name: "5xx Server", value: 0, color: "#F43F5E" },
    ];
  }

  const total = counts.ok2xx + counts.client4xx + counts.server5xx + counts.other;
  const pct = (value: number) => (total > 0 ? Number(((value / total) * 100).toFixed(2)) : 0);
  return [
    { name: "200 OK", value: pct(counts.ok2xx), color: "#3B82F6" },
    { name: "4xx Client", value: pct(counts.client4xx), color: "#8B5CF6" },
    { name: "5xx Server", value: pct(counts.server5xx), color: "#F43F5E" },
  ];
};

export const TestDetailsPage = () => {
  const navigate = useNavigate();
  const { testId } = useParams();
  const [detail, setDetail] = useState<TestRunDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!testId) {
      setError("Missing test id.");
      setIsLoading(false);
      return;
    }

    const load = async () => {
      try {
        const response = await fetchTestRun(testId);
        setDetail(response.data);
        setError(null);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Unable to load test details.");
      } finally {
        setIsLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 2000);

    return () => {
      window.clearInterval(timer);
    };
  }, [testId]);

  const responseTimeData = useMemo(
    () => (detail?.liveMetrics?.responseTimeSeries ?? []).map((item) => ({ time: item.time, ms: item.value })),
    [detail],
  );
  const rpsData = useMemo(
    () => (detail?.liveMetrics?.rpsSeries ?? []).map((item) => ({ time: item.time, rps: item.value })),
    [detail],
  );

  const kpi = useMemo(() => {
    const live = detail?.liveMetrics;
    const final = detail?.finalMetrics;
    return {
      totalRequests: final?.totalRequests ?? live?.totalRequests ?? 0,
      avgLatency: `${Math.round(final?.avgLatencyMs ?? live?.avgLatencyMs ?? 0)}ms`,
      errorRate: `${(final?.errorRatePct ?? live?.errorRatePct ?? 0).toFixed(2)}%`,
      rps: Number((final?.throughputRps ?? live?.throughputRps ?? 0).toFixed(2)),
      p95: `${Math.round(final?.p95LatencyMs ?? 0)}ms`,
      p99: `${Math.round(final?.p99LatencyMs ?? 0)}ms`,
    };
  }, [detail]);

  const statusData = toStatusData(detail);

  return (
    <div className="space-y-6 pb-10">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-slate-200 hover:bg-white/[0.08]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      {isLoading && <div className="glass-panel rounded-2xl p-6 text-slate-300">Loading test details...</div>}

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      )}

      {detail && !isLoading && (
        <>
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-white">{detail.name}</h1>
            <p className="text-sm text-slate-400">
              {detail.status.toUpperCase()} • {detail.vus} virtual users • {detail.duration} • {detail.targetUrl}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-6">
            <KpiCard title="Total Requests" value={kpi.totalRequests} trendUp={true} icon={Zap} subtitle="Requests served" />
            <KpiCard title="Avg Wait Time" value={kpi.avgLatency} trendUp={false} icon={Clock} subtitle="Average latency" />
            <KpiCard title="Error Rate" value={kpi.errorRate} trendUp={false} icon={ShieldAlert} color="text-rose-500" subtitle="Failure ratio" />
            <KpiCard title="Throughput" value={kpi.rps} trendUp={true} icon={Activity} subtitle="Req/sec" />
            <KpiCard title="P95" value={kpi.p95} trendUp={false} icon={Clock} subtitle="95th percentile" />
            <KpiCard title="P99" value={kpi.p99} trendUp={false} icon={Clock} subtitle="99th percentile" />
          </div>

          {detail.errorMessage && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              <span className="inline-flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {detail.errorMessage}
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <section className="premium-card h-[330px] p-6">
              <div className="mb-6">
                <h3 className="text-lg font-bold text-white tracking-tight">Response Time</h3>
                <p className="text-xs font-medium text-muted/60 mt-1 uppercase tracking-wider">Latency Trend (ms)</p>
              </div>
              <ResponsiveContainer width="100%" height="75%">
                <AreaChart data={responseTimeData}>
                  <defs>
                    <linearGradient id="colorMsDetail" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsla(210, 40%, 98%, 0.05)" vertical={false} />
                  <XAxis dataKey="time" stroke="hsla(210, 40%, 98%, 0.4)" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                  <YAxis stroke="hsla(210, 40%, 98%, 0.4)" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="glass-panel border-white/10 px-3 py-2 rounded-xl shadow-2xl">
                            <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1">{payload[0].payload.time}</p>
                            <p className="text-sm font-black text-white">{payload[0].value} <span className="text-[10px] text-muted">ms</span></p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area type="monotone" dataKey="ms" stroke="hsl(217, 91%, 60%)" fillOpacity={1} fill="url(#colorMsDetail)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            </section>

            <section className="premium-card h-[330px] p-6">
              <div className="mb-6">
                <h3 className="text-lg font-bold text-white tracking-tight">Requests Per Second</h3>
                <p className="text-xs font-medium text-muted/60 mt-1 uppercase tracking-wider">Throughput (RPS)</p>
              </div>
              <ResponsiveContainer width="100%" height="75%">
                <BarChart data={rpsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsla(210, 40%, 98%, 0.05)" vertical={false} />
                  <XAxis dataKey="time" stroke="hsla(210, 40%, 98%, 0.4)" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                  <YAxis stroke="hsla(210, 40%, 98%, 0.4)" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                  <Tooltip
                    cursor={{ fill: "hsla(210, 40%, 98%, 0.05)", radius: 6 }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="glass-panel border-white/10 px-3 py-2 rounded-xl shadow-2xl">
                            <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1">{payload[0].payload.time}</p>
                            <p className="text-sm font-black text-white">{payload[0].value} <span className="text-[10px] text-muted">rps</span></p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="rps" fill="hsl(258, 89%, 66%)" radius={[6, 6, 0, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </section>
          </div>

          <section className="premium-card p-6">
            <h3 className="mb-6 text-lg font-bold text-white tracking-tight">Status Breakdown</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {statusData.map((item) => (
                <div key={item.name} className="relative overflow-hidden rounded-2xl bg-white/[0.03] border border-white/[0.02] px-5 py-4 group hover:bg-white/[0.06] transition-all">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                    <p className="text-xs font-bold text-muted/60 uppercase tracking-widest">{item.name}</p>
                  </div>
                  <p className="text-2xl font-black text-white">{item.value}<span className="text-sm text-muted/40 ml-1">%</span></p>
                  <div className="absolute -right-2 -bottom-2 h-12 w-12 rounded-full opacity-[0.05] blur-xl" style={{ backgroundColor: item.color }} />
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
};
