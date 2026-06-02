import type { StructuredToolInterface } from "@langchain/core/tools";
import { askClarificationTool } from "./ask-clarification.js";
import { presentFileTool } from "./present-file.js";
import { webFetchTool } from "./web-fetch.js";
import { webSearchTool } from "./web-search.js";

export function getAvailableTools(): StructuredToolInterface[] {
  return [presentFileTool, askClarificationTool, webFetchTool, webSearchTool];
}
