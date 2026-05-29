import { createAgent } from "langchain";
import { buildSystemPrompt } from "./prompts/system.js";
import { createFeedMindModel } from "./adapter/feedmind-model.js";
import { askClarificationTool, presentFileTool, webFetchTool, webSearchTool } from "./tools/index.js";

// LangGraph Agent 定义：模型运行时动态切换、搜索+抓取双工具链
export const agent = createAgent({
  model: createFeedMindModel(),
  tools: [askClarificationTool, presentFileTool, webSearchTool, webFetchTool],
  systemPrompt: buildSystemPrompt(),
});
