import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { LocationModal } from '../components/layout/LocationModal';
import { Navbar } from '../components/layout/Navbar';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { PlannerPage } from '../features/planner/PlannerPage';
import { IndoorAirPage } from '../features/indoor/IndoorAirPage';
import { AlternativesPage } from '../features/alternatives/AlternativesPage';
import { apiClient } from '../services/apiClient';
import { useAppStore } from '../stores/useAppStore';
import { GeocodingResult, CurrentAirQualityData, AirQualityForecastResponse } from '../types/airQuality';

// Helper to create valid mock telemetry for testing page integration
const createMockTelemetry = (
  stationName = 'Anand Vihar Station',
  lat = 28.6508,
  lon = 77.3152,
  isLive = true
) => {
  const base: CurrentAirQualityData = {
    aqi: 145,
    category: 'Moderate',
    dominantPollutant: 'PM2.5',
    station: {
      id: 'test_station',
      name: stationName,
      coordinates: { lat, lon }
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
      maskRecommendation: 'Sensitive groups consider mask.',
      outdoorActivityLevel: 'Moderate activity is acceptable.'
    },
    pollutants: {
      'PM2.5': {
        code: 'PM2.5',
        name: 'PM2.5',
        concentration: 45.2,
        unit: 'µg/m³',
        category: 'Moderate',
        subIndex: 145,
        source: 'Open-Meteo Model'
      },
      'PM10': {
        code: 'PM10',
        name: 'PM10',
        concentration: 85.0,
        unit: 'µg/m³',
        category: 'Satisfactory',
        subIndex: 85,
        source: 'Open-Meteo Model'
      }
    },
    weather: {
      temperatureC: 24,
      relativeHumidity: 50,
      windSpeedKmh: 8,
      windDirectionDegrees: 280,
      windDirectionCardinal: 'W',
      boundaryLayerHeightMeters: 400,
      stagnationRisk: 'Low',
      dispersionConditions: 'Moderate',
      stagnationDescription: 'Normal dispersion.'
    },
    forecast: []
  };

  return { data: base, isLive };
};

