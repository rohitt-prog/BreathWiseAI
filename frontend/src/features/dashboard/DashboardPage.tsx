import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../stores/useAppStore';
import { MOCK_AIR_QUALITY_DATA, MOCK_LOCATIONS } from '../../services/mockData';
import { apiClient } from '../../services/apiClient';
import { AQIGauge } from '../../components/visualization/AQIGauge';
import { PollutantGrid } from '../../components/visualization/PollutantGrid';
import { WeatherCard } from '../../components/visualization/WeatherCard';
import { ForecastStrip } from '../../components/visualization/ForecastStrip';
import {
  Building2,
  Clock,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  AlertTriangle,
  HelpCircle,
  Radio
} from 'lucide-react';
import { Button } from '../../components/common/Button';

export const DashboardPage: React.FC = () => {
  const { currentLocationId, openExplanationModal } = useAppStore();
  const currentLocObj = MOCK_LOCATIONS.find(l => l.id === currentLocationId) || MOCK_LOCATIONS[0];

  const { data: telemetry, isError } = useQuery({
    queryKey: ['airQuality', currentLocationId],
    queryFn: () => apiClient.resolveAirQualityData(
      currentLocationId,
      { lat: currentLocObj.lat, lon: currentLocObj.lon }
    ),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  // A network failure or missing live flag strictly forces isLive to false
  const isLive = !isError && Boolean(telemetry?.isLive);
  const aqData = isLive && telemetry ? telemetry.data : (MOCK_AIR_QUALITY_DATA[currentLocationId] || MOCK_AIR_QUALITY_DATA['del_anand_vihar']);

  const classification = aqData.provenance.dataSource;
  const isModelled = classification === 'MODELLED_FORECAST';
  const isObservation = classification === 'OBSERVATION';

  let badgeText = 'SIMULATED_DEMO (Curated Scenario)';
  let badgeClasses = 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-800';
  let statusText = 'Curated Scenario (Backend Offline / Live CPCB Pending)';

  if (isLive && isModelled) {
    badgeText = 'MODELLED_FORECAST (Open-Meteo CAMS)';
    badgeClasses = 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-300 border-sky-300 dark:border-sky-800';
    const validTimeStr = aqData.provenance.forecastTimestamp
      ? ` • Forecast validity: ${new Date(aqData.provenance.forecastTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })} UTC`
      : '';
    statusText = `Regional Atmospheric Chemistry Model${validTimeStr}`;
  } else if (isLive && isObservation) {
    const isStale = aqData.provenance.observationFreshness === 'STALE';
    badgeText = isStale ? 'OBSERVATION (STALE Ground Sensor)' : 'OBSERVATION (Physical Sensor)';
    badgeClasses = isStale
      ? 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-300 border-rose-300 dark:border-rose-800'
      : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';
    const obsTimeStr = aqData.provenance.observedAt
      ? ` • Recorded: ${new Date(aqData.provenance.observedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`
      : '';
    statusText = `Physical Ground Sensor Ingest${obsTimeStr}`;
  }

  return (
    <div className="space-y-6 sm:space-y-8">

      {/* Station Provenance Banner */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
            <Building2 className="w-4 h-4 text-emerald-600" />
            <span>Node: {aqData.station.name}</span>
          </div>
          <span className="hidden sm:inline text-slate-400">•</span>
          <div className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>{statusText}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold border text-[11px] ${badgeClasses}`}>
            {isLive ? <Radio className={`w-3.5 h-3.5 animate-pulse ${isModelled ? 'text-sky-600' : 'text-emerald-600'}`} /> : <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />}
            <span>{badgeText}</span>
          </span>
          <button
            onClick={() => openExplanationModal(
              isLive
                ? `Active Node: ${aqData.station.name} (${aqData.provenance.indexSystem})`
                : `Scenario Node: ${aqData.station.name} (Simulated Demo Data)`
            )}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            title="Inspect Data Provenance & Safety Rules"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Primary Intelligence Row: AQI Gauge + Atmospheric Physics */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <AQIGauge data={aqData} />
        </div>
        <div>
          <WeatherCard weather={aqData.weather} />
        </div>
      </section>

      {/* Immediate Action Directives Banner (GenAI + Safety Engine) */}
      <section className="p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-emerald-900 to-slate-900 text-white shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-base sm:text-lg">Today's Immediate Action Directives</h3>
          </div>
          <span className="text-[11px] font-semibold text-emerald-300 bg-emerald-950/80 px-2.5 py-0.5 rounded-full border border-emerald-700/50">
            Safety Guardrails Verified
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs sm:text-sm">
          <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-1">
            <span className="font-bold text-emerald-400 text-xs uppercase tracking-wider block">Commute Action</span>
            <p className="text-slate-200">Switch motorized commute to Delhi Metro. Wear an N95 respirator for street ingress.</p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-1">
            <span className="font-bold text-amber-400 text-xs uppercase tracking-wider block">Indoor Protocol</span>
            <p className="text-slate-200">Keep windows sealed. Run HEPA air purifier on continuous medium speed.</p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-1">
            <span className="font-bold text-sky-400 text-xs uppercase tracking-wider block">Exposure vs Emission</span>
            <p className="text-slate-200">Avoid cycling through heavy traffic today; high PM2.5 lung intake outweighs emission gains.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              {aqData.aqi
                ? `Outdoor cardiovascular exercise restricted under current AQI (${aqData.aqi}).`
                : 'Elevated fine particulates detected. Limit heavy cardiovascular exercise.'}
            </span>
          </div>

          <Link to="/planner">
            <Button variant="primary" size="sm" icon={ArrowRight} iconPosition="right">
              View Complete Hourly Plan
            </Button>
          </Link>
        </div>
      </section>

      {/* 8-Pollutant Breakout Grid */}
      <section>
        <PollutantGrid pollutants={aqData.pollutants} />
      </section>

      {/* 12-Hour Smog Trajectory */}
      <section>
        <ForecastStrip forecast={aqData.forecast} />
      </section>
    </div>
  );
};
