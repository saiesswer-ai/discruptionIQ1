import React, { useState } from 'react';
import { WarehouseTransferItem, TransferStatus } from '../../types';
import { Badge } from '../common/Badge';
import {
  ArrowRightLeft,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Truck,
  Check,
  XCircle,
  Plus,
  AlertCircle,
  Calendar,
  User,
  FileText,
} from 'lucide-react';

interface TransfersManagementProps {
  transfers: WarehouseTransferItem[];
  onOpenRequestModal: () => void;
  onOpenActionModal: (transfer: WarehouseTransferItem, action: 'approve' | 'dispatch' | 'receive' | 'cancel') => void;
  canRequestTransfer: boolean;
  canApproveTransfer: boolean;
  canDispatchTransfer: boolean;
  canReceiveTransfer: boolean;
}

export const TransfersManagement: React.FC<TransfersManagementProps> = ({
  transfers,
  onOpenRequestModal,
  onOpenActionModal,
  canRequestTransfer,
  canApproveTransfer,
  canDispatchTransfer,
  canReceiveTransfer,
}) => {
  const [statusFilter, setStatusFilter] = useState<'ALL' | TransferStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTransfers = (transfers || []).filter((t) => {
    const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
    const matchesSearch =
      (t.id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.sku || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.sourceWarehouseId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.destinationWarehouseId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.reason || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const getStatusBadge = (status: TransferStatus) => {
    switch (status) {
      case 'REQUESTED':
        return <Badge variant="warning">REQUESTED (Pending Review)</Badge>;
      case 'APPROVED':
        return <Badge variant="neutral">APPROVED (Ready to Dispatch)</Badge>;
      case 'IN_TRANSIT':
        return <Badge variant="warning">IN_TRANSIT (En Route)</Badge>;
      case 'RECEIVED':
        return <Badge variant="success">RECEIVED (Completed)</Badge>;
      case 'CANCELLED':
        return <Badge variant="critical">CANCELLED</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const renderLifecycleSteps = (status: TransferStatus) => {
    const steps: TransferStatus[] = ['REQUESTED', 'APPROVED', 'IN_TRANSIT', 'RECEIVED'];
    if (status === 'CANCELLED') {
      return (
        <div className="flex items-center gap-1.5 text-xs text-rose-400 py-1">
          <XCircle className="w-4 h-4 shrink-0" />
          <span>Transfer cancelled — all reserved stock released back to source inventory.</span>
        </div>
      );
    }

    const currentIndex = steps.indexOf(status);

    return (
      <div className="flex items-center gap-2 py-2">
        {steps.map((step, idx) => {
          const isDone = idx < currentIndex;
          const isCurrent = idx === currentIndex;
          return (
            <React.Fragment key={step}>
              <div className="flex items-center gap-1.5">
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                    isDone
                      ? 'bg-emerald-500 text-slate-950 font-black'
                      : isCurrent
                      ? 'bg-purple-600 text-white ring-2 ring-purple-400/50'
                      : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {isDone ? <Check className="w-3 h-3 stroke-[3]" /> : idx + 1}
                </div>
                <span
                  className={`text-[11px] font-mono font-medium ${
                    isCurrent
                      ? 'text-purple-300 font-bold'
                      : isDone
                      ? 'text-slate-300'
                      : 'text-slate-600'
                  }`}
                >
                  {step}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={`h-0.5 w-6 rounded-full ${
                    idx < currentIndex ? 'bg-emerald-500/80' : 'bg-slate-800'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-purple-400" />
            Inter-Hub Stock Transfer Workflows
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Automated, multi-step persistent stock movements with two-phase reservations and dock receipts
          </p>
        </div>

        {canRequestTransfer && (
          <button
            onClick={onOpenRequestModal}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold shadow-md transition-all shrink-0"
          >
            <Plus className="w-4 h-4" />
            Request New Stock Transfer
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-slate-900 p-3 rounded-xl border border-slate-800">
        <div className="flex items-center gap-1 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          {(['ALL', 'REQUESTED', 'APPROVED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED'] as const).map(
            (status) => {
              const count =
                status === 'ALL'
                  ? transfers.length
                  : transfers.filter((t) => t.status === status).length;
              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                    statusFilter === status
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {status}
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      statusFilter === status ? 'bg-purple-800 text-purple-200' : 'bg-slate-950 text-slate-400'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            }
          )}
        </div>

        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search transfer, SKU, hub..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Transfers Cards List */}
      <div className="space-y-3">
        {filteredTransfers.length === 0 ? (
          <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-xl text-slate-400">
            <ArrowRightLeft className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-white font-semibold">No transfers found.</p>
            <p className="text-xs text-slate-500 mt-1">Try selecting a different filter or initiate a new transfer.</p>
          </div>
        ) : (
          filteredTransfers.map((t) => (
            <div
              key={t.id}
              className="p-5 bg-slate-900 border border-slate-800 hover:border-purple-500/40 rounded-xl shadow-md transition-all space-y-3"
            >
              {/* Row 1: ID, Status, Route */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-purple-600/15 border border-purple-500/30 rounded-lg text-purple-400">
                    <ArrowRightLeft className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-white">{t.id}</span>
                      {getStatusBadge(t.status)}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                      <span className="font-mono text-purple-300 font-bold">
                        {t.sourceWarehouseId}
                      </span>
                      <span>→</span>
                      <span className="font-mono text-emerald-300 font-bold">
                        {t.destinationWarehouseId}
                      </span>
                      {t.expectedArrival && (
                        <span className="text-slate-500">
                          • ETA: {new Date(t.expectedArrival).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* SKU & Quantity highlight */}
                <div className="text-right sm:self-center">
                  <span className="text-[10px] font-mono uppercase text-slate-400">Transferred SKU</span>
                  <div className="font-mono font-bold text-base text-white">
                    <span className="text-purple-400">{t.sku}</span> × {t.quantity} Units
                  </div>
                </div>
              </div>

              {/* Row 2: Lifecycle Tracker */}
              <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                <span className="text-[10px] font-mono uppercase text-slate-500">Lifecycle Progress</span>
                {renderLifecycleSteps(t.status)}
              </div>

              {/* Row 3: Audit details, notes, and buttons */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <div className="text-xs text-slate-400 space-y-1">
                  <div>
                    <span className="text-slate-500 font-medium">Justification: </span>
                    <span className="text-slate-300">{t.reason}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                    <span>Requested by: <strong className="text-slate-300 font-mono">{t.requestedBy}</strong></span>
                    {t.approvedBy && (
                      <span>Approved by: <strong className="text-slate-300 font-mono">{t.approvedBy}</strong></span>
                    )}
                    {t.createdAt && (
                      <span>Created: {new Date(t.createdAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>

                {/* State Machine Action Controls */}
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  {t.status === 'REQUESTED' && (
                    <>
                      {canApproveTransfer && (
                        <button
                          onClick={() => onOpenActionModal(t, 'approve')}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold shadow transition-colors"
                        >
                          Approve Transfer
                        </button>
                      )}
                      <button
                        onClick={() => onOpenActionModal(t, 'cancel')}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-rose-400 hover:text-rose-300 rounded text-xs font-semibold transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  )}

                  {t.status === 'APPROVED' && (
                    <>
                      {canDispatchTransfer && (
                        <button
                          onClick={() => onOpenActionModal(t, 'dispatch')}
                          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-semibold shadow transition-colors flex items-center gap-1.5"
                        >
                          <Truck className="w-3.5 h-3.5" />
                          Dispatch Cargo
                        </button>
                      )}
                      <button
                        onClick={() => onOpenActionModal(t, 'cancel')}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-rose-400 hover:text-rose-300 rounded text-xs font-semibold transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  )}

                  {t.status === 'IN_TRANSIT' && canReceiveTransfer && (
                    <button
                      onClick={() => onOpenActionModal(t, 'receive')}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold shadow transition-colors flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Acknowledge Dock Receipt
                    </button>
                  )}

                  {t.status === 'RECEIVED' && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono font-medium">
                      <CheckCircle2 className="w-4 h-4" />
                      Stock Received & Balances Balanced
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
