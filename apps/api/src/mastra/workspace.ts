import { Workspace, WORKSPACE_TOOLS } from "@mastra/core/workspace";
import { LocalFilesystem } from "@mastra/core/workspace";
import { resolveDataDir } from "../lib/data-dir.js";

/**
 * 创建 FeedMind Workspace 实例，用于发现和管理 Skills。
 *
 * skills/ 目录位于 data/skills/（运行时数据，已 gitignore）。
 * 在该目录下添加 SKILL.md 子目录后，
 * Agent 将自动发现并注入 skill / skill_search / skill_read 工具。
 *
 * 禁用所有 workspace file tools（read_file, write_file 等），
 * 仅保留 skill 发现能力。工具名用官方常量，防上游改名静默失效。
 */
export function createFeedMindWorkspace(): Workspace {
  const { FILESYSTEM, SEARCH } = WORKSPACE_TOOLS;
  return new Workspace({
    id: "feedmind-skills",
    name: "FeedMind Skills",
    filesystem: new LocalFilesystem({ basePath: resolveDataDir() }),
    skills: ["skills"],
    tools: {
      [FILESYSTEM.READ_FILE]: { enabled: false },
      [FILESYSTEM.WRITE_FILE]: { enabled: false },
      [FILESYSTEM.EDIT_FILE]: { enabled: false },
      [FILESYSTEM.LIST_FILES]: { enabled: false },
      [FILESYSTEM.DELETE]: { enabled: false },
      [FILESYSTEM.FILE_STAT]: { enabled: false },
      [FILESYSTEM.MKDIR]: { enabled: false },
      [FILESYSTEM.GREP]: { enabled: false },
      [FILESYSTEM.AST_EDIT]: { enabled: false },
      [SEARCH.SEARCH]: { enabled: false },
      [SEARCH.INDEX]: { enabled: false },
    },
  });
}
