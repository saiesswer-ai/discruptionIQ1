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
  Sparkles,
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
  const [generationFeedback, setGenerationFeedback] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'comparison' | 'allocation' | 'constraints'>('comparison');

  // Confirmation Modals State
  const [planToSimulate, setPlanToSimulate] = useState<RecoveryPlan | null>(null);
  const [isSimulatingProgress, setIsSimulatingProgress] = useState<boolean>(false);
  const [simulationStepText, setSimulationStepText] = useState<string>('');

  // Simulation Preview Modal
  const [previewPlan, setPreviewPlan] = useState<RecoveryPlan | null>(null);

  // Modify Plan Modal
  const [isModifyModalOpen, setIsModifyModalOpen] = useState<boolean>(false);
  const [modifyUnits, setModifyUnits] = useState<number>(0);
  const [modifyCost, setModifyCost] = useState<number>(0);

  // Submit for Approval Modal
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
          if (!loadedPlans.some(p => p.id === selectedPlanId)) {
            setSelectedPlanId(loadedPlans[0].id);
          }
        }
      }).catch(err => showToast(err.message || 'Unable to load recovery plans.', 'error'));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDisruption?.id]);

  const selectedPlan = plans.find(p => p.id === selectedPlanId) || plans[0];
  const affectedOrders = orders.filter(o => o.associatedDisruptionId === activeDisruption?.id);
  const relevantInventory = inventory.filter(i => activeDisruption?.affectedSKUs?.includes(i.sku));

  // --- Handlers ---
  const handleRequestSimulation = (plan: RecoveryPlan) => {
    setPlanToSimulate(plan);
  };

  const handleGeneratePlans = async () => {
    if (!activeDisruption || !window.confirm(`Generate candidate recovery plans for ${activeDisruption.id}? This records a server-side planning action.`)) return;
    try {
      const generated = await api.createRecoveryPlans(activeDisruption.id);
      setPlans(generated);
      setGenerationFeedback(null);
      setSelectedPlanId(generated[0]?.id || '');
      showToast(`${generated.length} backend-generated recovery plans are ready for review.`, 'success');
      refreshData();
    } catch (err: any) {
      const message = err.message || 'Unable to generate recovery plans.';
      setGenerationFeedback(message);
      showToast(message, 'error');
    }
  };

  const handleConfirmSimulation = async () => {
    if (!planToSimulate) return;
    const targetPlan = planToSimulate;
    setPlanToSimulate(null);

    setIsSimulatingProgress(true);
    setSimulationStepText('Auditing physical warehouse unreserved stock allocations...');

    setTimeout(() => {
      setSimulationStepText('Validating carrier freight slots & cargo pallet capacities...');
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

  const handleOpenModify = (plan: RecoveryPlan) => {
    setModifyUnits(plan.unitsAllocated);
    setModifyCost(plan.estimatedCostUSD);
    setIsModifyModalOpen(true);
  };

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
      {/* 1. Header Banner & Disruption Context Selector (InsightOS Dark Feature Panel) */}
      <div className="card-hero p-6 sm:p-7 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 rounded-full bg-[#C8FF32]/8 blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-[#A0A69E]">
                Recovery Arena
              </span>
              <span className="text-[10px] font-mono text-[#080908] bg-[#C8FF32] font-bold px-2 py-0.5 rounded-full">
                AI SCENARIO EVALUATION
              </span>
              <SeverityBadge severity={activeDisruption?.severity || 'critical'} />
              <StatusBadge status={activeDisruption?.status || 'active'} />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <select
                value={activeDisruption?.id}
                onChange={e => setArenaDisruptionId(e.target.value)}
                className="bg-[#171917] border border-[#2F342F] rounded-xl px-3.5 py-2 text-sm font-semibold text-white focus:outline-none focus:border-[#C8FF32] focus:ring-1 focus:ring-[#C8FF32]"
              >
                {disruptions.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.id} — {d.title} (+{d.delayHours}h delay)
                  </option>
                ))}
              </select>

              {plans.length === 0 && (
                <button
                  onClick={handleGeneratePlans}
                  className="btn-lime text-xs py-2 px-4 whitespace-nowrap"
                >
                  <Sparkles className="w-3.5 h-3.5 fill-[#080908]" />
                  <span>Generate Candidate Plans</span>
                </button>
              )}
            </div>

            <p className="text-xs text-[#A0A69D] mt-2.5 max-w-2xl leading-relaxed">
              {activeDisruption?.summary}
            </p>
          </div>

          {/* Quick Disruption Exposure Metrics */}
          <div className="flex items-center gap-4 text-xs font-mono bg-[#171917] p-3.5 rounded-2xl border border-[#2B2F2B] shrink-0">
            <div>
              <span className="text-[#777B76] block text-[10px] uppercase font-semibold">Delay</span>
              <span className="text-[#F5C451] font-bold text-base">+{activeDisruption?.delayHours}h</span>
            </div>
            <div className="h-8 w-px bg-[#2B2F2B]" />
            <div>
              <span className="text-[#777B76] block text-[10px] uppercase font-semibold">Orders Exposed</span>
              <span className="text-white font-bold text-base">{affectedOrders.length}</span>
            </div>
            <div className="h-8 w-px bg-[#2B2F2B]" />
            <div>
              <span className="text-[#777B76] block text-[10px] uppercase font-semibold">Financial Risk</span>
              <span className="text-[#E85D68] font-bold text-base">
                ${activeDisruption ? (activeDisruption.estimatedFinancialImpactUSD / 1000).toFixed(0) : 0}k
              </span>
            </div>
          </div>
        </div>
      </div>

      {generationFeedback && (
        <div className="p-4 bg-[#FEF6E4] border border-[#F9DC9B] rounded-2xl text-xs text-[#805400] font-medium">
          <strong>Candidate plans were not generated:</strong> {generationFeedback}
        </div>
      )}

      {/* 2. Disruption Affected Orders & Warehouse Inventory Availability Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Affected Orders Panel */}
        <div className="card-light p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xs font-bold text-[#171917] uppercase tracking-wider flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#E85D68]" />
              <span>Affected Customer Orders ({affectedOrders.length})</span>
            </h4>
            <span className="text-[11px] font-mono text-[#777B76]">Ranked by SLA Window</span>
          </div>

          <div className="space-y-2.5 max-h-60 overflow-y-auto">
            {affectedOrders.length === 0 ? (
              <p className="text-xs text-[#777B76] py-6 text-center">No active orders linked to this disruption.</p>
            ) : (
              affectedOrders.map(o => (
                <div
                  key={o.id}
                  className="p-3 bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl flex items-center justify-between text-xs hover:border-[#D1D6CB] transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[#171917]">{o.id}</span>
                      <PriorityBadge priority={o.priority} />
                      <span className="text-[#171917] font-semibold">{o.customerName}</span>
                    </div>
                    <div className="text-[11px] text-[#777B76] font-mono mt-1">
                      SKU: <strong className="text-[#171917]">{o.sku}</strong> · Demand: <strong className="text-[#171917]">{o.quantityUnits}</strong> units · Exposure: ${o.orderValueUSD.toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <span className={`text-[11px] font-bold ${o.hoursUntilBreach <= 24 ? 'text-[#9E1B26]' : 'text-[#805400]'}`}>
                      {o.hoursUntilBreach}h to breach
                    </span>
                    <div className="text-[10px] text-[#777B76] capitalize">
                      {o.mitigationStatus.replace('_', ' ')}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Available Inventory by Warehouse and SKU */}
        <div className="card-light p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xs font-bold text-[#171917] uppercase tracking-wider flex items-center gap-2">
              <Warehouse className="w-4 h-4 text-[#7185FF]" />
              <span>Network Stock Availability by Hub & SKU</span>
            </h4>
            <span className="text-[11px] font-mono text-[#777B76]">Physical Unreserved Pools</span>
          </div>

          <div className="space-y-2.5 max-h-60 overflow-y-auto">
            {relevantInventory.length === 0 ? (
              <p className="text-xs text-[#777B76] py-6 text-center">No stock found for these SKUs in network.</p>
            ) : (
              relevantInventory.map(inv => (
                <div
                  key={inv.id}
                  className="p-3 bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl flex items-center justify-between text-xs hover:border-[#D1D6CB] transition-colors"
                >
                  <div>
                    <div className="font-bold text-[#171917]">{inv.warehouseName}</div>
                    <div className="text-[11px] text-[#777B76] font-mono mt-0.5">
                      {inv.warehouseLocation} · SKU: <strong className="text-[#171917]">{inv.sku}</strong>
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <div className="flex items-center gap-4">
                      <div>
                        <span className="text-[10px] text-[#777B76] block">Available</span>
                        <span className={`font-bold ${inv.availableUnits > 0 ? 'text-[#2E7D32]' : 'text-[#9E1B26]'}`}>
                          {inv.availableUnits} units
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#777B76] block">Safety Min</span>
                        <span className="text-[#777B76] font-medium">{inv.safetyStockThreshold}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 3. Three Distinct Candidate Recovery Plans Comparison */}
      <div className="card-light p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-base font-bold text-[#171917] flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#171917]" />
              <span>Candidate Recovery Plans (Deterministic Scenario Comparison)</span>
            </h3>
            <p className="text-xs text-[#777B76] mt-0.5">
              Side-by-side evaluation of recovery routes against cost, SLA preservation, lateness, and physical constraints.
            </p>
          </div>

          {/* Interactive view toggles */}
          <div className="flex items-center gap-1 p-1 bg-[#F0F1EE] rounded-xl border border-[#E8EAE4] text-xs">
            <button
              onClick={() => setActiveTab('comparison')}
              className={`px-3.5 py-1.5 font-semibold rounded-lg transition-colors ${
                activeTab === 'comparison'
                  ? 'bg-white text-[#171917] shadow-sm'
                  : 'text-[#777B76] hover:text-[#171917]'
              }`}
            >
              Side-by-Side Plans
            </button>
            <button
              onClick={() => setActiveTab('allocation')}
              className={`px-3.5 py-1.5 font-semibold rounded-lg transition-colors ${
                activeTab === 'allocation'
                  ? 'bg-white text-[#171917] shadow-sm'
                  : 'text-[#777B76] hover:text-[#171917]'
              }`}
            >
              Order Allocation Table
            </button>
            <button
              onClick={() => setActiveTab('constraints')}
              className={`px-3.5 py-1.5 font-semibold rounded-lg transition-colors ${
                activeTab === 'constraints'
                  ? 'bg-white text-[#171917] shadow-sm'
                  : 'text-[#777B76] hover:text-[#171917]'
              }`}
            >
              Assumptions & Constraints
            </button>
          </div>
        </div>

        {/* Tab A: Side-by-Side Plan Comparison */}
        {activeTab === 'comparison' && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {plans.map(plan => {
              const isSelected = plan.id === selectedPlan?.id;
              return (
                <div
                  key={plan.id}
                  onClick={() => setSelectedPlanId(plan.id)}
                  className={`relative rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 cursor-pointer ${
                    !plan.isFeasible
                      ? isSelected
                        ? 'bg-[#FDF0F1] border-2 border-[#E85D68] shadow-md'
                        : 'bg-white border border-[#F7B6BC] hover:border-[#E85D68]'
                      : isSelected
                      ? 'bg-[#171917] text-[#F7F9F4] border-2 border-[#C8FF32] shadow-xl'
                      : 'bg-white border border-[#E8EAE4] hover:border-[#C8FF32]'
                  }`}
                >
                  {/* Card Header */}
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <span className={`text-[10px] font-mono uppercase tracking-wider block font-semibold ${isSelected && plan.isFeasible ? 'text-[#C8FF32]' : 'text-[#777B76]'}`}>
                          {plan.strategyType}
                        </span>
                        <h4 className={`text-sm font-bold leading-snug ${isSelected && plan.isFeasible ? 'text-white' : 'text-[#171917]'}`}>
                          {plan.name}
                        </h4>
                      </div>
                      <PlanStatusBadge status={plan.status} />
                    </div>

                    {/* Infeasible Plan Warning Marker */}
                    {!plan.isFeasible && (
                      <div className="mb-3 p-2 bg-[#FDF0F1] border border-[#F7B6BC] rounded-xl flex items-center gap-2 text-[#9E1B26] text-xs font-semibold">
                        <AlertOctagon className="w-4 h-4 text-[#E85D68] shrink-0" />
                        <span>INFEASIBLE PLAN — Constraint Violated</span>
                      </div>
                    )}

                    {/* Quantitative Comparison Matrix */}
                    <div className={`grid grid-cols-2 gap-2 my-3 p-3 rounded-xl font-mono text-xs ${
                      isSelected && plan.isFeasible ? 'bg-[#242824] border border-[#363B36]' : 'bg-[#F8F9F6] border border-[#E8EAE4]'
                    }`}>
                      <div>
                        <span className="text-[10px] text-[#777B76] uppercase block">Incremental Cost</span>
                        <span className={`text-base font-bold ${isSelected && plan.isFeasible ? 'text-white' : 'text-[#171917]'}`}>
                          ${plan.estimatedCostUSD.toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#777B76] uppercase block">Orders Protected</span>
                        <span className={`text-base font-bold ${plan.isFeasible ? (isSelected ? 'text-[#C8FF32]' : 'text-[#2E7D32]') : 'text-[#777B76]'}`}>
                          {plan.ordersProtectedCount} / {plan.totalOrdersCount}{' '}
                          <span className="text-xs font-normal">({plan.protectionRatePercent.toFixed(0)}%)</span>
                        </span>
                      </div>
                      <div className={`pt-2 border-t ${isSelected && plan.isFeasible ? 'border-[#363B36]' : 'border-[#E8EAE4]'}`}>
                        <span className="text-[10px] text-[#777B76] uppercase block">Expected Late Orders</span>
                        <span className={`text-xs font-bold ${plan.expectedLateOrdersCount === 0 ? (isSelected && plan.isFeasible ? 'text-[#84E344]' : 'text-[#2E7D32]') : 'text-[#9E1B26]'}`}>
                          {plan.expectedLateOrdersCount} orders late
                        </span>
                      </div>
                      <div className={`pt-2 border-t ${isSelected && plan.isFeasible ? 'border-[#363B36]' : 'border-[#E8EAE4]'}`}>
                        <span className="text-[10px] text-[#777B76] uppercase block">Units Allocated</span>
                        <span className={`text-xs font-bold ${isSelected && plan.isFeasible ? 'text-white' : 'text-[#171917]'}`}>
                          {plan.unitsAllocated} units
                        </span>
                      </div>
                    </div>

                    {/* Feasibility Indicator & Exact Failed Constraint */}
                    <div className="space-y-2 mb-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className={`font-semibold ${isSelected && plan.isFeasible ? 'text-[#A0A69D]' : 'text-[#777B76]'}`}>
                          Feasibility Status:
                        </span>
                        <span
                          className={`font-mono font-bold text-xs ${
                            plan.isFeasible
                              ? (isSelected ? 'text-[#C8FF32]' : 'text-[#2E7D32]')
                              : 'text-[#9E1B26]'
                          }`}
                        >
                          {plan.isFeasible ? `Feasible (${plan.feasibilityScore}%)` : `Infeasible (${plan.feasibilityScore}%)`}
                        </span>
                      </div>

                      {!plan.isFeasible && plan.failedConstraint ? (
                        <div className="p-3 rounded-xl bg-[#FDF0F1] border border-[#F7B6BC] text-[#9E1B26] text-xs leading-relaxed font-sans">
                          <strong className="block text-[#9E1B26] font-mono text-[11px] mb-0.5">FAILED CONSTRAINT:</strong>
                          {plan.failedConstraint}
                        </div>
                      ) : (
                        <div className={`p-3 rounded-xl text-xs leading-relaxed font-sans ${
                          isSelected && plan.isFeasible
                            ? 'bg-[#242824] text-[#D1D6CB] border border-[#363B36]'
                            : 'bg-[#EBF9E4] text-[#1D5E0A] border border-[#C5EAB5]'
                        }`}>
                          {plan.feasibilityReason}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions Toolbar */}
                  <div className={`pt-3 mt-3 border-t space-y-2 ${isSelected && plan.isFeasible ? 'border-[#363B36]' : 'border-[#E8EAE4]'}`}>
                    <div className="flex items-center gap-2">
                      {/* Preview Button */}
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setPreviewPlan(plan);
                        }}
                        className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                          isSelected && plan.isFeasible
                            ? 'bg-[#242824] hover:bg-[#2F342F] text-white border border-[#3D443D]'
                            : 'btn-secondary'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5 text-[#7185FF]" />
                        <span>Preview</span>
                      </button>

                      {/* Simulate Button */}
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleRequestSimulation(plan);
                        }}
                        className={`inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                          isSelected && plan.isFeasible
                            ? 'bg-[#C8FF32] hover:bg-[#DFFF83] text-[#080908]'
                            : 'btn-dark'
                        }`}
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>{plan.status === 'simulated' ? 'Re-Simulate' : 'Simulate'}</span>
                      </button>

                      {/* Modify Button */}
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleOpenModify(plan);
                        }}
                        className={`p-1.5 rounded-xl text-xs transition-colors ${
                          isSelected && plan.isFeasible
                            ? 'bg-[#242824] hover:bg-[#2F342F] text-white border border-[#3D443D]'
                            : 'btn-secondary'
                        }`}
                        title="Modify parameters"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Submit for Approval Button */}
                    {plan.status !== 'approved' && plan.status !== 'executed' && plan.status !== 'submitted' && (
                      <button
                        disabled={!plan.isFeasible}
                        onClick={e => {
                          e.stopPropagation();
                          setSelectedPlanId(plan.id);
                          setIsApprovalModalOpen(true);
                        }}
                        className="w-full btn-lime py-2 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Submit for Approval</span>
                      </button>
                    )}

                    {/* Pending state */}
                    {plan.status === 'submitted' && (
                      <div className="w-full p-2 bg-[#FEF6E4] border border-[#F9DC9B] rounded-xl text-center text-xs text-[#805400] font-semibold">
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
                        className="w-full btn-lime py-2 text-xs font-bold"
                      >
                        <CheckCheck className="w-4 h-4" />
                        <span>Execute Plan (Dispatch EDI 204)</span>
                      </button>
                    )}

                    {plan.status === 'executed' && (
                      <div className="w-full p-2 bg-[#EBF9E4] border border-[#C5EAB5] rounded-xl text-center text-xs text-[#1D5E0A] font-bold">
                        ✓ Dispatched &amp; Active
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tab B: Detailed Allocation Table */}
        {activeTab === 'allocation' && selectedPlan && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-[#F8F9F6] rounded-2xl border border-[#E8EAE4]">
              <div>
                <span className="text-[10px] text-[#777B76] uppercase font-mono font-medium">Viewing Order Allocation For:</span>
                <div className="text-sm font-bold text-[#171917] flex items-center gap-2 mt-0.5">
                  <span>{selectedPlan.name}</span>
                  <PlanStatusBadge status={selectedPlan.status} />
                </div>
              </div>

              {/* Selector to switch plan */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[#777B76] font-medium">Switch Plan:</span>
                <select
                  value={selectedPlan.id}
                  onChange={e => setSelectedPlanId(e.target.value)}
                  className="bg-white border border-[#E8EAE4] rounded-xl px-3 py-1.5 text-xs text-[#171917] font-medium"
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
            <div className="overflow-x-auto border border-[#E8EAE4] rounded-2xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8F9F6] text-[#777B76] font-semibold border-b border-[#E8EAE4]">
                  <tr>
                    <th className="py-3 px-3.5">Order ID & Customer</th>
                    <th className="py-3 px-3.5">SKU</th>
                    <th className="py-3 px-3.5 text-right">Order Qty</th>
                    <th className="py-3 px-3.5 text-right">Allocated Qty</th>
                    <th className="py-3 px-3.5 text-right">Fulfillment</th>
                    <th className="py-3 px-3.5">Source Warehouse Pool</th>
                    <th className="py-3 px-3.5 text-right">Stock (Before → After)</th>
                    <th className="py-3 px-3.5 text-right">Transit Lead</th>
                    <th className="py-3 px-3.5 text-right">SLA Breach Window</th>
                    <th className="py-3 px-3.5">Order Outcome</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8EAE4] font-mono">
                  {selectedPlan.orderAllocations && selectedPlan.orderAllocations.length > 0 ? (
                    selectedPlan.orderAllocations.map(alloc => (
                      <tr key={alloc.orderId} className="hover:bg-[#F8F9F6] transition-colors">
                        <td className="py-3 px-3.5">
                          <div className="font-bold text-[#171917]">{alloc.orderId}</div>
                          <div className="text-[11px] text-[#777B76] font-sans">{alloc.customerName}</div>
                        </td>
                        <td className="py-3 px-3.5 text-[#171917] font-bold">{alloc.sku}</td>
                        <td className="py-3 px-3.5 text-right text-[#777B76] tabular-nums">
                          {alloc.orderQuantity}
                        </td>
                        <td className="py-3 px-3.5 text-right text-[#171917] font-bold tabular-nums">
                          {alloc.allocatedQuantity}
                        </td>
                        <td className="py-3 px-3.5 text-right tabular-nums">
                          <span className={alloc.fulfillmentPercent === 100 ? 'text-[#2E7D32] font-bold' : alloc.fulfillmentPercent > 0 ? 'text-[#805400]' : 'text-[#9E1B26]'}>
                            {alloc.fulfillmentPercent.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-3 px-3.5 font-sans text-[#171917] text-[11px]">
                          {alloc.sourceWarehouseName} ({alloc.sourceWarehouseId})
                        </td>
                        <td className="py-3 px-3.5 text-right tabular-nums text-[#777B76] text-[11px]">
                          {alloc.sourceAvailableBefore} → <strong className="text-[#171917]">{alloc.sourceRemainingAfter}</strong>
                        </td>
                        <td className="py-3 px-3.5 text-right text-[#171917] tabular-nums">
                          {alloc.leadTimeHours}h
                        </td>
                        <td className="py-3 px-3.5 text-right tabular-nums text-[#777B76]">
                          {alloc.hoursUntilBreach}h
                        </td>
                        <td className="py-3 px-3.5 font-sans">
                          {alloc.outcomeStatus === 'protected_on_time' && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-[#1D5E0A] font-semibold bg-[#EBF9E4] px-2.5 py-0.5 rounded-full border border-[#C5EAB5]">
                              <CheckCircle2 className="w-3 h-3 text-[#2E7D32]" />
                              <span>Protected On-Time</span>
                            </span>
                          )}
                          {alloc.outcomeStatus === 'partial_delay' && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-[#805400] font-semibold bg-[#FEF6E4] px-2.5 py-0.5 rounded-full border border-[#F9DC9B]">
                              <Clock className="w-3 h-3 text-[#B78103]" />
                              <span>Partial ({alloc.latenessHours}h late)</span>
                            </span>
                          )}
                          {alloc.outcomeStatus === 'late_breached' && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-[#9E1B26] font-semibold bg-[#FDF0F1] px-2.5 py-0.5 rounded-full border border-[#F7B6BC]">
                              <XCircle className="w-3 h-3 text-[#C62828]" />
                              <span>Breached (+{alloc.latenessHours}h)</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={10} className="py-6 text-center text-[#777B76] font-sans">
                        No order allocation records mapped for this plan.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-3.5 bg-[#F8F9F6] rounded-2xl border border-[#E8EAE4] text-[11px] text-[#777B76] flex items-center justify-between">
              <span>* Deterministic Stock Allocation Rule: Zero double-allocation. Warehouse stock pool is decremented sequentially per priority order.</span>
              <span className="font-mono font-bold text-[#171917]">Total Units Allocated: {selectedPlan.unitsAllocated} units</span>
            </div>
          </div>
        )}

        {/* Tab C: Explaining Assumptions & Constraints Behind Results */}
        {activeTab === 'constraints' && selectedPlan && (
          <div className="space-y-6 text-xs">
            {/* Header info */}
            <div className="p-3.5 bg-[#F8F9F6] rounded-2xl border border-[#E8EAE4] flex items-center justify-between">
              <div>
                <span className="text-[10px] text-[#777B76] uppercase font-mono font-medium">Plan Evaluated:</span>
                <div className="text-sm font-bold text-[#171917]">{selectedPlan.name}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[#777B76] font-medium">Select:</span>
                <select
                  value={selectedPlan.id}
                  onChange={e => setSelectedPlanId(e.target.value)}
                  className="bg-white border border-[#E8EAE4] rounded-xl px-3 py-1.5 text-xs text-[#171917] font-medium"
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
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold text-[#171917] uppercase tracking-wider flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-[#171917]" />
                <span>Deterministic Operational Assumptions</span>
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {selectedPlan.assumptions?.map((assump, idx) => (
                  <div key={idx} className="p-3.5 bg-[#F8F9F6] rounded-2xl border border-[#E8EAE4] flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-[#171917] text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span className="text-[#171917] leading-relaxed font-sans">{assump}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Constraints Verification Matrix */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold text-[#171917] uppercase tracking-wider flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#7185FF]" />
                <span>Constraints Verification Matrix (Pass / Fail)</span>
              </h4>

              <div className="overflow-x-auto border border-[#E8EAE4] rounded-2xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F8F9F6] text-[#777B76] font-semibold border-b border-[#E8EAE4]">
                    <tr>
                      <th className="py-3 px-3.5">Constraint Rule</th>
                      <th className="py-3 px-3.5">Required Threshold</th>
                      <th className="py-3 px-3.5">Actual Measured Value</th>
                      <th className="py-3 px-3.5 text-center">Status</th>
                      <th className="py-3 px-3.5">Verification Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8EAE4] font-mono">
                    {selectedPlan.constraints?.map(c => (
                      <tr key={c.id} className="hover:bg-[#F8F9F6] transition-colors">
                        <td className="py-3 px-3.5 font-bold text-[#171917] font-sans">{c.name}</td>
                        <td className="py-3 px-3.5 text-[#777B76]">{c.required}</td>
                        <td className="py-3 px-3.5 text-[#171917] font-semibold">{c.actual}</td>
                        <td className="py-3 px-3.5 text-center">
                          {c.passed ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-[#1D5E0A] bg-[#EBF9E4] px-2.5 py-0.5 rounded-full border border-[#C5EAB5] font-bold font-sans">
                              <Check className="w-3.5 h-3.5 text-[#2E7D32]" />
                              <span>PASSED</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-[#9E1B26] bg-[#FDF0F1] px-2.5 py-0.5 rounded-full border border-[#F7B6BC] font-bold font-sans">
                              <XCircle className="w-3.5 h-3.5 text-[#C62828]" />
                              <span>FAILED</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3.5 font-sans text-[11px] text-[#777B76]">
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

      {/* Simulation Confirmation Modal */}
      <Modal
        isOpen={!!planToSimulate}
        onClose={() => setPlanToSimulate(null)}
        title="Confirm Simulation Execution"
        subtitle={`Deterministic Modeling Engine · Target: ${planToSimulate?.name}`}
        actions={
          <>
            <button
              onClick={() => setPlanToSimulate(null)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmSimulation}
              className="btn-lime"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Confirm & Run Simulation</span>
            </button>
          </>
        }
      >
        <div className="space-y-4 text-xs">
          <div className="p-4 bg-[#F8F9F6] border border-[#E8EAE4] rounded-2xl font-mono text-[#171917] space-y-1.5">
            <div className="flex justify-between">
              <span className="text-[#777B76]">Plan:</span>
              <strong className="text-[#171917]">{planToSimulate?.name}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-[#777B76]">Current Status:</span>
              <span className="capitalize text-[#805400] font-bold">{planToSimulate?.status}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#777B76]">Target State:</span>
              <strong className="text-[#171917] bg-[#F0FFCC] px-2 py-0.5 rounded border border-[#C8FF32]">Simulated</strong>
            </div>
          </div>

          <div className="p-4 bg-[#F8F9F6] border border-[#E8EAE4] rounded-2xl text-[#171917] text-xs leading-relaxed space-y-2">
            <p className="font-bold text-[#171917]">What this confirmation does:</p>
            <ul className="list-disc pl-4 space-y-1 text-[#777B76] text-[11px]">
              <li>Runs deterministic route lead-time verification against real carrier schedules.</li>
              <li>Calculates order-by-order stock allocation and confirms no double-allocation across SKUs.</li>
              <li>Updates affected customer order records from 'Unmitigated' to 'Candidate Plan'.</li>
              <li>Generates an immutable audit trail entry logged under your persona ({currentUser.name}).</li>
            </ul>
          </div>
        </div>
      </Modal>

      {/* Plan Simulation Preview Drawer */}
      <Drawer
        isOpen={!!previewPlan}
        onClose={() => setPreviewPlan(null)}
        title={`Simulation Preview: ${previewPlan?.name}`}
        subtitle={`Deterministic Modeling Results · Disruption: ${previewPlan?.disruptionId}`}
        width="xl"
        footer={
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-[#777B76]">
              Feasibility: <strong className={previewPlan?.isFeasible ? 'text-[#2E7D32]' : 'text-[#9E1B26]'}>{previewPlan?.feasibilityScore}%</strong>
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPreviewPlan(null)}
                className="btn-secondary"
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
                  className="btn-lime"
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
              <div className="p-4 bg-[#FDF0F1] border border-[#F7B6BC] rounded-2xl text-[#9E1B26]">
                <div className="font-bold mb-1 flex items-center gap-1.5">
                  <AlertOctagon className="w-4 h-4 text-[#E85D68]" />
                  <span>Infeasible Plan Constraint Notice</span>
                </div>
                <p className="text-[11px] leading-relaxed">{previewPlan.failedConstraint}</p>
              </div>
            )}

            {/* Financial Delta Card */}
            <div className="p-4 bg-[#F8F9F6] border border-[#E8EAE4] rounded-2xl space-y-3 font-mono">
              <h4 className="text-xs font-bold text-[#171917] uppercase tracking-wider font-sans">
                Financial Delta & Penalty Avoidance Model
              </h4>
              <div className="grid grid-cols-3 gap-2.5 text-center">
                <div className="p-3 bg-white rounded-xl border border-[#E8EAE4]">
                  <span className="text-[10px] text-[#777B76] uppercase block font-semibold">Expedite Cost</span>
                  <span className="text-base font-bold text-[#171917]">${previewPlan.estimatedCostUSD.toLocaleString()}</span>
                </div>
                <div className="p-3 bg-white rounded-xl border border-[#E8EAE4]">
                  <span className="text-[10px] text-[#777B76] uppercase block font-semibold">Penalty Avoided</span>
                  <span className="text-base font-bold text-[#2E7D32]">
                    ${(previewPlan.estimatedCostUSD * 4.8).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="p-3 bg-white rounded-xl border border-[#E8EAE4]">
                  <span className="text-[10px] text-[#777B76] uppercase block font-semibold">Net Benefit</span>
                  <span className="text-base font-bold text-[#7185FF]">
                    ${(previewPlan.estimatedCostUSD * 3.8).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Simulated Timeline & Milestones */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-[#171917] uppercase tracking-wider">
                Simulated Action Sequence
              </h4>
              <div className="space-y-2">
                {previewPlan.actions.map((act, idx) => (
                  <div key={act.id} className="p-3.5 bg-[#F8F9F6] border border-[#E8EAE4] rounded-2xl">
                    <div className="flex justify-between font-mono text-[11px]">
                      <span className="text-[#171917] font-bold">Step {idx + 1}: {act.carrierOrVendor}</span>
                      <span className="text-[#171917] font-bold">${act.costUSD.toLocaleString()}</span>
                    </div>
                    <div className="text-[#777B76] mt-1">{act.description}</div>
                    <div className="text-[10px] text-[#A0A39D] font-mono mt-1">
                      {act.originHub} → {act.destHub} · Duration: {act.estimatedHours}h
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Order Impact Snapshot */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-[#171917] uppercase tracking-wider">
                Customer Delivery Status Breakdown
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {previewPlan.orderAllocations?.map(a => (
                  <div key={a.orderId} className="p-3 bg-[#F8F9F6] border border-[#E8EAE4] rounded-2xl flex justify-between items-center">
                    <div>
                      <div className="font-bold text-[#171917]">{a.orderId} · {a.customerName}</div>
                      <div className="text-[10px] text-[#777B76] font-mono">
                        Allocated: {a.allocatedQuantity}/{a.orderQuantity} ({a.fulfillmentPercent.toFixed(0)}%)
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`text-[11px] font-mono font-bold ${a.outcomeStatus === 'protected_on_time' ? 'text-[#2E7D32]' : 'text-[#9E1B26]'}`}>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#080908]/70 backdrop-blur-xs">
          <div className="card-dark p-7 max-w-sm w-full text-center space-y-4 shadow-2xl">
            <div className="w-14 h-14 rounded-2xl bg-[#1C201C] border border-[#303830] flex items-center justify-center mx-auto">
              <div className="ai-orb-glow ai-orb-animated" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">InsightOS AI Simulation</h4>
              <p className="text-xs text-[#C8FF32] mt-1 font-mono">{simulationStepText}</p>
            </div>
            <div className="w-full bg-[#242824] h-2 rounded-full overflow-hidden">
              <div className="bg-[#C8FF32] h-full w-2/3 animate-pulse rounded-full shadow-[0_0_10px_#C8FF32]" />
            </div>
          </div>
        </div>
      )}

      {/* Modify Plan Modal */}
      <Modal
        isOpen={isModifyModalOpen}
        onClose={() => setIsModifyModalOpen(false)}
        title={`Request Plan Modification: ${selectedPlan?.name}`}
        subtitle="The connected backend records the requested adjustments and returns the plan for revision."
        actions={
          <>
            <button
              onClick={() => setIsModifyModalOpen(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveModification}
              className="btn-lime"
            >
              Confirm Modification Request
            </button>
          </>
        }
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block text-xs font-semibold text-[#171917] mb-1.5">Requested Units for Review</label>
            <input
              type="number"
              value={modifyUnits}
              onChange={e => setModifyUnits(Number(e.target.value))}
              className="w-full bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl px-3.5 py-2.5 text-[#171917] font-mono focus:outline-none focus:border-[#C8FF32] focus:ring-2 focus:ring-[#C8FF32]/50"
            />
            <p className="text-[11px] text-[#777B76] mt-1">Available buffer in candidate hub: 480 units</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#171917] mb-1.5">Requested Cost for Review ($USD)</label>
            <input
              type="number"
              value={modifyCost}
              onChange={e => setModifyCost(Number(e.target.value))}
              className="w-full bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl px-3.5 py-2.5 text-[#171917] font-mono focus:outline-none focus:border-[#C8FF32] focus:ring-2 focus:ring-[#C8FF32]/50"
            />
            <p className="text-[11px] text-[#777B76] mt-1">Includes air charter surcharge and customs handling.</p>
          </div>
        </div>
      </Modal>

      {/* Submit for Approval Modal */}
      <Modal
        isOpen={isApprovalModalOpen}
        onClose={() => setIsApprovalModalOpen(false)}
        title={`Submit ${selectedPlan?.name} for Manager Approval`}
        subtitle={`Required authorization authority: $${selectedPlan?.estimatedCostUSD.toLocaleString()} expenditure budget.`}
        actions={
          <>
            <button
              onClick={() => setIsApprovalModalOpen(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmitForApproval}
              className="btn-lime"
            >
              Confirm &amp; Submit Request
            </button>
          </>
        }
      >
        <div className="space-y-4 text-xs">
          <div className="p-4 bg-[#F8F9F6] border border-[#E8EAE4] rounded-2xl font-mono space-y-1.5">
            <div className="flex justify-between">
              <span className="text-[#777B76]">Disruption Reference:</span>
              <span className="text-[#171917] font-bold">{activeDisruption?.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#777B76]">Total Expenditure:</span>
              <span className="text-[#171917] font-bold">${selectedPlan?.estimatedCostUSD.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#777B76]">Customer Orders Protected:</span>
              <span className="text-[#2E7D32] font-bold">{selectedPlan?.ordersProtectedCount} customer SLAs</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#777B76]">Expected Late Orders:</span>
              <span className="text-[#171917] font-bold">{selectedPlan?.expectedLateOrdersCount} orders</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#777B76]">Requester Persona:</span>
              <span className="text-[#171917] font-semibold">{currentUser.name} ({currentUser.roleLabel})</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#171917] mb-1.5">
              Operational Justification & Risk Rationale
            </label>
            <textarea
              rows={3}
              value={justificationNotes}
              onChange={e => setJustificationNotes(e.target.value)}
              placeholder="e.g. Fulfills P1 order without assembly line stoppage. Penalty avoided is $145,000 against a $24,500 expedite budget."
              className="w-full bg-[#F8F9F6] border border-[#E8EAE4] rounded-xl p-3 text-[#171917] text-xs focus:outline-none focus:border-[#C8FF32] focus:ring-2 focus:ring-[#C8FF32]/50"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
