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
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'loading',

  hydrate: async () => {
    try {
      const { user } = await getCurrentUser();
      set({ user, status: 'authenticated' });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        set({ user: null, status: 'unauthenticated' });
        return;
      }
      set({ user: null, status: 'unavailable' });
    }
  },

  login: async (email, password) => {
    const { user } = await loginWithEmail(email, password);
    set({ user, status: 'authenticated' });
  },

  register: async (email, password) => {
    const { user } = await registerWithEmail(email, password);
    set({ user, status: 'authenticated' });
  },

  logout: async () => {
    try {
      await logoutRequest();
    } finally {
      set({ user: null, status: 'unauthenticated' });
    }
  },
}));
