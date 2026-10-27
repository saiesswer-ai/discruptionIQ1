import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Badge } from '../components/common/Badge';
import {
  Truck,
  Ship,
  Plane,
  Search,
  Building,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';

export const ShipmentsPage: React.FC = () => {
  const { shipments, suppliers } = useApp();
  const [activeTab, setActiveTab] = useState<'shipments' | 'suppliers'>('shipments');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredShipments = shipments.filter(s =>
    s.trackingNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.carrierName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.supplierName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.cargoDescription.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredSuppliers = suppliers.filter(sup =>
    sup.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    sup.country.toLowerCase().includes(searchQuery.toLowerCase()) ||
    sup.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getTransportIcon = (mode: string) => {
    switch (mode) {
      case 'Ocean':
        return <Ship className="w-3.5 h-3.5 text-sky-400" />;
      case 'Air':
        return <Plane className="w-3.5 h-3.5 text-purple-400" />;
      default:
        return <Truck className="w-3.5 h-3.5 text-emerald-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Tab Switcher & Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Clean interactive tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
          <button
            onClick={() => setActiveTab('shipments')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'shipments'
                ? 'bg-slate-850 text-white shadow-xs border border-slate-700/60'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Inbound Shipments ({shipments.length})
          </button>
          <button
            onClick={() => setActiveTab('suppliers')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'suppliers'
                ? 'bg-slate-850 text-white shadow-xs border border-slate-700/60'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Suppliers & Performance ({suppliers.length})
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={
              activeTab === 'shipments'
                ? 'Search tracking #, carrier, supplier...'
                : 'Search supplier name, country, category...'
            }
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-md pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
          />
        </div>
      </div>

      {/* Tab 1: Shipments */}
      {activeTab === 'shipments' && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 font-medium border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Tracking & Carrier</th>
                  <th className="py-3 px-4">Mode</th>
                  <th className="py-3 px-4">Origin / Destination</th>
                  <th className="py-3 px-4">Cargo Description</th>
                  <th className="py-3 px-4">Current Waypoint</th>
                  <th className="py-3 px-4 text-right">Promised SLA</th>
                  <th className="py-3 px-4 text-right">Estimated ETA</th>
                  <th className="py-3 px-4 text-right">Delay</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredShipments.map(s => (
                  <tr key={s.id} className="hover:bg-slate-850/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-white">{s.trackingNumber}</div>
                      <div className="text-[11px] text-slate-400 font-sans">{s.carrierName}</div>
                    </td>
                    <td className="py-3 px-4 font-sans">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[11px] text-slate-300">
                        {getTransportIcon(s.transportMode)}
                        <span>{s.transportMode}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-200 text-[11px]">
                      <div>{s.origin}</div>
                      <div className="text-slate-500">→ {s.destination}</div>
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-300 max-w-xs truncate">
                      {s.cargoDescription}
                    </td>
                    <td className="py-3 px-4 text-slate-400 text-[11px]">
                      {s.currentLocation}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-400">
                      {new Date(s.promisedDeliveryDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-200">
                      {new Date(s.estimatedDeliveryDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {s.delayHours > 0 ? (
                        <span className="text-amber-400 font-bold">+{s.delayHours}h</span>
                      ) : (
                        <span className="text-emerald-400">On Time</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-sans">
                      {s.status === 'delayed' && <Badge variant="critical">Delayed</Badge>}
                      {s.status === 'customs_hold' && <Badge variant="warning">Customs Hold</Badge>}
                      {s.status === 'on_schedule' && <Badge variant="success">On Schedule</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Suppliers */}
      {activeTab === 'suppliers' && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 font-medium border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Supplier Name</th>
                  <th className="py-3 px-4">Country & Tier</th>
                  <th className="py-3 px-4">Product Category</th>
                  <th className="py-3 px-4 text-right">Reliability Index</th>
                  <th className="py-3 px-4 text-right">On-Time Rate</th>
                  <th className="py-3 px-4 text-right">Avg. Lead Time</th>
                  <th className="py-3 px-4 text-right">Delays (90d)</th>
                  <th className="py-3 px-4">Contract Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredSuppliers.map(sup => (
                  <tr key={sup.id} className="hover:bg-slate-850/60 transition-colors">
                    <td className="py-3 px-4 font-sans">
                      <div className="font-semibold text-white">{sup.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{sup.contactEmail}</div>
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-300">
                      <div>{sup.country}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{sup.tier}</div>
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-300">
                      {sup.category}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={`font-bold ${sup.reliabilityScore >= 90 ? 'text-emerald-400' : sup.reliabilityScore >= 80 ? 'text-sky-400' : 'text-amber-400'}`}>
                        {sup.reliabilityScore} / 100
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-slate-200">
                      {sup.onTimeDeliveryRate}%
                    </td>
                    <td className="py-3 px-4 text-right text-slate-300">
                      {sup.averageLeadTimeDays} days
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={`font-semibold ${sup.delayIncidentsLast90d > 2 ? 'text-rose-400' : 'text-slate-400'}`}>
                        {sup.delayIncidentsLast90d} incidents
                      </span>
                    </td>
                    <td className="py-3 px-4 font-sans">
                      {sup.status === 'preferred' && <Badge variant="success">Preferred Vendor</Badge>}
                      {sup.status === 'conditional' && <Badge variant="warning">Conditional / Under Review</Badge>}
                      {sup.status === 'restricted' && <Badge variant="critical">Restricted</Badge>}
                    </td>
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
