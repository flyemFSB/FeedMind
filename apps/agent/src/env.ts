import { loadFeedMindEnv } from "@feedmind/shared";
import { z } from "zod";

loadFeedMindEnv();

// Agent 运行时环境变量，全部含默认值或 optional，降低初次部署门槛
const agentEnvSchema = z.object({
  BACKEND_API_URL: z.string().default("http://localhost:8000"),
  FEEDMIND_MODEL: z.string().default(""),         // 前端选中模型后走 configurable 注入，此值作 fallback
  FEEDMIND_TEMPERATURE: z.coerce.number().default(0.2),
  FEEDMIND_SYSTEM_PROMPT: z.string().optional(),  // 可覆盖内置中文 prompt
  OPENAI_COMPATIBLE_API_BASE: z.string().optional(),
  OPENAI_COMPATIBLE_API_KEY: z.string().optional(),
  JINA_API_KEY: z.string().optional(),             // 空值时 Jina 仍可免费使用
});

export const agentEnv = agentEnvSchema.parse(process.env);
