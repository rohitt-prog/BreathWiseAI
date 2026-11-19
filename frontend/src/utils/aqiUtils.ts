import { AQICategory, CurrentAirQualityData } from '../types/airQuality';
import {
  CheckCircle2,
  Smile,
  AlertTriangle,
  AlertCircle,
  ShieldAlert,
  Skull,
  HelpCircle,
  LucideIcon
} from 'lucide-react';

export interface AQIMetadata {
  category: AQICategory | 'Unavailable';
  range: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  badgeClass: string;
  hexCode: string;
  icon: LucideIcon;
  nonColorLabel: string;
  healthSummary: string;
}

export function getAQIMetadata(aqi: number | null | undefined): AQIMetadata {
  const isInvalid =
    aqi === null ||
    aqi === undefined ||
    typeof aqi !== 'number' ||
    !Number.isFinite(aqi) ||
    aqi < 0 ||
    aqi > 500;

  if (isInvalid) {
    const isOutOfRange =
      typeof aqi === 'number' && (!Number.isFinite(aqi) || aqi < 0 || aqi > 500);
    return {
      category: 'Unavailable',
      range: isOutOfRange ? 'Invalid AQI Value' : 'Awaiting CPCB Verification',
      bgClass: 'bg-slate-500',
      textClass: 'text-white',
      borderClass: 'border-slate-400',
      badgeClass: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700',
      hexCode: '#64748B',
      icon: HelpCircle,
      nonColorLabel: isOutOfRange ? 'Invalid AQI' : 'Official NAQI Unavailable (Modelled Telemetry Only)',
      healthSummary: isOutOfRange
        ? 'AQI value is invalid, negative, or out of the standard 0–500 Indian NAQI range.'
        : 'Official Indian NAQI is unavailable because certified physical ground station observations from CPCB are not connected. Atmospheric chemistry model forecasts are available below.',
    };
  }

  if (aqi <= 50) {
    return {
      category: 'Good',
      range: '0 - 50',
      bgClass: 'bg-emerald-600',
      textClass: 'text-white',
      borderClass: 'border-emerald-600',
      badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 border-emerald-300',
      hexCode: '#16A34A',
      icon: CheckCircle2,
      nonColorLabel: 'Good (Minimal Impact)',
      healthSummary: 'Air quality is satisfactory, and air pollution poses little or no risk.',
    };
  }
  if (aqi <= 100) {
    return {
      category: 'Satisfactory',
      range: '51 - 100',
      bgClass: 'bg-lime-600',
      textClass: 'text-white',
      borderClass: 'border-lime-600',
      badgeClass: 'bg-lime-100 text-lime-900 dark:bg-lime-950 dark:text-lime-200 border-lime-300',
      hexCode: '#65A30D',
      icon: Smile,
      nonColorLabel: 'Satisfactory (Minor Discomfort for Sensitive Persons)',
      healthSummary: 'May cause minor breathing discomfort to sensitive people.',
    };
  }
  if (aqi <= 200) {
    return {
      category: 'Moderate',
      range: '101 - 200',
      bgClass: 'bg-amber-500',
      textClass: 'text-slate-900',
      borderClass: 'border-amber-500',
      badgeClass: 'bg-amber-100 text-amber-950 dark:bg-amber-900/40 dark:text-amber-200 border-amber-300',
      hexCode: '#CA8A04',
      icon: AlertTriangle,
      nonColorLabel: 'Moderate (Breathing Discomfort for Asthma/Heart Patients)',
      healthSummary: 'May cause breathing discomfort to people with lung disease, asthma and heart disease.',
    };
  }
  if (aqi <= 300) {
    return {
      category: 'Poor',
      range: '201 - 300',
      bgClass: 'bg-orange-600',
      textClass: 'text-white',
      borderClass: 'border-orange-600',
      badgeClass: 'bg-orange-100 text-orange-950 dark:bg-orange-950 dark:text-orange-200 border-orange-300',
      hexCode: '#EA580C',
      icon: AlertCircle,
      nonColorLabel: 'Poor (Discomfort on Prolonged Exposure)',
      healthSummary: 'May cause breathing discomfort to most people on prolonged exposure.',
    };
  }
  if (aqi <= 400) {
    return {
      category: 'Very Poor',
      range: '301 - 400',
      bgClass: 'bg-red-600',
      textClass: 'text-white',
      borderClass: 'border-red-600',
      badgeClass: 'bg-red-100 text-red-950 dark:bg-red-950 dark:text-red-200 border-red-300',
      hexCode: '#DC2626',
      icon: ShieldAlert,
      nonColorLabel: 'Very Poor (Respiratory Illness Hazard)',
      healthSummary: 'May cause respiratory illness on prolonged exposure. Pronounced effect on people with lung/heart diseases.',
    };
  }
  return {
    category: 'Severe',
    range: '401 - 500',
    bgClass: 'bg-red-900',
    textClass: 'text-red-50',
    borderClass: 'border-red-900',
    badgeClass: 'bg-red-200 text-red-950 dark:bg-red-950 dark:text-red-100 border-red-500',
    hexCode: '#7F1D1D',
    icon: Skull,
    nonColorLabel: 'Severe (Affects Healthy People, Seriously Impacts Patients)',
    healthSummary: 'Affects healthy people and seriously impacts those with existing respiratory diseases.',
  };
}

