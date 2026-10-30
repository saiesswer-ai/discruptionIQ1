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
  Hash,
} from 'lucide-react';

const ACTION_COLOR: Record<string, string> = {
  APPROVE:   'bg-[#84E344]/15 text-[#1b6b0c] border-[#84E344]/30',
  REJECT:    'bg-[#E85D68]/10 text-[#c0293a] border-[#E85D68]/30',
  SUBMIT:    'bg-[#7185FF]/10 text-[#4557d9] border-[#7185FF]/30',
  ESCALATE:  'bg-[#F5C451]/10 text-[#8f6d14] border-[#F5C451]/30',
  CREATE:    'bg-[#C8FF32]/15 text-[#3d6600] border-[#C8FF32]/40',
  UPDATE:    'bg-[#F0F1EE] text-[#777B76] border-[#E8EAE4]',
  DELETE:    'bg-[#E85D68]/10 text-[#c0293a] border-[#E85D68]/30',
  SIMULATE:  'bg-[#7185FF]/10 text-[#4557d9] border-[#7185FF]/30',
  EXECUTE:   'bg-[#C8FF32]/15 text-[#3d6600] border-[#C8FF32]/40',
};

function getActionColor(action: string): string {
  for (const key of Object.keys(ACTION_COLOR)) {
    if (action.toUpperCase().includes(key)) return ACTION_COLOR[key];
  }
  return 'bg-[#F0F1EE] text-[#777B76] border-[#E8EAE4]';
}

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
    <div className="space-y-5">
      {/* Immutability Banner */}
      <div className="card-light p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#171917] flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4 text-[#C8FF32]" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-[#171917]">
              Cryptographically Timestamped Immutable Audit Trail
            </h1>
            <p className="text-xs text-[#777B76] mt-0.5">
              Compliant with ISO 28000 and enterprise supply chain governance standards. Historical
              records cannot be modified or pruned.
            </p>
          </div>
        </div>
        <div className="shrink-0 px-4 py-2 bg-[#F0F1EE] border border-[#E8EAE4] rounded-xl font-mono text-xs text-[#777B76]">
          Total Logged Operations:{' '}
          <strong className="text-[#171917] font-semibold">{auditLogs.length}</strong>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="card-light p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-[#A0A39D] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search audit ID, actor, entity, action..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="input-insight w-full pl-9 pr-3 py-2 text-xs"
          />
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-[#A0A39D] flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Entity:
          </span>
          <select
            value={entityFilter}
            onChange={e => setEntityFilter(e.target.value)}
            className="input-insight px-2.5 py-2 text-xs"
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
      <div className="card-light overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8F9F6] border-b border-[#E8EAE4]">
              <tr>
                <th className="py-3 px-4 font-mono text-[10px] uppercase font-semibold text-[#777B76]">
                  Audit ID
                </th>
                <th className="py-3 px-4 font-mono text-[10px] uppercase font-semibold text-[#777B76]">
                  Timestamp (UTC)
                </th>
                <th className="py-3 px-4 font-mono text-[10px] uppercase font-semibold text-[#777B76]">
                  Actor &amp; Role
                </th>
                <th className="py-3 px-4 font-mono text-[10px] uppercase font-semibold text-[#777B76]">
                  Action
                </th>
                <th className="py-3 px-4 font-mono text-[10px] uppercase font-semibold text-[#777B76]">
                  Entity Ref
                </th>
                <th className="py-3 px-4 font-mono text-[10px] uppercase font-semibold text-[#777B76]">
                  Reason &amp; Summary
                </th>
                <th className="py-3 px-4 text-center font-mono text-[10px] uppercase font-semibold text-[#777B76]">
                  Payload
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8EAE4]">
              {filteredLogs.map(entry => (
                <tr
                  key={entry.id}
                  onClick={() => setInspectAuditEntry(entry)}
                  className="hover:bg-[#F8F9F6] cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4 font-mono font-semibold text-[#171917] text-[11px]">
                    <span className="flex items-center gap-1">
                      <Hash className="w-3 h-3 text-[#A0A39D]" />
                      {entry.id}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-[#777B76] text-[11px]">
                    <div>
                      {new Date(entry.timestamp).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>
                    <div className="text-[#A0A39D]">
                      {new Date(entry.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-xs font-semibold text-[#171917]">{entry.actorName}</div>
                    <div className="text-[10px] text-[#A0A39D] font-mono capitalize mt-0.5">
                      {entry.actorRole.replace('_', ' ')}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 rounded-md border font-mono text-[10px] font-semibold ${getActionColor(
                        entry.action
                      )}`}
                    >
                      {entry.action}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-[11px]">
                    <div className="text-[#171917] font-medium">{entry.entityType}</div>
                    <div className="text-[10px] text-[#A0A39D] font-mono mt-0.5">
                      {entry.entityId}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-[#777B76] text-[11px] max-w-xs">
                    <div className="truncate">{entry.reason}</div>
                    {entry.changesSummary && (
                      <div className="text-[10px] text-[#A0A39D] truncate mt-0.5 font-mono">
                        {entry.changesSummary}
                      </div>
                    )}
                  </td>
                  <td
                    className="py-3 px-4 text-center"
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      onClick={() => setInspectAuditEntry(entry)}
                      className="px-2.5 py-1.5 bg-[#F0F1EE] hover:bg-[#E8EAE4] text-[#171917] border border-[#E8EAE4] rounded-xl text-[11px] font-medium transition-colors"
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}

              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <History className="w-7 h-7 text-[#A0A39D] mx-auto mb-2" />
                    <p className="text-xs font-medium text-[#777B76]">No audit entries match your filters.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit Detail Drawer */}
      <Drawer
        isOpen={!!inspectAuditEntry}
        onClose={() => setInspectAuditEntry(null)}
        title={`Audit Evidence: ${inspectAuditEntry?.id}`}
        subtitle={`Action: ${inspectAuditEntry?.action} · Recorded ${
          inspectAuditEntry ? new Date(inspectAuditEntry.timestamp).toUTCString() : ''
        }`}
        width="lg"
      >
        {inspectAuditEntry && (
          <div className="space-y-5 text-xs">
            {/* Identity row */}
            <div className="card-light p-4 space-y-2.5 font-mono text-[11px]">
              <div className="flex justify-between items-center">
                <span className="text-[#777B76]">Recorded Actor:</span>
                <strong className="text-[#171917]">
                  {inspectAuditEntry.actorName} ({inspectAuditEntry.actorRole})
                </strong>
              </div>
              <div className="h-px bg-[#E8EAE4]" />
              <div className="flex justify-between items-center">
                <span className="text-[#777B76]">Target Entity:</span>
                <strong className="text-[#7185FF]">
                  {inspectAuditEntry.entityType} ({inspectAuditEntry.entityId})
                </strong>
              </div>
              <div className="h-px bg-[#E8EAE4]" />
              <div className="flex justify-between items-center">
                <span className="text-[#777B76]">Action Code:</span>
                <span
                  className={`px-2 py-0.5 rounded-md border font-semibold ${getActionColor(
                    inspectAuditEntry.action
                  )}`}
                >
                  {inspectAuditEntry.action}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <h4 className="text-[10px] font-semibold text-[#A0A39D] uppercase tracking-wider">
                Context &amp; Justification
              </h4>
              <p className="p-3.5 bg-[#F8F9F6] rounded-xl border border-[#E8EAE4] text-[#171917] leading-relaxed">
                {inspectAuditEntry.reason}
              </p>
            </div>

            {inspectAuditEntry.changesSummary && (
              <div className="space-y-1.5">
                <h4 className="text-[10px] font-semibold text-[#A0A39D] uppercase tracking-wider">
                  Changes Summary
                </h4>
                <p className="p-3.5 bg-[#F8F9F6] rounded-xl border border-[#E8EAE4] text-[#777B76] font-mono text-[11px]">
                  {inspectAuditEntry.changesSummary}
                </p>
              </div>
            )}

            {/* Before / After Payloads */}
            {inspectAuditEntry.diffPayload && (
              <div className="space-y-2.5">
                <h4 className="text-[10px] font-semibold text-[#A0A39D] uppercase tracking-wider">
                  State Transition Diff
                </h4>
                <div className="grid grid-cols-2 gap-3 font-mono">
                  <div>
                    <span className="text-[10px] text-[#A0A39D] block mb-1.5 uppercase font-semibold">
                      Before State
                    </span>
                    <pre className="p-3 bg-[#E85D68]/5 rounded-xl border border-[#E85D68]/20 text-[11px] text-[#c0293a] overflow-x-auto">
                      {JSON.stringify(inspectAuditEntry.diffPayload.before || {}, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#A0A39D] block mb-1.5 uppercase font-semibold">
                      After State
                    </span>
                    <pre className="p-3 bg-[#84E344]/5 rounded-xl border border-[#84E344]/20 text-[11px] text-[#1b6b0c] overflow-x-auto">
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
