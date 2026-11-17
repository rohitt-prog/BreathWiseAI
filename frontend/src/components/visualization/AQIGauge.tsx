import React from 'react';
import { CurrentAirQualityData } from '../../types/airQuality';
import { getAQIMetadata } from '../../utils/aqiUtils';
import { ShieldAlert, AlertTriangle, Info } from 'lucide-react';
import clsx from 'clsx';

interface AQIGaugeProps {
  data: CurrentAirQualityData;
}

export const AQIGauge: React.FC<AQIGaugeProps> = ({ data }) => {
  const meta = getAQIMetadata(data.aqi);
  const IconComponent = meta.icon;
  const pm25 = data.pollutants['PM2.5'];

  const isModelled = data.provenance.dataSource === 'MODELLED_FORECAST';
  const isObservation = data.provenance.dataSource === 'OBSERVATION';
  const isAqiNull = data.aqi === null || data.aqi === undefined;

  const sourceLabel = isModelled
    ? 'Open-Meteo CAMS Atmospheric Model'
    : isObservation
    ? 'Ground Station Physical Observation'
    : 'India NAQI Scale (Demo Scenario)';

  return (
    <div className="relative overflow-hidden p-6 sm:p-7 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
      {/* Top Bar with Category & Non-Color Icon */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {sourceLabel}
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
              aria-label={isAqiNull ? "Official Indian NAQI is unavailable" : `Current Air Quality Index: ${data.aqi}`}
            >
              {isAqiNull ? '--' : data.aqi}
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                {isAqiNull ? 'NAQI Unavailable' : (isModelled ? 'Index (Modelled)' : 'Index (Simulated)')}
              </span>
              <span className="text-xs font-medium text-slate-500">
                {isAqiNull ? 'CPCB Verified Feed Pending' : 'Scale: 0–500'}
              </span>
            </div>
          </div>

          <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-300">
            {isAqiNull ? (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Official NAQI is not calculated from modelled data. See physical pollutant levels below.
              </span>
            ) : (
              <>
                Dominant Factor: <strong className="text-slate-900 dark:text-white">{data.dominantPollutant || 'PM2.5'}</strong> ({pm25 ? `${pm25.concentration} ${pm25.unit}` : ''})
              </>
            )}
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

      {/* Advisory Text / NAQI Unavailable Notice */}
      <div className={clsx(
        'p-3.5 rounded-xl border text-xs sm:text-sm flex items-start gap-2.5',
        isAqiNull
          ? 'bg-slate-50 dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
          : 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 text-amber-900 dark:text-amber-200'
      )}>
        {isAqiNull ? (
          <Info className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        )}
        <div className="space-y-1">
          <p className="leading-snug">{data.healthAdvisory.summary}</p>
          {isAqiNull && data.indianNaqiUnavailableReason && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              * Integrity Protocol: {data.indianNaqiUnavailableReason}
            </p>
          )}
        </div>
      </div>

      {/* Educational Note on Health Guidelines — Clearly Separated from Gauge (C4) */}
      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
        <p className="font-semibold text-slate-700 dark:text-slate-300">
          Educational Guideline Context:
        </p>
        <p className="leading-relaxed">
          The World Health Organization (WHO) air quality guideline of 15 µg/m³ for PM2.5 is established specifically for a <strong>24-hour average period</strong>. An instantaneous reading or atmospheric model snapshot cannot be directly compared with that 24-hour benchmark. Values illustrate local conditions and must never be interpreted as clinical medical exposure measurements.
        </p>
      </div>
    </div>
  );
};
