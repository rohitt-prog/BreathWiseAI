import React from 'react';
import { LucideIcon } from 'lucide-react';
import clsx from 'clsx';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'custom';
  customClass?: string;
  icon?: LucideIcon;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  customClass,
  icon: Icon,
  size = 'md',
  ariaLabel
}) => {
  const variantStyles = {
    neutral: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700',
    success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800',
    warning: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border-amber-300 dark:border-amber-800',
    danger: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200 border-red-300 dark:border-red-800',
    info: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200 border-sky-300 dark:border-sky-800',
    custom: customClass || ''
  };

  const sizeStyles = {
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-xs md:text-sm px-2.5 py-1 gap-1.5'
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center font-semibold rounded-full border transition-colors',
        variant !== 'custom' && variantStyles[variant],
        variant === 'custom' && customClass,
        sizeStyles[size]
      )}
      aria-label={ariaLabel}
    >
      {Icon && <Icon className={clsx(size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5', 'shrink-0')} aria-hidden="true" />}
      <span>{children}</span>
    </span>
  );
};
