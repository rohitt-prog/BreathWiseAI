import { CurrentAirQualityData } from '../types/airQuality';
import { DailyActionPlan, CommuteModeComparison } from '../types/planner';

export const MOCK_LOCATIONS = [
  { id: 'del_anand_vihar', name: 'Anand Vihar (Demo Scenario)', city: 'Delhi', lat: 28.6508, lon: 77.3152 },
  { id: 'del_connaught_place', name: 'Connaught Place (Demo Scenario)', city: 'Delhi', lat: 28.6304, lon: 77.2177 },
  { id: 'del_rohini', name: 'Rohini Sector 16 (Demo Scenario)', city: 'Delhi', lat: 28.7324, lon: 77.1215 },
  { id: 'ggn_cyber_city', name: 'Cyber City (Demo Scenario)', city: 'Gurugram', lat: 28.4950, lon: 77.0895 },
];

export const MOCK_AIR_QUALITY_DATA: Record<string, CurrentAirQualityData> = {
  del_anand_vihar: {
    aqi: 368,
    category: 'Very Poor',
    dominantPollutant: 'PM2.5',
    station: {
      id: 'del_anand_vihar',
      name: 'Anand Vihar Scenario (Simulated Sensor)',
      distanceMeters: 1450,
      city: 'Delhi',
      state: 'Delhi',
      coordinates: { lat: 28.6508, lon: 77.3152 }
    },
    provenance: {
      dataSource: 'SIMULATED_DEMO',
      qualityStatus: 'SIMULATED_SCENARIO',
      recordedAt: '2026-11-29T10:00:00+05:30',
      freshnessMinutes: 18,
      indexSystem: 'India National AQI Framework (Simulated Scenario)'
    },
    healthAdvisory: {
      summary: 'Hazardous particulate concentration driven by shallow boundary layer mixing and local vehicular/biomass emissions.',
      maskRecommendation: 'Sealed N95 / FFP2 respirator mandatory when outdoors.',
      outdoorActivityLevel: 'Strictly avoid jogging, brisk walking, or heavy exertion.'
    },
    pollutants: {
      'PM2.5': {
        code: 'PM2.5',
        name: 'Fine Particulate Matter (< 2.5 µm)',
        concentration: 218.4,
        unit: 'µg/m³',
        subIndex: 368,
        category: 'Very Poor',
        whoExceedanceMultiple: 14.5
      },
      'PM10': {
        code: 'PM10',
        name: 'Coarse Particulates (< 10 µm)',
        concentration: 342.1,
        unit: 'µg/m³',
        subIndex: 292,
        category: 'Poor',
        whoExceedanceMultiple: 7.6
      },
      'NO2': {
        code: 'NO2',
        name: 'Nitrogen Dioxide (Vehicular Traffic)',
        concentration: 114.8,
        unit: 'µg/m³',
        subIndex: 115,
        category: 'Moderate',
        whoExceedanceMultiple: 2.8
      },
      'SO2': {
        code: 'SO2',
        name: 'Sulfur Dioxide (Industrial & Diesel)',
        concentration: 38.2,
        unit: 'µg/m³',
        subIndex: 48,
        category: 'Good',
        whoExceedanceMultiple: 0.9
      },
      'CO': {
        code: 'CO',
        name: 'Carbon Monoxide (Incomplete Combustion)',
        concentration: 2.4,
        unit: 'mg/m³',
        subIndex: 120,
        category: 'Moderate',
        whoExceedanceMultiple: 2.4
      },
      'O3': {
        code: 'O3',
        name: 'Ground-Level Ozone',
        concentration: 46.5,
        unit: 'µg/m³',
        subIndex: 46,
        category: 'Good',
        whoExceedanceMultiple: 0.8
      },
      'NH3': {
        code: 'NH3',
        name: 'Ammonia (Agricultural & Waste)',
        concentration: 132.0,
        unit: 'µg/m³',
        subIndex: 66,
        category: 'Satisfactory',
        whoExceedanceMultiple: 1.2
      },
      'Pb': {
        code: 'Pb',
        name: 'Lead Particles',
        concentration: 0.32,
        unit: 'µg/m³',
        subIndex: 32,
        category: 'Good',
        whoExceedanceMultiple: 0.6
      }
    },
    weather: {
      temperatureC: 18.5,
      relativeHumidity: 79,
      windSpeedKmh: 4.2,
      windDirectionDegrees: 310,
      windDirectionCardinal: 'NW',
      boundaryLayerHeightMeters: 210,
      stagnationRisk: 'Elevated',
      dispersionConditions: 'Potentially Unfavorable',
      stagnationDescription: 'Calm North-Westerly air (4.2 km/h) with shallow 210m boundary layer height indicating potentially unfavorable dispersion conditions.'
    },
    forecast: [
      { time: '11:00', modelledAqiEstimate: 368, category: 'Very Poor', pm25Modelled: 218, pm10Modelled: 342, windSpeedKmh: 4.2 },
      { time: '13:00', modelledAqiEstimate: 325, category: 'Very Poor', pm25Modelled: 180, pm10Modelled: 300, windSpeedKmh: 6.8 },
      { time: '15:00', modelledAqiEstimate: 290, category: 'Poor', pm25Modelled: 155, pm10Modelled: 260, windSpeedKmh: 8.5 },
      { time: '17:00', modelledAqiEstimate: 330, category: 'Very Poor', pm25Modelled: 190, pm10Modelled: 310, windSpeedKmh: 5.1 },
      { time: '19:00', modelledAqiEstimate: 395, category: 'Very Poor', pm25Modelled: 245, pm10Modelled: 380, windSpeedKmh: 3.5 },
      { time: '21:00', modelledAqiEstimate: 420, category: 'Severe', pm25Modelled: 275, pm10Modelled: 420, windSpeedKmh: 2.1 },
      { time: '23:00', modelledAqiEstimate: 435, category: 'Severe', pm25Modelled: 290, pm10Modelled: 445, windSpeedKmh: 1.8 },
      { time: '02:00', modelledAqiEstimate: 410, category: 'Severe', pm25Modelled: 265, pm10Modelled: 415, windSpeedKmh: 2.0 },
      { time: '05:00', modelledAqiEstimate: 440, category: 'Severe', pm25Modelled: 300, pm10Modelled: 460, windSpeedKmh: 1.5 },
      { time: '08:00', modelledAqiEstimate: 425, category: 'Severe', pm25Modelled: 280, pm10Modelled: 430, windSpeedKmh: 2.5 }
    ]
  }
};

