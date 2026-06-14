import { defineConfig, devices } from '@playwright/test';

// E2E config for the ANCIENTS browser build. Tests boot the game through the
// ?test harness (see src/systems/test-harness.ts). Most specs use the headless
// render mode (?render=headless) and never touch WebGL; the boot smoke test
// uses the real renderer with SwiftShader so it works in CI without a GPU.
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 5174);
const HOST = '127.0.0.1';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://${HOST}:${PORT}`,
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // Software WebGL so the real-renderer boot smoke test passes on
          // headless/CI machines with no GPU.
          args: [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist'
          ]
        }
      }
    }
  ],
  webServer: {
    command: `npm run dev -- --host ${HOST} --port ${PORT} --strictPort`,
    url: `http://${HOST}:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
