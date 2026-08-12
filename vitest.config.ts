import { defineConfig } from "vitest/config";

// root 必须基于配置文件位置解析，否则从子目录运行 pnpm test 时 include 会相对包目录失效
const root = import.meta.dirname;

export default defineConfig({
  test: {
    passWithNoTests: true,
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
        },
      },
      {
        test: {
          name: "web",
          root: `${root}/apps/web`,
          include: ["lib/**/*.test.ts"],
        },
      },
    ],
  },
});
