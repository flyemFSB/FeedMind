import { createOpenAI } from "@ai-sdk/openai";
import { db, model } from "@feedmind/db";
import { and, eq } from "drizzle-orm";
import { decryptValue } from "@feedmind/shared";

export async function resolveEmbeddingModel(): Promise<unknown> {
  const [row] = await db
    .select()
    .from(model)
    .where(and(eq(model.isSelected, true), eq(model.type, "embedding")))
    .limit(1);

  if (!row) return null;

  const apiKey = row.encryptedApiKey ? decryptValue(row.encryptedApiKey) : "";
  if (!apiKey || !row.baseUrl || !row.modelName) return null;

  const oai = createOpenAI({
    apiKey,
    baseURL: row.baseUrl,
  });

  return oai.embedding(row.modelName);
}
