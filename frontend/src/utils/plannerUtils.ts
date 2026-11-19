import { AirQualityForecastResponse, HourlyForecastPoint } from '../types/airQuality';
import { ActionSlot, DailyActionPlan, IndoorProtocol } from '../types/planner';
import { UserPreferences } from '../types/user';

export type DiurnalPeriod = 'morning' | 'afternoon' | 'evening' | 'night';

export interface DispersionEvidence {
  weatherUsable?: boolean;
  isUsable?: boolean;
  freshness?: 'FRESH' | 'RECENT' | 'STALE' | 'INVALID' | 'UNAVAILABLE' | string;
  stagnationRisk?: 'Low' | 'Moderate' | 'Elevated' | 'Unknown' | string;
  dispersionConditions?: 'Favorable' | 'Moderate' | 'Potentially Unfavorable' | 'Unknown' | string;
}

export interface DiurnalSlotData {
  period: DiurnalPeriod;
  timeWindow: string;
  points: HourlyForecastPoint[];
  avgPm25: number | null;
  avgPm10: number | null;
  avgModelledAqi: number | null;
  validPm25Count: number;
  validAqiCount: number;
  hasAdequatePm25Coverage: boolean;
  hasAdequateAqiCoverage: boolean;
  hasAdequateCoverage: boolean;
}

export interface ForecastSufficiency {
  isSufficient: boolean;
  hasPm25: boolean;
  hasPm10: boolean;
  hasModelledAqi: boolean;
  isAqiOnly: boolean;
  isPm10Only: boolean;
  reason?: string;
}

export interface PlanGenerationOptions {
  isLive?: boolean;
  isDemo?: boolean;
  isStale?: boolean;
  isUnknownSource?: boolean;
}

/**
 * Minimum hourly sample points required within a diurnal period
 * to compute a representative diurnal average and allow window ranking.
 */
export const MIN_HOURLY_COVERAGE_POINTS = 3;

/**
 * Strict validator for numerical values:
 * Accepts only finite, non-negative numbers.
 * Rejects NaN, +/-Infinity, negative numbers, null, undefined, strings, booleans, objects.
 */
export function isValidNumericValue(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && !Number.isNaN(val) && val >= 0;
}

export function isValidPollutantValue(val: unknown): val is number {
  return isValidNumericValue(val);
}

export function isValidAqiValue(val: unknown): val is number {
  return isValidNumericValue(val);
}

/**
 * Verifies whether atmospheric stagnation is confirmed by fresh, usable dispersion evidence.
 * Missing, stale, invalid, or unavailable dispersion evidence does NOT imply stagnation.
 * Stagnation is never inferred from time of day or PM2.5 alone.
 */
export function isStagnationVerified(evidence?: DispersionEvidence | null): boolean {
  if (!evidence) return false;
  const isUsable = evidence.weatherUsable ?? evidence.isUsable ?? false;
  if (!isUsable) return false;
  const freshness = evidence.freshness;
  if (freshness !== 'FRESH' && freshness !== 'RECENT') return false;
  return (
    evidence.stagnationRisk === 'Elevated' ||
    evidence.stagnationRisk === 'Moderate' ||
    evidence.dispersionConditions === 'Potentially Unfavorable'
  );
}

/**
 * Formats an ISO 8601 UTC timestamp to 24-hour local time (e.g., "09:00").
 */
export function formatLocalTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '--:--';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '--:--';
  }
}

/**
 * Inspects the forecast for pollutant availability and enforces metric sufficiency.
 * PM10-only data is strictly insufficient for PM2.5 risk planning.
 */
export function inspectForecastSufficiency(forecast?: AirQualityForecastResponse | null): ForecastSufficiency {
  if (!forecast || !Array.isArray(forecast.hourly_forecast) || forecast.hourly_forecast.length === 0) {
    return {
      isSufficient: false,
      hasPm25: false,
      hasPm10: false,
      hasModelledAqi: false,
      isAqiOnly: false,
      isPm10Only: false,
      reason: 'No hourly forecast points returned by provider.',
    };
  }

  const hasPm25 = forecast.hourly_forecast.some((p) => isValidPollutantValue(p.pm2_5));
  const hasPm10 = forecast.hourly_forecast.some((p) => isValidPollutantValue(p.pm10));
  const hasModelledAqi = forecast.hourly_forecast.some((p) => isValidAqiValue(p.modelled_aqi_estimate));

  const isAqiOnly = !hasPm25 && !hasPm10 && hasModelledAqi;
  const isPm10Only = !hasPm25 && !hasModelledAqi && hasPm10;

  // PM10-only telemetry is NOT sufficient for PM2.5-specific risk planning
  const isSufficient = hasPm25 || hasModelledAqi;

  let reason: string | undefined;
  if (!isSufficient) {
    if (isPm10Only) {
      reason = 'PM10-only telemetry is insufficient for fine particulate (PM2.5) activity risk planning.';
    } else {
      reason = 'All hourly forecast points lack numerical pollutant concentrations and model index estimates.';
    }
  }

  return {
    isSufficient,
    hasPm25,
    hasPm10,
    hasModelledAqi,
    isAqiOnly,
    isPm10Only,
    reason,
  };
}

/**
 * Determines whether the forecast contains sufficient valid pollutant data
 * to calculate reliable activity windows.
 */
export function isForecastDataSufficient(forecast?: AirQualityForecastResponse | null): boolean {
  return inspectForecastSufficiency(forecast).isSufficient;
}

