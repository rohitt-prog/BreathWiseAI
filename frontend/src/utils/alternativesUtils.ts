/**
 * Travel Alternatives & Personal Commute Exposure Evaluation Utilities.
 * Authoritative, evidence-grounded rules aligned with backend deterministic safety.
 *
 * Scientific & Safety Guarantees:
 * 1. Outdoor ambient telemetry is never represented as an in-cabin or route-specific IoT reading.
 * 2. Condition-dependent commute recommendations are gated strictly on verified, fresh live telemetry.
 * 3. Stale, demo, unknown-source, or missing PM2.5 telemetry fails closed to 'telemetry_insufficient'.
 * 4. Never assumes travel modes have universally fixed exposure multipliers (e.g. no hardcoded 0.3x).
 * 5. Strictly distinguishes personal particulate exposure from environmental greenhouse gas emissions.
 * 6. Never claims that active travel (cycling/walking) in heavy traffic reduces personal exposure.
 */
import { CurrentAirQualityData } from '../types/airQuality';
import { determineTelemetryProvenance, ProvenanceDisplayInfo } from './aqiUtils';

export type AlternativesStatus =
  | 'telemetry_insufficient'
  | 'elevated_exposure_risk'
  | 'moderate_exposure_risk'
  | 'conditional_active_viable';

export type CommuteMode =
  | 'metro'
  | 'private_car'
  | 'bus'
  | 'cng_auto'
  | 'two_wheeler'
  | 'bicycle'
  | 'walking';

export interface CommuteModeProfile {
  mode: CommuteMode;
  displayName: string;
  category: 'Enclosed Transit' | 'Roadside Enclosed' | 'Open Roadside' | 'Active Commute';
  emissionCategory: 'Very Low' | 'Low' | 'Moderate' | 'High';
  environmentalImpact: string;
  exposureFactors: string;
  physicalExertionLevel: 'Resting' | 'Light' | 'Moderate' | 'High';
  respiratorRecommended: boolean;
  liveVerdict: string | null;
  liveGuidance: string | null;
}

export interface AlternativesEvaluationResult {
  status: AlternativesStatus;
  verdictTitle: string;
  badgeVariant: 'warning' | 'danger' | 'info' | 'success' | 'neutral';
  explanation: string;
  isLiveVerified: boolean;
  provenance: ProvenanceDisplayInfo;
  pm25Concentration: number | null;
  pm10Concentration: number | null;
  naqiCategory: string;
  outdoorDisclosure: string;
  modes: CommuteModeProfile[];
  exposureDeterminants: string[];
}

/**
 * Validates whether a concentration value is a finite, non-negative number.
 */
export function isValidPollutant(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val >= 0;
}

/**
 * Returns the educational baseline profiles for all supported commute modes.
 * When telemetry is unverified, liveVerdict and liveGuidance are strictly null.
 */
