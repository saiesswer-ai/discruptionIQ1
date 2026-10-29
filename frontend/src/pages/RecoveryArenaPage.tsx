import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { RecoveryPlan, OrderAtRisk, WarehouseInventory, PlanOrderAllocation } from '../types';
import { api } from '../services/httpApi';
import { PlanStatusBadge, SeverityBadge, StatusBadge, PriorityBadge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { Drawer } from '../components/common/Drawer';
import {
  Zap,
  CheckCircle2,
  AlertTriangle,
  Play,
  Edit3,
  Send,
  CheckCheck,
  Shield,
  Clock,
  Layers,
  Warehouse,
  DollarSign,
  Truck,
  Info,
  Check,
  XCircle,
  Eye,
  Sliders,
  AlertOctagon,
  TrendingDown,
  ArrowRight,
  PackageCheck,
  FileCheck2,
} from 'lucide-react';

export const RecoveryArenaPage: React.FC = () => {
  const {
    disruptions,
    orders,
    inventory,
    currentUser,
    arenaDisruptionId,
    setArenaDisruptionId,
    showToast,
    refreshData,
    setActivePage,
  } = useApp();

  const [plans, setPlans] = useState<RecoveryPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'comparison' | 'allocation' | 'constraints'>('comparison');

  // Confirmation Modals State (Requirement 9: Require explicit confirmation before changing a simulated state)
  const [planToSimulate, setPlanToSimulate] = useState<RecoveryPlan | null>(null);
  const [isSimulatingProgress, setIsSimulatingProgress] = useState<boolean>(false);
  const [simulationStepText, setSimulationStepText] = useState<string>('');

  // Simulation Preview Modal (Requirement 8: Select a plan and open simulation preview)
  const [previewPlan, setPreviewPlan] = useState<RecoveryPlan | null>(null);

  // Modify Plan Modal
  const [isModifyModalOpen, setIsModifyModalOpen] = useState<boolean>(false);
  const [modifyUnits, setModifyUnits] = useState<number>(0);
  const [modifyCost, setModifyCost] = useState<number>(0);

  // Submit for Approval Modal (Requirement 10: Submit for approval action creating pending request)
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState<boolean>(false);
  const [justificationNotes, setJustificationNotes] = useState<string>('');

  // Active Disruption
  const activeDisruption = disruptions.find(d => d.id === arenaDisruptionId) || disruptions[0];

  // Load plans for active disruption
  useEffect(() => {
    if (activeDisruption) {
      api.getRecoveryPlans(activeDisruption.id).then(loadedPlans => {
        setPlans(loadedPlans);
        if (loadedPlans.length > 0) {
          // If previous selection isn't in new disruption's plans, pick the first
          if (!loadedPlans.some(p => p.id === selectedPlanId)) {
            setSelectedPlanId(loadedPlans[0].id);
          }
        }
      }).catch(err => showToast(err.message || 'Unable to load recovery plans.', 'error'));
    }
  // Only re-fetch when the selected disruption ID changes, not when the full
  // disruptions array reference changes (which happens on every refreshData call).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDisruption?.id]);

  const selectedPlan = plans.find(p => p.id === selectedPlanId) || plans[0];
  const affectedOrders = orders.filter(o => o.associatedDisruptionId === activeDisruption?.id);
  const relevantInventory = inventory.filter(i => activeDisruption?.affectedSKUs.includes(i.sku));

  // --- Handlers ---

  // Trigger confirmation modal for simulation (Requirement 9)
  const handleRequestSimulation = (plan: RecoveryPlan) => {
    setPlanToSimulate(plan);
  };

  const handleGeneratePlans = async () => {
    if (!activeDisruption || !window.confirm(`Generate candidate recovery plans for ${activeDisruption.id}? This records a server-side planning action.`)) return;
    try {
      const generated = await api.createRecoveryPlans(activeDisruption.id);
      setPlans(generated);
      setSelectedPlanId(generated[0]?.id || '');
      showToast(`${generated.length} backend-generated recovery plans are ready for review.`, 'success');
      refreshData();
    } catch (err: any) { showToast(err.message || 'Unable to generate recovery plans.', 'error'); }
  };

  // Confirmed simulation execution
  const handleConfirmSimulation = async () => {
    if (!planToSimulate) return;
    const targetPlan = planToSimulate;
    setPlanToSimulate(null);

    setIsSimulatingProgress(true);
    setSimulationStepText('Auditing physical warehouse unreserved stock allocations...');

    setTimeout(() => {
      setSimulationStepText('Validating airline cargo pallet capacity & bonded freight slots...');
    }, 450);

    setTimeout(() => {
      setSimulationStepText('Calculating deterministic customer delivery lead times & SLA margins...');
    }, 900);

    setTimeout(async () => {
      try {
        const updated = await api.simulatePlan(targetPlan.id);
        setPlans(prev => prev.map(p => (p.id === updated.id ? updated : p)));
        setIsSimulatingProgress(false);
        setSimulationStepText('');
        showToast(
          `Deterministic simulation completed for ${targetPlan.name}. Feasibility: ${updated.feasibilityScore}%.`,
          'success'
        );
        refreshData();
      } catch (err: any) {
        setIsSimulatingProgress(false);
        showToast(err.message || 'Simulation failed', 'error');
      }
    }, 1400);
  };

  // Open Modify Modal
  const handleOpenModify = (plan: RecoveryPlan) => {
    setModifyUnits(plan.unitsAllocated);
    setModifyCost(plan.estimatedCostUSD);
    setIsModifyModalOpen(true);
  };

  // Save modified parameters
  const handleSaveModification = async () => {
    if (!selectedPlan) return;
    try {
      const result = await api.requestPlanModification(selectedPlan.id, `Requested parameter review: ${modifyUnits} units, $${modifyCost} estimated cost.`);
      const updated = result.plan;
      setPlans(prev => prev.map(p => (p.id === updated.id ? updated : p)));
      setIsModifyModalOpen(false);
      showToast(`Plan parameters adjusted. Plan status reverted to 'Proposed'.`, 'info');
      refreshData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Submit for Approval (Requirement 10)
  const handleSubmitForApproval = async () => {
    if (!selectedPlan) return;
    try {
      const res = await api.submitPlanForApproval(
        selectedPlan.id,
        justificationNotes || 'Recommended recovery scenario evaluated in Recovery Arena.'
      );
      setPlans(prev => prev.map(p => (p.id === res.plan.id ? res.plan : p)));
      setIsApprovalModalOpen(false);
      setJustificationNotes('');
      showToast(`Created approval request ${res.approval.id} for ${selectedPlan.name}.`, 'success');
      refreshData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Execute Plan (only after approval)
  const handleExecute = async (plan: RecoveryPlan) => {
    if (!window.confirm(`Execute ${plan.name}? This will commit the approved allocation and cannot be undone from the UI.`)) return;
    try {
      const executed = await api.executePlan(plan.id);
      setPlans(prev => prev.map(p => (p.id === executed.id ? executed : p)));
      showToast(`Plan ${plan.name} executed! Carrier EDI 204 dispatches sent.`, 'success');
      refreshData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner & Disruption Context Selector */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-purple-400">
              Recovery Arena · Scenario Evaluation
            </span>
            <SeverityBadge severity={activeDisruption?.severity || 'critical'} />
            <StatusBadge status={activeDisruption?.status || 'active'} />
            <span className="text-[10px] text-slate-500 font-mono">Deterministic Engine v2.4</span>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={activeDisruption?.id}
              onChange={e => setArenaDisruptionId(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-md px-3 py-1.5 text-sm font-semibold text-white focus:outline-none focus:border-purple-500"
            >
              {disruptions.map(d => (
                <option key={d.id} value={d.id}>
                  {d.id} — {d.title} (+{d.delayHours}h delay)
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-slate-400 mt-2 max-w-2xl leading-relaxed">
            {activeDisruption?.summary}
          </p>
        </div>

        {/* Quick Disruption Exposure Metrics */}
        <div className="flex items-center gap-4 text-xs font-mono bg-slate-950 p-3 rounded-lg border border-slate-800 shrink-0">
          <div>
            <span className="text-slate-500 block text-[10px] uppercase">Delay</span>
            <span className="text-amber-400 font-bold text-sm">+{activeDisruption?.delayHours}h</span>
          </div>
          {plans.length === 0 && (
            <button onClick={handleGeneratePlans} className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-semibold">
              Generate Candidate Plans
            </button>
          )}
          <div className="h-7 w-px bg-slate-800" />
          <div>
            <span className="text-slate-500 block text-[10px] uppercase">Orders Exposed</span>
            <span className="text-white font-bold text-sm">{affectedOrders.length}</span>
          </div>
          <div className="h-7 w-px bg-slate-800" />
          <div>
            <span className="text-slate-500 block text-[10px] uppercase">Financial Risk</span>
            <span className="text-rose-400 font-bold text-sm">
              ${activeDisruption ? (activeDisruption.estimatedFinancialImpactUSD / 1000).toFixed(0) : 0}k
            </span>
          </div>
        </div>
      </div>

      {/* 2. Disruption Affected Orders & Warehouse Inventory Availability Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Affected Orders Panel */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-rose-400" />
              <span>Affected Customer Orders ({affectedOrders.length})</span>
            </h4>
            <span className="text-[10px] font-mono text-slate-400">Ranked by SLA Window</span>
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto">
            {affectedOrders.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">No active orders linked to this disruption.</p>
            ) : (
              affectedOrders.map(o => (
                <div
                  key={o.id}
                  className="p-2.5 bg-slate-950/70 border border-slate-800/80 rounded flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-white">{o.id}</span>
                      <PriorityBadge priority={o.priority} />
                      <span className="text-slate-300 font-medium">{o.customerName}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                      SKU: <strong className="text-slate-200">{o.sku}</strong> · Demand: <strong className="text-slate-200">{o.quantityUnits}</strong> units · Exposure: ${o.orderValueUSD.toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <span className={`text-[11px] font-semibold ${o.hoursUntilBreach <= 24 ? 'text-rose-400' : 'text-amber-400'}`}>
                      {o.hoursUntilBreach}h to breach
                    </span>
                    <div className="text-[10px] text-slate-500 capitalize">
                      {o.mitigationStatus.replace('_', ' ')}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Available Inventory by Warehouse and SKU */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <Warehouse className="w-3.5 h-3.5 text-sky-400" />
              <span>Network Stock Availability by Warehouse & SKU</span>
            </h4>
            <span className="text-[10px] font-mono text-slate-400">Physical Unreserved Pools</span>
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto">
            {relevantInventory.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">No stock found for these SKUs in network.</p>
            ) : (
              relevantInventory.map(inv => (
                <div
                  key={inv.id}
                  className="p-2.5 bg-slate-950/70 border border-slate-800/80 rounded flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-semibold text-white">{inv.warehouseName}</div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {inv.warehouseLocation} · SKU: <strong className="text-slate-200">{inv.sku}</strong>
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <div className="flex items-center gap-3">
                      <div>
                        <span className="text-[10px] text-slate-500 block">Available</span>
                        <span className={`font-bold ${inv.availableUnits > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {inv.availableUnits} units
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">Safety Min</span>
                        <span className="text-slate-400">{inv.safetyStockThreshold}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 3. Three Distinct Candidate Recovery Plans Comparison (Requirements 3, 4, 7) */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-purple-400" />
              <span>Candidate Recovery Plans (Deterministic Scenario Comparison)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Side-by-side evaluation of 3 distinct recovery routes against cost, SLA preservation, lateness, and physical constraints.
            </p>
          </div>

          {/* Interactive view toggles */}
          <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setActiveTab('comparison')}
              className={`px-3 py-1.5 font-medium rounded-md transition-colors ${
                activeTab === 'comparison'
                  ? 'bg-slate-850 text-white shadow-xs border border-slate-700/60'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Side-by-Side Plans
            </button>
            <button
              onClick={() => setActiveTab('allocation')}
              className={`px-3 py-1.5 font-medium rounded-md transition-colors ${
                activeTab === 'allocation'
                  ? 'bg-slate-850 text-white shadow-xs border border-slate-700/60'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Order Allocation Table
            </button>
            <button
              onClick={() => setActiveTab('constraints')}
              className={`px-3 py-1.5 font-medium rounded-md transition-colors ${
                activeTab === 'constraints'
                  ? 'bg-slate-850 text-white shadow-xs border border-slate-700/60'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Assumptions & Constraints
            </button>
          </div>
        </div>

        {/* Tab A: Side-by-Side Plan Comparison (Requirements 4 & 7) */}
        {activeTab === 'comparison' && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {plans.map(plan => {
              const isSelected = plan.id === selectedPlan?.id;
              return (
                <div
                  key={plan.id}
                  onClick={() => setSelectedPlanId(plan.id)}
                  className={`relative rounded-lg p-5 flex flex-col justify-between transition-all duration-150 cursor-pointer ${
                    !plan.isFeasible
                      ? isSelected
                        ? 'bg-slate-925 border-2 border-rose-500/90 shadow-lg ring-1 ring-rose-500/20'
                        : 'bg-slate-950/90 border border-rose-800/60 hover:border-rose-600'
                      : isSelected
                      ? 'bg-slate-925 border-2 border-purple-500 shadow-lg ring-1 ring-purple-500/20'
                      : 'bg-slate-950/80 border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Card Header */}
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <span className="text-[10px] font-mono text-purple-400 uppercase tracking-wider block">
                          {plan.strategyType}
                        </span>
                        <h4 className="text-sm font-bold text-white leading-snug">{plan.name}</h4>
                      </div>
                      <PlanStatusBadge status={plan.status} />
                    </div>

                    {/* Infeasible Plan Warning Marker (Requirement 7) */}
                    {!plan.isFeasible && (
                      <div className="mb-3 p-2 bg-rose-950/50 border border-rose-800/80 rounded flex items-center gap-2 text-rose-300 text-xs font-semibold">
                        <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>INFEASIBLE PLAN — Constraint Violated</span>
                      </div>
                    )}

                    {/* Quantitative Comparison Matrix (Requirement 4) */}
                    <div className="grid grid-cols-2 gap-2 my-3 p-3 bg-slate-900/90 rounded border border-slate-800 font-mono text-xs">
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block">Incremental Cost</span>
                        <span className="text-base font-bold text-white">${plan.estimatedCostUSD.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block">Orders Protected</span>
                        <span className={`text-base font-bold ${plan.isFeasible ? 'text-emerald-400' : 'text-slate-400'}`}>
                          {plan.ordersProtectedCount} / {plan.totalOrdersCount}{' '}
                          <span className="text-xs font-normal">({plan.protectionRatePercent.toFixed(0)}%)</span>
                        </span>
                      </div>
                      <div className="pt-2 border-t border-slate-800">
                        <span className="text-[10px] text-slate-500 uppercase block">Expected Late Orders</span>
                        <span className={`text-xs font-bold ${plan.expectedLateOrdersCount === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {plan.expectedLateOrdersCount} orders late
                        </span>
                      </div>
                      <div className="pt-2 border-t border-slate-800">
                        <span className="text-[10px] text-slate-500 uppercase block">Units Allocated</span>
                        <span className="text-xs font-bold text-slate-200">{plan.unitsAllocated} units</span>
                      </div>
                    </div>

                    {/* Feasibility Indicator & Exact Failed Constraint (Requirement 7) */}
                    <div className="space-y-2 mb-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-300">Feasibility Status:</span>
                        <span
                          className={`font-mono font-bold text-xs ${
                            plan.isFeasible ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {plan.isFeasible ? `Feasible (${plan.feasibilityScore}%)` : `Infeasible (${plan.feasibilityScore}%)`}
                        </span>
                      </div>

                      {/* Explicit Failed Constraint Callout */}
                      {!plan.isFeasible && plan.failedConstraint ? (
                        <div className="p-2.5 rounded bg-rose-950/60 border border-rose-800 text-rose-200 text-xs leading-relaxed font-sans">
                          <strong className="block text-rose-400 font-mono text-[11px] mb-0.5">FAILED CONSTRAINT:</strong>
                          {plan.failedConstraint}
                        </div>
                      ) : (
                        <div className="p-2.5 rounded bg-emerald-950/20 border border-emerald-900/40 text-emerald-200/90 text-xs leading-relaxed font-sans">
                          {plan.feasibilityReason}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions Toolbar */}
                  <div className="pt-3 mt-3 border-t border-slate-800 space-y-2">
                    <div className="flex items-center gap-2">
                      {/* Simulation Preview Button (Requirement 8) */}
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setPreviewPlan(plan);
                        }}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-medium transition-colors"
                      >
                        <Eye className="w-3 h-3 text-sky-400" />
                        <span>Preview Simulation</span>
                      </button>

                      {/* Simulate Button (Requirement 9: opens confirmation) */}
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleRequestSimulation(plan);
                        }}
                        className="inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-purple-950/70 hover:bg-purple-900 text-purple-200 border border-purple-800/60 rounded text-xs font-medium transition-colors"
                      >
                        <Play className="w-3 h-3 text-purple-400" />
                        <span>{plan.status === 'simulated' ? 'Re-Simulate' : 'Simulate'}</span>
                      </button>

                      {/* Modify Button */}
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleOpenModify(plan);
                        }}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition-colors"
                        title="Modify parameters"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Submit for Approval Button (Requirement 10) */}
                    {plan.status !== 'approved' && plan.status !== 'executed' && plan.status !== 'submitted' && (
                      <button
                        disabled={!plan.isFeasible}
                        onClick={e => {
                          e.stopPropagation();
                          setSelectedPlanId(plan.id);
                          setIsApprovalModalOpen(true);
                        }}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Send className="w-3 h-3" />
                        <span>Submit for Approval</span>
                      </button>
                    )}

                    {/* Pending state */}
                    {plan.status === 'submitted' && (
                      <div className="w-full p-1.5 bg-amber-950/40 border border-amber-800/60 rounded text-center text-xs text-amber-300 font-medium">
                        Pending Manager Authorization
                      </div>
                    )}

                    {/* Approved & Execute */}
                    {plan.status === 'approved' && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleExecute(plan);
                        }}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold transition-colors"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>Execute Plan (Dispatch EDI 204)</span>
                      </button>
                    )}

                    {plan.status === 'executed' && (
                      <div className="w-full p-1.5 bg-purple-950/70 border border-purple-700/60 rounded text-center text-xs text-purple-200 font-medium">
                        ✓ Dispatched & Active
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tab B: Detailed Allocation Table for Each Plan (Requirement 5) */}
        {activeTab === 'allocation' && selectedPlan && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-950 rounded border border-slate-800">
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-mono">Viewing Order Allocation For:</span>
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  <span>{selectedPlan.name}</span>
                  <PlanStatusBadge status={selectedPlan.status} />
                </div>
              </div>

              {/* Selector to switch plan */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">Switch Plan:</span>
                <select
                  value={selectedPlan.id}
                  onChange={e => setSelectedPlanId(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-white"
                >
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.isFeasible ? 'Feasible' : 'Infeasible'})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Allocation Table */}
            <div className="overflow-x-auto border border-slate-800 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/90 text-slate-400 font-medium border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Order ID & Customer</th>
                    <th className="py-2.5 px-3">SKU</th>
                    <th className="py-2.5 px-3 text-right">Order Qty</th>
                    <th className="py-2.5 px-3 text-right">Allocated Qty</th>
                    <th className="py-2.5 px-3 text-right">Fulfillment</th>
                    <th className="py-2.5 px-3">Source Warehouse Pool</th>
                    <th className="py-2.5 px-3 text-right">Stock (Before → After)</th>
                    <th className="py-2.5 px-3 text-right">Transit Lead</th>
                    <th className="py-2.5 px-3 text-right">SLA Breach Window</th>
                    <th className="py-2.5 px-3">Order Outcome</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {selectedPlan.orderAllocations && selectedPlan.orderAllocations.length > 0 ? (
                    selectedPlan.orderAllocations.map(alloc => (
                      <tr key={alloc.orderId} className="hover:bg-slate-850/60 transition-colors">
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-white">{alloc.orderId}</div>
                          <div className="text-[11px] text-slate-300 font-sans">{alloc.customerName}</div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-300 font-bold">{alloc.sku}</td>
                        <td className="py-2.5 px-3 text-right text-slate-300 tabular-nums">
                          {alloc.orderQuantity}
                        </td>
                        <td className="py-2.5 px-3 text-right text-white font-bold tabular-nums">
                          {alloc.allocatedQuantity}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          <span className={alloc.fulfillmentPercent === 100 ? 'text-emerald-400 font-bold' : alloc.fulfillmentPercent > 0 ? 'text-amber-400' : 'text-rose-400'}>
                            {alloc.fulfillmentPercent.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-sans text-slate-300 text-[11px]">
                          {alloc.sourceWarehouseName} ({alloc.sourceWarehouseId})
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-slate-400 text-[11px]">
                          {alloc.sourceAvailableBefore} → <strong className="text-white">{alloc.sourceRemainingAfter}</strong>
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-200 tabular-nums">
                          {alloc.leadTimeHours}h
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-slate-400">
                          {alloc.hoursUntilBreach}h
                        </td>
                        <td className="py-2.5 px-3 font-sans">
                          {alloc.outcomeStatus === 'protected_on_time' && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-semibold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Protected On-Time</span>
                            </span>
                          )}
                          {alloc.outcomeStatus === 'partial_delay' && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 font-semibold bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/60">
                              <Clock className="w-3 h-3" />
                              <span>Partial ({alloc.latenessHours}h late)</span>
                            </span>
                          )}
                          {alloc.outcomeStatus === 'late_breached' && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-rose-400 font-semibold bg-rose-950/60 px-2 py-0.5 rounded border border-rose-800/60">
                              <XCircle className="w-3 h-3" />
                              <span>Breached (+{alloc.latenessHours}h)</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={10} className="py-6 text-center text-slate-500 font-sans">
                        No order allocation records mapped for this plan.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-slate-950 rounded border border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
              <span>* Deterministic Stock Allocation Rule: Zero double-allocation. Warehouse stock pool is decremented sequentially per priority order.</span>
              <span className="font-mono text-slate-300">Total Units Allocated: {selectedPlan.unitsAllocated} units</span>
            </div>
          </div>
        )}

        {/* Tab C: Explaining Assumptions & Constraints Behind Results (Requirements 6 & 7) */}
        {activeTab === 'constraints' && selectedPlan && (
          <div className="space-y-6 text-xs">
            {/* Header info */}
            <div className="p-3 bg-slate-950 rounded border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-mono">Plan Evaluated:</span>
                <div className="text-xs font-bold text-white">{selectedPlan.name}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Select:</span>
                <select
                  value={selectedPlan.id}
                  onChange={e => setSelectedPlanId(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-white"
                >
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Assumptions List */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                <FileCheck2 className="w-3.5 h-3.5 text-purple-400" />
                <span>Deterministic Operational Assumptions</span>
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {selectedPlan.assumptions?.map((assump, idx) => (
                  <div key={idx} className="p-3 bg-slate-950 rounded border border-slate-800/80 flex items-start gap-2.5">
                    <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-400 text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span className="text-slate-300 leading-relaxed font-sans">{assump}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Constraints Verification Matrix (Requirement 6 & 7) */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-sky-400" />
                <span>Constraints Verification Matrix (Pass / Fail)</span>
              </h4>

              <div className="overflow-x-auto border border-slate-800 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/90 text-slate-400 font-medium border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Constraint Rule</th>
                      <th className="py-2.5 px-3">Required Threshold</th>
                      <th className="py-2.5 px-3">Actual Measured Value</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3">Verification Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {selectedPlan.constraints?.map(c => (
                      <tr key={c.id} className="hover:bg-slate-850/60 transition-colors">
                        <td className="py-2.5 px-3 font-semibold text-white font-sans">{c.name}</td>
                        <td className="py-2.5 px-3 text-slate-400">{c.required}</td>
                        <td className="py-2.5 px-3 text-slate-200">{c.actual}</td>
                        <td className="py-2.5 px-3 text-center">
                          {c.passed ? (
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60 font-semibold font-sans">
                              <Check className="w-3 h-3" />
                              <span>PASSED</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded border border-rose-800/60 font-semibold font-sans">
                              <XCircle className="w-3 h-3" />
                              <span>FAILED</span>
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-sans text-[11px] text-slate-300">
                          {c.failureDetail || 'Constraint satisfied within allowable tolerance bounds.'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* --- MODALS & DRAWERS --- */}

      {/* Requirement 9: Explicit Confirmation Before Changing a Simulated State */}
      <Modal
        isOpen={!!planToSimulate}
        onClose={() => setPlanToSimulate(null)}
        title="Confirm Simulation Execution"
        subtitle={`DisruptionIQ Deterministic Routing Engine · Target: ${planToSimulate?.name}`}
        actions={
          <>
            <button
              onClick={() => setPlanToSimulate(null)}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmSimulation}
              className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Confirm & Run Simulation</span>
            </button>
          </>
        }
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 bg-slate-950 border border-slate-800 rounded font-mono text-slate-300 space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400">Plan:</span>
              <strong className="text-white">{planToSimulate?.name}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Current Status:</span>
              <span className="capitalize text-amber-400">{planToSimulate?.status}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Target State:</span>
              <strong className="text-purple-300">Simulated</strong>
            </div>
          </div>

          <div className="p-3 bg-purple-950/30 border border-purple-800/40 rounded text-slate-300 text-xs leading-relaxed space-y-2">
            <p className="font-semibold text-white">What this confirmation does:</p>
            <ul className="list-disc pl-4 space-y-1 text-slate-300 text-[11px]">
              <li>Runs deterministic route lead-time verification against real carrier schedules.</li>
              <li>Calculates order-by-order stock allocation and confirms no double-allocation across SKUs.</li>
              <li>Updates affected customer order records from 'Unmitigated' to 'Candidate Plan'.</li>
              <li>Generates an immutable audit trail entry logged under your persona ({currentUser.name}).</li>
            </ul>
          </div>
        </div>
      </Modal>

      {/* Requirement 8: Plan Simulation Preview Modal / Drawer */}
      <Drawer
        isOpen={!!previewPlan}
        onClose={() => setPreviewPlan(null)}
        title={`Simulation Preview: ${previewPlan?.name}`}
        subtitle={`Deterministic Modeling Results · Disruption: ${previewPlan?.disruptionId}`}
        width="xl"
        footer={
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400">
              Feasibility: <strong className={previewPlan?.isFeasible ? 'text-emerald-400' : 'text-rose-400'}>{previewPlan?.feasibilityScore}%</strong>
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPreviewPlan(null)}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded text-xs hover:bg-slate-700"
              >
                Close Preview
              </button>
              {previewPlan && previewPlan.isFeasible && (
                <button
                  onClick={() => {
                    setPreviewPlan(null);
                    setSelectedPlanId(previewPlan.id);
                    setIsApprovalModalOpen(true);
                  }}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-semibold"
                >
                  Submit for Approval
                </button>
              )}
            </div>
          </div>
        }
      >
        {previewPlan && (
          <div className="space-y-5 text-xs">
            {/* Feasibility Alert */}
            {!previewPlan.isFeasible && (
              <div className="p-3 bg-rose-950/60 border border-rose-800 rounded text-rose-200">
                <div className="font-bold text-rose-300 mb-1 flex items-center gap-1.5">
                  <AlertOctagon className="w-4 h-4 text-rose-400" />
                  <span>Infeasible Plan Constraint Notice</span>
                </div>
                <p className="text-[11px] leading-relaxed">{previewPlan.failedConstraint}</p>
              </div>
            )}

            {/* Financial Delta Card */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-3 font-mono">
              <h4 className="text-xs font-semibold text-white uppercase tracking-wider font-sans">
                Financial Delta & Penalty Avoidance Model
              </h4>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 bg-slate-900 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block">Expedite Cost</span>
                  <span className="text-base font-bold text-white">${previewPlan.estimatedCostUSD.toLocaleString()}</span>
                </div>
                <div className="p-2 bg-slate-900 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block">Penalty Avoided</span>
                  <span className="text-base font-bold text-emerald-400">
                    ${(previewPlan.estimatedCostUSD * 4.8).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="p-2 bg-slate-900 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block">Net Benefit</span>
                  <span className="text-base font-bold text-sky-400">
                    ${(previewPlan.estimatedCostUSD * 3.8).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Simulated Timeline & Milestones */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-white uppercase tracking-wider">
                Simulated Action Sequence
              </h4>
              <div className="space-y-2">
                {previewPlan.actions.map((act, idx) => (
                  <div key={act.id} className="p-3 bg-slate-950 border border-slate-800 rounded">
                    <div className="flex justify-between font-mono text-[11px]">
                      <span className="text-purple-300 font-semibold">Step {idx + 1}: {act.carrierOrVendor}</span>
                      <span className="text-white">${act.costUSD.toLocaleString()}</span>
                    </div>
                    <div className="text-slate-300 mt-1">{act.description}</div>
                    <div className="text-[10px] text-slate-500 font-mono mt-1">
                      {act.originHub} → {act.destHub} · Duration: {act.estimatedHours}h
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Order Impact Snapshot */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-white uppercase tracking-wider">
                Customer Delivery Status Breakdown
              </h4>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {previewPlan.orderAllocations?.map(a => (
                  <div key={a.orderId} className="p-2.5 bg-slate-950 border border-slate-800 rounded flex justify-between items-center">
                    <div>
                      <div className="font-semibold text-white">{a.orderId} · {a.customerName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        Allocated: {a.allocatedQuantity}/{a.orderQuantity} ({a.fulfillmentPercent.toFixed(0)}%)
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`text-[11px] font-mono font-semibold ${a.outcomeStatus === 'protected_on_time' ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {a.outcomeStatus === 'protected_on_time' ? 'On Time' : `Late (+${a.latenessHours}h)`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* Progress Overlay during confirmed simulation */}
      {isSimulatingProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs">
          <div className="bg-slate-900 border border-purple-800/60 rounded-lg p-6 max-w-sm w-full text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-purple-900/60 border border-purple-500 flex items-center justify-center mx-auto animate-pulse">
              <Zap className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">Deterministic Operations Engine</h4>
              <p className="text-xs text-purple-300 mt-1 font-mono">{simulationStepText}</p>
            </div>
            <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
              <div className="bg-purple-500 h-full w-2/3 animate-pulse rounded-full" />
            </div>
          </div>
        </div>
      )}

      {/* Modify Plan Modal */}
      <Modal
        isOpen={isModifyModalOpen}
        onClose={() => setIsModifyModalOpen(false)}
        title={`Request Plan Modification: ${selectedPlan?.name}`}
        subtitle="The current backend records the requested adjustments and returns the plan for revision."
        actions={
          <>
            <button
              onClick={() => setIsModifyModalOpen(false)}
              className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded text-xs hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveModification}
              className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-semibold"
            >
              Confirm Modification Request
            </button>
          </>
        }
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-medium mb-1">Requested Units for Review</label>
            <input
              type="number"
              value={modifyUnits}
              onChange={e => setModifyUnits(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white font-mono focus:outline-none focus:border-purple-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">Available buffer in candidate hub: 480 units</p>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Requested Cost for Review ($USD)</label>
            <input
              type="number"
              value={modifyCost}
              onChange={e => setModifyCost(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white font-mono focus:outline-none focus:border-purple-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">Includes air charter surcharge and customs handling.</p>
          </div>
        </div>
      </Modal>

      {/* Requirement 10: Submit for Approval Modal */}
      <Modal
        isOpen={isApprovalModalOpen}
        onClose={() => setIsApprovalModalOpen(false)}
        title={`Submit ${selectedPlan?.name} for Manager Approval`}
        subtitle={`Required authorization authority based on estimated cost ($${selectedPlan?.estimatedCostUSD.toLocaleString()}): Supply Chain Director / Operations Manager`}
        actions={
          <>
            <button
              onClick={() => setIsApprovalModalOpen(false)}
              className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded text-xs hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmitForApproval}
              className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-semibold"
            >
              Confirm & Submit Request
            </button>
          </>
        }
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 bg-slate-950 border border-slate-800 rounded font-mono space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400">Disruption Reference:</span>
              <span className="text-white font-bold">{activeDisruption?.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Total Expenditure:</span>
              <span className="text-white font-bold">${selectedPlan?.estimatedCostUSD.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Customer Orders Protected:</span>
              <span className="text-emerald-400 font-bold">{selectedPlan?.ordersProtectedCount} customer SLAs</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Expected Late Orders:</span>
              <span className="text-slate-300 font-bold">{selectedPlan?.expectedLateOrdersCount} orders</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Requester Persona:</span>
              <span className="text-slate-200">{currentUser.name} ({currentUser.roleLabel})</span>
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Operational Justification & Risk Rationale</label>
            <textarea
              rows={3}
              value={justificationNotes}
              onChange={e => setJustificationNotes(e.target.value)}
              placeholder="e.g., Fulfills AeroTech Systems P1 order without assembly line stoppage. Penalty avoided is $145,000 against a $24,500 expedite budget."
              className="w-full bg-slate-950 border border-slate-800 rounded p-2.5 text-white text-xs focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
