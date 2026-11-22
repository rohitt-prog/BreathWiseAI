import React from 'react';

/**
 * Accessible and visual-consistent loading fallback for lazy-loaded route views.
 * Prevents layout shifts with a fixed minimum height and non-jarring spinner.
 */
export const PageLoadingFallback: React.FC = () => {
  return (
    <div
      className="min-h-[50vh] flex flex-col items-center justify-center p-6 space-y-4"
      role="status"
      aria-live="polite"
      aria-label="Loading page content"
    >
      <div
        className="w-10 h-10 rounded-full border-4 border-slate-200 dark:border-slate-800 border-t-emerald-500 animate-spin"
        aria-hidden="true"
      />
      <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
        Loading intelligence view...
      </span>
    </div>
  );
};
