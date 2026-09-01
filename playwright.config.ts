import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  reporter: [['list']],
  timeout: 120_000,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    actionTimeout: 15_000,
  },
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm run worker:dev',
      url: 'http://127.0.0.1:8787/healthz',
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
