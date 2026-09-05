import { createTool } from "@mastra/core/tools";
import { z } from "zod";

/** 当用户意图模糊、缺少细节或存在多种解释时，向用户发起澄清提问 */
export const askClarificationTool = createTool({
  id: "ask_clarification",
  description:
    "Ask the user a clarifying question when the task request is ambiguous, " +
    "missing details, or when multiple interpretations are possible. " +
    "Use this tool instead of guessing the user's intent.",
  inputSchema: z.object({
    question: z.string().describe("The question to ask the user."),
    options: z
      .array(z.string())
      .optional()
      .describe("Optional list of possible directions or choices for the user to pick from."),
  }),
  execute: async ({ question, options }) => {
    const lines: string[] = [`## 需要澄清`, ``, `${question}`];

    if (options && options.length > 0) {
      lines.push(``, `**可选方向：**`);
      for (let i = 0; i < options.length; i++) {
        lines.push(`${i + 1}. ${options[i]}`);
      }
    }

    lines.push(``, `*请提供更多信息，我将继续处理。*`);
    return lines.join("\n");
  },
});
