import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-plugin';
import fs from 'node:fs';
import path from 'node:path';

// 把 migrations/*.sql 拼成完整 schema,经 miniflare binding 注入测试运行时,
// 由测试 setup 逐语句执行(插件不自动应用 wrangler 迁移)。
const migrationsDir = path.resolve(__dirname, 'migrations');
const schemaSql = fs.readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort((a, b) => parseInt(a.split('_')[0], 10) - parseInt(b.split('_')[0], 10))
  .map((name) => fs.readFileSync(path.join(migrationsDir, name), 'utf8'))
  .join('\n');

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: {
        bindings: {
          TEST_SCHEMA: schemaSql,
        },
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
