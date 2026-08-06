export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_WORKER_URL || '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...init.headers,
    },
  });
  const data = await response.json().catch(() => null) as { error?: string } | T | null;
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
      ? data.error
      : '请求失败，请稍后再试';
    throw new ApiError(message, response.status);
  }
  return data as T;
}
