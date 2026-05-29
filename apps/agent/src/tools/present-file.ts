import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const presentFileTool = tool(
  async ({ filepath }) => {
    try {
      const response = await fetch(filepath);
      if (response.ok) {
        return (await response.text()).slice(0, 4096);
      }
    } catch {
      // fetch 失败则回退到本地文件系统读取
    }

    try {
      const { isAbsolute, resolve } = await import("node:path");
      const fs = await import("node:fs/promises");

      const resolved = isAbsolute(filepath) ? filepath : resolve(process.cwd(), filepath);
      const stats = await fs.stat(resolved);

      if (!stats.isFile()) {
        return JSON.stringify({ error: "NOT_A_FILE", filepath, resolved });
      }
      if (stats.size > 1024 * 1024) {
        return JSON.stringify({
          error: "FILE_TOO_LARGE",
          filepath,
          resolved,
          size: stats.size,
          max_bytes: 1_048_576,
        });
      }

      const content = await fs.readFile(resolved, "utf-8");
      return content || JSON.stringify({ error: "FILE_EMPTY", filepath, resolved });
    } catch (error) {
      return JSON.stringify({
        error: "FILE_NOT_FOUND",
        filepath,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
  {
    name: "present_file",
    description:
      "Present a file's content to the user for viewing. " +
      "Use this after creating reports, documents, or any output files the user should see. " +
      "Accepts a file path (absolute or relative to project root). Returns the file content.",
    schema: z.object({
      filepath: z.string().describe("Path to the file to present. Can be absolute or relative to project root."),
    }),
  },
);
