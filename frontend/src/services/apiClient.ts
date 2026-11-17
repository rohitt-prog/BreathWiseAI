/**
 * Centralized API client connecting React Frontend to FastAPI Backend.
 * Supports live Open-Meteo modelled telemetry, OpenAQ physical observations,
 * and graceful fallback to simulated demo scenarios when offline.
 */
import { CurrentAirQualityData, PollutantDetail } from '../types/airQuality';
import { MOCK_AIR_QUALITY_DATA } from './mockData';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export interface ProviderStatus {
  provider_id: string;
  name: string;
  configured: boolean;
  status: string;
  classification: string;
  description: string;
  coverage: string;
  notes: string;
}

export interface ProvidersStatusResponse {
  retrieved_at: string;
  providers: ProviderStatus[];
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async checkHealth(): Promise<{ status: string; service: string; version: string; providers: Record<string, string> }> {
    const res = await fetch(`${this.baseUrl}/health`);
    if (!res.ok) {
      throw new Error(`Health check failed with HTTP ${res.status}`);
    }
    return res.json();
  }

  async getProvidersStatus(): Promise<ProvidersStatusResponse> {
    const res = await fetch(`${this.baseUrl}/api/v1/providers/status`);
    if (!res.ok) {
      throw new Error(`Failed to fetch provider status: HTTP ${res.status}`);
    }
    return res.json();
  }

