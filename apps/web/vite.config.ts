import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 3000,
    proxy: {},
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [tanstackStart(), tailwindcss(), viteReact()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("react-markdown") || id.includes("rehype-highlight") || id.includes("rehype-raw") || id.includes("remark-gfm")) {
            return "markdown";
          }
        },
      },
    },
  },
});
