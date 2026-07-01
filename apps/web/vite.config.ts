import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-vite-plugin";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 13790,
    proxy: {
      "/api/chat": {
        target: "http://127.0.0.1:18790",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/chat/, "/v1/agent/chat"),
      },
      "/api": {
        target: "http://127.0.0.1:18790",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [TanStackRouterVite({ autoCodeSplitting: true }), tailwindcss(), react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (
            id.includes("react-markdown") ||
            id.includes("rehype-highlight") ||
            id.includes("rehype-raw") ||
            id.includes("remark-gfm")
          ) {
            return "markdown";
          }
        },
      },
    },
  },
});
