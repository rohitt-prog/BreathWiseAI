export type PersonaType = 'student' | 'family' | 'outdoor_worker' | 'general';

export interface UserPreferences {
  personaType: PersonaType;
  defaultLocation: {
    name: string;
    city: string;
    lat: number;
    lon: number;
  };
  commuteMode: 'metro' | 'bus' | 'walk' | 'bicycle' | 'two_wheeler' | 'car' | 'work_from_home';
  commuteTimes: {
    morningDeparture: string;
    eveningReturn: string;
  };
  hasSensitiveMembers: boolean; // coarse flag for elderly, children, respiratory sensitivity
  indoorFacilities: {
    hasAirPurifier: boolean;
    purifierFilterType: 'HEPA' | 'Carbon' | 'Basic' | 'None';
    homeVentilationType: 'sealed_ac' | 'naturally_ventilated' | 'mixed';
  };
  notificationsEnabled: boolean;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  personaType: 'student',
  defaultLocation: {
    name: 'Anand Vihar, Delhi',
    city: 'Delhi',
    lat: 28.6508,
    lon: 77.3152,
  },
  commuteMode: 'metro',
  commuteTimes: {
    morningDeparture: '08:30',
    eveningReturn: '18:00',
  },
  hasSensitiveMembers: true,
  indoorFacilities: {
    hasAirPurifier: true,
    purifierFilterType: 'HEPA',
    homeVentilationType: 'sealed_ac',
  },
  notificationsEnabled: true,
};