describe('Phase 7.1 — Live Location System', () => {
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

    // Reset store to default state
    act(() => {
      useAppStore.setState({
        currentLocationId: 'del_anand_vihar',
        selectedLocation: {
          id: 'del_anand_vihar',
          name: 'Anand Vihar',
          city: 'East Delhi',
          lat: 28.6508,
          lon: 77.3152,
          isCustom: false,
          isGps: false
        },
        isLocationModalOpen: false
      });
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>
    );
  };

  describe('1. Location Search', () => {
    it('1.1 debounces search input and executes only one search request for rapid typing', async () => {
      const mockResults: GeocodingResult[] = [
        {
          id: 1277333,
          name: 'Bengaluru',
          latitude: 12.9716,
          longitude: 77.5946,
          country: 'India',
          countryCode: 'IN',
          admin1: 'Karnataka',
          displayName: 'Bengaluru, Karnataka, India'
        }
      ];

      const searchSpy = vi.spyOn(apiClient, 'searchLocations').mockResolvedValue(mockResults);

      act(() => {
        useAppStore.setState({ isLocationModalOpen: true });
      });

      renderWithProviders(<LocationModal />);

      const searchInput = screen.getByTestId('location-search-input');

      // Rapid keystrokes
      fireEvent.change(searchInput, { target: { value: 'B' } });
      fireEvent.change(searchInput, { target: { value: 'Be' } });
      fireEvent.change(searchInput, { target: { value: 'Ben' } });
      fireEvent.change(searchInput, { target: { value: 'Bengaluru' } });

      // Before debounce delay (350ms), no call should have been dispatched
      expect(searchSpy).not.toHaveBeenCalled();

      // Wait for debounce and resolving
      await waitFor(() => {
        expect(searchSpy).toHaveBeenCalledTimes(1);
        expect(searchSpy).toHaveBeenCalledWith('Bengaluru', expect.any(AbortSignal));
      });

      // Verify formatted result is rendered
      expect(await screen.findByText('Bengaluru')).toBeInTheDocument();
      expect(screen.getByText('Karnataka, India')).toBeInTheDocument();
      expect(screen.getByText('12.97°, 77.59°')).toBeInTheDocument();
    });

    it('1.2 ignores short queries (< 2 characters) and empty input without making API calls', async () => {
      const searchSpy = vi.spyOn(apiClient, 'searchLocations');

      act(() => {
        useAppStore.setState({ isLocationModalOpen: true });
      });

      renderWithProviders(<LocationModal />);

      const searchInput = screen.getByTestId('location-search-input');

      // Type 1 character
      fireEvent.change(searchInput, { target: { value: 'A' } });

      // Fast forward
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(searchSpy).not.toHaveBeenCalled();

      // Empty input
      fireEvent.change(searchInput, { target: { value: '  ' } });
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(searchSpy).not.toHaveBeenCalled();
    });

    it('1.3 displays user-friendly empty results state when no locations match', async () => {
      vi.spyOn(apiClient, 'searchLocations').mockResolvedValue([]);

      act(() => {
        useAppStore.setState({ isLocationModalOpen: true });
      });

      renderWithProviders(<LocationModal />);

      const searchInput = screen.getByTestId('location-search-input');
      fireEvent.change(searchInput, { target: { value: 'NonexistentPlaceXyz' } });

      await waitFor(() => {
        expect(screen.getByTestId('location-search-no-results')).toBeInTheDocument();
      });

      expect(
        screen.getByText(/No locations found matching/i)
      ).toBeInTheDocument();
    });

    it('1.4 handles API search failure gracefully and allows user to retry', async () => {
      vi.spyOn(apiClient, 'searchLocations')
        .mockRejectedValueOnce(new Error('Network error connecting to geocoding service'))
        .mockResolvedValueOnce([
          {
            id: 1275339,
            name: 'Mumbai',
            latitude: 19.076,
            longitude: 72.8777,
            country: 'India',
            countryCode: 'IN',
            admin1: 'Maharashtra',
            displayName: 'Mumbai, Maharashtra, India'
          }
        ]);

      act(() => {
        useAppStore.setState({ isLocationModalOpen: true });
      });

      renderWithProviders(<LocationModal />);

      const searchInput = screen.getByTestId('location-search-input');
      fireEvent.change(searchInput, { target: { value: 'Mumbai' } });

      // Wait for error state
      await waitFor(() => {
        expect(screen.getByTestId('location-search-error')).toBeInTheDocument();
      });

      expect(screen.getByText(/Network error connecting to geocoding service/i)).toBeInTheDocument();

      // Click retry button
      const retryBtn = screen.getByRole('button', { name: /Retry/i });
      fireEvent.click(retryBtn);

      // Successfully recovers and renders result
      await waitFor(() => {
        expect(screen.getByText('Mumbai')).toBeInTheDocument();
      });
      expect(screen.getByText('Maharashtra, India')).toBeInTheDocument();
    });

    it('1.5 updates selectedLocation in store and closes modal upon result selection', async () => {
      const mockResult: GeocodingResult = {
        id: 1277333,
        name: 'Bengaluru',
        latitude: 12.9716,
        longitude: 77.5946,
        country: 'India',
        countryCode: 'IN',
        admin1: 'Karnataka',
        displayName: 'Bengaluru, Karnataka, India'
      };

      vi.spyOn(apiClient, 'searchLocations').mockResolvedValue([mockResult]);

      act(() => {
        useAppStore.setState({ isLocationModalOpen: true });
      });

      renderWithProviders(<LocationModal />);

      const searchInput = screen.getByTestId('location-search-input');
      fireEvent.change(searchInput, { target: { value: 'Bengaluru' } });

      const item = await screen.findByTestId('location-search-item');
      fireEvent.click(item);

      // Verify store state
      const state = useAppStore.getState();
      expect(state.isLocationModalOpen).toBe(false);
      expect(state.selectedLocation).toEqual({
        id: 'geo_1277333',
        name: 'Bengaluru',
        city: 'Karnataka, India',
        state: 'Karnataka',
        country: 'India',
        lat: 12.9716,
        lon: 77.5946,
        isCustom: true
      });
      expect(state.currentLocationId).toBe('geo_1277333');
    });

    it('1.6 rejects invalid or out-of-range coordinates from search results', async () => {
      const mockInvalidResult: GeocodingResult = {
        id: 999999,
        name: 'Invalid Lat Land',
        latitude: 95.5, // Latitude > 90 is invalid
        longitude: 77.5946,
        country: 'Nowhere',
        countryCode: 'NW',
        displayName: 'Invalid Lat Land, Nowhere'
      };

      vi.spyOn(apiClient, 'searchLocations').mockResolvedValue([mockInvalidResult]);

      act(() => {
        useAppStore.setState({ isLocationModalOpen: true });
      });

      renderWithProviders(<LocationModal />);

      const searchInput = screen.getByTestId('location-search-input');
      fireEvent.change(searchInput, { target: { value: 'Invalid Lat' } });

      const item = await screen.findByTestId('location-search-item');
      fireEvent.click(item);

      // Modal stays open and displays validation error
      expect(screen.getByTestId('location-search-error')).toBeInTheDocument();
      expect(screen.getByText(/Invalid coordinates \(95.5, 77.5946\) returned for location/i)).toBeInTheDocument();

      // Store was NOT updated with invalid coordinates
      const state = useAppStore.getState();
      expect(state.selectedLocation?.lat).not.toBe(95.5);
    });

    it('1.7 preserves raw AbortError on caller cancellation without displaying error alert or clearing valid newer results', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      const mockNewResults: GeocodingResult[] = [
        {
          id: 1277333,
          name: 'Bengaluru',
          latitude: 12.9716,
          longitude: 77.5946,
          country: 'India',
          countryCode: 'IN',
          admin1: 'Karnataka',
          displayName: 'Bengaluru, Karnataka, India'
        }
      ];

      // First query simulates a cancelled in-flight search that rejects with AbortError
      // Second query succeeds with newer results
      vi.spyOn(apiClient, 'searchLocations')
        .mockRejectedValueOnce(abortError)
        .mockResolvedValueOnce(mockNewResults);

      act(() => {
        useAppStore.setState({ isLocationModalOpen: true });
      });

      renderWithProviders(<LocationModal />);

      const searchInput = screen.getByTestId('location-search-input');
      // Trigger first search
      fireEvent.change(searchInput, { target: { value: 'Beng' } });
      // Wait for debounce delay so first search is dispatched into in-flight state
      await new Promise((r) => setTimeout(r, 400));

      // User continues typing to 'Bengaluru', which aborts the in-flight 'Beng' search
      fireEvent.change(searchInput, { target: { value: 'Bengaluru' } });

      // Newer results resolve and are displayed
      expect(await screen.findByText('Bengaluru')).toBeInTheDocument();
      // No timeout or error alert should be shown for the cancelled previous request
      expect(screen.queryByTestId('location-search-error')).not.toBeInTheDocument();
    });

    it('1.8 handles internal 8-second search timeout by displaying a user-friendly timeout alert with Retry button', async () => {
      vi.spyOn(apiClient, 'searchLocations')
        .mockRejectedValueOnce(new Error('Location search request timed out after 8 seconds. Please try again.'))
        .mockResolvedValueOnce([
          {
            id: 1275339,
            name: 'Mumbai',
            latitude: 19.076,
            longitude: 72.8777,
            country: 'India',
            countryCode: 'IN',
            admin1: 'Maharashtra',
            displayName: 'Mumbai, Maharashtra, India'
          }
        ]);

      act(() => {
        useAppStore.setState({ isLocationModalOpen: true });
      });

      renderWithProviders(<LocationModal />);

      const searchInput = screen.getByTestId('location-search-input');
      fireEvent.change(searchInput, { target: { value: 'Mumbai' } });

      // Verifies user-friendly timeout error is rendered
      await waitFor(() => {
        expect(screen.getByTestId('location-search-error')).toBeInTheDocument();
      });
      expect(
        screen.getByText(/Location search request timed out after 8 seconds/i)
      ).toBeInTheDocument();

      // Retry button is available and recovers
      const retryBtn = screen.getByRole('button', { name: /Retry/i });
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(screen.getByText('Mumbai')).toBeInTheDocument();
      });
    });
  });

  describe('2. GPS Geolocation', () => {
    it('2.1 never requests geolocation automatically on mount without explicit user action', () => {
      const getCurrentPositionSpy = vi.fn();
      Object.defineProperty(window.navigator, 'geolocation', {
        value: {
          getCurrentPosition: getCurrentPositionSpy
        },
        writable: true,
        configurable: true
      });

      act(() => {
        useAppStore.setState({ isLocationModalOpen: true });
      });

      renderWithProviders(<LocationModal />);

      // On initial render, getCurrentPosition should NOT be invoked
      expect(getCurrentPositionSpy).not.toHaveBeenCalled();
    });

    it('2.2 acquires GPS coordinates on button click and updates selectedLocation', async () => {
      const mockPosition = {
        coords: {
          latitude: 13.0827,
          longitude: 80.2707,
          accuracy: 15
        }
      };

      const getCurrentPositionSpy = vi.fn((success) => {
        success(mockPosition);
      });

      Object.defineProperty(window.navigator, 'geolocation', {
        value: {
          getCurrentPosition: getCurrentPositionSpy
        },
        writable: true,
        configurable: true
      });

      act(() => {
        useAppStore.setState({ isLocationModalOpen: true });
      });

      renderWithProviders(<LocationModal />);

      const gpsBtn = screen.getByTestId('use-current-location-button');
      fireEvent.click(gpsBtn);

      expect(getCurrentPositionSpy).toHaveBeenCalledTimes(1);

      // Store updated
      const state = useAppStore.getState();
      expect(state.isLocationModalOpen).toBe(false);
      expect(state.selectedLocation).toEqual({
        id: 'gps_13.0827_80.2707',
        name: 'Current Location',
        city: '13.08°N, 80.27°E',
        lat: 13.0827,
        lon: 80.2707,
        isCustom: true,
        isGps: true
      });
      expect(state.currentLocationId).toBe('gps_13.0827_80.2707');
    });

    it('2.3 handles permission denied error (code 1) gracefully', async () => {
      const mockError = {
        code: 1,
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
        message: 'User denied Geolocation'
      };

      const getCurrentPositionSpy = vi.fn((_success, error) => {
        error(mockError);
      });

      Object.defineProperty(window.navigator, 'geolocation', {
        value: {
          getCurrentPosition: getCurrentPositionSpy
        },
        writable: true,
        configurable: true
      });

      act(() => {
        useAppStore.setState({ isLocationModalOpen: true });
      });

      renderWithProviders(<LocationModal />);

      const gpsBtn = screen.getByTestId('use-current-location-button');
      fireEvent.click(gpsBtn);

      await waitFor(() => {
        expect(screen.getByTestId('gps-error-message')).toBeInTheDocument();
      });

      expect(
        screen.getByText(/Location permission denied. Please allow location access in your browser settings/i)
      ).toBeInTheDocument();

      // Modal stays open so user can pick preset or search
      expect(useAppStore.getState().isLocationModalOpen).toBe(true);
    });

    it('2.4 handles position unavailable error (code 2) gracefully', async () => {
      const mockError = {
        code: 2,
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
        message: 'Position unavailable'
      };

      const getCurrentPositionSpy = vi.fn((_success, error) => {
        error(mockError);
      });

      Object.defineProperty(window.navigator, 'geolocation', {
        value: {
          getCurrentPosition: getCurrentPositionSpy
        },
        writable: true,
        configurable: true
      });

      act(() => {
        useAppStore.setState({ isLocationModalOpen: true });
      });

      renderWithProviders(<LocationModal />);

      fireEvent.click(screen.getByTestId('use-current-location-button'));

      await waitFor(() => {
        expect(screen.getByTestId('gps-error-message')).toBeInTheDocument();
      });

      expect(
        screen.getByText(/Current location is unavailable from your device. Please search for your city or district/i)
      ).toBeInTheDocument();
    });

    it('2.5 handles timeout error (code 3) gracefully', async () => {
      const mockError = {
        code: 3,
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
        message: 'Timeout'
      };

      const getCurrentPositionSpy = vi.fn((_success, error) => {
        error(mockError);
      });

      Object.defineProperty(window.navigator, 'geolocation', {
        value: {
          getCurrentPosition: getCurrentPositionSpy
        },
        writable: true,
        configurable: true
      });

      act(() => {
        useAppStore.setState({ isLocationModalOpen: true });
      });

      renderWithProviders(<LocationModal />);

      fireEvent.click(screen.getByTestId('use-current-location-button'));

      await waitFor(() => {
        expect(screen.getByTestId('gps-error-message')).toBeInTheDocument();
      });

      expect(
        screen.getByText(/Location request timed out. Please try again or search by city name/i)
      ).toBeInTheDocument();
    });

    it('2.6 handles unsupported browser environment where navigator.geolocation is undefined', async () => {
      // Mock navigator without geolocation
      const originalNavigator = window.navigator;
      const noGeoNavigator = { ...originalNavigator };
      delete (noGeoNavigator as any).geolocation;

      Object.defineProperty(window, 'navigator', {
        value: noGeoNavigator,
        writable: true,
        configurable: true
      });

      act(() => {
        useAppStore.setState({ isLocationModalOpen: true });
      });

      renderWithProviders(<LocationModal />);

      fireEvent.click(screen.getByTestId('use-current-location-button'));

      await waitFor(() => {
        expect(screen.getByTestId('gps-error-message')).toBeInTheDocument();
      });

      expect(
        screen.getByText(/Geolocation is not supported by your current browser/i)
      ).toBeInTheDocument();

      // Restore navigator
      Object.defineProperty(window, 'navigator', {
        value: originalNavigator,
        writable: true,
        configurable: true
      });
    });

    it('2.7 rejects out-of-range coordinates returned by device GPS', async () => {
      const mockPosition = {
        coords: {
          latitude: -105.0, // Invalid lat < -90
          longitude: 50.0,
          accuracy: 10
        }
      };

      const getCurrentPositionSpy = vi.fn((success) => {
        success(mockPosition);
      });

      Object.defineProperty(window.navigator, 'geolocation', {
        value: {
          getCurrentPosition: getCurrentPositionSpy
        },
        writable: true,
        configurable: true
      });

      act(() => {
        useAppStore.setState({ isLocationModalOpen: true });
      });

      renderWithProviders(<LocationModal />);

      fireEvent.click(screen.getByTestId('use-current-location-button'));

      await waitFor(() => {
        expect(screen.getByTestId('gps-error-message')).toBeInTheDocument();
      });

      expect(
        screen.getByText(/Device returned invalid coordinates \(-105, 50\)/i)
      ).toBeInTheDocument();

      // State is not corrupted
      expect(useAppStore.getState().selectedLocation?.lat).not.toBe(-105.0);
    });
  });

  describe('3. Shared State & Integration Across Modules', () => {
    it('3.1 selecting a curated preset updates state and clears custom location flags', () => {
      // Start with custom location
      act(() => {
        useAppStore.setState({
          isLocationModalOpen: true,
          currentLocationId: 'geo_123',
          selectedLocation: {
            id: 'geo_123',
            name: 'Custom City',
            lat: 15.0,
            lon: 75.0,
            isCustom: true,
            isGps: false
          }
        });
      });

      renderWithProviders(<LocationModal />);

      // Click on Connaught Place preset
      const cpPreset = screen.getByTestId('preset-location-del_connaught_place');
      fireEvent.click(cpPreset);

      const state = useAppStore.getState();
      expect(state.currentLocationId).toBe('del_connaught_place');
      expect(state.selectedLocation?.name).toContain('Connaught Place');
      expect(state.selectedLocation?.isCustom).toBe(false);
      expect(Boolean(state.selectedLocation?.isGps)).toBe(false);
      expect(state.isLocationModalOpen).toBe(false);
    });

    it('3.2 Navbar displays custom searched or GPS location name', () => {
      act(() => {
        useAppStore.setState({
          currentLocationId: 'geo_1277333',
          selectedLocation: {
            id: 'geo_1277333',
            name: 'Bengaluru',
            city: 'Karnataka, India',
            lat: 12.9716,
            lon: 77.5946,
            isCustom: true,
            isGps: false
          }
        });
      });

      renderWithProviders(<Navbar />);

      expect(screen.getByText('Bengaluru')).toBeInTheDocument();
    });

    it('3.3 DashboardPage resolves custom location coordinates and displays correct station name', async () => {
      const mockTel = createMockTelemetry('Bengaluru Station', 12.9716, 77.5946);
      const resolveSpy = vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(mockTel);

      act(() => {
        useAppStore.setState({
          currentLocationId: 'geo_1277333',
          selectedLocation: {
            id: 'geo_1277333',
            name: 'Bengaluru',
            city: 'Karnataka, India',
            lat: 12.9716,
            lon: 77.5946,
            isCustom: true,
            isGps: false
          }
        });
      });

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(resolveSpy).toHaveBeenCalledWith(
          'geo_1277333',
          { lat: 12.9716, lon: 77.5946 }
        );
      });

      expect((await screen.findAllByText(/Bengaluru/i)).length).toBeGreaterThan(0);
    });

    it('3.4 PlannerPage resolves custom location and triggers forecast query with custom coordinates', async () => {
      const mockForecastResponse: AirQualityForecastResponse = {
        location: {
          latitude: 22.5726,
          longitude: 88.3639,
          name: 'Kolkata, West Bengal'
        },
        provider: 'Open-Meteo CAMS Air Quality Forecast',
        source_type: 'MODELLED_FORECAST',
        retrieved_at: '2026-11-29T08:00:00Z',
        model_run_timestamp: null,
        model_data_available_at: null,
        retrieval_freshness: 'FRESH',
        model_run_freshness: 'UNAVAILABLE',
        hourly_forecast: [
          {
            timestamp: '2026-11-29T10:00:00Z',
            modelled_aqi_estimate: 145,
            pm2_5: 45.0,
            pm10: 85.0,
            nitrogen_dioxide: 22.0,
            sulphur_dioxide: 10.0,
            ozone: 30.0,
            data_classification: 'MODELLED_FORECAST'
          }
        ],
        source_attribution: 'Open-Meteo Air Quality Forecast API (Copernicus CAMS Modelled Data)',
        limitations: ['Hourly points represent regional atmospheric chemistry model predictions.']
      };

      const resolveForecastSpy = vi.spyOn(apiClient, 'resolveForecastData').mockResolvedValue({
        data: mockForecastResponse,
        isLive: true,
        isDemo: false,
        isStale: false,
        isUnknownSource: false
      });

      act(() => {
        useAppStore.setState({
          currentLocationId: 'geo_kolkata',
          selectedLocation: {
            id: 'geo_kolkata',
            name: 'Kolkata',
            city: 'West Bengal, India',
            lat: 22.5726,
            lon: 88.3639,
            isCustom: true,
            isGps: false
          }
        });
      });

      renderWithProviders(<PlannerPage />);

      await waitFor(() => {
        expect(resolveForecastSpy).toHaveBeenCalledWith(
          'geo_kolkata',
          { lat: 22.5726, lon: 88.3639 },
          expect.anything()
        );
      });

      expect((await screen.findAllByText(/Kolkata/i)).length).toBeGreaterThan(0);
    });

    it('3.5 IndoorAirPage resolves custom GPS location coordinates and station display', async () => {
      const mockTel = createMockTelemetry('Current Location Station', 19.076, 72.8777);
      const resolveSpy = vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(mockTel);

      act(() => {
        useAppStore.setState({
          currentLocationId: 'gps_19.0760_72.8777',
          selectedLocation: {
            id: 'gps_19.0760_72.8777',
            name: 'Current Location',
            city: '19.08°N, 72.88°E',
            lat: 19.076,
            lon: 72.8777,
            isCustom: true,
            isGps: true
          }
        });
      });

      renderWithProviders(<IndoorAirPage />);

      await waitFor(() => {
        expect(resolveSpy).toHaveBeenCalledWith(
          'gps_19.0760_72.8777',
          { lat: 19.076, lon: 72.8777 }
        );
      });

      expect((await screen.findAllByText(/Current Location/i)).length).toBeGreaterThan(0);
    });

    it('3.6 AlternativesPage resolves custom location coordinates and station display', async () => {
      const mockTel = createMockTelemetry('Hyderabad Station', 17.385, 78.4867);
      const resolveSpy = vi.spyOn(apiClient, 'resolveAirQualityData').mockResolvedValue(mockTel);

      act(() => {
        useAppStore.setState({
          currentLocationId: 'geo_hyderabad',
          selectedLocation: {
            id: 'geo_hyderabad',
            name: 'Hyderabad',
            city: 'Telangana, India',
            lat: 17.385,
            lon: 78.4867,
            isCustom: true,
            isGps: false
          }
        });
      });

      renderWithProviders(<AlternativesPage />);

      await waitFor(() => {
        expect(resolveSpy).toHaveBeenCalledWith(
          'geo_hyderabad',
          { lat: 17.385, lon: 78.4867 }
        );
      });

      expect((await screen.findAllByText(/Hyderabad/i)).length).toBeGreaterThan(0);
    });
  });
});
