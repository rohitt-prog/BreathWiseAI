/**
 * Indoor Air Quality & Ventilation Decision Support Utilities.
 * Authoritative, evidence-grounded rules aligned with backend deterministic safety.
 *
 * Crucial Safety Guarantees:
 * 1. Outdoor ambient telemetry is never represented as an indoor sensor reading.
 * 2. Condition-dependent ventilation recommendations are gated strictly on verified,
 *    fresh live telemetry with valid PM2.5 measurements.
 * 3. Stale, demo, unknown-source, or missing PM2.5 telemetry fails closed to 'telemetry_insufficient'.
 * 4. Never recommends ozone generators or uncertified electronic ionizers under any circumstances.
 * 5. Avoids categorical window-open/close commands; balances outdoor particulate infiltration
 *    against indoor-generated pollutants (cooking, moisture, CO2).
 */
import { CurrentAirQualityData } from '../types/airQuality';
import { determineTelemetryProvenance, ProvenanceDisplayInfo } from './aqiUtils';

export type VentilationStatus =
  | 'telemetry_insufficient'
  | 'restricted'
  | 'selective'
  | 'conditional_favorable';

export interface VentilationDecisionResult {
  status: VentilationStatus;
  verdictTitle: string;
  badgeVariant: 'warning' | 'danger' | 'info' | 'success' | 'neutral';
  explanation: string;
  isLiveVerified: boolean;
  provenance: ProvenanceDisplayInfo;
  pm25Concentration: number | null;
  pm10Concentration: number | null;
  naqiCategory: string;
  outdoorDisclosure: string;
  safeVentilationHours: string[];
}

export interface PurifierGuidance {
  isConditionDependent: boolean;
  mode: string | null;
  operationalAdvice: string;
  effectivenessFactors: string[];
  ozoneWarning: string;
}

export interface SourceControlTip {
  category: string;
  title: string;
  guidance: string;
  rationale: string;
}

/**
 * Validates whether a concentration value is a finite, non-negative number.
 */
export function isValidPollutant(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val >= 0;
}

/**
 * Evaluates ambient outdoor telemetry and derives cautious residential ventilation guidance.
 *
 * Rules:
 * - If telemetry is offline, demo, stale, unverified, or missing PM2.5: returns 'telemetry_insufficient'.
 * - PM2.5 >= 60.0 µg/m³: 'restricted' (Limit outdoor air infiltration; prioritize continuous HEPA and kitchen exhaust).
 * - PM2.5 < 30.0 µg/m³ & non-stagnant: 'conditional_favorable' (Conditional airing consideration; low PM2.5 does not guarantee indoor air quality).
 * - PM2.5 in [30.0, 60.0) or stagnant: 'selective' (Brief cross-ventilation if stuffy; keep closed otherwise).
 */
