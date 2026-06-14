import { Workspace } from "@mastra/core/workspace";
import { LocalFilesystem } from "@mastra/core/workspace";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 创建 FeedMind Workspace 实例，用于发现和管理 Skills。
 *
 * 目前 skills/ 目录为空，Workspace 不会发现任何技能。
 * 后续在 skills/ 下添加 SKILL.md 子目录后，
 * Agent 将自动发现并注入 skill / skill_search / skill_read 工具。
 *
 * 禁用所有 workspace file tools（read_file, write_file 等），
 * 仅保留 skill 发现能力。
 */
export function createFeedMindWorkspace(): Workspace {
  return new Workspace({
    id: "feedmind-skills",
    name: "FeedMind Skills",
    filesystem: new LocalFilesystem({ basePath: resolve(__dirname) }),
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
