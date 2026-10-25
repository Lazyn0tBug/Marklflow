import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', reporter: [['list'],['html',{open:'never'}]], timeout: 60000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [{ command: 'bun run --bun vite preview --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI, timeout: 60000 },
  {command:'bun run --bun vite --host 127.0.0.1 --port 4175 --strictPort',url:'http://127.0.0.1:4175',reuseExistingServer:!process.env.CI,timeout:60000},
  {command:'bun scripts/build-worker-probe.ts && bun run --bun vite preview --outDir test-results/worker-probe-dist --host 127.0.0.1 --port 4176 --strictPort',url:'http://127.0.0.1:4176/tests/fixtures/architecture/worker-probe.html',reuseExistingServer:!process.env.CI,timeout:60000}],
});
