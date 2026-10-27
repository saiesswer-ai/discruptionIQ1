/**
 * DisruptionIQ — Recovery Arena
 * Supply Chain Disruption Management Platform
 */

import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/layout/Sidebar';
import { TopNavbar } from './components/layout/TopNavbar';
import { ToastContainer } from './components/common/ToastContainer';
import { AuthGate } from './components/common/AuthGate';

// Pages
import { ControlTowerPage } from './pages/ControlTowerPage';
import { DisruptionsPage } from './pages/DisruptionsPage';
import { OrdersAtRiskPage } from './pages/OrdersAtRiskPage';
import { RecoveryArenaPage } from './pages/RecoveryArenaPage';
import { InventoryPage } from './pages/InventoryPage';
import { ShipmentsPage } from './pages/ShipmentsPage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { AuditTrailPage } from './pages/AuditTrailPage';
import { SettingsPage } from './pages/SettingsPage';

const MainContent: React.FC = () => {
  const { activePage, authState, dataState, dataError, refreshData } = useApp();

  if (authState !== 'authenticated') return <AuthGate />;

  const renderActivePage = () => {
    switch (activePage) {
      case 'control-tower':
        return <ControlTowerPage />;
      case 'disruptions':
        return <DisruptionsPage />;
      case 'orders-at-risk':
        return <OrdersAtRiskPage />;
      case 'recovery-arena':
        return <RecoveryArenaPage />;
      case 'inventory':
        return <InventoryPage />;
      case 'shipments':
        return <ShipmentsPage />;
      case 'approvals':
        return <ApprovalsPage />;
      case 'notifications':
        return <NotificationsPage />;
      case 'audit-trail':
        return <AuditTrailPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <ControlTowerPage />;
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-950 overflow-hidden">
      <TopNavbar />
      <main className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="max-w-7xl mx-auto">
          {dataState === 'loading' && <div className="mb-4 text-xs text-sky-300 bg-sky-950/40 border border-sky-900 rounded p-3">Loading live operational data…</div>}
          {dataState === 'error' && <div className="mb-4 flex items-center justify-between gap-3 text-xs text-rose-200 bg-rose-950/40 border border-rose-800 rounded p-3"><span>{dataError}</span><button onClick={refreshData} className="px-2 py-1 rounded bg-rose-900 hover:bg-rose-800">Retry</button></div>}
          {dataState === 'empty' && <div className="mb-4 text-xs text-slate-300 bg-slate-900 border border-slate-800 rounded p-3">The API returned no operational records.</div>}
          {renderActivePage()}
        </div>
      </main>
      <ToastContainer />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">
        <Sidebar />
        <MainContent />
      </div>
    </AppProvider>
  );
}
