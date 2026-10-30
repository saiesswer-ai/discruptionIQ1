import React from 'react';
import { useApp } from '../context/AppContext';
import { StatCard } from '../components/common/StatCard';
import { SeverityBadge, RiskScoreBadge, PriorityBadge, StatusBadge } from '../components/common/Badge';
import {
  AlertOctagon,
  ShieldAlert,
  CheckSquare,
  DollarSign,
  ArrowRight,
  Zap,
  TrendingDown,
  Activity,
  Layers,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts';

export const ControlTowerPage: React.FC = () => {
  const {
    disruptions,
    orders,
    approvals,
    dashboardSummary,
    currentUser,
    setActivePage,
    setArenaDisruptionId,
    setInspectDisruptionId,
  } = useApp();

  const activeDisruptions = disruptions.filter(d => d.status === 'active' || d.status === 'evaluating');
  const criticalOrders = orders.filter(o => o.riskLevel === 'critical' || o.priority === 'P1');
  const canReadApprovals = currentUser?.permissions?.includes('approvals:read') || currentUser?.role === 'admin';
  const pendingApprovals = approvals.filter(a => a.status === 'pending');
  const pendingApprovalsCount = canReadApprovals ? pendingApprovals.length : (dashboardSummary?.pendingApprovals ?? 0);
  const totalRecoveryCost = pendingApprovals.reduce((acc, curr) => acc + curr.estimatedCostUSD, 0);
  const totalProjectedSavings = pendingApprovals.reduce((acc, curr) => acc + curr.projectedSavingsUSD, 0);

  // Clearly defined, consistent counting rules
  const activeDisruptionsCount = dashboardSummary?.activeDisruptions ?? activeDisruptions.length;
  const ordersAtRiskCount = dashboardSummary?.ordersAtRisk ?? new Set(orders.filter(o => o.riskLevel === 'critical' || o.riskLevel === 'high').map(o => o.id)).size;
  const criticalOrdersCount = new Set(orders.filter(o => o.riskLevel === 'critical' || o.priority === 'P1').map(o => o.id)).size;

  const disruptionTrendData = Object.values(disruptions.reduce<Record<string, { day: string; delays: number; critical: number }>>((groups, disruption) => {
    const day = new Date(disruption.detectedAt).toLocaleDateString([], { month: 'short', day: 'numeric' });
    const current = groups[day] || { day, delays: 0, critical: 0 };
    current.delays += 1;
    current.critical += disruption.severity === 'critical' ? 1 : 0;
    groups[day] = current;
    return groups;
  }, {}));
  const featuredDisruption = activeDisruptions[0] || disruptions[0];

  // Risk distribution counting distinct customer orders
  const riskDistribution = [
    { level: 'Critical (P1)', count: new Set(orders.filter(o => o.riskLevel === 'critical').map(o => o.id)).size, color: '#E85D68' },
    { level: 'High (P2)', count: new Set(orders.filter(o => o.riskLevel === 'high').map(o => o.id)).size, color: '#F5C451' },
    { level: 'Medium (P3)', count: new Set(orders.filter(o => o.riskLevel === 'medium').map(o => o.id)).size, color: '#7185FF' },
    { level: 'Protected', count: new Set(orders.filter(o => o.mitigationStatus === 'protected').map(o => o.id)).size, color: '#84E344' },
  ];

  return (
    <div className="space-y-6">
      {/* Dark Feature Hero Card (InsightOS Hallmark) */}
      <div className="card-hero p-6 sm:p-7 relative overflow-hidden">
        <div className="absolute right-0 bottom-0 w-80 h-80 rounded-full bg-[#C8FF32]/8 blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 relative z-10">
          <div className="flex items-start sm:items-center gap-4">
            {/* Glowing AI Orb Indicator */}
            <div className="relative shrink-0 mt-1 sm:mt-0">
              <div className="w-12 h-12 rounded-2xl bg-[#1C201C] border border-[#303830] flex items-center justify-center shadow-lg shadow-black/40">
                <div className="ai-orb-glow ai-orb-animated" />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="text-xs font-mono uppercase tracking-wider text-[#A0A69E]">
                  AI Disruption Intelligence
                </span>
                <span className="text-[10px] font-mono text-[#080908] bg-[#C8FF32] font-bold px-2 py-0.5 rounded-full">
                  LIVE TELEMETRY
                </span>
                {featuredDisruption && (
                  <span className="text-[10px] font-mono text-[#F7F9F4] bg-[#242824] border border-[#363936] px-2 py-0.5 rounded-full">
                    {featuredDisruption.id}
                  </span>
                )}
              </div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white">
                {featuredDisruption ? featuredDisruption.title : 'All Logistics Systems Operating Normally'}
              </h2>
              <p className="text-xs sm:text-sm text-[#A0A69D] mt-1 max-w-2xl leading-relaxed">
                {featuredDisruption
                  ? `${featuredDisruption.delayHours}h delay impacting ${featuredDisruption.affectedOrderCount} customer orders. AI Recovery candidate plans are ready for multi-objective simulation.`
                  : 'The operational stream has recorded zero unmitigated tier-1 bottlenecks at this time.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => {
                if (featuredDisruption) setArenaDisruptionId(featuredDisruption.id);
                setActivePage('recovery-arena');
              }}
              className="btn-lime w-full sm:w-auto px-5 py-2.5 text-xs font-semibold"
            >
              <Zap className="w-4 h-4 fill-[#080908]" />
              <span>Launch Recovery Arena</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Active Disruptions"
          value={activeDisruptionsCount}
          subValue={`${activeDisruptions.filter(d => d.severity === 'critical').length} critical tier-1 bottlenecks`}
          trend="Live telemetry"
          trendType="negative"
          icon={<AlertOctagon className="w-4 h-4 text-[#E85D68]" />}
          onClick={() => setActivePage('disruptions')}
        />
        <StatCard
          label="Orders at Risk"
          value={ordersAtRiskCount}
          subValue={`${criticalOrdersCount} critical SLA exposures`}
          trend="Distinct orders"
          trendType="negative"
          icon={<ShieldAlert className="w-4 h-4 text-[#F5C451]" />}
          onClick={() => setActivePage('orders-at-risk')}
        />
        <StatCard
          label="Pending Approvals"
          value={pendingApprovalsCount}
          subValue={canReadApprovals ? `$${totalRecoveryCost.toLocaleString()} total authorization req` : 'Dashboard summary count'}
          trend="Executive sign-off"
          trendType="neutral"
          icon={<CheckSquare className="w-4 h-4 text-[#7185FF]" />}
          onClick={canReadApprovals ? () => setActivePage('approvals') : undefined}
        />
        <StatCard
          label="Est. Recovery Budget"
          value={canReadApprovals ? `$${totalRecoveryCost.toLocaleString()}` : '—'}
          subValue={canReadApprovals ? `Projected savings: $${totalProjectedSavings.toLocaleString()}` : 'Authorized for managers'}
          trend={canReadApprovals ? "Pending allocation" : "Restricted view"}
          trendType={canReadApprovals ? "positive" : "neutral"}
          icon={<DollarSign className="w-4 h-4 text-[#2E7D32]" />}
          onClick={() => setActivePage('recovery-arena')}
        />
      </div>

      {/* Visualizations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Disruption Trend Area Chart */}
        <div className="lg:col-span-2 card-light p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
            <div>
              <h3 className="text-sm font-bold text-[#171917] tracking-tight">Disruption Ingestion & Severity Velocity</h3>
              <p className="text-xs text-[#777B76]">7-day telemetry log of delays vs critical holds</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono text-[#777B76]">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#171917] inline-block" />
                <span>Total Delays</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#E85D68] inline-block" />
                <span>Critical Holds</span>
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            {disruptionTrendData.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-[#A0A39D] text-xs gap-2">
                <Activity className="w-6 h-6 text-[#D0D4CB]" />
                <span>No disruption telemetry recorded for this period</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={disruptionTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="limeArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#C8FF32" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#C8FF32" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="roseArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#E85D68" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#E85D68" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" stroke="#A0A39D" fontSize={11} tickLine={false} />
                  <YAxis stroke="#A0A39D" fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#171917', borderColor: '#2E332E', borderRadius: '12px', fontSize: '12px', color: '#FFFFFF' }}
                    labelStyle={{ color: '#C8FF32', fontWeight: 600 }}
                  />
                  <Area type="monotone" dataKey="delays" stroke="#171917" strokeWidth={2.5} fillOpacity={1} fill="url(#limeArea)" name="Total Delays" />
                  <Area type="monotone" dataKey="critical" stroke="#E85D68" strokeWidth={2} fillOpacity={1} fill="url(#roseArea)" name="Critical Holds" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Order Risk Distribution */}
        <div className="card-light p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#171917] tracking-tight">Order SLA Exposure</h3>
            <p className="text-xs text-[#777B76] mb-4">Customer backlog by risk classification</p>

            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={riskDistribution} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <XAxis type="number" stroke="#A0A39D" fontSize={10} tickLine={false} />
                  <YAxis type="category" dataKey="level" stroke="#666B65" fontSize={11} tickLine={false} width={85} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#171917', borderColor: '#2E332E', borderRadius: '12px', fontSize: '12px', color: '#FFFFFF' }}
                  />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                    {riskDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="pt-4 border-t border-[#F0F1EE] space-y-2 text-xs">
            <div className="flex justify-between text-[#777B76]">
              <span>Unmitigated Critical Orders:</span>
              <span className="font-mono text-[#E85D68] font-bold">{criticalOrders.length}</span>
            </div>
            <div className="flex justify-between text-[#777B76]">
              <span>Orders with Mitigations in Progress:</span>
              <span className="font-mono text-[#2E7D32] font-bold">
                {orders.filter(o => o.mitigationStatus === 'candidate_plan' || o.mitigationStatus === 'approved').length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Section: Recent Disruption Feed & Recovery Pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Disruption Feed */}
        <div className="card-light p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-[#171917] tracking-tight">Active Ingested Disruptions</h3>
              <p className="text-xs text-[#777B76]">Carrier delays, supplier holds & hub congestion</p>
            </div>
            <button
              onClick={() => setActivePage('disruptions')}
              className="text-xs text-[#171917] hover:underline font-semibold inline-flex items-center gap-1"
            >
              <span>View All</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {disruptions.slice(0, 3).map(d => (
              <div
                key={d.id}
                className="p-4 bg-[#F8F9F6] border border-[#E8EAE4] rounded-2xl hover:border-[#D1D6CB] transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="text-xs font-mono text-[#777B76] font-medium">{d.id}</span>
                      <SeverityBadge severity={d.severity} />
                      <StatusBadge status={d.status} />
                    </div>
                    <h4 className="text-xs font-bold text-[#171917]">{d.title}</h4>
                  </div>
                  <button
                    onClick={() => setInspectDisruptionId(d.id)}
                    className="btn-secondary text-[11px] py-1 px-2.5"
                  >
                    Inspect
                  </button>
                </div>

                <p className="text-[11px] text-[#777B76] mt-1.5 line-clamp-1">{d.summary}</p>

                <div className="mt-3 pt-2.5 border-t border-[#E8EAE4] flex items-center justify-between text-[11px] text-[#777B76] font-mono flex-wrap gap-2">
                  <span>Delay: <strong className="text-[#805400]">+{d.delayHours}h</strong></span>
                  <span>Orders: <strong className="text-[#171917]">{d.affectedOrderCount}</strong></span>
                  <span>Impact: <strong className="text-[#9E1B26]">${(d.estimatedFinancialImpactUSD / 1000).toFixed(0)}k</strong></span>
                  <button
                    onClick={() => {
                      setArenaDisruptionId(d.id);
                      setActivePage('recovery-arena');
                    }}
                    className="text-[#171917] hover:text-black font-sans font-semibold inline-flex items-center gap-1"
                  >
                    <span>Arena</span>
                    <ArrowRight className="w-3 h-3 text-[#171917]" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recovery Progress Panel */}
        <div className="card-light p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-[#171917] tracking-tight">Recovery Simulation Progress</h3>
              <p className="text-xs text-[#777B76]">Status of candidate recovery plans across active events</p>
            </div>
            <button
              onClick={() => setActivePage('recovery-arena')}
              className="text-xs text-[#171917] hover:underline font-semibold inline-flex items-center gap-1"
            >
              <span>Recovery Arena</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Pipeline Stage Indicators */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-3 bg-[#F8F9F6] border border-[#E8EAE4] rounded-2xl">
                <span className="text-[10px] text-[#777B76] block uppercase font-medium">1. Proposed</span>
                <span className="text-base font-bold text-[#171917] font-mono">3</span>
              </div>
              <div className="p-3 bg-[#F8F9F6] border border-[#E8EAE4] rounded-2xl">
                <span className="text-[10px] text-[#006874] block uppercase font-medium">2. Simulated</span>
                <span className="text-base font-bold text-[#006874] font-mono">2</span>
              </div>
              <div className="p-3 bg-[#F8F9F6] border border-[#E8EAE4] rounded-2xl">
                <span className="text-[10px] text-[#805400] block uppercase font-medium">3. Pending Auth</span>
                <span className="text-base font-bold text-[#805400] font-mono">{pendingApprovals.length}</span>
              </div>
              <div className="p-3 bg-[#F4FFD2] border border-[#C8FF32] rounded-2xl">
                <span className="text-[10px] text-[#2C4800] block uppercase font-semibold">4. Executed</span>
                <span className="text-base font-bold text-[#2C4800] font-mono">0</span>
              </div>
            </div>

            {/* Featured Candidate Plan Card */}
            <div className="card-dark p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#C8FF32]" />
                  <span>AI Recovery Plan Recommendation</span>
                </span>
                <span className="text-[10px] font-mono text-[#080908] bg-[#C8FF32] font-bold px-2 py-0.5 rounded-full">
                  Multi-Objective AI
                </span>
              </div>
              <p className="text-xs text-[#A0A69D] leading-relaxed">
                Candidate plans are simulated, scored across financial and customer SLA objectives, and submitted for role-governed authorization in the Recovery Arena.
              </p>
              <div className="flex items-center justify-between text-xs pt-3 border-t border-[#2B2F2B] font-mono text-[#A0A69D]">
                <span>Target: <strong className="text-white">{featuredDisruption?.id || '—'}</strong></span>
                <span>Orders: <strong className="text-[#C8FF32]">{featuredDisruption?.affectedOrderCount || 0}</strong></span>
                <button
                  onClick={() => {
                    if (featuredDisruption) setArenaDisruptionId(featuredDisruption.id);
                    setActivePage('recovery-arena');
                  }}
                  className="btn-lime text-[11px] py-1 px-3"
                >
                  Review in Arena
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top At-Risk Orders Table */}
      <div className="card-light p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-[#171917] tracking-tight">Top At-Risk Customer Orders</h3>
            <p className="text-xs text-[#777B76]">Ranked by risk score, customer tier & impending SLA breach</p>
          </div>
          <button
            onClick={() => setActivePage('orders-at-risk')}
            className="text-xs text-[#171917] hover:underline font-semibold inline-flex items-center gap-1"
          >
            <span>View All ({orders.length})</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[#E8EAE4]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8F9F6] text-[#777B76] font-semibold border-b border-[#E8EAE4]">
              <tr>
                <th className="py-3 px-4">Order ID</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">SKU</th>
                <th className="py-3 px-4 text-right">Units</th>
                <th className="py-3 px-4 text-right">Deadline</th>
                <th className="py-3 px-4 text-center">Priority</th>
                <th className="py-3 px-4">Risk Assessment</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8EAE4] font-mono">
              {orders.slice(0, 5).map(o => (
                <tr key={o.id} className="hover:bg-[#F8F9F6] transition-colors">
                  <td className="py-3 px-4 text-[#171917] font-bold">{o.id}</td>
                  <td className="py-3 px-4 font-sans text-[#171917]">
                    <div className="font-medium">{o.customerName}</div>
                    <div className="text-[10px] text-[#777B76]">{o.customerTier}</div>
                  </td>
                  <td className="py-3 px-4 text-[#171917]">
                    <div className="font-semibold">{o.sku}</div>
                    <div className="text-[10px] text-[#777B76] font-sans">{o.skuDescription}</div>
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums text-[#171917] font-semibold">{o.quantityUnits}</td>
                  <td className="py-3 px-4 text-right">
                    <span className={`tabular-nums font-semibold ${o.hoursUntilBreach <= 24 ? 'text-[#9E1B26]' : 'text-[#777B76]'}`}>
                      {o.hoursUntilBreach}h left
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center font-sans">
                    <PriorityBadge priority={o.priority} />
                  </td>
                  <td className="py-3 px-4">
                    <RiskScoreBadge score={o.riskScore} level={o.riskLevel} />
                  </td>
                  <td className="py-3 px-4 text-right font-sans">
                    <button
                      onClick={() => {
                        setArenaDisruptionId(o.associatedDisruptionId);
                        setActivePage('recovery-arena');
                      }}
                      className="text-xs text-[#171917] hover:text-black font-semibold inline-flex items-center gap-1 bg-[#F0FFCC] hover:bg-[#DFFF83] border border-[#C8FF32] px-2.5 py-1 rounded-lg transition-colors"
                    >
                      <span>Arena</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
