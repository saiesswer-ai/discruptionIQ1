import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { ApprovalRequest, UserRole } from '../types';
import { api } from '../services/httpApi';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import {
  CheckSquare,
  CheckCircle2,
  XCircle,
  RotateCcw,
  AlertTriangle,
  Lock,
  User,
  DollarSign,
  ShieldAlert,
  ArrowRight,
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
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-white">Active Signing Authority:</span>
            <span className="text-xs font-bold text-sky-400 font-mono">{currentUser.roleLabel}</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Expenditure ceiling: <strong className="text-slate-200">${currentUser.approvalLimitUSD.toLocaleString()} USD</strong> ·
            {currentUser.approvalLimitUSD > 50000
              ? ' Comprehensive enterprise executive authorization'
              : currentUser.approvalLimitUSD > 0
              ? ' Operational hub & freight expediting authorization'
              : ' View and simulation authority only'}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'pending'
                ? 'bg-slate-850 text-white shadow-xs border border-slate-700/60'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Pending Approvals ({pendingApprovals.length})
          </button>
          <button
            onClick={() => setActiveTab('resolved')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'resolved'
                ? 'bg-slate-850 text-white shadow-xs border border-slate-700/60'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Decision History ({resolvedApprovals.length})
          </button>
        </div>
      </div>

      {/* Approvals List */}
      <div className="space-y-4">
        {displayedApprovals.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-12 text-center text-slate-400">
            <CheckSquare className="w-8 h-8 text-slate-600 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-300">
              {activeTab === 'pending' ? 'No pending approval requests in inbox.' : 'No historical decisions logged.'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              New requests submitted from the Recovery Arena will appear here for signing.
            </p>
          </div>
        ) : (
          displayedApprovals.map(approval => {
            const authCheck = canUserAuthorize(approval);
            return (
              <div
                key={approval.id}
                className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4"
              >
                {/* Header row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono font-bold text-white">{approval.id}</span>
                      <span className="text-[10px] font-mono text-slate-500">·</span>
                      <span className="text-xs font-mono text-purple-300">{approval.planName}</span>
                      {approval.status === 'pending' && <Badge variant="warning">Pending Review</Badge>}
                      {approval.status === 'approved' && <Badge variant="success">Approved</Badge>}
                      {approval.status === 'rejected' && <Badge variant="critical">Rejected</Badge>}
                      {approval.status === 'modification_requested' && (
                        <Badge variant="purple">Modification Requested</Badge>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 flex items-center gap-2">
                      <span>Target Disruption:</span>
                      <strong className="text-slate-200">{approval.disruptionTitle} ({approval.disruptionId})</strong>
                    </div>
                  </div>

                  <div className="text-right font-mono text-xs text-slate-400">
                    <div>Submitted by: <strong className="text-white">{approval.requesterName}</strong></div>
                    <div className="text-[10px] text-slate-500">
                      {new Date(approval.requestedAt).toUTCString()}
                    </div>
                  </div>
                </div>

                {/* Metrics Matrix */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-950 rounded-lg border border-slate-800/80 text-xs font-mono">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Expedite Expenditure</span>
                    <span className="text-base font-bold text-white">${approval.estimatedCostUSD.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Customer Orders Protected</span>
                    <span className="text-base font-bold text-emerald-400">{approval.affectedOrdersCount} SLAs</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Projected Penalty Avoidance</span>
                    <span className="text-base font-bold text-sky-400">${approval.projectedSavingsUSD.toLocaleString()}</span>
                  </div>
                </div>

                {/* Evidence & Justification Section */}
                <div className="p-3 bg-slate-950/60 rounded border border-slate-800 text-xs space-y-1.5">
                  <span className="font-semibold text-slate-300 uppercase tracking-wider text-[10px] block">
                    Operational Evidence & Justification:
                  </span>
                  <p className="text-slate-300 leading-relaxed font-sans">{approval.justificationNotes}</p>
                </div>

                {/* Reviewer Historical Comments (if resolved) */}
                {approval.reviewerComments && (
                  <div className="p-3 bg-slate-950/80 rounded border border-slate-800 text-xs space-y-1">
                    <span className="font-semibold text-slate-400 text-[10px] uppercase block">
                      Reviewer Decision Note ({approval.reviewedBy} · {approval.reviewedRole}):
                    </span>
                    <p className="text-slate-300 font-sans italic">{approval.reviewerComments}</p>
                  </div>
                )}

                {/* Action Toolbar (for pending approvals) */}
                {approval.status === 'pending' && (
                  <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-t border-slate-800/80">
                    {/* Authority status or Warning */}
                    <div className="text-xs">
                      {!authCheck.allowed ? (
                        <div className="flex items-center gap-1.5 text-amber-400">
                          <Lock className="w-3.5 h-3.5" />
                          <span className="text-[11px]">{authCheck.reason}</span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-emerald-400 font-medium">
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
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition-colors flex items-center gap-1"
                      >
                        <Zap className="w-3 h-3 text-purple-400" />
                        <span>Inspect in Arena</span>
                      </button>

                      {authCheck.allowed && (
                        <>
                          {permissions.includes('plans:modify') && <button
                            onClick={() => handleOpenAction(approval, 'modify')}
                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded text-xs transition-colors"
                          >
                            Request Modification
                          </button>}
                          {permissions.includes('plans:reject') && <button
                            onClick={() => handleOpenAction(approval, 'reject')}
                            className="px-2.5 py-1.5 bg-rose-950/70 hover:bg-rose-900 border border-rose-800/60 text-rose-300 rounded text-xs transition-colors"
                          >
                            Reject
                          </button>}
                          {permissions.some(permission => permission.startsWith('plans:approve')) && <button
                            onClick={() => handleOpenAction(approval, 'approve')}
                            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded text-xs transition-colors shadow-sm flex items-center gap-1"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Approve Plan</span>
                          </button>}
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
              className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded text-xs hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmAction}
              className={`px-4 py-1.5 text-white rounded text-xs font-semibold ${
                actionType === 'approve'
                  ? 'bg-emerald-600 hover:bg-emerald-500'
                  : actionType === 'reject'
                  ? 'bg-rose-600 hover:bg-rose-500'
                  : 'bg-amber-600 hover:bg-amber-500'
              }`}
            >
              Confirm {actionType === 'approve' ? 'Approval' : actionType === 'reject' ? 'Rejection' : 'Request'}
            </button>
          </>
        }
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 bg-slate-950 border border-slate-800 rounded font-mono text-slate-300 space-y-1">
            <div className="flex justify-between">
              <span>Disruption:</span>
              <strong className="text-white">{selectedApproval?.disruptionId}</strong>
            </div>
            <div className="flex justify-between">
              <span>Authorized Expenditure:</span>
              <strong className="text-white">${selectedApproval?.estimatedCostUSD.toLocaleString()} USD</strong>
            </div>
            <div className="flex justify-between">
              <span>Orders Protected:</span>
              <strong className="text-emerald-400">{selectedApproval?.affectedOrdersCount} SLAs</strong>
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
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
              className="w-full bg-slate-950 border border-slate-800 rounded p-2.5 text-white text-xs focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
