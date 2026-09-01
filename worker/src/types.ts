// Worker 全局类型与提示词常量(自 index.ts 纯移动)。
export interface Env {
  DEEPSEEK_GENERATION_API_KEY?: string;
  DEEPSEEK_REVIEW_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_DEV_PROXY_URL?: string;
  DEEPSEEK_DEV_PROXY_TOKEN?: string;
  DASHSCOPE_API_KEY?: string;
  ARK_API_KEY?: string;
  DEEPSEEK_MODEL?: string;
  QWEN_MODEL?: string;
  DOUBAO_MODEL?: string;
  ADMIN_EMAILS?: string;
  TURNSTILE_SECRET_KEY?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  /** @deprecated KV 限流已废弃(最终一致不适合计数器,ADR-001),由 RATE_LIMITER 取代;仅保留至下个清理批次 */
  RL?: KVNamespace;
  RATE_LIMITER?: {
    limit(key: { key: string }): Promise<{ success: boolean }>;
  };
  DB?: D1Database;
  FRONTEND_ORIGIN?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  email_verified_at: number | null;
  created_at: number;
}
