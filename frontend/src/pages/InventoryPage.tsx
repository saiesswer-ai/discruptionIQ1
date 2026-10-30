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

  const distinctHubs = Array.from(
    new Map((inventory || []).map((i) => [i.warehouseId, { id: i.warehouseId, name: i.warehouseName }])).values()
  );
  const distinctSKUs = Array.from(new Set((inventory || []).map((i) => i.sku)));

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
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-[#171917] tracking-tight">Warehouse &amp; Stock Operations</h1>
            <span className="px-2.5 py-0.5 bg-[#C8FF32] text-[#080908] text-[10px] font-mono rounded-full font-bold uppercase tracking-wider">
              LIVE GRID
            </span>
          </div>
          <p className="text-xs text-[#777B76] mt-1">
            Real-time multi-echelon network intelligence, automatic inter-hub stock transfers, and shortage mitigation
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canWriteInventory && (
            <>
              <button
                onClick={() => {
                  setTargetWarehouseForReceipt(undefined);
                  setIsStockReceiptOpen(true);
                }}
                className="bg-white hover:bg-[#F8F9F6] border border-[#E8EAE4] text-[#171917] rounded-xl px-3.5 py-2 text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
              >
                <Truck className="w-3.5 h-3.5 text-[#171917]" />
                <span>Dock Receipt</span>
              </button>
              <button
                onClick={handleOpenGeneralAdjust}
                className="bg-white hover:bg-[#F8F9F6] border border-[#E8EAE4] text-[#171917] rounded-xl px-3.5 py-2 text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
              >
                <Sliders className="w-3.5 h-3.5 text-[#171917]" />
                <span>Adjust Stock</span>
              </button>
              <button
                onClick={() => {
                  setTargetWarehouseForInventory(undefined);
                  setIsAddInventoryOpen(true);
                }}
                className="bg-white hover:bg-[#F8F9F6] border border-[#E8EAE4] text-[#171917] rounded-xl px-3.5 py-2 text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-[#171917]" />
                <span>Add Slot</span>
              </button>
            </>
          )}

          {canWriteWarehouses && (
            <button
              onClick={() => setIsAddWarehouseOpen(true)}
              className="bg-white hover:bg-[#F8F9F6] border border-[#E8EAE4] text-[#171917] rounded-xl px-3.5 py-2 text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-[#171917]" />
              <span>Add Hub</span>
            </button>
          )}

          {canRequestTransfer && (
            <button
              onClick={() => handleOpenTransferModal()}
              className="btn-lime text-xs py-2 px-3.5"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>Transfer Stock</span>
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
          <div className="flex items-center gap-1.5 p-1 bg-[#F0F1EE] rounded-2xl border border-[#E8EAE4] overflow-x-auto text-xs font-semibold">
            <button
              onClick={() => setActiveTab('directory')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all whitespace-nowrap ${
                activeTab === 'directory'
                  ? 'bg-white text-[#171917] shadow-sm'
                  : 'text-[#777B76] hover:text-[#171917]'
              }`}
            >
              <WarehouseIcon className="w-3.5 h-3.5" />
              <span>Hubs Directory ({warehouses.length || 5})</span>
            </button>

            <button
              onClick={() => setActiveTab('inventory')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all whitespace-nowrap ${
                activeTab === 'inventory'
                  ? 'bg-white text-[#171917] shadow-sm'
                  : 'text-[#777B76] hover:text-[#171917]'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>Global Inventory ({inventory.length || 7})</span>
            </button>

            <button
              onClick={() => setActiveTab('transfers')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all whitespace-nowrap ${
                activeTab === 'transfers'
                  ? 'bg-white text-[#171917] shadow-sm'
                  : 'text-[#777B76] hover:text-[#171917]'
              }`}
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>Stock Transfers ({transfers.length || 2})</span>
            </button>

            <button
              onClick={() => setActiveTab('shortages')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all whitespace-nowrap ${
                activeTab === 'shortages'
                  ? 'bg-white text-[#171917] shadow-sm'
                  : 'text-[#777B76] hover:text-[#171917]'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Shortage Analysis ({shortages.length || 7})</span>
            </button>

            <button
              onClick={() => setActiveTab('movements')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all whitespace-nowrap ${
                activeTab === 'movements'
                  ? 'bg-white text-[#171917] shadow-sm'
                  : 'text-[#777B76] hover:text-[#171917]'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Movement Ledger ({movements.length || 2})</span>
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
                <div className="card-light p-5">
                  <span className="text-[10px] font-mono uppercase text-[#777B76] font-semibold">Total Tracked SKUs</span>
                  <div className="text-xl font-bold font-mono text-[#171917] mt-1">
                    {distinctSKUs.length} SKUs across {distinctHubs.length} Hubs
                  </div>
                  <div className="text-xs text-[#777B76] mt-1 truncate">
                    {distinctHubs.map((h) => h.name.split(' ')[0]).join(', ')}
                  </div>
                </div>

                <div className="card-light p-5">
                  <span className="text-[10px] font-mono uppercase text-[#777B76] font-semibold">Constrained Positions</span>
                  <div className="text-xl font-bold font-mono text-[#9E1B26] mt-1">
                    {inventory.filter((i) => i.status === 'critical' || i.status === 'depleted').length} Hub Slots
                  </div>
                  <div className="text-xs text-[#777B76] mt-1">Positions at or below safety buffer</div>
                </div>

                <div className="card-light p-5">
                  <span className="text-[10px] font-mono uppercase text-[#777B76] font-semibold">Total Available Units</span>
                  <div className="text-xl font-bold font-mono text-[#2E7D32] mt-1">
                    {inventory.reduce((acc, curr) => acc + curr.availableUnits, 0).toLocaleString()} Units
                  </div>
                  <div className="text-xs text-[#777B76] mt-1">Unreserved physical inventory</div>
                </div>

                <div className="card-light p-5">
                  <span className="text-[10px] font-mono uppercase text-[#777B76] font-semibold">Total Reserved Orders</span>
                  <div className="text-xl font-bold font-mono text-[#171917] mt-1">
                    {inventory.reduce((acc, curr) => acc + curr.reservedUnits, 0).toLocaleString()} Units
                  </div>
                  <div className="text-xs text-[#777B76] mt-1">Allocated to customer purchase orders</div>
                </div>
              </div>

              {/* Filter and Action Bar */}
              <div className="card-light p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="relative w-full sm:w-80">
                  <Search className="w-4 h-4 text-[#777B76] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search SKU, description, hub..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl pl-9 pr-3.5 py-2 text-xs text-[#171917] placeholder:text-[#A0A39D] focus:outline-none focus:border-[#C8FF32] focus:ring-2 focus:ring-[#C8FF32]/50 transition-all"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={warehouseFilter}
                    onChange={(e) => setWarehouseFilter(e.target.value)}
                    className="bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl px-3 py-1.5 text-xs text-[#171917] font-medium focus:outline-none focus:border-[#C8FF32]"
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
                    className="bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl px-3 py-1.5 text-xs text-[#171917] font-medium focus:outline-none focus:border-[#C8FF32]"
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
              <div className="card-light p-0 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F8F9F6] text-[#777B76] font-semibold border-b border-[#E8EAE4]">
                      <tr>
                        <th className="py-3.5 px-4">Warehouse &amp; Hub</th>
                        <th className="py-3.5 px-4">SKU / Component</th>
                        <th className="py-3.5 px-4">Category</th>
                        <th className="py-3.5 px-4 text-right">Physical On-Hand</th>
                        <th className="py-3.5 px-4 text-right">Available</th>
                        <th className="py-3.5 px-4 text-right">Reserved</th>
                        <th className="py-3.5 px-4 text-right">Inbound Pipe</th>
                        <th className="py-3.5 px-4 text-right">Safety Buffer</th>
                        <th className="py-3.5 px-4">Stock Status</th>
                        <th className="py-3.5 px-4 text-right">Unit Cost</th>
                        {canWriteInventory && <th className="py-3.5 px-4 text-center">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8EAE4] font-mono">
                      {filteredInventory.map((item) => {
                        const onHand = item.onHandUnits ?? item.availableUnits + item.reservedUnits;
                        return (
                          <tr key={item.id} className="hover:bg-[#F8F9F6] transition-colors">
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-[#171917]">{item.warehouseName}</div>
                              <div className="text-[10px] text-[#777B76] font-sans">{item.warehouseLocation}</div>
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-[#171917]">{item.sku}</div>
                              <div className="text-[10px] text-[#777B76] font-sans truncate max-w-xs">
                                {item.skuDescription}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 font-sans text-[#171917]">{item.category}</td>
                            <td className="py-3.5 px-4 text-right text-[#171917] tabular-nums font-semibold">
                              {onHand.toLocaleString()}
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <span
                                className={`font-bold tabular-nums text-sm ${
                                  item.availableUnits <= item.safetyStockThreshold
                                    ? 'text-[#9E1B26]'
                                    : 'text-[#2E7D32]'
                                }`}
                              >
                                {item.availableUnits.toLocaleString()}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right text-[#777B76] tabular-nums font-semibold">
                              {item.reservedUnits.toLocaleString()}
                            </td>
                            <td className="py-3.5 px-4 text-right text-[#7185FF] tabular-nums font-semibold">
                              +{item.inboundUnits.toLocaleString()}
                            </td>
                            <td className="py-3.5 px-4 text-right text-[#777B76] tabular-nums">
                              {item.safetyStockThreshold.toLocaleString()}
                            </td>
                            <td className="py-3.5 px-4 font-sans">{getStatusBadge(item.status)}</td>
                            <td className="py-3.5 px-4 text-right text-[#171917] tabular-nums font-semibold">${item.unitCostUSD}</td>
                            {canWriteInventory && (
                              <td className="py-3.5 px-4 text-center font-sans">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => handleOpenRowAdjust(item)}
                                    className="btn-secondary text-[11px] py-1 px-2.5"
                                  >
                                    Adjust
                                  </button>
                                  {canRequestTransfer && (
                                    <button
                                      onClick={() => handleOpenTransferModal(item.warehouseId, item.sku)}
                                      className="btn-lime text-[11px] py-1 px-2.5 font-semibold"
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

      {/* Modals */}
      <AddWarehouseModal
        isOpen={isAddWarehouseOpen}
        onClose={() => setIsAddWarehouseOpen(false)}
        onSuccess={handleRefreshEverything}
        showToast={showToast}
        companies={companies}
      />

      <EditWarehouseModal
        isOpen={Boolean(editingWarehouse)}
        onClose={() => setEditingWarehouse(null)}
        warehouse={editingWarehouse}
        onSuccess={handleRefreshEverything}
        showToast={showToast}
      />

      <AddProductModal
        isOpen={isAddProductOpen}
        onClose={() => setIsAddProductOpen(false)}
        onSuccess={handleRefreshEverything}
        showToast={showToast}
      />

      <AddInventoryModal
        isOpen={isAddInventoryOpen}
        onClose={() => setIsAddInventoryOpen(false)}
        warehouses={warehouses}
        products={products}
        onSuccess={handleRefreshEverything}
        showToast={showToast}
      />

      <RecordStockReceiptModal
        isOpen={isStockReceiptOpen}
        onClose={() => setIsStockReceiptOpen(false)}
        warehouses={warehouses}
        inventory={inventory}
        onSuccess={handleRefreshEverything}
        showToast={showToast}
      />

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

      {/* Manual Inventory Adjustment Modal */}
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
              <label className="block text-xs font-semibold text-[#171917] mb-1.5">Target Hub *</label>
              <select
                value={adjustWarehouseId}
                onChange={(e) => setAdjustWarehouseId(e.target.value)}
                className="w-full bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl px-3 py-2 text-[#171917] font-mono focus:outline-none focus:border-[#C8FF32]"
              >
                {distinctHubs.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.id} ({h.name})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#171917] mb-1.5">Component SKU *</label>
              <select
                value={adjustSku}
                onChange={(e) => setAdjustSku(e.target.value)}
                className="w-full bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl px-3 py-2 text-[#171917] font-mono focus:outline-none focus:border-[#C8FF32]"
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
          <div className="p-4 bg-[#F8F9F6] border border-[#E8EAE4] rounded-2xl">
            <span className="text-[10px] text-[#777B76] uppercase font-bold block mb-2">
              Live Hub Position Snapshot
            </span>
            <div className="grid grid-cols-4 gap-2 text-center font-mono text-xs">
              <div className="p-2.5 bg-white rounded-xl border border-[#E8EAE4]">
                <span className="text-[10px] text-[#777B76] block">On-Hand</span>
                <span className="text-[#171917] font-bold text-sm">{activeCurrentOnHand}</span>
              </div>
              <div className="p-2.5 bg-white rounded-xl border border-[#E8EAE4]">
                <span className="text-[10px] text-[#777B76] block">Reserved</span>
                <span className="text-[#805400] font-bold text-sm">{activeReserved}</span>
              </div>
              <div className="p-2.5 bg-white rounded-xl border border-[#E8EAE4]">
                <span className="text-[10px] text-[#777B76] block">Available</span>
                <span className="text-[#2E7D32] font-bold text-sm">{activeAdjustItem?.availableUnits || 0}</span>
              </div>
              <div className="p-2.5 bg-white rounded-xl border border-[#E8EAE4]">
                <span className="text-[10px] text-[#777B76] block">Safety Min</span>
                <span className="text-[#777B76] font-bold text-sm">{activeAdjustItem?.safetyStockThreshold || 0}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#171917] mb-1.5">Adjustment Type</label>
              <select
                value={adjustType}
                onChange={(e) => setAdjustType(e.target.value)}
                className="w-full bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl px-3 py-2 text-[#171917] focus:outline-none focus:border-[#C8FF32]"
              >
                <option value="manual_adjustment">Manual Adjustment</option>
                <option value="cycle_count">Cycle Count Variance</option>
                <option value="receipt">Direct Receipt / Unloading</option>
                <option value="write_off">Damaged / Scrap Write-Off</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#171917] mb-1.5">Entry Mode</label>
              <div className="flex rounded-xl border border-[#E8EAE4] overflow-hidden p-0.5 bg-[#F8F9F6]">
                <button
                  type="button"
                  onClick={() => setAdjustMode('delta')}
                  className={`flex-1 py-1.5 rounded-lg text-center font-semibold transition-all ${
                    adjustMode === 'delta' ? 'bg-[#171917] text-white shadow-xs' : 'text-[#777B76]'
                  }`}
                >
                  Delta (+/-)
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustMode('exact')}
                  className={`flex-1 py-1.5 rounded-lg text-center font-semibold transition-all ${
                    adjustMode === 'exact' ? 'bg-[#171917] text-white shadow-xs' : 'text-[#777B76]'
                  }`}
                >
                  New Count
                </button>
              </div>
            </div>
          </div>

          {adjustMode === 'delta' ? (
            <div>
              <label className="block text-xs font-semibold text-[#171917] mb-1.5">Quantity Delta (+/- units) *</label>
              <input
                type="number"
                value={adjustQuantityDelta}
                onChange={(e) => setAdjustQuantityDelta(parseInt(e.target.value) || 0)}
                className="w-full bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl px-3.5 py-2 text-[#171917] font-mono focus:outline-none focus:border-[#C8FF32]"
              />
              <span className="text-[10px] text-[#777B76] mt-1 block">Positive adds inventory, negative deducts.</span>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-[#171917] mb-1.5">New Total On-Hand Count *</label>
              <input
                type="number"
                min="0"
                value={adjustExactOnHand}
                onChange={(e) => setAdjustExactOnHand(parseInt(e.target.value) || 0)}
                className="w-full bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl px-3.5 py-2 text-[#171917] font-mono focus:outline-none focus:border-[#C8FF32]"
              />
            </div>
          )}

          {/* Result Preview Box */}
          <div className="p-4 bg-[#F8F9F6] border border-[#E8EAE4] rounded-2xl flex items-center justify-between font-mono">
            <div>
              <span className="text-[10px] text-[#777B76] uppercase block font-semibold">Resulting Available Stock</span>
              <span
                className={`text-base font-bold ${
                  activePredictedAvailable <= (activeAdjustItem?.safetyStockThreshold || 0)
                    ? 'text-[#9E1B26]'
                    : 'text-[#2E7D32]'
                }`}
              >
                {activePredictedAvailable} Units
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-[#777B76] uppercase block font-semibold">Derived Status</span>
              <span className="text-xs font-bold uppercase text-[#171917]">
                {activePredictedAvailable <= 0
                  ? 'DEPLETED'
                  : activePredictedAvailable < (activeAdjustItem?.safetyStockThreshold || 0)
                  ? 'CRITICAL BUFFER'
                  : 'HEALTHY'}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#171917] mb-1.5">Operational Reason &amp; Authorization *</label>
            <input
              type="text"
              required
              placeholder="e.g. Approved warehouse cycle count variance ticket #CC-882"
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              className="w-full bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl px-3.5 py-2 text-[#171917] focus:outline-none focus:border-[#C8FF32] focus:ring-2 focus:ring-[#C8FF32]/50"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E8EAE4]">
            <button
              type="button"
              disabled={isSubmittingAdjust}
              onClick={() => setIsAdjustModalOpen(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingAdjust}
              className="btn-lime"
            >
              {isSubmittingAdjust ? 'Applying...' : 'Commit Inventory Adjustment'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
