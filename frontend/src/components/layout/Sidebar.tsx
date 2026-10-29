import React from 'react';
import { useApp, PageId } from '../../context/AppContext';
import {
  LayoutDashboard,
  AlertOctagon,
  ShieldAlert,
  Zap,
  Warehouse,
  Truck,
  CheckSquare,
  Bell,
  History,
  Settings,
  Layers,
  ChevronRight,
  LogOut,
} from 'lucide-react';

interface NavItem {
  id: PageId;
  label: string;
  icon: React.ReactNode;
  badge?: number | string;
  isArena?: boolean;
}

export const Sidebar: React.FC = () => {
  const {
    activePage,
    setActivePage,
    currentUser,
    permissions,
    pendingApprovalsCount,
    unreadNotificationsCount,
    orders,
    disruptions,
    logout,
    authState,
  } = useApp();

  const activeDisruptionsCount = disruptions.filter(d => d.status === 'active' || d.status === 'evaluating').length;
  const criticalOrdersCount = orders.filter(o => o.riskLevel === 'critical').length;

  const navItems: NavItem[] = [
    {
      id: 'control-tower',
      label: 'Control Tower',
      icon: <LayoutDashboard className="w-4 h-4" />,
    },
    {
      id: 'disruptions',
      label: 'Disruptions',
      icon: <AlertOctagon className="w-4 h-4" />,
      badge: activeDisruptionsCount > 0 ? activeDisruptionsCount : undefined,
    },
    {
      id: 'orders-at-risk',
      label: 'Orders at Risk',
      icon: <ShieldAlert className="w-4 h-4" />,
      badge: criticalOrdersCount > 0 ? `${criticalOrdersCount} crit` : undefined,
    },
    {
      id: 'recovery-arena',
      label: 'Recovery Arena',
      icon: <Zap className="w-4 h-4 text-purple-400" />,
      isArena: true,
      badge: 'Arena',
    },
    {
      id: 'inventory',
      label: 'Inventory & Warehouses',
      icon: <Warehouse className="w-4 h-4" />,
    },
    {
      id: 'shipments',
      label: 'Shipments & Suppliers',
      icon: <Truck className="w-4 h-4" />,
    },
    {
      id: 'approvals',
      label: 'Approvals',
      icon: <CheckSquare className="w-4 h-4" />,
      badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined,
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: <Bell className="w-4 h-4" />,
      badge: unreadNotificationsCount > 0 ? unreadNotificationsCount : undefined,
    },
    {
      id: 'audit-trail',
      label: 'Audit Trail',
      icon: <History className="w-4 h-4" />,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings className="w-4 h-4" />,
    },
  ];

  const pagePermissions: Partial<Record<PageId, string>> = {
    'control-tower': 'dashboard:read', disruptions: 'disruptions:read', 'orders-at-risk': 'orders:read',
    'recovery-arena': 'plans:read', inventory: 'inventory:read', shipments: 'shipments:read',
    approvals: 'approvals:read', 'audit-trail': 'audit:read',
  };
  const visibleNavItems = navItems.filter(item => !pagePermissions[item.id] || permissions.includes(pagePermissions[item.id]!));

  return (
    <aside className="w-64 shrink-0 bg-slate-950 border-r border-slate-800/90 flex flex-col h-screen select-none">
      {/* Brand & Simulation Marker */}
      <div className="p-4 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-gradient-to-br from-purple-600 via-indigo-600 to-sky-500 flex items-center justify-center shadow-md">
            <Layers className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
              <span>DisruptionIQ</span>
              <span className="text-[10px] font-mono text-purple-400 font-semibold tracking-wider uppercase bg-purple-950/70 border border-purple-800/50 px-1 py-0.2 rounded">
                PRO
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium">Recovery Arena v2.4</div>
          </div>
        </div>

        {/* Clear Simulation Environment Notice */}
        <div className="mt-3 py-1.5 px-2 bg-slate-900 border border-slate-800 rounded text-[11px] text-slate-400 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span>Simulation Environment</span>
          </span>
          <span className="text-[10px] font-mono text-slate-400">SANDBOX</span>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {visibleNavItems.map(item => {
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActivePage(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-md transition-all duration-150 ${
                isActive
                  ? item.isArena
                    ? 'bg-purple-950/60 text-purple-200 border border-purple-700/50 shadow-xs'
                    : 'bg-slate-900 text-white border border-slate-800'
                  : item.isArena
                  ? 'text-purple-300/80 hover:bg-purple-950/30 hover:text-purple-200'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <div className="flex items-center gap-2.5 truncate">
                <span className={isActive ? 'text-white' : item.isArena ? 'text-purple-400' : 'text-slate-400'}>
                  {item.icon}
                </span>
                <span className="truncate">{item.label}</span>
              </div>

              {item.badge !== undefined && (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded tabular-nums font-semibold ${
                    item.isArena
                      ? 'bg-purple-900/60 text-purple-200 border border-purple-700/60'
                      : typeof item.badge === 'number'
                      ? 'bg-slate-800 text-slate-200 border border-slate-700'
                      : 'bg-rose-950/80 text-rose-300 border border-rose-800/60'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Current User Card */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-925">
        {authState === 'authenticated' && <button
          type="button"
          onClick={() => { void logout(); }}
          className="mb-2 w-full flex items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-purple-700 hover:bg-purple-950/40 hover:text-white"
          title="Sign out and choose another role"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out / switch role
        </button>}
        <div
          onClick={() => setActivePage('settings')}
          className="flex items-center justify-between p-2 rounded-md hover:bg-slate-900/80 cursor-pointer transition-colors"
          title="Click to change role in Settings"
        >
          <div className="flex items-center gap-2.5 truncate">
            <div className="w-7 h-7 rounded bg-indigo-900/80 border border-indigo-700/60 flex items-center justify-center text-xs font-bold text-indigo-200">
              {currentUser.avatarInitials}
            </div>
            <div className="truncate text-left">
              <div className="text-xs font-semibold text-white truncate">{currentUser.name}</div>
              <div className="text-[11px] text-slate-400 truncate">{currentUser.roleLabel}</div>
            </div>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
        </div>
        <div className="mt-1.5 px-2 text-[10px] text-slate-400 font-mono flex justify-between">
          <span>Auth Cap:</span>
          <span className="text-slate-300 tabular-nums">
            {currentUser.approvalLimitUSD > 0
              ? `$${currentUser.approvalLimitUSD.toLocaleString()}`
              : 'Proposal Only'}
          </span>
        </div>
      </div>
    </aside>
  );
};
