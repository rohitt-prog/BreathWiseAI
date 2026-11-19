import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { IndoorAirPage } from '../features/indoor/IndoorAirPage';
import { apiClient } from '../services/apiClient';
import { useAppStore } from '../stores/useAppStore';
import { CurrentAirQualityData } from '../types/airQuality';

const createMockTelemetry = (
  overrides: Partial<CurrentAirQualityData> = {},
  isLive = true
) => {
  const base: CurrentAirQualityData = {
    aqi: 180,
    category: 'Moderate',
    dominantPollutant: 'PM2.5',
    station: {
      id: 'del_anand_vihar',
      name: 'Anand Vihar Station, Delhi',
      coordinates: { lat: 28.6508, lon: 77.3152 }
    },
    provenance: {
      dataSource: isLive ? 'OPEN_METEO_MODELLED' : 'SIMULATED_DEMO',
      qualityStatus: isLive ? 'MODELLED_APPROXIMATION' : 'SIMULATED_SCENARIO',
      recordedAt: '2026-11-29T14:00:00Z',
      forecastTimestamp: '2026-11-29T14:00:00Z',
      observedAt: null,
      retrievalFreshness: 'FRESH',
      forecastValidity: 'CURRENT_PERIOD',
      modelRunFreshness: 'UNAVAILABLE',
      indexSystem: 'Indian National AQI (NAQI)',
      sourceAttribution: 'Open-Meteo CAMS'
    },
    healthAdvisory: {
      summary: 'Moderate air quality.',
      maskRecommendation: 'Sensitive individuals should wear masks outdoors.',
      outdoorActivityLevel: 'Reduce intense outdoor exertion.'
    },
    pollutants: {
      'PM2.5': {
        code: 'PM2.5',
        name: 'Fine Particulates',
        concentration: 75.0,
        unit: 'µg/m³',
        subIndex: 180,
        category: 'Moderate'
      },
      'PM10': {
        code: 'PM10',
        name: 'Coarse Particulates',
        concentration: 120.0,
        unit: 'µg/m³',
        subIndex: 120,
        category: 'Satisfactory'
      }
    },
    weather: {
      temperatureC: 22,
      relativeHumidity: 55,
      windSpeedKmh: 6,
      windDirectionDegrees: 270,
      windDirectionCardinal: 'W',
      boundaryLayerHeightMeters: 350,
      stagnationRisk: 'Moderate',
      dispersionConditions: 'Moderate',
      stagnationDescription: 'Moderate dispersion conditions.'
    },
    forecast: []
  };

  return {
    data: { ...base, ...overrides },
    isLive
  };
};

