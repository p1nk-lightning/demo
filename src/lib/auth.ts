import { apiRequest } from '@/lib/apiClient';

export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
  createdAt: number;
  isAdmin: boolean;
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

/** 忘记密码:无论邮箱是否注册,后端都返回统一文案(防枚举,AC-006)。 */
export function requestPasswordReset(email: string) {
  return apiRequest<{ ok: true }>('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

/** 重置密码:成功后所有已登录会话被吊销,需用新密码重新登录。 */
export function resetPassword(email: string, code: string, newPassword: string) {
  return apiRequest<{ ok: true }>('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code, newPassword }),
  });
}
