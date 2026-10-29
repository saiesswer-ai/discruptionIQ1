/**
 * App State Context for DisruptionIQ — Recovery Arena
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
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
import { api, ApiError, DashboardSummary, toUserProfile } from '../services/httpApi';

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
  /** True only during the very first data fetch; false on subsequent refreshes. */
  isInitialLoad: boolean;
  dataError: string | null;
  dashboardSummary: DashboardSummary | null;
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
  refreshData: (userOverride?: UserProfile) => Promise<void>;
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
  // True until the very first successful fetch completes — prevents the loading
  // banner from flashing on subsequent background refreshes (e.g. after an approval).
  const [isInitialLoad, setIsInitialLoad] = useState<boolean>(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null);
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

  // Refs so that refreshData never needs currentUser / arenaDisruptionId in its
  // useCallback dependency array — avoiding the infinite re-creation loop.
  const currentUserRef = useRef<UserProfile | null>(null);
  const arenaDisruptionIdRef = useRef<string>('');

  // Keep refs in sync with state on every render (cheap, no extra effects).
  currentUserRef.current = currentUser;
  arenaDisruptionIdRef.current = arenaDisruptionId;

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

  const refreshData = useCallback(async (userOverride?: UserProfile) => {
    if (!api.hasSession()) return;
    setDataState('loading');
    setDataError(null);
    try {
      let activeUser = userOverride || currentUserRef.current;
      if (!activeUser || !activeUser.id) {
        try {
          const me = await api.me();
          activeUser = toUserProfile(me);
          setCurrentUser(activeUser);
          setAuthState('authenticated');
        } catch (meErr) {
          const error = meErr as ApiError;
          if (error.status === 401) {
            setCurrentUser(null);
            setAuthState('expired');
            setDataState('error');
            setDataError('Authentication required.');
            return;
          }
        }
      }

      const perms = activeUser?.permissions || [];
      const isSuperAdmin = activeUser?.role === 'admin' || activeUser?.role === 'administrator';
      const hasPerm = (p: string) => isSuperAdmin || perms.includes(p);

      const [
        summaryRes, dRes, oRes, invRes, shpRes, supRes, appRes, audRes
      ] = await Promise.allSettled([
        hasPerm('dashboard:read') || perms.length === 0 ? api.getDashboardSummary() : Promise.resolve(null),
        hasPerm('disruptions:read') ? api.getDisruptions() : Promise.resolve([]),
        hasPerm('orders:read') ? api.getOrdersAtRisk() : Promise.resolve([]),
        hasPerm('inventory:read') ? api.getWarehouseInventory() : Promise.resolve([]),
        hasPerm('shipments:read') ? api.getShipments() : Promise.resolve([]),
        hasPerm('suppliers:read') ? api.getSuppliers() : Promise.resolve([]),
        hasPerm('approvals:read') ? api.getApprovals() : Promise.resolve([]),
        hasPerm('audit:read') ? api.getAuditLogs() : Promise.resolve([]),
      ]);

      // Check for 401 authentication expiration across all settled calls
      for (const res of [summaryRes, dRes, oRes, invRes, shpRes, supRes, appRes, audRes]) {
        if (res.status === 'rejected') {
          const err = res.reason as ApiError;
          if (err?.status === 401) {
            setCurrentUser(null);
            setAuthState('expired');
            setDataState('error');
            setDataError('Session expired. Please log in again.');
            return;
          }
        }
      }

      if (summaryRes.status === 'fulfilled' && summaryRes.value) {
        setDashboardSummary(summaryRes.value);
      }

      let loadedDisruptions: Disruption[] = [];
      if (dRes.status === 'fulfilled') {
        loadedDisruptions = dRes.value;
        setDisruptions(loadedDisruptions);
      }
      if (oRes.status === 'fulfilled') setOrders(oRes.value);
      if (invRes.status === 'fulfilled') setInventory(invRes.value);
      if (shpRes.status === 'fulfilled') setShipments(shpRes.value);
      if (supRes.status === 'fulfilled') setSuppliers(supRes.value);
      if (appRes.status === 'fulfilled') setApprovals(appRes.value);
      if (audRes.status === 'fulfilled') setAuditLogs(audRes.value);
      setNotifications([]);

      // Only set the arena disruption once — read current value from ref to
      // avoid adding arenaDisruptionId to the dependency array (which would
      // recreate refreshData and trigger the init useEffect again).
      if (!arenaDisruptionIdRef.current && loadedDisruptions[0]) {
        setArenaDisruptionId(loadedDisruptions[0].id);
      }

      const errors: string[] = [];
      if (summaryRes.status === 'rejected' && (hasPerm('dashboard:read') || perms.length === 0)) {
        errors.push(`Dashboard summary: ${(summaryRes.reason as Error)?.message}`);
      }
      if (dRes.status === 'rejected' && hasPerm('disruptions:read')) errors.push(`Disruptions: ${(dRes.reason as Error)?.message}`);
      if (oRes.status === 'rejected' && hasPerm('orders:read')) errors.push(`Orders: ${(oRes.reason as Error)?.message}`);
      if (invRes.status === 'rejected' && hasPerm('inventory:read')) errors.push(`Inventory: ${(invRes.reason as Error)?.message}`);
      if (shpRes.status === 'rejected' && hasPerm('shipments:read')) errors.push(`Shipments: ${(shpRes.reason as Error)?.message}`);
      if (supRes.status === 'rejected' && hasPerm('suppliers:read')) errors.push(`Suppliers: ${(supRes.reason as Error)?.message}`);
      if (appRes.status === 'rejected' && hasPerm('approvals:read')) errors.push(`Approvals: ${(appRes.reason as Error)?.message}`);
      if (audRes.status === 'rejected' && hasPerm('audit:read')) errors.push(`Audit: ${(audRes.reason as Error)?.message}`);

      const hasAnyData =
        (dRes.status === 'fulfilled' && dRes.value.length > 0) ||
        (oRes.status === 'fulfilled' && oRes.value.length > 0) ||
        (invRes.status === 'fulfilled' && invRes.value.length > 0) ||
        (shpRes.status === 'fulfilled' && shpRes.value.length > 0) ||
        (supRes.status === 'fulfilled' && supRes.value.length > 0) ||
        (appRes.status === 'fulfilled' && appRes.value.length > 0) ||
        (audRes.status === 'fulfilled' && audRes.value.length > 0) ||
        (summaryRes.status === 'fulfilled' && summaryRes.value !== null);

      if (errors.length > 0 && !hasAnyData) {
        setDataState('error');
        setDataError(errors.join('; '));
      } else {
        setDataState(hasAnyData ? 'ready' : 'empty');
        setDataError(errors.length > 0 ? `Partial failure loading widgets: ${errors.join('; ')}` : null);
      }
      // Mark initial load as complete after the first fetch resolves.
      setIsInitialLoad(false);
    } catch (err) {
      const error = err as ApiError;
      if (error?.status === 401) {
        setCurrentUser(null);
        setAuthState('expired');
      }
      setDataState('error');
      setDataError(error?.message || 'Unable to load operational data.');
      setIsInitialLoad(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore an existing bearer session; data is fetched only after authentication succeeds.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!api.hasSession()) { setAuthState('signed_out'); return; }
    api.me().then(user => {
      const up = toUserProfile(user);
      setCurrentUser(up);
      setAuthState('authenticated');
      refreshData(up);
    }).catch(() => { api.setToken(null); setAuthState('expired'); });
  }, []);

  useEffect(() => {
    const expire = () => { setCurrentUser(null); setAuthState('expired'); };
    window.addEventListener('disruptioniq:session-expired', expire);
    return () => window.removeEventListener('disruptioniq:session-expired', expire);
  }, []);

  const login = async (username: string, password: string) => {
    const result = await api.login(username, password);
    api.setToken(result.access_token);
    const up = toUserProfile(result.user);
    setCurrentUser(up);
    setAuthState('authenticated');
    await refreshData(up);
  };

  const logout = async () => {
    try { if (api.hasSession()) await api.logout(); } catch { /* local expiry still completes sign-out */ }
    api.setToken(null); setCurrentUser(null); setAuthState('signed_out'); setDataState('empty'); setDashboardSummary(null);
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
  const canReadApprovals = currentUser?.permissions?.includes('approvals:read') || currentUser?.role === 'admin';
  const pendingApprovalsCount = canReadApprovals
    ? approvals.filter(a => a.status === 'pending').length
    : (dashboardSummary?.pendingApprovals ?? 0);

  return (
    <AppContext.Provider
      value={{
        activePage,
        setActivePage,
        currentUser: currentUser || fallbackUser,
        permissions: currentUser?.permissions || [],
        authState,
        dataState,
        isInitialLoad,
        dataError,
        dashboardSummary,
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
