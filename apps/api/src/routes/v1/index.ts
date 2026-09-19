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

/** v1 统一路由树：统一定义并挂载全部子路由模块与文档 */
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
