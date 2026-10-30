import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { LiveLocationModal } from '../components/common/LiveLocationModal';
import { LIVE_TRACKING_TRACKING_IDS } from '../constants/trackingConstants';
import { api } from '../services/httpApi';
import { Shipment, Supplier } from '../types';
import {
  Truck,
  Ship,
  Plane,
  Search,
  Building,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  PlusCircle,
  Edit,
  AlertOctagon,
  MapPin,
} from 'lucide-react';

export const ShipmentsPage: React.FC = () => {
  const { shipments, suppliers, currentUser, showToast, refreshData } = useApp();
  const [activeTab, setActiveTab] = useState<'shipments' | 'suppliers'>('shipments');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [liveTrackingShipment, setLiveTrackingShipment] = useState<Shipment | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Selected entities for updates
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);

  // Register Shipment Form State
  const [formTracking, setFormTracking] = useState('');
  const [formCarrier, setFormCarrier] = useState('');
  const [formMode, setFormMode] = useState('Ocean');
  const [formOrigin, setFormOrigin] = useState('');
  const [formDestination, setFormDestination] = useState('');
  const [formPromisedDate, setFormPromisedDate] = useState('2026-10-30T12:00:00Z');
  const [formEstimatedDate, setFormEstimatedDate] = useState('2026-10-30T12:00:00Z');
  const [formSupplierId, setFormSupplierId] = useState('');
  const [formCargo, setFormCargo] = useState('');
  const [formReason, setFormReason] = useState('New inbound purchase order dispatch');

  // Update Shipment Form State
  const [updateEstimatedDate, setUpdateEstimatedDate] = useState('');
  const [updateStatus, setUpdateStatus] = useState('on_schedule');
  const [updateReason, setUpdateReason] = useState('Carrier milestone update');

  // Supplier Issue Form State
  const [issueType, setIssueType] = useState('lead_time_increase');
  const [issueTitle, setIssueTitle] = useState('');
  const [issueDesc, setIssueDesc] = useState('');
  const [issueSeverity, setIssueSeverity] = useState('medium');
  const [issueDelayDays, setIssueDelayDays] = useState<number>(3);
  const [issueReason, setIssueReason] = useState('Supplier production delay notification');

  const canWriteShipments =
    currentUser?.permissions?.includes('shipments:write') ||
    currentUser?.role === 'administrator' ||
    currentUser?.role === 'admin' ||
    currentUser?.role === 'operations_analyst' ||
    currentUser?.role === 'supply_chain_manager';

  const canWriteSuppliers =
    currentUser?.permissions?.includes('suppliers:write') ||
    currentUser?.role === 'administrator' ||
    currentUser?.role === 'admin' ||
    currentUser?.role === 'operations_analyst' ||
    currentUser?.role === 'procurement_approver' ||
    currentUser?.role === 'supply_chain_manager';

  const filteredShipments = shipments.filter(
    s =>
      s.trackingNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.carrierName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.supplierName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.cargoDescription.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredSuppliers = suppliers.filter(
    sup =>
      sup.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sup.country.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sup.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getTransportIcon = (mode: string) => {
    switch (mode) {
      case 'Ocean':
        return <Ship className="w-3.5 h-3.5 text-sky-400" />;
      case 'Air':
        return <Plane className="w-3.5 h-3.5 text-purple-400" />;
      default:
        return <Truck className="w-3.5 h-3.5 text-emerald-400" />;
    }
  };

  const handleOpenRegister = () => {
    setFormTracking(`TRK-${Date.now().toString().slice(-6)}`);
    setFormCarrier('OceanExpress Line');
    setFormMode('Ocean');
    setFormOrigin('Shanghai Port, China');
    setFormDestination('Rotterdam Gateway, Netherlands');
    const d1 = new Date();
    d1.setDate(d1.getDate() + 5);
    setFormPromisedDate(d1.toISOString());
    setFormEstimatedDate(d1.toISOString());
    setFormSupplierId(suppliers[0]?.id || '');
    setFormCargo('Semiconductor modules [MCU-8800]');
    setFormReason('Manual shipment registration');
    setIsRegisterModalOpen(true);
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTracking.trim() || !formCarrier.trim() || !formOrigin.trim() || !formDestination.trim()) {
      showToast('Please fill out all required shipment fields.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await api.createShipment({
        trackingNumber: formTracking.trim(),
        carrierName: formCarrier.trim(),
        transportMode: formMode,
        origin: formOrigin.trim(),
        destination: formDestination.trim(),
        promisedDeliveryDate: formPromisedDate,
        estimatedDeliveryDate: formEstimatedDate,
        supplierId: formSupplierId,
        cargoDescription: formCargo.trim(),
        reason: formReason.trim(),
      });
      showToast(`Shipment ${created.trackingNumber} successfully registered!`, 'success');
      setIsRegisterModalOpen(false);
      await refreshData();
    } catch (err: any) {
      showToast(err.message || 'Failed to register shipment.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenUpdate = (s: Shipment) => {
    setSelectedShipment(s);
    setUpdateEstimatedDate(s.estimatedDeliveryDate);
    setUpdateStatus(s.status);
    setUpdateReason('Carrier EDI update note');
    setIsUpdateModalOpen(true);
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShipment) return;
    setIsSubmitting(true);
    try {
      const updated = await api.updateShipment(selectedShipment.id, {
        estimatedDeliveryDate: updateEstimatedDate,
        status: updateStatus,
        reason: updateReason.trim() || 'ETA / status adjustment',
      });
      showToast(`Shipment ${updated.trackingNumber} updated.`, 'success');
      setIsUpdateModalOpen(false);
      await refreshData();
    } catch (err: any) {
      showToast(err.message || 'Failed to update shipment.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenIssue = (sup: Supplier) => {
    setSelectedSupplier(sup);
    setIssueType('lead_time_increase');
    setIssueTitle(`Lead time delay on current purchase allocations`);
    setIssueDesc(`Supplier notified operational hold on raw materials.`);
    setIssueSeverity('medium');
    setIssueDelayDays(3);
    setIssueReason('Supplier operational disclosure');
    setIsIssueModalOpen(true);
  };

  const handleIssueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier) return;
    if (!issueTitle.trim() || !issueDesc.trim()) {
      showToast('Please fill in title and description.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.recordSupplierIssue({
        supplierId: selectedSupplier.id,
        issueType,
        title: issueTitle.trim(),
        description: issueDesc.trim(),
        severity: issueSeverity,
        estimatedDelayDays: Number(issueDelayDays) || 0,
        reason: issueReason.trim(),
      });
      showToast(`Issue recorded for supplier ${selectedSupplier.name}.`, 'success');
      setIsIssueModalOpen(false);
      await refreshData();
    } catch (err: any) {
      showToast(err.message || 'Failed to record supplier issue.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tab Switcher & Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Interactive tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
          <button
            onClick={() => setActiveTab('shipments')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'shipments'
                ? 'bg-slate-850 text-white shadow-xs border border-slate-700/60'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Inbound Shipments ({shipments.length})
          </button>
          <button
            onClick={() => setActiveTab('suppliers')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'suppliers'
                ? 'bg-slate-850 text-white shadow-xs border border-slate-700/60'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Suppliers & Performance ({suppliers.length})
          </button>
        </div>

        {/* Search & Actions */}
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={
                activeTab === 'shipments'
                  ? 'Search tracking #, carrier, supplier...'
                  : 'Search supplier name, country, category...'
              }
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-md pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
          </div>

          {activeTab === 'shipments' && canWriteShipments && (
            <button
              onClick={handleOpenRegister}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-md text-xs font-semibold transition-colors shadow-xs"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>+ Register Shipment</span>
            </button>
          )}
        </div>
      </div>

      {/* Tab 1: Shipments */}
      {activeTab === 'shipments' && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 font-medium border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Tracking & Carrier</th>
                  <th className="py-3 px-4">Mode</th>
                  <th className="py-3 px-4">Origin / Destination</th>
                  <th className="py-3 px-4">Cargo Description</th>
                  <th className="py-3 px-4 text-right">Promised SLA</th>
                  <th className="py-3 px-4 text-right">Estimated ETA</th>
                  <th className="py-3 px-4 text-right">Delay</th>
                  <th className="py-3 px-4">Status</th>
                  {canWriteShipments && <th className="py-3 px-4 text-center">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredShipments.map(s => (
                  <tr key={s.id} className="hover:bg-slate-850/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-white">{s.trackingNumber}</div>
                      <div className="text-[11px] text-slate-400 font-sans">{s.carrierName}</div>
                    </td>
                    <td className="py-3 px-4 font-sans">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[11px] text-slate-300 shrink-0">
                          {getTransportIcon(s.transportMode)}
                          <span>{s.transportMode}</span>
                        </span>
                        {LIVE_TRACKING_TRACKING_IDS.includes(s.trackingNumber) && (
                          <button
                            type="button"
                            onClick={() => setLiveTrackingShipment(s)}
                            aria-label={`View live location of ${s.trackingNumber}`}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-950/60 hover:bg-purple-900/80 border border-purple-800/60 hover:border-purple-600 text-[11px] font-medium text-purple-300 hover:text-purple-100 transition-colors cursor-pointer shrink-0"
                          >
                            <MapPin className="w-3 h-3 text-purple-400" />
                            <span>Live Location</span>
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-200 text-[11px]">
                      <div>{s.origin}</div>
                      <div className="text-slate-500">→ {s.destination}</div>
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-300 max-w-xs truncate">
                      {s.cargoDescription}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-400">
                      {new Date(s.promisedDeliveryDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-200">
                      {new Date(s.estimatedDeliveryDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {s.delayHours > 0 ? (
                        <span className="text-amber-400 font-bold">+{s.delayHours}h</span>
                      ) : (
                        <span className="text-emerald-400">On Time</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-sans">
                      {s.status === 'delayed' && <Badge variant="critical">Delayed</Badge>}
                      {s.status === 'customs_hold' && <Badge variant="warning">Customs Hold</Badge>}
                      {s.status === 'on_schedule' && <Badge variant="success">On Schedule</Badge>}
                    </td>
                    {canWriteShipments && (
                      <td className="py-3 px-4 text-center font-sans">
                        <button
                          onClick={() => handleOpenUpdate(s)}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-medium transition-colors"
                        >
                          Update ETA
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Suppliers */}
      {activeTab === 'suppliers' && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 font-medium border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Supplier Name</th>
                  <th className="py-3 px-4">Country & Tier</th>
                  <th className="py-3 px-4">Product Category</th>
                  <th className="py-3 px-4 text-right">Reliability Index</th>
                  <th className="py-3 px-4 text-right">On-Time Rate</th>
                  <th className="py-3 px-4 text-right">Avg. Lead Time</th>
                  <th className="py-3 px-4 text-right">Delays (90d)</th>
                  <th className="py-3 px-4">Contract Status</th>
                  {canWriteSuppliers && <th className="py-3 px-4 text-center">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredSuppliers.map(sup => (
                  <tr key={sup.id} className="hover:bg-slate-850/60 transition-colors">
                    <td className="py-3 px-4 font-sans">
                      <div className="font-semibold text-white">{sup.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{sup.contactEmail}</div>
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-300">
                      <div>{sup.country}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{sup.tier}</div>
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-300">
                      {sup.category}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={`font-bold ${sup.reliabilityScore >= 90 ? 'text-emerald-400' : sup.reliabilityScore >= 80 ? 'text-sky-400' : 'text-amber-400'}`}>
                        {sup.reliabilityScore} / 100
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-slate-200">
                      {sup.onTimeDeliveryRate}%
                    </td>
                    <td className="py-3 px-4 text-right text-slate-300">
                      {sup.averageLeadTimeDays} days
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={`font-semibold ${sup.delayIncidentsLast90d > 2 ? 'text-rose-400' : 'text-slate-400'}`}>
                        {sup.delayIncidentsLast90d} incidents
                      </span>
                    </td>
                    <td className="py-3 px-4 font-sans">
                      {sup.status === 'preferred' && <Badge variant="success">Preferred Vendor</Badge>}
                      {sup.status === 'conditional' && <Badge variant="warning">Conditional / Under Review</Badge>}
                      {sup.status === 'restricted' && <Badge variant="critical">Restricted</Badge>}
                    </td>
                    {canWriteSuppliers && (
                      <td className="py-3 px-4 text-center font-sans">
                        <button
                          onClick={() => handleOpenIssue(sup)}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-medium transition-colors"
                        >
                          Report Issue
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal 1: Register Shipment */}
      <Modal
        isOpen={isRegisterModalOpen}
        onClose={() => !isSubmitting && setIsRegisterModalOpen(false)}
        title="Register Inbound Shipment"
        subtitle="Track carrier dispatch, routes, cargo components, and delivery commitments"
        maxWidth="xl"
      >
        <form onSubmit={handleRegisterSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Tracking Number *</label>
              <input
                type="text"
                required
                value={formTracking}
                onChange={e => setFormTracking(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">Carrier Name *</label>
              <input
                type="text"
                required
                value={formCarrier}
                onChange={e => setFormCarrier(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Transport Mode</label>
              <select
                value={formMode}
                onChange={e => setFormMode(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
              >
                <option value="Ocean">Ocean Freight</option>
                <option value="Air">Air Freight</option>
                <option value="Road">Road Trucking</option>
                <option value="Rail">Rail Cargo</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">Origin Node *</label>
              <input
                type="text"
                required
                value={formOrigin}
                onChange={e => setFormOrigin(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Destination Hub *</label>
              <input
                type="text"
                required
                value={formDestination}
                onChange={e => setFormDestination(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">Authorized Supplier *</label>
              <select
                value={formSupplierId}
                onChange={e => setFormSupplierId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
              >
                {suppliers.map(sup => (
                  <option key={sup.id} value={sup.id}>
                    {sup.name} ({sup.country})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Promised Delivery Date (SLA) *</label>
              <input
                type="text"
                required
                placeholder="YYYY-MM-DDTHH:MM:SSZ"
                value={formPromisedDate}
                onChange={e => setFormPromisedDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">Estimated Arrival (ETA) *</label>
              <input
                type="text"
                required
                placeholder="YYYY-MM-DDTHH:MM:SSZ"
                value={formEstimatedDate}
                onChange={e => setFormEstimatedDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Cargo Description & Component SKUs *</label>
            <input
              type="text"
              required
              placeholder="e.g. 500 units of NVX-9400 AI Processors in refrigerated container"
              value={formCargo}
              onChange={e => setFormCargo(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Registration Audit Reason *</label>
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
              onClick={() => setIsRegisterModalOpen(false)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-semibold transition-colors"
            >
              {isSubmitting ? 'Registering...' : 'Register Shipment'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal 2: Update Shipment ETA & Status */}
      <Modal
        isOpen={isUpdateModalOpen}
        onClose={() => !isSubmitting && setIsUpdateModalOpen(false)}
        title={`Update Shipment: ${selectedShipment?.trackingNumber}`}
        subtitle="Adjust carrier estimated arrival or operational milestone"
        maxWidth="md"
      >
        <form onSubmit={handleUpdateSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-medium mb-1">Status</label>
            <select
              value={updateStatus}
              onChange={e => setUpdateStatus(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
            >
              <option value="on_schedule">On Schedule</option>
              <option value="delayed">Delayed</option>
              <option value="customs_hold">Customs Hold</option>
              <option value="delivered">Delivered</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">New Estimated Arrival (ETA) *</label>
            <input
              type="text"
              required
              value={updateEstimatedDate}
              onChange={e => setUpdateEstimatedDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-purple-500"
            />
            <span className="text-[10px] text-slate-500">
              Promised SLA: {selectedShipment ? new Date(selectedShipment.promisedDeliveryDate).toUTCString() : ''}
            </span>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Reason for Update *</label>
            <input
              type="text"
              required
              placeholder="e.g. Inbound vessel delay reported by port dispatcher"
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
              className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-semibold transition-colors"
            >
              {isSubmitting ? 'Updating...' : 'Save Updates'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal 3: Record Supplier Issue */}
      <Modal
        isOpen={isIssueModalOpen}
        onClose={() => !isSubmitting && setIsIssueModalOpen(false)}
        title={`Record Issue for ${selectedSupplier?.name}`}
        subtitle="Document vendor manufacturing holds, delays, or quality quarantines"
        maxWidth="lg"
      >
        <form onSubmit={handleIssueSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Issue Category *</label>
              <select
                value={issueType}
                onChange={e => setIssueType(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
              >
                <option value="lead_time_increase">Lead Time Extension</option>
                <option value="quality_hold">Quality Quarantine / Batch Failure</option>
                <option value="facility_outage">Factory / Cleanroom Outage</option>
                <option value="raw_material_shortage">Raw Material Shortage</option>
                <option value="capacity_reduction">Production Line Reduction</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Severity *</label>
              <select
                value={issueSeverity}
                onChange={e => setIssueSeverity(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
              >
                <option value="critical">Critical (Immediate Supply Threat)</option>
                <option value="high">High (Production Delayed &gt; 48h)</option>
                <option value="medium">Medium (Expected 1-2 Day Slip)</option>
                <option value="low">Low (Minor Advisory)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Issue Title *</label>
            <input
              type="text"
              required
              value={issueTitle}
              onChange={e => setIssueTitle(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Estimated Lead Time Impact (Days)</label>
            <input
              type="number"
              min="0"
              value={issueDelayDays}
              onChange={e => setIssueDelayDays(parseInt(e.target.value) || 0)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Operational Description *</label>
            <textarea
              required
              rows={3}
              value={issueDesc}
              onChange={e => setIssueDesc(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2.5 text-slate-200 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Audit Reason *</label>
            <input
              type="text"
              required
              value={issueReason}
              onChange={e => setIssueReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setIsIssueModalOpen(false)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-semibold transition-colors"
            >
              {isSubmitting ? 'Recording...' : 'Record Supplier Issue'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal 4: Live Location Tracking */}
      <LiveLocationModal
        isOpen={!!liveTrackingShipment}
        onClose={() => setLiveTrackingShipment(null)}
        shipment={liveTrackingShipment}
      />
    </div>
  );
};
