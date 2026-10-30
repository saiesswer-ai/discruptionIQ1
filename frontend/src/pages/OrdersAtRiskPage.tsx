import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { PriorityBadge, RiskScoreBadge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { BulkOrderImportTab } from '../components/orders/BulkOrderImportTab';
import { api } from '../services/httpApi';
import { OrderAtRisk, OrderPriority } from '../types';
import {
  Search,
  Filter,
  ArrowRight,
  ShieldAlert,
  Zap,
  Building,
  Calendar,
  Layers,
  PlusCircle,
  Edit2,
  Trash2,
  CheckCircle2,
} from 'lucide-react';

interface OrderLineInput {
  sku: string;
  quantity: number;
  unitPriceUSD: number;
}

export const OrdersAtRiskPage: React.FC = () => {
  const { orders, inventory, currentUser, setArenaDisruptionId, setActivePage, showToast, refreshData } =
    useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [deadlineFilter, setDeadlineFilter] = useState<string>('all');
  const [warehouseFilter, setWarehouseFilter] = useState<string>('all');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Order modal tab ('manual' | 'csv')
  const [orderModalTab, setOrderModalTab] = useState<'manual' | 'csv'>('manual');
  // Highlight newly imported orders
  const [recentlyImportedIds, setRecentlyImportedIds] = useState<Set<string>>(new Set());

  // Selected Order for Edit
  const [selectedOrder, setSelectedOrder] = useState<OrderAtRisk | null>(null);

  // Create Order Form State
  const [customerName, setCustomerName] = useState('');
  const [customerTier, setCustomerTier] = useState('Enterprise');
  const [priority, setPriority] = useState<OrderPriority>('P1');
  const [promisedDeadline, setPromisedDeadline] = useState('2026-10-27T18:00:00Z');
  const [primaryWarehouseId, setPrimaryWarehouseId] = useState('WH-RTM-01');
  const [fulfillmentPolicy, setFulfillmentPolicy] = useState('FULL_ONLY');
  const [orderLines, setOrderLines] = useState<OrderLineInput[]>([
    { sku: 'NVX-9400', quantity: 20, unitPriceUSD: 1450.0 },
  ]);
  const [createReason, setCreateReason] = useState('Enterprise customer priority order booking');

  // Edit Order Form State
  const [editPriority, setEditPriority] = useState<OrderPriority>('P1');
  const [editCustomerTier, setEditCustomerTier] = useState('Enterprise');
  const [editDeadline, setEditDeadline] = useState('');
  const [editPolicy, setEditPolicy] = useState('FULL_ONLY');
  const [editMitigation, setEditMitigation] = useState('unmitigated');
  const [editReason, setEditReason] = useState('SLA escalation update');

  const canWrite =
    currentUser?.permissions?.includes('orders:write') ||
    currentUser?.role === 'administrator' ||
    currentUser?.role === 'admin' ||
    currentUser?.role === 'operations_analyst' ||
    currentUser?.role === 'supply_chain_manager';

  const distinctHubs = Array.from(new Set(inventory.map(i => i.warehouseId)));
  const distinctSKUs = Array.from(new Set(inventory.map(i => i.sku)));

  const filteredOrders = orders.filter(o => {
    const matchesSearch =
      o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.explanation.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRisk = riskFilter === 'all' || o.riskLevel === riskFilter;
    const matchesPriority = priorityFilter === 'all' || o.priority === priorityFilter;
    const matchesWarehouse = warehouseFilter === 'all' || o.primaryWarehouseId === warehouseFilter;

    let matchesDeadline = true;
    if (deadlineFilter === 'next_24h') matchesDeadline = o.hoursUntilBreach <= 24;
    else if (deadlineFilter === 'next_48h') matchesDeadline = o.hoursUntilBreach <= 48;
    else if (deadlineFilter === 'next_7d') matchesDeadline = o.hoursUntilBreach <= 168;

    return matchesSearch && matchesRisk && matchesPriority && matchesWarehouse && matchesDeadline;
  });

  const handleOpenCreate = () => {
    setOrderModalTab('manual');
    setCustomerName('Quantum Dynamics Corp');
    setCustomerTier('Enterprise');
    setPriority('P1');
    const d = new Date();
    d.setDate(d.getDate() + 2);
    setPromisedDeadline(d.toISOString());
    setPrimaryWarehouseId(distinctHubs[0] || 'WH-RTM-01');
    setFulfillmentPolicy('FULL_ONLY');
    setOrderLines([{ sku: distinctSKUs[0] || 'NVX-9400', quantity: 25, unitPriceUSD: 1450.0 }]);
    setCreateReason('Expedited enterprise order creation');
    setIsCreateModalOpen(true);
  };

  const handleAddLine = () => {
    setOrderLines(prev => [
      ...prev,
      { sku: distinctSKUs[0] || 'ETH-200X', quantity: 10, unitPriceUSD: 280.0 },
    ]);
  };

  const handleRemoveLine = (idx: number) => {
    if (orderLines.length <= 1) {
      showToast('Order must contain at least one line item.', 'warning');
      return;
    }
    setOrderLines(prev => prev.filter((_, i) => i !== idx));
  };

  const handleLineChange = (index: number, field: keyof OrderLineInput, value: any) => {
    setOrderLines(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const totalCalculatedValue = orderLines.reduce((acc, l) => acc + l.quantity * l.unitPriceUSD, 0);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      showToast('Customer name is required.', 'warning');
      return;
    }
    if (orderLines.some(l => l.quantity <= 0 || l.unitPriceUSD <= 0)) {
      showToast('All order lines must have quantity and unit price greater than zero.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await api.createOrder({
        customerName: customerName.trim(),
        customerTier,
        priority,
        promisedDeadline,
        primaryWarehouseId,
        fulfillmentPolicy,
        orderLines,
        reason: createReason.trim(),
      });
      showToast(`Order ${created.id} created! Evaluated risk: ${created.riskScore}/100 (${created.riskLevel}).`, 'success');
      setIsCreateModalOpen(false);
      await refreshData();
    } catch (err: any) {
      showToast(err.message || 'Failed to create order.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEdit = (order: OrderAtRisk) => {
    setSelectedOrder(order);
    setEditPriority(order.priority);
    setEditCustomerTier(order.customerTier);
    setEditDeadline(order.promisedDeadline);
    setEditPolicy(order.fulfillmentPolicy || 'FULL_ONLY');
    setEditMitigation(order.mitigationStatus);
    setEditReason('Expedited customer SLA escalation');
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setIsSubmitting(true);
    try {
      const updated = await api.updateOrder(selectedOrder.id, {
        priority: editPriority,
        customerTier: editCustomerTier,
        promisedDeadline: editDeadline,
        fulfillmentPolicy: editPolicy,
        mitigationStatus: editMitigation,
        reason: editReason.trim() || 'Order priority/deadline update',
      });
      showToast(`Order ${updated.id} recalculated. New Risk: ${updated.riskScore}/100.`, 'success');
      setIsEditModalOpen(false);
      await refreshData();
    } catch (err: any) {
      showToast(err.message || 'Failed to update order.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner explaining Order Risk scoring */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <span>Customer SLA Risk Assessment Matrix</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Dynamic scoring based on stockout probability, customer tier penalty agreements, and transit lead time to breach.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-400">
          <span className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded">
            Total Orders Exposed: <strong className="text-white">{orders.length}</strong>
          </span>
          <span className="px-2.5 py-1 bg-rose-950/60 border border-rose-800/60 rounded text-rose-300">
            Critical Breach (&lt;24h): <strong>{orders.filter(o => o.hoursUntilBreach <= 24).length}</strong>
          </span>
        </div>
      </div>

      {/* Filter and Action Toolbar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search order ID, customer, SKU..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-md pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
          />
        </div>

        {/* Dropdown Filters & Create Order Button */}
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={riskFilter}
            onChange={e => setRiskFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
          >
            <option value="all">All Risk Levels</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <select
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
          >
            <option value="all">All Priorities</option>
            <option value="P1">P1 (Critical SLA)</option>
            <option value="P2">P2 (High)</option>
            <option value="P3">P3 (Standard)</option>
          </select>

          <select
            value={deadlineFilter}
            onChange={e => setDeadlineFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
          >
            <option value="all">All Deadlines</option>
            <option value="next_24h">Breach in ≤ 24 Hours</option>
            <option value="next_48h">Breach in ≤ 48 Hours</option>
            <option value="next_7d">Breach in ≤ 7 Days</option>
          </select>

          <select
            value={warehouseFilter}
            onChange={e => setWarehouseFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
          >
            <option value="all">All Warehouses</option>
            {distinctHubs.map(wh => (
              <option key={wh} value={wh}>
                {wh}
              </option>
            ))}
          </select>

          {canWrite && (
            <button
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-md text-xs font-semibold transition-colors shadow-xs ml-auto sm:ml-2"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>+ New Customer Order</span>
            </button>
          )}
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 font-medium border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Order ID</th>
                <th className="py-3 px-4">Customer & Tier</th>
                <th className="py-3 px-4">SKU / Item</th>
                <th className="py-3 px-4 text-right">Units</th>
                <th className="py-3 px-4 text-right">Value (USD)</th>
                <th className="py-3 px-4 text-right">Deadline</th>
                <th className="py-3 px-4 text-center">Priority</th>
                <th className="py-3 px-4">Risk Score & Level</th>
                <th className="py-3 px-4">Primary Root Cause Explanation</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-500 font-sans">
                    No orders match your filter criteria.
                  </td>
                </tr>
              ) : (
                filteredOrders.map(o => (
                  <tr key={o.id} className="hover:bg-slate-850/60 transition-colors">
                    <td className="py-3 px-4 font-semibold text-white">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>{o.id}</span>
                        {recentlyImportedIds.has(o.id) && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            Imported
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 font-normal">{o.primaryWarehouseId}</div>
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-200">
                      <div className="font-semibold text-white">{o.customerName}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{o.customerTier} Tier</div>
                    </td>
                    <td className="py-3 px-4 text-slate-300">
                      <div className="font-bold text-slate-100">{o.sku}</div>
                      <div className="text-[11px] text-slate-500 font-sans truncate max-w-xs">{o.skuDescription}</div>
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-slate-200">
                      {o.quantityUnits.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-slate-300">
                      ${o.orderValueUSD?.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className={`font-semibold ${o.hoursUntilBreach <= 24 ? 'text-rose-400' : 'text-amber-400'}`}>
                        {o.hoursUntilBreach}h remaining
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {new Date(o.promisedDeadline).toLocaleDateString([], { month: 'short', day: 'numeric' })}{' '}
                        {new Date(o.promisedDeadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center font-sans">
                      <PriorityBadge priority={o.priority} />
                    </td>
                    <td className="py-3 px-4">
                      <RiskScoreBadge score={o.riskScore} level={o.riskLevel} />
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-300 text-[11px] max-w-xs leading-relaxed">
                      {o.explanation}
                    </td>
                    <td className="py-3 px-4 text-center font-sans">
                      <div className="flex items-center justify-center gap-1.5">
                        {canWrite && (
                          <button
                            onClick={() => handleOpenEdit(o)}
                            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] transition-colors"
                          >
                            Edit
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (o.associatedDisruptionId) {
                              setArenaDisruptionId(o.associatedDisruptionId);
                              setActivePage('recovery-arena');
                            } else {
                              showToast(`Order ${o.id} is not currently associated with a disruption.`, 'info');
                            }
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-purple-950/70 hover:bg-purple-900 text-purple-200 border border-purple-800/60 rounded text-[11px] font-medium transition-colors"
                        >
                          <Zap className="w-3 h-3 text-purple-400" />
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

      {/* Modal 1: + New Customer Order */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => !isSubmitting && setIsCreateModalOpen(false)}
        title="Book New Customer Order"
        subtitle={
          orderModalTab === 'manual'
            ? 'Submit order lines for authoritative backend inventory verification and risk scoring'
            : 'Bulk ingest customer orders via CSV with validation, grouping, and risk scoring'
        }
        maxWidth={orderModalTab === 'csv' ? '3xl' : '2xl'}
      >
        {/* Modal Navigation Tabs */}
        <div className="flex items-center gap-1 border-b border-slate-800 pb-3 mb-4">
          <button
            type="button"
            onClick={() => setOrderModalTab('manual')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              orderModalTab === 'manual'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
            }`}
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>Manual Entry</span>
          </button>
          <button
            type="button"
            onClick={() => setOrderModalTab('csv')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              orderModalTab === 'csv'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Upload CSV</span>
          </button>
        </div>

        {orderModalTab === 'csv' ? (
          <BulkOrderImportTab
            allowedHubs={distinctHubs}
            allowedSkus={distinctSKUs}
            onImportCompleted={importedIds => {
              setRecentlyImportedIds(prev => new Set([...prev, ...importedIds]));
              refreshData();
              setTimeout(() => {
                setRecentlyImportedIds(new Set());
              }, 30000);
            }}
            onClose={() => setIsCreateModalOpen(false)}
          />
        ) : (
          <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Customer Name *</label>
              <input
                type="text"
                required
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">Customer Tier</label>
              <select
                value={customerTier}
                onChange={e => setCustomerTier(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
              >
                <option value="Enterprise">Enterprise (Highest Penalty Risk)</option>
                <option value="Strategic">Strategic Account</option>
                <option value="Standard">Standard Customer</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">SLA Priority</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as OrderPriority)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
              >
                <option value="P1">P1 (Immediate Critical)</option>
                <option value="P2">P2 (Elevated Risk)</option>
                <option value="P3">P3 (Standard Buffer)</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">Primary Fulfillment Hub</label>
              <select
                value={primaryWarehouseId}
                onChange={e => setPrimaryWarehouseId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-purple-500"
              >
                {distinctHubs.map(wh => (
                  <option key={wh} value={wh}>
                    {wh}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">Fulfillment Policy</label>
              <select
                value={fulfillmentPolicy}
                onChange={e => setFulfillmentPolicy(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
              >
                <option value="FULL_ONLY">FULL_ONLY (No Splits)</option>
                <option value="PARTIAL_ALLOWED">PARTIAL_ALLOWED (Split OK)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Promised Delivery Deadline (SLA) *</label>
            <input
              type="text"
              required
              placeholder="YYYY-MM-DDTHH:MM:SSZ"
              value={promisedDeadline}
              onChange={e => setPromisedDeadline(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* Dynamic Order Lines Section */}
          <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-md space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-white uppercase tracking-wider">
                Order Line Items ({orderLines.length})
              </span>
              <button
                type="button"
                onClick={handleAddLine}
                className="text-[11px] text-purple-400 hover:text-purple-300 font-medium flex items-center gap-1"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>+ Add Item</span>
              </button>
            </div>

            <div className="space-y-2 max-h-40 overflow-y-auto">
              {orderLines.map((line, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="w-40">
                    <select
                      value={line.sku}
                      onChange={e => handleLineChange(idx, 'sku', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-slate-200 font-mono text-xs"
                    >
                      {distinctSKUs.map(sku => (
                        <option key={sku} value={sku}>
                          {sku}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-24">
                    <input
                      type="number"
                      min="1"
                      placeholder="Qty"
                      value={line.quantity}
                      onChange={e => handleLineChange(idx, 'quantity', parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs"
                    />
                  </div>
                  <div className="w-28">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="Unit Price $"
                      value={line.unitPriceUSD}
                      onChange={e => handleLineChange(idx, 'unitPriceUSD', parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs"
                    />
                  </div>
                  <div className="flex-1 text-right font-mono text-slate-300 text-xs">
                    ${(line.quantity * line.unitPriceUSD).toLocaleString()}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveLine(idx)}
                    className="p-1 text-slate-500 hover:text-rose-400"
                    title="Remove item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">Total Purchase Commitment:</span>
              <span className="text-emerald-400 font-bold text-sm">${totalCalculatedValue.toLocaleString()}</span>
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Audit Justification / Booking Notes *</label>
            <input
              type="text"
              required
              value={createReason}
              onChange={e => setCreateReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setIsCreateModalOpen(false)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-semibold transition-colors"
            >
              {isSubmitting ? 'Booking Order...' : 'Book Customer Order'}
            </button>
          </div>
        </form>
        )}
      </Modal>

      {/* Modal 2: Edit Order SLA & Attributes */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => !isSubmitting && setIsEditModalOpen(false)}
        title={`Update Order: ${selectedOrder?.id}`}
        subtitle="Modify SLA deadline, customer tier priority, and trigger authoritative risk recalculation"
        maxWidth="lg"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Priority</label>
              <select
                value={editPriority}
                onChange={e => setEditPriority(e.target.value as OrderPriority)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
              >
                <option value="P1">P1 (Critical)</option>
                <option value="P2">P2 (High)</option>
                <option value="P3">P3 (Standard)</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">Customer Tier</label>
              <select
                value={editCustomerTier}
                onChange={e => setEditCustomerTier(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
              >
                <option value="Enterprise">Enterprise</option>
                <option value="Strategic">Strategic</option>
                <option value="Standard">Standard</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Promised Deadline *</label>
              <input
                type="text"
                required
                value={editDeadline}
                onChange={e => setEditDeadline(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">Fulfillment Policy</label>
              <select
                value={editPolicy}
                onChange={e => setEditPolicy(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
              >
                <option value="FULL_ONLY">FULL_ONLY</option>
                <option value="PARTIAL_ALLOWED">PARTIAL_ALLOWED</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Mitigation Status</label>
            <select
              value={editMitigation}
              onChange={e => setEditMitigation(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
            >
              <option value="unmitigated">Unmitigated</option>
              <option value="candidate_plan">Candidate Plan In Review</option>
              <option value="approved">Plan Approved</option>
              <option value="protected">Protected / Resolved</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Reason for Modification *</label>
            <input
              type="text"
              required
              value={editReason}
              onChange={e => setEditReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setIsEditModalOpen(false)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-semibold transition-colors"
            >
              {isSubmitting ? 'Saving...' : 'Recalculate & Save'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
