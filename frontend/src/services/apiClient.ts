/**
 * Centralized API client connecting React Frontend to FastAPI Backend.
 * Supports live Open-Meteo modelled telemetry, OpenAQ physical observations,
 * and graceful fallback to simulated demo scenarios when offline.
 */
import {
  CurrentAirQualityData,
  PollutantDetail,
  AirQualityForecastResponse,
  HourlyForecastPoint,
  ForecastQueryResult,
  GeocodingResult
} from '../types/airQuality';
import { isValidCoordinate } from '../hooks/useAirQualityForecastQuery';
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
  summary: 'Demonstration scenario: illustrative simulated particulate values.',
  explanation: 'Curated scenario showing simulated particulate exposure. Start backend with GEMINI_API_KEY to generate live AI insights.',
  supporting_factors: [
    'Simulated PM2.5 elevation',
    'Illustrative demonstration scenario',
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

export function getMockForecastResponse(
  locationId: string,
  coordinates: { lat: number; lon: number }
): AirQualityForecastResponse {
  const baseMock = MOCK_AIR_QUALITY_DATA[locationId] || MOCK_AIR_QUALITY_DATA['del_anand_vihar'];
  const now = new Date();
  const hourlyPoints: HourlyForecastPoint[] = [];
  const startHour = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), 0, 0));

  for (let i = 0; i < 24; i++) {
    const ptDate = new Date(startHour.getTime() + i * 3600 * 1000);
    const utcHour = ptDate.getUTCHours();

    let pm25 = 140;
    let pm10 = 230;
    let aqiEst = 195;

    if (utcHour >= 6 && utcHour < 11) {
      pm25 = 185 + (i % 3) * 10;
      pm10 = 290 + (i % 3) * 15;
      aqiEst = 235;
    } else if (utcHour >= 11 && utcHour < 16) {
      pm25 = 75 + (i % 3) * 5;
      pm10 = 140 + (i % 3) * 10;
      aqiEst = 155;
    } else if (utcHour >= 16 && utcHour < 21) {
      pm25 = 165 + (i % 3) * 10;
      pm10 = 265 + (i % 3) * 15;
      aqiEst = 215;
    } else {
      pm25 = 195 + (i % 3) * 8;
      pm10 = 315 + (i % 3) * 12;
      aqiEst = 245;
    }

    hourlyPoints.push({
      timestamp: ptDate.toISOString(),
      modelled_aqi_estimate: aqiEst,
      pm2_5: pm25,
      pm10: pm10,
      nitrogen_dioxide: 45.0,
      sulphur_dioxide: 18.0,
      ozone: 32.0,
      data_classification: 'SIMULATED_DEMO'
    });
  }

  return {
    location: {
      latitude: coordinates.lat,
      longitude: coordinates.lon,
      name: baseMock?.station?.name || `${coordinates.lat.toFixed(2)}, ${coordinates.lon.toFixed(2)} (Demo Scenario)`
    },
    provider: 'Open-Meteo CAMS Modelled Data (Simulated Demo)',
    source_type: 'SIMULATED_DEMO',
    retrieved_at: now.toISOString(),
    model_run_timestamp: null,
    model_data_available_at: null,
    retrieval_freshness: 'FRESH',
    model_run_freshness: 'UNAVAILABLE',
    hourly_forecast: hourlyPoints,
    source_attribution: 'Open-Meteo CAMS Modelled Data (Simulated Demo Scenario)',
    limitations: ['Curated demonstration scenario. Not live environmental observations. No actionable personal safety recommendations or ventilation directives are generated from synthetic data.']
  };
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

  async getForecast(lat: number, lon: number, hours?: number): Promise<AirQualityForecastResponse> {
    const url = hours
      ? `${this.baseUrl}/api/v1/air-quality/forecast?latitude=${lat}&longitude=${lon}&hours=${hours}`
      : `${this.baseUrl}/api/v1/air-quality/forecast?latitude=${lat}&longitude=${lon}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Forecast request failed with HTTP ${res.status}`);
    }
    return res.json();
  }

  /**
   * Searches global locations using Open-Meteo Geocoding API.
   * Enforces input trimming, minimum length (>= 2 chars), 8s timeout,
   * coordinate validation, and duplicate filtering.
   */
  async searchLocations(
    query: string,
    signal?: AbortSignal
  ): Promise<GeocodingResult[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return [];
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const onCallerAbort = () => controller.abort();
    if (signal) {
      signal.addEventListener('abort', onCallerAbort);
    }

    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        trimmed
      )}&count=10&language=en&format=json`;

      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        throw new Error(`Location search request failed with HTTP ${res.status}`);
      }

      const data = await res.json();
      const rawResults = Array.isArray(data?.results) ? data.results : [];

      const validResults: GeocodingResult[] = [];
      const seen = new Set<string>();

      for (const item of rawResults) {
        if (!item || typeof item !== 'object') continue;
        const lat = typeof item.latitude === 'number' ? item.latitude : parseFloat(item.latitude);
        const lon = typeof item.longitude === 'number' ? item.longitude : parseFloat(item.longitude);

        if (!isValidCoordinate(lat, lon)) {
          continue;
        }

        const name = String(item.name || '').trim();
        const country = item.country ? String(item.country).trim() : undefined;
        const admin1 = item.admin1 ? String(item.admin1).trim() : undefined;
        const admin2 = item.admin2 ? String(item.admin2).trim() : undefined;

        // Deduplication key by rounded coordinate and name
        const dedupKey = `${name.toLowerCase()}_${country?.toLowerCase() || ''}_${admin1?.toLowerCase() || ''}_${lat.toFixed(2)}_${lon.toFixed(2)}`;
        if (seen.has(dedupKey)) {
          continue;
        }
        seen.add(dedupKey);

        const displayParts = [name, admin1, country].filter(Boolean);

        validResults.push({
          id: item.id ?? `${lat}_${lon}`,
          name,
          latitude: lat,
          longitude: lon,
          country,
          countryCode: item.country_code,
          admin1,
          admin2,
          postcodes: Array.isArray(item.postcodes) ? item.postcodes : undefined,
          displayName: displayParts.join(', '),
        });
      }

      return validResults;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        if (signal?.aborted) {
          // Re-throw raw AbortError when cancellation originates from caller's AbortSignal
          throw err;
        }
        // Distinguish internal 8-second timeout from caller cancellation
        throw new Error('Location search request timed out after 8 seconds. Please try again.');
      }
      throw new Error(err.message || 'Failed to search locations.');
    } finally {
      clearTimeout(timeoutId);
      if (signal) {
        signal.removeEventListener('abort', onCallerAbort);
      }
    }
  }

  /**
   * Resolves hourly forecast data with transparent provenance, strict fail-closed
   * freshness validation, and optional demo fallback. Re-throws API errors for deterministic UI error states.
   */
  async resolveForecastData(
    locationId: string,
    coordinates: { lat: number; lon: number },
    options: { forceDemoMode?: boolean } = {}
  ): Promise<ForecastQueryResult> {
    if (options.forceDemoMode) {
      return {
        data: getMockForecastResponse(locationId, coordinates),
        isLive: false,
        isDemo: true,
        isStale: false,
        isUnknownSource: false
      };
    }

    const response = await this.getForecast(coordinates.lat, coordinates.lon);

    // Strict positive validation for retrieval freshness:
    // Only 'FRESH' or 'RECENT' qualify as fresh retrieval.
    // Missing, undefined, null, 'STALE', 'INVALID', 'NOT_CONFIGURED', or any unrecognized string fail closed to stale.
    const isRetrievalFresh =
      response.retrieval_freshness === 'FRESH' || response.retrieval_freshness === 'RECENT';

    // Strict positive validation for model run freshness:
    // 'FRESH', 'RECENT', or 'UNAVAILABLE' (for providers that do not expose model run timestamp) qualify.
    // Missing, undefined, null, 'STALE', 'INVALID', or any unrecognized string fail closed to stale.
    const isModelRunFresh =
      response.model_run_freshness === 'FRESH' ||
      response.model_run_freshness === 'RECENT' ||
      response.model_run_freshness === 'UNAVAILABLE';

    const isStale = !isRetrievalFresh || !isModelRunFresh;

    // Strict positive validation for source classification:
    // Do not silently classify unknown source types as live.
    const isKnownModelledSource =
      response.source_type === 'MODELLED_FORECAST' ||
      response.source_type === 'OPEN_METEO_MODELLED';
    const isKnownObservationSource =
      response.source_type === 'OBSERVATION' ||
      response.source_type === 'OPENAQ_V3';
    const isDemo = response.source_type === 'SIMULATED_DEMO';

    const isLive = (isKnownModelledSource || isKnownObservationSource) && !isDemo;
    const isUnknownSource = !isLive && !isDemo;

    return {
      data: response,
      isLive,
      isDemo,
      isStale,
      isUnknownSource
    };
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
