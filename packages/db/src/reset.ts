import { sql } from "drizzle-orm";
import { client, closeDb, db } from "./client.js";

await client.execute("pragma foreign_keys = off");

try {
  const tables = await client.execute("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'");

  for (const row of tables.rows) {
    await db.run(sql`drop table if exists ${sql.identifier(String(row.name))}`);
  }
} finally {
  await client.execute("pragma foreign_keys = on");
  closeDb();
}

console.log("FeedMind SQLite database has been reset.");