export function evaluateIndoorVentilation(
  aqData: CurrentAirQualityData | null | undefined,
  isLive: boolean
): VentilationDecisionResult {
  const provenance = determineTelemetryProvenance(aqData?.provenance, isLive);

  const rawPm25 = aqData?.pollutants?.['PM2.5']?.concentration;
  const pm25 = isValidPollutant(rawPm25) ? rawPm25 : null;

  const rawPm10 = aqData?.pollutants?.['PM10']?.concentration;
  const pm10 = isValidPollutant(rawPm10) ? rawPm10 : null;

  const naqiCategory = aqData?.category || 'Unavailable';

  const outdoorDisclosure =
    'All environmental readings shown represent outdoor ambient air quality near the selected station. The assistant does not measure private indoor rooms or fabricate indoor IoT sensor readings.';

  // Check if live verified
  const isDemo = !isLive || provenance.tag === 'Demo' || aqData?.provenance?.dataSource === 'SIMULATED_DEMO';
  const isStale = provenance.isStale;
  const isUnknownSource = provenance.tag === 'Unverified';
  const isLiveVerified = isLive && !isStale && !isDemo && !isUnknownSource;

  // Stagnation evaluation from weather telemetry
  const weather = aqData?.weather;
  const isStagnant =
    weather &&
    (weather.stagnationRisk === 'Elevated' ||
      weather.stagnationRisk === 'Moderate' ||
      weather.dispersionConditions === 'Potentially Unfavorable');

  // GATING: Telemetry Insufficient if unverified or missing PM2.5
  if (!isLiveVerified || pm25 === null) {
    let reason = 'Real-time outdoor air quality telemetry is unavailable.';
    if (isDemo) {
      reason = 'Operating in simulated demonstration mode. Real-time condition-dependent ventilation directives are suspended.';
    } else if (isUnknownSource) {
      reason = 'Outdoor telemetry source is unverified. Current-condition ventilation directives are withheld.';
    } else if (isStale) {
      reason = 'Outdoor ambient telemetry is stale or expired (>180 minutes old). Current-condition ventilation directives are suspended to prevent misguidance.';
    } else if (pm25 === null) {
      reason = 'Outdoor fine particulate (PM2.5) concentration is unavailable. Reliable ventilation assessments require particulate measurements.';
    }

    return {
      status: 'telemetry_insufficient',
      verdictTitle: 'TELEMETRY INSUFFICIENT',
      badgeVariant: 'neutral',
      explanation: `${reason} General educational source-control and HEPA filtration guidance remains active below.`,
      isLiveVerified: false,
      provenance,
      pm25Concentration: pm25,
      pm10Concentration: pm10,
      naqiCategory,
      outdoorDisclosure,
      safeVentilationHours: [],
    };
  }

  // Authoritative risk-aligned ventilation decisions based on live verified PM2.5
  if (pm25 >= 60.0) {
    return {
      status: 'restricted',
      verdictTitle: 'LIMIT OUTDOOR AIR INFILTRATION',
      badgeVariant: 'danger',
      explanation:
        'Outdoor ambient fine particulate levels are elevated (PM2.5 ≥ 60 µg/m³). Households should generally keep exterior windows and balcony doors closed to limit particulate infiltration, while managing indoor air needs through active kitchen range hoods during cooking and continuous mechanical HEPA filtration in recirculation mode. If indoor moisture or CO2 rises, brief 10–15 minute controlled airing may be evaluated.',
      isLiveVerified: true,
      provenance,
      pm25Concentration: pm25,
      pm10Concentration: pm10,
      naqiCategory,
      outdoorDisclosure,
      safeVentilationHours: [],
    };
  }

  if (pm25 < 30.0 && !isStagnant) {
    return {
      status: 'conditional_favorable',
      verdictTitle: 'CONDITIONAL VENTILATION CONSIDERATION',
      badgeVariant: 'success',
      explanation:
        'Outdoor ambient particulate concentrations are relatively low (< 30 µg/m³) with favorable dispersion conditions. Conditional natural ventilation may be evaluated to refresh indoor air and dilute indoor-generated pollutants. However, low outdoor PM2.5 alone does not guarantee good indoor air quality; evaluate immediate local outdoor conditions (such as nearby dust, smoke, or traffic) and indoor air needs before opening windows. Do not open windows automatically based on ambient indices alone.',
      isLiveVerified: true,
      provenance,
      pm25Concentration: pm25,
      pm10Concentration: pm10,
      naqiCategory,
      outdoorDisclosure,
      safeVentilationHours: [],
    };
  }

  // Moderate particulate exposure scenario (PM2.5 in [30.0, 60.0) or stagnation present)
  return {
    status: 'selective',
    verdictTitle: 'SELECTIVE AIRING CONSIDERATION',
    badgeVariant: 'warning',
    explanation:
      'Outdoor ambient particulate concentrations are moderate (30–60 µg/m³) or atmospheric dispersion is restricted. Brief, controlled cross-ventilation (10–15 minutes) may be evaluated if indoor carbon dioxide or moisture is elevated, balanced against localized outdoor sources. Continuous open windows are not recommended; operate kitchen exhaust during cooking and run mechanical HEPA air filtration.',
    isLiveVerified: true,
    provenance,
    pm25Concentration: pm25,
    pm10Concentration: pm10,
    naqiCategory,
    outdoorDisclosure,
    safeVentilationHours: [],
  };
}

/**
 * Returns science-based, practical air purifier guidance.
 * When telemetry is unverified, condition-dependent operating directives are suppressed
 * and neutral educational guidance is presented.
 */
