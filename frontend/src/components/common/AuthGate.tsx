import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';

export const AuthGate: React.FC = () => {
  const { authState, login } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null);
    try { await login(username, password); } catch (cause: any) { setError(cause.message || 'Sign-in failed.'); } finally { setBusy(false); }
  };
  const quickSignIn = async (demoUsername: string, demoPassword: string) => {
    setBusy(true); setError(null);
    try { await login(demoUsername, demoPassword); } catch (cause: any) { setError(cause.message || 'Sign-in failed.'); } finally { setBusy(false); }
  };
  if (authState === 'checking') return <div className="min-h-screen bg-slate-950 text-slate-300 grid place-items-center text-sm">Checking secure session…</div>;
  const personas = [
    { label: 'Director (Elena Rostova)', description: 'Approvals > $50k', username: 'procurement', password: 'DisruptionIQ#2026!Procure' },
    { label: 'Manager (Marcus Vance)', description: 'Approvals ≤ $50k, Dispatch', username: 'manager', password: 'DisruptionIQ#2026!Manager' },
    { label: 'Analyst (Priya Narang)', description: 'Simulation & Proposals', username: 'analyst', password: 'DisruptionIQ#2026!Analyst' },
    { label: 'Warehouse (Soren Lindqvist)', description: 'Inventory Execution', username: 'warehouse', password: 'DisruptionIQ#2026!Warehouse' },
  ];

  return <div className="min-h-full w-full bg-slate-950 text-slate-100 px-2 py-14">
    <div className="w-full max-w-[516px] space-y-5">
      <form onSubmit={submit} className="bg-slate-900/90 border border-slate-800 rounded-xl p-7 space-y-5 shadow-xl shadow-slate-950/20">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-white"><span className="w-3 h-3 rounded-full bg-purple-500" />DisruptionIQ — Recovery Arena</h1>
          <p className="text-sm text-sky-300/80 mt-2">Enterprise supply chain disruption management &amp; recovery.</p>
        </div>
        {authState === 'expired' && <p className="text-xs text-amber-300 bg-amber-950/40 border border-amber-800 rounded-md p-2.5">Your session expired. Sign in again to continue.</p>}
        {error && <p className="text-xs text-rose-300 bg-rose-950/40 border border-rose-800 rounded-md p-2.5">{error}</p>}
        <label className="block text-sm text-slate-100">Username<input required autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2.5 text-sm outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500" /></label>
        <label className="block text-sm text-slate-100">Password<input required type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2.5 text-sm outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500" /></label>
        <button disabled={busy} className="w-full bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 disabled:opacity-60 rounded-md py-2.5 text-sm font-semibold transition-colors">{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>

      <section className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl shadow-slate-950/20">
        <h2 className="text-sm font-semibold text-slate-100 mb-3">Quick Sign-in (Demo Personas):</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {personas.map(persona => <button key={persona.username} type="button" disabled={busy} onClick={() => quickSignIn(persona.username, persona.password)} className="text-left rounded-md border border-slate-700/80 bg-slate-950/70 px-3 py-3 hover:border-purple-600 hover:bg-purple-950/20 disabled:opacity-60 transition-colors">
            <div className="text-sm font-medium text-fuchsia-300">{persona.label}</div>
            <div className="text-xs text-sky-300/80 mt-1">{persona.description}</div>
          </button>)}
        </div>
      </section>
    </div>
  </div>;
};
