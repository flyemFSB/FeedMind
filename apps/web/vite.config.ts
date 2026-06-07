import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  ssr: {
    noExternal: [/^@lobehub\//],
  },
  plugins: [tanstackStart(), tailwindcss(), viteReact()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("@assistant-ui/react") || id.includes("@assistant-ui/react-langgraph") || id.includes("@assistant-ui/react-streamdown")) {
            return "assistant";
          }
          if (id.includes("react-markdown") || id.includes("rehype-highlight") || id.includes("rehype-raw") || id.includes("remark-gfm")) {
            return "markdown";
          }
          if (id.includes("mermaid")) {
            return "mermaid";
          }
          if (id.includes("@langchain/langgraph-sdk")) {
            return "langgraph";
          }
        },
      },
    },
  },
});
