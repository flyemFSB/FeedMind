import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiTestContext, type ApiTestContext } from "../../test-utils.js";
import type {
  resolveModelClient as ResolveModelClientType,
  clearModelClientCache as ClearModelClientCacheType,
} from "../../modules/models/model-cache.js";

describe("Models API 集成测试", () => {
  let ctx: ApiTestContext;
  let resolveModelClient: typeof ResolveModelClientType;
  let clearModelClientCache: typeof ClearModelClientCacheType;

  beforeEach(async () => {
    vi.resetModules();
    ctx = await createApiTestContext();
    const modelCache = await import("../../modules/models/model-cache.js");
    resolveModelClient = modelCache.resolveModelClient;
    clearModelClientCache = modelCache.clearModelClientCache;
    clearModelClientCache();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("POST /api/v1/models 成功创建模型并返回 201", async () => {
    const payload = {
      type: "chat",
      provider: "openai",
      model_name: "GPT-4o Mini",
      model_id: "gpt-4o-mini",
      base_url: "https://api.openai.com/v1",
      api_key: "sk-test-secret-key-12345",
      context_window: 128,
      max_output: 16,
    };

    const res = await ctx.request("/api/v1/models", {
      method: "POST",
      body: payload,
    });

    expect(res.status).toBe(201);
    expect(res.body.error).toBeNull();
    expect(res.body.data).toMatchObject({
      id: expect.any(Number),
      type: "chat",
      provider: "openai",
      model_name: "GPT-4o Mini",
      model_id: "gpt-4o-mini",
    });
    // 关键安全断言：响应体中绝不返回明文 API Key
    expect(res.rawText).not.toContain("sk-test-secret-key-12345");
  });

  it("POST /api/v1/models 缺少必填字段返回 422 VALIDATION_ERROR", async () => {
    const invalidPayload = {
      type: "chat",
      // 故意缺失必填字段 provider 与 model_name
    };

    const res = await ctx.request("/api/v1/models", {
      method: "POST",
      body: invalidPayload,
    });

    expect(res.status).toBe(422);
    expect(res.body.data).toBeNull();
    expect(res.body.error).toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("GET /api/v1/models 查询模型列表并支持 type 过滤", async () => {
    // 插入两条模型数据
    await ctx.request("/api/v1/models", {
      method: "POST",
      body: {
        type: "chat",
        provider: "anthropic",
        model_name: "Claude 3.5 Sonnet",
        model_id: "claude-3-5-sonnet",
      },
    });

    await ctx.request("/api/v1/models", {
      method: "POST",
      body: {
        type: "embedding",
        provider: "openai",
        model_name: "text-embedding-3-small",
        model_id: "text-embedding-3-small",
      },
    });

    const allRes = await ctx.request<Array<{ type: string }>>("/api/v1/models");
    expect(allRes.status).toBe(200);
    expect(allRes.body.data.length).toBeGreaterThanOrEqual(2);

    const chatRes = await ctx.request<Array<{ type: string }>>("/api/v1/models?type=chat");
    expect(chatRes.status).toBe(200);
    expect(chatRes.body.data.every((m) => m.type === "chat")).toBe(true);

    const embeddingRes = await ctx.request<Array<{ type: string }>>(
      "/api/v1/models?type=embedding",
    );
    expect(embeddingRes.status).toBe(200);
    expect(embeddingRes.body.data.every((m) => m.type === "embedding")).toBe(true);
  });

  it("PUT /api/v1/models/selected 切换选定模型", async () => {
    const createRes = await ctx.request<{ id: number }>("/api/v1/models", {
      method: "POST",
      body: {
        type: "chat",
        provider: "openai",
        model_name: "Default Chat Model",
        model_id: "gpt-4o",
      },
    });
    const modelId = createRes.body.data.id;

    const selectRes = await ctx.request("/api/v1/models/selected?type=chat", {
      method: "PUT",
      body: { id: modelId },
    });
    expect(selectRes.status).toBe(200);

    const getSelectedRes = await ctx.request<{ id: number }>("/api/v1/models/selected?type=chat");
    expect(getSelectedRes.status).toBe(200);
    expect(getSelectedRes.body.data.id).toBe(modelId);
  });

  it("DELETE /api/v1/models/:modelId 成功删除模型", async () => {
    const createRes = await ctx.request<{ id: number }>("/api/v1/models", {
      method: "POST",
      body: {
        type: "chat",
        provider: "google",
        model_name: "Gemini 2.5 Flash",
        model_id: "gemini-2.5-flash",
      },
    });
    const modelId = createRes.body.data.id;

    const deleteRes = await ctx.request(`/api/v1/models/${modelId}`, {
      method: "DELETE",
    });
    expect(deleteRes.status).toBe(200);

    // 删除非合法格式 ID 抛 422
    const invalidDelete = await ctx.request("/api/v1/models/invalid-id", {
      method: "DELETE",
    });
    expect(invalidDelete.status).toBe(422);
  });

  it("内置 provider（ChatGPT）装配官方 OpenAI SDK 客户端，base_url 可留空", async () => {
    const createRes = await ctx.request<{ id: number }>("/api/v1/models", {
      method: "POST",
      body: {
        type: "chat",
        provider: "ChatGPT",
        model_name: "GPT 5.5",
        model_id: "gpt-5.5",
      },
    });
    const resolved = await resolveModelClient(createRes.body.data.id);
    const chatModel = resolved.client.chatModel("gpt-5.5");
    expect(chatModel.provider.startsWith("openai")).toBe(true);
    expect(chatModel.modelId).toBe("gpt-5.5");
  });

  it("内置 provider（Claude）装配官方 Anthropic SDK 客户端", async () => {
    const createRes = await ctx.request<{ id: number }>("/api/v1/models", {
      method: "POST",
      body: {
        type: "chat",
        provider: "Claude",
        model_name: "Claude Sonnet 4.6",
        model_id: "sonnet-4.6",
      },
    });
    const resolved = await resolveModelClient(createRes.body.data.id);
    const chatModel = resolved.client.chatModel("sonnet-4.6");
    expect(chatModel.provider.startsWith("anthropic")).toBe(true);
    expect(chatModel.modelId).toBe("sonnet-4.6");
  });

  it("未收录 provider（GLM）回退 OpenAI 兼容客户端并保留自定义端点", async () => {
    const createRes = await ctx.request<{ id: number }>("/api/v1/models", {
      method: "POST",
      body: {
        type: "chat",
        provider: "GLM",
        model_name: "GLM 5.1",
        model_id: "glm-5.1",
        base_url: "https://open.bigmodel.cn/api/paas/v4",
      },
    });
    const resolved = await resolveModelClient(createRes.body.data.id);
    const chatModel = resolved.client.chatModel("glm-5.1");
    expect(chatModel.provider).toContain("feedmind");
  });
});
