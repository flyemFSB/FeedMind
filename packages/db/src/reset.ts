import { sql } from "drizzle-orm";
import { closeDb, db } from "./client.js";

await db.run(sql`
  drop table if exists chat_messages;
  drop table if exists chat_sessions;
  drop table if exists tools;
  drop table if exists llm;
`);

closeDb();
console.log("FeedMind SQLite tables have been reset.");
