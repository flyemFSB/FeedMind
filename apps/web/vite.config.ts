import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-vite-plugin";

// dev 与 preview 各自维护代理（官方文档明确 preview 不继承 server.proxy）：
// vite preview 直接服务构建产物时若无此代理，/api 请求会命中 SPA 回退返回 index.html
const apiProxy = {
  "/api/chat": {
    target: "http://127.0.0.1:18790",
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api\/chat/, "/v1/agent/chat"),
  },
  "/api": {
    target: "http://127.0.0.1:18790",
    changeOrigin: true,
  },
};

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 13790,
    proxy: apiProxy,
    // 渲染进程未捕获异常与 console 报错转发到 dev 终端，便于 Electron 环境调试
    forwardConsole: true,
  },
  preview: {
    proxy: apiProxy,
  },
  resolve: {
    // 别名以 apps/web/tsconfig.json 为单一来源
    tsconfigPaths: true,
  },
  plugins: [TanStackRouterVite({ autoCodeSplitting: true }), tailwindcss(), react()],
  // 依赖 Vite 自动代码分割（mermaid/milkdown 等重库已按需懒加载），避免手动分包合并出过大 chunk
});
