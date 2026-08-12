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
  // 不再手写 manualChunks：rolldown/vite 8 的自动 code splitting 已按需拆分（mermaid/milkdown
  // 等重库均为懒加载链），手写分组反而会合并出 2.9MB 大 chunk（曾把 mathjax-full 并进 markdown）。
});
