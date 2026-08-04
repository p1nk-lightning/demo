import { apiRequest } from '@/lib/apiClient';

export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
  createdAt: number;
}

interface AuthResponse {
  user: AuthUser;
}

export function getCurrentUser() {
  return apiRequest<AuthResponse>('/api/auth/me');
}

export function registerWithEmail(email: string, password: string) {
  return apiRequest<AuthResponse>('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

export function loginWithEmail(email: string, password: string) {
  return apiRequest<AuthResponse>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

export function logout() {
  return apiRequest<{ ok: true }>('/api/auth/logout', { method: 'POST' });
}