export function getEducationalCommuteModes(
  pm25: number | null,
  isLiveVerified: boolean
): CommuteModeProfile[] {
  const isElevated = isLiveVerified && pm25 !== null && pm25 >= 60.0;
  const isModerate = isLiveVerified && pm25 !== null && pm25 >= 30.0 && pm25 < 60.0;
  const isLow = isLiveVerified && pm25 !== null && pm25 < 30.0;

  return [
    {
      mode: 'metro',
      displayName: 'Metro / Mass Rail Transit',
      category: 'Enclosed Transit',
      emissionCategory: 'Very Low',
      environmentalImpact:
        'Illustrative Category: Very Low operational emissions. High passenger-density electric rail operating with zero direct roadway tailpipe emissions; lifecycle emissions depend on electricity grid generation mix.',
      exposureFactors:
        'Rail corridors are physically separated from street-level roadway tailpipe exhaust plumes. Enclosed passenger cars with mechanical ventilation can attenuate particulate ingress, though effectiveness depends on train HVAC maintenance, system design, and passenger crowding.',
      physicalExertionLevel: 'Light',
      respiratorRecommended: isElevated || isModerate,
      liveVerdict: isElevated
        ? 'Enclosed Transit Option'
        : isModerate
        ? 'Favorable Transit Option'
        : isLow
        ? 'Viable Transit Option'
        : null,
      liveGuidance: isElevated
        ? 'Verified outdoor PM2.5 is elevated (≥ 60 µg/m³). Enclosed rail transit provides separation from street-level tailpipe exhaust compared to open roadside travel. Note that in-cabin air quality varies with train ventilation and maintenance.'
        : isModerate
        ? 'Moderate ambient particulate levels. Metro provides transit separated from roadside traffic congestion.'
        : isLow
        ? 'Regional ambient particulate levels are relatively low. Metro provides efficient transit separated from surface traffic congestion.'
        : null,
    },
    {
      mode: 'private_car',
      displayName: 'Enclosed Vehicle (AC / Filtered)',
      category: 'Roadside Enclosed',
      emissionCategory: 'High',
      environmentalImpact:
        'Illustrative Category: High per-passenger emissions. Typical single- or low-occupancy fossil fuel automobiles produce higher greenhouse gas and exhaust emissions per passenger-kilometer than mass transit; actual footprint varies by vehicle efficiency, fuel/electric powertrain, and occupancy.',
      exposureFactors:
        'An enclosed vehicle cabin with closed windows and internal recirculation may reduce particulate ingress from adjacent traffic. However, real-world protection varies substantially based on cabin air filter condition, window seals, HVAC maintenance, and door opening frequency.',
      physicalExertionLevel: 'Resting',
      respiratorRecommended: false,
      liveVerdict: isElevated
        ? 'Enclosed Cabin with Recirculation'
        : isModerate
        ? 'Moderate Exposure (Keep Windows Up)'
        : isLow
        ? 'Standard Vehicle Operation'
        : null,
      liveGuidance: isElevated
        ? 'If automobile travel is chosen during elevated pollution, keeping windows closed and setting ventilation to internal recirculation may help reduce roadway soot ingress. Actual in-cabin air quality depends on vehicle cabin filter efficiency and sealing.'
        : isModerate
        ? 'Moderate ambient levels. Keep windows closed in heavy traffic queues to prevent localized exhaust ingress.'
        : isLow
        ? 'Regional ambient particulate levels are relatively low. Enclosed vehicle travel remains standard, though localized roadway congestion can still concentrate exhaust.'
        : null,
    },
    {
      mode: 'bus',
      displayName: 'Public Bus Transit (Electric / CNG)',
      category: 'Roadside Enclosed',
      emissionCategory: 'Low',
      environmentalImpact:
        'Illustrative Category: Low per-passenger emissions. Shared high-occupancy transit generally reduces per-capita urban emissions compared to private automobiles, varying with passenger occupancy, bus fuel type (electric, CNG, diesel), and traffic flow.',
      exposureFactors:
        'Enclosed or air-conditioned buses provide partial physical separation from ambient air, but frequent door openings at stops and waiting at curbside boarding points can expose passengers to localized exhaust plumes. Protection varies widely with bus age, maintenance, and crowding.',
      physicalExertionLevel: 'Light',
      respiratorRecommended: isElevated || isModerate,
      liveVerdict: isElevated
        ? 'Enclosed Bus with N95'
        : isModerate
        ? 'Standard Bus Transit'
        : isLow
        ? 'Viable Public Transit'
        : null,
      liveGuidance: isElevated
        ? 'Curbside bus stops can have localized exhaust spikes from idling vehicles. If waiting near busy roadways during elevated pollution, consider wearing a certified N95 respirator.'
        : isModerate
        ? 'Moderate ambient particulate levels. Minimize dwell time adjacent to idling vehicle tailpipes.'
        : isLow
        ? 'Regional ambient particulate levels are relatively low. Public bus transit offers shared mobility, though curbside stops adjacent to idling traffic may still experience localized emissions.'
        : null,
    },
    {
      mode: 'cng_auto',
      displayName: 'Auto-Rickshaw (Three-Wheeler)',
      category: 'Open Roadside',
      emissionCategory: 'Moderate',
      environmentalImpact:
        'Illustrative Category: Moderate per-passenger emissions. CNG combustion typically generates lower particulate matter than diesel, but three-wheelers operate on fossil fuel with small-engine tailpipe emissions; emissions per passenger depend on occupancy.',
      exposureFactors:
        'Open-sided cabins provide minimal physical barrier against ambient roadside exhaust. Passenger breathing height is situated close to tailpipe exhaust levels of surrounding traffic.',
      physicalExertionLevel: 'Light',
      respiratorRecommended: true,
      liveVerdict: isElevated
        ? 'High Roadside Exposure Risk'
        : isModerate
        ? 'Direct Roadside Exposure'
        : isLow
        ? 'Open Roadside Travel'
        : null,
      liveGuidance: isElevated
        ? 'Direct, unbuffered exposure to adjacent vehicle exhaust. Wear a certified N95 respirator and avoid prolonged stationary idling in congested arterial choke points.'
        : isModerate
        ? 'Moderate ambient levels. Direct proximity to vehicle tailpipes can cause acute exposure spikes in stop-and-go traffic.'
        : isLow
        ? 'Regional ambient particulate levels are relatively low. Direct exposure to immediate tailpipes in heavy traffic remains a factor in open-sided vehicles.'
        : null,
    },
    {
      mode: 'two_wheeler',
      displayName: 'Motorcycle / Scooter',
      category: 'Open Roadside',
      emissionCategory: 'Moderate',
      environmentalImpact:
        'Illustrative Category: Moderate per-passenger emissions. Lower total fuel consumption than single-occupancy cars, but small combustion engines emit carbon dioxide and localized pollutants; electric two-wheelers eliminate tailpipe emissions.',
      exposureFactors:
        'Open travel provides no cabin enclosure. Riders travel in close proximity to roadway exhaust plumes and resuspended dust.',
      physicalExertionLevel: 'Moderate',
      respiratorRecommended: true,
      liveVerdict: isElevated
        ? 'Unbuffered Roadside Exposure'
        : isModerate
        ? 'Open Roadside Exposure'
        : isLow
        ? 'Open Roadside Travel'
        : null,
      liveGuidance: isElevated
        ? 'Unbuffered exposure to roadway exhaust. If motorized two-wheeler travel is unavoidable during elevated pollution, wear a certified, well-fitted N95 respirator and choose secondary roads away from heavy diesel traffic.'
        : isModerate
        ? 'Moderate ambient baseline. Direct tailpipe proximity remains a source of elevated personal particulate exposure.'
        : isLow
        ? 'Regional ambient particulate levels are relatively low. Open-road travel is viable, though direct proximity behind idling vehicles in congested corridors can still cause localized exposure.'
        : null,
    },
    {
      mode: 'bicycle',
      displayName: 'Bicycle / Active Commute',
      category: 'Active Commute',
      emissionCategory: 'Very Low',
      environmentalImpact:
        'Illustrative Category: Very Low emissions. Human-powered cycling generates zero direct operational or tailpipe emissions.',
      exposureFactors:
        'Physical exertion elevates breathing rate and inhaled air volume. In areas with high ambient particulate levels or close traffic proximity, increased respiratory volume increases particulate inhalation despite zero vehicle emissions.',
      physicalExertionLevel: 'High',
      respiratorRecommended: isElevated || isModerate,
      liveVerdict: isElevated
        ? 'High Respiratory Inhalation Risk'
        : isModerate
        ? 'Caution: High Exertion in Smog'
        : isLow
        ? 'Active Commute Viable'
        : null,
      liveGuidance: isElevated
        ? 'During elevated ambient pollution (PM2.5 ≥ 60 µg/m³), higher physical exertion along traffic corridors increases inhaled air volume and particulate intake. Moderate or postpone strenuous outdoor exertion during high pollution episodes, or choose transit separated from traffic.'
        : isModerate
        ? 'Moderate ambient levels. Choose dedicated greenways or low-traffic residential corridors rather than arterial traffic lanes to limit particulate intake.'
        : isLow
        ? 'Ambient particulate levels are relatively low (< 30 µg/m³). Active commuting is generally viable under regional conditions. Personal exposure along specific routes still depends on immediate traffic density, route duration, and proximity to localized vehicle exhaust.'
        : null,
    },
    {
      mode: 'walking',
      displayName: 'Pedestrian Walking',
      category: 'Active Commute',
      emissionCategory: 'Very Low',
      environmentalImpact:
        'Illustrative Category: Very Low emissions. Pedestrian travel produces zero direct operational or tailpipe emissions.',
      exposureFactors:
        'Pedestrians travelling alongside busy roads can experience elevated roadside exhaust and road dust. Exposure varies with traffic density, distance from the roadway curb, and wind conditions.',
      physicalExertionLevel: 'Light',
      respiratorRecommended: isElevated,
      liveVerdict: isElevated
        ? 'Limit Arterial Road Walking'
        : isModerate
        ? 'Choose Low-Traffic Corridors'
        : isLow
        ? 'Pedestrian Walking Viable'
        : null,
      liveGuidance: isElevated
        ? 'Minimize prolonged walking along congested arterial roads during elevated pollution. If walking is necessary, maintain physical separation from the curb and consider wearing a certified N95 respirator.'
        : isModerate
        ? 'Moderate ambient levels. Route pedestrian travel through parks and interior residential lanes away from diesel corridors.'
        : isLow
        ? 'Ambient particulate concentrations are relatively low. Walking is viable for local trips; selecting routes away from heavy arterial traffic further reduces exposure to localized tailpipe emissions.'
        : null,
    },
  ];
}

