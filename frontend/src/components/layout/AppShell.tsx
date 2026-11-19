import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { LocationModal } from './LocationModal';
import { ExplanationModal } from './ExplanationModal';
import { AuthModal } from '../auth/AuthModal';
import { useAuthStore } from '../../stores/useAuthStore';
import { useAppStore } from '../../stores/useAppStore';

export const AppShell: React.FC = () => {
  const { telemetryMode } = useAppStore();

  useEffect(() => {
    const unsubscribe = useAuthStore.getState().initAuth();
    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#090D16] text-slate-900 dark:text-slate-100 transition-colors">
      {/* Persistent Mode & Provenance Transparency Notice Banner */}
      {telemetryMode === 'demo' ? (
        <div 
          className="w-full bg-amber-500/15 dark:bg-amber-950/60 border-b border-amber-500/30 text-amber-950 dark:text-amber-200 py-2 px-4 text-center text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors"
          role="status"
          aria-label="Demo Mode Notice"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" aria-hidden="true"></span>
          <span>
            <strong>DEMO MODE</strong> — Simulated environmental data. Live CPCB and OpenAQ integration is not connected.
          </span>
        </div>
      ) : (
        <div 
          className="w-full bg-emerald-500/10 dark:bg-emerald-950/40 border-b border-emerald-500/20 text-emerald-950 dark:text-emerald-200 py-1.5 px-4 text-center text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors"
          role="status"
          aria-label="Live Telemetry Notice"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" aria-hidden="true"></span>
          <span>
            <strong>LIVE TELEMETRY</strong> — Real-time atmospheric chemistry model active (Open-Meteo CAMS). Live CPCB and OpenAQ sensor ingestion is not connected.
          </span>
        </div>
      )}

      <Navbar />
      
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <Outlet />
      </main>

      <Footer />

      {/* Global Modals */}
      <LocationModal />
      <ExplanationModal />
      <AuthModal />
    </div>
  );
};
