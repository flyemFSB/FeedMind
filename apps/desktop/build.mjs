/* eslint-disable no-console */
import { build } from "esbuild";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const desktopDir = import.meta.dirname;

// 1. 先用 tsc 生成 TypeScript 声明与类型检查
console.log("[build] 正在生成 TypeScript 声明与类型检查...");
execSync("tsc -b", { cwd: desktopDir, stdio: "inherit" });

// 2. 用 esbuild 进行主进程与 API 服务的高效 bundle
console.log("[build] 正在使用 esbuild 打包桌面端主进程...");
await build({
  entryPoints: [resolve(desktopDir, "src/main.ts")],
  outfile: resolve(desktopDir, "dist/main.js"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  // 保持外部加载的原生 C/C++ 模块与重型动态依赖
  external: [
    "electron",
    "@libsql/*",
    "@libsql/client",
    "better-sqlite3",
    "playwright-core",
    "chromium-bidi/*",
    "chromium-bidi",
    "@firecrawl/*",
    "@remotion/*",
    "remotion",
    "@esbuild/*",
    "@rspack/*",
  ],
  banner: {
    // ESM 模式下注入 require, __filename 与 __dirname 垫片以保障 CJS 依赖正常加载
    js: `import { createRequire as __createRequire } from 'node:module'; import { fileURLToPath as __fileURLToPath } from 'node:url'; import { dirname as __pathDirname } from 'node:path'; const require = __createRequire(import.meta.url); const __filename = __fileURLToPath(import.meta.url); const __dirname = __pathDirname(__filename);`,
  },
  minify: true,
});

console.log("[build] 桌面端主进程 Bundle 完成！");
