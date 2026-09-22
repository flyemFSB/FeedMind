import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveDataDir } from "./data-dir.js";

const original = process.env["DATA_DIR"];
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "feedmind-data-dir-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  if (original === undefined) delete process.env["DATA_DIR"];
  else process.env["DATA_DIR"] = original;
});

describe("resolveDataDir", () => {
  it("DATA_DIR 未设置时抛错", () => {
    delete process.env["DATA_DIR"];
    expect(() => resolveDataDir()).toThrow(/DATA_DIR 未设置/);
  });

  it("DATA_DIR 存在时按需创建目录并返回", () => {
    const target = join(dir, "nested", "data");
    process.env["DATA_DIR"] = target;
    expect(resolveDataDir()).toBe(target);
    expect(statSync(target).isDirectory()).toBe(true);
  });
});
