import { Hono } from "hono";
import { jsonOk } from "../../lib/http.js";
import { getHealth } from "../../modules/health/service.js";

export const healthRoutes = new Hono();

healthRoutes.get("/health", async (c) => jsonOk(c, await getHealth()));
