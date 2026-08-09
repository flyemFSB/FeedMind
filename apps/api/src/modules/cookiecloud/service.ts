import { db, cookieStore } from "@feedmind/db";
import { eq } from "drizzle-orm";
import { checkCookie } from "@feedmind/crawler-core";
import type { CookieStoreRow } from "@feedmind/db";

/** 同平台多来源 Cookie 拼接优先级：会话（应用内登录/保活，最新）> 手动。
 * 拼接串中同名 Cookie 后者覆盖前者，故按此排序保证取最新来源的值。
 * （CookieCloud 来源已移除，历史 cloud 行无匹配 key 时按 0 兜底排最前） */
const SOURCE_RANK: Record<string, number> = { manual: 1, session: 2 };

export function joinCookies(rows: { uuid: string; cookies: string }[]): string {
  return [...rows]
    .sort((a, b) => (SOURCE_RANK[a.uuid] ?? 0) - (SOURCE_RANK[b.uuid] ?? 0))
    .map((r) => r.cookies)
    .join("; ");
}

export async function getCookies(platform: string): Promise<CookieStoreRow[]> {
  return db.select().from(cookieStore).where(eq(cookieStore.platform, platform)).all();
}

export async function getAllCookies(): Promise<CookieStoreRow[]> {
  return db.select().from(cookieStore).all();
}

/**
 * 校验指定平台 Cookie 登录态，并把结果（valid/checkedAt）写回 cookie_store。
 * valid=null 表示该平台暂不支持校验，不落库。
 */
export async function checkPlatformCookie(platform: string): Promise<{
  valid: boolean | null;
  checkedAt: string | null;
  supported: boolean;
}> {
  const rows = await db.select().from(cookieStore).where(eq(cookieStore.platform, platform)).all();
  if (rows.length === 0) return { valid: null, checkedAt: null, supported: false };

  const cookies = joinCookies(rows);
  let valid: boolean | null;
  try {
    valid = await checkCookie(platform, cookies);
  } catch {
    // 网络波动/风控等无法判定登录态：按"未知"处理，不落库，避免误报失效引导用户重登
    valid = null;
  }
  const checkedAt = new Date().toISOString();

  // 仅支持校验的平台才落库，避免"不支持"被当成校验结果持久化
  if (valid !== null) {
    await db
      .update(cookieStore)
      .set({ valid, checkedAt })
      .where(eq(cookieStore.platform, platform));
  }
  return { valid, checkedAt, supported: valid !== null };
}

export async function saveManualCookies(platform: string, cookies: string): Promise<void> {
  const uuid = "manual";
  await db
    .insert(cookieStore)
    .values({ uuid, platform, cookies })
    .onConflictDoUpdate({
      target: [cookieStore.uuid, cookieStore.platform],
      set: { cookies },
    });
}

/**
 * 用会话捕获/保活刷新后的 Cookie 替换某平台全部记录。
 * 先删旧行再插入，避免同平台多行 Cookie（含过期 skey）拼接注入时互相覆盖。
 */
export async function replacePlatformCookies(platform: string, cookies: string): Promise<void> {
  const uuid = "session";
  await db.transaction(async (tx) => {
    await tx.delete(cookieStore).where(eq(cookieStore.platform, platform));
    await tx.insert(cookieStore).values({ uuid, platform, cookies });
  });
}
