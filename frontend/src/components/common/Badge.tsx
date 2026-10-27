import React from 'react';
import { DisruptionSeverity, DisruptionStatus, OrderPriority, RiskLevel, PlanStatus } from '../../types';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'neutral' | 'success' | 'warning' | 'critical' | 'purple' | 'cyan';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'neutral', size = 'sm' }) => {
  const sizeClasses = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-xs px-2.5 py-1';
  
  const variantClasses = {
    neutral: 'bg-slate-800/80 text-slate-300 border border-slate-700/60',
    success: 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/50',
    warning: 'bg-amber-950/60 text-amber-300 border border-amber-800/50',
    critical: 'bg-rose-950/60 text-rose-300 border border-rose-800/50',
    purple: 'bg-purple-950/60 text-purple-300 border border-purple-800/50',
    cyan: 'bg-cyan-950/60 text-cyan-300 border border-cyan-800/50',
  }[variant];

  return (
    <span className={`inline-flex items-center font-medium rounded tracking-wide ${sizeClasses} ${variantClasses}`}>
      {children}
    </span>
  );
};

export const SeverityBadge: React.FC<{ severity: DisruptionSeverity }> = ({ severity }) => {
  switch (severity) {
    case 'critical':
      return <Badge variant="critical">Critical</Badge>;
    case 'high':
      return <Badge variant="warning">High</Badge>;
    case 'medium':
      return <Badge variant="purple">Medium</Badge>;
    case 'low':
      return <Badge variant="neutral">Low</Badge>;
    default:
      return <Badge variant="neutral">{severity}</Badge>;
  }
};

export const StatusBadge: React.FC<{ status: DisruptionStatus }> = ({ status }) => {
  switch (status) {
    case 'active':
      return <Badge variant="critical">Active Hold</Badge>;
    case 'evaluating':
      return <Badge variant="warning">Evaluating</Badge>;
    case 'mitigating':
      return <Badge variant="purple">Mitigating</Badge>;
    case 'resolved':
      return <Badge variant="success">Resolved</Badge>;
    default:
      return <Badge variant="neutral">{status}</Badge>;
  }
};

export const PriorityBadge: React.FC<{ priority: OrderPriority }> = ({ priority }) => {
  switch (priority) {
    case 'P1':
      return <Badge variant="critical">P1 · Critical SLA</Badge>;
    case 'P2':
      return <Badge variant="warning">P2 · High</Badge>;
    case 'P3':
      return <Badge variant="neutral">P3 · Standard</Badge>;
    default:
      return <Badge variant="neutral">{priority}</Badge>;
  }
};

export const RiskScoreBadge: React.FC<{ score: number; level: RiskLevel }> = ({ score, level }) => {
  const variant = level === 'critical' ? 'critical' : level === 'high' ? 'warning' : level === 'medium' ? 'purple' : 'neutral';
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs">
      <Badge variant={variant}>
        {score}/100 · {level.toUpperCase()}
      </Badge>
    </span>
  );
};

export const PlanStatusBadge: React.FC<{ status: PlanStatus }> = ({ status }) => {
  switch (status) {
    case 'proposed':
      return <Badge variant="neutral">Proposed</Badge>;
    case 'simulated':
      return <Badge variant="cyan">Simulated</Badge>;
    case 'submitted':
      return <Badge variant="warning">Pending Approval</Badge>;
    case 'approved':
      return <Badge variant="success">Approved</Badge>;
    case 'rejected':
      return <Badge variant="critical">Rejected</Badge>;
    case 'executed':
      return <Badge variant="purple">Executed</Badge>;
    default:
      return <Badge variant="neutral">{status}</Badge>;
  }
};
