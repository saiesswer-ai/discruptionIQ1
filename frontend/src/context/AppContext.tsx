/**
 * App State Context for DisruptionIQ — Recovery Arena
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  UserProfile,
  UserRole,
  Disruption,
  OrderAtRisk,
  RecoveryPlan,
  WarehouseInventory,
  Shipment,
  Supplier,
  ApprovalRequest,
  NotificationItem,
  AuditLogEntry,
} from '../types';
import { api, ApiError, toUserProfile } from '../services/httpApi';

export type PageId =
  | 'control-tower'
  | 'disruptions'
  | 'orders-at-risk'
  | 'recovery-arena'
  | 'inventory'
  | 'shipments'
  | 'approvals'
  | 'notifications'
  | 'audit-trail'
  | 'settings';

interface ToastMessage {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

interface AppContextType {
  activePage: PageId;
  setActivePage: (page: PageId) => void;
  currentUser: UserProfile;
  permissions: string[];
  authState: 'checking' | 'authenticated' | 'expired' | 'signed_out';
  dataState: 'loading' | 'ready' | 'empty' | 'error';
  dataError: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  
  // Entities
  disruptions: Disruption[];
  orders: OrderAtRisk[];
  inventory: WarehouseInventory[];
  shipments: Shipment[];
  suppliers: Supplier[];
  approvals: ApprovalRequest[];
  notifications: NotificationItem[];
  auditLogs: AuditLogEntry[];
  
  // Selection and Navigation State
  arenaDisruptionId: string;
  setArenaDisruptionId: (id: string) => void;
  inspectDisruptionId: string | null;
  setInspectDisruptionId: (id: string | null) => void;
  inspectAuditEntry: AuditLogEntry | null;
  setInspectAuditEntry: (entry: AuditLogEntry | null) => void;

  // Actions
  refreshData: () => Promise<void>;
  resetSimulation: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  showToast: (message: string, type?: ToastMessage['type']) => void;
  toasts: ToastMessage[];
  removeToast: (id: string) => void;
  unreadNotificationsCount: number;
  pendingApprovalsCount: number;
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activePage, setActivePage] = useState<PageId>('control-tower');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authState, setAuthState] = useState<AppContextType['authState']>('checking');
  const [dataState, setDataState] = useState<AppContextType['dataState']>('loading');
  const [dataError, setDataError] = useState<string | null>(null);
  const [arenaDisruptionId, setArenaDisruptionId] = useState<string>('');
  const [inspectDisruptionId, setInspectDisruptionId] = useState<string | null>(null);
  const [inspectAuditEntry, setInspectAuditEntry] = useState<AuditLogEntry | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Local mirror of service state
  const [disruptions, setDisruptions] = useState<Disruption[]>([]);
  const [orders, setOrders] = useState<OrderAtRisk[]>([]);
  const [inventory, setInventory] = useState<WarehouseInventory[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  const fallbackUser: UserProfile = { id: '', name: '', role: '', roleLabel: '', approvalLimitUSD: 0, avatarInitials: '', permissions: [] };

  const showToast = useCallback((message: string, type: ToastMessage['type'] = 'info') => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const refreshData = useCallback(async () => {
    if (!api.hasSession()) return;
    setDataState('loading');
    setDataError(null);
    try {
      const [
        d, o, inv, shp, sup, app, notif, aud
      ] = await Promise.all([
        api.getDisruptions(), api.getOrdersAtRisk(), api.getWarehouseInventory(), api.getShipments(),
        api.getSuppliers(), api.getApprovals(), Promise.resolve([] as NotificationItem[]), api.getAuditLogs(),
      ]);

      setDisruptions(d);
      setOrders(o);
      setInventory(inv);
      setShipments(shp);
      setSuppliers(sup);
      setApprovals(app);
      setNotifications(notif);
      setAuditLogs(aud);
      if (!arenaDisruptionId && d[0]) setArenaDisruptionId(d[0].id);
      setDataState(d.length || o.length || inv.length || shp.length || sup.length || app.length || aud.length ? 'ready' : 'empty');
    } catch (err) {
      const error = err as ApiError;
      if (error.status === 401) {
        setCurrentUser(null);
        setAuthState('expired');
      }
      setDataState('error');
      setDataError(error.message || 'Unable to load operational data.');
    }
  }, []);

  // Restore an existing bearer session; data is fetched only after authentication succeeds.
  useEffect(() => {
    if (!api.hasSession()) { setAuthState('signed_out'); return; }
    api.me().then(user => {
      setCurrentUser(toUserProfile(user));
      setAuthState('authenticated');
      refreshData();
    }).catch(() => { api.setToken(null); setAuthState('expired'); });
  }, [refreshData]);

  useEffect(() => {
    const expire = () => { setCurrentUser(null); setAuthState('expired'); };
    window.addEventListener('disruptioniq:session-expired', expire);
    return () => window.removeEventListener('disruptioniq:session-expired', expire);
  }, []);

  const login = async (username: string, password: string) => {
    const result = await api.login(username, password);
    api.setToken(result.access_token);
    setCurrentUser(toUserProfile(result.user));
    setAuthState('authenticated');
    await refreshData();
  };

  const logout = async () => {
    try { if (api.hasSession()) await api.logout(); } catch { /* local expiry still completes sign-out */ }
    api.setToken(null); setCurrentUser(null); setAuthState('signed_out'); setDataState('empty');
  };

  const resetSimulation = async () => {
    showToast('Reset is unavailable: the connected API does not expose a reset endpoint.', 'warning');
  };

  const markNotificationRead = async (id: string) => {
    showToast('Notifications are not available from the connected API.', 'warning');
  };

  const markAllNotificationsRead = async () => {
    showToast('Notifications are not available from the connected API.', 'warning');
  };

  const unreadNotificationsCount = notifications.filter(n => !n.read).length;
  const pendingApprovalsCount = approvals.filter(a => a.status === 'pending').length;

  return (
    <AppContext.Provider
      value={{
        activePage,
        setActivePage,
        currentUser: currentUser || fallbackUser,
        permissions: currentUser?.permissions || [],
        authState,
        dataState,
        dataError,
        login,
        logout,
        disruptions,
        orders,
        inventory,
        shipments,
        suppliers,
        approvals,
        notifications,
        auditLogs,
        arenaDisruptionId,
        setArenaDisruptionId,
        inspectDisruptionId,
        setInspectDisruptionId,
        inspectAuditEntry,
        setInspectAuditEntry,
        refreshData,
        resetSimulation,
        markNotificationRead,
        markAllNotificationsRead,
        showToast,
        toasts,
        removeToast,
        unreadNotificationsCount,
        pendingApprovalsCount,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
