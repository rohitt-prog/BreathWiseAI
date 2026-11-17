import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { getAQIMetadata } from '../utils/aqiUtils';
import { AQIGauge } from '../components/visualization/AQIGauge';
import { WeatherCard } from '../components/visualization/WeatherCard';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { CurrentAirQualityData, WeatherTelemetry } from '../types/airQuality';
import { apiClient } from '../services/apiClient';

describe('Phase 4 — Frontend Data Contracts, Provenance & Scientific Integrity', () => {
  it('returns Unavailable metadata when AQI is null or undefined', () => {
    const metaNull = getAQIMetadata(null);
    expect(metaNull.category).toBe('Unavailable');
    expect(metaNull.nonColorLabel).toContain('Unavailable');

    const metaUndef = getAQIMetadata(undefined);
    expect(metaUndef.category).toBe('Unavailable');
  });

  it('renders AQIGauge in clean unavailable state without crashing when aqi is null', () => {
    const dataWithNullAqi: CurrentAirQualityData = {
      aqi: null,
      category: 'Unavailable',
      dominantPollutant: 'PM2.5',
      indianNaqiUnavailableReason: 'Requires certified physical CPCB ground station connection.',
      station: {
        id: 'test_node',
        name: 'Model Grid Node (28.65, 77.31)',
        coordinates: { lat: 28.65, lon: 77.31 }
      },
      provenance: {
        dataSource: 'MODELLED_FORECAST',
        qualityStatus: 'MODELLED_APPROXIMATION',
        recordedAt: '2026-11-29T10:00:00Z',
        forecastTimestamp: '2026-11-29T10:00:00Z',
        observedAt: null,
        indexSystem: 'Open-Meteo CAMS Global Forecast',
        sourceAttribution: 'Open-Meteo CAMS'
      },
      healthAdvisory: {
        summary: 'Modelled atmospheric data indicates elevated PM2.5 concentrations.',
        maskRecommendation: 'Wear N95 respirator outdoors.',
        outdoorActivityLevel: 'Limit prolonged outdoor exertion.'
      },
      pollutants: {
        'PM2.5': {
          code: 'PM2.5',
          name: 'Fine Particulates',
          concentration: 145.0,
          unit: 'µg/m³',
          subIndex: null,
          category: null
        }
      },
      weather: {
        temperatureC: 18.0,
        relativeHumidity: 65,
        windSpeedKmh: 4.0,
        windDirectionDegrees: 280,
        windDirectionCardinal: 'W',
        boundaryLayerHeightMeters: 210,
        stagnationRisk: 'Elevated',
        dispersionConditions: 'Potentially Unfavorable',
        stagnationDescription: 'Shallow boundary layer height and calm winds indicate potentially unfavorable dispersion conditions.'
      },
      forecast: []
    };

    render(<AQIGauge data={dataWithNullAqi} />);

    // Verify '--' is shown instead of a fabricated gauge number
    expect(screen.getByText('--')).toBeInTheDocument();
    expect(screen.getByText('NAQI Unavailable')).toBeInTheDocument();
    expect(screen.getByText(/Open-Meteo CAMS Atmospheric Model/i)).toBeInTheDocument();
    expect(screen.getByText(/Requires certified physical CPCB ground station connection/i)).toBeInTheDocument();
  });

  it('renders WeatherCard with heuristic dispersion indicator without claiming confirmed thermal inversion', () => {
    const testWeather: WeatherTelemetry = {
      temperatureC: 17.5,
      relativeHumidity: 70,
      windSpeedKmh: 3.5,
      windDirectionDegrees: 290,
      windDirectionCardinal: 'WNW',
      boundaryLayerHeightMeters: 180,
      stagnationRisk: 'Elevated',
      dispersionConditions: 'Potentially Unfavorable',
      stagnationDescription: 'Shallow 180m boundary layer with calm winds (3.5 km/h) indicates potentially unfavorable dispersion conditions. This heuristic indicator does not establish a confirmed temperature inversion.'
    };

    render(<WeatherCard weather={testWeather} />);

    // Verify title reflects dispersion & mixing ceiling
    expect(screen.getByText('Atmospheric Dispersion & Mixing Ceiling')).toBeInTheDocument();
    expect(screen.getByText('Elevated Stagnation Risk')).toBeInTheDocument();

    // Verify explicit heuristic disclaimer is present
    expect(screen.getByText(/Heuristic dispersion screening indicator. Does not establish a confirmed vertical temperature inversion./i)).toBeInTheDocument();
  });

  it('apiClient falls back gracefully to SIMULATED_DEMO data when backend is unreachable', async () => {
    const globalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network connection refused'));

    const result = await apiClient.resolveAirQualityData('del_anand_vihar', { lat: 28.6508, lon: 77.3152 });

    expect(result.isLive).toBe(false);
    expect(result.data.station.name).toContain('Anand Vihar');
    expect(result.data.provenance.dataSource).toBe('SIMULATED_DEMO');

    globalThis.fetch = globalFetch;
  });

  it('DashboardPage displays SIMULATED_DEMO and no live badge when backend is offline or errors', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });

    const globalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Backend offline'));

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Verify SIMULATED_DEMO is rendered on dashboard badge
    expect(await screen.findByText(/SIMULATED_DEMO/i)).toBeInTheDocument();
    // Verify no live pulse badge is rendered
    expect(screen.queryByText(/Live Ground Monitor/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Live Open-Meteo CAMS Model/i)).not.toBeInTheDocument();

    globalThis.fetch = globalFetch;
  });

  it('DashboardPage displays MODELLED_FORECAST with forecast validity when backend is online with Open-Meteo', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });

    const globalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/air-quality/current')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            indian_naqi: null,
            indian_naqi_category: null,
            source_type: 'MODELLED_FORECAST',
            forecast_timestamp: '2026-11-29T14:00:00Z',
            retrieved_at: '2026-11-29T14:05:00Z',
            quality_status: 'MODELLED_APPROXIMATION',
            source_attribution: 'Open-Meteo CAMS',
            available_pollutants: {
              'PM2.5': { name: 'PM2.5', concentration: 75.0, unit: 'µg/m³', source: 'Open-Meteo' }
            }
          })
        });
      }
      if (url.includes('/weather/current')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            temperature_c: 18.0,
            relative_humidity: 60,
            wind_speed_kmh: 4.0,
            boundary_layer_height_meters: 220,
            stagnation_risk: 'Elevated',
            dispersion_conditions: 'Potentially Unfavorable',
            stagnation_description: 'Low boundary layer height and weak winds indicate unfavorable dispersion conditions.'
          })
        });
      }
      if (url.includes('/air-quality/forecast')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ hourly_forecast: [] })
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Verify MODELLED_FORECAST badge is displayed
    expect(await screen.findByText(/MODELLED_FORECAST/i)).toBeInTheDocument();
    expect(screen.getByText(/Forecast validity:/i)).toBeInTheDocument();

    globalThis.fetch = globalFetch;
  });

  it('DashboardPage displays STALE badge when observation data is stale', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });

    const globalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/air-quality/current')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            indian_naqi: null,
            source_type: 'OBSERVATION',
            observed_at: '2026-11-29T04:00:00Z',
            retrieved_at: '2026-11-29T14:00:00Z',
            observation_freshness: 'STALE',
            observation_age_minutes: 600,
            quality_status: 'UNVERIFIED_SENSOR',
            source_attribution: 'OpenAQ',
            available_pollutants: {}
          })
        });
      }
      if (url.includes('/weather/current')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            temperature_c: 20.0,
            relative_humidity: 50,
            wind_speed_kmh: 5.0,
            boundary_layer_height_meters: 400,
            stagnation_risk: 'Moderate',
            dispersion_conditions: 'Moderate',
            stagnation_description: 'Moderate boundary layer mixing height.'
          })
        });
      }
      if (url.includes('/air-quality/forecast')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ hourly_forecast: [] })
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText(/STALE Ground Sensor/i)).toBeInTheDocument();

    globalThis.fetch = globalFetch;
  });
});
