import { create } from 'zustand';
import { PersonaType, UserPreferences, DEFAULT_USER_PREFERENCES } from '../types/user';
import { SelectedLocation } from '../types/airQuality';
import { MOCK_LOCATIONS } from '../services/mockData';

export type TelemetryMode = 'live' | 'demo';

interface AppState {
  currentLocationId: string;
  selectedLocation: SelectedLocation | null;
  theme: 'light' | 'dark';
  telemetryMode: TelemetryMode;
  userPreferences: UserPreferences;
  isLocationModalOpen: boolean;
  isExplanationModalOpen: boolean;
  activeExplanationContext: string | null;
  setCurrentLocationId: (id: string) => void;
  setSelectedLocation: (location: SelectedLocation) => void;
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setTelemetryMode: (mode: TelemetryMode) => void;
  toggleTelemetryMode: () => void;
  setPersona: (persona: PersonaType) => void;
  updatePreferences: (updates: Partial<UserPreferences>) => void;
  setUserPreferences: (preferences: UserPreferences) => void;
  resetPreferencesToDefault: () => void;
  setLocationModalOpen: (open: boolean) => void;
  openExplanationModal: (contextText: string) => void;
  closeExplanationModal: () => void;
}

const defaultInitialLocation: SelectedLocation = {
  id: 'del_anand_vihar',
  name: 'Anand Vihar (Demo Scenario)',
  city: 'Delhi',
  lat: 28.6508,
  lon: 77.3152,
  isCustom: false,
};

export const useAppStore = create<AppState>((set) => ({
  currentLocationId: 'del_anand_vihar',
  selectedLocation: defaultInitialLocation,
  theme: (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light',
  telemetryMode: 'live',
  userPreferences: DEFAULT_USER_PREFERENCES,
  isLocationModalOpen: false,
  isExplanationModalOpen: false,
  activeExplanationContext: null,

  setCurrentLocationId: (id) => {
    const foundPreset = MOCK_LOCATIONS.find((l) => l.id === id);
    if (foundPreset) {
      set({
        currentLocationId: id,
        selectedLocation: {
          id: foundPreset.id,
          name: foundPreset.name,
          city: foundPreset.city,
          lat: foundPreset.lat,
          lon: foundPreset.lon,
          isCustom: false,
        },
      });
    } else {
      set({ currentLocationId: id });
    }
  },
  setSelectedLocation: (location) =>
    set({
      currentLocationId: location.id,
      selectedLocation: location,
    }),
  toggleTheme: () => set((state) => {
    const next = state.theme === 'light' ? 'dark' : 'light';
    if (typeof document !== 'undefined') {
      if (next === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
    return { theme: next };
  }),
  setTheme: (theme) => set(() => {
    if (typeof document !== 'undefined') {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
    return { theme };
  }),
  setTelemetryMode: (mode) => set({ telemetryMode: mode }),
  toggleTelemetryMode: () => set((state) => ({
    telemetryMode: state.telemetryMode === 'live' ? 'demo' : 'live'
  })),
  setPersona: (persona) => set((state) => ({
    userPreferences: { ...state.userPreferences, personaType: persona }
  })),
  updatePreferences: (updates) => set((state) => ({
    userPreferences: { ...state.userPreferences, ...updates }
  })),
  setUserPreferences: (preferences) => set({
    userPreferences: preferences
  }),
  resetPreferencesToDefault: () => set({
    userPreferences: DEFAULT_USER_PREFERENCES
  }),
  setLocationModalOpen: (open) => set({ isLocationModalOpen: open }),
  openExplanationModal: (contextText) => set({
    isExplanationModalOpen: true,
    activeExplanationContext: contextText
  }),
  closeExplanationModal: () => set({
    isExplanationModalOpen: false,
    activeExplanationContext: null
  })
}));
