import React from 'react';
import { HourlyForecastItem } from '../../types/airQuality';
import { getAQIMetadata } from '../../utils/aqiUtils';
import { Sparkles, Info } from 'lucide-react';
import clsx from 'clsx';

interface ForecastStripProps {
  forecast: HourlyForecastItem[];
}

export const ForecastStrip: React.FC<ForecastStripProps> = ({ forecast }) => {
  return (
    <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              12-Hour Smog & Particulate Trajectory
            </h3>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200 border border-indigo-300 dark:border-indigo-800">
              <Sparkles className="w-3 h-3 text-indigo-500" />
              Modelled Forecast
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Diurnal variation driven by nighttime temperature inversions and daytime solar thermal lifting
          </p>
        </div>

        {/* Explicit Disclosure Badge */}
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
          <Info className="w-3.5 h-3.5 text-sky-500 shrink-0" />
          <span>Modelled Chemistry (Open-Meteo). Not official CPCB station observations.</span>
        </div>
      </div>

      {/* Visual Timeline Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 md:grid-cols-10 gap-2 overflow-x-auto pb-1">
        {forecast.map((item, idx) => {
          const meta = getAQIMetadata(item.modelledAqiEstimate);
          return (
            <div
              key={idx}
              className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 flex flex-col items-center justify-between text-center min-w-[85px]"
            >
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {item.time}
              </span>

              <div className="my-2 flex flex-col items-center">
                <span className="text-lg font-extrabold text-slate-900 dark:text-white">
                  {item.modelledAqiEstimate}
                </span>
                <span className={clsx('text-[10px] font-bold px-1.5 py-0.2 rounded border mt-1', meta.badgeClass)}>
                  {meta.category}
                </span>
              </div>

              <div className="text-[10px] text-slate-500 space-y-0.5">
                <div>PM2.5: {item.pm25Modelled}</div>
                <div>Wind: {item.windSpeedKmh}k</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Accessible Table for Screen Readers (WCAG 2.1 AA) */}
      <table className="sr-only">
        <caption>12-Hour Air Quality Forecast Table</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Modelled AQI</th>
            <th scope="col">Category</th>
            <th scope="col">Modelled PM2.5</th>
            <th scope="col">Wind Speed</th>
          </tr>
        </thead>
        <tbody>
          {forecast.map((item, idx) => (
            <tr key={idx}>
              <td>{item.time}</td>
              <td>{item.modelledAqiEstimate}</td>
              <td>{item.category}</td>
              <td>{item.pm25Modelled} µg/m³</td>
              <td>{item.windSpeedKmh} km/h</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
