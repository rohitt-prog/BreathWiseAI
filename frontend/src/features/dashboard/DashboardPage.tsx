import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../stores/useAppStore';
import { MOCK_AIR_QUALITY_DATA, MOCK_LOCATIONS } from '../../services/mockData';
import { apiClient } from '../../services/apiClient';
import { useAirQualityQuery } from '../../hooks/useAirQualityQuery';
import { determineTelemetryProvenance, isValidNumericConcentration } from '../../utils/aqiUtils';
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
  const { currentLocationId, openExplanationModal, userPreferences } = useAppStore();
  const currentLocObj =
    MOCK_LOCATIONS.find((l) => l.id === currentLocationId) ||
    (userPreferences?.defaultLocation
      ? {
          id: currentLocationId,
          name: userPreferences.defaultLocation.name,
          city: userPreferences.defaultLocation.city,
          lat: userPreferences.defaultLocation.lat,
          lon: userPreferences.defaultLocation.lon,
        }
      : MOCK_LOCATIONS[0]);

  const { data: telemetry, isError } = useAirQualityQuery();

  // A network failure or missing live flag strictly forces isLive to false
  const isLive = !isError && Boolean(telemetry?.isLive);
  const aqData = isLive && telemetry ? telemetry.data : (MOCK_AIR_QUALITY_DATA[currentLocationId] || MOCK_AIR_QUALITY_DATA['del_anand_vihar']);

  // Reuse shared provenance determination utility (Correction 1)
  const provenanceInfo = determineTelemetryProvenance(aqData?.provenance, isLive);
  const isFreshModelled = provenanceInfo.tag === 'Modelled';
  const isStaleModelled = provenanceInfo.tag === 'Stale Modelled';
  const isLiveSensor = provenanceInfo.tag === 'Live Sensor';
  const isStaleSensor = provenanceInfo.tag === 'Stale Sensor';
  const isUnverified = provenanceInfo.tag === 'Unverified';
  const isDemo = provenanceInfo.tag === 'Demo';

  const validTimeStr = aqData?.provenance?.forecastTimestamp
    ? ` • Forecast validity: ${new Date(aqData.provenance.forecastTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })} UTC`
    : '';
  const obsTimeStr = aqData?.provenance?.observedAt
    ? ` • Recorded: ${new Date(aqData.provenance.observedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`
    : '';

  let badgeText = 'SIMULATED_DEMO (Curated Scenario)';
  let badgeClasses = 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-800';
  let statusText = 'Curated Scenario (Simulated Demo Scenario)';
  let isVerifiedLive = false;

  if (isFreshModelled) {
    badgeText = 'MODELLED_FORECAST (Open-Meteo CAMS)';
    badgeClasses = 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-300 border-sky-300 dark:border-sky-800';
    statusText = `Regional Atmospheric Chemistry Model${validTimeStr}`;
    isVerifiedLive = true;
  } else if (isStaleModelled) {
    badgeText = 'MODELLED_FORECAST (STALE Modelled)';
    badgeClasses = 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-800';
    statusText = `Stale Atmospheric Model (Expired or Stale Run)${validTimeStr}`;
  } else if (isLiveSensor) {
    badgeText = 'OBSERVATION (Physical Sensor)';
    badgeClasses = 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';
    statusText = `Physical Ground Sensor Ingest${obsTimeStr}`;
    isVerifiedLive = true;
  } else if (isStaleSensor) {
    badgeText = 'OBSERVATION (STALE Ground Sensor)';
    badgeClasses = 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-300 border-rose-300 dark:border-rose-800';
    statusText = `Physical Ground Sensor Ingest (Stale)${obsTimeStr}`;
  } else if (isUnverified) {
    badgeText = 'UNVERIFIED (Unverified Telemetry)';
    badgeClasses = 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-300 border-rose-300 dark:border-rose-800';
    statusText = 'Unverified Telemetry (Unrecognized Source)';
  } else {
    // isDemo
    badgeText = 'SIMULATED_DEMO (Curated Scenario)';
    badgeClasses = 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-800';
    statusText = 'Curated Scenario (Simulated Demo Scenario)';
  }

  // AI insight eligibility: requires live, verified, fresh telemetry and valid PM2.5 (Correction 2)
  const pm25Val = aqData?.pollutants?.['PM2.5']?.concentration;
  const isPm25Valid = isValidNumericConcentration(pm25Val);
  const isTelemetryEligibleForAI =
    isLive &&
    isVerifiedLive &&
    isPm25Valid &&
    aqData?.provenance?.isVerified !== false;

  const { data: aiInsights, isLoading: isAILoading, isError: isAIError } = useQuery({
    queryKey: ['aiInsights', currentLocationId, currentLocObj.lat, currentLocObj.lon],
    queryFn: () => apiClient.fetchAIInsights(currentLocObj.lat, currentLocObj.lon),
    enabled: isTelemetryEligibleForAI,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  // Stale cached AI insights from previous locations or states are suppressed when ineligible
  const activeAiInsights = isTelemetryEligibleForAI && !isAIError ? aiInsights : undefined;

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
            {isVerifiedLive ? (
              <Radio className={`w-3.5 h-3.5 animate-pulse ${isFreshModelled ? 'text-sky-600' : 'text-emerald-600'}`} />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
            )}
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
      <section className="p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-emerald-900 via-slate-900 to-slate-950 text-white shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-base sm:text-lg">Today's Evidence-Grounded Directives</h3>
          </div>
          {(() => {
            if (!isTelemetryEligibleForAI) {
              if (isDemo) {
                return (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-amber-950/80 text-amber-300 border-amber-700/50">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Curated Demo Guidance (Backend Offline)</span>
                  </span>
                );
              }
              if (isUnverified) {
                return (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-rose-950/80 text-rose-300 border-rose-700/50">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Baseline Guidance (Telemetry Unverified)</span>
                  </span>
                );
              }
              if (!isPm25Valid) {
                return (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-rose-950/80 text-rose-300 border-rose-700/50">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Baseline Guidance (Telemetry Insufficient)</span>
                  </span>
                );
              }
              if (isStaleModelled || isStaleSensor || provenanceInfo.isStale) {
                return (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-amber-950/80 text-amber-300 border-amber-700/50">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Baseline Guidance (Telemetry Stale)</span>
                  </span>
                );
              }
            }

            if (isAILoading) {
              return (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-sky-950/80 text-sky-300 border-sky-700/50">
                  <Clock className="w-3.5 h-3.5 animate-spin" />
                  <span>Synthesizing Evidence...</span>
                </span>
              );
            }

            if (isAIError) {
              return (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-amber-950/80 text-amber-300 border-amber-700/50">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Deterministic Safety Override</span>
                </span>
              );
            }

            const status = activeAiInsights?.status;
            let statusBadge = {
              text: 'Deterministic Safety Rules',
              classes: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/50',
              icon: ShieldCheck
            };
            if (status === 'GENERATED') {
              statusBadge = {
                text: 'Google Gemini Synthesized',
                classes: 'bg-emerald-950/90 text-emerald-200 border-emerald-500/60 shadow-sm',
                icon: Sparkles
              };
            } else if (status === 'FALLBACK_NO_API_KEY') {
              statusBadge = {
                text: 'Deterministic Rule Engine (No Gemini Key)',
                classes: 'bg-sky-950/80 text-sky-300 border-sky-700/50',
                icon: ShieldCheck
              };
            } else if (status === 'FALLBACK_MODEL_ERROR' || status === 'FALLBACK_VALIDATION_ERROR') {
              statusBadge = {
                text: 'Deterministic Safety Override',
                classes: 'bg-amber-950/80 text-amber-300 border-amber-700/50',
                icon: ShieldCheck
              };
            } else if (status === 'FALLBACK_STALE_DATA' || status === 'FALLBACK_INVALID_DATA') {
              statusBadge = {
                text: 'Baseline Guidance (Telemetry Unverified)',
                classes: 'bg-rose-950/80 text-rose-300 border-rose-700/50',
                icon: AlertTriangle
              };
            } else if (status === 'SIMULATED_DEMO_INSIGHT') {
              statusBadge = {
                text: 'Curated Demo Guidance (Backend Offline)',
                classes: 'bg-amber-950/80 text-amber-300 border-amber-700/50',
                icon: ShieldCheck
              };
            }
            const StatusIcon = statusBadge.icon;
            return (
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${statusBadge.classes}`}>
                <StatusIcon className="w-3.5 h-3.5" />
                <span>{statusBadge.text}</span>
              </span>
            );
          })()}
        </div>

        {/* AI Plain-Language Context Summary (Gated on eligibility) */}
        {!isTelemetryEligibleForAI ? (
          <p className="text-xs sm:text-sm text-slate-300 border-l-2 border-amber-500/70 pl-3 py-0.5" data-testid="ai-summary-gated">
            {isDemo
              ? 'Current-condition AI insights are disabled in Demo Mode. Telemetry is simulated for demonstration purposes.'
              : isUnverified
              ? 'Telemetry source is unverified. Current-condition AI directives are suspended to prevent unverified guidance.'
              : !isPm25Valid
              ? 'Telemetry is insufficient. Required fine particulate (PM2.5) concentrations are unavailable or invalid, so live exposure directives cannot be generated.'
              : 'Live telemetry is stale or expired. Current-condition AI directives are suspended until fresh atmospheric observations or model runs are received.'}
          </p>
        ) : isAIError ? (
          <p className="text-xs sm:text-sm text-slate-300 border-l-2 border-amber-500/70 pl-3 py-0.5" data-testid="ai-summary-error">
            AI synthesis unavailable due to service error. Standard deterministic safety rules remain active.
          </p>
        ) : activeAiInsights?.summary ? (
          <p className="text-xs sm:text-sm text-slate-300 border-l-2 border-emerald-500/70 pl-3 py-0.5" data-testid="ai-summary-live">
            {activeAiInsights.summary}
          </p>
        ) : null}

        {/* Action Directives Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs sm:text-sm">
          {!isTelemetryEligibleForAI ? (
            <div className="col-span-full p-3.5 sm:p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 text-slate-300 text-xs sm:text-sm space-y-1" data-testid="ai-directives-gated">
              <div className="flex items-center gap-2 font-semibold text-slate-200">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Live Directives Suspended</span>
              </div>
              <p className="text-slate-400 text-xs leading-relaxed">
                {isDemo
                  ? 'Actionable health directives require verified live environmental telemetry. In demonstration mode, active schedule optimization and personal exposure recommendations are withheld.'
                  : isUnverified
                  ? 'Guidance cannot be generated from unverified telemetry providers. Environmental data must originate from recognized physical sensors or regional atmospheric chemistry models.'
                  : !isPm25Valid
                  ? 'Fine particulate matter (PM2.5) is required to calculate cardiovascular inhalation risks. Directives are withheld until valid concentration data is received.'
                  : 'Actionable health directives require fresh environmental telemetry. Please consult verified municipal monitors or check back once telemetry refreshes.'}
              </p>
            </div>
          ) : isAILoading ? (
            <>
              <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 animate-pulse h-28" />
              <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 animate-pulse h-28" />
              <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 animate-pulse h-28" />
            </>
          ) : isAIError ? (
            <div className="col-span-full p-3.5 sm:p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 text-slate-300 text-xs sm:text-sm space-y-1" data-testid="ai-directives-error">
              <div className="flex items-center gap-2 font-semibold text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>AI Service Error</span>
              </div>
              <p className="text-slate-400 text-xs leading-relaxed">
                Unable to reach AI intelligence engine. Deterministic safety rules remain active to prevent hazardous exposure.
              </p>
            </div>
          ) : (
            (activeAiInsights?.recommended_actions || []).map((action) => {
              const priorityColor =
                action.priority === 'HIGH'
                  ? 'text-rose-400 bg-rose-950/60 border-rose-800/60'
                  : action.priority === 'MEDIUM'
                  ? 'text-amber-400 bg-amber-950/60 border-amber-800/60'
                  : 'text-sky-400 bg-sky-950/60 border-sky-800/60';

              const categoryLabel = action.category.replace('_', ' ');

              return (
                <div
                  key={action.action_id}
                  className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80 flex flex-col justify-between space-y-2 hover:border-slate-600 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-emerald-400 text-[11px] uppercase tracking-wider block truncate">
                        {categoryLabel}
                      </span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase shrink-0 ${priorityColor}`}>
                        {action.priority}
                      </span>
                    </div>
                    <p className="font-medium text-slate-100 text-xs sm:text-sm leading-snug">
                      {action.title}
                    </p>
                    <p className="text-slate-300 text-xs leading-relaxed">
                      {action.rationale}
                    </p>
                  </div>

                  {action.evidence_ids && action.evidence_ids.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-700/50">
                      {action.evidence_ids.map((eid) => (
                        <span
                          key={eid}
                          className="text-[10px] font-mono text-slate-400 bg-slate-900/60 px-1.5 py-0.5 rounded border border-slate-700/40"
                        >
                          {eid}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-800/80">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              {isTelemetryEligibleForAI && aqData.aqi
                ? `Outdoor cardiovascular exercise restricted under current AQI (${aqData.aqi}).`
                : isDemo
                ? 'Simulated scenario — live cardiovascular exercise directives are suspended in demo mode.'
                : 'Telemetry insufficient for live cardiovascular exercise directives.'}
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
