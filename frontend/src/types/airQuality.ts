export type AQICategory =
  | 'Good'
  | 'Satisfactory'
  | 'Moderate'
  | 'Poor'
  | 'Very Poor'
  | 'Severe';

export type DataSourceProvenance =
  | 'CPCB_OFFICIAL'
  | 'OPENAQ_V3'
  | 'OPEN_METEO_MODELLED'
  | 'SIMULATED_DEMO';

export interface StationMetadata {
  id: string;
  name: string;
  distanceMeters?: number;
  city?: string;
  state?: string;
  coordinates: {
    lat: number;
    lon: number;
  };
}

export interface PollutantDetail {
  code: 'PM2.5' | 'PM10' | 'NO2' | 'SO2' | 'CO' | 'O3' | 'NH3' | 'Pb' | string;
  name: string;
  concentration: number;
  unit: string;
  subIndex: number | null;
  category: AQICategory | null;
  whoExceedanceMultiple?: number;
  source?: string;
}

export interface WeatherTelemetry {
  temperatureC: number;
  relativeHumidity: number;
  windSpeedKmh: number;
  windDirectionDegrees: number;
  windDirectionCardinal: string;
  boundaryLayerHeightMeters: number;
  stagnationRisk: 'Low' | 'Moderate' | 'Elevated' | 'Unknown';
  dispersionConditions: 'Favorable' | 'Moderate' | 'Potentially Unfavorable' | 'Unknown';
  stagnationDescription: string;
  sourceAttribution?: string;
}

export interface HourlyForecastItem {
  time: string;           // ISO format or formatted time e.g., "14:00"
  modelledAqiEstimate: number | null;
  category?: AQICategory | 'Unavailable';
  pm25Modelled?: number;
  pm10Modelled?: number;
  windSpeedKmh?: number;
}

export interface CurrentAirQualityData {
  aqi: number | null;
  category: AQICategory | 'Unavailable' | null;
  dominantPollutant?: string | null;
  dominantPollutantMethodology?: string | null;
  dominantPollutantReason?: string | null;
  indianNaqiUnavailableReason?: string | null;
  station: StationMetadata;
  provenance: {
    dataSource: DataSourceProvenance | string;
    qualityStatus: 'VERIFIED_OFFICIAL' | 'UNVERIFIED_SENSOR' | 'MODELLED_APPROXIMATION' | 'SIMULATED_SCENARIO' | 'UNAVAILABLE';
    recordedAt: string;
    retrievedAt?: string;
    forecastTimestamp?: string | null;
    observedAt?: string | null;
    modelRunTimestamp?: string | null;
    modelDataAvailableAt?: string | null;
    freshnessMinutes?: number;
    freshnessStatus?: string;
    retrievalFreshness?: string;
    modelRunFreshness?: string;
    observationAgeMinutes?: number | null;
    observationFreshness?: string | null;
    forecastValidity?: string;
    indexSystem: string;
    sourceAttribution?: string;
    limitations?: string[];
  };
  healthAdvisory: {
    summary: string;
    maskRecommendation: string;
    outdoorActivityLevel: string;
  };
  pollutants: Record<string, PollutantDetail>;
  weather: WeatherTelemetry;
  forecast: HourlyForecastItem[];
}
