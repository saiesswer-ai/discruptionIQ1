import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { SeverityBadge, StatusBadge } from '../components/common/Badge';
import { Drawer } from '../components/common/Drawer';
import { Modal } from '../components/common/Modal';
import { api } from '../services/httpApi';
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
  PlusCircle,
  Edit,
  FileText,
  Building,
  CheckCircle2,
} from 'lucide-react';
import { DisruptionSeverity, DisruptionStatus, DisruptionType } from '../types';

export const DisruptionsPage: React.FC = () => {
  const {
    disruptions,
    orders,
    shipments,
    inventory,
    suppliers,
    currentUser,
    setArenaDisruptionId,
    setActivePage,
    inspectDisruptionId,
    setInspectDisruptionId,
    showToast,
    refreshData,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modals state
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Report Disruption Form State
  const [formType, setFormType] = useState<string>('carrier_delay');
  const [formTitle, setFormTitle] = useState('');
  const [formSeverity, setFormSeverity] = useState<DisruptionSeverity>('high');
  const [formStatus, setFormStatus] = useState<DisruptionStatus>('active');
  const [formLocation, setFormLocation] = useState('');
  const [formCarrierOrSupplier, setFormCarrierOrSupplier] = useState('');
  const [formDelayHours, setFormDelayHours] = useState<number>(24);
  const [formEstimatedFinancialImpactUSD, setFormEstimatedFinancialImpactUSD] = useState<number>(50000);
  const [formSummary, setFormSummary] = useState('');
  const [formRootCause, setFormRootCause] = useState('');
  const [formSource, setFormSource] = useState('Manual Operations Report');
  const [formShipmentId, setFormShipmentId] = useState('');
  const [formSupplierId, setFormSupplierId] = useState('');
  const [formWarehouseId, setFormWarehouseId] = useState('');
  const [formSelectedSKUs, setFormSelectedSKUs] = useState<string[]>([]);
  const [formSelectedOrders, setFormSelectedOrders] = useState<string[]>([]);
  const [formEvidence, setFormEvidence] = useState('');
  const [formReason, setFormReason] = useState('Manual operational incident report');

  // Update Disruption Form State
  const [updateStatus, setUpdateStatus] = useState<string>('active');
  const [updateSeverity, setUpdateSeverity] = useState<string>('high');
  const [updateDelayHours, setUpdateDelayHours] = useState<number>(0);
  const [updateFinancialImpact, setUpdateFinancialImpact] = useState<number>(0);
  const [updateEvidenceNotes, setUpdateEvidenceNotes] = useState('');
  const [updateReason, setUpdateReason] = useState('');

  // Newly created disruption confirmation banner
  const [recentCreatedDisruptionId, setRecentCreatedDisruptionId] = useState<string | null>(null);

  // Distinct SKUs and Hubs available for selectors
  const allSKUs = Array.from(new Set(inventory.map(i => i.sku)));
  const allWarehouses = Array.from(new Set(inventory.map(i => i.warehouseId)));

  const canWrite =
    currentUser?.permissions?.includes('disruptions:write') ||
    currentUser?.role === 'administrator' ||
    currentUser?.role === 'admin' ||
    currentUser?.role === 'operations_analyst' ||
    currentUser?.role === 'supply_chain_manager';

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

  const handleOpenReportModal = () => {
    setFormType('carrier_delay');
    setFormTitle('');
    setFormSeverity('high');
    setFormStatus('active');
    setFormLocation('');
    setFormCarrierOrSupplier('');
    setFormDelayHours(24);
    setFormEstimatedFinancialImpactUSD(50000);
    setFormSummary('');
    setFormRootCause('');
    setFormShipmentId('');
    setFormSupplierId('');
    setFormWarehouseId('');
    setFormSelectedSKUs([]);
    setFormSelectedOrders([]);
    setFormEvidence('');
    setFormReason('Manual operational incident report');
    setIsReportModalOpen(true);
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formLocation.trim() || !formSummary.trim()) {
      showToast('Please fill out all required fields (Title, Location, Summary).', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        type: formType,
        title: formTitle.trim(),
        severity: formSeverity,
        status: formStatus,
        location: formLocation.trim(),
        carrierOrSupplier: formCarrierOrSupplier.trim(),
        delayHours: Number(formDelayHours) || 0,
        estimatedFinancialImpactUSD: Number(formEstimatedFinancialImpactUSD) || 0,
        summary: formSummary.trim(),
        rootCause: formRootCause.trim() || 'Manual operational report',
        source: formSource.trim() || `User: ${currentUser?.name || 'analyst'}`,
        affectedShipmentId: formShipmentId || undefined,
        affectedSupplierId: formSupplierId || undefined,
        affectedWarehouseId: formWarehouseId || undefined,
        affectedSKUs: formSelectedSKUs.length > 0 ? formSelectedSKUs : undefined,
        affectedOrderIds: formSelectedOrders.length > 0 ? formSelectedOrders : undefined,
        evidence: formEvidence.trim()
          ? [{ kind: 'manual_evidence', facts: { notes: formEvidence.trim(), reporter: currentUser?.name } }]
          : undefined,
        reason: formReason.trim(),
        idempotencyKey: crypto.randomUUID(),
      };

      const created = await api.createDisruption(payload);
      showToast(`Disruption ${created.id} successfully registered!`, 'success');
      setIsReportModalOpen(false);
      setRecentCreatedDisruptionId(created.id);
      await refreshData();
    } catch (err: any) {
      showToast(err.message || 'Failed to report disruption.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenUpdateModal = () => {
    if (!inspectedDisruption) return;
    setUpdateStatus(inspectedDisruption.status);
    setUpdateSeverity(inspectedDisruption.severity);
    setUpdateDelayHours(inspectedDisruption.delayHours);
    setUpdateFinancialImpact(inspectedDisruption.estimatedFinancialImpactUSD);
    setUpdateEvidenceNotes('');
    setUpdateReason('Operational status update');
    setIsUpdateModalOpen(true);
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectedDisruption) return;
    if (!updateReason.trim()) {
      showToast('Please provide an operational reason for updating the disruption.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: any = {
        status: updateStatus,
        severity: updateSeverity,
        delayHours: Number(updateDelayHours),
        estimatedFinancialImpactUSD: Number(updateFinancialImpact),
        reason: updateReason.trim(),
      };
      if (updateEvidenceNotes.trim()) {
        payload.newEvidence = {
          kind: 'operational_update',
          facts: { notes: updateEvidenceNotes.trim(), updatedBy: currentUser?.name },
        };
        payload.newTimelineEvent = {
          id: `evt-${Date.now()}`,
          timestamp: new Date().toISOString(),
          title: `Status set to ${updateStatus.toUpperCase()}`,
          description: updateEvidenceNotes.trim(),
          source: `User: ${currentUser?.name || 'analyst'}`,
        };
      }

      const updated = await api.updateDisruption(inspectedDisruption.id, payload);
      showToast(`Disruption ${updated.id} updated successfully.`, 'success');
      setIsUpdateModalOpen(false);
      await refreshData();
    } catch (err: any) {
      showToast(err.message || 'Failed to update disruption.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner when a disruption was just reported */}
      {recentCreatedDisruptionId && (
        <div className="p-4 bg-purple-950/70 border border-purple-700/80 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-purple-400 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-white">
                Disruption {recentCreatedDisruptionId} created and persisted to database.
              </div>
              <div className="text-xs text-purple-300">
                You can now inspect its affected entities or launch the Recovery Arena to generate candidate plans.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setArenaDisruptionId(recentCreatedDisruptionId);
                setActivePage('recovery-arena');
              }}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Open in Recovery Arena</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setRecentCreatedDisruptionId(null)}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Search and Action Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by ID, carrier, supplier, or port..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-md pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
          />
        </div>

        {/* Filter Controls & Action Button */}
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
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

          <div className="flex items-center gap-1.5 text-xs text-slate-400 ml-1">
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

          {canWrite && (
            <button
              onClick={handleOpenReportModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-md text-xs font-semibold transition-colors shadow-xs ml-auto sm:ml-2"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>+ Report Disruption</span>
            </button>
          )}
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
            <div className="flex items-center justify-between w-full">
              <div className="text-xs text-slate-400 font-mono">
                Financial Impact: <span className="text-rose-400 font-bold">${inspectedDisruption.estimatedFinancialImpactUSD.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2">
                {canWrite && (
                  <button
                    onClick={handleOpenUpdateModal}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md text-xs font-semibold transition-colors border border-slate-700"
                  >
                    <Edit className="w-3.5 h-3.5 text-purple-400" />
                    <span>Update Status/Evidence</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    setArenaDisruptionId(inspectedDisruption.id);
                    setInspectDisruptionId(null);
                    setActivePage('recovery-arena');
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-md text-xs font-semibold transition-colors"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Launch Recovery Arena</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
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
              <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Ingested Telemetry / Evidence Payload</h4>
              <pre className="p-3.5 bg-slate-950 rounded-lg border border-slate-800 text-[11px] font-mono text-purple-200 overflow-x-auto leading-relaxed">
                {JSON.stringify(inspectedDisruption.eventPayload, null, 2)}
              </pre>
            </div>

            {/* Timeline of Events */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Timeline of Ingested Milestones</h4>
              <div className="border-l-2 border-slate-800 pl-4 space-y-4">
                {inspectedDisruption.timeline?.map((evt, idx) => (
                  <div key={evt.id || idx} className="relative">
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
                <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Associated In-Transit Shipments ({inspectedShipments.length})</h4>
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

      {/* Modal 1: + Report Disruption */}
      <Modal
        isOpen={isReportModalOpen}
        onClose={() => !isSubmitting && setIsReportModalOpen(false)}
        title="Report New Operational Disruption"
        subtitle="Record an operational delay or bottleneck with deterministic entity linkage"
        maxWidth="2xl"
      >
        <form onSubmit={handleReportSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Disruption Event Type *</label>
              <select
                value={formType}
                onChange={e => setFormType(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
              >
                <option value="carrier_delay">Carrier Delay / Vessel Bottleneck</option>
                <option value="supplier_delay">Supplier Production / Dispatch Delay</option>
                <option value="supplier_outage">Supplier Facility Outage</option>
                <option value="inventory_shortage">Inventory Stockout / Buffer Depletion</option>
                <option value="port_congestion">Port Congestion / Berth Hold</option>
                <option value="customs_hold">Customs Inspection / Regulatory Hold</option>
                <option value="weather_disruption">Severe Weather Disruption</option>
                <option value="labor_strike">Terminal / Logistics Labor Strike</option>
                <option value="warehouse_freeze">Warehouse Operations Freeze</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Severity *</label>
              <select
                value={formSeverity}
                onChange={e => setFormSeverity(e.target.value as DisruptionSeverity)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
              >
                <option value="critical">Critical (&gt;= 48h / major shortage)</option>
                <option value="high">High (&gt;= 24h delay)</option>
                <option value="medium">Medium (standard delay)</option>
                <option value="low">Low (minor impact)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Event Title *</label>
            <input
              type="text"
              required
              placeholder="e.g. Berth hold and crane maintenance at Port of Antwerp"
              value={formTitle}
              onChange={e => setFormTitle(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Location / Node *</label>
              <input
                type="text"
                required
                placeholder="e.g. Antwerp Gateway Quay 1700, Belgium"
                value={formLocation}
                onChange={e => setFormLocation(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Carrier or Supplier Involved</label>
              <input
                type="text"
                placeholder="e.g. Maersk Line / Apex Micro Devices"
                value={formCarrierOrSupplier}
                onChange={e => setFormCarrierOrSupplier(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Estimated Delay (Hours)</label>
              <input
                type="number"
                min="0"
                value={formDelayHours}
                onChange={e => setFormDelayHours(parseInt(e.target.value) || 0)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Estimated Financial Impact (USD)</label>
              <input
                type="number"
                min="0"
                step="1000"
                value={formEstimatedFinancialImpactUSD}
                onChange={e => setFormEstimatedFinancialImpactUSD(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Forensic Summary / Description *</label>
            <textarea
              required
              rows={3}
              placeholder="Detailed operational breakdown of the disruption event, bottlenecks, and expected cargo impact..."
              value={formSummary}
              onChange={e => setFormSummary(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2.5 text-slate-200 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-md space-y-3">
            <h4 className="text-[11px] font-semibold text-white uppercase tracking-wider">Entity Association (Optional)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-400 text-[10px] uppercase mb-1">Link Shipment</label>
                <select
                  value={formShipmentId}
                  onChange={e => setFormShipmentId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-slate-200 font-mono"
                >
                  <option value="">None / Manual</option>
                  {shipments.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.trackingNumber} ({s.carrierName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 text-[10px] uppercase mb-1">Link Supplier</label>
                <select
                  value={formSupplierId}
                  onChange={e => setFormSupplierId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-slate-200 font-mono"
                >
                  <option value="">None / Manual</option>
                  {suppliers.map(sup => (
                    <option key={sup.id} value={sup.id}>
                      {sup.name} ({sup.tier})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 text-[10px] uppercase mb-1">Destination Hub</label>
                <select
                  value={formWarehouseId}
                  onChange={e => setFormWarehouseId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-slate-200 font-mono"
                >
                  <option value="">None / Multiple</option>
                  {allWarehouses.map(wh => (
                    <option key={wh} value={wh}>
                      {wh}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div>
                <label className="block text-slate-400 text-[10px] uppercase mb-1">Affected SKUs</label>
                <select
                  multiple
                  value={formSelectedSKUs}
                  onChange={e =>
                    setFormSelectedSKUs(Array.from(e.target.selectedOptions, opt => opt.value))
                  }
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-slate-200 font-mono h-20"
                >
                  {allSKUs.map(sku => (
                    <option key={sku} value={sku}>
                      {sku}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-500">Ctrl/Cmd+click to select multiple</span>
              </div>

              <div>
                <label className="block text-slate-400 text-[10px] uppercase mb-1">Affected Orders</label>
                <select
                  multiple
                  value={formSelectedOrders}
                  onChange={e =>
                    setFormSelectedOrders(Array.from(e.target.selectedOptions, opt => opt.value))
                  }
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-slate-200 font-mono h-20"
                >
                  {orders.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.id} - {o.customerName} ({o.sku})
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-500">Ctrl/Cmd+click to select multiple</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Supporting Evidence / AIS Facts</label>
            <input
              type="text"
              placeholder="e.g. Telemetry speed drop verified via satellite feed; ETA confirmed by terminal manager"
              value={formEvidence}
              onChange={e => setFormEvidence(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Audit Justification / Reason *</label>
            <input
              type="text"
              required
              value={formReason}
              onChange={e => setFormReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setIsReportModalOpen(false)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-semibold transition-colors flex items-center gap-1.5"
            >
              {isSubmitting ? 'Submitting...' : 'Register Disruption'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal 2: Update Disruption Status & Evidence */}
      <Modal
        isOpen={isUpdateModalOpen}
        onClose={() => !isSubmitting && setIsUpdateModalOpen(false)}
        title={`Update Disruption: ${inspectedDisruption?.id}`}
        subtitle="Modify operational state, duration, and append audited forensic notes"
        maxWidth="lg"
      >
        <form onSubmit={handleUpdateSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Status</label>
              <select
                value={updateStatus}
                onChange={e => setUpdateStatus(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
              >
                <option value="active">Active</option>
                <option value="evaluating">Evaluating</option>
                <option value="mitigating">Mitigating</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">Severity</label>
              <select
                value={updateSeverity}
                onChange={e => setUpdateSeverity(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
              >
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Delay Duration (Hours)</label>
              <input
                type="number"
                min="0"
                value={updateDelayHours}
                onChange={e => setUpdateDelayHours(parseInt(e.target.value) || 0)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">Financial Impact (USD)</label>
              <input
                type="number"
                min="0"
                value={updateFinancialImpact}
                onChange={e => setUpdateFinancialImpact(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">New Forensic / Evidence Note</label>
            <textarea
              rows={2}
              placeholder="e.g. Quay operations resumed; vessel berth confirmed for 14:00 tomorrow."
              value={updateEvidenceNotes}
              onChange={e => setUpdateEvidenceNotes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2.5 text-slate-200 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Operational Reason for Change *</label>
            <input
              type="text"
              required
              placeholder="Reason logged in permanent audit trail"
              value={updateReason}
              onChange={e => setUpdateReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setIsUpdateModalOpen(false)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-semibold transition-colors flex items-center gap-1.5"
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
