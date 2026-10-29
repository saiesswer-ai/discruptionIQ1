import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { api } from '../services/httpApi';
import { WarehouseInventory } from '../types';
import {
  Warehouse,
  Search,
  Filter,
  Package,
  AlertTriangle,
  ArrowDownRight,
  TrendingUp,
  Sliders,
  ArrowRightLeft,
  CheckCircle2,
  Edit2,
} from 'lucide-react';

export const InventoryPage: React.FC = () => {
  const { inventory, currentUser, showToast, refreshData } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modals
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Selected item for adjustment
  const [selectedItem, setSelectedItem] = useState<WarehouseInventory | null>(null);

  // Form states - Adjust
  const [adjustWarehouseId, setAdjustWarehouseId] = useState('');
  const [adjustSku, setAdjustSku] = useState('');
  const [adjustType, setAdjustType] = useState('manual_adjustment');
  const [adjustMode, setAdjustMode] = useState<'delta' | 'exact'>('delta');
  const [adjustQuantityDelta, setAdjustQuantityDelta] = useState<number>(0);
  const [adjustExactOnHand, setAdjustExactOnHand] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState('Physical cycle count correction');

  // Form states - Transfer
  const [transferSku, setTransferSku] = useState('');
  const [transferFromWarehouse, setTransferFromWarehouse] = useState('');
  const [transferToWarehouse, setTransferToWarehouse] = useState('');
  const [transferQuantity, setTransferQuantity] = useState<number>(10);
  const [transferReason, setTransferReason] = useState('Inter-hub stock rebalance');

  const canWrite =
    currentUser?.permissions?.includes('inventory:write') ||
    currentUser?.role === 'administrator' ||
    currentUser?.role === 'admin' ||
    currentUser?.role === 'warehouse_operator' ||
    currentUser?.role === 'supply_chain_manager';

  const distinctHubs = Array.from(
    new Map(inventory.map(i => [i.warehouseId, { id: i.warehouseId, name: i.warehouseName }])).values()
  );
  const distinctSKUs = Array.from(new Set(inventory.map(i => i.sku)));

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

  // Open adjustment modal for specific row item
  const handleOpenRowAdjust = (item: WarehouseInventory) => {
    setSelectedItem(item);
    setAdjustWarehouseId(item.warehouseId);
    setAdjustSku(item.sku);
    setAdjustType('manual_adjustment');
    setAdjustMode('delta');
    setAdjustQuantityDelta(0);
    setAdjustExactOnHand(item.onHandUnits ?? (item.availableUnits + item.reservedUnits));
    setAdjustReason('Routine stock reconciliation');
    setIsAdjustModalOpen(true);
  };

  const handleOpenGeneralAdjust = () => {
    const defaultItem = inventory[0];
    if (defaultItem) {
      setSelectedItem(defaultItem);
      setAdjustWarehouseId(defaultItem.warehouseId);
      setAdjustSku(defaultItem.sku);
      setAdjustExactOnHand(defaultItem.onHandUnits ?? (defaultItem.availableUnits + defaultItem.reservedUnits));
    }
    setAdjustType('manual_adjustment');
    setAdjustMode('delta');
    setAdjustQuantityDelta(0);
    setAdjustReason('Physical cycle count correction');
    setIsAdjustModalOpen(true);
  };

  const handleOpenTransferModal = () => {
    const defaultItem = inventory.find(i => i.availableUnits > 0) || inventory[0];
    if (defaultItem) {
      setTransferSku(defaultItem.sku);
      setTransferFromWarehouse(defaultItem.warehouseId);
      const otherHub = distinctHubs.find(h => h.id !== defaultItem.warehouseId);
      setTransferToWarehouse(otherHub?.id || '');
    }
    setTransferQuantity(10);
    setTransferReason('Inter-hub stock rebalance');
    setIsTransferModalOpen(true);
  };

  // Live item resolution for modal calculations
  const activeAdjustItem =
    inventory.find(i => i.warehouseId === adjustWarehouseId && i.sku === adjustSku) || selectedItem;
  const activeCurrentOnHand = activeAdjustItem
    ? activeAdjustItem.onHandUnits ?? (activeAdjustItem.availableUnits + activeAdjustItem.reservedUnits)
    : 0;
  const activeReserved = activeAdjustItem ? activeAdjustItem.reservedUnits : 0;
  const activePredictedOnHand =
    adjustMode === 'delta' ? activeCurrentOnHand + adjustQuantityDelta : adjustExactOnHand;
  const activePredictedAvailable = activePredictedOnHand - activeReserved;

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAdjustItem) return;
    if (activePredictedOnHand < 0) {
      showToast('Adjustment cannot result in negative physical stock.', 'warning');
      return;
    }
    if (activePredictedAvailable < 0) {
      showToast(`Cannot adjust below reserved units (${activeReserved} units allocated).`, 'warning');
      return;
    }
    if (!adjustReason.trim()) {
      showToast('Adjustment reason is required for the audit trail.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: any = {
        warehouseId: adjustWarehouseId,
        sku: adjustSku,
        adjustmentType: adjustType,
        reason: adjustReason.trim(),
        reference: `AUTH-${Date.now().toString().slice(-6)}`,
      };
      if (adjustMode === 'delta') {
        payload.quantityDelta = Number(adjustQuantityDelta);
      } else {
        payload.newOnHandUnits = Number(adjustExactOnHand);
      }

      const res = await api.adjustInventory(payload);
      showToast(`Inventory updated for SKU ${res.sku} at ${res.warehouseId}.`, 'success');
      setIsAdjustModalOpen(false);
      await refreshData();
    } catch (err: any) {
      showToast(err.message || 'Failed to adjust inventory.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Transfer source item
  const transferSourceItem = inventory.find(
    i => i.warehouseId === transferFromWarehouse && i.sku === transferSku
  );

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (transferFromWarehouse === transferToWarehouse) {
      showToast('Source and destination warehouses must be different.', 'warning');
      return;
    }
    if (!transferSourceItem || transferSourceItem.availableUnits < transferQuantity) {
      showToast(
        `Insufficient available units at source (Available: ${transferSourceItem?.availableUnits || 0}).`,
        'warning'
      );
      return;
    }
    if (transferQuantity <= 0) {
      showToast('Transfer quantity must be greater than zero.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.transferInventory({
        fromWarehouseId: transferFromWarehouse,
        toWarehouseId: transferToWarehouse,
        sku: transferSku,
        quantity: Number(transferQuantity),
        reason: transferReason.trim() || 'Inter-hub replenishment',
      });
      showToast(
        `Successfully transferred ${transferQuantity} units of ${transferSku} from ${transferFromWarehouse} to ${transferToWarehouse}.`,
        'success'
      );
      setIsTransferModalOpen(false);
      await refreshData();
    } catch (err: any) {
      showToast(err.message || 'Failed to execute stock movement.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Network Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg">
          <span className="text-[10px] font-mono uppercase text-slate-400">Total Tracked SKUs</span>
          <div className="text-xl font-bold font-mono text-white mt-1">
            {distinctSKUs.length} SKUs across {distinctHubs.length} Hubs
          </div>
          <div className="text-xs text-slate-400 mt-1 truncate">
            {distinctHubs.map(h => h.name.split(' ')[0]).join(', ')}
          </div>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg">
          <span className="text-[10px] font-mono uppercase text-slate-400">Constrained Positions</span>
          <div className="text-xl font-bold font-mono text-rose-400 mt-1">
            {inventory.filter(i => i.status === 'critical' || i.status === 'depleted').length} Hub Slots
          </div>
          <div className="text-xs text-slate-400 mt-1">Positions at or below safety buffer</div>
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

      {/* Filter and Action Bar */}
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

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={warehouseFilter}
            onChange={e => setWarehouseFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
          >
            <option value="all">All Hub Locations</option>
            {distinctHubs.map(h => (
              <option key={h.id} value={h.id}>
                {h.id} ({h.name})
              </option>
            ))}
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

          {canWrite && (
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={handleOpenGeneralAdjust}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-md text-xs font-semibold transition-colors"
              >
                <Sliders className="w-3.5 h-3.5 text-purple-400" />
                <span>Adjust Stock</span>
              </button>
              <button
                onClick={handleOpenTransferModal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-md text-xs font-semibold transition-colors shadow-xs"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>Transfer Stock</span>
              </button>
            </div>
          )}
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
                <th className="py-3 px-4 text-right">Physical On-Hand</th>
                <th className="py-3 px-4 text-right">Available</th>
                <th className="py-3 px-4 text-right">Reserved</th>
                <th className="py-3 px-4 text-right">Inbound Pipe</th>
                <th className="py-3 px-4 text-right">Safety Buffer</th>
                <th className="py-3 px-4">Stock Status</th>
                <th className="py-3 px-4 text-right">Unit Cost</th>
                {canWrite && <th className="py-3 px-4 text-center">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredInventory.map(item => {
                const onHand = item.onHandUnits ?? item.availableUnits + item.reservedUnits;
                return (
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
                    <td className="py-3 px-4 text-right text-slate-200 tabular-nums">
                      {onHand.toLocaleString()}
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
                    {canWrite && (
                      <td className="py-3 px-4 text-center font-sans">
                        <button
                          onClick={() => handleOpenRowAdjust(item)}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-medium transition-colors"
                        >
                          Adjust
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Adjust Stock */}
      <Modal
        isOpen={isAdjustModalOpen}
        onClose={() => !isSubmitting && setIsAdjustModalOpen(false)}
        title="Adjust Warehouse Inventory"
        subtitle="Apply controlled physical inventory reconciliation with automated status recalculation"
        maxWidth="lg"
      >
        <form onSubmit={handleAdjustSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Target Hub *</label>
              <select
                value={adjustWarehouseId}
                onChange={e => setAdjustWarehouseId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-purple-500"
              >
                {distinctHubs.map(h => (
                  <option key={h.id} value={h.id}>
                    {h.id} ({h.name})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">Component SKU *</label>
              <select
                value={adjustSku}
                onChange={e => setAdjustSku(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-purple-500"
              >
                {distinctSKUs.map(sku => (
                  <option key={sku} value={sku}>
                    {sku}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Current Position Snapshot Box */}
          <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-md">
            <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-2">Live Hub Position Snapshot</span>
            <div className="grid grid-cols-4 gap-2 text-center font-mono text-xs">
              <div className="p-2 bg-slate-900 rounded">
                <span className="text-[10px] text-slate-500 block">On-Hand</span>
                <span className="text-white font-bold">{activeCurrentOnHand}</span>
              </div>
              <div className="p-2 bg-slate-900 rounded">
                <span className="text-[10px] text-slate-500 block">Reserved</span>
                <span className="text-amber-400 font-bold">{activeReserved}</span>
              </div>
              <div className="p-2 bg-slate-900 rounded">
                <span className="text-[10px] text-slate-500 block">Available</span>
                <span className="text-emerald-400 font-bold">{activeAdjustItem?.availableUnits || 0}</span>
              </div>
              <div className="p-2 bg-slate-900 rounded">
                <span className="text-[10px] text-slate-500 block">Safety Min</span>
                <span className="text-slate-400 font-bold">{activeAdjustItem?.safetyStockThreshold || 0}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Adjustment Type</label>
              <select
                value={adjustType}
                onChange={e => setAdjustType(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
              >
                <option value="manual_adjustment">Manual Adjustment</option>
                <option value="cycle_count">Cycle Count Variance</option>
                <option value="receipt">Direct Receipt / Unloading</option>
                <option value="write_off">Damaged / Scrap Write-Off</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">Entry Mode</label>
              <div className="flex rounded border border-slate-800 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setAdjustMode('delta')}
                  className={`flex-1 py-1.5 text-center font-medium ${adjustMode === 'delta' ? 'bg-purple-600 text-white' : 'bg-slate-950 text-slate-400'}`}
                >
                  Delta (+/-)
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustMode('exact')}
                  className={`flex-1 py-1.5 text-center font-medium ${adjustMode === 'exact' ? 'bg-purple-600 text-white' : 'bg-slate-950 text-slate-400'}`}
                >
                  New Count
                </button>
              </div>
            </div>
          </div>

          {adjustMode === 'delta' ? (
            <div>
              <label className="block text-slate-300 font-medium mb-1">Quantity Delta (+/- units) *</label>
              <input
                type="number"
                value={adjustQuantityDelta}
                onChange={e => setAdjustQuantityDelta(parseInt(e.target.value) || 0)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-purple-500"
              />
              <span className="text-[10px] text-slate-500">Positive adds inventory, negative deducts.</span>
            </div>
          ) : (
            <div>
              <label className="block text-slate-300 font-medium mb-1">New Total On-Hand Count *</label>
              <input
                type="number"
                min="0"
                value={adjustExactOnHand}
                onChange={e => setAdjustExactOnHand(parseInt(e.target.value) || 0)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-purple-500"
              />
            </div>
          )}

          {/* Result Preview Box */}
          <div className="p-3 bg-slate-950 border border-slate-800 rounded flex items-center justify-between font-mono">
            <div>
              <span className="text-[10px] text-slate-400 uppercase block">Resulting Available Stock</span>
              <span className={`text-base font-bold ${activePredictedAvailable <= (activeAdjustItem?.safetyStockThreshold || 0) ? 'text-rose-400' : 'text-emerald-400'}`}>
                {activePredictedAvailable} Units
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 uppercase block">Derived Status</span>
              <span className="text-xs font-semibold uppercase text-slate-200">
                {activePredictedAvailable <= 0
                  ? 'DEPLETED'
                  : activePredictedAvailable < (activeAdjustItem?.safetyStockThreshold || 0)
                  ? 'CRITICAL BUFFER'
                  : 'HEALTHY'}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Operational Reason & Authorization *</label>
            <input
              type="text"
              required
              placeholder="e.g. Approved warehouse cycle count variance ticket #CC-882"
              value={adjustReason}
              onChange={e => setAdjustReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setIsAdjustModalOpen(false)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-semibold transition-colors"
            >
              {isSubmitting ? 'Applying...' : 'Commit Inventory Adjustment'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Transfer Stock */}
      <Modal
        isOpen={isTransferModalOpen}
        onClose={() => !isSubmitting && setIsTransferModalOpen(false)}
        title="Inter-Hub Stock Movement"
        subtitle="Transfer physical component inventory between logistics centers transactionally"
        maxWidth="lg"
      >
        <form onSubmit={handleTransferSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-medium mb-1">Component SKU *</label>
            <select
              value={transferSku}
              onChange={e => setTransferSku(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-purple-500"
            >
              {distinctSKUs.map(sku => (
                <option key={sku} value={sku}>
                  {sku}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">From Source Hub *</label>
              <select
                value={transferFromWarehouse}
                onChange={e => setTransferFromWarehouse(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-purple-500"
              >
                {distinctHubs.map(h => (
                  <option key={h.id} value={h.id}>
                    {h.id} ({h.name})
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-emerald-400 font-mono block mt-1">
                Avail: {transferSourceItem?.availableUnits || 0} units
              </span>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">To Destination Hub *</label>
              <select
                value={transferToWarehouse}
                onChange={e => setTransferToWarehouse(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-purple-500"
              >
                {distinctHubs.map(h => (
                  <option key={h.id} value={h.id} disabled={h.id === transferFromWarehouse}>
                    {h.id} ({h.name})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Transfer Quantity (Units) *</label>
            <input
              type="number"
              min="1"
              max={transferSourceItem?.availableUnits || 99999}
              value={transferQuantity}
              onChange={e => setTransferQuantity(parseInt(e.target.value) || 0)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Transfer Justification / Reason *</label>
            <input
              type="text"
              required
              placeholder="e.g. Replenish European stock buffer for high-priority P1 orders"
              value={transferReason}
              onChange={e => setTransferReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setIsTransferModalOpen(false)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-semibold transition-colors"
            >
              {isSubmitting ? 'Transferring...' : 'Execute Inter-Hub Transfer'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
