import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { api } from '../services/httpApi';
import {
  WarehouseInventory,
  WarehouseEntity,
  Company,
  ProductItem,
  WarehouseTransferItem,
  StockMovementItem,
  ShortageItem,
} from '../types';
import {
  Warehouse as WarehouseIcon,
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
  Building2,
  Plus,
  Truck,
  History,
  Layers,
  RefreshCw,
} from 'lucide-react';
import { WarehouseDirectory } from '../components/warehouse/WarehouseDirectory';
import { WarehouseDetailView } from '../components/warehouse/WarehouseDetailView';
import { TransfersManagement } from '../components/warehouse/TransfersManagement';
import { ShortageAnalysisView } from '../components/warehouse/ShortageAnalysisView';
import { StockMovementLedger } from '../components/warehouse/StockMovementLedger';
import {
  AddWarehouseModal,
  EditWarehouseModal,
  AddProductModal,
  AddInventoryModal,
  RecordStockReceiptModal,
  RequestTransferModal,
  TransferActionModal,
} from '../components/warehouse/WarehouseModals';

export const InventoryPage: React.FC = () => {
  const { inventory, currentUser, showToast, refreshData } = useApp();

  // Primary Navigation Tabs
  const [activeTab, setActiveTab] = useState<'directory' | 'inventory' | 'transfers' | 'shortages' | 'movements'>('directory');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null);

  // Entities state
  const [warehouses, setWarehouses] = useState<WarehouseEntity[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [transfers, setTransfers] = useState<WarehouseTransferItem[]>([]);
  const [shortages, setShortages] = useState<ShortageItem[]>([]);
  const [movements, setMovements] = useState<StockMovementItem[]>([]);
  const [isLoadingSubData, setIsLoadingSubData] = useState(false);

  // Modals state
  const [isAddWarehouseOpen, setIsAddWarehouseOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<WarehouseEntity | null>(null);
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [isAddInventoryOpen, setIsAddInventoryOpen] = useState(false);
  const [targetWarehouseForInventory, setTargetWarehouseForInventory] = useState<string | undefined>(undefined);
  const [isStockReceiptOpen, setIsStockReceiptOpen] = useState(false);
  const [targetWarehouseForReceipt, setTargetWarehouseForReceipt] = useState<string | undefined>(undefined);
  const [isTransferRequestOpen, setIsTransferRequestOpen] = useState(false);
  const [transferDefaultSource, setTransferDefaultSource] = useState<string | undefined>(undefined);
  const [transferDefaultSku, setTransferDefaultSku] = useState<string | undefined>(undefined);
  const [actionModalTransfer, setActionModalTransfer] = useState<WarehouseTransferItem | null>(null);
  const [actionModalType, setActionModalType] = useState<'approve' | 'dispatch' | 'receive' | 'cancel' | null>(null);

  // Table search & filter for Global Inventory
  const [searchQuery, setSearchQuery] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Manual Adjustment Modal state
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [isSubmittingAdjust, setIsSubmittingAdjust] = useState(false);
  const [selectedItem, setSelectedItem] = useState<WarehouseInventory | null>(null);
  const [adjustWarehouseId, setAdjustWarehouseId] = useState('');
  const [adjustSku, setAdjustSku] = useState('');
  const [adjustType, setAdjustType] = useState('manual_adjustment');
  const [adjustMode, setAdjustMode] = useState<'delta' | 'exact'>('delta');
  const [adjustQuantityDelta, setAdjustQuantityDelta] = useState<number>(0);
  const [adjustExactOnHand, setAdjustExactOnHand] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState('Physical cycle count correction');

  // Permissions helpers
  const role = currentUser?.role;
  const userPerms = currentUser?.permissions || [];

  const canWriteWarehouses =
    userPerms.includes('warehouses:write') ||
    role === 'administrator' ||
    role === 'admin' ||
    role === 'supply_chain_manager';

  const canWriteProducts =
    userPerms.includes('products:write') ||
    role === 'administrator' ||
    role === 'admin' ||
    role === 'supply_chain_manager';

  const canWriteInventory =
    userPerms.includes('inventory:write') ||
    role === 'administrator' ||
    role === 'admin' ||
    role === 'warehouse_operator' ||
    role === 'supply_chain_manager';

  const canRequestTransfer =
    userPerms.includes('transfers:request') ||
    role === 'administrator' ||
    role === 'admin' ||
    role === 'supply_chain_manager' ||
    role === 'operations_analyst' ||
    role === 'warehouse_operator';

  const canApproveTransfer =
    userPerms.includes('transfers:approve') ||
    role === 'administrator' ||
    role === 'admin' ||
    role === 'supply_chain_manager' ||
    role === 'procurement_approver' ||
    role === 'director';

  const canDispatchTransfer =
    userPerms.includes('transfers:dispatch') ||
    role === 'administrator' ||
    role === 'admin' ||
    role === 'supply_chain_manager' ||
    role === 'warehouse_operator';

  const canReceiveTransfer =
    userPerms.includes('transfers:receive') ||
    role === 'administrator' ||
    role === 'admin' ||
    role === 'supply_chain_manager' ||
    role === 'warehouse_operator';

  // Fetch all supplementary warehouse and transfer datasets
  const fetchAllAuxData = useCallback(async () => {
    setIsLoadingSubData(true);
    try {
      const [whRes, compRes, prodRes, trfRes, shortRes, mvtRes] = await Promise.allSettled([
        api.getWarehouses(),
        api.getCompanies(),
        api.getProducts(),
        api.getAllTransfers(),
        api.getAllShortages(),
        api.getAllStockMovements(),
      ]);

      if (whRes.status === 'fulfilled') setWarehouses(whRes.value || []);
      if (compRes.status === 'fulfilled') {
        const compList = compRes.value || [];
        setCompanies(compList);
        const demoComp = compList.find((c) => c.isDemo || c.id === 'COMP-DIQ-01') || compList[0] || null;
        setCompany(demoComp);
      }
      if (prodRes.status === 'fulfilled') setProducts(prodRes.value || []);
      if (trfRes.status === 'fulfilled') setTransfers(trfRes.value || []);
      if (shortRes.status === 'fulfilled') setShortages(shortRes.value || []);
      if (mvtRes.status === 'fulfilled') setMovements(mvtRes.value || []);
    } catch (err: any) {
      console.error('Failed to load auxiliary warehouse data:', err);
    } finally {
      setIsLoadingSubData(false);
    }
  }, []);

  useEffect(() => {
    fetchAllAuxData();
  }, [fetchAllAuxData]);

  const handleRefreshEverything = async () => {
    await Promise.all([refreshData(), fetchAllAuxData()]);
  };

  // Distinct hubs & SKUs from inventory
  const distinctHubs = Array.from(
    new Map(
      (inventory || []).map((i) => [i.warehouseId, { id: i.warehouseId, name: i.warehouseName || i.warehouseId }])
    ).values()
  );
  const distinctSKUs = Array.from(new Set((inventory || []).map((i) => i.sku).filter(Boolean)));

  // Filtered inventory table
  const filteredInventory = (inventory || []).filter((item) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      (item.sku || '').toLowerCase().includes(q) ||
      (item.skuDescription || '').toLowerCase().includes(q) ||
      (item.warehouseName || '').toLowerCase().includes(q) ||
      (item.category || '').toLowerCase().includes(q);

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

  // Open adjustment modal
  const handleOpenRowAdjust = (item: WarehouseInventory) => {
    setSelectedItem(item);
    setAdjustWarehouseId(item.warehouseId);
    setAdjustSku(item.sku);
    setAdjustType('manual_adjustment');
    setAdjustMode('delta');
    setAdjustQuantityDelta(0);
    setAdjustExactOnHand(item.onHandUnits ?? item.availableUnits + item.reservedUnits);
    setAdjustReason('Physical cycle count correction');
    setIsAdjustModalOpen(true);
  };

  const handleOpenGeneralAdjust = () => {
    const defaultItem = inventory[0];
    if (defaultItem) {
      setSelectedItem(defaultItem);
      setAdjustWarehouseId(defaultItem.warehouseId);
      setAdjustSku(defaultItem.sku);
      setAdjustExactOnHand(defaultItem.onHandUnits ?? defaultItem.availableUnits + defaultItem.reservedUnits);
    }
    setAdjustType('manual_adjustment');
    setAdjustMode('delta');
    setAdjustQuantityDelta(0);
    setAdjustReason('Routine stock reconciliation');
    setIsAdjustModalOpen(true);
  };

  const activeAdjustItem =
    (inventory || []).find((i) => i.warehouseId === adjustWarehouseId && i.sku === adjustSku) || selectedItem;
  const activeCurrentOnHand = activeAdjustItem
    ? activeAdjustItem.onHandUnits ?? ((activeAdjustItem.availableUnits || 0) + (activeAdjustItem.reservedUnits || 0))
    : 0;
  const activeReserved = activeAdjustItem ? (activeAdjustItem.reservedUnits || 0) : 0;
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

    setIsSubmittingAdjust(true);
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
      await handleRefreshEverything();
    } catch (err: any) {
      showToast(err.message || 'Failed to adjust inventory.', 'error');
    } finally {
      setIsSubmittingAdjust(false);
    }
  };

  // Open transfer modal helpers
  const handleOpenTransferModal = (sourceWarehouseId?: string, sku?: string) => {
    setTransferDefaultSource(sourceWarehouseId);
    setTransferDefaultSku(sku);
    setIsTransferRequestOpen(true);
  };

  const handleOpenActionModal = (
    transfer: WarehouseTransferItem,
    action: 'approve' | 'dispatch' | 'receive' | 'cancel'
  ) => {
    setActionModalTransfer(transfer);
    setActionModalType(action);
  };

  return (
    <div className="space-y-6">
      {/* Top Application Header & Action Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight">Warehouse & Stock Operations</h1>
            <span className="px-2 py-0.5 bg-purple-600/20 border border-purple-500/40 text-[10px] font-mono text-purple-300 rounded font-semibold uppercase">
              Autonomous Grid
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time multi-echelon network intelligence, automatic inter-hub stock transfers, and shortage mitigation
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canRequestTransfer && (
            <button
              onClick={() => handleOpenTransferModal()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold shadow-md transition-colors"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              Transfer Stock
            </button>
          )}

          {canWriteInventory && (
            <>
              <button
                onClick={() => {
                  setTargetWarehouseForReceipt(undefined);
                  setIsStockReceiptOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-md transition-colors"
              >
                <Truck className="w-3.5 h-3.5" />
                Dock Receipt
              </button>
              <button
                onClick={handleOpenGeneralAdjust}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition-colors"
              >
                <Sliders className="w-3.5 h-3.5 text-purple-400" />
                Adjust Stock
              </button>
              <button
                onClick={() => {
                  setTargetWarehouseForInventory(undefined);
                  setIsAddInventoryOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-md transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Inventory Slot
              </button>
            </>
          )}

          {canWriteProducts && (
            <button
              onClick={() => setIsAddProductOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-semibold transition-colors"
            >
              <Package className="w-3.5 h-3.5 text-purple-400" />
              Add Product
            </button>
          )}

          {canWriteWarehouses && (
            <button
              onClick={() => setIsAddWarehouseOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-semibold transition-colors"
            >
              <WarehouseIcon className="w-3.5 h-3.5 text-purple-400" />
              Add Warehouse
            </button>
          )}
        </div>
      </div>

      {/* Main View: Either 360 Detail View OR Navigation Tabs */}
      {selectedWarehouseId ? (
        <WarehouseDetailView
          warehouseId={selectedWarehouseId}
          onBack={() => setSelectedWarehouseId(null)}
          onOpenEditWarehouse={(wh) => setEditingWarehouse(wh)}
          onOpenAddInventory={(whId) => {
            setTargetWarehouseForInventory(whId);
            setIsAddInventoryOpen(true);
          }}
          onOpenStockReceipt={(whId) => {
            setTargetWarehouseForReceipt(whId);
            setIsStockReceiptOpen(true);
          }}
          onOpenStockAdjustment={(item) => handleOpenRowAdjust(item)}
          onOpenTransfer={(srcWh, sku) => handleOpenTransferModal(srcWh, sku)}
          canWriteWarehouses={canWriteWarehouses}
          canWriteInventory={canWriteInventory}
          canRequestTransfer={canRequestTransfer}
          showToast={showToast}
        />
      ) : (
        <div className="space-y-6">
          {/* Top Page Tabs */}
          <div className="border-b border-slate-800 flex items-center gap-1 overflow-x-auto text-xs font-medium">
            <button
              onClick={() => setActiveTab('directory')}
              className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'directory'
                  ? 'border-purple-500 text-purple-400 bg-purple-500/10 font-semibold'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <WarehouseIcon className="w-4 h-4" />
              Warehouse Directory & Hubs ({warehouses.length})
            </button>

            <button
              onClick={() => setActiveTab('inventory')}
              className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'inventory'
                  ? 'border-purple-500 text-purple-400 bg-purple-500/10 font-semibold'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <Package className="w-4 h-4" />
              Global Inventory ({inventory.length})
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
              Inter-Hub Stock Transfers ({transfers.length})
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
              onClick={() => setActiveTab('movements')}
              className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'movements'
                  ? 'border-purple-500 text-purple-400 bg-purple-500/10 font-semibold'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <History className="w-4 h-4" />
              Movement Ledger ({movements.length})
            </button>
          </div>

          {/* TAB 1: Warehouse Directory */}
          {activeTab === 'directory' && (
            <WarehouseDirectory
              warehouses={warehouses}
              company={company}
              onSelectWarehouse={(id) => setSelectedWarehouseId(id)}
              onOpenAddWarehouse={() => setIsAddWarehouseOpen(true)}
              onOpenEditWarehouse={(wh) => setEditingWarehouse(wh)}
              onOpenTransferModal={(srcId) => handleOpenTransferModal(srcId)}
              canWriteWarehouses={canWriteWarehouses}
              canRequestTransfer={canRequestTransfer}
            />
          )}

          {/* TAB 2: Global Inventory */}
          {activeTab === 'inventory' && (
            <div className="space-y-6">
              {/* Network Overview Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg">
                  <span className="text-[10px] font-mono uppercase text-slate-400">Total Tracked SKUs</span>
                  <div className="text-xl font-bold font-mono text-white mt-1">
                    {distinctSKUs.length} SKUs across {distinctHubs.length} Hubs
                  </div>
                  <div className="text-xs text-slate-400 mt-1 truncate">
                    {distinctHubs.map((h) => h.name.split(' ')[0]).join(', ')}
                  </div>
                </div>

                <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg">
                  <span className="text-[10px] font-mono uppercase text-slate-400">Constrained Positions</span>
                  <div className="text-xl font-bold font-mono text-rose-400 mt-1">
                    {inventory.filter((i) => i.status === 'critical' || i.status === 'depleted').length} Hub Slots
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
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-md pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={warehouseFilter}
                    onChange={(e) => setWarehouseFilter(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                  >
                    <option value="all">All Hub Locations</option>
                    {distinctHubs.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.id} ({h.name})
                      </option>
                    ))}
                  </select>

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
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
              <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-lg">
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
                        {canWriteInventory && <th className="py-3 px-4 text-center">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {filteredInventory.map((item) => {
                        const onHand = item.onHandUnits ?? item.availableUnits + item.reservedUnits;
                        return (
                          <tr key={item.id} className="hover:bg-slate-850/60 transition-colors">
                            <td className="py-3 px-4">
                              <div className="font-semibold text-white">{item.warehouseName}</div>
                              <div className="text-[10px] text-slate-500 font-sans">{item.warehouseLocation}</div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-bold text-slate-100">{item.sku}</div>
                              <div className="text-[10px] text-slate-400 font-sans truncate max-w-xs">
                                {item.skuDescription}
                              </div>
                            </td>
                            <td className="py-3 px-4 font-sans text-slate-300">{item.category}</td>
                            <td className="py-3 px-4 text-right text-slate-200 tabular-nums">
                              {onHand.toLocaleString()}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <span
                                className={`font-bold tabular-nums text-sm ${
                                  item.availableUnits <= item.safetyStockThreshold
                                    ? 'text-rose-400'
                                    : 'text-emerald-400'
                                }`}
                              >
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
                            <td className="py-3 px-4 font-sans">{getStatusBadge(item.status)}</td>
                            <td className="py-3 px-4 text-right text-slate-300 tabular-nums">${item.unitCostUSD}</td>
                            {canWriteInventory && (
                              <td className="py-3 px-4 text-center font-sans">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => handleOpenRowAdjust(item)}
                                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-medium transition-colors"
                                  >
                                    Adjust
                                  </button>
                                  {canRequestTransfer && (
                                    <button
                                      onClick={() => handleOpenTransferModal(item.warehouseId, item.sku)}
                                      className="px-2 py-1 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 rounded text-[11px] font-medium transition-colors"
                                    >
                                      Transfer
                                    </button>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Stock Transfers Lifecycle */}
          {activeTab === 'transfers' && (
            <TransfersManagement
              transfers={transfers}
              onOpenRequestModal={() => handleOpenTransferModal()}
              onOpenActionModal={handleOpenActionModal}
              canRequestTransfer={canRequestTransfer}
              canApproveTransfer={canApproveTransfer}
              canDispatchTransfer={canDispatchTransfer}
              canReceiveTransfer={canReceiveTransfer}
            />
          )}

          {/* TAB 4: Shortage Analysis */}
          {activeTab === 'shortages' && (
            <ShortageAnalysisView
              shortages={shortages}
              warehouses={warehouses}
              onOpenTransfer={(destWh, sku) => {
                setTransferDefaultSku(sku);
                setIsTransferRequestOpen(true);
              }}
              canRequestTransfer={canRequestTransfer}
            />
          )}

          {/* TAB 5: Movement Ledger */}
          {activeTab === 'movements' && (
            <StockMovementLedger movements={movements} warehouses={warehouses} />
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODALS */}
      {/* ========================================================================= */}

      {/* 1. Add Warehouse Modal */}
      <AddWarehouseModal
        isOpen={isAddWarehouseOpen}
        onClose={() => setIsAddWarehouseOpen(false)}
        onSuccess={handleRefreshEverything}
        showToast={showToast}
        companies={companies}
      />

      {/* 2. Edit Warehouse Modal */}
      <EditWarehouseModal
        isOpen={Boolean(editingWarehouse)}
        onClose={() => setEditingWarehouse(null)}
        warehouse={editingWarehouse}
        onSuccess={handleRefreshEverything}
        showToast={showToast}
      />

      {/* 3. Add Product Modal */}
      <AddProductModal
        isOpen={isAddProductOpen}
        onClose={() => setIsAddProductOpen(false)}
        onSuccess={handleRefreshEverything}
        showToast={showToast}
      />

      {/* 4. Add Inventory Slot Modal */}
      <AddInventoryModal
        isOpen={isAddInventoryOpen}
        onClose={() => setIsAddInventoryOpen(false)}
        warehouses={warehouses}
        products={products}
        onSuccess={handleRefreshEverything}
        showToast={showToast}
      />

      {/* 5. Record Stock Receipt Modal */}
      <RecordStockReceiptModal
        isOpen={isStockReceiptOpen}
        onClose={() => setIsStockReceiptOpen(false)}
        warehouses={warehouses}
        inventory={inventory}
        onSuccess={handleRefreshEverything}
        showToast={showToast}
      />

      {/* 6. Request Inter-Hub Transfer Modal */}
      <RequestTransferModal
        isOpen={isTransferRequestOpen}
        onClose={() => setIsTransferRequestOpen(false)}
        warehouses={warehouses}
        inventory={inventory}
        defaultSourceWarehouseId={transferDefaultSource}
        defaultSku={transferDefaultSku}
        onSuccess={handleRefreshEverything}
        showToast={showToast}
      />

      {/* 7. Transfer Lifecycle Action Modal */}
      <TransferActionModal
        isOpen={Boolean(actionModalTransfer && actionModalType)}
        onClose={() => {
          setActionModalTransfer(null);
          setActionModalType(null);
        }}
        transfer={actionModalTransfer}
        actionType={actionModalType}
        onSuccess={handleRefreshEverything}
        showToast={showToast}
      />

      {/* 8. Manual Inventory Adjustment Modal */}
      <Modal
        isOpen={isAdjustModalOpen}
        onClose={() => !isSubmittingAdjust && setIsAdjustModalOpen(false)}
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
                onChange={(e) => setAdjustWarehouseId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-purple-500"
              >
                {distinctHubs.map((h) => (
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
                onChange={(e) => setAdjustSku(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-purple-500"
              >
                {distinctSKUs.map((sku) => (
                  <option key={sku} value={sku}>
                    {sku}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Current Position Snapshot Box */}
          <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-md">
            <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-2">
              Live Hub Position Snapshot
            </span>
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
                onChange={(e) => setAdjustType(e.target.value)}
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
                  className={`flex-1 py-1.5 text-center font-medium ${
                    adjustMode === 'delta' ? 'bg-purple-600 text-white' : 'bg-slate-950 text-slate-400'
                  }`}
                >
                  Delta (+/-)
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustMode('exact')}
                  className={`flex-1 py-1.5 text-center font-medium ${
                    adjustMode === 'exact' ? 'bg-purple-600 text-white' : 'bg-slate-950 text-slate-400'
                  }`}
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
                onChange={(e) => setAdjustQuantityDelta(parseInt(e.target.value) || 0)}
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
                onChange={(e) => setAdjustExactOnHand(parseInt(e.target.value) || 0)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-purple-500"
              />
            </div>
          )}

          {/* Result Preview Box */}
          <div className="p-3 bg-slate-950 border border-slate-800 rounded flex items-center justify-between font-mono">
            <div>
              <span className="text-[10px] text-slate-400 uppercase block">Resulting Available Stock</span>
              <span
                className={`text-base font-bold ${
                  activePredictedAvailable <= (activeAdjustItem?.safetyStockThreshold || 0)
                    ? 'text-rose-400'
                    : 'text-emerald-400'
                }`}
              >
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
              onChange={(e) => setAdjustReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              disabled={isSubmittingAdjust}
              onClick={() => setIsAdjustModalOpen(false)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingAdjust}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-semibold transition-colors"
            >
              {isSubmittingAdjust ? 'Applying...' : 'Commit Inventory Adjustment'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
