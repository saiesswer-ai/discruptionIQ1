import React from 'react';
import { useApp } from '../context/AppContext';
import {
  Settings,
  UserCheck,
  RotateCcw,
  Zap,
  Database,
  Sliders,
  Check,
  Shield,
  Server,
  Layers,
  ArrowRight,
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const {
    currentUser,
    resetSimulation,
    setArenaDisruptionId,
    setActivePage,
    disruptions,
    orders,
    inventory,
    shipments,
    auditLogs,
  } = useApp();

  const handleScenarioSelect = (disruptionId: string) => {
    setArenaDisruptionId(disruptionId);
    setActivePage('recovery-arena');
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Persona & Role Configuration */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <div className="flex items-center gap-2.5 mb-2">
          <UserCheck className="w-4 h-4 text-sky-400" />
          <h3 className="text-sm font-semibold text-white">Active Simulation Persona & Authorization Authority</h3>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Your role and permissions come from the authenticated backend session. Backend authorization remains the security boundary.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[currentUser].map(u => {
            const isSelected = u.role === currentUser.role;
            return (
              <div
                key={u.role}
                aria-disabled="true"
                className={`p-3.5 rounded-lg border transition-all duration-150 cursor-pointer flex items-start justify-between gap-3 ${
                  isSelected
                    ? 'bg-purple-950/40 border-purple-500 shadow-sm'
                    : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-8 h-8 rounded flex items-center justify-center font-bold text-xs shrink-0 ${
                      isSelected
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {u.avatarInitials}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      <span>{u.name}</span>
                      {isSelected && (
                        <span className="text-[10px] font-mono text-purple-400 uppercase font-semibold">Active</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-300 font-medium mt-0.5">{u.roleLabel}</div>
                    <div className="text-[11px] text-slate-400 font-mono mt-1">
                      {u.approvalLimitUSD > 0
                        ? `Signing Authority: Up to $${u.approvalLimitUSD.toLocaleString()} USD`
                        : 'Authority: Simulation & Proposals Only'}
                    </div>
                  </div>
                </div>

                {isSelected && <Check className="w-4 h-4 text-purple-400 shrink-0 mt-1" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Available Demo Scenarios */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <div className="flex items-center gap-2.5 mb-2">
          <Zap className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-white">Realistic Pre-Configured Disruption Scenarios</h3>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Open any disruption currently returned by the backend in the Recovery Arena.
        </p>

        <div className="space-y-3">
          {disruptions.map(sc => (
            <div
              key={sc.id}
              className="p-4 bg-slate-950/70 border border-slate-800 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-700 transition-colors"
            >
              <div>
                <h4 className="text-xs font-bold text-white">{sc.title}</h4>
                <p className="text-xs text-slate-300 mt-0.5">{sc.id} · {sc.status} · {sc.severity}</p>
                <p className="text-[11px] text-slate-500 mt-1">{sc.summary}</p>
              </div>

              <button
                onClick={() => handleScenarioSelect(sc.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-semibold transition-colors shrink-0"
              >
                <span>Load in Arena</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Simulation Controls & Reset Environment */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <div className="flex items-center gap-2.5 mb-2">
          <Sliders className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-white">Simulation Environment Controls</h3>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Recovery actions are persisted by the connected backend. Reset is only available when the backend exposes an administrative reset endpoint.
        </p>

        <div className="p-4 bg-slate-950 rounded-lg border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-white">Revert Sandbox to Baseline State</div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Clears custom approvals, executed states, and resets all disruptions and orders to initial ingested condition.
            </div>
          </div>
          <button
            onClick={resetSimulation}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-md text-xs font-semibold transition-colors shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>Reset Simulation State</span>
          </button>
        </div>
      </div>

      {/* Backend & Architecture Specifications */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <div className="flex items-center gap-2.5 mb-2">
          <Server className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-white">Architecture & API Service Layer</h3>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          DisruptionIQ uses a typed FastAPI client configured with VITE_API_BASE_URL and a bearer-token session.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs mb-4">
          <div className="p-3 bg-slate-950 border border-slate-800 rounded">
            <span className="text-[10px] text-slate-500 uppercase block">Active Disruptions</span>
            <span className="text-base font-bold text-white">{disruptions.length}</span>
          </div>
          <div className="p-3 bg-slate-950 border border-slate-800 rounded">
            <span className="text-[10px] text-slate-500 uppercase block">Monitored Orders</span>
            <span className="text-base font-bold text-white">{orders.length}</span>
          </div>
          <div className="p-3 bg-slate-950 border border-slate-800 rounded">
            <span className="text-[10px] text-slate-500 uppercase block">Hub Inventory Rows</span>
            <span className="text-base font-bold text-white">{inventory.length}</span>
          </div>
          <div className="p-3 bg-slate-950 border border-slate-800 rounded">
            <span className="text-[10px] text-slate-500 uppercase block">Immutable Audits</span>
            <span className="text-base font-bold text-white">{auditLogs.length}</span>
          </div>
        </div>

        <div className="p-3 bg-slate-950 border border-slate-800 rounded font-mono text-[11px] text-slate-400 space-y-1">
          <div><strong className="text-slate-300">Service Implementation:</strong> FastAPI HTTP client (live server state)</div>
          <div><strong className="text-slate-300">Connected endpoints:</strong> /api/v1/disruptions, /api/v1/recovery, /api/v1/approvals, /api/v1/audit</div>
          <div><strong className="text-slate-300">Notifications / Reset:</strong> not exposed by the current backend</div>
        </div>
      </div>
    </div>
  );
};
