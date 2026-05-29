import { Hono } from "hono";
import { chatRoutes } from "./chats.js";
import { healthRoutes } from "./health.js";
import { llmRoutes } from "./llms.js";

export const v1Router = new Hono();

v1Router.route("/", healthRoutes);
v1Router.route("/", llmRoutes);
v1Router.route("/", chatRoutes);