/**
 * Returns key real-world microenvironmental determinants of personal commute exposure.
 */
export function getExposureDeterminants(): string[] {
  return [
    'Distance & Proximity to Traffic: Particulate concentrations are generally highest near traffic lanes and decline with physical separation, though dispersal varies with roadside barriers, wind, and street layout.',
    'Vehicle Enclosure & Recirculation: An enclosed cabin with closed windows and internal air recirculation can reduce particulate ingress in some situations, but protection varies with cabin filter efficiency, vehicle age, window seals, and HVAC maintenance; BreatheWise AI does not measure individual cabin air quality.',
    'Physical Exertion & Breathing Volume: Active cycling or walking increases breathing rate and inhaled air volume compared to resting transit, increasing overall respiratory particulate intake during elevated pollution episodes.',
    'Congestion & Stationary Idling: Stop-and-go traffic and idling queues concentrate toxic combustion byproducts (carbon monoxide, nitrogen dioxide, ultrafine black carbon).',
    'Travel Duration & Exposure: Total inhaled exposure depends on pollutant concentration, journey duration, and breathing rate. In some conditions, a shorter trip along lower-traffic corridors can reduce overall exposure compared to longer exposure times.',
    'Cabin Air Filtration: In-vehicle cabin filters (e.g. particulate or activated-carbon) vary widely in performance and degrade over time. Clogged, degraded, or basic filters allow external particulates into the passenger compartment.',
  ];
}

