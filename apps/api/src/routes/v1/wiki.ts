import { Hono } from "hono";
import {
  wikiPageCreateSchema,
  wikiPageUpdateSchema,
  wikiResolveQuery,
  wikiSourceCreateSchema,
  wikiSpaceCreateSchema,
  wikiSpaceUpdateSchema,
} from "@feedmind/contracts";
import { jsonOk, parseJson } from "../../lib/http.js";
import {
  createWikiPage,
  createWikiSource,
  createWikiSpace,
  deleteWikiPage,
  deleteWikiSource,
  getWikiBacklinks,
  getWikiPage,
  getWikiSource,
  getWikiSpace,
  listWikiPages,
  listWikiSources,
  listWikiSpaces,
  resolveWikiLink,
  updateWikiPage,
  updateWikiSpace,
} from "../../modules/wiki/service.js";

export const wikiRoutes = new Hono();

// ─── Spaces ────────────────────────────────────────────────────
wikiRoutes.get("/wiki/spaces", async (c) => jsonOk(c, await listWikiSpaces()));
wikiRoutes.post("/wiki/spaces", async (c) => {
  const payload = await parseJson(c, wikiSpaceCreateSchema);
  return jsonOk(c, await createWikiSpace(payload), 201);
});
wikiRoutes.get("/wiki/spaces/:spaceId", async (c) =>
  jsonOk(c, await getWikiSpace(c.req.param("spaceId"))),
);
wikiRoutes.patch("/wiki/spaces/:spaceId", async (c) => {
  const payload = await parseJson(c, wikiSpaceUpdateSchema);
  return jsonOk(c, await updateWikiSpace(c.req.param("spaceId"), payload));
});

// ─── Pages ─────────────────────────────────────────────────────
wikiRoutes.get("/wiki/spaces/:spaceId/pages", async (c) => {
  const spaceId = c.req.param("spaceId");
  const type = c.req.query("type");
  const q = c.req.query("q");
  const limit = c.req.query("limit") ? Number(c.req.query("limit")) : 50;
  const offset = c.req.query("offset") ? Number(c.req.query("offset")) : 0;
  return jsonOk(
    c,
    await listWikiPages(spaceId, { type, q, limit, offset }),
  );
});
wikiRoutes.post("/wiki/spaces/:spaceId/pages", async (c) => {
  const spaceId = c.req.param("spaceId");
  const payload = await parseJson(c, wikiPageCreateSchema);
  return jsonOk(c, await createWikiPage(spaceId, payload), 201);
});
wikiRoutes.get("/wiki/spaces/:spaceId/pages/resolve", async (c) => {
  const spaceId = c.req.param("spaceId");
  const target = c.req.query("target");
  if (!target) return jsonOk(c, { resolved: false, page_id: null, slug: null, title: null, status: "missing", candidates: [] });
  return jsonOk(c, await resolveWikiLink(spaceId, target));
});
wikiRoutes.get("/wiki/spaces/:spaceId/pages/:pageId", async (c) =>
  jsonOk(c, await getWikiPage(c.req.param("spaceId"), c.req.param("pageId"))),
);
wikiRoutes.put("/wiki/spaces/:spaceId/pages/:pageId", async (c) => {
  const spaceId = c.req.param("spaceId");
  const pageId = c.req.param("pageId");
  const payload = await parseJson(c, wikiPageUpdateSchema);
  return jsonOk(c, await updateWikiPage(spaceId, pageId, payload));
});
wikiRoutes.get("/wiki/spaces/:spaceId/pages/:pageId/backlinks", async (c) => {
  const spaceId = c.req.param("spaceId");
  const pageId = c.req.param("pageId");
  return jsonOk(c, await getWikiBacklinks(spaceId, pageId));
});
wikiRoutes.delete("/wiki/spaces/:spaceId/pages/:pageId", async (c) => {
  await deleteWikiPage(c.req.param("spaceId"), c.req.param("pageId"));
  return jsonOk(c, { success: true });
});

// ─── Sources ───────────────────────────────────────────────────
wikiRoutes.get("/wiki/spaces/:spaceId/sources", async (c) => {
  const spaceId = c.req.param("spaceId");
  const status = c.req.query("status");
  const limit = c.req.query("limit") ? Number(c.req.query("limit")) : 50;
  const offset = c.req.query("offset") ? Number(c.req.query("offset")) : 0;
  return jsonOk(c, await listWikiSources(spaceId, { status, limit, offset }));
});
wikiRoutes.post("/wiki/spaces/:spaceId/sources/text", async (c) => {
  const spaceId = c.req.param("spaceId");
  const payload = await parseJson(c, wikiSourceCreateSchema);
  return jsonOk(c, await createWikiSource(spaceId, payload), 201);
});
wikiRoutes.get("/wiki/spaces/:spaceId/sources/:sourceId", async (c) =>
  jsonOk(
    c,
    await getWikiSource(c.req.param("spaceId"), c.req.param("sourceId")),
  ),
);
wikiRoutes.delete("/wiki/spaces/:spaceId/sources/:sourceId", async (c) => {
  const mode = (c.req.query("mode") ?? "detach") as "detach" | "delete-orphans";
  return jsonOk(
    c,
    await deleteWikiSource(
      c.req.param("spaceId"),
      c.req.param("sourceId"),
      mode,
    ),
  );
});
