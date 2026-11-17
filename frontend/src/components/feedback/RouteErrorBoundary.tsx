import React, { useEffect, useRef } from 'react';
import { useRouteError, isRouteErrorResponse, useNavigate } from 'react-router-dom';
import { AlertOctagon, RotateCcw, Home } from 'lucide-react';
import { Button } from '../common/Button';

export const RouteErrorBoundary: React.FC = () => {
  const error = useRouteError();
  const navigate = useNavigate();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  let title = 'Something went wrong';
  let message = 'An unexpected error occurred while loading this view. You can return to the dashboard or reload.';

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = 'Page Not Found';
      message = 'The requested air intelligence page does not exist or has moved.';
    } else if (error.status === 500) {
      title = 'Rendering Error';
      message = 'A temporary interface error occurred. Please try again.';
    }
  }

  return (
    <div 
      className="min-h-[60vh] flex items-center justify-center p-4 sm:p-6"
      role="alert"
      aria-live="assertive"
    >
      <div className="max-w-md w-full bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-lg text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 mx-auto flex items-center justify-center">
          <AlertOctagon className="w-7 h-7" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <h1 
            ref={headingRef}
            tabIndex={-1}
            className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white outline-none"
          >
            {title}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {message}
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button
            variant="outline"
            size="md"
            icon={RotateCcw}
            onClick={() => window.location.reload()}
          >
            Reload Page
          </Button>
          <Button
            variant="primary"
            size="md"
            icon={Home}
            onClick={() => navigate('/dashboard')}
          >
            Back to Dashboard
          </Button>
        </div>

        <p className="text-xs text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
          BreatheWise AI • Resilient Interface Error Boundary
        </p>
      </div>
    </div>
  );
};
