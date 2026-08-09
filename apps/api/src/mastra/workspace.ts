import { Workspace } from "@mastra/core/workspace";
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
 * 仅保留 skill 发现能力。
 */
export function createFeedMindWorkspace(): Workspace {
  return new Workspace({
    id: "feedmind-skills",
    name: "FeedMind Skills",
    filesystem: new LocalFilesystem({ basePath: resolveDataDir() }),
    skills: ["skills"],
    tools: {
      mastra_workspace_read_file: { enabled: false },
      mastra_workspace_write_file: { enabled: false },
      mastra_workspace_edit_file: { enabled: false },
      mastra_workspace_list_files: { enabled: false },
      mastra_workspace_delete: { enabled: false },
      mastra_workspace_file_stat: { enabled: false },
      mastra_workspace_mkdir: { enabled: false },
      mastra_workspace_grep: { enabled: false },
      mastra_workspace_ast_edit: { enabled: false },
      mastra_workspace_search: { enabled: false },
      mastra_workspace_index: { enabled: false },
    },
  });
}
