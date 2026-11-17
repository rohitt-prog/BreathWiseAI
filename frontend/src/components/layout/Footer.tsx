import React from 'react';
import { ShieldCheck, HeartHandshake, Info } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="mt-auto border-t border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-[#090D16]/50 py-8 px-4 sm:px-6 lg:px-8 text-xs text-slate-500 dark:text-slate-400">
      <div className="max-w-7xl mx-auto space-y-6">
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200 mb-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Official India NAQI Framework</span>
            </div>
            <p className="leading-relaxed">
              Air quality categories adhere strictly to India's Central Pollution Control Board (CPCB) standards across 8 core pollutants (PM2.5, PM10, NO2, SO2, CO, O3, NH3, Pb) categorized into 6 official tiers: Good, Satisfactory, Moderate, Poor, Very Poor, and Severe.
            </p>
          </div>

          <div>
            <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200 mb-2">
              <Info className="w-4 h-4 text-sky-600" />
              <span>Multi-Source Provenance</span>
            </div>
            <p className="leading-relaxed">
              Ground measurements are sourced from CPCB & OpenAQ physical stations. Meteorological fields and hourly inversion trends are generated via atmospheric models (Open-Meteo). Atmospheric forecasts are clearly disclosed and never conflated with official ground station observations.
            </p>
          </div>

          <div>
            <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200 mb-2">
              <HeartHandshake className="w-4 h-4 text-amber-600" />
              <span>Public Health Advisory Notice</span>
            </div>
            <p className="leading-relaxed">
              BreatheWise AI is an environmental risk mitigation decision assistant. It does not provide medical diagnosis, treatment plans, or clinical triage. Individuals experiencing acute chest pain, shortness of breath, or asthma attacks must immediately seek qualified medical attention.
            </p>
          </div>
        </div>

        <div className="pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px]">
          <p>© 2026 BreatheWise AI • PromptWars Virtual (Challenge 6: Urban Air Quality Assistant)</p>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              Deterministic Safety Engine: Active
            </span>
            <span>All 8 Pollutants Monitored</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
