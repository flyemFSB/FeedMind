import { test, expect } from "@playwright/test";

test.describe("FeedMind Web 核心用户旅程 E2E", () => {
  test.beforeEach(async ({ page }) => {
    // 拦截外部 /api 请求，提供密封的响应数据
    await page.route("**/api/v1/health", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { status: "ok", database: true },
          error: null,
        }),
      });
    });

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
                isRead: 0,
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
            {
              id: "src-1",
              type: "rss",
              url: "https://example.com/rss.xml",
              title: "示例 RSS 源",
            },
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
            {
              name: "web_search",
              category: "search",
              display_name: "搜索引擎",
              is_enabled: true,
            },
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
          data: [
            {
              runtime: "session",
              temperature: 0.7,
              top_p: 1,
              system_prompt: "",
            },
          ],
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
  });

  test("旅程 1：页面侧边栏与核心路由导航无白屏", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('[data-island="navigation"]')).toBeVisible();
    await expect(page.locator('[data-island="workspace"]')).toBeVisible();

    // 导航到 /feeds
    await page.goto("/feeds");
    await expect(page.locator('[data-island="workspace"]')).toBeVisible();

    // 导航到 /sources
    await page.goto("/sources");
    await expect(page.locator('[data-island="workspace"]')).toBeVisible();

    // 导航到 /daily-report
    await page.goto("/daily-report");
    await expect(page.locator('[data-island="workspace"]')).toBeVisible();

    // 导航到 /ops-log
    await page.goto("/ops-log");
    await expect(page.locator('[data-island="workspace"]')).toBeVisible();

    // 导航到 /settings
    await page.goto("/settings");
    await expect(page.locator('[data-island="workspace"]')).toBeVisible();
  });

  test("旅程 2：Feeds 订阅列表正常渲染条目", async ({ page }) => {
    await page.goto("/feeds");
    await expect(page.getByText("测试订阅文章 1")).toBeVisible();
  });

  test("旅程 3：Sources 订阅源管理页面正常渲染列表", async ({ page }) => {
    await page.goto("/sources");
    await expect(page.getByText("示例 RSS 源")).toBeVisible();
  });

  test("旅程 4：Settings 设置中心正常展示配置项", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.locator('[data-island="workspace"]')).toBeVisible();
  });
});
