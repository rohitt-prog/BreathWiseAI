import React from 'react';
import clsx from 'clsx';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: 'default' | 'flat' | 'bordered';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  padding = 'md',
  className,
  ...props
}) => {
  const variantStyles = {
    default: 'bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 shadow-sm rounded-xl',
    flat: 'bg-slate-100 dark:bg-slate-900/60 rounded-xl',
    bordered: 'bg-transparent border border-slate-300 dark:border-slate-700 rounded-xl'
  };

  const paddingStyles = {
    none: '',
    sm: 'p-3',
    md: 'p-4 sm:p-5',
    lg: 'p-6 sm:p-7'
  };

  return (
    <div
      className={clsx(variantStyles[variant], paddingStyles[padding], className)}
      {...props}
    >
      {children}
    </div>
  );
};
