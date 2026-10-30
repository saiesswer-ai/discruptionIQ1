import React from 'react';
import { useApp } from '../../context/AppContext';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-md w-full pointer-events-none">
      {toasts.map(toast => {
        const icon = {
          success: <CheckCircle2 className="w-4 h-4 text-[#2E7D32] shrink-0" />,
          warning: <AlertTriangle className="w-4 h-4 text-[#B78103] shrink-0" />,
          error: <AlertCircle className="w-4 h-4 text-[#C62828] shrink-0" />,
          info: <Info className="w-4 h-4 text-[#7185FF] shrink-0" />,
        }[toast.type];

        const cardStyle = {
          success: 'bg-[#FFFFFF] border-[#C5EAB5] text-[#171917] shadow-lg shadow-[#84E344]/5',
          warning: 'bg-[#FFFFFF] border-[#F9DC9B] text-[#171917] shadow-lg shadow-[#F5C451]/5',
          error: 'bg-[#FFFFFF] border-[#F7B6BC] text-[#171917] shadow-lg shadow-[#E85D68]/5',
          info: 'bg-[#FFFFFF] border-[#E8EAE4] text-[#171917] shadow-lg',
        }[toast.type];

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-2xl border text-xs font-medium animate-in slide-in-from-bottom-2 duration-150 ${cardStyle}`}
          >
            {icon}
            <div className="flex-1 leading-relaxed">{toast.message}</div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-[#777B76] hover:text-[#171917] p-0.5 rounded-lg transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
