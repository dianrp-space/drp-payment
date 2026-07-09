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
      "/v2": "http://127.0.0.1:8081",
      "/admin": "http://127.0.0.1:8081",
      "/api": "http://127.0.0.1:8081",
      "/health": "http://127.0.0.1:8081",
      "/branding": "http://127.0.0.1:8081",
      "/api-docs": "http://127.0.0.1:8081",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
