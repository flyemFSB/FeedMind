import { OpenAPIHono } from "@hono/zod-openapi";
import { mountApiDocs } from "../../lib/api-docs.js";
import { chatRoutes } from "./chats.js";
import { modelRoutes } from "./models.js";
import { runtimeConfigRoutes } from "./runtime-config.js";
import { toolsRoutes } from "./tools.js";
import { wikiRoutes } from "./wiki.js";
import { crawlerRoutes } from "./crawler.js";
import { skillsRoutes } from "./skills.js";
import { remoteConnectionRoutes } from "./remote-connection.js";
import { cookieCloudRoutes } from "./cookie-cloud.js";
import { rssSourceRoutes } from "./rss-sources.js";
import { feedRoutes } from "./feeds.js";
import { dailyReportRoutes } from "./daily-report.js";
import { opsLogRoutes } from "./ops-log.js";
import { healthRoutes } from "./health.js";

/**
 * /api/v1 命名空间的唯一所有者：子路由全部挂在这里。
 * 曾经另有一个挂同一前缀的 openapiApp，导致同名路径被静默遮蔽（后注册者永不生效），
 * 且 /openapi 只描述得到它自己那几条——故合并为一棵树。
 */
export const v1Router = new OpenAPIHono();

v1Router.route("/", modelRoutes);
v1Router.route("/", chatRoutes);
v1Router.route("/", runtimeConfigRoutes);
v1Router.route("/", toolsRoutes);
v1Router.route("/", wikiRoutes);
v1Router.route("/", crawlerRoutes);
v1Router.route("/", skillsRoutes);
v1Router.route("/", remoteConnectionRoutes);
v1Router.route("/", cookieCloudRoutes);
v1Router.route("/", rssSourceRoutes);
v1Router.route("/", feedRoutes);
v1Router.route("/", dailyReportRoutes);
v1Router.route("/", opsLogRoutes);
v1Router.route("/", healthRoutes);

mountApiDocs(v1Router);
