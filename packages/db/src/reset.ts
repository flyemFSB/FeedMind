import { sql } from "drizzle-orm";
import { db, closePool } from "./client.js";

await db.execute(sql`
  drop table if exists chat_messages cascade;
  drop table if exists chat_sessions cascade;
  drop table if exists llm cascade;
`);

await closePool();
console.log("FeedMind local tables have been reset.");
