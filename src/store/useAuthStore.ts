import { create } from 'zustand';
import { ApiError } from '@/lib/apiClient';
import {
  getCurrentUser,
  loginWithEmail,
  logout as logoutRequest,
  registerWithEmail,
  type AuthUser,
} from '@/lib/auth';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'unavailable';

interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
  hydrate: () => Promise<AuthStatus>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, turnstileToken: string) => Promise<{ verificationEmailSent: boolean }>;
  logout: () => Promise<void>;
}

const AUTH_CACHE_KEY = 'lexiscene:last-user';

function cacheUser(user: AuthUser | null) {
  try {
    if (user) localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(user));
    else localStorage.removeItem(AUTH_CACHE_KEY);
  } catch {}
}

function readCachedUser(): AuthUser | null {
  try {
    const value = JSON.parse(localStorage.getItem(AUTH_CACHE_KEY) ?? 'null') as Partial<AuthUser> | null;
    return value && typeof value.id === 'string' && typeof value.email === 'string'
      ? { ...value, isAdmin: Boolean(value.isAdmin) } as AuthUser
      : null;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'loading',

  hydrate: async () => {
    try {
      const { user } = await getCurrentUser();
      cacheUser(user);
      set({ user, status: 'authenticated' });
      return 'authenticated';
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        cacheUser(null);
        set({ user: null, status: 'unauthenticated' });
        return 'unauthenticated';
      }
      const cachedUser = readCachedUser();
      const status = cachedUser ? 'authenticated' : 'unavailable';
      set(cachedUser ? { user: cachedUser, status } : { user: null, status });
      return 'unavailable';
    }
  },

  login: async (email, password) => {
    const { user } = await loginWithEmail(email, password);
    cacheUser(user);
    set({ user, status: 'authenticated' });
  },

  register: async (email, password, turnstileToken) => {
    const { user, verificationEmailSent = false } = await registerWithEmail(email, password, turnstileToken);
    cacheUser(user);
    set({ user, status: 'authenticated' });
    return { verificationEmailSent };
  },

  logout: async () => {
    try {
      await logoutRequest();
    } finally {
      cacheUser(null);
      set({ user: null, status: 'unauthenticated' });
    }
  },
}));

window.addEventListener('online', () => {
  void useAuthStore.getState().hydrate();
});
