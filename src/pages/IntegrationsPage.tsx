import {
  Puzzle,
  Code,
  MessageSquare,
  Check,
  ExternalLink,
  ShieldCheck,
  Cloud,
  Webhook
} from 'lucide-react';
import { motion } from 'framer-motion';

const integrations = [
  {
    id: 'github',
    name: 'GitHub Actions',
    desc: 'Trigger performance tests directly from your CI/CD pipeline.',
    icon: Code,
    connected: true,
    category: 'CI/CD'
  },
  {
    id: 'slack',
    name: 'Slack',
    desc: 'Receive real-time alerts and report summaries in your channels.',
    icon: MessageSquare,
    connected: false,
    category: 'Notifications'
  },
  {
    id: 'aws',
    name: 'AWS CloudWatch',
    desc: 'Sync metrics and infrastructure data for deeper analysis.',
    icon: Cloud,
    connected: false,
    category: 'Cloud'
  },
  {
    id: 'webhooks',
    name: 'Webhooks',
    desc: 'Custom HTTP callbacks for external system integration.',
    icon: Webhook,
    connected: true,
    category: 'Custom'
  },
];

export const IntegrationsPage = () => {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Integrations</h1>
          <p className="text-slate-400">Connect LoadPulse with your existing workflow and tools.</p>
        </div>
        <button className="glass px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/5 transition-colors flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" /> API Keys
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {integrations.map((item, index) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="glass p-8 rounded-2xl group hover:border-primary/50 transition-colors relative overflow-hidden"
          >
            <div className="flex items-start justify-between relative z-10">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-slate-300 group-hover:text-primary transition-colors">
                  <item.icon className="w-8 h-8" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-bold text-white">{item.name}</h3>
                    {item.connected && (
                      <span className="bg-emerald-500/10 text-emerald-500 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Check className="w-3 h-3" /> Connected
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 mt-1">{item.category}</p>
                </div>
              </div>
            </div>

            <p className="text-slate-400 mt-6 leading-relaxed relative z-10">
              {item.desc}
            </p>

            <div className="mt-8 flex gap-3 relative z-10">
              {item.connected ? (
                <>
                  <button className="glass px-4 py-2 rounded-xl text-xs font-bold hover:bg-white/5 transition-colors">
                    Configure
                  </button>
                  <button className="text-xs font-bold text-rose-500 px-4 py-2 hover:bg-rose-500/10 rounded-xl transition-colors">
                    Disconnect
                  </button>
                </>
              ) : (
                <button className="bg-primary hover:bg-primary/90 text-white px-6 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg shadow-primary/20">
                  Connect Integration
                </button>
              )}
              <button className="p-2.5 glass rounded-xl text-slate-500 hover:text-white transition-colors">
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>

            {/* Background Icon Watermark */}
            <div className="absolute -bottom-6 -right-6 opacity-5 group-hover:opacity-10 transition-opacity">
              <item.icon size={120} />
            </div>
          </motion.div>
        ))}
      </div>

      <div className="glass rounded-2xl p-12 text-center relative overflow-hidden">
        <div className="relative z-10">
          <Puzzle className="w-12 h-12 text-primary mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-white mb-2">Missing something?</h2>
          <p className="text-slate-400 mb-8 max-w-sm mx-auto">
            Our team is constantly building new integrations. Let us know what tools you use.
          </p>
          <button className="glass px-8 py-3 rounded-xl font-bold hover:bg-white/5 transition-colors">
            Request an Integration
          </button>
        </div>
      </div>
    </div>
  );
};
