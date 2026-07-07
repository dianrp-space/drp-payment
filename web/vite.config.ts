import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    watch: {
      usePolling: true,
      interval: 300,
    },
    proxy: {
      "/v2": "http://127.0.0.1:8080",
      "/admin": "http://127.0.0.1:8080",
      "/api": "http://127.0.0.1:8080",
      "/health": "http://127.0.0.1:8080",
      "/branding": "http://127.0.0.1:8080",
      "/api-docs": "http://127.0.0.1:8080",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