  async getCurrentAirQuality(lat: number, lon: number): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/air-quality/current?latitude=${lat}&longitude=${lon}`);
    if (!res.ok) {
      throw new Error(`Air quality request failed with HTTP ${res.status}`);
    }
    return res.json();
  }

  async getCurrentWeather(lat: number, lon: number): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/weather/current?latitude=${lat}&longitude=${lon}`);
    if (!res.ok) {
      throw new Error(`Weather request failed with HTTP ${res.status}`);
    }
    return res.json();
  }

  async getForecast(lat: number, lon: number): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/air-quality/forecast?latitude=${lat}&longitude=${lon}`);
    if (!res.ok) {
      throw new Error(`Forecast request failed with HTTP ${res.status}`);
    }
    return res.json();
  }

  /**
   * Unified telemetry resolver with deterministic fallback to simulated demo scenarios.
   * If the backend is running, transforms validated telemetry into frontend contract.
   * If the backend is offline or times out, gracefully falls back to mock demo data.
   */
  async resolveAirQualityData(
    locationId: string,
    coordinates: { lat: number; lon: number },
    forceDemoMode: boolean = false
  ): Promise<{ data: CurrentAirQualityData; isLive: boolean }> {
    if (forceDemoMode) {
      const mock = MOCK_AIR_QUALITY_DATA[locationId] || MOCK_AIR_QUALITY_DATA['del_anand_vihar'];
      return { data: mock, isLive: false };
    }

    try {
      const [aqRes, weatherRes, forecastRes] = await Promise.all([
        this.getCurrentAirQuality(coordinates.lat, coordinates.lon),
        this.getCurrentWeather(coordinates.lat, coordinates.lon),
        this.getForecast(coordinates.lat, coordinates.lon)
      ]);

      // Transform backend pollutants to frontend PollutantDetail dictionary
      const transformedPollutants: Record<string, PollutantDetail> = {};
      if (aqRes.available_pollutants) {
        for (const [code, p] of Object.entries<any>(aqRes.available_pollutants)) {
          transformedPollutants[code] = {
            code,
            name: p.name,
            concentration: p.concentration,
            unit: p.unit,
            subIndex: p.sub_index ?? null,
            category: p.category ?? null,
            source: p.source
          };
        }
      }

      // Map transformed hourly forecast
      const transformedForecast = (forecastRes.hourly_forecast || []).slice(0, 8).map((pt: any) => ({
        time: new Date(pt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
        modelledAqiEstimate: pt.modelled_aqi_estimate ?? null,
        category: 'Unavailable' as const,
        pm25Modelled: pt.pm2_5 ?? undefined,
        pm10Modelled: pt.pm10 ?? undefined
      }));

      const transformed: CurrentAirQualityData = {
        aqi: aqRes.indian_naqi, // Strictly null if unverified official NAQI
        category: aqRes.indian_naqi_category ?? 'Unavailable',
        dominantPollutant: aqRes.dominant_pollutant ?? null,
        dominantPollutantMethodology: aqRes.dominant_pollutant_methodology ?? null,
        dominantPollutantReason: aqRes.dominant_pollutant_reason ?? null,
        indianNaqiUnavailableReason: aqRes.indian_naqi_unavailable_reason,
        station: {
          id: locationId,
          name: aqRes.location?.name || `${coordinates.lat.toFixed(2)}, ${coordinates.lon.toFixed(2)}`,
          coordinates: { lat: coordinates.lat, lon: coordinates.lon }
        },
        provenance: {
          dataSource: aqRes.source_type,
          qualityStatus: aqRes.quality_status,
          recordedAt: aqRes.observed_at || aqRes.forecast_timestamp || aqRes.retrieved_at,
          retrievedAt: aqRes.retrieved_at,
          forecastTimestamp: aqRes.forecast_timestamp,
          observedAt: aqRes.observed_at,
          modelRunTimestamp: aqRes.model_run_timestamp,
          modelDataAvailableAt: aqRes.model_data_available_at,
          retrievalFreshness: aqRes.retrieval_freshness,
          modelRunFreshness: aqRes.model_run_freshness,
          observationAgeMinutes: aqRes.observation_age_minutes,
          observationFreshness: aqRes.observation_freshness,
          forecastValidity: aqRes.forecast_validity,
          indexSystem: aqRes.source_attribution,
          sourceAttribution: aqRes.source_attribution,
          limitations: aqRes.limitations
        },
        healthAdvisory: {
          summary: aqRes.indian_naqi
            ? `National AQI is ${aqRes.indian_naqi} (${aqRes.indian_naqi_category}).`
            : 'Official Indian NAQI unavailable. Open-Meteo CAMS atmospheric composition models report elevated fine particulate levels.',
          maskRecommendation: 'Sealed N95 / FFP2 respirator recommended when outdoor PM2.5 concentrations are elevated.',
          outdoorActivityLevel: 'Limit prolonged outdoor cardiovascular exertion during stagnant atmospheric conditions.'
        },
        pollutants: transformedPollutants,
        weather: {
          temperatureC: weatherRes.temperature_c ?? 20.0,
          relativeHumidity: weatherRes.relative_humidity ?? 60,
          windSpeedKmh: weatherRes.wind_speed_kmh ?? 5.0,
          windDirectionDegrees: weatherRes.wind_direction_degrees ?? 270,
          windDirectionCardinal: weatherRes.wind_direction_cardinal ?? 'W',
          boundaryLayerHeightMeters: weatherRes.boundary_layer_height_meters ?? 250,
          stagnationRisk: (weatherRes.stagnation_risk as any) || 'Moderate',
          dispersionConditions: (weatherRes.dispersion_conditions as any) || 'Moderate',
          stagnationDescription: weatherRes.stagnation_description || 'Atmospheric dispersion conditions monitored.',
          sourceAttribution: weatherRes.source_attribution
        },
        forecast: transformedForecast
      };

      return { data: transformed, isLive: true };

    } catch (err) {
      // Graceful fallback to demo scenario when backend is unavailable (strictly tagged SIMULATED_DEMO)
      const baseMock = MOCK_AIR_QUALITY_DATA[locationId] || MOCK_AIR_QUALITY_DATA['del_anand_vihar'];
      const mock: CurrentAirQualityData = {
        ...baseMock,
        provenance: {
          ...baseMock.provenance,
          dataSource: 'SIMULATED_DEMO'
        }
      };
      return { data: mock, isLive: false };
    }
  }
}

export const apiClient = new ApiClient();
