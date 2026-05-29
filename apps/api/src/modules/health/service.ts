import { checkDbConnection } from "@feedmind/db";

export async function getHealth(): Promise<{ status: "ok" | "degraded"; database: boolean }> {
  const database = await checkDbConnection();
  return {
    status: database ? "ok" : "degraded",
    database,
  };
}
