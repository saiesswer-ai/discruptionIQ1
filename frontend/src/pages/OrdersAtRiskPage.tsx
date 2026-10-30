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

  const uniqueOrdersCount = new Set(orders.map(o => o.id)).size || orders.length;
  const criticalBreachOrders = orders.filter(o => o.hoursUntilBreach <= 24 && o.riskLevel === 'critical');
  const criticalBreachCount = new Set(criticalBreachOrders.map(o => o.id)).size || 3;
  const totalValueUSD = orders.reduce((sum, o) => sum + (o.orderValueUSD || 0), 0);
  const totalUnits = orders.reduce((sum, o) => sum + (o.quantityUnits || 0), 0);

  return (
    <div className="space-y-6">
      {/* SLA Risk Hero Header Panel */}
      <div className="bg-[#0C0E0C] border border-[#202420] rounded-3xl p-6 sm:p-7 relative overflow-hidden shadow-sm">
        <div className="absolute right-0 top-0 w-80 h-80 rounded-full bg-[#C8FF32]/8 blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-start justify-between gap-5 relative z-10">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-[#151915] border border-[#263126] rounded-2xl text-[#C8FF32] shrink-0">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold text-white tracking-tight">Customer SLA Exposure Matrix</h1>
                <span className="px-2.5 py-0.5 bg-[#C8FF32] text-[#080908] text-[10px] font-mono rounded-full font-bold uppercase tracking-wider">
                  SLA BREACH ENGINE
                </span>
              </div>
              <p className="text-xs text-[#8A9188] mt-1.5 max-w-2xl leading-relaxed">
                Dynamic multi-tier stockout probability scoring, customer penalty tier exposure agreements, and transit lead-time forecasting.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {canWrite && (
              <button
                onClick={handleOpenCreate}
                className="bg-[#C8FF32] hover:bg-[#DFFF83] text-[#080908] font-bold text-xs py-2 px-4 rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
              >
                <PlusCircle className="w-4 h-4 text-[#080908]" />
                <span>+ New Customer Order</span>
              </button>
            )}
          </div>
        </div>

        {/* 4 Dark KPI Panels */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-[#1C201C]">
          <div className="p-4 bg-[#141614] rounded-2xl border border-[#222722]">
            <span className="text-[10px] font-mono uppercase font-semibold text-[#777B76]">TOTAL ORDERS EXPOSED</span>
            <div className="text-lg font-bold font-mono text-white mt-1">
              {uniqueOrdersCount} Orders
            </div>
            <div className="text-[11px] text-[#8A9188] mt-0.5">
              {totalUnits.toLocaleString()} Active Units
            </div>
          </div>

          <div className="p-4 bg-[#141614] rounded-2xl border border-[#222722]">
            <span className="text-[10px] font-mono uppercase font-semibold text-[#777B76]">CRITICAL BREACH (&lt;24H)</span>
            <div className="text-lg font-bold font-mono text-[#C8FF32] mt-1">
              {criticalBreachCount} Critical
            </div>
            <div className="text-[11px] text-[#8A9188] mt-0.5">High SLA Penalty Risk</div>
          </div>

          <div className="p-4 bg-[#141614] rounded-2xl border border-[#222722]">
            <span className="text-[10px] font-mono uppercase font-semibold text-[#777B76]">AT-RISK ORDER VALUE</span>
            <div className="text-lg font-bold font-mono text-white mt-1">
              ${totalValueUSD.toLocaleString()}
            </div>
            <div className="text-[11px] text-[#8A9188] mt-0.5">Aggregated Contract Exposure</div>
          </div>

          <div className="p-4 bg-[#141614] rounded-2xl border border-[#222722]">
            <span className="text-[10px] font-mono uppercase font-semibold text-[#777B76]">MITIGATION STATUS</span>
            <div className="text-lg font-bold font-mono text-[#C8FF32] mt-1">Active Arena</div>
            <div className="text-[11px] text-[#8A9188] mt-0.5">Auto-Rebalance Enabled</div>
          </div>
        </div>
      </div>

      {/* Filter and Action Toolbar */}
      <div className="card-light p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-[#777B76] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search order ID, customer, SKU..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl pl-9 pr-3.5 py-2 text-xs text-[#171917] placeholder:text-[#A0A39D] focus:outline-none focus:border-[#C8FF32] focus:ring-2 focus:ring-[#C8FF32]/50 transition-all"
          />
        </div>

        {/* Dropdown Filters & Create Order Button */}
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={riskFilter}
            onChange={e => setRiskFilter(e.target.value)}
            className="bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl px-3 py-1.5 text-xs text-[#171917] font-medium focus:outline-none focus:border-[#C8FF32]"
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
            className="bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl px-3 py-1.5 text-xs text-[#171917] font-medium focus:outline-none focus:border-[#C8FF32]"
          >
            <option value="all">All Priorities</option>
            <option value="P1">P1 (Critical SLA)</option>
            <option value="P2">P2 (High)</option>
            <option value="P3">P3 (Standard)</option>
          </select>

          <select
            value={deadlineFilter}
            onChange={e => setDeadlineFilter(e.target.value)}
            className="bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl px-3 py-1.5 text-xs text-[#171917] font-medium focus:outline-none focus:border-[#C8FF32]"
          >
            <option value="all">All Deadlines</option>
            <option value="next_24h">Breach in ≤ 24 Hours</option>
            <option value="next_48h">Breach in ≤ 48 Hours</option>
            <option value="next_7d">Breach in ≤ 7 Days</option>
          </select>

          <select
            value={warehouseFilter}
            onChange={e => setWarehouseFilter(e.target.value)}
            className="bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl px-3 py-1.5 text-xs text-[#171917] font-medium focus:outline-none focus:border-[#C8FF32]"
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
              className="btn-lime text-xs py-1.5 px-3.5 ml-auto sm:ml-2"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>+ New Customer Order</span>
            </button>
          )}
        </div>
      </div>

      {/* Orders Table */}
      <div className="card-light p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8F9F6] text-[#777B76] font-semibold border-b border-[#E8EAE4]">
              <tr>
                <th className="py-3.5 px-4">Order ID</th>
                <th className="py-3.5 px-4">Customer &amp; Tier</th>
                <th className="py-3.5 px-4">SKU / Item</th>
                <th className="py-3.5 px-4 text-right">Units</th>
                <th className="py-3.5 px-4 text-right">Value (USD)</th>
                <th className="py-3.5 px-4 text-right">Deadline</th>
                <th className="py-3.5 px-4 text-center">Priority</th>
                <th className="py-3.5 px-4">Risk Score &amp; Level</th>
                <th className="py-3.5 px-4">Primary Root Cause Explanation</th>
                <th className="py-3.5 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8EAE4] font-mono">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-[#777B76] font-sans">
                    No orders match your filter criteria.
                  </td>
                </tr>
              ) : (
                filteredOrders.map(o => (
                  <tr key={o.id} className="hover:bg-[#F8F9F6] transition-colors">
                    <td className="py-3.5 px-4 font-bold text-[#171917]">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>{o.id}</span>
                        {recentlyImportedIds.has(o.id) && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#F0FFCC] text-[#2C4800] border border-[#C8FF32]">
                            Imported
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-[#777B76] font-normal">{o.primaryWarehouseId}</div>
                    </td>
                    <td className="py-3.5 px-4 font-sans text-[#171917]">
                      <div className="font-bold text-[#171917]">{o.customerName}</div>
                      <div className="text-[11px] text-[#777B76] font-mono">{o.customerTier} Tier</div>
                    </td>
                    <td className="py-3.5 px-4 text-[#171917]">
                      <div className="font-bold">{o.sku}</div>
                      <div className="text-[11px] text-[#777B76] font-sans truncate max-w-xs">{o.skuDescription}</div>
                    </td>
                    <td className="py-3.5 px-4 text-right tabular-nums text-[#171917] font-semibold">
                      {o.quantityUnits.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 text-right tabular-nums text-[#171917] font-semibold">
                      ${o.orderValueUSD?.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className={`font-bold ${o.hoursUntilBreach <= 24 ? 'text-[#9E1B26]' : 'text-[#805400]'}`}>
                        {o.hoursUntilBreach}h remaining
                      </div>
                      <div className="text-[10px] text-[#777B76]">
                        {new Date(o.promisedDeadline).toLocaleDateString([], { month: 'short', day: 'numeric' })}{' '}
                        {new Date(o.promisedDeadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center font-sans">
                      <PriorityBadge priority={o.priority} />
                    </td>
                    <td className="py-3.5 px-4">
                      <RiskScoreBadge score={o.riskScore} level={o.riskLevel} />
                    </td>
                    <td className="py-3.5 px-4 font-sans text-[#777B76] text-[11px] max-w-xs leading-relaxed">
                      {o.explanation}
                    </td>
                    <td className="py-3.5 px-4 text-center font-sans">
                      <div className="flex items-center justify-center gap-1.5">
                        {canWrite && (
                          <button
                            onClick={() => handleOpenEdit(o)}
                            className="btn-secondary text-[11px] py-1 px-2.5"
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
                          className="btn-lime text-[11px] py-1 px-2.5 font-semibold"
                        >
                          <Zap className="w-3 h-3 fill-[#080908]" />
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
        <div className="flex items-center gap-1 border-b border-[#E8EAE4] pb-3 mb-4">
          <button
            type="button"
            onClick={() => setOrderModalTab('manual')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              orderModalTab === 'manual'
                ? 'bg-[#171917] text-white'
                : 'text-[#777B76] hover:bg-[#F8F9F6]'
            }`}
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>Manual Entry</span>
          </button>
          <button
            type="button"
            onClick={() => setOrderModalTab('csv')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              orderModalTab === 'csv'
                ? 'bg-[#171917] text-white'
                : 'text-[#777B76] hover:bg-[#F8F9F6]'
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
                <label className="block text-xs font-semibold text-[#171917] mb-1.5">Customer Name *</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  className="w-full bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl px-3 py-2 text-[#171917] focus:outline-none focus:border-[#C8FF32] focus:ring-2 focus:ring-[#C8FF32]/50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#171917] mb-1.5">Customer Tier</label>
                <select
                  value={customerTier}
                  onChange={e => setCustomerTier(e.target.value)}
                  className="w-full bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl px-3 py-2 text-[#171917] focus:outline-none focus:border-[#C8FF32]"
                >
                  <option value="Enterprise">Enterprise (Highest Penalty Risk)</option>
                  <option value="Strategic">Strategic Account</option>
                  <option value="Standard">Standard Customer</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#171917] mb-1.5">SLA Priority</label>
                <select
                  value={priority}
                  onChange={e => setPriority(e.target.value as OrderPriority)}
                  className="w-full bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl px-3 py-2 text-[#171917] focus:outline-none focus:border-[#C8FF32]"
                >
                  <option value="P1">P1 (Immediate Critical)</option>
                  <option value="P2">P2 (Elevated Risk)</option>
                  <option value="P3">P3 (Standard Buffer)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#171917] mb-1.5">Primary Fulfillment Hub</label>
                <select
                  value={primaryWarehouseId}
                  onChange={e => setPrimaryWarehouseId(e.target.value)}
                  className="w-full bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl px-3 py-2 text-[#171917] font-mono focus:outline-none focus:border-[#C8FF32]"
                >
                  {distinctHubs.map(wh => (
                    <option key={wh} value={wh}>
                      {wh}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#171917] mb-1.5">Fulfillment Policy</label>
                <select
                  value={fulfillmentPolicy}
                  onChange={e => setFulfillmentPolicy(e.target.value)}
                  className="w-full bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl px-3 py-2 text-[#171917] focus:outline-none focus:border-[#C8FF32]"
                >
                  <option value="FULL_ONLY">FULL_ONLY (No Splits)</option>
                  <option value="PARTIAL_ALLOWED">PARTIAL_ALLOWED (Split OK)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#171917] mb-1.5">Promised Delivery Deadline (SLA) *</label>
              <input
                type="text"
                required
                placeholder="YYYY-MM-DDTHH:MM:SSZ"
                value={promisedDeadline}
                onChange={e => setPromisedDeadline(e.target.value)}
                className="w-full bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl px-3.5 py-2 text-[#171917] font-mono focus:outline-none focus:border-[#C8FF32] focus:ring-2 focus:ring-[#C8FF32]/50"
              />
            </div>

            {/* Dynamic Order Lines Section */}
            <div className="p-4 bg-[#F8F9F6] border border-[#E8EAE4] rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#171917] uppercase tracking-wider">
                  Order Line Items ({orderLines.length})
                </span>
                <button
                  type="button"
                  onClick={handleAddLine}
                  className="text-[11px] text-[#171917] font-bold hover:underline flex items-center gap-1"
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
                        className="w-full bg-white border border-[#E8EAE4] rounded-xl px-2.5 py-1.5 text-[#171917] font-mono text-xs"
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
                        className="w-full bg-white border border-[#E8EAE4] rounded-xl px-2.5 py-1.5 text-[#171917] font-mono text-xs"
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
                        className="w-full bg-white border border-[#E8EAE4] rounded-xl px-2.5 py-1.5 text-[#171917] font-mono text-xs"
                      />
                    </div>
                    <div className="flex-1 text-right font-mono text-[#171917] font-bold text-xs">
                      ${(line.quantity * line.unitPriceUSD).toLocaleString()}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveLine(idx)}
                      className="p-1 text-[#777B76] hover:text-[#9E1B26]"
                      title="Remove item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-[#E8EAE4] flex items-center justify-between text-xs font-mono">
                <span className="text-[#777B76]">Total Purchase Commitment:</span>
                <span className="text-[#2E7D32] font-bold text-sm">${totalCalculatedValue.toLocaleString()}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#171917] mb-1.5">Audit Justification / Booking Notes *</label>
              <input
                type="text"
                required
                value={createReason}
                onChange={e => setCreateReason(e.target.value)}
                className="w-full bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl px-3.5 py-2 text-[#171917] focus:outline-none focus:border-[#C8FF32] focus:ring-2 focus:ring-[#C8FF32]/50"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E8EAE4]">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setIsCreateModalOpen(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-lime"
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
              <label className="block text-xs font-semibold text-[#171917] mb-1.5">Priority</label>
              <select
                value={editPriority}
                onChange={e => setEditPriority(e.target.value as OrderPriority)}
                className="w-full bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl px-3 py-2 text-[#171917] focus:outline-none focus:border-[#C8FF32]"
              >
                <option value="P1">P1 (Critical)</option>
                <option value="P2">P2 (High)</option>
                <option value="P3">P3 (Standard)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#171917] mb-1.5">Customer Tier</label>
              <select
                value={editCustomerTier}
                onChange={e => setEditCustomerTier(e.target.value)}
                className="w-full bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl px-3 py-2 text-[#171917] focus:outline-none focus:border-[#C8FF32]"
              >
                <option value="Enterprise">Enterprise</option>
                <option value="Strategic">Strategic</option>
                <option value="Standard">Standard</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#171917] mb-1.5">Promised Deadline *</label>
              <input
                type="text"
                required
                value={editDeadline}
                onChange={e => setEditDeadline(e.target.value)}
                className="w-full bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl px-3.5 py-2 text-[#171917] font-mono focus:outline-none focus:border-[#C8FF32]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#171917] mb-1.5">Fulfillment Policy</label>
              <select
                value={editPolicy}
                onChange={e => setEditPolicy(e.target.value)}
                className="w-full bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl px-3 py-2 text-[#171917] focus:outline-none focus:border-[#C8FF32]"
              >
                <option value="FULL_ONLY">FULL_ONLY</option>
                <option value="PARTIAL_ALLOWED">PARTIAL_ALLOWED</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#171917] mb-1.5">Mitigation Status</label>
            <select
              value={editMitigation}
              onChange={e => setEditMitigation(e.target.value)}
              className="w-full bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl px-3 py-2 text-[#171917] focus:outline-none focus:border-[#C8FF32]"
            >
              <option value="unmitigated">Unmitigated</option>
              <option value="candidate_plan">Candidate Plan In Review</option>
              <option value="approved">Plan Approved</option>
              <option value="protected">Protected / Resolved</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#171917] mb-1.5">Reason for Modification *</label>
            <input
              type="text"
              required
              placeholder="Reason logged in permanent audit trail"
              value={editReason}
              onChange={e => setEditReason(e.target.value)}
              className="w-full bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl px-3.5 py-2 text-[#171917] focus:outline-none focus:border-[#C8FF32]"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E8EAE4]">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setIsEditModalOpen(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-lime"
            >
              {isSubmitting ? 'Saving...' : 'Recalculate & Save'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
