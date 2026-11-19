import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '../common/Modal';
import { useAppStore } from '../../stores/useAppStore';
import { MOCK_LOCATIONS } from '../../services/mockData';
import { apiClient } from '../../services/apiClient';
import { GeocodingResult } from '../../types/airQuality';
import { isValidCoordinate } from '../../hooks/useAirQualityForecastQuery';
import { MapPin, Navigation, Search, Check, AlertCircle, Loader2, X, RefreshCw } from 'lucide-react';
import clsx from 'clsx';

export const LocationModal: React.FC = () => {
  const {
    isLocationModalOpen,
    setLocationModalOpen,
    currentLocationId,
    selectedLocation,
    setCurrentLocationId,
    setSelectedLocation
  } = useAppStore();

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodingResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // GPS state
  const [isDetectingGps, setIsDetectingGps] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Abort controller ref for search requests
  const abortControllerRef = useRef<AbortController | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Reset transient error and search state when modal opens/closes
  useEffect(() => {
    if (isLocationModalOpen) {
      setGpsError(null);
      setSearchError(null);
      // Auto-focus search input after mount
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } else {
      setSearchQuery('');
      setSearchResults([]);
      setHasSearched(false);
      setIsSearching(false);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    }
  }, [isLocationModalOpen]);

  // Debounced search effect
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      setSearchError(null);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    const timer = setTimeout(async () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const results = await apiClient.searchLocations(trimmed, controller.signal);
        if (abortControllerRef.current === controller) {
          setSearchResults(results);
          setHasSearched(true);
        }
      } catch (err: any) {
        if (err.name !== 'AbortError' && abortControllerRef.current === controller) {
          setSearchError(err.message || 'Failed to search locations. Please check your network.');
          setSearchResults([]);
          setHasSearched(true);
        }
      } finally {
        if (abortControllerRef.current === controller) {
          setIsSearching(false);
        }
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [searchQuery]);

  // Retry search handler
  const handleRetrySearch = () => {
    const trimmed = searchQuery.trim();
    if (trimmed.length >= 2) {
      setSearchError(null);
      setIsSearching(true);
      apiClient
        .searchLocations(trimmed)
        .then((results) => {
          setSearchResults(results);
          setHasSearched(true);
        })
        .catch((err) => {
          setSearchError(err.message || 'Failed to search locations.');
        })
        .finally(() => setIsSearching(false));
    }
  };

  // Preset location selection
  const handleSelectPreset = (id: string) => {
    setCurrentLocationId(id);
    setLocationModalOpen(false);
  };

  // Searched location selection
  const handleSelectSearchResult = (result: GeocodingResult) => {
    if (!isValidCoordinate(result.latitude, result.longitude)) {
      setSearchError(`Invalid coordinates (${result.latitude}, ${result.longitude}) returned for location.`);
      return;
    }

    const cityLabel = [result.admin1, result.country].filter(Boolean).join(', ');
    setSelectedLocation({
      id: `geo_${result.id}`,
      name: result.name,
      city: cityLabel || undefined,
      state: result.admin1,
      country: result.country,
      lat: result.latitude,
      lon: result.longitude,
      isCustom: true
    });
    setLocationModalOpen(false);
  };

  // Explicit GPS location detection
  const handleRequestGps = () => {
    setGpsError(null);

    if (!('geolocation' in navigator)) {
      setGpsError('Geolocation is not supported by your current browser.');
      return;
    }

    setIsDetectingGps(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsDetectingGps(false);
        const { latitude, longitude } = position.coords;

        if (!isValidCoordinate(latitude, longitude)) {
          setGpsError(`Device returned invalid coordinates (${latitude}, ${longitude}).`);
          return;
        }

        const id = `gps_${latitude.toFixed(4)}_${longitude.toFixed(4)}`;
        const coordLabel = `${latitude >= 0 ? latitude.toFixed(2) + '°N' : Math.abs(latitude).toFixed(2) + '°S'}, ${
          longitude >= 0 ? longitude.toFixed(2) + '°E' : Math.abs(longitude).toFixed(2) + '°W'
        }`;

        setSelectedLocation({
          id,
          name: 'Current Location',
          city: coordLabel,
          lat: latitude,
          lon: longitude,
          isCustom: true,
          isGps: true
        });
        setLocationModalOpen(false);
      },
      (error) => {
        setIsDetectingGps(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setGpsError('Location permission denied. Please allow location access in your browser settings or search by city name.');
            break;
          case error.POSITION_UNAVAILABLE:
            setGpsError('Current location is unavailable from your device. Please search for your city or district.');
            break;
          case error.TIMEOUT:
            setGpsError('Location request timed out. Please try again or search by city name.');
            break;
          default:
            setGpsError('Unable to retrieve current location. Please try searching by name.');
            break;
        }
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  };

  return (
    <Modal
      isOpen={isLocationModalOpen}
      onClose={() => setLocationModalOpen(false)}
      title="Select Monitoring Location"
      maxWidth="md"
    >
      <div className="space-y-4 text-slate-800 dark:text-slate-100">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Search any city or locality worldwide, use your device GPS, or choose a curated demonstration preset.
        </p>

        {/* GPS Location Button */}
        <div>
          <button
            type="button"
            onClick={handleRequestGps}
            disabled={isDetectingGps}
            data-testid="use-current-location-button"
            className={clsx(
              'w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all',
              'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/20 hover:bg-emerald-100/60 dark:hover:bg-emerald-950/40 text-emerald-950 dark:text-emerald-200',
              isDetectingGps && 'opacity-70 cursor-wait'
            )}
            aria-label="Use my current location via GPS"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-600 text-white shadow-sm">
                {isDetectingGps ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Navigation className="w-4 h-4" />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold">
                  {isDetectingGps ? 'Detecting your location...' : 'Use my current location'}
                </p>
                <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
                  {isDetectingGps
                    ? 'Requesting browser GPS permission'
                    : 'Instant live telemetry for your physical coordinates'}
                </p>
              </div>
            </div>
            {selectedLocation?.isGps && (
              <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <Check className="w-4 h-4" /> Active
              </span>
            )}
          </button>

          {/* GPS Error Alert */}
          {gpsError && (
            <div
              data-testid="gps-error-message"
              className="mt-2 p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2"
              role="alert"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <span>{gpsError}</span>
            </div>
          )}
        </div>

        {/* Location Search Input */}
        <div className="relative">
          <label htmlFor="location-search-input" className="sr-only">
            Search location by city or locality
          </label>
          <div className="relative flex items-center">
            <Search className="w-4 h-4 absolute left-3.5 text-slate-400 pointer-events-none" />
            <input
              id="location-search-input"
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search city, town, or district (e.g., Bengaluru, Mumbai, London)..."
              data-testid="location-search-input"
              className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search query"
                className="absolute right-3 p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Search Results Area */}
        {isSearching && (
          <div
            data-testid="location-search-loading"
            className="p-3 text-center text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2"
          >
            <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
            <span>Searching global geocoding records...</span>
          </div>
        )}

        {searchError && (
          <div
            data-testid="location-search-error"
            className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between gap-2"
            role="alert"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{searchError}</span>
            </div>
            <button
              type="button"
              onClick={handleRetrySearch}
              className="px-2.5 py-1 rounded bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 font-semibold hover:bg-amber-300 flex items-center gap-1 shrink-0"
            >
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          </div>
        )}

        {/* Live Search Results List */}
        {!isSearching && !searchError && searchResults.length > 0 && (
          <div className="space-y-1.5" data-testid="location-search-results">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Search Results ({searchResults.length})
            </p>
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {searchResults.map((result) => {
                const isSelected = selectedLocation?.id === `geo_${result.id}`;
                return (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => handleSelectSearchResult(result)}
                    data-testid="location-search-item"
                    className={clsx(
                      'w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all',
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-100 font-semibold'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                    )}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 shrink-0">
                        <MapPin className="w-3.5 h-3.5" />
                      </div>
                      <div className="truncate">
                        <p className="text-xs font-semibold truncate">{result.name}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {[result.admin1, result.country].filter(Boolean).join(', ')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <span className="text-[10px] font-mono text-slate-600 dark:text-slate-300 font-semibold">
                        {result.latitude.toFixed(2)}°, {result.longitude.toFixed(2)}°
                      </span>
                      {isSelected && (
                        <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 ml-auto" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* No results notice */}
        {!isSearching && !searchError && hasSearched && searchResults.length === 0 && (
          <div
            data-testid="location-search-no-results"
            className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-500 dark:text-slate-400"
          >
            No locations found matching &ldquo;{searchQuery}&rdquo;. Try checking the spelling or search by city name.
          </div>
        )}

        {/* Curated Demo Scenarios (Preserved) */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Curated Demonstration Scenarios
          </p>

          <div className="space-y-1.5">
            {MOCK_LOCATIONS.map((loc) => {
              const isSelected = !selectedLocation?.isCustom && loc.id === currentLocationId;
              return (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => handleSelectPreset(loc.id)}
                  data-testid={`preset-location-${loc.id}`}
                  className={clsx(
                    'w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all',
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-950 dark:text-emerald-100 font-semibold'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={clsx(
                        'p-1.5 rounded-lg',
                        isSelected
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      )}
                    >
                      <MapPin className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <p className="text-xs font-medium">{loc.name}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        {loc.city} • Verified Model Grid ({loc.lat.toFixed(2)}°, {loc.lon.toFixed(2)}°)
                      </p>
                    </div>
                  </div>

                  {isSelected && (
                    <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
          <span>* Real-time global atmospheric models via Open-Meteo &amp; physical ground sensors.</span>
        </div>
      </div>
    </Modal>
  );
};
