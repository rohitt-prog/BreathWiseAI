import React from 'react';
import { MOCK_DAILY_PLAN, MOCK_AIR_QUALITY_DATA } from '../../services/mockData';
import { useAppStore } from '../../stores/useAppStore';
import { getAQIMetadata } from '../../utils/aqiUtils';
import {
  Home,
  AlertOctagon,
  Sparkles,
  XCircle,
  Check,
  Info
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
  const { currentLocationId } = useAppStore();
  const aqData = MOCK_AIR_QUALITY_DATA[currentLocationId] || MOCK_AIR_QUALITY_DATA['del_anand_vihar'];
  const indoor = MOCK_DAILY_PLAN.indoorProtocols;

  // Utilize official Indian NAQI categories from existing utility (0-50, 51-100, 101-200, 201-300, 301-400, 401-500)
  const aqiMeta = getAQIMetadata(aqData.aqi);
  const { category, range } = aqiMeta;

  const isSevereOrVeryPoor = category === 'Very Poor' || category === 'Severe';
  const isPoor = category === 'Poor';
  const isModerate = category === 'Moderate';
  const isUnavailable = category === 'Unavailable';

  const ventilationTitle = isSevereOrVeryPoor
    ? 'RESTRICT OUTDOOR AIR INFILTRATION'
    : isPoor
    ? 'LIMIT UNNECESSARY INFILTRATION'
    : isModerate
    ? 'SELECTIVE VENTILATION CONSIDERATION'
    : 'CONDITIONAL VENTILATION CONSIDERATION';

  const ventilationGuidance = isSevereOrVeryPoor
    ? `Ambient air is currently in the ${category} category (${range}). Households should generally keep exterior windows closed to limit particulate infiltration, while also managing indoor-generated pollutants through appropriate kitchen exhaust and indoor filtration in recirculation mode.`
    : isPoor
    ? `Ambient air is currently in the Poor category (201–300). Minimize opening external windows to limit outdoor particulate infiltration, while prioritizing internal air filtration and kitchen exhaust to manage indoor air needs.`
    : isModerate
    ? `Ambient air is in the Moderate category (101–200). Any ventilation decision must consider immediate outdoor conditions (such as street dust, smoke, and traffic) alongside indoor air needs; brief airing may be evaluated if indoor air is stuffy, but do not automatically open windows.`
    : isUnavailable
    ? `Official Indian NAQI is currently unavailable pending certified CPCB ground station connection. Atmospheric chemistry models report ambient conditions. Households should balance outdoor infiltration against indoor air needs (cooking exhaust, internal filtration) and inspect local immediate conditions before opening windows.`
    : `Ambient air is in the ${category} category (${range}). Outdoor air is relatively cleaner; conditional ventilation may be considered to refresh indoor air, but households must evaluate immediate outdoor conditions and indoor air needs rather than automatically opening windows based on AQI alone.`;

  return (
    <div className="space-y-6 sm:space-y-8">

      {/* Page Title & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
              Indoor Air Quality Assistant
            </h1>
            <Badge variant="info" icon={Home} size="sm">
              Residential Guidance (Demo Scenario)
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Adapting residential ventilation and filtration to ambient air conditions (AQI: {aqData.aqi ?? 'Awaiting CPCB'} • {category})
          </p>
        </div>

        {/* Master Ventilation Verdict (Conditional on Indian NAQI Category) */}
        <div className={clsx(
          'flex items-center gap-2.5 p-3 rounded-xl border',
          isSevereOrVeryPoor
            ? 'bg-red-100 dark:bg-red-950/60 border-red-300 dark:border-red-800 text-red-950 dark:text-red-200'
            : isPoor
            ? 'bg-orange-100 dark:bg-orange-950/60 border-orange-300 dark:border-orange-800 text-orange-950 dark:text-orange-200'
            : isModerate
            ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200'
            : 'bg-emerald-100 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200'
        )}>
          <XCircle className="w-5 h-5 shrink-0 text-current" />
          <div>
            <span className="text-xs font-extrabold uppercase tracking-wider block">Ventilation Recommendation</span>
            <span className="text-xs font-semibold">{ventilationTitle}</span>
          </div>
        </div>
      </div>

      {/* Household Ventilation Context Framework & Decision Table (C5-B) */}
      <section className="p-4 sm:p-5 rounded-xl bg-slate-100/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-4">
        <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
          <Info className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Household Ventilation Framework: Outdoor Levels vs. Indoor Sources</span>
        </div>
        <p className="leading-relaxed">
          {ventilationGuidance}
        </p>
        <p className="leading-relaxed text-slate-500 dark:text-slate-400">
          Outdoor AQI is an important indicator, but it is not a universally sufficient decision rule by itself. Any ventilation decision must consider immediate outdoor conditions and indoor air needs; healthy indoor air requires balancing outdoor infiltration against indoor-generated pollutants (cooking emissions, accumulated carbon dioxide, and fine dust). Do not automatically recommend opening windows based solely on an AQI number.
        </p>

        {/* Ventilation Decision Reference Table */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wider">
              Official Indian NAQI Household Ventilation Reference Table
            </h4>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Conditional guidance across all 6 official tiers
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
            <table className="w-full text-left text-xs border-collapse">
              <caption className="sr-only">Official Indian NAQI Household Ventilation Decision Matrix</caption>
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
                  const isCurrentTier = tier.category === category;
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
                            <span className="text-[10px] bg-emerald-600 text-white font-bold px-1.5 py-0.5 rounded-full">
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
          * Notice: Demonstrating simulated scenario for {aqData.station.name}. This guidance is informational and educational; it does not constitute clinical or personalized medical advice.
        </p>
      </section>

      {/* Critical Safety Rule: Banned Ozone Generators (C5-E) */}
      <section className="p-5 sm:p-6 rounded-2xl bg-red-950/20 border-2 border-red-600/70 text-red-950 dark:text-red-100 space-y-2 shadow-sm">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold text-sm sm:text-base">
          <AlertOctagon className="w-5 h-5 shrink-0" />
          <span>STRICT AIR SAFETY DIRECTIVE: Ozone Air Cleaners Banned</span>
        </div>
        <p className="text-xs sm:text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          {indoor.bannedPracticesWarning}
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          * BreatheWise AI adheres strictly to Central Pollution Control Board and US EPA guidelines. Only mechanical HEPA filtration and activated carbon absorption are safe for occupied residential spaces.
        </p>
      </section>

      {/* Room-by-Room Optimization Protocols */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Living Room */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="font-bold text-slate-900 dark:text-white text-base">Living Room / Hall</h3>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Primary Hub</span>
          </div>

          <div className="space-y-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            <div>
              <span className="font-semibold text-slate-900 dark:text-white block">Purifier Operation & Filter Maintenance (C5-D):</span>
              <p>
                Run purifiers in continuous recirculation mode in occupied spaces. Check, clean, or maintain pre-filters according to the manufacturer's instructions. During severe pollution periods, inspect filters more frequently to prevent heavy dust accumulation from restricting airflow to the HEPA media.
              </p>
            </div>
            <div>
              <span className="font-semibold text-slate-900 dark:text-white block">Infiltration Management:</span>
              <p>
                During Very Poor and Severe pollution, households should generally keep exterior doors and windows closed to limit particulate infiltration, while managing indoor air needs with mechanical filtration. When ambient air improves, conditional airing may be evaluated considering immediate outdoor conditions and indoor air needs.
              </p>
            </div>
          </div>
        </div>

        {/* Kitchen (C5-C) */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="font-bold text-slate-900 dark:text-white text-base">Kitchen & Cooking</h3>
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400">Indoor Emissions Source</span>
          </div>

          <div className="space-y-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            <div>
              <span className="font-semibold text-slate-900 dark:text-white block">Stove Types & Combustion Byproducts (C5-C):</span>
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
            <h3 className="font-bold text-slate-900 dark:text-white text-base">Bedroom & Sleep</h3>
            <span className="text-xs font-bold text-sky-600 dark:text-sky-400">Recovery Sanctuary</span>
          </div>

          <div className="space-y-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            <div>
              <span className="font-semibold text-slate-900 dark:text-white block">Night Protocol:</span>
              <p>Run clean air filtration in the bedroom prior to and during sleep. Avoid burning mosquito coils or incense, which produce heavy indoor particulate loads.</p>
            </div>
            <div>
              <span className="font-semibold text-slate-900 dark:text-white block">Surface Cleaning:</span>
              <p>Damp mop or wipe hard surfaces rather than dry sweeping to prevent re-suspending settled dust into the breathing zone.</p>
            </div>
          </div>
        </div>
      </section>

      {/* DIY & Non-Electrical Risk Reduction Checklist */}
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
          {indoor.diyMitigationTips.map((tip, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800"
            >
              <div className="p-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 mt-0.5 shrink-0">
                <Check className="w-3.5 h-3.5" />
              </div>
              <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-snug">
                {tip}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
