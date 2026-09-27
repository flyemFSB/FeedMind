import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "test-results",
  fullyParallel: false,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:13790",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @feedmind/api serve",
      url: "http://127.0.0.1:18790/api/v1/health",
      reuseExistingServer: !process.env["CI"],
      timeout: 120_000,
      env: {
        DATA_DIR: resolve(import.meta.dirname, "temp/test-e2e-data"),
        NODE_ENV: "test",
        ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef",
      },
    },
    {
      command: "pnpm --filter @feedmind/web dev",
      url: "http://127.0.0.1:13790",
      reuseExistingServer: !process.env["CI"],
      timeout: 120_000,
    },
  ],
});
