import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 210000,
  expect: { timeout: 20000 },
  use: {
    headless: false,
    viewport: { width: 1920, height: 1200 },
    screen: { width: 1920, height: 1200 },
    launchOptions: {
      args: ["--window-size=1920,1200"],
    },
    trace: "on-first-retry",
  },
});
