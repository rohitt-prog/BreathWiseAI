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
  distanceMeters: number;
  city: string;
  state: string;
  coordinates: {
    lat: number;
    lon: number;
  };
}

export interface PollutantDetail {
  code: 'PM2.5' | 'PM10' | 'NO2' | 'SO2' | 'CO' | 'O3' | 'NH3' | 'Pb';
  name: string;
  concentration: number;
  unit: string;
  subIndex: number | null;
  category: AQICategory | null;
  whoExceedanceMultiple?: number;
}

export interface WeatherTelemetry {
  temperatureC: number;
  relativeHumidity: number;
  windSpeedKmh: number;
  windDirectionDegrees: number;
  windDirectionCardinal: string;
  boundaryLayerHeightMeters: number;
  inversionRisk: 'Low' | 'Moderate' | 'Severe';
  stagnationDescription: string;
}

export interface HourlyForecastItem {
  time: string;           // ISO format or formatted time e.g., "14:00"
  modelledAqiEstimate: number;
  category: AQICategory;
  pm25Modelled: number;
  pm10Modelled: number;
  windSpeedKmh: number;
}

export interface CurrentAirQualityData {
  aqi: number;
  category: AQICategory;
  dominantPollutant: 'PM2.5' | 'PM10' | 'NO2' | 'SO2' | 'CO' | 'O3';
  station: StationMetadata;
  provenance: {
    dataSource: DataSourceProvenance;
    qualityStatus: 'VERIFIED_OFFICIAL' | 'UNVERIFIED_SENSOR' | 'MODELLED_APPROXIMATION' | 'SIMULATED_SCENARIO';
    recordedAt: string;
    freshnessMinutes: number;
    indexSystem: string;
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
