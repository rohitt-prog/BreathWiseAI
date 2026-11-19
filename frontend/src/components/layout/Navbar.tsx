import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Wind, MapPin, Sun, Moon, Menu, X, ShieldAlert, Radio, HelpCircle, Clock } from 'lucide-react';
import { useAppStore } from '../../stores/useAppStore';
import { MOCK_LOCATIONS } from '../../services/mockData';
import { useAirQualityQuery } from '../../hooks/useAirQualityQuery';
import { getAQIMetadata, determineTelemetryProvenance } from '../../utils/aqiUtils';
import clsx from 'clsx';

export const Navbar: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { 
    currentLocationId, 
    theme, 
    toggleTheme, 
    setLocationModalOpen 
  } = useAppStore();

  const currentLocObj = MOCK_LOCATIONS.find(l => l.id === currentLocationId) || MOCK_LOCATIONS[0];
  const { data: telemetry, isLoading, isError } = useAirQualityQuery();

  const isLive = !isError && Boolean(telemetry?.isLive);
  const aqData = telemetry?.data ?? null;

  const navLinks = [
    { to: '/dashboard', label: 'Live Dashboard' },
    { to: '/planner', label: 'Action Planner' },
    { to: '/indoor', label: 'Indoor Air' },
    { to: '/alternatives', label: 'Sustainable Commute' },
    { to: '/settings', label: 'Preferences' },
  ];

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-white/85 dark:bg-[#090D16]/85 border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        
        {/* Brand & Tagline */}
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-600/20 group-hover:scale-105 transition-transform">
              <Wind className="w-5 h-5" />
            </div>
            <div>
              <span className="font-extrabold text-base sm:text-lg tracking-tight bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-400 dark:to-teal-300 bg-clip-text text-transparent">
                BreatheWise AI
              </span>
              <span className="hidden sm:block text-[10px] text-slate-500 dark:text-slate-400 font-medium tracking-wide">
                Breathe smarter. Live healthier.
              </span>
            </div>
          </Link>

          {/* Location Selector Pill */}
          <button
            onClick={() => setLocationModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-750 text-xs font-semibold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-all ml-2"
            aria-label={`Change monitoring station. Currently set to ${currentLocObj.name}`}
          >
            <MapPin className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="truncate max-w-[110px] sm:max-w-[150px]">{currentLocObj.name.split(',')[0]}</span>
            <span className="text-[10px] text-slate-600 dark:text-slate-300 font-bold">Change</span>
          </button>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-1 lg:gap-2">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs lg:text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Telemetry AQI Indicator & Utilities */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Shared Telemetry AQI Indicator */}
          {isLoading ? (
            <div 
              data-testid="navbar-aqi-loading"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 animate-pulse"
              aria-label="Loading air quality telemetry"
            >
              <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500 animate-ping" />
              <span>Loading AQI...</span>
            </div>
          ) : isError || !aqData ? (
            <div 
              data-testid="navbar-aqi-unavailable"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700"
              title="Air quality data currently unavailable"
            >
              <HelpCircle className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
              <span>AQI --</span>
              <span className="text-[10px] uppercase tracking-wider font-extrabold">• Unavailable</span>
            </div>
          ) : aqData.aqi === null || aqData.aqi === undefined ? (
            <div 
              data-testid="navbar-aqi-missing-naqi"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700"
              title={aqData.indianNaqiUnavailableReason || "Official Indian NAQI unavailable (Modelled data only)"}
            >
              <HelpCircle className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
              <span>AQI --</span>
              <span className="text-[10px] uppercase tracking-wider font-extrabold">• NAQI Unavailable</span>
            </div>
          ) : isLive ? (
            (() => {
              const aqiMeta = getAQIMetadata(aqData.aqi);
              const provenanceInfo = determineTelemetryProvenance(aqData.provenance, isLive);

              return (
                <div 
                  data-testid="navbar-aqi-live"
                  className={clsx(
                    'hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border',
                    aqiMeta.badgeClass
                  )}
                  title={`${provenanceInfo.statusLabel}: AQI ${aqData.aqi} (${aqiMeta.category}) • ${aqData.station.name} • ${aqData.provenance.sourceAttribution || 'Open-Meteo CAMS'}`}
                >
                  {provenanceInfo.isStale ? (
                    <Clock className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                  ) : (
                    <Radio className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400 animate-pulse" aria-hidden="true" />
                  )}
                  <span>AQI {aqData.aqi}</span>
                  <span className="text-[10px] uppercase tracking-wider font-extrabold">• {aqiMeta.category} ({provenanceInfo.tag})</span>
                </div>
              );
            })()
          ) : (
            (() => {
              const aqiMeta = getAQIMetadata(aqData.aqi);
              return (
                <div 
                  data-testid="navbar-aqi-demo"
                  className={clsx(
                    'hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border',
                    aqiMeta.badgeClass
                  )}
                  title={`Simulated Demo Scenario: AQI ${aqData.aqi} (${aqiMeta.category}) - Backend offline / Live integration pending`}
                >
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                  <span>AQI {aqData.aqi}</span>
                  <span className="text-[10px] uppercase tracking-wider font-extrabold">• {aqiMeta.category} (Demo)</span>
                </div>
              );
            })()
          )}

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#090D16] px-4 pt-2 pb-4 space-y-1">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMobileMenuOpen(false)}
                className={clsx(
                  'block px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                )}
              >
                {link.label}
              </Link>
            );
          })}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 px-3">
            <span>Monitoring Station:</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">{currentLocObj.name.split(',')[0]}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500 px-3">
            <span>Air Quality:</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {isLoading ? (
                'Loading...'
              ) : isError || !aqData ? (
                'Unavailable'
              ) : aqData.aqi === null || aqData.aqi === undefined ? (
                'NAQI Unavailable'
              ) : (
                `AQI ${aqData.aqi} • ${getAQIMetadata(aqData.aqi).category} (${determineTelemetryProvenance(aqData.provenance, isLive).tag})`
              )}
            </span>
          </div>
        </div>
      )}
    </header>
  );
};