export const MOCK_DAILY_PLAN: DailyActionPlan = {
  planId: 'plan_del_anand_vihar_20261129',
  date: '2026-11-29',
  targetLocation: {
    name: 'Anand Vihar, Delhi',
    aqi: 368,
    category: 'Very Poor'
  },
  headlineAdvice: 'High-Smog Winter Day: Prioritize sealed indoor environments, switch motorized commutes to Metro, and seal street-facing windows.',
  tradeOffAnalysis: 'Trade-off Insight: Walking or cycling lowers carbon footprint by ~1.5kg CO2, but today increases inhaled PM2.5 volume by 600%. We recommend taking the Delhi Metro with a sealed N95 respirator: this achieves BOTH low personal exposure and low environmental emissions.',
  itinerary: [
    {
      id: 'slot_1',
      timeWindow: '07:00 - 09:30',
      period: 'morning',
      smogRisk: 'hazardous',
      activityTitle: 'Morning Routine & Office Commute',
      recommendedAction: 'Depart via Delhi Metro. Do not ride two-wheelers or open e-rickshaws. Fasten N95 mask before stepping outside.',
      exposureMitigation: 'Underground metro stations and filtered train coaches reduce PM2.5 inhalation by over 70% compared to road traffic.',
      sustainableChoice: 'Avoid solo private car travel; taking mass transit abates ~1.8 kg CO2.',
      requiresMask: true,
      maskType: 'n95_respirator',
      scientificRationale: 'Shallow morning boundary layer limits vertical dispersion below 210m height.',
      category: 'commute'
    },
    {
      id: 'slot_2',
      timeWindow: '12:30 - 15:00',
      period: 'afternoon',
      smogRisk: 'moderate',
      activityTitle: 'Midday Errand & Office Ventilation Check',
      recommendedAction: 'If outdoor chores are unavoidable, this window has the lowest diurnal PM2.5 concentration (solar warming elevates the mixing ceiling).',
      exposureMitigation: 'Combine errands into a single trip. Keep office doors closed.',
      sustainableChoice: 'Share delivery routes or group errands with colleagues.',
      requiresMask: true,
      maskType: 'n95_respirator',
      scientificRationale: 'Solar convection temporarily dilutes ground-level particulate density.',
      category: 'errand'
    },
    {
      id: 'slot_3',
      timeWindow: '18:00 - 20:30',
      period: 'evening',
      smogRisk: 'hazardous',
      activityTitle: 'Evening Commute & Market Travel',
      recommendedAction: 'Head straight home via closed transit. Avoid street-food vendor zones where biomass tandoors and diesel generator smoke spike PM2.5.',
      exposureMitigation: 'Keep vehicle air circulation strictly in "Recirculate" (internal) mode if in taxi.',
      sustainableChoice: 'Order groceries pooled together rather than requesting individual quick-commerce dashes during peak smog.',
      requiresMask: true,
      maskType: 'n95_respirator',
      scientificRationale: 'Post-sunset boundary layer shallowing causes sharp secondary pollution peak.',
      category: 'commute'
    },
    {
      id: 'slot_4',
      timeWindow: '21:00 - 07:00',
      period: 'night',
      smogRisk: 'hazardous',
      activityTitle: 'Overnight Rest & Indoor Air Management',
      recommendedAction: 'Run bedroom HEPA purifier on continuous medium speed. Keep all balcony doors sealed.',
      exposureMitigation: 'Damp mop the bedroom floor before sleep; avoids kicking up settled fine dust.',
      sustainableChoice: 'Turn off unnecessary high-load heaters when purifier is active; conserve grid load.',
      requiresMask: false,
      maskType: 'none',
      scientificRationale: 'Overnight stagnation drops boundary layer to 150m, increasing infiltration risk.',
      category: 'indoor'
    }
  ],
  indoorProtocols: {
    ventilationPermitted: false,
    ventilationReason: 'Simulated Scenario: Ambient particulate concentration is elevated (Very Poor category). Limit unnecessary outdoor air infiltration during this period while operating localized kitchen exhaust during cooking.',
    ventilationSafeHours: [],
    purifierRunningMode: 'High (Continuous Recirculation)',
    diyMitigationTips: [
      'Roll damp towels and place them along gaps under balcony doors and windows.',
      'Wet mop tiled floors with clean water instead of dry broom sweeping.',
      'Strictly avoid burning incense (agarbatti), scented candles, or mosquito coils.',
      'Run kitchen chimney hood during frying to prevent compounding indoor particulates.'
    ],
    bannedPracticesWarning: 'CRITICAL SAFETY RULE: Never use ozone generators or ionizing air cleaners in occupied rooms. Ozone is an acute pulmonary irritant that exacerbates asthma and lung inflammation.'
  },
  aiProvenance: {
    model: 'Google Gemini 1.5 Flash (Deterministic Guardrails Enforced)',
    deterministicSafetyEnginePassed: true,
    generatedAt: '2026-11-29T10:15:00+05:30'
  }
};

