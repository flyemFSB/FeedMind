import { defineConfig } from "drizzle-kit";
import { baseEnvSchema, loadFeedMindEnv } from "@feedmind/shared";

loadFeedMindEnv();
const env = baseEnvSchema.parse(process.env);

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
});
