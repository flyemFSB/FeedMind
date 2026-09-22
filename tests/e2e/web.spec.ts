import { test, expect, type Page } from "@playwright/test";

/**
 * UI 渲染冒烟：所有 /api 响应由本文件 mock，因此不验证前后端集成，
 * 只验证「路由可渲染、交互可点击、无未捕获异常」。
 * 真实的接口契约由 apps/api 的集成测试负责。
 */

// 未捕获异常是白屏的直接信号；console.error 会混入未 mock 端点的网络噪声，故只收 pageerror
function trackCrashes(page: Page): string[] {
  const crashes: string[] = [];
  page.on("pageerror", (err) => crashes.push(err.message));
  return crashes;
}

async function mockApi(page: Page): Promise<void> {
  await page.route("**/api/v1/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { status: "ok", database: true }, error: null }),
    });
  });

  await page.route("**/api/v1/chats*", async (route) => {
    const isList = route.request().method() === "GET";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: isList
          ? []
          : { id: "t1", agent_thread_id: "t1", title: "新会话", pinned: false, updated_at: "" },
        error: null,
      }),
    });
  });

  // 聊天流挂起不返回：把「已提交、等待首个分片」这一帧固定下来供断言
  await page.route("**/api/chat/feedmind*", () => new Promise<void>(() => {}));

  await page.route("**/api/v1/feeds*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          data: [
            {
              id: "test-feed-1",
              sourceId: "src-1",
              title: "测试订阅文章 1",
              description: "这是一篇测试文章描述",
              link: "https://example.com/1",
              guid: "g-1",
              fetchedAt: new Date().toISOString(),
              isRead: false,
            },
          ],
          pagination: { offset: 0, limit: 50, total: 1, has_more: false },
        },
        error: null,
      }),
    });
  });

  await page.route("**/api/v1/rss-sources*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          { id: "src-1", type: "rss", url: "https://example.com/rss.xml", title: "示例 RSS 源" },
        ],
        error: null,
      }),
    });
  });

  await page.route("**/api/v1/models*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: 1,
            type: "chat",
            provider: "openai",
            model_name: "GPT-4o",
            model_id: "gpt-4o",
            is_selected: true,
          },
        ],
        error: null,
      }),
    });
  });

  await page.route("**/api/v1/tools*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          { name: "web_search", category: "search", display_name: "搜索引擎", is_enabled: true },
        ],
        error: null,
      }),
    });
  });

  await page.route("**/api/v1/runtime-configs*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [{ runtime: "session", temperature: 0.7, top_p: 1, system_prompt: "" }],
        error: null,
      }),
    });
  });

  await page.route("**/api/v1/ops-log*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          items: [
            {
              id: 1,
              ts: Date.now(),
              action: "create",
              target: "rss_source",
              targetName: "示例 RSS 源",
              result: "success",
            },
          ],
          total: 1,
        },
        error: null,
      }),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

// 产品界面默认中文：固定 locale，避免 CHROME 设备配置的 en-US 让文案断言随语言漂移
test.use({ locale: "zh-CN" });

const ROUTES = ["/", "/feeds", "/sources", "/daily-report", "/ops-log", "/settings", "/wiki"];

// 只断言 AppShell 无条件渲染的两个岛：toolbar 由各页自选（/wiki 用页内头部），不能当作全局契约
test("所有顶层路由渲染工作区且无未捕获异常", async ({ page }) => {
  const crashes = trackCrashes(page);

  for (const route of ROUTES) {
    await page.goto(route);
    await expect(page.locator('[data-island="navigation"]'), `${route} 侧边栏缺失`).toBeVisible();
    await expect(page.locator('[data-island="workspace"]'), `${route} 工作区缺失`).toBeVisible();
    // 工作区有真实子节点才算渲染成功，空容器也是白屏
    await expect(page.locator('[data-island="workspace"] > *').first()).toBeVisible();
  }

  expect(crashes).toEqual([]);
});

