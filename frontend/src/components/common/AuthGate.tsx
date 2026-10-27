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
  if (authState === 'checking') return <div className="min-h-screen bg-slate-950 text-slate-300 grid place-items-center text-sm">Checking secure session…</div>;
  return <div className="min-h-screen bg-slate-950 text-slate-100 grid place-items-center p-6">
    <form onSubmit={submit} className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-4 shadow-xl">
      <div><h1 className="text-lg font-semibold">DisruptionIQ</h1><p className="text-xs text-slate-400 mt-1">Sign in to load live operational data.</p></div>
      {authState === 'expired' && <p className="text-xs text-amber-300 bg-amber-950/40 border border-amber-800 rounded p-2">Your session expired. Sign in again to continue.</p>}
      {error && <p className="text-xs text-rose-300 bg-rose-950/40 border border-rose-800 rounded p-2">{error}</p>}
      <label className="block text-xs text-slate-300">Username<input required value={username} onChange={e => setUsername(e.target.value)} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm" /></label>
      <label className="block text-xs text-slate-300">Password<input required type="password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm" /></label>
      <button disabled={busy} className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-60 rounded py-2 text-sm font-semibold">{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  </div>;
};
