/**
 * Centralized API client connecting React Frontend to FastAPI Backend.
 * Supports live Open-Meteo modelled telemetry, OpenAQ physical observations,
 * and graceful fallback to simulated demo scenarios when offline.
 */
import { CurrentAirQualityData, PollutantDetail } from '../types/airQuality';
import { AIInsightResponse, ActivityContext } from '../types/ai';
import { MOCK_AIR_QUALITY_DATA } from './mockData';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const DEFAULT_DEMO_INSIGHTS: AIInsightResponse = {
  location: {
    latitude: 28.65,
    longitude: 77.25,
    name: 'Delhi Anand Vihar (Demo Scenario)'
  },
  activity_context: 'GENERAL',
  status: 'SIMULATED_DEMO_INSIGHT',
  model_id: null,
  prompt_version: 'v1.0.0',
  generated_at: new Date().toISOString(),
  summary: 'Illustrative winter condition demo: elevated particulate levels under boundary layer stagnation.',
  explanation: 'Curated scenario showing simulated particulate exposure and boundary layer dynamics. Start backend with GEMINI_API_KEY to generate live AI insights.',
  supporting_factors: [
    'Simulated PM2.5 elevation',
    'Low boundary layer mixing ceiling',
    'Deterministic safety guardrails verified'
  ],
  recommended_actions: [
    {
      action_id: 'ACT-PROTECT-N95-STREET',
      category: 'PERSONAL_PROTECTION',
      priority: 'HIGH',
      title: 'Wear a certified N95 or FFP2 respirator for outdoor street transit',
      rationale: 'Filters fine particulates effectively during roadside pedestrian travel.',
      evidence_ids: ['EVID-PM25']
    },
    {
      action_id: 'ACT-VENT-PURIFY-HEPA',
      category: 'INDOOR_AIR',
      priority: 'HIGH',
      title: 'Operate mechanical HEPA air filtration continuously in recirculating mode',
      rationale: 'Maintains clean indoor breathing baseline without generating secondary ozone.',
      evidence_ids: ['EVID-PM25']
    },
    {
      action_id: 'ACT-COMMUTE-REDUCE-EXPOSURE',
      category: 'COMMUTE',
      priority: 'MEDIUM',
      title: 'Prioritize enclosed transit with filtered air over open roadside commuting',
      rationale: 'Avoids direct breathing of fresh tailpipe emissions along heavy diesel corridors.',
      evidence_ids: ['EVID-PM25']
    }
  ],
  evidence_context: {
    'EVID-PM25': {
      evidence_id: 'EVID-PM25',
      parameter: 'Fine Particulates (PM2.5)',
      value: '218.4',
      unit: 'µg/m³',
      classification: 'SIMULATED_DEMO',
      freshness: 'FRESH',
      context_note: 'Curated demonstration scenario.'
    }
  },
  source_classification: 'SIMULATED_DEMO',
  quality_status: 'SIMULATED_SCENARIO',
  retrieval_freshness: 'FRESH',
  limitations: ['Curated demonstration scenario; start backend for live environmental data.'],
  fallback_reason: 'Backend offline; operating in simulated demonstration mode.'
};

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

  async fetchAIInsights(
    lat: number,
    lon: number,
    activityContext: ActivityContext = 'GENERAL'
  ): Promise<AIInsightResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/ai/insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: lat,
          longitude: lon,
          activity_context: activityContext
        })
      });
      if (!res.ok) {
        throw new Error(`AI insights request failed with HTTP ${res.status}`);
      }
      return await res.json();
    } catch {
      // Graceful fallback to curated demo scenario when backend is offline or errors
      return {
        ...DEFAULT_DEMO_INSIGHTS,
        location: {
          latitude: lat,
          longitude: lon,
          name: `${lat.toFixed(2)}, ${lon.toFixed(2)} (Demo Scenario)`
        }
      };
    }
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