/**
 * Groups forecast points for the upcoming 24-hour cycle into 4 diurnal periods.
 * Respects local time without fabricating missing hours or substituting zero.
 */
export function groupForecastIntoDiurnalSlots(
  points: HourlyForecastPoint[]
): Record<DiurnalPeriod, HourlyForecastPoint[]> {
  const slots: Record<DiurnalPeriod, HourlyForecastPoint[]> = {
    morning: [],
    afternoon: [],
    evening: [],
    night: [],
  };

  const relevantPoints = points.slice(0, 24);

  for (const pt of relevantPoints) {
    if (!pt.timestamp || typeof pt.timestamp !== 'string') continue;
    const d = new Date(pt.timestamp);
    if (isNaN(d.getTime())) continue;
    const hour = d.getHours();

    if (hour >= 6 && hour < 11) {
      slots.morning.push(pt);
    } else if (hour >= 11 && hour < 16) {
      slots.afternoon.push(pt);
    } else if (hour >= 16 && hour < 21) {
      slots.evening.push(pt);
    } else {
      slots.night.push(pt);
    }
  }

  return slots;
}

/**
 * Calculates mean values for a slot without treating missing pollutant values as zero.
 * Enforces metric-specific coverage (PM2.5 vs AQI) and rejects duplicate timestamps.
 */
export function calculateSlotAverages(points: HourlyForecastPoint[]): {
  avgPm25: number | null;
  avgPm10: number | null;
  avgModelledAqi: number | null;
  count: number;
  validPm25Count: number;
  validAqiCount: number;
  hasAdequatePm25Coverage: boolean;
  hasAdequateAqiCoverage: boolean;
  hasAdequateCoverage: boolean;
} {
  if (!points || points.length === 0) {
    return {
      avgPm25: null,
      avgPm10: null,
      avgModelledAqi: null,
      count: 0,
      validPm25Count: 0,
      validAqiCount: 0,
      hasAdequatePm25Coverage: false,
      hasAdequateAqiCoverage: false,
      hasAdequateCoverage: false,
    };
  }

  // Deduplicate points by timestamp so duplicate hourly timestamps cannot inflate coverage
  const seenTimestamps = new Set<string>();
  const uniquePoints: HourlyForecastPoint[] = [];
  for (const pt of points) {
    if (!pt || !pt.timestamp || typeof pt.timestamp !== 'string') continue;
    const d = new Date(pt.timestamp);
    if (isNaN(d.getTime())) continue;
    const iso = d.toISOString();
    if (!seenTimestamps.has(iso)) {
      seenTimestamps.add(iso);
      uniquePoints.push(pt);
    }
  }

  const validPm25 = uniquePoints
    .map((p) => p.pm2_5)
    .filter(isValidPollutantValue);

  const validPm10 = uniquePoints
    .map((p) => p.pm10)
    .filter(isValidPollutantValue);

  const validAqi = uniquePoints
    .map((p) => p.modelled_aqi_estimate)
    .filter(isValidAqiValue);

  const avgPm25 =
    validPm25.length > 0
      ? Math.round((validPm25.reduce((sum, v) => sum + v, 0) / validPm25.length) * 10) / 10
      : null;

  const avgPm10 =
    validPm10.length > 0
      ? Math.round((validPm10.reduce((sum, v) => sum + v, 0) / validPm10.length) * 10) / 10
      : null;

  const avgModelledAqi =
    validAqi.length > 0
      ? Math.round(validAqi.reduce((sum, v) => sum + v, 0) / validAqi.length)
      : null;

  const validPm25Count = validPm25.length;
  const validAqiCount = validAqi.length;
  const hasAdequatePm25Coverage = validPm25Count >= MIN_HOURLY_COVERAGE_POINTS;
  const hasAdequateAqiCoverage = validAqiCount >= MIN_HOURLY_COVERAGE_POINTS;
  const hasAdequateCoverage = hasAdequatePm25Coverage || hasAdequateAqiCoverage;

  return {
    avgPm25,
    avgPm10,
    avgModelledAqi,
    count: uniquePoints.length,
    validPm25Count,
    validAqiCount,
    hasAdequatePm25Coverage,
    hasAdequateAqiCoverage,
    hasAdequateCoverage,
  };
}

/**
 * Evaluates smog risk tier based strictly on backend deterministic safety rules:
 * Reference: backend/app/services/deterministic_safety.py (DeterministicSafetyEngine.determine_eligible_actions)
 *
 * PM2.5 Guidance:
 * - PM2.5 >= 60.0 µg/m³: Elevated particulate exposure scenario ('high').
 * - PM2.5 >= 30.0 and < 60.0 µg/m³: Moderate scenario ('moderate').
 *   (At >= 40.0 µg/m³, street N95 respirator, indoor cardio, and reduced-exposure commuting are triggered).
 * - PM2.5 < 30.0 µg/m³ and no verified stagnation: Low particulate exposure scenario ('low').
 * - PM2.5 < 30.0 µg/m³ with verified stagnation: Elevated to moderate scenario ('moderate').
 *
 * Note on Modelled AQI:
 * Hardcoded AQI thresholds (e.g. 100, 150) are NOT established by the backend deterministic action engine.
 * For this MVP, when PM2.5 is unavailable, prescriptive risk tiers are strictly suppressed ('unavailable').
 * Modelled AQI is displayed descriptively without inventing unsupported risk tiers.
 *
 * Missing Telemetry (PM2.5 missing or non-numeric):
 * - Returns 'unavailable'. Never fabricates 'moderate' or unsupported tiers.
 */
