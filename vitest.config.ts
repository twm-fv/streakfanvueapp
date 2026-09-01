import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Modules under test import the validated env at load time. These are
    // throwaway values; nothing here reaches a real service.
    env: {
      SESSION_SECRET: "test-session-secret-at-least-32-characters-long",
      // Vite defines its own BASE_URL as "/", which collides with ours and is
      // not a valid URL. Override it rather than renaming the variable, which
      // is already set in deployed environments.
      BASE_URL: "https://streak.example.invalid",
      DATA_DIR: ".data-test",
      API_BASE_URL: "https://api.example.invalid",
      OAUTH_ISSUER_BASE_URL: "https://auth.example.invalid",
    },
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