/**
 * Evaluates commute alternatives against verified ambient outdoor telemetry.
 * Strictly fail-closed: unverified, stale, simulated demo, unknown source,
 * or missing PM2.5 telemetry suppresses condition-dependent recommendations.
 */
export function evaluateCommuteAlternatives(
  aqData: CurrentAirQualityData | null | undefined,
  isLive: boolean
): AlternativesEvaluationResult {
  const provenance = determineTelemetryProvenance(aqData?.provenance, isLive);

  // Extract PM2.5 and PM10
  const pm25Raw = aqData?.pollutants?.['PM2.5']?.concentration;
  const pm10Raw = aqData?.pollutants?.['PM10']?.concentration;
  const pm25 = isValidPollutant(pm25Raw) ? pm25Raw : null;
  const pm10 = isValidPollutant(pm10Raw) ? pm10Raw : null;

  const naqiCategory = aqData?.category || 'Unavailable';

  const outdoorDisclosure =
    'All environmental readings shown represent outdoor ambient air quality near the selected monitoring station. The assistant does not measure private in-cabin vehicle air, route-level IoT sensors, or dynamic traffic congestion.';

  // Check if live verified
  const isDemo = !isLive || provenance.tag === 'Demo' || aqData?.provenance?.dataSource === 'SIMULATED_DEMO';
  const isStale = provenance.isStale;
  const isUnknownSource = provenance.tag === 'Unverified';
  const isLiveVerified = isLive && !isStale && !isDemo && !isUnknownSource;

  const exposureDeterminants = getExposureDeterminants();

  // GATING: Fail closed if unverified, demo, stale, unknown source, or missing PM2.5
  if (!isLiveVerified || pm25 === null) {
    let reason = 'Real-time ambient air quality telemetry is unavailable.';
    if (isDemo) {
      reason = 'Operating in simulated demonstration mode. Real-time condition-dependent commute recommendations are suspended.';
    } else if (isUnknownSource) {
      reason = 'Outdoor telemetry source is unverified. Current-condition commute recommendations are withheld.';
    } else if (isStale) {
      reason = 'Outdoor ambient telemetry is stale or expired (>180 minutes old). Current-condition commute recommendations are suspended to prevent misguidance.';
    } else if (pm25 === null) {
      reason = 'Outdoor fine particulate (PM2.5) concentration is unavailable. Reliable commute exposure assessments require particulate measurements.';
    }

    return {
      status: 'telemetry_insufficient',
      verdictTitle: 'TELEMETRY INSUFFICIENT',
      badgeVariant: 'neutral',
      explanation: `${reason} General educational commute comparison factors remain accessible below.`,
      isLiveVerified: false,
      provenance,
      pm25Concentration: pm25,
      pm10Concentration: pm10,
      naqiCategory,
      outdoorDisclosure,
      modes: getEducationalCommuteModes(null, false),
      exposureDeterminants,
    };
  }

  // Elevated exposure scenario (PM2.5 >= 60 µg/m³) - aligns with backend deterministic safety
  if (pm25 >= 60.0) {
    return {
      status: 'elevated_exposure_risk',
      verdictTitle: 'PRIORITIZE ENCLOSED TRANSIT',
      badgeVariant: 'danger',
      explanation:
        'Ambient fine particulate levels are elevated (PM2.5 ≥ 60 µg/m³). Prioritize enclosed transit options separated from traffic (such as Metro rail or enclosed vehicles with closed windows and internal recirculation). Strenuous active travel along arterial corridors increases overall respiratory particulate intake; if open roadside transit is necessary, wearing a certified, well-fitted N95 respirator is advised.',
      isLiveVerified: true,
      provenance,
      pm25Concentration: pm25,
      pm10Concentration: pm10,
      naqiCategory,
      outdoorDisclosure,
      modes: getEducationalCommuteModes(pm25, true),
      exposureDeterminants,
    };
  }

  // Favorable scenario (PM2.5 < 30 µg/m³)
  if (pm25 < 30.0) {
    return {
      status: 'conditional_active_viable',
      verdictTitle: 'ACTIVE & MASS TRANSIT VIABLE',
      badgeVariant: 'success',
      explanation:
        'Outdoor ambient particulate concentrations are relatively low (< 30 µg/m³ at the monitoring station). Active commuting (cycling, walking) and mass transit options are viable under regional conditions. Note that regional station data does not measure microscale roadside exhaust, unmeasured pollutants, or localized traffic congestion; choosing routes with lower vehicle traffic and physical separation from heavy traffic remains prudent.',
      isLiveVerified: true,
      provenance,
      pm25Concentration: pm25,
      pm10Concentration: pm10,
      naqiCategory,
      outdoorDisclosure,
      modes: getEducationalCommuteModes(pm25, true),
      exposureDeterminants,
    };
  }

  // Moderate exposure scenario (PM2.5 in [30.0, 60.0))
  return {
    status: 'moderate_exposure_risk',
    verdictTitle: 'SELECTIVE COMMUTE PLANNING',
    badgeVariant: 'warning',
    explanation:
      'Ambient particulate concentrations are moderate (30–60 µg/m³). Mass transit and enclosed travel remain favorable. For active commuters, route selection away from high-density arterial roads reduces direct tailpipe inhalation.',
    isLiveVerified: true,
    provenance,
    pm25Concentration: pm25,
    pm10Concentration: pm10,
    naqiCategory,
    outdoorDisclosure,
    modes: getEducationalCommuteModes(pm25, true),
    exposureDeterminants,
  };
}
