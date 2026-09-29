import { test, expect, type Page } from "@playwright/test";

/**
 * 真实环境端到端测试（E2E）：
 * 配合 playwright.config.ts 编排的真实 apps/api 与 apps/web 实例运行，
 * 全链路直连临时隔离的 SQLite 数据库，无内部 /api/v1/* Mock。
 */

function trackCrashes(page: Page): string[] {
  const crashes: string[] = [];
  page.on("pageerror", (err) => crashes.push(err.message));
  return crashes;
}

test.use({ locale: "zh-CN" });

const ROUTES = ["/", "/feeds", "/sources", "/daily-report", "/ops-log", "/settings", "/wiki"];

test("所有顶层路由真实通流渲染工作区且无未捕获异常", async ({ page }) => {
  const crashes = trackCrashes(page);

  for (const route of ROUTES) {
    await page.goto(route);
    await expect(page.locator('[data-island="navigation"]'), `${route} 侧边栏缺失`).toBeVisible();
    await expect(page.locator('[data-island="workspace"]'), `${route} 工作区缺失`).toBeVisible();
    await expect(page.locator('[data-island="workspace"] > *').first()).toBeVisible();
  }

  expect(crashes).toEqual([]);
});

test("Sources 订阅管理：真实 API 持久化落库并在界面展示", async ({ page, request }) => {
  const crashes = trackCrashes(page);

  // 通过真实后端 API 创建唯一订阅源，写入隔离 SQLite
  const uniqueUrl = `https://test-${Date.now()}.example.com/feed.xml`;
  const createRes = await request.post("http://127.0.0.1:18790/api/v1/rss-sources", {
    data: { type: "rss", url: uniqueUrl },
  });
  expect(createRes.ok()).toBeTruthy();

  await page.goto("/sources");
  // 验证页面渲染该真实落库的订阅源链接
  await expect(page.getByText(uniqueUrl)).toBeVisible({ timeout: 5000 });
  expect(crashes).toEqual([]);
});

test("设置页面直连数据库并正确展示预置种子工具", async ({ page }) => {
  const crashes = trackCrashes(page);

  await page.goto("/settings");
  // 切换到工具配置标签页，验证数据库初始化的默认种子工具
  await page.getByRole("button", { name: /工具配置/ }).click();
  await expect(page.getByText("搜索引擎")).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("网页抓取")).toBeVisible();
  expect(crashes).toEqual([]);
});

test("侧边栏导航可点击并平滑切换到知识库视图", async ({ page }) => {
  const crashes = trackCrashes(page);

  await page.goto("/feeds");
  // 第一个 nav 项为知识库切换按钮
  await page.locator('[data-island="navigation"] nav button').first().click();

  await expect(page).toHaveURL(/\/wiki/);
  await expect(page.locator('[data-island="workspace"]')).toBeVisible();
  expect(crashes).toEqual([]);
});

test("Agent 抽屉交互：用户输入即时回显并创建真实会话", async ({ page }) => {
  const crashes = trackCrashes(page);

  // 挂起聊天流，断言首个流式分片到达前用户输入立即可见
  await page.route("**/api/chat/feedmind*", () => new Promise<void>(() => {}));

  await page.goto("/");
  await expect(page.locator('[data-island="navigation"]')).toBeVisible();
  await page.keyboard.press("Control+Backslash");

  const composer = page.locator("textarea").last();
  await expect(composer).toBeVisible();
  await composer.fill("首条消息立即可见");
  await composer.press("Enter");

  const log = page.locator('[role="log"]');
  await expect(log.locator(".is-user")).toBeVisible({ timeout: 3000 });
  await expect(log).toContainText("首条消息立即可见");
  expect(crashes).toEqual([]);
});

test("内置 ask_user 智能体挂起后渲染澄清交互卡片", async ({ page }) => {
  const crashes = trackCrashes(page);

  // 模拟智能体触发 ask_user 挂起响应
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
  await expect(log.getByText("你想先整理哪一部分资料？")).toBeVisible({ timeout: 5000 });

  // 交互卡片单选 → 提交回答
  await log.getByRole("button", { name: /岩心描述/ }).click();
  await log.getByRole("button", { name: /提交回答/ }).click();
  await expect(log.locator(".is-user").last()).toContainText("岩心描述");
  expect(crashes).toEqual([]);
});

test("Chat 性能监控指标：渲染上下文窗口、工具耗时与性能指标栏", async ({ page }) => {
  const crashes = trackCrashes(page);

  // 模拟流式响应（包含工具调用与文本分片）
  await page.route("**/api/chat/feedmind*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        'data: {"type":"start","messageId":"m-telemetry"}',
        'data: {"type":"start-step"}',
        'data: {"type":"tool-input-available","toolCallId":"call-search","toolName":"web_search","input":{"query":"测试查询"}}',
        'data: {"type":"tool-output-available","toolCallId":"call-search","output":{"results":["item1"]}}',
        'data: {"type":"text-start","id":"text-1"}',
        'data: {"type":"text-delta","id":"text-1","delta":"这是性能监控测试回复"}',
        'data: {"type":"text-end","id":"text-1"}',
        'data: {"type":"finish","finishReason":"stop"}',
        "data: [DONE]",
        "",
      ].join("\n\n"),
    });
  });

  await page.goto("/");
  await expect(page.locator('[data-island="navigation"]')).toBeVisible();
  await page.keyboard.press("Control+Backslash");

  // 断言底部输入框旁渲染了上下文窗口指标按钮
  const ctxIndicator = page.getByRole("button", { name: /上下文用量/ }).first();
  await expect(ctxIndicator).toBeVisible();

  const composer = page.locator("textarea").last();
  await expect(composer).toBeVisible();
  await composer.fill("测试指标展示");
  await composer.press("Enter");

  const log = page.locator('[role="log"]');
  // 断言回答正常渲染
  await expect(log.getByText("这是性能监控测试回复")).toBeVisible({ timeout: 5000 });

  // 断言渲染了性能指标栏（包含 TTFT、耗时与 TPS 等）
  await expect(log.getByText(/TTFT/)).toBeVisible();
  await expect(log.getByText(/耗时/)).toBeVisible();
  await expect(log.getByText(/t\/s/)).toBeVisible();

  // 展开已折叠的思考过程卡片以断言工具调用卡片
  await log.getByText(/思考过程/).click();
  await expect(log.getByText("web_search")).toBeVisible();

  // 悬浮上下文指示器断言三类明细卡片
  await ctxIndicator.hover();
  const tooltip = page.locator('[data-slot="tooltip-content"]');
  await expect(tooltip.getByText("系统")).toBeVisible();
  await expect(tooltip.getByText("对话")).toBeVisible();
  await expect(tooltip.getByText("工具")).toBeVisible();

  expect(crashes).toEqual([]);
});