export function evaluateSmogRisk(
  avgPm25: number | null,
  _avgModelledAqi: number | null,
  _hasSensitiveMembers: boolean = false,
  isStagnant: boolean = false
): ActionSlot['smogRisk'] {
  if (avgPm25 !== null && isValidPollutantValue(avgPm25)) {
    if (avgPm25 >= 60.0) return 'high';
    if (avgPm25 >= 30.0) return 'moderate';
    return isStagnant ? 'moderate' : 'low';
  }

  // Fail closed: Missing PM2.5 must be explicitly 'unavailable'.
  // Do NOT apply unsupported hardcoded AQI thresholds (e.g. 100, 150).
  return 'unavailable';
}

/**
 * Dynamically synthesizes a DailyActionPlan grounded in live forecast telemetry.
 * Enforces:
 * 1. Metric-specific sample coverage (>= 3 distinct valid points per candidate period).
 * 2. Strict unit consistency for ranking (never compares PM2.5 with AQI).
 * 3. Authoritative backend safety boundaries: 30, 40, 60 µg/m³ for PM2.5.
 * 4. Verified dispersion / stagnation handling.
 * 5. Balanced indoor ventilation guidance gated on verified live fresh telemetry.
 * 6. Leak-proof demo, stale, and unknown-source recommendation suppression.
 * 7. Accurate provenance reporting (deterministicSafetyEnginePassed strictly false for unverified/demo/stale).
 */
