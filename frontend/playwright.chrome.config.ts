// Temporary local config: drives the installed Google Chrome instead of the
// bundled Chromium (build 1124 is unavailable on this machine). Not for CI.
import { defineConfig, devices } from "@playwright/test"
import "dotenv/config"

export default defineConfig({
  testDir: "./tests",
  reporter: "line",
  use: {
    // PW_BASE lets the same suite run against the Vite dev server (default) or
    // the production bundle served by the backend on :8000.
    baseURL: process.env.PW_BASE ?? "http://localhost:5173",
    channel: "chrome",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        storageState: "playwright/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],
})
