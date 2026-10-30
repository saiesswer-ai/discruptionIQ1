import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { api } from '../../services/httpApi';
import { WarehouseEntity, WarehouseInventory, ProductItem, WarehouseTransferItem } from '../../types';
import { AlertTriangle, CheckCircle2, ArrowRightLeft, Package, Warehouse as WarehouseIcon } from 'lucide-react';

// ============================================================================
// 1. Add Warehouse Modal
// ============================================================================
interface AddWarehouseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  companies: Array<{ id: string; name: string }>;
}

export const AddWarehouseModal: React.FC<AddWarehouseModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  showToast,
  companies,
}) => {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [companyId, setCompanyId] = useState(companies[0]?.id || 'COMP-DIQ-01');
  const [totalCapacitySqm, setTotalCapacitySqm] = useState(25000);
  const [availableDockDoors, setAvailableDockDoors] = useState(16);
  const [managerName, setManagerName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (companies.length > 0 && !companyId) {
      setCompanyId(companies[0].id);
    }
  }, [companies, companyId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !location.trim() || !country.trim()) {
      showToast('Name, location, and country are required.', 'warning');
      return;
    }
    setIsSubmitting(true);
    try {
      await api.createWarehouse({
        name: name.trim(),
        location: location.trim(),
        city: city.trim() || location.trim().split(',')[0],
        country: country.trim(),
        companyId: companyId || undefined,
        totalCapacitySqm: Number(totalCapacitySqm),
        availableDockDoors: Number(availableDockDoors),
        managerName: managerName.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
      });
      showToast(`Warehouse '${name}' created successfully.`, 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Failed to create warehouse.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Register New Warehouse Hub"
      subtitle="Commission a new storage and distribution hub in the supply chain network"
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Facility Name *</label>
          <input
            type="text"
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
            placeholder="e.g. Frankfurt Air Logistics Hub"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Location / Address *</label>
            <input
              type="text"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
              placeholder="e.g. Frankfurt Airport, CargoCity"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">City</label>
            <input
              type="text"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
              placeholder="e.g. Frankfurt"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Country *</label>
            <input
              type="text"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
              placeholder="e.g. Germany"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Operating Company</label>
            <select
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Total Capacity (sqm) *</label>
            <input
              type="number"
              min="1000"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
              value={totalCapacitySqm}
              onChange={(e) => setTotalCapacitySqm(Math.max(1, Number(e.target.value)))}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Dock Doors</label>
            <input
              type="number"
              min="1"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
              value={availableDockDoors}
              onChange={(e) => setAvailableDockDoors(Math.max(1, Number(e.target.value)))}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Hub Manager Name</label>
            <input
              type="text"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
              placeholder="e.g. Klaus Richter"
              value={managerName}
              onChange={(e) => setManagerName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Contact Email</label>
            <input
              type="email"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
              placeholder="e.g. klaus.richter@disruptioniq.demo"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Registering...' : 'Create Warehouse'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

// ============================================================================
// 2. Edit Warehouse Modal
// ============================================================================
interface EditWarehouseModalProps {
  isOpen: boolean;
  onClose: () => void;
  warehouse: WarehouseEntity | null;
  onSuccess: () => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export const EditWarehouseModal: React.FC<EditWarehouseModalProps> = ({
  isOpen,
  onClose,
  warehouse,
  onSuccess,
  showToast,
}) => {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [totalCapacitySqm, setTotalCapacitySqm] = useState(20000);
  const [availableDockDoors, setAvailableDockDoors] = useState(12);
  const [managerName, setManagerName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [operatingStatus, setOperatingStatus] = useState('active');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (warehouse) {
      setName(warehouse.name);
      setLocation(warehouse.location);
      setTotalCapacitySqm(warehouse.totalCapacitySqm || 20000);
      setAvailableDockDoors(warehouse.availableDockDoors || 12);
      setManagerName(warehouse.managerName || '');
      setContactEmail(warehouse.contactEmail || '');
      setOperatingStatus(warehouse.status || warehouse.operatingStatus || 'active');
    }
  }, [warehouse]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!warehouse) return;
    setIsSubmitting(true);
    try {
      await api.updateWarehouse(warehouse.id, {
        name: name.trim() || undefined,
        location: location.trim() || undefined,
        totalCapacitySqm: Number(totalCapacitySqm),
        availableDockDoors: Number(availableDockDoors),
        managerName: managerName.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        status: operatingStatus,
      });
      showToast(`Warehouse '${warehouse.name}' updated successfully.`, 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Failed to update warehouse.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!warehouse) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Edit Facility: ${warehouse.name}`}
      subtitle={`Facility ID: ${warehouse.id} • Operating in ${warehouse.location}`}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Facility Name</label>
          <input
            type="text"
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Location</label>
          <input
            type="text"
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Total Capacity (sqm)</label>
            <input
              type="number"
              min="1000"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
              value={totalCapacitySqm}
              onChange={(e) => setTotalCapacitySqm(Math.max(1, Number(e.target.value)))}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Dock Doors</label>
            <input
              type="number"
              min="1"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
              value={availableDockDoors}
              onChange={(e) => setAvailableDockDoors(Math.max(1, Number(e.target.value)))}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Manager Name</label>
            <input
              type="text"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
              value={managerName}
              onChange={(e) => setManagerName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Operating Status</label>
            <select
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
              value={operatingStatus}
              onChange={(e) => setOperatingStatus(e.target.value)}
            >
              <option value="active">Active (Full Operation)</option>
              <option value="maintenance">Maintenance (Restricted)</option>
              <option value="restricted">Restricted Access</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Contact Email</label>
          <input
            type="email"
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Saving...' : 'Update Warehouse'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

// ============================================================================
// 3. Add Product / SKU Modal
// ============================================================================
interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export const AddProductModal: React.FC<AddProductModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  showToast,
}) => {
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Electronics');
  const [unitCostUSD, setUnitCostUSD] = useState(150);
  const [description, setDescription] = useState('');
  const [dimensionsCm, setDimensionsCm] = useState('20x15x10');
  const [weightKg, setWeightKg] = useState(1.5);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sku.trim() || !name.trim()) {
      showToast('SKU code and name are required.', 'warning');
      return;
    }
    setIsSubmitting(true);
    try {
      await api.createProduct({
        sku: sku.trim().toUpperCase(),
        name: name.trim(),
        category,
        unitCostUSD: Number(unitCostUSD),
        description: description.trim() || undefined,
        dimensionsCm: dimensionsCm.trim() || undefined,
        weightKg: Number(weightKg),
      });
      showToast(`SKU '${sku}' catalogued successfully.`, 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Failed to catalogue SKU.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Catalogue New Product / SKU"
      subtitle="Register an enterprise product into the DisruptionIQ catalog"
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">SKU Code *</label>
            <input
              type="text"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white uppercase font-mono focus:outline-none focus:border-purple-500"
              placeholder="e.g. SKU-SEN-21"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Category *</label>
            <select
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="Electronics">Electronics</option>
              <option value="Sensors">Sensors</option>
              <option value="Optics">Optics</option>
              <option value="Computing">Computing</option>
              <option value="Power">Power Systems</option>
              <option value="Connectivity">Connectivity</option>
              <option value="Navigation">Navigation</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Product Title *</label>
          <input
            type="text"
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
            placeholder="e.g. LiDAR Precision Sensor Module"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Description</label>
          <textarea
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
            rows={2}
            placeholder="e.g. High-performance distance ranging module for robotics"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Unit Cost ($)</label>
            <input
              type="number"
              min="1"
              step="0.01"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
              value={unitCostUSD}
              onChange={(e) => setUnitCostUSD(Math.max(0.01, Number(e.target.value)))}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Dimensions (cm)</label>
            <input
              type="text"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
              value={dimensionsCm}
              onChange={(e) => setDimensionsCm(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Weight (kg)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
              value={weightKg}
              onChange={(e) => setWeightKg(Math.max(0.01, Number(e.target.value)))}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Cataloguing...' : 'Save Product'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

// ============================================================================
// 4. Add Inventory Slot Modal
// ============================================================================
interface AddInventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  warehouses: WarehouseEntity[];
  products: ProductItem[];
  onSuccess: () => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export const AddInventoryModal: React.FC<AddInventoryModalProps> = ({
  isOpen,
  onClose,
  warehouses,
  products,
  onSuccess,
  showToast,
}) => {
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || '');
  const [sku, setSku] = useState(products[0]?.sku || '');
  const [onHandUnits, setOnHandUnits] = useState(100);
  const [safetyStockThreshold, setSafetyStockThreshold] = useState(30);
  const [unitCostUSD, setUnitCostUSD] = useState(150);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (warehouses.length > 0 && !warehouseId) setWarehouseId(warehouses[0].id);
    if (products.length > 0 && !sku) {
      setSku(products[0].sku);
      setUnitCostUSD(products[0].unitCostUSD || 150);
    }
  }, [warehouses, products, warehouseId, sku]);

  const handleSkuChange = (newSku: string) => {
    setSku(newSku);
    const p = products.find((x) => x.sku === newSku);
    if (p) setUnitCostUSD(p.unitCostUSD);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!warehouseId || !sku) {
      showToast('Warehouse and SKU are required.', 'warning');
      return;
    }
    setIsSubmitting(true);
    try {
      await api.createInventorySlot({
        warehouseId,
        sku,
        onHandUnits: Number(onHandUnits),
        safetyStockThreshold: Number(safetyStockThreshold),
        unitCostUSD: Number(unitCostUSD),
      });
      showToast(`Inventory slot for ${sku} provisioned at ${warehouseId}.`, 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Failed to create inventory position.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Provision Warehouse Inventory Position"
      subtitle="Allocate an initial stocking slot for a catalog SKU at a specific hub"
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Target Warehouse *</label>
          <select
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            required
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.id} — {w.name} ({w.location})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Product / SKU *</label>
          <select
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white font-mono focus:outline-none focus:border-purple-500"
            value={sku}
            onChange={(e) => handleSkuChange(e.target.value)}
            required
          >
            {products.map((p) => (
              <option key={p.sku} value={p.sku}>
                {p.sku} — {p.name} (${p.unitCostUSD})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Initial On-Hand</label>
            <input
              type="number"
              min="0"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
              value={onHandUnits}
              onChange={(e) => setOnHandUnits(Math.max(0, Number(e.target.value)))}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Safety Stock Buffer</label>
            <input
              type="number"
              min="0"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
              value={safetyStockThreshold}
              onChange={(e) => setSafetyStockThreshold(Math.max(0, Number(e.target.value)))}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Unit Valuation ($)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
              value={unitCostUSD}
              onChange={(e) => setUnitCostUSD(Math.max(0.01, Number(e.target.value)))}
              required
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Provisioning...' : 'Add Inventory Slot'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

// ============================================================================
// 5. Record Stock Receipt Modal (Dock Inbound)
// ============================================================================
interface RecordStockReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  warehouses: WarehouseEntity[];
  inventory: WarehouseInventory[];
  onSuccess: () => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export const RecordStockReceiptModal: React.FC<RecordStockReceiptModalProps> = ({
  isOpen,
  onClose,
  warehouses,
  inventory,
  onSuccess,
  showToast,
}) => {
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || '');
  const [sku, setSku] = useState('');
  const [quantity, setQuantity] = useState(50);
  const [receiptReference, setReceiptReference] = useState('');
  const [notes, setNotes] = useState('Supplier pallet delivery gate check passed');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (warehouses.length > 0 && !warehouseId) setWarehouseId(warehouses[0].id);
    if (!receiptReference) {
      setReceiptReference(`RCV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
    }
  }, [warehouses, warehouseId, receiptReference]);

  const availableSkusForWarehouse = inventory
    .filter((i) => i.warehouseId === warehouseId)
    .map((i) => ({ sku: i.sku, name: i.skuDescription, onHand: i.onHandUnits }));

  useEffect(() => {
    if (availableSkusForWarehouse.length > 0 && !availableSkusForWarehouse.find((s) => s.sku === sku)) {
      setSku(availableSkusForWarehouse[0].sku);
    }
  }, [warehouseId, availableSkusForWarehouse, sku]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!warehouseId || !sku || quantity <= 0) {
      showToast('Valid warehouse, SKU, and positive quantity are required.', 'warning');
      return;
    }
    setIsSubmitting(true);
    try {
      await api.recordStockReceipt({
        warehouseId,
        sku,
        quantity: Number(quantity),
        receiptReference: receiptReference.trim() || `RCV-${Date.now().toString().slice(-6)}`,
        notes: notes.trim(),
      });
      showToast(`Received ${quantity} units of ${sku} at dock for ${warehouseId}.`, 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Failed to record stock receipt.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Record Direct Stock Receipt (Inbound Dock)"
      subtitle="Acknowledge incoming supplier shipments or dock pallets directly into physical on-hand stock"
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Receiving Warehouse *</label>
            <select
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              required
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.id} — {w.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Product / SKU *</label>
            <select
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white font-mono focus:outline-none focus:border-purple-500"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              required
            >
              {availableSkusForWarehouse.map((s) => (
                <option key={s.sku} value={s.sku}>
                  {s.sku} — {s.name} (On-hand: {s.onHand})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Received Quantity *</label>
            <input
              type="number"
              min="1"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Receipt Manifest / Ref *</label>
            <input
              type="text"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white font-mono focus:outline-none focus:border-purple-500"
              value={receiptReference}
              onChange={(e) => setReceiptReference(e.target.value)}
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Inspector / Dock Notes</label>
          <textarea
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Receiving...' : 'Record Dock Receipt'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

// ============================================================================
// 6. Request Inter-Hub Transfer Modal (PART D)
// ============================================================================
interface RequestTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  warehouses: WarehouseEntity[];
  inventory: WarehouseInventory[];
  defaultSourceWarehouseId?: string;
  defaultSku?: string;
  onSuccess: () => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export const RequestTransferModal: React.FC<RequestTransferModalProps> = ({
  isOpen,
  onClose,
  warehouses,
  inventory,
  defaultSourceWarehouseId,
  defaultSku,
  onSuccess,
  showToast,
}) => {
  const [sourceWarehouseId, setSourceWarehouseId] = useState(defaultSourceWarehouseId || warehouses[0]?.id || '');
  const [destinationWarehouseId, setDestinationWarehouseId] = useState(
    warehouses.find((w) => w.id !== sourceWarehouseId)?.id || warehouses[1]?.id || ''
  );
  const [sku, setSku] = useState(defaultSku || '');
  const [quantity, setQuantity] = useState(25);
  const [reason, setReason] = useState('Shortage rebalance between regional distribution hubs');
  const [expectedArrival, setExpectedArrival] = useState('');
  const [authorizationInfo, setAuthorizationInfo] = useState('OPS-TRF-REQ');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (defaultSourceWarehouseId) setSourceWarehouseId(defaultSourceWarehouseId);
    if (defaultSku) setSku(defaultSku);
  }, [defaultSourceWarehouseId, defaultSku]);

  // Inventory available at source warehouse
  const sourceStockItems = inventory.filter((i) => i.warehouseId === sourceWarehouseId);
  const activeSourceItem = sourceStockItems.find((i) => i.sku === sku) || sourceStockItems[0];

  useEffect(() => {
    if (sourceStockItems.length > 0 && (!sku || !sourceStockItems.some((s) => s.sku === sku))) {
      setSku(sourceStockItems[0].sku);
    }
  }, [sourceWarehouseId, sourceStockItems, sku]);

  // Ensure dest != source
  useEffect(() => {
    if (destinationWarehouseId === sourceWarehouseId) {
      const alt = warehouses.find((w) => w.id !== sourceWarehouseId);
      if (alt) setDestinationWarehouseId(alt.id);
    }
  }, [sourceWarehouseId, destinationWarehouseId, warehouses]);

  // Real-time calculation helpers
  const availableUnits = activeSourceItem?.availableUnits || 0;
  const safetyThreshold = activeSourceItem?.safetyStockThreshold || 0;
  const postTransferAvailable = availableUnits - quantity;
  const breachesSafety = postTransferAvailable < safetyThreshold && postTransferAvailable >= 0;
  const isInsufficient = quantity > availableUnits;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sourceWarehouseId === destinationWarehouseId) {
      showToast('Source and destination warehouses must be different.', 'warning');
      return;
    }
    if (!sku) {
      showToast('Select a valid SKU.', 'warning');
      return;
    }
    if (quantity <= 0) {
      showToast('Transfer quantity must be positive.', 'warning');
      return;
    }
    if (isInsufficient) {
      showToast(`Cannot transfer ${quantity} units: source only has ${availableUnits} available.`, 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      await api.requestTransfer({
        sourceWarehouseId,
        destinationWarehouseId,
        sku,
        quantity: Number(quantity),
        reason: reason.trim(),
        expectedArrival: expectedArrival.trim() || undefined,
        authorizationInfo: authorizationInfo.trim() || undefined,
      });
      showToast(
        `Transfer request submitted: ${quantity} units of ${sku} from ${sourceWarehouseId} to ${destinationWarehouseId}.`,
        'success'
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Failed to submit transfer request.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Initiate Inter-Hub Stock Transfer Request"
      subtitle="Creates a persistent inter-facility transfer order following the full lifecycle workflow"
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Source & Destination */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Source Warehouse (Origin) *</label>
            <select
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
              value={sourceWarehouseId}
              onChange={(e) => setSourceWarehouseId(e.target.value)}
              required
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.id} — {w.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Destination Warehouse *</label>
            <select
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
              value={destinationWarehouseId}
              onChange={(e) => setDestinationWarehouseId(e.target.value)}
              required
            >
              {warehouses
                .filter((w) => w.id !== sourceWarehouseId)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.id} — {w.name}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* SKU Selector */}
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Product SKU to Transfer *</label>
          <select
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white font-mono focus:outline-none focus:border-purple-500"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            required
          >
            {sourceStockItems.map((s) => (
              <option key={s.sku} value={s.sku}>
                {s.sku} — {s.skuDescription} (Available: {s.availableUnits}, Safety Buffer: {s.safetyStockThreshold})
              </option>
            ))}
          </select>
        </div>

        {/* Source Inventory Health Status Card */}
        {activeSourceItem && (
          <div className="p-3 bg-slate-950 border border-slate-800 rounded text-xs space-y-1">
            <div className="flex justify-between text-slate-400">
              <span>Source Available Stock:</span>
              <span className="font-mono font-bold text-white">{availableUnits} units</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Safety Buffer Threshold:</span>
              <span className="font-mono text-amber-400">{safetyThreshold} units</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Projected Post-Transfer Balance:</span>
              <span
                className={`font-mono font-bold ${
                  postTransferAvailable < 0
                    ? 'text-rose-400'
                    : postTransferAvailable < safetyThreshold
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }`}
              >
                {postTransferAvailable} units
              </span>
            </div>

            {isInsufficient && (
              <div className="flex items-center gap-1.5 text-rose-400 pt-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Insufficient source inventory. Cannot transfer more than {availableUnits} units.</span>
              </div>
            )}
            {breachesSafety && (
              <div className="flex items-center gap-1.5 text-amber-400 pt-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Warning: Remaining stock will dip below the safety buffer of {safetyThreshold} units.</span>
              </div>
            )}
          </div>
        )}

        {/* Quantity & Expected Arrival */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Transfer Units *</label>
            <input
              type="number"
              min="1"
              max={availableUnits || 1000}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Expected Delivery Date</label>
            <input
              type="date"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
              value={expectedArrival}
              onChange={(e) => setExpectedArrival(e.target.value)}
            />
          </div>
        </div>

        {/* Reason & Auth Info */}
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Operational Transfer Justification *</label>
          <input
            type="text"
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Authorization Reference</label>
          <input
            type="text"
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
            value={authorizationInfo}
            onChange={(e) => setAuthorizationInfo(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || isInsufficient}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Transfer Request'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

// ============================================================================
// 7. Transfer Action Modal (Approve, Dispatch, Receive, Cancel)
// ============================================================================
interface TransferActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  transfer: WarehouseTransferItem | null;
  actionType: 'approve' | 'dispatch' | 'receive' | 'cancel' | null;
  onSuccess: () => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export const TransferActionModal: React.FC<TransferActionModalProps> = ({
  isOpen,
  onClose,
  transfer,
  actionType,
  onSuccess,
  showToast,
}) => {
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (actionType === 'approve') setNotes('Transfer authorized in accordance with regional rebalance policy.');
    else if (actionType === 'dispatch') setNotes('Cargo picked, packed, and loaded onto outbound freight carrier.');
    else if (actionType === 'receive') setNotes('Pallets verified at inbound dock. Stock counted and accepted into inventory.');
    else if (actionType === 'cancel') setNotes('Transfer order cancelled by operations lead.');
  }, [actionType]);

  if (!transfer || !actionType) return null;

  const getActionDetails = () => {
    switch (actionType) {
      case 'approve':
        return {
          title: `Approve Transfer ${transfer.id}`,
          subtitle: `Authorize movement of ${transfer.quantity} units of ${transfer.sku} from ${transfer.sourceWarehouseId} to ${transfer.destinationWarehouseId}`,
          buttonLabel: 'Approve Transfer',
          buttonColor: 'bg-blue-600 hover:bg-blue-500',
        };
      case 'dispatch':
        return {
          title: `Dispatch Cargo ${transfer.id}`,
          subtitle: `Reserves ${transfer.quantity} units at ${transfer.sourceWarehouseId} and notifies inbound dock at ${transfer.destinationWarehouseId}`,
          buttonLabel: 'Dispatch Stock',
          buttonColor: 'bg-purple-600 hover:bg-purple-500',
        };
      case 'receive':
        return {
          title: `Receive Stock at Destination: ${transfer.id}`,
          subtitle: `Finalizes transfer: increases on-hand units at ${transfer.destinationWarehouseId}, decreases source on-hand, releases reservations and updates movement ledger`,
          buttonLabel: 'Acknowledge Receipt',
          buttonColor: 'bg-emerald-600 hover:bg-emerald-500',
        };
      case 'cancel':
        return {
          title: `Cancel Transfer ${transfer.id}`,
          subtitle: `Terminates transfer and releases any inventory reservations`,
          buttonLabel: 'Cancel Transfer',
          buttonColor: 'bg-rose-600 hover:bg-rose-500',
        };
    }
  };

  const details = getActionDetails();

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (actionType === 'approve') {
        await api.approveTransfer(transfer.id, notes);
        showToast(`Transfer ${transfer.id} approved successfully.`, 'success');
      } else if (actionType === 'dispatch') {
        await api.dispatchTransfer(transfer.id, notes);
        showToast(`Transfer ${transfer.id} dispatched! Stock reserved at source and marked inbound.`, 'success');
      } else if (actionType === 'receive') {
        await api.receiveTransfer(transfer.id, notes);
        showToast(`Transfer ${transfer.id} received! Inventory balances and movement ledger updated.`, 'success');
      } else if (actionType === 'cancel') {
        await api.cancelTransfer(transfer.id, notes);
        showToast(`Transfer ${transfer.id} cancelled.`, 'info');
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err.message || `Failed to ${actionType} transfer.`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={details.title}
      subtitle={details.subtitle}
      maxWidth="md"
    >
      <form onSubmit={handleConfirm} className="space-y-4">
        <div className="p-3 bg-slate-950 border border-slate-800 rounded text-xs space-y-1.5">
          <div className="flex justify-between text-slate-400">
            <span>Route:</span>
            <span className="font-mono text-white">
              {transfer.sourceWarehouseId} → {transfer.destinationWarehouseId}
            </span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>SKU & Quantity:</span>
            <span className="font-mono font-bold text-white">
              {transfer.sku} ({transfer.quantity} units)
            </span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Current Status:</span>
            <span className="font-mono uppercase text-purple-400">{transfer.status}</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">
            {actionType === 'cancel' ? 'Cancellation Reason *' : 'Audit Trail Notes & References *'}
          </label>
          <textarea
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            required
          />
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className={`px-4 py-2 text-white rounded text-sm font-medium transition-colors disabled:opacity-50 ${details.buttonColor}`}
          >
            {isSubmitting ? 'Processing...' : details.buttonLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
};
