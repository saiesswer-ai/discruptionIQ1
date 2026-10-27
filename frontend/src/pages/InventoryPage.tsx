import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Badge } from '../components/common/Badge';
import {
  Warehouse,
  Search,
  Filter,
  Package,
  AlertTriangle,
  ArrowDownRight,
  TrendingUp,
} from 'lucide-react';

export const InventoryPage: React.FC = () => {
  const { inventory, setActivePage, setArenaDisruptionId } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredInventory = inventory.filter(item => {
    const matchesSearch =
      item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.skuDescription.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.warehouseName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesWarehouse = warehouseFilter === 'all' || item.warehouseId === warehouseFilter;
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;

    return matchesSearch && matchesWarehouse && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return <Badge variant="success">Healthy Stock</Badge>;
      case 'constrained':
        return <Badge variant="warning">Constrained</Badge>;
      case 'depleted':
        return <Badge variant="critical">Depleted / Stockout</Badge>;
      case 'critical':
        return <Badge variant="critical">Below Safety Buffer</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Network Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg">
          <span className="text-[10px] font-mono uppercase text-slate-400">Total Tracked SKUs</span>
          <div className="text-xl font-bold font-mono text-white mt-1">4 SKUs across 4 Hubs</div>
          <div className="text-xs text-slate-400 mt-1">Rotterdam, Chicago, Antwerp, Singapore</div>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg">
          <span className="text-[10px] font-mono uppercase text-slate-400">Critical Hubs</span>
          <div className="text-xl font-bold font-mono text-rose-400 mt-1">WH-RTM-01 (Rotterdam)</div>
          <div className="text-xs text-slate-400 mt-1">NVX-9400 & ETH-200X stockouts</div>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg">
          <span className="text-[10px] font-mono uppercase text-slate-400">Total Available Units</span>
          <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
            {inventory.reduce((acc, curr) => acc + curr.availableUnits, 0).toLocaleString()} Units
          </div>
          <div className="text-xs text-slate-400 mt-1">Unreserved physical inventory</div>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg">
          <span className="text-[10px] font-mono uppercase text-slate-400">Total Reserved Orders</span>
          <div className="text-xl font-bold font-mono text-purple-400 mt-1">
            {inventory.reduce((acc, curr) => acc + curr.reservedUnits, 0).toLocaleString()} Units
          </div>
          <div className="text-xs text-slate-400 mt-1">Allocated to customer purchase orders</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search SKU, description, hub..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-md pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
          />
        </div>

        <div className="flex items-center gap-3">
          <select
            value={warehouseFilter}
            onChange={e => setWarehouseFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
          >
            <option value="all">All Hub Locations</option>
            <option value="WH-RTM-01">WH-RTM-01 (Rotterdam)</option>
            <option value="WH-ORD-01">WH-ORD-01 (Chicago)</option>
            <option value="WH-ANR-02">WH-ANR-02 (Antwerp)</option>
            <option value="WH-SIN-01">WH-SIN-01 (Singapore)</option>
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
          >
            <option value="all">All Stock Statuses</option>
            <option value="healthy">Healthy</option>
            <option value="constrained">Constrained</option>
            <option value="critical">Critical</option>
            <option value="depleted">Depleted</option>
          </select>
        </div>
      </div>

      {/* Inventory Data Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 font-medium border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Warehouse & Hub</th>
                <th className="py-3 px-4">SKU / Component</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4 text-right">Available</th>
                <th className="py-3 px-4 text-right">Reserved</th>
                <th className="py-3 px-4 text-right">Inbound Pipe</th>
                <th className="py-3 px-4 text-right">Safety Buffer</th>
                <th className="py-3 px-4">Stock Status</th>
                <th className="py-3 px-4 text-right">Unit Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredInventory.map(item => (
                <tr key={item.id} className="hover:bg-slate-850/60 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-white">{item.warehouseName}</div>
                    <div className="text-[10px] text-slate-500 font-sans">{item.warehouseLocation}</div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-100">{item.sku}</div>
                    <div className="text-[10px] text-slate-400 font-sans truncate max-w-xs">{item.skuDescription}</div>
                  </td>
                  <td className="py-3 px-4 font-sans text-slate-300">
                    {item.category}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className={`font-bold tabular-nums text-sm ${item.availableUnits <= item.safetyStockThreshold ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {item.availableUnits.toLocaleString()}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-slate-300 tabular-nums">
                    {item.reservedUnits.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right text-sky-400 tabular-nums">
                    +{item.inboundUnits.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-400 tabular-nums">
                    {item.safetyStockThreshold.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 font-sans">
                    {getStatusBadge(item.status)}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-300 tabular-nums">
                    ${item.unitCostUSD}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
