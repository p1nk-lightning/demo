import { apiRequest } from '@/lib/apiClient';

export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
  createdAt: number;
}

interface AuthResponse {
  user: AuthUser;
  verificationEmailSent?: boolean;
}

export function getCurrentUser() {
  return apiRequest<AuthResponse>('/api/auth/me');
}

export function registerWithEmail(email: string, password: string, turnstileToken: string) {
  return apiRequest<AuthResponse>('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, turnstileToken }),
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

export function verifyEmail(code: string) {
  return apiRequest<{ ok: true }>('/api/auth/verify-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
}

export function resendVerification() {
  return apiRequest<{ ok: true; alreadyVerified?: boolean }>('/api/auth/resend-verification', { method: 'POST' });
}
