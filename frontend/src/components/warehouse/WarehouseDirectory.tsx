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

  const totalNetworkCapacity = (warehouses || []).reduce((acc, curr) => acc + (curr.totalCapacitySqm || 0), 0);
  const totalDockDoors = (warehouses || []).reduce((acc, curr) => acc + (curr.availableDockDoors || 0), 0);

  return (
    <div className="space-y-6">
      {/* Synthetic Company Profile Header Banner */}
      <div className="p-5 bg-gradient-to-r from-slate-900 via-purple-950/40 to-slate-900 border border-purple-500/30 rounded-xl shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 translate-x-8 -translate-y-8 w-48 h-48 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-purple-600/20 border border-purple-500/40 rounded-xl text-purple-400">
              <Building2 className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white tracking-tight">
                  {company?.name || 'DisruptionIQ Logistics Pvt. Ltd.'}
                </h2>
                <span className="px-2 py-0.5 bg-purple-500/20 border border-purple-500/40 text-[10px] font-mono text-purple-300 rounded font-semibold uppercase">
                  Synthetic Demo Company
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                Primary operating enterprise for synthetic simulation and multi-echelon inventory routing.
                Headquartered in Chennai, India (CIN: {company?.registrationNumber || 'U63030TN2024PTC159821'}).
                Interconnected across 5 strategic global logistics gateways.
              </p>
              <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-purple-400" />
                  HQ: {company?.headquarters || 'Chennai, India'}
                </span>
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Status: Active Multi-Hub Network
                </span>
                <span className="text-purple-300 font-mono">
                  Company ID: {company?.id || 'COMP-DIQ-01'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {canWriteWarehouses && (
              <button
                onClick={onOpenAddWarehouse}
                className="flex items-center gap-2 px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold shadow-md transition-all shrink-0"
              >
                <Plus className="w-4 h-4" />
                Add Warehouse
              </button>
            )}
          </div>
        </div>

        {/* Global Network Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-800/80">
          <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800">
            <span className="text-[10px] font-mono uppercase text-slate-400">Active Warehouses</span>
            <div className="text-lg font-bold font-mono text-white mt-0.5">{warehouses.length} Facilities</div>
            <div className="text-[11px] text-slate-400">Frankfurt, Chicago, Singapore, Chennai, Dubai</div>
          </div>

          <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800">
            <span className="text-[10px] font-mono uppercase text-slate-400">Total Floor Space</span>
            <div className="text-lg font-bold font-mono text-purple-300 mt-0.5">
              {totalNetworkCapacity.toLocaleString()} m²
            </div>
            <div className="text-[11px] text-slate-400">High-bay automated pallet storage</div>
          </div>

          <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800">
            <span className="text-[10px] font-mono uppercase text-slate-400">Inbound / Outbound Docks</span>
            <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">{totalDockDoors} Doors</div>
            <div className="text-[11px] text-slate-400">Cross-dock staging & container bays</div>
          </div>

          <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800">
            <span className="text-[10px] font-mono uppercase text-slate-400">Network Topology</span>
            <div className="text-lg font-bold font-mono text-blue-400 mt-0.5">Global Grid</div>
            <div className="text-[11px] text-slate-400">Automated inter-hub stock balancing</div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search warehouse, city, code..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 self-end">
          <span className="text-xs text-slate-400">Status:</span>
          <select
            className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-purple-500"
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
        <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-xl text-slate-400">
          <WarehouseIcon className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-white font-semibold">No warehouses matching filter.</p>
          <p className="text-xs text-slate-500 mt-1">
            {warehouses.length === 0
              ? 'Loading warehouse directory from network grid...'
              : 'Try clearing your search query or status filter.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredWarehouses.map((wh) => {
          const capSqm = wh.totalCapacitySqm || 20000;
          const docks = wh.availableDockDoors || 12;

          return (
            <div
              key={wh.id}
              className="p-5 bg-slate-900 border border-slate-800 hover:border-purple-500/50 rounded-xl transition-all shadow-md group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 bg-purple-600/15 border border-purple-500/30 rounded-lg text-purple-400 group-hover:scale-105 transition-transform">
                      <WarehouseIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-purple-400">{wh.id}</span>
                        {wh.isDemo && (
                          <span className="px-1.5 py-0.2 bg-slate-800 text-[9px] font-mono text-slate-400 rounded">
                            Demo
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-bold text-white group-hover:text-purple-300 transition-colors">
                        {wh.name}
                      </h3>
                    </div>
                  </div>
                  <Badge variant={(wh.status || wh.operatingStatus || 'active') === 'active' ? 'success' : 'warning'}>
                    {(wh.status || wh.operatingStatus || 'active').toUpperCase()}
                  </Badge>
                </div>

                <div className="space-y-2 text-xs text-slate-300 my-3">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="truncate">{wh.location}</span>
                  </div>

                  <div className="p-2.5 bg-slate-950/80 rounded border border-slate-800/80 space-y-1.5">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-400">Storage Capacity:</span>
                      <span className="font-mono font-semibold text-white">{capSqm.toLocaleString()} m²</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-purple-500 h-full rounded-full"
                        style={{ width: `${Math.min(100, Math.max(30, (capSqm / 30000) * 100))}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-[11px] pt-0.5">
                      <span className="text-slate-400">Loading Dock Bays:</span>
                      <span className="font-mono text-emerald-400 font-semibold">{docks} Active Doors</span>
                    </div>
                  </div>

                  {wh.managerName && (
                    <div className="flex justify-between items-center text-[11px] text-slate-400 pt-1">
                      <span>Facility Manager:</span>
                      <span className="text-slate-200 font-medium">{wh.managerName}</span>
                    </div>
                  )}
                  {wh.contactEmail && (
                    <div className="flex justify-between items-center text-[11px] text-slate-400">
                      <span>Contact:</span>
                      <span className="font-mono text-slate-300 text-[10px]">{wh.contactEmail}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2 mt-2">
                <button
                  onClick={() => onSelectWarehouse(wh.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 hover:text-white rounded text-xs font-semibold transition-colors"
                >
                  Inspect 360° View
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>

                <div className="flex items-center gap-1.5">
                  {canRequestTransfer && (
                    <button
                      onClick={() => onOpenTransferModal(wh.id)}
                      title="Initiate Stock Transfer from this Hub"
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded transition-colors"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {canWriteWarehouses && (
                    <button
                      onClick={() => onOpenEditWarehouse(wh)}
                      title="Edit Warehouse Details"
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        </div>
      )}
    </div>
  );
};
