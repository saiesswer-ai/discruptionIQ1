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
    setActivePage,
    setArenaDisruptionId,
    setInspectDisruptionId,
  } = useApp();

  const activeDisruptions = disruptions.filter(d => d.status === 'active' || d.status === 'evaluating');
  const criticalOrders = orders.filter(o => o.riskLevel === 'critical' || o.priority === 'P1');
  const pendingApprovals = approvals.filter(a => a.status === 'pending');
  const totalRecoveryCost = pendingApprovals.reduce((acc, curr) => acc + curr.estimatedCostUSD, 0);
  const totalProjectedSavings = pendingApprovals.reduce((acc, curr) => acc + curr.projectedSavingsUSD, 0);

  const disruptionTrendData = Object.values(disruptions.reduce<Record<string, { day: string; delays: number; critical: number }>>((groups, disruption) => {
    const day = new Date(disruption.detectedAt).toLocaleDateString([], { month: 'short', day: 'numeric' });
    const current = groups[day] || { day, delays: 0, critical: 0 };
    current.delays += 1;
    current.critical += disruption.severity === 'critical' ? 1 : 0;
    groups[day] = current;
    return groups;
  }, {}));
  const featuredDisruption = activeDisruptions[0] || disruptions[0];

  // Risk distribution
  const riskDistribution = [
    { level: 'Critical (P1)', count: orders.filter(o => o.riskLevel === 'critical').length, color: '#f43f5e' },
    { level: 'High (P2)', count: orders.filter(o => o.riskLevel === 'high').length, color: '#f59e0b' },
    { level: 'Medium (P3)', count: orders.filter(o => o.riskLevel === 'medium').length, color: '#a855f7' },
    { level: 'Protected', count: orders.filter(o => o.mitigationStatus === 'protected').length, color: '#10b981' },
  ];

  return (
    <div className="space-y-6">
      {/* Simulation Banner Notice */}
      <div className="p-3.5 bg-gradient-to-r from-purple-950/40 via-slate-900 to-slate-900 border border-purple-900/50 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-purple-900/60 border border-purple-700/60 flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4 text-purple-300" />
          </div>
          <div>
            <div className="text-xs font-semibold text-white flex items-center gap-2">
              <span>{featuredDisruption ? `Active Disruption: ${featuredDisruption.title}` : 'No active disruptions'}</span>
              <span className="text-[10px] font-mono text-purple-300 bg-purple-900/40 border border-purple-700/50 px-1.5 py-0.2 rounded">
                {featuredDisruption?.id || '—'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {featuredDisruption ? `${featuredDisruption.delayHours}h delay impacting ${featuredDisruption.affectedOrderCount} customer orders. Review backend-generated recovery candidates in the Arena.` : 'The connected API has no active disruption records.'}
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            if (featuredDisruption) setArenaDisruptionId(featuredDisruption.id);
            setActivePage('recovery-arena');
          }}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-medium transition-colors shrink-0 shadow-sm"
        >
          <span>Open in Recovery Arena</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Active Disruptions"
          value={activeDisruptions.length}
          subValue={`${activeDisruptions.filter(d => d.severity === 'critical').length} critical events`}
          trend="Live backend count"
          trendType="negative"
          icon={<AlertOctagon className="w-4 h-4 text-rose-400" />}
          onClick={() => setActivePage('disruptions')}
        />
        <StatCard
          label="Orders at Risk"
          value={orders.length}
          subValue={`${criticalOrders.length} critical SLA exposure`}
          trend="Live backend count"
          trendType="negative"
          icon={<ShieldAlert className="w-4 h-4 text-amber-400" />}
          onClick={() => setActivePage('orders-at-risk')}
        />
        <StatCard
          label="Pending Approvals"
          value={pendingApprovals.length}
          subValue={`$${totalRecoveryCost.toLocaleString()} total authorization req`}
          trend="Live backend count"
          trendType="neutral"
          icon={<CheckSquare className="w-4 h-4 text-purple-400" />}
          onClick={() => setActivePage('approvals')}
        />
        <StatCard
          label="Est. Recovery Budget"
          value={`$${totalRecoveryCost.toLocaleString()}`}
          subValue={`Projected savings: $${totalProjectedSavings.toLocaleString()}`}
          trend="Pending authorization total"
          trendType="positive"
          icon={<DollarSign className="w-4 h-4 text-emerald-400" />}
          onClick={() => setActivePage('recovery-arena')}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Disruption Trend Area Chart */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Disruption Ingestion & Severity Velocity</h3>
              <p className="text-xs text-slate-400">7-day telemetry log of active delays vs resolved routes</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-purple-500 inline-block" />
                <span>Total Delays</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-rose-500 inline-block" />
                <span>Critical Holds</span>
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={disruptionTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="purpleArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="roseArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '6px', fontSize: '12px' }}
                  labelStyle={{ color: '#cbd5e1' }}
                />
                <Area type="monotone" dataKey="delays" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#purpleArea)" name="Total Delays" />
                <Area type="monotone" dataKey="critical" stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#roseArea)" name="Critical Holds" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Order Risk Distribution */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Order SLA Exposure</h3>
            <p className="text-xs text-slate-400 mb-4">Customer order backlog by risk classification</p>

            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={riskDistribution} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <XAxis type="number" stroke="#64748b" fontSize={10} tickLine={false} />
                  <YAxis type="category" dataKey="level" stroke="#94a3b8" fontSize={11} tickLine={false} width={80} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '6px', fontSize: '12px' }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {riskDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800/80 space-y-2 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Unmitigated Critical Orders:</span>
              <span className="font-mono text-rose-400 font-semibold">{criticalOrders.length}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Orders with Mitigations in Progress:</span>
              <span className="font-mono text-purple-400 font-semibold">
                {orders.filter(o => o.mitigationStatus === 'candidate_plan' || o.mitigationStatus === 'approved').length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Section: Recent Disruption Feed & Recovery Pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Disruption Feed */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Active Ingested Disruptions</h3>
              <p className="text-xs text-slate-400">Carrier delays, supplier holds & hub congestion</p>
            </div>
            <button
              onClick={() => setActivePage('disruptions')}
              className="text-xs text-sky-400 hover:text-sky-300 font-medium inline-flex items-center gap-1"
            >
              <span>View All</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {disruptions.slice(0, 3).map(d => (
              <div
                key={d.id}
                className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-md hover:border-slate-700 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-slate-400 font-medium">{d.id}</span>
                      <SeverityBadge severity={d.severity} />
                      <StatusBadge status={d.status} />
                    </div>
                    <h4 className="text-xs font-semibold text-white">{d.title}</h4>
                  </div>
                  <button
                    onClick={() => setInspectDisruptionId(d.id)}
                    className="text-[11px] text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800 border border-slate-700/60 shrink-0"
                  >
                    Inspect
                  </button>
                </div>

                <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">{d.summary}</p>

                <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>Delay: <strong className="text-amber-400">+{d.delayHours}h</strong></span>
                  <span>Affected Orders: <strong className="text-white">{d.affectedOrderCount}</strong></span>
                  <span>Est. Impact: <strong className="text-rose-400">${(d.estimatedFinancialImpactUSD / 1000).toFixed(0)}k</strong></span>
                  <button
                    onClick={() => {
                      setArenaDisruptionId(d.id);
                      setActivePage('recovery-arena');
                    }}
                    className="text-purple-400 hover:text-purple-300 font-sans font-medium inline-flex items-center gap-0.5"
                  >
                    <span>Arena</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recovery Progress Panel */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Recovery Simulation Progress</h3>
              <p className="text-xs text-slate-400">Status of candidate recovery plans across active events</p>
            </div>
            <button
              onClick={() => setActivePage('recovery-arena')}
              className="text-xs text-purple-400 hover:text-purple-300 font-medium inline-flex items-center gap-1"
            >
              <span>Recovery Arena</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Pipeline Stage Indicators */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded">
                <span className="text-[10px] text-slate-400 block uppercase">1. Proposed</span>
                <span className="text-base font-bold text-slate-200 font-mono">3</span>
              </div>
              <div className="p-2.5 bg-slate-950/80 border border-sky-900/40 rounded">
                <span className="text-[10px] text-sky-400 block uppercase">2. Simulated</span>
                <span className="text-base font-bold text-sky-300 font-mono">2</span>
              </div>
              <div className="p-2.5 bg-slate-950/80 border border-amber-900/40 rounded">
                <span className="text-[10px] text-amber-400 block uppercase">3. Pending Auth</span>
                <span className="text-base font-bold text-amber-300 font-mono">{pendingApprovals.length}</span>
              </div>
              <div className="p-2.5 bg-slate-950/80 border border-emerald-900/40 rounded">
                <span className="text-[10px] text-emerald-400 block uppercase">4. Executed</span>
                <span className="text-base font-bold text-emerald-300 font-mono">0</span>
              </div>
            </div>

            {/* Featured Candidate Plan Card */}
            <div className="p-3.5 bg-purple-950/20 border border-purple-800/40 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-purple-200">
                  Recovery review required
                </span>
                <span className="text-[11px] font-mono text-sky-400 font-semibold">Live API workflow</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Candidate plans are generated, simulated, approved, and executed from the Recovery Arena against the current backend state.
              </p>
              <div className="flex items-center justify-between text-xs pt-2 border-t border-purple-900/40 font-mono text-slate-400">
                <span>Event: <strong className="text-white">{featuredDisruption?.id || '—'}</strong></span>
                <span>Orders: <strong className="text-emerald-400">{featuredDisruption?.affectedOrderCount || 0}</strong></span>
                <button
                  onClick={() => {
                    if (featuredDisruption) setArenaDisruptionId(featuredDisruption.id);
                    setActivePage('recovery-arena');
                  }}
                  className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-[11px] font-sans font-medium"
                >
                  Review in Arena
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top At-Risk Orders Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Top At-Risk Customer Orders</h3>
            <p className="text-xs text-slate-400">Ranked by risk score, customer tier & impending SLA breach</p>
          </div>
          <button
            onClick={() => setActivePage('orders-at-risk')}
            className="text-xs text-sky-400 hover:text-sky-300 font-medium inline-flex items-center gap-1"
          >
            <span>View All ({orders.length})</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 font-medium border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Order ID</th>
                <th className="py-2.5 px-3">Customer</th>
                <th className="py-2.5 px-3">SKU</th>
                <th className="py-2.5 px-3 text-right">Units</th>
                <th className="py-2.5 px-3 text-right">Deadline</th>
                <th className="py-2.5 px-3 text-center">Priority</th>
                <th className="py-2.5 px-3">Risk Assessment</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {orders.slice(0, 5).map(o => (
                <tr key={o.id} className="hover:bg-slate-850/60 transition-colors">
                  <td className="py-2.5 px-3 text-white font-semibold">{o.id}</td>
                  <td className="py-2.5 px-3 font-sans text-slate-200">
                    <div>{o.customerName}</div>
                    <div className="text-[10px] text-slate-500">{o.customerTier}</div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-300">
                    <div>{o.sku}</div>
                    <div className="text-[10px] text-slate-500 font-sans">{o.skuDescription}</div>
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-slate-200">{o.quantityUnits}</td>
                  <td className="py-2.5 px-3 text-right">
                    <span className={`tabular-nums ${o.hoursUntilBreach <= 24 ? 'text-rose-400 font-semibold' : 'text-slate-300'}`}>
                      {o.hoursUntilBreach}h left
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center font-sans">
                    <PriorityBadge priority={o.priority} />
                  </td>
                  <td className="py-2.5 px-3">
                    <RiskScoreBadge score={o.riskScore} level={o.riskLevel} />
                  </td>
                  <td className="py-2.5 px-3 text-right font-sans">
                    <button
                      onClick={() => {
                        setArenaDisruptionId(o.associatedDisruptionId);
                        setActivePage('recovery-arena');
                      }}
                      className="text-xs text-purple-400 hover:text-purple-300 font-medium inline-flex items-center gap-1"
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
