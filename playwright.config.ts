import { defineConfig, devices } from "@playwright/test";

process.env.TZ ??= "Asia/Tokyo";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "line" : "list",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  outputDir: "test-results",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    timezoneId: "Asia/Tokyo",
    locale: "ja-JP",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium-mobile", use: { browserName: "chromium" } }],
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3000",
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      TZ: "Asia/Tokyo",
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_PUBLIC_SUPABASE_URL:
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "local-e2e-anon-key",
    },
  },
});
