import React, { useState, useRef, useEffect } from 'react';
import { useApp, PageId } from '../../context/AppContext';
import {
  RotateCcw,
  Bell,
  Zap,
  ChevronDown,
} from 'lucide-react';

export const TopNavbar: React.FC = () => {
  const {
    activePage,
    setActivePage,
    currentUser,
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
    'disruptions': { title: 'Disruptions', subtitle: 'Ingested Carrier Holds, Supplier Delays & Root Cause Forensics' },
    'orders-at-risk': { title: 'Orders at Risk', subtitle: 'Customer SLA Exposure & Multi-Tier Stockout Probability' },
    'recovery-arena': { title: 'Recovery Arena', subtitle: 'Simulate, Compare & Authorize Disruption Mitigation Workflows' },
    'inventory': { title: 'Warehouses & Stock', subtitle: 'Hub Allocation, Safety Stock Thresholds & Movements' },
    'shipments': { title: 'Shipments & Fleet', subtitle: 'Carrier Multi-Modal Tracking & Tier-1 Vendor Telemetry' },
    'approvals': { title: 'Approvals', subtitle: 'Authorizations, Expenditure Governance & Plan Sign-Offs' },
    'notifications': { title: 'Notifications', subtitle: 'System Alerts, Risk Breaches & Plan State Transitions' },
    'audit-trail': { title: 'Audit Trail', subtitle: 'Tamper-Evident Operations Log & Historical Evidence Ledger' },
    'settings': { title: 'Settings', subtitle: 'Authenticated role, backend capabilities & environment status' },
  };

  return (
    <header className="h-16 border-b border-[#E8EAE4] bg-[#FFFFFF] px-6 flex items-center justify-between gap-4 sticky top-0 z-40">
      {/* Left: Breadcrumbs / Page Title */}
      <div className="flex items-center gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#777B76]">
            <span className="font-medium text-[#777B76]">DisruptionIQ</span>
            <span className="text-[#C8CCC4]">/</span>
            <span className="text-[#171917] font-semibold">{pageTitles[activePage].title}</span>
          </div>
          <p className="text-[11px] text-[#8A9188] hidden md:block">
            {pageTitles[activePage].subtitle}
          </p>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Recovery Arena Fast Launch Pill Button */}
        <button
          onClick={() => setActivePage('recovery-arena')}
          className="bg-[#C8FF32] hover:bg-[#DFFF83] text-[#080908] font-bold text-xs px-4 py-2 rounded-full inline-flex items-center gap-1.5 transition-all shadow-sm"
          title="Launch AI Recovery Arena"
        >
          <Zap className="w-3.5 h-3.5 text-[#080908] fill-[#080908]" />
          <span>Recovery Arena</span>
        </button>

        {/* Authenticated role display pill */}
        <div className="relative" ref={roleDropdownRef}>
          <button
            onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-white hover:bg-[#F8F9F6] border border-[#E8EAE4] rounded-full text-xs text-[#171917] transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-[#84E344]" />
            <span className="font-medium text-[#444843]">Role:</span>
            <span className="font-semibold text-[#171917] capitalize">{currentUser.roleLabel.toLowerCase()}</span>
            <ChevronDown className="w-3.5 h-3.5 text-[#777B76]" />
          </button>

          {roleDropdownOpen && (
            <div className="absolute right-0 mt-2 w-72 card-light p-3 shadow-xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="p-2 border-b border-[#F0F1EE]">
                <div className="text-xs font-semibold text-[#171917]">Authenticated Session</div>
                <div className="text-[11px] text-[#777B76] mt-0.5">Role permissions are verified on every request.</div>
              </div>
              <div className="p-2 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-[#777B76]">User:</span>
                  <span className="font-semibold text-[#171917]">{currentUser.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#777B76]">Role:</span>
                  <span className="font-semibold text-[#171917] capitalize">{currentUser.roleLabel}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#777B76]">Approval Limit:</span>
                  <span className="font-mono font-semibold text-[#171917]">
                    {currentUser.approvalLimitUSD > 0
                      ? `$${currentUser.approvalLimitUSD.toLocaleString()}`
                      : 'None (Proposal Only)'}
                  </span>
                </div>
              </div>
              <div className="pt-2 border-t border-[#F0F1EE]">
                <button
                  onClick={() => {
                    setRoleDropdownOpen(false);
                    setActivePage('settings');
                  }}
                  className="w-full text-center text-xs text-[#171917] font-semibold py-1.5 bg-[#F8F9F6] hover:bg-[#F0F1EE] border border-[#E8EAE4] rounded-lg transition-colors"
                >
                  Manage Role in Settings
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Notifications Icon Button */}
        <div className="relative" ref={notifDropdownRef}>
          <button
            onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
            className="relative p-2 rounded-xl bg-white hover:bg-[#F8F9F6] border border-[#E8EAE4] text-[#171917] transition-colors"
            title="Notifications"
          >
            <Bell className="w-4 h-4 text-[#4F544D]" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#C8FF32] text-[#080908] text-[9px] font-bold font-mono flex items-center justify-center border border-[#080908]">
                {unreadNotificationsCount}
              </span>
            )}
          </button>

          {notifDropdownOpen && (
            <div className="absolute right-0 mt-2 w-80 card-light p-0 shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="p-3.5 border-b border-[#F0F1EE] flex items-center justify-between bg-[#FAFAFA]">
                <div className="text-xs font-semibold text-[#171917] flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5 text-[#171917]" />
                  <span>Notifications</span>
                  {unreadNotificationsCount > 0 && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#F4FFD2] text-[#2C4800] border border-[#C8FF32] font-semibold">
                      {unreadNotificationsCount} new
                    </span>
                  )}
                </div>
                {unreadNotificationsCount > 0 && (
                  <button
                    onClick={() => markAllNotificationsRead()}
                    className="text-[11px] text-[#4F544D] hover:text-[#171917] font-medium"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-[#F0F1EE]">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[#777B76]">
                    No notifications at this time
                  </div>
                ) : (
                  notifications.slice(0, 5).map(n => (
                    <div
                      key={n.id}
                      onClick={() => {
                        markNotificationRead(n.id);
                        if (n.linkedEntityType === 'disruption' && n.linkedEntityId) {
                          setInspectDisruptionId(n.linkedEntityId);
                        } else if (n.linkedEntityType === 'approval') {
                          setActivePage('approvals');
                        } else if (n.linkedEntityType === 'plan') {
                          setActivePage('recovery-arena');
                        }
                        setNotifDropdownOpen(false);
                      }}
                      className={`p-3 text-xs cursor-pointer hover:bg-[#F8F9F6] transition-colors ${
                        !n.read ? 'bg-[#F9FCF2]' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium text-[#171917] truncate">{n.title}</div>
                        {!n.read && <span className="w-2 h-2 rounded-full bg-[#C8FF32] shrink-0 mt-1 border border-[#171917]" />}
                      </div>
                      <div className="text-[11px] text-[#777B76] mt-0.5 line-clamp-2">{n.message}</div>
                    </div>
                  ))
                )}
              </div>

              <div className="p-2 border-t border-[#F0F1EE] bg-[#FAFAFA]">
                <button
                  onClick={() => {
                    setNotifDropdownOpen(false);
                    setActivePage('notifications');
                  }}
                  className="w-full text-center text-xs font-semibold text-[#171917] py-1.5 hover:bg-[#F0F1EE] rounded-lg transition-colors"
                >
                  View All Notifications
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
