import type { StructuredToolInterface } from "@langchain/core/tools";
import { askClarificationTool } from "./ask-clarification.js";
import { webFetchTool } from "./web-fetch.js";
import { webSearchTool } from "./web-search.js";
import { wikiReadTool } from "./wiki-read.js";
import { wikiSearchTool } from "./wiki-search.js";

export function getAvailableTools(): StructuredToolInterface[] {
  return [askClarificationTool, webFetchTool, webSearchTool, wikiReadTool, wikiSearchTool];
}
