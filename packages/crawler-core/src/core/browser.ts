/**
 * AgentBrowser singleton factory and lifecycle management.
 *
 * Provides a shared AgentBrowser instance for route handlers that
 * need browser automation. Each handler should call createBrowser()
 * at the start of execution and closeBrowser() in cleanup.
 */
import { AgentBrowser } from "@mastra/agent-browser";

let _browserInstance: AgentBrowser | null = null;
let _refCount = 0;
let _pendingCreate: Promise<AgentBrowser> | null = null;

/**
 * Get or create the shared AgentBrowser instance.
 * Uses single-flight 模式确保并发调用只创建一个实例。
 */
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

/**
 * Release a reference to the shared browser.
 * When all references are released, the browser is closed.
 */
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
