import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { PriorityBadge, RiskScoreBadge } from '../components/common/Badge';
import {
  Search,
  Filter,
  ArrowRight,
  ShieldAlert,
  Zap,
  Building,
  Calendar,
  Layers,
} from 'lucide-react';
import { OrderPriority, RiskLevel } from '../types';

export const OrdersAtRiskPage: React.FC = () => {
  const { orders, setArenaDisruptionId, setActivePage } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [deadlineFilter, setDeadlineFilter] = useState<string>('all');
  const [warehouseFilter, setWarehouseFilter] = useState<string>('all');

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
        <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
          <span className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded">
            Total Orders Exposed: <strong className="text-white">{orders.length}</strong>
          </span>
          <span className="px-2.5 py-1 bg-rose-950/60 border border-rose-800/60 rounded text-rose-300">
            Critical Breach (&lt;24h): <strong>{orders.filter(o => o.hoursUntilBreach <= 24).length}</strong>
          </span>
        </div>
      </div>

      {/* Filter and Search Toolbar */}
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

        {/* Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Risk Level */}
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

          {/* Priority */}
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

          {/* Deadline */}
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

          {/* Primary Warehouse */}
          <select
            value={warehouseFilter}
            onChange={e => setWarehouseFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
          >
            <option value="all">All Warehouses</option>
            <option value="WH-RTM-01">WH-RTM-01 (Rotterdam)</option>
            <option value="WH-ORD-01">WH-ORD-01 (Chicago)</option>
            <option value="WH-ANR-02">WH-ANR-02 (Antwerp)</option>
          </select>
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
                <th className="py-3 px-4 text-right">Deadline</th>
                <th className="py-3 px-4 text-center">Priority</th>
                <th className="py-3 px-4">Risk Score & Level</th>
                <th className="py-3 px-4">Primary Root Cause Explanation</th>
                <th className="py-3 px-4 text-center">Recovery Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500 font-sans">
                    No orders match your filter criteria.
                  </td>
                </tr>
              ) : (
                filteredOrders.map(o => (
                  <tr key={o.id} className="hover:bg-slate-850/60 transition-colors">
                    <td className="py-3 px-4 font-semibold text-white">
                      {o.id}
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
                      <button
                        onClick={() => {
                          setArenaDisruptionId(o.associatedDisruptionId);
                          setActivePage('recovery-arena');
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-purple-950/70 hover:bg-purple-900 text-purple-200 border border-purple-800/60 rounded text-xs font-medium transition-colors"
                      >
                        <Zap className="w-3 h-3 text-purple-400" />
                        <span>Evaluate in Arena</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
