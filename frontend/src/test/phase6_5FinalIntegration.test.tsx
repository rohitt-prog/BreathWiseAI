import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { Navbar } from '../components/layout/Navbar';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { PlannerPage } from '../features/planner/PlannerPage';
import { IndoorAirPage } from '../features/indoor/IndoorAirPage';
import { AlternativesPage } from '../features/alternatives/AlternativesPage';
import { apiClient } from '../services/apiClient';
import { useAppStore } from '../stores/useAppStore';
import { useAirQualityQuery, getAirQualityQueryKey } from '../hooks/useAirQualityQuery';
import { getForecastQueryKey } from '../hooks/useAirQualityForecastQuery';
import { renderHook } from '@testing-library/react';
import { CurrentAirQualityData, AirQualityForecastResponse, ForecastQueryResult } from '../types/airQuality';
import { AIInsightResponse } from '../types/ai';

const createCurrentTelemetryMock = (
  overrides: Partial<CurrentAirQualityData> = {},
  isLive = true
): { data: CurrentAirQualityData; isLive: boolean } => ({
  isLive,
  data: {
    station: {
      id: 'del_anand_vihar',
      name: 'Anand Vihar Station',
      coordinates: { lat: 28.6508, lon: 77.3152 },
    },
    aqi: 280,
    category: 'Poor',
    dominantPollutant: 'PM2.5',
    healthAdvisory: {
      summary: 'Air quality is poor.',
      maskRecommendation: 'Wear certified N95 respirator.',
      outdoorActivityLevel: 'Reduce intense outdoor exertion.',
    },
    forecast: [],
    pollutants: {
      'PM2.5': {
        code: 'PM2.5',
        name: 'Fine Particulates',
        concentration: 75.0,
        unit: 'µg/m³',
        subIndex: 280,
        category: 'Poor',
      },
      'PM10': {
        code: 'PM10',
        name: 'Coarse Particulates',
        concentration: 140.0,
        unit: 'µg/m³',
        subIndex: 140,
        category: 'Moderate',
      },
    },
    provenance: {
      dataSource: 'OPEN_METEO_MODELLED',
      qualityStatus: 'MODELLED_APPROXIMATION',
      recordedAt: new Date().toISOString(),
      retrievalFreshness: 'FRESH',
      modelRunFreshness: 'RECENT',
      forecastValidity: 'CURRENT_PERIOD',
      indexSystem: 'Indian NAQI',
      isVerified: true,
      sourceAttribution: 'Open-Meteo Regional Model',
    },
    weather: {
      temperatureC: 22,
      relativeHumidity: 60,
      windSpeedKmh: 10,
      windDirectionDegrees: 180,
      windDirectionCardinal: 'S',
      boundaryLayerHeightMeters: 600,
      stagnationRisk: 'Low',
      dispersionConditions: 'Favorable',
      stagnationDescription: 'Adequate vertical dispersion',
    },
    ...overrides,
  },
});

const createForecastTelemetryMock = (
  overrides: Partial<AirQualityForecastResponse> = {},
  isLive = true,
  queryOverrides: Partial<ForecastQueryResult> = {}
): ForecastQueryResult => {
  const now = new Date();
  const startHour = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  const hourly_forecast = Array.from({ length: 24 }, (_, i) => {
    const ptDate = new Date(startHour.getTime() + i * 3600 * 1000);
    return {
      timestamp: ptDate.toISOString(),
      modelled_aqi_estimate: 180,
      pm2_5: 75.0,
      pm10: 140.0,
      nitrogen_dioxide: 40.0,
      sulphur_dioxide: 15.0,
      ozone: 30.0,
      data_classification: 'MODELLED_FORECAST' as const,
    };
  });

  const isStale = queryOverrides.isStale ?? (overrides.retrieval_freshness === 'STALE');

  return {
    isLive,
    isDemo: !isLive,
    isStale,
    isUnknownSource: false,
    ...queryOverrides,
    data: {
      location: {
        latitude: 28.6508,
        longitude: 77.3152,
        name: 'Anand Vihar Station',
      },
      provider: 'Open-Meteo CAMS',
      source_type: isLive ? 'MODELLED_FORECAST' : 'SIMULATED_DEMO',
      retrieved_at: now.toISOString(),
      model_run_timestamp: null,
      model_data_available_at: null,
      retrieval_freshness: 'FRESH',
      model_run_freshness: 'UNAVAILABLE',
      hourly_forecast,
      source_attribution: 'Open-Meteo CAMS',
      limitations: [],
      ...overrides,
    },
  };
};

