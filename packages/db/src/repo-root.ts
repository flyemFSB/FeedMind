import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/** 向上查找含 pnpm-workspace.yaml 的仓库根；到达文件系统根仍未找到则退回起点 */
export function findRepoRoot(start: string): string {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}
