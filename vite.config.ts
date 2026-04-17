import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // @ava/core has playwright as an optional peer dep for server-side use.
  // It's only referenced by the Desktop Automation sidecar (Node subprocess),
  // never by the Vite-bundled frontend — but pnpm hoists playwright-core
  // into the workspace and Vite's dep scanner follows the peer link,
  // triggering "Failed to resolve https" because playwright-core requires
  // Node built-ins. Exclude it explicitly so the frontend bundle stays clean.
  optimizeDeps: {
    exclude: ["playwright", "playwright-core"],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
