import {
  User,
  Bell,
  Shield,
  CreditCard,
  Mail,
  Monitor,
  Save,
  Trash2,
  Lock
} from 'lucide-react';

export const SettingsPage = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Settings</h1>
        <p className="text-slate-400">Manage your account preferences, billing, and security.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Navigation */}
        <div className="md:col-span-1 space-y-2">
          {[
            { icon: User, label: 'Profile' },
            { icon: Bell, label: 'Notifications' },
            { icon: Shield, label: 'Security' },
            { icon: CreditCard, label: 'Billing' },
            { icon: Monitor, label: 'Appearance' },
          ].map((item, i) => (
            <button
              key={item.label}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${i === 0 ? 'bg-primary/20 text-primary border border-primary/20' : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="md:col-span-3 space-y-6">
          <div className="glass p-8 rounded-2xl space-y-8">
            <section className="space-y-6">
              <h3 className="text-lg font-bold text-white border-b border-white/5 pb-4">Personal Information</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Full Name</label>
                  <input
                    type="text"
                    defaultValue="Dev Engineer"
                    className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 px-4 text-sm focus:border-primary/50"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                    <input
                      type="email"
                      defaultValue="dev@loadpulse.com"
                      className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:border-primary/50"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Bio</label>
                <textarea
                  placeholder="Tell us about yourself..."
                  className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 px-4 text-sm focus:border-primary/50 h-32 resize-none"
                />
              </div>
            </section>

            <section className="space-y-6 pt-4">
              <h3 className="text-lg font-bold text-white border-b border-white/5 pb-4 flex items-center gap-2">
                <Lock className="w-5 h-5 text-secondary-purple" /> Security
              </h3>
              <button className="glass px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-white/5 transition-colors">
                Change Password
              </button>
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl">
                <div>
                  <p className="text-sm font-bold text-white">Two-Factor Authentication</p>
                  <p className="text-xs text-slate-500">Secure your account with 2FA.</p>
                </div>
                <button className="text-primary font-bold text-sm">Enable</button>
              </div>
            </section>

            <section className="space-y-6 pt-4">
              <h3 className="text-lg font-bold text-rose-500 border-b border-rose-500/10 pb-4">Danger Zone</h3>
              <div className="flex items-center justify-between p-4 border border-rose-500/20 rounded-2xl bg-rose-500/5">
                <div>
                  <p className="text-sm font-bold text-white">Delete Account</p>
                  <p className="text-xs text-slate-500 text-rose-500/60">Permanently remove all your data.</p>
                </div>
                <button className="bg-rose-500/10 text-rose-500 p-2.5 rounded-xl hover:bg-rose-500/20 transition-colors">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </section>

            <div className="pt-8 flex justify-end">
              <button className="bg-primary hover:bg-primary/90 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-primary/20">
                <Save className="w-5 h-5" /> Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
