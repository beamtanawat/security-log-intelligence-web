/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Dev proxy keeps the browser Host/Origin (changeOrigin:false) so the backend's
// trusted-host and same-origin POST checks pass. Run with --host 127.0.0.1.
const backend = "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": { target: backend, changeOrigin: false },
      "/healthz": { target: backend, changeOrigin: false },
    },
  },
  build: { outDir: "dist" },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
