import React from 'react';
import { WeatherTelemetry } from '../../types/airQuality';
import { Thermometer, Droplets, Wind, Layers, Compass } from 'lucide-react';
import clsx from 'clsx';

interface WeatherCardProps {
  weather: WeatherTelemetry;
}

export const WeatherCard: React.FC<WeatherCardProps> = ({ weather }) => {
  const isUnfavorable =
    weather.dispersionConditions === 'Potentially Unfavorable' ||
    weather.stagnationRisk === 'Elevated';

  const isFavorable =
    weather.dispersionConditions === 'Favorable' ||
    weather.stagnationRisk === 'Low';

  const badgeText = isUnfavorable
    ? 'Elevated Stagnation Risk'
    : isFavorable
    ? 'Favorable Dispersion'
    : 'Moderate Dispersion';

  return (
    <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
          Atmospheric Dispersion & Mixing Ceiling
        </h3>
        <span className={clsx(
          'text-[10px] font-extrabold px-2 py-0.5 rounded-full border',
          isUnfavorable
            ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200'
            : isFavorable
            ? 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200'
            : 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200'
        )}>
          {badgeText}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 my-2">
        <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/80">
          <Thermometer className="w-4 h-4 text-rose-500 shrink-0" />
          <div>
            <span className="text-[10px] text-slate-500 block">Temperature</span>
            <span className="text-sm font-bold text-slate-900 dark:text-white">{weather.temperatureC}°C</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/80">
          <Droplets className="w-4 h-4 text-sky-500 shrink-0" />
          <div>
            <span className="text-[10px] text-slate-500 block">Relative Humidity</span>
            <span className="text-sm font-bold text-slate-900 dark:text-white">{weather.relativeHumidity}%</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/80">
          <Wind className="w-4 h-4 text-teal-500 shrink-0" />
          <div>
            <span className="text-[10px] text-slate-500 block">Wind Velocity</span>
            <span className="text-sm font-bold text-slate-900 dark:text-white">{weather.windSpeedKmh} km/h</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/80">
          <Compass className="w-4 h-4 text-indigo-500 shrink-0" />
          <div>
            <span className="text-[10px] text-slate-500 block">Wind Vector</span>
            <span className="text-sm font-bold text-slate-900 dark:text-white">{weather.windDirectionCardinal} ({weather.windDirectionDegrees}°)</span>
          </div>
        </div>
      </div>

      {/* Atmospheric Mixing & Dispersion Dynamics */}
      <div className="mt-3 p-3 rounded-xl bg-slate-100/70 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
        <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
          <Layers className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>Mixing Ceiling: {weather.boundaryLayerHeightMeters} meters</span>
        </div>
        <p className="text-[11px] leading-relaxed">
          {weather.stagnationDescription}
        </p>
        <span className="text-[10px] text-slate-400 dark:text-slate-500 block italic pt-0.5">
          *Heuristic dispersion screening indicator. Does not establish a confirmed vertical temperature inversion.
        </span>
      </div>
    </div>
  );
};
