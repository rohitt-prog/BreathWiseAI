import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AlternativesPage } from '../features/alternatives/AlternativesPage';
import { apiClient } from '../services/apiClient';
import { useAppStore } from '../stores/useAppStore';
import { CurrentAirQualityData } from '../types/airQuality';

const createMockTelemetry = (
  overrides: Partial<CurrentAirQualityData> = {},
  isLive = true
): { data: CurrentAirQualityData; isLive: boolean } => ({
  isLive,
  data: {
    station: {
      id: 'del_anand_vihar',
      name: 'Anand Vihar Station',
      coordinates: { lat: 28.65, lon: 77.31 }
    },
    aqi: 280,
    category: 'Poor',
    dominantPollutant: 'PM2.5',
    healthAdvisory: {
      summary: 'Poor air quality.',
      maskRecommendation: 'Wear N95 respirator.',
      outdoorActivityLevel: 'Limit outdoor exertion.'
    },
    forecast: [],
    pollutants: {
      'PM2.5': {
        code: 'PM2.5',
        name: 'Fine Particulates',
        concentration: 75.0,
        unit: 'µg/m³',
        subIndex: 280,
        category: 'Poor'
      },
      'PM10': {
        code: 'PM10',
        name: 'Coarse Particulates',
        concentration: 120.0,
        unit: 'µg/m³',
        subIndex: 120,
        category: 'Moderate'
      }
    },
    provenance: {
      dataSource: 'OPEN_METEO_MODELLED',
      qualityStatus: 'MODELLED_APPROXIMATION',
      recordedAt: new Date().toISOString(),
      retrievalFreshness: 'FRESH',
      modelRunFreshness: 'RECENT',
      forecastValidity: 'CURRENT_PERIOD',
      indexSystem: 'Indian NAQI',
      sourceAttribution: 'Open-Meteo Regional CAMS Model'
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
      stagnationDescription: 'Adequate vertical dispersion'
    },
    ...overrides
  }
});

