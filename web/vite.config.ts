/// <reference types="vitest/config" />
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8899",
      "/health": "http://127.0.0.1:8899",
      "/ingest": "http://127.0.0.1:8899",
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: [resolve(__dirname, "src/test/setup.ts")],
    include: [
      resolve(__dirname, "src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"),
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "src/test/"],
    },
  },
});
