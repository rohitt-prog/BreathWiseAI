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
    default: 'bg-white dark:bg-[#11141c] border border-slate-200/80 dark:border-slate-800/80 shadow-sm rounded-2xl',
    flat: 'bg-[#eceff4] dark:bg-[#1a1e28] rounded-2xl',
    bordered: 'bg-transparent border border-slate-300 dark:border-slate-800 rounded-2xl'
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
