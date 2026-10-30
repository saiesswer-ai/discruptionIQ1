import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ArrowRight, Lock } from 'lucide-react';

export const AuthGate: React.FC = () => {
  const { authState, login } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
    } catch (cause: any) {
      setError(cause.message || 'Invalid username or password.');
    } finally {
      setBusy(false);
    }
  };

  const quickSignIn = async (demoUsername: string, demoPassword: string) => {
    setBusy(true);
    setError(null);
    try {
      await login(demoUsername, demoPassword);
    } catch (cause: any) {
      setError(cause.message || 'Invalid username or password.');
    } finally {
      setBusy(false);
    }
  };

  if (authState === 'checking') {
    return (
      <div className="flex-1 h-full bg-[#F4F1FD] flex items-center justify-center p-6">
        <div className="flex items-center gap-3 bg-white px-5 py-3 rounded-2xl border border-[#E8EAE4] shadow-sm">
          <div className="w-3.5 h-3.5 rounded-full bg-[#C8FF32] border border-[#080908] animate-ping" />
          <span className="text-xs font-semibold text-[#171917]">Validating secure session…</span>
        </div>
      </div>
    );
  }

  const personas = [
    {
      label: 'Director (Elena Rostova)',
      role: 'Procurement Approver',
      badge: '$500k',
      username: 'procurement',
      password: 'DisruptionIQ#2026!Procure',
    },
    {
      label: 'Manager (Marcus Vance)',
      role: 'Supply Chain Manager',
      badge: '$50k',
      username: 'manager',
      password: 'DisruptionIQ#2026!Manager',
    },
    {
      label: 'Analyst (Priya Narang)',
      role: 'Risk Analyst',
      badge: 'Proposal Only',
      username: 'analyst',
      password: 'DisruptionIQ#2026!Analyst',
    },
    {
      label: 'Warehouse (Soren Lindqvist)',
      role: 'Facility Supervisor',
      badge: '$10k',
      username: 'warehouse',
      password: 'DisruptionIQ#2026!Warehouse',
    },
  ];

  return (
    <div className="flex-1 h-full overflow-y-auto bg-gradient-to-br from-[#F5F2FE] via-[#F1EEFA] to-[#EDF2FE] flex items-center justify-center p-4 sm:p-6 lg:p-8 selection:bg-[#C8FF32] selection:text-[#080908]">
      <div className="w-full max-w-[500px] space-y-4 my-auto">
        {/* Main Pitch-Black Login Card */}
        <div className="bg-[#0B0C0B] border border-[#202320] rounded-3xl p-7 text-[#F7F9F4] relative overflow-hidden shadow-[0_25px_60px_-15px_rgba(8,9,8,0.5),0_0_40px_-5px_rgba(200,255,50,0.12)]">
          {/* Subtle neon lime ambient glow at bottom */}
          <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 w-72 h-32 rounded-full bg-[#C8FF32]/15 blur-3xl pointer-events-none" />

          {/* Badge: InsightOS Design Engine · DisruptionIQ */}
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#151815] border border-[#272B27] text-[11px] font-mono text-[#A0A69D]">
              <span className="w-2 h-2 rounded-full bg-[#C8FF32] shadow-[0_0_6px_#C8FF32]" />
              <span>InsightOS Design Engine · DisruptionIQ</span>
            </span>
          </div>

          <h1 className="text-2xl font-bold text-white tracking-tight">Recovery Arena</h1>
          <p className="text-xs text-[#8A9188] mt-1.5 leading-relaxed">
            Next-generation autonomous supply chain risk intelligence &amp; multi-tier mitigation platform.
          </p>

          {authState === 'expired' && (
            <div className="text-xs text-[#E5A83B] bg-[#221A0C] border border-[#443314] rounded-xl p-3 mt-4 flex items-center gap-2">
              <Lock className="w-4 h-4 shrink-0" />
              <span>Your session expired. Please sign in again to continue.</span>
            </div>
          )}

          {error && (
            <div className="text-xs text-[#FF8595] bg-[#2A1115] border border-[#4D1C24] rounded-xl p-3 mt-4">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4 mt-6 relative z-10">
            <div>
              <label className="block text-[10px] font-mono font-semibold tracking-wider text-[#8A9188] uppercase mb-1.5">
                Username / Email
              </label>
              <input
                required
                autoComplete="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="e.g. manager"
                className="w-full bg-[#050605] border border-[#222622] text-white placeholder:text-[#525750] rounded-xl px-4 py-3 text-xs outline-none focus:border-[#C8FF32] focus:ring-1 focus:ring-[#C8FF32] transition-all"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono font-semibold tracking-wider text-[#8A9188] uppercase mb-1.5">
                Password
              </label>
              <input
                required
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-[#050605] border border-[#222622] text-white placeholder:text-[#525750] rounded-xl px-4 py-3 text-xs outline-none focus:border-[#C8FF32] focus:ring-1 focus:ring-[#C8FF32] transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full mt-2 bg-[#C8FF32] hover:bg-[#DFFF83] text-[#080908] font-bold py-3.5 text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_4px_16px_rgba(200,255,50,0.25)] disabled:opacity-50"
            >
              <span>{busy ? 'Authenticating…' : 'Sign in to Console'}</span>
              {!busy && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>
        </div>

        {/* Quick Demo Personas (Clean White Card) */}
        <section className="bg-white border border-[#E8EAE4] rounded-3xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3.5 px-0.5">
            <h2 className="text-[11px] font-bold text-[#171917] uppercase tracking-wider font-mono">
              Quick Demo Personas
            </h2>
            <span className="text-[11px] text-[#8A9188]">1-click instant login</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {personas.map(persona => (
              <button
                key={persona.username}
                type="button"
                disabled={busy}
                onClick={() => quickSignIn(persona.username, persona.password)}
                className="text-left rounded-2xl border border-[#E8EAE4] bg-[#FBFBFA] hover:bg-white hover:border-[#C8FF32] hover:shadow-sm p-3.5 transition-all duration-150 group"
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-xs font-bold text-[#171917] truncate">{persona.label}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#F0F1EE] text-[#777B76] font-semibold shrink-0">
                    {persona.badge}
                  </span>
                </div>
                <div className="text-[11px] text-[#777B76] mt-1 font-medium">
                  {persona.role}
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