export const MOCK_COMMUTE_COMPARISON: CommuteModeComparison[] = [
  {
    mode: 'metro',
    displayName: 'Delhi Metro (Electric Rail)',
    emissionScore: 'A+',
    emissionText: 'Zero direct tailpipe emissions. Saves ~2.1 kg CO2 compared to private car.',
    personalExposure: 'Low',
    exposureExplanation: 'Underground stations and train cabins are sheltered and air-filtered; minimal direct traffic soot.',
    recommendedVerdict: 'Recommended Best',
    maskRequired: true
  },
  {
    mode: 'bicycle',
    displayName: 'Bicycle / Cycling',
    emissionScore: 'A+',
    emissionText: 'Zero emissions; purely active sustainable transit.',
    personalExposure: 'Hazardous',
    exposureExplanation: 'Heavy physical exertion along traffic corridors in elevated smog increases overall respiratory particulate intake.',
    recommendedVerdict: 'Hazardous to Lungs',
    maskRequired: true
  },
  {
    mode: 'cng_auto',
    displayName: 'CNG Auto-Rickshaw',
    emissionScore: 'B',
    emissionText: 'Lower particulate emissions than diesel, but creates local road congestion.',
    personalExposure: 'High',
    exposureExplanation: 'Open-air cabin directly exposes passenger to adjacent diesel truck and bus exhaust plumes.',
    recommendedVerdict: 'Safe with N95',
    maskRequired: true
  },
  {
    mode: 'bus',
    displayName: 'DTC Electric / CNG Bus',
    emissionScore: 'A',
    emissionText: 'High shared passenger efficiency; reduces per-capita city emissions.',
    personalExposure: 'Moderate',
    exposureExplanation: 'Boarding at roadside bus stops incurs brief high exposure; closed AC buses provide partial buffering.',
    recommendedVerdict: 'Safe with N95',
    maskRequired: true
  },
  {
    mode: 'two_wheeler',
    displayName: 'Motorcycle / Scooter',
    emissionScore: 'C',
    emissionText: 'Emits localized unburnt hydrocarbons and NO2 in stop-and-go traffic.',
    personalExposure: 'Hazardous',
    exposureExplanation: 'Rider is directly in the tailpipe plume of heavy vehicles at road surface level.',
    recommendedVerdict: 'Hazardous to Lungs',
    maskRequired: true
  },
  {
    mode: 'private_car',
    displayName: 'Private ICE Automobile',
    emissionScore: 'D',
    emissionText: 'Highest per-passenger emissions (~2.8 kg CO2 per 15 km); contributes to city gridlock and smog.',
    personalExposure: 'Low',
    exposureExplanation: 'Closed cabin with HEPA or cabin filter set to internal recirculation protects occupants.',
    recommendedVerdict: 'Discouraged (High Footprint)',
    maskRequired: false
  }
];
