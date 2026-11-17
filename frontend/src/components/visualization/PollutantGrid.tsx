import React from 'react';
import { PollutantDetail } from '../../types/airQuality';
import { getAQIMetadata } from '../../utils/aqiUtils';
import clsx from 'clsx';

interface PollutantGridProps {
  pollutants: Record<string, PollutantDetail>;
}

export const PollutantGrid: React.FC<PollutantGridProps> = ({ pollutants }) => {
  const pollutantKeys = ['PM2.5', 'PM10', 'NO2', 'SO2', 'CO', 'O3', 'NH3', 'Pb'];

  return (
    <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 mb-4">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
            India NAQI 8-Pollutant Breakout
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Official sub-indices computed via Central Pollution Control Board piecewise linear functions
          </p>
        </div>
        <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
          8 Pollutants Monitored
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {pollutantKeys.map((key) => {
          const item = pollutants[key];
          if (!item) return null;

          const meta = item.subIndex ? getAQIMetadata(item.subIndex) : null;
          const percentage = item.subIndex ? Math.min(100, (item.subIndex / 500) * 100) : 0;

          return (
            <div
              key={key}
              className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/80 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                  {item.code}
                </span>
                {meta && (
                  <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded border', meta.badgeClass)}>
                    {meta.category}
                  </span>
                )}
              </div>

              <div className="my-2">
                <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {item.concentration}
                  <span className="ml-1 text-xs font-normal text-slate-500">{item.unit}</span>
                </div>
                <div className="text-[10px] text-slate-500 truncate" title={item.name}>
                  {item.name.split('(')[0]}
                </div>
              </div>

              {/* Sub-index Progress bar */}
              <div className="space-y-1">
                <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={clsx('h-full rounded-full transition-all duration-500', meta?.bgClass || 'bg-slate-400')}
                    style={{ width: `${percentage}%` }}
                    aria-label={`${item.code} sub-index ${item.subIndex ?? 'N/A'}`}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>Sub-index</span>
                  <span className="font-bold text-slate-700 dark:text-slate-300">
                    {item.subIndex ?? 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
