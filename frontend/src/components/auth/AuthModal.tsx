import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, AlertCircle, Loader2, Info } from 'lucide-react';
import { Modal } from '../common/Modal';
import { useAuthStore } from '../../stores/useAuthStore';
import { loginWithEmail, signUpWithEmail, loginWithGoogle, mapFirebaseAuthError } from '../../services/authService';

export const AuthModal: React.FC = () => {
  const {
    isAuthModalOpen,
    setAuthModalOpen,
    authModalMode,
    setAuthModalMode,
    isConfigured,
    setUser,
  } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setIsSubmitting(false);
    setErrorMessage(null);
  };

  const handleClose = () => {
    resetForm();
    setAuthModalOpen(false);
  };

  const switchMode = (newMode: 'login' | 'signup') => {
    setAuthModalMode(newMode);
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email || !password) {
      setErrorMessage('Please fill in both email and password.');
      return;
    }

    if (authModalMode === 'signup' && password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    setIsSubmitting(true);

    try {
      let authUser;
      if (authModalMode === 'signup') {
        authUser = await signUpWithEmail(email, password);
      } else {
        authUser = await loginWithEmail(email, password);
      }
      setUser(authUser);
      handleClose();
    } catch (error) {
      setErrorMessage(mapFirebaseAuthError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const authUser = await loginWithGoogle();
      setUser(authUser);
      handleClose();
    } catch (error) {
      setErrorMessage(mapFirebaseAuthError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSignup = authModalMode === 'signup';
  const modalTitle = isSignup ? 'Create Your Account' : 'Sign In to BreatheWise';

  return (
    <Modal isOpen={isAuthModalOpen} onClose={handleClose} title={modalTitle} maxWidth="md">
      <div className="space-y-5 py-1">
        {/* Unconfigured Firebase Notice */}
        {!isConfigured && (
          <div
            data-testid="firebase-unconfigured-notice"
            className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs"
          >
            <Info className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">Firebase Authentication Not Configured</p>
              <p className="text-amber-700/90 dark:text-amber-300/80 leading-relaxed">
                Frontend environment variables for Firebase are not set in this deployment.
                All environmental intelligence features remain fully accessible in <strong>Guest Mode</strong>.
              </p>
            </div>
          </div>
        )}

        {/* Error Alert Banner */}
        {errorMessage && (
          <div
            data-testid="auth-error-banner"
            role="alert"
            className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 text-xs"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
            <span className="leading-relaxed font-medium">{errorMessage}</span>
          </div>
        )}

        {/* Google Authentication Button */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isSubmitting || !isConfigured}
          data-testid="google-signin-btn"
          className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 text-sm font-semibold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>{isSignup ? 'Sign up with Google' : 'Continue with Google'}</span>
        </button>

        {/* Divider */}
        <div className="relative flex items-center justify-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200 dark:border-slate-800" />
          </div>
          <span className="relative bg-white dark:bg-[#131B2E] px-3 text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            or with email
          </span>
        </div>

        {/* Email & Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Email input */}
          <div className="space-y-1.5">
            <label
              htmlFor="auth-email-input"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="auth-email-input"
                data-testid="auth-email-input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                disabled={isSubmitting || !isConfigured}
                required
                className="w-full pl-9 pr-3 py-2 rounded-xl text-sm bg-slate-50 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all disabled:opacity-50"
              />
            </div>
          </div>

          {/* Password input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="auth-password-input"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Password
              </label>
              {isSignup && (
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                  Min. 6 characters
                </span>
              )}
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="auth-password-input"
                data-testid="auth-password-input"
                type={showPassword ? 'text' : 'password'}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isSubmitting || !isConfigured}
                required
                className="w-full pl-9 pr-10 py-2 rounded-xl text-sm bg-slate-50 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || !isConfigured}
            data-testid="auth-submit-btn"
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-sm font-bold shadow-md shadow-emerald-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{isSignup ? 'Creating account...' : 'Signing in...'}</span>
              </>
            ) : (
              <span>{isSignup ? 'Create Account' : 'Sign In'}</span>
            )}
          </button>
        </form>

        {/* Switch Mode Footer */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
          {isSignup ? (
            <p>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('login')}
                data-testid="switch-to-login-btn"
                className="font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 underline underline-offset-2 ml-1"
              >
                Sign In
              </button>
            </p>
          ) : (
            <p>
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('signup')}
                data-testid="switch-to-signup-btn"
                className="font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 underline underline-offset-2 ml-1"
              >
                Create Account
              </button>
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
};
