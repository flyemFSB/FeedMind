import { LibSQLVector } from "@mastra/libsql";
import { resolve } from "node:path";
import { resolveDataDir } from "../lib/data-dir.js";

let instance: LibSQLVector | null = null;

function getDbPath(): string {
  return resolve(resolveDataDir(), "mastra.db");
}

export function getVectorStore(): LibSQLVector {
  instance ??= new LibSQLVector({
    id: "feedmind-vector",
    url: `file:${getDbPath().replace(/\\/g, "/")}`,
  });
  return instance;
}
