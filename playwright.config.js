import { defineConfig, devices } from "@playwright/test";

/*
  Browser tests (npm run e2e): the real app in a real browser against a local backend.
  See INSTRUCTIONS.md → "Browser tests" for how to start the backend.

    E2E_LLM=real            use the backend's real LLM providers (default: the fake LLM in
                            e2e/fake-llm.mjs, no API keys; start the backend with
                            LLM_PROVIDERS=ollama:mock LLM_VISION_PROVIDERS=ollama:mock)
    E2E_BACKEND_URL         the backend (default http://127.0.0.1:8000)
    E2E_BROWSER_CHANNEL     e.g. "chrome" to use the installed Chrome instead of Playwright's
                            Chromium (npx playwright install chromium)
*/
const mocked = (process.env.E2E_LLM || "mock") !== "real";
const backend = process.env.E2E_BACKEND_URL || "http://127.0.0.1:8000";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.js",
  globalSetup: "./e2e/global-setup.js",
  // One shared backend: the tests run one after the other.
  workers: 1,
  fullyParallel: false,
  // Real models take seconds per question; the fake LLM answers at once.
  timeout: mocked ? 90_000 : 300_000,
  expect: { timeout: mocked ? 10_000 : 60_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
    channel: process.env.E2E_BROWSER_CHANNEL || undefined,
  },
  webServer: [
    {
      command: "npm run dev",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      env: { VITE_API_BASE_URL: "/api", VITE_API_PROXY_TARGET: backend },
    },
    ...(mocked ? [{ command: "node e2e/fake-llm.mjs", url: "http://127.0.0.1:11434/health", reuseExistingServer: true }] : []),
  ],
});
