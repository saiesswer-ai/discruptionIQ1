import React, { useState, useEffect } from 'react';
import { api } from '../../services/httpApi';
import { WarehouseDetailResponse, WarehouseEntity, WarehouseInventory } from '../../types';
import { Badge } from '../common/Badge';
import {
  Warehouse as WarehouseIcon,
  ArrowLeft,
  Package,
  Truck,
  ShoppingCart,
  AlertTriangle,
  ArrowRightLeft,
  Flame,
  History,
  Edit2,
  Plus,
  CheckCircle2,
  MapPin,
  Building2,
  RefreshCw,
} from 'lucide-react';

interface WarehouseDetailViewProps {
  warehouseId: string;
  onBack: () => void;
  onOpenEditWarehouse: (warehouse: WarehouseEntity) => void;
  onOpenAddInventory: (warehouseId: string) => void;
  onOpenStockReceipt: (warehouseId: string) => void;
  onOpenStockAdjustment: (item: WarehouseInventory) => void;
  onOpenTransfer: (sourceWarehouseId: string, sku?: string) => void;
  canWriteWarehouses: boolean;
  canWriteInventory: boolean;
  canRequestTransfer: boolean;
  showToast: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export const WarehouseDetailView: React.FC<WarehouseDetailViewProps> = ({
  warehouseId,
  onBack,
  onOpenEditWarehouse,
  onOpenAddInventory,
  onOpenStockReceipt,
  onOpenStockAdjustment,
  onOpenTransfer,
  canWriteWarehouses,
  canWriteInventory,
  canRequestTransfer,
  showToast,
}) => {
  const [data, setData] = useState<WarehouseDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    'inventory' | 'shortages' | 'shipments' | 'orders' | 'transfers' | 'disruptions' | 'movements'
  >('inventory');

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.getWarehouse(warehouseId);
      setData(res);
    } catch (err: any) {
      showToast(err.message || 'Failed to load warehouse detail.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [warehouseId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 card-light">
        <div className="ai-orb-animated mb-4" />
        <span className="text-sm font-medium text-[#777B76]">Compiling warehouse 360° telemetry profile...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center card-light">
        <p className="text-sm text-[#777B76]">Unable to load details for warehouse node {warehouseId}.</p>
        <button
          onClick={onBack}
          className="mt-4 btn-secondary text-xs"
        >
          Return to Directory
        </button>
      </div>
    );
  }

  const warehouse = data.warehouse || ({} as WarehouseEntity);
  const company = data.company;
  const inventory = data.inventory || [];
  const incomingShipments = data.incomingShipments || [];
  const outgoingOrders = data.outgoingOrders || [];
  const shortages = data.shortages || [];
  const transfers = data.transfers || [];
  const disruptions = data.disruptions || [];
  const movements = data.movements || [];

  const totalOnHand = inventory.reduce((acc, curr) => acc + (curr.onHandUnits ?? (curr.availableUnits + curr.reservedUnits)), 0);
  const totalAvailable = inventory.reduce((acc, curr) => acc + curr.availableUnits, 0);
  const totalReserved = inventory.reduce((acc, curr) => acc + curr.reservedUnits, 0);
  const totalInbound = inventory.reduce((acc, curr) => acc + curr.inboundUnits, 0);
  const whStatus = warehouse.status || warehouse.operatingStatus || 'active';

