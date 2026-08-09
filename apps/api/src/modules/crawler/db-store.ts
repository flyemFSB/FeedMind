import { db, crawlerTasks } from "@feedmind/db";
import { eq, sql } from "drizzle-orm";

/** 路由式爬虫专用存储：只维护任务状态与 RSS 输出，不再存内容和作者 */
export class DbStore {
  async updateTaskRss(taskId: string, rssXml: string): Promise<void> {
    await db
      .update(crawlerTasks)
      .set({ rssOutput: rssXml, progress: 1 })
      .where(eq(crawlerTasks.id, taskId));
  }

  async updateTaskStatus(taskId: string, status: string, error?: string): Promise<void> {
    const updates: Record<string, unknown> = { status };
    if (error) updates["error"] = error;
    if (status === "running") updates["startedAt"] = sql`(current_timestamp)`;
    if (status === "completed" || status === "failed" || status === "cancelled") {
      updates["finishedAt"] = sql`(current_timestamp)`;
    }
    await db.update(crawlerTasks).set(updates).where(eq(crawlerTasks.id, taskId));
  }
}
