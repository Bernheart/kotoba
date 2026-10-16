import { defineConfig, devices } from '@playwright/test'

// iPhone-sized WebKit (closest to Safari) + desktop Chromium. Uses the dev server.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'off',
    // skip the first-run welcome sheet (tested on its own in welcome.spec.ts)
    storageState: { cookies: [], origins: [{ origin: 'http://localhost:5173', localStorage: [{ name: 'kotoba.nowelcome', value: '1' }] }] },
  },
  projects: [
    {
      name: 'iphone',
      use: {
        ...devices['iPhone 13'],
        browserName: 'webkit',
        viewport: { width: 390, height: 844 },
        colorScheme: 'dark',
      },
    },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, colorScheme: 'dark' } },
  ],
  webServer: { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 60_000 },
})
