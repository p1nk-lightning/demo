// Worker 入口:挂载各路由域 + CORS + 统一错误兜底 + Cron 轮换。
// 路由/认证/LLM/内容池的实现分别在 routes/ 与 lib/ 下。
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import appPackage from '../../package.json';
import type { Env } from './types';
import authRoutes from './routes/auth';
import syncRoutes from './routes/sync';
import dictionaryRoutes from './routes/dictionary';
import contentRoutes from './routes/content';
import generateRoutes from './routes/generate';
import { rotateContentPool } from './lib/content-store';
import { chinaDayKey } from './lib/time';

// 版本号单一来源 = 根 package.json(与前端共享,version.test.ts 断言一致性)
const APP_VERSION: string = appPackage.version;

const app = new Hono<{ Bindings: Env }>();

app.use('/api/*', async (context, next) => {
  const requestOrigin = context.req.header('origin') ?? '';
  const localOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
  ];
  // FRONTEND_ORIGIN 服务生产域名;本地白名单 origin 永远放行,避免本地 dev 被生产配置压掉
  const isLocalOrigin = localOrigins.includes(requestOrigin);
  return cors({
  origin: isLocalOrigin ? requestOrigin : (context.env.FRONTEND_ORIGIN || 'http://localhost:5173'),
  allowHeaders: ['Content-Type'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  })(context, next);
});

app.get('/healthz', (context) => context.json({ ok: true, product: 'LexiScene', version: APP_VERSION }));

app.route('/', authRoutes);
app.route('/', syncRoutes);
app.route('/', dictionaryRoutes);
app.route('/', contentRoutes);
app.route('/', generateRoutes);

app.notFound((context) => context.json({ error: 'not found' }, 404));

app.onError((error, context) => {
  console.error('Unhandled worker error', {
    path: context.req.path,
    method: context.req.method,
    error: error instanceof Error ? error.stack : String(error),
  });
  return context.json({ error: '服务器开小差了，稍后再试' }, 500);
});

async function scheduled(event: ScheduledController, env: Env) {
  if (!env.DB) return;
  const dayKey = chinaDayKey(event.scheduledTime);
  await rotateContentPool(env.DB, dayKey);
}

export default {
  fetch: app.fetch,
  scheduled,
};
