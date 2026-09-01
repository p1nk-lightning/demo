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
  RL?: KVNamespace;
  DB?: D1Database;
  FRONTEND_ORIGIN?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  email_verified_at: number | null;
  created_at: number;
}