test("Agent 抽屉发送首条消息后立即渲染用户消息", async ({ page }) => {
  const crashes = trackCrashes(page);

  // 会话列表与重命名查询保持挂起：其迟到 resolve 会触发无关重渲染，掩盖首帧缺陷
  await page.route("**/api/v1/chats", async (route) => {
    if (route.request().method() === "GET") {
      await new Promise<void>(() => {});
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: { id: "t1", agent_thread_id: "t1", title: "新会话", pinned: false, updated_at: "" },
        error: null,
      }),
    });
  });
  await page.route("**/api/v1/chats/*", () => new Promise<void>(() => {}));

  await page.goto("/");
  // 抽屉快捷键由 AppShell 全局监听，等外壳挂载完成后再触发
  await expect(page.locator('[data-island="navigation"]')).toBeVisible();
  await page.keyboard.press("Control+Backslash");

  const composer = page.locator("textarea").last();
  await expect(composer).toBeVisible();
  await composer.fill("首条消息立即可见");
  await composer.press("Enter");

  // 首个流式分片到达前，虚拟列表必须已按滚动容器完成测量并渲染出这条消息
  const log = page.locator('[role="log"]');
  await expect(log.locator(".is-user")).toBeVisible({ timeout: 2000 });
  await expect(log).toContainText("首条消息立即可见");
  expect(crashes).toEqual([]);
});

test("内置 ask_user 挂起后渲染澄清卡片，点选项即回答", async ({ page }) => {
  const crashes = trackCrashes(page);

  // 会话列表与重命名保持挂起，避免无关重渲染影响断言
  await page.route("**/api/v1/chats", async (route) => {
    if (route.request().method() === "GET") {
      await new Promise<void>(() => {});
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: { id: "t1", agent_thread_id: "t1", title: "新会话", pinned: false, updated_at: "" },
        error: null,
      }),
    });
  });
  await page.route("**/api/v1/chats/*", () => new Promise<void>(() => {}));

  // chatRoute 实际下发的帧（由 @mastra/ai-sdk 的 toAISdkStream 生成）
  await page.route("**/api/chat/feedmind*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        'data: {"type":"start","messageId":"m-clarify"}',
        'data: {"type":"start-step"}',
        'data: {"type":"tool-input-available","toolCallId":"call-42","toolName":"ask_user","input":{"question":"你想先整理哪一部分资料？"}}',
        'data: {"type":"data-tool-call-suspended","data":{"state":"data-tool-call-suspended","runId":"run-42","toolCallId":"call-42","toolName":"ask_user","suspendPayload":{"question":"你想先整理哪一部分资料？","options":[{"label":"测井曲线"},{"label":"岩心描述"},{"label":"完井报告"}],"selectionMode":"single_select"}},"id":"call-42"}',
        "data: [DONE]",
        "",
      ].join("\n\n"),
    });
  });

  await page.goto("/");
  await expect(page.locator('[data-island="navigation"]')).toBeVisible();
  await page.keyboard.press("Control+Backslash");

  const composer = page.locator("textarea").last();
  await expect(composer).toBeVisible();
  await composer.fill("帮我整理资料");
  await composer.press("Enter");

  const log = page.locator('[role="log"]');
  await expect(log.getByText("你想先整理哪一部分资料？")).toBeVisible();

  // 选选项 → 提交回答：提交后走一条普通用户消息（后端 autoResumeSuspendedTools 据此续跑挂起的工具）
  await log.getByRole("button", { name: /岩心描述/ }).click();
  await log.getByRole("button", { name: /提交回答/ }).click();
  await expect(log.locator(".is-user").last()).toContainText("岩心描述");
  expect(crashes).toEqual([]);
});

test("Feeds 列表渲染接口返回的条目", async ({ page }) => {
  await page.goto("/feeds");
  await expect(page.getByText("测试订阅文章 1")).toBeVisible();
});

test("Sources 列表渲染接口返回的订阅源", async ({ page }) => {
  await page.goto("/sources");
  await expect(page.getByText("示例 RSS 源")).toBeVisible();
});

test("侧边栏导航可点击并切换到知识库视图", async ({ page }) => {
  const crashes = trackCrashes(page);

  await page.goto("/feeds");
  // 第一个 nav 是知识库视图切换组（pages/graph/sources），其首项指向 /wiki
  await page.locator('[data-island="navigation"] nav button').first().click();

  await expect(page).toHaveURL(/\/wiki/);
  await expect(page.locator('[data-island="workspace"]')).toBeVisible();
  expect(crashes).toEqual([]);
});
