import { Hono } from "hono";
import { chatRoutes } from "./chats.js";
import { modelRoutes } from "./models.js";
import { runtimeConfigRoutes } from "./runtime-config.js";
import { toolsRoutes } from "./tools.js";
import { wikiRoutes } from "./wiki.js";
import { crawlerRoutes } from "./crawler.js";
import { skillsRoutes } from "./skills.js";
import { remoteConnectionRoutes } from "./remote-connection.js";
import { cookieCloudRoutes } from "./cookiecloud.js";
import { rssSourceRoutes } from "./rss-sources.js";
import { feedRoutes } from "./feeds.js";
import { dailyReportRoutes } from "./daily-report.js";

export const v1Router = new Hono();

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
