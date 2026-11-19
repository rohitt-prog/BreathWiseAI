import React, { useMemo } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import { MOCK_LOCATIONS } from '../../services/mockData';
import { useAirQualityQuery } from '../../hooks/useAirQualityQuery';
import { getAQIMetadata } from '../../utils/aqiUtils';
import {
  evaluateIndoorVentilation,
  getPurifierGuidance,
  getSourceControlProtocols
} from '../../utils/indoorUtils';
import {
  Home,
  AlertOctagon,
  Sparkles,
  XCircle,
  Check,
  Info,
  Wind,
  Radio,
  Clock,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { Badge } from '../../components/common/Badge';
import clsx from 'clsx';

interface VentilationDecisionTier {
  category: string;
  range: string;
  actionTitle: string;
  householdGuidance: string;
}

const NAQI_VENTILATION_DECISION_TABLE: VentilationDecisionTier[] = [
  {
    category: 'Good',
    range: '0–50',
    actionTitle: 'Conditional Natural Ventilation Consideration',
    householdGuidance:
      'Outdoor air is relatively cleaner; conditional airing may be evaluated to refresh indoor air and dilute indoor-generated pollutants. Any ventilation decision must consider immediate outdoor conditions (such as localized smoke, dust, or pollen) and indoor air needs; low AQI alone does not mandate opening windows, and windows should not be opened automatically.'
  },
  {
    category: 'Satisfactory',
    range: '51–100',
    actionTitle: 'Conditional Airing Consideration',
    householdGuidance:
      'Periodic cross-ventilation may be evaluated if indoor air is stuffy, balanced against localized outdoor sources. Ventilation decisions must consider immediate outdoor conditions (such as nearby traffic exhaust, street dust, or biomass burning) alongside indoor air needs; do not open windows automatically based on AQI alone.'
  },
  {
    category: 'Moderate',
    range: '101–200',
    actionTitle: 'Selective Airing Consideration',
    householdGuidance:
      'Brief, controlled airing may be evaluated if indoor carbon dioxide or moisture is elevated. Any ventilation decision must consider immediate outdoor conditions (such as street proximity, wind direction, and traffic) alongside indoor air needs; continuous open windows are not recommended.'
  },
  {
    category: 'Poor',
    range: '201–300',
    actionTitle: 'Limit Unnecessary Infiltration',
    householdGuidance:
      'Minimize opening exterior windows and doors to limit particulate infiltration. Manage indoor air quality through continuous mechanical filtration (HEPA recirculation) and active kitchen exhaust during cooking.'
  },
  {
    category: 'Very Poor',
    range: '301–400',
    actionTitle: 'Restrict Outdoor Air Infiltration',
    householdGuidance:
      'Households should generally keep exterior windows and balcony doors closed to limit particulate infiltration, while also managing indoor-generated pollutants through appropriate kitchen exhaust and indoor filtration in recirculation mode.'
  },
  {
    category: 'Severe',
    range: '401–500',
    actionTitle: 'Strictly Restrict Infiltration',
    householdGuidance:
      'Households should generally keep exterior windows and doors closed to limit heavy particulate infiltration, while actively managing indoor-generated pollutants through appropriate kitchen exhaust and continuous indoor filtration.'
  }
];

export const IndoorAirPage: React.FC = () => {
  const { currentLocationId, selectedLocation } = useAppStore();
  const currentLocObj =
    (selectedLocation && selectedLocation.id === currentLocationId ? selectedLocation : null) ||
    MOCK_LOCATIONS.find((l) => l.id === currentLocationId) ||
    MOCK_LOCATIONS[0];

  const { data: telemetry, isLoading, isError, error, refetch } = useAirQualityQuery();

  const isLive = !isError && Boolean(telemetry?.isLive);
  const aqData = telemetry?.data ?? null;

  const ventilationResult = useMemo(
    () => evaluateIndoorVentilation(aqData, isLive),
    [aqData, isLive]
  );

  const purifierGuidance = useMemo(
    () => getPurifierGuidance(ventilationResult.pm25Concentration, ventilationResult.isLiveVerified),
    [ventilationResult.pm25Concentration, ventilationResult.isLiveVerified]
  );

  const sourceControlTips = useMemo(() => getSourceControlProtocols(), []);

  // Provenance metadata & badges
  const provenance = ventilationResult.provenance;
  const isObservation = provenance.tag === 'Live Sensor' || provenance.tag === 'Stale Sensor';
  const isModelled = provenance.tag === 'Modelled' || provenance.tag === 'Stale Modelled';
  const isDemo = provenance.tag === 'Demo';

  let provenanceBadgeClass =
    'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700';
  let badgeLabel = provenance.statusLabel;

  if (provenance.tag === 'Live Sensor') {
    provenanceBadgeClass =
      'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';
    badgeLabel = 'Live Ground Sensor';
  } else if (provenance.tag === 'Stale Sensor') {
    provenanceBadgeClass =
      'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-300 border-rose-300 dark:border-rose-800';
    badgeLabel = 'Stale Ground Sensor';
  } else if (provenance.tag === 'Modelled') {
    provenanceBadgeClass =
      'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-300 border-sky-300 dark:border-sky-800';
    badgeLabel = 'Regional Atmospheric Model';
  } else if (provenance.tag === 'Stale Modelled') {
    provenanceBadgeClass =
      'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-800';
    badgeLabel = 'Stale Atmospheric Model';
  } else if (provenance.tag === 'Demo') {
    provenanceBadgeClass =
      'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-800';
    badgeLabel = 'Simulated Demo';
  } else if (provenance.tag === 'Unverified') {
    provenanceBadgeClass =
      'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700';
    badgeLabel = 'Unverified Telemetry';
  }

  const providerText =
    aqData?.provenance?.sourceAttribution ||
    (isModelled
      ? 'Regional Atmospheric Chemistry Model'
      : isObservation
      ? 'Ground Monitoring Station'
      : isDemo
      ? 'Curated Demonstration Scenario'
      : 'Unverified Provider');

  // Validate AQI: finite, non-negative, and within official NAQI range [0, 500]
  const isValidAqi =
    typeof aqData?.aqi === 'number' &&
    Number.isFinite(aqData.aqi) &&
    aqData.aqi >= 0 &&
    aqData.aqi <= 500;

  // Gate NAQI category metadata: strictly Unavailable if unverified, demo, stale, unknown, or invalid AQI
  const aqiMeta = getAQIMetadata(isValidAqi && ventilationResult.isLiveVerified ? aqData?.aqi : null);
  const { category } = aqiMeta;

  // Gate Current tier highlight in reference table: strictly null if unverified, demo, stale, unknown, or invalid
  const currentHighlightTier =
    ventilationResult.isLiveVerified && isValidAqi && category !== 'Unavailable'
      ? category
      : null;

  // Master verdict badge styling
  const isInsufficient = ventilationResult.status === 'telemetry_insufficient';
  const isRestricted = ventilationResult.status === 'restricted';
  const isSelective = ventilationResult.status === 'selective';

  const masterVerdictClass = clsx(
    'flex items-center gap-2.5 p-3 rounded-xl border',
    isInsufficient
      ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
      : isRestricted
      ? 'bg-red-100 dark:bg-red-950/60 border-red-300 dark:border-red-800 text-red-950 dark:text-red-200'
      : isSelective
      ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200'
      : 'bg-emerald-100 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200'
  );

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Page Title & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
              Indoor Air Quality Assistant
            </h1>
            <Badge
              variant={
                isInsufficient
                  ? 'neutral'
                  : isRestricted
                  ? 'danger'
                  : isSelective
                  ? 'warning'
                  : 'success'
              }
              icon={Home}
              size="sm"
            >
              Residential Guidance ({badgeLabel})
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {ventilationResult.isLiveVerified && isValidAqi
              ? `Adapting residential ventilation and filtration to verified ambient outdoor conditions (AQI: ${aqData?.aqi} • ${category})`
              : 'Residential ventilation and filtration framework (Real-time outdoor telemetry unverified)'}
          </p>
        </div>

        {/* Master Ventilation Verdict */}
        <div className={masterVerdictClass} data-testid="master-ventilation-verdict">
          {isInsufficient ? (
            <Clock className="w-5 h-5 shrink-0 text-current" />
          ) : isRestricted ? (
            <XCircle className="w-5 h-5 shrink-0 text-current" />
          ) : isSelective ? (
            <AlertTriangle className="w-5 h-5 shrink-0 text-current" />
          ) : (
            <Check className="w-5 h-5 shrink-0 text-current" />
          )}
          <div>
            <span className="text-xs font-extrabold uppercase tracking-wider block">
              Ventilation Recommendation
            </span>
            <span className="text-xs font-semibold">{ventilationResult.verdictTitle}</span>
          </div>
        </div>
      </div>

      {/* Loading State Banner */}
      {isLoading && (
        <div
          data-testid="indoor-loading"
          className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse text-xs text-slate-600 dark:text-slate-400"
        >
          <span className="w-3 h-3 rounded-full bg-slate-400 animate-ping" />
          <span>Loading outdoor ambient telemetry and verifying data freshness...</span>
        </div>
      )}

      {/* Error State Banner */}
      {isError && (
        <div
          data-testid="indoor-error"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Telemetry connection offline ({error?.message || 'Failed to fetch ambient data'}). Operating in fail-closed mode: real-time condition-dependent ventilation directives are suspended.
            </span>
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-200 dark:bg-amber-900 hover:bg-amber-300 text-amber-950 dark:text-amber-100 font-semibold transition-colors self-start sm:self-auto"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Outdoor Ambient Telemetry Disclosure Card */}
      <section className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="font-bold text-sm text-slate-900 dark:text-white">
              Outdoor Ambient Telemetry • Not an Indoor Sensor
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={clsx('text-[11px] font-semibold px-2.5 py-0.5 rounded-full border', provenanceBadgeClass)}
              data-testid="telemetry-provenance-badge"
            >
              {badgeLabel}
            </span>
          </div>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          {ventilationResult.outdoorDisclosure}
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 block">
              Outdoor PM2.5
            </span>
            <span
              className="text-base sm:text-lg font-mono font-extrabold text-slate-900 dark:text-slate-100"
              data-testid="outdoor-pm25"
            >
              {ventilationResult.pm25Concentration !== null
                ? `${ventilationResult.pm25Concentration} µg/m³`
                : '--'}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 block">
              Outdoor PM10
            </span>
            <span
              className="text-base sm:text-lg font-mono font-extrabold text-slate-900 dark:text-slate-100"
              data-testid="outdoor-pm10"
            >
              {ventilationResult.pm10Concentration !== null
                ? `${ventilationResult.pm10Concentration} µg/m³`
                : '--'}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 block">
              Official NAQI
            </span>
            <span
              className="text-base sm:text-lg font-mono font-extrabold text-slate-900 dark:text-slate-100"
              data-testid="outdoor-aqi"
            >
              {isValidAqi ? aqData?.aqi : 'Unavailable'}
            </span>
            <span
              className="text-[10px] text-slate-600 dark:text-slate-400 block truncate"
              data-testid="outdoor-aqi-category"
            >
              {category}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 block">
              Station / Provider
            </span>
            <span
              className="text-xs font-semibold text-slate-900 dark:text-slate-100 block truncate"
              title={currentLocObj.name}
            >
              {currentLocObj.name.split(',')[0]}
            </span>
            <span
              className="text-[10px] text-slate-600 dark:text-slate-400 block truncate"
              title={providerText}
              data-testid="provider-attribution"
            >
              {providerText}
            </span>
          </div>
        </div>
      </section>

      {/* Household Ventilation Context Framework & Decision Table */}
      <section className="p-4 sm:p-5 rounded-xl bg-slate-100/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-4">
        <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
          <Info className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Household Ventilation Framework: Outdoor Levels vs. Indoor Sources</span>
        </div>
        <p className="leading-relaxed" data-testid="ventilation-explanation">
          {ventilationResult.explanation}
        </p>
        <p className="leading-relaxed text-slate-500 dark:text-slate-400">
          Outdoor AQI is an important indicator, but it is not a universally sufficient decision rule by itself. Any ventilation decision must consider immediate outdoor conditions and indoor air needs; healthy indoor air requires balancing outdoor infiltration against indoor-generated pollutants (cooking emissions, accumulated carbon dioxide, and fine dust). Do not automatically recommend opening windows based solely on an AQI number.
        </p>

        {/* Ventilation Decision Reference Table */}
        <div className="space-y-2 pt-1">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wider">
              Educational Household Ventilation Reference Framework
            </h4>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              General educational framework across 6 NAQI tiers • Not official CPCB protocol
            </span>
          </div>

          {currentHighlightTier === null ? (
            <div
              className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-2"
              data-testid="no-current-tier-notice"
            >
              <Info className="w-4 h-4 text-slate-500 shrink-0" />
              <span>
                <strong>Educational Reference Only:</strong> Real-time ambient telemetry is unverified, stale, simulated, or unavailable. No row in this reference table represents your current condition.
              </span>
            </div>
          ) : (
            <div
              className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-[11px] text-emerald-900 dark:text-emerald-200 flex items-center gap-2"
              data-testid="current-tier-notice"
            >
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                <strong>Verified Ambient Telemetry:</strong> Highlighting category &ldquo;{currentHighlightTier}&rdquo; based on verified real-time ambient telemetry.
              </span>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
            <table className="w-full text-left text-xs border-collapse">
              <caption className="sr-only">General Educational Household Ventilation Framework across NAQI Tiers</caption>
              <thead className="bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th scope="col" className="p-2.5 sm:p-3">NAQI Category</th>
                  <th scope="col" className="p-2.5 sm:p-3">AQI Range</th>
                  <th scope="col" className="p-2.5 sm:p-3">Ventilation Consideration</th>
                  <th scope="col" className="p-2.5 sm:p-3">Household Decision Rule (Non-Universal)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-[#131B2E]">
                {NAQI_VENTILATION_DECISION_TABLE.map((tier) => {
                  const isCurrentTier = currentHighlightTier !== null && tier.category === currentHighlightTier;
                  return (
                    <tr
                      key={tier.category}
                      className={clsx(
                        'transition-colors',
                        isCurrentTier
                          ? 'bg-emerald-50/70 dark:bg-emerald-950/30 font-medium'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      )}
                    >
                      <td className="p-2.5 sm:p-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900 dark:text-slate-100">{tier.category}</span>
                          {isCurrentTier && (
                            <span
                              className="text-[10px] bg-emerald-600 text-white font-bold px-1.5 py-0.5 rounded-full"
                              data-testid="current-naqi-badge"
                            >
                              Current
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-2.5 sm:p-3 whitespace-nowrap font-mono text-slate-700 dark:text-slate-300">
                        {tier.range}
                      </td>
                      <td className="p-2.5 sm:p-3 text-slate-900 dark:text-slate-100 font-semibold">
                        {tier.actionTitle}
                      </td>
                      <td className="p-2.5 sm:p-3 text-slate-600 dark:text-slate-400 leading-relaxed min-w-[240px]">
                        {tier.householdGuidance}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-[11px] text-slate-500 italic pt-1 border-t border-slate-200/60 dark:border-slate-800">
          * Educational Framework Notice: This household ventilation matrix is an educational decision-support framework and is not an official CPCB-published ventilation protocol. Demonstrating informational principles for {currentLocObj.name}. It does not constitute clinical or personalized medical advice.
        </p>
      </section>

      {/* Critical Safety Rule: Banned Ozone Generators */}
      <section className="p-5 sm:p-6 rounded-2xl bg-red-950/20 border-2 border-red-600/70 text-red-950 dark:text-red-100 space-y-2 shadow-sm">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold text-sm sm:text-base">
          <AlertOctagon className="w-5 h-5 shrink-0" />
          <span>STRICT AIR SAFETY DIRECTIVE: Ozone Air Cleaners Banned</span>
        </div>
        <p className="text-xs sm:text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          {purifierGuidance.ozoneWarning}
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          * BreatheWise AI adheres strictly to Central Pollution Control Board and US EPA guidelines. Only mechanical HEPA filtration and activated carbon absorption are safe for occupied residential spaces. Never use ozone generators or ionizing air cleaners in occupied rooms.
        </p>
      </section>

      {/* Mechanical Filtration & Air Purifier Guidance Section */}
      <section className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Wind className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white">
              Mechanical Air Filtration & Purifier Operation
            </h3>
          </div>
          <span
            className={clsx(
              'text-xs font-semibold px-2.5 py-1 rounded-full border',
              purifierGuidance.isConditionDependent
                ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
            )}
            data-testid="purifier-mode-badge"
          >
            {purifierGuidance.mode || 'Educational Baseline (General Principles)'}
          </span>
        </div>

        <p
          className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed"
          data-testid="purifier-advice"
        >
          {purifierGuidance.operationalAdvice}
        </p>

        <div className="pt-2 space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 block">
            Real-World Factors Affecting Purifier Effectiveness:
          </span>
          <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
            {purifierGuidance.effectivenessFactors.map((factor, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">•</span>
                <span>{factor}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Room-by-Room Optimization Protocols */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
            Room-by-Room Best Practices (Educational Framework)
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            General household measures • Independent of live telemetry
          </span>
        </div>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Living Room */}
          <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h4 className="font-bold text-slate-900 dark:text-white text-base">Living Room / Hall</h4>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Primary Hub</span>
            </div>

            <div className="space-y-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              <div>
                <span className="font-semibold text-slate-900 dark:text-white block">
                  Purifier Operation & Filter Maintenance:
                </span>
                <p>
                  General Principle: Mechanical purifiers operate via fibrous physical filtration. Pre-filters and HEPA cartridges should be inspected and serviced according to manufacturer instructions. Ensure device intake and exhaust grilles remain unobstructed to permit effective air circulation throughout the space.
                </p>
              </div>
              <div>
                <span className="font-semibold text-slate-900 dark:text-white block">
                  Infiltration Management:
                </span>
                <p>
                  General Infiltration Principle: Infiltration rates through exterior doors and windows influence indoor particulate concentrations. In clean ambient conditions, natural ventilation can be evaluated; during elevated outdoor pollution, reducing unmanaged infiltration protects indoor air.
                </p>
              </div>
            </div>
          </div>

          {/* Kitchen */}
          <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h4 className="font-bold text-slate-900 dark:text-white text-base">Kitchen & Cooking</h4>
              <span className="text-xs font-bold text-amber-600 dark:text-amber-400">Indoor Emissions Source</span>
            </div>

            <div className="space-y-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              <div>
                <span className="font-semibold text-slate-900 dark:text-white block">
                  Stove Types & Combustion Byproducts:
                </span>
                <p>
                  <strong>Gas cooking</strong> produces combustion-related byproducts, including nitrogen dioxide (NO2) and carbon monoxide. <strong>Electric and induction cooktops</strong> do not produce combustion-related NO2, but all cooking—especially high-temperature frying—generates fine airborne oil particles and smoke.
                </p>
              </div>
              <div>
                <span className="font-semibold text-slate-900 dark:text-white block">Kitchen Exhaust:</span>
                <p>
                  Always operate an active kitchen chimney hood or external exhaust fan during cooking, regardless of stove type. Keep interior doors closed to prevent cooking aerosols from spreading into sleeping areas.
                </p>
              </div>
            </div>
          </div>

          {/* Bedroom */}
          <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h4 className="font-bold text-slate-900 dark:text-white text-base">Bedroom & Sleep</h4>
              <span className="text-xs font-bold text-sky-600 dark:text-sky-400">Recovery Sanctuary</span>
            </div>

            <div className="space-y-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              <div>
                <span className="font-semibold text-slate-900 dark:text-white block">Night Protocol:</span>
                <p>
                  General Night Practice: Run clean air filtration in the bedroom prior to and during sleep. Avoid burning mosquito coils or incense, which produce heavy indoor particulate loads.
                </p>
              </div>
              <div>
                <span className="font-semibold text-slate-900 dark:text-white block">Surface Cleaning:</span>
                <p>
                  Damp mop or wipe hard surfaces rather than dry sweeping to prevent re-suspending settled dust into the breathing zone.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Practical Household Mitigation Measures (Non-Electrical) */}
      <section className="p-6 sm:p-7 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-emerald-600" />
          <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white">
            Practical Household Mitigation Measures (Non-Electrical)
          </h3>
        </div>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          Supplemental actions to limit particle entry and internal particle generation:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          {sourceControlTips.map((tip, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800"
            >
              <div className="p-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 mt-0.5 shrink-0">
                <Check className="w-3.5 h-3.5" />
              </div>
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                  {tip.title}
                </span>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-snug">
                  {tip.guidance}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                  {tip.rationale}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
