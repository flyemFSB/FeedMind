import { db, crawlerTasks } from "@feedmind/db";
import { eq, sql } from "drizzle-orm";

/**
 * Simplified store for the route-based crawler pattern.
 * Only manages task status and RSS output — no more content/creator storage.
 */
export class DbStore {
  async updateTaskRss(taskId: string, rssXml: string): Promise<void> {
    await db
      .update(crawlerTasks)
      .set({ rssOutput: rssXml, progress: 1 })
      .where(eq(crawlerTasks.id, taskId));
  }

  async updateTaskStatus(taskId: string, status: string, error?: string): Promise<void> {
    const updates: Record<string, unknown> = { status };
    if (error) updates.error = error;
    if (status === "running") updates.startedAt = sql`(current_timestamp)`;
    if (status === "completed" || status === "failed" || status === "cancelled") {
      updates.finishedAt = sql`(current_timestamp)`;
    }
    await db.update(crawlerTasks).set(updates).where(eq(crawlerTasks.id, taskId));
  }
}
