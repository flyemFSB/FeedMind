import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getWikiRootDir } from "./paths.js";

const originalDataDir = process.env["DATA_DIR"];
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "feedmind-wiki-root-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env["DATA_DIR"];
  else process.env["DATA_DIR"] = originalDataDir;
});

describe("getWikiRootDir", () => {
  it("未配置 WIKI_DIR 时锚定数据目录", () => {
    process.env["DATA_DIR"] = dir;
    expect(getWikiRootDir()).toBe(join(dir, "wiki"));
  });
});
