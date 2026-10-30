import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { ApprovalRequest } from '../types';
import { api } from '../services/httpApi';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import {
  CheckSquare,
  CheckCircle2,
  Lock,
  Zap,
} from 'lucide-react';

export const ApprovalsPage: React.FC = () => {
  const {
    approvals,
    currentUser,
    refreshData,
    showToast,
    setArenaDisruptionId,
    setActivePage,
    permissions,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'pending' | 'resolved'>('pending');
  const [selectedApproval, setSelectedApproval] = useState<ApprovalRequest | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'modify' | null>(null);
  const [actionNote, setActionNote] = useState('');

  const pendingApprovals = approvals.filter(a => a.status === 'pending');
  const resolvedApprovals = approvals.filter(a => a.status !== 'pending');

  const displayedApprovals = activeTab === 'pending' ? pendingApprovals : resolvedApprovals;

  // Authorization check for the current user persona
  const canUserAuthorize = (approval: ApprovalRequest): { allowed: boolean; reason?: string } => {
    if (!(currentUser.permissions || []).some(permission => permission.startsWith('plans:approve') || permission === 'plans:reject')) {
      return { allowed: false, reason: 'Risk Analysts possess proposal authority only. Managerial sign-off required.' };
    }
    if (approval.estimatedCostUSD > currentUser.approvalLimitUSD) {
      return {
        allowed: false,
        reason: `Estimated cost ($${approval.estimatedCostUSD.toLocaleString()}) exceeds your persona approval limit ($${currentUser.approvalLimitUSD.toLocaleString()}). Requires Supply Chain Director.`,
      };
    }
    return { allowed: true };
  };

  const handleOpenAction = (approval: ApprovalRequest, type: 'approve' | 'reject' | 'modify') => {
    const required = type === 'approve' ? 'plans:approve' : type === 'reject' ? 'plans:reject' : 'plans:modify';
    if (!permissions.some(permission => permission.startsWith(required))) {
      showToast('Your authenticated role is not permitted to perform that action.', 'error');
      return;
    }
    setSelectedApproval(approval);
    setActionType(type);
    setActionNote('');
  };

  const handleConfirmAction = async () => {
    if (!selectedApproval || !actionType) return;

    try {
      if (actionType === 'approve') {
        await api.approvePlan(selectedApproval.planId, actionNote);
        showToast(`Plan approved successfully. Budget authorization signed.`, 'success');
      } else if (actionType === 'reject') {
        if (!actionNote.trim()) {
          showToast('Please provide a reason for rejection.', 'error');
          return;
        }
        await api.rejectPlan(selectedApproval.planId, actionNote);
        showToast(`Plan authorization rejected.`, 'warning');
      } else if (actionType === 'modify') {
        if (!actionNote.trim()) {
          showToast('Please provide adjustment notes for the requester.', 'error');
          return;
        }
        await api.requestPlanModification(selectedApproval.planId, actionNote);
        showToast(`Modification requested. Returned to proposal phase.`, 'info');
      }

      setActionType(null);
      setSelectedApproval(null);
      refreshData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Role Authority Summary Banner */}
      <div className="card-light p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-semibold text-[#777B76]">Active Signing Authority:</span>
            <span className="text-xs font-bold text-[#171917] font-mono px-2.5 py-0.5 rounded-lg bg-[#F0F1EE] border border-[#E8EAE4]">
              {currentUser.roleLabel}
            </span>
          </div>
          <p className="text-xs text-[#777B76] mt-1.5 font-medium">
            Expenditure ceiling: <strong className="text-[#171917] font-bold">${currentUser.approvalLimitUSD.toLocaleString()} USD</strong> ·
            {currentUser.approvalLimitUSD > 50000
              ? ' Comprehensive enterprise executive authorization'
              : currentUser.approvalLimitUSD > 0
              ? ' Operational hub & freight expediting authorization'
              : ' View and simulation authority only'}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 p-1 bg-[#F0F1EE] rounded-2xl border border-[#E8EAE4]">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-xl transition-all ${
              activeTab === 'pending'
                ? 'bg-[#171917] text-[#C8FF32] shadow-sm'
                : 'text-[#777B76] hover:text-[#171917]'
            }`}
          >
            Pending Approvals ({pendingApprovals.length})
          </button>
          <button
            onClick={() => setActiveTab('resolved')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-xl transition-all ${
              activeTab === 'resolved'
                ? 'bg-[#171917] text-[#C8FF32] shadow-sm'
                : 'text-[#777B76] hover:text-[#171917]'
            }`}
          >
            Decision History ({resolvedApprovals.length})
          </button>
        </div>
      </div>

      {/* Approvals List */}
      <div className="space-y-4">
        {displayedApprovals.length === 0 ? (
          <div className="card-light p-12 text-center text-[#777B76]">
            <CheckSquare className="w-10 h-10 text-[#A0A39D] mx-auto mb-3" />
            <p className="text-base font-bold text-[#171917]">
              {activeTab === 'pending' ? 'No pending approval requests in inbox.' : 'No historical decisions logged.'}
            </p>
            <p className="text-xs text-[#777B76] mt-1">
              New requests submitted from the Recovery Arena will appear here for signing.
            </p>
          </div>
        ) : (
          displayedApprovals.map(approval => {
            const authCheck = canUserAuthorize(approval);
            return (
              <div
                key={approval.id}
                className="card-light p-6 space-y-4 hover:border-[#D3D8CE] transition-all"
              >
                {/* Header row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E8EAE4] pb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="text-xs font-mono font-bold text-[#171917]">{approval.id}</span>
                      <span className="text-[10px] font-mono text-[#A0A39D]">·</span>
                      <span className="text-xs font-mono font-semibold text-[#171917]">{approval.planName}</span>
                      {approval.status === 'pending' && <Badge variant="warning">Pending Review</Badge>}
                      {approval.status === 'approved' && <Badge variant="success">Approved</Badge>}
                      {approval.status === 'rejected' && <Badge variant="critical">Rejected</Badge>}
                      {approval.status === 'modification_requested' && (
                        <Badge variant="purple">Modification Requested</Badge>
                      )}
                    </div>
                    <div className="text-xs text-[#777B76] flex items-center gap-2">
                      <span>Target Disruption:</span>
                      <strong className="text-[#171917] font-semibold">{approval.disruptionTitle} ({approval.disruptionId})</strong>
                    </div>
                  </div>

                  <div className="text-right font-mono text-xs text-[#777B76]">
                    <div>Submitted by: <strong className="text-[#171917]">{approval.requesterName}</strong></div>
                    <div className="text-[10px] text-[#A0A39D] mt-0.5">
                      {new Date(approval.requestedAt).toUTCString()}
                    </div>
                  </div>
                </div>

                {/* Metrics Matrix */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-[#F8F9F6] rounded-2xl border border-[#E8EAE4] text-xs font-mono">
                  <div>
                    <span className="text-[10px] text-[#777B76] uppercase block font-semibold">Expedite Expenditure</span>
                    <span className="text-lg font-bold text-[#171917] mt-0.5 block">${approval.estimatedCostUSD.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#777B76] uppercase block font-semibold">Customer Orders Protected</span>
                    <span className="text-lg font-bold text-[#1b6b0c] mt-0.5 block">{approval.affectedOrdersCount} SLAs</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#777B76] uppercase block font-semibold">Projected Penalty Avoidance</span>
                    <span className="text-lg font-bold text-[#7185FF] mt-0.5 block">${approval.projectedSavingsUSD.toLocaleString()}</span>
                  </div>
                </div>

                {/* Evidence & Justification Section */}
                <div className="p-4 bg-[#F0F1EE] rounded-2xl border border-[#E8EAE4] text-xs space-y-1.5">
                  <span className="font-semibold text-[#171917] uppercase tracking-wider text-[10px] block">
                    Operational Evidence & Justification:
                  </span>
                  <p className="text-[#171917] leading-relaxed font-sans">{approval.justificationNotes}</p>
                </div>

                {/* Reviewer Historical Comments (if resolved) */}
                {approval.reviewerComments && (
                  <div className="p-4 bg-[#F8F9F6] rounded-2xl border border-[#E8EAE4] text-xs space-y-1">
                    <span className="font-semibold text-[#777B76] text-[10px] uppercase block">
                      Reviewer Decision Note ({approval.reviewedBy} · {approval.reviewedRole}):
                    </span>
                    <p className="text-[#171917] font-sans italic">{approval.reviewerComments}</p>
                  </div>
                )}

                {/* Action Toolbar (for pending approvals) */}
                {approval.status === 'pending' && (
                  <div className="pt-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-t border-[#E8EAE4]">
                    {/* Authority status or Warning */}
                    <div className="text-xs">
                      {!authCheck.allowed ? (
                        <div className="flex items-center gap-1.5 text-[#8f6d14] bg-[#F5C451]/15 px-3 py-1.5 rounded-lg border border-[#F5C451]/30">
                          <Lock className="w-3.5 h-3.5 text-[#F5C451]" />
                          <span className="text-[11px] font-medium">{authCheck.reason}</span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-[#1b6b0c] font-semibold bg-[#84E344]/15 px-3 py-1.5 rounded-lg border border-[#84E344]/30">
                          ✓ Authorized to sign off under active {currentUser.roleLabel} permissions
                        </span>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <button
                        onClick={() => {
                          setArenaDisruptionId(approval.disruptionId);
                          setActivePage('recovery-arena');
                        }}
                        className="btn-secondary text-xs"
                      >
                        <Zap className="w-3.5 h-3.5 text-[#171917]" />
                        <span>Inspect in Arena</span>
                      </button>

                      {authCheck.allowed && (
                        <>
                          {permissions.includes('plans:modify') && (
                            <button
                              onClick={() => handleOpenAction(approval, 'modify')}
                              className="btn-secondary text-xs text-[#8f6d14]"
                            >
                              Request Modification
                            </button>
                          )}
                          {permissions.includes('plans:reject') && (
                            <button
                              onClick={() => handleOpenAction(approval, 'reject')}
                              className="px-3 py-1.5 bg-[#E85D68]/15 hover:bg-[#E85D68]/25 text-[#a82531] border border-[#E85D68]/30 rounded-xl text-xs font-semibold transition-colors"
                            >
                              Reject
                            </button>
                          )}
                          {permissions.some(permission => permission.startsWith('plans:approve')) && (
                            <button
                              onClick={() => handleOpenAction(approval, 'approve')}
                              className="btn-lime text-xs"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Approve Plan</span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Confirmation Modal */}
      <Modal
        isOpen={!!actionType}
        onClose={() => setActionType(null)}
        title={
          actionType === 'approve'
            ? `Authorize Recovery Plan: ${selectedApproval?.planName}`
            : actionType === 'reject'
            ? `Reject Plan Authorization: ${selectedApproval?.planName}`
            : `Request Modification: ${selectedApproval?.planName}`
        }
        subtitle={`Action performed as ${currentUser.name} (${currentUser.roleLabel})`}
        actions={
          <>
            <button
              onClick={() => setActionType(null)}
              className="btn-secondary text-xs"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmAction}
              className={
                actionType === 'approve'
                  ? 'btn-lime text-xs'
                  : actionType === 'reject'
                  ? 'px-4 py-2 bg-[#E85D68] hover:bg-[#d44e59] text-white rounded-xl text-xs font-semibold shadow-sm transition-colors'
                  : 'btn-secondary text-xs text-[#8f6d14]'
              }
            >
              Confirm {actionType === 'approve' ? 'Approval' : actionType === 'reject' ? 'Rejection' : 'Request'}
            </button>
          </>
        }
      >
        <div className="space-y-4 text-xs">
          <div className="p-4 bg-[#F8F9F6] border border-[#E8EAE4] rounded-2xl font-mono text-[#777B76] space-y-2">
            <div className="flex justify-between">
              <span>Disruption:</span>
              <strong className="text-[#171917]">{selectedApproval?.disruptionId}</strong>
            </div>
            <div className="flex justify-between">
              <span>Authorized Expenditure:</span>
              <strong className="text-[#171917]">${selectedApproval?.estimatedCostUSD.toLocaleString()} USD</strong>
            </div>
            <div className="flex justify-between">
              <span>Orders Protected:</span>
              <strong className="text-[#1b6b0c]">{selectedApproval?.affectedOrdersCount} SLAs</strong>
            </div>
          </div>

          <div>
            <label className="block text-[#171917] font-semibold mb-1.5">
              {actionType === 'approve'
                ? 'Reviewer Signing Comments (Optional)'
                : actionType === 'reject'
                ? 'Reason for Rejection (Required)'
                : 'Required Adjustments & Guidance (Required)'}
            </label>
            <textarea
              rows={3}
              value={actionNote}
              onChange={e => setActionNote(e.target.value)}
              placeholder={
                actionType === 'approve'
                  ? 'e.g., Authorized expediting cost to maintain Tier-1 AeroTech contract.'
                  : actionType === 'reject'
                  ? 'e.g., Cost exceeds allowable threshold for non-critical line items.'
                  : 'e.g., Please explore split fulfillment option to lower air charter commitment.'
              }
              className="input-insight w-full"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
