import { db, crawlerTasks } from "@feedmind/db";
import { eq } from "drizzle-orm";

/** 路由式爬虫专用存储：只维护任务状态与 RSS 输出 */
export class DbStore {
  async updateTaskRss(taskId: string, rssXml: string): Promise<void> {
    await db.update(crawlerTasks).set({ rssOutput: rssXml }).where(eq(crawlerTasks.id, taskId));
  }

  async updateTaskStatus(taskId: string, status: string, error?: string): Promise<void> {
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { status };
    if (error) updates["error"] = error;
    if (status === "running") updates["startedAt"] = now;
    if (status === "completed" || status === "failed" || status === "cancelled") {
      updates["finishedAt"] = now;
    }
    await db.update(crawlerTasks).set(updates).where(eq(crawlerTasks.id, taskId));
  }
}
