import React, { useState } from 'react';
import { StockMovementItem, WarehouseEntity } from '../../types';
import { Badge } from '../common/Badge';
import { History, Search, ArrowRight } from 'lucide-react';

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
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-[#E8EAE4]">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-[#A0A39D]" />
          <input
            type="text"
            placeholder="Search SKU, reference, actor..."
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
      <div className="card-light overflow-hidden">
        {filteredMovements.length === 0 ? (
          <div className="p-12 text-center text-[#777B76]">
            <History className="w-10 h-10 text-[#A0A39D] mx-auto mb-3" />
            <p className="text-base font-bold text-[#171917]">No stock movement events found.</p>
            <p className="text-xs text-[#777B76] mt-1">Movement transactions are recorded automatically upon receipt, adjustment, or transfer.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#171917]">
              <thead className="bg-[#F8F9F6] text-[#777B76] uppercase font-mono text-[10px] border-b border-[#E8EAE4]">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">Timestamp</th>
                  <th className="px-5 py-3.5 font-semibold">Type</th>
                  <th className="px-5 py-3.5 font-semibold">SKU</th>
                  <th className="px-5 py-3.5 text-right font-semibold">Units</th>
                  <th className="px-5 py-3.5 font-semibold">Source → Destination</th>
                  <th className="px-5 py-3.5 font-semibold">Actor & Role</th>
                  <th className="px-5 py-3.5 font-semibold">Reference</th>
                  <th className="px-5 py-3.5 font-semibold">Reason / Justification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EAE4] font-mono">
                {filteredMovements.map((m) => {
                  const isPositive =
                    m.movementType === 'RECEIPT' ||
                    m.movementType === 'TRANSFER_IN' ||
                    m.movementType === 'INITIAL_STOCK';

                  return (
                    <tr key={m.id} className="hover:bg-[#F8F9F6] transition-colors">
                      <td className="px-5 py-3.5 text-[#777B76]">
                        {new Date(m.timestamp).toLocaleString()}
                      </td>
                      <td className="px-5 py-3.5 font-sans">{getMovementTypeBadge(m.movementType)}</td>
                      <td className="px-5 py-3.5 font-bold text-[#171917]">{m.sku}</td>
                      <td
                        className={`px-5 py-3.5 text-right font-bold ${
                          isPositive ? 'text-[#1b6b0c]' : 'text-[#171917]'
                        }`}
                      >
                        {isPositive ? `+${m.quantity.toLocaleString()}` : `${m.quantity.toLocaleString()}`}
                      </td>
                      <td className="px-5 py-3.5 text-[#777B76]">
                        <div className="flex items-center gap-1.5 font-medium">
                          <span>{m.fromWarehouseId || 'EXTERNAL'}</span>
                          <ArrowRight className="w-3 h-3 text-[#A0A39D]" />
                          <span>{m.toWarehouseId || 'EXTERNAL'}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-[#777B76] font-sans">
                        <span className="font-mono text-[#171917] font-semibold">{m.actorId || 'system'}</span>
                        {m.actorRole && (
                          <span className="text-[10px] text-[#A0A39D] block">{m.actorRole}</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-[#171917] font-semibold text-[11px]">
                        {m.reference || '—'}
                      </td>
                      <td className="px-5 py-3.5 font-sans text-[#777B76] text-[11px] truncate max-w-xs">
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
