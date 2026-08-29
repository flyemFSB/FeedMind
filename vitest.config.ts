import { defineConfig } from "vitest/config";

// root 必须基于配置文件位置解析，否则从子目录运行 pnpm test 时 include 会相对包目录失效
const root = import.meta.dirname;

export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["packages/*/src/**/*.ts", "apps/api/src/**/*.ts", "apps/web/lib/**/*.ts"],
      exclude: [
        "**/*.d.ts",
        "**/*.test.ts",
        "**/*.integration.test.ts",
        "**/dist/**",
        "**/node_modules/**",
      ],
    },
    projects: [
      {
        test: {
          name: "contracts",
          root: `${root}/packages/contracts`,
          include: ["src/**/*.test.ts"],
        },
      },
      {
        test: { name: "shared", root: `${root}/packages/shared`, include: ["src/**/*.test.ts"] },
      },
      {
        test: {
          name: "wiki-core",
          root: `${root}/packages/wiki-core`,
          include: ["src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "crawler-core",
          root: `${root}/packages/crawler-core`,
          include: ["src/**/*.test.ts"],
        },
      },
      {
        test: { name: "db", root: `${root}/packages/db`, include: ["src/**/*.test.ts"] },
      },
      {
        test: {
          name: "api",
          root: `${root}/apps/api`,
          include: ["src/**/*.test.ts"],
          setupFiles: ["./vitest.setup.ts"],
          hookTimeout: 30000,
          testTimeout: 30000,
          // 内存 SQLite + server 生命周期是异步泄漏高发区：泄漏的定时器/句柄直接报失败而非挂起
          detectAsyncLeaks: true,
        },
      },
      {
        test: {
          name: "web",
          root: `${root}/apps/web`,
          include: ["lib/**/*.test.ts"],
        },
        // 与 apps/web/vite.config.ts 的 tsconfigPaths 对齐，否则测试无法解析 @/ 别名
        resolve: { alias: { "@": `${root}/apps/web` } },
      },
    ],
  },
});
