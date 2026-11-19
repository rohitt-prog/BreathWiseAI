import { useMemo } from 'react';
import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';
import { apiClient } from '../services/apiClient';
import { MOCK_LOCATIONS } from '../services/mockData';
import { ForecastQueryResult } from '../types/airQuality';

export const getForecastQueryKey = (
  locationId: string,
  lat: number | null,
  lon: number | null,
  forceDemoMode?: boolean
) => ['airQualityForecast', locationId, lat, lon, Boolean(forceDemoMode)] as const;

/**
 * Validates that latitude is within [-90, 90] and longitude is within [-180, 180],
 * strictly checking for finite numeric values (rejects NaN, Infinity, strings, etc.).
 */
export function isValidCoordinate(lat?: number | null, lon?: number | null): boolean {
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

/**
 * Dedicated React Query hook for retrieving hourly air quality forecast telemetry.
 * Connects PlannerPage to /api/v1/air-quality/forecast with coordinate-keyed caching,
 * cache separation for demo mode, coordinate validation, and transparent error handling.
 */
export function useAirQualityForecastQuery(
  customLocationId?: string,
  customCoords?: { lat: number; lon: number },
  forceDemoMode?: boolean
): UseQueryResult<ForecastQueryResult, Error> {
  const { currentLocationId, userPreferences } = useAppStore();
  const locationId = customLocationId || currentLocationId;

  // Resolve location coordinates without silently substituting MOCK_LOCATIONS[0]
  const resolvedCoords = useMemo(() => {
    if (customCoords) {
      return {
        lat: customCoords.lat,
        lon: customCoords.lon,
        isValid: isValidCoordinate(customCoords.lat, customCoords.lon),
      };
    }

    const foundMock = MOCK_LOCATIONS.find((l) => l.id === locationId);
    if (foundMock) {
      return {
        lat: foundMock.lat,
        lon: foundMock.lon,
        isValid: isValidCoordinate(foundMock.lat, foundMock.lon),
      };
    }

    if (
      userPreferences?.defaultLocation &&
      (locationId === userPreferences.defaultLocation.name ||
        locationId === 'default' ||
        locationId === 'user_default')
    ) {
      return {
        lat: userPreferences.defaultLocation.lat,
        lon: userPreferences.defaultLocation.lon,
        isValid: isValidCoordinate(
          userPreferences.defaultLocation.lat,
          userPreferences.defaultLocation.lon
        ),
      };
    }

    // Do NOT silently substitute MOCK_LOCATIONS[0]; return unresolved
    return {
      lat: null,
      lon: null,
      isValid: false,
    };
  }, [customCoords, locationId, userPreferences]);

  const { lat, lon, isValid } = resolvedCoords;

  return useQuery({
    queryKey: getForecastQueryKey(locationId, lat, lon, forceDemoMode),
    queryFn: async () => {
      if (!isValid || lat === null || lon === null) {
        if (customCoords && !isValidCoordinate(customCoords.lat, customCoords.lon)) {
          throw new Error(
            `Invalid geographic coordinates (${customCoords.lat}, ${customCoords.lon}): latitude must be between -90 and 90, and longitude between -180 and 180.`
          );
        }
        throw new Error(
          `Requested location '${locationId}' cannot be resolved to valid geographic coordinates. Please select a valid location or provide valid coordinates.`
        );
      }
      return apiClient.resolveForecastData(locationId, { lat, lon }, { forceDemoMode });
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
