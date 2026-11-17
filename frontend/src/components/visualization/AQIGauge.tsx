import React from 'react';
import { CurrentAirQualityData } from '../../types/airQuality';
import { getAQIMetadata } from '../../utils/aqiUtils';
import { ShieldAlert, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';

interface AQIGaugeProps {
  data: CurrentAirQualityData;
}

export const AQIGauge: React.FC<AQIGaugeProps> = ({ data }) => {
  const meta = getAQIMetadata(data.aqi);
  const IconComponent = meta.icon;
  const pm25 = data.pollutants['PM2.5'];

  return (
    <div className="relative overflow-hidden p-6 sm:p-7 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
      {/* Top Bar with Category & Non-Color Icon */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          India NAQI Scale (Demo Scenario)
        </span>

        <div className={clsx(
          'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border',
          meta.badgeClass
        )}>
          <IconComponent className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{meta.category}</span>
          <span className="text-[10px] opacity-80">({meta.range})</span>
        </div>
      </div>

      {/* Main Metric Display */}
      <div className="my-5 flex flex-col sm:flex-row items-baseline sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-3">
            <span 
              className="text-6xl sm:text-7xl font-extrabold tracking-tight text-slate-900 dark:text-white"
              aria-label={`Current Air Quality Index: ${data.aqi}`}
            >
              {data.aqi}
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Index (Simulated)</span>
              <span className="text-xs font-medium text-slate-500">Scale: 0–500</span>
            </div>
          </div>
          
          <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-300">
            Dominant Factor: <strong className="text-slate-900 dark:text-white">{data.dominantPollutant}</strong> ({pm25 ? `${pm25.concentration} ${pm25.unit}` : ''})
          </p>
        </div>

        {/* Mask Alert Badge */}
        <div className="flex flex-col items-start sm:items-end gap-1.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-1.5 text-xs font-bold text-red-600 dark:text-red-400">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>Respirator Directive</span>
          </div>
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            {data.healthAdvisory.maskRecommendation}
          </span>
        </div>
      </div>

      {/* Advisory Text */}
      <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-xs sm:text-sm text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <p className="leading-snug">{data.healthAdvisory.summary}</p>
      </div>

      {/* Educational Note on Health Guidelines — Clearly Separated from Gauge (C4) */}
      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
        <p className="font-semibold text-slate-700 dark:text-slate-300">
          Educational Guideline Context:
        </p>
        <p className="leading-relaxed">
          The World Health Organization (WHO) air quality guideline of 15 µg/m³ for PM2.5 is established specifically for a <strong>24-hour average period</strong>. A simulated instantaneous reading cannot be directly compared with that 24-hour benchmark. This simulated value illustrates a localized smog scenario and must never be interpreted as an actual personal exposure or clinical medical measurement.
        </p>
      </div>
    </div>
  );
};