export function generateDynamicDailyPlan(
  forecast: AirQualityForecastResponse,
  userPreferences: UserPreferences,
  policyMode: 'balanced' | 'max_exposure' = 'balanced',
  dispersionEvidence?: DispersionEvidence | null,
  options?: PlanGenerationOptions
): DailyActionPlan {
  const points = forecast.hourly_forecast || [];
  const grouped = groupForecastIntoDiurnalSlots(points);
  const sufficiency = inspectForecastSufficiency(forecast);

  // Freshness and classification resolution
  const isRetrievalFresh =
    forecast.retrieval_freshness === 'FRESH' || forecast.retrieval_freshness === 'RECENT';
  const isModelRunFresh =
    forecast.model_run_freshness === 'FRESH' ||
    forecast.model_run_freshness === 'RECENT' ||
    forecast.model_run_freshness === 'UNAVAILABLE';

  const isStale = options?.isStale ?? (!isRetrievalFresh || !isModelRunFresh);
  const isDemo = options?.isDemo ?? (forecast.source_type === 'SIMULATED_DEMO');

  const isKnownModelled =
    forecast.source_type === 'MODELLED_FORECAST' ||
    forecast.source_type === 'OPEN_METEO_MODELLED';
  const isKnownObs =
    forecast.source_type === 'OBSERVATION' ||
    forecast.source_type === 'OPENAQ_V3' ||
    forecast.source_type === 'CPCB_OFFICIAL';

  const isLive = options?.isLive ?? ((isKnownModelled || isKnownObs) && !isDemo);
  const isUnknownSource = options?.isUnknownSource ?? (!isLive && !isDemo);
  const isLiveVerified = isLive && !isStale && !isDemo && !isUnknownSource;

  // Check verified stagnation evidence
  const isStagnant = isStagnationVerified(
    dispersionEvidence ??
      (forecast as any).dispersion_evidence ??
      (forecast as any).weather
  );

  const slotMetadata: Record<
    DiurnalPeriod,
    { title: string; defaultWindow: string; category: ActionSlot['category'] }
  > = {
    morning: { title: 'Morning Commute & Routine', defaultWindow: '07:00 - 10:00', category: 'commute' },
    afternoon: { title: 'Midday Errand & Ventilation Window', defaultWindow: '11:00 - 15:00', category: 'errand' },
    evening: { title: 'Evening Transit & Market Travel', defaultWindow: '16:00 - 20:00', category: 'commute' },
    night: { title: 'Overnight Rest & Indoor Air Management', defaultWindow: '21:00 - 06:00', category: 'indoor' },
  };

  const diurnalDataList: DiurnalSlotData[] = (
    ['morning', 'afternoon', 'evening', 'night'] as DiurnalPeriod[]
  ).map((period) => {
    const slotPoints = grouped[period];
    const avgs = calculateSlotAverages(slotPoints);

    let timeWindow = slotMetadata[period].defaultWindow;
    if (slotPoints.length > 0) {
      const firstTime = formatLocalTime(slotPoints[0].timestamp);
      const lastTime = formatLocalTime(slotPoints[slotPoints.length - 1].timestamp);
      if (firstTime !== '--:--' && lastTime !== '--:--') {
        timeWindow = `${firstTime} - ${lastTime}`;
      }
    }

    return {
      period,
      timeWindow,
      points: slotPoints,
      avgPm25: avgs.avgPm25,
      avgPm10: avgs.avgPm10,
      avgModelledAqi: avgs.avgModelledAqi,
      validPm25Count: avgs.validPm25Count,
      validAqiCount: avgs.validAqiCount,
      hasAdequatePm25Coverage: avgs.hasAdequatePm25Coverage,
      hasAdequateAqiCoverage: avgs.hasAdequateAqiCoverage,
      hasAdequateCoverage: avgs.hasAdequateCoverage,
    };
  });

  // Identify Candidate Periods containing forecast points
  const candidatePeriods = diurnalDataList.filter((d) => d.points.length > 0);

  // Ranking Metric Selection (Strict Metric-Specific Sample Coverage & Unit Consistency)
  let bestPeriod: DiurnalPeriod | null = null;
  let rankingMetric: 'pm2_5' | 'modelled_aqi' | null = null;
  let rankingFailureReason: 'demo' | 'insufficient_coverage' | 'mixed_units' | 'no_points' | null = null;

  if (isDemo) {
    // Demo mode: synthetic values must NOT generate actionable best window recommendations
    bestPeriod = null;
    rankingMetric = null;
    rankingFailureReason = 'demo';
  } else if (candidatePeriods.length === 0) {
    bestPeriod = null;
    rankingMetric = null;
    rankingFailureReason = 'no_points';
  } else {
    // Check metric availability across candidate periods
    const allHavePm25 = candidatePeriods.every((d) => d.avgPm25 !== null);
    const noneHavePm25 = candidatePeriods.every((d) => d.avgPm25 === null);
    const allHaveAqi = candidatePeriods.every((d) => d.avgModelledAqi !== null);
    const isConsistentUnit = allHavePm25 || (noneHavePm25 && allHaveAqi);

    if (!isConsistentUnit) {
      // Incompatible / mixed units across candidate periods
      bestPeriod = null;
      rankingMetric = null;
      rankingFailureReason = 'mixed_units';
    } else if (allHavePm25) {
      // 1. Consistent PM2.5 ranking: Requires at least 3 distinct valid PM2.5 samples per candidate period
      const allHavePm25Coverage = candidatePeriods.every((d) => d.hasAdequatePm25Coverage);
      if (!allHavePm25Coverage) {
        bestPeriod = null;
        rankingMetric = null;
        rankingFailureReason = 'insufficient_coverage';
      } else {
        rankingMetric = 'pm2_5';
        let lowest = Infinity;
        for (const d of candidatePeriods) {
          if (d.avgPm25! < lowest) {
            lowest = d.avgPm25!;
            bestPeriod = d.period;
          }
        }
      }
    } else if (noneHavePm25 && allHaveAqi) {
      // 2. Consistent Modelled AQI ranking: Requires at least 3 distinct valid AQI samples per candidate period
      const allHaveAqiCoverage = candidatePeriods.every((d) => d.hasAdequateAqiCoverage);
      if (!allHaveAqiCoverage) {
        bestPeriod = null;
        rankingMetric = null;
        rankingFailureReason = 'insufficient_coverage';
      } else {
        rankingMetric = 'modelled_aqi';
        let lowest = Infinity;
        for (const d of candidatePeriods) {
          if (d.avgModelledAqi! < lowest) {
            lowest = d.avgModelledAqi!;
            bestPeriod = d.period;
          }
        }
      }
    } else {
      bestPeriod = null;
      rankingMetric = null;
      rankingFailureReason = 'insufficient_coverage';
    }
  }

  // Construct itinerary slots
  const itinerary: ActionSlot[] = diurnalDataList.map((d, index) => {
    const meta = slotMetadata[d.period];
    const isBest = bestPeriod !== null && d.period === bestPeriod && !isDemo && isLiveVerified;
    const smogRisk = evaluateSmogRisk(
      d.avgPm25,
      d.avgModelledAqi,
      userPreferences.hasSensitiveMembers,
      isStagnant
    );

    const isElevated60 = d.avgPm25 !== null && d.avgPm25 >= 60.0;
    const isElevated40 = d.avgPm25 !== null && d.avgPm25 >= 40.0;

    // Mask requirement aligns with backend deterministic triggers:
    // Strictly requires verified live PM2.5 data (never triggered by unsupported AQI thresholds or demo)
    const requiresMask =
      !isDemo &&
      isLiveVerified &&
      d.avgPm25 !== null &&
      (isElevated60 ||
        isElevated40 ||
        smogRisk === 'high' ||
        smogRisk === 'hazardous' ||
        ((policyMode === 'max_exposure' || userPreferences.hasSensitiveMembers) && smogRisk === 'moderate'));

    const pmDisplay = d.avgPm25 !== null ? `${d.avgPm25} µg/m³` : 'Unavailable';
    const aqiDisplay = d.avgModelledAqi !== null ? `(Model Est. AQI ~${d.avgModelledAqi})` : '';

    let recommendedAction = '';
    let exposureMitigation = '';
    let sustainableChoice = '';
    let scientificRationale = '';
    let suitabilityTier: ActionSlot['suitabilityTier'] = 'Limited';

    if (isDemo) {
      suitabilityTier = 'Limited';
      recommendedAction =
        'Demonstration Walkthrough: Illustrates how diurnal activity windows are organized across the day. No commute, exercise, or health recommendations are generated from synthetic data.';
      exposureMitigation =
        'Simulation Walkthrough: When connected to live station telemetry, this card displays tailored exposure-reduction options based on verified atmospheric conditions.';
      sustainableChoice =
        'Simulation Walkthrough: When connected to live station telemetry, this card displays low-emission travel alternatives for the selected diurnal period.';
      scientificRationale =
        `Synthetic demonstration profile: Numerical values (${pmDisplay}) are displayed to demonstrate interface layout and chart functionality only.`;
    } else if (smogRisk === 'unavailable') {
      suitabilityTier = 'Unavailable';
      if (d.avgModelledAqi !== null) {
        recommendedAction =
          `Modelled AQI estimate is ~${d.avgModelledAqi}. Prescriptive exposure tiers and outdoor exercise restrictions require verified fine particulate (PM2.5) telemetry, which is unexposed for this period.`;
        exposureMitigation =
          `Atmospheric model index (~${d.avgModelledAqi}) is indicative only. Consult local station observations for fine particulate exposure decisions.`;
        sustainableChoice =
          'Favor clean electric transit options to minimize urban emissions.';
        scientificRationale =
          `Modelled atmospheric index indicates ~${d.avgModelledAqi} (US EPA scale reported by CAMS). PM2.5 concentrations are unexposed by provider; prescriptive risk directives are suppressed.`;
      } else {
        recommendedAction =
          'Numerical pollutant measurements are unavailable for this time window. Follow baseline environmental source control.';
        exposureMitigation =
          'Maintain baseline personal protective measures if outdoor air quality cannot be verified.';
        sustainableChoice =
          'Favor clean electric transit options to minimize urban emissions.';
        scientificRationale =
          'Neither numerical PM2.5 nor modelled AQI estimates were reported for this period. Risk cannot be calculated without predictive telemetry.';
      }
    } else if (isBest) {
      suitabilityTier =
        smogRisk === 'low' || smogRisk === 'moderate'
          ? 'Relative Minimum'
          : 'Acceptable with Precautions';
      if (rankingMetric === 'pm2_5') {
        recommendedAction =
          d.avgPm25 !== null && d.avgPm25 < 60
            ? `Relatively lower exposure window for essential outdoor tasks. Predicted diurnal average PM2.5 is at its lowest (${pmDisplay}).`
            : `Relatively lower exposure window across candidate forecast periods, though predicted PM2.5 remains elevated (${pmDisplay}). Outdoor activity is not unconditionally safe; wear certified respiratory protection.`;
        scientificRationale = `Modelled PM2.5 for this period averages ${pmDisplay}${d.avgModelledAqi !== null ? ` ${aqiDisplay}` : ''}. Evaluated as a relative diurnal comparison of personal exposure risk; not an official 24-hour statutory NAAQS exceedance.`;
      } else {
        recommendedAction = `Relatively lower exposure window based on atmospheric model index estimates (~${d.avgModelledAqi}). Numerical PM2.5 concentration is unexposed by the provider; prescriptive risk directives are suppressed.`;
        scientificRationale = `Atmospheric model index estimates average ~${d.avgModelledAqi} (US EPA scale reported by CAMS). PM2.5 concentrations are unexposed.`;
      }

      exposureMitigation =
        'Schedule necessary outdoor transit during this period if feasible to take advantage of relatively better atmospheric dilution.';
      sustainableChoice =
        policyMode === 'balanced'
          ? 'Combine errands into a single trip or take mass transit to minimize cumulative street presence.'
          : 'Strictly limit trip duration to necessary stops.';
    } else if (isElevated60 || smogRisk === 'high' || smogRisk === 'hazardous') {
      suitabilityTier = 'Avoid Strenuous Outdoor';
      recommendedAction =
        userPreferences.hasSensitiveMembers
          ? 'Fine particulate levels are elevated (≥60 µg/m³). Sensitive individuals should avoid strenuous outdoor activity and reduce exposure duration. When outdoor travel is necessary, use a certified, well-fitted N95 respirator.'
          : 'Move strenuous high-intensity cardiovascular exercise indoors or reschedule. Non-strenuous outdoor walking is acceptable with a certified N95 respirator if travel is necessary.';
      exposureMitigation =
        'Enclosed mass transit (Metro) and filtered indoor spaces reduce direct particulate inhalation compared to roadside vehicle exhaust plumes.';
      sustainableChoice =
        'Choose electric mass transit (Metro) or shared bus over personal vehicles to avoid compounding localized emission plumes.';

      if (d.avgPm25 !== null) {
        scientificRationale = `Fine particulate levels indicate elevated instantaneous personal exposure (predicted period average: ${pmDisplay}). Recommendations reflect personal respiratory protection rather than official 24-hour CPCB regulatory exceedances.`;
      } else {
        scientificRationale = `Modelled atmospheric index indicates elevated exposure (~${d.avgModelledAqi}). Numerical particulate concentrations are unexposed.`;
      }
    } else if (isElevated40) {
      // PM2.5 from 40 to <60 µg/m³: Moderate scenario with additional protective actions (backend line 579)
      suitabilityTier = 'Acceptable with Precautions';
      recommendedAction =
        userPreferences.hasSensitiveMembers
          ? 'Fine particulate levels are elevated (≥40 µg/m³). Sensitive individuals should move strenuous exercise indoors, reduce outdoor exposure, and wear a certified N95 respirator during necessary outdoor transit.'
          : 'Moderate outdoor activity is acceptable with protective actions: wear a certified N95 street respirator and prioritize indoor cardio over heavy outdoor exertion.';
      exposureMitigation =
        'Wear a certified N95 respirator and prioritize enclosed or separated transit corridors away from direct vehicular exhaust plumes.';
      sustainableChoice = 'Walk or use public transit for short trips to keep community emissions low.';

      scientificRationale = `Diurnal predicted PM2.5 averages ${pmDisplay} (≥40 µg/m³ protective threshold triggered). Personal exposure guidance aligns with deterministic safety rules for moderate particulate scenarios.`;
    } else if (smogRisk === 'moderate') {
      suitabilityTier = 'Acceptable with Precautions';
      recommendedAction =
        userPreferences.hasSensitiveMembers
          ? 'Moderate particulate levels (30–40 µg/m³). Sensitive individuals should consider wearing a certified N95 respirator near busy traffic corridors and reduce prolonged vigorous exertion.'
          : 'Moderate outdoor activity is acceptable with standard precautions. Sensitive individuals should consider wearing an N95 respirator near busy traffic corridors.';
      exposureMitigation =
        'Avoid lingering near high-emission intersections and heavy diesel transit corridors.';
      sustainableChoice = 'Walk or use public transit for short trips to keep community emissions low.';

      if (isStagnant && d.avgPm25 !== null && d.avgPm25 < 30) {
        scientificRationale = `Fine particulate level is below 30 µg/m³ (${pmDisplay}), but verified unfavorable atmospheric dispersion / stagnation elevates local exposure risk to moderate.`;
      } else if (d.avgPm25 !== null) {
        scientificRationale = `Diurnal predicted PM2.5 averages ${pmDisplay}. Particulate concentrations are below the 40 µg/m³ protective threshold.`;
      } else {
        scientificRationale = `Model index estimate is ~${d.avgModelledAqi}. PM2.5 concentrations are unexposed.`;
      }
    } else {
      suitabilityTier = 'Acceptable with Precautions';
      recommendedAction =
        'Air quality is favorable for outdoor activities and natural ventilation. Maintain standard baseline source control.';
      exposureMitigation =
        'Standard baseline awareness; no special personal respiratory shielding required for healthy individuals.';
      sustainableChoice = 'Walk, cycle, or use electric transit for essential trips.';

      if (d.avgPm25 !== null) {
        scientificRationale = `Fine particulate levels are low (predicted average: ${pmDisplay} < 30 µg/m³) with favorable dispersion conditions.`;
      } else {
        scientificRationale = `Model index estimate is ~${d.avgModelledAqi} (< 100). PM2.5 concentrations are unexposed.`;
      }
    }

    // Specific overnight guidance (enforces balanced window sealing and indoor source control)
    if (d.period === 'night' && !isDemo && isLiveVerified) {
      recommendedAction =
        'Operate indoor HEPA air filtration in recirculating mode. Avoid permanent, unconditional window sealing; balance outdoor particulate ingress with indoor pollutant sources (cooking, CO2, moisture).';
      exposureMitigation =
        'Damp-mop floor surfaces to capture settled fine particulates without resuspending dust.';
      sustainableChoice =
        'Turn off unused high-wattage heating or lighting to conserve electrical grid demand.';

      if (d.avgPm25 !== null) {
        scientificRationale = `Surface-level particulate concentration is predicted to average ${pmDisplay} during overnight hours.`;
      } else if (d.avgModelledAqi !== null) {
        scientificRationale = `Overnight model index estimate is ~${d.avgModelledAqi}.`;
      }
    }

    const activityTitle = isDemo
      ? `${meta.title} (Illustrative Simulation)`
      : `${meta.title}${isBest ? ' ★ (Best Window)' : ''}`;

    return {
      id: `slot_${index + 1}_${d.period}`,
      timeWindow: d.timeWindow,
      period: d.period,
      smogRisk,
      activityTitle,
      recommendedAction,
      exposureMitigation,
      sustainableChoice,
      requiresMask,
      maskType: requiresMask ? 'n95_respirator' : 'none',
      scientificRationale,
      category: meta.category,
      avgPm25: d.avgPm25,
      avgModelledAqi: d.avgModelledAqi,
      isBestWindow: isBest,
      suitabilityTier,
    };
  });

  // Calculate diurnal spread for headline
  const validPms = diurnalDataList
    .map((d) => d.avgPm25)
    .filter((v): v is number => v !== null && isValidPollutantValue(v));
  const minPm = validPms.length > 0 ? Math.min(...validPms) : null;
  const maxPm = validPms.length > 0 ? Math.max(...validPms) : null;

  const validAqis = diurnalDataList
    .map((d) => d.avgModelledAqi)
    .filter((v): v is number => v !== null && isValidAqiValue(v));
  const minAqi = validAqis.length > 0 ? Math.min(...validAqis) : null;
  const maxAqi = validAqis.length > 0 ? Math.max(...validAqis) : null;

  const bestSlot = itinerary.find((s) => s.isBestWindow);

  let headlineAdvice = '';
  if (isDemo) {
    headlineAdvice =
      'Demonstration scenario: Synthetic values are displayed for illustrative interface walkthrough only. No actual activity recommendations or ventilation decisions are generated from simulated telemetry.';
  } else if (isStale) {
    headlineAdvice =
      'Forecast telemetry is stale: Atmospheric prediction data was retrieved over 60 minutes ago. Current-condition activity advice and optimal window rankings are suspended until fresh telemetry is retrieved.';
  } else if (isUnknownSource) {
    headlineAdvice =
      'Unverified Telemetry Source: Provider classification could not be verified as authoritative live modelled or physical sensor data. Telemetry-dependent activity recommendations are suspended.';
  } else if (bestSlot) {
    if (rankingMetric === 'pm2_5' && minPm !== null && maxPm !== null) {
      headlineAdvice = `Forecasted diurnal PM2.5 averages range from ${minPm} to ${maxPm} µg/m³. The ${bestSlot.timeWindow} (${bestSlot.period}) window offers the relatively lowest particulate exposure for essential outdoor transit.`;
    } else if (rankingMetric === 'modelled_aqi' && minAqi !== null && maxAqi !== null) {
      headlineAdvice = `Forecast provides atmospheric model index estimates (~${minAqi} to ~${maxAqi}). The ${bestSlot.timeWindow} (${bestSlot.period}) window provides the relatively lowest exposure index.`;
    } else {
      headlineAdvice = `Hourly model predictions retrieved. The ${bestSlot.timeWindow} (${bestSlot.period}) window provides relatively lower exposure.`;
    }
  } else {
    if (rankingFailureReason === 'insufficient_coverage') {
      headlineAdvice =
        'Activity windows cannot be ranked across candidate periods: Insufficient hourly sample coverage (minimum 3 hourly points per diurnal period required for representative diurnal comparison).';
    } else if (rankingFailureReason === 'mixed_units') {
      headlineAdvice =
        'Activity windows cannot be ranked across all candidate periods: pollutant metrics are incomplete or contain incompatible measurement units across time slots.';
    } else {
      headlineAdvice = 'No hourly forecast points available to determine activity windows.';
    }
  }

  const tradeOffAnalysis = isDemo
    ? 'Educational Concept (Simulated Scenario): Demonstrates how the planner balances active travel emissions against personal particulate exposure when live telemetry is available.'
    : isStale
    ? 'Protective Guidance: Because forecast freshness cannot be verified, follow baseline precautionary exposure reduction and check live station observations before outdoor exertion.'
    : isUnknownSource
    ? 'Precautionary Guidance: Unverified environmental data cannot be used for prescriptive personal health or commute decisions. Verify conditions with official local environmental authorities.'
    : policyMode === 'balanced'
    ? 'Trade-Off Resolution: Walking or cycling reduces carbon emissions, but heavy exertion in elevated pollution increases inhaled particulate dose. We recommend electric Metro or enclosed transit with a sealed N95 respirator: achieving BOTH reduced personal exposure and low environmental emissions.'
    : 'Max Protection Stance: Personal respiratory shielding is prioritized. Avoid strenuous outdoor cardiovascular exertion during elevated pollution periods. Run HEPA air filtration in recirculating mode.';

  // Indoor protocol: Gated strictly on verified, fresh, live telemetry
  const middaySlot = diurnalDataList.find((d) => d.period === 'afternoon');
  let ventilationPermitted = false;
  let ventilationStatus: IndoorProtocol['ventilationStatus'] = 'telemetry_insufficient';
  let ventilationReason = '';
  let ventilationSafeHours: string[] = [];

  if (isDemo) {
    // 1. Demo Mode: Strictly telemetry_insufficient, no safe hours
    ventilationPermitted = false;
    ventilationStatus = 'telemetry_insufficient';
    ventilationReason =
      'Demonstration scenario: Simulated telemetry cannot establish actual indoor ventilation opportunities. Consult live verified air quality telemetry. Maintain baseline indoor source control (operate kitchen range hoods during cooking, recirculate HEPA filtration).';
    ventilationSafeHours = [];
  } else if (isStale) {
    // 2. Stale Telemetry: Strictly telemetry_insufficient, no safe hours
    ventilationPermitted = false;
    ventilationStatus = 'telemetry_insufficient';
    ventilationReason =
      'Telemetry stale: Atmospheric predictions were retrieved over 60 minutes ago. Real-time natural ventilation safety cannot be established from expired environmental telemetry. Balance indoor source control (kitchen exhaust hoods, moisture management) with mechanical HEPA filtration in recirculating mode.';
    ventilationSafeHours = [];
  } else if (isUnknownSource) {
    // 3. Unknown Source: Strictly telemetry_insufficient, no safe hours
    ventilationPermitted = false;
    ventilationStatus = 'telemetry_insufficient';
    ventilationReason =
      'Unverified telemetry source: Forecast data originates from an unverified provider. Real-time natural ventilation opportunities cannot be verified. Maintain mechanical filtration and localized indoor source control.';
    ventilationSafeHours = [];
  } else if (
    !isLiveVerified ||
    sufficiency.isAqiOnly ||
    !sufficiency.hasPm25 ||
    !middaySlot ||
    middaySlot.avgPm25 === null ||
    !middaySlot.hasAdequatePm25Coverage
  ) {
    // 4. Insufficient PM2.5 coverage or unexposed PM2.5: Strictly telemetry_insufficient
    ventilationPermitted = false;
    ventilationStatus = 'telemetry_insufficient';
    ventilationReason =
      'Available telemetry cannot establish ventilation safety: fine particulate (PM2.5) concentrations lack adequate sample coverage (at least 3 valid hourly points required) or are unexposed. Balance outdoor particulate infiltration against indoor sources (cooking, CO2, moisture) through targeted localized kitchen exhaust and mechanical HEPA air filtration.';
    ventilationSafeHours = [];
  } else if (middaySlot.avgPm25 < 30.0 && !isStagnant) {
    // 5. Verified live fresh forecast with favorable PM2.5 (< 30) and no stagnation
    ventilationPermitted = true;
    ventilationStatus = 'favorable';
    ventilationReason =
      'Predicted midday fine particulate concentrations are below 30 µg/m³. Short, targeted cross-ventilation (10-15 minutes) is acceptable if localized outdoor dispersion conditions remain favorable. Balance air exchange against indoor source control; avoid prolonged window opening if local ambient plumes arise.';
    ventilationSafeHours = [middaySlot.timeWindow];
  } else if (middaySlot.avgPm25 < 30.0 && isStagnant) {
    // 6. Verified live fresh forecast with low PM2.5 but verified stagnation
    ventilationPermitted = false;
    ventilationStatus = 'restricted';
    ventilationReason =
      'Although predicted PM2.5 is below 30 µg/m³, verified unfavorable atmospheric dispersion / stagnation traps localized ground-level pollutants. Natural cross-ventilation is restricted; run HEPA filtration in recirculating mode.';
    ventilationSafeHours = [];
  } else {
    // 7. Verified live fresh forecast with elevated PM2.5 (>= 30 µg/m³)
    ventilationPermitted = false;
    ventilationStatus = 'restricted';
    ventilationReason =
      'Ambient fine particulate levels are predicted to remain elevated (≥30 µg/m³). Restrict natural outdoor air infiltration and operate mechanical HEPA filtration in recirculating mode. Do NOT permanently seal windows if active indoor pollutant sources (cooking, moisture) are present; operate localized kitchen exhaust hoods.';
    ventilationSafeHours = [];
  }

  const indoorProtocols: IndoorProtocol = {
    ventilationPermitted,
    ventilationStatus,
    ventilationReason,
    ventilationSafeHours,
    purifierRunningMode: 'High (Continuous Recirculation)',
    diyMitigationTips: [
      'Roll damp towels along gaps under exterior doors and windows during elevated pollution periods.',
      'Balance outdoor sealing with indoor source control: operate kitchen exhaust during cooking to prevent compounding indoor VOCs and moisture.',
      'Wet-mop tiled floors with clean water instead of dry broom sweeping to prevent dust resuspension.',
      'Strictly avoid burning incense (agarbatti), scented candles, or mosquito coils indoors.',
    ],
    bannedPracticesWarning:
      'CRITICAL SAFETY RULE: Never use ozone generators, ozone purifiers, or uncertified ionizing air cleaners under any circumstances. Ozone is an acute pulmonary irritant that exacerbates asthma and airway inflammation.',
  };

  // Safe derivation of targetLocation AQI: strictly null if unavailable, never 0
  const targetAqi =
    bestSlot?.avgModelledAqi ??
    (candidatePeriods.find((p) => p.avgModelledAqi !== null)?.avgModelledAqi ?? null);

  let targetCategory = 'Unavailable';
  if (bestSlot) {
    if (bestSlot.smogRisk === 'hazardous') targetCategory = 'Hazardous';
    else if (bestSlot.smogRisk === 'high') targetCategory = 'Very Poor';
    else if (bestSlot.smogRisk === 'moderate') targetCategory = 'Moderate';
    else if (bestSlot.smogRisk === 'low') targetCategory = 'Satisfactory';
  }

  // Safety Provenance: Must NOT report successful safety validation for demo, stale, unknown, or insufficient data
  const hasValidPm25Coverage =
    sufficiency.hasPm25 &&
    candidatePeriods.length > 0 &&
    candidatePeriods.every((d) => d.hasAdequatePm25Coverage);

  const deterministicSafetyEnginePassed =
    isLiveVerified &&
    hasValidPm25Coverage &&
    rankingFailureReason === null;

  let provenanceModel = 'Deterministic Environmental Rule Engine (Safety Guardrails Verified)';
  let validationStatus: 'VERIFIED_PASSED' | 'SIMULATED_DEMO' | 'STALE_DATA' | 'UNVERIFIED_SOURCE' | 'INSUFFICIENT_TELEMETRY' = 'VERIFIED_PASSED';

  if (isDemo) {
    provenanceModel = 'Deterministic Environmental Rule Engine (Simulated Demonstration Scenario)';
    validationStatus = 'SIMULATED_DEMO';
  } else if (isStale) {
    provenanceModel = 'Deterministic Environmental Rule Engine (Stale Telemetry; Validation Suspended)';
    validationStatus = 'STALE_DATA';
  } else if (isUnknownSource) {
    provenanceModel = 'Deterministic Environmental Rule Engine (Unverified Provider Source)';
    validationStatus = 'UNVERIFIED_SOURCE';
  } else if (!hasValidPm25Coverage || sufficiency.isAqiOnly) {
    provenanceModel = sufficiency.isAqiOnly
      ? 'Deterministic Environmental Rule Engine (AQI-Only Model Estimates; PM2.5 Unexposed)'
      : 'Deterministic Environmental Rule Engine (Insufficient PM2.5 Sample Coverage)';
    validationStatus = 'INSUFFICIENT_TELEMETRY';
  }

  return {
    planId: `plan_${forecast.location.latitude.toFixed(2)}_${forecast.location.longitude.toFixed(2)}_${forecast.retrieved_at.slice(0, 10)}`,
    date: new Date(forecast.retrieved_at).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
    targetLocation: {
      name:
        forecast.location.name ||
        `${forecast.location.latitude.toFixed(2)}, ${forecast.location.longitude.toFixed(2)}`,
      aqi: targetAqi,
      category: targetCategory,
    },
    headlineAdvice,
    tradeOffAnalysis,
    itinerary,
    indoorProtocols,
    aiProvenance: {
      model: provenanceModel,
      deterministicSafetyEnginePassed,
      validationStatus,
      generatedAt: forecast.retrieved_at,
    },
  };
}
