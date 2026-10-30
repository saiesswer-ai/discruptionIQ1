import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  trend?: string;
  trendType?: 'positive' | 'negative' | 'neutral';
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  variant?: 'light' | 'dark' | 'lime';
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subValue,
  trend,
  trendType = 'neutral',
  icon,
  badge,
  variant = 'light',
  onClick,
}) => {
  if (variant === 'dark') {
    return (
      <div
        onClick={onClick}
        className={`card-dark p-5 transition-all duration-200 ${
          onClick ? 'cursor-pointer hover:border-[#3D443D] hover:shadow-lg' : ''
        }`}
      >
        <div className="flex items-center justify-between text-[#8E948C] mb-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#A0A69E]">{label}</span>
          {icon && <div className="text-[#A0A69E] bg-[#242624] p-2 rounded-xl border border-[#333733]">{icon}</div>}
        </div>

        <div className="flex items-baseline justify-between gap-2">
          <div className="text-3xl font-bold tracking-tight text-[#C8FF32] font-mono tabular-nums">
            {value}
          </div>
          {badge}
        </div>

        {(subValue || trend) && (
          <div className="mt-3 pt-3 border-t border-[#2A2E2A] flex items-center justify-between text-xs">
            {subValue && <span className="text-[#8E948C] truncate">{subValue}</span>}
            {trend && (
              <span
                className={`font-mono tabular-nums font-medium ${
                  trendType === 'positive'
                    ? 'text-[#84E344]'
                    : trendType === 'negative'
                    ? 'text-[#E85D68]'
                    : 'text-[#A0A69E]'
                }`}
              >
                {trend}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`card-light p-5 transition-all duration-200 ${
        onClick ? 'cursor-pointer hover:border-[#D1D6CB] hover:shadow-md hover:-translate-y-0.5' : ''
      }`}
    >
      <div className="flex items-center justify-between text-[#777B76] mb-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#777B76]">{label}</span>
        {icon && <div className="text-[#777B76] bg-[#F8F9F6] p-2 rounded-xl border border-[#E8EAE4]">{icon}</div>}
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <div className="text-3xl font-bold tracking-tight text-[#171917] font-mono tabular-nums">
          {value}
        </div>
        {badge}
      </div>

      {(subValue || trend) && (
        <div className="mt-3 pt-3 border-t border-[#F0F1EE] flex items-center justify-between text-xs">
          {subValue && <span className="text-[#777B76] truncate">{subValue}</span>}
          {trend && (
            <span
              className={`font-mono tabular-nums font-semibold ${
                trendType === 'positive'
                  ? 'text-[#2E7D32]'
                  : trendType === 'negative'
                  ? 'text-[#D32F2F]'
                  : 'text-[#777B76]'
              }`}
            >
              {trend}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
