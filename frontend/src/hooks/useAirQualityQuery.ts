import { useMemo, useContext } from 'react';
import { useQuery, QueryClientContext, QueryClient, UseQueryResult } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';
import { apiClient } from '../services/apiClient';
import { MOCK_LOCATIONS } from '../services/mockData';
import { CurrentAirQualityData } from '../types/airQuality';
import { isValidCoordinate } from './useAirQualityForecastQuery';

export const getAirQualityQueryKey = (
  locationId: string,
  lat: number | null,
  lon: number | null,
  forceDemoMode?: boolean
) => ['airQuality', locationId, lat, lon, Boolean(forceDemoMode)] as const;

export interface TelemetryQueryResult {
  data: CurrentAirQualityData;
  isLive: boolean;
}

/**
 * Shared air-quality telemetry query hook.
 * Connects Navbar, Dashboard, and other application components to a single,
 * deduplicated React Query cache entry keyed by locationId, coordinates, and demo state.
 */
export function useAirQualityQuery(
  customLocationId?: string,
  customCoords?: { lat: number; lon: number },
  forceDemoMode?: boolean
): UseQueryResult<TelemetryQueryResult, Error> {
  const { currentLocationId, selectedLocation, userPreferences, telemetryMode } = useAppStore();
  const locationId = customLocationId || currentLocationId;
  const effectiveForceDemo = forceDemoMode !== undefined ? forceDemoMode : (telemetryMode === 'demo' ? true : undefined);

  // Resolve location coordinates without silently substituting MOCK_LOCATIONS[0]
  const resolvedCoords = useMemo(() => {
    if (customCoords) {
      return {
        lat: customCoords.lat,
        lon: customCoords.lon,
        isValid: isValidCoordinate(customCoords.lat, customCoords.lon),
      };
    }

    if (selectedLocation && selectedLocation.id === locationId) {
      return {
        lat: selectedLocation.lat,
        lon: selectedLocation.lon,
        isValid: isValidCoordinate(selectedLocation.lat, selectedLocation.lon),
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

    if (userPreferences?.defaultLocation) {
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
  }, [customCoords, locationId, selectedLocation, userPreferences]);

  const { lat, lon, isValid } = resolvedCoords;

  const queryClientFromContext = useContext(QueryClientContext);
  const fallbackClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            gcTime: 30 * 60 * 1000,
            retry: false,
            refetchOnWindowFocus: false,
          },
        },
      }),
    []
  );

  const clientToUse = queryClientFromContext || fallbackClient;

  return useQuery(
    {
      queryKey: getAirQualityQueryKey(locationId, lat, lon, effectiveForceDemo),
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
        return effectiveForceDemo !== undefined
          ? apiClient.resolveAirQualityData(locationId, { lat, lon }, effectiveForceDemo)
          : apiClient.resolveAirQualityData(locationId, { lat, lon });
      },
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: false,
    },
    clientToUse
  );
}