export function isValidNumericConcentration(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val >= 0;
}

export function formatConcentration(val: number, unit: string): string {
  return `${Math.round(val * 10) / 10} ${unit}`;
}

export interface ProvenanceDisplayInfo {
  tag: string;
  isStale: boolean;
  statusLabel: string;
}

/**
 * Evaluates telemetry provenance and temporal freshness tiers using
 * documented backend classifications.
 *
 * Distinguishes:
 * - Fresh modelled telemetry ('Modelled')
 * - Stale modelled telemetry ('Stale Modelled')
 * - Fresh physical sensor observations ('Live Sensor')
 * - Stale physical sensor observations ('Stale Sensor')
 * - Simulated demo fallback ('Demo')
 *
 * Rule: Missing freshness metadata is never treated as proof of freshness.
 */
export function determineTelemetryProvenance(
  provenance: CurrentAirQualityData['provenance'] | undefined | null,
  isLive: boolean
): ProvenanceDisplayInfo {
  if (!isLive || !provenance || provenance.dataSource === 'SIMULATED_DEMO') {
    return { tag: 'Demo', isStale: false, statusLabel: 'Simulated Demo' };
  }

  if (provenance.isVerified === false) {
    return { tag: 'Unverified', isStale: true, statusLabel: 'Unverified Telemetry' };
  }

  const dataSource = provenance.dataSource;
  const isObservation =
    dataSource === 'OBSERVATION' ||
    dataSource === 'CPCB_OFFICIAL' ||
    dataSource === 'OPENAQ_V3';
  const isModelled =
    dataSource === 'MODELLED_FORECAST' ||
    dataSource === 'OPEN_METEO_MODELLED';

  if (isObservation) {
    const obsFreshness = provenance.observationFreshness;
    const retFreshness = provenance.retrievalFreshness;

    // Fresh physical observation requires BOTH observation and retrieval to be explicitly FRESH or RECENT
    const hasValidObsFreshness = obsFreshness === 'FRESH' || obsFreshness === 'RECENT';
    const hasValidRetrieval = retFreshness === 'FRESH' || retFreshness === 'RECENT';

    const isObsFresh = hasValidObsFreshness && hasValidRetrieval;

    if (isObsFresh) {
      return { tag: 'Live Sensor', isStale: false, statusLabel: 'Live Ground Sensor' };
    }
    return { tag: 'Stale Sensor', isStale: true, statusLabel: 'Stale Ground Sensor' };
  }

  if (isModelled) {
    const retFreshness = provenance.retrievalFreshness;
    const forecastValidity = provenance.forecastValidity;
    const modelRunFreshness = provenance.modelRunFreshness;

    // Explicit stale or invalid indicators
    const hasStaleIndicator =
      retFreshness === 'STALE' ||
      retFreshness === 'INVALID' ||
      retFreshness === 'NOT_CONFIGURED' ||
      forecastValidity === 'HISTORICAL_PERIOD' ||
      modelRunFreshness === 'STALE' ||
      modelRunFreshness === 'INVALID';

    // Positive freshness verification (missing metadata is never proof of freshness)
    const hasValidRetrieval = retFreshness === 'FRESH' || retFreshness === 'RECENT';
    const hasValidForecast = forecastValidity === 'CURRENT_PERIOD' || forecastValidity === 'FUTURE_PERIOD';

    const isFreshModel = !hasStaleIndicator && hasValidRetrieval && hasValidForecast;

    if (isFreshModel) {
      return { tag: 'Modelled', isStale: false, statusLabel: 'Regional Atmospheric Model' };
    }
    return { tag: 'Stale Modelled', isStale: true, statusLabel: 'Stale Atmospheric Model' };
  }

  // Unrecognized data source: conservative fail-closed classification
  return { tag: 'Unverified', isStale: true, statusLabel: 'Unverified Telemetry' };
}
