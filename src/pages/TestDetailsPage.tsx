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
            <section className="glass-panel h-[330px] rounded-2xl p-6">
              <h3 className="mb-1 text-lg font-bold text-white">Response Time</h3>
              <p className="mb-4 text-sm text-slate-400">Latency trend for this specific test.</p>
              <ResponsiveContainer width="100%" height="78%">
                <AreaChart data={responseTimeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="time" stroke="#8aa0c3" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                  <YAxis stroke="#8aa0c3" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0a1020", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "12px" }}
                    itemStyle={{ color: "#e8f0ff", fontSize: "12px" }}
                  />
                  <Area type="monotone" dataKey="ms" stroke="#3B82F6" fillOpacity={0.25} fill="#3B82F6" strokeWidth={2.5} />
                </AreaChart>
              </ResponsiveContainer>
            </section>

            <section className="glass-panel h-[330px] rounded-2xl p-6">
              <h3 className="mb-1 text-lg font-bold text-white">Requests Per Second</h3>
              <p className="mb-4 text-sm text-slate-400">Traffic handled each second in this test.</p>
              <ResponsiveContainer width="100%" height="78%">
                <BarChart data={rpsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="time" stroke="#8aa0c3" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                  <YAxis stroke="#8aa0c3" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.05)" }}
                    contentStyle={{ backgroundColor: "#0a1020", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "12px" }}
                    itemStyle={{ color: "#e8f0ff", fontSize: "12px" }}
                  />
                  <Bar dataKey="rps" fill="#8B5CF6" radius={[8, 8, 0, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </section>
          </div>

          <section className="glass-panel rounded-2xl p-6">
            <h3 className="mb-4 text-lg font-bold text-white">Status Breakdown</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {statusData.map((item) => (
                <div key={item.name} className="rounded-xl bg-white/[0.04] px-4 py-3">
                  <p className="text-sm text-slate-300">{item.name}</p>
                  <p className="mt-1 text-xl font-bold text-white">{item.value}%</p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
};
