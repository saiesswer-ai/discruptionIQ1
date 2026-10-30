import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Badge } from '../components/common/Badge';
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  Check,
  Filter,
  ArrowRight,
  Zap,
} from 'lucide-react';
import { NotificationItem } from '../types';

export const NotificationsPage: React.FC = () => {
  const {
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    setInspectDisruptionId,
    setArenaDisruptionId,
    setActivePage,
  } = useApp();

  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false);

  const filteredNotifications = notifications.filter(n => {
    const matchesCat = categoryFilter === 'all' || n.category === categoryFilter;
    const matchesUnread = !unreadOnly || !n.read;
    return matchesCat && matchesUnread;
  });

  const handleNotificationClick = (item: NotificationItem) => {
    markNotificationRead(item.id);

    if (item.linkedEntityType === 'disruption' && item.linkedEntityId) {
      setInspectDisruptionId(item.linkedEntityId);
    } else if (item.linkedEntityType === 'approval') {
      setActivePage('approvals');
    } else if (item.linkedEntityType === 'plan') {
      setActivePage('recovery-arena');
    } else if (item.linkedEntityType === 'order') {
      setActivePage('orders-at-risk');
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <AlertCircle className="w-4 h-4 text-[#E85D68] shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-[#F5C451] shrink-0" />;
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-[#84E344] shrink-0" />;
      default:
        return <Info className="w-4 h-4 text-[#7185FF] shrink-0" />;
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="card-light p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#171917] flex items-center justify-center">
              <Bell className="w-4 h-4 text-[#C8FF32]" />
            </div>
            <h1 className="text-lg font-semibold text-[#171917]">Notifications</h1>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-[#C8FF32] text-[#080908] font-mono text-[10px] font-bold">
                {unreadCount}
              </span>
            )}
          </div>
          <p className="text-xs text-[#777B76] mt-1 ml-10">
            Operational alerts, risk escalations, and approval notices
          </p>
        </div>
        <button
          onClick={markAllNotificationsRead}
          className="btn-secondary text-xs flex items-center gap-1.5 shrink-0"
        >
          <Check className="w-3.5 h-3.5" />
          <span>Mark All Read</span>
        </button>
      </div>

      {/* Backend Unavailability Banner */}
      <div className="flex items-start gap-3 p-3.5 bg-[#F5C451]/10 border border-[#F5C451]/30 text-[#8f6d14] rounded-2xl text-xs">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#F5C451]" />
        <span>
          Notifications are unavailable — the connected FastAPI backend does not currently expose
          notification endpoints. No live notifications are shown.
        </span>
      </div>

      {/* Control Bar */}
      <div className="card-light p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Category Filter Pills */}
        <div className="p-1 bg-[#F0F1EE] rounded-2xl border border-[#E8EAE4] flex flex-wrap items-center gap-0.5">
          {['all', 'disruption', 'risk', 'approval', 'recovery'].map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-150 capitalize ${
                categoryFilter === cat
                  ? 'bg-[#171917] text-[#C8FF32] shadow-sm'
                  : 'text-[#777B76] hover:text-[#171917]'
              }`}
            >
              {cat === 'all' ? 'All Alerts' : cat}
            </button>
          ))}
        </div>

        {/* Unread Toggle */}
        <label className="flex items-center gap-2 cursor-pointer text-xs text-[#777B76] select-none">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={e => setUnreadOnly(e.target.checked)}
            className="rounded border-[#E8EAE4] accent-[#C8FF32] focus:ring-0"
          />
          <span>Unread Only</span>
        </label>
      </div>

      {/* Notifications Feed */}
      <div className="space-y-2.5">
        {filteredNotifications.length === 0 ? (
          <div className="card-light p-12 text-center">
            <Bell className="w-8 h-8 text-[#A0A39D] mx-auto mb-3" />
            <p className="text-sm font-semibold text-[#171917]">No notifications found.</p>
            <p className="text-xs text-[#A0A39D] mt-1">
              Active operational alerts, risk escalations, and approval notices will display here.
            </p>
          </div>
        ) : (
          filteredNotifications.map(n => (
            <div
              key={n.id}
              onClick={() => handleNotificationClick(n)}
              className={`relative rounded-2xl border transition-all duration-150 cursor-pointer flex items-start justify-between gap-4 overflow-hidden ${
                !n.read
                  ? 'bg-white border-[#E8EAE4] hover:border-[#C8FF32]/40 hover:shadow-sm'
                  : 'bg-[#F8F9F6] border-[#E8EAE4] opacity-70 hover:opacity-90'
              }`}
            >
              {/* Unread indicator strip */}
              {!n.read && (
                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#C8FF32]" />
              )}

              <div className="flex items-start gap-3.5 p-4 pl-5">
                {/* Severity icon in small container */}
                <div className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                  n.severity === 'critical' ? 'bg-[#E85D68]/10' :
                  n.severity === 'warning' ? 'bg-[#F5C451]/10' :
                  n.severity === 'success' ? 'bg-[#84E344]/10' :
                  'bg-[#7185FF]/10'
                }`}>
                  {getSeverityIcon(n.severity)}
                </div>

                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-xs font-semibold text-[#171917]">{n.title}</h4>
                    <span className="bg-[#F0F1EE] border border-[#E8EAE4] text-[#777B76] font-mono text-[10px] px-1.5 py-0.5 rounded-md uppercase">
                      {n.category}
                    </span>
                    {!n.read && (
                      <span className="w-2 h-2 rounded-full bg-[#C8FF32] shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-[#777B76] leading-relaxed max-w-3xl">{n.message}</p>
                  <div className="text-[10px] text-[#A0A39D] font-mono">
                    {new Date(n.timestamp).toUTCString()}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 p-4">
                <button
                  onClick={e => {
                    e.stopPropagation();
                    markNotificationRead(n.id);
                  }}
                  className="text-[11px] text-[#777B76] hover:text-[#171917] px-2 py-1 rounded-lg bg-[#F0F1EE] border border-[#E8EAE4] transition-colors"
                >
                  {n.read ? 'Read' : 'Mark Read'}
                </button>
                <div className="p-1 text-[#A0A39D] hover:text-[#171917] transition-colors">
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
