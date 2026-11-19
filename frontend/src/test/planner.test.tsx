import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PlannerPage } from '../features/planner/PlannerPage';
import { apiClient } from '../services/apiClient';
import { useAppStore } from '../stores/useAppStore';
import {
  useAirQualityForecastQuery,
  getForecastQueryKey,
  isValidCoordinate,
} from '../hooks/useAirQualityForecastQuery';
import { AirQualityForecastResponse, HourlyForecastPoint } from '../types/airQuality';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        gcTime: 0,
      },
    },
  });
}

function renderWithClient(ui: React.ReactElement, client = createTestQueryClient()) {
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const sampleHourlyPoints: HourlyForecastPoint[] = [
  {
    timestamp: '2026-11-29T02:00:00Z',
    modelled_aqi_estimate: 220,
    pm2_5: 165.4,
    pm10: 270.0,
    nitrogen_dioxide: 42.0,
    sulphur_dioxide: 18.0,
    ozone: 30.0,
    data_classification: 'MODELLED_FORECAST',
  },
  {
    timestamp: '2026-11-29T03:00:00Z',
    modelled_aqi_estimate: 225,
    pm2_5: 170.0,
    pm10: 280.0,
    nitrogen_dioxide: 44.0,
    sulphur_dioxide: 19.0,
    ozone: 28.0,
    data_classification: 'MODELLED_FORECAST',
  },
  {
    timestamp: '2026-11-29T04:00:00Z',
    modelled_aqi_estimate: 230,
    pm2_5: 175.0,
    pm10: 290.0,
    nitrogen_dioxide: 45.0,
    sulphur_dioxide: 20.0,
    ozone: 25.0,
    data_classification: 'MODELLED_FORECAST',
  },
  {
    timestamp: '2026-11-29T07:00:00Z',
    modelled_aqi_estimate: 140,
    pm2_5: 45.2,
    pm10: 85.0,
    nitrogen_dioxide: 28.0,
    sulphur_dioxide: 12.0,
    ozone: 55.0,
    data_classification: 'MODELLED_FORECAST',
  },
  {
    timestamp: '2026-11-29T08:00:00Z',
    modelled_aqi_estimate: 135,
    pm2_5: 42.0,
    pm10: 80.0,
    nitrogen_dioxide: 25.0,
    sulphur_dioxide: 10.0,
    ozone: 50.0,
    data_classification: 'MODELLED_FORECAST',
  },
  {
    timestamp: '2026-11-29T09:00:00Z',
    modelled_aqi_estimate: 130,
    pm2_5: 40.0,
    pm10: 75.0,
    nitrogen_dioxide: 22.0,
    sulphur_dioxide: 10.0,
    ozone: 48.0,
    data_classification: 'MODELLED_FORECAST',
  },
];

const mockLiveForecastResponse: AirQualityForecastResponse = {
  location: {
    latitude: 28.6508,
    longitude: 77.3152,
    name: 'Anand Vihar, Delhi',
  },
  provider: 'Open-Meteo CAMS Air Quality Forecast',
  source_type: 'MODELLED_FORECAST',
  retrieved_at: '2026-11-29T08:00:00Z',
  model_run_timestamp: null,
  model_data_available_at: null,
  retrieval_freshness: 'FRESH',
  model_run_freshness: 'UNAVAILABLE',
  hourly_forecast: sampleHourlyPoints,
  source_attribution: 'Open-Meteo Air Quality Forecast API (Copernicus CAMS Modelled Data)',
  limitations: ['Hourly points represent regional atmospheric chemistry model predictions (~40 km grid).'],
};

describe('PlannerPage Integration (Phase 6.2 Forecast Telemetry)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAppStore.setState({
      currentLocationId: 'del_anand_vihar',
    });
  });

  it('1. Successfully retrieves and renders live hourly forecast values', async () => {
    vi.spyOn(apiClient, 'resolveForecastData').mockResolvedValueOnce({
      data: mockLiveForecastResponse,
      isLive: true,
      isDemo: false,
      isStale: false,
    });

    renderWithClient(<PlannerPage />);

    expect(await screen.findByText('Personalized Daily Action Planner')).toBeInTheDocument();
    expect(screen.getByText(/Live Modelled Forecast/i)).toBeInTheDocument();
    expect(screen.getByText(/Hourly Forecast Telemetry/i)).toBeInTheDocument();

    // Verify numerical values from sampleHourlyPoints are rendered
    expect(screen.getByText('165')).toBeInTheDocument();
    expect(screen.getByText('45')).toBeInTheDocument();
  });

  it('2. Dynamically generates activity windows with consistent unit ranking', async () => {
    vi.spyOn(apiClient, 'resolveForecastData').mockResolvedValueOnce({
      data: mockLiveForecastResponse,
      isLive: true,
      isDemo: false,
      isStale: false,
    });

    renderWithClient(<PlannerPage />);

    expect(await screen.findByText(/Recommended Activity Window/i)).toBeInTheDocument();
    expect(screen.getByText(/Relative Diurnal Minimum:/i)).toBeInTheDocument();
    expect(screen.getByText(/Scheduled Action Directives/i)).toBeInTheDocument();
  });

  it('3. Formats forecast hours using correct local time display', async () => {
    vi.spyOn(apiClient, 'resolveForecastData').mockResolvedValueOnce({
      data: mockLiveForecastResponse,
      isLive: true,
      isDemo: false,
      isStale: false,
    });

    renderWithClient(<PlannerPage />);

    await screen.findByText('Personalized Daily Action Planner');

    const expectedLocalTime1 = new Date('2026-11-29T02:00:00Z').toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    expect(screen.getByText(expectedLocalTime1)).toBeInTheDocument();
  });

  it('4. Location changes trigger the corresponding forecast query', async () => {
    const resolveSpy = vi.spyOn(apiClient, 'resolveForecastData').mockImplementation(async (locId, coords) => ({
      data: {
        ...mockLiveForecastResponse,
        location: { latitude: coords.lat, longitude: coords.lon, name: locId },
      },
      isLive: true,
      isDemo: false,
      isStale: false,
    }));

    const client = createTestQueryClient();
    renderWithClient(<PlannerPage />, client);

    await screen.findByText('Personalized Daily Action Planner');
    expect(resolveSpy).toHaveBeenCalledWith('del_anand_vihar', { lat: 28.6508, lon: 77.3152 }, { forceDemoMode: undefined });

    // Switch location in store
    useAppStore.setState({ currentLocationId: 'ggn_cyber_city' });

    await waitFor(() => {
      expect(resolveSpy).toHaveBeenCalledWith('ggn_cyber_city', { lat: 28.495, lon: 77.0895 }, { forceDemoMode: undefined });
    });
  });

  it('5. Renders loading state while forecast is being retrieved', () => {
    vi.spyOn(apiClient, 'resolveForecastData').mockReturnValue(new Promise(() => {}));

    renderWithClient(<PlannerPage />);

    const loadingStatus = screen.getByRole('status', { name: /loading forecast telemetry/i });
    expect(loadingStatus).toBeInTheDocument();
  });

  it('6. Renders API error state without silently substituting mock data', async () => {
    vi.spyOn(apiClient, 'resolveForecastData').mockRejectedValueOnce(
      new Error('503 Service Unavailable: Open-Meteo connection timeout')
    );

    renderWithClient(<PlannerPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Forecast Telemetry Unavailable/i);
    expect(screen.getByText(/Scientific Integrity Policy/i)).toBeInTheDocument();
    expect(screen.getByText(/BreatheWise AI does not silently substitute fabricated numbers/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry Forecast/i })).toBeInTheDocument();

    // Verify static mock itinerary is NOT displayed
    expect(screen.queryByText(/Scheduled Action Directives/i)).not.toBeInTheDocument();
  });

  it('7. Invokes refetch when retry button is clicked in error state', async () => {
    const resolveSpy = vi
      .spyOn(apiClient, 'resolveForecastData')
      .mockRejectedValueOnce(new Error('Network failure'))
      .mockResolvedValueOnce({
        data: mockLiveForecastResponse,
        isLive: true,
        isDemo: false,
        isStale: false,
      });

    renderWithClient(<PlannerPage />);

    const retryBtn = await screen.findByRole('button', { name: /Retry Forecast/i });
    fireEvent.click(retryBtn);

    expect(resolveSpy).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Personalized Daily Action Planner')).toBeInTheDocument();
  });

  it('8. Missing retrieval freshness fails closed', async () => {
    vi.spyOn(apiClient, 'getForecast').mockResolvedValueOnce({
      ...mockLiveForecastResponse,
      retrieval_freshness: undefined as any,
    });
    const result = await apiClient.resolveForecastData('del_anand_vihar', { lat: 28.65, lon: 77.31 });
    expect(result.isStale).toBe(true);
  });

  it('9. Unknown retrieval freshness fails closed', async () => {
    vi.spyOn(apiClient, 'getForecast').mockResolvedValueOnce({
      ...mockLiveForecastResponse,
      retrieval_freshness: 'UNKNOWN_STATE' as any,
    });
    const result = await apiClient.resolveForecastData('del_anand_vihar', { lat: 28.65, lon: 77.31 });
    expect(result.isStale).toBe(true);
  });

  it('10. Missing model-run freshness fails closed', async () => {
    vi.spyOn(apiClient, 'getForecast').mockResolvedValueOnce({
      ...mockLiveForecastResponse,
      model_run_freshness: undefined as any,
    });
    const result = await apiClient.resolveForecastData('del_anand_vihar', { lat: 28.65, lon: 77.31 });
    expect(result.isStale).toBe(true);
  });

  it('1. Stale telemetry cannot produce favorable or restricted indoor ventilation recommendations', async () => {
    vi.spyOn(apiClient, 'getForecast').mockResolvedValueOnce({
      ...mockLiveForecastResponse,
      retrieval_freshness: 'FRESH',
      model_run_freshness: 'STALE',
    });

    renderWithClient(<PlannerPage />);

    expect(
      await screen.findByText(/Prediction data was retrieved over 60 minutes ago or numerical model cycle is not fresh/i)
    ).toBeInTheDocument();
    expect(screen.getByText('Stale Forecast')).toBeInTheDocument();
    expect(screen.getByText(/Action Directives Suspended \(Stale Forecast\)/i)).toBeInTheDocument();
    expect(screen.queryByText(/Recommended Activity Window/i)).not.toBeInTheDocument();

    // Indoor protocol must strictly display Telemetry Insufficient, never Favorable or Restricted
    expect(screen.getByText('Telemetry Insufficient')).toBeInTheDocument();
    expect(screen.queryByText('Targeted Cross-Ventilation Acceptable')).not.toBeInTheDocument();
    expect(screen.queryByText('Natural Ventilation Restricted')).not.toBeInTheDocument();
  });

  it('2. Unknown source telemetry cannot produce indoor ventilation recommendations and is not attributed to Open-Meteo', async () => {
    vi.spyOn(apiClient, 'getForecast').mockResolvedValueOnce({
      ...mockLiveForecastResponse,
      source_type: 'CUSTOM_UNVERIFIED_SOURCE',
      source_attribution: 'Custom Private Model',
    });

    const result = await apiClient.resolveForecastData('del_anand_vihar', { lat: 28.65, lon: 77.31 });
    expect(result.isLive).toBe(false);
    expect(result.isUnknownSource).toBe(true);

    vi.spyOn(apiClient, 'resolveForecastData').mockResolvedValueOnce(result);
    renderWithClient(<PlannerPage />);

    expect(await screen.findByText('Unverified Source')).toBeInTheDocument();
    expect(screen.queryByText('Live Modelled Forecast')).not.toBeInTheDocument();
    expect(screen.getByText(/Action Directives Suspended \(Unverified Source\)/i)).toBeInTheDocument();
    expect(screen.queryByText(/Recommended Activity Window/i)).not.toBeInTheDocument();

    // Must NOT label unknown source as Open-Meteo CAMS Model
    expect(screen.queryByText(/Open-Meteo CAMS Model/i)).not.toBeInTheDocument();

    // Indoor protocol must strictly display Telemetry Insufficient
    expect(screen.getByText('Telemetry Insufficient')).toBeInTheDocument();
    expect(screen.queryByText('Targeted Cross-Ventilation Acceptable')).not.toBeInTheDocument();
  });

  it('3. Demo mode suppresses actionable best-window recommendations, action badges, and disables feedback', async () => {
    vi.spyOn(apiClient, 'resolveForecastData').mockResolvedValueOnce({
      data: {
        ...mockLiveForecastResponse,
        source_type: 'SIMULATED_DEMO',
      },
      isLive: false,
      isDemo: true,
      isStale: false,
    });

    renderWithClient(<PlannerPage />);

    expect(await screen.findByText(/Illustrative AI Plan \(Demo\)/i)).toBeInTheDocument();
    expect(screen.getByText(/\(Simulated\)/i)).toBeInTheDocument();
    const demoNotices = screen.getAllByText(/Demonstration Scenario/i);
    expect(demoNotices.length).toBeGreaterThan(0);

    // Suppress best window card
    expect(screen.queryByText(/Recommended Activity Window/i)).not.toBeInTheDocument();

    // Suppress action badges (N95 Required)
    expect(screen.queryByText(/N95 Required/i)).not.toBeInTheDocument();

    // Feedback buttons disabled in simulation
    expect(screen.getAllByText(/Simulation Walkthrough \(Feedback Disabled\)/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Helpful/i })).not.toBeInTheDocument();

    // Indoor protocol badge strictly displays Telemetry Insufficient
    expect(screen.getByText('Telemetry Insufficient')).toBeInTheDocument();
  });

  it('6. Physical observations are not labelled as modelled forecasts', async () => {
    vi.spyOn(apiClient, 'resolveForecastData').mockResolvedValueOnce({
      data: {
        ...mockLiveForecastResponse,
        source_type: 'OPENAQ_V3',
        source_attribution: 'OpenAQ Ground Observation Network',
      },
      isLive: true,
      isDemo: false,
      isStale: false,
      isUnknownSource: false,
    });

    renderWithClient(<PlannerPage />);

    expect(await screen.findByText('Live Physical Observation')).toBeInTheDocument();
    expect(screen.queryByText('Live Modelled Forecast')).not.toBeInTheDocument();
  });

  it('7. Missing source attribution is not falsely labelled Open-Meteo CAMS', async () => {
    vi.spyOn(apiClient, 'resolveForecastData').mockResolvedValueOnce({
      data: {
        ...mockLiveForecastResponse,
        source_type: 'CUSTOM_OBSERVATION',
        provider: 'Local Station Monitor',
        source_attribution: '', // missing attribution!
      },
      isLive: true,
      isDemo: false,
      isStale: false,
      isUnknownSource: false,
    });

    renderWithClient(<PlannerPage />);

    await screen.findByText('Personalized Daily Action Planner');

    // Should NOT default missing attribution to Open-Meteo CAMS Model
    expect(screen.queryByText(/Open-Meteo CAMS Model/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Source: Local Station Monitor/i)).toBeInTheDocument();
  });

  it('Fresh retrieval with INVALID model-run metadata is handled safely as stale', async () => {
    vi.spyOn(apiClient, 'getForecast').mockResolvedValueOnce({
      ...mockLiveForecastResponse,
      retrieval_freshness: 'FRESH',
      model_run_freshness: 'INVALID',
    });

    renderWithClient(<PlannerPage />);

    expect(
      await screen.findByText(/Prediction data was retrieved over 60 minutes ago or numerical model cycle is not fresh/i)
    ).toBeInTheDocument();
    expect(screen.getByText('Stale Forecast')).toBeInTheDocument();
    expect(screen.queryByText(/Recommended Activity Window/i)).not.toBeInTheDocument();
  });

  it('Fresh retrieval with UNAVAILABLE model-run metadata remains supported as fresh', async () => {
    vi.spyOn(apiClient, 'getForecast').mockResolvedValueOnce({
      ...mockLiveForecastResponse,
      retrieval_freshness: 'FRESH',
      model_run_freshness: 'UNAVAILABLE',
    });

    renderWithClient(<PlannerPage />);

    expect(await screen.findByText('Live Modelled Forecast')).toBeInTheDocument();
    expect(screen.queryByText(/Stale Forecast/i)).not.toBeInTheDocument();
  });

  it('11. React Query cache separates demo and live queries using forceDemoMode in queryKey', () => {
    const liveKey = getForecastQueryKey('del_anand_vihar', 28.65, 77.31, false);
    const demoKey = getForecastQueryKey('del_anand_vihar', 28.65, 77.31, true);

    expect(liveKey).toEqual(['airQualityForecast', 'del_anand_vihar', 28.65, 77.31, false]);
    expect(demoKey).toEqual(['airQualityForecast', 'del_anand_vihar', 28.65, 77.31, true]);
    expect(liveKey).not.toEqual(demoKey);
  });

  it('12. Coordinates validation rejects NaN, Infinity, and out-of-range latitude/longitude', () => {
    expect(isValidCoordinate(28.65, 77.31)).toBe(true);
    expect(isValidCoordinate(0, 0)).toBe(true);
    expect(isValidCoordinate(-90, -180)).toBe(true);
    expect(isValidCoordinate(90, 180)).toBe(true);

    // Invalid non-finite
    expect(isValidCoordinate(NaN, 77.31)).toBe(false);
    expect(isValidCoordinate(28.65, NaN)).toBe(false);
    expect(isValidCoordinate(Infinity, 77.31)).toBe(false);
    expect(isValidCoordinate(28.65, -Infinity)).toBe(false);

    // Out of range
    expect(isValidCoordinate(95, 77.31)).toBe(false);
    expect(isValidCoordinate(-95, 77.31)).toBe(false);
    expect(isValidCoordinate(28.65, 185)).toBe(false);
    expect(isValidCoordinate(28.65, -185)).toBe(false);

    // Non-numeric
    expect(isValidCoordinate(null, 77.31)).toBe(false);
    expect(isValidCoordinate(undefined, 77.31)).toBe(false);
  });

  it('12. Unresolved location does NOT silently substitute MOCK_LOCATIONS[0] and fails cleanly', async () => {
    const client = createTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useAirQualityForecastQuery('completely_unknown_location_xyz'), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toContain(
      "Requested location 'completely_unknown_location_xyz' cannot be resolved to valid geographic coordinates"
    );
  });

  it('12. Invalid custom coordinates fail with explicit coordinate error message', async () => {
    const client = createTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () => useAirQualityForecastQuery('custom_point', { lat: 120.0, lon: 77.31 }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toContain('Invalid geographic coordinates (120, 77.31)');
  });

  it('13. Hourly forecast ribbon rejects NaN, Infinity, and negative values, rendering dashed placeholders', async () => {
    const malformedForecast: AirQualityForecastResponse = {
      ...mockLiveForecastResponse,
      hourly_forecast: [
        {
          timestamp: '2026-11-29T10:00:00Z',
          modelled_aqi_estimate: NaN, // Invalid
          pm2_5: -15.0, // Invalid negative
          pm10: null,
          nitrogen_dioxide: null,
          sulphur_dioxide: null,
          ozone: null,
          data_classification: 'MODELLED_FORECAST',
        },
        {
          timestamp: '2026-11-29T11:00:00Z',
          modelled_aqi_estimate: Infinity, // Invalid
          pm2_5: NaN, // Invalid
          pm10: null,
          nitrogen_dioxide: null,
          sulphur_dioxide: null,
          ozone: null,
          data_classification: 'MODELLED_FORECAST',
        },
        {
          timestamp: '2026-11-29T12:00:00Z',
          modelled_aqi_estimate: 120,
          pm2_5: 35.0,
          pm10: 70.0,
          nitrogen_dioxide: null,
          sulphur_dioxide: null,
          ozone: null,
          data_classification: 'MODELLED_FORECAST',
        },
      ],
    };

    vi.spyOn(apiClient, 'resolveForecastData').mockResolvedValueOnce({
      data: malformedForecast,
      isLive: true,
      isDemo: false,
      isStale: false,
    });

    renderWithClient(<PlannerPage />);

    await screen.findByText('Personalized Daily Action Planner');

    // Dashed entries must be rendered for the invalid hours
    const dashedEntries = screen.getAllByText('--');
    expect(dashedEntries.length).toBeGreaterThan(0);

    // Negative and NaN must not be rendered
    expect(screen.queryByText('-15')).not.toBeInTheDocument();
    expect(screen.queryByText('NaN')).not.toBeInTheDocument();
    expect(screen.queryByText('Infinity')).not.toBeInTheDocument();
  });

  it('Renders insufficient forecast data notice when hourly points are empty', async () => {
    vi.spyOn(apiClient, 'resolveForecastData').mockResolvedValueOnce({
      data: {
        ...mockLiveForecastResponse,
        hourly_forecast: [],
      },
      isLive: true,
      isDemo: false,
      isStale: false,
    });

    renderWithClient(<PlannerPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Insufficient Forecast Telemetry/i);
    expect(screen.getByText(/Hourly pollutant predictions are unavailable/i)).toBeInTheDocument();
  });

  it('Preserves interactive functionality (feedback and policy mode toggling)', async () => {
    vi.spyOn(apiClient, 'resolveForecastData').mockResolvedValueOnce({
      data: mockLiveForecastResponse,
      isLive: true,
      isDemo: false,
      isStale: false,
    });

    renderWithClient(<PlannerPage />);

    await screen.findByText('Personalized Daily Action Planner');

    // Toggle Policy Mode
    const maxProtectionBtn = screen.getByRole('button', { name: /Max Personal Protection/i });
    fireEvent.click(maxProtectionBtn);
    expect(maxProtectionBtn).toHaveClass('text-slate-900', 'dark:text-white');

    // Record Feedback
    const helpfulButtons = screen.getAllByRole('button', { name: /Helpful/i });
    expect(helpfulButtons.length).toBeGreaterThan(0);
    fireEvent.click(helpfulButtons[0]);
    expect(helpfulButtons[0]).toHaveClass('bg-emerald-100');
  });
});
