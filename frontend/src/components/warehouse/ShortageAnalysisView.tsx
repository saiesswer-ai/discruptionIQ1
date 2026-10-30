import React, { useState } from 'react';
import { ShortageItem, WarehouseEntity } from '../../types';
import { Badge } from '../common/Badge';
import {
  AlertTriangle,
  Search,
  ArrowRightLeft,
  CheckCircle2,
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
        <div className="card-light p-5">
          <span className="text-[10px] font-mono uppercase text-[#777B76]">Total Vulnerable Positions</span>
          <div className="text-2xl font-bold font-mono text-[#E85D68] mt-1 tracking-tight">
            {shortages.length} Hub Inventory Slots
          </div>
          <div className="text-xs text-[#777B76] mt-1">Positions at or below safety stock threshold</div>
        </div>

        <div className="card-light p-5">
          <span className="text-[10px] font-mono uppercase text-[#777B76]">Cumulative Deficit Units</span>
          <div className="text-2xl font-bold font-mono text-[#F5C451] mt-1 tracking-tight">
            {totalDeficitUnits.toLocaleString()} Units
          </div>
          <div className="text-xs text-[#777B76] mt-1">Required to restore designated safety stock</div>
        </div>

        <div className="card-light p-5">
          <span className="text-[10px] font-mono uppercase text-[#777B76]">Impacted Customer Orders</span>
          <div className="text-2xl font-bold font-mono text-[#171917] mt-1 tracking-tight">
            {totalImpactedOrders} Active Orders
          </div>
          <div className="text-xs text-[#777B76] mt-1">Orders facing inventory fulfillment risk</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-[#E8EAE4]">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-[#A0A39D]" />
          <input
            type="text"
            placeholder="Search SKU or description..."
            className="input-insight w-full pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            className="input-insight"
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
            className="input-insight"
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
      <div className="card-light overflow-hidden">
        {filteredShortages.length === 0 ? (
          <div className="p-12 text-center text-[#777B76]">
            <CheckCircle2 className="w-10 h-10 text-[#84E344] mx-auto mb-3" />
            <p className="text-base font-bold text-[#171917]">No shortages matching criteria.</p>
            <p className="text-xs text-[#777B76] mt-1">All selected warehouse positions meet minimum buffer rules.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#171917]">
              <thead className="bg-[#F8F9F6] text-[#777B76] uppercase font-mono text-[10px] border-b border-[#E8EAE4]">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">Warehouse Hub</th>
                  <th className="px-5 py-3.5 font-semibold">SKU</th>
                  <th className="px-5 py-3.5 font-semibold">Product Description</th>
                  <th className="px-5 py-3.5 text-right font-semibold">Available</th>
                  <th className="px-5 py-3.5 text-right font-semibold">Safety Buffer</th>
                  <th className="px-5 py-3.5 text-right font-semibold">Deficit</th>
                  <th className="px-5 py-3.5 text-center font-semibold">Severity</th>
                  <th className="px-5 py-3.5 text-right font-semibold">Orders at Risk</th>
                  <th className="px-5 py-3.5 font-semibold">Recommended Mitigation</th>
                  <th className="px-5 py-3.5 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EAE4] font-mono">
                {filteredShortages.map((item) => (
                  <tr key={`${item.warehouseId}-${item.sku}`} className="hover:bg-[#F8F9F6] transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-bold text-[#171917]">{item.warehouseId}</div>
                      <span className="text-[10px] text-[#777B76] font-sans">{item.warehouseName}</span>
                    </td>
                    <td className="px-5 py-3.5 font-bold text-[#E85D68]">{item.sku}</td>
                    <td className="px-5 py-3.5 font-sans font-medium text-[#171917]">{item.skuDescription}</td>
                    <td className="px-5 py-3.5 text-right font-semibold text-[#171917]">{item.availableUnits.toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-right text-[#777B76]">{item.safetyStockThreshold.toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-right font-bold text-[#E85D68]">-{item.deficitUnits.toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-center font-sans">
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
                    <td className="px-5 py-3.5 text-right font-bold text-[#171917]">
                      {item.affectedOrdersCount}
                    </td>
                    <td className="px-5 py-3.5 font-sans text-[#777B76] text-[11px]">
                      {item.recommendedAction}
                    </td>
                    <td className="px-5 py-3.5 text-right font-sans">
                      {canRequestTransfer && (
                        <button
                          onClick={() => onOpenTransfer(item.warehouseId, item.sku)}
                          className="btn-lime px-2.5 py-1 text-[11px] ml-auto"
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
