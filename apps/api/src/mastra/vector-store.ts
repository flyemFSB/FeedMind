import { LibSQLVector } from "@mastra/libsql";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

let instance: LibSQLVector | null = null;

function getDbPath(): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  return resolve(thisDir, "..", "..", "..", "..", "data", "mastra.db");
}

export function getVectorStore(): LibSQLVector {
  if (!instance) {
    instance = new LibSQLVector({
      id: "feedmind-vector",
      url: `file:${getDbPath().replace(/\\/g, "/")}`,
    });
  }
  return instance;
}