describe('Alternatives & Commute Exposure (Phase 6.4 Integration)', () => {
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
        <MemoryRouter>
          {ui}
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('1. Shared telemetry integration: renders verified live telemetry and outdoor ambient disclosure', async () => {
    vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(createMockTelemetry());

    renderWithProviders(<AlternativesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('telemetry-provenance-badge')).toHaveTextContent('Regional Atmospheric Model');
    });

    expect(screen.getByText(/Outdoor Ambient Telemetry • Not an In-Cabin Sensor/i)).toBeInTheDocument();
    expect(screen.getByText(/does not measure private in-cabin vehicle air, route-level IoT sensors/i)).toBeInTheDocument();
    expect(screen.getByTestId('outdoor-pm25')).toHaveTextContent('75 µg/m³');
    expect(screen.getByTestId('outdoor-pm10')).toHaveTextContent('120 µg/m³');
    expect(screen.getByTestId('outdoor-aqi')).toHaveTextContent('280');
    expect(screen.getByTestId('outdoor-aqi-category')).toHaveTextContent('Poor');
  });

  it('2. Query deduplication/cache reuse: uses shared query cache without duplicate fetch calls', async () => {
    const spy = vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(createMockTelemetry());

    renderWithProviders(<AlternativesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('telemetry-provenance-badge')).toBeInTheDocument();
    });

    expect(spy).toHaveBeenCalledTimes(1);

    // Second render using same QueryClient hits cache without re-fetching
    renderWithProviders(<AlternativesPage />);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('3. Active location changes: refetches and updates station when location changes in store', async () => {
    const spy = vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(createMockTelemetry());

    renderWithProviders(<AlternativesPage />);

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

  it('4. Loading state: displays loading skeleton while telemetry is resolving', async () => {
    let resolvePromise: (val: any) => void = () => {};
    const pendingPromise = new Promise<{ data: CurrentAirQualityData; isLive: boolean }>((res) => {
      resolvePromise = res;
    });

    vi.spyOn(apiClient, 'resolveAirQualityData').mockReturnValue(pendingPromise);

    renderWithProviders(<AlternativesPage />);

    expect(screen.getByTestId('alternatives-loading')).toBeInTheDocument();
    expect(screen.getByText(/Loading outdoor ambient telemetry and verifying data freshness/i)).toBeInTheDocument();

    await act(async () => {
      resolvePromise(createMockTelemetry());
    });

    await waitFor(() => {
      expect(screen.queryByTestId('alternatives-loading')).not.toBeInTheDocument();
    });
  });

  it('5. API error state: handles fetch error with retry capability and fails closed', async () => {
    vi.spyOn(apiClient, 'resolveAirQualityData').mockRejectedValue(new Error('Network offline'));

    renderWithProviders(<AlternativesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('alternatives-error')).toBeInTheDocument();
    });

    expect(screen.getByText(/Telemetry connection offline \(Network offline\)/i)).toBeInTheDocument();
    expect(screen.getByTestId('master-alternatives-verdict')).toHaveTextContent('TELEMETRY INSUFFICIENT');

    // General educational mode profiles remain accessible
    expect(screen.getByText('Metro / Mass Rail Transit')).toBeInTheDocument();
    expect(screen.getByText('Enclosed Vehicle (AC / Filtered)')).toBeInTheDocument();
  });

  it('6. Stale telemetry suppression: master verdict displays TELEMETRY INSUFFICIENT when observation is stale', async () => {
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

    renderWithProviders(<AlternativesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('telemetry-provenance-badge')).toHaveTextContent('Stale Ground Sensor');
    });

    expect(screen.getByTestId('master-alternatives-verdict')).toHaveTextContent('TELEMETRY INSUFFICIENT');
    expect(screen.queryByText('PRIORITIZE ENCLOSED TRANSIT')).not.toBeInTheDocument();
    expect(screen.queryByText('ACTIVE & MASS TRANSIT VIABLE')).not.toBeInTheDocument();
    expect(screen.getByTestId('alternatives-explanation')).toHaveTextContent(/stale or expired/i);

    // Cards display Educational Comparison badge without live verdict
    expect(screen.getByTestId('verdict-badge-metro')).toHaveTextContent('Educational Comparison');
    expect(screen.getByTestId('verdict-badge-bicycle')).toHaveTextContent('Educational Comparison');
  });

  it('7. Demo telemetry suppression: master verdict displays TELEMETRY INSUFFICIENT and labels Simulated Demo', async () => {
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

    renderWithProviders(<AlternativesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('telemetry-provenance-badge')).toHaveTextContent('Simulated Demo');
    });

    expect(screen.getByTestId('master-alternatives-verdict')).toHaveTextContent('TELEMETRY INSUFFICIENT');
    expect(screen.getByTestId('alternatives-explanation')).toHaveTextContent(/simulated demonstration mode/i);
    expect(screen.getByTestId('verdict-badge-metro')).toHaveTextContent('Educational Comparison');
  });

  it('8. Unknown-source suppression: unknown source displays Unverified Telemetry and fails closed', async () => {
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

    renderWithProviders(<AlternativesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('telemetry-provenance-badge')).toHaveTextContent('Unverified Telemetry');
    });

    expect(screen.getByTestId('master-alternatives-verdict')).toHaveTextContent('TELEMETRY INSUFFICIENT');
    expect(screen.getByTestId('alternatives-explanation')).toHaveTextContent(/unverified/i);
    expect(screen.getByTestId('verdict-badge-metro')).toHaveTextContent('Educational Comparison');
  });

  it('9. Modelled versus physical observation labels: distinguishes live observation from atmospheric model', async () => {
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

    renderWithProviders(<AlternativesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('telemetry-provenance-badge')).toHaveTextContent('Live Ground Sensor');
    });
    expect(screen.getByTestId('provider-attribution')).toHaveTextContent('CPCB Physical Sensor');
  });

  it('10. Missing PM2.5 and unavailable pollutant behavior: displays dashed placeholder and fails closed', async () => {
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

    renderWithProviders(<AlternativesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('telemetry-provenance-badge')).toHaveTextContent('Regional Atmospheric Model');
    });

    expect(screen.getByTestId('outdoor-pm25')).toHaveTextContent('--');
    expect(screen.getByTestId('master-alternatives-verdict')).toHaveTextContent('TELEMETRY INSUFFICIENT');
    expect(screen.getByTestId('alternatives-explanation')).toHaveTextContent(/PM2.5\) concentration is unavailable/i);
  });

  it('11. Invalid/non-finite pollutant handling: negative or NaN concentrations fail closed', async () => {
    const invalidTelemetry = createMockTelemetry({
      pollutants: {
        'PM2.5': {
          code: 'PM2.5',
          name: 'Fine Particulates',
          concentration: -30.0,
          unit: 'µg/m³',
          subIndex: null,
          category: null
        }
      }
    });

    vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(invalidTelemetry);

    renderWithProviders(<AlternativesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('telemetry-provenance-badge')).toHaveTextContent('Regional Atmospheric Model');
    });

    expect(screen.getByTestId('outdoor-pm25')).toHaveTextContent('--');
    expect(screen.getByTestId('master-alternatives-verdict')).toHaveTextContent('TELEMETRY INSUFFICIENT');
  });

  it('12. Unsupported fixed exposure multipliers are not presented as verified facts', async () => {
    vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(createMockTelemetry());

    renderWithProviders(<AlternativesPage />);

    await waitFor(() => {
      expect(screen.getByText('Metro / Mass Rail Transit')).toBeInTheDocument();
    });

    // Verify absence of unsupported fixed claims (e.g. 0.3x, 0.5x, 6x deep alveolar deposition)
    expect(screen.queryByText(/0\.3x/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/0\.5x/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/increases deep alveolar particulate deposition by 6x/i)).not.toBeInTheDocument();
  });

  it('13. No fabricated route, traffic, travel duration, or in-cabin readings', async () => {
    vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(createMockTelemetry());

    renderWithProviders(<AlternativesPage />);

    await waitFor(() => {
      expect(screen.getByText(/Outdoor Ambient Telemetry • Not an In-Cabin Sensor/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/In-Cabin PM2.5 Sensor/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Live Route Congestion Sensor/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Rohini Sector 16 ➔ Connaught Place/i)).not.toBeInTheDocument();
  });

  it('14. No current-condition recommendation leakage through secondary cards when telemetry is insufficient', async () => {
    vi.spyOn(apiClient, 'resolveAirQualityData').mockRejectedValue(new Error('Connection failure'));

    renderWithProviders(<AlternativesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('alternatives-error')).toBeInTheDocument();
    });

    // Check that no card leaks condition verdicts
    expect(screen.queryByText('Recommended Enclosed Option')).not.toBeInTheDocument();
    expect(screen.queryByText('Enclosed Transit Option')).not.toBeInTheDocument();
    expect(screen.queryByText('High Respiratory Inhalation Risk')).not.toBeInTheDocument();
    expect(screen.queryByText('Unbuffered Roadside Exposure')).not.toBeInTheDocument();
    expect(screen.queryByText('Live Contextual Advice')).not.toBeInTheDocument();
  });

  it('15. Personal exposure reduction is clearly distinguished from greenhouse gas emissions reduction', async () => {
    vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(createMockTelemetry());

    renderWithProviders(<AlternativesPage />);

    await waitFor(() => {
      expect(screen.getByText(/The Core Dilemma: Personal Exposure vs. Environmental Emissions/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Reducing personal inhaled pollution exposure is not the same as reducing vehicular greenhouse gas emissions/i)).toBeInTheDocument();
    expect(screen.queryByText(/cycling in traffic reduces your exposure/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sustainable commute reduces your inhaled pollution/i)).not.toBeInTheDocument();
  });

  it('16. General educational alternatives remain available when telemetry is insufficient', async () => {
    vi.spyOn(apiClient, 'resolveAirQualityData').mockRejectedValue(new Error('Offline'));

    renderWithProviders(<AlternativesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('alternatives-error')).toBeInTheDocument();
    });

    expect(screen.getByText('Metro / Mass Rail Transit')).toBeInTheDocument();
    expect(screen.getByText('Bicycle / Active Commute')).toBeInTheDocument();
    expect(screen.getByText('Motorcycle / Scooter')).toBeInTheDocument();
    expect(screen.getByText('Auto-Rickshaw (Three-Wheeler)')).toBeInTheDocument();
    expect(screen.getByText('Pedestrian Walking')).toBeInTheDocument();
    expect(screen.getByText(/Real-World Factors Governing In-Transit Exposure/i)).toBeInTheDocument();
  });

  it('17. Verified live telemetry correctly enables evidence-supported contextual guidance', async () => {
    const elevatedTelemetry = createMockTelemetry({
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

    vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(elevatedTelemetry);

    renderWithProviders(<AlternativesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('master-alternatives-verdict')).toHaveTextContent('PRIORITIZE ENCLOSED TRANSIT');
    });

    expect(screen.getByTestId('verdict-badge-metro')).toHaveTextContent('Enclosed Transit Option');
    expect(screen.getByTestId('verdict-badge-bicycle')).toHaveTextContent('High Respiratory Inhalation Risk');
    expect(screen.getByTestId('verdict-badge-two_wheeler')).toHaveTextContent('Unbuffered Roadside Exposure');
    expect(screen.getAllByText(/N95 Respirator Advised/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Live Contextual Advice/i).length).toBeGreaterThanOrEqual(1);
  });

  it('18. Independent PM10 and PM2.5 rendering: displays separate concentrations and handles missing PM10 cleanly', async () => {
    const missingPm10Telemetry = createMockTelemetry({
      pollutants: {
        'PM2.5': {
          code: 'PM2.5',
          name: 'Fine Particulates',
          concentration: 48.0,
          unit: 'µg/m³',
          subIndex: 115,
          category: 'Moderate',
        },
      },
    });

    vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(missingPm10Telemetry);

    renderWithProviders(<AlternativesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('outdoor-pm25')).toHaveTextContent('48 µg/m³');
    });

    expect(screen.getByTestId('outdoor-pm10')).toHaveTextContent('--');
  });

  it('19. Unsupported quantitative numbers audit in UI: proves absence of 2x-5x, 10-50m, or guaranteed filtration in DOM', async () => {
    vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(createMockTelemetry());

    const { container } = renderWithProviders(<AlternativesPage />);

    await waitFor(() => {
      expect(screen.getByText('Metro / Mass Rail Transit')).toBeInTheDocument();
    });

    const fullText = container.textContent || '';
    expect(fullText).not.toMatch(/2x\s*(?:to|–|-)\s*5x/i);
    expect(fullText).not.toMatch(/10\s*(?:to|–|-)\s*50\s*(?:meters|m)/i);
    expect(fullText).not.toMatch(/guaranteed filtration/i);
    expect(fullText).not.toMatch(/deep alveolar particulate deposition by 6x/i);
  });

  it('20. Low-PM2.5 guidance uses non-alarmist, proportionate, non-definitive wording without asserting safe route', async () => {
    const cleanTelemetry = createMockTelemetry({
      aqi: 45,
      category: 'Good',
      pollutants: {
        'PM2.5': {
          code: 'PM2.5',
          name: 'Fine Particulates',
          concentration: 18.0,
          unit: 'µg/m³',
          subIndex: 45,
          category: 'Good',
        },
      },
    });

    vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(cleanTelemetry);

    const { container } = renderWithProviders(<AlternativesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('master-alternatives-verdict')).toHaveTextContent('ACTIVE & MASS TRANSIT VIABLE');
    });

    const fullText = container.textContent || '';
    expect(fullText).not.toMatch(/Recommended Active Travel/i);
    expect(fullText).not.toMatch(/Clean ambient conditions/i);
    expect(fullText).not.toMatch(/Minimal pollution exposure risk/i);
    expect(screen.getByTestId('verdict-badge-bicycle')).toHaveTextContent('Active Commute Viable');
    expect(screen.getByTestId('alternatives-explanation')).toHaveTextContent(/regional station data does not measure microscale roadside exhaust/i);
  });

  it('21. Emissions qualification: renders illustrative categories note and badges without claiming measured results', async () => {
    vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(createMockTelemetry());

    renderWithProviders(<AlternativesPage />);

    await waitFor(() => {
      expect(screen.getByText(/Illustrative Emissions Context:/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Emissions categories \(Very Low, Low, Moderate, High\) reflect broad illustrative groupings/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Emissions \(Illustrative\)/i).length).toBeGreaterThanOrEqual(1);
  });
});
