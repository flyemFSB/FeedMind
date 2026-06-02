import { createAgent } from "langchain";
import { agentEnv } from "./env.js";
import { buildSystemPrompt } from "./prompts/system.js";
import { createModelRuntimeMiddleware } from "./middlewares/model-runtime.js";
import { ToolConfigClient } from "./tools/search/config.js";
import { getAvailableTools } from "./tools/index.js";

// 仅初始化客户端，配置在 web_search 工具调用时动态加载
new ToolConfigClient(agentEnv.BACKEND_API_URL);

export const agent = createAgent({
  model: "openai:gpt-4o-mini",
  middleware: [createModelRuntimeMiddleware()],
  tools: getAvailableTools(),
  systemPrompt: buildSystemPrompt(),
});
