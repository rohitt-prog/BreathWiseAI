export interface ActionSlot {
  id: string;
  timeWindow: string;                // "07:00 - 09:00"
  period: 'morning' | 'afternoon' | 'evening' | 'night';
  smogRisk: 'low' | 'moderate' | 'high' | 'hazardous';
  activityTitle: string;
  recommendedAction: string;
  exposureMitigation: string;        // How to protect personal lung intake
  sustainableChoice: string;         // How to avoid emitting pollution
  requiresMask: boolean;
  maskType: 'none' | 'cloth_mask' | 'n95_respirator';
  scientificRationale: string;
  category: 'commute' | 'outdoor' | 'indoor' | 'errand';
}

export interface IndoorProtocol {
  ventilationPermitted: boolean;
  ventilationReason: string;
  ventilationSafeHours: string[];
  purifierRunningMode: 'Off' | 'Auto' | 'Medium' | 'High (Continuous Recirculation)';
  diyMitigationTips: string[];
  bannedPracticesWarning: string;
}

export interface DailyActionPlan {
  planId: string;
  date: string;
  targetLocation: {
    name: string;
    aqi: number;
    category: string;
  };
  headlineAdvice: string;
  tradeOffAnalysis: string;
  itinerary: ActionSlot[];
  indoorProtocols: IndoorProtocol;
  aiProvenance: {
    model: string;
    deterministicSafetyEnginePassed: boolean;
    generatedAt: string;
  };
}

export interface CommuteModeComparison {
  mode: 'metro' | 'bus' | 'bicycle' | 'two_wheeler' | 'cng_auto' | 'private_car';
  displayName: string;
  emissionScore: 'A+' | 'A' | 'B' | 'C' | 'D';
  emissionText: string;
  personalExposure: 'Low' | 'Moderate' | 'High' | 'Hazardous';
  exposureExplanation: string;
  recommendedVerdict: 'Recommended Best' | 'Safe with N95' | 'Conditional' | 'Hazardous to Lungs' | 'Discouraged (High Footprint)';
  maskRequired: boolean;
}
