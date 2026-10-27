import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Drawer } from '../components/common/Drawer';
import { AuditLogEntry } from '../types';
import {
  History,
  Search,
  Filter,
  ShieldCheck,
  FileText,
  User,
  Calendar,
  Layers,
  ArrowRight,
} from 'lucide-react';

export const AuditTrailPage: React.FC = () => {
  const { auditLogs, inspectAuditEntry, setInspectAuditEntry } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [entityFilter, setEntityFilter] = useState('all');

  const filteredLogs = auditLogs.filter(log => {
    const matchesSearch =
      log.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.actorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.entityId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.reason.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesEntity = entityFilter === 'all' || log.entityType === entityFilter;

    return matchesSearch && matchesEntity;
  });

  return (
    <div className="space-y-6">
      {/* Immutability Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Cryptographically Timestamped Immutable Audit Trail</h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Compliant with ISO 28000 and enterprise supply chain governance standards. Historical records cannot be modified or pruned.
          </p>
        </div>
        <div className="px-3 py-1 bg-slate-950 border border-slate-800 rounded font-mono text-xs text-slate-400">
          Total Logged Operations: <strong className="text-white">{auditLogs.length}</strong>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search audit ID, actor, entity, action..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-md pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
          />
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Filter Entity:</span>
          <select
            value={entityFilter}
            onChange={e => setEntityFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
          >
            <option value="all">All Entities</option>
            <option value="RecoveryPlan">RecoveryPlan</option>
            <option value="Approval">Approval</option>
            <option value="Disruption">Disruption</option>
            <option value="Simulation">Simulation</option>
            <option value="Order">Order</option>
          </select>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 font-medium border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Audit ID</th>
                <th className="py-3 px-4">Timestamp (UTC)</th>
                <th className="py-3 px-4">Actor & Role</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Entity Ref</th>
                <th className="py-3 px-4">Operational Reason & Summary</th>
                <th className="py-3 px-4 text-center">Payload</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredLogs.map(entry => (
                <tr
                  key={entry.id}
                  onClick={() => setInspectAuditEntry(entry)}
                  className="hover:bg-slate-850/60 cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4 font-semibold text-white">
                    {entry.id}
                  </td>
                  <td className="py-3 px-4 text-slate-400 text-[11px]">
                    {new Date(entry.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}{' '}
                    {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </td>
                  <td className="py-3 px-4 font-sans text-slate-200">
                    <div className="font-semibold text-slate-100">{entry.actorName}</div>
                    <div className="text-[10px] text-slate-500 font-mono capitalize">{entry.actorRole.replace('_', ' ')}</div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[11px] text-purple-300 font-semibold">
                      {entry.action}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-300 text-[11px]">
                    <div>{entry.entityType}</div>
                    <div className="text-[10px] text-slate-500">{entry.entityId}</div>
                  </td>
                  <td className="py-3 px-4 font-sans text-slate-300 text-[11px] max-w-sm truncate">
                    <div>{entry.reason}</div>
                    {entry.changesSummary && (
                      <div className="text-[10px] text-slate-500 truncate">{entry.changesSummary}</div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center font-sans" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => setInspectAuditEntry(entry)}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] transition-colors"
                    >
                      Inspect Diff
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit Detail Drawer */}
      <Drawer
        isOpen={!!inspectAuditEntry}
        onClose={() => setInspectAuditEntry(null)}
        title={`Audit Evidence: ${inspectAuditEntry?.id}`}
        subtitle={`Action: ${inspectAuditEntry?.action} · Recorded ${inspectAuditEntry ? new Date(inspectAuditEntry.timestamp).toUTCString() : ''}`}
        width="lg"
      >
        {inspectAuditEntry && (
          <div className="space-y-5 text-xs">
            <div className="p-3.5 bg-slate-950 rounded-lg border border-slate-800 space-y-2 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">Recorded Actor:</span>
                <strong className="text-white">{inspectAuditEntry.actorName} ({inspectAuditEntry.actorRole})</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Target Entity:</span>
                <strong className="text-purple-300">{inspectAuditEntry.entityType} ({inspectAuditEntry.entityId})</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Action Code:</span>
                <strong className="text-sky-400">{inspectAuditEntry.action}</strong>
              </div>
            </div>

            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Context & Justification</h4>
              <p className="p-3 bg-slate-950 rounded border border-slate-800 text-slate-200 leading-relaxed font-sans">
                {inspectAuditEntry.reason}
              </p>
            </div>

            {inspectAuditEntry.changesSummary && (
              <div className="space-y-1">
                <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Changes Summary</h4>
                <p className="p-3 bg-slate-950 rounded border border-slate-800 text-slate-300 font-mono">
                  {inspectAuditEntry.changesSummary}
                </p>
              </div>
            )}

            {/* Before / After Payloads */}
            {inspectAuditEntry.diffPayload && (
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-white uppercase tracking-wider">State Transition Diff</h4>
                <div className="grid grid-cols-2 gap-3 font-mono">
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-1 uppercase">Before State</span>
                    <pre className="p-3 bg-slate-950 rounded border border-slate-800 text-[11px] text-rose-300 overflow-x-auto">
                      {JSON.stringify(inspectAuditEntry.diffPayload.before || {}, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-1 uppercase">After State</span>
                    <pre className="p-3 bg-slate-950 rounded border border-slate-800 text-[11px] text-emerald-300 overflow-x-auto">
                      {JSON.stringify(inspectAuditEntry.diffPayload.after || {}, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
};
