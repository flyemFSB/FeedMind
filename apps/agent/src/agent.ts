import { createAgent } from "langchain";
import { agentEnv } from "./env.js";
import { buildSystemPrompt } from "./prompts/system.js";
import { createModelRuntimeMiddleware } from "./middlewares/model-runtime.js";
import { SearchConfigClient } from "./tools/search/config.js";
import { getAvailableTools } from "./tools/index.js";

const searchConfigClient = new SearchConfigClient(agentEnv.BACKEND_API_URL);
const searchConfig = await searchConfigClient.load();

export const agent = createAgent({
  model: "openai:gpt-4o-mini",
  middleware: [createModelRuntimeMiddleware()],
  tools: getAvailableTools(searchConfig),
  systemPrompt: buildSystemPrompt(),
});
