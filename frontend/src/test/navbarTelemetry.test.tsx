import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { Navbar } from '../components/layout/Navbar';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { apiClient } from '../services/apiClient';
import { useAppStore } from '../stores/useAppStore';
import { CurrentAirQualityData } from '../types/airQuality';

const createMockTelemetry = (
  overrides: Partial<CurrentAirQualityData> = {},
  isLive = true
) => {
  const base: CurrentAirQualityData = {
    aqi: 154,
    category: 'Moderate',
    dominantPollutant: 'PM2.5',
    station: {
      id: 'del_anand_vihar',
      name: 'Anand Vihar Station',
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
      summary: 'Air quality is moderate.',
      maskRecommendation: 'Sensitive individuals should wear masks outdoors.',
      outdoorActivityLevel: 'Reduce intense outdoor exertion.'
    },
    pollutants: {},
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

describe('Phase 6.1 — Shared Telemetry & Navbar Unification', () => {
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

  const renderNavbar = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Navbar />
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('1. Navbar displays actual returned NAQI and correct category', async () => {
    vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(
      createMockTelemetry({ aqi: 154, category: 'Moderate' }, true)
    );

    renderNavbar();

    await waitFor(() => {
      const livePill = screen.getByTestId('navbar-aqi-live');
      expect(livePill).toBeInTheDocument();
      expect(livePill).toHaveTextContent('AQI 154');
      expect(livePill).toHaveTextContent(/Moderate/i);
      expect(livePill).toHaveTextContent(/Modelled/i);
    });
  });

  it('2. Navbar updates when active location changes in store', async () => {
    const resolveSpy = vi.spyOn(apiClient, 'resolveAirQualityData').mockImplementation(
      async (locId) => {
        if (locId === 'del_connaught_place') {
          return createMockTelemetry(
            {
              aqi: 88,
              category: 'Satisfactory',
              station: {
                id: 'del_connaught_place',
                name: 'Connaught Place Station',
                coordinates: { lat: 28.6304, lon: 77.2177 }
              }
            },
            true
          );
        }
        return createMockTelemetry({ aqi: 245, category: 'Poor' }, true);
      }
    );

    renderNavbar();

    await waitFor(() => {
      expect(screen.getByText('AQI 245')).toBeInTheDocument();
    });

    // Change location to Connaught Place
    act(() => {
      useAppStore.getState().setCurrentLocationId('del_connaught_place');
    });

    await waitFor(() => {
      expect(screen.getByText('AQI 88')).toBeInTheDocument();
      expect(screen.getByText(/SATISFACTORY \(MODELLED\)/i)).toBeInTheDocument();
    });

    expect(resolveSpy).toHaveBeenCalledWith(
      'del_connaught_place',
      expect.objectContaining({ lat: 28.6304, lon: 77.2177 })
    );
  });

  it('3. Navbar shows compact loading indicator while telemetry is resolving', async () => {
    let finishResolving: (val: any) => void;
    const pendingPromise = new Promise((resolve) => {
      finishResolving = resolve;
    });

    vi.spyOn(apiClient, 'resolveAirQualityData').mockReturnValue(pendingPromise as any);

    renderNavbar();

    expect(screen.getByTestId('navbar-aqi-loading')).toBeInTheDocument();
    expect(screen.getByText('Loading AQI...')).toBeInTheDocument();

    // Settle promise to avoid hanging test
    await act(async () => {
      finishResolving!(createMockTelemetry({ aqi: 120, category: 'Moderate' }, true));
    });

    await waitFor(() => {
      expect(screen.queryByTestId('navbar-aqi-loading')).not.toBeInTheDocument();
      expect(screen.getByText('AQI 120')).toBeInTheDocument();
    });
  });

  it('4. Navbar displays neutral unavailable state on error without hardcoded substitution', async () => {
    vi.spyOn(apiClient, 'resolveAirQualityData').mockRejectedValue(
      new Error('Telemetry resolution failed')
    );

    renderNavbar();

    await waitFor(() => {
      const unavailPill = screen.getByTestId('navbar-aqi-unavailable');
      expect(unavailPill).toBeInTheDocument();
      expect(unavailPill).toHaveTextContent('AQI --');
      expect(unavailPill).toHaveTextContent(/Unavailable/i);
    });

    // Ensure no plausible fake number leaked
    expect(screen.queryByText(/AQI 368/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/AQI 154/i)).not.toBeInTheDocument();
  });

  it('5. Navbar displays simulated demo disclosure when backend is offline', async () => {
    vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(
      createMockTelemetry({ aqi: 368, category: 'Very Poor' }, false)
    );

    renderNavbar();

    await waitFor(() => {
      const demoPill = screen.getByTestId('navbar-aqi-demo');
      expect(demoPill).toBeInTheDocument();
      expect(demoPill).toHaveTextContent('AQI 368');
      expect(demoPill).toHaveTextContent(/Very Poor/i);
      expect(demoPill).toHaveTextContent(/Demo/i);
    });

    // Never present demo data as live
    expect(screen.queryByTestId('navbar-aqi-live')).not.toBeInTheDocument();
  });

  it('6. Missing Indian NAQI is displayed as NAQI Unavailable without substituting foreign standard', async () => {
    vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(
      createMockTelemetry(
        {
          aqi: null,
          category: 'Unavailable',
          indianNaqiUnavailableReason: 'Awaiting verified physical CPCB monitoring.'
        },
        true
      )
    );

    renderNavbar();

    await waitFor(() => {
      const missingPill = screen.getByTestId('navbar-aqi-missing-naqi');
      expect(missingPill).toBeInTheDocument();
      expect(missingPill).toHaveTextContent('AQI --');
      expect(missingPill).toHaveTextContent(/NAQI Unavailable/i);
    });

    // Verify it didn't fabricate an AQI
    expect(screen.queryByText(/AQI [0-9]+/i)).not.toBeInTheDocument();
  });

  it('7. Dashboard and Navbar reuse the same query and deduplicate requests for identical coordinates', async () => {
    const resolveSpy = vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(
      createMockTelemetry({ aqi: 175, category: 'Moderate' }, true)
    );
    vi.spyOn(apiClient, 'fetchAIInsights').mockResolvedValue({
      status: 'FALLBACK_NO_API_KEY',
      recommended_actions: []
    } as any);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Navbar />
          <DashboardPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('navbar-aqi-live')).toHaveTextContent('AQI 175');
    });

    // Expect exactly ONE call to resolveAirQualityData despite two components mounting
    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(resolveSpy).toHaveBeenCalledWith(
      'del_anand_vihar',
      expect.objectContaining({ lat: 28.6508, lon: 77.3152 })
    );
  });

  it('8. Changing locations does not display stale AQI from previous location during fetch', async () => {
    let resolveSecondCall: (val: any) => void;
    const secondCallPromise = new Promise((resolve) => {
      resolveSecondCall = resolve;
    });

    const resolveSpy = vi.spyOn(apiClient, 'resolveAirQualityData').mockImplementation(
      async (locId) => {
        if (locId === 'del_connaught_place') {
          return secondCallPromise as any;
        }
        return createMockTelemetry({ aqi: 310, category: 'Severe' }, true);
      }
    );

    renderNavbar();

    // Verify initial location A data is rendered
    await waitFor(() => {
      expect(screen.getByText('AQI 310')).toBeInTheDocument();
    });

    // Switch to Location B
    act(() => {
      useAppStore.getState().setCurrentLocationId('del_connaught_place');
    });

    // Navbar must enter loading state immediately and NOT retain location A's 310
    expect(screen.getByTestId('navbar-aqi-loading')).toBeInTheDocument();
    expect(screen.queryByText('AQI 310')).not.toBeInTheDocument();

    // Settle location B
    await act(async () => {
      resolveSecondCall!(createMockTelemetry({ aqi: 95, category: 'Satisfactory' }, true));
    });

    await waitFor(() => {
      expect(screen.getByText('AQI 95')).toBeInTheDocument();
    });

    expect(resolveSpy).toHaveBeenCalledTimes(2);
  });

  describe('Modelled & Sensor Telemetry Freshness Distinctions', () => {
    it('renders Fresh Modelled Telemetry with (Modelled) tag and pulse icon', async () => {
      vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(
        createMockTelemetry(
          {
            aqi: 140,
            category: 'Moderate',
            provenance: {
              dataSource: 'MODELLED_FORECAST',
              qualityStatus: 'MODELLED_APPROXIMATION',
              recordedAt: '2026-11-29T14:00:00Z',
              forecastTimestamp: '2026-11-29T14:00:00Z',
              retrievedAt: '2026-11-29T14:02:00Z',
              retrievalFreshness: 'FRESH',
              forecastValidity: 'CURRENT_PERIOD',
              modelRunFreshness: 'UNAVAILABLE',
              indexSystem: 'Open-Meteo CAMS',
              sourceAttribution: 'Open-Meteo CAMS'
            }
          },
          true
        )
      );

      renderNavbar();

      await waitFor(() => {
        const livePill = screen.getByTestId('navbar-aqi-live');
        expect(livePill).toBeInTheDocument();
        expect(livePill).toHaveTextContent('AQI 140');
        expect(livePill).toHaveTextContent(/MODERATE \(MODELLED\)/i);
        expect(livePill).not.toHaveTextContent(/STALE/i);
      });
    });

    it('renders Stale Modelled Telemetry when retrievalFreshness is STALE', async () => {
      vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(
        createMockTelemetry(
          {
            aqi: 165,
            category: 'Moderate',
            provenance: {
              dataSource: 'MODELLED_FORECAST',
              qualityStatus: 'MODELLED_APPROXIMATION',
              recordedAt: '2026-11-29T10:00:00Z',
              forecastTimestamp: '2026-11-29T14:00:00Z',
              retrievedAt: '2026-11-29T10:00:00Z',
              retrievalFreshness: 'STALE',
              forecastValidity: 'CURRENT_PERIOD',
              modelRunFreshness: 'UNAVAILABLE',
              indexSystem: 'Open-Meteo CAMS',
              sourceAttribution: 'Open-Meteo CAMS'
            }
          },
          true
        )
      );

      renderNavbar();

      await waitFor(() => {
        const livePill = screen.getByTestId('navbar-aqi-live');
        expect(livePill).toBeInTheDocument();
        expect(livePill).toHaveTextContent('AQI 165');
        expect(livePill).toHaveTextContent(/MODERATE \(STALE MODELLED\)/i);
      });
    });

    it('renders Stale Modelled Telemetry when forecastValidity is HISTORICAL_PERIOD', async () => {
      vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(
        createMockTelemetry(
          {
            aqi: 190,
            category: 'Moderate',
            provenance: {
              dataSource: 'MODELLED_FORECAST',
              qualityStatus: 'MODELLED_APPROXIMATION',
              recordedAt: '2026-11-29T14:00:00Z',
              forecastTimestamp: '2026-11-29T10:00:00Z',
              retrievedAt: '2026-11-29T14:02:00Z',
              retrievalFreshness: 'FRESH',
              forecastValidity: 'HISTORICAL_PERIOD',
              modelRunFreshness: 'UNAVAILABLE',
              indexSystem: 'Open-Meteo CAMS',
              sourceAttribution: 'Open-Meteo CAMS'
            }
          },
          true
        )
      );

      renderNavbar();

      await waitFor(() => {
        const livePill = screen.getByTestId('navbar-aqi-live');
        expect(livePill).toBeInTheDocument();
        expect(livePill).toHaveTextContent('AQI 190');
        expect(livePill).toHaveTextContent(/MODERATE \(STALE MODELLED\)/i);
      });
    });

    it('renders Stale Modelled Telemetry when modelRunFreshness is STALE', async () => {
      vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(
        createMockTelemetry(
          {
            aqi: 180,
            category: 'Moderate',
            provenance: {
              dataSource: 'MODELLED_FORECAST',
              qualityStatus: 'MODELLED_APPROXIMATION',
              recordedAt: '2026-11-29T14:00:00Z',
              forecastTimestamp: '2026-11-29T14:00:00Z',
              retrievedAt: '2026-11-29T14:02:00Z',
              retrievalFreshness: 'FRESH',
              forecastValidity: 'CURRENT_PERIOD',
              modelRunFreshness: 'STALE',
              indexSystem: 'Open-Meteo CAMS',
              sourceAttribution: 'Open-Meteo CAMS'
            }
          },
          true
        )
      );

      renderNavbar();

      await waitFor(() => {
        const livePill = screen.getByTestId('navbar-aqi-live');
        expect(livePill).toBeInTheDocument();
        expect(livePill).toHaveTextContent('AQI 180');
        expect(livePill).toHaveTextContent(/MODERATE \(STALE MODELLED\)/i);
      });
    });

    it('renders Stale Physical Sensor Telemetry when observationFreshness is STALE', async () => {
      vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(
        createMockTelemetry(
          {
            aqi: 220,
            category: 'Poor',
            provenance: {
              dataSource: 'OBSERVATION',
              qualityStatus: 'UNVERIFIED_SENSOR',
              recordedAt: '2026-11-29T08:00:00Z',
              observedAt: '2026-11-29T08:00:00Z',
              observationFreshness: 'STALE',
              observationAgeMinutes: 360,
              retrievalFreshness: 'FRESH',
              indexSystem: 'OpenAQ Ground Sensor',
              sourceAttribution: 'OpenAQ'
            }
          },
          true
        )
      );

      renderNavbar();

      await waitFor(() => {
        const livePill = screen.getByTestId('navbar-aqi-live');
        expect(livePill).toBeInTheDocument();
        expect(livePill).toHaveTextContent('AQI 220');
        expect(livePill).toHaveTextContent(/POOR \(STALE SENSOR\)/i);
      });
    });

    it('does not treat missing freshness metadata as proof that data is fresh', async () => {
      // Modelled data with missing retrievalFreshness and missing forecastValidity
      vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(
        createMockTelemetry(
          {
            aqi: 135,
            category: 'Moderate',
            provenance: {
              dataSource: 'MODELLED_FORECAST',
              qualityStatus: 'MODELLED_APPROXIMATION',
              recordedAt: '2026-11-29T14:00:00Z',
              indexSystem: 'Unverified Model Source',
              sourceAttribution: 'Model'
            }
          },
          true
        )
      );

      renderNavbar();

      await waitFor(() => {
        const livePill = screen.getByTestId('navbar-aqi-live');
        expect(livePill).toBeInTheDocument();
        expect(livePill).toHaveTextContent('AQI 135');
        // Must be marked STALE because missing freshness metadata is not proof of freshness
        expect(livePill).toHaveTextContent(/MODERATE \(STALE MODELLED\)/i);
        expect(livePill).not.toHaveTextContent(/MODERATE \(MODELLED\)$/i);
      });
    });

    it('preserves Demo fallback disclosure clearly even if simulated data has freshness fields', async () => {
      vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(
        createMockTelemetry(
          {
            aqi: 368,
            category: 'Very Poor',
            provenance: {
              dataSource: 'SIMULATED_DEMO',
              qualityStatus: 'SIMULATED_SCENARIO',
              recordedAt: '2026-11-29T14:00:00Z',
              retrievalFreshness: 'FRESH',
              forecastValidity: 'CURRENT_PERIOD',
              indexSystem: 'Demo Scenario',
              sourceAttribution: 'Simulated'
            }
          },
          false
        )
      );

      renderNavbar();

      await waitFor(() => {
        const demoPill = screen.getByTestId('navbar-aqi-demo');
        expect(demoPill).toBeInTheDocument();
        expect(demoPill).toHaveTextContent('AQI 368');
        expect(demoPill).toHaveTextContent(/VERY POOR \(DEMO\)/i);
        expect(screen.queryByTestId('navbar-aqi-live')).not.toBeInTheDocument();
      });
    });

    it('renders Stale Sensor when physical observation is FRESH but retrievalFreshness is missing', async () => {
      vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(
        createMockTelemetry(
          {
            aqi: 90,
            category: 'Satisfactory',
            provenance: {
              dataSource: 'OBSERVATION',
              qualityStatus: 'UNVERIFIED_SENSOR',
              recordedAt: '2026-11-29T14:00:00Z',
              observedAt: '2026-11-29T14:00:00Z',
              observationFreshness: 'FRESH',
              indexSystem: 'OpenAQ Ground Sensor',
              sourceAttribution: 'OpenAQ'
            }
          },
          true
        )
      );

      renderNavbar();

      await waitFor(() => {
        const livePill = screen.getByTestId('navbar-aqi-live');
        expect(livePill).toBeInTheDocument();
        expect(livePill).toHaveTextContent('AQI 90');
        expect(livePill).toHaveTextContent(/SATISFACTORY \(STALE SENSOR\)/i);
      });
    });

    it('renders Stale Sensor when physical observation has INVALID retrievalFreshness', async () => {
      vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(
        createMockTelemetry(
          {
            aqi: 95,
            category: 'Satisfactory',
            provenance: {
              dataSource: 'OBSERVATION',
              qualityStatus: 'UNVERIFIED_SENSOR',
              recordedAt: '2026-11-29T14:00:00Z',
              observedAt: '2026-11-29T14:00:00Z',
              observationFreshness: 'FRESH',
              retrievalFreshness: 'INVALID',
              indexSystem: 'OpenAQ Ground Sensor',
              sourceAttribution: 'OpenAQ'
            }
          },
          true
        )
      );

      renderNavbar();

      await waitFor(() => {
        const livePill = screen.getByTestId('navbar-aqi-live');
        expect(livePill).toBeInTheDocument();
        expect(livePill).toHaveTextContent('AQI 95');
        expect(livePill).toHaveTextContent(/SATISFACTORY \(STALE SENSOR\)/i);
      });
    });

    it('renders Unverified Telemetry when data source is unrecognized', async () => {
      vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(
        createMockTelemetry(
          {
            aqi: 110,
            category: 'Moderate',
            provenance: {
              dataSource: 'UNRECOGNIZED_FEED' as any,
              qualityStatus: 'UNAVAILABLE',
              recordedAt: '2026-11-29T14:00:00Z',
              retrievalFreshness: 'FRESH',
              indexSystem: 'Unknown Feed',
              sourceAttribution: 'Unknown Source'
            }
          },
          true
        )
      );

      renderNavbar();

      await waitFor(() => {
        const livePill = screen.getByTestId('navbar-aqi-live');
        expect(livePill).toBeInTheDocument();
        expect(livePill).toHaveTextContent('AQI 110');
        expect(livePill).toHaveTextContent(/MODERATE \(UNVERIFIED\)/i);
        expect(livePill).toHaveAttribute('title', expect.stringContaining('Unverified Telemetry:'));
      });
    });
  });
});
