import React from 'react';
import { useAppStore } from '../../stores/useAppStore';
import { useAirQualityQuery } from '../../hooks/useAirQualityQuery';
import { MOCK_LOCATIONS } from '../../services/mockData';
import { getAQIMetadata } from '../../utils/aqiUtils';
import {
  evaluateCommuteAlternatives,
  CommuteMode
} from '../../utils/alternativesUtils';
import {
  Compass,
  ShieldAlert,
  Leaf,
  Train,
  Bike,
  Bus,
  Car,
  Navigation,
  Info,
  AlertTriangle,
  Check,
  Clock,
  Radio,
  RefreshCw,
  Footprints,
  ShieldCheck
} from 'lucide-react';
import { Badge } from '../../components/common/Badge';
import clsx from 'clsx';

export const AlternativesPage: React.FC = () => {
  const { currentLocationId, userPreferences } = useAppStore();

  const {
    data: queryResult,
    isLoading,
    isError,
    error,
    refetch,
  } = useAirQualityQuery();

  const aqData = queryResult?.data;
  const isLive = queryResult?.isLive ?? false;

  const currentLocObj =
    MOCK_LOCATIONS.find((loc) => loc.id === currentLocationId) ||
    (userPreferences?.defaultLocation
      ? {
          id: currentLocationId,
          name: userPreferences.defaultLocation.name,
        }
      : MOCK_LOCATIONS[0]);

  const evaluationResult = evaluateCommuteAlternatives(aqData, isLive);
  const { provenance } = evaluationResult;

  // Provenance badge styling
  const isObservation =
    provenance.tag === 'Live Sensor' || provenance.tag === 'Stale Sensor';
  const isModelled =
    provenance.tag === 'Modelled' || provenance.tag === 'Stale Modelled';
  const isDemo = provenance.tag === 'Demo';

  let provenanceBadgeClass =
    'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700';
  let badgeLabel = 'Unverified Telemetry';

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
  const aqiMeta = getAQIMetadata(isValidAqi && evaluationResult.isLiveVerified ? aqData?.aqi : null);
  const { category } = aqiMeta;

  // Master verdict badge styling
  const isInsufficient = evaluationResult.status === 'telemetry_insufficient';
  const isElevated = evaluationResult.status === 'elevated_exposure_risk';
  const isModerate = evaluationResult.status === 'moderate_exposure_risk';

  const masterVerdictClass = clsx(
    'flex items-center gap-2.5 p-3 rounded-xl border',
    isInsufficient
      ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
      : isElevated
      ? 'bg-red-100 dark:bg-red-950/60 border-red-300 dark:border-red-800 text-red-950 dark:text-red-200'
      : isModerate
      ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200'
      : 'bg-emerald-100 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200'
  );

  const getModeIcon = (mode: CommuteMode) => {
    switch (mode) {
      case 'metro':
        return Train;
      case 'private_car':
        return Car;
      case 'bus':
        return Bus;
      case 'cng_auto':
        return Navigation;
      case 'two_wheeler':
        return Navigation;
      case 'bicycle':
        return Bike;
      case 'walking':
        return Footprints;
      default:
        return Navigation;
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header & Master Telemetry Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
              Sustainable Commute & Exposure Trade-Offs
            </h1>
            <Badge
              variant={
                isInsufficient
                  ? 'neutral'
                  : isElevated
                  ? 'danger'
                  : isModerate
                  ? 'warning'
                  : 'success'
              }
              icon={Leaf}
              size="sm"
            >
              Commute Guidance ({badgeLabel})
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {evaluationResult.isLiveVerified && isValidAqi
              ? `Balancing personal respiratory health against transit emissions under verified conditions (${currentLocObj.name} • AQI: ${aqData?.aqi})`
              : `Educational commute trade-off framework (${currentLocObj.name} • Real-time outdoor telemetry unverified)`}
          </p>
        </div>

        {/* Master Commute Recommendation Verdict */}
        <div className={masterVerdictClass} data-testid="master-alternatives-verdict">
          {isInsufficient ? (
            <Clock className="w-5 h-5 shrink-0 text-current" />
          ) : isElevated ? (
            <AlertTriangle className="w-5 h-5 shrink-0 text-current" />
          ) : isModerate ? (
            <Info className="w-5 h-5 shrink-0 text-current" />
          ) : (
            <Check className="w-5 h-5 shrink-0 text-current" />
          )}
          <div>
            <span className="text-xs font-extrabold uppercase tracking-wider block">
              Commute Recommendation
            </span>
            <span className="text-xs font-semibold">{evaluationResult.verdictTitle}</span>
          </div>
        </div>
      </div>

      {/* Loading State Banner */}
      {isLoading && (
        <div
          data-testid="alternatives-loading"
          className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse text-xs text-slate-600 dark:text-slate-400"
        >
          <span className="w-3 h-3 rounded-full bg-slate-400 animate-ping" />
          <span>Loading outdoor ambient telemetry and verifying data freshness...</span>
        </div>
      )}

      {/* Error State Banner */}
      {isError && (
        <div
          data-testid="alternatives-error"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Telemetry connection offline ({error?.message || 'Failed to fetch ambient data'}). Operating in fail-closed mode: real-time condition-dependent commute recommendations are suspended.
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
              Outdoor Ambient Telemetry • Not an In-Cabin Sensor
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
          {evaluationResult.outdoorDisclosure}
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
              {evaluationResult.pm25Concentration !== null
                ? `${evaluationResult.pm25Concentration} µg/m³`
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
              {evaluationResult.pm10Concentration !== null
                ? `${evaluationResult.pm10Concentration} µg/m³`
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

      {/* Critical Core Philosophy: Personal Exposure vs. Environmental Emissions */}
      <section className="p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-teal-950/70 via-slate-900 to-slate-950 text-white space-y-3 border border-teal-800/40 shadow-md">
        <h3 className="font-bold text-base text-teal-300 flex items-center gap-2">
          <Compass className="w-5 h-5" />
          <span>The Core Dilemma: Personal Exposure vs. Environmental Emissions</span>
        </h3>
        <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
          In elevated pollution conditions, choices with low environmental emissions (such as cycling or walking along busy corridors) can increase individual particulate inhalation because physical exertion elevates breathing rate and inhaled air volume. BreatheWise AI highlights transport alternatives—such as <strong>electric rail transit (Metro)</strong>—that provide <strong>greater separation from street-level vehicle exhaust</strong> while maintaining <strong>low operational emissions</strong>.
        </p>
        <div className="p-3 rounded-xl bg-teal-950/50 border border-teal-700/40 text-[11px] text-teal-200 leading-relaxed">
          <strong>Important Distinction:</strong> Reducing personal inhaled pollution exposure is not the same as reducing vehicular greenhouse gas emissions. An enclosed vehicle with cabin air filtration and recirculation may reduce in-cabin particulate ingress, but contributes to roadway congestion and vehicle emissions. Conversely, active cycling produces zero tailpipe emissions, but active exertion along congested roads increases overall particulate inhalation. Emissions categories are broad illustrative classifications, not route-specific carbon accounting.
        </div>
      </section>

      {/* Commute Status Explanation */}
      <section className="p-4 sm:p-5 rounded-xl bg-slate-100/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-2">
        <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
          <Info className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Commute Evaluation Summary</span>
        </div>
        <p className="leading-relaxed" data-testid="alternatives-explanation">
          {evaluationResult.explanation}
        </p>
      </section>

      {/* Multi-Modal Commute Matrix */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Multi-Modal Commute Comparison
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {evaluationResult.isLiveVerified
              ? 'Contextualized with verified ambient telemetry'
              : 'Educational Framework • Telemetry Insufficient'}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
          <strong>Illustrative Emissions Context:</strong> Emissions categories (Very Low, Low, Moderate, High) reflect broad illustrative groupings based on typical passenger transit modes, not measured journey calculations. Actual emissions vary with vehicle powertrain, occupancy rate, fuel/grid source, vehicle condition, and journey characteristics. Personal inhalation exposure is distinct from vehicular emissions.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {evaluationResult.modes.map((item) => {
            const Icon = getModeIcon(item.mode);
            const hasLiveVerdict = evaluationResult.isLiveVerified && item.liveVerdict !== null;

            return (
              <div
                key={item.mode}
                className={clsx(
                  'p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-4',
                  hasLiveVerdict && item.mode === 'metro'
                    ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-500 shadow-md ring-1 ring-emerald-500/20'
                    : hasLiveVerdict && (item.mode === 'two_wheeler' || item.mode === 'cng_auto') && isElevated
                    ? 'bg-red-50/30 dark:bg-red-950/20 border-red-300 dark:border-red-900'
                    : 'bg-white dark:bg-[#131B2E] border-slate-200 dark:border-slate-800 shadow-sm'
                )}
                data-testid={`commute-card-${item.mode}`}
              >
                <div>
                  {/* Mode Header */}
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={clsx(
                          'p-2 rounded-xl',
                          hasLiveVerdict && item.mode === 'metro'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        )}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                          {item.displayName}
                        </h4>
                        <span className="text-[11px] text-slate-500">{item.category}</span>
                      </div>
                    </div>

                    <span
                      className={clsx(
                        'text-xs font-semibold px-2 py-0.5 rounded-full border',
                        item.emissionCategory === 'Very Low'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200'
                          : item.emissionCategory === 'Low'
                          ? 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950 dark:text-teal-200'
                          : item.emissionCategory === 'Moderate'
                          ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200'
                          : 'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950 dark:text-rose-200'
                      )}
                    >
                      {item.emissionCategory} Emissions (Illustrative)
                    </span>
                  </div>

                  {/* Dual Factor Cards */}
                  <div className="my-3 space-y-2 text-xs">
                    {/* Environmental Impact */}
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px] block">
                        Environmental Emissions Category (Illustrative)
                      </span>
                      <p className="text-slate-700 dark:text-slate-300 mt-0.5 leading-relaxed">
                        {item.environmentalImpact}
                      </p>
                    </div>

                    {/* Personal Respiratory Exposure */}
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px] block">
                        Personal Exposure Factors
                      </span>
                      <p className="text-slate-700 dark:text-slate-300 mt-0.5 leading-relaxed">
                        {item.exposureFactors}
                      </p>
                    </div>

                    {/* Live Condition-Dependent Guidance (if live verified) */}
                    {hasLiveVerdict && item.liveGuidance && (
                      <div className="p-2.5 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-950 dark:text-emerald-200">
                        <span className="font-bold uppercase tracking-wider text-[10px] block text-emerald-700 dark:text-emerald-400">
                          Live Contextual Advice
                        </span>
                        <p className="mt-0.5 leading-relaxed text-[11px]">{item.liveGuidance}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Verdict Badge */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  {hasLiveVerdict ? (
                    <span
                      className={clsx(
                        'text-xs font-bold px-2.5 py-1 rounded-lg border',
                        item.mode === 'metro'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : isElevated && (item.mode === 'two_wheeler' || item.mode === 'cng_auto')
                          ? 'bg-rose-600 text-white border-rose-600'
                          : 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700'
                      )}
                      data-testid={`verdict-badge-${item.mode}`}
                    >
                      {item.liveVerdict}
                    </span>
                  ) : (
                    <span
                      className="text-[11px] font-medium text-slate-500 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                      data-testid={`verdict-badge-${item.mode}`}
                    >
                      Educational Comparison
                    </span>
                  )}

                  {item.respiratorRecommended && evaluationResult.isLiveVerified && (
                    <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                      <ShieldAlert className="w-3.5 h-3.5" />
                      N95 Respirator Advised
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Real-World Determinants of Commute Exposure Section */}
      <section className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white">
            Real-World Factors Governing In-Transit Exposure
          </h3>
        </div>

        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          In-transit particulate exposure is microenvironmental and cannot be described by a single static multiplier. Real-world exposure is governed by the interaction of vehicle enclosure, traffic proximity, breathing ventilation rate, and travel duration:
        </p>

        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-600 dark:text-slate-400">
          {evaluationResult.exposureDeterminants.map((det, idx) => (
            <li
              key={idx}
              className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 flex items-start gap-2.5"
            >
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">•</span>
              <span className="leading-relaxed">{det}</span>
            </li>
          ))}
        </ul>

        <p className="text-[11px] text-slate-500 italic pt-2 border-t border-slate-100 dark:border-slate-800">
          * Notice: Demonstrating educational decision-support framework for {currentLocObj.name}. All environmental metrics represent ambient station monitoring; BreatheWise AI does not claim private vehicle sensor integration or live route navigation.
        </p>
      </section>
    </div>
  );
};
