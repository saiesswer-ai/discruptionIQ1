import React, { useState } from 'react';
import { StockMovementItem, WarehouseEntity } from '../../types';
import { Badge } from '../common/Badge';
import { History, Search, ArrowRight, User, Hash } from 'lucide-react';

interface StockMovementLedgerProps {
  movements: StockMovementItem[];
  warehouses: WarehouseEntity[];
}

export const StockMovementLedger: React.FC<StockMovementLedgerProps> = ({ movements, warehouses }) => {
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredMovements = (movements || []).filter((m) => {
    const matchesWarehouse =
      warehouseFilter === 'all' ||
      m.fromWarehouseId === warehouseFilter ||
      m.toWarehouseId === warehouseFilter;
    const matchesSearch =
      (m.sku || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.reason || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.reference ? m.reference.toLowerCase().includes(searchQuery.toLowerCase()) : false) ||
      (m.actorId ? m.actorId.toLowerCase().includes(searchQuery.toLowerCase()) : false);
    return matchesWarehouse && matchesSearch;
  });

  const getMovementTypeBadge = (type: string) => {
    switch (type) {
      case 'RECEIPT':
      case 'TRANSFER_IN':
        return <Badge variant="success">{type}</Badge>;
      case 'TRANSFER_OUT':
      case 'TRANSFER_RESERVATION':
        return <Badge variant="warning">{type}</Badge>;
      case 'CYCLE_COUNT_ADJUSTMENT':
        return <Badge variant="neutral">ADJUSTMENT</Badge>;
      default:
        return <Badge variant="neutral">{type}</Badge>;
    }
  };

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900 p-3 rounded-xl border border-slate-800">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search SKU, reference, actor..."
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
            <option value="all">All Facilities</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.id} — {w.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Movement Ledger Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        {filteredMovements.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <History className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-white font-semibold">No stock movement events found.</p>
            <p className="text-xs text-slate-500 mt-1">Movement transactions are recorded automatically upon receipt, adjustment, or transfer.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3 text-right">Units</th>
                  <th className="px-4 py-3">Source → Destination</th>
                  <th className="px-4 py-3">Actor & Role</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Reason / Justification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredMovements.map((m) => {
                  const isPositive =
                    m.movementType === 'RECEIPT' ||
                    m.movementType === 'TRANSFER_IN' ||
                    m.movementType === 'INITIAL_STOCK';

                  return (
                    <tr key={m.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 text-slate-400">
                        {new Date(m.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">{getMovementTypeBadge(m.movementType)}</td>
                      <td className="px-4 py-3 font-bold text-white">{m.sku}</td>
                      <td
                        className={`px-4 py-3 text-right font-bold ${
                          isPositive ? 'text-emerald-400' : 'text-purple-400'
                        }`}
                      >
                        {isPositive ? `+${m.quantity}` : `${m.quantity}`}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <span>{m.fromWarehouseId || 'EXTERNAL'}</span>
                          <ArrowRight className="w-3 h-3 text-slate-500" />
                          <span>{m.toWarehouseId || 'EXTERNAL'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-400 font-sans">
                        <span className="font-mono text-slate-300">{m.actorId || 'system'}</span>
                        {m.actorRole && (
                          <span className="text-[10px] text-slate-500 block">{m.actorRole}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-purple-300 text-[11px]">
                        {m.reference || '—'}
                      </td>
                      <td className="px-4 py-3 font-sans text-slate-300 text-[11px] truncate max-w-xs">
                        {m.reason}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
