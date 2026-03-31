import { useState } from 'react';
import {
    Play,
    Code2,
    Settings2,
    Globe,
    Clock,
    Users,
    ChevronDown,
    Save,
    Terminal,
} from 'lucide-react';
import { motion } from 'framer-motion';

const defaultK6Script = `import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  vus: 50,
  duration: '5m',
};

export default function () {
  const res = http.get('https://api.loadpulse.dev/v1/health');
  check(res, {
    'status was 200': (r) => r.status === 200,
  });
  sleep(1);
}`;

export const NewTestPage = () => {
    const [script, setScript] = useState(defaultK6Script);
    const [isRunning, setIsRunning] = useState(false);

    const handleRunTest = () => {
        setIsRunning(true);
        window.setTimeout(() => setIsRunning(false), 2200);
    };

    return (
        <div className="mx-auto max-w-6xl space-y-8 pb-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight text-white">New Test</h1>
                    <p className="text-sm text-muted md:text-base">
                        Configure URL, load profile, and custom k6 script for your next performance run.
                    </p>
                </div>

                <div className="flex gap-3">
                    <button className="glass-panel flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors hover:bg-white/10">
                        <Save className="h-4 w-4" /> Save Draft
                    </button>
                    <button className="glass-panel flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors hover:bg-white/10">
                        <Terminal className="h-4 w-4" /> CLI Instructions
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-1">
                    <div className="glass-panel space-y-5 rounded-2xl p-6">
                        <div className="mb-2 flex items-center gap-2 border-b border-white/10 pb-4">
                            <Settings2 className="h-5 w-5 text-primary" />
                            <h3 className="font-bold">Test Configuration</h3>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wider text-muted">URL</label>
                            <div className="relative">
                                <Globe className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                                <input
                                    type="text"
                                    placeholder="https://api.loadpulse.dev/v1/health"
                                    className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-10 pr-4 text-sm text-slate-100 outline-none transition-colors focus:border-primary/50"
                                />
                            </div>
                        </div>

                        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Load Configuration</p>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted">VU</label>
                                    <div className="relative">
                                        <Users className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                                        <input
                                            type="number"
                                            defaultValue={50}
                                            className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-10 pr-4 text-sm text-slate-100 outline-none focus:border-primary/50"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted">Duration</label>
                                    <div className="relative">
                                        <Clock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                                        <input
                                            type="text"
                                            defaultValue="5m"
                                            className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-10 pr-4 text-sm text-slate-100 outline-none focus:border-primary/50"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">Test Region</label>
                                <button className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-white/[0.04]">
                                    US-East (N. Virginia)
                                    <ChevronDown className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    </div>

                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        disabled={isRunning}
                        onClick={handleRunTest}
                        className={`flex w-full items-center justify-center gap-2 rounded-2xl border py-4 font-bold transition-all shadow-[0_0_32px_rgba(59,130,246,0.45)] ${isRunning
                                ? 'cursor-not-allowed border-transparent bg-slate-700 text-slate-200'
                                : 'animate-pulse-glow border-primary/40 bg-primary text-white hover:bg-primary/90'
                            }`}
                    >
                        {isRunning ? (
                            <div className="flex items-center gap-3">
                                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                                Initializing...
                            </div>
                        ) : (
                            <>
                                <Play className="h-5 w-5 fill-current" />
                                Run Test
                            </>
                        )}
                    </motion.button>
                </div>

                <div className="lg:col-span-2">
                    <div className="glass-panel flex h-full min-h-[520px] flex-col overflow-hidden rounded-2xl">
                        <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.04] px-6 py-4">
                            <div className="flex items-center gap-2">
                                <Code2 className="h-5 w-5 text-secondary-purple" />
                                <h3 className="font-bold">k6 Script Editor</h3>
                            </div>
                            <div className="flex gap-2">
                                <div className="h-3 w-3 rounded-full bg-rose-500/50" />
                                <div className="h-3 w-3 rounded-full bg-amber-500/50" />
                                <div className="h-3 w-3 rounded-full bg-emerald-500/50" />
                            </div>
                        </div>

                        <div className="relative flex-1 bg-black/45">
                            <textarea
                                value={script}
                                onChange={(e) => setScript(e.target.value)}
                                className="absolute inset-0 h-full w-full resize-none border-none bg-transparent p-6 font-mono text-sm leading-6 text-slate-300 outline-none"
                                spellCheck={false}
                            />
                            <div className="absolute left-1 top-6 h-[calc(100%-48px)] w-px bg-white/5" />
                        </div>

                        <div className="flex items-center justify-between border-t border-white/10 bg-white/[0.04] px-6 py-3 text-xs text-slate-500">
                            <span>ES6 Module Support</span>
                            <div className="flex gap-4">
                                <span className="flex items-center gap-1">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Syntax OK
                                </span>
                                <span>Line: 12</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
