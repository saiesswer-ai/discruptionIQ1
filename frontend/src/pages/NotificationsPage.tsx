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
        return <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
      default:
        return <Info className="w-4 h-4 text-sky-400 shrink-0" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-amber-950/30 border border-amber-800/60 rounded-lg p-3 text-xs text-amber-200">
        Notifications are unavailable because the connected FastAPI backend does not currently expose notification endpoints. No demo notifications are shown.
      </div>
      {/* Notifications Control Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Category Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {['all', 'disruption', 'risk', 'approval', 'recovery'].map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors capitalize ${
                categoryFilter === cat
                  ? 'bg-slate-800 text-white border border-slate-700 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-950'
              }`}
            >
              {cat === 'all' ? 'All Alerts' : cat}
            </button>
          ))}
        </div>

        {/* Unread toggle and Mark all read */}
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-2 cursor-pointer text-slate-300">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={e => setUnreadOnly(e.target.checked)}
              className="rounded bg-slate-950 border-slate-700 text-purple-600 focus:ring-0"
            />
            <span>Unread Only</span>
          </label>

          <button
            onClick={markAllNotificationsRead}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition-colors flex items-center gap-1"
          >
            <Check className="w-3.5 h-3.5 text-slate-400" />
            <span>Mark All Read</span>
          </button>
        </div>
      </div>

      {/* Notifications Feed */}
      <div className="space-y-3">
        {filteredNotifications.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-12 text-center text-slate-400">
            <Bell className="w-8 h-8 text-slate-600 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-300">No notifications found.</p>
            <p className="text-xs text-slate-500 mt-1">
              Active operational alerts, risk escalations, and approval notices will display here.
            </p>
          </div>
        ) : (
          filteredNotifications.map(n => (
            <div
              key={n.id}
              onClick={() => handleNotificationClick(n)}
              className={`p-4 rounded-lg border transition-all duration-150 cursor-pointer flex items-start justify-between gap-4 ${
                !n.read
                  ? 'bg-slate-900/90 border-slate-750 hover:border-purple-600/60'
                  : 'bg-slate-950/60 border-slate-850 hover:border-slate-750 opacity-80'
              }`}
            >
              <div className="flex items-start gap-3.5">
                <div className="mt-0.5">{getSeverityIcon(n.severity)}</div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-semibold text-white">{n.title}</h4>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                      {n.category}
                    </span>
                    {!n.read && (
                      <span className="w-2 h-2 rounded-full bg-sky-400 ring-2 ring-sky-950" />
                    )}
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">{n.message}</p>
                  <div className="text-[10px] text-slate-500 font-mono">
                    {new Date(n.timestamp).toUTCString()}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={e => {
                    e.stopPropagation();
                    markNotificationRead(n.id);
                  }}
                  className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded bg-slate-800/80 border border-slate-700/60"
                >
                  {n.read ? 'Read' : 'Mark Read'}
                </button>
                <div className="p-1 text-slate-400 hover:text-purple-400">
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