export function getPurifierGuidance(
  pm25: number | null,
  isLiveVerified: boolean
): PurifierGuidance {
  const educationalFactors = [
    'Room Sizing & CADR: Air purifier Clean Air Delivery Rate (CADR) relative to room volume governs air turnover; effectiveness decreases when device capacity is undersized for the space.',
    'Airflow Dynamics & Air Exchange: Mechanical purifiers function by progressive dilution and gradual particulate filtration across the breathing zone rather than instantaneous clearance.',
    'Device Placement & Intake Clearance: Positioning units away from walls, furniture, and heavy curtains allows intake grilles and clean exhaust streams to circulate freely.',
    'Enclosure Air Exchange Rates: Air exchange through open windows or doors alters particulate loading and determines how rapidly conditioned, filtered air is displaced.',
    'Filter Care & Pre-filter Maintenance: Regular inspection and servicing of pre-filters and mechanical HEPA cartridges according to manufacturer instructions prevents dust accumulation from restricting airflow.',
  ];

  const ozoneWarning =
    'STRICT SAFETY DIRECTIVE: Never use ozone generators, "activated oxygen" machines, or uncertified electronic ionizers in occupied residential spaces. Ozone is an acute pulmonary irritant that inflames airways and reacts with indoor organic chemicals to generate secondary ultrafine particles. Only mechanical HEPA filtration and activated carbon absorption are safe for occupied rooms.';

  if (!isLiveVerified || pm25 === null) {
    return {
      isConditionDependent: false,
      mode: null,
      operationalAdvice:
        'HEPA Filtration & Air Cleaning Principles: Mechanical HEPA purifiers filter airborne particulates through fibrous physical media without producing ozone or secondary chemical byproducts. Effective air cleaning depends on matching device Clean Air Delivery Rate (CADR) to room volume, positioning units for unobstructed airflow, maintaining filters per manufacturer specifications, and managing enclosure air exchange. Real-time condition-dependent operating directives, modes, and window adjustments are withheld while outdoor telemetry is unverified.',
      effectivenessFactors: educationalFactors,
      ozoneWarning,
    };
  }

  const isHighOutdoor = pm25 >= 60.0;

  return {
    isConditionDependent: true,
    mode: isHighOutdoor
      ? 'Continuous Recirculation (Elevated Ambient Smog)'
      : 'Baseline Recirculation (Standard Maintenance)',
    operationalAdvice: isHighOutdoor
      ? 'Verified outdoor ambient particulate levels are elevated (PM2.5 ≥ 60 µg/m³). Operate mechanical HEPA air filtration continuously in recirculation mode in occupied rooms, particularly sleeping quarters. Keep exterior windows and doors closed while running to maintain an effective clean-air baseline.'
      : 'Verified outdoor ambient particulate levels are moderate or low (< 60 µg/m³). Operate mechanical HEPA purifiers in continuous recirculation mode in occupied rooms as needed to control indoor-generated particles. Clean or vacuum the pre-filter regularly per manufacturer guidelines to prevent heavy dust accumulation from restricting airflow to the HEPA media.',
    effectivenessFactors: educationalFactors,
    ozoneWarning,
  };
}

/**
 * Returns practical, non-electrical indoor pollution source-control protocols.
 */
export function getSourceControlProtocols(): SourceControlTip[] {
  return [
    {
      category: 'Kitchen & Cooking',
      title: 'Active Kitchen Exhaust & Stove Safety',
      guidance:
        'Always operate a vented kitchen chimney or external exhaust fan during cooking, and keep interior doors closed to prevent aerosols from migrating to bedrooms.',
      rationale:
        'Gas combustion generates nitrogen dioxide (NO2) and carbon monoxide. Electric and induction cooktops eliminate combustion gases, but all high-temperature cooking—especially frying—produces intense localized fine particle emissions.',
    },
    {
      category: 'Combustion & Scented Sources',
      title: 'Eliminate Incense, Scented Candles, & Mosquito Coils',
      guidance:
        'Avoid burning incense sticks (agarbatti), scented paraffin candles, and mosquito coils in enclosed indoor living areas.',
      rationale:
        'Smoldering incense and coils release heavy concentrations of PM2.5, polycyclic aromatic hydrocarbons (PAHs), and formaldehyde directly into the breathing zone.',
    },
    {
      category: 'Tobacco & Vaping',
      title: 'Zero Indoor Smoking & Vaping',
      guidance:
        'Enforce a strict 100% smoke-free home policy. Never permit smoking or vaping inside any room or enclosed balcony.',
      rationale:
        'Secondhand and thirdhand tobacco smoke emit hazardous fine particulates, nicotine residues, and toxic volatile organic compounds that settle onto walls and furnishings.',
    },
    {
      category: 'Dust Management',
      title: 'Damp Mopping Over Dry Broom Sweeping',
      guidance:
        'Clean hard floors with damp mops or microfiber cloths with clean water instead of dry broom sweeping. Use sealed HEPA-filtered vacuum cleaners for rugs.',
      rationale:
        'Dry broom sweeping re-suspends settled coarse and fine dust into the air where it remains airborne for hours, increasing inhalable particulate exposure.',
    },
    {
      category: 'Moisture & Mold Prevention',
      title: 'Humidity Control & Bathroom Exhaust',
      guidance:
        'Keep relative indoor humidity between 30% and 50%. Operate dedicated bathroom exhaust fans during and after showers to exhaust moisture.',
      rationale:
        'Elevated indoor moisture fosters mold spores, fungal growth, and dust mite proliferation, which exacerbate asthma and allergic respiratory inflammation.',
    },
  ];
}
