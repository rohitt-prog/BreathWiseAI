import React, { useState } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import { useAirQualityForecastQuery } from '../../hooks/useAirQualityForecastQuery';
import { MOCK_LOCATIONS } from '../../services/mockData';
import {
  formatLocalTime,
  isForecastDataSufficient,
  generateDynamicDailyPlan,
  isValidPollutantValue,
  isValidAqiValue,
} from '../../utils/plannerUtils';
import {
  Calendar,
  ShieldAlert,
  Clock,
  HelpCircle,
  ThumbsUp,
  ThumbsDown,
  Check,
  Sparkles,
  Layers,
  AlertTriangle,
  RotateCw,
  AlertCircle,
  Sun,
  Activity,
  Wind,
} from 'lucide-react';
import { Badge } from '../../components/common/Badge';
import clsx from 'clsx';

export const PlannerPage: React.FC = () => {
  const { currentLocationId, selectedLocation, openExplanationModal, userPreferences } = useAppStore();
  const currentLocObj =
    (selectedLocation && selectedLocation.id === currentLocationId ? selectedLocation : null) ||
    MOCK_LOCATIONS.find((l) => l.id === currentLocationId) ||
    MOCK_LOCATIONS[0];

  const [feedbackGiven, setFeedbackGiven] = useState<Record<string, 'helpful' | 'unfeasible'>>({});
  const [policyMode, setPolicyMode] = useState<'balanced' | 'max_exposure'>('balanced');

  const {
    data: forecastRes,
    isLoading,
    isError,
    error,
    refetch,
  } = useAirQualityForecastQuery();

  const handleFeedback = (slotId: string, rating: 'helpful' | 'unfeasible') => {
    setFeedbackGiven((prev) => ({ ...prev, [slotId]: rating }));
  };

  // 1. Loading UI State
  if (isLoading) {
    return (
      <div className="space-y-6 sm:space-y-8 animate-pulse" role="status" aria-label="Loading forecast telemetry">
        <div className="p-6 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="h-6 w-72 bg-slate-200 dark:bg-slate-700 rounded-md"></div>
          <div className="h-4 w-96 bg-slate-100 dark:bg-slate-800 rounded-md"></div>
        </div>
        <div className="p-6 rounded-2xl bg-slate-800/50 space-y-3">
          <div className="h-5 w-60 bg-slate-700 rounded-md"></div>
          <div className="h-4 w-full bg-slate-700/60 rounded-md"></div>
        </div>
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-6 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="h-5 w-48 bg-slate-200 dark:bg-slate-700 rounded-md"></div>
              <div className="h-16 w-full bg-slate-100 dark:bg-slate-800 rounded-md"></div>
            </div>
          ))}
        </div>
        <span className="sr-only">Loading hourly forecast telemetry...</span>
      </div>
    );
  }

  // 2. API Error State (Do not silently substitute static mock recommendations)
  if (isError || !forecastRes) {
    return (
      <div className="space-y-6">
        <div
          className="p-6 sm:p-8 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200 space-y-4 shadow-sm"
          role="alert"
          aria-live="assertive"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-100 dark:bg-rose-900/60 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Forecast Telemetry Unavailable</h2>
              <p className="text-xs sm:text-sm text-rose-700 dark:text-rose-300">
                Could not retrieve hourly environmental forecast for {currentLocObj.name}.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white/70 dark:bg-rose-950/50 border border-rose-200/80 dark:border-rose-800/80 text-xs sm:text-sm leading-relaxed">
            <p className="font-semibold text-rose-800 dark:text-rose-300">
              Scientific Integrity Policy:
            </p>
            <p className="mt-1 text-slate-700 dark:text-slate-300">
              BreatheWise AI does not silently substitute fabricated numbers or static mock plans when live environmental APIs fail. Activity recommendations require verifiable telemetry.
            </p>
            {error && (
              <p className="mt-2 text-[11px] font-mono text-rose-600 dark:text-rose-400 bg-rose-100/50 dark:bg-rose-900/40 p-2 rounded">
                Backend detail: {error.message}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-semibold transition-all shadow-sm"
            >
              <RotateCw className="w-4 h-4" />
              <span>Retry Forecast</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Insufficient Forecast Data State
  const hasSufficientData = isForecastDataSufficient(forecastRes.data);
  if (!hasSufficientData) {
    return (
      <div className="space-y-6">
        <div
          className="p-6 sm:p-8 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 space-y-4 shadow-sm"
          role="alert"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Insufficient Forecast Telemetry</h2>
              <p className="text-xs sm:text-sm text-amber-700 dark:text-amber-300">
                Hourly pollutant predictions are unavailable for {currentLocObj.name}.
              </p>
            </div>
          </div>

          <p className="text-xs sm:text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            The atmospheric chemistry model did not provide valid numerical PM2.5 or PM10 forecast points for this coordinate. Reliable activity windows and respiratory exposure mitigation cannot be calculated without predictive telemetry.
          </p>

          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-semibold transition-all shadow-sm"
          >
            <RotateCw className="w-4 h-4" />
            <span>Check Forecast Again</span>
          </button>
        </div>
      </div>
    );
  }

  // 4. Available Forecast: Synthesize dynamic plan with explicit source and freshness options
  const isDemo = forecastRes.isDemo || forecastRes.data.source_type === 'SIMULATED_DEMO';
  const isStale = forecastRes.isStale;
  const isUnknownSource = Boolean(forecastRes.isUnknownSource);
  const isLiveVerified = forecastRes.isLive && !isStale && !isDemo && !isUnknownSource;

  const isObservation =
    forecastRes.data.source_type === 'OBSERVATION' ||
    forecastRes.data.source_type === 'OPENAQ_V3' ||
    forecastRes.data.source_type === 'CPCB_OFFICIAL';

  const isModelledForecast =
    (forecastRes.data.source_type === 'MODELLED_FORECAST' ||
      forecastRes.data.source_type === 'OPEN_METEO_MODELLED') &&
    !isObservation;

  const isVerifiedOpenMeteo =
    Boolean(
      forecastRes.data.provider?.toLowerCase().includes('open-meteo') ||
      forecastRes.data.source_attribution?.toLowerCase().includes('open-meteo')
    ) &&
    !isUnknownSource &&
    !isDemo;

  const plan = generateDynamicDailyPlan(
    forecastRes.data,
    userPreferences,
    policyMode,
    null,
    {
      isLive: forecastRes.isLive,
      isDemo,
      isStale,
      isUnknownSource,
    }
  );

  const hourlyPoints = (forecastRes.data.hourly_forecast || []).slice(0, 12);
  const bestSlot = plan.itinerary.find((s) => s.isBestWindow);

  // Actionable directives / real-world recommendations permitted strictly for verified fresh live forecasts
  const canShowActionableDirectives = isLiveVerified;
  const shouldShowBestWindow = canShowActionableDirectives && Boolean(bestSlot);

  // Dynamic Headline Advice and Trade-Off based on freshness & source classification
  const displayedHeadlineAdvice = isStale
    ? 'Forecast telemetry is stale: Atmospheric prediction data was retrieved over 60 minutes ago. Current-condition activity advice and optimal window rankings are suspended until fresh telemetry is retrieved.'
    : isUnknownSource
    ? 'Unverified Telemetry Source: Provider classification could not be verified as authoritative live modelled or physical sensor data. Telemetry-dependent activity recommendations are suspended.'
    : plan.headlineAdvice;

  const displayedTradeOff = isStale
    ? 'Protective Guidance: Because forecast freshness cannot be verified, follow baseline precautionary exposure reduction and check live station observations before outdoor exertion.'
    : isUnknownSource
    ? 'Precautionary Guidance: Unverified environmental data cannot be used for prescriptive personal health or commute decisions. Verify conditions with official local environmental authorities.'
    : plan.tradeOffAnalysis;

  // Source attribution: never label unknown-source telemetry as Open-Meteo CAMS
  const displayedSourceAttribution = isDemo
    ? 'Simulated Demonstration Scenario (Synthetic)'
    : isUnknownSource
    ? (forecastRes.data.source_attribution || forecastRes.data.source_type || 'Unverified Provider')
    : forecastRes.data.source_attribution
    ? forecastRes.data.source_attribution
    : isVerifiedOpenMeteo
    ? 'Open-Meteo CAMS Model (~40km grid)'
    : (forecastRes.data.provider || 'Environmental Data Provider');

  const displayedLocationName =
    forecastRes.data.location.name ||
    currentLocObj.name ||
    `${forecastRes.data.location.latitude.toFixed(2)}, ${forecastRes.data.location.longitude.toFixed(2)}`;

  return (
    <div className="space-y-6 sm:space-y-8">

      {/* Stale Forecast Warning Banner */}
      {isStale && (
        <div
          className="p-3.5 px-4 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-950 dark:text-amber-200 text-xs sm:text-sm font-medium flex items-center gap-2.5 shadow-sm"
          role="status"
        >
          <Clock className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            <strong>{isObservation ? 'Stale Observation:' : 'Stale Forecast:'}</strong> Prediction data was retrieved over 60 minutes ago or numerical model cycle is not fresh (retrieval: {forecastRes.data.retrieval_freshness || 'UNAVAILABLE'}, model run: {forecastRes.data.model_run_freshness || 'UNAVAILABLE'}). Actionable activity recommendations are suspended.
          </span>
        </div>
      )}

      {/* Demo Mode Notice Banner */}
      {isDemo && (
        <div
          className="p-3.5 px-4 rounded-xl bg-sky-500/15 border border-sky-500/40 text-sky-950 dark:text-sky-200 text-xs sm:text-sm font-medium flex items-center gap-2.5 shadow-sm"
          role="status"
        >
          <Sparkles className="w-4 h-4 text-sky-600 shrink-0" />
          <span>
            <strong>Demonstration Scenario:</strong> Synthetic forecast values are displayed for illustrative interface walkthrough only. Actionable recommendations and best activity windows are suppressed.
          </span>
        </div>
      )}

      {/* Unknown Source Classification Banner */}
      {isUnknownSource && (
        <div
          className="p-3.5 px-4 rounded-xl bg-slate-500/15 border border-slate-500/40 text-slate-900 dark:text-slate-200 text-xs sm:text-sm font-medium flex items-center gap-2.5 shadow-sm"
          role="status"
        >
          <AlertCircle className="w-4 h-4 text-slate-600 shrink-0" />
          <span>
            <strong>Unverified Source:</strong> Forecast telemetry originates from an unrecognized provider classification ({forecastRes.data.source_type || 'UNKNOWN'}). Not verified as live modelled or sensor telemetry.
          </span>
        </div>
      )}

      {/* Header & Context Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
              Personalized Daily Action Planner
            </h1>

            {isDemo ? (
              <Badge variant="info" icon={Sparkles} size="sm">
                Illustrative AI Plan (Demo)
              </Badge>
            ) : isStale ? (
              <Badge variant="warning" icon={Clock} size="sm">
                {isObservation ? 'Stale Observation' : 'Stale Forecast'}
              </Badge>
            ) : isUnknownSource ? (
              <Badge variant="neutral" icon={AlertCircle} size="sm">
                Unverified Source
              </Badge>
            ) : isObservation ? (
              <Badge variant="success" icon={Activity} size="sm">
                Live Physical Observation
              </Badge>
            ) : isModelledForecast && isLiveVerified ? (
              <Badge variant="success" icon={Sparkles} size="sm">
                Live Modelled Forecast
              </Badge>
            ) : (
              <Badge variant="neutral" icon={AlertCircle} size="sm">
                Unverified Source
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
            <span className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
              <Calendar className="w-3.5 h-3.5" />
              {plan.date} {isDemo ? '(Simulated)' : isObservation ? '(Physical Observation)' : '(Live Forecast)'}
            </span>
            <span>•</span>
            <span>
              {isDemo ? 'Scenario' : 'Location'}: {displayedLocationName}
            </span>
            <span>•</span>
            <span className="capitalize">Persona: {userPreferences.personaType}</span>
            {userPreferences.hasSensitiveMembers && (
              <span className="text-red-600 dark:text-red-400 font-semibold">• High-Vulnerability Guardrails Active</span>
            )}
          </div>
        </div>

        {/* Policy Mode Selector */}
        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setPolicyMode('balanced')}
            className={clsx(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              policyMode === 'balanced'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            )}
          >
            Balanced (Exposure & Emissions)
          </button>
          <button
            onClick={() => setPolicyMode('max_exposure')}
            className={clsx(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              policyMode === 'max_exposure'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            )}
          >
            Max Personal Protection
          </button>
        </div>
      </div>

      {/* Hourly Forecast Ribbon */}
      <div className="p-5 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Hourly Forecast Telemetry (Local Time)</span>
          </div>
          <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">
            Source: {displayedSourceAttribution}
          </span>
        </div>

        <div className="overflow-x-auto pb-1">
          <div className="flex items-center gap-2.5 min-w-max">
            {hourlyPoints.map((pt, idx) => {
              const localTime = formatLocalTime(pt.timestamp);
              const isValidPm = isValidPollutantValue(pt.pm2_5);
              const isValidAqi = isValidAqiValue(pt.modelled_aqi_estimate);
              const pm25Text = isValidPm ? `${Math.round(pt.pm2_5!)}` : '--';
              const aqiEstText = isValidAqi ? `${pt.modelled_aqi_estimate}` : '--';

              return (
                <div
                  key={`${pt.timestamp}-${idx}`}
                  className="flex flex-col items-center p-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center min-w-[76px]"
                >
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {localTime}
                  </span>
                  <div className="mt-1 text-xs">
                    <span className="font-extrabold text-emerald-700 dark:text-emerald-400">
                      {pm25Text}
                    </span>
                    <span className="text-[10px] text-slate-400 ml-0.5">µg/m³</span>
                  </div>
                  <span
                    className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono"
                    title="Model AQI estimate (US EPA scale reported by CAMS; not official Indian NAQI)"
                  >
                    Est. {aqiEstText}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">
          * Modelled AQI estimates reflect numerical chemical transport forecasts (US EPA benchmark) and are NOT converted into official Indian National AQI.
        </p>
      </div>

      {/* Best Activity Window Highlight Card (Only for verified live non-stale forecasts) */}
      {shouldShowBestWindow && bestSlot && (
        <div className="p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-100 space-y-2 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
              <Sun className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Recommended Activity Window</span>
            </div>
            <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-200">
              Relative Diurnal Minimum: {bestSlot.timeWindow}
            </span>
          </div>
          <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-50">
            {bestSlot.recommendedAction}
          </p>
          <p className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">
            {bestSlot.scientificRationale}
          </p>
        </div>
      )}

      {/* Headline Stance & Trade-off Banner */}
      <div className="p-5 rounded-2xl bg-slate-900 text-white space-y-3 shadow-md">
        <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
          <Layers className="w-4 h-4" />
          <span>Daily Strategy & Trade-Off Resolution</span>
        </div>
        <p className="text-sm sm:text-base font-semibold leading-relaxed text-slate-100">
          {displayedHeadlineAdvice}
        </p>
        <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80 text-xs sm:text-sm text-slate-300 leading-relaxed">
          {displayedTradeOff}
        </div>
      </div>

      {/* Scheduled Action Directives (Itinerary) */}
      {isStale ? (
        <div className="p-6 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800/80 space-y-3">
          <div className="flex items-center gap-2.5 text-amber-900 dark:text-amber-200 font-bold text-sm">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <span>Action Directives Suspended (Stale Forecast)</span>
          </div>
          <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            Current activity directives and best-window recommendations are suspended because forecast telemetry failed freshness validation (retrieval freshness: {forecastRes.data.retrieval_freshness || 'UNAVAILABLE'}, model run freshness: {forecastRes.data.model_run_freshness || 'UNAVAILABLE'}). Following BreatheWise AI safety rules, actionable personal protection directives are not generated from expired atmospheric predictions.
          </p>
          <div className="p-3 rounded-xl bg-white/60 dark:bg-slate-900/60 border border-amber-200 dark:border-amber-900/50 text-xs text-slate-600 dark:text-slate-400 space-y-1">
            <div><strong>Provider:</strong> {forecastRes.data.provider || 'Atmospheric Chemistry Model'}</div>
            <div><strong>Source:</strong> {forecastRes.data.source_attribution || forecastRes.data.source_type}</div>
            <div><strong>Retrieved At:</strong> {forecastRes.data.retrieved_at ? new Date(forecastRes.data.retrieved_at).toLocaleString() : 'Unavailable'}</div>
          </div>
        </div>
      ) : isUnknownSource ? (
        <div className="p-6 rounded-2xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-300 dark:border-slate-800 space-y-3">
          <div className="flex items-center gap-2.5 text-slate-900 dark:text-slate-200 font-bold text-sm">
            <AlertCircle className="w-5 h-5 text-slate-600 shrink-0" />
            <span>Action Directives Suspended (Unverified Source)</span>
          </div>
          <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            Current activity directives and best-window recommendations are suspended because forecast telemetry originates from an unrecognized provider classification ({forecastRes.data.source_type || 'UNKNOWN'}). Following BreatheWise AI safety rules, prescriptive personal exposure directives require verified atmospheric model predictions or ground station telemetry.
          </p>
          <div className="p-3 rounded-xl bg-white/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-1">
            <div><strong>Provider:</strong> {forecastRes.data.provider || 'Unverified Provider'}</div>
            <div><strong>Source Classification:</strong> {forecastRes.data.source_type || 'UNKNOWN'}</div>
            <div><strong>Retrieved At:</strong> {forecastRes.data.retrieved_at ? new Date(forecastRes.data.retrieved_at).toLocaleString() : 'Unavailable'}</div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center justify-between">
            <span>Scheduled Action Directives</span>
            <span className="text-xs font-normal text-slate-500">
              {isDemo ? '4 Diurnal Time Windows (Illustrative Simulation)' : `${plan.itinerary.length} Diurnal Time Windows Dynamically Ranked`}
            </span>
          </h2>

          {plan.itinerary.map((slot) => {
            const rating = feedbackGiven[slot.id];

            return (
              <div
                key={slot.id}
                className={clsx(
                  'p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#131B2E] border shadow-sm space-y-4 transition-all',
                  slot.isBestWindow
                    ? 'border-emerald-300 dark:border-emerald-700/80 ring-1 ring-emerald-400/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                )}
              >
                {/* Slot Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className={clsx(
                      'p-2 rounded-lg',
                      slot.isBestWindow
                        ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    )}>
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span>{slot.activityTitle}</span>
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>{slot.timeWindow}</span>
                        {slot.avgPm25 !== null ? (
                          <span>• Predicted PM2.5: {slot.avgPm25} µg/m³</span>
                        ) : (
                          <span>• Predicted PM2.5: Unavailable</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={clsx(
                        'text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border uppercase tracking-wider',
                        slot.smogRisk === 'hazardous'
                          ? 'bg-red-100 text-red-900 border-red-300 dark:bg-red-950 dark:text-red-200'
                          : slot.smogRisk === 'high'
                          ? 'bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-950 dark:text-orange-200'
                          : slot.smogRisk === 'moderate'
                          ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200'
                          : slot.smogRisk === 'low'
                          ? 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200'
                          : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                      )}
                    >
                      {slot.smogRisk === 'unavailable'
                        ? 'Risk Unavailable'
                        : isDemo
                        ? `Illustrative: ${slot.smogRisk} Smog`
                        : `${slot.smogRisk} Smog`}
                    </span>

                    {/* Mask Action Badge: strictly suppressed if not canShowActionableDirectives */}
                    {canShowActionableDirectives && slot.requiresMask && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700">
                        <ShieldAlert className="w-3 h-3 text-red-500" />
                        N95 Required
                      </span>
                    )}
                  </div>
                </div>

                {/* Action Content Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs sm:text-sm">
                  {/* Exposure Reduction Box */}
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1">
                    <span className="font-bold text-emerald-700 dark:text-emerald-400 text-xs uppercase tracking-wider block">
                      Personal Lung Exposure Protection
                    </span>
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                      {slot.exposureMitigation}
                    </p>
                  </div>

                  {/* Sustainable Alternative Box */}
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1">
                    <span className="font-bold text-sky-700 dark:text-sky-400 text-xs uppercase tracking-wider block">
                      Community Emission Abatement
                    </span>
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                      {slot.sustainableChoice}
                    </p>
                  </div>
                </div>

                {/* Rationale & Feedback Footer */}
                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs border-t border-slate-100 dark:border-slate-800/80">
                  <div className="flex items-center gap-2 text-slate-500">
                    <span>Science: {slot.scientificRationale}</span>
                    <button
                      onClick={() =>
                        openExplanationModal(
                          `Action Slot [${slot.timeWindow}]: ${slot.activityTitle} — ${slot.recommendedAction}`
                        )
                      }
                      className="p-0.5 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400"
                      title="Inspect AI reasoning and data source for this directive"
                    >
                      <HelpCircle className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Recommendation Feedback */}
                  {isDemo ? (
                    <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 italic">
                      Simulation Walkthrough (Feedback Disabled)
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400">Feasible for you?</span>
                      <button
                        onClick={() => handleFeedback(slot.id, 'helpful')}
                        className={clsx(
                          'p-1.5 rounded-lg border flex items-center gap-1 transition-all text-xs font-semibold',
                          rating === 'helpful'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-400 dark:bg-emerald-950 dark:text-emerald-200'
                            : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                        )}
                      >
                        {rating === 'helpful' ? <Check className="w-3.5 h-3.5" /> : <ThumbsUp className="w-3.5 h-3.5" />}
                        <span>Helpful</span>
                      </button>

                      <button
                        onClick={() => handleFeedback(slot.id, 'unfeasible')}
                        className={clsx(
                          'p-1.5 rounded-lg border flex items-center gap-1 transition-all text-xs font-semibold',
                          rating === 'unfeasible'
                            ? 'bg-red-100 text-red-800 border-red-400 dark:bg-red-950 dark:text-red-200'
                            : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                        )}
                      >
                        <ThumbsDown className="w-3.5 h-3.5" />
                        <span>Unfeasible</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Indoor Environmental Protocols (Gated strictly on verified, fresh, live telemetry) */}
      <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm">
            <Wind className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <span>Indoor Environmental & Filtration Protocols</span>
          </div>
          <span className={clsx(
            'text-[11px] font-bold px-2.5 py-0.5 rounded-full border',
            plan.indoorProtocols.ventilationStatus === 'favorable'
              ? 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200'
              : plan.indoorProtocols.ventilationStatus === 'restricted'
              ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200'
              : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
          )}>
            {plan.indoorProtocols.ventilationStatus === 'favorable'
              ? 'Targeted Cross-Ventilation Acceptable'
              : plan.indoorProtocols.ventilationStatus === 'restricted'
              ? 'Natural Ventilation Restricted'
              : 'Telemetry Insufficient'}
          </span>
        </div>

        <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {plan.indoorProtocols.ventilationReason}
        </p>

        <div className="p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-900 dark:text-rose-200 font-semibold leading-relaxed">
          {plan.indoorProtocols.bannedPracticesWarning}
        </div>
      </div>
    </div>
  );
};
