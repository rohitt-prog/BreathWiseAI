import React from 'react';
import { AlertTriangle, Info, CheckCircle2, AlertOctagon } from 'lucide-react';
import clsx from 'clsx';

interface AlertBannerProps {
  title: string;
  description?: string;
  variant?: 'info' | 'warning' | 'danger' | 'success';
  className?: string;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({
  title,
  description,
  variant = 'info',
  className
}) => {
  const styles = {
    info: 'bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-800 text-sky-900 dark:text-sky-200',
    warning: 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200',
    danger: 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-900 dark:text-red-200',
    success: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
  };

  const icons = {
    info: Info,
    warning: AlertTriangle,
    danger: AlertOctagon,
    success: CheckCircle2
  };

  const Icon = icons[variant];

  return (
    <div
      role="alert"
      className={clsx(
        'flex items-start gap-3 p-4 rounded-xl border text-sm',
        styles[variant],
        className
      )}
    >
      <Icon className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
      <div>
        <p className="font-semibold">{title}</p>
        {description && <p className="mt-0.5 opacity-90 text-xs sm:text-sm">{description}</p>}
      </div>
    </div>
  );
};