const createMockAIInsight = (overrides: Partial<AIInsightResponse> = {}): AIInsightResponse => ({
  location: { latitude: 28.6508, longitude: 77.3152, name: 'Delhi Anand Vihar' },
  activity_context: 'GENERAL',
  status: 'GENERATED',
  model_id: 'gemini-2.5-flash',
  prompt_version: 'v1.0.0',
  generated_at: new Date().toISOString(),
  summary: 'Localized boundary layer stagnation concentrates fine particulates in morning hours.',
  explanation: 'Atmospheric chemistry models indicate elevated PM2.5.',
  supporting_factors: ['PM2.5 elevated (75 µg/m³)'],
  recommended_actions: [
    {
      action_id: 'ACT-PROTECT-N95',
      category: 'PERSONAL_PROTECTION',
      priority: 'HIGH',
      title: 'Wear certified N95 respirator during outdoor transit',
      rationale: 'Filters fine aerosol particulates effectively.',
      evidence_ids: ['EVID-PM25']
    }
  ],
  evidence_context: {},
  source_classification: 'OPEN_METEO_MODELLED',
  quality_status: 'MODELLED_APPROXIMATION',
  retrieval_freshness: 'FRESH',
  limitations: [],
  ...overrides
});

describe('Phase 6.5 — Final Integration Audit & Targeted Corrections', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 1000 * 60 * 5,
        },
      },
    });
    vi.clearAllMocks();
    useAppStore.setState({ currentLocationId: 'del_anand_vihar' });
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>
    );
  };

  describe('1. Shared Location & Cache Consistency', () => {
    it('isolates demo mode from live queries in query keys for both current and forecast queries', () => {
      const currentLiveKey = getAirQualityQueryKey('del_anand_vihar', 28.6508, 77.3152, false);
      const currentDemoKey = getAirQualityQueryKey('del_anand_vihar', 28.6508, 77.3152, true);

      expect(currentLiveKey).toEqual(['airQuality', 'del_anand_vihar', 28.6508, 77.3152, false]);
      expect(currentDemoKey).toEqual(['airQuality', 'del_anand_vihar', 28.6508, 77.3152, true]);
      expect(currentLiveKey).not.toEqual(currentDemoKey);

      const forecastLiveKey = getForecastQueryKey('del_anand_vihar', 28.6508, 77.3152, false);
      const forecastDemoKey = getForecastQueryKey('del_anand_vihar', 28.6508, 77.3152, true);

      expect(forecastLiveKey).toEqual(['airQualityForecast', 'del_anand_vihar', 28.6508, 77.3152, false]);
      expect(forecastDemoKey).toEqual(['airQualityForecast', 'del_anand_vihar', 28.6508, 77.3152, true]);
      expect(forecastLiveKey).not.toEqual(forecastDemoKey);
    });

    it('rejects invalid or non-finite geographic coordinates in useAirQualityQuery cleanly', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(
        () => useAirQualityQuery('custom_invalid', { lat: NaN, lon: Infinity }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toContain('Invalid geographic coordinates');
    });
  });

  describe('2. Four-Feature Simultaneous Mount & Synchronization (Correction 3)', () => {
    it('mounts all four features (Dashboard, Planner, Indoor, Alternatives) + Navbar under shared QueryClient without duplicate fetches', async () => {
      const currentSpy = vi
        .spyOn(apiClient, 'resolveAirQualityData')
        .mockResolvedValue(createCurrentTelemetryMock());
      const forecastSpy = vi
        .spyOn(apiClient, 'resolveForecastData')
        .mockResolvedValue(createForecastTelemetryMock());
      vi.spyOn(apiClient, 'fetchAIInsights').mockResolvedValue(createMockAIInsight());

      // Mount all 4 features + Navbar simultaneously under one QueryClientProvider
      renderWithProviders(
        <div>
          <Navbar />
          <DashboardPage />
          <PlannerPage />
          <IndoorAirPage />
          <AlternativesPage />
        </div>
      );

      await waitFor(() => {
        expect(screen.getByTestId('navbar-aqi-live')).toBeInTheDocument();
        expect(screen.getByTestId('master-ventilation-verdict')).toBeInTheDocument();
        expect(screen.getByTestId('master-alternatives-verdict')).toBeInTheDocument();
      });

      // TanStack QueryClient deduplicates: exactly 1 current fetch and 1 forecast fetch
      expect(currentSpy).toHaveBeenCalledTimes(1);
      expect(forecastSpy).toHaveBeenCalledTimes(1);
      expect(currentSpy).toHaveBeenCalledWith('del_anand_vihar', expect.objectContaining({ lat: 28.6508, lon: 77.3152 }));
      expect(forecastSpy).toHaveBeenCalledWith(
        'del_anand_vihar',
        expect.objectContaining({ lat: 28.6508, lon: 77.3152 }),
        expect.anything()
      );

      // Switch active location to Connaught Place
      act(() => {
        useAppStore.setState({ currentLocationId: 'del_connaught_place' });
      });

      await waitFor(() => {
        expect(currentSpy).toHaveBeenCalledTimes(2);
        expect(forecastSpy).toHaveBeenCalledTimes(2);
      });

      expect(currentSpy).toHaveBeenLastCalledWith(
        'del_connaught_place',
        expect.objectContaining({ lat: 28.6304, lon: 77.2177 })
      );
      expect(forecastSpy).toHaveBeenLastCalledWith(
        'del_connaught_place',
        expect.objectContaining({ lat: 28.6304, lon: 77.2177 }),
        expect.anything()
      );
    });
  });

  describe('3. Dashboard Provenance & Freshness Consistency (Correction 1)', () => {
    it('displays MODELLED_FORECAST (Open-Meteo CAMS) for fresh valid Open-Meteo modelled telemetry', async () => {
      const freshModelled = createCurrentTelemetryMock({
        provenance: {
          dataSource: 'OPEN_METEO_MODELLED',
          qualityStatus: 'MODELLED_APPROXIMATION',
          recordedAt: new Date().toISOString(),
          retrievalFreshness: 'FRESH',
          forecastValidity: 'CURRENT_PERIOD',
          modelRunFreshness: 'RECENT',
          indexSystem: 'Indian NAQI',
          isVerified: true,
        },
      });
      vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(freshModelled);

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText(/MODELLED_FORECAST \(Open-Meteo CAMS\)/i)).toBeInTheDocument();
      });
    });

    it('displays MODELLED_FORECAST (STALE Modelled) when retrievalFreshness is STALE', async () => {
      const staleModelled = createCurrentTelemetryMock({
        provenance: {
          dataSource: 'OPEN_METEO_MODELLED',
          qualityStatus: 'MODELLED_APPROXIMATION',
          recordedAt: new Date().toISOString(),
          retrievalFreshness: 'STALE',
          forecastValidity: 'CURRENT_PERIOD',
          modelRunFreshness: 'RECENT',
          indexSystem: 'Indian NAQI',
          isVerified: true,
        },
      });
      vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(staleModelled);

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText(/MODELLED_FORECAST \(STALE Modelled\)/i)).toBeInTheDocument();
      });
    });

    it('displays MODELLED_FORECAST (STALE Modelled) when retrievalFreshness is INVALID', async () => {
      const invalidModelled = createCurrentTelemetryMock({
        provenance: {
          dataSource: 'OPEN_METEO_MODELLED',
          qualityStatus: 'MODELLED_APPROXIMATION',
          recordedAt: new Date().toISOString(),
          retrievalFreshness: 'INVALID',
          forecastValidity: 'CURRENT_PERIOD',
          modelRunFreshness: 'RECENT',
          indexSystem: 'Indian NAQI',
          isVerified: true,
        },
      });
      vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(invalidModelled);

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText(/MODELLED_FORECAST \(STALE Modelled\)/i)).toBeInTheDocument();
      });
    });

    it('displays MODELLED_FORECAST (STALE Modelled) when forecast validity metadata is missing', async () => {
      const missingValidity = createCurrentTelemetryMock({
        provenance: {
          dataSource: 'OPEN_METEO_MODELLED',
          qualityStatus: 'MODELLED_APPROXIMATION',
          recordedAt: new Date().toISOString(),
          retrievalFreshness: 'FRESH',
          indexSystem: 'Indian NAQI',
          isVerified: true,
        },
      });
      vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(missingValidity);

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText(/MODELLED_FORECAST \(STALE Modelled\)/i)).toBeInTheDocument();
      });
    });

    it('displays UNVERIFIED (Unverified Telemetry) when provider is unknown and never labels as demo', async () => {
      const unknownSource = createCurrentTelemetryMock({
        provenance: {
          dataSource: 'UNKNOWN_EXTERNAL_FEED',
          qualityStatus: 'UNAVAILABLE',
          recordedAt: new Date().toISOString(),
          retrievalFreshness: 'FRESH',
          indexSystem: 'Unknown Index',
          isVerified: false,
        },
      });
      vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(unknownSource);

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText(/UNVERIFIED \(Unverified Telemetry\)/i)).toBeInTheDocument();
      });
      expect(screen.queryByText(/SIMULATED_DEMO/i)).not.toBeInTheDocument();
    });

    it('displays OBSERVATION (Physical Sensor) for fresh physical observation with fresh retrieval', async () => {
      const freshObs = createCurrentTelemetryMock({
        provenance: {
          dataSource: 'OPENAQ_V3',
          qualityStatus: 'VERIFIED_OFFICIAL',
          recordedAt: new Date().toISOString(),
          observedAt: new Date().toISOString(),
          observationFreshness: 'FRESH',
          retrievalFreshness: 'FRESH',
          indexSystem: 'Indian NAQI',
          isVerified: true,
        },
      });
      vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(freshObs);

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText(/OBSERVATION \(Physical Sensor\)/i)).toBeInTheDocument();
      });
    });

    it('displays OBSERVATION (STALE Ground Sensor) when physical observation is fresh but retrieval is stale', async () => {
      const staleRetrievalObs = createCurrentTelemetryMock({
        provenance: {
          dataSource: 'OBSERVATION',
          qualityStatus: 'UNVERIFIED_SENSOR',
          recordedAt: new Date().toISOString(),
          observedAt: new Date().toISOString(),
          observationFreshness: 'FRESH',
          retrievalFreshness: 'STALE',
          indexSystem: 'Indian NAQI',
          isVerified: true,
        },
      });
      vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(staleRetrievalObs);

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText(/OBSERVATION \(STALE Ground Sensor\)/i)).toBeInTheDocument();
      });
    });

    it('displays OBSERVATION (STALE Ground Sensor) when observation freshness metadata is missing', async () => {
      const missingObsFreshness = createCurrentTelemetryMock({
        provenance: {
          dataSource: 'OBSERVATION',
          qualityStatus: 'UNVERIFIED_SENSOR',
          recordedAt: new Date().toISOString(),
          observedAt: new Date().toISOString(),
          retrievalFreshness: 'FRESH',
          indexSystem: 'Indian NAQI',
          isVerified: true,
        },
      });
      vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(missingObsFreshness);

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText(/OBSERVATION \(STALE Ground Sensor\)/i)).toBeInTheDocument();
      });
    });

    it('displays SIMULATED_DEMO (Curated Scenario) for demo provenance', async () => {
      const demoMock = createCurrentTelemetryMock(
        {
          provenance: {
            dataSource: 'SIMULATED_DEMO',
            qualityStatus: 'SIMULATED_SCENARIO',
            recordedAt: new Date().toISOString(),
            indexSystem: 'Indian NAQI',
          },
        },
        false
      );
      vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(demoMock);

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText(/SIMULATED_DEMO \(Curated Scenario\)/i)).toBeInTheDocument();
      });
    });
  });

  describe('4. Dashboard AI Insights Gating & Telemetry Context (Correction 2)', () => {
    it('allows live AI insights when telemetry is valid, verified, and fresh', async () => {
      const freshModelled = createCurrentTelemetryMock();
      vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(freshModelled);
      const aiSpy = vi.spyOn(apiClient, 'fetchAIInsights').mockResolvedValue(createMockAIInsight());

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText(/Google Gemini Synthesized/i)).toBeInTheDocument();
      });

      expect(aiSpy).toHaveBeenCalled();
      expect(screen.getByText(/Localized boundary layer stagnation concentrates fine particulates in morning hours/i)).toBeInTheDocument();
      expect(screen.getByText('Wear certified N95 respirator during outdoor transit')).toBeInTheDocument();
    });

    it('suppresses AI directives and action cards when telemetry is in demo mode', async () => {
      const demoMock = createCurrentTelemetryMock({}, false);
      vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(demoMock);
      const aiSpy = vi.spyOn(apiClient, 'fetchAIInsights');

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText(/Curated Demo Guidance \(Backend Offline\)/i)).toBeInTheDocument();
      });

      // AI fetch is disabled
      expect(aiSpy).not.toHaveBeenCalled();
      expect(screen.getByTestId('ai-summary-gated')).toHaveTextContent(/Current-condition AI insights are disabled in Demo Mode/i);
      expect(screen.getByTestId('ai-directives-gated')).toBeInTheDocument();
      expect(screen.queryByText('Wear certified N95 respirator during outdoor transit')).not.toBeInTheDocument();
    });

    it('suppresses AI directives and action cards when telemetry is stale', async () => {
      const staleMock = createCurrentTelemetryMock({
        provenance: {
          dataSource: 'OPEN_METEO_MODELLED',
          qualityStatus: 'MODELLED_APPROXIMATION',
          recordedAt: new Date().toISOString(),
          retrievalFreshness: 'STALE',
          forecastValidity: 'CURRENT_PERIOD',
          indexSystem: 'Indian NAQI',
          isVerified: true,
        },
      });
      vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(staleMock);
      const aiSpy = vi.spyOn(apiClient, 'fetchAIInsights');

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText(/Baseline Guidance \(Telemetry Stale\)/i)).toBeInTheDocument();
      });

      expect(aiSpy).not.toHaveBeenCalled();
      expect(screen.getByTestId('ai-summary-gated')).toHaveTextContent(/Live telemetry is stale or expired/i);
      expect(screen.getByTestId('ai-directives-gated')).toBeInTheDocument();
      expect(screen.queryByText('Wear certified N95 respirator during outdoor transit')).not.toBeInTheDocument();
    });

    it('suppresses AI directives and action cards when provenance is unknown or unverified', async () => {
      const unverifiedMock = createCurrentTelemetryMock({
        provenance: {
          dataSource: 'CUSTOM_FEED',
          qualityStatus: 'UNAVAILABLE',
          recordedAt: new Date().toISOString(),
          retrievalFreshness: 'FRESH',
          indexSystem: 'Custom',
          isVerified: false,
        },
      });
      vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(unverifiedMock);
      const aiSpy = vi.spyOn(apiClient, 'fetchAIInsights');

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText(/Baseline Guidance \(Telemetry Unverified\)/i)).toBeInTheDocument();
      });

      expect(aiSpy).not.toHaveBeenCalled();
      expect(screen.getByTestId('ai-summary-gated')).toHaveTextContent(/Telemetry source is unverified/i);
      expect(screen.getByTestId('ai-directives-gated')).toBeInTheDocument();
      expect(screen.queryByText('Wear certified N95 respirator during outdoor transit')).not.toBeInTheDocument();
    });

    it('suppresses AI directives when PM2.5 is missing or invalid', async () => {
      const missingPm25 = createCurrentTelemetryMock({
        pollutants: {
          'PM10': {
            code: 'PM10',
            name: 'Coarse Particulates',
            concentration: 120.0,
            unit: 'µg/m³',
            subIndex: 120,
            category: 'Moderate',
          },
        },
      });
      vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(missingPm25);
      const aiSpy = vi.spyOn(apiClient, 'fetchAIInsights');

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText(/Baseline Guidance \(Telemetry Insufficient\)/i)).toBeInTheDocument();
      });

      expect(aiSpy).not.toHaveBeenCalled();
      expect(screen.getByTestId('ai-summary-gated')).toHaveTextContent(/Telemetry is insufficient. Required fine particulate/i);
      expect(screen.getByTestId('ai-directives-gated')).toBeInTheDocument();
    });

    it('prevents stale AI summaries from previous location leaking when switching to ineligible location', async () => {
      const freshLoc1 = createCurrentTelemetryMock();
      const staleLoc2 = createCurrentTelemetryMock({
        station: { id: 'del_connaught_place', name: 'Connaught Place', coordinates: { lat: 28.6304, lon: 77.2177 } },
        provenance: {
          dataSource: 'OPEN_METEO_MODELLED',
          qualityStatus: 'MODELLED_APPROXIMATION',
          recordedAt: new Date().toISOString(),
          retrievalFreshness: 'STALE',
          forecastValidity: 'CURRENT_PERIOD',
          indexSystem: 'Indian NAQI',
          isVerified: true,
        },
      });

      vi.spyOn(apiClient, 'resolveAirQualityData').mockImplementation((locId) => {
        if (locId === 'del_anand_vihar') return Promise.resolve(freshLoc1);
        return Promise.resolve(staleLoc2);
      });

      vi.spyOn(apiClient, 'fetchAIInsights').mockImplementation((lat) => {
        if (lat === 28.6508) return Promise.resolve(createMockAIInsight());
        return Promise.reject(new Error('Should not be fetched'));
      });

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText(/Localized boundary layer stagnation concentrates fine particulates in morning hours/i)).toBeInTheDocument();
      });

      // Switch to stale location
      act(() => {
        useAppStore.setState({ currentLocationId: 'del_connaught_place' });
      });

      await waitFor(() => {
        expect(screen.getByText(/Baseline Guidance \(Telemetry Stale\)/i)).toBeInTheDocument();
      });

      // Previous location's AI summary must NOT remain in DOM
      expect(screen.queryByText(/Localized boundary layer stagnation concentrates fine particulates in morning hours/i)).not.toBeInTheDocument();
      expect(screen.getByTestId('ai-summary-gated')).toHaveTextContent(/Live telemetry is stale or expired/i);
    });

    it('renders clean error state without leaking directives when AI API fails', async () => {
      const freshModelled = createCurrentTelemetryMock();
      vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(freshModelled);
      vi.spyOn(apiClient, 'fetchAIInsights').mockRejectedValue(new Error('Network 500'));

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByTestId('ai-directives-error')).toBeInTheDocument();
      });

      expect(screen.getByText(/Deterministic Safety Override/i)).toBeInTheDocument();
      expect(screen.getByText(/Unable to reach AI intelligence engine/i)).toBeInTheDocument();
    });

    it('prohibits current-condition cardiovascular restriction claims when telemetry is ineligible', async () => {
      const demoMock = createCurrentTelemetryMock({}, false);
      vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(demoMock);

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText(/Simulated scenario — live cardiovascular exercise directives are suspended in demo mode/i)).toBeInTheDocument();
      });

      expect(screen.queryByText(/Outdoor cardiovascular exercise restricted under current AQI/i)).not.toBeInTheDocument();
    });
  });

  describe('5. Cross-Feature Stale & Insufficient Telemetry Gating Consistency', () => {
    it('suppresses condition-dependent recommendations consistently across all 4 features when telemetry is stale', async () => {
      const staleCurrent = createCurrentTelemetryMock({
        provenance: {
          dataSource: 'OPENAQ_V3',
          qualityStatus: 'UNVERIFIED_SENSOR',
          recordedAt: '2026-11-29T06:00:00Z',
          observedAt: '2026-11-29T06:00:00Z',
          observationFreshness: 'STALE',
          retrievalFreshness: 'STALE',
          indexSystem: 'Indian NAQI',
          sourceAttribution: 'OpenAQ Station',
        },
      });

      vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(staleCurrent);
      vi.spyOn(apiClient, 'resolveForecastData').mockResolvedValue(
        createForecastTelemetryMock({ retrieval_freshness: 'STALE' }, true)
      );

      // 1. Dashboard
      const { unmount: unmountDash } = renderWithProviders(<DashboardPage />);
      await waitFor(() => {
        expect(screen.getByText(/OBSERVATION \(STALE Ground Sensor\)/i)).toBeInTheDocument();
      });
      expect(screen.getByTestId('ai-summary-gated')).toHaveTextContent(/Live telemetry is stale/i);
      unmountDash();

      // 2. Planner
      const { unmount: unmountPlanner } = renderWithProviders(<PlannerPage />);
      await waitFor(() => {
        expect(screen.getByText(/Action Directives Suspended \(Stale Forecast\)/i)).toBeInTheDocument();
      });
      expect(screen.getByText(/Telemetry Insufficient/i)).toBeInTheDocument();
      unmountPlanner();

      // 3. Indoor
      const { unmount: unmountIndoor } = renderWithProviders(<IndoorAirPage />);
      await waitFor(() => {
        expect(screen.getByTestId('master-ventilation-verdict')).toHaveTextContent('TELEMETRY INSUFFICIENT');
      });
      expect(screen.queryByText('LIMIT OUTDOOR AIR INFILTRATION')).not.toBeInTheDocument();
      unmountIndoor();

      // 4. Alternatives
      renderWithProviders(<AlternativesPage />);
      await waitFor(() => {
        expect(screen.getByTestId('master-alternatives-verdict')).toHaveTextContent('TELEMETRY INSUFFICIENT');
      });
      expect(screen.queryByText('PRIORITIZE ENCLOSED TRANSIT')).not.toBeInTheDocument();
      expect(screen.getByTestId('verdict-badge-metro')).toHaveTextContent('Educational Comparison');
    });

    it('suppresses live recommendations consistently across all 4 features in simulated demo mode', async () => {
      const demoCurrent = createCurrentTelemetryMock(
        {
          provenance: {
            dataSource: 'SIMULATED_DEMO',
            qualityStatus: 'SIMULATED_SCENARIO',
            recordedAt: new Date().toISOString(),
            retrievalFreshness: 'FRESH',
            indexSystem: 'Indian NAQI',
            sourceAttribution: 'Curated Demo Scenario',
          },
        },
        false
      );

      vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(demoCurrent);
      vi.spyOn(apiClient, 'resolveForecastData').mockResolvedValue(createForecastTelemetryMock({}, false));

      // 1. Dashboard
      const { unmount: unmountDash } = renderWithProviders(<DashboardPage />);
      await waitFor(() => {
        expect(screen.getByText(/SIMULATED_DEMO \(Curated Scenario\)/i)).toBeInTheDocument();
      });
      unmountDash();

      // 2. Planner
      const { unmount: unmountPlanner } = renderWithProviders(<PlannerPage />);
      await waitFor(() => {
        expect(screen.getByText(/Simulated Demo/i)).toBeInTheDocument();
      });
      unmountPlanner();

      // 3. Indoor
      const { unmount: unmountIndoor } = renderWithProviders(<IndoorAirPage />);
      await waitFor(() => {
        expect(screen.getByTestId('master-ventilation-verdict')).toHaveTextContent('TELEMETRY INSUFFICIENT');
      });
      expect(screen.getByTestId('ventilation-explanation')).toHaveTextContent(/simulated demonstration mode/i);
      unmountIndoor();

      // 4. Alternatives
      renderWithProviders(<AlternativesPage />);
      await waitFor(() => {
        expect(screen.getByTestId('master-alternatives-verdict')).toHaveTextContent('TELEMETRY INSUFFICIENT');
      });
      expect(screen.getByTestId('alternatives-explanation')).toHaveTextContent(/simulated demonstration mode/i);
    });

    it('handles query errors cleanly without silently fabricating recommendations across any feature', async () => {
      vi.spyOn(apiClient, 'resolveAirQualityData').mockRejectedValue(new Error('Network 500'));
      vi.spyOn(apiClient, 'resolveForecastData').mockRejectedValue(new Error('Network 500'));

      // 1. Dashboard
      const { unmount: unmountDash } = renderWithProviders(<DashboardPage />);
      await waitFor(() => {
        expect(screen.getByText(/SIMULATED_DEMO \(Curated Scenario\)/i)).toBeInTheDocument();
      });
      unmountDash();

      // 2. Planner
      const { unmount: unmountPlanner } = renderWithProviders(<PlannerPage />);
      await waitFor(() => {
        expect(screen.getByText(/Forecast Telemetry Unavailable/i)).toBeInTheDocument();
      });
      unmountPlanner();

      // 3. Indoor
      const { unmount: unmountIndoor } = renderWithProviders(<IndoorAirPage />);
      await waitFor(() => {
        expect(screen.getByTestId('indoor-error')).toBeInTheDocument();
      });
      unmountIndoor();

      // 4. Alternatives
      renderWithProviders(<AlternativesPage />);
      await waitFor(() => {
        expect(screen.getByTestId('alternatives-error')).toBeInTheDocument();
      });
    });
  });

  describe('6. Cross-Feature Evidence-Grounded Agreement (Zero Contradictions)', () => {
    it('under elevated pollution (PM2.5 >= 60 µg/m³), all features provide unified protective directives', async () => {
      const elevatedCurrent = createCurrentTelemetryMock({
        pollutants: {
          'PM2.5': {
            code: 'PM2.5',
            name: 'Fine Particulates',
            concentration: 85.0,
            unit: 'µg/m³',
            subIndex: 250,
            category: 'Poor',
          },
        },
      });

      vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(elevatedCurrent);
      vi.spyOn(apiClient, 'resolveForecastData').mockResolvedValue(createForecastTelemetryMock());

      // 1. Indoor
      const { unmount: unmountIndoor } = renderWithProviders(<IndoorAirPage />);
      await waitFor(() => {
        expect(screen.getByTestId('master-ventilation-verdict')).toHaveTextContent(
          'LIMIT OUTDOOR AIR INFILTRATION'
        );
      });
      expect(screen.getByText(/Continuous Recirculation/i)).toBeInTheDocument();
      unmountIndoor();

      // 2. Alternatives
      const { unmount: unmountAlt } = renderWithProviders(<AlternativesPage />);
      await waitFor(() => {
        expect(screen.getByTestId('master-alternatives-verdict')).toHaveTextContent(
          'PRIORITIZE ENCLOSED TRANSIT'
        );
      });
      expect(screen.getByTestId('verdict-badge-metro')).toHaveTextContent('Enclosed Transit Option');
      expect(screen.getByTestId('verdict-badge-bicycle')).toHaveTextContent('High Respiratory Inhalation Risk');
      unmountAlt();

      // 3. Planner
      renderWithProviders(<PlannerPage />);
      await waitFor(() => {
        expect(screen.getByText(/Natural Ventilation Restricted/i)).toBeInTheDocument();
      });
    });

    it('under low pollution (PM2.5 < 30 µg/m³), all features provide proportionate, non-definitive guidance', async () => {
      const cleanCurrent = createCurrentTelemetryMock({
        aqi: 40,
        category: 'Good',
        pollutants: {
          'PM2.5': {
            code: 'PM2.5',
            name: 'Fine Particulates',
            concentration: 18.0,
            unit: 'µg/m³',
            subIndex: 40,
            category: 'Good',
          },
        },
      });

      vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(cleanCurrent);
      vi.spyOn(apiClient, 'resolveForecastData').mockResolvedValue(
        createForecastTelemetryMock({
          hourly_forecast: Array.from({ length: 24 }, (_, i) => ({
            timestamp: new Date(Date.now() + i * 3600000).toISOString(),
            modelled_aqi_estimate: 40,
            pm2_5: 18.0,
            pm10: 30.0,
            nitrogen_dioxide: 15.0,
            sulphur_dioxide: 5.0,
            ozone: 20.0,
            data_classification: 'MODELLED_FORECAST' as const,
          })),
        })
      );

      // 1. Indoor
      const { unmount: unmountIndoor } = renderWithProviders(<IndoorAirPage />);
      await waitFor(() => {
        expect(screen.getByTestId('master-ventilation-verdict')).toHaveTextContent(
          'CONDITIONAL VENTILATION CONSIDERATION'
        );
      });
      expect(screen.getByTestId('ventilation-explanation')).toHaveTextContent(
        /low outdoor PM2.5 alone does not guarantee good indoor air quality/i
      );
      unmountIndoor();

      // 2. Alternatives
      const { unmount: unmountAlt } = renderWithProviders(<AlternativesPage />);
      await waitFor(() => {
        expect(screen.getByTestId('master-alternatives-verdict')).toHaveTextContent(
          'ACTIVE & MASS TRANSIT VIABLE'
        );
      });
      expect(screen.getByTestId('alternatives-explanation')).toHaveTextContent(
        /regional station data does not measure microscale roadside exhaust/i
      );
      expect(screen.getByTestId('verdict-badge-bicycle')).toHaveTextContent('Active Commute Viable');
      unmountAlt();

      // 3. Planner
      renderWithProviders(<PlannerPage />);
      await waitFor(() => {
        expect(screen.getByText(/Targeted Cross-Ventilation Acceptable/i)).toBeInTheDocument();
      });
    });
  });
});
