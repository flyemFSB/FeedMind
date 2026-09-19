import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const dbDir = dirname(scriptDir);
const drizzleDir = join(dbDir, "drizzle");
const journalPath = join(drizzleDir, "meta", "_journal.json");
const targetPath = join(dbDir, "src", "schema", "ddl.generated.ts");

// 清理迁移目录以触发全量重生成，确保生成的 DDL 具备幂等性
rmSync(drizzleDir, { recursive: true, force: true });
execSync("npx drizzle-kit generate", { cwd: dbDir, stdio: "inherit" });

if (!existsSync(journalPath)) {
  throw new Error(`未找到迁移记录文件: ${journalPath}`);
}

const journal = JSON.parse(readFileSync(journalPath, "utf-8"));
const sqlChunks = [];

for (const entry of journal.entries) {
  const filePath = join(drizzleDir, `${entry.tag}.sql`);
  if (!existsSync(filePath)) {
    throw new Error(`缺少迁移文件: ${filePath}`);
  }
  sqlChunks.push(readFileSync(filePath, "utf-8"));
}

let combinedSql = sqlChunks.join("\n");

// 清理断点标记并注入 IF NOT EXISTS 保障应用启动时幂等安全
combinedSql = combinedSql
  .replace(/--> statement-breakpoint/g, "")
  .replace(/CREATE TABLE\s+(?!IF NOT EXISTS\b)/gi, "CREATE TABLE IF NOT EXISTS ")
  .replace(/CREATE UNIQUE INDEX\s+(?!IF NOT EXISTS\b)/gi, "CREATE UNIQUE INDEX IF NOT EXISTS ")
  .replace(/CREATE INDEX\s+(?!IF NOT EXISTS\b)/gi, "CREATE INDEX IF NOT EXISTS ");

// 校验仅包含幂等建表与索引语句，拦截非幂等操作
const nonIdempotent = combinedSql
  .split(";")
  .map((statement) => statement.trim())
  .filter(Boolean)
  .filter(
    (statement) => !/^CREATE\s+(TABLE|UNIQUE\s+INDEX|INDEX)\s+IF\s+NOT\s+EXISTS\b/i.test(statement),
  );

if (nonIdempotent.length > 0) {
  throw new Error(
    `生成的 DDL 含非幂等语句，启动时会重复执行失败：\n${nonIdempotent.slice(0, 3).join("\n")}`,
  );
}

const content = `// 由 scripts/generate-ddl.mjs 自动生成，请勿手动编辑
// 源码真源: packages/db/src/schema/*.ts

export const SCHEMA_DDL =
  ${JSON.stringify(combinedSql)};
`;

writeFileSync(targetPath, content, "utf-8");
try {
  execSync("pnpm exec oxfmt src/schema/ddl.generated.ts", { cwd: dbDir, stdio: "ignore" });
} catch {
  // 忽略格式化执行异常
}
// eslint-disable-next-line no-console
console.log(`[DDL 生成] 已成功生成幂等静态 DDL: ${targetPath}`);
