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
