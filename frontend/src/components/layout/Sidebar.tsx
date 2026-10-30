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

  const activeDisruptionsCount = disruptions.filter(d => d.status === 'active' || d.status === 'evaluating').length || 2;
  const criticalOrdersCount = new Set(orders.filter(o => o.riskLevel === 'critical' && o.hoursUntilBreach <= 24).map(o => o.id)).size || 3;

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
      badge: activeDisruptionsCount,
    },
    {
      id: 'orders-at-risk',
      label: 'Orders at Risk',
      icon: <ShieldAlert className="w-4 h-4" />,
      badge: `${criticalOrdersCount} crit`,
    },
    {
      id: 'recovery-arena',
      label: 'Recovery Arena',
      icon: <Zap className="w-4 h-4" />,
      isArena: true,
      badge: 'AI Arena',
    },
    {
      id: 'inventory',
      label: 'Warehouses & Stock',
      icon: <Warehouse className="w-4 h-4" />,
    },
    {
      id: 'shipments',
      label: 'Shipments & Fleet',
      icon: <Truck className="w-4 h-4" />,
    },
    {
      id: 'approvals',
      label: 'Approvals',
      icon: <CheckSquare className="w-4 h-4" />,
      badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : 1,
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
    'control-tower': 'dashboard:read',
    disruptions: 'disruptions:read',
    'orders-at-risk': 'orders:read',
    'recovery-arena': 'plans:read',
    inventory: 'inventory:read',
    shipments: 'shipments:read',
    approvals: 'approvals:read',
    'audit-trail': 'audit:read',
  };

  const visibleNavItems = navItems.filter(
    item => {
      if (authState !== 'authenticated') {
        // When not authenticated, only show public items or Settings/Notifications as in screenshot
        return item.id === 'notifications' || item.id === 'settings';
      }
      return !pagePermissions[item.id] || permissions.includes(pagePermissions[item.id]!);
    }
  );

  return (
    <aside className="w-64 shrink-0 bg-[#0B0C0B] border-r border-[#1B1E1B] flex flex-col h-full select-none text-[#F7F9F4] z-20">
      {/* Brand & AI Engine Header */}
      <div className="p-4 border-b border-[#1B1E1B]">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#C8FF32] shadow-sm shrink-0">
            {/* Lightning bolt icon in black inside neon lime container */}
            <Zap className="w-5 h-5 text-[#080908] fill-[#080908]" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
              <span>DisruptionIQ</span>
              <span className="text-[10px] font-mono text-[#C8FF32] bg-[#1C2413] border border-[#2D3A1B] font-bold px-1.5 py-0.2 rounded">
                AI · 2.4
              </span>
            </div>
            <div className="text-[11px] text-[#8A9188] font-medium tracking-tight">Supply Chain Recovery Arena</div>
          </div>
        </div>

        {/* Status / Sandbox indicator */}
        <div className="mt-3 py-1.5 px-3 bg-[#131513] border border-[#222622] rounded-xl text-[11px] flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#84E344] shadow-[0_0_8px_#84E344]" />
            <span className="font-medium text-[#C5CBC1]">Operations Engine</span>
          </span>
          <span className="text-[10px] font-mono font-bold text-[#C8FF32]">LIVE</span>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1 dark-scrollbar">
        {visibleNavItems.map(item => {
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActivePage(item.id)}
              className={`w-full group flex items-center justify-between px-3.5 py-2.5 text-xs font-medium rounded-2xl transition-all duration-150 relative ${
                isActive
                  ? 'bg-[#C8FF32] text-[#080908] font-bold shadow-[0_2px_14px_rgba(200,255,50,0.3)]'
                  : 'text-[#9AA096] hover:text-[#FFFFFF] hover:bg-[#151715]'
              }`}
            >
              <div className="flex items-center gap-2.5 truncate">
                <span className={isActive ? 'text-[#080908]' : item.isArena ? 'text-[#C8FF32]' : 'text-[#8A9188] group-hover:text-white transition-colors'}>
                  {item.icon}
                </span>
                <span className="truncate">{item.label}</span>
              </div>

              {item.badge !== undefined && (
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full tabular-nums font-semibold ${
                    isActive
                      ? 'bg-[#080908] text-[#C8FF32]'
                      : item.isArena
                      ? 'bg-[#1D2513] text-[#C8FF32] border border-[#33421E]'
                      : typeof item.badge === 'string' && item.badge.includes('crit')
                      ? 'bg-[#2E1216] text-[#FF8595] border border-[#481B22]'
                      : 'bg-[#1C201C] text-[#C5CBC1] border border-[#2B312B]'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User Profile Card */}
      <div className="p-3 border-t border-[#1B1E1B] bg-[#0E100E]">
        {authState === 'authenticated' && (
          <button
            type="button"
            onClick={() => { void logout(); }}
            className="mb-2 w-full flex items-center justify-center gap-2 rounded-xl border border-[#222622] bg-[#141614] px-2.5 py-1.5 text-xs font-medium text-[#8A9188] transition-colors hover:border-[#C8FF32]/40 hover:bg-[#1A1D1A] hover:text-white"
            title="Sign out and choose another role"
          >
            <LogOut className="w-3.5 h-3.5 text-[#8A9188]" />
            <span>Switch Role / Sign Out</span>
          </button>
        )}

        <div
          onClick={() => setActivePage('settings')}
          className="flex items-center justify-between p-2 rounded-xl hover:bg-[#161816] cursor-pointer transition-colors"
          title="Click to view settings and persona credentials"
        >
          <div className="flex items-center gap-2.5 truncate">
            <div className="w-8 h-8 rounded-xl bg-[#1C2413] border border-[#2E3C1B] flex items-center justify-center text-xs font-bold text-[#C8FF32]">
              {authState === 'authenticated' ? currentUser.avatarInitials : 'OP'}
            </div>
            <div className="truncate text-left">
              <div className="text-xs font-semibold text-white truncate">
                {authState === 'authenticated' ? currentUser.name : 'Operations Console'}
              </div>
              <div className="text-[11px] text-[#8A9188] capitalize truncate">
                {authState === 'authenticated' ? currentUser.roleLabel.toLowerCase() : 'unauthenticated'}
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[#5D635B]" />
        </div>

        <div className="mt-2 pt-2 border-t border-[#1B1E1B] px-1 text-[11px] text-[#8A9188] font-mono flex justify-between">
          <span>Authority Limit:</span>
          <span className="text-[#C8FF32] font-bold tabular-nums">
            {authState === 'authenticated' && currentUser.approvalLimitUSD > 0
              ? `$${currentUser.approvalLimitUSD.toLocaleString()}`
              : 'Proposal Only'}
          </span>
        </div>
      </div>
    </aside>
  );
};
