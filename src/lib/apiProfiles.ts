import type { ApiProfile } from '@/types/domain';

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'http://localhost:8787';

export async function testApiConnection(profile: Pick<ApiProfile, 'baseUrl' | 'model' | 'apiKey'>) {
  const response = await fetch(`${WORKER_URL}/api/test-provider`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-provider-key': profile.apiKey,
    },
    body: JSON.stringify({ baseUrl: profile.baseUrl, model: profile.model }),
  });
  const body = (await response.json()) as { ok?: boolean; error?: string };
  if (!response.ok || !body.ok) throw new Error(body.error || '连接失败');
  return true;
}
