const { defineConfig } = require("@playwright/test");
const { databaseGate } = require("./tests/e2e/database-gate.cjs");
const database = databaseGate();

module.exports = defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.cjs",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["json", { outputFile: "audit/e2e-results.json" }]],
  outputDir: "test-results",
  use: {
    baseURL: "http://127.0.0.1:4180",
    channel: "msedge",
    headless: true,
    viewport: { width: 1280, height: 800 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4180 --strictPort",
    url: "http://127.0.0.1:4180",
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      MONGODB_URI: database.enabled ? database.uri : "",
      MONGODB_DB: database.enabled ? database.name : "cinebook_audit_disabled",
      SESSION_SECRET: "isolated-browser-session-secret-only-used-in-tests-64-characters",
      CINEBOOK_ADMIN_EMAIL: "audit-admin@example.test",
      // Public browser checks exercise the explicit offline catalogue. Service
      // availability and actual gateway capture are reported separately.
      TMDB_ACCESS_TOKEN: "",
      TMDB_API_KEY: "",
      TMDB_CACHE_FILE: "",
      RAZORPAY_KEY_ID: "",
      RAZORPAY_KEY_SECRET: "",
    },
  },
});
