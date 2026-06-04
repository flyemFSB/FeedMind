import { Hono } from "hono";
import { chatRoutes } from "./chats.js";
import { healthRoutes } from "./health.js";
import { llmRoutes } from "./llms.js";
import { toolsRoutes } from "./tools.js";
import { wikiRoutes } from "./wiki.js";
import { crawlerRoutes } from "./crawler.js";

export const v1Router = new Hono();

v1Router.route("/", healthRoutes);
v1Router.route("/", llmRoutes);
v1Router.route("/", chatRoutes);
v1Router.route("/", toolsRoutes);
v1Router.route("/", wikiRoutes);
v1Router.route("/", crawlerRoutes);
