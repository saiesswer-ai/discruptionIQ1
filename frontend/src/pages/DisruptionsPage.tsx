import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { SeverityBadge, StatusBadge } from '../components/common/Badge';
import { Drawer } from '../components/common/Drawer';
import {
  Search,
  Filter,
  AlertOctagon,
  ArrowRight,
  Clock,
  Layers,
  Ship,
  Box,
  Zap,
  MapPin,
  Calendar,
  AlertTriangle,
} from 'lucide-react';
import { DisruptionSeverity, DisruptionStatus } from '../types';

export const DisruptionsPage: React.FC = () => {
  const {
    disruptions,
    orders,
    shipments,
    inventory,
    setArenaDisruptionId,
    setActivePage,
    inspectDisruptionId,
    setInspectDisruptionId,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Filtered list
  const filteredDisruptions = disruptions.filter(d => {
    const matchesSearch =
      d.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.carrierOrSupplier.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.location.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesSeverity = severityFilter === 'all' || d.severity === severityFilter;
    const matchesStatus = statusFilter === 'all' || d.status === statusFilter;

    return matchesSearch && matchesSeverity && matchesStatus;
  });

  const inspectedDisruption = disruptions.find(d => d.id === inspectDisruptionId) || null;
  const inspectedOrders = inspectedDisruption
    ? orders.filter(o => o.associatedDisruptionId === inspectedDisruption.id)
    : [];
  const inspectedShipments = inspectedDisruption
    ? shipments.filter(s => inspectedDisruption.linkedShipmentIds.includes(s.id))
    : [];
  const inspectedInventory = inspectedDisruption
    ? inventory.filter(i => inspectedDisruption.affectedSKUs.includes(i.sku))
    : [];

  return (
    <div className="space-y-6">
      {/* Search and Filters Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Search */}
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by ID, carrier, supplier, or port..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-md pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
          />
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Filter className="w-3.5 h-3.5" />
            <span>Severity:</span>
          </div>
          <select
            value={severityFilter}
            onChange={e => setSeverityFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <div className="flex items-center gap-1.5 text-xs text-slate-400 ml-2">
            <span>Status:</span>
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="evaluating">Evaluating</option>
            <option value="mitigating">Mitigating</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
      </div>

      {/* Disruptions Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 font-medium border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Disruption ID</th>
                <th className="py-3 px-4">Event & Location</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Severity</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Detected</th>
                <th className="py-3 px-4 text-right">Delay</th>
                <th className="py-3 px-4 text-right">Orders</th>
                <th className="py-3 px-4 text-right">Est. Impact</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredDisruptions.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-500 font-sans">
                    No disruptions match your active search criteria.
                  </td>
                </tr>
              ) : (
                filteredDisruptions.map(d => (
                  <tr
                    key={d.id}
                    onClick={() => setInspectDisruptionId(d.id)}
                    className="hover:bg-slate-850/60 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 font-semibold text-white">
                      {d.id}
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-200 max-w-xs">
                      <div className="font-semibold text-slate-100 truncate">{d.title}</div>
                      <div className="text-[11px] text-slate-400 truncate flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                        <span className="truncate">{d.location}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-300">
                      {d.typeLabel}
                    </td>
                    <td className="py-3 px-4 font-sans">
                      <SeverityBadge severity={d.severity} />
                    </td>
                    <td className="py-3 px-4 font-sans">
                      <StatusBadge status={d.status} />
                    </td>
                    <td className="py-3 px-4 text-right text-slate-400">
                      {new Date(d.detectedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}{' '}
                      {new Date(d.detectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-amber-400 font-bold">+{d.delayHours}h</span>
                    </td>
                    <td className="py-3 px-4 text-right text-slate-200">
                      {d.affectedOrderCount}
                    </td>
                    <td className="py-3 px-4 text-right text-rose-400 font-semibold">
                      ${(d.estimatedFinancialImpactUSD / 1000).toFixed(0)}k
                    </td>
                    <td className="py-3 px-4 text-center font-sans" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setInspectDisruptionId(d.id)}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] transition-colors"
                        >
                          Detail
                        </button>
                        <button
                          onClick={() => {
                            setArenaDisruptionId(d.id);
                            setActivePage('recovery-arena');
                          }}
                          className="px-2 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-[11px] font-medium flex items-center gap-1 transition-colors"
                        >
                          <Zap className="w-3 h-3" />
                          <span>Arena</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Disruption Deep Inspection Drawer */}
      <Drawer
        isOpen={!!inspectDisruptionId}
        onClose={() => setInspectDisruptionId(null)}
        title={inspectedDisruption?.title || 'Disruption Forensics'}
        subtitle={`ID: ${inspectedDisruption?.id} · Detected ${inspectedDisruption ? new Date(inspectedDisruption.detectedAt).toUTCString() : ''}`}
        width="2xl"
        footer={
          inspectedDisruption && (
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-400 font-mono">
                Financial Impact: <span className="text-rose-400 font-bold">${inspectedDisruption.estimatedFinancialImpactUSD.toLocaleString()}</span>
              </div>
              <button
                onClick={() => {
                  setArenaDisruptionId(inspectedDisruption.id);
                  setInspectDisruptionId(null);
                  setActivePage('recovery-arena');
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-md text-xs font-semibold transition-colors"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Launch Recovery Arena for this Event</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        }
      >
        {inspectedDisruption && (
          <div className="space-y-6 text-xs">
            {/* Quick Summary Pill Strip */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded">
                <span className="text-[10px] text-slate-400 uppercase block">Severity & Status</span>
                <div className="flex items-center gap-1.5 mt-1">
                  <SeverityBadge severity={inspectedDisruption.severity} />
                  <StatusBadge status={inspectedDisruption.status} />
                </div>
              </div>
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded">
                <span className="text-[10px] text-slate-400 uppercase block">Delay Duration</span>
                <div className="text-base font-bold text-amber-400 font-mono mt-1">
                  +{inspectedDisruption.delayHours} Hours
                </div>
              </div>
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded">
                <span className="text-[10px] text-slate-400 uppercase block">Affected Orders</span>
                <div className="text-base font-bold text-white font-mono mt-1">
                  {inspectedDisruption.affectedOrderCount} Customer SLAs
                </div>
              </div>
            </div>

            {/* Root Cause & Forensic Summary */}
            <div className="p-4 bg-slate-950/90 border border-slate-800 rounded-lg space-y-2">
              <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Root Cause Analysis</h4>
              <p className="text-slate-300 leading-relaxed">{inspectedDisruption.summary}</p>
              <div className="text-slate-400 pt-2 border-t border-slate-800/80 font-mono text-[11px]">
                <strong className="text-slate-300">Carrier / Node:</strong> {inspectedDisruption.carrierOrSupplier} · {inspectedDisruption.location}
              </div>
            </div>

            {/* Event Payload Data */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Ingested Telemetry Payload (EDI / AIS)</h4>
              <pre className="p-3.5 bg-slate-950 rounded-lg border border-slate-800 text-[11px] font-mono text-purple-200 overflow-x-auto leading-relaxed">
                {JSON.stringify(inspectedDisruption.eventPayload, null, 2)}
              </pre>
            </div>

            {/* Timeline of Events */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Timeline of Ingested Milestones</h4>
              <div className="border-l-2 border-slate-800 pl-4 space-y-4">
                {inspectedDisruption.timeline.map((evt, idx) => (
                  <div key={evt.id} className="relative">
                    <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-purple-500 ring-4 ring-slate-900" />
                    <div className="text-slate-400 font-mono text-[10px]">
                      {new Date(evt.timestamp).toUTCString()} · Source: {evt.source}
                    </div>
                    <div className="text-xs font-semibold text-white mt-0.5">{evt.title}</div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{evt.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Affected Shipments */}
            {inspectedShipments.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Associated In-Transit Shipments</h4>
                <div className="space-y-2">
                  {inspectedShipments.map(s => (
                    <div key={s.id} className="p-3 bg-slate-950 border border-slate-800 rounded flex items-center justify-between">
                      <div>
                        <div className="font-mono font-semibold text-white">{s.trackingNumber} ({s.carrierName})</div>
                        <div className="text-[11px] text-slate-400">{s.origin} → {s.destination}</div>
                      </div>
                      <div className="text-right font-mono">
                        <span className="text-amber-400 font-bold">+{s.delayHours}h delay</span>
                        <div className="text-[10px] text-slate-500">{s.transportMode} Cargo</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Affected Orders */}
            {inspectedOrders.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Directly Affected Customer Orders ({inspectedOrders.length})</h4>
                <div className="divide-y divide-slate-800 border border-slate-800 rounded bg-slate-950 max-h-52 overflow-y-auto">
                  {inspectedOrders.map(o => (
                    <div key={o.id} className="p-2.5 flex items-center justify-between">
                      <div>
                        <span className="font-mono text-white font-semibold">{o.id}</span> ·{' '}
                        <span className="text-slate-300">{o.customerName}</span>
                        <div className="text-[10px] text-slate-500 font-mono">
                          SKU: {o.sku} · Qty: {o.quantityUnits} units
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <span className="text-rose-400 font-semibold">{o.hoursUntilBreach}h until breach</span>
                        <div className="text-[10px] text-slate-400">${o.orderValueUSD.toLocaleString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Linked Inventory Depletion */}
            {inspectedInventory.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Linked Hub Inventory Positions</h4>
                <div className="grid grid-cols-2 gap-2">
                  {inspectedInventory.map(inv => (
                    <div key={inv.id} className="p-2.5 bg-slate-950 border border-slate-800 rounded">
                      <div className="font-semibold text-white">{inv.warehouseName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">SKU: {inv.sku}</div>
                      <div className="mt-1 flex justify-between font-mono text-[11px]">
                        <span>Avail: <strong className="text-white">{inv.availableUnits}</strong></span>
                        <span>Reserved: <strong className="text-amber-400">{inv.reservedUnits}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
};
