import { describe, expect, it, vi } from "vitest";
import { injectCookies, ensureCookies, blockHeavyResources, assertElectronCdp } from "./browser.js";
import { chromium, type BrowserContext, type Page, type Route } from "playwright-core";

vi.mock("playwright-core", () => ({
  chromium: {
    connectOverCDP: vi.fn(),
  },
}));

describe("Crawler Browser CDP & Cookie 安全隔离测试", () => {
  it("injectCookies 正确解析多段 Cookie 字符串并写入 context", async () => {
    const addCookiesMock = vi.fn().mockResolvedValue(undefined);
    const mockPage = {
      context: () => ({ addCookies: addCookiesMock }) as unknown as BrowserContext,
    } as unknown as Page;

    await injectCookies(mockPage, "SESSDATA=12345; bili_jct=abcde; empty=", "bilibili.com");

    expect(addCookiesMock).toHaveBeenCalledWith([
      { name: "SESSDATA", value: "12345", domain: "bilibili.com", path: "/" },
      { name: "bili_jct", value: "abcde", domain: "bilibili.com", path: "/" },
      { name: "empty", value: "", domain: "bilibili.com", path: "/" },
    ]);
  });

  it("injectCookies 空字符串或 undefined 不触发写入", async () => {
    const addCookiesMock = vi.fn().mockResolvedValue(undefined);
    const mockPage = {
      context: () => ({ addCookies: addCookiesMock }) as unknown as BrowserContext,
    } as unknown as Page;

    await injectCookies(mockPage, undefined, "bilibili.com");
    await injectCookies(mockPage, "", "bilibili.com");

    expect(addCookiesMock).not.toHaveBeenCalled();
  });

  it("ensureCookies 若已存在登录 Cookie 则跳过重复写入", async () => {
    const cookiesMock = vi.fn().mockResolvedValue([{ name: "SESSDATA", value: "existing" }]);
    const addCookiesMock = vi.fn().mockResolvedValue(undefined);
    const mockPage = {
      context: () =>
        ({
          cookies: cookiesMock,
          addCookies: addCookiesMock,
        }) as unknown as BrowserContext,
    } as unknown as Page;

    await ensureCookies(mockPage, "SESSDATA=new", "bilibili.com");
    expect(cookiesMock).toHaveBeenCalledWith(["https://bilibili.com"]);
    expect(addCookiesMock).not.toHaveBeenCalled();
  });

  it("blockHeavyResources 拦截图片、媒体、字体与样式表，放行其他请求", async () => {
    let routeHandler: ((route: Route) => void) | null = null;
    const mockPage = {
      route: vi.fn((_pattern, handler: (route: Route) => void) => {
        routeHandler = handler;
      }),
    } as unknown as Page;

    await blockHeavyResources(mockPage);
    expect(mockPage.route).toHaveBeenCalledWith("**/*", expect.any(Function));

    const imageRoute = {
      request: () => ({ resourceType: () => "image" }),
      abort: vi.fn(),
      continue: vi.fn(),
    } as unknown as Route;
    routeHandler!(imageRoute);
    expect(imageRoute.abort).toHaveBeenCalled();
    expect(imageRoute.continue).not.toHaveBeenCalled();

    const scriptRoute = {
      request: () => ({ resourceType: () => "script" }),
      abort: vi.fn(),
      continue: vi.fn(),
    } as unknown as Route;
    routeHandler!(scriptRoute);
    expect(scriptRoute.continue).toHaveBeenCalled();
    expect(scriptRoute.abort).not.toHaveBeenCalled();
  });

  it("assertElectronCdp：若 UA 不含 Electron 则必须抛出异常拒绝连接", async () => {
    const mockCdpSession = {
      send: vi.fn().mockResolvedValue({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
      }),
      detach: vi.fn().mockResolvedValue(undefined),
    };
    const mockBrowser = {
      newBrowserCDPSession: vi.fn().mockResolvedValue(mockCdpSession),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(
      mockBrowser as unknown as ReturnType<typeof chromium.connectOverCDP> extends Promise<infer B>
        ? B
        : never,
    );

    await expect(assertElectronCdp()).rejects.toThrow("CDP 端点不是 FeedMind Electron");
    expect(mockBrowser.close).toHaveBeenCalled();
  });
});
