import { Workspace, WORKSPACE_TOOLS } from "@mastra/core/workspace";
import { LocalFilesystem } from "@mastra/core/workspace";
import { resolveDataDir } from "../lib/data-dir.js";

/** 创建 FeedMind Workspace 实例，启用 BM25 供 SkillSearchProcessor 按需检索技能 */
export function createFeedMindWorkspace(): Workspace {
  const { FILESYSTEM, SEARCH } = WORKSPACE_TOOLS;
  return new Workspace({
    id: "feedmind-skills",
    name: "FeedMind Skills",
    filesystem: new LocalFilesystem({ basePath: resolveDataDir() }),
    skills: ["skills"],
    bm25: true,
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
