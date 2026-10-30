import React from 'react';
import { DisruptionSeverity, DisruptionStatus, OrderPriority, RiskLevel, PlanStatus } from '../../types';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'neutral' | 'success' | 'warning' | 'critical' | 'purple' | 'cyan' | 'lime' | 'dark';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'neutral', size = 'sm' }) => {
  const sizeClasses = size === 'sm' ? 'text-[11px] px-2.5 py-0.5' : 'text-xs px-3 py-1';

  const variantClasses = {
    neutral: 'bg-[#F2F4F0] text-[#4F544D] border border-[#E0E4DC]',
    success: 'bg-[#EBF9E4] text-[#1D5E0A] border border-[#C5EAB5]',
    warning: 'bg-[#FEF6E4] text-[#805400] border border-[#F9DC9B]',
    critical: 'bg-[#FDF0F1] text-[#9E1B26] border border-[#F7B6BC]',
    purple: 'bg-[#F0EDFF] text-[#4323A0] border border-[#D7CCFE]',
    cyan: 'bg-[#E8F8FA] text-[#006874] border border-[#B0E9EE]',
    lime: 'bg-[#F4FFD2] text-[#2C4800] border border-[#C8FF32] font-semibold',
    dark: 'bg-[#171917] text-[#F7F9F4] border border-[#363936]',
  }[variant];

  return (
    <span className={`inline-flex items-center font-medium rounded-full tracking-tight transition-colors ${sizeClasses} ${variantClasses}`}>
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
      return <Badge variant="lime">Mitigating</Badge>;
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
      return <Badge variant="lime">Executed</Badge>;
    default:
      return <Badge variant="neutral">{status}</Badge>;
  }
};
