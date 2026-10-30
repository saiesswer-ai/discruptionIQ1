import React, { useState } from 'react';
import { ShortageItem, WarehouseEntity } from '../../types';
import { Badge } from '../common/Badge';
import {
  AlertTriangle,
  Search,
  Filter,
  ArrowRightLeft,
  CheckCircle2,
  Package,
  ShieldAlert,
  ArrowUpRight,
} from 'lucide-react';

interface ShortageAnalysisViewProps {
  shortages: ShortageItem[];
  warehouses: WarehouseEntity[];
  onOpenTransfer: (destWarehouseId: string, sku: string) => void;
  canRequestTransfer: boolean;
}

export const ShortageAnalysisView: React.FC<ShortageAnalysisViewProps> = ({
  shortages,
  warehouses,
  onOpenTransfer,
  canRequestTransfer,
}) => {
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredShortages = (shortages || []).filter((s) => {
    const matchesWarehouse = warehouseFilter === 'all' || s.warehouseId === warehouseFilter;
    const matchesSeverity = severityFilter === 'all' || s.severity === severityFilter;
    const matchesSearch =
      (s.sku || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.skuDescription || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.warehouseName || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesWarehouse && matchesSeverity && matchesSearch;
  });

  const totalDeficitUnits = (shortages || []).reduce((acc, curr) => acc + (curr.deficitUnits || 0), 0);
  const totalImpactedOrders = (shortages || []).reduce((acc, curr) => acc + (curr.affectedOrdersCount || 0), 0);

  return (
    <div className="space-y-5">
      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
          <span className="text-[10px] font-mono uppercase text-slate-400">Total Vulnerable Positions</span>
          <div className="text-xl font-bold font-mono text-rose-400 mt-1">
            {shortages.length} Hub Inventory Slots
          </div>
          <div className="text-xs text-slate-400 mt-1">Positions at or below safety stock threshold</div>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
          <span className="text-[10px] font-mono uppercase text-slate-400">Cumulative Deficit Units</span>
          <div className="text-xl font-bold font-mono text-amber-400 mt-1">
            {totalDeficitUnits.toLocaleString()} Units
          </div>
          <div className="text-xs text-slate-400 mt-1">Required to restore designated safety stock</div>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
          <span className="text-[10px] font-mono uppercase text-slate-400">Impacted Customer Orders</span>
          <div className="text-xl font-bold font-mono text-purple-400 mt-1">
            {totalImpactedOrders} Active Orders
          </div>
          <div className="text-xs text-slate-400 mt-1">Orders facing inventory fulfillment risk</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900 p-3 rounded-xl border border-slate-800">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search SKU or description..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-purple-500"
            value={warehouseFilter}
            onChange={(e) => setWarehouseFilter(e.target.value)}
          >
            <option value="all">All Warehouses</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.id} — {w.name}
              </option>
            ))}
          </select>

          <select
            className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-purple-500"
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical Only</option>
            <option value="depleted">Depleted Only</option>
            <option value="constrained">Constrained</option>
          </select>
        </div>
      </div>

      {/* Shortages Matrix Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        {filteredShortages.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
            <p className="text-white font-semibold">No shortages matching criteria.</p>
            <p className="text-xs text-slate-500 mt-1">All selected warehouse positions meet minimum buffer rules.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Warehouse Hub</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Product Description</th>
                  <th className="px-4 py-3 text-right">Available</th>
                  <th className="px-4 py-3 text-right">Safety Buffer</th>
                  <th className="px-4 py-3 text-right">Deficit</th>
                  <th className="px-4 py-3 text-center">Severity</th>
                  <th className="px-4 py-3 text-right">Orders at Risk</th>
                  <th className="px-4 py-3">Recommended Mitigation</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredShortages.map((item) => (
                  <tr key={`${item.warehouseId}-${item.sku}`} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-bold text-white">{item.warehouseId}</div>
                      <span className="text-[10px] text-slate-400 font-sans">{item.warehouseName}</span>
                    </td>
                    <td className="px-4 py-3 font-bold text-rose-400">{item.sku}</td>
                    <td className="px-4 py-3 font-sans text-slate-200">{item.skuDescription}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-300">{item.availableUnits}</td>
                    <td className="px-4 py-3 text-right text-amber-400">{item.safetyStockThreshold}</td>
                    <td className="px-4 py-3 text-right font-bold text-rose-400">-{item.deficitUnits}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        variant={
                          item.severity === 'critical'
                            ? 'critical'
                            : item.severity === 'depleted'
                            ? 'critical'
                            : 'warning'
                        }
                      >
                        {(item.severity || 'constrained').toUpperCase()}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-white">
                      {item.affectedOrdersCount}
                    </td>
                    <td className="px-4 py-3 font-sans text-slate-300 text-[11px]">
                      {item.recommendedAction}
                    </td>
                    <td className="px-4 py-3 text-right font-sans">
                      {canRequestTransfer && (
                        <button
                          onClick={() => onOpenTransfer(item.warehouseId, item.sku)}
                          className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-[11px] font-semibold transition-colors flex items-center gap-1 ml-auto"
                        >
                          <ArrowRightLeft className="w-3 h-3" />
                          Rebalance
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
