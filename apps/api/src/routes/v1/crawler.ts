import { OpenAPIHono } from "@hono/zod-openapi";
import { jsonOk } from "../../lib/http.js";
import { listBiliFavs, listWereadMps, listZhCollections } from "../../modules/crawler/service.js";

export const crawlerRoutes = new OpenAPIHono();

// ─── 订阅源表单的下拉选项 ────────────────────────────────────────
// 一次性爬取任务（/crawler/tasks*）已随 crawl_run 表一并删除：无 UI 消费，
// RSS 产物对外不可达、对内被 SSRF 拦截，订阅同步走 syncAll 直接调 route handler。
crawlerRoutes.get("/crawler/weread/mps", async (c) => jsonOk(c, await listWereadMps()));
crawlerRoutes.get("/crawler/bili/favs", async (c) => jsonOk(c, await listBiliFavs()));
crawlerRoutes.get("/crawler/zh/collections", async (c) => jsonOk(c, await listZhCollections()));
