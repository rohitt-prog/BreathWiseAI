import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '../stores/useAuthStore';
import { AuthModal } from '../components/auth/AuthModal';
import { Navbar } from '../components/layout/Navbar';
import * as authService from '../services/authService';

vi.mock('../services/authService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/authService')>();
  return {
    ...actual,
    loginWithEmail: vi.fn(),
    signUpWithEmail: vi.fn(),
    loginWithGoogle: vi.fn(),
    logoutUser: vi.fn(),
    subscribeToAuthState: vi.fn(),
  };
});

describe('Phase 7.4 Authentication UI & Navigation Integration', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    useAuthStore.setState({
      user: null,
      status: 'unauthenticated',
      error: null,
      isAuthModalOpen: false,
      authModalMode: 'login',
      isConfigured: true,
    });
  });

  describe('1. useAuthStore State Management', () => {
    it('manages modal visibility and mode toggling', () => {
      expect(useAuthStore.getState().isAuthModalOpen).toBe(false);

      useAuthStore.getState().setAuthModalOpen(true, 'signup');
      expect(useAuthStore.getState().isAuthModalOpen).toBe(true);
      expect(useAuthStore.getState().authModalMode).toBe('signup');

      useAuthStore.getState().setAuthModalMode('login');
      expect(useAuthStore.getState().authModalMode).toBe('login');

      useAuthStore.getState().setAuthModalOpen(false);
      expect(useAuthStore.getState().isAuthModalOpen).toBe(false);
    });

    it('updates user and status on authentication', () => {
      const mockUser = {
        uid: 'uid-abc',
        email: 'user@example.com',
        displayName: 'Test',
        photoURL: null,
        isAnonymous: false,
        emailVerified: true,
        providerId: 'password',
      };

      useAuthStore.getState().setUser(mockUser);
      expect(useAuthStore.getState().user).toEqual(mockUser);
      expect(useAuthStore.getState().status).toBe('authenticated');

      useAuthStore.getState().setUser(null);
      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().status).toBe('unauthenticated');
    });

    it('invokes logoutUser and transitions to guest on signOut', async () => {
      useAuthStore.setState({
        user: {
          uid: 'u-1',
          email: 'test@breathewise.ai',
          displayName: 'Test',
          photoURL: null,
          isAnonymous: false,
          emailVerified: true,
          providerId: 'password',
        },
        status: 'authenticated',
      });

      await useAuthStore.getState().signOut();

      expect(authService.logoutUser).toHaveBeenCalled();
      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().status).toBe('unauthenticated');
    });
  });

  describe('2. AuthModal Component', () => {
    it('renders login fields and toggles to signup mode', async () => {
      useAuthStore.setState({ isAuthModalOpen: true, authModalMode: 'login', isConfigured: true });

      render(<AuthModal />);

      expect(screen.getByText('Sign In to BreatheWise')).toBeInTheDocument();
      expect(screen.getByTestId('auth-email-input')).toBeInTheDocument();
      expect(screen.getByTestId('auth-password-input')).toBeInTheDocument();
      expect(screen.getByTestId('google-signin-btn')).toBeInTheDocument();
      expect(screen.getByTestId('auth-submit-btn')).toHaveTextContent('Sign In');

      // Toggle to signup
      const switchBtn = screen.getByTestId('switch-to-signup-btn');
      fireEvent.click(switchBtn);

      expect(screen.getByText('Create Your Account')).toBeInTheDocument();
      expect(screen.getByTestId('auth-submit-btn')).toHaveTextContent('Create Account');
    });

    it('toggles password visibility between password and text', () => {
      useAuthStore.setState({ isAuthModalOpen: true, isConfigured: true });
      render(<AuthModal />);

      const passwordInput = screen.getByTestId('auth-password-input');
      expect(passwordInput).toHaveAttribute('type', 'password');

      const toggleBtn = screen.getByLabelText('Show password');
      fireEvent.click(toggleBtn);

      expect(passwordInput).toHaveAttribute('type', 'text');

      const hideBtn = screen.getByLabelText('Hide password');
      fireEvent.click(hideBtn);

      expect(passwordInput).toHaveAttribute('type', 'password');
    });

    it('displays client-side validation error when fields are empty', async () => {
      useAuthStore.setState({ isAuthModalOpen: true, isConfigured: true });
      render(<AuthModal />);

      const submitBtn = screen.getByTestId('auth-submit-btn');
      fireEvent.click(submitBtn);

      expect(await screen.findByTestId('auth-error-banner')).toHaveTextContent(
        'Please fill in both email and password.'
      );
    });

    it('displays validation error when password is under 6 characters during signup', async () => {
      useAuthStore.setState({ isAuthModalOpen: true, authModalMode: 'signup', isConfigured: true });
      render(<AuthModal />);

      fireEvent.change(screen.getByTestId('auth-email-input'), {
        target: { value: 'newuser@breathewise.ai' },
      });
      fireEvent.change(screen.getByTestId('auth-password-input'), {
        target: { value: '123' },
      });

      fireEvent.click(screen.getByTestId('auth-submit-btn'));

      expect(await screen.findByTestId('auth-error-banner')).toHaveTextContent(
        'Password must be at least 6 characters long.'
      );
    });

    it('submits valid login credentials and closes modal on success', async () => {
      useAuthStore.setState({ isAuthModalOpen: true, authModalMode: 'login', isConfigured: true });

      const mockUser = {
        uid: 'user-valid',
        email: 'valid@breathewise.ai',
        displayName: 'Valid User',
        photoURL: null,
        isAnonymous: false,
        emailVerified: true,
        providerId: 'password',
      };

      vi.mocked(authService.loginWithEmail).mockResolvedValue(mockUser);

      render(<AuthModal />);

      fireEvent.change(screen.getByTestId('auth-email-input'), {
        target: { value: 'valid@breathewise.ai' },
      });
      fireEvent.change(screen.getByTestId('auth-password-input'), {
        target: { value: 'ValidPassword123' },
      });

      fireEvent.click(screen.getByTestId('auth-submit-btn'));

      await waitFor(() => {
        expect(authService.loginWithEmail).toHaveBeenCalledWith(
          'valid@breathewise.ai',
          'ValidPassword123'
        );
        expect(useAuthStore.getState().user).toEqual(mockUser);
        expect(useAuthStore.getState().isAuthModalOpen).toBe(false);
      });
    });

    it('displays error banner when authentication service rejects', async () => {
      useAuthStore.setState({ isAuthModalOpen: true, authModalMode: 'login', isConfigured: true });

      vi.mocked(authService.loginWithEmail).mockRejectedValue({
        code: 'auth/invalid-credential',
      });

      render(<AuthModal />);

      fireEvent.change(screen.getByTestId('auth-email-input'), {
        target: { value: 'wrong@example.com' },
      });
      fireEvent.change(screen.getByTestId('auth-password-input'), {
        target: { value: 'WrongPass' },
      });

      fireEvent.click(screen.getByTestId('auth-submit-btn'));

      expect(await screen.findByTestId('auth-error-banner')).toHaveTextContent(
        'Invalid email or password.'
      );
    });

    it('handles Google sign-in button click and popup errors', async () => {
      useAuthStore.setState({ isAuthModalOpen: true, isConfigured: true });

      vi.mocked(authService.loginWithGoogle).mockRejectedValue({
        code: 'auth/popup-closed-by-user',
      });

      render(<AuthModal />);

      fireEvent.click(screen.getByTestId('google-signin-btn'));

      expect(await screen.findByTestId('auth-error-banner')).toHaveTextContent(
        'Google sign-in was closed before completion.'
      );
    });

    it('displays informative unconfigured notice when Firebase is not configured', () => {
      useAuthStore.setState({ isAuthModalOpen: true, isConfigured: false });
      render(<AuthModal />);

      expect(screen.getByTestId('firebase-unconfigured-notice')).toBeInTheDocument();
      expect(screen.getByTestId('auth-submit-btn')).toBeDisabled();
      expect(screen.getByTestId('google-signin-btn')).toBeDisabled();
    });
  });

  describe('3. Navbar Guest & Authenticated Parity', () => {
    it('renders "Sign In" button when in guest mode and opens modal on click', () => {
      useAuthStore.setState({ user: null, status: 'unauthenticated' });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Navbar />
          </MemoryRouter>
        </QueryClientProvider>
      );

      const signInBtn = screen.getByTestId('navbar-signin-btn');
      expect(signInBtn).toBeInTheDocument();
      expect(signInBtn).toHaveTextContent('Sign In');

      fireEvent.click(signInBtn);
      expect(useAuthStore.getState().isAuthModalOpen).toBe(true);
    });

    it('renders user indicator and sign-out button when authenticated', async () => {
      const mockUser = {
        uid: 'user-logged-in',
        email: 'logged@breathewise.ai',
        displayName: 'Rohit User',
        photoURL: null,
        isAnonymous: false,
        emailVerified: true,
        providerId: 'google.com',
      };

      useAuthStore.setState({ user: mockUser, status: 'authenticated' });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Navbar />
          </MemoryRouter>
        </QueryClientProvider>
      );

      expect(screen.queryByTestId('navbar-signin-btn')).not.toBeInTheDocument();
      expect(screen.getByTestId('navbar-auth-user')).toBeInTheDocument();
      expect(screen.getByText('Rohit User')).toBeInTheDocument();

      const signOutBtn = screen.getByTestId('navbar-signout-btn');
      expect(signOutBtn).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(signOutBtn);
      });
      expect(authService.logoutUser).toHaveBeenCalled();
    });

    it('renders loading placeholder while authentication state is resolving', () => {
      useAuthStore.setState({ status: 'loading' });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Navbar />
          </MemoryRouter>
        </QueryClientProvider>
      );

      expect(screen.getByTestId('navbar-auth-loading')).toBeInTheDocument();
    });
  });
});
