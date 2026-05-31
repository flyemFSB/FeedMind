import type { StructuredToolInterface } from "@langchain/core/tools";
import type { SearchConfig } from "./search/config.js";
import { askClarificationTool } from "./ask-clarification.js";
import { presentFileTool } from "./present-file.js";
import { webFetchTool } from "./web-fetch.js";
import { webSearchTool } from "./web-search.js";

export function getAvailableTools(searchConfig?: SearchConfig): StructuredToolInterface[] {
  const tools: StructuredToolInterface[] = [presentFileTool, askClarificationTool, webFetchTool];

  if (searchConfig && (searchConfig.braveApiKey || searchConfig.tavilyApiKey || searchConfig.exaApiKey)) {
    tools.push(webSearchTool);
  }

  return tools;
}
