import { Hono } from "hono";
import { rssSourceCreateSchema, rssSourceUpdateSchema } from "@feedmind/contracts";
import { jsonOk, parseJson } from "../../lib/http.js";
import {
  listSources,
  getSource,
  createSource,
  updateSource,
  deleteSource,
} from "../../modules/rss-sources/service.js";

export const rssSourceRoutes = new Hono();

rssSourceRoutes.get("/rss-sources", async (c) => {
  const data = await listSources();
  return jsonOk(c, data);
});

rssSourceRoutes.get("/rss-sources/:id", async (c) => {
  const data = await getSource(c.req.param("id"));
  return jsonOk(c, data);
});

rssSourceRoutes.post("/rss-sources", async (c) => {
  const payload = await parseJson(c, rssSourceCreateSchema);
  const data = await createSource(payload);
  return jsonOk(c, data, 201);
});

rssSourceRoutes.put("/rss-sources/:id", async (c) => {
  const payload = await parseJson(c, rssSourceUpdateSchema);
  const data = await updateSource(c.req.param("id"), payload);
  return jsonOk(c, data);
});

rssSourceRoutes.delete("/rss-sources/:id", async (c) => {
  await deleteSource(c.req.param("id"));
  return c.body(null, 204);
});
