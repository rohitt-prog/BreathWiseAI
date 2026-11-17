import { create } from 'zustand';
import { PersonaType, UserPreferences } from '../types/user';

interface AppState {
  currentLocationId: string;
  theme: 'light' | 'dark';
  userPreferences: UserPreferences;
  isLocationModalOpen: boolean;
  isExplanationModalOpen: boolean;
  activeExplanationContext: string | null;
  setCurrentLocationId: (id: string) => void;
  toggleTheme: () => void;
  setPersona: (persona: PersonaType) => void;
  updatePreferences: (updates: Partial<UserPreferences>) => void;
  setLocationModalOpen: (open: boolean) => void;
  openExplanationModal: (contextText: string) => void;
  closeExplanationModal: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentLocationId: 'del_anand_vihar',
  theme: (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light',
  userPreferences: {
    personaType: 'student',
    defaultLocation: {
      name: 'Anand Vihar, Delhi',
      city: 'Delhi',
      lat: 28.6508,
      lon: 77.3152
    },
    commuteMode: 'metro',
    commuteTimes: {
      morningDeparture: '08:30',
      eveningReturn: '18:00'
    },
    hasSensitiveMembers: true,
    indoorFacilities: {
      hasAirPurifier: true,
      purifierFilterType: 'HEPA',
      homeVentilationType: 'sealed_ac'
    },
    notificationsEnabled: true
  },
  isLocationModalOpen: false,
  isExplanationModalOpen: false,
  activeExplanationContext: null,

  setCurrentLocationId: (id) => set({ currentLocationId: id }),
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
  setPersona: (persona) => set((state) => ({
    userPreferences: { ...state.userPreferences, personaType: persona }
  })),
  updatePreferences: (updates) => set((state) => ({
    userPreferences: { ...state.userPreferences, ...updates }
  })),
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
