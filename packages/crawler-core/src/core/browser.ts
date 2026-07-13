/**
 * AgentBrowser 单例工厂与生命周期管理。
 *
 * 为需要浏览器自动化路由处理器提供共享实例。
 * 处理器在执行开始时调用 createBrowser()，清理时调用 closeBrowser()。
 */
import { AgentBrowser } from "@mastra/agent-browser";

let _browserInstance: AgentBrowser | null = null;
let _refCount = 0;
let _pendingCreate: Promise<AgentBrowser> | null = null;

/** 获取或创建共享的 AgentBrowser 实例。并发调用只创建一个实例（single-flight）。 */
export async function createBrowser(): Promise<AgentBrowser> {
  if (_browserInstance) {
    _refCount++;
    await _browserInstance.ensureReady();
    return _browserInstance;
  }

  // single-flight：等待正在创建中的实例
  if (_pendingCreate) {
    _refCount++;
    return _pendingCreate;
  }

  _refCount++;
  _pendingCreate = (async () => {
    const instance = new AgentBrowser({
      headless: true,
      viewport: { width: 1280, height: 720 },
      timeout: 30_000,
      scope: "thread",
      excludeTools: [],
    });
    await instance.ensureReady();
    _browserInstance = instance;
    _pendingCreate = null;
    return instance;
  })();

  return _pendingCreate;
}

/** 释放共享浏览器引用，所有引用释放后自动关闭浏览器。 */
export async function closeBrowser(): Promise<void> {
  _refCount--;
  if (_refCount <= 0 && _browserInstance) {
    await _browserInstance.close();
    _browserInstance = null;
    _refCount = 0;
  }
}

/**
 * 将 Cookie 字符串注入到 Playwright 页面上下文。
 * 在 page.goto() 之前调用，使浏览器导航时携带登录态。
 *
 * @param page  - Playwright Page 对象（来自 manager.getPage()）
 * @param cookieStr - Cookie 字符串，格式 "name=value; name2=value2"
 * @param domain - Cookie 所属域名，例如 ".bilibili.com"
 */
export async function injectCookies(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Playwright Page 类型未直接导入
  page: any,
  cookieStr: string | undefined,
  domain: string,
): Promise<void> {
  if (!cookieStr) return;

  const cookies = cookieStr
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const equalIndex = item.indexOf("=");
      if (equalIndex <= 0) return null;
      return {
        name: item.slice(0, equalIndex).trim(),
        value: item.slice(equalIndex + 1).trim(),
        domain,
        path: "/",
      };
    })
    .filter((c): c is { name: string; value: string; domain: string; path: string } => c !== null);

  if (cookies.length > 0) {
    await page.context().addCookies(cookies);
  }
}