describe('Indoor Air Quality Assistant (Phase 6.3 Integration)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0
        }
      }
    });
    vi.clearAllMocks();
    useAppStore.setState({ currentLocationId: 'del_anand_vihar' });
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          {ui}
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('1. Shared telemetry integration: renders verified live telemetry and outdoor ambient disclosure', async () => {
    vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(createMockTelemetry());

    renderWithProviders(<IndoorAirPage />);

    await waitFor(() => {
      expect(screen.getByTestId('telemetry-provenance-badge')).toHaveTextContent('Regional Atmospheric Model');
    });

    expect(screen.getByText(/Outdoor Ambient Telemetry • Not an Indoor Sensor/i)).toBeInTheDocument();
    expect(screen.getByText(/does not measure private indoor rooms or fabricate indoor IoT sensor readings/i)).toBeInTheDocument();
    expect(screen.getByTestId('outdoor-pm25')).toHaveTextContent('75 µg/m³');
    expect(screen.getByTestId('outdoor-pm10')).toHaveTextContent('120 µg/m³');
  });

  it('2. Query deduplication/cache reuse: uses shared query cache without duplicate fetch calls', async () => {
    const spy = vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(createMockTelemetry());

    renderWithProviders(<IndoorAirPage />);

    await waitFor(() => {
      expect(screen.getByTestId('telemetry-provenance-badge')).toBeInTheDocument();
    });

    expect(spy).toHaveBeenCalledTimes(1);

    // Second render using same QueryClient hits cache without re-fetching
    renderWithProviders(<IndoorAirPage />);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('3. Active location changes: refetches and updates station when location changes in store', async () => {
    const spy = vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(createMockTelemetry());

    renderWithProviders(<IndoorAirPage />);

    await waitFor(() => {
      expect(screen.getByTestId('telemetry-provenance-badge')).toBeInTheDocument();
    });

    // Change location in store
    act(() => {
      useAppStore.setState({ currentLocationId: 'del_ito' });
    });

    await waitFor(() => {
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });

  it('4. Loading and API error states: displays loading skeleton then handles error with retry', async () => {
    let rejectPromise: (reason?: any) => void = () => {};
    const pendingPromise = new Promise<{ data: CurrentAirQualityData; isLive: boolean }>((_, reject) => {
      rejectPromise = reject;
    });

    vi.spyOn(apiClient, 'resolveAirQualityData').mockReturnValue(pendingPromise);

    renderWithProviders(<IndoorAirPage />);

    // Check loading indicator
    expect(screen.getByTestId('indoor-loading')).toBeInTheDocument();
    expect(screen.getByText(/Loading outdoor ambient telemetry and verifying data freshness/i)).toBeInTheDocument();

    // Reject promise to trigger error state
    await act(async () => {
      rejectPromise(new Error('Network offline'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('indoor-error')).toBeInTheDocument();
    });

    expect(screen.getByText(/Telemetry connection offline \(Network offline\)/i)).toBeInTheDocument();

    // Master verdict fails closed to TELEMETRY INSUFFICIENT
    expect(screen.getByTestId('master-ventilation-verdict')).toHaveTextContent('TELEMETRY INSUFFICIENT');

    // Baseline educational guidance remains accessible during error
    expect(screen.getByText(/Kitchen & Cooking/i)).toBeInTheDocument();
    expect(screen.getByText(/STRICT AIR SAFETY DIRECTIVE: Ozone Air Cleaners Banned/i)).toBeInTheDocument();
  });

  it('5. Stale telemetry suppression: master verdict displays TELEMETRY INSUFFICIENT when observation is stale', async () => {
    const staleData = createMockTelemetry({
      provenance: {
        dataSource: 'OPENAQ_V3',
        qualityStatus: 'UNVERIFIED_SENSOR',
        recordedAt: '2026-11-29T08:00:00Z',
        observedAt: '2026-11-29T08:00:00Z',
        observationFreshness: 'STALE',
        retrievalFreshness: 'STALE',
        indexSystem: 'Indian NAQI',
        sourceAttribution: 'OpenAQ Physical Sensor'
      }
    });

    vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(staleData);

    renderWithProviders(<IndoorAirPage />);

    await waitFor(() => {
      expect(screen.getByTestId('telemetry-provenance-badge')).toHaveTextContent('Stale Ground Sensor');
    });

    expect(screen.getByTestId('master-ventilation-verdict')).toHaveTextContent('TELEMETRY INSUFFICIENT');
    expect(screen.queryByText('LIMIT OUTDOOR AIR INFILTRATION')).not.toBeInTheDocument();
    expect(screen.queryByText('CONDITIONAL VENTILATION CONSIDERATION')).not.toBeInTheDocument();
    expect(screen.getByTestId('ventilation-explanation')).toHaveTextContent(/stale or expired/i);
    expect(screen.queryByTestId('current-naqi-badge')).not.toBeInTheDocument();
    expect(screen.getByTestId('no-current-tier-notice')).toHaveTextContent(/No row in this reference table represents your current condition/i);
    expect(screen.getByTestId('purifier-mode-badge')).toHaveTextContent('Educational Baseline (General Principles)');
    expect(screen.getByTestId('purifier-advice')).toHaveTextContent(/Real-time condition-dependent operating directives, modes, and window adjustments are withheld/i);
  });

  it('6. Demo telemetry suppression: master verdict displays TELEMETRY INSUFFICIENT and labels Simulated Demo', async () => {
    const demoData = createMockTelemetry({
      provenance: {
        dataSource: 'SIMULATED_DEMO',
        qualityStatus: 'SIMULATED_SCENARIO',
        recordedAt: '2026-11-29T14:00:00Z',
        retrievalFreshness: 'FRESH',
        indexSystem: 'Indian NAQI',
        sourceAttribution: 'Simulated Demo Scenario'
      }
    }, false);

    vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(demoData);

    renderWithProviders(<IndoorAirPage />);

    await waitFor(() => {
      expect(screen.getByTestId('telemetry-provenance-badge')).toHaveTextContent('Simulated Demo');
    });

    expect(screen.getByTestId('master-ventilation-verdict')).toHaveTextContent('TELEMETRY INSUFFICIENT');
    expect(screen.getByTestId('ventilation-explanation')).toHaveTextContent(/simulated demonstration mode/i);
    expect(screen.queryByTestId('current-naqi-badge')).not.toBeInTheDocument();
    expect(screen.getByTestId('no-current-tier-notice')).toHaveTextContent(/No row in this reference table represents your current condition/i);
    expect(screen.getByTestId('purifier-mode-badge')).toHaveTextContent('Educational Baseline (General Principles)');
  });

  it('7. Unknown-source suppression: unknown source displays Unverified Telemetry, not attributed to Open-Meteo', async () => {
    const unknownData = createMockTelemetry({
      provenance: {
        dataSource: 'UNVERIFIED_CUSTOM_FEED',
        qualityStatus: 'UNAVAILABLE',
        recordedAt: '2026-11-29T14:00:00Z',
        retrievalFreshness: 'FRESH',
        indexSystem: 'Custom',
        sourceAttribution: 'Third Party Stream'
      }
    });

    vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(unknownData);

    renderWithProviders(<IndoorAirPage />);

    await waitFor(() => {
      expect(screen.getByTestId('telemetry-provenance-badge')).toHaveTextContent('Unverified Telemetry');
    });

    expect(screen.getByTestId('master-ventilation-verdict')).toHaveTextContent('TELEMETRY INSUFFICIENT');
    expect(screen.getByTestId('ventilation-explanation')).toHaveTextContent(/unverified/i);
    expect(screen.queryByText('Open-Meteo CAMS')).not.toBeInTheDocument();
    expect(screen.queryByTestId('current-naqi-badge')).not.toBeInTheDocument();
    expect(screen.getByTestId('no-current-tier-notice')).toHaveTextContent(/No row in this reference table represents your current condition/i);
    expect(screen.getByTestId('purifier-mode-badge')).toHaveTextContent('Educational Baseline (General Principles)');
  });

  it('8. Modelled versus physical observation labels: distinguishes live observation from atmospheric model', async () => {
    const physicalData = createMockTelemetry({
      provenance: {
        dataSource: 'OPENAQ_V3',
        qualityStatus: 'VERIFIED_OFFICIAL',
        recordedAt: '2026-11-29T14:00:00Z',
        observedAt: '2026-11-29T13:45:00Z',
        observationFreshness: 'FRESH',
        retrievalFreshness: 'FRESH',
        indexSystem: 'Indian NAQI',
        sourceAttribution: 'CPCB Physical Sensor'
      }
    });

    vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(physicalData);

    renderWithProviders(<IndoorAirPage />);

    await waitFor(() => {
      expect(screen.getByTestId('telemetry-provenance-badge')).toHaveTextContent('Live Ground Sensor');
    });
    expect(screen.getByTestId('provider-attribution')).toHaveTextContent('CPCB Physical Sensor');
  });

  it('9. Missing PM2.5 and unavailable pollutant behavior: displays dashed placeholder and fails closed', async () => {
    const missingPm25 = createMockTelemetry({
      pollutants: {
        'PM10': {
          code: 'PM10',
          name: 'Coarse Particulates',
          concentration: 110.0,
          unit: 'µg/m³',
          subIndex: 110,
          category: 'Moderate'
        }
      }
    });

    vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(missingPm25);

    renderWithProviders(<IndoorAirPage />);

    await waitFor(() => {
      expect(screen.getByTestId('telemetry-provenance-badge')).toHaveTextContent('Regional Atmospheric Model');
    });

    expect(screen.getByTestId('outdoor-pm25')).toHaveTextContent('--');
    expect(screen.getByTestId('master-ventilation-verdict')).toHaveTextContent('TELEMETRY INSUFFICIENT');
    expect(screen.getByTestId('ventilation-explanation')).toHaveTextContent(/PM2.5\) concentration is unavailable/i);
  });

  it('10. Ventilation recommendations never generated from invalid telemetry (e.g. NaN or negative concentration)', async () => {
    const invalidTelemetry = createMockTelemetry({
      pollutants: {
        'PM2.5': {
          code: 'PM2.5',
          name: 'Fine Particulates',
          concentration: -25.0,
          unit: 'µg/m³',
          subIndex: null,
          category: null
        }
      }
    });

    vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(invalidTelemetry);

    renderWithProviders(<IndoorAirPage />);

    await waitFor(() => {
      expect(screen.getByTestId('telemetry-provenance-badge')).toHaveTextContent('Regional Atmospheric Model');
    });

    expect(screen.getByTestId('outdoor-pm25')).toHaveTextContent('--');
    expect(screen.getByTestId('master-ventilation-verdict')).toHaveTextContent('TELEMETRY INSUFFICIENT');
  });

  it('11. General source-control guidance remains available without telemetry', async () => {
    vi.spyOn(apiClient, 'resolveAirQualityData').mockRejectedValue(new Error('Connection error'));

    renderWithProviders(<IndoorAirPage />);

    await waitFor(() => {
      expect(screen.getByTestId('indoor-error')).toBeInTheDocument();
    });

    // Verify all source control protocols remain visible
    expect(screen.getByText(/Active Kitchen Exhaust & Stove Safety/i)).toBeInTheDocument();
    expect(screen.getByText(/Eliminate Incense, Scented Candles, & Mosquito Coils/i)).toBeInTheDocument();
    expect(screen.getByText(/Zero Indoor Smoking & Vaping/i)).toBeInTheDocument();
    expect(screen.getByText(/Damp Mopping Over Dry Broom Sweeping/i)).toBeInTheDocument();
    expect(screen.getByText(/Humidity Control & Bathroom Exhaust/i)).toBeInTheDocument();
  });

  it('12. No invented indoor measurements: explicitly confirms no indoor sensor readings are claimed', async () => {
    vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(createMockTelemetry());

    renderWithProviders(<IndoorAirPage />);

    await waitFor(() => {
      expect(screen.getByText(/Outdoor Ambient Telemetry • Not an Indoor Sensor/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/Indoor AQI/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Indoor PM2.5 Sensor/i)).not.toBeInTheDocument();
  });

  it('13. Purifier recommendations avoid unsupported performance claims and prominently ban ozone devices', async () => {
    vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(createMockTelemetry());

    renderWithProviders(<IndoorAirPage />);

    await waitFor(() => {
      expect(screen.getByText(/STRICT AIR SAFETY DIRECTIVE: Ozone Air Cleaners Banned/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Never use ozone generators, "activated oxygen" machines, or uncertified electronic ionizers in occupied residential spaces/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Only mechanical HEPA filtration and activated carbon absorption are safe/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Mechanical Air Filtration & Purifier Operation/i)).toBeInTheDocument();

    // Verify absence of unsupported claims
    expect(screen.queryByText(/100% virus free/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/kills all bacteria/i)).not.toBeInTheDocument();
  });

  it('14. Verified live high PM2.5 (>=60 µg/m³) evaluates to LIMIT OUTDOOR AIR INFILTRATION', async () => {
    const highPm25 = createMockTelemetry({
      pollutants: {
        'PM2.5': {
          code: 'PM2.5',
          name: 'Fine Particulates',
          concentration: 85.0,
          unit: 'µg/m³',
          subIndex: 250,
          category: 'Poor'
        }
      }
    });

    vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(highPm25);

    renderWithProviders(<IndoorAirPage />);

    await waitFor(() => {
      expect(screen.getByTestId('master-ventilation-verdict')).toHaveTextContent('LIMIT OUTDOOR AIR INFILTRATION');
    });

    expect(screen.getByTestId('ventilation-explanation')).toHaveTextContent(/keep exterior windows and balcony doors closed to limit particulate infiltration/i);
    expect(screen.getByTestId('ventilation-explanation')).toHaveTextContent(/HEPA filtration in recirculation mode/i);
    expect(screen.getByText(/Continuous Recirculation \(Elevated Ambient Smog\)/i)).toBeInTheDocument();
    expect(screen.getByTestId('current-tier-notice')).toHaveTextContent(/Highlighting category/i);
    expect(screen.getByTestId('current-naqi-badge')).toBeInTheDocument();
  });

  it('15. Educational household ventilation reference table renders all six tiers with conditional wording and disclaims official CPCB protocol', async () => {
    vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(createMockTelemetry());

    renderWithProviders(<IndoorAirPage />);

    await waitFor(() => {
      expect(screen.getByText('Good')).toBeInTheDocument();
    });

    expect(screen.getByText(/Educational Household Ventilation Reference Framework/i)).toBeInTheDocument();
    expect(screen.getByText(/General educational framework across 6 NAQI tiers • Not official CPCB protocol/i)).toBeInTheDocument();
    expect(screen.queryByText('Official Indian NAQI Household Ventilation Reference Table')).not.toBeInTheDocument();
    expect(screen.getByText(/is not an official CPCB-published ventilation protocol/i)).toBeInTheDocument();

    expect(screen.getByText('0–50')).toBeInTheDocument();
    expect(screen.getByText('Satisfactory')).toBeInTheDocument();
    expect(screen.getByText('51–100')).toBeInTheDocument();
    expect(screen.getByText('Moderate')).toBeInTheDocument();
    expect(screen.getByText('101–200')).toBeInTheDocument();
    expect(screen.getByText('Poor')).toBeInTheDocument();
    expect(screen.getByText('201–300')).toBeInTheDocument();
    expect(screen.getAllByText('Very Poor').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('301–400')).toBeInTheDocument();
    expect(screen.getByText('Severe')).toBeInTheDocument();
    expect(screen.getByText('401–500')).toBeInTheDocument();

    expect(screen.queryByText(/natural ventilation permitted/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/cross-ventilation permitted/i)).not.toBeInTheDocument();
    expect(screen.getByText(/low aqi alone does not mandate opening windows/i)).toBeInTheDocument();
  });

  it('16. Invalid AQI values (negative, NaN, >500) are displayed as Unavailable and never highlight a current NAQI tier', async () => {
    const invalidAqiData = createMockTelemetry({ aqi: -10 });
    vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(invalidAqiData);

    const { unmount } = renderWithProviders(<IndoorAirPage />);

    await waitFor(() => {
      expect(screen.getByTestId('telemetry-provenance-badge')).toHaveTextContent('Regional Atmospheric Model');
    });

    // Proves negative AQI is displayed as Unavailable, not the raw value
    expect(screen.getByTestId('outdoor-aqi')).toHaveTextContent('Unavailable');
    expect(screen.getByTestId('outdoor-aqi-category')).toHaveTextContent('Unavailable');
    expect(screen.queryByText('-10')).not.toBeInTheDocument();
    expect(screen.queryByTestId('current-naqi-badge')).not.toBeInTheDocument();
    expect(screen.getByTestId('no-current-tier-notice')).toHaveTextContent(/No row in this reference table represents your current condition/i);

    unmount();

    // Out-of-range AQI (>500)
    const outOfRangeAqiData = createMockTelemetry({ aqi: 999 });
    vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(outOfRangeAqiData);

    renderWithProviders(<IndoorAirPage />);

    await waitFor(() => {
      expect(screen.getByTestId('telemetry-provenance-badge')).toHaveTextContent('Regional Atmospheric Model');
    });

    expect(screen.getByTestId('outdoor-aqi')).toHaveTextContent('Unavailable');
    expect(screen.getByTestId('outdoor-aqi-category')).toHaveTextContent('Unavailable');
    expect(screen.queryByText('999')).not.toBeInTheDocument();
    expect(screen.queryByTestId('current-naqi-badge')).not.toBeInTheDocument();
  });

  it('17. Insufficient telemetry purifier educational content contains no current operating directive to continuously run, close windows, or use a specific mode', async () => {
    vi.spyOn(apiClient, 'resolveAirQualityData').mockRejectedValue(new Error('Backend offline'));

    renderWithProviders(<IndoorAirPage />);

    await waitFor(() => {
      expect(screen.getByTestId('indoor-error')).toBeInTheDocument();
    });

    expect(screen.getByTestId('purifier-mode-badge')).toHaveTextContent('Educational Baseline (General Principles)');
    expect(screen.getByTestId('purifier-advice')).toHaveTextContent(/HEPA Filtration & Air Cleaning Principles/i);
    expect(screen.getByTestId('purifier-advice')).toHaveTextContent(/Real-time condition-dependent operating directives, modes, and window adjustments are withheld/i);

    // Proves no directives to continuously operate or close windows
    expect(screen.getByTestId('purifier-advice')).not.toHaveTextContent(/operate.*continuously/i);
    expect(screen.getByTestId('purifier-advice')).not.toHaveTextContent(/keep exterior windows.*closed/i);
    expect(screen.queryByText(/running continuously on low or medium is far more effective/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/keep exterior windows and doors closed while operating purifiers/i)).not.toBeInTheDocument();

    // Proves educational factors explain CADR, airflow, placement, enclosure dynamics, and filter maintenance
    expect(screen.getByText(/Room Sizing & CADR/i)).toBeInTheDocument();
    expect(screen.getByText(/Airflow Dynamics & Air Exchange/i)).toBeInTheDocument();
    expect(screen.getByText(/Device Placement & Intake Clearance/i)).toBeInTheDocument();
    expect(screen.getByText(/Enclosure Air Exchange Rates/i)).toBeInTheDocument();
    expect(screen.getByText(/Filter Care & Pre-filter Maintenance/i)).toBeInTheDocument();
  });

  it('18. Room-by-room educational content is clearly distinguished as general framework independent of live telemetry', async () => {
    vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(createMockTelemetry());

    renderWithProviders(<IndoorAirPage />);

    await waitFor(() => {
      expect(screen.getByText(/Room-by-Room Best Practices \(Educational Framework\)/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/General household measures • Independent of live telemetry/i)).toBeInTheDocument();
    expect(screen.getByText(/Living Room \/ Hall/i)).toBeInTheDocument();
    expect(screen.getByText(/Kitchen & Cooking/i)).toBeInTheDocument();
    expect(screen.getByText(/Bedroom & Sleep/i)).toBeInTheDocument();
  });
});
