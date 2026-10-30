import React, { useState } from 'react';
import { WarehouseTransferItem, TransferStatus } from '../../types';
import { Badge } from '../common/Badge';
import {
  ArrowRightLeft,
  Search,
  CheckCircle2,
  Truck,
  Check,
  XCircle,
  Plus,
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
        <div className="flex items-center gap-1.5 text-xs text-[#E85D68] py-1 font-medium">
          <XCircle className="w-4 h-4 shrink-0" />
          <span>Transfer cancelled — all reserved stock released back to source inventory.</span>
        </div>
      );
    }

    const currentIndex = steps.indexOf(status);

    return (
      <div className="flex items-center gap-2 py-1.5">
        {steps.map((step, idx) => {
          const isDone = idx < currentIndex;
          const isCurrent = idx === currentIndex;
          return (
            <React.Fragment key={step}>
              <div className="flex items-center gap-1.5">
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                    isDone
                      ? 'bg-[#84E344] text-[#080908]'
                      : isCurrent
                      ? 'bg-[#171917] text-[#C8FF32] ring-2 ring-[#C8FF32]'
                      : 'bg-[#E8EAE4] text-[#A0A39D]'
                  }`}
                >
                  {isDone ? <Check className="w-3 h-3 stroke-[3]" /> : idx + 1}
                </div>
                <span
                  className={`text-[11px] font-mono font-medium ${
                    isCurrent
                      ? 'text-[#171917] font-bold'
                      : isDone
                      ? 'text-[#171917]'
                      : 'text-[#A0A39D]'
                  }`}
                >
                  {step}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={`h-0.5 w-6 rounded-full ${
                    idx < currentIndex ? 'bg-[#84E344]' : 'bg-[#E8EAE4]'
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
          <h2 className="text-base font-bold text-[#171917] flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-[#171917]" />
            Inter-Hub Stock Transfer Workflows
          </h2>
          <p className="text-xs text-[#777B76] mt-0.5">
            Automated, multi-step persistent stock movements with two-phase reservations and dock receipts
          </p>
        </div>

        {canRequestTransfer && (
          <button
            onClick={onOpenRequestModal}
            className="btn-lime text-xs shrink-0"
          >
            <Plus className="w-4 h-4" />
            Request New Stock Transfer
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="card-light p-3.5 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="p-1 bg-[#F0F1EE] rounded-2xl border border-[#E8EAE4] inline-flex items-center gap-1 overflow-x-auto max-w-full">
          {(['ALL', 'REQUESTED', 'APPROVED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED'] as const).map(
            (status) => {
              const count =
                status === 'ALL'
                  ? transfers.length
                  : transfers.filter((t) => t.status === status).length;
              const isSelected = statusFilter === status;
              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-[#171917] text-[#C8FF32] shadow-sm'
                      : 'text-[#777B76] hover:text-[#171917]'
                  }`}
                >
                  <span>{status}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono font-bold ${
                      isSelected ? 'bg-[#080908] text-[#C8FF32]' : 'bg-[#E8EAE4] text-[#777B76]'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            }
          )}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A0A39D]" />
          <input
            type="text"
            placeholder="Search transfer, SKU, hub..."
            className="input-insight w-full pl-9 pr-3.5 py-2 text-xs"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Transfers Cards List */}
      <div className="space-y-3">
        {filteredTransfers.length === 0 ? (
          <div className="p-12 text-center card-light text-[#777B76]">
            <ArrowRightLeft className="w-10 h-10 text-[#A0A39D] mx-auto mb-3" />
            <p className="text-base font-bold text-[#171917]">No transfers found.</p>
            <p className="text-xs text-[#777B76] mt-1">Try selecting a different filter or initiate a new transfer.</p>
          </div>
        ) : (
          filteredTransfers.map((t) => (
            <div
              key={t.id}
              className="card-light p-5 hover:border-[#D3D8CE] shadow-sm transition-all space-y-3"
            >
              {/* Row 1: ID, Status, Route */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E8EAE4] pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#F0F1EE] border border-[#E8EAE4] flex items-center justify-center text-[#171917] shrink-0">
                    <ArrowRightLeft className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-[#171917]">{t.id}</span>
                      {getStatusBadge(t.status)}
                    </div>
                    <div className="text-xs text-[#777B76] mt-0.5 flex items-center gap-2">
                      <span className="font-mono text-[#171917] font-bold">
                        {t.sourceWarehouseId}
                      </span>
                      <span>→</span>
                      <span className="font-mono text-[#171917] font-bold">
                        {t.destinationWarehouseId}
                      </span>
                      {t.expectedArrival && (
                        <span className="text-[#A0A39D]">
                          • ETA: {new Date(t.expectedArrival).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* SKU & Quantity highlight */}
                <div className="text-right sm:self-center">
                  <span className="text-[10px] font-mono uppercase text-[#777B76]">Transferred SKU</span>
                  <div className="font-mono font-bold text-base text-[#171917]">
                    <span>{t.sku}</span> × {t.quantity} Units
                  </div>
                </div>
              </div>

              {/* Row 2: Lifecycle Tracker */}
              <div className="bg-[#F8F9F6] p-3 rounded-xl border border-[#E8EAE4]">
                <span className="text-[10px] font-mono uppercase text-[#777B76]">Lifecycle Progress</span>
                {renderLifecycleSteps(t.status)}
              </div>

              {/* Row 3: Audit details, notes, and buttons */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <div className="text-xs text-[#777B76] space-y-1">
                  <div>
                    <span className="text-[#171917] font-medium">Justification: </span>
                    <span>{t.reason}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#A0A39D]">
                    <span>Requested by: <strong className="text-[#171917] font-mono">{t.requestedBy}</strong></span>
                    {t.approvedBy && (
                      <span>Approved by: <strong className="text-[#171917] font-mono">{t.approvedBy}</strong></span>
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
                          className="btn-lime text-xs"
                        >
                          Approve Transfer
                        </button>
                      )}
                      <button
                        onClick={() => onOpenActionModal(t, 'cancel')}
                        className="btn-secondary text-xs text-[#E85D68] hover:text-[#E85D68]"
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
                          className="btn-lime text-xs"
                        >
                          <Truck className="w-3.5 h-3.5" />
                          Dispatch Cargo
                        </button>
                      )}
                      <button
                        onClick={() => onOpenActionModal(t, 'cancel')}
                        className="btn-secondary text-xs text-[#E85D68] hover:text-[#E85D68]"
                      >
                        Cancel
                      </button>
                    </>
                  )}

                  {t.status === 'IN_TRANSIT' && canReceiveTransfer && (
                    <button
                      onClick={() => onOpenActionModal(t, 'receive')}
                      className="btn-lime text-xs"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Acknowledge Dock Receipt
                    </button>
                  )}

                  {t.status === 'RECEIVED' && (
                    <div className="flex items-center gap-1.5 text-xs text-[#1b6b0c] font-mono font-bold bg-[#84E344]/15 px-3 py-1.5 rounded-lg border border-[#84E344]/30">
                      <CheckCircle2 className="w-4 h-4 text-[#84E344]" />
                      Stock Received & Balances Reconciled
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
