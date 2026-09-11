import { OpenAPIHono } from "@hono/zod-openapi";
import { jsonOk, jsonError } from "../../lib/http.js";
import { listSkills, installSkill, deleteSkill } from "../../modules/skills/service.js";
import { logOperation } from "../../modules/ops-log/service.js";

export const skillsRoutes = new OpenAPIHono();

skillsRoutes.get("/skills", async (c) => {
  const items = await listSkills();
  return jsonOk(c, { items });
});

skillsRoutes.post("/skills", async (c) => {
  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return jsonError(c, 400, "VALIDATION_ERROR", "文件上传请求格式不正确");
  }

  const formData = await c.req.parseBody();
  const file = formData["file"];
  if (!file || !(file instanceof File)) {
    return jsonError(c, 400, "VALIDATION_ERROR", "缺少上传文件");
  }

  const name = (formData["name"] as string) || file.name.replace(/\.(zip|tar\.gz)$/i, "");

  const buffer = Buffer.from(await file.arrayBuffer());
  const skill = await installSkill(name, buffer);
  void logOperation({ action: "import", target: "skill", targetName: skill.name });
  return jsonOk(c, skill, 201);
});

skillsRoutes.delete("/skills/:name", async (c) => {
  const name = c.req.param("name");
  await deleteSkill(name);
  void logOperation({ action: "delete", target: "skill", targetName: name });
  return jsonOk(c, { deleted: true });
});
