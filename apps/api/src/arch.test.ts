import { readdirSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 依赖方向守卫。
 *
 * 这些规则对应分层依据本身（目录结构是依赖约束的物理形态），不是风格偏好：
 * - lib/ 是纯技术设施，向上只被依赖，不依赖任何业务或框架层
 * - routes/ 是 HTTP 适配器，只认识 lib/ 与 modules/，不认识 DB 与 Agent 框架
 * - 组合根（server/server-core/app）是唯一允许认识一切的地方，反向禁止
 *
 * 检查的是解析后的真实文件路径，故 `@/`、`../../` 一律等价——
 * 这是本测试优于 lint 说明符模式之处（apps/api 有 166 处向上穿透的相对导入）。
 */

/** routes/ 之外的模块不得导入 routes/；组合根是唯一例外（它负责挂载） */
const ZONES: Array<{ name: string; from: string[]; to: string[] }> = [
  {
    name: "lib/ 不依赖业务层与框架层",
    from: ["lib/"],
    to: ["modules/", "routes/", "mastra/"],
  },
  {
    name: "routes/ 不得认识 Agent 框架",
    from: ["routes/"],
    to: ["mastra/"],
  },
  {
    name: "routes/ 不被业务层与框架层导入（只由组合根挂载）",
    from: ["modules/", "lib/", "mastra/"],
    to: ["routes/"],
  },
  {
    name: "组合根不被任何层导入",
    from: ["modules/", "routes/", "lib/", "mastra/"],
    to: ["server.ts", "server-core.ts", "app.ts"],
  },
];

const SRC = import.meta.dirname;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = posix.join(dir, e.name);
    return e.isDirectory() ? walk(full) : full.endsWith(".ts") ? [full] : [];
  });
}

/** 说明符 → 项目内真实文件；非项目内（包名/node:）返回 null */
function resolveSpecifier(importer: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = posix.normalize(posix.join(posix.dirname(importer), spec.replace(/\.js$/, "")));
  for (const ext of [".ts", ".tsx", "/index.ts"]) {
    const candidate = base + ext;
    if (SOURCES.has(candidate)) return candidate;
  }
  return null;
}

const SOURCES = new Set(walk(SRC).filter((f) => !f.includes(".test.")));

function importSpecifiers(file: string): string[] {
  return [...readFileSync(file, "utf8").matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
}

/** 把 src/ 下的绝对路径转成 zone 匹配用的相对键 */
const key = (abs: string) => abs.slice(SRC.length + 1).replace(/\\/g, "/");

/**
 * 从路由模块里抽出声明的 (method, path)。
 * 两类写法：createRoute({ method, path }) 与子路由的 .get("/x", ...) 调用。
 * 全部子路由都挂在 route("/") 下且文件内写全路径，故声明路径即最终路径。
 */
function declaredRoutes(file: string): Array<{ method: string; path: string }> {
  const src = readFileSync(file, "utf8");
  const found: Array<{ method: string; path: string }> = [];

  // createRoute({ method: "get", path: "/x" })：method 与 path 相邻出现
  for (const m of src.matchAll(
    /method:\s*"(get|post|put|patch|delete)"[\s\S]{0,400}?path:\s*"([^"]+)"/g,
  )) {
    // OpenAPI 的 {param} 写法与 Hono 的 :param 是同一路径，归一后比较
    found.push({ method: m[1]!.toUpperCase(), path: m[2]!.replaceAll(/\{(.+?)\}/g, ":$1") });
  }

  // <sub>.get("/x", handler) / .post(...) 等直写路径
  for (const m of src.matchAll(/\.(get|post|put|patch|delete|all)\(\s*"([^"]+)"/g)) {
    found.push({ method: m[1]!.toUpperCase(), path: m[2]! });
  }

  return found;
}

const ROUTE_MODULES = (() => {
  const dir = posix.join(SRC, "routes/v1");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.includes(".test.") && f !== "index.ts")
    .map((f) => posix.join(dir, f));
})();

describe("路由表面", () => {
  it("解析到足够多的路由声明（防止正则失效导致假绿）", () => {
    const total = ROUTE_MODULES.reduce((n, f) => n + declaredRoutes(f).length, 0);
    expect(ROUTE_MODULES.length).toBeGreaterThan(10);
    expect(total).toBeGreaterThan(40);
  });

  // 校验不存在重复声明的路由，防止后者被静默遮蔽
  it("无重复声明的 (method, path)", () => {
    const seen = new Map<string, string[]>();
    for (const file of ROUTE_MODULES) {
      for (const r of declaredRoutes(file)) {
        const key = `${r.method} ${r.path}`;
        seen.set(key, [...(seen.get(key) ?? []), posix.basename(file)]);
      }
    }
    const duplicates = [...seen.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([key, files]) => `${key} ← ${files.join(" + ")}`);
    expect(
      duplicates,
      `同一路径被多个路由模块声明，后者会被静默遮蔽：\n${duplicates.join("\n")}`,
    ).toEqual([]);
  });
});

describe("依赖方向", () => {
  const edges = SOURCES.size
    ? [...SOURCES].flatMap((importer) =>
        importSpecifiers(importer)
          .map((spec) => resolveSpecifier(importer, spec))
          .filter((t): t is string => t !== null)
          .map((target) => ({ from: key(importer), to: key(target) })),
      )
    : [];

  it("扫描到足够的依赖边（防止解析失效导致假绿）", () => {
    expect(SOURCES.size).toBeGreaterThan(50);
    expect(edges.length).toBeGreaterThan(200);
  });

  // 校验所有路由模块均在 index.ts 中显式挂载，防止路由遗漏
  it("routes/v1 下每个路由模块都在 index.ts 里挂载", () => {
    const dir = posix.join(SRC, "routes/v1");
    const modules = ROUTE_MODULES.map((f) => posix.basename(f, ".ts"));

    const indexPath = posix.join(dir, "index.ts");
    const mounted = new Set(
      importSpecifiers(indexPath)
        .map((s) => resolveSpecifier(indexPath, s))
        .filter((t): t is string => t !== null)
        .map((t) => posix.basename(t, ".ts")),
    );

    expect(modules.filter((m) => !mounted.has(m))).toEqual([]);
  });

  for (const zone of ZONES) {
    it(zone.name, () => {
      const violations = edges
        .filter(
          (e) =>
            zone.from.some((p) => e.from.startsWith(p)) &&
            zone.to.some((p) => e.to === p || e.to.startsWith(p)),
        )
        .map((e) => `${e.from} → ${e.to}`);
      expect(violations, `越界导入：\n${violations.join("\n")}`).toEqual([]);
    });
  }
});
