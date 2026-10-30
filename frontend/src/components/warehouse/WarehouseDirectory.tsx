import React, { useState } from 'react';
import { WarehouseEntity, Company } from '../../types';
import { Badge } from '../common/Badge';
import {
  Warehouse as WarehouseIcon,
  Building2,
  MapPin,
  Truck,
  Plus,
  Edit2,
  ArrowRightLeft,
  ChevronRight,
  ShieldCheck,
  Search,
  CheckCircle2,
} from 'lucide-react';

interface WarehouseDirectoryProps {
  warehouses: WarehouseEntity[];
  company?: Company | null;
  onSelectWarehouse: (warehouseId: string) => void;
  onOpenAddWarehouse: () => void;
  onOpenEditWarehouse: (warehouse: WarehouseEntity) => void;
  onOpenTransferModal: (sourceWarehouseId?: string) => void;
  canWriteWarehouses: boolean;
  canRequestTransfer: boolean;
}

export const WarehouseDirectory: React.FC<WarehouseDirectoryProps> = ({
  warehouses,
  company,
  onSelectWarehouse,
  onOpenAddWarehouse,
  onOpenEditWarehouse,
  onOpenTransferModal,
  canWriteWarehouses,
  canRequestTransfer,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredWarehouses = (warehouses || []).filter((w) => {
    const matchesSearch =
      (w.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (w.location || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (w.id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (w.city ? w.city.toLowerCase().includes(searchQuery.toLowerCase()) : false);
    const whStatus = (w.status || w.operatingStatus || 'active').toLowerCase();
    const matchesStatus = statusFilter === 'all' || whStatus === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  const totalNetworkCapacity = (warehouses || []).reduce((acc, curr) => acc + (curr.totalCapacitySqm || 0), 0) || 198000;
  const totalDockDoors = (warehouses || []).reduce((acc, curr) => acc + (curr.availableDockDoors || 0), 0) || 77;

  return (
    <div className="space-y-6">
      {/* Synthetic Company Profile Header Banner (InsightOS Deep Black Hero Card) */}
      <div className="bg-[#0C0E0C] border border-[#202420] rounded-3xl p-6 sm:p-7 relative overflow-hidden shadow-sm">
        <div className="absolute right-0 top-0 w-80 h-80 rounded-full bg-[#C8FF32]/8 blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-5 relative z-10">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-[#151915] border border-[#263126] rounded-2xl text-[#C8FF32] shrink-0">
              <Building2 className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl font-bold text-white tracking-tight">
                  {company?.name || 'DisruptionIQ Global Logistics Corp'}
                </h2>
                <span className="px-2.5 py-0.5 bg-[#C8FF32] text-[#080908] text-[10px] font-mono rounded-full font-bold uppercase tracking-wider">
                  GLOBAL MULTI-HUB GRID
                </span>
              </div>
              <p className="text-xs text-[#8A9188] mt-1.5 max-w-2xl leading-relaxed">
                Operating enterprise topology for multi-echelon buffer stock routing and cross-dock logistics.
                Registered in Chennai (CIN: NL-88492019), interconnected across 5 strategic international fulfillment hubs.
              </p>
              <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-[#8A9188]">
                <span className="flex items-center gap-1.5 text-[#C5CBC1]">
                  <MapPin className="w-3.5 h-3.5 text-[#C8FF32]" />
                  HQ: Rotterdam, Netherlands
                </span>
                <span className="flex items-center gap-1.5 text-[#84E344]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#84E344]" />
                  Status: Active Multi-Hub Network
                </span>
                <span className="font-mono text-[#8A9188]">
                  Company ID: <strong className="text-[#C8FF32] font-semibold">CMP-01</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {canWriteWarehouses && (
              <button
                onClick={onOpenAddWarehouse}
                className="bg-[#C8FF32] hover:bg-[#DFFF83] text-[#080908] font-bold text-xs py-2 px-4 rounded-xl flex items-center gap-1.5 whitespace-nowrap shadow-sm transition-all"
              >
                <Plus className="w-4 h-4 text-[#080908]" />
                <span>Add Warehouse</span>
              </button>
            )}
          </div>
        </div>

        {/* Global Network Metrics Grid (4 Dark Panels) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-[#1C201C]">
          <div className="p-4 bg-[#141614] rounded-2xl border border-[#222722]">
            <span className="text-[10px] font-mono uppercase font-semibold text-[#777B76]">ACTIVE FACILITIES</span>
            <div className="text-lg font-bold font-mono text-white mt-1">
              {warehouses.length > 0 ? `${warehouses.length} Hubs` : '5 Hubs'}
            </div>
            <div className="text-[11px] text-[#8A9188] mt-0.5 truncate">
              Frankfurt, Chicago, Singapore, Chennai, Dubai
            </div>
          </div>

          <div className="p-4 bg-[#141614] rounded-2xl border border-[#222722]">
            <span className="text-[10px] font-mono uppercase font-semibold text-[#777B76]">TOTAL FLOOR SPACE</span>
            <div className="text-lg font-bold font-mono text-white mt-1">
              {totalNetworkCapacity.toLocaleString()} m²
            </div>
            <div className="text-[11px] text-[#8A9188] mt-0.5">High-bay automated pallet storage</div>
          </div>

          <div className="p-4 bg-[#141614] rounded-2xl border border-[#222722]">
            <span className="text-[10px] font-mono uppercase font-semibold text-[#777B76]">LOADING DOCKS</span>
            <div className="text-lg font-bold font-mono text-[#C8FF32] mt-1">
              {totalDockDoors} Active Doors
            </div>
            <div className="text-[11px] text-[#8A9188] mt-0.5">Cross-dock staging &amp; container bays</div>
          </div>

          <div className="p-4 bg-[#141614] rounded-2xl border border-[#222722]">
            <span className="text-[10px] font-mono uppercase font-semibold text-[#777B76]">BALANCING GRID</span>
            <div className="text-lg font-bold font-mono text-[#C8FF32] mt-1">Autonomous</div>
            <div className="text-[11px] text-[#8A9188] mt-0.5">Real-time inter-hub rebalancing</div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="card-light p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#777B76]" />
          <input
            type="text"
            placeholder="Search warehouse, city, code..."
            className="w-full pl-9 pr-3.5 py-2 bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl text-xs text-[#171917] placeholder:text-[#A0A39D] focus:outline-none focus:border-[#C8FF32] focus:ring-1 focus:ring-[#C8FF32] transition-all"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto text-xs">
          <span className="text-[#777B76] font-medium">Status:</span>
          <select
            className="px-3 py-1.5 bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl text-xs text-[#171917] font-medium focus:outline-none focus:border-[#C8FF32]"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Operating Modes</option>
            <option value="active">Active Only</option>
            <option value="maintenance">Maintenance</option>
            <option value="restricted">Restricted</option>
          </select>
        </div>
      </div>

      {/* Warehouse Cards Grid */}
      {filteredWarehouses.length === 0 ? (
        <div className="p-10 text-center card-light text-[#777B76]">
          <WarehouseIcon className="w-8 h-8 text-[#A0A39D] mx-auto mb-2" />
          <p className="text-[#171917] font-bold">No warehouses matching filter.</p>
          <p className="text-xs text-[#777B76] mt-1">
            {warehouses.length === 0
              ? 'Loading warehouse directory from network grid...'
              : 'Try clearing your search query or status filter.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredWarehouses.map((wh) => {
            const capSqm = wh.totalCapacitySqm || 20000;
            const doors = wh.availableDockDoors || 12;
            const isRestricted = wh.operatingStatus === 'restricted';
            return (
              <div
                key={wh.id}
                onClick={() => onSelectWarehouse(wh.id)}
                className="card-light p-5 hover:border-[#C8FF32] transition-all duration-150 cursor-pointer flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#F0F1EE] border border-[#E8EAE4] flex items-center justify-center text-[#171917] group-hover:bg-[#C8FF32] group-hover:text-[#080908] transition-colors">
                        <WarehouseIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-[#171917] group-hover:text-[#080908] transition-colors">
                          {wh.name}
                        </h3>
                        <span className="text-[10px] font-mono text-[#777B76] uppercase">
                          {wh.id} · {wh.city || wh.location}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                        isRestricted
                          ? 'bg-[#FDF0F1] text-[#9E1B26] border border-[#F7B6BC]'
                          : 'bg-[#F0FFCC] text-[#2C4800] border border-[#C8FF32]'
                      }`}
                    >
                      {wh.operatingStatus || wh.status || 'Active'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 my-4 text-xs font-mono">
                    <div className="p-2.5 rounded-xl bg-[#F8F9F6] border border-[#E8EAE4]">
                      <span className="text-[10px] text-[#777B76] uppercase block">Capacity</span>
                      <strong className="text-[#171917]">{capSqm.toLocaleString()} m²</strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#F8F9F6] border border-[#E8EAE4]">
                      <span className="text-[10px] text-[#777B76] uppercase block">Dock Doors</span>
                      <strong className="text-[#171917]">{doors} Bays</strong>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#E8EAE4] flex items-center justify-between text-xs text-[#777B76]">
                  <span className="flex items-center gap-1 group-hover:text-[#171917] transition-colors font-medium">
                    <span>Inspect Hub</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                  {canWriteWarehouses && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenEditWarehouse(wh);
                      }}
                      className="p-1 hover:text-[#171917] rounded"
                      title="Edit Hub Parameters"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
