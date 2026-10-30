import React, { useState, useEffect } from 'react';
import { api } from '../../services/httpApi';
import { WarehouseDetailResponse, WarehouseEntity, WarehouseInventory, ShortageItem } from '../../types';
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
  Sliders,
  CheckCircle2,
  Clock,
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
      <div className="flex flex-col items-center justify-center p-16 text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin text-purple-500 mb-2" />
        <span>Loading warehouse intelligence 360° profile...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-xl">
        <p className="text-slate-300">Unable to load details for warehouse {warehouseId}.</p>
        <button
          onClick={onBack}
          className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs"
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
          className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Warehouse Directory
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {canRequestTransfer && (
            <button
              onClick={() => onOpenTransfer(warehouse.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 rounded text-xs font-semibold transition-colors"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              Transfer Stock
            </button>
          )}

          {canWriteInventory && (
            <>
              <button
                onClick={() => onOpenStockReceipt(warehouse.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 rounded text-xs font-semibold transition-colors"
              >
                <Truck className="w-3.5 h-3.5" />
                Dock Receipt
              </button>
              <button
                onClick={() => onOpenAddInventory(warehouse.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 rounded text-xs font-semibold transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Inventory Slot
              </button>
            </>
          )}

          {canWriteWarehouses && (
            <button
              onClick={() => onOpenEditWarehouse(warehouse)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-semibold transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" />
              Edit Facility
            </button>
          )}
        </div>
      </div>

      {/* Warehouse Hub Identity Card */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-purple-600/20 border border-purple-500/40 rounded-xl text-purple-400">
              <WarehouseIcon className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-purple-400">{warehouse.id}</span>
                <Badge variant={whStatus === 'active' ? 'success' : 'warning'}>
                  {whStatus.toUpperCase()}
                </Badge>
                {warehouse.isDemo && (
                  <span className="px-2 py-0.5 bg-slate-800 text-[10px] font-mono text-slate-400 rounded">
                    Demo Hub
                  </span>
                )}
              </div>
              <h1 className="text-xl font-bold text-white mt-1">{warehouse.name}</h1>
              <p className="text-xs text-slate-400 flex items-center gap-2 mt-1">
                <MapPin className="w-3.5 h-3.5 text-purple-400" />
                {warehouse.location} • {warehouse.country}
              </p>
              <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-slate-500" />
                  Operated by: <strong className="text-slate-200">{company?.name || 'DisruptionIQ Logistics Pvt. Ltd.'}</strong>
                </span>
                {warehouse.managerName && (
                  <span>
                    Facility Manager: <strong className="text-slate-200">{warehouse.managerName}</strong>
                  </span>
                )}
                {warehouse.contactEmail && (
                  <span className="font-mono text-purple-300 text-[11px]">{warehouse.contactEmail}</span>
                )}
              </div>
            </div>
          </div>

          {/* Capacity Metrics */}
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800/80 md:w-80 shrink-0 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Storage Capacity</span>
              <span className="font-mono font-bold text-white">
                {(warehouse.totalCapacitySqm || 20000).toLocaleString()} m²
              </span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div className="bg-purple-500 h-full rounded-full" style={{ width: '68%' }} />
            </div>
            <div className="flex justify-between items-center text-[11px] text-slate-400 pt-1">
              <span>Dock Doors:</span>
              <span className="font-mono text-emerald-400 font-semibold">
                {warehouse.availableDockDoors || 12} Active Doors
              </span>
            </div>
            <div className="flex justify-between items-center text-[11px] text-slate-400">
              <span>Estimated Space Usage:</span>
              <span className="font-mono text-purple-300 font-semibold">68% Utilized</span>
            </div>
          </div>
        </div>

        {/* Aggregate KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mt-6 pt-5 border-t border-slate-800">
          <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
            <span className="text-[10px] font-mono uppercase text-slate-400">Total On-Hand</span>
            <div className="text-lg font-bold font-mono text-white mt-0.5">{totalOnHand.toLocaleString()}</div>
            <div className="text-[10px] text-slate-500">{inventory.length} Stocked SKUs</div>
          </div>

          <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
            <span className="text-[10px] font-mono uppercase text-slate-400">Available Stock</span>
            <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">
              {totalAvailable.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-500">Unreserved physical stock</div>
          </div>

          <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
            <span className="text-[10px] font-mono uppercase text-slate-400">Reserved Units</span>
            <div className="text-lg font-bold font-mono text-amber-400 mt-0.5">{totalReserved.toLocaleString()}</div>
            <div className="text-[10px] text-slate-500">Allocated to orders/transfers</div>
          </div>

          <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
            <span className="text-[10px] font-mono uppercase text-slate-400">Inbound Freight</span>
            <div className="text-lg font-bold font-mono text-blue-400 mt-0.5">{totalInbound.toLocaleString()}</div>
            <div className="text-[10px] text-slate-500">{incomingShipments.length} Incoming Shipments</div>
          </div>

          <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
            <span className="text-[10px] font-mono uppercase text-slate-400">Critical Shortages</span>
            <div className="text-lg font-bold font-mono text-rose-400 mt-0.5">{shortages.length} Positions</div>
            <div className="text-[10px] text-slate-500">Below safety stock</div>
          </div>

          <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
            <span className="text-[10px] font-mono uppercase text-slate-400">Active Disruptions</span>
            <div className="text-lg font-bold font-mono text-purple-400 mt-0.5">{disruptions.length} Events</div>
            <div className="text-[10px] text-slate-500">Linked to this node</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-800 flex items-center gap-1 overflow-x-auto text-xs font-medium">
        <button
          onClick={() => setActiveTab('inventory')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'inventory'
              ? 'border-purple-500 text-purple-400 bg-purple-500/10 font-semibold'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Package className="w-4 h-4" />
          Warehouse Inventory ({inventory.length})
        </button>

        <button
          onClick={() => setActiveTab('shortages')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'shortages'
              ? 'border-purple-500 text-purple-400 bg-purple-500/10 font-semibold'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Shortage Analysis ({shortages.length})
        </button>

        <button
          onClick={() => setActiveTab('shipments')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'shipments'
              ? 'border-purple-500 text-purple-400 bg-purple-500/10 font-semibold'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Truck className="w-4 h-4" />
          Incoming Shipments ({incomingShipments.length})
        </button>

        <button
          onClick={() => setActiveTab('orders')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'orders'
              ? 'border-purple-500 text-purple-400 bg-purple-500/10 font-semibold'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          Outgoing Orders ({outgoingOrders.length})
        </button>

        <button
          onClick={() => setActiveTab('transfers')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'transfers'
              ? 'border-purple-500 text-purple-400 bg-purple-500/10 font-semibold'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <ArrowRightLeft className="w-4 h-4" />
          Stock Transfers ({transfers.length})
        </button>

        <button
          onClick={() => setActiveTab('disruptions')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'disruptions'
              ? 'border-purple-500 text-purple-400 bg-purple-500/10 font-semibold'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Flame className="w-4 h-4" />
          Disruptions ({disruptions.length})
        </button>

        <button
          onClick={() => setActiveTab('movements')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'movements'
              ? 'border-purple-500 text-purple-400 bg-purple-500/10 font-semibold'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <History className="w-4 h-4" />
          Ledger History ({movements.length})
        </button>
      </div>

      {/* Tab 1: Inventory Table */}
      {activeTab === 'inventory' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">SKU Code</th>
                  <th className="px-4 py-3">Product Description</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-right">On-Hand</th>
                  <th className="px-4 py-3 text-right">Available</th>
                  <th className="px-4 py-3 text-right">Reserved</th>
                  <th className="px-4 py-3 text-right">Inbound</th>
                  <th className="px-4 py-3 text-right">Safety Buffer</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {inventory.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 font-bold text-white">{item.sku}</td>
                    <td className="px-4 py-3 font-sans text-slate-200">{item.skuDescription}</td>
                    <td className="px-4 py-3 font-sans text-slate-400">{item.category}</td>
                    <td className="px-4 py-3 text-right font-semibold text-white">
                      {item.onHandUnits ?? item.availableUnits + item.reservedUnits}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-400 font-bold">{item.availableUnits}</td>
                    <td className="px-4 py-3 text-right text-amber-400">{item.reservedUnits}</td>
                    <td className="px-4 py-3 text-right text-blue-400">{item.inboundUnits}</td>
                    <td className="px-4 py-3 text-right text-slate-400">{item.safetyStockThreshold}</td>
                    <td className="px-4 py-3 text-center">
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
                    <td className="px-4 py-3 text-right font-sans">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onOpenStockAdjustment(item)}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-[11px] transition-colors"
                          title="Adjust physical count with reason"
                        >
                          Adjust
                        </button>
                        {canRequestTransfer && (
                          <button
                            onClick={() => onOpenTransfer(warehouse.id, item.sku)}
                            className="px-2 py-1 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 rounded text-[11px] transition-colors"
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
            <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-xl text-slate-400">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-white font-semibold">No stock shortages detected at {warehouse.name}.</p>
              <p className="text-xs text-slate-400 mt-1">
                All inventory positions remain above designated safety thresholds.
              </p>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/60 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Product Name</th>
                    <th className="px-4 py-3 text-right">Available</th>
                    <th className="px-4 py-3 text-right">Safety Threshold</th>
                    <th className="px-4 py-3 text-right">Deficit Units</th>
                    <th className="px-4 py-3 text-center">Severity</th>
                    <th className="px-4 py-3 text-right">Orders Affected</th>
                    <th className="px-4 py-3">Recommended Mitigation</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {shortages.map((item) => (
                    <tr key={item.sku} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 font-bold text-rose-400">{item.sku}</td>
                      <td className="px-4 py-3 font-sans text-white">{item.skuDescription}</td>
                      <td className="px-4 py-3 text-right text-slate-300">{item.availableUnits}</td>
                      <td className="px-4 py-3 text-right text-amber-400">{item.safetyStockThreshold}</td>
                      <td className="px-4 py-3 text-right font-bold text-rose-400">-{item.deficitUnits}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="critical">{item.severity.toUpperCase()}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-white">{item.affectedOrdersCount}</td>
                      <td className="px-4 py-3 font-sans text-slate-300 text-[11px]">{item.recommendedAction}</td>
                      <td className="px-4 py-3 text-right font-sans">
                        {canRequestTransfer && (
                          <button
                            onClick={() => onOpenTransfer(warehouse.id, item.sku)}
                            className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-[11px] font-medium transition-colors"
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
          )}
        </div>
      )}

      {/* Tab 3: Incoming Shipments */}
      {activeTab === 'shipments' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/60 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Tracking #</th>
                <th className="px-4 py-3">Carrier</th>
                <th className="px-4 py-3">Origin Hub</th>
                <th className="px-4 py-3">Cargo Description</th>
                <th className="px-4 py-3">Promised ETA</th>
                <th className="px-4 py-3">Estimated ETA</th>
                <th className="px-4 py-3 text-right">Delay</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {incomingShipments.map((shp) => (
                <tr key={shp.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 font-bold text-purple-400">{shp.trackingNumber}</td>
                  <td className="px-4 py-3 font-sans text-white">{shp.carrierName}</td>
                  <td className="px-4 py-3 font-sans text-slate-400">{shp.origin}</td>
                  <td className="px-4 py-3 font-sans text-slate-300">{shp.cargoDescription}</td>
                  <td className="px-4 py-3 text-slate-400">{new Date(shp.promisedDeliveryDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-slate-300">{new Date(shp.estimatedDeliveryDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    {shp.delayHours > 0 ? (
                      <span className="text-rose-400 font-bold">+{shp.delayHours}h</span>
                    ) : (
                      <span className="text-emerald-400">On Time</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={shp.status === 'on_schedule' ? 'success' : 'critical'}>
                      {shp.status.replace('_', ' ').toUpperCase()}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 4: Outgoing Orders */}
      {activeTab === 'orders' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/60 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Order ID</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3 text-right">Quantity</th>
                <th className="px-4 py-3 text-right">Order Value</th>
                <th className="px-4 py-3">Promised Deadline</th>
                <th className="px-4 py-3 text-center">Breach Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {outgoingOrders.map((ord) => (
                <tr key={ord.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 font-bold text-white">{ord.id}</td>
                  <td className="px-4 py-3 font-sans text-slate-200">
                    <div>{ord.customerName}</div>
                    <span className="text-[10px] text-slate-500 font-mono">{ord.customerTier}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={ord.priority === 'P1' ? 'critical' : ord.priority === 'P2' ? 'warning' : 'neutral'}>
                      {ord.priority}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-bold text-purple-400">{ord.sku}</td>
                  <td className="px-4 py-3 text-right text-white font-semibold">{ord.quantityUnits}</td>
                  <td className="px-4 py-3 text-right text-emerald-400 font-semibold">
                    ${ord.orderValueUSD.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{new Date(ord.promisedDeadline).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-center">
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
      )}

      {/* Tab 5: Transfer History */}
      {activeTab === 'transfers' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/60 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Transfer ID</th>
                <th className="px-4 py-3">Direction</th>
                <th className="px-4 py-3">Route</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3 text-right">Units</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3">Requested By</th>
                <th className="px-4 py-3">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {transfers.map((t) => {
                const isOutbound = t.sourceWarehouseId === warehouse.id;
                return (
                  <tr key={t.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 font-bold text-white">{t.id}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isOutbound ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'
                        }`}
                      >
                        {isOutbound ? 'OUTBOUND' : 'INBOUND'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {t.sourceWarehouseId} → {t.destinationWarehouseId}
                    </td>
                    <td className="px-4 py-3 font-bold text-purple-400">{t.sku}</td>
                    <td className="px-4 py-3 text-right font-bold text-white">{t.quantity}</td>
                    <td className="px-4 py-3 text-center">
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
                    <td className="px-4 py-3 text-slate-400">{t.requestedBy}</td>
                    <td className="px-4 py-3 font-sans text-slate-300 text-[11px] truncate max-w-xs">{t.reason}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 6: Disruption History */}
      {activeTab === 'disruptions' && (
        <div className="space-y-3">
          {disruptions.length === 0 ? (
            <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-xl text-slate-400">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-white font-semibold">No active disruptions impact {warehouse.name}.</p>
            </div>
          ) : (
            disruptions.map((dis) => (
              <div
                key={dis.id}
                className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex items-start justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-rose-400">{dis.id}</span>
                    <Badge variant={dis.severity === 'critical' ? 'critical' : 'warning'}>
                      {dis.severity.toUpperCase()}
                    </Badge>
                    <span className="text-xs text-slate-400 font-sans">• {dis.typeLabel}</span>
                  </div>
                  <h4 className="text-sm font-bold text-white mt-1">{dis.title}</h4>
                  <p className="text-xs text-slate-300 mt-1 max-w-2xl">{dis.summary}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                    <span>Carrier / Location: {dis.location}</span>
                    <span className="text-rose-400 font-bold">+{dis.delayHours}h Delay</span>
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
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/60 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Movement Type</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3 text-right">Units</th>
                <th className="px-4 py-3">Source / Destination</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Reason / Ref</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {movements.map((m) => (
                <tr key={m.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 text-slate-400">{new Date(m.timestamp).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        m.movementType === 'RECEIPT' || m.movementType === 'TRANSFER_IN'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-purple-500/20 text-purple-300'
                      }`}
                    >
                      {m.movementType}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-bold text-white">{m.sku}</td>
                  <td className="px-4 py-3 text-right font-bold text-white">{m.quantity}</td>
                  <td className="px-4 py-3 text-slate-300">
                    {m.fromWarehouseId || 'EXT'} → {m.toWarehouseId || 'EXT'}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{m.actorId || 'system'}</td>
                  <td className="px-4 py-3 font-sans text-slate-300 text-[11px] truncate max-w-xs">{m.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
