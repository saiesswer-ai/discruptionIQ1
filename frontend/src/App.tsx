/**
 * InsightOS — DisruptionIQ
 * AI Supply Chain Disruption Intelligence Platform
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
  const { activePage, authState, dataState, isInitialLoad, dataError, refreshData } = useApp();

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
    <div className="flex-1 flex flex-col min-w-0 bg-[#F7F8F5] overflow-hidden">
      <TopNavbar />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* First load banner */}
          {dataState === 'loading' && isInitialLoad && (
            <div className="p-3.5 bg-[#F0FFCC] border border-[#C8FF32] rounded-2xl text-xs text-[#2C4800] flex items-center gap-2 font-medium">
              <span className="w-2 h-2 rounded-full bg-[#84E344] animate-ping" />
              <span>Connecting to live operational intelligence stream…</span>
            </div>
          )}

          {dataState === 'error' && (
            <div className="p-3.5 bg-[#FDF0F1] border border-[#F7B6BC] rounded-2xl text-xs text-[#9E1B26] flex items-center justify-between gap-3">
              <span className="font-medium">{dataError}</span>
              <button
                onClick={() => refreshData()}
                className="px-3 py-1 rounded-xl bg-[#9E1B26] text-white hover:bg-[#82141E] font-medium transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {dataState === 'empty' && (
            <div className="p-3.5 bg-white border border-[#E8EAE4] rounded-2xl text-xs text-[#777B76]">
              The connected API returned no operational records.
            </div>
          )}

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
      <div className="min-h-screen w-screen overflow-hidden bg-[#F0EDFF] flex flex-col md:p-2 lg:p-3 selection:bg-[#C8FF32] selection:text-[#080908]">
        <div className="flex h-screen md:h-[calc(100vh-1rem)] lg:h-[calc(100vh-1.5rem)] w-full overflow-hidden rounded-none md:rounded-2xl lg:rounded-3xl border-0 md:border border-[#E0DCF5] shadow-[0_12px_45px_-12px_rgba(25,12,50,0.08)] bg-[#F7F8F5]">
          <Sidebar />
          <MainContent />
        </div>
      </div>
    </AppProvider>
  );
}
