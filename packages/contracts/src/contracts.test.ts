import { describe, expect, it } from "vitest";
import { apiEnvelopeSchema } from "./api/envelope.js";
import { taskCreateSchema, taskListItemSchema, taskReadSchema } from "./crawler/index.js";
import { feedBatchSchema } from "./feeds/index.js";
import { modelCreateSchema, modelReadSchema, modelUpdateSchema } from "./model/index.js";

describe("apiEnvelopeSchema", () => {
  const schema = apiEnvelopeSchema(taskCreateSchema);

  it("data 可为 null，error 可缺省", () => {
    expect(schema.safeParse({ data: null }).success).toBe(true);
    expect(schema.safeParse({ data: { route: "x", params: {} }, error: null }).success).toBe(true);
  });

  it("data 不匹配 schema 时拒绝", () => {
    expect(schema.safeParse({ data: { params: {} } }).success).toBe(false);
  });

  it("error.details 缺省为空对象", () => {
    const result = schema.safeParse({ data: null, error: { code: "E1", message: "m" } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.error?.details).toEqual({});
  });
});

describe("taskCreateSchema", () => {
  it("max_items 缺省为 50，接受正整数值", () => {
    const result = taskCreateSchema.safeParse({ route: "bili/user", params: { mid: 1 } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.max_items).toBe(50);
    expect(taskCreateSchema.safeParse({ route: "x", params: {}, max_items: 3 }).success).toBe(true);
  });

  it("拒绝非正数或非整数 max_items", () => {
    expect(taskCreateSchema.safeParse({ route: "x", params: {}, max_items: 0 }).success).toBe(
      false,
    );
    expect(taskCreateSchema.safeParse({ route: "x", params: {}, max_items: 1.5 }).success).toBe(
      false,
    );
  });

  it("params 必须是对象", () => {
    expect(taskCreateSchema.safeParse({ route: "x", params: "oops" }).success).toBe(false);
  });
});

describe("taskReadSchema / taskListItemSchema", () => {
  const full: Record<string, unknown> = {
    id: "1",
    route: "x",
    params: "{}",
    cookies: null,
    proxy_url: null,
    max_items: 50,
    status: "completed",
    progress: 100,
    error: null,
    rss_url: null,
    started_at: null,
    finished_at: null,
    created_at: "2026-08-09",
  };

  it("完整任务通过校验", () => {
    expect(taskReadSchema.safeParse(full).success).toBe(true);
  });

  it("status 非法枚举被拒绝", () => {
    expect(taskReadSchema.safeParse({ ...full, status: "paused" }).success).toBe(false);
  });

  it("列表项只包含摘要字段", () => {
    const result = taskListItemSchema.safeParse(full);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.keys(result.data).sort()).toEqual([
        "created_at",
        "error",
        "finished_at",
        "id",
        "progress",
        "route",
        "started_at",
        "status",
      ]);
    }
  });
});

describe("modelCreateSchema / modelUpdateSchema / modelReadSchema", () => {
  it("type 缺省为 chat，其余字段带空串默认值", () => {
    const result = modelCreateSchema.safeParse({ provider: "openai", model_name: "gpt-4o" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("chat");
      expect(result.data.model_id).toBe("");
    }
  });

  it("provider/model_name 拒绝空串", () => {
    expect(modelCreateSchema.safeParse({ provider: "", model_name: "x" }).success).toBe(false);
    expect(modelCreateSchema.safeParse({ provider: "x", model_name: "" }).success).toBe(false);
  });

  it("update 支持局部字段", () => {
    expect(modelUpdateSchema.safeParse({ provider: "openai" }).success).toBe(true);
    expect(modelUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("read 剔除 api_key 并补 has_api_key", () => {
    const result = modelReadSchema.safeParse({
      id: 1,
      provider: "openai",
      model_name: "gpt-4o",
      has_api_key: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("api_key" in result.data).toBe(false);
      expect(result.data.is_selected).toBe(false);
    }
  });
});

describe("feedBatchSchema", () => {
  it("条目字段均可选，guid 必填", () => {
    const ok = feedBatchSchema.safeParse({
      source_id: "s1",
      items: [{ guid: "g1", title: "标题" }],
    });
    expect(ok.success).toBe(true);
    const missingGuid = feedBatchSchema.safeParse({ source_id: "s1", items: [{ title: "t" }] });
    expect(missingGuid.success).toBe(false);
  });
});
