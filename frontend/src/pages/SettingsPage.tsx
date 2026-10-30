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

  const SEVERITY_COLOR: Record<string, string> = {
    critical: 'bg-[#E85D68]/10 text-[#c0293a] border-[#E85D68]/30',
    high:     'bg-[#F5C451]/10 text-[#8f6d14] border-[#F5C451]/30',
    medium:   'bg-[#7185FF]/10 text-[#4557d9] border-[#7185FF]/30',
    low:      'bg-[#84E344]/15 text-[#1b6b0c] border-[#84E344]/30',
  };

  const STATUS_COLOR: Record<string, string> = {
    active:     'bg-[#E85D68]/10 text-[#c0293a] border-[#E85D68]/30',
    monitoring: 'bg-[#F5C451]/10 text-[#8f6d14] border-[#F5C451]/30',
    resolved:   'bg-[#84E344]/15 text-[#1b6b0c] border-[#84E344]/30',
    contained:  'bg-[#7185FF]/10 text-[#4557d9] border-[#7185FF]/30',
  };

  const metrics = [
    { label: 'Active Disruptions', value: disruptions.length, icon: <Zap className="w-4 h-4" /> },
    { label: 'Monitored Orders',   value: orders.length,      icon: <Layers className="w-4 h-4" /> },
    { label: 'Inventory Rows',     value: inventory.length,   icon: <Database className="w-4 h-4" /> },
    { label: 'Immutable Audits',   value: auditLogs.length,   icon: <Shield className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      {/* ── Persona & Role Card ───────────────────────────────── */}
      <div className="card-light p-5">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-xl bg-[#171917] flex items-center justify-center shrink-0">
            <UserCheck className="w-4 h-4 text-[#C8FF32]" />
          </div>
          <h2 className="text-sm font-semibold text-[#171917]">
            Active Simulation Persona &amp; Authorization Authority
          </h2>
        </div>
        <p className="text-xs text-[#777B76] mb-4 ml-10">
          Your role and permissions come from the authenticated backend session. Backend
          authorization remains the security boundary.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[currentUser].map(u => {
            const isSelected = u.role === currentUser.role;
            return (
              <div
                key={u.role}
                aria-disabled="true"
                className={`p-4 rounded-2xl border transition-all duration-150 flex items-start justify-between gap-3 ${
                  isSelected
                    ? 'bg-[#C8FF32]/8 border-[#C8FF32]/40 shadow-sm'
                    : 'bg-[#F8F9F6] border-[#E8EAE4]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                      isSelected
                        ? 'bg-[#171917] text-[#C8FF32]'
                        : 'bg-[#F0F1EE] text-[#777B76]'
                    }`}
                  >
                    {u.avatarInitials}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#171917] flex items-center gap-2">
                      <span>{u.name}</span>
                      {isSelected && (
                        <span className="text-[10px] font-mono text-[#3d6600] bg-[#C8FF32]/20 border border-[#C8FF32]/40 px-1.5 py-0.5 rounded uppercase font-semibold">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[#777B76] font-medium mt-0.5">{u.roleLabel}</div>
                    <div className="text-[11px] text-[#A0A39D] font-mono mt-1">
                      {u.approvalLimitUSD > 0
                        ? `Signing Authority: Up to $${u.approvalLimitUSD.toLocaleString()} USD`
                        : 'Authority: Simulation & Proposals Only'}
                    </div>
                  </div>
                </div>

                {isSelected && <Check className="w-4 h-4 text-[#3d6600] shrink-0 mt-1" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Demo Disruption Scenarios ─────────────────────────── */}
      <div className="card-light p-5">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-xl bg-[#171917] flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4 text-[#C8FF32]" />
          </div>
          <h2 className="text-sm font-semibold text-[#171917]">
            Realistic Pre-Configured Disruption Scenarios
          </h2>
        </div>
        <p className="text-xs text-[#777B76] mb-4 ml-10">
          Open any disruption currently returned by the backend in the Recovery Arena.
        </p>

        <div className="space-y-2.5">
          {disruptions.map(sc => (
            <div
              key={sc.id}
              className="p-4 bg-[#F8F9F6] border border-[#E8EAE4] rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-[#C8FF32]/40 transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <h4 className="text-xs font-bold text-[#171917]">{sc.title}</h4>
                  <span
                    className={`px-1.5 py-0.5 rounded-md border font-mono text-[10px] font-semibold ${
                      STATUS_COLOR[sc.status?.toLowerCase()] || 'bg-[#F0F1EE] text-[#777B76] border-[#E8EAE4]'
                    }`}
                  >
                    {sc.status}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded-md border font-mono text-[10px] font-semibold ${
                      SEVERITY_COLOR[sc.severity?.toLowerCase()] || 'bg-[#F0F1EE] text-[#777B76] border-[#E8EAE4]'
                    }`}
                  >
                    {sc.severity}
                  </span>
                </div>
                <p className="text-[11px] text-[#A0A39D] font-mono">{sc.id}</p>
                <p className="text-xs text-[#777B76] mt-1">{sc.summary}</p>
              </div>

              <button
                onClick={() => handleScenarioSelect(sc.id)}
                className="btn-lime text-xs flex items-center gap-1.5 shrink-0"
              >
                <span>Load in Arena</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {disruptions.length === 0 && (
            <div className="py-8 text-center text-xs text-[#A0A39D]">
              No disruptions returned by the backend yet.
            </div>
          )}
        </div>
      </div>

      {/* ── Simulation Environment Controls ───────────────────── */}
      <div className="card-light p-5">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-xl bg-[#171917] flex items-center justify-center shrink-0">
            <Sliders className="w-4 h-4 text-[#F5C451]" />
          </div>
          <h2 className="text-sm font-semibold text-[#171917]">Simulation Environment Controls</h2>
        </div>
        <p className="text-xs text-[#777B76] mb-4 ml-10">
          Recovery actions are persisted by the connected backend. Reset is only available when the
          backend exposes an administrative reset endpoint.
        </p>

        <div className="p-4 bg-[#F8F9F6] rounded-2xl border border-[#E8EAE4] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-[#171917]">Revert Sandbox to Baseline State</div>
            <div className="text-[11px] text-[#777B76] mt-0.5">
              Clears custom approvals, executed states, and resets all disruptions and orders to
              initial ingested condition.
            </div>
          </div>
          <button
            onClick={resetSimulation}
            className="btn-secondary text-xs flex items-center gap-2 shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#F5C451]" />
            <span>Reset Simulation State</span>
          </button>
        </div>
      </div>

      {/* ── Architecture & API Layer ──────────────────────────── */}
      <div className="card-light p-5">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-xl bg-[#171917] flex items-center justify-center shrink-0">
            <Server className="w-4 h-4 text-[#C8FF32]" />
          </div>
          <h2 className="text-sm font-semibold text-[#171917]">Architecture &amp; API Service Layer</h2>
        </div>
        <p className="text-xs text-[#777B76] mb-5 ml-10">
          DisruptionIQ uses a typed FastAPI client configured with VITE_API_BASE_URL and a
          bearer-token session.
        </p>

        {/* Metric tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {metrics.map(m => (
            <div key={m.label} className="p-3.5 bg-[#F8F9F6] border border-[#E8EAE4] rounded-2xl">
              <div className="flex items-center gap-1.5 text-[#A0A39D] mb-1.5">
                {m.icon}
                <span className="font-mono text-[10px] uppercase">{m.label}</span>
              </div>
              <span className="text-2xl font-bold text-[#171917] font-mono">{m.value}</span>
            </div>
          ))}
        </div>

        {/* API details */}
        <div className="p-4 bg-[#F0F1EE] rounded-2xl border border-[#E8EAE4] font-mono text-[11px] text-[#777B76] space-y-1.5">
          <div>
            <strong className="text-[#171917]">Service Implementation:</strong> FastAPI HTTP client
            (live server state)
          </div>
          <div>
            <strong className="text-[#171917]">Connected endpoints:</strong>{' '}
            /api/v1/disruptions, /api/v1/recovery, /api/v1/approvals, /api/v1/audit
          </div>
          <div>
            <strong className="text-[#171917]">Notifications / Reset:</strong> not exposed by the
            current backend
          </div>
        </div>
      </div>
    </div>
  );
};