  return (
    <div className="space-y-6">
      {/* Top Navigation & Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-xs font-semibold text-[#777B76] hover:text-[#171917] transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          Back to Warehouse Directory
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {canRequestTransfer && (
            <button
              onClick={() => onOpenTransfer(warehouse.id)}
              className="btn-lime text-xs"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              Transfer Stock
            </button>
          )}

          {canWriteInventory && (
            <>
              <button
                onClick={() => onOpenStockReceipt(warehouse.id)}
                className="btn-secondary text-xs"
              >
                <Truck className="w-3.5 h-3.5 text-[#171917]" />
                Dock Receipt
              </button>
              <button
                onClick={() => onOpenAddInventory(warehouse.id)}
                className="btn-secondary text-xs"
              >
                <Plus className="w-3.5 h-3.5 text-[#171917]" />
                Add Inventory Slot
              </button>
            </>
          )}

          {canWriteWarehouses && (
            <button
              onClick={() => onOpenEditWarehouse(warehouse)}
              className="btn-secondary text-xs"
            >
              <Edit2 className="w-3.5 h-3.5 text-[#777B76]" />
              Edit Facility
            </button>
          )}
        </div>
      </div>

      {/* Warehouse Hub Identity Card - Hero Dark Surface */}
      <div className="card-hero p-6 sm:p-8 relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#C8FF32]/10 border border-[#C8FF32]/30 flex items-center justify-center text-[#C8FF32] shrink-0 shadow-sm">
              <WarehouseIcon className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs font-bold text-[#C8FF32] bg-[#C8FF32]/10 px-2 py-0.5 rounded-md border border-[#C8FF32]/20">
                  {warehouse.id}
                </span>
                <Badge variant={whStatus === 'active' ? 'success' : 'warning'}>
                  {whStatus.toUpperCase()}
                </Badge>
                {warehouse.isDemo && (
                  <span className="px-2 py-0.5 bg-[#242624] text-[10px] font-mono text-[#A0A39D] rounded-full border border-[#363936]">
                    Demo Facility
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold text-[#F7F9F4] mt-2 tracking-tight">{warehouse.name}</h1>
              <p className="text-xs text-[#A0A39D] flex items-center gap-1.5 mt-1 font-medium">
                <MapPin className="w-3.5 h-3.5 text-[#C8FF32]" />
                {warehouse.location} • {warehouse.country}
              </p>
              <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-[#A0A39D]">
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-[#777B76]" />
                  Operated by: <strong className="text-[#F7F9F4] font-medium">{company?.name || 'DisruptionIQ Global Logistics'}</strong>
                </span>
                {warehouse.managerName && (
                  <span>
                    Facility Manager: <strong className="text-[#F7F9F4] font-medium">{warehouse.managerName}</strong>
                  </span>
                )}
                {warehouse.contactEmail && (
                  <span className="font-mono text-[#DFFF83] text-[11px]">{warehouse.contactEmail}</span>
                )}
              </div>
            </div>
          </div>

          {/* Capacity Metrics */}
          <div className="p-4 bg-[#171917]/90 rounded-2xl border border-[#363936] lg:w-80 shrink-0 space-y-2.5 backdrop-blur-sm">
            <div className="flex justify-between items-center text-xs">
              <span className="text-[#A0A39D] font-medium">Storage Capacity</span>
              <span className="font-mono font-bold text-[#F7F9F4]">
                {(warehouse.totalCapacitySqm || 20000).toLocaleString()} m²
              </span>
            </div>
            <div className="w-full bg-[#080908] h-2 rounded-full overflow-hidden border border-[#2B2E2B]">
              <div className="bg-[#C8FF32] h-full rounded-full transition-all duration-500" style={{ width: '68%' }} />
            </div>
            <div className="flex justify-between items-center text-[11px] text-[#A0A39D] pt-1">
              <span>Dock Doors:</span>
              <span className="font-mono text-[#84E344] font-semibold">
                {warehouse.availableDockDoors || 12} Active Doors
              </span>
            </div>
            <div className="flex justify-between items-center text-[11px] text-[#A0A39D]">
              <span>Estimated Space Usage:</span>
              <span className="font-mono text-[#DFFF83] font-semibold">68% Utilized</span>
            </div>
          </div>
        </div>

        {/* Aggregate KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-6 border-t border-[#2E332E]">
          <div className="p-3.5 bg-[#080908]/80 rounded-xl border border-[#2B2E2B]">
            <span className="text-[10px] font-mono uppercase text-[#A0A39D]">Total On-Hand</span>
            <div className="text-xl font-bold font-mono text-[#F7F9F4] mt-0.5">{totalOnHand.toLocaleString()}</div>
            <div className="text-[11px] text-[#777B76]">{inventory.length} Stocked SKUs</div>
          </div>

          <div className="p-3.5 bg-[#080908]/80 rounded-xl border border-[#2B2E2B]">
            <span className="text-[10px] font-mono uppercase text-[#A0A39D]">Available Stock</span>
            <div className="text-xl font-bold font-mono text-[#C8FF32] mt-0.5">
              {totalAvailable.toLocaleString()}
            </div>
            <div className="text-[11px] text-[#777B76]">Unreserved physical stock</div>
          </div>

          <div className="p-3.5 bg-[#080908]/80 rounded-xl border border-[#2B2E2B]">
            <span className="text-[10px] font-mono uppercase text-[#A0A39D]">Reserved Units</span>
            <div className="text-xl font-bold font-mono text-[#F5C451] mt-0.5">{totalReserved.toLocaleString()}</div>
            <div className="text-[11px] text-[#777B76]">Allocated to orders</div>
          </div>

          <div className="p-3.5 bg-[#080908]/80 rounded-xl border border-[#2B2E2B]">
            <span className="text-[10px] font-mono uppercase text-[#A0A39D]">Inbound Freight</span>
            <div className="text-xl font-bold font-mono text-[#7185FF] mt-0.5">{totalInbound.toLocaleString()}</div>
            <div className="text-[11px] text-[#777B76]">{incomingShipments.length} Incoming Shipments</div>
          </div>

          <div className="p-3.5 bg-[#080908]/80 rounded-xl border border-[#2B2E2B]">
            <span className="text-[10px] font-mono uppercase text-[#A0A39D]">Critical Shortages</span>
            <div className="text-xl font-bold font-mono text-[#E85D68] mt-0.5">{shortages.length} Positions</div>
            <div className="text-[11px] text-[#777B76]">Below safety buffer</div>
          </div>

          <div className="p-3.5 bg-[#080908]/80 rounded-xl border border-[#2B2E2B]">
            <span className="text-[10px] font-mono uppercase text-[#A0A39D]">Active Disruptions</span>
            <div className="text-xl font-bold font-mono text-[#DFFF83] mt-0.5">{disruptions.length} Events</div>
            <div className="text-[11px] text-[#777B76]">Linked to this node</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto p-1.5 bg-[#F0F1EE] rounded-2xl border border-[#E8EAE4] text-xs font-semibold">
        <button
          onClick={() => setActiveTab('inventory')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all whitespace-nowrap ${
            activeTab === 'inventory'
              ? 'bg-[#171917] text-[#C8FF32] shadow-sm'
              : 'text-[#777B76] hover:text-[#171917]'
          }`}
        >
          <Package className="w-4 h-4" />
          Warehouse Inventory ({inventory.length})
        </button>

        <button
          onClick={() => setActiveTab('shortages')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all whitespace-nowrap ${
            activeTab === 'shortages'
              ? 'bg-[#171917] text-[#C8FF32] shadow-sm'
              : 'text-[#777B76] hover:text-[#171917]'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Shortage Analysis ({shortages.length})
        </button>

        <button
          onClick={() => setActiveTab('shipments')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all whitespace-nowrap ${
            activeTab === 'shipments'
              ? 'bg-[#171917] text-[#C8FF32] shadow-sm'
              : 'text-[#777B76] hover:text-[#171917]'
          }`}
        >
          <Truck className="w-4 h-4" />
          Incoming Shipments ({incomingShipments.length})
        </button>

        <button
          onClick={() => setActiveTab('orders')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all whitespace-nowrap ${
            activeTab === 'orders'
              ? 'bg-[#171917] text-[#C8FF32] shadow-sm'
              : 'text-[#777B76] hover:text-[#171917]'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          Outgoing Orders ({outgoingOrders.length})
        </button>

        <button
          onClick={() => setActiveTab('transfers')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all whitespace-nowrap ${
            activeTab === 'transfers'
              ? 'bg-[#171917] text-[#C8FF32] shadow-sm'
              : 'text-[#777B76] hover:text-[#171917]'
          }`}
        >
          <ArrowRightLeft className="w-4 h-4" />
          Stock Transfers ({transfers.length})
        </button>

        <button
          onClick={() => setActiveTab('disruptions')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all whitespace-nowrap ${
            activeTab === 'disruptions'
              ? 'bg-[#171917] text-[#C8FF32] shadow-sm'
              : 'text-[#777B76] hover:text-[#171917]'
          }`}
        >
          <Flame className="w-4 h-4" />
          Disruptions ({disruptions.length})
        </button>

        <button
          onClick={() => setActiveTab('movements')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all whitespace-nowrap ${
            activeTab === 'movements'
              ? 'bg-[#171917] text-[#C8FF32] shadow-sm'
              : 'text-[#777B76] hover:text-[#171917]'
          }`}
        >
          <History className="w-4 h-4" />
          Ledger History ({movements.length})
        </button>
      </div>

      {/* Tab 1: Inventory Table */}
      {activeTab === 'inventory' && (
        <div className="card-light overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#171917]">
              <thead className="bg-[#F8F9F6] text-[#777B76] uppercase font-mono text-[10px] border-b border-[#E8EAE4]">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">SKU Code</th>
                  <th className="px-5 py-3.5 font-semibold">Product Description</th>
                  <th className="px-5 py-3.5 font-semibold">Category</th>
                  <th className="px-5 py-3.5 text-right font-semibold">On-Hand</th>
                  <th className="px-5 py-3.5 text-right font-semibold">Available</th>
                  <th className="px-5 py-3.5 text-right font-semibold">Reserved</th>
                  <th className="px-5 py-3.5 text-right font-semibold">Inbound</th>
                  <th className="px-5 py-3.5 text-right font-semibold">Safety Buffer</th>
                  <th className="px-5 py-3.5 text-center font-semibold">Status</th>
                  <th className="px-5 py-3.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EAE4] font-mono">
                {inventory.map((item) => (
                  <tr key={item.id} className="hover:bg-[#F8F9F6] transition-colors">
                    <td className="px-5 py-3.5 font-bold text-[#171917]">{item.sku}</td>
                    <td className="px-5 py-3.5 font-sans font-medium text-[#171917]">{item.skuDescription}</td>
                    <td className="px-5 py-3.5 font-sans text-[#777B76]">{item.category}</td>
                    <td className="px-5 py-3.5 text-right font-bold text-[#171917]">
                      {(item.onHandUnits ?? item.availableUnits + item.reservedUnits).toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5 text-right text-[#171917] font-bold">
                      <span className="px-2 py-0.5 rounded-md bg-[#84E344]/15 text-[#1b6b0c] font-bold">
                        {item.availableUnits.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right text-[#777B76] font-medium">{item.reservedUnits.toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-right text-[#7185FF] font-semibold">{item.inboundUnits.toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-right text-[#777B76]">{item.safetyStockThreshold.toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-center font-sans">
                      <Badge
                        variant={
                          item.status === 'healthy'
                            ? 'success'
                            : item.status === 'constrained'
                            ? 'warning'
                            : 'critical'
                        }
                      >
                        {item.status.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-right font-sans">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onOpenStockAdjustment(item)}
                          className="px-2.5 py-1 bg-[#F0F1EE] hover:bg-[#E8EAE4] text-[#171917] rounded-lg text-[11px] font-medium transition-colors"
                          title="Adjust physical count with reason"
                        >
                          Adjust
                        </button>
                        {canRequestTransfer && (
                          <button
                            onClick={() => onOpenTransfer(warehouse.id, item.sku)}
                            className="btn-lime px-2.5 py-1 text-[11px]"
                            title="Transfer out to another hub"
                          >
                            Transfer
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Shortage Analysis */}
      {activeTab === 'shortages' && (
        <div className="space-y-4">
          {shortages.length === 0 ? (
            <div className="p-12 text-center card-light text-[#777B76]">
              <CheckCircle2 className="w-10 h-10 text-[#84E344] mx-auto mb-3" />
              <p className="text-base font-bold text-[#171917]">No stock shortages detected at {warehouse.name}.</p>
              <p className="text-xs text-[#777B76] mt-1">
                All inventory positions remain well above designated safety thresholds.
              </p>
            </div>
          ) : (
            <div className="card-light overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-[#171917]">
                  <thead className="bg-[#F8F9F6] text-[#777B76] uppercase font-mono text-[10px] border-b border-[#E8EAE4]">
                    <tr>
                      <th className="px-5 py-3.5 font-semibold">SKU</th>
                      <th className="px-5 py-3.5 font-semibold">Product Name</th>
                      <th className="px-5 py-3.5 text-right font-semibold">Available</th>
                      <th className="px-5 py-3.5 text-right font-semibold">Safety Threshold</th>
                      <th className="px-5 py-3.5 text-right font-semibold">Deficit Units</th>
                      <th className="px-5 py-3.5 text-center font-semibold">Severity</th>
                      <th className="px-5 py-3.5 text-right font-semibold">Orders Affected</th>
                      <th className="px-5 py-3.5 font-semibold">Recommended Mitigation</th>
                      <th className="px-5 py-3.5 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8EAE4] font-mono">
                    {shortages.map((item) => (
                      <tr key={item.sku} className="hover:bg-[#F8F9F6] transition-colors">
                        <td className="px-5 py-3.5 font-bold text-[#E85D68]">{item.sku}</td>
                        <td className="px-5 py-3.5 font-sans font-medium text-[#171917]">{item.skuDescription}</td>
                        <td className="px-5 py-3.5 text-right text-[#171917] font-semibold">{item.availableUnits.toLocaleString()}</td>
                        <td className="px-5 py-3.5 text-right text-[#777B76]">{item.safetyStockThreshold.toLocaleString()}</td>
                        <td className="px-5 py-3.5 text-right font-bold text-[#E85D68]">-{item.deficitUnits.toLocaleString()}</td>
                        <td className="px-5 py-3.5 text-center font-sans">
                          <Badge variant="critical">{item.severity.toUpperCase()}</Badge>
                        </td>
                        <td className="px-5 py-3.5 text-right font-bold text-[#171917]">{item.affectedOrdersCount}</td>
                        <td className="px-5 py-3.5 font-sans text-[#777B76] text-[11px]">{item.recommendedAction}</td>
                        <td className="px-5 py-3.5 text-right font-sans">
                          {canRequestTransfer && (
                            <button
                              onClick={() => onOpenTransfer(warehouse.id, item.sku)}
                              className="btn-lime px-2.5 py-1 text-[11px]"
                            >
                              Rebalance
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Incoming Shipments */}
      {activeTab === 'shipments' && (
        <div className="card-light overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#171917]">
              <thead className="bg-[#F8F9F6] text-[#777B76] uppercase font-mono text-[10px] border-b border-[#E8EAE4]">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">Tracking #</th>
                  <th className="px-5 py-3.5 font-semibold">Carrier</th>
                  <th className="px-5 py-3.5 font-semibold">Origin Hub</th>
                  <th className="px-5 py-3.5 font-semibold">Cargo Description</th>
                  <th className="px-5 py-3.5 font-semibold">Promised ETA</th>
                  <th className="px-5 py-3.5 font-semibold">Estimated ETA</th>
                  <th className="px-5 py-3.5 text-right font-semibold">Delay</th>
                  <th className="px-5 py-3.5 text-center font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EAE4] font-mono">
                {incomingShipments.map((shp) => (
                  <tr key={shp.id} className="hover:bg-[#F8F9F6] transition-colors">
                    <td className="px-5 py-3.5 font-bold text-[#171917]">{shp.trackingNumber}</td>
                    <td className="px-5 py-3.5 font-sans font-medium text-[#171917]">{shp.carrierName}</td>
                    <td className="px-5 py-3.5 font-sans text-[#777B76]">{shp.origin}</td>
                    <td className="px-5 py-3.5 font-sans text-[#171917]">{shp.cargoDescription}</td>
                    <td className="px-5 py-3.5 text-[#777B76]">{new Date(shp.promisedDeliveryDate).toLocaleDateString()}</td>
                    <td className="px-5 py-3.5 text-[#171917] font-medium">{new Date(shp.estimatedDeliveryDate).toLocaleDateString()}</td>
                    <td className="px-5 py-3.5 text-right">
                      {shp.delayHours > 0 ? (
                        <span className="text-[#E85D68] font-bold">+{shp.delayHours}h</span>
                      ) : (
                        <span className="text-[#84E344] font-semibold">On Time</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-center font-sans">
                      <Badge variant={shp.status === 'on_schedule' ? 'success' : 'critical'}>
                        {shp.status.replace('_', ' ').toUpperCase()}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Outgoing Orders */}
      {activeTab === 'orders' && (
        <div className="card-light overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#171917]">
              <thead className="bg-[#F8F9F6] text-[#777B76] uppercase font-mono text-[10px] border-b border-[#E8EAE4]">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">Order ID</th>
                  <th className="px-5 py-3.5 font-semibold">Customer</th>
                  <th className="px-5 py-3.5 font-semibold">Priority</th>
                  <th className="px-5 py-3.5 font-semibold">SKU</th>
                  <th className="px-5 py-3.5 text-right font-semibold">Quantity</th>
                  <th className="px-5 py-3.5 text-right font-semibold">Order Value</th>
                  <th className="px-5 py-3.5 font-semibold">Promised Deadline</th>
                  <th className="px-5 py-3.5 text-center font-semibold">Breach Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EAE4] font-mono">
                {outgoingOrders.map((ord) => (
                  <tr key={ord.id} className="hover:bg-[#F8F9F6] transition-colors">
                    <td className="px-5 py-3.5 font-bold text-[#171917]">{ord.id}</td>
                    <td className="px-5 py-3.5 font-sans">
                      <div className="font-semibold text-[#171917]">{ord.customerName}</div>
                      <span className="text-[10px] text-[#777B76] font-mono">{ord.customerTier}</span>
                    </td>
                    <td className="px-5 py-3.5 font-sans">
                      <Badge variant={ord.priority === 'P1' ? 'critical' : ord.priority === 'P2' ? 'warning' : 'neutral'}>
                        {ord.priority}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 font-bold text-[#171917]">{ord.sku}</td>
                    <td className="px-5 py-3.5 text-right text-[#171917] font-bold">{ord.quantityUnits.toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-right text-[#171917] font-bold">
                      ${ord.orderValueUSD.toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5 text-[#777B76]">{new Date(ord.promisedDeadline).toLocaleDateString()}</td>
                    <td className="px-5 py-3.5 text-center font-sans">
                      <Badge
                        variant={
                          ord.riskLevel === 'critical'
                            ? 'critical'
                            : ord.riskLevel === 'high'
                            ? 'warning'
                            : 'success'
                        }
                      >
                        {ord.riskLevel.toUpperCase()}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 5: Transfer History */}
      {activeTab === 'transfers' && (
        <div className="card-light overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#171917]">
              <thead className="bg-[#F8F9F6] text-[#777B76] uppercase font-mono text-[10px] border-b border-[#E8EAE4]">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">Transfer ID</th>
                  <th className="px-5 py-3.5 font-semibold">Direction</th>
                  <th className="px-5 py-3.5 font-semibold">Route</th>
                  <th className="px-5 py-3.5 font-semibold">SKU</th>
                  <th className="px-5 py-3.5 text-right font-semibold">Units</th>
                  <th className="px-5 py-3.5 text-center font-semibold">Status</th>
                  <th className="px-5 py-3.5 font-semibold">Requested By</th>
                  <th className="px-5 py-3.5 font-semibold">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EAE4] font-mono">
                {transfers.map((t) => {
                  const isOutbound = t.sourceWarehouseId === warehouse.id;
                  return (
                    <tr key={t.id} className="hover:bg-[#F8F9F6] transition-colors">
                      <td className="px-5 py-3.5 font-bold text-[#171917]">{t.id}</td>
                      <td className="px-5 py-3.5 font-sans">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            isOutbound ? 'bg-[#F5C451]/15 text-[#8f6d14]' : 'bg-[#84E344]/15 text-[#1b6b0c]'
                          }`}
                        >
                          {isOutbound ? 'OUTBOUND' : 'INBOUND'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-[#777B76]">
                        {t.sourceWarehouseId} → {t.destinationWarehouseId}
                      </td>
                      <td className="px-5 py-3.5 font-bold text-[#171917]">{t.sku}</td>
                      <td className="px-5 py-3.5 text-right font-bold text-[#171917]">{t.quantity.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-center font-sans">
                        <Badge
                          variant={
                            t.status === 'RECEIVED'
                              ? 'success'
                              : t.status === 'IN_TRANSIT'
                              ? 'warning'
                              : t.status === 'APPROVED'
                              ? 'neutral'
                              : t.status === 'CANCELLED'
                              ? 'critical'
                              : 'neutral'
                          }
                        >
                          {t.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 font-sans text-[#777B76]">{t.requestedBy}</td>
                      <td className="px-5 py-3.5 font-sans text-[#777B76] text-[11px] truncate max-w-xs">{t.reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 6: Disruption History */}
      {activeTab === 'disruptions' && (
        <div className="space-y-3">
          {disruptions.length === 0 ? (
            <div className="p-12 text-center card-light text-[#777B76]">
              <CheckCircle2 className="w-10 h-10 text-[#84E344] mx-auto mb-3" />
              <p className="text-base font-bold text-[#171917]">No active disruptions impact {warehouse.name}.</p>
            </div>
          ) : (
            disruptions.map((dis) => (
              <div
                key={dis.id}
                className="card-light p-5 flex items-start justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-[#E85D68]">{dis.id}</span>
                    <Badge variant={dis.severity === 'critical' ? 'critical' : 'warning'}>
                      {dis.severity.toUpperCase()}
                    </Badge>
                    <span className="text-xs text-[#777B76] font-medium">• {dis.typeLabel}</span>
                  </div>
                  <h4 className="text-sm font-bold text-[#171917] mt-1.5">{dis.title}</h4>
                  <p className="text-xs text-[#777B76] mt-1 max-w-2xl">{dis.summary}</p>
                  <div className="flex items-center gap-4 mt-3 text-xs text-[#777B76] font-medium">
                    <span>Carrier / Location: {dis.location}</span>
                    <span className="text-[#E85D68] font-bold">+{dis.delayHours}h Delay</span>
                    <span>{dis.affectedOrderCount} Orders Impacted</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 7: Stock Movements Ledger */}
      {activeTab === 'movements' && (
        <div className="card-light overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#171917]">
              <thead className="bg-[#F8F9F6] text-[#777B76] uppercase font-mono text-[10px] border-b border-[#E8EAE4]">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">Timestamp</th>
                  <th className="px-5 py-3.5 font-semibold">Movement Type</th>
                  <th className="px-5 py-3.5 font-semibold">SKU</th>
                  <th className="px-5 py-3.5 text-right font-semibold">Units</th>
                  <th className="px-5 py-3.5 font-semibold">Source / Destination</th>
                  <th className="px-5 py-3.5 font-semibold">Actor</th>
                  <th className="px-5 py-3.5 font-semibold">Reason / Ref</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EAE4] font-mono">
                {movements.map((m) => (
                  <tr key={m.id} className="hover:bg-[#F8F9F6] transition-colors">
                    <td className="px-5 py-3.5 text-[#777B76]">{new Date(m.timestamp).toLocaleString()}</td>
                    <td className="px-5 py-3.5 font-sans">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          m.movementType === 'RECEIPT' || m.movementType === 'TRANSFER_IN'
                            ? 'bg-[#84E344]/15 text-[#1b6b0c]'
                            : 'bg-[#7185FF]/15 text-[#3b4ab0]'
                        }`}
                      >
                        {m.movementType}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-bold text-[#171917]">{m.sku}</td>
                    <td className="px-5 py-3.5 text-right font-bold text-[#171917]">{m.quantity.toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-[#777B76]">
                      {m.fromWarehouseId || 'EXT'} → {m.toWarehouseId || 'EXT'}
                    </td>
                    <td className="px-5 py-3.5 text-[#777B76]">{m.actorId || 'system'}</td>
                    <td className="px-5 py-3.5 font-sans text-[#777B76] text-[11px] truncate max-w-xs">{m.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
