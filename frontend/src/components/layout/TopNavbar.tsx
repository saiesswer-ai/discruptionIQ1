import React, { useState, useRef, useEffect } from 'react';
import { useApp, PageId } from '../../context/AppContext';
import {
  RotateCcw,
  Bell,
  Zap,
  UserCheck,
  ChevronDown,
  Check,
  ExternalLink,
} from 'lucide-react';

export const TopNavbar: React.FC = () => {
  const {
    activePage,
    setActivePage,
    currentUser,
    resetSimulation,
    unreadNotificationsCount,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    setInspectDisruptionId,
  } = useApp();

  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const roleDropdownRef = useRef<HTMLDivElement>(null);
  const notifDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(e.target as Node)) {
        setRoleDropdownOpen(false);
      }
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(e.target as Node)) {
        setNotifDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const pageTitles: Record<PageId, { title: string; subtitle: string }> = {
    'control-tower': { title: 'Control Tower', subtitle: 'Global Logistics Operations & Real-Time Disruption Telemetry' },
    'disruptions': { title: 'Disruptions Registry', subtitle: 'Ingested Carrier Holds, Supplier Delays & Root Cause Forensics' },
    'orders-at-risk': { title: 'Orders at Risk', subtitle: 'Customer SLA Exposure & Multi-Tier Stockout Probability' },
    'recovery-arena': { title: 'Recovery Arena', subtitle: 'Simulate, Compare & Authorize Disruption Mitigation Workflows' },
    'inventory': { title: 'Inventory & Warehouses', subtitle: 'Cross-Hub Stock Allocation, Safety Buffers & Inbound Pipelines' },
    'shipments': { title: 'Shipments & Suppliers', subtitle: 'Carrier Multi-Modal Tracking & Tier-1 Vendor Performance' },
    'approvals': { title: 'Approval Inbox', subtitle: 'Authorizations, Expenditure Governance & Plan Sign-Offs' },
    'notifications': { title: 'Notifications Center', subtitle: 'System Alerts, Risk Breaches & Plan State Transitions' },
    'audit-trail': { title: 'Immutable Audit Trail', subtitle: 'Tamper-Evident Operations Log & Historical Evidence Ledger' },
    'settings': { title: 'Settings & API Session', subtitle: 'Authenticated role, backend capabilities & environment status' },
  };

  return (
    <header className="h-14 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md px-6 flex items-center justify-between gap-4 sticky top-0 z-40">
      {/* Left: Breadcrumbs / Page Title */}
      <div className="flex items-center gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>DisruptionIQ</span>
            <span>/</span>
            <span className="text-slate-200 font-semibold">{pageTitles[activePage].title}</span>
          </div>
          <p className="text-[11px] text-slate-500 hidden md:block">
            {pageTitles[activePage].subtitle}
          </p>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Arena Fast Launch Button (if not on Arena) */}
        {activePage !== 'recovery-arena' && (
          <button
            onClick={() => setActivePage('recovery-arena')}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-purple-200 bg-purple-950/70 hover:bg-purple-900 border border-purple-700/60 rounded-md transition-colors"
          >
            <Zap className="w-3.5 h-3.5 text-purple-400" />
            <span>Launch Arena</span>
          </button>
        )}

        {/* Reset is unavailable unless the backend adds a reset endpoint. */}
        <button
          onClick={resetSimulation}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-md transition-colors"
          title="The connected backend does not currently expose a reset endpoint"
        >
          <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
          <span className="hidden sm:inline">Reset unavailable</span>
        </button>

        {/* Authenticated role display */}
        <div className="relative" ref={roleDropdownRef}>
          <button
            onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
            className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-md text-xs text-slate-200 transition-colors"
          >
            <UserCheck className="w-3.5 h-3.5 text-sky-400" />
            <div className="text-left hidden sm:block">
              <span className="text-slate-400">Role: </span>
              <span className="font-semibold text-white">{currentUser.roleLabel}</span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {roleDropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-800 rounded-lg shadow-xl py-1 z-50 text-xs">
              <div className="px-3 py-2 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Authenticated backend role
              </div>
              {[currentUser].map(u => {
                const isSelected = true;
                return (
                  <button
                    key={u.role}
                    onClick={() => setRoleDropdownOpen(false)}
                    className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-slate-800/80 transition-colors ${
                      isSelected ? 'bg-purple-950/40 text-purple-200' : 'text-slate-300'
                    }`}
                  >
                    <div className="w-5 h-5 rounded bg-slate-800 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                      {isSelected ? <Check className="w-3.5 h-3.5 text-purple-400" /> : u.avatarInitials}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-white">{u.roleLabel}</div>
                      <div className="text-[10px] text-slate-400">
                        {u.approvalLimitUSD > 0
                          ? `Approval Cap: $${u.approvalLimitUSD.toLocaleString()}`
                          : 'Simulation & Proposal Authority'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Notifications Popover Toggle */}
        <div className="relative" ref={notifDropdownRef}>
          <button
            onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
            className="relative p-2 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors"
            aria-label="View notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-600 text-white font-mono text-[9px] flex items-center justify-center font-bold">
                {unreadNotificationsCount}
              </span>
            )}
          </button>

          {notifDropdownOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-slate-900 border border-slate-800 rounded-lg shadow-xl z-50 overflow-hidden text-xs">
              <div className="px-3.5 py-2.5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
                <span className="font-semibold text-white">Notifications ({unreadNotificationsCount} unread)</span>
                {unreadNotificationsCount > 0 && (
                  <button
                    onClick={markAllNotificationsRead}
                    className="text-[11px] text-sky-400 hover:text-sky-300"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/60">
                {notifications.slice(0, 5).map(n => (
                  <div
                    key={n.id}
                    onClick={() => {
                      markNotificationRead(n.id);
                      if (n.linkedEntityType === 'disruption' && n.linkedEntityId) {
                        setInspectDisruptionId(n.linkedEntityId);
                      } else if (n.linkedEntityType === 'approval') {
                        setActivePage('approvals');
                      }
                      setNotifDropdownOpen(false);
                    }}
                    className={`p-3 cursor-pointer hover:bg-slate-800/60 transition-colors ${
                      !n.read ? 'bg-slate-850/60' : 'opacity-80'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-medium text-slate-200 truncate">{n.title}</span>
                      {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />}
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-2">{n.message}</p>
                    <span className="text-[10px] text-slate-500 font-mono mt-1 block">
                      {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>

              <div className="p-2 border-t border-slate-800 bg-slate-950 text-center">
                <button
                  onClick={() => {
                    setActivePage('notifications');
                    setNotifDropdownOpen(false);
                  }}
                  className="text-xs text-purple-400 hover:text-purple-300 font-medium inline-flex items-center gap-1"
                >
                  <span>Open Full Notification Center</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
