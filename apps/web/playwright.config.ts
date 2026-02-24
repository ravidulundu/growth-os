import { defineConfig, devices } from "@playwright/test";

const mockApiPort = Number(process.env.PLAYWRIGHT_MOCK_API_PORT ?? 4100);
const webPort = Number(process.env.WEB_PORT ?? process.env.PLAYWRIGHT_WEB_PORT ?? 3310);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${webPort}`;
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === "1";

export default defineConfig({
  testDir: "./e2e/tests",
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }], ["junit", { outputFile: "test-results/e2e.xml" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"]
      }
    }
  ],
  webServer: [
    {
      command: `MOCK_API_PORT=${mockApiPort} node e2e/mock-api/server.mjs`,
      port: mockApiPort,
      reuseExistingServer,
      timeout: 120_000
    },
    {
      command:
        `WEB_PORT=${webPort} API_URL=http://127.0.0.1:${mockApiPort} pnpm build && ` +
        `WEB_PORT=${webPort} API_URL=http://127.0.0.1:${mockApiPort} pnpm start`,
      port: webPort,
      reuseExistingServer,
      timeout: 240_000
    }
  ]
});
