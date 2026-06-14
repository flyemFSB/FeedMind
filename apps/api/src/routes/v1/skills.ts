import { Hono } from "hono";
import { jsonOk, jsonError } from "../../lib/http.js";
import { listSkills, installSkill, deleteSkill } from "../../modules/skills/service.js";

export const skillsRoutes = new Hono();

skillsRoutes.get("/skills", async (c) => {
  const items = await listSkills();
  return jsonOk(c, { items });
});

skillsRoutes.post("/skills", async (c) => {
  const contentType = c.req.header("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return jsonError(c, 400, "VALIDATION_ERROR", "Content-Type must be multipart/form-data");
  }

  const formData = await c.req.parseBody();
  const file = formData["file"];
  if (!file || !(file instanceof File)) {
    return jsonError(c, 400, "VALIDATION_ERROR", "Missing 'file' field");
  }

  const name = (formData["name"] as string) || file.name.replace(/\.(zip|tar\.gz)$/i, "");

  const buffer = Buffer.from(await file.arrayBuffer());
  const skill = await installSkill(name, buffer);
  return jsonOk(c, skill, 201);
});

skillsRoutes.delete("/skills/:name", async (c) => {
  const name = c.req.param("name");
  await deleteSkill(name);
  return jsonOk(c, { deleted: true });
});
